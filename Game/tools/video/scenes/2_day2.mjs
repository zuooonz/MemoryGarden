// 第 2 天：取件码短信（只看一眼）→ 到驿站凭记忆报出
import { player } from '../play.mjs';
export const meta = { day: 2, audioSec: 300 };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 3 });
  await api.caption('第 2 天 · 取快递');
  await api.wait(1.5); await api.caption(null);
  await api.click('#startBtn', { after: 0.5 });
  await P.autoUntil(`!document.querySelector('#game').classList.contains('hidden') && document.querySelector('#dOpen')`);
  await api.caption('驿站发来取件码短信', '只看这一眼就熄屏——手机还忘在了家里');
  await P.game('digitsLearn');
  await api.caption(null);
  await P.autoUntil(`document.querySelector('#dT')`);
  await api.caption('到了驿站：“取件码多少？”', '按短信里的顺序，凭记忆报出来');
  await P.game('digitsRecall');
  await api.caption(null); await api.wait(0.8);
  await P.finishDay();
};
