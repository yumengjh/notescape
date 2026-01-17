import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { DocumentEngine } from "../engine/engine";
import { InMemoryStorage } from "../engine/storage";
import type { DocID, DocumentMeta } from "../engine/types";

export interface DocumentInfo {
  docId: DocID;
  title: string;
  engine: DocumentEngine;
  storage: InMemoryStorage;
  meta?: DocumentMeta;
}

interface DocumentContextType {
  documents: DocumentInfo[];
  currentDocId: DocID | null;
  currentDocument: DocumentInfo | null;
  addDocument: (docId: DocID, title: string) => Promise<void>;
  switchDocument: (docId: DocID) => Promise<void>;
  removeDocument: (docId: DocID) => void;
  updateDocumentTitle: (docId: DocID, title: string) => void;
  initializeDocument: (docId: DocID) => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType | null>(null);

export const useDocumentContext = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error("useDocumentContext must be used within DocumentProvider");
  }
  return context;
};

const DEFAULT_DOC_ID = "51c6721d-5c41-4d01-a685-9f10c23887f3";
const DEFAULT_DOC_TITLE = "Untitled";

export const DocumentProvider = ({ children }: { children: ReactNode }) => {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [currentDocId, setCurrentDocId] = useState<DocID | null>(null);

  // 初始化默认文档
  useEffect(() => {
    const initDefaultDoc = async () => {
      if (documents.length === 0) {
        const storage = new InMemoryStorage();
        const engine = new DocumentEngine(storage, { snapshotEvery: 5 });
        
        try {
          await engine.createDocument({
            docId: DEFAULT_DOC_ID,
            title: DEFAULT_DOC_TITLE,
            createdBy: "u_1",
          });
          
          const meta = await engine.getDocument(DEFAULT_DOC_ID);
          
          const newDoc: DocumentInfo = {
            docId: DEFAULT_DOC_ID,
            title: DEFAULT_DOC_TITLE,
            engine,
            storage,
            meta: meta || undefined,
          };
          
          setDocuments([newDoc]);
          setCurrentDocId(DEFAULT_DOC_ID);
        } catch (error) {
          // 文档已存在，直接加载
          const storage = new InMemoryStorage();
          const engine = new DocumentEngine(storage, { snapshotEvery: 5 });
          const meta = await engine.getDocument(DEFAULT_DOC_ID);
          
          const newDoc: DocumentInfo = {
            docId: DEFAULT_DOC_ID,
            title: meta?.title || DEFAULT_DOC_TITLE,
            engine,
            storage,
            meta: meta || undefined,
          };
          
          setDocuments([newDoc]);
          setCurrentDocId(DEFAULT_DOC_ID);
        }
      }
    };
    
    initDefaultDoc();
  }, []);

  const addDocument = useCallback(async (docId: DocID, title: string) => {
    const storage = new InMemoryStorage();
    const engine = new DocumentEngine(storage, { snapshotEvery: 5 });
    
    try {
      await engine.createDocument({
        docId,
        title,
        createdBy: "u_1",
      });
      
      const meta = await engine.getDocument(docId);
      
      const newDoc: DocumentInfo = {
        docId,
        title,
        engine,
        storage,
        meta: meta || undefined,
      };
      
      setDocuments((prev) => [...prev, newDoc]);
      setCurrentDocId(docId);
    } catch (error) {
      console.error("Failed to create document:", error);
      throw error;
    }
  }, []);

  const switchDocument = useCallback(async (docId: DocID) => {
    const doc = documents.find((d) => d.docId === docId);
    if (!doc) {
      // 如果文档不存在，尝试加载
      const storage = new InMemoryStorage();
      const engine = new DocumentEngine(storage, { snapshotEvery: 5 });
      const meta = await engine.getDocument(docId);
      
      if (meta) {
        const newDoc: DocumentInfo = {
          docId,
          title: meta.title,
          engine,
          storage,
          meta,
        };
        setDocuments((prev) => [...prev, newDoc]);
        setCurrentDocId(docId);
      }
    } else {
      setCurrentDocId(docId);
    }
  }, [documents]);

  const removeDocument = useCallback((docId: DocID) => {
    setDocuments((prev) => prev.filter((d) => d.docId !== docId));
    if (currentDocId === docId) {
      const remaining = documents.filter((d) => d.docId !== docId);
      setCurrentDocId(remaining.length > 0 ? remaining[0].docId : null);
    }
  }, [currentDocId, documents]);

  const updateDocumentTitle = useCallback((docId: DocID, title: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.docId === docId ? { ...d, title } : d))
    );
  }, []);

  const initializeDocument = useCallback(async (docId: DocID) => {
    const doc = documents.find((d) => d.docId === docId);
    if (doc && !doc.meta) {
      const meta = await doc.engine.getDocument(docId);
      setDocuments((prev) =>
        prev.map((d) => (d.docId === docId ? { ...d, meta: meta || undefined } : d))
      );
    }
  }, [documents]);

  const currentDocument = documents.find((d) => d.docId === currentDocId) || null;

  return (
    <DocumentContext.Provider
      value={{
        documents,
        currentDocId,
        currentDocument,
        addDocument,
        switchDocument,
        removeDocument,
        updateDocumentTitle,
        initializeDocument,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
};
