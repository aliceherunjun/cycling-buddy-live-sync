# 骑行伙伴共享实时位置

高德地图骑行导航插件候选方案 / 独立 PWA 验证原型

这是一个本地即可打开的前端原型，目标是把“多人骑行时共享实时位置”的核心体验先跑通：

- 以骑行导航为主界面承载队伍状态
- 同一路线上的多位骑友共享实时位置
- 支持创建房间、输入邀请码加入、复制邀请信息
- 支持微信友好的系统分享 / 复制邀请文案
- 支持多标签实时同步，便于本地演示多人骑行
- 自动显示与自己的相对距离、前后关系和掉队风险
- 配置高德 Key 后优先加载真实骑行规划路线，失败时回退到内置示意路线
- 真实定位下把经纬度投影到骑行路线，按路线里程差计算队友距离
- 跟骑、领骑、收队可根据真实定位在路线上的先后自动智能判断
- 给出适合减速等待或临时汇合的提示

## 高德插件方向说明

本项目已重新整理为“高德地图骑行导航插件候选方案”。当前公开资料没有显示高德地图 App 存在面向第三方开发者自由发布的插件市场，因此它暂时不能像普通软件一样直接安装进高德地图 App。

更现实的路径是：

- 用当前 PWA 原型完成真实骑友测试
- 将 `.amap/plugin-proposal.json`、`docs/amap-plugin-brief.md`、`docs/plugin-prd.md` 作为插件合作材料
- 联系高德开放平台或商务合作渠道
- 获得高德宿主接口后，将当前功能迁移到高德骑行导航页内

当前仍保留独立 PWA 能力，方便在正式插件能力开放前持续验证。

## 运行方式

推荐在当前目录执行：

```bash
npm start
```

然后打开 `http://localhost:4173`

本地推荐先复制一份环境文件：

```bash
cp .env.example .env
```

然后把 `.env` 里的 `AMAP_KEY`、`AMAP_SECURITY_JS_CODE`、`PUBLIC_BASE_URL` 按需填上。`server.js` 现在会自动读取项目根目录下的 `.env`，不用每次手动拼环境变量启动。

这会启动一个本地 Node 服务，提供：

- 静态页面访问
- 房间创建 / 加入接口
- 基于 SSE 的实时房间状态推送
- `/api/health` 健康检查接口，可快速确认地图 key 和代理是否生效

如果服务端没启动，前端会自动回退到本地演示同步模式。

## 打包下载

执行：

```bash
npm run build
```

会生成：

- `release/cycling-buddy-live-sync/`：可直接部署的应用目录
- `release/cycling-buddy-live-sync.zip`：可下载分享的应用包

启动 `npm start` 后，页面里的“下载应用包”按钮会下载这个 zip。其他人解压后在目录里执行 `npm start`，即可本地运行同一套原型。

## 手机安装方式

当前版本是 PWA 网页应用，支持添加到手机桌面：

- iPhone：用 Safari 打开部署后的 HTTPS 地址，点击分享，选择“添加到主屏幕”
- Android：用 Chrome 打开部署后的 HTTPS 地址，菜单里选择“安装应用”或“添加到主屏幕”

说明：高德地图开放平台提供地图、定位、路径规划等能力，但没有公开的“把第三方应用安装进高德地图 APP”分发通道。若要真正嵌入高德地图 APP，需要走高德官方开放平台、商务合作或官方认可的小程序/插件入口。当前原型更适合先作为独立 PWA 或网页服务运行，并在下一步接入高德 JS API / Web 服务路线能力。

## 公网部署给骑友共用

这个原型需要一个长期在线的 Node 服务来保存房间状态并推送 SSE 实时同步。推荐先部署到 Render、Railway、Fly.io 或自己的云服务器。

### Render 部署

1. 把代码推到 GitHub 仓库
2. 在 Render 新建 Web Service，连接这个仓库
3. Build Command 填 `npm run build`
4. Start Command 填 `npm start`
5. 环境变量至少填：

```text
PUBLIC_BASE_URL=https://你的服务地址
```

如果要显示高德地图底图和真实骑行路线，再填：

```text
AMAP_KEY=你的高德 Web JS API Key
AMAP_SECURITY_JS_CODE=你的高德安全密钥
```

推荐做法：把 `AMAP_SECURITY_JS_CODE` 放在服务端环境变量里，不要写进前端 `config.js`。当前项目会自动通过 `/_AMapService` 代理高德 Web 服务请求，让安全密钥只保留在 Node 服务端。

部署成功后，用手机打开 `PUBLIC_BASE_URL`，创建房间并点“微信分享”，骑友打开链接即可进入同一房间。双方开启“共享 GPS 位置”后，就能按路线里程差看到前后距离。

### 首次公网路测建议

推荐第一轮按这个顺序做：

1. 在 Render 部署完成后，先打开：

```text
https://你的域名/api/health
```

如果返回里：

- `ok: true`
- `amap.keyConfigured: true`
- `amap.proxyEnabled: true`

说明服务和高德代理都已生效。

2. 用手机浏览器打开首页，确认：

- 页面能正常进入
- 地图区域能加载高德底图
- 路线卡片里的总里程和预计骑行不是死板固定值时，说明真实骑行路线已优先接入

3. 第一轮只测两台手机：

- A 手机创建房间并开启“共享 GPS 位置”
- B 手机通过微信分享链接进入同一房间并开启“共享 GPS 位置”

4. 骑行前先做静态站立测试 1-2 分钟，确认：

