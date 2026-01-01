// App.tsx
import { NavLink } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./style.css";

import {Tooltip} from "antd";

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
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(350); // 当前宽度（用于 inline style）
  const [isResizing, setIsResizing] = useState(false); // 鼠标是否在拖拽
  const [isCollapsed, setIsCollapsed] = useState(false); // 视觉上的“折叠”（宽度为 0）
  const defaultWidth = 350;
  const MIN = 250;
  const MAX = 450;
  const HIDE_THRESHOLD = 0;

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
          sidebarRef.current.style.transition = "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
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
        sidebarRef.current.style.transition = "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
      }
      setWidth(0);
      setIsCollapsed(true);
    } else {
      // 展开：先允许交互，然后把宽度设回默认值；使用 requestAnimationFrame 保证样式刷新顺序正确
      if (sidebarRef.current) {
        sidebarRef.current.style.pointerEvents = ""; // 允许交互
        // 明确 transition，保证展开有动画
        sidebarRef.current.style.transition = "width 0.25s ease, padding 0.25s ease, opacity 0.2s ease";
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

  return (
    <div className="app-container">
      {/* 永远渲染侧边栏 —— 用类/样式控制可见性与交互 */}
      <div
        ref={sidebarRef}
        className={`sidebar ${isCollapsed ? "collapsed" : ""} ${isResizing ? "no-transition" : ""}`}
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
            <div className="sidebar-brand">
              <span className="brand-icon" aria-hidden="true">
                Z
              </span>
              <span className="brand-text">个人知识库</span>
            </div>
            <div className="sidebar-workspace">
              <span className="workspace-icon" aria-hidden="true">
                D
              </span>
              <span className="workspace-name">Demo</span>
              <span className="workspace-meta" aria-hidden="true">
                🌏
              </span>
              <Tooltip title="更多操作" placement="right">
              <button type="button" className="workspace-action" aria-label="更多">
                ...
              </button>
              </Tooltip>
            </div>
            <div className="sidebar-search-row">
              <div className="sidebar-search">
                <span className="search-icon" aria-hidden="true">
                  #
                </span>
                <input className="search-input" type="text" placeholder="搜索" aria-label="搜索" />
                <span className="search-shortcut">Ctrl + J</span>
              </div>
              <Tooltip title="新建文档" placement="right">
              <button type="button" className="search-add" aria-label="新建">
                +
              </button>
              </Tooltip>
            </div>
          </div>

          <div className="sidebar-fixed">
            {/* <NavLink to="/" className={({ isActive }) => `fixed-item ${isActive ? "active" : ""}`}>
              <span className="fixed-icon home" aria-hidden="true" />
              首页
            </NavLink>
            <NavLink to="/tool" className={({ isActive }) => `fixed-item ${isActive ? "active" : ""}`}>
              <span className="fixed-icon list" aria-hidden="true" />
              工具
            </NavLink> */}
            <NavLink to="/history" className={({ isActive }) => `fixed-item ${isActive ? "active" : ""}`}>
              <span className="fixed-icon list" aria-hidden="true" />
              历史版本
            </NavLink>
          </div>

          <div className="sidebar-scroll">
            <div className="nav-list">
              {items.map((item) => (
                <NavLink
                  key={item.key || item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
              {children}
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
        <Tooltip title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"} placement="right">
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
            <path d="M753.613 996.727l-484.233-485.222 485.222-484.233z" fill="currentColor" />
          </svg>
        </button>
        </Tooltip>
      </div>
    </div>
  );
} 
