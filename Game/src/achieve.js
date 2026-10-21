// 成就与支持起作用：一周用了哪些支持、成就判定、支持起作用时头顶弹出的图标。依赖由 main.js 通过 initAchieve 注入。
import { DAYS, SUPPORTS, SUPPORT_SHORT } from './data.js';
import { thing } from './pictos.js';
import { icon } from './icons.js';
import { save } from './store.js';

import { persist, bubblesEl, sim } from './core.js';
import { graph } from './world.js';
import { setHomeAction } from './home.js';

export function initAchieve() {

}
// ---------- 成就 ----------
// 5 个（09-27 用户定）：一个成就对应游戏想教的一件事；不奖励“多用道具”，也不奖励小关卡成绩（小关卡在「记忆」页）
export const ACH = {   // icon：徽章上的图标（icons.js）
  enough: { icon: 'hand', name: '刚刚好', desc: '一周拿到 18 颗星以上，总共只用 7 点精力以内' },
  ask:    { icon: 'callAsk', name: '先问一句', desc: '一周 3 次，电话里只问一句，他就自己认出路' },
  street: { icon: 'neighbor', name: '老街坊', desc: '拜托的邻居，一周帮了他 5 次' },
  calm:   { icon: 'walk', name: '放心的一周', desc: '一整周，他每天都能自己出门，不用人陪' },
  stars:  { icon: 'trophy', name: '圆满的一周', desc: '集齐全部 21 颗星' },
};
// 一周里每种支持帮了几次（每天记一份：最好的那一次，不重复累计）
export function weekUsage() { const u = {}; for (const d of save.usageDay || []) if (d) for (const [k, n] of Object.entries(d)) u[k] = (u[k] || 0) + n; return u; }
function grantAch(id, list) {
  save.ach ||= [];
  if (save.ach.includes(id)) return;
  save.ach.push(id); list.push(id);
}
// isBest：这一次是不是这天最好的一次——只有最好的一次才改写这天的记录（和一周总结同一口径）；成就只加不减
export function evalAchievements(score, isBest = true) {
  const got = [], d = sim.dayIdx;
  // 每天记一份（只记最好的那一次）：今天的星、花掉的精力（早上布置＋白天补放）、电话里问一句就认出路的次数
  const stars = Object.values(score.stars).filter(Boolean).length, used = sim.day.energy + (sim.easy ? 1 : 0) - sim.energy;
  save.wk ||= {}; if (isBest) save.wk[d] = { callSelf: score.helps.callSelf || 0, used, stars };
  const wk = Object.values(save.wk), sum = (k) => wk.reduce((a, x) => a + (x[k] || 0), 0);
  if (wk.length >= DAYS.length && sum('stars') >= 18 && sum('used') <= 7) grantAch('enough', got);   // 少而够：模拟里只有会用电话、少放道具的玩家约两成拿得到
  if (sum('callSelf') >= 3) grantAch('ask', got);
  save.usageDay ||= []; if (isBest) save.usageDay[d] = { ...sim.used };
  if ((weekUsage().neighbor || 0) >= 5) grantAch('street', got);
  save.carryDay ||= []; if (isBest) save.carryDay[d] = persist.carry || null;
  if (DAYS.every((_, i) => i in save.carryDay) && !save.carryDay.some(c => c === 'worry' || c === 'lean')) grantAch('calm', got);   // 事事替他做的玩家拿不到（帮得太多＝lean）
  if (save.best.reduce((a, b) => a + (b?.stars || 0), 0) >= DAYS.length * 3) grantAch('stars', got);
  return got;
}

// ---------- 支持起作用：头顶弹出图标 ----------
export const HOME_USE = { photo: { spot: 'photo', anim: 'look', happy: true }, pillbox: { spot: 'table', anim: 'eat', happy: true }, stove: { spot: 'stove', anim: 'cook' }, pact: { spot: 'phone',
  anim: 'phone' }, calendar: { spot: 'calendar', anim: 'look' }, song: { spot: 'stove', anim: 'cook', happy: true } };
export function supportUsed(type) {
  const s = SUPPORTS[type]; if (!s) return;
  const chip = document.createElement('div'); chip.className = 'usechip';
  chip.innerHTML = `${thing(type, 18)}${SUPPORT_SHORT[type] || s.name}`; bubblesEl.appendChild(chip);
  chip._born = performance.now(); useChips.push(chip);
  if (HOME_USE[type]) setHomeAction({ ...HOME_USE[type], t: 4 });
}
export const useChips = [];
// 他认得的路口有多少（结局用）
export function familiarCount() { if (!sim.day) return { n: 0, all: 0 }; let n = 0, all = 0; graph.adj.forEach((a, i) => { if (!a.length) return; all++; if (sim.familiar(i) || sim.helperNear(i)) n++; }); return { n, all }; }

// 成就徽章：六边形（和道具、头像同一种形状），拿到的金底白图标，没拿到的灰
export const achBadge = (id, on = true, size = 44) => `<span class="ach-badge${on ? ' on' : ''}" style="--s:${size}px">${icon(ACH[id].icon, Math.round(size * 0.5), 2)}</span>`;
// 成就一览：一周总结里显示拿到了几个（只数现在还有的成就，旧存档里去掉的不算）；手册里当说明看（guide），全部点亮、不计数（09-27 用户）
export function achHtml(guide = false) {
  const have = guide ? new Set(Object.keys(ACH)) : new Set((save.ach || []).filter(id => ACH[id]));
  return `<h3 class="sm-h">成就${guide ? '' : ` ${have.size} / ${Object.keys(ACH).length}`}</h3><div class="ach-list">` +
    Object.entries(ACH).map(([id, a]) => `<div class="${have.has(id) ? 'on' : ''}">${achBadge(id, have.has(id))}<b>${a.name}</b><span>${a.desc}</span></div>`).join('') + '</div>';
}
