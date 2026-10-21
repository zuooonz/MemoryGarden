// 第 5 天：包饺子，爷爷只说一遍三个步骤（提示文字设为“多”，说的话同时显示成文字）
import { player } from '../play.mjs';
export const meta = { day: 5, audioSec: 300, settings: { tips: 3 } };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 2.5 });
  await api.click('#startBtn', { after: 0.3 });
  api.rec(false);
  await P.autoUntil(`document.querySelector('#sScene')`);
  api.rec(true);
  await api.caption('第 5 天 · 包饺子，爷爷当老师', '他只说一遍三个步骤，你照着顺序做');
  await P.game('steps');
  await api.caption(null); await api.wait(0.5);
  await P.finishDay();
};
