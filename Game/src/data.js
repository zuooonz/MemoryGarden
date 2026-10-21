// 小镇、支持方式与每日内容。所有人物与剧情为原型占位，未定案。

export const GRID_W = 7;          // 路口列数
export const GRID_H = 6;          // 路口行数
export const SPACING = 12;        // 路口间距（世界单位）

export const nid = (x, z) => z * GRID_W + x;

// 不相连的路段（让街区不那么规整）
export const REMOVED_EDGES = [
  [[2, 2], [3, 2]], [[4, 4], [4, 5]], [[0, 2], [0, 3]], [[5, 3], [6, 3]],
  [[1, 0], [2, 0]], [[3, 4], [3, 5]], [[5, 0], [5, 1]], [[6, 1], [6, 2]],
];

// 地点：node 是入口路口，block 是建筑所在街区（左下角路口坐标）
// 地点：node 是登记的路口；正门开在 node 与 doorTo 两个路口之间那段路的中点——从这段路的两头都能进出，走到门口就算到了。
// doorAt：门不在正中间时，写它在 node→doorTo 这段路上的位置（0—1，默认 0.5）；要和 town 里房子的门对齐（家的门在 0.6）
// gates：其他门（每个写 [路口, 另一头路口]）。平时走开着的门里离得近的；目标写了 doorClosed（正门在修）就不走正门
export const PLACES = {
  home:     { name: '家',       node: [1, 4], doorTo: [1, 5], doorAt: 0.6, block: [0, 4], color: 0xe8a87c },
  market:   { name: '菜市场',   node: [5, 1], doorTo: [6, 1], gates: [[[5, 0], [6, 0]]], block: [5, 0], color: 0xd46a4c },   // 正门在南街、后门在北街，平时走离得近的；第 6、7 天正门在修，只走后门
  park:     { name: '公园棋亭', node: [3, 0], doorTo: [2, 0], block: [2, 0], color: 0x6fa86b },
  pharmacy: { name: '药店',     node: [4, 3], doorTo: [5, 3], block: [4, 3], color: 0x5fa3c9 },
  center:   { name: '社区中心', node: [6, 4], doorTo: [5, 4], block: [5, 4], color: 0xc9a14a },
  post:     { name: '快递驿站',     node: [0, 1], doorTo: [1, 1], block: [0, 1], color: 0x3f7a57 },
  school:   { name: '小学',     node: [2, 3], doorTo: [1, 3], block: [1, 2], color: 0xb27fbf },
};

// 他住了几十年、一直认得的老地标（远期记忆相对保留）
export const OLD_LANDMARKS = [
  { id: 'banyan', name: '老榕树', node: [1, 3], kind: 'tree' },   // 10-14 用户：和原来 (2,4) 东南那块街区的房子对调——第 1 天出门必经 (1,3)，往事在榕树下当场讲；路线不变（两处都在家门口一圈，规则里本来就认得）
  { id: 'cinema', name: '老电影院', node: [4, 2], kind: 'cinema' },
  { id: 'well',   name: '老水井', node: [5, 3], kind: 'well' },
];

// 可以拜托的邻居（放在其家门口路口）
export const NEIGHBORS = [
  { id: 'wang', name: '王阿姨', node: [3, 3], block: [2, 2] },
  { id: 'li',   name: '刘师傅', node: [5, 2], block: [5, 1] },
  { id: 'zhao', name: '赵大爷', node: [1, 1], block: [1, 0] },
  { id: 'chen', name: '陈老板', node: [4, 5], block: [3, 4] },
];

