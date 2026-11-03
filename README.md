# 共享转盘（Shared Spinner Wheel）

一个**网页版实时共享转盘**：苹果风灰金视觉、支持多个命名转盘各自选看、自定义选项（文字 / 颜色 / 权重 / 金色图标）。把链接发给朋友，进同一个房间，谁转动、转到什么，所有人**实时看到同一段动画和同一个结果**，并有"谁在哪个转盘转到了什么"的历史记录。手机 / 电脑自适应。

**纯前端架构**：不再需要自己搭建后端服务器。实时同步由 [Supabase Realtime](https://supabase.com/realtime)（Broadcast + Presence）承担，前端托管在 **GitHub Pages**。

---

## 功能
- 多命名转盘：建多个转盘、改名、删除，每个人自己选当前看哪个
- 实时同步：转盘内容、转动结果、在线好友、历史记录都在同房间内实时共享
- 自定义选项：文字、颜色、权重（概率）、内置一套金色线性图标
- 苹果风灰金视觉 + 协调多彩扇区，选中块金色描边高亮
- 移动端自适应：手机上编辑面板收进底部抽屉，图标选择为底部弹层

---

## 部署到 GitHub Pages（约 5 分钟）

### 1. 准备一个免费的 Supabase 项目
实时功能需要 Supabase 的 Realtime 通道（免费层即可）：
1. 打开 https://supabase.com 注册并 **New Project**（地区任选，免费层）
2. 进入项目：**Settings → API**
3. 复制两样东西：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon / public key**（以 `eyJ` 开头的一长串）
   > anon key 是公开安全的，可放心放在前端。

### 2. 填入配置
打开 `public/config.js`，把两处空字符串替换成上面的 URL 和 key：
```js
window.SUPABASE_CONFIG = {
  URL: 'https://xxxx.supabase.co',
  ANON_KEY: 'eyJhbGci...',
};
```

### 3. 推送到 GitHub
```bash
git add -A
git commit -m "配置 Supabase 并部署"
git push
```

### 4. 开启 GitHub Pages
1. 仓库页面 → **Settings → Pages**
2. **Source** 选择 **GitHub Actions**
3. 推送 `main` 分支后会自动触发工作流 `.github/workflows/deploy.yml`，把 `public/` 部署上线
4. 稍等一两分钟，得到站点地址，形如：
   ```
   https://<你的用户名>.github.io/spinner-wheel/
   ```

### 5. 和朋友一起玩
把下面这样的链接发给他们（房间号随便取，大家用同一个即可实时同房间）：
```
https://<你的用户名>.github.io/spinner-wheel/?room=PARTY01
```
手机浏览器直接打开即可，无需安装。

---

## 本地预览（无需 Supabase 也能看页面）
```bash
cd spinner-wheel
# 方式一：Python（无需安装依赖）
python3 -m http.server 8080
# 然后浏览器打开 http://localhost:8080

# 方式二：Node
npm start
# 打开 http://localhost:3000
```
> 本地预览时若未配置 Supabase，页面会提示「未配置 Supabase」，但转盘 UI 仍可正常查看。要测实时同步，请用上面部署好的 GitHub Pages 链接，或本地填好 `config.js` 的 Supabase key。

---

## 工作原理（纯前端，无自有服务器）
- 每个房间 = 一个 Supabase Realtime 频道（`room:<房间号>`）。
- **Presence** 负责"在线好友"列表（昵称、正在看哪个转盘）。
- **Broadcast** 负责状态同步：转盘列表 / 选项 / 转动事件都在房间内广播。
- **发起者权威**：谁点"转动"，谁本地按权重随机算出中奖扇区下标，再把同一个目标广播给全员，所有人用同一时长/缓动播放动画，保证落点完全一致。
- **状态自举**：新成员加入时向房间请求快照；若无人回应（你是第一个），则自动创建一个默认转盘。状态会缓存在浏览器 localStorage，刷新/重连后恢复视图。

### 注意事项
- 这是"临时房间"设计：状态保存在各人浏览器 + Realtime 通道中，没有数据库持久化，房间长期无人后会自然消失。
- 纯前端无中心服务器，若两人**同时**编辑同一转盘，遵循"最后收到的写入获胜"，可能出现短暂不一致；任一后续改动会重新对齐。朋友娱乐场景基本无感。
- Supabase 免费层有连接/消息额度，个人小圈子使用绰绰有余。

---

## 技术栈
- 前端：原生 HTML / CSS / JS + Canvas 绘制转盘，无构建步骤
- 实时：[Supabase Realtime](https://supabase.com/realtime)（Broadcast + Presence）
- 托管：GitHub Pages（GitHub Actions 自动部署 `public/`）

## 目录
```
public/
  index.html
  styles.css
  config.js              # ← 填入你的 Supabase URL / anon key
  config.example.js      # 配置模板
  js/
    app.js               # 主逻辑 / 渲染 / 实时同步
    wheel.js             # Canvas 转盘绘制与动画
    icons.js             # 金色线性图标库
    realtime-supabase.js # Supabase Realtime 封装（替代原 Socket.IO 层）
.github/workflows/deploy.yml  # GitHub Pages 自动部署
```
