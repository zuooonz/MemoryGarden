// 第 4 天：修好摔坏的闹钟（摆数字、拨指针）
import { player } from '../play.mjs';
export const meta = { day: 4, audioSec: 300 };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 2.5 });
  await api.click('#startBtn', { after: 0.3 });
  api.rec(false);
  await P.autoUntil(`document.querySelector('#cSvg')`);
  api.rec(true);
  await api.caption('第 4 天 · 看老电影', '闹钟摔坏了：把数字装回钟面，指针拨到现在的时间');
  await P.game('clock');
  await api.caption('钟修好了，六点十分闹铃一响，他准时出门看电影');
  await P.watch(3);
  await api.caption(null); await api.wait(0.5);
  await P.finishDay();
};