// 支持方式
export const SUPPORTS = {
  sign:     { name: '醒目路标', cost: 1, icon: '◆', color: '#e4774f', target: 'node',
              tip: '放在路口。他会认出这里，也更愿意走经过路标的路。' },
  note:     { name: '便签', cost: 1, icon: '✎', color: '#4a7fc1', target: 'home', slot: 'note',
              tip: '贴在门口：今天要买的、邻居托的，都写上。只管当天。' },
  pillbox:  { name: '分格药盒', cost: 1, icon: '▦', color: '#3f8f7a', target: 'home', slot: 'pillbox',
              tip: '按星期分格。吃没吃过，一眼就知道。' },
  neighbor: { name: '拜托邻居', cost: 2, icon: '☺', color: '#c98b2e', target: 'neighbor',
              tip: '邻居看到他在附近犹豫、走错时，会出门打个招呼、顺口指路；他在附近迷路时，也会过来领一段。' },
  calendar: { name: '大字日历', cost: 1, icon: '▤', color: '#b85c8a', target: 'home', slot: 'calendar',
              tip: '挂在客厅，每天撕一页。今天星期几、有什么安排，一看就知道。' },
  photo:    { name: '老照片', cost: 1, icon: '▣', color: '#8c6e5d', target: 'home', slot: 'photo',
              tip: '挂在客厅：他和老伴当年在老电影院门口的合影。每天早上看一眼，心里踏实；老地方变了样，也认得出来。' },
  song:     { name: '一首老歌', cost: 1, icon: '♪', color: '#8a6fc1', target: 'home', slot: 'song',
              tip: '放一首他年轻时常唱的歌（只管当天）。心情好了，做事也更投入。' },
  pact:     { name: '反诈约定', cost: 1, icon: '☏', color: '#2f6f8f', target: 'home', slot: 'pact',
              tip: '事先和他说好、贴在电话旁：凡是电话里要钱，先挂断，再打给家人本人核实。' },
};

// 菜市场上的东西（回忆小关卡的干扰项）
export const MARKET_POOL = ['土豆', '茄子', '黄瓜', '胡萝卜', '白菜', '青椒', '牛肉', '鸡翅', '带鱼', '芹菜', '蒜苗', '木耳', '豆芽', '南瓜', '虾', '香菇', '菠菜', '洋葱', '西瓜', '桃子', '葱油饼', '馒头'];

