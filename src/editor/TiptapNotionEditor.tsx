import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { DOMParser as ProseMirrorDOMParser, Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { Input } from "antd";
import { marked } from "marked";
import { useDocumentEngineStore } from "./useDocumentEngineStore";
import { useDocumentContext } from "../context/documentContext";
import { useEditContext } from "../context/editContext";
import "./tiptap.css";

export default function TiptapNotionEditor() {
  const { currentDocument, updateDocumentTitle } = useDocumentContext();
  const { isEditing } = useEditContext();
  const {
    docId,
    blockId,
    markdown,
    docVer,
    initialized,
    init,
    ensureBlock,
    setMarkdown,
    setEditor,
    refresh,
    switchDocument,
  } = useDocumentEngineStore();

  const syncTimer = useRef<number | null>(null);
  const isUpdatingFromStore = useRef(false);
  const initializingDocId = useRef<string | null>(null);
  const titleTimer = useRef<number | null>(null);
  const isEditingTitle = useRef(false);
  const lastSyncedDocId = useRef<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const editorRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder: "像在 Notion / Typora 一样开始记录你的知识吧…",
      }),
      Underline,
      TaskList.configure({
        HTMLAttributes: {
          class: "task-list",
        },
      }),
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "tiptap-link",
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      // 粘贴处理扩展（支持 HTML 和 Markdown）
      Extension.create({
        name: "pasteHandler",
        addProseMirrorPlugins() {
          const self = this;
          
          // 清理粘贴的 HTML 内容
          const cleanPastedHTML = (html: string): string => {
            // 创建一个临时 DOM 来解析和清理 HTML
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            
            // 移除不需要的标签和属性
            const unwantedTags = ["script", "style", "meta", "link", "iframe", "object", "embed"];
            unwantedTags.forEach(tag => {
              const elements = tempDiv.querySelectorAll(tag);
              elements.forEach(el => el.remove());
            });
            
            // 清理链接，确保链接有效
            const links = tempDiv.querySelectorAll("a");
            links.forEach(link => {
              const href = link.getAttribute("href");
              if (!href || href.startsWith("javascript:") || href.startsWith("data:")) {
                // 移除危险的链接
                const parent = link.parentNode;
                if (parent) {
                  while (link.firstChild) {
                    parent.insertBefore(link.firstChild, link);
                  }
                  parent.removeChild(link);
                }
              }
            });
            
            // 移除空的段落和只有尾随换行符的段落
            const paragraphs = tempDiv.querySelectorAll("p");
            paragraphs.forEach(p => {
              // 检查段落是否只包含 br 标签（特别是 ProseMirror-trailingBreak）
              const brs = p.querySelectorAll("br");
              const hasOnlyBr = brs.length > 0 && p.textContent?.trim() === "";
              const hasTrailingBreak = Array.from(brs).some(br => 
                br.classList.contains("ProseMirror-trailingBreak")
              );
              
              if (hasOnlyBr || hasTrailingBreak) {
                p.remove();
              }
            });
            
            // 移除所有 ProseMirror-trailingBreak 的 br 标签
            const trailingBreaks = tempDiv.querySelectorAll("br.ProseMirror-trailingBreak");
            trailingBreaks.forEach(br => br.remove());
            
            // 清理开头和结尾的空段落
            let cleanedHtml = tempDiv.innerHTML;
            
            // 移除开头的空段落
            cleanedHtml = cleanedHtml.replace(/^<p>\s*<br[^>]*>\s*<\/p>/i, "");
            cleanedHtml = cleanedHtml.replace(/^<p>\s*<\/p>/i, "");
            
            // 移除结尾的空段落
            cleanedHtml = cleanedHtml.replace(/<p>\s*<br[^>]*>\s*<\/p>$/i, "");
            cleanedHtml = cleanedHtml.replace(/<p>\s*<\/p>$/i, "");
            
            return cleanedHtml;
          };
          
          return [
            new Plugin({
              props: {
                handlePaste: (view: EditorView, event: ClipboardEvent) => {
                  // 优先获取 HTML 内容（从网站复制的内容）
                  const html = event.clipboardData?.getData("text/html");
                  const text = event.clipboardData?.getData("text/plain");
                  
                  if (!html && !text) return false;

                  console.log("[PasteHandler] Detected paste");
                  console.log("[PasteHandler] HTML:", html?.substring(0, 200));
                  console.log("[PasteHandler] Text:", text?.substring(0, 200));

                  // 如果有 HTML 内容，直接使用（从网站复制的内容）
                  if (html && html.trim()) {
                    // 检查是否是有效的 HTML
                    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(html);
                    
                    if (hasHtmlTags) {
                      event.preventDefault();
                      
                      try {
                        console.log("[PasteHandler] Using HTML content directly");
                        
                        // 清理 HTML（移除不需要的标签和属性）
                        const cleanHtml = cleanPastedHTML(html);
                        
                        // 使用编辑器实例插入内容
                        const editorInstance = self.editor;
                        if (editorInstance) {
                          console.log("[PasteHandler] Inserting HTML via editor");
                          
                          // 插入内容
                          editorInstance.commands.insertContent(cleanHtml, {
                            parseOptions: {
                              preserveWhitespace: false,
                            },
                          });
                          
                          // 插入后立即清理：使用 requestAnimationFrame 确保 DOM 更新完成
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                              const html = editorInstance.getHTML();
                              
                              // 如果包含 ProseMirror-trailingBreak，清理它
                              if (html.includes('ProseMirror-trailingBreak')) {
                                // 使用正则表达式移除所有包含 ProseMirror-trailingBreak 的段落
                                let cleaned = html
                                  // 移除开头的空段落（包含 ProseMirror-trailingBreak）
                                  .replace(/^<p[^>]*>\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\s*<\/p>/i, "")
                                  // 移除所有包含 ProseMirror-trailingBreak 的段落
                                  .replace(/<p[^>]*>[\s\S]*?<br[^>]*class="ProseMirror-trailingBreak"[^>]*>[\s\S]*?<\/p>/gi, "")
                                  // 移除所有单独的 ProseMirror-trailingBreak br 标签
                                  .replace(/<br[^>]*class="ProseMirror-trailingBreak"[^>]*>/gi, "")
                                  // 移除开头的空段落（不包含 class 的）
                                  .replace(/^<p>\s*<br[^>]*>\s*<\/p>/i, "")
                                  .replace(/^<p>\s*<\/p>/i, "");
                                
                                // 如果清理后的内容不同，更新编辑器
                                if (cleaned !== html && cleaned.trim() !== "") {
                                  // 保存当前光标位置
                                  const { from } = editorInstance.state.selection;
                                  
                                  // 设置清理后的内容
                                  editorInstance.commands.setContent(cleaned, { emitUpdate: false });
                                  
                                  // 恢复光标位置（如果可能）
                                  setTimeout(() => {
                                    try {
                                      const newDoc = editorInstance.state.doc;
                                      const newFrom = Math.min(from, newDoc.content.size);
                                      editorInstance.commands.setTextSelection(newFrom);
                                    } catch (e) {
                                      // 忽略光标位置错误
                                    }
                                  }, 0);
                                }
                              }
                            });
                          });
                          
                          return true;
                        } else {
                          console.warn("[PasteHandler] Editor instance not available, trying alternative method");
                          // 备用方案：使用 ProseMirror 的方式直接插入
                          const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
                          const dom = new DOMParser().parseFromString(cleanHtml, "text/html");
                          const fragment = parser.parse(dom.body);
                          const { from, to } = view.state.selection;
                          const slice = new Slice(fragment.content, 0, 0);
                          const transaction = view.state.tr.replace(from, to, slice);
                          view.dispatch(transaction);
                          return true;
                        }
                      } catch (error) {
                        console.error("[PasteHandler] Failed to insert HTML:", error);
                        return false;
                      }
                    }
                  }

                  // 如果没有 HTML 或 HTML 无效，检查是否是 Markdown 格式的纯文本
                  if (text) {
                    // 检测是否是 Markdown 格式
                    const looksLikeMarkdown = /(^#{1,6}\s)|(\*\*.*\*\*)|(\*.*\*)|(^-\s)|(^\*\s)|(^\d+\.\s)|(^>\s)|(\[.*\]\(.*\))|(```)/m.test(text);

                    console.log("[PasteHandler] Looks like markdown:", looksLikeMarkdown);

                    if (looksLikeMarkdown) {
                      event.preventDefault();
                      
                      try {
                        // 使用 marked.parse 同步解析 Markdown 为 HTML
                        const parsedHtml = marked.parse(text, {
                          breaks: true,
                          gfm: true,
                        }) as string;
                        
                        console.log("[PasteHandler] Parsed Markdown to HTML:", parsedHtml.substring(0, 200));
                        
                        // 使用编辑器实例插入内容
                        const editorInstance = self.editor;
                        if (editorInstance) {
                          console.log("[PasteHandler] Inserting parsed Markdown via editor");
                          editorInstance.commands.insertContent(parsedHtml);
                          return true;
                        } else {
                          console.warn("[PasteHandler] Editor instance not available, trying alternative method");
                          // 备用方案：使用 ProseMirror 的方式直接插入
                          const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
                          const dom = new DOMParser().parseFromString(parsedHtml, "text/html");
                          const fragment = parser.parse(dom.body);
                          const { from, to } = view.state.selection;
                          const slice = new Slice(fragment.content, 0, 0);
                          const transaction = view.state.tr.replace(from, to, slice);
                          view.dispatch(transaction);
                          return true;
                        }
                      } catch (error) {
                        console.error("[PasteHandler] Failed to parse markdown:", error);
                        return false;
                      }
                    }
                  }
                  
                  // 其他情况交给默认处理
                  return false;
                },
              },
            }),
          ];
        },
      }),
      // 自定义字号扩展
      Extension.create({
        name: "fontSize",
        addOptions() {
          return {
            types: ["textStyle"],
          };
        },
        addGlobalAttributes() {
          return [
            {
              types: this.options.types,
              attributes: {
                fontSize: {
                  default: null,
                  parseHTML: (element) => {
                    const fontSize = element.style.fontSize;
                    if (fontSize) {
                      return fontSize.replace("px", "");
                    }
                    return null;
                  },
                  renderHTML: (attributes) => {
                    if (!attributes.fontSize) {
                      return {};
                    }
                    return {
                      style: `font-size: ${attributes.fontSize}px`,
                    };
                  },
                },
              },
            },
          ];
        },
        addCommands() {
          return {
            setFontSize:
              (fontSize: string) =>
              ({ chain }: { chain: any }) => {
                return chain()
                  .setMark("textStyle", { fontSize })
                  .run();
              },
            unsetFontSize:
              () =>
              ({ chain }: { chain: any }) => {
                return chain()
                  .setMark("textStyle", { fontSize: null })
                  .removeEmptyTextStyle()
                  .run();
              },
          };
        },
      }),
    ],
    content: markdown || "<p></p>",
    autofocus: "end",
    editable: isEditing,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
      },
    },
    onUpdate: ({ editor }) => {
      // 如果是从 store 更新内容，不触发 markdown 更新
      if (isUpdatingFromStore.current) {
        console.log(`[Editor] onUpdate ignored - updating from store`);
        isUpdatingFromStore.current = false;
        return;
      }
      const html = editor.getHTML();
      const normalized = html === "<p></p>" ? "" : html;
      console.log(`[Editor] onUpdate triggered - html:`, html.substring(0, 50), `normalized:`, normalized.substring(0, 50));
      setMarkdown(normalized);
    },
  });

  // 保存编辑器实例到 ref，供粘贴插件使用
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  // 初始化文档或切换文档
  useEffect(() => {
    if (!currentDocument) return;
    
    const engine = currentDocument.engine;
    const newDocId = currentDocument.docId;
    
    console.log(`[Editor] Document switch effect - newDocId: ${newDocId}, current docId: ${docId}, initialized: ${initialized}`);
    
    // 如果已经在初始化这个文档，或者已经初始化完成，跳过
    if (initializingDocId.current === newDocId || (initialized && docId === newDocId)) {
      console.log(`[Editor] Skipping switch - already initializing or already initialized`);
      return;
    }
    
    // 标记正在初始化
    initializingDocId.current = newDocId;
    console.log(`[Editor] Starting switch to doc ${newDocId}`);
    
    // 切换文档时，如果 docId 不同，先清空编辑器内容
    if (editor && newDocId !== docId) {
      console.log(`[Editor] Clearing editor before switch`);
      isUpdatingFromStore.current = true;
      editor.commands.setContent("<p></p>", { emitUpdate: false });
      // 重置标志
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isUpdatingFromStore.current = false;
        });
      });
    }
    
    // 切换文档时重新初始化
    switchDocument(newDocId, engine).finally(() => {
      console.log(`[Editor] Switch completed for doc ${newDocId}`);
      // 初始化完成后清除标记
      if (initializingDocId.current === newDocId) {
        initializingDocId.current = null;
      }
    });
  }, [currentDocument?.docId, docId, initialized, editor, switchDocument]);

  // 当 markdown 或 docId 变化时，更新编辑器内容
  useEffect(() => {
    if (!editor) return;
    
    console.log(`[Editor] useEffect triggered - initialized: ${initialized}, docId: ${docId}, markdown:`, markdown?.substring(0, 50));
    
    // 如果文档未初始化，等待初始化完成
    if (!initialized) {
      // 清空编辑器内容，等待新文档加载
      const currentHtml = editor.getHTML();
      if (currentHtml !== "<p></p>") {
        console.log(`[Editor] Clearing editor content, waiting for init`);
        isUpdatingFromStore.current = true;
        editor.commands.setContent("<p></p>", { emitUpdate: false });
        // 重置标志
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isUpdatingFromStore.current = false;
          });
        });
      }
      return;
    }
    
    // 如果 docId 不匹配，不更新（可能是旧的状态）
    if (docId !== currentDocument?.docId) {
      console.log(`[Editor] DocId mismatch, skipping update - store docId: ${docId}, current doc: ${currentDocument?.docId}`);
      return;
    }
    
    const current = editor.getHTML();
    const normalizedCurrent = current === "<p></p>" ? "" : current;
    const normalizedMarkdown = markdown || "";
    
    console.log(`[Editor] Comparing - current: "${normalizedCurrent.substring(0, 50)}", markdown: "${normalizedMarkdown.substring(0, 50)}"`);
    
    // 如果内容相同，不更新（避免循环更新）
    if (normalizedCurrent === normalizedMarkdown) {
      console.log(`[Editor] Content is the same, skipping update`);
      return;
    }
    
    console.log(`[Editor] Updating editor content to:`, normalizedMarkdown.substring(0, 50));
    
    // 标记正在从 store 更新，避免触发 onUpdate
    isUpdatingFromStore.current = true;
    // 更新编辑器内容，但不触发 onUpdate 事件
    editor.commands.setContent(markdown || "<p></p>", { emitUpdate: false });
    
    // 立即在下一个事件循环中重置标志，确保用户输入不会被阻止
    // 使用 requestAnimationFrame 确保在浏览器渲染后重置
    requestAnimationFrame(() => {
      // 再延迟一帧，确保 onUpdate 事件（如果有）已经处理完
      requestAnimationFrame(() => {
        isUpdatingFromStore.current = false;
        console.log(`[Editor] isUpdatingFromStore reset to false`);
      });
    });
    
    // 验证更新是否成功
    setTimeout(() => {
      const afterUpdate = editor.getHTML();
      const normalizedAfter = afterUpdate === "<p></p>" ? "" : afterUpdate;
      console.log(`[Editor] After update, editor content is:`, normalizedAfter.substring(0, 50));
      if (normalizedAfter !== normalizedMarkdown) {
        console.warn(`[Editor] WARNING: Content update may have failed! Expected: "${normalizedMarkdown.substring(0, 50)}", Got: "${normalizedAfter.substring(0, 50)}"`);
      }
    }, 100);
  }, [markdown, editor, initialized, docId, currentDocument?.docId]);

  // 内容变更时，同步到文档引擎（带防抖）
  useEffect(() => {
    if (!initialized || !currentDocument) return;
    const run = async () => {
      const engine = currentDocument.engine;
      const id = blockId ?? (await ensureBlock(engine));
      if (!id || !docId) return;

      if (syncTimer.current) {
        window.clearTimeout(syncTimer.current);
      }

      syncTimer.current = window.setTimeout(async () => {
        await engine.updateBlockContent({
          docId,
          blockId: id,
          updatedBy: "u_1",
          payload: {
            schema: { type: "paragraph", ver: 1 },
            body: { richText: { format: "html", source: markdown } },
          },
        });
        await refresh(engine);
      }, 800);
    };

    void run();

    return () => {
      if (syncTimer.current) {
        window.clearTimeout(syncTimer.current);
      }
    };
  }, [markdown, blockId, docId, currentDocument, ensureBlock, refresh, initialized]);

  // 将 Tiptap 实例暴露给全局 store，供 Toolbar 使用
  useEffect(() => {
    if (!editor) return;
    setEditor(editor);
    return () => {
      setEditor(null);
    };
  }, [editor, setEditor]);

  // 初始化时或文档切换时，同步标题到本地状态
  useEffect(() => {
    // 只在文档切换时（docId 变化）同步标题
    if (currentDocument?.docId && !isEditingTitle.current) {
      // 如果文档切换了，或者标题还未初始化，才同步
      if (lastSyncedDocId.current !== currentDocument.docId || !title) {
        setTitle(currentDocument.title || "");
        lastSyncedDocId.current = currentDocument.docId;
      }
    }
  }, [currentDocument?.docId]); // 只在 docId 变化时触发

  // 处理标题更新（带防抖）
  const handleTitleChange = (newTitle: string) => {
    isEditingTitle.current = true;
    // 允许空字符串
    setTitle(newTitle);
    
    // 清除之前的定时器
    if (titleTimer.current) {
      window.clearTimeout(titleTimer.current);
    }
    
    // 设置新的定时器，800ms 后更新
    titleTimer.current = window.setTimeout(async () => {
      if (!currentDocument || !docId) {
        isEditingTitle.current = false;
        return;
      }
      
      // 保存原始标题，以便失败时恢复
      const originalTitle = currentDocument.title;
      // 允许空标题，直接保存用户输入的内容
      const finalTitle = newTitle.trim();
      
      try {
        // 更新 engine 中的文档标题（允许空标题）
        await currentDocument.engine.updateDocumentMeta(
          docId,
          "u_1",
          { title: finalTitle }
        );
        
        // 更新 context 中的文档标题
        updateDocumentTitle(docId, finalTitle);
        
        // 刷新文档状态
        await refresh(currentDocument.engine);
        
        // 更新完成后，允许从 store 同步
        isEditingTitle.current = false;
      } catch (error) {
        console.error("Failed to update document title:", error);
        // 如果更新失败，恢复原标题
        setTitle(originalTitle);
        isEditingTitle.current = false;
      }
    }, 800);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (titleTimer.current) {
        window.clearTimeout(titleTimer.current);
      }
    };
  }, []);

  // 根据编辑状态更新编辑器
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditing);
    }
  }, [editor, isEditing]);

  if (!editor) {
    return (
      <div className="tiptap-shell">
        <div className="tiptap-card">正在初始化编辑器…</div>
      </div>
    );
  }

  return (
    <div className="tiptap-shell">
      <div className="tiptap-card">
        <header className="tiptap-header">
          <div className="tiptap-header-main">
            <div className="tiptap-title-wrapper">
              {isEditing ? (
                <>
                  <Input
                    value={title}
                    onChange={(e) => {
                      // 直接更新，允许空字符串
                      const newValue = e.target.value;
                      handleTitleChange(newValue);
                    }}
                    onFocus={() => {
                      isEditingTitle.current = true;
                    }}
                    onBlur={() => {
                      // 延迟重置编辑标志，确保防抖定时器能正常执行
                      setTimeout(() => {
                        isEditingTitle.current = false;
                      }, 1000);
                    }}
                    className="tiptap-title-input"
                    placeholder=""
                    bordered={false}
                  />
                  {!title && (
                    <span className="tiptap-title-placeholder">未命名文档</span>
                  )}
                </>
              ) : (
                <div className="tiptap-title-display">
                  {title || currentDocument?.title || "未命名文档"}
                </div>
              )}
            </div>
            <p className="tiptap-subtitle">
              {/* 支持标题、列表、代码块、引用等常用结构，所见即所得书写体验。 */}
            </p>
          </div>
          <div className="tiptap-header-meta">
            <span className="tiptap-meta-pill">文档版本 {docVer}</span>
            <span className="tiptap-meta-dot">·</span>
            <span className="tiptap-meta-text">自动保存中</span>
          </div>
        </header>

        <div className="tiptap-editor-wrapper">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

