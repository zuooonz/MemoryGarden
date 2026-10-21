// 浏览器实时合成的音效与轻音乐，无外部音频文件。
import { settings } from './store.js';
import { rng } from './util.js';
const srnd = rng(91);   // 自己的随机数（10-06）：这里的效果随时间取随机数，用全局 Math.random 会改变游戏内容（菜摊、关卡）取到的随机数，截图比对就不稳
let ctx = null, master = null, musicGain = null, ambGain = null, reverb = null, reverbGain = null, musicTimer = null, rainNode = null, vol = 1, rate = 1, lastMood = 'day';
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }
// 倍速时音乐也跟着加快
export function setMusicRate(r) { r = Math.max(1, Math.min(r, 3)); if (r === rate) return; rate = r; if (musicTimer) startMusic(lastMood); }

export function initAudio() {
  if (ctx) { if (ctx.state !== 'running' && !bgHidden && !pausedState) ctx.resume().catch(() => { }); return; }   // 暂停中点按钮不恢复声音   // suspended／interrupted（手机切到别的 app 回来）都要重新打开
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.3; musicGain.connect(master);
    ambGain = ctx.createGain(); ambGain.gain.value = 1; ambGain.connect(master);   // 环境声总线：人声出现时一起压低
    // 室外的空旷感：一段衰减的噪声做混响，湿声多少随镜头远近变
    const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (srnd() * 2 - 1) * Math.pow(1 - i / len, 3); }
    reverb = ctx.createConvolver(); reverb.buffer = ir; reverbGain = ctx.createGain(); reverbGain.gain.value = 0.12; reverb.connect(reverbGain); reverbGain.connect(master);
    ctx.listener.positionX && (ctx.listener.positionY.value = 60);
    probeVoice();
  } catch { ctx = null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, attack = 0.01, dest = null, slide = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export function sfx(name) {
  if (!ctx) return;
  switch (name) {
    case 'click': tone(660, 0.08, { type: 'triangle', vol: 0.12 }); break;
    case 'place': tone(523, 0.12, { type: 'triangle', vol: 0.18 }); tone(784, 0.18, { type: 'triangle', vol: 0.15, at: 0.07 }); break;
    case 'deny': tone(220, 0.15, { type: 'square', vol: 0.06 }); break;
    case 'q': tone(440, 0.18, { vol: 0.1, slide: 60 }); break;
    case 'good': [523, 659, 784].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.12, at: i * 0.08 })); break;
    case 'bad': tone(330, 0.35, { type: 'sine', vol: 0.14, slide: -80 }); tone(311, 0.4, { vol: 0.08, at: 0.15, slide: -60 }); break;
    case 'alarm': for (let i = 0; i < 14; i++) tone(i % 2 ? 1568 : 1319, 0.07, { type: 'triangle', vol: 0.07, at: i * 0.08 }); break;   // 闹钟响铃：两个铃快速交替
    case 'phone': for (let i = 0; i < 2; i++) { tone(880, 0.12, { type: 'square', vol: 0.05, at: i * 0.25 }); tone(1100, 0.12, { type: 'square', vol: 0.04, at: i * 0.25 + 0.06 }); } break;
    case 'step': tone(120 + srnd() * 30, 0.05, { type: 'triangle', vol: 0.03 }); break;
    case 'end': [392, 494, 587, 784].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.12, at: i * 0.15 })); break;
    case 'hello': tone(587, 0.12, { type: 'triangle', vol: 0.12 }); tone(740, 0.2, { type: 'triangle', vol: 0.12, at: 0.1 }); break;
  }
}

// 五声音阶的轻柔拨弦，随时间段变化调式
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
export function startMusic(mood = 'day') {
  if (!ctx) return;
  stopMusic();
  const root = mood === 'evening' ? 196 : 220;
  let step = 0;
  lastMood = mood; const beat = 0.5 / rate;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const bar = Math.floor(step / 8) % 4;
    const chordRoot = [0, 5, 3, 4][bar];
    if (step % 8 === 0) tone(root / 2 * Math.pow(2, SCALE[chordRoot] / 12), 2.2, { type: 'sine', vol: 0.18, dest: musicGain, attack: 0.08 });
    if (srnd() < 0.55) {
      const deg = SCALE[(chordRoot + Math.floor(srnd() * 5)) % SCALE.length];
      tone(root * Math.pow(2, deg / 12), 0.9, { type: 'triangle', vol: 0.12, dest: musicGain });
    }
    step++;
  }, beat * 1000);
}
export function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }

