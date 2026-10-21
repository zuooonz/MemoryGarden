# 第三方组件与工具 / Third-party

## 打包进游戏的代码

| 组件 | 版本 | 许可 | 说明 |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.186.0 | MIT，Copyright © 2010-2026 three.js authors | 3D 渲染；版权声明保留在构建产物开头 |

## 开发工具（不进入游戏）

| 工具 | 许可 | 用途 |
|---|---|---|
| [esbuild](https://github.com/evanw/esbuild) | MIT | 打包成单个 HTML |
| [acorn](https://github.com/acornjs/acorn)、acorn-walk | MIT | 代码检查脚本 |
| Chromium（Playwright 自带） | BSD 等 | 无头浏览器自动测试 |

## 素材

- 3D 场景、人物、车辆、图标全部由代码程序化生成，没有使用外部图片或模型；音乐和音效在浏览器里实时合成。
- 配音：约 300 句，用 Qwen3-TTS 1.7B（通义千问开源语音合成，Apache-2.0）在本机离线生成。每个角色的声线按文字描述设计，不模仿、不克隆任何真人；用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper)（MIT）核对念得对不对。
- 字体：使用系统自带字体，不随游戏分发字体文件。

## 参考

- 技术方法参考了 [riba2534/claude-opus-5-5-demo](https://github.com/riba2534/claude-opus-5-5-demo)（Three.js 程序化 3D、单文件），没有复制其代码与内容。
- 认知小关卡的题型参考阿尔茨海默症筛查量表的公开研究文献（见 `Docs/研究/`），仓库不收录量表原题、指导语、答案或计分细则。
