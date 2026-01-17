import { create } from "zustand";
import { marked } from "marked";
import type { DocRevision, RenderNode, DocID } from "../engine/types";
// 为了同时支持 Quill / Tiptap，这里用更宽松的类型
type AnyEditor = unknown;

type State = {
  editor: AnyEditor | null;
  docId: DocID | null;
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
  init: (docId: DocID, engine: any) => Promise<void>;
  switchDocument: (docId: DocID, engine: any) => Promise<void>;
  ensureBlock: (engine: any) => Promise<string>;
  setMarkdown: (text: string) => void;
  setEditor: (editor: AnyEditor | null) => void;
  refresh: (engine: any) => Promise<void>;
  loadVersionPreview: (engine: any, ver: number) => Promise<void>;
  reset: () => void;
};

const initialContent =
  "";

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
  editor: null,
  docId: null,
  blockId: null,
  markdown: initialContent,
  docVer: 0,
  selectedDocVer: null,
  tree: null,
  versions: [],
  historyPreviewHtml: "",
  initialized: false,

  async init(docId: DocID, engine: any) {
    const state = get();
    // 如果已经初始化且是同一个文档，直接返回
    if (state.initialized && state.docId === docId) {
      return;
    }
    
    try {
      // 检查文档是否已存在，如果不存在则创建初始内容
      let doc = await engine.getDocument(docId);
      if (!doc) {
        await engine.createDocument({ docId, title: "新文档", createdBy: "u_1" });
        doc = await engine.getDocument(docId);
      }
      
      // 加载文档树
      const tree = await engine.getRenderedTree(docId);
      let blockId: string | null = null;
      let content = initialContent; // 默认内容
      
      // 如果文档已有内容，从树中提取
      if (tree.children.length > 0) {
        // 找到第一个有内容的块
        const firstBlock = tree.children[0];
        if (firstBlock) {
          blockId = firstBlock.id;
          // 提取内容
          const extracted = extractFirstBlockText(tree);
          if (extracted && extracted.trim()) {
            content = extracted;
          } else {
            // 如果提取的内容为空，使用默认内容
            content = initialContent;
          }
        }
      }
      
      // 如果文档没有内容块，创建一个
      if (!blockId || tree.children.length === 0) {
        const block = await engine.createBlock({
          docId,
          type: "paragraph",
          createdBy: "u_1",
          payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "html", source: initialContent } } },
        });
        blockId = block.block._id;
        content = initialContent;
      }
      
      const updatedTree = await engine.getRenderedTree(docId);
      const versions = (await engine.listDocVersions(docId, 50)).sort((a: DocRevision, b: DocRevision) => a.docVer - b.docVer);
      
      // 再次检查，避免并发初始化
      const currentState = get();
      if (currentState.initialized && currentState.docId === docId) {
        return;
      }
      
      console.log(`[init] Setting markdown for doc ${docId}:`, content.substring(0, 100));
      
      set({
        docId,
        blockId,
        markdown: content, // 更新 markdown 状态为文档的实际内容
        docVer: doc?.head ?? 0,
        selectedDocVer: doc?.head ?? 0,
        tree: updatedTree,
        versions,
        initialized: true,
      });
      
      // 验证设置是否成功
      const afterSet = get();
      console.log(`[init] After set, markdown is:`, afterSet.markdown.substring(0, 100), `docId:`, afterSet.docId);
    } catch (error) {
      console.error("Failed to initialize document:", error);
    }
  },

  async switchDocument(docId: DocID, engine: any) {
    // 重置状态（包括 markdown，init 会从文档中加载实际内容）
    set({
      docId: null,
      blockId: null,
      markdown: initialContent, // 临时重置，init 会加载实际内容
      docVer: 0,
      selectedDocVer: null,
      tree: null,
      versions: [],
      historyPreviewHtml: "",
      initialized: false,
    });
    
    // 初始化新文档（会从文档中加载实际内容到 markdown）
    await get().init(docId, engine);
  },

  setMarkdown(text) {
    set({ markdown: text });
  },

  setEditor(editor) {
    set({ editor });
  },

  async refresh(engine: any) {
    const { docId } = get();
    if (!docId || !engine) return;
    
    const doc = await engine.getDocument(docId);
    const tree = await engine.getRenderedTree(docId);
    const versions = (await engine.listDocVersions(docId, 50)).sort((a: DocRevision, b: DocRevision) => a.docVer - b.docVer);
    set((state) => ({
      docVer: doc?.head ?? 0,
      tree,
      versions,
      selectedDocVer: state.selectedDocVer ?? doc?.head ?? 0,
    }));
  },

  async loadVersionPreview(engine: any, ver: number) {
    const { docId } = get();
    if (!docId || !engine) return;
    
    const tree = await engine.getRenderedTree(docId, ver);
    const text = extractFirstBlockText(tree) ?? "";
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
    const html = looksLikeHtml ? text : String(marked.parse(text));
    set({ historyPreviewHtml: html, selectedDocVer: ver });
  },

  async ensureBlock(engine: any) {
    const { blockId, docId, markdown } = get();
    if (!docId || !engine) throw new Error("Document not initialized");
    
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

  reset() {
    set({
      docId: null,
      blockId: null,
      docVer: 0,
      selectedDocVer: null,
      tree: null,
      versions: [],
      historyPreviewHtml: "",
      initialized: false,
    });
  },
}));
