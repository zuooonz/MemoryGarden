// 第 7 天：提前放路标 → 象棋比赛照棋谱摆残局 → 一周的结局 → 片尾
import { player } from '../play.mjs';
import { endCard } from './common.mjs';
export const meta = { day: 7, audioSec: 400 };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 3 });
  await api.caption('第 7 天 · 象棋比赛', '去东头水果摊是条新路：提前在「？」路口放好路标');
  await api.wait(1.5);
  await P.signAll(3);
  await api.wait(1); await api.caption(null);
  await api.click('#startBtn', { after: 0.3 });
  api.rec(false);
  await P.autoUntil(`document.querySelector('#cBoard')`);
  api.rec(true);
  await api.caption('照着棋谱，把残局摆好', '样子一直摆在旁边——照样子摆');
  await P.game('chess');
  await api.caption(null);
  api.rec(false);
  await P.autoUntil(`document.querySelector('#bEnd')`);
  api.rec(true);
  await api.wait(3);
  await api.click('#bEnd', { after: 0.5 });
  await api.caption('一周总结', '他的心情，他自己办成的事，你是怎么帮的');
  await api.wait(7);
  await api.still('ending');
  await api.caption(null);
  await api.cursor(false);
  // 片尾：收起结局弹窗和界面，只留傍晚的小镇当背景，再淡入结语
  await api.js(`const st=document.createElement('style'); st.textContent='#modal,.hud,#hudR,#gp,#dock,#actions,#feed,#hint,#bubbles,#maplayer{opacity:0!important;transition:opacity .6s!important}'; document.head.appendChild(st)`);
  await api.wait(0.8);
  await api.card(endCard(), 0.62);
  await api.wait(9);
};
