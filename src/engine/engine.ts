import { between, firstKey } from "./sortKey";
import type {
  BlockIdentity,
  BlockID,
  BlockPayloadBase,
  BlockType,
  BlockVer,
  BlockVersion,
  DocID,
  DocRevision,
  DocRevisionPatch,
  DocSnapshot,
  DocumentMeta,
  DocStateResolved,
  DocVer,
  RenderNode,
  UserID,
} from "./types";
import type { Storage } from "./storage";
import { diffDocStates } from "./diff";

// Environment-safe random ID (prefers Web Crypto / Node crypto when available).
function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const arr = new Uint8Array(16);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Lightweight, synchronous hash (FNV-1a 32-bit). For production, swap in real sha256 on server.
function hashPayload(input: any): string {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193; // FNV prime
  }
  return hash.toString(16).padStart(8, "0");
}

export interface EngineOptions {
  snapshotEvery?: number; // create snapshot every N doc revisions
}

export class DocumentEngine {
  private readonly storage: Storage;
  private readonly opts: EngineOptions;

  /**
   * In-memory pending patches (NOT persisted).
   * Used to batch local commits and to mirror server-side pending-versions/commit behavior.
   */
  private readonly pendingPatches = new Map<DocID, Map<BlockID, DocRevisionPatch>>();

  constructor(storage: Storage, opts: EngineOptions = {}) {
    this.storage = storage;
    this.opts = opts;
  }

  // =========================
  // Utilities
  // =========================

  private now() {
    return Date.now();
  }

  private sha256(input: any): string {
    return hashPayload(input);
  }

  private extractPlainText(payload: BlockPayloadBase): string {
    // Minimal: for md+ store source, take as plain
    if (payload?.body?.richText?.source) return String(payload.body.richText.source);
    if (typeof payload?.body?.text === "string") return payload.body.text;
    return "";
  }

  // =========================
  // Document lifecycle
  // =========================

  async createDocument(params: {
    docId: DocID;
    title: string;
    createdBy: UserID;
    workspaceId?: string;
  }): Promise<DocumentMeta> {
    const existing = await this.storage.getDocument(params.docId);
    if (existing) throw new Error(`Document already exists: ${params.docId}`);

    const now = this.now();
    const rootBlockId = `root_${params.docId}`;

    const doc: DocumentMeta = {
      _id: params.docId,
      workspaceId: params.workspaceId,
      title: params.title,
      createdAt: now,
      createdBy: params.createdBy,
      updatedAt: now,
      updatedBy: params.createdBy,
      head: 0,
      publishedHead: 0,
      rootBlockId,
      status: "draft",
      visibility: "private",
    };

    await this.storage.saveDocument(doc);

    // Create root block identity + version
    const rootIdentity: BlockIdentity = {
      _id: rootBlockId,
      docId: doc._id,
      type: "root",
      createdAt: now,
      createdBy: params.createdBy,
      latestVer: 1,
      latestAt: now,
      latestBy: params.createdBy,
      isDeleted: false,
    };

    const rootPayload: BlockPayloadBase = {
      schema: { type: "root", ver: 1 },
      attrs: {},
      body: { richText: { format: "md+", source: "" } }, // root doesn't need content
    };

    const rootSortKey = firstKey();
    const rootVersion: BlockVersion = {
      _id: `${rootBlockId}@1`,
      docId: doc._id,
      blockId: rootBlockId,
      ver: 1,
      createdAt: now,
      createdBy: params.createdBy,
      parentId: rootBlockId,
      sortKey: rootSortKey,
      indent: 0,
      collapsed: false,
      payload: rootPayload,
      hash: this.sha256({ payload: rootPayload, parentId: rootBlockId, sortKey: rootSortKey, indent: 0, collapsed: false }),
      plainText: "",
      refs: [],
    };

    await this.storage.saveBlock(rootIdentity);
    await this.storage.saveBlockVersion(rootVersion);

    // Initial revision: docVer=1 points to root@1
    await this.commit(doc._id, params.createdBy, {
      message: "init",
      patches: [{ blockId: rootBlockId, from: 0 as any, to: 1 }],
    });

    return (await this.storage.getDocument(doc._id))!;
  }

  async getDocument(docId: DocID) {
    return this.storage.getDocument(docId);
  }

