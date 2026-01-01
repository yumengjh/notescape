import React, { useEffect } from "react";
import { useDocumentEngineStore } from "../editor/useDocumentEngineStore";

export default function HistoryPage() {
  const { versions, historyPreviewHtml, docVer, selectedDocVer, loadVersionPreview, init } = useDocumentEngineStore();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>History Versions</h1>
      <p style={{ color: "#666" }}>查看当前文档的历史版本，点击左侧条目预览内容。</p>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflow: "auto" }}>
          {versions.map((rev) => (
            <button
              key={rev.docVer}
              onClick={() => loadVersionPreview(rev.docVer)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                background: rev.docVer === (selectedDocVer ?? docVer) ? "#eef" : "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              docVer {rev.docVer} — {rev.message}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 320 }}>
          <h3 style={{ marginTop: 0 }}>选中版本预览</h3>
          {historyPreviewHtml ? <div dangerouslySetInnerHTML={{ __html: historyPreviewHtml }} /> : <div style={{ color: "#888" }}>请选择一个版本</div>}
        </div>
      </div>
    </div>
  );
}
