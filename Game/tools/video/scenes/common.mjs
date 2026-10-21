// 各段剧本共用：片头片尾卡片、字幕文案。改文案只改这里。
export const TITLE = 'EXP.2086 · AIGCC 2026 小红花游戏 · 适老关怀';
export const INTENT = '爷爷记性变差了，但他仍想自己过日子——<br>我们想让玩家体会，好的帮助是帮他自己办成。';
export const titleCard = () => `
  <div style="font-size:88px;font-weight:800;letter-spacing:8px;text-shadow:0 4px 18px rgba(0,0,0,.35)">爷爷的一周</div>
  <div style="font-size:30px;margin-top:22px;line-height:1.65;max-width:900px;text-shadow:0 2px 10px rgba(0,0,0,.4)">${INTENT}</div>
  <div style="font-size:20px;margin-top:44px;opacity:.85;letter-spacing:1px">${TITLE}</div>`;
export const endCard = () => `
  <div style="font-size:58px;font-weight:800;letter-spacing:3px;text-shadow:0 4px 18px rgba(0,0,0,.35)">好的帮助，是帮他自己办成。</div>
  <div style="font-size:23px;margin-top:30px;line-height:1.85;max-width:980px;opacity:.95">《爷爷的一周》是一款认知科普游戏，不用于诊断或训练。<br>如果家人的记忆变化持续存在、影响生活，请到记忆门诊或神经内科咨询。</div>
  <div style="font-size:18px;margin-top:40px;line-height:1.8;opacity:.8">${TITLE}<br>程序与文案：Claude Opus 5.5 · 人物配音：Qwen3-TTS（本机生成）· 画面与音乐全部由代码生成</div>`;
