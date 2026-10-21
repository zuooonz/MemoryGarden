# 《爷爷的一周》游戏工程

代码分层、共享状态、初始化顺序和写代码的规矩见 [架构说明](../Docs/架构.md)（改代码前必读）。

## 常用命令

```bash
npm install
npm run dev       # 开发：http://127.0.0.1:5173（生成 dev/，可随时删除；改 src/ 与 src/styles/ 自动更新）
npm run build     # 构建：dist/index.html（单文件，含配音，无外部资源）
npm run check     # 快速检查（1 秒，不开浏览器）：构建、模块装配（循环与分层）、未声明名字、规则结果快照、存档升级、剧情数据一致、情境自检
npm run verify    # 全部检查（15 项，约 10 分钟）：以上＋7 天回归、排版、设置组合、穿模与台词（两种布置）、界面像素比对
npm run stability # 稳定性测试（真实时间连玩一周，记帧率与内存；需要显卡）
```

在线版由 GitHub Actions 在推到 main 时构建并发布到 GitHub Pages（`.github/workflows/pages.yml`）。也可以发到自己的服务器：

```bash
DEPLOY_HOST=<用户>@<服务器> DEPLOY_DIR=<网页目录> npm run deploy     # 构建并更新首页（上一版留作 index.prev.html）
DEPLOY_HOST=<用户>@<服务器> DEPLOY_DIR=<网页目录> npm run rollback   # 退回上一版
```

## 目录

| 位置 | 内容 |
|---|---|
| `src/*.js` | 代码，按层分模块（见架构说明第 1 节）；`sim.js`＋`tasks.js` 是规则层，可不开浏览器运行 |
| `src/styles/*.css` | 样式，按文件名顺序拼接（顺序即层叠顺序）；设计表变量在 `1-base.css` 的 `:root` |
| `src/index.html` | 页面结构（样式由构建放进 `<!--STYLES-->`） |
| `src/voice/` | 人物配音（本机 AI 生成，构建时打包进 HTML） |
| `snapshots/` | 界面像素比对的基准截图（`uibase/`）与旧源码快照 |

## 工具（`tools/`）

| 工具 | 用途 |
|---|---|
| `verify.mjs` | `npm run check`／`verify` 背后的一键验证 |
| `modcheck.mjs`、`undefcheck.mjs` | 模块装配与分层、未声明名字 |
| `simsnap.mjs`、`savecheck.mjs`、`levelcheck.mjs` | 规则结果快照（`--update` 更新基准）、存档升级样本、每天关卡必出现 |
| `datacheck.mjs` | 剧情数据一致：天气与简介、星期、地点入口、修路、托带、配音文件、注释里吞掉的代码 |
| `regress.mjs`、`layoutcheck.mjs`、`settingscheck.mjs` | 7 天乱点回归、10 尺寸排版、36 种设置组合 |
| `storyrun.mjs`、`storycheck.mjs` | 不开浏览器跑一天拿事件流；情境自检（事件先后、台词情境、状态，含随机玩家操作） |
| `walkcheck.mjs`、`linerules.mjs` | 7 天行走（穿模、门对齐、出门就掉头）＋台词合不合场景＋人物开口晚不晚＋残留声音与话被掐断（`WALK_NB=1` 拜托全部邻居，`WALK_FAIL=1` 小关卡全做错） |
| `voicelines.mjs` | 按提示表 `src/narr.js` 与台词表 `src/lines.js` 同步本机配音清单（配音在本机另行生成，生成工具不在仓库里） |
| `uidiff.mjs` | 界面像素比对（5 套 × 23 状态）：`shoot <目录>`、`diff snapshots/uibase <目录>` |
| `shot.mjs` | 截图／自定义脚本 |
| `video/` | 自动录制演示视频（见其 README） |
| `balance.mjs`、`playtime.mjs` | 无头难度测试、时长估算 |
| `deploy.sh` | 部署（由 npm 脚本调用） |

测试和视频工具通过调试接口 `window.__mg`（`src/devtools.js`）操作游戏。
