// 界面像素比对用的“状态巡游”：用录制工具的虚拟时间与固定种子，把游戏走到各个界面状态，隐藏 3D 画面后截图（只比界面层）。
// 由 tools/uidiff.mjs 调用；每个状态存一张 <名字>.png。
import { player } from '../video/play.mjs';
export const meta = { day: 1, audioSec: 200, save: { day: 0, best: [], persist: null, snap: [] }, settings: { voice: false, tips: +(process.env.UI_TIPS || 2), font: +(process.env.UI_FONT || 1) } };   // 关配音：配音解码是真实异步，会让剧情时序有几帧偏差
export default async (api) => {
  const P = player(api);
  const hide3d = () => api.js(`document.querySelector('#view').style.visibility='hidden'; document.body.style.background='#7f8c7a'; 1`);
  const snap = async (name, settle = 1.2) => { await api.skip(settle); await hide3d(); await api.skip(0.05); await api.still(name); };
  await snap('01_title', 2);
  await api.js(`document.querySelector('#bSet').click()`); await snap('02_settings');
  await api.js(`document.querySelector('#bSetOk').click()`); await api.skip(0.5);
  await api.js(`document.querySelector('#bBook').click()`); await snap('03_handbook');
  await api.js(`(document.querySelector('#bBack')||[...document.querySelectorAll('#modal button')].find(b=>/返回/.test(b.textContent)))?.click()`); await api.skip(0.5);
  await api.js(`document.querySelector('#bRemind').click()`); await snap('04_reminder');
  await api.js(`(document.querySelector('#bRemOk')||document.querySelector('#bBack'))?.click()`); await api.skip(0.5);
  await api.until(`document.querySelector('#bGo')`, 5, { rec: false });
  await api.js(`document.querySelector('#bGo').click()`); await snap('05_dayintro');
  await api.js(`document.querySelector('#bPlan').click()`); await snap('06_plan', 2);
  await api.js(`document.querySelector('#cards .card')?.click()`); await snap('07_cardsel');
  await api.js(`document.querySelector('#startBtn').click()`); await api.skip(0.3);
  await api.until(`document.querySelector('#lS')`, 5, { rec: false }); await snap('08_learn', 1.5);
  await api.until(`document.querySelector('#lOk')`, 30, { rec: false }); await api.js(`document.querySelector('#lOk').click()`);
  await api.skip(2); await snap('09_live');
  await P.autoUntil(`__mg.sim.moment`); await snap('10_moment', 1.5);
  await api.js(`document.querySelector('#moment button[data-id="cue"]')?.click()`); await api.skip(1);
  await api.js(`document.querySelector('#bagBtn')?.click()`); await snap('11_dockopen');
  await api.js(`document.querySelector('#bagBtn')?.click()`); await api.skip(0.5);
  await P.autoUntil(`document.querySelector('#rOk')`); await snap('12_recall', 1.5);
  await api.js(`document.querySelector('#rHelp').click()`); await api.skip(0.3); await api.js(`document.querySelector('#rHelp').click()`); await api.skip(0.5); await snap('13_recall_hint');   // 第二层提醒：告诉他菜名
  await api.js(`document.querySelector('#rHelp').click()`); await api.skip(0.5); await api.js(`document.querySelector('#game .food:not(.gone)').click(); document.querySelector('#rOk').click()`); await api.skip(3);   // 第三层：摊主挑出几样；拿一样就交
  await P.autoUntil(`document.querySelector('#cT')`); await snap('14_change', 1);
  await api.js(`document.querySelector('#game .keypad [data-k="9"]').click(); document.querySelector('#game .keypad [data-k="3"]').click()`); await snap('14b_change_typed', 0.5);   // 按了两位：数字要横着排在一行（刚按的那位弹一下）
  await api.js(`document.querySelector('#game .keypad [data-k="del"]').click(); document.querySelector('#game .keypad [data-k="del"]').click()`); await api.skip(0.2);
  await api.js(`window.__mg.sim.phase`);
  await P.autoUntil(`document.querySelector('#bNext')`); await snap('15_summary', 3);
  // 小关卡单独打开（调试入口），不走剧情
  for (const [n, js] of [['16_clock', '__mg.clockG()'], ['17_chess', '__mg.chessG()'], ['18_steps', '__mg.steps()'], ['19_scam', '__mg.scam(false)']]) {
    await api.js(`document.querySelector('#modal').classList.add('hidden'); ${js}; 1`); await snap(n, 2);
  }
  await api.js(`document.querySelector('#game').classList.add('hidden'); __mg.ending(); 1`); await snap('20_ending', 2);
  // 地图操作与静观（这些状态下有不少覆盖样式）
  await api.js(`document.querySelector('#modal').classList.add('hidden'); __mg.trailMap(); 1`); await snap('21_trail', 3);
  await api.js(`document.querySelector('#mappanel').classList.add('hidden'); document.body.classList.remove('in-map'); __mg.routeGuide(__mg.sim.homeNode, 30); 1`); await snap('22_route', 1.5); if (process.env.UI_DBG) console.error('ROUTECAM ' + JSON.stringify(await api.js(`__mg.sight()`)));
  await api.js(`document.querySelector('#mappanel').classList.add('hidden'); document.body.classList.remove('in-map'); document.body.classList.add('watch'); 1`); await snap('23_watch', 1);
};