// ---------- 开场配乐（09-27）：按开场的画面节拍写好的一段生成式配乐——F 大调，钢琴拨弦＋铺底和弦＋低音＋小钟 ----------
// 熟路（温暖主旋律）→ 起雾（转小调、音色收暗、旋律稀疏）→ 邻居指路、路标立起（回主调、钟声）→ 拉远（主旋律再现、渐弱）
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const OPENING = {
  len: 31.5,
  pad: [[0, 3, [53, 57, 60]], [3, 6, [52, 55, 60]], [6, 9, [50, 53, 57]], [9, 12, [46, 50, 53]], [12, 13.5, [43, 46, 50]], [13.5, 15, [48, 53, 55]],
        [15, 16.5, [46, 50, 53]], [16.5, 18, [48, 52, 55]], [18, 21, [53, 57, 60]], [21, 22.5, [45, 48, 52]], [22.5, 24, [46, 50, 53]],
        [24, 25.5, [50, 53, 57]], [25.5, 27, [46, 50, 53]], [27, 28.5, [48, 52, 55]], [28.5, 31.5, [53, 57, 60]]],
  dark: [6, 15],   // 起雾这段：铺底收暗
  mel: [[0.8, 69, .9], [1.4, 72, .9], [2.0, 74, .9], [2.6, 72, 1.2], [3.6, 69, .9], [4.2, 67, .9], [4.8, 65, 1.8],
        [7.4, 74, 1.4], [8.4, 72, 1.8], [10.4, 69, 1.6], [12.0, 67, 2.4],
        [18.5, 69, .7], [19.1, 72, .7], [19.7, 74, .7], [20.3, 72, 1], [21.1, 69, .7], [21.7, 67, .7], [22.3, 65, 1], [23.0, 69, .7], [23.6, 72, .7], [24.2, 77, 1.4],
        [25.2, 74, .9], [26.0, 72, .9], [26.8, 69, .9], [27.6, 70, .9], [28.4, 69, 1.2], [29.6, 65, 2.4]],
  bell: [[15.1, 84], [15.4, 81], [15.7, 77], [29.6, 89]],
};
let themeStop = null;
export function playTheme(score = OPENING) {
  if (!ctx) return () => { };
  stopTheme(); stopMusic();
  const t0 = ctx.currentTime + 0.1, out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send); send.connect(reverb);
  out.gain.linearRampToValueAtTime(0.9, t0 + 1.5);
  const nodes = [];
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out);
  const [d0, d1] = score.dark; lp.frequency.setValueAtTime(1400, t0 + d0); lp.frequency.linearRampToValueAtTime(520, t0 + d0 + 2); lp.frequency.setValueAtTime(520, t0 + d1 - 0.5); lp.frequency.linearRampToValueAtTime(1600, t0 + d1 + 1);
  for (const [a, b, notes] of score.pad) for (const m of notes) for (const det of [-6, 5]) {   // 铺底：两个略微走调的锯齿波，慢起慢收
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = det;
    g.gain.setValueAtTime(0, t0 + a); g.gain.linearRampToValueAtTime(0.018, t0 + a + 0.6); g.gain.setValueAtTime(0.018, t0 + b - 0.2); g.gain.linearRampToValueAtTime(0, t0 + b + 0.5);
    o.connect(g); g.connect(lp); o.start(t0 + a); o.stop(t0 + b + 0.6); nodes.push(o);
  }
  for (const [a, b, notes] of score.pad) {   // 低音：和弦根音低八度
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mf(notes[0] - 12);
    g.gain.setValueAtTime(0, t0 + a); g.gain.linearRampToValueAtTime(0.09, t0 + a + 0.08); g.gain.exponentialRampToValueAtTime(0.01, t0 + b + 0.3);
    o.connect(g); g.connect(out); o.start(t0 + a); o.stop(t0 + b + 0.4); nodes.push(o);
  }
  for (const [at, m, dur] of score.mel) for (const [mul, v, type] of [[1, 0.11, 'triangle'], [2, 0.03, 'sine'], [3, 0.012, 'sine']]) {   // 钢琴感拨弦：基音＋两个泛音，快起慢衰
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = mf(m) * mul;
    g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(v, t0 + at + 0.006); g.gain.exponentialRampToValueAtTime(0.0006, t0 + at + dur + 0.8);
    o.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.9); nodes.push(o);
  }
  for (const [at, m] of score.bell) for (const [mul, v] of [[1, 0.06], [2.76, 0.025], [5.4, 0.01]]) {   // 小钟：非整数倍泛音
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mf(m) * mul;
    g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(v, t0 + at + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t0 + at + 2.6);
    o.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + 2.7); nodes.push(o);
  }
  out.gain.setValueAtTime(0.9, t0 + score.len - 2.5); out.gain.linearRampToValueAtTime(0, t0 + score.len);
  themeStop = (fade = 0.8) => { const now = ctx.currentTime; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { for (const o of nodes) { try { o.stop(); } catch { } } out.disconnect(); }, fade * 1000 + 100); themeStop = null; };
  return themeStop;
}
export function stopTheme(fade) { themeStop?.(fade); }

