// 页面：手册、记忆（界面层；标题画面和顶栏菜单都会打开）
import { $ } from './core.js';
import { HANDBOOK, SUPPORTS, WARNING_SIGNS } from './data.js';
import { TASKS, save } from './store.js';
import { closeModal, modal } from './stage.js';
import { hint } from './ui.js';
import { sfx } from './audio.js';
import { thing } from './pictos.js';
import { achHtml } from './achieve.js';

export function showHandbook(back, backLabel = '返回') {
  // 版式（09-27 重排）：左栏是规则（星、当下帮忙、心情、昨天影响今天），右栏是道具和成就；手机上按这个顺序纵向排。
  // 道具卡只留一眼要看的：名字、精力、一句作用、一句现实做法；“一直有效”不写，只标“只管今天”的
  const SHORT = { sign: '路口认得出，更愿意走这条路', note: '要买的、邻居托的，都记着', pillbox: '吃没吃过，一眼知道', neighbor: '他犹豫、迷路时，出来指路', calendar: '今天星期几，一看就知道', photo: '看着踏实；老地方变了也认得', song: '心情好，做事更投入', pact: '要钱的电话，先挂断再核实' };
  const TODAY_ONLY = new Set(['note', 'song']);
  const cards = Object.entries(SUPPORTS).map(([k, s]) => `<div class="hb2-card"><div class="hb2-top">${thing(k,
    28)}<b>${s.name}</b>${TODAY_ONLY.has(k) ? '<i class="hb2-today">只管今天</i>' : ''}<span class="hb-cost">-${s.cost}</span></div><p>${SHORT[k] || s.tip}</p><small>${HANDBOOK[k]}</small></div>`).join('');
  const tag = (t, c) => `<span class="hb2-tag ${c}">${t}</span>`;
  const row = (b, ...parts) => `<div><b>${b}</b><span>${parts.join('')}</span></div>`;
  const ok = (t) => `<em class="ok">✓ ${t}</em>`, no = (t) => `<em class="no">✗ ${t}</em>`;
  // 标题栏滚动时一直在顶上；「返回」在右下角，所有弹窗的按钮行都固定在底部
  modal(`<div class="hb-head"><h2>手册</h2></div>
    <div class="hb-lay">
    <div class="hb-col">
    <section>
    <h3 class="sm-h">三颗星</h3>
    <div class="hb2-rows">
      ${row('都办成了', '今天的事都办成（谁帮忙都算）')}
      ${row('他自己办的', '他自己办成的占七成以上（及时帮一把的算一半）；你替他做的不算')}
      ${row('心情', '一天结束时 ≥ 65（从 60 起）')}
    </div>
    </section>
    <section>
    <h3 class="sm-h">当下帮忙 · 不花精力，看时机</h3>
    <div class="hb2-rows">
      ${row('电话', ok('先问他看到什么：他自己认出路，算他的'), ok('指路最多 3 个路口，之后靠他，仍算他的'), no('他慌得走不动时，说什么都听不进'))}
      ${row('陪同', ok('他慌了、时间紧：一路陪到，最稳'), no('他走得好好的'), '<small>陪着办成的事算你帮的</small>')}
      ${row('直接告诉', ok('等过、问过之后'), no('一上来就说'))}
    </div>
    </section>
    <section>
    <h3 class="sm-h">心情从哪来</h3>
    <div class="hb2-tags">${['自己做到', '道具帮上忙', '邻居招呼', '你的电话和陪伴', '被人需要', '做喜欢的事'].map(t => tag(t, 'up')).join('')}${['着急迷路', '事没办成', '一上来就被替他做'].map(t => tag(t, 'down')).join('')}</div>
    </section>
    <section>
    <h3 class="sm-h">昨天影响今天</h3>
    <div class="hb2-rows">
      ${row('出了事', '迷路很久、走丢放弃、差点被骗：第二天每趟出门都要有人陪')}
      ${row('帮太多', '陪得早、一上来就告诉：第二天第一趟他想让你陪')}
      ${row('顺顺利利', '都是他自己办成的：第二天他精神更好')}
    </div>
    <details class="fold"><summary>为什么先等、再提示、最后才告诉？</summary><p class="sub">帮助太快，会拿走他“自己做到”的机会；太慢，又会让他着急。这一结构参考了认知评估里“自由回忆 → 线索提示 → 选择提示”的分级思路。游戏规则是对真实处境的简化，具体做法请结合专业人士的建议。</p></details>
    </section>
    </div>
    <div class="hb-col">
    <section>
    <h3 class="sm-h">提前布置 · 早上放，花精力（白天也能补放）</h3>
    <div class="hb2-grid">${cards}</div>
    </section>
    <section class="hb-ach">
    ${achHtml(true)}
    </section>
    </div>
    </div>
    <div class="row"><button class="primary" id="bBack">${backLabel}</button></div>`, 'hb');
  $('#bBack').onclick = () => { sfx('click'); back ? back() : closeModal(); };   // 按钮写去向：回到打开它的地方＝「返回」，会去主菜单＝「主菜单」
}

