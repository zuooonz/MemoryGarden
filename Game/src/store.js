// 设置与存档：读写 localStorage。其他模块直接引用同一个 settings／save 对象（只改属性，不整体替换）。
import { DAYS } from './data.js';

// ---------- 设置（适老化） ----------
export const settings = { font: 1, easy: false, vol: 2, tips: 2, gfx: 'auto', voice: true, narr: false, fog: 1 };   // fog：雾的浓淡 1 标准、2 淡
try { const saved = JSON.parse(localStorage.getItem('mg-settings') || '{}'); settings.font = saved.font || 1; settings.easy = false; settings.vol = saved.vol ?? 2; settings.tips = saved.tips || 2;
  settings.gfx = saved.gfx || 'auto'; settings.voice = saved.voice ?? true; settings.narr = saved.narr ?? false; settings.fog = saved.fog === 2 ? 2 : 1; } catch { }
export function saveSettings() { try { localStorage.setItem('mg-settings', JSON.stringify(settings)); } catch { } }

// ---------- 存档 ----------
// 结构（v1）：v 版本号；day 进行到第几天（0 起）；best[天] 每天最好成绩；persist 当前的跨天支持；snap[天] 每天开头的支持快照；
// ach 成就；tasks 小任务记录；wk[天] 这天的星、花掉的精力、电话里问一句就认出路的次数；usageDay[天] 当天用了哪些支持；carryDay[天] 这天留给明天的（家里不放心等）；finished 一周已结束
export const SAVE_VERSION = 1;
const blankSave = () => ({ v: SAVE_VERSION, day: 0, best: [], persist: null, snap: [], ach: [], tasks: {}, wk: {}, usageDay: [], carryDay: [], finished: false });
// 升级表：旧版本 → 下一版本。以后改存档结构，就在这里加一步（不要改已有的步骤）
const MIGRATIONS = {
  0: (s) => ({ ...s, v: 1 }),   // 初赛版及以前：没有版本号，字段按需才有——补齐在下面统一做
};
export function migrateSave(raw) {
  let s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  for (let v = s.v || 0; v < SAVE_VERSION; v = s.v) s = MIGRATIONS[v](s);
  if (typeof s.day === 'string' && /^\d+$/.test(s.day.trim())) s.day = +s.day;   // 天数存成了字符串：先转回数字，别当成坏数据清零
  // 补齐与兜底：缺的字段用默认值；类型不对的（比如被写坏）只恢复这一项，不清掉别的进度
  const b = blankSave();
  for (const k of Object.keys(b)) {
    if (k === 'persist') { if (s.persist !== null && (typeof s.persist !== 'object' || Array.isArray(s.persist))) s.persist = null; continue; }
    if (s[k] === undefined || Array.isArray(s[k]) !== Array.isArray(b[k]) || typeof s[k] !== typeof b[k]) s[k] = b[k];
  }
  if (!Number.isInteger(s.day) || s.day < 0 || s.day >= DAYS.length) s.day = Math.max(0, Math.min(DAYS.length - 1, Math.floor(+s.day) || 0));
  return s;
}
function loadSave() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem('mg-save') || 'null'); } catch { }
  return migrateSave(raw);
}
export const save = loadSave();
export function writeSave() {
  try { localStorage.setItem('mg-save', JSON.stringify(save)); } catch { }
}
// 重置：全部清空（进度、星星、成就、小任务记录都清；用户 09-27），原地清空——其他模块拿着的仍是同一个对象
export function resetSave() { for (const k of Object.keys(save)) delete save[k]; Object.assign(save, blankSave()); }
export function persistToJSON(p) { return { signs: [...p.signs], photos: [...p.photos], home: [...p.home], neighbors: [...p.neighbors], leaked: !!p.leaked, carry: p.carry || null }; }

// ---------- 小任务记录（只记完成方式，不计分） ----------
export const TASKS = {
  recall:    { name: '帮他想起菜单', skill: '记忆：先学习，隔一段时间再回忆' },
  change:    { name: '帮他算找零', skill: '计算与工作记忆：连续减法' },
  digits:    { name: '记住取件码', skill: '注意与短时记忆：记住一串数字的顺序' },
  trail:     { name: '连出健步走路线', skill: '注意与思路切换：两套顺序交替进行' },
  clock:     { name: '修好摔坏的闹钟', skill: '计划与空间：把数字装回钟面，拨到现在的时间' },
  steps:     { name: '跟爷爷学包饺子', skill: '理解并执行多步指令' },
  vigilance: { name: '听出诈骗电话的破绽', skill: '持续注意：只对特定信息做反应' },
  chess:     { name: '帮他摆好残局', skill: '空间与结构：照着样子摆放' },
};
