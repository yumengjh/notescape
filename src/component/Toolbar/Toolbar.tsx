import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Dropdown, Tooltip, message, Input, Modal, Space } from "antd";
import Quill from "quill";
import { useDocumentEngineStore } from "../../editor/useDocumentEngineStore";
import "./style.css";

type ToolbarItem = {
  id: string;
  label: string;
  content: ReactNode;
  type?: "dropdown";
};

const titleLevelItems = ["正文", "标题 1", "标题 2", "标题 3", "标题 4", "标题 5", "标题 6"].map((level, i) => ({
  key: `${i}`,
  label: level,
}));

const fontSizeItems = ["13px", "14px", "15px", "16px", "19px", "22px", "24px", "29px", "32px", "40px", "48px"].map((size) => ({
  key: size,
  label: size,
}));

const toolbarGroups: ToolbarItem[][] = [
  [
    { id: "undo", label: "撤销", content: <UndoIcon /> },
    { id: "redo", label: "重做", content: <RedoIcon /> },
    { id: "clearFormat", label: "清除格式", content: <ClearFormatIcon /> },
  ],
  [{ id: "cursor", label: "光标", content: <CursorIcon /> }],
  [
    {
      id: "text-mode",
      label: "标题",
      content: <span className="text-label">正文</span>,
      type: "dropdown",
    },
    {
      id: "font-size",
      label: "字号 15px",
      content: <span className="text-label">15px</span>,
      type: "dropdown",
    },
  ],
  [
    { id: "bold", label: "加粗", content: <BoldIcon /> },
    { id: "italic", label: "斜体", content: <ItalicIcon /> },
    { id: "strike", label: "删除线", content: <StrikeIcon /> },
    { id: "underline", label: "下划线", content: <UnderlineIcon /> },
  ],
  [
    { id: "align-left", label: "左对齐", content: <AlignLeftIcon /> },
    { id: "align-center", label: "居中", content: <AlignCenterIcon /> },
    { id: "align-justify", label: "两端对齐", content: <AlignJustifyIcon /> },
  ],
  [
    { id: "bullet-list", label: "无序列表", content: <BulletListIcon /> },
    { id: "ordered-list", label: "有序列表", content: <NumberListIcon /> },
    { id: "check-list", label: "待办列表", content: <CheckListIcon /> },
  ],
  [
    { id: "blockquote", label: "引用", content: <QuoteIcon /> },
    { id: "code-block", label: "代码块", content: <CodeIcon /> },
    { id: "link", label: "链接", content: <LinkIcon /> },
  ],
];

