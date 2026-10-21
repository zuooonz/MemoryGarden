// 第 6 天：他走岔了 → 帮助从少到多，最后在地图上一个路口一个路口指路 → 冒充女儿的诈骗电话 → 反诈卡片
import { player } from '../play.mjs';
export const meta = { day: 6, audioSec: 400 };
export default async (api) => {
  const P = player(api);
  api.rec(true);
  await P.openDay({ intro: 3 });
  await api.caption('第 6 天 · 菜市场走后门', '陌生的路，他容易走岔');
  await api.wait(1.5); await api.caption(null);
  await api.click('#startBtn', { after: 0.3 });
  // 迷路和诈骗电话哪个先来就先拍哪个（接着前几天的真实存档玩，事件顺序会变）；诈骗电话一定拍，迷路出现了才拍
  const LOST = `__mg.sim.moment && __mg.sim.moment.kind==='lost'`, SCAM = `document.querySelector('#scL')`;
  let lostShown = false;
  for (let k = 0; k < 6; k++) {
    api.rec(false);
    await P.autoUntil(lostShown ? SCAM : `(${LOST}) || ${SCAM}`);
    if (await api.js(`!!(${SCAM})`)) break;
    lostShown = true;
    api.rec(true);
    await api.wait(1);
    await api.caption('他走错了，打电话给你', '先问一句：身边能看到什么？认出来了，还算他自己办的');
    await api.wait(3);
    await P.moment(['cue']); await P.watch(3.5);
    if (await api.js(`!!__mg.sim.moment`)) {
      await api.caption('他认不出来。再多帮一点', '电话里给他指几个路口，后面的路他自己走');
      await api.wait(2);
      await P.moment(['tell']);
      await api.until(`document.querySelector('#rGo')`, 5);
      await api.caption('一次最多说 3 个路口', '★ 是他认得的地方，停在那儿，后面他自己认得');
      await P.route();
      await P.watch(3);
    } else {
      await api.caption('他自己认出了方向', '只问了一句，路还是他自己找到的——算「他自己办的」');
      await P.watch(3.5);
    }
    await api.caption(null);
  }
  api.rec(true);
  await api.caption('陌生来电：“爸，猜猜我是谁？”', '听到可疑的话，就点「不对劲！」');
  await P.scam({
    onStep: async (id) => {
      if (id === 'scA' || id === 'scB') await api.caption('他有点慌。把破绽讲给他，让他自己判断');
      if (id === 'scOk' || id === 'scV') await api.caption('先挂断，再打给家人本人原来的号码核实');
      if (id === 'scEnd') await api.caption('反诈小卡片', '拿不准可拨打 96110 咨询');
    }, card: 7,
  });
  await api.caption(null); await api.wait(0.8);
  await P.finishDay();
};
