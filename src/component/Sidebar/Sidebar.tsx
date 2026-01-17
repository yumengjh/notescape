// App.tsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./style.css";
import { useDocumentContext } from "../../context/documentContext";

import { 
  Tooltip, 
  Input, 
  Button, 
  Tree, 
  Dropdown,
  type MenuProps,
  type TreeDataNode 
} from "antd";
import {
  HomeOutlined,
  ToolOutlined,
  HistoryOutlined,
  PlusOutlined,
  MoreOutlined,
  GlobalOutlined,
  SearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  EditOutlined,
  CopyOutlined,
  LinkOutlined,
  FolderOpenFilled,
  AppstoreOutlined,
  ExportOutlined,
  ScissorOutlined,
  DeleteOutlined,
  BookOutlined,
  RightOutlined,
  DownOutlined,
  TableOutlined,
  PictureOutlined,
  BarChartOutlined,
  FileAddOutlined,
  ImportOutlined,
} from "@ant-design/icons";

const { Search } = Input;

type SidebarItem = {
  key: string;
  label: string;
  path: string;
};

type SidebarProps = {
  items?: SidebarItem[];
  children?: ReactNode;
};

export default function Sidebar({ items = [], children }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { documents, currentDocId, switchDocument, addDocument } = useDocumentContext();
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(350); // 当前宽度（用于 inline style）
  const [isResizing, setIsResizing] = useState(false); // 鼠标是否在拖拽
  const [isCollapsed, setIsCollapsed] = useState(false); // 视觉上的"折叠"（宽度为 0）
  const defaultWidth = 350;
  const MIN = 250;
  const MAX = 350;
  const HIDE_THRESHOLD = 0;
  const [selectedDocKey, setSelectedDocKey] = useState<React.Key | null>(currentDocId || null);
  const [searchValue, setSearchValue] = useState<string>("");

  // 工作区更多操作菜单
  const workspaceMenuItems: MenuProps["items"] = [
    { key: "1", label: "工作区设置" },
    { key: "2", label: "成员管理" },
    { type: "divider" },
    { key: "3", label: "导出数据" },
  ];

  // 将当前侧边栏宽度同步到全局 CSS 变量，供 Header / Toolbar 等使用
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${width + 20}px`
    );
  }, [width]);

  // ----- 开始拖拽 -----
  const startResizing = () => {
    // 只有在非折叠下才允许拖拽
    if (isCollapsed) return;
    setIsResizing(true);
    // 禁用 transition，保证拖拽实时无延迟
    if (sidebarRef.current) {
      sidebarRef.current.style.transition = "none";
    }
  };

  // ----- 拖拽中（全局监听） -----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing) return;
      let newW = e.clientX;
      if (newW < HIDE_THRESHOLD) {
        // 当拖到阈值以下，触发折叠动画（不要马上卸载）
        // 先设置宽度为 0，然后在 transitionend 里做后续处理
        if (sidebarRef.current) {
          // 恢复 transition 设置为折叠动画
          sidebarRef.current.style.transition =
            "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
        }
        setWidth(0);
        setIsResizing(false); // 停止拖拽逻辑（避免重复）
        setIsCollapsed(true); // 视觉上标记要折叠（但我们仍保留 DOM）
        return;
      }
      if (newW < MIN) newW = MIN;
      if (newW > MAX) newW = MAX;
      setWidth(newW);
    };

    const onUp = () => {
      if (!isResizing) return;
      setIsResizing(false);
      // 恢复 transition，这样如果用户放开鼠标后我们想做回弹动画就会生效
      if (sidebarRef.current) {
        sidebarRef.current.style.transition = ""; // 还原到 css 中的 transition 规则
      }
      // no other immediate changes here
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  // ----- transitionend 事件：在动画结束后做最终处理 -----
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const onTransitionEnd = (ev: TransitionEvent) => {
      // 我们关心 width 过渡结束时（也可检查 propertyName === 'width'）
      if (ev.propertyName !== "width") return;

      if (isCollapsed) {
        // 折叠动画完成后，保持宽度 0，并让侧边栏不可交互（pointer-events）
        // 我们不卸载组件，仅使其不可见/不可交互以避免卡顿
        if (sidebarRef.current) {
          sidebarRef.current.style.pointerEvents = "none";
        }
      } else {
        // 展开动画完成后，确保可以交互
        if (sidebarRef.current) {
          sidebarRef.current.style.pointerEvents = "";
        }
      }
    };

    el.addEventListener("transitionend", onTransitionEnd);
    return () => el.removeEventListener("transitionend", onTransitionEnd);
  }, [isCollapsed]);

  // ----- 点击切换折叠/展开 -----
  const toggle = () => {
    if (!isCollapsed) {
      // 触发折叠动画：设置 transition（使用 CSS 里已存在，但为保险这里可以明确设置）
      if (sidebarRef.current) {
        sidebarRef.current.style.transition =
          "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
      }
      setWidth(0);
      setIsCollapsed(true);
    } else {
      // 展开：先允许交互，然后把宽度设回默认值；使用 requestAnimationFrame 保证样式刷新顺序正确
      if (sidebarRef.current) {
        sidebarRef.current.style.pointerEvents = ""; // 允许交互
        // 明确 transition，保证展开有动画
        sidebarRef.current.style.transition =
          "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
      }
      setIsCollapsed(false);
      // 使用 rAF 确保 DOM 已渲染 collapsed -> then set width
      requestAnimationFrame(() => {
        setWidth(defaultWidth);
      });
    }
  };

  // ----- 当宽度通过外部逻辑被设置为非零时确保不是 collapsed -----
  useEffect(() => {
    if (width > 0 && isCollapsed) {
      // 说明外部设置恢复了宽度，解除折叠标记
      setIsCollapsed(false);
    }
  }, [width, isCollapsed]);

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchValue(value);
    // 这里可以添加搜索逻辑
  };

  // 处理文档切换
  const handleDocSelect = async (docId: string) => {
    setSelectedDocKey(docId);
    await switchDocument(docId);
    navigate(`/doc/${docId}`);
  };

  // 创建文档菜单项
  const createDocMenuItems: MenuProps["items"] = [
    {
      key: "document",
      label: "文档",
      icon: <FileTextOutlined style={{ color: "#3b82f6" }} />,
    },
    {
      key: "table",
      label: "表格",
      icon: <TableOutlined style={{ color: "#16a34a" }} />,
    },
    {
      key: "canvas",
      label: "画板",
      icon: <PictureOutlined style={{ color: "#9333ea" }} />,
    },
    {
      key: "datatable",
      label: "数据表",
      icon: <BarChartOutlined style={{ color: "#3b82f6" }} />,
    },
    { type: "divider" },
    {
      key: "template",
      label: "从模板新建...",
      icon: <AppstoreOutlined />,
    },
    {
      key: "import",
      label: "导入...",
      icon: <ImportOutlined />,
    },
    {
      key: "ai",
      label: "AI 帮你写",
      icon: <AppstoreOutlined style={{ color: "#16a34a" }} />,
    },
    { type: "divider" },
    {
      key: "group",
      label: "新建分组",
      icon: <FolderOutlined style={{ color: "#92400e" }} />,
    },
    {
      key: "link",
      label: "添加链接",
      icon: <LinkOutlined style={{ color: "#3b82f6" }} />,
    },
  ];

  // 生成 UUID
  const generateUUID = (): string => {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const arr = new Uint8Array(16);
      globalThis.crypto.getRandomValues(arr);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  };

  // 处理创建文档（根据类型）
  const handleCreateDocumentByType = async (type: string) => {
    const typeNames: Record<string, string> = {
      document: "未命名文档",
      table: "未命名表格",
      canvas: "未命名画板",
      datatable: "未命名数据表",
      group: "未命名分组",
    };
    
    const defaultTitle = typeNames[type] || "未命名文档";
    const newDocId = generateUUID();
    
    try {
      await addDocument(newDocId, defaultTitle);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };

  // 同步当前文档ID到选中状态
  useEffect(() => {
    if (currentDocId) {
      setSelectedDocKey(currentDocId);
    }
  }, [currentDocId]);

  // 获取当前活动的导航路径
  const getActiveNavKey = () => {
    if (location.pathname === "/") return "home";
    if (location.pathname === "/tool") return "tool";
    if (location.pathname === "/history") return "history";
    return "";
  };

  // 文档节点右键菜单
  const getDocNodeMenu = (docId: string, docTitle: string): MenuProps["items"] => [
    {
      key: "rename",
      label: "重命名",
      icon: <EditOutlined />,
      onClick: () => console.log("重命名:", docId, docTitle),
    },
    {
      key: "copy-link",
      label: "复制链接",
      icon: <LinkOutlined />,
      onClick: () => console.log("复制链接:", docId, docTitle),
    },
    {
      type: "divider",
    },
    {
      key: "duplicate",
      label: "复制...",
      icon: <CopyOutlined />,
      onClick: () => console.log("复制:", docId, docTitle),
    },
    {
      key: "export",
      label: "导出...",
      icon: <ExportOutlined />,
      onClick: () => console.log("导出:", docId, docTitle),
    },
    {
      type: "divider",
    },
    {
      key: "delete",
      label: "删除",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => console.log("删除:", docId, docTitle),
    },
  ];

  return (
    <div className="app-container">
      {/* 永远渲染侧边栏 —— 用类/样式控制可见性与交互 */}
      <div
        ref={sidebarRef}
        className={`sidebar ${isCollapsed ? "collapsed" : ""} ${
          isResizing ? "no-transition" : ""
        }`}
        style={{
          width: width,
          // 当折叠时缩小 padding 以避免内容冲突（和 CSS transition 保持一致）
          paddingLeft: isCollapsed ? 0 : undefined,
          paddingRight: isCollapsed ? 0 : undefined,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <div className="sidebar-inner">
          <div className="sidebar-top">
            {/* 面包屑导航 */}
            <div className="sidebar-breadcrumb">
              <span className="breadcrumb-icon">Z</span>
              <RightOutlined className="breadcrumb-arrow" />
              <span className="breadcrumb-text">个人知识库</span>
            </div>
            
            {/* 工作区信息 */}
            <div className="sidebar-workspace">
              <BookOutlined className="workspace-icon" />
              <span className="workspace-name">Demo</span>
              <GlobalOutlined className="workspace-globe" />
              <Dropdown menu={{ items: workspaceMenuItems }} trigger={["click"]} placement="bottomLeft">
                <Button
                  type="text"
                  size="small"
                  icon={<DownOutlined />}
                  className="workspace-dropdown"
                />
              </Dropdown>
              <Dropdown menu={{ items: workspaceMenuItems }} trigger={["click"]} placement="bottomRight">
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="workspace-more"
                />
              </Dropdown>
            </div>
            
            {/* 搜索框 */}
            <div className="sidebar-search-row">
              <div className="sidebar-search-wrapper">
                <SearchOutlined className="search-icon" />
                <Input
                  placeholder="搜索"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
                  className="sidebar-search-input"
                  bordered={false}
                />
                <span className="search-shortcut">Ctrl + J</span>
              </div>
              <Dropdown
                menu={{
                  items: createDocMenuItems,
                  onClick: ({ key }) => {
                    if (["document", "table", "canvas", "datatable", "group"].includes(key)) {
                      handleCreateDocumentByType(key);
                    } else {
                      // 其他功能暂时不实现
                      console.log("功能暂未实现:", key);
                    }
                  },
                }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  className="search-add-btn"
                />
              </Dropdown>
            </div>
          </div>

          <div className="sidebar-fixed">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `fixed-item ${isActive ? "active" : ""}`
              }
            >
              <HomeOutlined />
              <span>首页</span>
            </NavLink>
            {/* <NavLink
              to="/tool"
              className={({ isActive }) =>
                `fixed-item ${isActive ? "active" : ""}`
              }
            >
              <ToolOutlined />
              <span>工具</span>
            </NavLink> */}
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `fixed-item ${isActive ? "active" : ""}`
              }
            >
              <HistoryOutlined />
              <span>历史版本</span>
            </NavLink>
          </div>

          <div className="sidebar-scroll">
            <div className="documents-section">
              <div className="documents-header">
                <span className="documents-title">文档</span>
                <Dropdown
                  menu={{
                    items: createDocMenuItems,
                    onClick: ({ key }) => {
                      if (["document", "table", "canvas", "datatable", "group"].includes(key)) {
                        handleCreateDocumentByType(key);
                      } else {
                        // 其他功能暂时不实现
                        console.log("功能暂未实现:", key);
                      }
                    },
                  }}
                  trigger={["click"]}
                  placement="bottomLeft"
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    className="new-doc-btn"
                  />
                </Dropdown>
              </div>

              <div className="documents-list">
                {documents.map((doc) => (
                  <div
                    key={doc.docId}
                    className={`document-item ${selectedDocKey === doc.docId ? "active" : ""}`}
                    onClick={() => handleDocSelect(doc.docId)}
                  >
                    <FileTextOutlined className="document-icon" />
                    <span className="document-title">{doc.title}</span>
                    <Dropdown
                      menu={{ items: getDocNodeMenu(doc.docId, doc.title) }}
                      trigger={["click"]}
                      placement="bottomRight"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        className="document-action-btn"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Dropdown>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 拖拽条（始终存在） */}
      <div
        className={`resizer ${isCollapsed ? "collapsed" : ""}`}
        onMouseDown={isCollapsed ? undefined : startResizing}
      >
        <div className="split"></div>
        <Tooltip
          title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          placement="right"
        >
          <button
            type="button"
            className="toggle-btn"
            onClick={toggle}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`icon ${isCollapsed ? "collapsed" : ""}`}
              viewBox="0 0 1024 1024"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M753.613 996.727l-484.233-485.222 485.222-484.233z"
                fill="currentColor"
              />
            </svg>
          </button>
        </Tooltip>
      </div>

    </div>
  );
}
