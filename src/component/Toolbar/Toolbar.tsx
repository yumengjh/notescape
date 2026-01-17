import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Dropdown, Tooltip, message, Input, Modal, Space, ColorPicker, Divider } from "antd";
import type { Editor } from "@tiptap/react";
import {
  UndoOutlined,
  RedoOutlined,
  ClearOutlined,
  EditOutlined,
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  CheckSquareOutlined,
  LinkOutlined,
  FileTextOutlined,
  CodeOutlined,
  DownOutlined,
  BgColorsOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useDocumentEngineStore } from "../../editor/useDocumentEngineStore";
import "./style.css";

type ToolbarItem = {
  id: string;
  label: string;
  content: ReactNode;
  type?: "dropdown" | "color-picker";
};

const titleLevelItems = [
  "正文",
  "标题 1",
  "标题 2",
  "标题 3",
  "标题 4",
  "标题 5",
  "标题 6",
].map((level, i) => ({
  key: `${i}`,
  label: level,
}));

const fontSizeItems = [
  "13px",
  "14px",
  "15px",
  "16px",
  "19px",
  "22px",
  "24px",
  "29px",
  "32px",
  "40px",
  "48px",
].map((size) => ({
  key: size,
  label: size,
}));

// 有序列表编号方式选项（静态数据，不依赖组件）
const orderedListTypeItems = [
  { key: "decimal", label: "1. 2. 3.", description: "数字" },
  { key: "lower-alpha", label: "a. b. c.", description: "小写字母" },
  { key: "upper-alpha", label: "A. B. C.", description: "大写字母" },
  { key: "lower-roman", label: "i. ii. iii.", description: "小写罗马数字" },
  { key: "upper-roman", label: "I. II. III.", description: "大写罗马数字" },
].map((item) => ({
  key: item.key,
  label: item.label,
  description: item.description,
}));

// 默认颜色和实色网格
const defaultColor = "#000000";
const solidColors = [
  // 灰色系列
  ["#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#CCCCCC", "#D9D9D9", "#EFEFEF", "#F3F3F3", "#FFFFFF"],
  // 红色系列
  ["#980000", "#FF0000", "#FF9900", "#FFFF00", "#00FF00", "#00FFFF", "#4A86E8", "#0000FF", "#9900FF", "#FF00FF"],
  // 橙色系列
  ["#E6B8AF", "#F4CCCC", "#FCE5CD", "#FFF2CC", "#D9EAD3", "#D0E0E3", "#C9DAF8", "#CFE2F3", "#D9D2E9", "#EAD1DC"],
  // 黄色系列
  ["#DD7E6B", "#EA9999", "#F9CB9C", "#FFE599", "#B6D7A8", "#A2C4C9", "#A4C2F4", "#9FC5E8", "#B4A7D6", "#D5A6BD"],
  // 绿色系列
  ["#CC4125", "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#76A5AF", "#6D9EEB", "#6FA8DC", "#8E7CC3", "#C27BA0"],
  // 蓝色系列
  ["#A61C00", "#CC0000", "#E69138", "#F1C232", "#6AA84F", "#45818E", "#3C78D8", "#3D85C6", "#674EA7", "#A64D79"],
];

// 渐变色
const gradientColors = [
  { id: "gradient-1", colors: ["#4A86E8", "#9900FF"] },
  { id: "gradient-2", colors: ["#9900FF", "#FF00FF"] },
  { id: "gradient-3", colors: ["#FF9900", "#FF00FF"] },
  { id: "gradient-4", colors: ["#FF9900", "#FFFF00"] },
];

