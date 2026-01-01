import "./style.css";

import { Tooltip } from "antd";

export default function Header() {
  return (
    <header className="header">
      {/* 左侧 */}
      <div className="header-left">
        <span className="header-title">重命名文档124</span>
        <span className="header-lock"></span>
      </div>

      {/* 右侧 */}
      <div className="header-right">

        <Tooltip title="当前订阅计划" placement="bottom">
        <span className="header-badge">ChatGPT 5.2 Pro</span>
        </Tooltip>


        <Tooltip title="收藏" placement="bottom">
          <button className="icon-btn" aria-label="star">
            ⭐
          </button>
        </Tooltip>

        <Tooltip title="用户" placement="bottom">
          <button className="icon-btn" aria-label="user">
            👤
          </button>
        </Tooltip>
        <Tooltip title="通知" placement="bottom">
          <button className="icon-btn" aria-label="notify">
            🔔
          </button>
        </Tooltip>
        <Tooltip title="分享" placement="bottom">
          <button className="icon-btn" aria-label="share">
            📡
          </button>
        </Tooltip>
        <Tooltip title="点击开始编辑" placement="bottom">
          <button className="btn primary">编辑</button>
        </Tooltip>
      </div>
    </header>
  );
}
