import { useState, useEffect } from "react";
import { useDocumentContext } from "../../context/documentContext";
import { useEditContext } from "../../context/editContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button, Tabs, Dropdown, type MenuProps } from "antd";
import {
  FileTextOutlined,
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  LinkOutlined,
  ExportOutlined,
  DeleteOutlined,
  DownOutlined,
} from "@ant-design/icons";
import TiptapNotionEditor from "../../editor/TiptapNotionEditor";
import "./style.css";

export default function MainPage() {
  const { documents, currentDocument, switchDocument } = useDocumentContext();
  const { isEditing, setIsEditing } = useEditContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<string>("edited");

  // 处理文档点击 - 跳转到文档路由
  const handleDocClick = async (docId: string) => {
    await switchDocument(docId);
    navigate(`/doc/${docId}`);
  };

  // 文档操作菜单
  const getDocMenu = (docId: string, docTitle: string): MenuProps["items"] => [
    {
      key: "edit",
      label: "编辑",
      icon: <EditOutlined />,
      onClick: () => {
        handleDocClick(docId);
        // 延迟一下，确保路由跳转完成后再设置编辑状态
        setTimeout(() => {
          setIsEditing(true);
        }, 100);
      },
    },
    {
      key: "copy-link",
      label: "复制链接",
      icon: <LinkOutlined />,
      onClick: () => console.log("复制链接:", docId),
    },
    { type: "divider" },
    {
      key: "duplicate",
      label: "复制...",
      icon: <CopyOutlined />,
      onClick: () => console.log("复制:", docId),
    },
    {
      key: "export",
      label: "导出...",
      icon: <ExportOutlined />,
      onClick: () => console.log("导出:", docId),
    },
    { type: "divider" },
    {
      key: "delete",
      label: "删除",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => console.log("删除:", docId),
    },
  ];

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const docDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (docDate.getTime() === today.getTime()) {
      return `今天 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (docDate.getTime() === yesterday.getTime()) {
      return `昨天 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
    }
    
    return `${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  // 首页始终显示文档列表
  return (
    <div className="main-page">
      <div className="main-header">
        <h1 className="main-title">开始</h1>
        
        {/* 快速操作卡片 */}
        <div className="quick-actions">
          <div className="action-card">
            <div className="action-icon">
              <FileTextOutlined style={{ fontSize: 24, color: "#3b82f6" }} />
            </div>
            <div className="action-content">
              <div className="action-title">新建文档</div>
              <div className="action-desc">文档、表格、画板、数据表</div>
            </div>
            <DownOutlined className="action-arrow" />
          </div>
          
          <div className="action-card">
            <div className="action-icon">
              <FileTextOutlined style={{ fontSize: 24, color: "#16a34a" }} />
            </div>
            <div className="action-content">
              <div className="action-title">新建知识库</div>
              <div className="action-desc">使用知识库整理知识</div>
            </div>
          </div>
          
          <div className="action-card">
            <div className="action-icon">
              <FileTextOutlined style={{ fontSize: 24, color: "#9333ea" }} />
            </div>
            <div className="action-content">
              <div className="action-title">模板中心</div>
              <div className="action-desc">从模板中获取灵感</div>
            </div>
          </div>
          
          <div className="action-card">
            <div className="action-icon">
              <FileTextOutlined style={{ fontSize: 24, color: "#16a34a" }} />
            </div>
            <div className="action-content">
              <div className="action-title">AI 帮你写</div>
              <div className="action-desc">AI 助手帮你一键生成文档</div>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="documents-section">
          <div className="documents-header">
            <h2 className="documents-title">文档</h2>
            <div className="documents-filters">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  { key: "edited", label: "编辑过" },
                  { key: "browsed", label: "浏览过" },
                  { key: "liked", label: "我点赞的" },
                  { key: "commented", label: "我评论过" },
                ]}
                size="small"
              />
              <div className="documents-sort">
                <Dropdown menu={{ items: [{ key: "all", label: "全部类型" }] }} trigger={["click"]}>
                  <Button type="text" size="small">
                    类型 <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [{ key: "all", label: "全部归属" }] }} trigger={["click"]}>
                  <Button type="text" size="small">
                    归属 <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: [{ key: "all", label: "全部创建者" }] }} trigger={["click"]}>
                  <Button type="text" size="small">
                    创建者 <DownOutlined />
                  </Button>
                </Dropdown>
              </div>
            </div>
          </div>

          <div className="documents-list">
            {documents.map((doc) => (
              <div
                key={doc.docId}
                className="document-row"
                onClick={() => handleDocClick(doc.docId)}
              >
                <FileTextOutlined className="document-row-icon" />
                <span className="document-row-title">{doc.title || "未命名文档"}</span>
                <span className="document-row-path">Demo</span>
                <span className="document-row-date">
                  {formatDate(doc.meta?.updatedAt || doc.meta?.createdAt || Date.now())}
                </span>
                <Dropdown
                  menu={{ items: getDocMenu(doc.docId, doc.title) }}
                  trigger={["click"]}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    className="document-row-action"
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