  async updateDocumentMeta(
    docId: DocID,
    updatedBy: UserID,
    patch: Partial<Pick<DocumentMeta, "title" | "status" | "visibility" | "publishedHead">>
  ) {
    const doc = await this.mustGetDoc(docId);
    const now = this.now();

    const nextPublished = patch.publishedHead ?? doc.publishedHead;
    if (nextPublished && nextPublished > doc.head) {
      throw new Error(`publishedHead cannot exceed current head (${doc.head})`);
    }

    const next: DocumentMeta = {
      ...doc,
      ...patch,
      updatedAt: now,
      updatedBy,
    };
    await this.storage.saveDocument(next);
    return next;
  }

  // =========================
  // Block CRUD & Move
  // =========================

  async createBlock(params: {
    docId: DocID;
    type: BlockType;
    createdBy: UserID;
    parentId?: BlockID;
    // insert position
    afterBlockId?: BlockID | null; // insert after this sibling
    beforeBlockId?: BlockID | null; // or before this sibling
    payload: BlockPayloadBase;
    indent?: number;
    /** default true. When false, changes are accumulated in-memory and require commitPending(). */
    createVersion?: boolean;
  }): Promise<{ block: BlockIdentity; version: BlockVersion }> {
    const doc = await this.mustGetDoc(params.docId);
    const now = this.now();
    const blockId: BlockID = `b_${createId()}`;

    const parentId = params.parentId ?? doc.rootBlockId;
    if (parentId !== doc.rootBlockId) await this.mustGetBlock(parentId);
    const { sortKey } = await this.computeSortKey(params.docId, parentId, params.afterBlockId ?? null, params.beforeBlockId ?? null);

    const identity: BlockIdentity = {
      _id: blockId,
      docId: params.docId,
      type: params.type,
      createdAt: now,
      createdBy: params.createdBy,
      latestVer: 1,
      latestAt: now,
      latestBy: params.createdBy,
      isDeleted: false,
    };

    const plainText = this.extractPlainText(params.payload);
    const version: BlockVersion = {
      _id: `${blockId}@1`,
      docId: params.docId,
      blockId,
      ver: 1,
      createdAt: now,
      createdBy: params.createdBy,
      parentId,
      sortKey,
      indent: params.indent ?? 0,
      collapsed: false,
      payload: params.payload,
      hash: this.sha256({ payload: params.payload, parentId, sortKey, indent: params.indent ?? 0, collapsed: false }),
      plainText,
      refs: [],
    };

    await this.storage.saveBlock(identity);
    await this.storage.saveBlockVersion(version);

    const patch: DocRevisionPatch = { blockId, from: 0 as any, to: 1 };
    if (params.createVersion === false) {
      this.addPendingPatch(params.docId, patch);
    } else {
      // commit doc revision
      await this.commit(params.docId, params.createdBy, {
        message: `create block ${blockId}`,
        patches: [patch],
      });
    }

    return { block: identity, version };
  }

  async updateBlockContent(params: {
    docId: DocID;
    blockId: BlockID;
    updatedBy: UserID;
    payload: BlockPayloadBase;
    /** default true. When false, changes are accumulated in-memory and require commitPending(). */
    createVersion?: boolean;
  }): Promise<BlockVersion> {
    const block = await this.mustGetBlock(params.blockId);
    if (block.docId !== params.docId) throw new Error("Block does not belong to doc");
    const latest = await this.mustGetBlockVersion(params.blockId, block.latestVer);

    const now = this.now();
    const nextVer = block.latestVer + 1;

    const plainText = this.extractPlainText(params.payload);

    const next: BlockVersion = {
      ...latest,
      _id: `${params.blockId}@${nextVer}`,
      ver: nextVer,
      createdAt: now,
      createdBy: params.updatedBy,
      payload: params.payload,
      plainText,
      hash: this.sha256({
        payload: params.payload,
        parentId: latest.parentId,
        sortKey: latest.sortKey,
        indent: latest.indent,
        collapsed: latest.collapsed,
      }),
    };

    await this.storage.saveBlockVersion(next);

    await this.storage.saveBlock({
      ...block,
      latestVer: nextVer,
      latestAt: now,
      latestBy: params.updatedBy,
    });

    const patch: DocRevisionPatch = { blockId: params.blockId, from: latest.ver, to: nextVer };
    if (params.createVersion === false) {
      this.addPendingPatch(params.docId, patch);
    } else {
      await this.commit(params.docId, params.updatedBy, {
        message: `update content ${params.blockId}`,
        patches: [patch],
      });
    }

    return next;
  }