export function setRain(on) {
  if (!ctx) return;
  if (on && !rainNode) {
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (srnd() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0.08;
    src.connect(f); f.connect(g); g.connect(ambGain || master); src.start();
    rainNode = { src, g };
  } else if (!on && rainNode) { rainNode.src.stop(); rainNode = null; }
}

// ---------- 声音空间：听者＝镜头；世界里的声音都有位置 ----------
let camDist = 60, calm = false;
export function setListener(pos, fwd, up, dist, calmMode) {
  if (!ctx) return;
  const L = ctx.listener, t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setTargetAtTime(pos.x, t, 0.05); L.positionY.setTargetAtTime(pos.y, t, 0.05); L.positionZ.setTargetAtTime(pos.z, t, 0.05);
    L.forwardX.setTargetAtTime(fwd.x, t, 0.05); L.forwardY.setTargetAtTime(fwd.y, t, 0.05); L.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
    L.upX.setTargetAtTime(up.x, t, 0.05); L.upY.setTargetAtTime(up.y, t, 0.05); L.upZ.setTargetAtTime(up.z, t, 0.05);
  } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  camDist = dist;
  if (calm !== calmMode) { calm = calmMode; ambGain && !voiceSrc && ambGain.gain.setTargetAtTime(calm ? 1.35 : 1, t, 0.8); }   // 静观：环境声略大
  if (reverbGain) reverbGain.gain.setTargetAtTime(Math.min(0.28, 0.04 + dist / 400), t, 0.3);                     // 镜头越远越空旷
}
// 一个有位置的发声点：声音从这里出来（距离衰减＋左右方位）；另留一路居中的“近声”，保证远处也听得清
function emitter(pos, { ref = 22, dry = 0.3, wet = 0.5, dest } = {}) {
  const pan = ctx.createPanner();
  pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1; pan.maxDistance = 400;
  const set = (p) => { if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z); };
  set(pos);
  const input = ctx.createGain(), dryG = ctx.createGain(); dryG.gain.value = dry;
  input.connect(pan); pan.connect(dest || master); input.connect(dryG); dryG.connect(dest || master);
  if (reverb && wet) { const w = ctx.createGain(); w.gain.value = wet; pan.connect(w); w.connect(reverb); }
  return { input, set };
}

