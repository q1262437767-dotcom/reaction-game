(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureStory = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Room graphs for chapters 2–5, the hidden line, and the dawn walk.
  // Chapter 1 stays in engine.js. Coordinates are orthogonal so co-op
  // snapshots can check the same doorway rule as the earlier sections.
  var NOTES = {
    'north-oil': { title: '补过的灯油', text: '北口石灯的油壶是新的，壶底写着一个小字：穗。雾里有人刚走过，灰尾狐闻得到。' },
    'north-signal': { title: '三短一长', text: '哨站日志只剩一行：“南灯若重明，此塔应三短一长。”给养箱还没动过。' },
    'xiaosui': { title: '小穗', text: '“这盏蓝灯是我点的。也是它自己在答你们。南边一亮，应答程序就响了——我只是没让它再灭。”' },
    'lamp-map': { title: '灯路图', text: '图上隔离炉那一点还在跳。小穗：“你们把主芯留在那儿，脉冲已经传到总炉了。”' },
    'heng-sign': { title: '副调度的签名', text: '旧牌上是守灯人当年的职签，下面另有一行：副调度衡石。他签过“继续回收”。' },
    'echo-note': { title: '真焰不闪', text: '应答灯的火焰是稳的。会抖的蓝光都是回声。水能浇灭它的灯腔。' },
    cable: { title: '贯穿全谷的线', text: '渠壁里嵌着识别线的电缆。断头还亮着铜。涨水能把箱子托成桥，放水才看得见底舱。' },
    'register-hint': { title: '漏记的底舱', text: '水退到底时，东壁有一扇没登记的门。门上写着：听声廊之后，别惊动巡卫。' },
    'quiet-log': { title: '两种主张', text: '一本湿账。有人写“把回收走完”，有人写“把线接回去”。后一页被撕掉了。' },
    'cut-order': { title: '剪线令原件', text: '守灯人的全令：“总炉将溢。剪断识别线，停下溢流。”页脚后来补了一句：回收令没有撤销。' },
    'heng-note': { title: '衡石的留言', text: '“应完成回收，不宜重接。火一旦交还总炉，溢炉会再来一次。”' },
    'keeper-talk': { title: '守灯人', text: '“识别线是我剪的。当时总炉要溢，不剪，整条谷都会烧起来。我没想到回收令不会停。”' },
    drafts: { title: '两份令稿', text: '完结令：停止回收，封上总炉。重明令：接回识别线，让灯重新认人。陶铆：“这次不是借。是送它回家。”' },
    'core-hot': { title: '比留下时更热', text: '隔离炉的表针自己在跳。陶铆：“一拿起来，路上所有归炉者都会醒。我们还是拿。”' },
    'pulse-route': { title: '心跳开门', text: '总炉的脉冲低潮时炉口开，高潮时吞火。上路避热，下路借暗。换道闸在邻房。' },
    'cabinet-names': { title: '被收走的营名', text: '柜上刻着已经灭掉的营：霜驿、西渡、北坡。有些芯还温着。点亮它们，不算完成任务。' },
    'heng-call': { title: '衡石的远话', text: '“完成回收，别把火交回那座炉。你们不确定它还认不认得人。”' },
    'door-talk': { title: '炉门之前', text: '衡石：“再往前，就是把火重新交给那座炉。”守灯人站在他对面，没有退。' },
    proof: { title: '完整时它认得住人', text: '识别晶和剪线令对在一起。炉在识别线完整的时候，可以安全看管，不必当成坟。' },
    'ash-warn': { title: '砸炉之前', text: '终端写着警告：不下令稿、只砸炉心，回收会停，许多灯也会灭。营地可能只剩这一盏。再确认一次。' },
    'home-true': { title: '灯一盏盏接上', text: '回去的路上，灭掉的站自己亮了。蓝灯和金灯交错，像在互相叫名字。' },
    'home-normal': { title: '已经点着的还亮', text: '营灯和北塔还在。中间的站没有应答。阿禾还是会往北边看。' },
    'home-ash': { title: '路上是暗的', text: '大部分灯口是冷的。陶铆把主芯护在怀里，谁也没说话。' },
    dawn: { title: '晨灯', text: '老岑把火拨旺了一点。小林能走路了。灰尾狐躺在灯下。这一夜的回答，写在灯还亮不亮上。' },
    'unlisted-log': { title: '没有登记的班组', text: '检修班的名册不在小穗的图上。他们想把线接回去，然后再也没有回营。' },
    'crew-core': { title: '迷途的灯芯', text: '芯座上还留着人的温度。若带着识别晶，连追芯的机器也会停半拍。' }
  };

  function room(name, kind, gx, gy, neighbors, extra) {
    return Object.assign({ name: name, kind: kind, gx: gx, gy: gy, neighbors: neighbors, need: '',
      secret: false, dark: false, wind: false, deep: false, hot: false, listen: false, terminal: false,
      walls: [], props: [], foes: [], items: [] }, extra || {});
  }
  function note(clue, x, y) { return { kind: 'story-note', x: x, y: y, label: '查看' + NOTES[clue].title, clue: clue }; }
  function foe(kind, x, y, role, name, boss) { return { kind: kind, x: x, y: y, role: role || '', name: name, boss: !!boss }; }

  var CHAPTERS = {
    chapter2: {
      name: '第二章 · 第一节 · 循光北上', goal: '提起灯，穿过雾径，找到北坡的应答', coins: 55,
      endWin: '雾散开一点。北坡的蓝灯又闪了一下，像在等下一句回答。',
      endLose: '灯油和人都没能走出雾径。',
      objective: '提起灯 · 雾里有东西会吹灭它',
      rooms: [
        room('营地北口', 'camp', 0, 0, [1], { items: [
          { kind: 'story-lantern', x: 470, y: 300, label: '提起北口的灯' },
          note('north-oil', 250, 180)
        ] }),
        room('雾径', 'battle', 1, 0, [0, 2, 3], { dark: true, wind: true, walls: [[360, 150, 70, 90]], props: [['barrel', 700, 180]],
          foes: [foe('chaser', 640, 340, 'snuff', '雾巡卫')],
          items: [{ kind: 'story-oil', x: 700, y: 250, label: '给提灯补油' }] }),
        room('雾中岔口', 'battle', 2, 0, [1, 4], { dark: true, walls: [[420, 360, 80, 70]],
          foes: [foe('chaser', 560, 220, 'seek', '追光巡卫'), foe('shooter', 760, 420, 'shade', '暗处枪卫')],
          items: [{ kind: 'story-oil', x: 220, y: 160, label: '壁龛里的灯油' }] }),
        room('盲灯井', 'secret', 1, 1, [1], { secret: true, dark: true, need: 'well',
          items: [note('north-oil', 300, 160), { kind: 'story-lamp', x: 480, y: 320, label: '拾起盲井蓝焰', lamp: 'wellblue' },
            { kind: 'story-relic', x: 680, y: 200, label: '取下蓝焰罩', relic: 'bluehood' }] }),
        room('北坡出口', 'rescue', 3, 0, [2], { dark: true, need: 'lit',
          items: [{ kind: 'story-goal', x: 480, y: 280, label: '把灯举向北坡' }] })
      ]
    },
    chapter2_2: {
      name: '第二章 · 第二节 · 熄灯哨站', goal: '按三短一长打开哨站的闸', coins: 55,
      endWin: '闸开了。站里的芯早就被收走，小穗的给养还在。',
      endLose: '哨站又暗了下去。',
      objective: '塔上闪码 · 闸下读码',
      rooms: [
        room('哨站外', 'camp', 0, 0, [1], { dark: true, items: [{ kind: 'story-lantern', x: 420, y: 300, label: '点起带来的灯' }] }),
        room('熄灯站院', 'battle', 1, 0, [0, 2, 3], { dark: true, walls: [[300, 400, 90, 60]],
          foes: [foe('shield', 620, 240, '', '守夜机械')],
          items: [note('north-signal', 240, 170), { kind: 'story-supply', x: 760, y: 160, label: '取用小穗的给养' }] }),
        room('应答塔台', 'puzzle', 1, -1, [1], { dark: true, terminal: true,
          items: [{ kind: 'story-flash', x: 480, y: 260, label: '打出三短一长', pair: 3 }] }),
        room('塔下闸门', 'puzzle', 2, 0, [1, 4], { dark: true, terminal: true,
          items: [{ kind: 'story-read', x: 460, y: 300, label: '按灯讯开闸', pair: 2 }] }),
        room('站后小路', 'rescue', 3, 0, [3], { need: 'code',
          items: [{ kind: 'story-goal', x: 480, y: 280, label: '离开哨站，往霜塔走' }] })
      ]
    },
    chapter2_3: {
      name: '第二章 · 第三节 · 霜塔相认', goal: '见到小穗，听她说出蓝灯的答案', coins: 55,
      endWin: '小穗把灯路图推过来。北面已经听见隔离炉里那枚主芯。',
      endLose: '霜塔的门又合上了。',
      objective: '沿塔上行 · 蓝灯照得出秘道',
      rooms: [
        room('霜塔门', 'camp', 0, 0, [1], { dark: true, items: [
          { kind: 'story-lantern', x: 360, y: 300, label: '把灯留在手里' },
          { kind: 'story-talk', x: 560, y: 250, label: '听小穗说话', clue: 'xiaosui' }
        ] }),
        room('塔梯', 'battle', 1, 0, [0, 2, 3], { dark: true, walls: [[480, 140, 50, 120]],
          foes: [foe('chaser', 720, 400, 'seek', '塔内巡卫')] }),
        room('蓝光秘道', 'puzzle', 1, 1, [1, 3], { dark: true, secret: true, need: 'lit',
          items: [{ kind: 'story-oil', x: 400, y: 300, label: '秘道里的灯油' }] }),
        room('灯路图室', 'rescue', 2, 0, [1, 2], {
          items: [note('lamp-map', 320, 200), { kind: 'story-goal', x: 620, y: 320, label: '收下灯路图', needClue: 'xiaosui' }] })
      ]
    },
    chapter2_4: {
      name: '第二章 · 第四节 · 护灯一晚', goal: '守住应答灯，停下回声灯卫', coins: 55,
      endWin: '小穗：“你们把主芯留在隔离炉里，可脉冲还是传上去了。北面那头，比归炉者更大的东西已经动身了。”',
      endLose: '应答灯灭了。蓝光不再往南边回。',
      objective: '真焰不闪 · 用水浇灭回声的灯腔',
      rooms: [
        room('灯台', 'camp', 0, 0, [1], { dark: true, items: [
          { kind: 'story-lantern', x: 300, y: 280, label: '稳住真焰' },
          note('echo-note', 620, 180)
        ], props: [['barrel', 760, 420]] }),
        room('灯廊', 'battle', 1, 0, [0, 2], { dark: true, foes: [foe('shooter', 680, 240, 'seek', '假灯枪卫')] }),
        room('回声庭', 'boss', 2, 0, [1, 3], { dark: true, walls: [[200, 250, 70, 80], [680, 250, 70, 80]],
          foes: [foe('duelist', 620, 280, 'echo', '回声灯卫', true)],
          props: [['barrel', 180, 160]],
          items: [{ kind: 'story-flame', x: 480, y: 160, label: '守住这盏不闪的灯' }] }),
        room('塔顶', 'rescue', 3, 0, [2], { need: 'down', items: [
          note('heng-sign', 300, 180),
          { kind: 'story-goal', x: 520, y: 320, label: '听小穗把话说完' }
        ] })
      ]
    },
    chapter3: {
      name: '第三章 · 第一节 · 水下的线', goal: '用涨水和泄水找出识别线的断头', coins: 60,
      endWin: '电缆还连着全谷。有几处断头，接得上。',
      endLose: '渠水把路封住了。',
      objective: '涨水托箱 · 放水见底舱',
      rooms: [
        room('渠口', 'camp', 0, 0, [1], { items: [
          { kind: 'story-valve', x: 480, y: 280, label: '扳动水位闸' },
          note('cable', 240, 180)
        ] }),
        room('浅渠', 'puzzle', 1, 0, [0, 2, 4], { deep: true, walls: [[360, 390, 200, 40]],
          props: [['crate', 480, 430]],
          foes: [foe('chaser', 700, 200, '', '渠岸巡卫')] }),
        room('漂箱廊', 'battle', 2, 0, [1, 3], { deep: true, need: 'water1',
          items: [{ kind: 'story-air', x: 480, y: 200, label: '在气窝里换气' }] }),
        room('断头平台', 'rescue', 3, 0, [2], { items: [{ kind: 'story-goal', x: 480, y: 280, label: '记下还能接的断头' }] }),
        room('旧登记库门口', 'secret', 1, 1, [1], { secret: true, need: 'water0',
          items: [note('register-hint', 420, 260), { kind: 'story-relic', x: 640, y: 200, label: '取下隔水苔', relic: 'moss' }] })
      ]
    },
    chapter3_2: {
      name: '第三章 · 第二节 · 听声的廊', goal: '静步穿过长廊；不惊动巡卫才能进旧登记库', coins: 60,
      endWin: '廊走完了。惊动过的人，看不见那间库。',
      endLose: '听声的机器把路封死了。',
      objective: '静步 · 或让灰尾狐替你出声',
      rooms: [
        room('廊口', 'camp', 0, 0, [1], { listen: true, items: [note('quiet-log', 300, 200)] }),
        room('听声长廊', 'battle', 1, 0, [0, 2, 3, 4], { listen: true, walls: [[450, 140, 60, 320]],
          foes: [foe('chaser', 250, 300, 'listen', '听声巡卫'), foe('shooter', 760, 180, 'listen', '听声枪卫')] }),
        room('侧室', 'puzzle', 1, 1, [1], { items: [{ kind: 'story-bark', x: 480, y: 280, label: '让灰尾狐叫一声' }] }),
        room('旧登记库', 'secret', 1, -1, [1], { secret: true, need: 'quiet', terminal: false,
          items: [note('cut-order', 340, 200), { kind: 'story-lamp', x: 560, y: 320, label: '取下识别晶碎片', lamp: 'archive' }] }),
        room('廊尾', 'rescue', 2, 0, [1], { items: [{ kind: 'story-goal', x: 480, y: 280, label: '去登记厅' }] })
      ]
    },
    chapter3_3: {
      name: '第三章 · 第三节 · 登记厅', goal: '听守灯人说完，并在两端同时接上一段线', coins: 60,
      endWin: '这一小段识别线活了。厅里的机器第一次犹豫。',
      endLose: '接线窗口过了，厅里重新只认货物。',
      objective: '两端同时合闸 · 单人时阿禾去对端',
      rooms: [
        room('厅门', 'camp', 0, 0, [1], { items: [
          { kind: 'story-talk', x: 480, y: 260, label: '听守灯人', clue: 'keeper-talk' },
          note('heng-note', 240, 180)
        ] }),
        room('东端终端', 'puzzle', 1, 0, [0, 2], { terminal: true,
          items: [{ kind: 'story-link', x: 420, y: 300, label: '合上东端', pair: 2 }] }),
        room('西端终端', 'puzzle', 2, 0, [1, 3], { terminal: true,
          items: [{ kind: 'story-link', x: 540, y: 300, label: '合上西端', pair: 1 }] }),
        room('厅后', 'rescue', 3, 0, [2], { need: 'linked',
          items: [{ kind: 'story-goal', x: 480, y: 280, label: '带上接好的这一段', needClue: 'keeper-talk' }] })
      ]
    },
    chapter3_4: {
      name: '第三章 · 第四节 · 检线', goal: '接上邻房的线，打开检线官的护舱', coins: 60,
      endWin: '陶铆：“这次不是借。是送它回家，可要按我们的规矩。”',
      endLose: '检线官把人又标成了货物。',
      objective: '先被它抓住 · 再在窗口里把线接上',
      rooms: [
        room('检线站口', 'camp', 0, 0, [1], {}),
        room('邻房终端', 'puzzle', 1, 0, [0, 2], { terminal: true,
          items: [{ kind: 'story-link', x: 480, y: 280, label: '在窗口里接线', pair: 2 }] }),
        room('检线庭', 'boss', 2, 0, [1, 3], { walls: [[180, 220, 60, 140]],
          foes: [foe('duelist', 640, 280, 'scan', '检线官', true)] }),
        room('令稿桌', 'rescue', 3, 0, [2], { need: 'down',
          items: [note('drafts', 340, 200), { kind: 'story-goal', x: 600, y: 320, label: '收下两份令稿' }] })
      ]
    },
    chapter4: {
      name: '第四章 · 第一节 · 再取主芯', goal: '从隔离炉取回主芯，知道它会把追兵引来', coins: 65,
      endWin: '主芯上了车。远处，红灯一盏盏醒了。',
      endLose: '炉边的守卫没有让路。',
      objective: '取芯 · 然后发车',
      rooms: [
        room('隔离炉外', 'camp', 0, 0, [1], { items: [note('core-hot', 300, 190)] }),
        room('炉室', 'boss', 1, 0, [0, 2], { foes: [foe('brute', 640, 280, 'returner', '守芯机', true)],
          items: [{ kind: 'story-core', x: 420, y: 300, label: '取回主芯' }] }),
        room('发车坪', 'rescue', 2, 0, [1], { need: 'core',
          items: [{ kind: 'story-goal', x: 480, y: 280, label: '让运芯车出发' }] })
      ]
    },
    chapter4_2: {
      name: '第四章 · 第二节 · 悬轨换线', goal: '趁脉冲低潮换道，别让炉口烧到车', coins: 65,
      endWin: '车过了悬轨。高潮那一下，炉口在后面合上。',
      endLose: '运芯车在炉口里烧穿了。',
      objective: '低潮开门 · 高潮避热',
      rooms: [
        room('悬轨起点', 'camp', 0, 0, [1, 2], { items: [
          note('pulse-route', 250, 180),
          { kind: 'story-drive', x: 620, y: 300, label: '开车或停车' }
        ] }),
        room('上路避热', 'puzzle', 1, -1, [0, 3], {}),
        room('下路暗轨', 'puzzle', 1, 1, [0, 3], { dark: true, items: [{ kind: 'story-lantern', x: 400, y: 280, label: '点起提灯' }] }),
        room('前方信号房', 'puzzle', 2, 0, [1, 2, 4], { terminal: true,
          items: [{ kind: 'story-switch', x: 480, y: 260, label: '在低潮时开炉口', pair: 4 }] }),
        room('炉口', 'battle', 3, 0, [3, 5], { hot: true, need: 'mouth',
          foes: [foe('chaser', 700, 300, '', '炉口巡卫')] }),
        room('轨尾', 'rescue', 4, 0, [4], { items: [{ kind: 'story-goal', x: 480, y: 280, label: '把车停进收芯库外' }] })
      ]
    },
    chapter4_3: {
      name: '第四章 · 第三节 · 收芯库', goal: '穿过被收走的炉芯；私藏柜可以不打开', coins: 65,
      endWin: '衡石的声音从库顶落下。车还在，芯还在。',
      endLose: '库门在脉冲里关上了。',
      objective: '主路一直通 · 私藏要认得芯座',
      rooms: [
        room('库门', 'camp', 0, 0, [1], {}),
        room('芯柜廊', 'puzzle', 1, 0, [0, 2, 3], { items: [
          note('cabinet-names', 260, 170),
          note('heng-call', 700, 170),
          { kind: 'story-cabinet', x: 480, y: 320, label: '点亮一格被收走的灯' }
        ] }),
        room('陶铆的私藏', 'secret', 1, 1, [1], { secret: true, need: 'seat', terminal: true,
          items: [
            { kind: 'story-tune', x: 360, y: 280, label: '按芯座上的刻度', pair: 1 },
            { kind: 'story-lamp', x: 560, y: 300, label: '取出私藏的灯芯', lamp: 'private' }
          ] }),
        room('库后月台', 'rescue', 2, 0, [1], { items: [{ kind: 'story-goal', x: 480, y: 280, label: '继续送芯' }] })
      ]
    },
    chapter4_4: {
      name: '第四章 · 第四节 · 总归炉者', goal: '守住车上的芯，把它从总归炉者嘴里夺出来', coins: 65,
      endWin: '衡石站在门槛上：“再往前，就是把火重新交给那座炉。你们不确定它还认不认得人。”',
      endLose: '主芯被它吞了回去。',
      objective: '追车 · 泄压 · 把芯搬走',
      rooms: [
        room('追车廊', 'battle', 0, 0, [1], { hot: true,
          items: [{ kind: 'story-drive', x: 300, y: 300, label: '让车先走' }],
          foes: [foe('charger', 720, 300, 'returner', '追车钳')] }),
        room('泄压台', 'boss', 1, 0, [0, 2], {
          foes: [foe('duelist', 640, 270, 'returner', '总归炉者', true)],
          items: [{ kind: 'story-vent', x: 400, y: 400, label: '在它近身时泄压' }] }),
        room('夺芯坪', 'puzzle', 2, 0, [1, 3], {
          items: [{ kind: 'story-core', x: 360, y: 300, label: '把主芯从它的轨上搬走' }] }),
        room('炉门', 'rescue', 3, 0, [2], { need: 'down',
          items: [note('door-talk', 300, 180), { kind: 'story-goal', x: 600, y: 320, label: '走到衡石面前', needClue: 'core-taken' }] })
      ]
    },
    chapter5: {
      name: '第五章 · 第一节 · 炉门之前', goal: '听衡石和守灯人把话说完，再走一段短途调度', coins: 70,
      endWin: '炉门开着。接下来要下的令，还在终端上。',
      endLose: '调度错了拍，备用炉口喷了回来。',
      objective: '先说话 · 再用光、水和静步过这一段',
      rooms: [
        room('炉门谈话', 'camp', 0, 0, [1], { items: [
          { kind: 'story-talk', x: 420, y: 260, label: '听他们说完', clue: 'door-talk' },
          note('proof', 680, 180)
        ] }),
        room('调度短廊', 'puzzle', 1, 0, [0, 2, 3], { dark: true, deep: true, listen: true,
          foes: [foe('chaser', 740, 400, 'listen', '备用归炉者')],
          items: [
            { kind: 'story-lantern', x: 220, y: 180, label: '用灯照出刻度' },
            { kind: 'story-valve', x: 220, y: 420, label: '放水给溢流降温' }
          ] }),
        room('回声祠', 'secret', 1, 1, [1], { secret: true, dark: true, need: 'echo',
          items: [{ kind: 'story-lamp', x: 480, y: 300, label: '取走回声祠的芯', lamp: 'echo' }] }),
        room('穹顶门口', 'rescue', 2, 0, [1], { items: [{ kind: 'story-goal', x: 480, y: 280, label: '进入总炉之心', needClue: 'door-talk' }] })
      ]
    },
    chapter5_2: {
      name: '第五章 · 第二节 · 停令或重明', goal: '顶住衡石，在终端上下令', coins: 70,
      endWin: '令已经送进总炉。灯路会按你写下的那一句活下去。',
      endLose: '终端灭了，人也倒在炉心里。',
      objective: '完结令随时可下 · 重明令要七灯 · 砸炉会先警告',
      rooms: [
        room('总炉之心', 'boss', 0, 0, [1], { hot: true, terminal: true, walls: [[160, 200, 70, 90], [720, 360, 70, 90]],
          foes: [foe('duelist', 620, 250, 'heng', '衡石', true)],
          items: [
            { kind: 'story-order', x: 280, y: 200, label: '下完结令', ending: 'normal' },
            { kind: 'story-order', x: 280, y: 300, label: '下重明令', ending: 'true' },
            { kind: 'story-smash', x: 280, y: 400, label: '砸毁炉心' }
          ] }),
        room('分布终端', 'puzzle', 1, 0, [0], { terminal: true,
          items: [{ kind: 'story-link', x: 480, y: 280, label: '在脉冲窗口里确认终端', pair: 0 }] })
      ]
    },
    chapter5_3: {
      name: '第五章 · 第三节 · 沿灯回家', goal: '沿着灯路走回营地，看这一夜留下什么', coins: 40,
      endWin: '营地到了。老岑把火拨旺，谁也没有催你说话。',
      endLose: '这条路没有失败。',
      objective: '没有追兵 · 可以慢慢走，也可以直接回营',
      rooms: [
        room('炉门外的路', 'camp', 0, 0, [1], { items: [
          { kind: 'story-skip', x: 700, y: 160, label: '先回营地' },
          { kind: 'story-home', x: 300, y: 240, label: '看看这一路的灯' }
        ] }),
        room('中谷残站', 'puzzle', 1, 0, [0, 2], {}),
        room('南坡', 'puzzle', 2, 0, [1, 3], {}),
        room('营地黎明', 'rescue', 3, 0, [2], { items: [
          note('dawn', 320, 200),
          { kind: 'story-goal', x: 560, y: 320, label: '在晨灯下停一停' }
        ] })
      ]
    },
    secret_unlisted: {
      name: '隐藏 · 未登记线', goal: '走完鬼轨道，带回检修班的灯芯', coins: 45,
      endWin: '这枚芯不在任何登记上。小穗的图，到这里是空白。',
      endLose: '鬼轨道把人又送回雾里。',
      objective: '暗处和静步叠在一起 · 带着识别晶，它会犹豫',
      rooms: [
        room('图外的岔', 'camp', 0, 0, [1], { dark: true, items: [
          { kind: 'story-lantern', x: 420, y: 280, label: '只点一盏小灯' },
          note('unlisted-log', 250, 170)
        ] }),
        room('暗轨', 'battle', 1, 0, [0, 2], { dark: true, foes: [foe('chaser', 680, 300, 'shade', '未登记巡卫')] }),
        room('抑声隧', 'battle', 2, 0, [1, 3], { listen: true, dark: true,
          foes: [foe('shooter', 700, 220, 'listen', '听声残机')],
          items: [{ kind: 'story-bark', x: 240, y: 400, label: '让灰尾狐把声音引开' }] }),
        room('检修班的芯', 'puzzle', 3, 0, [2, 4], { dark: true,
          items: [note('crew-core', 300, 180), { kind: 'story-lamp', x: 520, y: 300, label: '带回迷途灯芯', lamp: 'unlisted' }] }),
        room('迷途的归炉者', 'boss', 4, 0, [3], { dark: true,
          foes: [foe('duelist', 640, 280, 'lost', '迷途归炉者', true)],
          items: [{ kind: 'story-goal', x: 300, y: 400, label: '把它留在这里', needDown: true }] })
      ]
    }
  };

  function blank(id) {
    return { id: id, version: 1, phase: 'arrive', clues: [], oil: 80, lit: false, bearer: '', hung: -1,
      water: 0, pulse: 0, link: 0, linkLeft: 0, cartHp: 14, cartRoom: 0, cartX: 180,
      ending: '', alerted: false, lamp: '', anchor: -1 };
  }

  return Object.freeze({
    NOTES: NOTES,
    CHAPTERS: CHAPTERS,
    blank: blank,
    ids: function () { return Object.keys(CHAPTERS); },
    chapter: function (id) { return CHAPTERS[id] || null; },
    note: function (id) { return NOTES[id] || null; }
  });
});