  async moveBlock(params: {
    docId: DocID;
    blockId: BlockID;
    movedBy: UserID;
    toParentId: BlockID;
    afterBlockId?: BlockID | null;
    beforeBlockId?: BlockID | null;
    indent?: number;
    /** default true. When false, changes are accumulated in-memory and require commitPending(). */
    createVersion?: boolean;
  }): Promise<BlockVersion> {
    const block = await this.mustGetBlock(params.blockId);
    if (block.docId !== params.docId) throw new Error("Block does not belong to doc");
    await this.mustGetBlock(params.toParentId);
    const latest = await this.mustGetBlockVersion(params.blockId, block.latestVer);

    const { sortKey } = await this.computeSortKey(params.docId, params.toParentId, params.afterBlockId ?? null, params.beforeBlockId ?? null);

    const now = this.now();
    const nextVer = block.latestVer + 1;

    const next: BlockVersion = {
      ...latest,
      _id: `${params.blockId}@${nextVer}`,
      ver: nextVer,
      createdAt: now,
      createdBy: params.movedBy,
      parentId: params.toParentId,
      sortKey,
      indent: params.indent ?? latest.indent,
      hash: this.sha256({
        payload: latest.payload,
        parentId: params.toParentId,
        sortKey,
        indent: params.indent ?? latest.indent,
        collapsed: latest.collapsed,
      }),
    };

    await this.storage.saveBlockVersion(next);
    await this.storage.saveBlock({
      ...block,
      latestVer: nextVer,
      latestAt: now,
      latestBy: params.movedBy,
    });

    const patch: DocRevisionPatch = { blockId: params.blockId, from: latest.ver, to: nextVer };
    if (params.createVersion === false) {
      this.addPendingPatch(params.docId, patch);
    } else {
      await this.commit(params.docId, params.movedBy, {
        message: `move ${params.blockId}`,
        patches: [patch],
        opSummary: { moved: 1 },
      });
    }

    return next;
  }

  async deleteBlock(params: {
    docId: DocID;
    blockId: BlockID;
    deletedBy: UserID;
    /** default true. When false, changes are accumulated in-memory and require commitPending(). */
    createVersion?: boolean;
  }) {
    const block = await this.mustGetBlock(params.blockId);
    if (block.docId !== params.docId) throw new Error("Block does not belong to doc");
    const now = this.now();
    await this.storage.saveBlock({
      ...block,
      isDeleted: true,
      deletedAt: now,
      deletedBy: params.deletedBy,
      latestAt: now,
      latestBy: params.deletedBy,
    });

    if (params.createVersion === false) {
      // Keep behavior consistent with "pending" mode: identity-level deletions are tracked as a no-op patch.
      // (Server side usually always versions deletions; remote adapter can ignore createVersion=false for delete.)
      this.addPendingPatch(params.docId, { blockId: params.blockId, from: block.latestVer, to: block.latestVer });
    } else {
      // create a revision even for delete (so docVer changes)
      await this.commit(params.docId, params.deletedBy, {
        message: `delete ${params.blockId}`,
        patches: [], // deletion is identity-level; you can also create a tombstone version if you prefer
        opSummary: { deleted: 1 },
      });
    }
  }

  async updateBlockAuthor(params: { docId: DocID; blockId: BlockID; updatedBy: UserID; setCreatedBy?: UserID }) {
    const block = await this.mustGetBlock(params.blockId);
    if (block.docId !== params.docId) throw new Error("Block does not belong to doc");
    const now = this.now();
    await this.storage.saveBlock({
      ...block,
      createdBy: params.setCreatedBy ?? block.createdBy,
      latestBy: params.updatedBy,
      latestAt: now,
    });
    await this.commit(params.docId, params.updatedBy, {
      message: `update author ${params.blockId}`,
      patches: [],
      opSummary: { authorUpdated: 1 },
    });
    return await this.mustGetBlock(params.blockId);
  }

  // =========================
  // Pending (in-memory)
  // =========================

  getPendingVersions(docId: DocID) {
    const map = this.pendingPatches.get(docId);
    const pendingCount = map ? map.size : 0;
    return { pendingCount, hasPending: pendingCount > 0 };
  }

