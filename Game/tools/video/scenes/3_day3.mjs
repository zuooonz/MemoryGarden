// 第 3 天：社区健康讲座（早期变化与就医）→ 在地图上连出健步走路线 → 他领着街坊走
import { player } from '../play.mjs';
export const meta = { day: 3, audioSec: 300 };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 2.5 });
  await api.click('#startBtn', { after: 0.3 });
  api.rec(false);
  await P.autoUntil(`document.querySelector('#gNext')`);
  api.rec(true);
  await api.caption('第 3 天 · 社区健康讲座', '早期可能出现的变化，什么时候该去看医生');
  await P.game('talk', { page: 5 });
  await api.caption('讲座上的小游戏：连出健步走的路线', '1 → 甲 → 2 → 乙……数字和汉字交替连下去');
  await P.trail();
  await api.caption('他领着街坊们，照你连的路线走一圈');
  await P.watch(5);
  await api.caption(null); await api.wait(0.6);
  await P.finishDay();
};