export default function Toolbar() {
  const { editor } = useDocumentEngineStore();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const editorReady = Boolean(editor);

  const ensureSelection = useMemo(() => {
    return () => {
      if (!editor) return null;
      const range = editor.getSelection(true);
      if (!range) {
        const len = editor.getLength();
        editor.setSelection(len, 0);
        return { index: len, length: 0 };
      }
      return range;
    };
  }, [editor]);

  const toggleInline = (format: string) => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    const current = editor.getFormat(range);
    const next = !current[format];
    editor.format(format, next, Quill.sources.USER);
  };

  const setHeader = (level: number | false) => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    editor.format("header", level || false, Quill.sources.USER);
  };

  const setSize = (size: string) => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    editor.format("size", size, Quill.sources.USER);
  };

  const toggleList = (type: "ordered" | "bullet" | "checked") => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    const current = editor.getFormat(range);
    const value = type === "checked" ? "checked" : type;
    const next = current.list === value ? false : value;
    editor.format("list", next, Quill.sources.USER);
  };

  const toggleBlock = (format: "blockquote" | "code-block") => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    const current = editor.getFormat(range);
    const next = !current[format];
    editor.format(format, next, Quill.sources.USER);
  };

  const applyAlign = (value: "" | "center" | "justify") => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    const current = editor.getFormat(range);
    const next = current.align === value ? false : value;
    editor.format("align", next, Quill.sources.USER);
  };

  const clearFormat = () => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    editor.removeFormat(range.index, range.length || 0, Quill.sources.USER);
  };

  const openLinkModal = () => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    const current = editor.getFormat(range);
    setLinkValue(current.link ?? "");
    setLinkModalOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    const range = ensureSelection();
    if (!range) return;
    if (!linkValue) {
      editor.format("link", false, Quill.sources.USER);
      setLinkModalOpen(false);
      return;
    }
    editor.format("link", linkValue, Quill.sources.USER);
    setLinkModalOpen(false);
    message.success("链接已应用");
  };

  const handleClick = (id: string) => () => {
    if (!editor) return;
    switch (id) {
      case "undo":
        editor.history.undo();
        break;
      case "redo":
        editor.history.redo();
        break;
      case "clearFormat":
        clearFormat();
        break;
      case "cursor":
        editor.focus();
        break;
      case "bold":
      case "italic":
      case "strike":
      case "underline":
        toggleInline(id);
        break;
      case "align-left":
        applyAlign("");
        break;
      case "align-center":
        applyAlign("center");
        break;
      case "align-justify":
        applyAlign("justify");
        break;
      case "bullet-list":
        toggleList("bullet");
        break;
      case "ordered-list":
        toggleList("ordered");
        break;
      case "check-list":
        toggleList("checked");
        break;
      case "blockquote":
        toggleBlock("blockquote");
        break;
      case "code-block":
        toggleBlock("code-block");
        break;
      case "link":
        openLinkModal();
        break;
      default:
        break;
    }
  };

  const dropdownHandlers: Record<string, (key: string) => void> = {
    "text-mode": (key: string) => setHeader(Number(key)),
    "font-size": (key: string) => setSize(key),
  };

  const handleDropdownClick = (id: string) => {
    if (!editor) return;
    return ({ key }: { key: string }) => {
      const handler = dropdownHandlers[id];
      if (handler) handler(key);
    };
  };

  return (
    <div className="toolbar">
      {toolbarGroups.map((group, index) => (
        <div className="toolbar-group" key={`toolbar-group-${index}`}>
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`toolbar-button ${item.type === "dropdown" ? "dropdown-button" : ""}`}
              disabled={!editorReady}
              aria-label={item.label}
              onClick={item.type === "dropdown" ? undefined : handleClick(item.id)}
            >
              <Tooltip placement="bottom" title={item.label}>
                {item.type === "dropdown" ? (
                  <Dropdown
                    menu={{
                      items: item.id === "text-mode" ? titleLevelItems : fontSizeItems,
                      onClick: handleDropdownClick(item.id),
                    }}
                    trigger={["click"]}
                    disabled={!editorReady}
                  >
                    <span className="toolbar-content">{item.content}</span>
                  </Dropdown>
                ) : (
                  <span className="toolbar-content">{item.content}</span>
                )}
              </Tooltip>
              {item.type === "dropdown" ? <span className="caret">v</span> : null}
            </button>
          ))}
        </div>
      ))}

      <Modal
        title="插入链接"
        open={linkModalOpen}
        onOk={applyLink}
        onCancel={() => setLinkModalOpen(false)}
        okText="应用"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder="https://example.com" allowClear />
        </Space>
      </Modal>
    </div>
  );
}

type IconProps = {
  className?: string;
};

function UndoIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="6952"
      width="16"
      height="16"
    >
      <path
        d="M289.6384 256H614.4a307.2 307.2 0 1 1 0 614.4H204.8a51.2 51.2 0 0 1 0-102.4h409.6a204.8 204.8 0 1 0 0-409.6H286.0032l59.2384 59.2384A51.2 51.2 0 1 1 272.7936 489.984L128 345.2416a51.2 51.2 0 0 1 0-72.448L272.7936 128a51.2 51.2 0 0 1 72.448 72.3968L289.6384 256z"
        fill="#2c2c2c"
        p-id="6953"
      ></path>
    </svg>
  );
}

function RedoIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      style={{ transform: "scaleX(-1)" }}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="6952"
      width="16"
      height="16"
    >
      <path
        d="M289.6384 256H614.4a307.2 307.2 0 1 1 0 614.4H204.8a51.2 51.2 0 0 1 0-102.4h409.6a204.8 204.8 0 1 0 0-409.6H286.0032l59.2384 59.2384A51.2 51.2 0 1 1 272.7936 489.984L128 345.2416a51.2 51.2 0 0 1 0-72.448L272.7936 128a51.2 51.2 0 0 1 72.448 72.3968L289.6384 256z"
        fill="#2c2c2c"
        p-id="6953"
      ></path>
    </svg>
  );
}

function ClearFormatIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="11182"
      width="16"
      height="16"
    >
      <path
        d="M604.536 736.222L893.331 453.53 605.553 182.53 334.554 465.732z m-72.707 71.182L264.39 539.456 145.923 660.973l164.734 164.735a50.844 50.844 0 0 0 36.1 14.745h107.79a101.688 101.688 0 0 0 71.18-28.981z m109.315 35.083h254.22a50.844 50.844 0 0 1 0 101.688H346.248a152.532 152.532 0 0 1-107.79-44.743L73.725 734.697a101.688 101.688 0 0 1 0-142.363L531.32 111.857a101.688 101.688 0 0 1 143.38-3.56l287.27 271a101.688 101.688 0 0 1 4.067 143.889l-3.05 3.05z"
        fill="#2c2c2c"
        p-id="11183"
      ></path>
    </svg>
  );
}

function CursorIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 4 6 16 2.2-5.8L20 14z" />
    </svg>
  );
}

function BoldIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      style={{ transform: "scale(0.8)" }}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="14276"
      width="13"
      height="13"
    >
      <path
        d="M597.32864 554.666667H255.995307V426.666667h341.333333v-1.536a149.333333 149.333333 0 0 0 0-295.594667V128H255.995307v768h341.333333a170.666667 170.666667 0 1 0 0-341.333333z m42.666667 469.333333H85.32864V0h512v0.853333a277.333333 277.333333 0 0 1 211.626667 478.208A298.666667 298.666667 0 0 1 639.995307 1024z"
        fill="#2c2c2c"
        p-id="14277"
      ></path>
    </svg>
  );
}

function ItalicIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      style={{ transform: "scale(0.9)" }}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="12683"
      width="16"
      height="16"
    >
      <path
        d="M329.649231 72.625231h510.739692L820.066462 177.230769H626.845538l-137.216 709.553231H682.929231l-20.322462 104.605538H151.788308l20.322461-104.605538H364.701538L502.547692 177.230769H309.326769z"
        fill="#333333"
        p-id="12684"
      ></path>
    </svg>
  );
}

function StrikeIcon({ className }: IconProps) {
  return (
    <svg
      className={`toolbar-icon ${className ?? ""}`}
      style={{ transform: "scale(1)" }}
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="15317"
      width="16"
      height="16"
    >
      <path
        d="M1024 511.81H687.11c-38.48-16.41-94.03-35.49-167.45-57.37-77.09-22.34-126.25-39.09-146.36-50.27-45.8-24.57-68.14-56.98-68.14-97.18 0-45.82 18.98-79.32 56.98-101.66 33.5-20.11 79.32-29.07 138.52-29.07 64.8 0 115.07 13.41 150.82 42.45 34.64 27.93 56.98 70.39 67.05 128.48H809c-7.82-83.77-37.98-147.45-91.61-189.91C666 115.94 594.5 95.83 505.14 95.83c-82.68 0-150.82 17.89-203.34 53.64-59.2 37.98-88.25 92.73-88.25 161.98 0 67.05 30.16 118.43 91.61 154.18 19.87 10.38 61.41 26.15 123.58 46.19H0v93.09h681.64c35.63 26.24 54.75 59.59 54.75 100.93 0 42.43-20.11 75.95-60.32 100.55-40.23 24.57-93.84 36.86-158.66 36.86-71.5 0-125.11-15.64-161.98-44.68-40.23-32.41-64.8-83.8-72.61-153.07h-90.5c6.7 98.32 41.34 170.93 103.91 218.98 53.61 40.2 127.34 60.32 221.18 60.32 94.98 0 169.82-20.11 225.68-59.2 55.86-40.23 83.8-96.09 83.8-165.34 0-35.82-8.24-67.53-24.42-95.34H1024v-93.11z"
        p-id="15318"
        fill="#2c2c2c"
      ></path>
    </svg>
  );
}

function UnderlineIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="17254" width="16" height="16">
      <path
        d="M156.09136 918.752731a50.844091 50.844091 0 0 1 0-101.688183h711.81728a50.844091 50.844091 0 0 1 0 101.688183z m50.844092-762.661371a50.844091 50.844091 0 0 1 101.688183 0v305.064549a203.376365 203.376365 0 1 0 406.75273 0v-305.064549a50.844091 50.844091 0 1 1 101.688183 0v305.064549a305.064548 305.064548 0 1 1-610.129096 0z"
        fill="#2c2c2c"
        p-id="17255"
      ></path>
    </svg>
  );
}

function AlignLeftIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </svg>
  );
}

function AlignCenterIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </svg>
  );
}

function AlignJustifyIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function BulletListIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="7" r="1.4" fill="currentColor" />
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="6" cy="17" r="1.4" fill="currentColor" />
      <path d="M10 7h10M10 12h10M10 17h10" />
    </svg>
  );
}

function NumberListIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h1.8M5 12h1.8M5 17h1.8" />
      <path d="M10 7h10M10 12h10M10 17h10" />
    </svg>
  );
}

function CheckListIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5 6 9l3-3" />
      <path d="M4 12.5 6 15l3-3" />
      <path d="M4 18.5 6 21l3-3" />
      <path d="M12 7h8M12 12h8M12 17h8" />
    </svg>
  );
}

function LinkIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 15 7 17a4 4 0 1 1 0-6l2-2" />
      <path d="M15 9 17 7a4 4 0 1 1 0 6l-2 2" />
      <path d="M10.5 13.5 13.5 10.5" />
    </svg>
  );
}

function QuoteIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 9.5C7 8 8 7 9.5 7S12 8 12 9.5 11 12 9.5 12H8l-1 4" />
      <path d="M14 9.5C14 8 15 7 16.5 7S19 8 19 9.5 18 12 16.5 12H15l-1 4" />
    </svg>
  );
}

function CodeIcon({ className }: IconProps) {
  return (
    <svg className={`toolbar-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18 3 12l6-6" />
      <path d="M15 6 21 12l-6 6" />
    </svg>
  );
}
