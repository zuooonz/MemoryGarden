// 存档升级检查：不开浏览器，用几种存档样本检验 store.js 的 migrateSave——旧版本能升级、坏存档只修坏的部分、进度不丢。
// 用法：node tools/savecheck.mjs（有问题以状态 1 退出）。改存档结构、加升级步骤时，在 CASES 里加对应样本。
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const { migrateSave, SAVE_VERSION } = await import('../src/store.js');

// 初赛版（v0，无版本号）真实存档的样子：第 3 天、两天成绩、成就与快照
const V0 = { day: 2, best: [{ stars: 3, tries: 1, mood: 80 }, { stars: 2, tries: 2, mood: 66 }], persist: { signs: [12], photos: [], home: ['pillbox'], neighbors: ['liu'], leaked: false },
  snap: [null, { signs: [], photos: [], home: [], neighbors: [] }], ach: ['self1'], tasks: { recall: { status: 'self', day: 1 } } };
const CASES = [
  ['空存档（第一次玩）', null, (s) => s.day === 0 && s.best.length === 0 && s.persist === null],
  ['损坏的 JSON', '{不是json', (s) => s.day === 0 && Array.isArray(s.ach)],
  ['初赛版 v0 存档：进度与成绩原样保留', V0, (s) => s.day === 2 && s.best[1].stars === 2 && s.persist.home[0] === 'pillbox' && s.ach[0] === 'self1' && s.tasks.recall.status === 'self'],
  ['初赛版 v0 存档：补齐缺的字段', V0, (s) => Array.isArray(s.carryDay) && Array.isArray(s.usageDay) && typeof s.wk === 'object' && s.finished === false],
  ['字段被写坏：只修坏的，其余保留', { day: 1, best: 'oops', ach: ['a'], snap: 5, persist: [1, 2] }, (s) => s.day === 1 && Array.isArray(s.best) && s.ach[0] === 'a' && Array.isArray(s.snap) && s.persist === null],
  ['天数越界：拉回范围内', { v: 1, day: 99 }, (s) => s.day === 6],
  ['天数不是整数', { day: '2' }, (s) => s.day === 2],
  ['已是当前版本：原样不变', { ...V0, v: SAVE_VERSION, favorDays: [3], usageDay: [], wk: {}, finished: true }, (s) => s.finished === true && s.favorDays[0] === 3 && s.day === 2],
];
let bad = 0;
for (const [name, raw, ok] of CASES) {
  // 与游戏里读档一样：先按字符串存再解析（损坏的 JSON 由 loadSave 兜底，这里直接给 migrateSave 空值）
  let parsed = null;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw)); } catch { parsed = null; }
  const s = migrateSave(parsed);
  const pass = s.v === SAVE_VERSION && ok(s);
  if (!pass) { bad++; console.log(`✗ ${name}\n  得到：${JSON.stringify(s).slice(0, 200)}`); }
}
console.log(bad ? `${bad}/${CASES.length} 个存档样本没通过` : `存档升级检查通过（${CASES.length} 个样本，当前版本 v${SAVE_VERSION}）`);
process.exit(bad ? 1 : 0);
