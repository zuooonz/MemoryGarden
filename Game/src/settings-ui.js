
import { $, sim, ui, emit } from './core.js';
import { GFX, applyGfx, autoTier, gfxTier } from './world.js';
import { closeModal, modal } from './stage.js';
import { saveSettings, settings } from './store.js';
import { updateMistTargets } from './routes.js';
import { setVoice, setVolume, sfx } from './audio.js';// 设置页（适老化：字号、提示文字多少、画面档位、配音、音量）与应用设置。

export function initSettingsUi() {

}
// ---------- 设置（适老化） ----------
export function applySettings() {
  document.body.classList.remove('fs-1', 'fs-2', 'fs-3', 'tips-1', 'tips-2', 'tips-3'); document.body.classList.add('fs-' + settings.font, 'tips-' + settings.tips);
  try { ui.gpKey = ''; } catch { }
  setVoice(settings.voice); document.body.classList.toggle('voice-on', !!(settings.voice && window.__VOICE)); sim.setEasy(settings.easy); setVolume([0, 0.5, 1, 1.6][settings.vol] ?? 1);
  saveSettings();
  if (typeof GFX !== 'undefined') applyGfx(settings.gfx === 'auto' ? (autoTier() || gfxTier || 2) : settings.gfx);
}
// 配音在游戏代码之后才下载完（build.mjs）：到了以后补上“有配音”
addEventListener('mg-voice', () => document.body.classList.toggle('voice-on', !!(settings.voice && window.__VOICE)));
// 版本：构建时间与代码版本号（build.mjs 写进 window.__BUILD；dirty 只留在数据里、不显示——用户 10-07：“未提交”容易误会成没交给赛事）；自动测试截图时显示固定文字，免得每次构建都报界面差异
function buildLabel() {
  const b = window.__BUILD; if (window.__rec) return '版本（测试）';
  return b ? `版本 ${b.time.slice(5)}${b.commit ? ' · ' + b.commit : ''}` : '开发版';
}
export function showSettings(back, inDay = false) {   // inDay：一天进行中打开（底部多一个「主菜单」，先确认）
  const opt = (k, v, label) => `<button class="seg ${settings[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;
  // 版本在标题行靠右：手机上一打开就看得到，不和底部按钮抢位置（10-07 用户同意）
  modal(`<h2 class="sethead">设置<span class="ver">${buildLabel()}</span></h2>
    <p class="sub">文字大小</p><div class="segs">${opt('font', 1, '标准')}${opt('font', 2, '大')}${opt('font', 3, '特大')}</div>
    <p class="sub">界面上的提示文字（和文字大小无关）</p><div class="segs">${opt('tips', 1, '少：多用图标')}${opt('tips', 2, '适中')}${opt('tips', 3, '多：都写清楚')}</div>
    <p class="sub">画面（自动：按这台设备的流畅程度自己选）</p><div class="segs">${opt('gfx', 'auto', '自动')}${opt('gfx', 1, '流畅')}${opt('gfx', 2, '标准')}${opt('gfx', 3, '精美')}</div>
    <p class="sub">雾的浓淡（雾越浓，他在那儿越容易走错；这里只改显示，不影响难度）</p><div class="segs">${opt('fog', 1, '标准')}${opt('fog', 2, '淡')}</div>
    ${window.__VOICE ? `<p class="sub">人物配音（AI 配音）</p><div class="segs">${opt('voice', true, '开')}${opt('voice', false, '关')}</div><p class="sub">朗读提示（旁白念出每天开头和操作提示，适合不方便看字的玩家）</p><div class="segs">${opt('narr', false, '关')}${opt('narr', true, '开')}</div>` : ''}
    <p class="sub">音量</p><div class="segs">${opt('vol', 0, '静音')}${opt('vol', 1, '小')}${opt('vol', 2, '中')}${opt('vol', 3, '大')}</div>
    <div class="row">${inDay ? '<button class="ghost" id="bSetMenu">主菜单</button>' : ''}<button class="primary" id="bSetOk">返回</button></div>`);
  document.querySelectorAll('.seg').forEach(b => b.onclick = () => {
    const k = b.dataset.k; let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : v === 'auto' ? 'auto' : +v;
    settings[k] = v; applySettings(); if (k === 'fog') updateMistTargets(); sfx('click'); showSettings(back, inDay);
  });
  $('#bSetOk').onclick = () => { sfx('click'); back ? back() : closeModal(); };
  $('#bSetMenu')?.addEventListener('click', () => { sfx('click');
    modal(`<h2>回主菜单？</h2><p>今天还没过完，回主菜单后这一天要从头玩。</p>
      <div class="row"><button class="ghost" id="bMenuOk">主菜单</button><button class="primary" id="bMenuNo">接着玩</button></div>`);
    $('#bMenuNo').onclick = () => { sfx('click'); showSettings(back, inDay); };
    $('#bMenuOk').onclick = () => { sfx('click'); emit('toMenu'); };
  });
}
