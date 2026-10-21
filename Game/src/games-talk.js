// 小关卡：第 3 天健康讲座（翻页科普；健步走连线在 mapops.js）（由 games.js 拆出，09-27）
import { stopVoice } from './audio.js';
import { speak, open, close, once } from './game-kit.js';

// 讲座：早期变化、何时就医、身边的人怎么帮 + 连线小游戏（参考 MoCA 交替连线：1→甲→2→乙……）
const TALK = [   // 09-29 用户定稿（对照 Mayo Clinic 资料核对过）：变化 → 何时去看 → 身边的人怎么帮；都是社区医生讲普遍知识，不涉及游戏情节
  { t: '认知障碍早期可能出现的变化', b: '刚发生的事记不住、同样的话反复问；熟悉的地方也会迷路；分不清日期；做了几十年的事变得吃力。阿尔茨海默病是其中最常见的一种。' },
  { t: '偶尔忘事，不等于生病', b: '人人都会忘事。要是这些变化一直在、越来越影响生活，就早点去医院的记忆门诊或神经内科看看，担心家里老人，可以陪他一起去。引起这些变化的原因不止一种，有些是可以治疗的。' },
  { t: '身边的人可以这样帮', b: '家里用醒目的日历和分格药盒，出门带张写着住址和家人电话的卡片。想不起来时，先等一等、再轻轻提示，别考问、别争辩。让老人照常做熟悉、喜欢的事，作息规律。' },
];
export function talkEvent(sfx, done) {
  done = once(done);
  let k = 0;
  const show = () => {
    const c = TALK[k];
    const g = open(`<div class="gk">社区健康讲座 · ${k + 1}/${TALK.length}</div><div class="gt">${c.t}</div><p class="gb">${c.b}</p>
      <div class="row"><button class="primary" id="gNext">${k < TALK.length - 1 ? '下一页' : '讲完了，去健步走'}</button></div>`);
    speak('talk' + k);
    g.querySelector('#gNext').onclick = () => { sfx('click'); stopVoice('game'); k++; if (k < TALK.length) show(); else { close(); done(); } };   // 翻页、讲完都先停掉这一页的话
  };
  show();
}