// extra：{ label, go }——通关后在「返回」旁多一个一样醒目的按钮（再看结局，09-27 用户）
export function showReminder(back, backLabel = '返回', extra = null) {
  const t = save.tasks || {};
  const rows = Object.entries(TASKS).map(([k, v]) => {
    const r = t[k];
    const st = !r ? '<span class="sub">还没遇到</span>' : r.status === 'self' ? '✓ 自己完成' : r.status === 'hint' ? '△ 用了提示完成' : '○ 这次没完成';
    return `<tr><td><b>${v.name}</b><br><small>${v.skill}</small></td><td><span class="nowrap">${st}</span>${r?.detail ? `<br><small>${r.detail}</small>` : ''}</td></tr>`;
  }).join('');
  const met = Object.values(t), notSelf = met.filter(r => r.status !== 'self').length;
  const gentle = met.length >= 4 && notSelf >= 3;
  modal(`<h2>记忆</h2>
    <p class="sub">先说一句：偶尔忘事、一时想不起名字，是很正常的事，年纪大了人人都会。</p>
    <p>这一周，你在照顾爷爷的同时，也做了几件和他一样需要“记、想、算”的小事。它们的形式参考了医生常用的认知量表里的题型。</p>
    <table class="tasks">${rows}</table>
    <div class="memo"><b>请注意</b>　这些小任务只是游戏体验，<b>不是测试</b>。一次的表现会受睡眠、视力听力、心情、对手机的熟悉程度影响，不能说明任何人的认知状况，游戏也不会给出分数或结论。</div>
    ${gentle ? '<div class="memo warm">这次有好几件小事，你用了提示或没能完成——这很常见，也可能只是还不熟悉这个游戏。如果你平时也常觉得记性、注意力不如从前，不妨和家人聊聊，或在体检时向医生提一句。</div>' : ''}
    <details class="fold"><summary>哪些变化值得留意？</summary>
    <p>如果你或家人在日常生活中<b>持续</b>出现下面这些变化，并且越来越影响生活：</p>
    <ul class="signs">${WARNING_SIGNS.map(x => `<li>${x}</li>`).join('')}</ul>
    <p>建议到医院的<b>记忆门诊</b>或<b>神经内科</b>做一次专业评估。早一点弄清原因，就能早一点得到帮助、早一点做安排。</p></details>
    <div class="row">${extra ? `<button class="primary" id="bRemX">${extra.label}</button>` : ''}<button class="primary" id="bRemOk">${backLabel}</button></div>`);
  $('#bRemOk').onclick = () => { sfx('click'); back ? back() : closeModal(); };
  if (extra) $('#bRemX').onclick = () => { sfx('click'); extra.go(); };
}

// 一周：心情与“他自己办的”的曲线、帮助方式合计、按三方面组合的结局文字