// 犹豫时刻：先少后多的提示。p 为成功率；wait 与 cue 成功都算“他自己来”。
export const MOMENTS = {
  meds: {
    title: '药……吃过了吗？', ctx: '他站在药瓶前，想不起今天早上吃没吃过。',
    wait: { p: 0.35, ok: '他看了看早饭的碗，想起来了：“还没吃。”吃上了。', fail: '他拿起药瓶又放下，还是想不起来。' },
    cue:  { label: '提示：“吃早饭那会儿吃药了吗？”', p: 0.6, ok: '“早饭……对，那会儿还没吃。”他自己吃上了。', fail: '他摇摇头：“记不清了。”' },
    tell: { label: '直接告诉他：“还没吃，吃一片。”', ok: '他照你说的吃了。' },
  },
  shop: {
    title: '还要买什么来着……', ctx: '他在菜摊前停住，想不起清单上还有什么。',
    wait: { p: 0.3, ok: '他在摊子前转了一圈，看到西红柿：“对，还有这个！”', fail: '他转了一圈，还是没想起来。' },
    cue:  { label: '陪他一起想想要买什么', game: 'recall', p: 0, ok: '“对对，${hit}！”他一样样想起来了。', fail: '他拿起一样又放下：“是这个吗？”' },
    tell: { label: '翻出手机里的清单念给他', ok: '他照着你念的买齐了。' },
  },
  lost: {
    title: '我……有点找不着路了', ctx: '他停在路口，看起来很着急。',
    wait: { p: 0.35, ok: '他深吸一口气，向路过的人问了路。', fail: '他站在原地，越来越慌。' },
    cue:  { label: '问他：“你身边能看到什么？”', p: 0, ok: '“我看到……${seen}了！”他自己认出了方向。', fail: '“都是房子，看着都差不多……”' },
    tell: { label: '电话里给他指几个路口', game: 'route', ok: '他照着你说的走了一小段，后面的路自己找。' },
  },
  weekday: {
    title: '今天……星期六吧？下棋去！', ctx: '他拿起棋盒准备出门。其实今天是星期四，上午有社区健康讲座。',
    wait: { p: 0.3, ok: '他瞥见门口的报纸，“哦，才星期四。”放下棋盒，准备去听讲座。', fail: '他哼着歌，已经走到了门口。' },
    cue:  { label: '提示：“看看今天报纸上的日期？”', p: 0.85, ok: '“星期四……讲座！差点忘了。”', fail: '“报纸？昨天的吧。”' },
    tell: { label: '告诉他：“今天星期四，有讲座。”', ok: '“是吗？好好，那去听讲座。”' },
  },
  stove: {   // 备用：炖鱼关火（初版剧情用过，当前 7 天没有这件事；新剧情可直接用 task: 'stove'）
    title: '五点十分记得关火……', ctx: '他炖上鱼，想五点十分关火。可厨房的挂钟停了，这时老朋友又打来电话。',
    wait: { p: 0.35, ok: '他闻到味道，“哎呀！”赶紧关了火。', fail: '他还在聊天，没注意到。' },
    cue:  { label: '帮他把厨房的挂钟修好，定在五点十分', game: 'clock', p: 0, ok: '五点十分，挂钟“当”地响了。他放下电话：“哎，火！”自己去关了。', fail: '挂钟没修好，到点没有响。' },
    tell: { label: '告诉他：“快去关火！”', ok: '他赶紧去关了火。' },
  },
  cook: {
    title: '下一步……是什么来着？', ctx: '包到一半，他拿着擀面杖停住了。',
    wait: { p: 0.4, ok: '他的手先想起来了，擀面杖一转，皮就圆了。', fail: '他拿着擀面杖，愣了一会儿。' },
    cue:  { label: '提示：“皮擀好了吗？”', p: 0.8, ok: '“对对，先擀皮。”他又熟练起来，一口气包了一盘。', fail: '“皮……”他看着面团发呆。' },
    tell: { label: '告诉他：“先擀皮，再放馅。”', ok: '他照着做完了。' },
  },
  leaflet: {
    title: '免费领鸡蛋？', ctx: '菜市场门口，有人拉住他：“大爷，免费领鸡蛋！留个手机号，明天来听养生课，还送礼品。”',
    wait: { p: 0.4, ok: '他摆摆手：“白给的东西，后头都有说法。”', fail: '他接过笔，准备写手机号。' },
    cue:  { label: '提示：“免费的东西，为什么要留手机号？”', p: 0.85, ok: '“也是啊……”他把笔放下了。', fail: '“就留个号，没事吧？”' },
    tell: { label: '告诉他：这是推销保健品的套路', ok: '“还有这种事？”他把传单扔进了垃圾桶。' },
  },
  scam: {
    title: '什么？闺女出事了？！', ctx: '一个陌生电话里，自称是他闺女，说出了事，要他马上去银行转账。',
    wait: { p: 0.3, ok: '他越听越不对劲：“你叫什么名字？”对方挂了。', fail: '他慌了，开始找存折。' },
    cue:  { label: '让他开免提，你一起听听哪里不对', game: 'vigilance', p: 0, ok: '你把可疑的地方一句句指给他。他自己挂了电话，拨给闺女原来的号码——闺女好好的，正在单位上班。', fail: '可疑的话一闪而过，他还是半信半疑。' },
    tell: { label: '告诉他：“这是骗子，挂掉。”', ok: '他挂了电话，还是有点后怕。' },
  },
};

