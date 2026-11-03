# 共享转盘（Spinner Wheel）

一个网页版**实时共享转盘**工具：你和朋友通过同一条链接进入同一个房间，可以建立**多个命名转盘**、各自选看，并**实时看到彼此的转动结果**。苹果风灰金极简界面，选项可配文字、颜色、权重，并附带一套金色单色线性图标。

## 功能

- 多人共享房间（链接形如 `https://域名/?room=ABC123`）
- 多个命名转盘，随时切换使用
- 选项自定义：文字 + 颜色 + 权重（概率）+ 图标
- 内置金色单色线性图标库（食物 / 玩乐 / 奖励 / 通用等）
- 谁转动，所有人实时看到同一段动画与结果（含全员浮层 + 历史记录）
- 临时房间，无需注册；离开后自动清理
- 手机 / 电脑自适应，支持触摸

## 本地运行

```bash
npm install
npm start          # 默认 http://localhost:3000
```

测试共享：开两个浏览器窗口都访问 `http://localhost:3000/?room=TEST01`，即可看到实时同步效果。

## 部署（GitHub + Render，推荐）

1. 在 GitHub 新建仓库，把本目录推上去：
   ```bash
   git init
   git add .
   git commit -m "init shared spinner wheel"
   gh repo create spinner-wheel --public --source=. --remote=origin
   git push -u origin main
   ```
2. 打开 [Render](https://render.com) → New → **Web Service** → 关联 GitHub 仓库 → 选择本仓库，`render.yaml` 会被自动识别。
3. 免费层即可（注意：15 分钟无访问会休眠，首次访问稍慢）。如需保活，可用 UptimeRobot 每 5 分钟访问一次你的域名。

> 备选：Railway 直接连 GitHub，仓库里的 `railway.json` 会被自动识别。

## 技术说明

- 后端：Node.js + Express（静态托管）+ Socket.IO（实时），状态存于服务器内存（ephemeral，无数据库）。
- 前端：原生 HTML/CSS/JS + Canvas，无打包工具。
- **服务器权威**：转动结果由服务器按权重随机裁定并广播，保证所有客户端落点一致。
- 关键文件：`server.js`、`lib/rooms.js`、`lib/spin.js`、`public/js/{app,wheel,icons,socket-client}.js`。
