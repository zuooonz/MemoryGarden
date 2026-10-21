// 片头 + 开场（约 30 秒）+ 第 1 天完整走一遍：布置 → 早饭念菜单 → 犹豫时刻（先等一等，再提示）→ 菜摊回忆 → 找零 → 往事 → 三颗星
import { player } from '../play.mjs';
import { titleCard } from './common.mjs';
export const meta = { day: 1, audioSec: 480, opening: true, save: { day: 0, best: [], persist: null, snap: [] } };   // opening：第一次点「开始」放开场
export default async (api) => {
  const P = player(api);
  P.memory = { caption: '走到往事发生的地方，他讲起一段往事', sub: '几十年前的事，他记得清清楚楚' };
  // 片头：先藏起标题弹窗，只看夕阳下的小镇和片名
  await api.js(`document.querySelector('#modal').style.visibility='hidden'`);
  await api.skip(1);
  api.rec(true);
  await api.card(titleCard(), 0.5); await api.wait(7.5);
  await api.card(null); await api.wait(1.2);
  await api.js(`document.querySelector('#modal').style.visibility=''`);
  await api.wait(1.5);
  await P.openDay({ intro: 4 });
  // 早上布置
  await api.caption('早上，在他要走的路上布置道具', '路标、药盒、邻居……每样花一点精力')
  await api.wait(2.5);
  await P.place('路标', '#bubbles .risk', { after: 1.6 });
  await api.caption('「？」是他可能犹豫的路口；雾是他不熟的地方');
  await api.wait(2.5);
  await api.caption(null);
  await api.click('#startBtn', { after: 0.6 });
  // 早饭念菜单
  await api.until(`!document.querySelector('#game').classList.contains('hidden')`, 5);
  await api.caption('早饭时，他念叨今天要买的菜', '记一记——到了菜摊，他可能想不起来');
  await P.game('learn');
  await api.caption(null);
  await P.watch(2);
  // 犹豫时刻
  await P.autoUntil(`__mg.sim.moment`);
  await api.wait(1.2);
  await api.caption('他犹豫了：药到底吃了没有？', '帮助从少到多：先等一等，再轻轻提示，最后才直接告诉');
  await api.wait(3.5);
  await P.moment(['wait']); await P.watch(3.5);
  if (await api.js(`!!__mg.sim.moment`)) { await P.moment(['cue']); await P.watch(4); }
  await api.caption('他自己想起来，才算「他自己办的」');
  await P.watch(3.5);
  await api.caption(null);
  // 出门：看一会儿他走路
  await P.autoUntil(`__mg.sim.e && __mg.sim.e.mode==='walk'`);
  await api.caption('他按自己的习惯出门', '认得的路走得稳，陌生的路口会犹豫');
  await P.watch(5);
  await api.caption(null);
  // 菜摊回忆
  await P.autoUntil(`!document.querySelector('#game').classList.contains('hidden')`);
  await api.wait(0.8);
  await api.caption('菜摊前，他问你：“我要买什么来着？”', '早饭时念过的清单——延迟回忆');
  await P.game('recall', { think: 2 });
  await api.caption(null);
  await api.until(`!document.querySelector('#game').classList.contains('hidden')`, 8);
  await api.wait(0.5);
  await api.caption('结账：带了 100 元，每样 7 块', '连续减 7——不显示余额，要自己记住上一步');
  await P.game('change', { think: 1.5 });
  await api.caption(null);
  // 一天的结尾：往事
  // 往事没在白天讲，就在傍晚回家后讲（P.memory 还在说明白天没讲）
  await P.autoUntil(`(document.body.classList.contains('evening') && __mg.sim.phase!=='live') || !document.querySelector('#modal').classList.contains('hidden')`);
  if (P.memory) await api.caption('一天过完，他讲起一段往事');
  await api.until(`!document.querySelector('#modal').classList.contains('hidden')`, 60);
  await api.caption('三颗星：都办成了 · 他自己办的 · 好心情', '结算会告诉你：你的帮助是不是来得刚刚好');
  await api.wait(7);
  await api.still('day1_summary');
  await api.caption(null); await api.wait(0.6);
  // 结算一出现游戏就已存档，下一段从这份存档接着玩
};
