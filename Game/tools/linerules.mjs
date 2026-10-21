// 台词合不合场景：按时间、场景（去／回、下雨、在哪）、人物与关系（谁怎么称呼谁）核对游戏里实际说出的每一句。
// 数据来自 core.js 的 lineLog（walkcheck 跑 7 天时打开）。规则写成“句子里有什么词 → 必须满足什么”，新写台词时照着加。
import { REPEAT_GAP } from '../src/lines.js';   // 同一个人多久之内不重复同一句（和选句用同一个数）
const NB = ['wang', 'li', 'zhao', 'chen'];
const NAME = { elder: '爷爷', kid: '孙女', acq: '老孙', wang: '王阿姨', li: '刘师傅', zhao: '赵大爷', chen: '陈老板' };
// 各人怎么称呼爷爷（关系）：陈老板是晚辈叫“李叔”，其他老街坊叫“老李”，孙女叫“爷爷”
const CALL = { wang: ['老李'], li: ['老李'], zhao: ['老李'], chen: ['李叔'], acq: ['老李'], kid: ['爷爷'] };
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
const RULES = [
  // 时间
  [/早饭|早啊|^早|，早/, (l) => l.t < 600, '问早要在上午十点前'],
  [/天快黑|天黑/, (l) => l.t >= 1000, '说天黑要在傍晚'],
  // 场景：去还是回
  [/回来啦|回来了|回家啦|回家呀|回家走/, (l) => l.who === 'elder' || l.leg === 'back', '说“回来”时他得是在回家的路上'],
  [/上哪儿去|出门|遛弯|出去/, (l) => !NB.includes(l.who) || l.leg !== 'back', '问“上哪去／出门”时他不能是在回家'],
  [/下雨|雨天|带伞/, (l) => l.rain, '说下雨时得真在下雨'],
  // 指路：说的地方就是他要去的地方
  [/^往(.+)是这边/, (l, m) => m[1] === (l.leg === 'back' ? '家' : l.target), '指的方向和他要去的地方对不上'],
  // 托带的事
  [/托我带/, (l) => l.who === 'elder' && l.leg === 'go', '想起托带的事应在去办事的路上'],
  [/忘带了/, (l) => l.who === 'elder' && (l.mode === 'home' || !l.leg), '发现忘带应在回到家时'],
  // 说法：头顶气泡是他本人说的话，不放旁白叙述；地名说地方本身，不说“某某附近的路口”；回家说“回家”不说“去家”
  [/^他/, (l) => l.who !== 'elder', '爷爷的气泡里是旁白叙述（第三人称），应只放他说的话'],
  [/附近的路口/, () => false, '说话里用了“某某附近的路口”，应说地方的名字'],
  [/去家/, () => false, '回家说成了“去家”'],
  // 人物：孙女只在接她的时候说话
  [/./, (l) => l.who !== 'kid' || l.task === 'pick', '孙女只在接她时出场'],
];
export function checkLines(list) {
  const out = new Set();
  // 同一个人一小时内重复同一句（09-28 王阿姨连说两遍“早啊老李”）：按天、按说话人查
  const seen = {};
  for (const l of list) { if (!/[一-鿿]/.test(l.text)) continue;   // “……”这类思考气泡不算
    const k = l.day + '|' + l.who + '|' + l.text; if (seen[k] != null && l.t - seen[k] < REPEAT_GAP) out.add(`第 ${l.day} 天 ${clock(l.t)} ${NAME[l.who] || l.who}：“${l.text}”——${l.t - seen[k]} 分钟内说了两遍`); seen[k] = l.t; }
  for (const l of list) {
    for (const [re, ok, why] of RULES) { const m = l.text.match(re); if (m && !ok(l, m)) out.add(`第 ${l.day} 天 ${clock(l.t)} ${NAME[l.who] || l.who}：“${l.text}”——${why}（${l.leg === 'back' ? '回家路上' : l.leg === 'go' ? '去' + (l.target || '') + '的路上' : l.mode}${l.rain ? '，下雨' : ''}）`); }
    // 称呼：说话人叫爷爷要用自己的叫法
    const calls = CALL[l.who];
    if (calls) for (const c of ['老李', '李叔', '李大爷', '爷爷']) if (l.text.includes(c) && !calls.includes(c)) out.add(`第 ${l.day} 天 ${clock(l.t)} ${NAME[l.who]}：“${l.text}”——${NAME[l.who]}应称他“${calls.join('／')}”`);
  }
  return [...out];
}