// 每一天。time 以分钟计（480 = 8:00）。人物、剧情均为原型占位。
export const DAYS = [
  {
    title: '第一天 · 买菜', weekday: '星期二',
    intro: '每周二上午，爷爷去公园下棋，下完顺路买菜。这个习惯他保持了很多年——只是最近，他在路口停下来的次数多了。',
    energy: 3, unlock: ['sign', 'pillbox'], weather: 'sun',   // 第 1 天没有便签：一定会玩到“帮他想起菜单”
    goals: [
      { id: 'meds',  at: 480, kind: 'home', task: 'meds',  label: '吃早上的药' },
      { id: 'chess', at: 540, kind: 'trip', place: 'park', task: 'chess', label: '去公园棋亭下棋', until: 720 },   // 新手日：9 点出门（原 9:30），少在家空等、路上多些余量（P2t 暂定）
      { id: 'buy',   at: 690, kind: 'trip', place: 'market', task: 'shop', label: '下完棋，顺路买菜', until: 800, chain: true, level: 'change',
        menu: { dish: '西红柿鸡蛋面', items: ['西红柿', '鸡蛋', '面条', '小葱', '青菜'] } },
    ],
    end: 1110,
    tip: '早期阿尔茨海默病常先影响“新近发生的事”的记忆，以及在不熟悉路线上的方向感；几十年前的地方和事，往往记得更牢。环境里清楚、稳定的线索，能让人更多地靠自己完成日常。',
    memory: '“这棵榕树啊，我闺女小时候在底下摔过一跤，哭得整条街都听见。”',
  },
  {
    title: '第二天 · 取快递', weekday: '星期三',
    intro: '老张是爷爷的老乡，也是老战友。他退休后回了老家，每年新茶一下来，都给爷爷寄一包。今天快递到了，驿站会发短信来报取件码。上午顺便去药店买降压药，午后有雨。',
    energy: 3, unlock: ['neighbor', 'note'], weather: 'rain', rainFrom: 780,   // 便签第 2 天出现：正好用来记邻居托的事
    goals: [
      { id: 'meds', at: 480, kind: 'home', task: 'meds', label: '吃早上的药' },
      { id: 'rx',   at: 570, kind: 'trip', place: 'pharmacy', task: 'rx', label: '去药店买降压药', until: 720 },
      { id: 'post', at: 840, kind: 'trip', place: 'post', task: 'post', label: '去驿站取老张寄的茶', until: 1020, level: 'digits' },
    ],
    end: 1110,
    tip: '迷路时，熟悉的人一句自然的招呼，往往比一连串纠正更有帮助。给他时间自己认出路，也是一种帮助。',
    memoryAlt: [{ when: { goal: 'post', notDone: true }, id: 'mem2b', memory: '“老张跟我是老乡，年轻时一起当过兵。茶今天没取着，不打紧，明天再去——他的心意，放几天也跑不了。”' }],   // 没取到茶
    memory: '“老张跟我是老乡，年轻时一起当过兵。他回了老家，每年新茶一下来，就给我寄一包，说外面的茶喝不出家乡的味道。”',
  },
  {
    title: '第三天 · 健步走', weekday: '星期四',
    intro: '上午社区中心有健康讲座，讲完大家一起健步走，路线要在地图上连出来。下午四点，他还要去小学门口接孙女。对了，去社区中心的那段路今天在修。',
    energy: 3, unlock: ['calendar'], weather: 'sun', blocked: [[[3, 4], [4, 4]]],
    goals: [
      { id: 'talk',  at: 540, kind: 'trip', place: 'center', task: 'talk', label: '去社区中心听讲座', until: 680, pre: 'weekday', level: 'trail' },
      { id: 'pick',  at: 900, kind: 'trip', place: 'school', task: 'pick', label: '去小学接孙女', until: 975 },
    ],
    end: 1110,
    tip: '分不清今天星期几，在认知障碍中很常见。醒目的日历、固定的作息和不带考问的提醒，比反复追问“你知道今天星期几吗”更有帮助。',
    memory: '“我闺女上小学那会儿，我天天在这门口等。她总是最后一个出来，书包比她还大。”',
  },
  {
    title: '第四天 · 老电影', weekday: '星期五',
    intro: '老电影院改成了手机店。今晚七点，社区中心放他年轻时看过的老电影。家里闹钟摔坏了，下午帮他修好、定上六点十分的闹铃，看电视就不会误了点。',
    energy: 3, unlock: ['photo'], weather: 'sun', changed: ['cinema'],
    goals: [
      { id: 'rx',    at: 570, kind: 'trip', place: 'pharmacy', task: 'rx', label: '去药店量血压', until: 720 },
      { id: 'clock', at: 870, kind: 'home', task: 'clock', label: '修好摔坏的闹钟' },   // 下午修（午饭后到出门看电影之间，两头等待差不多）
      { id: 'movie', at: 1090, kind: 'trip', place: 'center', task: 'movie', label: '去社区中心看老电影（七点开场）', until: 1200 },
    ],
    end: 1300,
    tip: '熟悉的地方改变了，依赖多年记忆认路的人更容易困惑。保留或提示旧的参照物（老照片、老招牌），能把过去的记忆和现在的环境连起来。',
    memory: '“第一次跟老伴约会，看的就是这部片子。演的什么全忘了，只记得她穿了条蓝裙子。”',
  },
  {
    title: '第五天 · 包饺子', weekday: '星期六',
    intro: '周六上午照例下棋——去公园的路在修；下完顺路买饺子馅。下午孙女来学包饺子，这回，爷爷是老师。',
    energy: 3, unlock: ['song'], weather: 'sun', blocked: [[[3, 2], [3, 3]]],
    fade: [[1, 5]], fadeNote: '家门口另一头的那个路口，他走了几十年，这两天到那儿也要停一停。',   // 10-21：原为 (1,3)，榕树 10-14 挪到 (1,3) 后老地标规则先于淡雾判断，淡雾不生效，改到家门门口那段路另一头的熟路口 (1,5)（试过 (2,4)：第 6 天规则结果变差，不用）。病程变化（10-06 暂定）：原来熟的路口起淡雾，按天定好、与玩家做得好坏无关
    goals: [
      { id: 'chess', at: 570, kind: 'trip', place: 'park', task: 'chess', label: '去公园棋亭下棋', until: 690 },
      { id: 'buy',   at: 690, kind: 'trip', place: 'market', task: 'shop', label: '下完棋，顺路买饺子馅', until: 800, chain: true, promo: true, recall: false,
        menu: { dish: '韭菜猪肉饺子', items: ['韭菜', '猪肉', '鸡蛋', '香油', '生姜'] } },
      { id: 'cook',  at: 990, kind: 'home', task: 'cook', label: '教孙女包饺子' },
    ],
    end: 1110,
    tip: '熟悉的音乐常能让人放松、更愿意参与。一起做事时，先给最少的提示、等一等，再逐步增加帮助。这样更能保住他“自己做到”的感觉。',
    memory: '“饺子是我娘教我包的。她说褶子捏够十八个，日子就圆满了。我到现在还一个一个数着捏。”',
  },
  {
    title: '第六天 · 陌生来电', weekday: '星期日',
    intro: '上午他去社区中心参加合唱排练，下午去买菜——菜市场正门在修，得绕到后门进。最近，附近好几位老人接到过冒充子女的诈骗电话，爷爷会不会也接到？',
    energy: 3, unlock: ['pact'], weather: 'sun',
    fade: [[2, 3]], fadeNote: '小学门口那个路口，以前闭着眼都能走，这两天他在那儿也会愣一下。',
    goals: [
      { id: 'choir', at: 550, kind: 'trip', place: 'center', task: 'choir', label: '去社区中心排练合唱', until: 680 },
      { id: 'scam',  at: 840, kind: 'home', task: 'scam', label: '一个陌生来电' },
      { id: 'buy',   at: 870, kind: 'trip', place: 'market', task: 'shop', label: '去菜市场买菜（正门在修，走后门）', until: 1070, recall: false, doorClosed: true,   // doorClosed：正门在修——只走别的门，画面在正门前摆围栏   // 难度统筹：绕后门路远，余量放到 60 分钟以上（原 15:00／17:20）
        menu: { dish: '冬瓜排骨汤', items: ['排骨', '冬瓜', '香菜', '枸杞'] } },
    ],
    end: 1170,   // 下午买菜绕后门，回到家已近傍晚：天黑时间放到 19:30（09-27 他的日子：否则好好帮也会被判“天黑还在外面”）
    tip: '认知变化可能让人更难识别诈骗。事先约定“电话里要钱的事，先打给家人确认”，比事后责备更有用。',
    memory: '“骗子？我当了一辈子会计，账从来没算错过。……就是最近，老记不住东西。”',
  },
  {
    title: '第七天 · 象棋比赛', weekday: '星期一',
    intro: '社区中心办老年象棋比赛，第一轮是残局赛：照着棋谱摆好残局，再往下走。他报了名，说一定要自己走过去。上午先去菜市场给棋友买水果——正门还没修好，还得走后门。中心门口那段路也在修，下午可能下雨。',
    energy: 3, unlock: [], weather: 'rain', rainFrom: 960, blocked: [[[4, 4], [5, 4]]],
    goals: [
      { id: 'buy',   at: 480, kind: 'trip', place: 'market', task: 'shop', label: '去菜市场给棋友买水果（正门还在修，走后门）', until: 720, recall: false, doorClosed: true,   // 难度统筹：8 点出门（原 9 点）——绕后门来回太远，原来回到家已过午，比赛多半迟到
        menu: { dish: '一袋水果', items: ['橘子', '香蕉', '苹果', '葡萄', '梨'], say: '要给棋友带一袋水果' } },
      { id: 'match', at: 770, kind: 'trip', place: 'center', task: 'match', label: '去社区中心参加象棋比赛', until: 960, level: 'chess' },   // 难度统筹：16:00 截止（原 15:00，09-27 改 15:30；10-06 两处熟路口起淡雾后再放宽半小时）
    ],
    end: 1200,
    tip: '帮忙不是为了让他什么都不出错，而是在安全的前提下，让他尽量多地过自己的日子。对认知障碍友好的社区，靠很多人的一点点留意。',
    memoryAlt: [   // 没赶上比赛；你陪着去、或给他指了路（就不是“自己走来的”）
      { when: { goal: 'match', notDone: true }, id: 'mem7c', memory: '“输赢不要紧。今天没赶上，下回我早点出门，还自己走过去。”' },
      { when: { goal: 'match', helped: true }, id: 'mem7b', memory: '“输赢不要紧。能坐到棋盘前，跟老伙计们下一盘，就挺好。”' }],
    memory: '“输赢不要紧。我是自己走来的——这个最要紧。”',
  },
];

