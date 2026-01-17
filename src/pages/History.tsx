import { useEffect } from "react";
import { useDocumentEngineStore } from "../editor/useDocumentEngineStore";
import { useDocumentContext } from "../context/documentContext";

export default function HistoryPage() {
  const { currentDocument } = useDocumentContext();
  const { versions, historyPreviewHtml, docVer, selectedDocVer, loadVersionPreview, init, switchDocument } = useDocumentEngineStore();

  useEffect(() => {
    if (currentDocument) {
      const engine = currentDocument.engine;
      const docId = currentDocument.docId;
      
      // 切换文档时重新初始化
      switchDocument(docId, engine);
    }
  }, [currentDocument?.docId, switchDocument]);

  if (!currentDocument) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>历史版本</h1>
        <p style={{ color: "#666" }}>请先选择一个文档</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>历史版本</h1>
      <p style={{ color: "#666" }}>
        查看文档 <strong>{currentDocument.title}</strong> 的历史版本，点击左侧条目预览内容。
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflow: "auto" }}>
          {versions.length === 0 ? (
            <div style={{ color: "#888", padding: "8px 10px" }}>暂无历史版本</div>
          ) : (
            versions.map((rev) => (
              <button
                key={rev.docVer}
                onClick={() => {
                  if (currentDocument) {
                    loadVersionPreview(currentDocument.engine, rev.docVer);
                  }
                }}
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
            ))
          )}
        </div>

        <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 320 }}>
          <h3 style={{ marginTop: 0 }}>选中版本预览</h3>
          {historyPreviewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: historyPreviewHtml }} />
          ) : (
            <div style={{ color: "#888" }}>请选择一个版本</div>
          )}
        </div>
      </div>
    </div>
  );
}
