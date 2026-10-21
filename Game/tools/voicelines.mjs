// 配音清单同步：按“源头”更新本机配音清单（Local/tts/lines.json，私有、不上传）——
//   旁白：src/narr.js 提示表（新句子补上、改了的重做、不用的移走）
//   人物：src/lines.js 台词表（邻居、老孙、孙女、背景人物每句都配；爷爷写了 voice 类别的配）
// 关卡里按剧本走的台词（摊主、驿站、裁判、诈骗电话、包饺子、讲座）还没进台词表，清单里原样保留。
// 用法：node tools/voicelines.mjs，然后在 Local/tts 跑 gen.py（只生成缺的）和 install.py；datacheck 会核对结果。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { allNarr, sayable } from '../src/narr.js';
import { LINES, voiceKeyOf, allLineTexts } from '../src/lines.js';
import { NEIGHBORS, PLACES, FAVORS } from '../src/data.js';

const game = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tts = path.join(game, '../Local/tts'), file = path.join(tts, 'lines.json');
if (!fs.existsSync(file)) { console.log('本机没有 Local/tts/lines.json（配音工具不在这台设备上），跳过'); process.exit(0); }
const lines = JSON.parse(fs.readFileSync(file, 'utf8'));
// 要重做的旧录音不删，移到 out/old/（可恢复）
const redo = (id) => { const f = path.join(tts, 'out', id + '.ogg'); if (fs.existsSync(f)) { fs.mkdirSync(path.join(tts, 'out/old'), { recursive: true }); fs.renameSync(f, path.join(tts, 'out/old', id + '.ogg')); } };
// 配音稿可能为了发音改过标点（“～”写成“！”等）：只比字，不比标点
const same = (a, b) => a.replace(/[\s～~！!。.，,、…？?：:；;“”「」]/g, '') === b.replace(/[\s～~！!。.，,、…？?：:；;“”「」]/g, '');
const newId = (key) => 'k_' + crypto.createHash('md5').update(key).digest('hex').slice(0, 10);

// 想要的：key → 条目
const want = new Map();
for (const t of allNarr()) want.set('narr|' + t, { text: sayable(t), voice: 'narr', cls: 'narr', style: 'say' });
const NBS = NEIGHBORS.map(n => n.id), places = [...Object.values(PLACES).map(p => p.name), '家'];
const varsOf = (id) => id === 'nb.way' ? places.map(target => ({ target })) : id.startsWith('favor.') ? Object.values(FAVORS) : [{}];
const ACTOR = { elder: 'A', acq: 'sun' };
for (const { id, who, text } of allLineTexts(varsOf)) {
  if (/\{/.test(text)) continue;
  if (who === 'elder' && !LINES[id].voice) continue;
  for (const w of who === 'nb' ? NBS : [who]) want.set(voiceKeyOf(w, text), { text, voice: ACTOR[w] || w, cls: who === 'elder' ? LINES[id].voice : 'role', style: 'say' });
}
// 由源头管的：旁白（除每天简介）和台词表里人物的前缀；不在源头里的就移走
const managed = (k) => (k.startsWith('narr|') && !/^narr\|intro\d+$/.test(k)) || /^(wang|li|zhao|chen|sun|friend|film)\|/.test(k);
let added = 0, changed = 0, removed = 0;
const keep = lines.filter(l => {
  if (!l.key) return true;
  const w = want.get(l.key);
  if (!w) { if (managed(l.key)) { removed++; redo(l.id); return false; } return true; }
  if (!same(l.text, w.text)) { l.text = w.text; changed++; redo(l.id); }
  if (w.cls && l.cls !== w.cls) l.cls = w.cls;
  want.delete(l.key); return true;
});
for (const [key, w] of want) { keep.push({ id: newId(key), key, ...w }); added++; }
fs.writeFileSync(file, JSON.stringify(keep, null, 1));
console.log(`配音清单：新增 ${added}，改了 ${changed}，移走 ${removed}`);
