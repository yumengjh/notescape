import "./style.css";

import { Tooltip, Button, Tag } from "antd";
import {
  StarOutlined,
  UserOutlined,
  BellOutlined,
  ShareAltOutlined,
  LockOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useDocumentContext } from "../../context/documentContext";
import { useEditContext } from "../../context/editContext";

export default function Header() {
  const { currentDocument } = useDocumentContext();
  const { isEditing, toggleEditing } = useEditContext();
  
  return (
    <header className="header">
      {/* 左侧 */}
      <div className="header-left">
        <span className="header-title">{currentDocument?.title || "未命名文档"}</span>
        <span className="header-lock">
          <LockOutlined />
        </span>
      </div>

      {/* 右侧 */}
      <div className="header-right">
        <Tooltip title="当前订阅计划" placement="bottom">
          <Tag className="header-badge" color="success">
            PLUS
          </Tag>
        </Tooltip>

        <Tooltip title="收藏" placement="bottom">
          <Button
            type="text"
            icon={<StarOutlined />}
            className="icon-btn"
            aria-label="star"
          />
        </Tooltip>

        <Tooltip title="用户" placement="bottom">
          <Button
            type="text"
            icon={<UserOutlined />}
            className="icon-btn"
            aria-label="user"
          />
        </Tooltip>

        <Tooltip title="通知" placement="bottom">
          <Button
            type="text"
            icon={<BellOutlined />}
            className="icon-btn"
            aria-label="notify"
          />
        </Tooltip>

        <Tooltip title="分享" placement="bottom">
          <Button
            type="text"
            icon={<ShareAltOutlined />}
            className="icon-btn"
            aria-label="share"
          />
        </Tooltip>

        <Tooltip title={isEditing ? "退出编辑" : "点击开始编辑"} placement="bottom">
          <Button
            type={isEditing ? "default" : "primary"}
            icon={<EditOutlined />}
            className="btn primary"
            onClick={toggleEditing}
          >
            {isEditing ? "完成" : "编辑"}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