  async commitPending(docId: DocID, createdBy: UserID, message = "commit") {
    const map = this.pendingPatches.get(docId);
    if (!map || map.size === 0) return null;

    const patches = Array.from(map.values());

    // Clear before commit to avoid re-entrancy/double commit.
    this.pendingPatches.delete(docId);

    return this.commit(docId, createdBy, {
      message,
      patches,
      opSummary: { pendingCommitted: patches.length },
    });
  }

  private addPendingPatch(docId: DocID, patch: DocRevisionPatch) {
    // Coalesce by blockId: keep earliest from, latest to.
    if (!this.pendingPatches.has(docId)) {
      this.pendingPatches.set(docId, new Map());
    }
    const byBlock = this.pendingPatches.get(docId)!;
    const existing = byBlock.get(patch.blockId);
    if (!existing) {
      byBlock.set(patch.blockId, patch);
      return;
    }
    byBlock.set(patch.blockId, {
      blockId: patch.blockId,
      from: existing.from,
      to: patch.to,
    });
  }

  // =========================
  // Version & Snapshot
  // =========================

  async getDocState(docId: DocID, docVer?: DocVer): Promise<DocStateResolved> {
    const doc = await this.mustGetDoc(docId);
    const targetVer = Math.min(docVer ?? doc.head, doc.head);

    const snap = await this.storage.getSnapshotAtOrBefore(docId, targetVer);
    let baseMap: Record<BlockID, BlockVer> = {};
    let startVer = 1;

    if (snap) {
      baseMap = { ...snap.blockVersionMap };
      startVer = snap.docVer + 1;
    }

    // apply revisions from startVer..targetVer
    for (let v = startVer; v <= targetVer; v++) {
      const rev = await this.storage.getDocRevision(docId, v);
      if (!rev) continue;
      for (const p of rev.patches) {
        baseMap[p.blockId] = p.to;
      }
    }

    // Ensure root always exists
    if (!baseMap[doc.rootBlockId]) baseMap[doc.rootBlockId] = 1;

    return {
      docId,
      docVer: targetVer,
      rootBlockId: doc.rootBlockId,
      blockVersionMap: baseMap,
    };
  }

  async getRenderedTree(docId: DocID, docVer?: DocVer): Promise<RenderNode> {
    const doc = await this.mustGetDoc(docId);
    const state = await this.getDocState(docId, docVer);

    // load all block versions referenced
    const entries = Object.entries(state.blockVersionMap);

    const versions: BlockVersion[] = [];
    for (const [blockId, ver] of entries) {
      const v = await this.storage.getBlockVersion(blockId, ver);
      if (v) versions.push(v);
    }

    // build adjacency by parentId
    const byParent = new Map<BlockID, BlockVersion[]>();
    for (const v of versions) {
      if (v.parentId === v.blockId) continue; // guard against self-parent cycles (root)
      if (!byParent.has(v.parentId)) byParent.set(v.parentId, []);
      byParent.get(v.parentId)!.push(v);
    }
    for (const [p, list] of byParent) {
      list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    }

    const visited = new Set<BlockID>();
    const build = (blockId: BlockID): RenderNode => {
      if (visited.has(blockId)) {
        return {
          id: blockId,
          ver: state.blockVersionMap[blockId] ?? 0,
          type: "custom:cycle",
          parentId: doc.rootBlockId,
          sortKey: "",
          indent: 0,
          collapsed: false,
          payload: { schema: { type: "custom:cycle", ver: 1 }, body: { text: "[cycle]" } },
          plainText: "[cycle]",
          children: [],
        };
      }
      visited.add(blockId);

      const ver = state.blockVersionMap[blockId];
      const v = versions.find((x) => x.blockId === blockId && x.ver === ver);
      if (!v) {
        // missing block version: return placeholder
        return {
          id: blockId,
          ver,
          type: "custom:missing",
          parentId: doc.rootBlockId,
          sortKey: "",
          indent: 0,
          collapsed: false,
          payload: { schema: { type: "custom:missing", ver: 1 }, body: { text: "[missing]" } },
          plainText: "[missing]",
          children: [],
        };
      }

      const children = (byParent.get(blockId) ?? []).map((childV) => build(childV.blockId));
      return {
        id: v.blockId,
        ver: v.ver,
        type: v.payload.schema.type,
        parentId: v.parentId,
        sortKey: v.sortKey,
        indent: v.indent,
        collapsed: v.collapsed,
        payload: v.payload,
        plainText: v.plainText,
        children,
      };
    };

    return build(doc.rootBlockId);
  }

