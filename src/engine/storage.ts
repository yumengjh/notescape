import type {
  BlockIdentity,
  BlockID,
  BlockVersion,
  DocID,
  DocRevision,
  DocSnapshot,
  DocumentMeta,
  DocVer,
} from "./types";

// Storage interface to allow swapping persistence backends (e.g., MongoDB).
export interface Storage {
  // documents
  getDocument(docId: DocID): Promise<DocumentMeta | null>;
  saveDocument(doc: DocumentMeta): Promise<void>;

  // blocks identity
  getBlock(blockId: BlockID): Promise<BlockIdentity | null>;
  saveBlock(block: BlockIdentity): Promise<void>;
  listBlocksByDoc(docId: DocID): Promise<BlockIdentity[]>;

  // block versions
  getBlockVersion(blockId: BlockID, ver: number): Promise<BlockVersion | null>;
  saveBlockVersion(v: BlockVersion): Promise<void>;
  listBlockVersions(blockId: BlockID): Promise<BlockVersion[]>;

  // doc revisions
  getDocRevision(docId: DocID, docVer: DocVer): Promise<DocRevision | null>;
  saveDocRevision(rev: DocRevision): Promise<void>;
  listDocRevisions(docId: DocID, limit?: number): Promise<DocRevision[]>;

  // snapshots
  getSnapshotAtOrBefore(docId: DocID, docVer: DocVer): Promise<DocSnapshot | null>;
  saveSnapshot(s: DocSnapshot): Promise<void>;
  listSnapshots(docId: DocID): Promise<DocSnapshot[]>;
}

// Simple in-memory storage for demos/tests.
export class InMemoryStorage implements Storage {
  docs = new Map<string, DocumentMeta>();
  blocks = new Map<string, BlockIdentity>();
  blockVers = new Map<string, BlockVersion>(); // key: `${blockId}@${ver}`
  revisions = new Map<string, DocRevision>(); // `${docId}@${docVer}`
  snapshots = new Map<string, DocSnapshot>(); // `${docId}@snap@${docVer}`

  async getDocument(docId: DocID) {
    return this.docs.get(docId) ?? null;
  }
  async saveDocument(doc: DocumentMeta) {
    this.docs.set(doc._id, doc);
  }

  async getBlock(blockId: BlockID) {
    return this.blocks.get(blockId) ?? null;
  }
  async saveBlock(block: BlockIdentity) {
    this.blocks.set(block._id, block);
  }
  async listBlocksByDoc(docId: DocID) {
    return Array.from(this.blocks.values()).filter((b) => b.docId === docId);
  }

  async getBlockVersion(blockId: BlockID, ver: number) {
    return this.blockVers.get(`${blockId}@${ver}`) ?? null;
  }
  async saveBlockVersion(v: BlockVersion) {
    this.blockVers.set(`${v.blockId}@${v.ver}`, v);
  }
  async listBlockVersions(blockId: BlockID) {
    return Array.from(this.blockVers.values())
      .filter((v) => v.blockId === blockId)
      .sort((a, b) => a.ver - b.ver);
  }

  async getDocRevision(docId: DocID, docVer: DocVer) {
    return this.revisions.get(`${docId}@${docVer}`) ?? null;
  }
  async saveDocRevision(rev: DocRevision) {
    this.revisions.set(`${rev.docId}@${rev.docVer}`, rev);
  }
  async listDocRevisions(docId: DocID, limit = 100) {
    return Array.from(this.revisions.values())
      .filter((r) => r.docId === docId)
      .sort((a, b) => b.docVer - a.docVer)
      .slice(0, limit);
  }

  async getSnapshotAtOrBefore(docId: DocID, docVer: DocVer) {
    const all = Array.from(this.snapshots.values())
      .filter((s) => s.docId === docId && s.docVer <= docVer)
      .sort((a, b) => b.docVer - a.docVer);
    return all[0] ?? null;
  }
  async saveSnapshot(s: DocSnapshot) {
    this.snapshots.set(s._id, s);
  }
  async listSnapshots(docId: DocID) {
    return Array.from(this.snapshots.values())
      .filter((s) => s.docId === docId)
      .sort((a, b) => b.docVer - a.docVer);
  }
}