export default function Toolbar() {
  const { editor } = useDocumentEngineStore();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [selectedBgColor, setSelectedBgColor] = useState("#FFFF00");
  const tiptap = editor as Editor | null;
  const editorReady = Boolean(tiptap);
  const [, forceUpdate] = useState(0);
  const colorSelectTimeoutRef = useRef<number | null>(null);
  const bgColorSelectTimeoutRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState<Record<string, boolean>>({});

  // 订阅编辑器事务与选区变化，保证激活态可以立即刷新
  useEffect(() => {
    if (!tiptap) return;

    const rerender = () => {
      forceUpdate((v) => v + 1);
    };

    tiptap.on("transaction", rerender);
    tiptap.on("selectionUpdate", rerender);

    return () => {
      tiptap.off("transaction", rerender);
      tiptap.off("selectionUpdate", rerender);
    };
  }, [tiptap]);

  const openLinkModal = () => {
    if (!tiptap) return;
    const { from, to } = tiptap.state.selection;
    const selectedText = tiptap.state.doc.textBetween(from, to);
    const existingLink = tiptap.getAttributes("link");
    
    setLinkValue(existingLink.href || selectedText || "");
    setLinkModalOpen(true);
  };

  const applyLink = () => {
    if (!tiptap) return;
    const url = linkValue.trim();
    
    if (url) {
      // 如果 URL 不包含协议，自动添加 https://
      const href = url.match(/^https?:\/\//) ? url : `https://${url}`;
      tiptap.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      // 如果 URL 为空，移除链接
      tiptap.chain().focus().unsetLink().run();
    }
    
    setLinkModalOpen(false);
    setLinkValue("");
  };

  const handleClick = (id: string) => () => {
    if (!tiptap) return;
    switch (id) {
      case "undo":
        tiptap.chain().focus().undo().run();
        break;
      case "redo":
        tiptap.chain().focus().redo().run();
        break;
      case "clearFormat":
        tiptap.chain().focus().unsetAllMarks().clearNodes().run();
        break;
      case "cursor":
        tiptap.chain().focus().run();
        break;
      case "bold":
        tiptap.chain().focus().toggleBold().run();
        break;
      case "italic":
        tiptap.chain().focus().toggleItalic().run();
        break;
      case "strike":
        tiptap.chain().focus().toggleStrike().run();
        break;
      case "underline":
        tiptap.chain().focus().toggleUnderline().run();
        break;
      // 对齐方式已改为下拉菜单，不再使用 handleClick
      case "bullet-list":
        tiptap.chain().focus().toggleBulletList().run();
        break;
      // 有序列表已改为下拉菜单，不再使用 handleClick
      case "check-list":
        tiptap.chain().focus().toggleTaskList().run();
        break;
      case "blockquote":
        tiptap.chain().focus().toggleBlockquote().run();
        break;
      case "code-block":
        tiptap.chain().focus().toggleCodeBlock().run();
        break;
      case "link":
        openLinkModal();
        break;
      default:
        break;
    }
  };

  // 获取当前标题级别对应的 key
  const getCurrentHeadingKey = (): string => {
    if (!tiptap) return "0";
    for (let i = 1; i <= 6; i++) {
      if (tiptap.isActive("heading", { level: i as 1 | 2 | 3 | 4 | 5 | 6 })) {
        return `${i}`;
      }
    }
    return "0"; // 正文
  };

  const dropdownHandlers: Record<string, (key: string) => void> = {
    "text-mode": (key: string) => {
      if (!tiptap) return;
      const level = Number(key);
      if (level === 0) {
        tiptap.chain().focus().setParagraph().run();
      } else if (level >= 1 && level <= 6) {
        tiptap
          .chain()
          .focus()
          .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
          .run();
      }
    },
    "font-size": (key: string) => {
      if (!tiptap) return;
      // 字号调整
      const size = key.replace("px", "");
      tiptap.chain().focus().setFontSize(size).run();
    },
    "text-align": (key: string) => {
      if (!tiptap) return;
      tiptap.chain().focus().setTextAlign(key as "left" | "center" | "right" | "justify").run();
    },
    "ordered-list": (key: string) => {
      if (!tiptap) return;
      // 先切换为有序列表
      if (!tiptap.isActive("orderedList")) {
        tiptap.chain().focus().toggleOrderedList().run();
      }
      // 设置编号方式（通过 CSS 类名实现）
      const listItems = document.querySelectorAll(".tiptap-editor ol li");
      listItems.forEach((item) => {
        (item as HTMLElement).style.listStyleType = key;
      });
    },
  };

  const handleDropdownClick = (id: string) => {
    if (!tiptap) return;
    return ({ key }: { key: string }) => {
      const handler = dropdownHandlers[id];
      if (handler) handler(key);
    };
  };

  // 处理颜色选择（带防抖）
  const handleColorSelect = useCallback((color: string) => {
    if (!tiptap) return;
    
    // 立即更新 UI，让用户看到颜色变化
    setSelectedColor(color);
    
    // 清除之前的定时器
    if (colorSelectTimeoutRef.current) {
      clearTimeout(colorSelectTimeoutRef.current);
    }
    
    // 设置新的防抖定时器（300ms）
    colorSelectTimeoutRef.current = window.setTimeout(() => {
      tiptap.chain().focus().setColor(color).run();
    }, 300);
  }, [tiptap]);
  
  // 处理背景颜色选择（带防抖）
  const handleBgColorSelect = useCallback((color: string) => {
    if (!tiptap) return;
    
    // 立即更新 UI，让用户看到颜色变化
    setSelectedBgColor(color);
    
    // 清除之前的定时器
    if (bgColorSelectTimeoutRef.current) {
      clearTimeout(bgColorSelectTimeoutRef.current);
    }
    
    // 设置新的防抖定时器（300ms）
    bgColorSelectTimeoutRef.current = window.setTimeout(() => {
      // 使用 highlight 扩展来设置背景颜色
      tiptap.chain().focus().toggleHighlight({ color }).run();
    }, 300);
  }, [tiptap]);
  
  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (colorSelectTimeoutRef.current !== null) {
        window.clearTimeout(colorSelectTimeoutRef.current);
      }
      if (bgColorSelectTimeoutRef.current !== null) {
        window.clearTimeout(bgColorSelectTimeoutRef.current);
      }
    };
  }, []);

  // 处理渐变色选择
  const handleGradientSelect = (gradientId: string) => {
    message.info(`渐变色选择功能暂未实现。选择的渐变: ${gradientId}`);
  };


  const isActive = (id: string): boolean => {
    if (!tiptap) return false;
    switch (id) {
      case "bold":
        return tiptap.isActive("bold");
      case "italic":
        return tiptap.isActive("italic");
      case "strike":
        return tiptap.isActive("strike");
      case "underline":
        return tiptap.isActive("underline");
      case "bullet-list":
        return tiptap.isActive("bulletList");
      case "check-list":
        return tiptap.isActive("taskList");
      case "ordered-list":
        return tiptap.isActive("orderedList");
      case "blockquote":
        return tiptap.isActive("blockquote");
      case "code-block":
        return tiptap.isActive("codeBlock");
      default:
        return false;
    }
  };

  // 获取当前标题级别
  const getCurrentHeadingLevel = (): string => {
    if (!tiptap) return "正文";
    for (let i = 1; i <= 6; i++) {
      if (tiptap.isActive("heading", { level: i as 1 | 2 | 3 | 4 | 5 | 6 })) {
        return `标题 ${i}`;
      }
    }
    return "正文";
  };

  // 获取当前字号
  const getCurrentFontSize = (): string => {
    if (!tiptap) return "15px";
    const textStyle = tiptap.getAttributes("textStyle");
    const fontSize = textStyle?.fontSize;
    if (fontSize) {
      return `${fontSize}px`;
    }
    return "15px"; // 默认字号
  };

  // 对齐方式选项（在组件内部定义，以便使用图标组件）
  const alignItems = [
    { key: "left", label: "左对齐", icon: <AlignLeftOutlined /> },
    { key: "center", label: "居中", icon: <AlignCenterOutlined /> },
    { key: "right", label: "右对齐", icon: <AlignRightOutlined /> },
    { key: "justify", label: "两端对齐", icon: <AlignLeftOutlined style={{ transform: "scaleX(-1)" }} /> },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
  }));

  // 获取当前对齐方式
  const getCurrentAlignment = (): { label: string; icon: ReactNode; key: string } => {
    if (!tiptap) {
      return { label: "左对齐", icon: <AlignLeftOutlined />, key: "left" };
    }
    const align = tiptap.getAttributes("textAlign")?.textAlign || "left";
    const alignMap: Record<string, { label: string; icon: ReactNode }> = {
      left: { label: "左对齐", icon: <AlignLeftOutlined /> },
      center: { label: "居中", icon: <AlignCenterOutlined /> },
      right: { label: "右对齐", icon: <AlignRightOutlined /> },
      justify: { label: "两端对齐", icon: <AlignLeftOutlined style={{ transform: "scaleX(-1)" }} /> },
    };
    return { ...alignMap[align] || alignMap.left, key: align };
  };

  // 获取当前有序列表编号方式
  const getCurrentOrderedListType = (): string => {
    if (!tiptap || !tiptap.isActive("orderedList")) {
      return "decimal";
    }
    // 注意：Tiptap 的 orderedList 扩展默认使用 decimal
    // 可以通过 CSS 或扩展配置来改变编号方式
    return "decimal";
  };

  // 动态生成 toolbarGroups，以便显示当前标题级别
  const toolbarGroups: ToolbarItem[][] = [
    [
      { id: "undo", label: "撤销", content: <UndoOutlined /> },
      { id: "redo", label: "重做", content: <RedoOutlined /> },
      { id: "clearFormat", label: "清除格式", content: <ClearOutlined /> },
    ],
    [{ id: "cursor", label: "光标", content: <EditOutlined /> }],
    [
      {
        id: "text-mode",
        label: "标题",
        content: <span className="text-label heading-text">{getCurrentHeadingLevel()}</span>,
        type: "dropdown",
      },
      {
        id: "font-size",
        label: "字号",
        content: <span className="text-label">{getCurrentFontSize()}</span>,
        type: "dropdown",
      },
    ],
    [
      { id: "bold", label: "加粗", content: <BoldOutlined /> },
      { id: "italic", label: "斜体", content: <ItalicOutlined /> },
      { id: "strike", label: "删除线", content: <StrikethroughOutlined /> },
      { id: "underline", label: "下划线", content: <UnderlineOutlined /> },
    ],
    [
      {
        id: "text-color",
        label: "文字颜色",
        content: (
          <span className="dropdown-icon-text">
            <EditOutlined />
            <span 
              className="text-color-icon" 
              style={{ color: selectedColor }}
            >
              A
            </span>
          </span>
        ),
        type: "color-picker",
      },
      {
        id: "bg-color",
        label: "背景颜色",
        content: (
          <span className="dropdown-icon-text">
            <BgColorsOutlined />
            <span 
              className="bg-color-icon" 
              style={{ color: selectedBgColor }}
            >
              A
            </span>
          </span>
        ),
        type: "color-picker",
      },
    ],
    [
      {
        id: "text-align",
        label: "对齐",
        content: (
          <span className="dropdown-icon-text">
            {getCurrentAlignment().icon}
            <span className="text-label">{getCurrentAlignment().label}</span>
          </span>
        ),
        type: "dropdown",
      },
    ],
    [
      { id: "bullet-list", label: "无序列表", content: <UnorderedListOutlined /> },
      {
        id: "ordered-list",
        label: "有序列表",
        content: (
          <span className="dropdown-icon-text">
            <OrderedListOutlined />
            <span className="text-label">
              {orderedListTypeItems.find(
                (item) => item.key === getCurrentOrderedListType()
              )?.description || "数字"}
            </span>
          </span>
        ),
        type: "dropdown",
      },
      { id: "check-list", label: "待办列表", content: <CheckSquareOutlined /> },
    ],
    [
      { id: "blockquote", label: "引用", content: <FileTextOutlined /> },
      { id: "code-block", label: "代码块", content: <CodeOutlined /> },
      { id: "link", label: "链接", content: <LinkOutlined /> },
    ],
  ];

  return (
    <div className="toolbar">
      {toolbarGroups.map((group, index) => (
        <div className="toolbar-group" key={`toolbar-group-${index}`}>
          {group.map((item) =>
            item.type === "dropdown" ? (
              <Tooltip
                key={item.id}
                placement="bottom"
                title={item.label}
                trigger="hover"
                mouseEnterDelay={0.5}
                open={tooltipOpen[item.id]}
                onOpenChange={(open) => {
                  setTooltipOpen((prev) => ({ ...prev, [item.id]: open }));
                }}
              >
                <Dropdown
                  menu={{
                    items:
                      item.id === "text-mode"
                        ? titleLevelItems.map((item) => ({
                            ...item,
                            ...(item.key === getCurrentHeadingKey() ? { icon: <span style={{ color: "#1890ff" }}>✓</span> } : {}),
                          }))
                        : item.id === "text-align"
                        ? alignItems.map((alignItem) => {
                            const currentAlign = getCurrentAlignment();
                            return {
                            key: alignItem.key,
                            label: (
                              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {alignItem.icon}
                                <span>{alignItem.label}</span>
                                {alignItem.key === currentAlign.key && <span style={{ color: "#1890ff", marginLeft: "auto" }}>✓</span>}
                              </span>
                            ),
                          };
                          })
                        : item.id === "ordered-list"
                        ? orderedListTypeItems.map((listItem) => ({
                            ...listItem,
                            label: `${listItem.label} ${listItem.description}`,
                            ...(listItem.key === getCurrentOrderedListType() ? { icon: <span style={{ color: "#1890ff" }}>✓</span> } : {}),
                          }))
                        : item.id === "font-size"
                        ? fontSizeItems.map((sizeItem) => ({
                            ...sizeItem,
                            ...(sizeItem.key === getCurrentFontSize() ? { icon: <span style={{ color: "#1890ff" }}>✓</span> } : {}),
                          }))
                        : fontSizeItems,
                    onClick: ({ key }: { key: string }) => {
                      // 点击菜单项时立即隐藏 Tooltip
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                      const handler = dropdownHandlers[item.id];
                      if (handler) handler(key);
                    },
                  }}
                  trigger={["click"]}
                  disabled={!editorReady}
                  onOpenChange={(open) => {
                    // 下拉菜单打开时立即隐藏 Tooltip
                    if (open) {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }
                  }}
                >
                  <button
                    type="button"
                    className="dropdown-trigger-button"
                    disabled={!editorReady}
                    aria-label={item.label}
                    onClick={() => {
                      // 点击按钮时立即隐藏 Tooltip
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }}
                  >
                    <span className="dropdown-text">{item.content}</span>
                    <span className="dropdown-caret">
                      <DownOutlined style={{ fontSize: "12px", color: "#666666" }} />
                    </span>
                  </button>
                </Dropdown>
              </Tooltip>
            ) : item.type === "color-picker" ? (
              <Tooltip
                key={item.id}
                placement="bottom"
                title={item.label}
                trigger="hover"
                mouseEnterDelay={0.5}
                open={tooltipOpen[item.id]}
                onOpenChange={(open) => {
                  setTooltipOpen((prev) => ({ ...prev, [item.id]: open }));
                }}
              >
                <Dropdown
                  placement="bottomLeft"
                  align={{ offset: [0, 4] }}
                  onOpenChange={(open) => {
                    // 下拉菜单打开时立即隐藏 Tooltip
                    if (open) {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }
                  }}
                  dropdownRender={() => {
                  const isBgColor = item.id === "bg-color";
                  const currentColor = isBgColor ? selectedBgColor : selectedColor;
                  const handleSelect = isBgColor ? handleBgColorSelect : handleColorSelect;
                  
                  return (
                    <div className="color-picker-dropdown">
                      {/* 默认颜色 - 包含所有实色网格 */}
                      <div className="color-picker-section">
                        <div className="color-picker-header">
                          <span>默认</span>
                        </div>
                        <div className="color-grid">
                          {solidColors.map((row, rowIndex) => (
                            <div key={rowIndex} className="color-grid-row">
                              {row.map((color) => (
                                <div
                                  key={color}
                                  className={`color-swatch ${currentColor === color ? "selected" : ""}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => handleSelect(color)}
                                  title={color}
                                >
                                  {currentColor === color && (
                                    <span className="color-checkmark">✓</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 渐变色 */}
                      <div className="color-picker-section">
                        <div className="color-picker-header">
                          <span>渐变色</span>
                        </div>
                        <div className="gradient-grid">
                          {gradientColors.map((gradient) => (
                            <div
                              key={gradient.id}
                              className="gradient-swatch"
                              style={{
                                background: `linear-gradient(to right, ${gradient.colors[0]}, ${gradient.colors[1]})`,
                              }}
                              onClick={() => handleGradientSelect(gradient.id)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* 最近使用的自定义颜色 */}
                      <div className="color-picker-section">
                        <div className="color-picker-header">
                          <span>最近使用自定义颜色</span>
                        </div>
                        <div className="color-picker-empty">暂无</div>
                      </div>

                      <Divider style={{ margin: "6px 0" }} />

                      {/* 更多颜色 - 直接显示拾色器 */}
                      <div className="color-picker-section">
                        <div className="color-picker-header-advanced">
                          <div className="color-picker-header">
                            <BgColorsOutlined style={{ fontSize: "12px" }} />
                            <span>更多颜色</span>
                          </div>
                          <div className="color-picker-advanced">
                            <ColorPicker
                              value={currentColor}
                              onChange={(color) => {
                                const hexColor = color.toHexString();
                                // 立即更新 UI
                                if (isBgColor) {
                                  setSelectedBgColor(hexColor);
                                } else {
                                  setSelectedColor(hexColor);
                                }
                                // 防抖执行实际的颜色应用
                                handleSelect(hexColor);
                              }}
                              showText
                              size="small"
                              getPopupContainer={(triggerNode) => {
                                // 找到颜色选择器下拉菜单的容器，确保弹窗在 Dropdown 内部
                                const dropdown = triggerNode.closest('.ant-dropdown') as HTMLElement;
                                return dropdown || document.body;
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
                  trigger={["click"]}
                  disabled={!editorReady}
                >
                  <button
                    type="button"
                    className="dropdown-trigger-button"
                    disabled={!editorReady}
                    aria-label={item.label}
                    onClick={() => {
                      // 点击按钮时立即隐藏 Tooltip
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }}
                  >
                    <span className="dropdown-text">{item.content}</span>
                    <span className="dropdown-caret">
                      <DownOutlined style={{ fontSize: "12px", color: "#666666" }} />
                    </span>
                  </button>
                </Dropdown>
              </Tooltip>
            ) : (
              <button
                key={item.id}
                type="button"
                className={`toolbar-button ${
                  isActive(item.id) ? "active" : ""
                }`}
                disabled={!editorReady}
                aria-label={item.label}
                onClick={handleClick(item.id)}
              >
                <Tooltip placement="bottom" title={item.label}>
                  <span className="toolbar-content">{item.content}</span>
                </Tooltip>
              </button>
            )
          )}
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
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://example.com"
            allowClear
          />
        </Space>
      </Modal>

    </div>
  );
}