// 手册：现实中的对应做法（表述保守，不作疗效承诺）
export const HANDBOOK = {   // 一句话（09-27 手册精简）
  sign: '醒目、稳定的标识，能帮人认方向。',
  note: '当天要做的事写下来，放在固定的地方。',
  pillbox: '按日期分格，减少漏服和重复服药。',
  neighbor: '熟人留意、打个招呼，是认知障碍友好社区的一部分。',
  calendar: '醒目的日历和固定作息，比反复考问更友好。',
  photo: '看老照片、聊往事，常能让人安定。',
  song: '熟悉的音乐常让人放松，效果因人而异。',
  pact: '事先和家人说好最管用；可疑电话可拨 96110。',
}

// 常见的早期变化（公共科普表述，意译整理；不是诊断标准）
export const WARNING_SIGNS = [
  '刚发生的事、刚说过的话很快就忘，同样的问题反复问',
  '在熟悉的地方也会迷路，或弄不清自己怎么到了这里',
  '经常分不清日期、星期、季节',
  '做了多年的熟悉事情（做饭、算账、用电器）变得吃力',
  '说话时常想不起词，或把东西叫错名字',
  '东西常放错地方，又想不起来放在哪里',
  '判断力变差，比如容易轻信推销和诈骗',
  '对以前的爱好、社交失去兴趣，情绪或性格明显变化',
];

