// 朗读提示表：设置里“朗读提示”打开时，旁白念出的每一句都在这里（界面上显示的也是同一句，唯一来源）。
// 念什么（Docs/声音设计.md“朗读提示”）：只念“现在要你做什么、正在发生什么”——每天开头、操作提示、小关卡开头的做法、犹豫时刻的情形、邻居托的事。
// 不念：人物已经说出口的话（有人物配音）、结果与得分、科普卡与讲座正文、手册、提醒页、结算、事件记录、按钮文字。
// 写法：念的字＝屏幕上的字；「」✓★ 这类符号在配音稿里改成能念的说法（sayable）。一句尽量短、口语。
// 配音：tools/datacheck.mjs 核对 allNarr() 里每一句都有配音；新增或改了句子，用 tools/voicelines.mjs 更新配音清单再生成。
import { SUPPORTS, NEIGHBORS, MOMENTS, FAVORS } from './data.js';

export const NARR = {
  // 早上布置
  firstCard: '先点一张道具卡。',
  plan: '圆点是他今天要走的路，雾是他不熟的地方，「？」处他可能犹豫。放好道具，就点「出发」。',
  placeSign: '点地图上带「？」的路口，把路标放下。',
  placeNeighbor: '点一户邻居家。拜托后，邻居会留意自家门口圈出来的路口；他走岔了，邻居看见也会过来领一段。',
  placeElse: '点地图上要放的地方。',
  readyGo: '放好了。还有精力可以再放；准备好了就点「出发」。',
  homeTap: '爷爷的家。家里的道具，点下方卡片就能放。',
  opening1: '雾，是他心里不认得的路。',   // 开场点题（暂定）
  opening2: '让路好认一些，他还能自己走。',
  learn: '他在这儿认出了路，这里的雾散了。今天他记得，明天可能又生疏了——路标和邻居的帮助会一直在。',
  // 白天
  out: '他出门了。剩下的精力，随时可以用。',
  moment: '他犹豫了。先「等一等」，不行再「提示」，最后才「直接告诉」。他自己想起来，才算他自己办成的。',
  stopped: '他在路口停下了。可以「电话」问问他看到了什么；他要是慌了，再「陪同」陪他走一段。',
  hesitateSign: '他在路口犹豫。可以趁现在放个「路标」。',
  askNow: '他在路口停下来想方向。趁现在打个「电话」问一句，他多半能自己认出路。',
  changed: '老电影院改成了手机店，他在这儿认不出路。家里要是挂着那张老照片，他就认得出来。',
  error: '出了点小问题，可以刷新页面继续，已完成的天数会保留。',
  // 小关卡开头：做法（关卡里人物自己说的话不在这里）
  recall0: '早饭时他念叨过清单，把记得的放进篮子。',
  recall2: '他想起了菜名。做这道菜要用到什么？',
  recall3: '摊主把别的菜挪开了。要买的就在剩下这几样里。',
  digits: '手机没带，只能靠记。按短信里的顺序输入取件码。',
  clock: '修好闹钟：把掉下来的数字装回钟面，再把指针拨到现在的时间。',
  change: '结账：带了 100 元，每样 7 块。摊主一样一样装袋，帮他算算还剩多少。',
  trail: '社区健步走：看示范，然后从 1 开始连。依次点圆圈，或按住滑过去。',
  route: '给他指路：点亮起的圆圈，或从橙圈按住滑过去。★ 是他认得的地方，从那儿走他更不容易记错。',
  chess: '照着棋谱，把棋子拖到棋盘的交叉点上。摆错了，拖走重摆。',
};
const DAILY = new Set(['note', 'song']);
// 选中一张道具卡
export const narrCard = (type) => {
  const s = SUPPORTS[type], how = s.target === 'node' ? '点一个带「？」的路口放下。' : '点一户邻居家。';
  return `「${s.name}」：${s.tip}${how}精力 ${s.cost}，${DAILY.has(type) ? '只管今天' : '一直有效'}。`;
};
export const narrPlaced = (type) => `「${SUPPORTS[type].name}」放在家里了：${SUPPORTS[type].tip}`;
export const narrNeighborTap = (nb, asked) => `${nb.name}家。${asked ? '已经拜托过了。' : '可以用「拜托邻居」请他们留意。'}`;
export const narrNeighborAsked = (nb) => `拜托了${nb.name}：看到爷爷犹豫，会出门打个招呼。`;
export const narrFavor = (f) => `${f.name}托他顺路带${f.item}。他答应了，出门在外，可别忘了。`;
// 犹豫时刻：情形（标题那句是他自己说的，有人物配音）
export const narrMoment = (kind) => MOMENTS[kind]?.ctx || '';

// 全部会念到的句子（配音清单、检查用）
export function allNarr() {
  const out = [...Object.values(NARR)];
  for (const t of Object.keys(SUPPORTS)) out.push(SUPPORTS[t].target === 'home' ? narrPlaced(t) : narrCard(t));   // 家里的道具点了就放下，只有“放好了”一句
  for (const nb of NEIGHBORS) out.push(narrNeighborTap(nb, true), narrNeighborTap(nb, false), narrNeighborAsked(nb));
  for (const f of Object.values(FAVORS)) out.push(narrFavor(f));
  for (const k of Object.keys(MOMENTS)) if (MOMENTS[k].ctx && k !== 'stove') out.push(narrMoment(k));   // stove 是备用剧情，当前不出现
  return [...new Set(out)];
}
// 配音稿：符号换成念得出的说法
export const sayable = (t) => t.replace(/「？」/g, '问号').replace(/★\s*/g, '星星').replace(/✓/g, '对勾').replace(/[「」]/g, '');
// 每天开头的简介另按天存（narr|intro0…），文字就是 DAYS[i].intro
