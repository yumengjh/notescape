import React, { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { useDocumentEngineStore } from "./useDocumentEngineStore";

export default function MarkdownEditorDemo() {
  const { engine, docId, blockId, markdown, docVer, initialized, init, ensureBlock, setMarkdown, refresh, setEditor } =
    useDocumentEngineStore();
  const syncTimer = useRef<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const settingContent = useRef(false);

  // Initialize document and seed a block
  useEffect(() => {
    init();
  }, [init]);

  // Create Quill instance once
  useEffect(() => {
    if (!editorRef.current) return;
    const quill = new Quill(editorRef.current, {
      theme: "snow",
      modules: {
        toolbar: false,
        history: { delay: 1000, maxStack: 100, userOnly: true },
      },
    });
    quill.root.innerHTML = markdown;
    const handleTextChange = () => {
      if (settingContent.current) return;
      const html = quill.root.innerHTML;
      const normalized = html === "<p><br></p>" ? "" : html;
      setMarkdown(normalized);
    };
    quill.on("text-change", handleTextChange);
    quillRef.current = quill;
    setEditor(quill);
    return () => {
      quill.off("text-change", handleTextChange);
      quill.disable();
      quillRef.current = null;
      if (editorRef.current) editorRef.current.innerHTML = "";
      setEditor(null);
    };
  }, [setMarkdown, setEditor]);

  // Keep Quill in sync when markdown changes externally
  useEffect(() => {
    if (!quillRef.current) return;
    const quill = quillRef.current;
    const current = quill.root.innerHTML;
    if (current === markdown) return;
    settingContent.current = true;
    quill.root.innerHTML = markdown;
    settingContent.current = false;
  }, [markdown]);

  // Sync content to engine with debounce
  useEffect(() => {
    if (!initialized) return;
    const ensure = async () => {
      const id = blockId ?? (await ensureBlock());
      if (!id) return;
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(async () => {
        await engine.updateBlockContent({
          docId,
          blockId: id,
          updatedBy: "u_1",
          payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "html", source: markdown } } },
        });
        await refresh();
      }, 1000);
    };
    ensure();
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [markdown, blockId, docId, engine, ensureBlock, refresh, initialized]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* <h2 style={{ margin: 0 }}>Rich Text Editor</h2> */}
        <small style={{ color: "#666" }}>docVer {docVer} · Block {blockId ?? "-"}</small>
      </div>

      <div ref={editorRef} style={{ minHeight: 420 }} aria-label="富文本编辑器" />
    </div>
  );
}