// 邻居托他顺路带点东西：被需要，也是一件要记住的事（便签能帮他记）
// name：画面和旁白里的称呼；call：爷爷嘴里的称呼（他七十多岁，不叫“阿姨”“大爷”）
export const FAVORS = {
  1: { who: 'zhao', call: '老赵', name: '赵大爷', item: '一瓶风油精', task: 'rx' },
  3: { who: 'wang', call: '王大姐', name: '王阿姨', item: '一盒创可贴', task: 'rx' },
  4: { who: 'chen', call: '陈老板', name: '陈老板', item: '一把葱', task: 'shop' },
  5: { who: 'li', call: '刘师傅', name: '刘师傅', item: '两斤鸡蛋', task: 'shop' },
};

// 道具卡上的两字简称
export const SUPPORT_SHORT = { sign: '路标', note: '便签', pillbox: '药盒', neighbor: '邻居', calendar: '日历', photo: '照片', song: '老歌', pact: '约定' };

// 这一天讲哪段往事：往事里说到的事和当天结果要对得上（没取到茶就不说“寄来的茶”，有人陪着去就不说“自己走来的”）。
// 返回 { id: 配音编号, memory: 文字 }；goals 是当天各件事的结果（sim.goals）
export function pickMemory(dayIdx, goals = []) {
  const d = DAYS[dayIdx];
  for (const alt of d.memoryAlt || []) {   // 按顺序，第一个对得上的
    const g = goals.find(x => x.id === alt.when.goal);
    if (g && ((alt.when.notDone && g.status !== 'done') || (alt.when.helped && g.helped))) return { id: alt.id, memory: alt.memory, alt: true };
  }
  return { id: 'mem' + (dayIdx + 1), memory: d.memory };
}
// 按编号找回某天讲过的那段往事（结局页用；旧存档没有编号就用原本那段）
export function memoryById(dayIdx, id) {
  const d = DAYS[dayIdx], alt = (d.memoryAlt || []).find(a => a.id === id);
  return alt ? { id: alt.id, memory: alt.memory } : { id: 'mem' + (dayIdx + 1), memory: d.memory };
}
