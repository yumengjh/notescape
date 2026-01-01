import React, { useEffect, useMemo, useState } from "react";
import { DocumentEngine } from "../engine/engine";
import { InMemoryStorage } from "../engine/storage";
import type { RenderNode, DocRevision } from "../engine/types";

function renderNode(node: RenderNode) {
  const type = node.payload.schema.type;
  const content = node.payload?.body?.richText?.source ?? node.payload?.body?.text ?? "";

  if (type === "root") {
    return (
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        {node.children.map((c) => (
          <div key={c.id} style={{ marginTop: 8 }}>
            {renderNode(c)}
          </div>
        ))}
      </div>
    );
  }

  if (type === "heading") {
    return (
      <h2 style={{ margin: 0 }}>
        {content} <small style={{ color: "#999" }}>({node.id}@{node.ver})</small>
      </h2>
    );
  }

  if (type === "paragraph") {
    return (
      <p style={{ margin: 0 }}>
        {content} <small style={{ color: "#999" }}>({node.id}@{node.ver})</small>
      </p>
    );
  }

  return (
    <div>
      <strong>{type}</strong>: {content}
    </div>
  );
}

export default function DocumentEditorDemo() {
  const engine = useMemo(() => {
    const storage = new InMemoryStorage();
    return new DocumentEngine(storage, { snapshotEvery: 3 });
  }, []);

  const docId = "doc_demo";
  const [tree, setTree] = useState<RenderNode | null>(null);
  const [docVer, setDocVer] = useState<number>(0);
  const [versions, setVersions] = useState<DocRevision[]>([]);

  useEffect(() => {
    (async () => {
      // bootstrap demo data
      await engine.createDocument({ docId, title: "Demo document", createdBy: "u_1" });

      const heading = await engine.createBlock({
        docId,
        type: "heading",
        createdBy: "u_1",
        payload: {
          schema: { type: "heading", ver: 1 },
          body: { richText: { format: "md+", source: "Heading: Hello document model" } },
        },
      });

      const p1 = await engine.createBlock({
        docId,
        type: "paragraph",
        createdBy: "u_1",
        afterBlockId: heading.block._id,
        payload: {
          schema: { type: "paragraph", ver: 1 },
          body: { richText: { format: "md+", source: "Paragraph 1: initial content." } },
        },
      });

      await engine.updateBlockContent({
        docId,
        blockId: p1.block._id,
        updatedBy: "u_2",
        payload: {
          schema: { type: "paragraph", ver: 1 },
          body: { richText: { format: "md+", source: "Paragraph 1: updated content by u_2." } },
        },
      });

      await engine.createBlock({
        docId,
        type: "paragraph",
        createdBy: "u_1",
        beforeBlockId: p1.block._id,
        payload: {
          schema: { type: "paragraph", ver: 1 },
          body: { richText: { format: "md+", source: "Paragraph 0: inserted before p1." } },
        },
      });

      const doc = await engine.getDocument(docId);
      setDocVer(doc!.head);

      const t = await engine.getRenderedTree(docId);
      setTree(t);

      const vers = await engine.listDocVersions(docId, 20);
      setVersions(vers.sort((a, b) => a.docVer - b.docVer));
    })();
  }, [engine]);

  const loadVersion = async (v: number) => {
    const t = await engine.getRenderedTree(docId, v);
    setTree(t);
    setDocVer(v);
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Document Engine Demo</h1>
      <p style={{ color: "#666" }}>
        这个演示可以做种文档，创建和更新块，并让你查看历史文档版本。
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 260 }}>
          <h3>Versions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {versions.map((rev) => (
              <button
                key={rev.docVer}
                onClick={() => loadVersion(rev.docVer)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  background: rev.docVer === docVer ? "#eef" : "#fff",
                  textAlign: "left",
                }}
              >
                docVer = {rev.docVer} — {rev.message}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Rendered output (docVer={docVer})</h3>
          {tree ? renderNode(tree) : <div>Loading...</div>}
        </div>
      </div>
    </div>
  );
}
