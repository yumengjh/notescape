import { create } from "zustand";
import { marked } from "marked";
import { DocumentEngine } from "../engine/engine";
import { InMemoryStorage } from "../engine/storage";
import type { DocRevision, RenderNode } from "../engine/types";
import type Quill from "quill";

type State = {
  engine: DocumentEngine;
  editor: Quill | null;
  docId: string;
  blockId: string | null;
  markdown: string;
  docVer: number;
  selectedDocVer: number | null;
  tree: RenderNode | null;
  versions: DocRevision[];
  historyPreviewHtml: string;
  initialized: boolean;
};

type Actions = {
  init: () => Promise<void>;
  ensureBlock: () => Promise<string>;
  setMarkdown: (text: string) => void;
  setEditor: (editor: Quill | null) => void;
  refresh: () => Promise<void>;
  loadVersionPreview: (ver: number) => Promise<void>;
};

const initialContent =
  "<h1>鱼文</h1>";

function extractFirstBlockText(tree: RenderNode | null): string {
  if (!tree) return "";
  const findRich = (n: RenderNode): string | null => {
    if (n.payload?.body?.richText?.source) return n.payload.body.richText.source as string;
    for (const c of n.children) {
      const v = findRich(c);
      if (v) return v;
    }
    return null;
  };
  return findRich(tree) ?? "";
}

export const useDocumentEngineStore = create<State & Actions>((set, get) => ({
  engine: new DocumentEngine(new InMemoryStorage(), { snapshotEvery: 5 }),
  editor: null,
  docId: "md_demo",
  blockId: null,
  markdown: initialContent,
  docVer: 0,
  selectedDocVer: null,
  tree: null,
  versions: [],
  historyPreviewHtml: "",
  initialized: false,

  async init() {
    const { engine, docId, initialized, markdown } = get();
    if (initialized) return;
    await engine.createDocument({ docId, title: "Markdown Demo", createdBy: "u_1" });
    const block = await engine.createBlock({
      docId,
      type: "paragraph",
      createdBy: "u_1",
      payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "html", source: markdown } } },
    });
    const doc = await engine.getDocument(docId);
    const tree = await engine.getRenderedTree(docId);
    const versions = (await engine.listDocVersions(docId, 50)).sort((a, b) => a.docVer - b.docVer);
    set({
      blockId: block.block._id,
      docVer: doc?.head ?? 0,
      selectedDocVer: doc?.head ?? 0,
      tree,
      versions,
      initialized: true,
    });
  },

  setMarkdown(text) {
    set({ markdown: text });
  },

  setEditor(editor) {
    set({ editor });
  },

  async refresh() {
    const { engine, docId } = get();
    const doc = await engine.getDocument(docId);
    const tree = await engine.getRenderedTree(docId);
    const versions = (await engine.listDocVersions(docId, 50)).sort((a, b) => a.docVer - b.docVer);
    set((state) => ({
      docVer: doc?.head ?? 0,
      tree,
      versions,
      selectedDocVer: state.selectedDocVer ?? doc?.head ?? 0,
    }));
  },

  async loadVersionPreview(ver: number) {
    const { engine, docId } = get();
    const tree = await engine.getRenderedTree(docId, ver);
    const text = extractFirstBlockText(tree) ?? "";
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
    const html = looksLikeHtml ? text : String(marked.parse(text));
    set({ historyPreviewHtml: html, selectedDocVer: ver });
  },

  async ensureBlock() {
    const { blockId, engine, docId, markdown } = get();
    if (blockId) return blockId;
    const block = await engine.createBlock({
      docId,
      type: "paragraph",
      createdBy: "u_1",
      payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "html", source: markdown } } },
    });
    set({ blockId: block.block._id });
    return block.block._id;
  },
}));