- 两边能看到对方加入
- 退出共享后人数会更新
- 位置和前后距离会刷新

5. 真正上路时，建议先选一段 10-20 分钟、红绿灯较多但路线简单的路段，优先观察：

- 红绿灯切断后多久能看出前后差距
- 掉队提醒是否过早或过晚
- 微信里打开链接是否顺畅
- iPhone / Android 是否都能稳定申请定位权限

### 路测前检查清单

出发前建议确认这几项：

- Render 服务状态正常
- `PUBLIC_BASE_URL` 已填成最终公网 HTTPS 地址
- 高德 `AMAP_KEY` 和 `AMAP_SECURITY_JS_CODE` 已配置
- 两台手机都允许浏览器定位
- 微信内如果打不开高德跳转，准备切到“在浏览器打开”
- 随身带移动电源，持续定位会比较耗电

### Docker 部署

```bash
docker build -t cycling-buddy-live-sync .
docker run -p 4173:4173 \
  -e PUBLIC_BASE_URL=https://你的服务地址 \
  -e AMAP_KEY=你的高德Key \
  -e AMAP_SECURITY_JS_CODE=你的高德安全密钥 \
  cycling-buddy-live-sync
```

## 高德地图结合方式

当前已支持两种结合方式：

- 页面内高德底图和真实骑行路线：配置 `AMAP_KEY` 后，地图主区域会加载高德 JS API 2.0 底图，并优先通过 `AMap.Riding` 获取真实骑行 polyline；如果服务端同时配置了 `AMAP_SECURITY_JS_CODE`，会自动走更安全的代理模式。若查询失败，会自动回退到内置演示路线。
- 跳转高德导航：路线卡片里的“打开高德骑行导航”会使用高德 URI API 调起骑行导航，参数包含 `mode=ride` 和 `callnative=1`。

### 更安全的密钥使用方式

当前项目已经内置更安全的代理模式：

- 前端只需要拿到 `AMAP_KEY`
- `AMAP_SECURITY_JS_CODE` 保留在 Node 服务端环境变量
- 服务端通过 `/_AMapService/*` 转发高德 Web 服务请求，并自动附带 `jscode`

本地开发时如果你只是临时验证，也可以继续在 `config.js` 里明文填写 `AMAP_SECURITY_JS_CODE`，但不建议上线时这样做。

注意：微信 / QQ 内置浏览器可能限制调起高德 APP。如果无法跳转，让骑友点击右上角菜单选择“在浏览器打开”，再点“打开高德骑行导航”。

## 插件提案材料

- `.amap/plugin-proposal.json`：插件提案元数据
- `docs/amap-plugin-brief.md`：高德插件化接入方案
- `docs/plugin-prd.md`：产品 PRD

## GitHub 分享

建议在 GitHub 新建仓库后执行：

```bash
git add .
git commit -m "Initial cycling buddy live location prototype"
git branch -M main
git remote add origin https://github.com/你的用户名/cycling-buddy-live-sync.git
git push -u origin main
```

如果想让别人直接下载 zip，可以在 GitHub Releases 上传 `release/cycling-buddy-live-sync.zip`。

## 真实同步测试方法

启动服务后，可以直接开两个不同身份的 URL 来验证真实多人同步：

```text
http://127.0.0.1:4173/?member=host01&name=领骑A&role=领骑&color=%231fa66f&demo=0
http://127.0.0.1:4173/?member=guest02&name=跟骑B&role=跟骑&color=%233a8dde&demo=0#房间码
```

说明：

- `member` 用来标识不同骑友身份
- `demo=0` 会关闭演示队友，方便只看真实服务端成员
- 第二个地址里的 `#房间码` 替换成第一个页面创建出来的房间码

## 真实定位与路线距离

页面里的“共享 GPS 位置”会申请浏览器定位权限。定位成功后，房间同步会携带经纬度，并将骑友位置投影到当前 A 点到 B 点路线：

- 队友距离按“骑行路线上的里程差”计算，不使用经纬度直线距离
- 前方 / 后方根据路线里程先后判断
- 多位真实定位成员会自动显示为智能领骑、智能跟骑或智能收队

本地调试时也可以通过 URL 参数模拟真实坐标，便于不用 GPS 权限也能验证路线距离：

```text
http://127.0.0.1:4173/?member=host01&name=领骑A&role=领骑&color=%231fa66f&demo=0&lat=31.2284&lng=121.4952
http://127.0.0.1:4173/?member=guest02&name=跟骑B&role=跟骑&color=%233a8dde&demo=0&lat=31.2032&lng=121.4847#房间码
```

## 当前原型包含

- 地图式骑行主舞台
- A 点到 B 点的路线展示
- 高德真实骑行路线优先加载与回退机制
- 房间创建 / 加入 / 邀请码复制 / 微信分享
- 服务端实时房间同步
- 本地演示同步回退
- 演示队友开关
- 队伍成员卡片与相对距离
- GPS 路线投影距离与智能角色判断
- 安全提醒与汇合点建议
- 移动端自适应布局

## 下一步建议

如果你希望继续往真实产品推进，下一步最值得做的是：

1. 接入真实地图底图与路径规划能力
2. 把当前本地同步替换成服务端 WebSocket 房间同步
3. 将当前固定起终点升级为可编辑路线和多条骑行线路选择
4. 为“掉队提醒、停靠点、语音播报”设计规则
5. 打磨创建骑行队伍、邀请加入、结束共享的完整流程