  async listDocVersions(docId: DocID, limit = 50) {
    return this.storage.listDocRevisions(docId, limit);
  }

  async listBlockVersions(blockId: BlockID) {
    return this.storage.listBlockVersions(blockId);
  }

  async diffDocVersions(docId: DocID, fromDocVer: DocVer, toDocVer: DocVer) {
    const [a, b] = await Promise.all([this.getDocState(docId, fromDocVer), this.getDocState(docId, toDocVer)]);
    return diffDocStates(a, b);
  }

  async createSnapshot(docId: DocID, docVer: DocVer, createdBy?: UserID) {
    const state = await this.getDocState(docId, docVer);
    const snap: DocSnapshot = {
      _id: `${docId}@snap@${docVer}`,
      docId,
      docVer,
      createdAt: this.now(),
      rootBlockId: state.rootBlockId,
      blockVersionMap: state.blockVersionMap,
    };
    await this.storage.saveSnapshot(snap);
    return snap;
  }

  // =========================
  // Commit (internal)
  // =========================

  private async commit(
    docId: DocID,
    createdBy: UserID,
    input: {
      message: string;
      patches: DocRevisionPatch[];
      branch?: "draft" | "published";
      opSummary?: Record<string, number>;
    }
  ): Promise<DocRevision> {
    const doc = await this.mustGetDoc(docId);
    const now = this.now();

    const nextVer = doc.head + 1;

    const rev: DocRevision = {
      _id: `${docId}@${nextVer}`,
      docId,
      docVer: nextVer,
      createdAt: now,
      createdBy,
      message: input.message,
      branch: input.branch ?? "draft",
      patches: input.patches,
      rootBlockId: doc.rootBlockId,
      source: "editor",
      opSummary: input.opSummary,
    };

    await this.storage.saveDocRevision(rev);

    // update doc head
    await this.storage.saveDocument({
      ...doc,
      head: nextVer,
      updatedAt: now,
      updatedBy: createdBy,
    });

    // auto snapshot
    const every = this.opts.snapshotEvery ?? 50;
    if (every > 0 && nextVer % every === 0) {
      await this.createSnapshot(docId, nextVer, createdBy);
    }

    return rev;
  }

  // =========================
  // Helpers
  // =========================

  private async mustGetDoc(docId: DocID) {
    const doc = await this.storage.getDocument(docId);
    if (!doc) throw new Error(`Document not found: ${docId}`);
    return doc;
  }
  private async mustGetBlock(blockId: BlockID) {
    const b = await this.storage.getBlock(blockId);
    if (!b) throw new Error(`Block not found: ${blockId}`);
    return b;
  }
  private async mustGetBlockVersion(blockId: BlockID, ver: number) {
    const v = await this.storage.getBlockVersion(blockId, ver);
    if (!v) throw new Error(`BlockVersion not found: ${blockId}@${ver}`);
    return v;
  }

  private async computeSortKey(docId: DocID, parentId: BlockID, afterBlockId: BlockID | null, beforeBlockId: BlockID | null) {
    // naive: load current doc state head and find siblings under parent
    const state = await this.getDocState(docId);
    const siblings = Object.entries(state.blockVersionMap)
      .map(([blockId, ver]) => ({ blockId, ver }))
      .filter((x) => x.blockId !== parentId); // exclude parent placeholder

    // load sibling versions for structure info
    const sibVers: BlockVersion[] = [];
    for (const s of siblings) {
      const v = await this.storage.getBlockVersion(s.blockId, s.ver);
      if (v && v.parentId === parentId) sibVers.push(v);
    }
    sibVers.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));

    const a = afterBlockId ? sibVers.find((x) => x.blockId === afterBlockId)?.sortKey ?? null : null;
    const b = beforeBlockId ? sibVers.find((x) => x.blockId === beforeBlockId)?.sortKey ?? null : null;

    if (!a && !b) {
      // append to end
      const last = sibVers[sibVers.length - 1]?.sortKey ?? null;
      return { sortKey: last ? between(last, null) : firstKey() };
    }
    if (a && !b) return { sortKey: between(a, null) };
    if (!a && b) return { sortKey: between(null, b) };
    return { sortKey: between(a!, b!) };
  }
}