// 环境声：按时段、天气、镜头所在位置；鸟叫从附近的树上来，夜里是虫鸣，菜市场附近有人声
let ambT = 0, market = null;
export function ambience(dt, minute, raining, active, center, marketPos) {
  if (!ctx || !active || ctx.state !== 'running') return;
  // 菜市场人声：一直在放，靠距离自然变大变小（白天、不下雨）
  if (marketPos && !market) {
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let v = 0; for (let i = 0; i < len; i++) { v = v * 0.97 + (srnd() * 2 - 1) * 0.03; d[i] = v * (0.6 + 0.4 * Math.sin(i / ctx.sampleRate * 7 + Math.sin(i / ctx.sampleRate * 1.3) * 3)); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const em = emitter(marketPos, { ref: 10, dry: 0, wet: 0.3, dest: ambGain });
    src.connect(bp); bp.connect(g); g.connect(em.input); src.start();
    market = { g };
  }
  if (market) market.g.gain.setTargetAtTime(!raining && minute > 420 && minute < 1080 ? 1.6 : 0, ctx.currentTime, 1);
  ambT -= dt;
  if (ambT > 0) return;
  ambT = minute < 600 ? 1.5 + srnd() * 2.5 : 3 + srnd() * 5;   // 早上鸟最多
  if (raining) return;
  const p = { x: (center?.x || 0) + (srnd() - 0.5) * 60, y: 6, z: (center?.z || 0) + (srnd() - 0.5) * 50 };
  const em = emitter(p, { ref: 14, dry: 0.15, wet: 0.4, dest: ambGain });
  if (minute < 1060) {
    const base = 2200 + srnd() * 1200;
    const n = 2 + Math.floor(srnd() * 3);
    for (let i = 0; i < n; i++) tone(base + srnd() * 400, 0.09, { type: 'sine', vol: 0.05, at: i * 0.12, slide: 500, dest: em.input });
  } else {
    for (let i = 0; i < 6; i++) tone(4200, 0.03, { type: 'square', vol: 0.012, at: i * 0.07, dest: em.input });
  }
}

// ---------- 爷爷的配音（AI 生成，预先录好打包在页面里）----------
// 只播爷爷自己说的话（往事、犹豫时的自言自语、包饺子口令）；说明文字、提醒页一律不朗读。
const voiceBufs = {};
let voiceOn = true, voiceSrc = null;
export function setVoice(on) { voiceOn = on; if (!on) stopVoice(); }
// 有的浏览器（较旧的 Safari）解不开 opus 录音：先试解一段，解不开就当作没有录音，照常显示字幕
let voiceOk = null;
async function probeVoice() {
  const id = Object.keys(window.__VOICE || {}).find(k => k !== '__keys'); if (!id) return;
  voiceOk = !!(await decode(id)); if (!voiceOk) console.warn('本浏览器无法播放配音，改为显示字幕');
}
export function hasVoice(id) { return voiceOk !== false && !!(window.__VOICE && window.__VOICE[id]); }
// 没有录音的台词记下来（__mg.voiceMiss 可查），方便补录
const voiceMiss = new Set(); window.__voiceMiss = voiceMiss;
export function voiceKey(text) { const k = window.__VOICE?.__keys?.[text]; if (!k && window.__VOICE && text) voiceMiss.add(text); return k && voiceOk !== false ? (k.id || k) : null; }
// ---------- 声音调度（情境系统 S4-3）：所有人声都经 voice(通道, 配音, 选项) ----------
// 通道     谁                                          规则
// main     往事（tag memory）、犹豫自言自语（moment）      停掉别的声音马上说
//          关卡里的人物（game）                          停掉本关上一句；排在做法旁白之后（先说怎么做，再说话）；soft：有人在说就不说
// urgent   爷爷迷路、电话里的话                           打断闲话与旁白马上说；主戏在说就不说（只留气泡）
// chat     爷爷其他短句、邻居、老孙、孙女、背景人物         有人在说就不说
// narr     朗读提示（设置里打开时）                        排在人物后面；新的一条换掉没念完的上一条（keep：接在后面）
// 玩家操作：暂停＝全部挂起、继续时接着播（setPaused）；跳过往事／关掉犹豫面板／关卡里点推进按钮／关卡结束＝停掉那一段的话与旁白；打开手册等页面＝全停。
// 返回：从现在到说完的秒数；没说（被让掉、没有配音、配音关着）返回 0——调用方照样显示气泡
// 测试用：每句配音等了多久才开口（tools/walkcheck.mjs 查“声音比气泡晚”）
export const voiceLog = { on: false, list: [] };
const MAIN_TAGS = new Set(['memory', 'moment', 'game']);
export function voice(ch, ids, { pos = null, tag, keep = false, soft = false, duck = true } = {}) {
  if (ch === 'narr') { if (!keep) stopVoice('narr'); return playVoice(ids, { tag: 'narr', duck }); }
  if (ch === 'main') {
    if (tag === 'game') { if (soft) return playVoice(ids, { tag, pos, mode: 'skip', duck }); stopVoice('game'); return playVoice(ids, { tag, pos, duck }); }
    stopVoice(); return playVoice(ids, { tag, pos, duck });
  }
  if (ch === 'urgent') { if (!voiceWouldPlay('urgent')) return Promise.resolve(0); stopVoice('chat'); stopVoice('urgent'); stopVoice('narr'); return playVoice(ids, { tag: 'urgent', pos, duck }); }
  if (!voiceWouldPlay('chat')) return Promise.resolve(0);
  return playVoice(ids, { tag: 'chat', pos, mode: 'skip', duck });   // chat
}
// 这句会不会出声（同步判断，给气泡用：出声就和声音同时出现，不出声就只显示气泡）
export function voiceWouldPlay(ch) { return voiceOn && !!ctx && (ch === 'chat' ? !voiceBusy() : ch === 'urgent' ? !voiceMain() : true); }
// 主戏正在说（往事、犹豫、关卡：要紧话和闲话都让着）
// 测试用：正在播的配音各属哪一段（tag）
export const voiceTags = () => voiceSrcs.filter(s => ctx && s.endAt > ctx.currentTime && s.startAt <= ctx.currentTime).map(s => s.tag);
export const voiceNow = () => ({ t: ctx ? ctx.currentTime : 0, playing: voiceSrcs.filter(s => ctx && s.endAt > ctx.currentTime && s.startAt <= ctx.currentTime).map(s => ({ tag: s.tag, startAt: s.startAt })) });
export const voiceMain = () => voiceSrcs.some(s => MAIN_TAGS.has(s.tag) && ctx && s.endAt > ctx.currentTime);
// 朗读提示：旁白念出提示表（narr.js）里的一句
export function narrate(text, { keep = false } = {}) {
  if (!settings.narr || !text) return Promise.resolve(0);
  const id = voiceKey('narr|' + text); if (!id) return Promise.resolve(0);
  return voice('narr', id, { keep });
}
export function voiceCls(text) { return window.__VOICE?.__keys?.[text]?.cls || null; }
export const voiceDebug = () => voiceSrcs.map(s => s.tag || '-').join(',');
export const audioState = () => ctx ? ctx.state : 'none';   // 调试：声音系统是否在运行（暂停时应为 suspended）
export function voiceBusy() { return !!ctx && ctx.currentTime < voiceEndAt - 0.05; }
// 同一时间只有一个人说话：记下所有排着的片段和说完的时刻
let voiceSrcs = [], voiceEndAt = 0;
// tag：只停某一类（如小关卡里的话 'game'），不给就全停
// 测试用：话没说完就被停掉的记录（why：谁停的——close 关卡自动关、button 玩家点了按钮……）
export const cutLog = { on: false, list: [] };
export function stopVoice(tag, why = '') {
  const stop = tag ? voiceSrcs.filter(s => s.tag === tag) : voiceSrcs;
  if (cutLog.on && ctx) for (const s of stop) if (s.startAt <= ctx.currentTime && s.endAt - ctx.currentTime > 0.3) cutLog.list.push({ tag: s.tag, why, left: +(s.endAt - ctx.currentTime).toFixed(1), id: s.vid });
  for (const s of stop) { try { s.stop(); } catch { } }
  voiceSrcs = voiceSrcs.filter(s => !stop.includes(s)); voiceSrc = voiceSrcs[voiceSrcs.length - 1] || null;
  voiceEndAt = voiceSrcs.reduce((m, s) => Math.max(m, s.endAt || 0), 0);
  if (stop.length && !voiceSrcs.length && ctx && musicGain && !pausedState) { musicGain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.4); ambGain.gain.setTargetAtTime(calm ? 1.35 : 1, ctx.currentTime, 0.6); }
}
async function decode(id) {
  if (voiceBufs[id]) return voiceBufs[id];
  const b64 = window.__VOICE?.[id]; if (!b64 || !ctx) return null;
  const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  try { return (voiceBufs[id] = await new Promise((ok, no) => { const p = ctx.decodeAudioData(arr.buffer, ok, no); p?.catch?.(no); })); } catch { return null; }
}
// 依次播放几段（包饺子三步）；返回总时长（秒）
// pos：说话人位置（或返回位置的函数，每帧跟着人走）；不给就是“对你说的”近声、居中
let voiceFollow = null;
export function voiceTick() { if (voiceFollow && voiceSrc) voiceFollow.em.set(voiceFollow.get()); }
// mode：queue（默认，等当前这句说完再说）｜skip（有人在说就不说）｜interrupt（打断，只用于换场景）
// 返回：从现在到这段说完的秒数
export async function playVoice(ids, { duck = true, pos = null, mode = 'queue', tag = null } = {}) {
  if (!voiceOn || !ctx) return 0;
  ids = (Array.isArray(ids) ? ids : [ids]).filter(hasVoice);
  if (!ids.length) return 0;
  if (mode === 'skip' && voiceBusy()) return 0;
  if (mode === 'interrupt') stopVoice();
  const bufs = (await Promise.all(ids.map(decode))).filter(Boolean);
  if (!bufs.length) return 0;
  if (mode === 'skip' && voiceBusy()) return 0;   // 解码要一会儿：这期间别人开口了，就不说（免得排到后面、和气泡对不上）
  const now = ctx.currentTime;
  let t = Math.max(now + 0.05, voiceEndAt + 0.25);
  const start = t;
  if (voiceLog.on) voiceLog.list.push({ id: ids[0], tag, mode, wait: +(start - now - 0.05).toFixed(2) });   // 测试用：这句等了多久才开口（排在别人后面）
  const g = ctx.createGain(); g.gain.value = 1.2;
  if (pos) { const get = typeof pos === 'function' ? pos : () => pos; const em = emitter(get(), { ref: 30, dry: 0.45, wet: 0.35 }); g.connect(em.input); voiceFollow = { em, get }; }
  else { g.connect(master); }
  if (duck && musicGain) { musicGain.gain.setTargetAtTime(0.08, start - 0.05, 0.2); ambGain.gain.setTargetAtTime(0.45, start - 0.05, 0.2); }
  for (const b of bufs) {
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(g); s.start(t); s.tag = tag; s.vid = ids[bufs.indexOf(b)]; s.startAt = t; s.endAt = t + b.duration;
    voiceSrcs.push(s); voiceSrc = s;
    s.onended = () => { voiceSrcs = voiceSrcs.filter(x => x !== s); if (!voiceSrcs.length) voiceSrc = null; };
    t += b.duration + 0.18;
  }
  voiceEndAt = t;
  if (duck && musicGain) { musicGain.gain.setTargetAtTime(0.3, t, 0.4); ambGain.gain.setTargetAtTime(calm ? 1.35 : 1, t, 0.6); }
  return t - now;
}

