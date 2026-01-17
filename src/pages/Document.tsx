import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useDocumentContext } from "../context/documentContext";
import { useEditContext } from "../context/editContext";
import TiptapNotionEditor from "../editor/TiptapNotionEditor";

export default function DocumentPage() {
  const { docId } = useParams<{ docId: string }>();
  const { switchDocument } = useDocumentContext();
  const { setIsEditing } = useEditContext();
  const lastDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (docId && docId !== lastDocIdRef.current) {
      lastDocIdRef.current = docId;
      switchDocument(docId);
      // 只在文档切换时切换到展示状态，而不是每次 effect 执行时
      setIsEditing(false);
    }
  }, [docId, switchDocument, setIsEditing]);

  return <TiptapNotionEditor />;
}
