# 视频生成工具

一条命令把游戏录成提交／宣传视频：无头 Chrome 真实操作游戏（可见光标、真实点击拖动），逐帧截图，离线渲染声音，加字幕、片头片尾，拼接压缩成 mp4。

```bash
cd Game
npm run build && node tools/video/make.mjs              # 录当前版本（dist/index.html）
node tools/video/make.mjs --html <某个版本的 html>        # 录指定版本
```

输出（与 html 同名，放在 `release/`，不进仓库）：

- `<名字>.mp4`：成片，1920×1080、30 帧，体积按 `--max-mb`（默认 190）压到赛事上传上限 200 MiB 以内。
- `<名字>_封面.png`：片头静帧。
- `<名字>_视频素材/`：每段的 `clip.mp4`（有声、高码率，拼接用）、`audio.wav`（这一段的声音，单独留着便于重新混音）、静帧、`save.json`（这一段结束时的存档）。之后只改剪辑、不重录时用 `--reuse`；只重录某几段用 `--only 3_day3,6_day6`。素材可以随时删掉，要用时再录。

## 组成

| 文件 | 作用 |
|---|---|
| `shim.js` | 注入页面：虚拟时间（rAF、定时器、CSS 动画逐帧推进）、AudioContext 换成离线渲染（声画同步）、固定随机种子、光标、字幕与卡片 |
| `record.mjs` | 录一段：按剧本操作、截图送 ffmpeg（NVENC）、导出 WAV、合成；也可单独运行 `node tools/video/record.mjs <剧本> <输出目录> [html] [存档.json]` |
| `play.mjs` | “玩家”：认出犹豫时刻、各小关卡、地图连线，用光标答对；`autoUntil` 快进时在镜头外处理无关事件 |
| `scenes/*.mjs` | 各段剧本（文件名排序即成片顺序）；`common.mjs` 是片头片尾与字幕文案 |
| `make.mjs` | 按顺序录各段（存档一段接一段）→ 转场拼接 → 响度 -16 LUFS → 两遍编码 |

## 游戏改了之后

- 小关卡界面（`games.js` 里的元素 id、类名）改了：改 `play.mjs` 对应的解法。
- 剧情顺序、触发时间改了：剧本用 `autoUntil(条件)` 等事件出现，一般不用改；新增关卡就在对应剧本里加一段。
- 字幕文案只在 `scenes/*.mjs` 与 `common.mjs` 里。

## 资源

- 一次只录一段（约 1.3 个 CPU 核、GPU 5%），浏览器以 `nice 10` 低优先级运行；`NICE=0` 关闭。
- 3D 用显卡（Vulkan）渲染，视频用显卡（NVENC）编码；`GPU=0`、`NVENC=0` 可退回软件方式。
- 录制器退出、出错或被中断时会关掉整组浏览器进程；跑完可用 `ps aux | grep "[c]hrome.*headless"` 确认无残留。