// 场景里的短促声音：棋子落盘、观众鼓掌（有位置）
export function sceneSound(kind, pos) {
  if (!ctx || ctx.state !== 'running') return;
  const em = emitter(pos, { ref: 12, dry: 0.1, wet: 0.3, dest: ambGain });
  const noise = (dur, f, q, vol, at = 0) => {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (srnd() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(em.input); src.start(ctx.currentTime + at);
  };
  if (kind === 'clack') { noise(0.06, 2400, 3, 0.9); noise(0.05, 900, 2, 0.4, 0.01); }
  if (kind === 'clap') for (let i = 0; i < 26; i++) noise(0.04, 1500 + srnd() * 1500, 1.5, 0.25 + srnd() * 0.2, srnd() * 2.2);
}

// 暂停：音乐压低、环境声停；切到后台：整体静音（挂起音频）
let pausedState = false;
export function setPaused(on) {
  pausedState = on; if (!ctx) return;
  const t = ctx.currentTime;
  musicGain.gain.setTargetAtTime(on ? 0.1 : 0.3, t, 0.3);
  ambGain.gain.setTargetAtTime(on ? 0 : (calm ? 1.35 : 1), t, 0.3);
  // 暂停：整个声音挂起（正在说的话停在原处），继续时从原处接着播；切到后台时由 setBackground 管
  if (on) setTimeout(() => { if (pausedState && ctx.state === 'running') ctx.suspend().catch(() => { }); }, 350);   // 等音乐、环境声先淡下去
  else if (!bgHidden) ctx.resume().catch(() => { });
}
let bgHidden = false;
export function setBackground(hidden) { bgHidden = hidden; if (!ctx) return; if (hidden) ctx.suspend().catch(() => { }); else if (!pausedState) ctx.resume().catch(() => { }); }
// 手机切回来时，浏览器常常要等一次触摸才肯重新出声：任何一次点按都试着恢复
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => { if (ctx && ctx.state !== 'running' && !bgHidden && !pausedState) ctx.resume().catch(() => { }); }, true);
addEventListener('pageshow', () => { if (ctx && ctx.state !== 'running' && !pausedState) ctx.resume().catch(() => { }); });
