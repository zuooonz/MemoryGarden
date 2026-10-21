// 界面线条图标（24×24，圆头描边，颜色随 currentColor）。自绘，统一风格，替代 emoji。
const P = {
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  chess: '<circle cx="12" cy="6" r="2.6"/><path d="M10 11h4M10.3 11l-1 7.5h5.4l-1-7.5M7 20.5h10"/>',
  basket: '<path d="M4 10.5h16l-1.7 9H5.7z"/><path d="M8.5 10.5l3-5.5M15.5 10.5l-3-5.5M9 14v2.5M12 14v2.5M15 14v2.5"/>',
  rx: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  parcel: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5M8 6l8 4"/>',
  shoe: '<path d="M3 17.5h16.5a1.5 1.5 0 0 0 1.5-1.5c0-1.2-1-2-2.5-2.4L14 12.5l-1.5-3-3 .5-1-3.5L4 7.5z"/><path d="M3 20.5h18"/>',
  school: '<rect x="6" y="7.5" width="12" height="13" rx="3"/><path d="M9.5 7.5V6a2.5 2.5 0 0 1 5 0v1.5M9 13.5h6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21"/>',
  dumpling: '<path d="M3 15.5c0-4.5 4-8 9-8s9 3.5 9 8z"/><path d="M8 9.5l1.2 3M12 8v3.5M16 9.5l-1.2 3M3 15.5h18"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.8" cy="17.5" r="2.3"/><circle cx="16.8" cy="15.5" r="2.3"/>',
  phone: '<path d="M6 3.5h3l2 5-2.5 1.6a11 11 0 0 0 5.4 5.4L15.5 13l5 2v3a2.5 2.5 0 0 1-2.5 2.5A15 15 0 0 1 3.5 6 2.5 2.5 0 0 1 6 3.5z"/>',
  trophy: '<path d="M8 20.5h8M12 16v4.5M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 3 4M17 6h2.5a2.5 2.5 0 0 1-3 4"/>',
  apple: '<path d="M12 8c-1.8-1.3-7-1.2-7 4.3 0 4.2 2.8 8.2 5 8.2 1 0 1.2-.5 2-.5s1 .5 2 .5c2.2 0 5-4 5-8.2C19 6.8 13.8 6.7 12 8z"/><path d="M12 8c0-2 .8-3.5 2.8-4.5"/>',
  sign: '<path d="M12 3v18M12 5h6.5l2.5 2.5-2.5 2.5H12M12 12.5H5.5L3 15l2.5 2.5H12"/>',
  note: '<path d="M5 4h14v10.5L14.5 20H5z"/><path d="M14.5 20v-5.5H19M8.5 8.5h7M8.5 11.5h4"/>',
  pillbox: '<rect x="3" y="7" width="18" height="10" rx="2.5"/><path d="M7.5 7v10M12 7v10M16.5 7v10"/>',
  neighbor: '<path d="M4 11l8-7 8 7v9.5H4z"/><path d="M12 17.5s-3.2-1.9-3.2-3.8a1.7 1.7 0 0 1 3.2-.8 1.7 1.7 0 0 1 3.2.8c0 1.9-3.2 3.8-3.2 3.8z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15.5" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M10 13.5h2v4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 18l5-4.5 3.5 3 3-2.5L20 18"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.3 8.3-7 10-3.7-1.7-7-5-7-10V6z"/><path d="M9.3 12l2 2 3.5-4"/>',
  bag: '<rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="M9 8V6.2A1.2 1.2 0 0 1 10.2 5h3.6A1.2 1.2 0 0 1 15 6.2V8M3 13h18M12 12v2.5"/>',
  walk: '<circle cx="8" cy="4.8" r="2"/><circle cx="16" cy="4.8" r="2"/><path d="M8 8.5v5.5l-2 6.5M8 14l2 6.5M16 8.5v5.5l-2 6.5M16 14l2 6.5M8 11h8"/>',
  callAsk: '<path d="M4.6 7h2.6l1.6 4-2 1.3a9 9 0 0 0 4.3 4.3l1.3-2 4 1.6v2.6a2 2 0 0 1-2 2A12.5 12.5 0 0 1 2.6 9a2 2 0 0 1 2-2z"/><path d="M14.5 2.5h6a1.8 1.8 0 0 1 1.8 1.8v3.9a1.8 1.8 0 0 1-1.8 1.8h-2.6L15.6 12v-2h-1.1a1.8 1.8 \
0 0 1-1.8-1.8V4.3a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M16.3 5a1.3 1.3 0 1 1 1.6 1.3c-.3.1-.4.3-.4.6" stroke-width="1.5"/><circle cx="17.5" cy="8.3" r=".35" stroke-width="1.2"/>',
    
  together: '<circle cx="7" cy="4.8" r="2"/><circle cx="16.5" cy="4.8" r="2"/><path d="M7 8v6l-1.8 6.5M7 14l1.8 6.5M16.5 8v6l-1.8 6.5M16.5 14l1.8 6.5M7 10.5l4.7 1.8 4.8-1.8M7 10.5l-3 2.2M4 12.7v7.8"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5v4.2h4.2"/><path d="M12 8v4.3l3 1.8"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  flour: '<path d="M7 7.5h10l1.5 13h-13z"/><path d="M8.5 7.5L8 4h8l-.5 3.5M9.5 13.5h5"/>',
  rollpin: '<rect x="6" y="9.5" width="12" height="5" rx="1"/><path d="M2.5 12H6M18 12h3.5"/>',
  wrapper: '<ellipse cx="12" cy="13" rx="8.5" ry="5.5"/><path d="M6.5 11.5c1.5-1.2 3.4-1.8 5.5-1.8"/>',
  filling: '<path d="M3.5 12.5h17a8.5 6.5 0 0 1-17 0z"/><path d="M6.5 12.5c.5-3 3-4.5 5.5-4.5s5 1.5 5.5 4.5"/>',
  water: '<path d="M3.5 11.5h17a8.5 7 0 0 1-17 0z"/><path d="M7 15c1.2-.8 2.3-.8 3.5 0s2.3.8 3.5 0 2.3-.8 3.5 0"/>',
  board: '<rect x="3" y="6.5" width="15" height="11" rx="1"/><path d="M18 12h3.5"/><circle cx="20" cy="12" r="0.4"/>',
  plate: '<ellipse cx="12" cy="13" rx="9" ry="5.5"/><ellipse cx="12" cy="12.5" rx="5" ry="2.8"/>',
  tray: '<circle cx="12" cy="12" r="8.5"/><path d="M5 8.5h14M3.5 12h17M5 15.5h14M8.5 4.5v15M12 3.5v17M15.5 4.5v15"/>',
  elder: '<circle cx="12" cy="8" r="4"/><path d="M8 8.2h8M5 20.5c.5-4 3.4-6.5 7-6.5s6.5 2.5 7 6.5"/><path d="M8.3 6.2c.8-1.6 2.1-2.2 3.7-2.2s2.9.6 3.7 2.2"/>',
  girl: '<circle cx="12" cy="9" r="3.6"/><path d="M5.5 20.5c.5-3.6 3.2-5.8 6.5-5.8s6 2.2 6.5 5.8M8.2 8.2L6 6.5M15.8 8.2L18 6.5"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  play: '<path d="M7.5 5l11 7-11 7z"/>',
  go: '<path d="M8.5 5l10.5 7-10.5 7z" fill="currentColor"/>',   // 出发：实心三角（开始），原来用太阳，看不出是开始
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11.5M11 11V4.8a1.5 1.5 0 0 1 3 0V11.5M14 11.5V6.8a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6c-2.8 0-4.3-1.7-5.8-4l-1.8-2.8a1.5 1.5 0 0 1 2.4-1.8L8 13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 10 4.3 4.3 0 0 0 7 18.5z"/>',
  zen: '<circle cx="12" cy="4.6" r="2.2"/><path d="M12 7.4v5.6"/><path d="M12 9c-1.6.8-3 2.4-3.8 4.2L6 15.2M12 9c1.6.8 3 2.4 3.8 4.2L18 15.2"/><path d="M3.8 16.2c2.4 2.6 6.8 3 8.2 1.4 1.4 1.6 5.8 1.2 8.2-1.4"/><path d="M7 15.6c1.6-1.4 3.4-2.2 5-2.2s3.4.8 5 2.2"/>',   // 盘腿打坐：静观
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M19 18v3H6.5"/>',
  // 齿轮：8 个齿的外轮廓＋中心孔（原来是圆加短线，像太阳）
  gear: '<polygon points="10.1,5.4 10.5,2.5 13.5,2.5 13.9,5.4 15.3,6.0 17.6,4.2 19.8,6.4 18.0,8.7 18.6,10.1 21.5,10.5 21.5,13.5 18.6,13.9 18.0,15.3 19.8,17.6 17.6,19.8 15.3,18.0 13.9,18.6 13.5,21.5 10.5,21.5 10.1,18.6 8.7,18.0 \
6.4,19.8 4.2,17.6 6.0,15.3 5.4,13.9 2.5,13.5 2.5,10.5 5.4,10.1 6.0,8.7 4.2,6.4 6.4,4.2 8.7,6.0"/><circle cx="12" cy="12" r="2.8"/>',
    
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};
export function icon(name, size = 20, stroke = 1.9) {
  return `<svg class="icn" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${P[name] || P.dot}</svg>`;
}
// 当天的事 → 图标
export const GOAL_ICON = { meds: 'pill', clock: 'clock', chess: 'chess', shop: 'basket', rx: 'rx', post: 'parcel', talk: 'shoe', pick: 'school', movie: 'film', cook: 'dumpling', choir: 'music', scam: 'phone', match: 'trophy' };

