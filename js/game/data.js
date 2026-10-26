// 数字の定義（たたき台 docs/draft.md から）。遊んでみて直すときは、まずここの数字を変える。
// 段階3：基本職5つ・武器・防具・スキル35・森の敵4種。
var GameData = (function () {
  // 属性の名前（表示用）
  var ELEMENTS = { slash: "斬", pierce: "刺", strike: "打", fire: "火", water: "水", grass: "草", dark: "闇", light: "光", none: "なし" };   // 闇は 2026-10-19 に足した（黒魔道士）。光は 2026-10-20（聖騎士）。今は光が弱点の敵はいない

  // 武器（ノーマル・アイテムレベル1）。reach＝届く距離（ドット）、arc＝ふりの広さ（左右それぞれのラジアン）
  // shot：ふつうの攻撃が飛ぶもの（弓の矢、魔術師の系統の杖の魔法弾）
  // power：ふつうの攻撃の「1回の強さ」の倍率（2026-10-17 決定）。近い武器ほど1秒あたりのダメージが強く、遠い武器ほど弱い
  //   （レベルが上がるとダメージは能力でほぼ決まるので、間かくの長い大剣・斧が弱く、離れて戦える職と差がなかったため）
  var WEAPONS = {
    // item＝拾う・買う装備の名前（最初の地方。R以上は名前のあとに〈R〉〈SR〉〈UR〉がつく）、starter＝はじめから持っている武器の名前（2026-10-18 決定）
    sword:      { name: "剣",   item: "銅の剣",   starter: "古い剣", element: "slash",  patk: 8,  matk: 0, wait: 0.6, power: 1.0,  reach: 18, arc: 1.05 },
    greatsword: { name: "大剣", item: "銅の大剣", element: "slash",  patk: 13, matk: 0, wait: 1.0, power: 1.65, reach: 22, arc: 1.4, windup: 0.45 },   // windup：振る前のため（2026-10-26 保護者の希望。強すぎたため）
    axe:        { name: "斧",   item: "銅の斧",   element: "slash",  patk: 11, matk: 0, wait: 0.9, power: 1.5,  reach: 20, arc: 1.3, windup: 0.25 },
    bow:        { name: "弓",   item: "木の弓",   starter: "古い弓", element: "pierce", patk: 9,  matk: 0, wait: 1.1, power: 0.85, shot: { speed: 170, range: 150, stat: "p" } },
    // 槍（2026-10-19。騎士の武器）：細く長く届く突き。刺
    // thrust：斬らずに突く。いちばん近い敵の方を向いてから、まっすぐ突く（2026-10-21 保護者の希望）
    spear:      { name: "槍",   item: "銅の槍",   starter: "古い槍", element: "pierce", patk: 10, matk: 0, wait: 0.75, power: 1.25, reach: 28, arc: 0.45, thrust: true },
    fist:       { name: "拳",   item: "革のこて", starter: "古いこて", element: "strike", patk: 6,  matk: 0, wait: 0.4, power: 0.7,  reach: 14, arc: 0.9 },
    // 杖：魔術師の系統の職なら魔法弾（魔攻・属性なし・中距離・倍率0.9・待ち1.0秒）、それ以外の職は近くをたたく（物攻・打・倍率1.15・待ち0.7秒）
    // 弓と魔法弾の待ち時間は 2026-10-18 保護者と決定（弓 0.8→1.1秒、魔法弾 0.7→1.0秒）
    staff:      { name: "杖",   item: "かしの杖", starter: "古い杖", element: "strike", patk: 4,  matk: 8, wait: 0.7, power: 1.15, reach: 16, arc: 1.0,
                  boltFor: "mage", bolt: { speed: 140, range: 90, stat: "m", element: "none", power: 0.9, wait: 1.0 } }
  };

  // 防具（ノーマル・アイテムレベル1）。宝箱・お店・鍛冶屋で手に入るもの（2026-10-17 案H：重装備は物理に、魔法装備は魔法に強い）
  var ARMORS = {
    heavy: { name: "重装備", item: "銅のよろい", pdef: 4, mdef: 1 },
    light: { name: "軽装備", item: "革の服", pdef: 3, mdef: 2 },
    magic: { name: "魔法装備", item: "布のローブ", pdef: 2, mdef: 4 }
  };
  // はじめから持っている防具：ふつうの防具より弱い（はじめの手ごたえ「約20回当たると倒れる」を保つため）
  var STARTER_ARMORS = {
    heavy: { name: "古いよろい", pdef: 3, mdef: 0 },
    light: { name: "古い服", pdef: 2, mdef: 1 },
    magic: { name: "古いローブ", pdef: 1, mdef: 3 }
  };

  // 職業。line＝系統（上級職ができたら、ここに上級職の名前を足す）
  var JOBS = {
    warrior: { name: "戦士",   weapons: ["sword", "greatsword", "axe"], armor: "heavy", color: "#5aa9ff",
               growth: { str: 2.0, vit: 2.0, mag: 0.5, int: 0.5 } },
    mage:    { name: "魔術師", weapons: ["staff"], armor: "magic", color: "#b48cf0",
               growth: { str: 0.5, vit: 1.0, mag: 2.0, int: 1.5 } },
    hunter:  { name: "狩人",   weapons: ["bow"], armor: "light", color: "#6fd08c",
               growth: { str: 1.5, vit: 1.5, mag: 1.0, int: 1.0 } },
    fighter: { name: "武術家", weapons: ["fist"], armor: "light", color: "#ff9a4d",
               growth: { str: 2.0, vit: 1.5, mag: 0.5, int: 1.0 } },
    priest:  { name: "僧侶",   weapons: ["staff"], armor: "magic", color: "#f2e6a0",
               growth: { str: 1.0, vit: 1.5, mag: 1.5, int: 1.0 } },
    // 一本道の上級職（2026-10-19）。tier：1 基本職・2 上級職。from：もとの職。伸び方は基本職より少しよい
    knight:    { name: "騎士",       weapons: ["spear", "sword"], armor: "heavy", color: "#c8ccd4", tier: 2, from: "warrior",
                 growth: { str: 2.0, vit: 2.5, mag: 0.5, int: 0.5 } },
    blackmage: { name: "黒魔道士",   weapons: ["staff"], armor: "magic", color: "#8a2a4a", tier: 2, from: "mage",
                 growth: { str: 0.5, vit: 1.0, mag: 2.5, int: 1.5 } },
    sniper:    { name: "スナイパー", weapons: ["bow"], armor: "light", color: "#9a7a50", tier: 2, from: "hunter",
                 growth: { str: 2.0, vit: 1.5, mag: 1.0, int: 1.0 } },
    monk:      { name: "修行僧",     weapons: ["fist"], armor: "light", color: "#d04648", tier: 2, from: "fighter",
                 growth: { str: 2.0, vit: 2.0, mag: 0.5, int: 1.5 } },
    whitemage: { name: "白魔道士",   weapons: ["staff"], armor: "magic", color: "#ffffff", tier: 2, from: "priest",
                 growth: { str: 1.0, vit: 1.5, mag: 2.0, int: 1.5 } },
    // 組み合わせの上級職（2026-10-20 保護者と決定）。from2：2つ目のもとの職
    magicknight: { name: "魔法剣士", weapons: ["sword", "greatsword"], armor: "heavy", color: "#7a5ad0", tier: 2, from: "warrior", from2: "mage",
                   growth: { str: 2.0, vit: 1.5, mag: 2.0, int: 1.0 } },
    ninja:       { name: "忍者",     weapons: ["sword", "greatsword", "axe", "spear", "bow", "fist", "staff"], armor: "light", color: "#4a4a5a", tier: 2, from: "warrior", from2: "hunter",
                   growth: { str: 2.0, vit: 1.5, mag: 1.0, int: 1.5 } },
    gladiator:   { name: "剣闘士",   weapons: ["sword", "axe"], armor: "light",   // 2026-10-26：重装備→軽装備（保護者。絵がはだかの胸なので）
                 color: "#c8643a", tier: 2, from: "warrior", from2: "fighter",
                   growth: { str: 2.5, vit: 2.0, mag: 0.5, int: 0.5 } },
    paladin:     { name: "聖騎士",   weapons: ["spear"], armor: "heavy", color: "#e8e0b0", tier: 2, from: "warrior", from2: "priest",
                   growth: { str: 1.5, vit: 2.5, mag: 1.5, int: 1.0 } },
    sage:        { name: "賢者",     weapons: ["staff"], armor: "magic", color: "#4ec0a0", tier: 2, from: "mage", from2: "priest",
                   growth: { str: 0.5, vit: 1.0, mag: 2.5, int: 2.0 } },
    // 魔物使い（2026-10-26 保護者と決定）：狩人＋魔術師。弓と杖／軽装備。たおしたダンジョンの主を呼んで、大技を使わせる
    tamer:       { name: "魔物使い", weapons: ["bow", "staff"], armor: "light", color: "#5c8a6a", tier: 2, from: "hunter", from2: "mage",
                   growth: { str: 1.5, vit: 1.0, mag: 2.0, int: 2.0 } }
  };
  var JOB_ORDER = ["warrior", "mage", "hunter", "fighter", "priest"];
  var UPPER_ORDER = ["knight", "blackmage", "sniper", "monk", "whitemage", "magicknight", "ninja", "gladiator", "paladin", "sage", "tamer"];   // 作った上級職
  function tierOf(job) { return (JOBS[job] && JOBS[job].tier) || 1; }
  // 上級職・最上級職の一覧（2026-10-19 見直し。まだ転職はできない。転職の神殿のタブで、条件と今の★を見せる）
  // need：[職, ★の数]。一本道はもとの職が★7、組み合わせは2つの職がどちらも★5
  var UPPER_JOBS = [
    { id: "knight", name: "騎士",       need: [["warrior", 7]], arms: "剣・槍／重装備",               note: "槍も使える。守りが強い" },
    { id: "blackmage", name: "黒魔道士",   need: [["mage", 7]],    arms: "杖／魔法装備",                 note: "強い攻撃魔法と、闇・状態異常の魔法" },
    { id: "sniper", name: "スナイパー", need: [["hunter", 7]],  arms: "弓／軽装備",                   note: "遠くから強い一発。会心が出やすい" },
    { id: "monk", name: "修行僧",     need: [["fighter", 7]], arms: "拳／軽装備",                   note: "拳で戦いながら、自分も回復できる" },
    { id: "whitemage", name: "白魔道士",   need: [["priest", 7]],  arms: "杖／魔法装備",                 note: "回復と、仲間を強くする魔法" },
    { id: "magicknight", name: "魔法剣士", need: [["warrior", 5], ["mage", 5]],    arms: "剣・大剣／重装備", note: "剣に火・水・草の力をのせる。魔術師の魔法も使える" },
    { id: "ninja", name: "忍者",       need: [["warrior", 5], ["hunter", 5]],  arms: "どの武器も／軽装備",   note: "どの武器でも戦える。忍術で身をかくす" },
    { id: "gladiator", name: "剣闘士",     need: [["warrior", 5], ["fighter", 5]], arms: "剣・斧／軽装備",   note: "HPが少ないほど強くなる、連続の斬りわざ" },
    { id: "paladin", name: "聖騎士",     need: [["warrior", 5], ["priest", 5]],  arms: "槍／重装備",       note: "光の槍と守り。僧侶の魔法も使える" },
    { id: "sage", name: "賢者",       need: [["mage", 5], ["priest", 5]],     arms: "杖／魔法装備",     note: "大きな攻撃魔法と回復。魔術師と僧侶の魔法も使える" },
    { id: "tamer", name: "魔物使い",   need: [["hunter", 5], ["mage", 5]],     arms: "弓・杖／軽装備",   note: "たおしたダンジョンの主を呼んで、大技を使わせる。魔術師の魔法も使える" }
  ];
  var TOP_JOBS = [
    { name: "聖剣士",     from: "騎士",       note: "光の剣でたたかう" },
    { name: "大魔導師",   from: "黒魔道士",   note: "画面全体に火の魔法" },
    { name: "天弓",       from: "スナイパー", note: "画面のすべての敵に矢" },
    { name: "武神",       from: "修行僧",     note: "攻撃がとても速くなる" },
    { name: "大司教",     from: "白魔道士",   note: "全員を守る聖なる場所" },
    { name: "魔剣聖",     from: "魔法剣士",   note: "火と水と光の3連撃" },
    { name: "竜騎士",     from: "忍者",       note: "ジャンプと、敵を通りぬける突進" },
    { name: "剣闘王",     from: "剣闘士",     note: "まわりを何度も斬る大旋風" },
    { name: "聖騎士長",   from: "聖騎士",     note: "全員の受けるダメージを大きく減らす" },
    { name: "召喚士",     from: "魔物使い",   note: "幻獣の祠でたおした幻獣を呼ぶ" }
  ];
  // 系統：その職と、その職からつながる上級職・最上級職
  // 組み合わせの上級職（2026-10-20）：魔法剣士は魔術師の系統、聖騎士は僧侶の系統、賢者は両方の系統にも入る
  var LINES = { warrior: ["warrior", "knight"], mage: ["mage", "blackmage", "magicknight", "sage", "tamer"], hunter: ["hunter", "sniper", "tamer"], fighter: ["fighter", "monk"], priest: ["priest", "whitemage", "paladin", "sage"],
                knight: ["knight"], blackmage: ["blackmage"], sniper: ["sniper"], monk: ["monk"], whitemage: ["whitemage"],
                magicknight: ["magicknight"], ninja: ["ninja"], gladiator: ["gladiator"], paladin: ["paladin"], sage: ["sage"], tamer: ["tamer"] };

  // スキル（docs/draft.md 3.1）。star＝覚える★、cond＝使える条件（weapons：装備している武器、line：系統、null：条件なし）
  // fx＝効果の並び。t の種類：
  //   arc（前の扇）、around（まわり）、dash（踏みこむ）、shot（飛ばす）、rapid（何回も）、charge（ためる）、backstep（下がる）
  //   heal（回復）、cure（状態異常を治す）、regen（少しずつ回復）、revive（復活）、buff（強くする）、zone（その場に残る）、rain（降らせる）
  // vis＝見た目の種類（spin 回転・sweep 足もとを回る・smash たたきつけ・quake 地面の割れめ・tidal 大波。2026-10-19）
  // stat：p＝物攻、m＝魔攻。elem：weapon＝武器の属性。status：{ type: poison/para/sleep/break, chance, dur }
  var EDGE = ["sword", "greatsword", "axe"];
  var HEAVY = ["greatsword", "axe"];
  var SKILLS = [
    // 戦士
    { id: "w.spin",   job: "warrior", star: 1, name: "回転ぎり", desc: "まわりの敵を、まとめて斬る。",   short: "回転",   cond: { weapons: EDGE }, mp: 6, ct: 4,
      fx: [{ t: "around", vis: "spin", stat: "p", mult: 1.2, radius: 26, elem: "weapon" }] },
    { id: "w.focus",  job: "warrior", star: 2, name: "気合い", desc: "自分のHPを少し回復する。",     short: "気合",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "w.rush",   job: "warrior", star: 3, name: "とっしん", desc: "前へふみこんで斬る。",   short: "突進",   cond: { weapons: EDGE }, mp: 7, ct: 6,
      fx: [{ t: "dash", dist: 36 }, { t: "arc", stat: "p", mult: 1.5, elem: "weapon" }] },
    { id: "w.power",   job: "warrior", star: 4, name: "力の心得",   short: "力",     cond: null, passive: { patk: 0.10 }, desc: "物攻が、いつも10%上がる。" },
    { id: "w.crush",  job: "warrior", star: 5, name: "かぶと割り", desc: "強くたたいて、敵の守りを下げる。", short: "割り",   cond: { weapons: HEAVY }, mp: 8, ct: 8,
      fx: [{ t: "arc", vis: "smash", stat: "p", mult: 1.8, elem: "strike", status: { type: "break", chance: 1, dur: 10 } }] },
    { id: "w.guard",   job: "warrior", star: 6, name: "鉄の守り",   short: "鉄",     cond: null, passive: { pdef: 0.15 }, desc: "物防が、いつも15%上がる。" },
    { id: "w.quake",  job: "warrior", star: 7, name: "大地斬り", desc: "前の広いところを、強く斬る。",   short: "大地",   cond: { weapons: HEAVY }, mp: 14, ct: 15,
      fx: [{ t: "arc", vis: "quake", stat: "p", mult: 2.0, elem: "weapon", reach: 44, arc: 0.8 }] },
    // 魔術師
    { id: "m.fire",   job: "mage", star: 1, name: "ファイア", desc: "火の玉を飛ばす（火）。",         short: "ファイア", cond: { line: "mage" }, mp: 5, ct: 2,
      fx: [{ t: "shot", stat: "m", mult: 1.3, elem: "fire", speed: 150, range: 130, size: 3, color: "#ff8a3d" }] },
    { id: "m.heal",    job: "mage", star: 2, name: "めいそう",     short: "めいそう", cond: null, passive: { roomHp: 0.05, roomMp: 0.05 }, desc: "部屋の敵を全部たおすと、HPとMPが少し回復する。" },
    { id: "m.aqua",   job: "mage", star: 3, name: "アクア", desc: "前に水の波を出して、敵をおし返す（水）。",           short: "アクア",   cond: { line: "mage" }, mp: 7, ct: 5,
      fx: [{ t: "arc", stat: "m", mult: 1.0, elem: "water", reach: 36, arc: 0.7, push: 26, color: "#5aa9ff" }] },
    { id: "m.sleep",  job: "mage", star: 4, name: "スリープ", desc: "まわりの敵を眠らせる（ダメージはない）。",         short: "スリープ", cond: { line: "mage" }, mp: 8, ct: 15,
      fx: [{ t: "around", stat: "m", mult: 0, radius: 44, status: { type: "sleep", chance: 0.6, dur: 5 }, color: "#b48cf0" }] },
    { id: "m.barrier", job: "mage", star: 5, name: "魔法の守り",   short: "魔法守", cond: null, passive: { mdef: 0.15 }, desc: "魔防が、いつも15%上がる。" },
    { id: "m.wall",   job: "mage", star: 6, name: "フレイムウォール", desc: "前に炎の壁を出す。さわった敵が焼ける（火）。", short: "炎の壁",   cond: { line: "mage" }, mp: 12, ct: 12,
      fx: [{ t: "zone", stat: "m", mult: 0.5, elem: "fire", dist: 28, radius: 18, dur: 3, tick: 0.5, color: "#ff8a3d" }] },
    { id: "m.tidal",  job: "mage", star: 7, name: "タイダルウェーブ", desc: "まわりに大波を起こす（水）。", short: "大波",     cond: { line: "mage" }, mp: 16, ct: 18,
      fx: [{ t: "around", vis: "tidal", stat: "m", mult: 2.0, radius: 60, elem: "water", push: 20, color: "#5aa9ff" }] },
    // 狩人
    { id: "h.triple", job: "hunter", star: 1, name: "三本撃ち", desc: "矢を扇の形に3本撃つ。",   short: "三本",   cond: { weapons: ["bow"] }, mp: 5, ct: 3,
      fx: [{ t: "shot", stat: "p", mult: 0.8, elem: "weapon", count: 3, spread: 0.28 }] },
    { id: "h.aid",    job: "hunter", star: 2, name: "応急手当", desc: "自分のHPを少し回復する。",   short: "手当",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "h.poison", job: "hunter", star: 3, name: "毒矢", desc: "敵を毒にする矢を撃つ。",       short: "毒矢",   cond: { weapons: ["bow"] }, mp: 5, ct: 6,
      fx: [{ t: "shot", stat: "p", mult: 1.0, elem: "weapon", status: { type: "poison", chance: 0.7, dur: 10 }, color: "#9be36a" }] },
    { id: "h.back",    job: "hunter", star: 4, name: "たかの目",   short: "たか",   cond: null, passive: { range: 0.25 }, desc: "弓の矢と魔法の玉が、いつもより25%遠くまでとどく。" },
    { id: "h.para",    job: "hunter", star: 5, name: "急所ねらい", short: "急所",   cond: null, passive: { crit: 0.08 }, desc: "会心が出やすくなる（＋8%）。" },
    { id: "h.aim",    job: "hunter", star: 6, name: "ねらい撃ち", desc: "力をためて、遠くまで強い一発を撃つ。会心が出やすい。", short: "ねらい", cond: { weapons: ["bow"] }, mp: 8, ct: 8,
      fx: [{ t: "charge", time: 1.0 }, { t: "shot", stat: "p", mult: 2.5, elem: "weapon", crit: 0.3, speed: 240, range: 200, size: 2 }] },
    { id: "h.rain",   job: "hunter", star: 7, name: "矢の雨", desc: "前のほうに、矢をたくさん降らせる。",     short: "矢の雨", cond: { weapons: ["bow"] }, mp: 14, ct: 15,
      fx: [{ t: "rain", stat: "p", mult: 0.6, elem: "weapon", count: 5, dist: 56, radius: 26 }] },
    // 武術家
    { id: "f.combo",  job: "fighter", star: 1, name: "れんげき", desc: "すばやく3回なぐる。",         short: "連撃",   cond: { weapons: ["fist"] }, mp: 4, ct: 3,
      fx: [{ t: "rapid", count: 3, interval: 0.09, hit: { t: "arc", stat: "p", mult: 0.6, elem: "weapon" } }] },
    { id: "f.breath", job: "fighter", star: 2, name: "いきをととのえる", desc: "自分のHPを少し回復する。", short: "呼吸",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "f.sweep",  job: "fighter", star: 3, name: "足ばらい", desc: "まわりの敵をはらう。しびれさせることがある。",         short: "足ばらい", cond: { weapons: ["fist"] }, mp: 6, ct: 8,
      fx: [{ t: "around", vis: "sweep", stat: "p", mult: 0.5, radius: 24, elem: "weapon", status: { type: "para", chance: 0.5, dur: 2 } }] },
    { id: "f.stance",  job: "fighter", star: 4, name: "身軽",      short: "身軽",   cond: null, passive: { wait: 0.15 }, desc: "ふつうの攻撃の待ち時間が、いつも15%短くなる。" },
    { id: "f.punch",  job: "fighter", star: 5, name: "せいけん突き", desc: "強い一発。会心が出やすい。",     short: "突き",   cond: { weapons: ["fist"] }, mp: 7, ct: 6,
      fx: [{ t: "arc", stat: "p", mult: 2.0, elem: "weapon", crit: 0.2 }] },
    { id: "f.kick",    job: "fighter", star: 6, name: "ふんばり",   short: "ふんばり", cond: null, passive: { hp: 0.10 }, desc: "最大HPが、いつも10%上がる。" },
    { id: "f.barrage",job: "fighter", star: 7, name: "百れつけん", desc: "10回つづけてなぐる。",       short: "百れつ", cond: { weapons: ["fist"] }, mp: 15, ct: 18,
      fx: [{ t: "rapid", count: 10, interval: 0.07, hit: { t: "arc", stat: "p", mult: 0.4, elem: "weapon" } }] },
    // 僧侶
    { id: "p.heal",   job: "priest", star: 1, name: "ヒール", desc: "仲間みんなのHPを回復する。",           short: "ヒール", cond: { line: "priest" }, mp: 8, ct: 6,
      fx: [{ t: "heal", pct: 0.25, party: true }] },
    { id: "p.cure",   job: "priest", star: 2, name: "キュア", desc: "仲間みんなの毒・しびれ・眠りを治す。",           short: "キュア", cond: { line: "priest" }, mp: 5, ct: 6,
      fx: [{ t: "cure", party: true }] },
    { id: "p.calm",    job: "priest", star: 3, name: "いやしの力", short: "いやし力", cond: null, passive: { heal: 0.20 }, desc: "回復のスキルで回復する量が、いつも20%ふえる。" },
    { id: "p.protect", job: "priest", star: 4, name: "まもりの心", short: "まもり", cond: null, passive: { pdef: 0.08, mdef: 0.08 }, desc: "物防と魔防が、いつも8%上がる。" },
    { id: "p.regen",  job: "priest", star: 5, name: "ヒールウィンド", desc: "仲間みんなのHPが、しばらく少しずつ回復する。",         short: "ヒール風", cond: { line: "priest" }, mp: 10, ct: 20,
      fx: [{ t: "regen", pct: 0.2, dur: 10, party: true }] },
    { id: "p.revive", job: "priest", star: 6, name: "よみがえりの祈り", desc: "たおれた仲間を1人よみがえらせる。1回の冒険で1回だけ。", short: "よみがえり", cond: { line: "priest" }, mp: 20, ct: 0, once: true,
      fx: [{ t: "revive", pct: 0.3 }] },
    { id: "p.grand",  job: "priest", star: 7, name: "大いなるいやし", desc: "仲間みんなのHPを大きく回復して、状態異常も治す。",   short: "大いやし", cond: { line: "priest" }, mp: 20, ct: 40,
      fx: [{ t: "heal", pct: 0.6, party: true }, { t: "cure", party: true }] },
    // ---------- 一本道の上級職（2026-10-19 保護者と決定。docs/game-design.md） ----------
    // 騎士：剣と槍が半々
    { id: "k.thrust", job: "knight", star: 1, name: "いなずま突き", desc: "槍で、前へ一直線に突く。", short: "突き", cond: { weapons: ["spear"] }, mp: 6, ct: 3,
      fx: [{ t: "arc", stat: "p", mult: 1.6, elem: "pierce", reach: 36, arc: 0.22, vis: "lance" }] },
    { id: "k.wall",   job: "knight", star: 2, name: "鉄壁", desc: "物防が、いつも20%上がる。", short: "鉄壁", cond: null, passive: { pdef: 0.20 } },
    { id: "k.cross",  job: "knight", star: 3, name: "十字斬り", desc: "たてと横に、すばやく2回斬る。", short: "十字", cond: { weapons: ["sword"] }, mp: 7, ct: 5,
      fx: [{ t: "rapid", count: 2, interval: 0.14, hit: { t: "arc", stat: "p", mult: 1.0, elem: "weapon" } }] },
    { id: "k.cry",    job: "knight", star: 4, name: "ときの声", desc: "仲間みんなの物攻と物防が、60秒のあいだ10%上がる。交代しても続く。", short: "ときの声", cond: null, mp: 10, ct: 30,
      fx: [{ t: "buff", stat: "patk", pct: 0.10, dur: 60, party: true }, { t: "buff", stat: "pdef", pct: 0.10, dur: 60, party: true }] },
    { id: "k.vow",    job: "knight", star: 5, name: "守りの誓い", desc: "受けるダメージが、いつも10%へる。", short: "誓い", cond: null, passive: { cut: 0.10 } },
    { id: "k.bash",   job: "knight", star: 6, name: "シールドバッシュ", desc: "盾でなぐる。しびれさせることがある。", short: "盾", cond: { weapons: ["sword"] }, mp: 7, ct: 7,
      fx: [{ t: "arc", stat: "p", mult: 1.2, elem: "strike", vis: "smash", status: { type: "para", chance: 0.4, dur: 2 } }] },
    { id: "k.charge", job: "knight", star: 7, name: "グランドチャージ", desc: "槍をかまえて長く突進し、通った敵をみんなつらぬく。", short: "突進", cond: { weapons: ["spear"] }, mp: 14, ct: 14,
      fx: [{ t: "pierceDash", dist: 72, stat: "p", mult: 2.4, elem: "pierce" }] },
    // 黒魔道士
    { id: "bm.bomb",  job: "blackmage", star: 1, name: "フレイムボム", desc: "大きな火の玉。当たると爆発して、まわりの敵にもダメージ（火）。", short: "ボム", cond: { line: "blackmage" }, mp: 9, ct: 4,
      fx: [{ t: "shot", stat: "m", mult: 2.0, elem: "fire", speed: 130, range: 140, size: 5, color: "#ff8a3d", explode: 20 }] },
    { id: "bm.mist",  job: "blackmage", star: 2, name: "ポイズンミスト", desc: "前に毒の霧を出す。中にいる敵が毒になる。", short: "毒霧", cond: { line: "blackmage" }, mp: 8, ct: 10,
      fx: [{ t: "zone", look: "mist", stat: "m", mult: 0.2, elem: "none", dist: 30, radius: 22, dur: 4, tick: 0.5, status: { type: "poison", chance: 0.5, dur: 8 } }] },
    { id: "bm.mana",  job: "blackmage", star: 3, name: "魔力の泉", desc: "最大MPが、いつも20%上がる。", short: "泉", cond: null, passive: { mp: 0.20 } },
    { id: "bm.dark",  job: "blackmage", star: 4, name: "ダーク", desc: "闇の玉を飛ばす（闇）。", short: "ダーク", cond: { line: "blackmage" }, mp: 7, ct: 3,
      fx: [{ t: "shot", stat: "m", mult: 1.8, elem: "dark", speed: 140, range: 130, size: 4, color: "#9a5ad0" }] },
    { id: "bm.focus", job: "blackmage", star: 5, name: "魔力集中", desc: "魔攻が、いつも15%上がる。", short: "集中", cond: null, passive: { matk: 0.15 } },
    { id: "bm.drain", job: "blackmage", star: 6, name: "ドレイン", desc: "闇の玉を飛ばす。与えたダメージの半分だけ、自分のHPが回復する（闇）。", short: "ドレイン", cond: { line: "blackmage" }, mp: 9, ct: 6,
      fx: [{ t: "shot", stat: "m", mult: 1.4, elem: "dark", speed: 140, range: 130, size: 4, color: "#d05a8a", drain: 0.5 }] },
    { id: "bm.hole",  job: "blackmage", star: 7, name: "ダークホール", desc: "前に闇の渦を出す。まわりの敵を吸いよせながらダメージ（闇）。", short: "ホール", cond: { line: "blackmage" }, mp: 16, ct: 16,
      fx: [{ t: "zone", look: "hole", stat: "m", mult: 0.6, elem: "dark", dist: 40, radius: 34, dur: 3, tick: 0.5, pull: 45 }] },
    // スナイパー
    { id: "s.pierce", job: "sniper", star: 1, name: "貫通矢", desc: "一直線に、何体でもつらぬく矢。", short: "貫通", cond: { weapons: ["bow"] }, mp: 6, ct: 4,
      fx: [{ t: "shot", stat: "p", mult: 1.5, elem: "weapon", speed: 230, range: 200, size: 2, pierce: true }] },
    { id: "s.crit",   job: "sniper", star: 2, name: "急所の心得", desc: "会心のときのダメージが、いつも30%ふえる。", short: "急所", cond: null, passive: { critDmg: 0.30 } },
    { id: "s.fire",   job: "sniper", star: 3, name: "炎の矢", desc: "火の矢を撃つ（火）。", short: "炎矢", cond: { weapons: ["bow"] }, mp: 6, ct: 4,
      fx: [{ t: "shot", stat: "p", mult: 1.6, elem: "fire", color: "#ff8a3d" }] },
    { id: "s.push",   job: "sniper", star: 4, name: "はじき矢", desc: "当たった敵を、大きくおし返す矢。", short: "はじき", cond: { weapons: ["bow"] }, mp: 5, ct: 5,
      fx: [{ t: "shot", stat: "p", mult: 1.0, elem: "weapon", push: 40, color: "#a8d8ff" }] },
    { id: "s.steady", job: "sniper", star: 5, name: "狙撃の構え", desc: "止まっているあいだ、物攻が20%上がる。", short: "構え", cond: null, passive: { still: 0.20 } },
    { id: "s.head",   job: "sniper", star: 6, name: "ヘッドショット", desc: "1.5秒ためて、強い一発を撃つ。会心が出やすい。", short: "ヘッド", cond: { weapons: ["bow"] }, mp: 10, ct: 10,
      fx: [{ t: "charge", time: 1.5 }, { t: "shot", stat: "p", mult: 3.0, elem: "weapon", crit: 0.4, speed: 260, range: 220, size: 2 }] },
    { id: "s.blast",  job: "sniper", star: 7, name: "爆裂矢", desc: "当たると爆発して、まわりの敵にもダメージを与える矢。", short: "爆裂", cond: { weapons: ["bow"] }, mp: 14, ct: 12,
      fx: [{ t: "shot", stat: "p", mult: 2.5, elem: "weapon", speed: 200, range: 180, size: 2, color: "#ffb84a", explode: 28 }] },
    // 修行僧
    { id: "mk.chi",   job: "monk", star: 1, name: "気の拳", desc: "強くなぐって、自分のHPも少し回復する。", short: "気拳", cond: { weapons: ["fist"] }, mp: 6, ct: 4,
      fx: [{ t: "arc", stat: "p", mult: 1.6, elem: "weapon", color: "#ffe7a0" }, { t: "heal", pct: 0.05 }] },
    { id: "mk.flow",  job: "monk", star: 2, name: "気のめぐり", desc: "部屋の敵を全部たおすと、HPが8%回復する。", short: "めぐり", cond: null, passive: { roomHp: 0.08 } },
    { id: "mk.gale",  job: "monk", star: 3, name: "疾風脚", desc: "前へ、すばやく6回ける。", short: "疾風", cond: { weapons: ["fist"] }, mp: 8, ct: 7,
      fx: [{ t: "rapid", count: 6, interval: 0.08, hit: { t: "arc", stat: "p", mult: 0.5, elem: "weapon", color: "#a8d8ff" } }] },
    { id: "mk.zen",   job: "monk", star: 4, name: "瞑想", desc: "1.5秒だけ止まって、HPとMPを回復する。", short: "瞑想", cond: null, mp: 0, ct: 30,
      fx: [{ t: "charge", time: 1.5 }, { t: "heal", pct: 0.25 }, { t: "mpheal", pct: 0.15 }] },
    { id: "mk.body",  job: "monk", star: 5, name: "金剛の体", desc: "物防と魔防が、いつも12%上がる。", short: "金剛", cond: null, passive: { pdef: 0.12, mdef: 0.12 } },
    { id: "mk.wave",  job: "monk", star: 6, name: "気功波", desc: "前へ気の玉を飛ばす（打）。", short: "気功", cond: { weapons: ["fist"] }, mp: 8, ct: 5,
      fx: [{ t: "shot", stat: "p", mult: 1.5, elem: "strike", speed: 150, range: 120, size: 4, color: "#ffe7a0", orb: true }] },
    { id: "mk.heaven",job: "monk", star: 7, name: "天地の拳", desc: "力をためて、大きな一撃。まわりの敵もふきとばす。", short: "天地", cond: { weapons: ["fist"] }, mp: 16, ct: 16,
      fx: [{ t: "charge", time: 0.8 }, { t: "arc", stat: "p", mult: 3.0, elem: "weapon", reach: 24, arc: 0.9, vis: "smash" }, { t: "around", stat: "p", mult: 0.5, radius: 34, push: 30, color: "#ffe7a0" }] },
    // 白魔道士
    { id: "wm.high",  job: "whitemage", star: 1, name: "ハイヒール", desc: "仲間みんなのHPを40%回復する。", short: "ハイヒール", cond: { line: "whitemage" }, mp: 14, ct: 8,
      fx: [{ t: "heal", pct: 0.4, party: true }] },
    { id: "wm.protect",job: "whitemage", star: 2, name: "プロテクト", desc: "仲間みんなの物防が、60秒のあいだ12%上がる。交代しても続く。", short: "プロテクト", cond: { line: "whitemage" }, mp: 10, ct: 20,
      fx: [{ t: "buff", stat: "pdef", pct: 0.12, dur: 60, party: true }] },
    { id: "wm.barrier",job: "whitemage", star: 3, name: "マジックバリア", desc: "仲間みんなの魔防が、60秒のあいだ12%上がる。交代しても続く。", short: "バリア", cond: { line: "whitemage" }, mp: 10, ct: 20,
      fx: [{ t: "buff", stat: "mdef", pct: 0.12, dur: 60, party: true }] },
    { id: "wm.save",  job: "whitemage", star: 4, name: "MPの節約", desc: "スキルで使うMPが、いつも15%へる。", short: "節約", cond: null, passive: { mpcut: 0.15 } },
    { id: "wm.rapid", job: "whitemage", star: 5, name: "ラピッド", desc: "仲間みんなの攻撃の待ち時間が、60秒のあいだ10%短くなる。交代しても続く。", short: "ラピッド", cond: { line: "whitemage" }, mp: 12, ct: 20,
      fx: [{ t: "buff", stat: "wait", pct: -0.10, dur: 60, party: true }] },
    { id: "wm.holy",  job: "whitemage", star: 6, name: "聖なる守り", desc: "仲間みんなが、毒・しびれ・眠りにかかりにくくなる（これをつけた人が仲間にいれば効く）。", short: "聖なる", cond: null, passive: { aura: 0.5 } },
    { id: "wm.full",  job: "whitemage", star: 7, name: "フルケア", desc: "仲間みんなを全快にして、状態異常も治す。1回の冒険で1回だけ。", short: "フルケア", cond: { line: "whitemage" }, mp: 30, ct: 0, once: true,
      fx: [{ t: "heal", pct: 1.0, party: true }, { t: "cure", party: true }] },
    // ---------- 組み合わせの上級職（2026-10-20 保護者と決定。docs/game-design.md） ----------
    // 魔法剣士：剣に火・水・草の力をのせる（enchant：15秒のあいだ、ふつうの攻撃と「武器の属性」のスキルがその属性になる。新しくかけると前のものは消える）
    { id: "mn.fire",  job: "magicknight", star: 1, name: "火炎剣", desc: "15秒のあいだ、剣の攻撃が火になる。", short: "火炎剣", cond: { weapons: ["sword", "greatsword"] }, mp: 6, ct: 15,
      fx: [{ t: "enchant", elem: "fire", dur: 15 }] },
    { id: "mn.mind",  job: "magicknight", star: 2, name: "魔剣の心得", desc: "物攻と魔攻が、いつも8%上がる。", short: "魔剣", cond: null, passive: { patk: 0.08, matk: 0.08 } },
    { id: "mn.water", job: "magicknight", star: 3, name: "水流剣", desc: "15秒のあいだ、剣の攻撃が水になる。", short: "水流剣", cond: { weapons: ["sword", "greatsword"] }, mp: 6, ct: 15,
      fx: [{ t: "enchant", elem: "water", dur: 15 }] },
    { id: "mn.wind",  job: "magicknight", star: 4, name: "風塵剣", desc: "15秒のあいだ、剣の攻撃が草になる。", short: "風塵剣", cond: { weapons: ["sword", "greatsword"] }, mp: 6, ct: 15,
      fx: [{ t: "enchant", elem: "grass", dur: 15 }] },
    { id: "mn.absorb",job: "magicknight", star: 5, name: "魔力吸収", desc: "ふつうの攻撃が当たると、MPが少し回復する（最大MPの1%）。", short: "吸収", cond: null, passive: { mpOnHit: 0.01 } },
    { id: "mn.dance", job: "magicknight", star: 6, name: "炎舞", desc: "まわりの敵を、炎の剣でまとめて斬る（火）。", short: "炎舞", cond: { weapons: ["sword", "greatsword"] }, mp: 10, ct: 7,
      fx: [{ t: "around", vis: "spin", stat: "p", mult: 1.8, radius: 28, elem: "fire", color: "#ff8a3d" }] },
    { id: "mn.break", job: "magicknight", star: 7, name: "エレメントブレイク", desc: "前を、火と水と草で3回斬る。", short: "エレメント", cond: { weapons: ["sword", "greatsword"] }, mp: 16, ct: 15,
      fx: [{ t: "rapid", count: 3, interval: 0.16, hits: [
        { t: "arc", stat: "p", mult: 1.2, elem: "fire", color: "#ff8a3d" },
        { t: "arc", stat: "p", mult: 1.2, elem: "water", color: "#5aa9ff" },
        { t: "arc", stat: "p", mult: 1.2, elem: "grass", color: "#9be36a" }] }] },
    // 忍者：どの武器でも戦える。忍術
    { id: "nj.star",  job: "ninja", star: 1, name: "手裏剣", desc: "手裏剣を3枚投げる。どの武器でも使える。", short: "手裏剣", cond: { line: "ninja" }, mp: 5, ct: 3,
      fx: [{ t: "shot", stat: "p", mult: 0.7, elem: "pierce", count: 3, spread: 0.25, speed: 190, range: 140, size: 2, look: "shuriken", color: "#d8dce8" }] },
    { id: "nj.shadow",job: "ninja", star: 2, name: "影分身", desc: "ふつうの攻撃が2回当たる（1回の強さは0.6倍）。弓と魔法の玉は2つ飛ぶ。スキルには効かない。", short: "影分身", cond: null, passive: { double: 0.6 } },
    { id: "nj.bind",  job: "ninja", star: 3, name: "影ぬい", desc: "影をぬいとめる手裏剣を投げる。しびれさせることが多い。", short: "影ぬい", cond: { line: "ninja" }, mp: 6, ct: 8,
      fx: [{ t: "shot", stat: "p", mult: 0.8, elem: "pierce", speed: 200, range: 150, size: 2, look: "shuriken", color: "#9a5ad0", status: { type: "para", chance: 0.8, dur: 3 } }] },
    { id: "nj.hide",  job: "ninja", star: 4, name: "隠れみの術", desc: "5秒のあいだ、敵にねらわれない。こちらから攻撃すると終わる。ボスには効かない。", short: "隠れみの", cond: { line: "ninja" }, mp: 6, ct: 20,
      fx: [{ t: "hide", dur: 5 }] },
    { id: "nj.run",   job: "ninja", star: 5, name: "疾走", desc: "歩く速さが、いつも15%上がる。", short: "疾走", cond: null, passive: { speed: 0.15 } },
    { id: "nj.dodge", job: "ninja", star: 6, name: "身躱しの術", desc: "10秒のあいだ、30%の確率で敵の攻撃をよける。", short: "身躱し", cond: { line: "ninja" }, mp: 8, ct: 25,
      fx: [{ t: "buff", stat: "evade", pct: 0.30, dur: 10 }] },
    { id: "nj.katon", job: "ninja", star: 7, name: "火遁の術", desc: "まわりを火で包む（火）。", short: "火遁", cond: { line: "ninja" }, mp: 14, ct: 14,
      fx: [{ t: "around", vis: "flame", stat: "p", mult: 2.4, radius: 40, elem: "fire", color: "#ff8a3d" }] },
    // 剣闘士：剣・斧。HPが少ないほど強い
    { id: "gl.rush",  job: "gladiator", star: 1, name: "乱撃", desc: "その場で、すばやく4回斬る。", short: "乱撃", cond: { weapons: ["sword", "axe"] }, mp: 6, ct: 4,
      fx: [{ t: "rapid", count: 4, interval: 0.1, hit: { t: "arc", stat: "p", mult: 0.6, elem: "weapon" } }] },
    { id: "gl.back",  job: "gladiator", star: 2, name: "背水", desc: "HPが半分より少ないと物攻が上がる。HPが少ないほど上がり、最大で30%。", short: "背水", cond: null, passive: { backwater: 0.30 } },
    { id: "gl.risk",  job: "gladiator", star: 3, name: "捨て身", desc: "15秒のあいだ、物攻が30%上がり、物防が30%下がる。", short: "捨て身", cond: { line: "gladiator" }, mp: 6, ct: 30,
      fx: [{ t: "buff", stat: "patk", pct: 0.30, dur: 15 }, { t: "buff", stat: "pdef", pct: -0.30, dur: 15 }] },
    { id: "gl.whirl", job: "gladiator", star: 4, name: "旋風撃", desc: "まわりを回転して斬ってから、正面を強く斬る。", short: "旋風撃", cond: { weapons: ["sword", "axe"] }, mp: 9, ct: 7,
      fx: [{ t: "around", vis: "spin", stat: "p", mult: 1.0, radius: 26, elem: "weapon" }, { t: "pause", time: 0.2 }, { t: "arc", vis: "smash", stat: "p", mult: 1.6, elem: "weapon" }] },
    { id: "gl.spirit",job: "gladiator", star: 5, name: "闘志", desc: "敵をたおすと、5秒のあいだ物攻が10%上がる。", short: "闘志", cond: null, passive: { fervor: 0.10 } },
    { id: "gl.impact",job: "gladiator", star: 6, name: "破衝撃", desc: "1.5秒ためて、遠くまでとどく斬撃を飛ばす。何体でもつらぬく。", short: "破衝撃", cond: { weapons: ["sword", "axe"] }, mp: 12, ct: 12,
      fx: [{ t: "charge", time: 1.5 }, { t: "shot", stat: "p", mult: 3.2, elem: "weapon", speed: 200, range: 170, size: 4, pierce: true, look: "crescent", color: "#ffe7a0", noAim: true }] },
    { id: "gl.thunder",job: "gladiator", star: 7, name: "迅雷斬", desc: "一歩ずつふみこみながら、6回斬る。", short: "迅雷斬", cond: { weapons: ["sword", "axe"] }, mp: 15, ct: 15,
      fx: [{ t: "rapid", count: 6, interval: 0.24, step: 10, hit: { t: "arc", stat: "p", mult: 0.7, elem: "weapon", color: "#fff3a0" } }] },   // 2026-10-21：一歩ふみこんでは斬る、をゆっくり6回
    // 聖騎士：光の槍と守り
    { id: "pl.spear", job: "paladin", star: 1, name: "ホーリースピア", desc: "光の槍で、前へ一直線に突く（光）。", short: "ホーリー", cond: { weapons: ["spear"] }, mp: 7, ct: 4,
      fx: [{ t: "arc", stat: "p", mult: 1.8, elem: "light", reach: 36, arc: 0.22, vis: "lance", color: "#fff2a0" }] },
    { id: "pl.heal",  job: "paladin", star: 2, name: "オートヒール", desc: "5秒ごとに、HPが最大HPの1%回復する。", short: "オートヒール", cond: null, passive: { autoHeal: 0.01 } },
    { id: "pl.guts",  job: "paladin", star: 3, name: "不屈の光", desc: "10秒のあいだ、HPが0になるダメージを受けても、HP1で持ちこたえる。", short: "不屈", cond: { line: "paladin" }, mp: 12, ct: 45,
      fx: [{ t: "guts", dur: 10 }] },
    { id: "pl.prayer",job: "paladin", star: 4, name: "守りの祈り", desc: "仲間みんなの物防と魔防が、60秒のあいだ10%上がる。交代しても続く。", short: "祈り", cond: { line: "paladin" }, mp: 10, ct: 30,
      fx: [{ t: "buff", stat: "pdef", pct: 0.10, dur: 60, party: true }, { t: "buff", stat: "mdef", pct: 0.10, dur: 60, party: true }] },
    { id: "pl.shield",job: "paladin", star: 5, name: "聖なる盾", desc: "受けるダメージが、いつも8%へる。HPが半分より少ないと15%へる。", short: "聖なる盾", cond: null, passive: { cut: 0.08, cutLow: 0.07 } },
    { id: "pl.guard", job: "paladin", star: 6, name: "守護の光", desc: "仲間みんなのHPを15%回復して、60秒のあいだ物防が10%上がる。", short: "守護", cond: { line: "paladin" }, mp: 14, ct: 30,
      fx: [{ t: "heal", pct: 0.15, party: true }, { t: "buff", stat: "pdef", pct: 0.10, dur: 60, party: true }] },
    { id: "pl.cross", job: "paladin", star: 7, name: "グランドクロス", desc: "十字の光から、前へ太い光のビームを放つ。とどくところの敵みんなに当たる（光）。", short: "クロス", cond: { weapons: ["spear"] }, mp: 16, ct: 15,
      fx: [{ t: "beam", stat: "p", mult: 2.5, elem: "light", length: 190, width: 16, color: "#fff2a0" }] },   // 2026-10-21：飛ぶ十字から、前へのびる光のビームに
    // 賢者：大きな攻撃魔法と回復
    { id: "sg.leaf",  job: "sage", star: 1, name: "リーフストーム", desc: "まわりに、大きな葉の刃のうずを起こす（草）。", short: "リーフ", cond: { line: "sage" }, mp: 12, ct: 6,
      fx: [{ t: "around", vis: "leaf", stat: "m", mult: 2.0, radius: 46, elem: "grass", color: "#9be36a" }] },
    { id: "sg.charge",job: "sage", star: 2, name: "オートチャージ", desc: "10秒ごとに、MPが最大MPの1%回復する。", short: "チャージ", cond: null, passive: { autoMp: 0.01 } },
    { id: "sg.charm", job: "sage", star: 3, name: "チャーム", desc: "近くの敵1体を、15秒のあいだ味方にする。部屋のほかの敵がいなくなると元にもどる。ボスには効かない。", short: "チャーム", cond: { line: "sage" }, mp: 10, ct: 25,
      fx: [{ t: "charm", dur: 15, range: 80 }] },
    { id: "sg.recover",job: "sage", star: 4, name: "リカバー", desc: "仲間みんなのHPを30%回復して、状態異常も治す。", short: "リカバー", cond: { line: "sage" }, mp: 16, ct: 15,
      fx: [{ t: "heal", pct: 0.3, party: true }, { t: "cure", party: true }] },
    { id: "sg.wisdom",job: "sage", star: 5, name: "賢者の知恵", desc: "スキルの待ち時間が、いつも15%短い。", short: "知恵", cond: null, passive: { ctcut: 0.15 } },
    { id: "sg.fire",  job: "sage", star: 6, name: "ファイアストーム", desc: "まわりに、炎のうずを起こす（火）。", short: "ストーム", cond: { line: "sage" }, mp: 16, ct: 10,
      fx: [{ t: "around", vis: "firestorm", stat: "m", mult: 2.2, radius: 50, elem: "fire", color: "#ff8a3d" }] },
    { id: "sg.meteor",job: "sage", star: 7, name: "メテオ", desc: "前の広いところに、隕石を3つ降らせる。", short: "メテオ", cond: { line: "sage" }, mp: 24, ct: 25,
      fx: [{ t: "charge", time: 0.8 }, { t: "rain", look: "meteor", stat: "m", mult: 1.0, elem: "none", count: 3, dist: 56, radius: 30, hitRadius: 22 }] },
    // 魔物使い（2026-10-26 保護者と決定）：はじめはパッシブ。★1〜★6 は各ダンジョンの主を呼ぶ。呼べるのは、その★になって、その主をたおしているとき（boss）。
    // 呼んだ主は、大技を1回敵に使って消える（呼ぶあいだは止まる）。強さは物攻と魔攻の高い方（stat: "best"。守りは使った方）。数字は仮（2026-10-26：弱かったので、MP・待ち時間を下げ、倍率を上げた）
    { id: "tm.quick", job: "tamer", star: 1, name: "すばやい構え", desc: "スキルの構えとための時間が、いつも30%短い。", short: "構え", cond: null, passive: { castcut: 0.3 } },
    { id: "tm.tree",  job: "tamer", star: 2, name: "よびだし：大木の魔物", desc: "大木の魔物を呼ぶ。自分を中心に十字の形で根の大波を起こし、通り道の敵みんなに当たる（草）。新緑の樹海の主をたおしていると覚える。", short: "大木", boss: "tree_boss", cond: { line: "tamer" }, mp: 16, ct: 15,
      fx: [{ t: "summon", boss: "tree_boss", stat: "best", color: "#7ae0a8", mult: 3.0, elem: "grass" }] },
    { id: "tm.witch", job: "tamer", star: 3, name: "よびだし：沼の魔女", desc: "沼の魔女を呼ぶ。近くの敵の足もとに瘴気の柱を立てる。毒になることがある。瘴気の森の主をたおしていると覚える。", short: "魔女", boss: "witch_boss", cond: { line: "tamer" }, mp: 18, ct: 15,
      fx: [{ t: "summon", boss: "witch_boss", stat: "best", color: "#7ae0a8", mult: 3.2, elem: "none", status: { type: "poison", chance: 0.5, dur: 8 } }] },
    { id: "tm.elf",   job: "tamer", star: 4, name: "よびだし：ダークエルフ", desc: "ダークエルフを呼ぶ。まわりに闇の玉を6つ回して、近くの敵をねらって1つずつ撃つ。玉は敵をつらぬく（闇）。原生の秘境の主をたおしていると覚える。", short: "エルフ", boss: "elf_boss", cond: { line: "tamer" }, mp: 20, ct: 18,
      fx: [{ t: "summon", boss: "elf_boss", stat: "best", color: "#7ae0a8", mult: 0.6, elem: "dark" }] },
    // ★4〜★6：次の地方のダンジョンの主（まだない）。覚えない
    { id: "tm.next1", job: "tamer", star: 5, name: "？？？", desc: "次の地方のダンジョンの主を呼ぶ（まだ行けない）。", short: "？？？", future: true, cond: { line: "tamer" }, mp: 0, ct: 0, fx: [] },
    { id: "tm.next2", job: "tamer", star: 6, name: "？？？", desc: "次の地方のダンジョンの主を呼ぶ（まだ行けない）。", short: "？？？", future: true, cond: { line: "tamer" }, mp: 0, ct: 0, fx: [] },
    { id: "tm.next3", job: "tamer", star: 7, name: "？？？", desc: "次の地方のダンジョンの主を呼ぶ（まだ行けない）。", short: "？？？", future: true, cond: { line: "tamer" }, mp: 0, ct: 0, fx: [] }
  ];
  var SKILL = {};
  SKILLS.forEach(function (s) { SKILL[s.id] = s; });

  // 森の敵（深さ1のとき）。res は属性ごとの倍率（1.5＝弱点、0.5＝半減、0＝無効。書いていない属性は1）
  // kind：melee＝近づいて斬る、spear＝少し離れて突く、archer＝離れて矢を撃つ、vine＝動かず、つるで打つ
  var ENEMIES = {
    goblin_sword: {
      name: "ゴブリンの剣士", kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2,
      res: { strike: 1.5, pierce: 0.5 }, speed: 24, r: 6,
      reach: 14, windup: 0.35, cooldown: 1.1, lunge: 6, color: "#6f8f3e"   // 2026-10-18：休み1.6→1.1秒、構え0.45→0.35秒、一歩ふみこむ
    },
    goblin_spear: {
      name: "ゴブリンの槍兵", kind: "spear", hp: 32, patk: 9, pdef: 3, mdef: 2,
      res: { slash: 1.5 }, speed: 28, r: 6,
      reach: 30, keep: 20, windup: 0.5, cooldown: 1.4, lunge: 4, color: "#7d8f4a"   // 2026-10-18：休み1.9→1.4秒、構え0.6→0.5秒
    },
    goblin_archer: {
      name: "ゴブリンの弓兵", kind: "archer", hp: 36, patk: 7, pdef: 2, mdef: 2,
      res: { pierce: 1.5 }, speed: 32, r: 6,
      keepMin: 64, keepMax: 120, windup: 0.5, cooldown: 2.3, arrowSpeed: 120, color: "#8a9a52"
    },
    vine: {
      name: "つる草の魔物", kind: "vine", hp: 36, patk: 7, pdef: 3, mdef: 4,
      res: { fire: 1.5, water: 0.5, grass: 0 }, speed: 0, r: 7,
      reach: 34, windup: 0.6, cooldown: 2.0, color: "#3f8a3a",
      onHit: { type: "para", chance: 0.2, dur: 3 }
    },
    // キノコの魔物（2026-10-18 保護者が選んだ）：のろい。近づくと、まわりに胞子をまく（毒）。火に弱い。浅い階から出る
    mushroom: {
      name: "キノコの魔物", kind: "spore", hp: 34, patk: 7, pdef: 3, mdef: 3,
      res: { fire: 1.5, strike: 0.5, grass: 0.5 }, speed: 14, r: 6,
      reach: 24, windup: 0.8, cooldown: 2.6, color: "#a85a8a",
      onHit: { type: "poison", chance: 0.6, dur: 6 }
    },
    // 大きな蜂（2026-10-18 保護者が選んだ）：飛んで、じぐざぐに近づき、毒の針でさす。速いが HP は少ない。8階から出る
    bee: {
      name: "大きな蜂", kind: "bee", hp: 18, patk: 8, pdef: 1, mdef: 2,
      res: { pierce: 1.5, fire: 1.5, strike: 0.75 }, speed: 46, r: 5,
      reach: 12, windup: 0.3, cooldown: 1.5, color: "#dad45e",
      onHit: { type: "poison", chance: 0.3, dur: 6 }
    },
    // ---- 瘴気の森（段階2、2026-10-21）。闇の骸骨は、打と光が弱点・刺は半減・闇は効かない ----
    // 骸骨の剣士：ゴブリンの剣士と同じ近づいて斬る敵。少しかたい
    skeleton_sword: {
      name: "骸骨の剣士", kind: "melee", hp: 42, patk: 8, pdef: 5, mdef: 3,
      res: { strike: 1.5, light: 1.5, pierce: 0.5, dark: 0 }, speed: 22, r: 6,
      reach: 14, windup: 0.4, cooldown: 1.2, lunge: 6, color: "#c8ccd4"
    },
    // 骸骨の弓兵：離れて矢を撃つ。紫のフード
    skeleton_archer: {
      name: "骸骨の弓兵", kind: "archer", hp: 34, patk: 7, pdef: 3, mdef: 3,
      res: { strike: 1.5, light: 1.5, pierce: 0.5, dark: 0 }, speed: 28, r: 6,
      keepMin: 64, keepMax: 120, windup: 0.55, cooldown: 2.4, arrowSpeed: 120, color: "#6a3a98"
    },
    // 毒ガエル：はねて近づき（はねているあいだだけ動く）、少し離れたところから毒のつばを吐く（中距離）。水は半減
    frog: {
      name: "毒ガエル", kind: "frog", hp: 30, patk: 7, pdef: 2, mdef: 2,
      res: { water: 0.5, strike: 0.75, slash: 1.25 }, speed: 0, r: 6,
      reach: 72, keep: 44, hopSpeed: 95, hopTime: 0.35, hopEvery: 1.1,
      windup: 0.5, cooldown: 2.4, spitSpeed: 100, color: "#4e8a40",
      onHit: { type: "poison", chance: 0.6, dur: 6 }
    },
    // ---- 瘴気の森の魔法の敵（段階3、2026-10-21）。matk＝魔攻。魔法の攻撃は、仲間の魔防で受ける ----
    // 影の魔導士：離れたところから、闇の玉を撃つ（ゆっくり飛ぶ。魔法のダメージ）。体は弱い。光が弱点
    shadow_mage: {
      name: "影の魔導士", kind: "caster", hp: 30, patk: 4, matk: 10, pdef: 2, mdef: 6,
      res: { light: 1.5, dark: 0, strike: 1.25 }, speed: 24, r: 6,
      keepMin: 70, keepMax: 130, windup: 0.8, cooldown: 2.6, orbSpeed: 85, color: "#6a3a98"
    },
    // 瘴気の霊（6階から）：ふわふわ浮いて近づき、まわりに瘴気をはじけさせる（魔法のダメージ。毒になることがある）。
    // 物理（斬・刺・打）は半減、光が大きな弱点、火も少し効く
    wisp: {
      name: "瘴気の霊", kind: "wisp", hp: 26, patk: 4, matk: 9, pdef: 6, mdef: 2,
      res: { slash: 0.5, pierce: 0.5, strike: 0.5, light: 1.75, fire: 1.25, dark: 0 }, speed: 30, r: 6,
      reach: 18, windup: 0.6, cooldown: 2.0, color: "#b49ad8",
      onHit: { type: "poison", chance: 0.3, dur: 6 }
    },
    // ---- 原生の秘境の物理の敵（段階2、2026-10-25 保護者と決定）。数字は遊んでみてから直す ----
    // オオカミ：2〜3びきの群れで出る（1階から）。速い。まわりを回りながら、すきを見てとびこんでかみつく
    wolf: {
      name: "オオカミ", kind: "wolf", hp: 30, patk: 8, pdef: 2, mdef: 2,
      res: { slash: 1.5, fire: 1.25 }, speed: 48, r: 5,
      reach: 12, circle: 34, windup: 0.35, cooldown: 1.6, lunge: 8, color: "#464c62"
    },
    // ワイルドボア（5階から）：ゆっくり近づき、赤い線で予告してから突進する（よけられる大きめの技。線は走り出す0.3秒前まで向きを合わせ直す）。
    // 壁や岩にぶつかると、2秒ふらつく（すきあり）。近くでは牙でつき上げる。かたくて HP が多い
    boar: {
      name: "ワイルドボア", kind: "boar", hp: 64, patk: 9, pdef: 5, mdef: 2,
      res: { pierce: 1.25, fire: 1.25, strike: 0.75 }, speed: 20, r: 7,
      reach: 12, windup: 0.5, cooldown: 1.8, color: "#7a5230",
      chargeMin: 24, chargeRange: 150, chargeMax: 180, chargeWarn: 0.8, chargeSpeed: 220, chargeMult: 2.2, chargeEvery: 4.5, tired: 2
    },
    // ---- 原生の秘境の魔法の敵（段階3、2026-10-25 保護者と決定）。数字は遊んでみてから直す ----
    // ダークウィスプ（6階から）：ふわふわ漂い、はなれたところから闇の玉を撃つ（ダーク。魔法のダメージ）。
    // ときどき消えて、べつの場所に現れ、すぐに闇の玉を撃つ（blinkEvery〜＋2秒ごと。近くにいられると fleeAfter 秒たてば早めに消える）。
    // 消えかけ・現れかけ（blinkTime 秒ずつ）は攻撃が当たらない。物理（斬・刺・打）は半減、光が大きな弱点
    dark_wisp: {
      name: "ダークウィスプ", kind: "dwisp", hp: 28, patk: 4, matk: 11, pdef: 6, mdef: 3,
      res: { slash: 0.5, pierce: 0.5, strike: 0.5, light: 1.75, dark: 0 }, speed: 22, r: 6,
      keepMin: 60, keepMax: 120, windup: 0.7, cooldown: 2.4, orbSpeed: 95, color: "#3a1a5a",
      blinkEvery: 5.5, blinkTime: 0.35, fleeGap: 26, fleeAfter: 2.5, appearMin: 70, appearMax: 130
    },
    // モンスターの巣（段階5、2026-10-22）：瘴気の森の寄り道の部屋に、ときどきある。泡立つ毒の沼。
    // 動かず攻撃もしないが、数秒ごとに敵を出す（core.js）。こわすと敵は出なくなる。
    // fixed：押されない・吸いよせられない・チャームが効かない。notInBook：図鑑に出さない。数字は遊んでみてから直す
    nest: {
      name: "モンスターの巣", kind: "nest", fixed: true, notInBook: true, hp: 120, patk: 0, pdef: 4, mdef: 4,
      res: {}, speed: 0, r: 13, color: "#6a3a98",
      every: 4.5, first: 1.5, roomMax: 5, total: 10
    },
    // ---- 訓練場の像（2026-10-21 保護者の案）。ゴブリンの剣士の形と強さで、深さ trainDepth のときと同じ。
    // 弱点・攻撃してくるかは、宿屋の訓練場で選ぶ。training：図鑑には出さない ----
    statue_wood:   { name: "木像", training: true, trainDepth: 1,  kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2, res: {}, speed: 24, r: 6, reach: 14, windup: 0.35, cooldown: 1.1, lunge: 6, color: "#a87a4a" },
    statue_stone:  { name: "石像", training: true, trainDepth: 8,  kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2, res: {}, speed: 24, r: 6, reach: 14, windup: 0.35, cooldown: 1.1, lunge: 6, color: "#8595a1" },
    statue_bronze: { name: "銅像", training: true, trainDepth: 15, kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2, res: {}, speed: 24, r: 6, reach: 14, windup: 0.35, cooldown: 1.1, lunge: 6, color: "#c08440" },
    // 大オオカミが遠ぼえで呼ぶ。速いが弱い
    wolf_pup: {
      name: "子オオカミ", kind: "melee", hp: 20, patk: 6, pdef: 2, mdef: 1,
      res: { slash: 1.5 }, speed: 44, r: 5,
      reach: 12, windup: 0.35, cooldown: 1.3, color: "#8a8f9a"
    },
    // ボス（段階4-3）。HP はたたき台 docs/draft.md 2 のまま。物攻・物防・魔防は、たたき台にないので仮の数字（遊んでみて直す）
    // 2026-10-18 保護者と決定：攻撃を1.3倍に、ふつうの攻撃と大技の間かくを約2割短く（HP はそのまま）
    wolf_boss: {
      name: "大オオカミ", kind: "wolf_boss", boss: true, hp: 600, patk: 17, pdef: 6, mdef: 4,
      res: { slash: 1.5, fire: 1.5 }, speed: 34, r: 12,
      reach: 18, windup: 0.5, cooldown: 1.1, color: "#6e7280",
      chargeWarn: 0.9, chargeSpeed: 280, chargeMult: 3.5, chargeEvery: 5.5, howlEvery: 13
    },
    tree_boss: {
      name: "大木の魔物", kind: "tree_boss", boss: true, hp: 1500, patk: 23, pdef: 7, mdef: 5,
      res: { fire: 1.5, water: 0.5, grass: 0 }, speed: 0, r: 18,
      reach: 40, windup: 0.6, cooldown: 1.25, color: "#5a3d22",
      rootWarn: 1.2, rootMult: 3.0, rootEvery: 8, rootEveryHalf: 5, pollenEvery: 10, pollenRadius: 80, seedSpeed: 110
    }
  };

  // ---- 瘴気の森のボス（段階4、2026-10-21）。数字は仮（遊んでみてから直す） ----
  // 大ガマ（5階）：はねて近づき、舌でたたく。沼にもぐって、予告の輪のところから飛び出す（大技）。毒の雨。HP が半分になると毒ガエルを呼ぶ
  ENEMIES.frog_boss = {
    name: "大ガマ", kind: "frog_boss", boss: true, hp: 1400, patk: 26, matk: 0, pdef: 8, mdef: 6,
    res: { water: 0.5, strike: 0.75, slash: 1.25 }, speed: 0, r: 16,
    reach: 30, windup: 0.5, cooldown: 1.3, hopSpeed: 120, hopTime: 0.4, hopEvery: 1.1, color: "#4e7a3a",
    // 2026-10-22：かわせなかったので、予告 1.1→1.4秒、輪 30→26、輪がとまるのは出る 0.9 秒前（前は0.35秒前）
    diveEvery: 7, diveEveryHalf: 5, diveWarn: 1.4, diveLock: 0.9, diveRadius: 26, diveMult: 3.0,
    rainEvery: 9, rainWarn: 0.9, rainRadius: 16, rainMult: 0.8
  };
  // 沼の魔女（10階・主）：魔法が中心。離れたところから闇の玉を3つ。近づくと消えて、べつの場所に現れる。
  // 瘴気の柱（大技。地面の紫の輪で予告）、瘴気の霊を呼ぶ。光が弱点、闇は効かない
  ENEMIES.witch_boss = {
    name: "沼の魔女", kind: "witch_boss", boss: true, hp: 2600, patk: 18, matk: 32, pdef: 7, mdef: 12,
    res: { light: 1.5, dark: 0, strike: 1.25 }, speed: 20, r: 10,
    keepMin: 70, keepMax: 130, windup: 0.6, cooldown: 2.2, orbSpeed: 95, color: "#4a2e72",
    pillarEvery: 9, pillarEveryHalf: 6, pillarWarn: 1.2, pillarRadius: 22, pillarMult: 2.6,
    // 2026-10-22 保護者の感想（遠くから攻撃できないと当てられない）で、近くで戦えるようにした：
    // 近くに nearTime 秒いられてから消える（すぐには消えない）・消えたあとは近め（appearMin〜appearMax）に現れて、tired 秒ふらつく（すきあり）・
    // 瘴気の柱のあとも tired 秒ふらつく・はなれるのをゆっくりに（前は speed 30、keepMin 90、keepMax 150、消えるのは6秒ごと（HP半分から4秒）で近づくとすぐ）
    blinkEvery: 10, blinkEveryHalf: 7, nearTime: 1.5, appearMin: 60, appearMax: 110, tired: 2.0, summonEvery: 16
  };

  // ---- 原生の秘境のボス（段階4、2026-10-25 保護者と決定）。数字は仮（遊んでみてから直す） ----
  // 2026-10-26 見直し（保護者：簡単すぎるので強く、見た目を豪華に）：ゴーレムは HP・攻撃・岩の数を上げ、HP 半分から3回攻撃が4回、
  // 投げた岩は壁で3つのかけらに割れてはね返る（chipMult）。ダークエルフは HP を上げた。ダークアローは 2026-10-26 に、回る闇の玉を1つずつ撃つ形に作りなおした（上の ENEMIES.elf_boss）
  // くわしくは docs/game-design.md の「ボスの見直し」
  // ゴーレム（8階・中ボス）：ゆっくり歩く。近くでは、うでを広げてから、ぶん回し（まわりの広い範囲・打）。
  // 少しはなれると、ふみこみながらの3回攻撃（1回ずつ前へ出て、こぶしでたたく）。
  // 大技の岩石投げ：岩を持ち上げてから、まっすぐ投げる（rockCount〜＋1回。飛んでくる岩をよける。打の大ダメージ）。
  // 近すぎるときは、投げる前にずしんと後ろへ下がる。HP が半分を切ると、岩が rockCountHalf 回で速くなり、間かくも短くなる。投げ終わると、ふらつく（すきあり）。打と火が弱点、斬と刺はいまひとつ
  ENEMIES.golem_boss = {
    name: "ゴーレム", kind: "golem_boss", boss: true, hp: 2600, patk: 28, matk: 0, pdef: 12, mdef: 5,
    res: { strike: 1.5, fire: 1.5, slash: 0.75, pierce: 0.75 }, speed: 16, r: 16, cooldown: 1.6, color: "#6c665a",
    spinRange: 28, spinWarn: 0.8, spinRadius: 44, spinMult: 1.6,
    comboEvery: 6, comboHits: 3, comboHitsHalf: 4, comboRange: 80, comboWindup: 0.45, comboStep: 16, comboReach: 22, comboMult: 1.1,
    rockEvery: 11, rockEveryHalf: 7, rockCount: 4, rockCountHalf: 7, rockWindup: 0.6, rockWindupHalf: 0.45,
    rockSpeed: 140, rockSpeedHalf: 175, rockMult: 1.8, rockR: 10, chipMult: 0.6, tired: 2.0,
    backGap: 50, backTime: 0.5, backSpeed: 150   // 岩を投げるとき、近すぎたら先に後ろへ下がる
  };

  // ダークエルフ（15階・主。段階5、2026-10-26 保護者と決定）：はなれて回りながら、弓を引いて矢を撃つ（HP が半分を切ると扇に3本）。
  // ときどき闇の玉を扇に3つ（ダーク・魔法）。近づかれると回転斬り（まわり）→ 後ろへ宙返りして距離をとる（宙返りのあいだは当たらない）。
  // 大技のダークアロー（2026-10-26 保護者の案で作りなおし）：動きながら、まわりに闇の玉を daCount 個（3〜4。HP が半分を切ると daCountHalf の5〜6）
  // 回して、プレイヤーをねらって1つずつ撃つ（間かく daGap 秒）。撃った玉は、飛ぶ向きに長い光の尾をひく。終わるとふらつく（すきあり）。
  // HP が半分を切ると、弓が3本になる。光が弱点、闇は効かない
  ENEMIES.elf_boss = {
    name: "ダークエルフ", kind: "elf_boss", boss: true, hp: 3200, patk: 24, matk: 30, pdef: 8, mdef: 12,
    res: { light: 1.5, dark: 0 }, speed: 34, r: 10, color: "#3c3058",
    keepMin: 80, keepMax: 140, aimTime: 0.45, cooldown: 1.5, arrowSpeed: 210, arrowMult: 1.0, fanHalf: 3,
    orbEvery: 7, orbCount: 3, orbCountHalf: 5, orbWindup: 0.6, orbSpeed: 100, orbMult: 0.9,
    spinRange: 22, spinWarn: 0.45, spinRadius: 34, spinMult: 1.4, spinEvery: 2.5, flipTime: 0.45, flipSpeed: 190,
    daEvery: 13, daEveryHalf: 9, daCount: [3, 4], daCountHalf: [5, 6], daWindup: 0.9, daGap: 0.45, daGapHalf: 0.32, daSpeed: 175, daMult: 2.0, daR: 7, tired: 1.8
  };

  // ボスの階層（段階4-3）。前後の短い文章は Claude が書いた仮の文。保護者が直す。
  var BOSSES = {
    7: {
      enemy: "wolf_boss", title: "群れをしずめし者",
      before: ["森の奥から、低いうなり声がひびいてくる。", "群れの長、大オオカミが道をふさいでいる。", "「ここから先へは、通さぬ……！」"],
      after: ["大オオカミは、静かに森の奥へ去っていった。", "子オオカミたちも、そのあとを追っていく。", "森の道が、また少し先へ開けた。"]
    },
    14: {
      enemy: "tree_boss", title: "森の解放者",
      before: ["森のいちばん深いところに、古い大木が立っている。", "根が地面をゆらし、大木がゆっくりと目を開いた。", "森をおおう霧は、この大木から出ていたのだ！"],
      after: ["大木の魔物は、ふつうの古い木にもどった。", "森をおおっていた霧が晴れ、木もれ日がさしこむ。", "森は、ふたたび静けさをとりもどした。"]
    }
  };

  // 状態異常（docs/draft.md 1.7）
  var STATUS = {
    poison: { name: "毒", color: "#e070ff" },   // 2026-10-22：黄緑だと地面にまぎれるので、明るい紫に
    para:   { name: "しびれ", color: "#ffe066" },
    sleep:  { name: "眠り", color: "#b48cf0" },
    "break": { name: "防御ダウン", color: "#ff9a4d" }
  };

  // 基礎パラメーター（レベル1はどれも10。上がるたびに職業の伸びを足す。小数は持ちこす）
  function baseStats(job, level) {
    var g = JOBS[job].growth;
    return { str: 10 + g.str * (level - 1), vit: 10 + g.vit * (level - 1), mag: 10 + g.mag * (level - 1), int: 10 + g.int * (level - 1) };
  }

  // 戦闘パラメーター（docs/draft.md 1.2）
  // level：HP に (レベル−1)×3 を足す（2026-10-17 案H。深い階層でも打たれ強さが下がりすぎないように。Lv1 では 0）
  function combatStats(base, weapon, armor, level) {
    return {
      hp: Math.floor(30 + base.vit * 5 + ((level || 1) - 1) * 3),
      mp: Math.floor(10 + base.int * 2),
      patk: Math.floor(base.str + weapon.patk),
      pdef: Math.floor(base.str * 0.5 + armor.pdef),
      matk: Math.floor(base.mag + weapon.matk),
      mdef: Math.floor(base.mag * 0.5 + armor.mdef),
      crit: 0.05
    };
  }

  // 職の系統に入っているか
  function inLine(job, line) { return (LINES[line] || []).indexOf(job) >= 0; }
  // 場所の名前（2026-10-18 保護者が決定）。ダンジョン2・3は、前のダンジョンの主をたおすまで行けない（地図では「？？？」）
  var PLACES = { region: "フォレストヴェール", base: "エルム村", dungeon1: "新緑の樹海", dungeon2: "瘴気の森", dungeon3: "原生の秘境" };
  // ダンジョンの一覧（瘴気の森の段階1、2026-10-21）。階の数・ボスの階・開く条件・強さの深さはダンジョンごと。
  //   bosses：ボスの階 → BOSSES と同じ形（enemy・title・before・after）
  //   needs：このダンジョンの主をたおすと開く（null ならはじめから開いている）
  //   depthBase：強さの深さ＝depthBase＋階。敵の強さ・ごほうび・拾う装備のレベルに使う（樹海は 0 で、今までと同じ）
  //   theme：部屋の型と色合い（forest＝森の型・緑、swamp＝沼の型・青紫、wild＝遺跡と湖の型・深い緑。tiles.js・rooms.js）
  // 瘴気の森のボスは大ガマ（5階）と沼の魔女（10階）（段階4）。深さは仮（段階6で直す）。
  var DUNGEONS = {
    forest1: { id: "forest1", name: PLACES.dungeon1, short: "樹海", floors: 14, bosses: BOSSES, needs: null, depthBase: 0, theme: "forest", tier: 0 },
    shouki: {
      id: "shouki", name: PLACES.dungeon2, short: "瘴気の森", floors: 10, needs: "forest1", depthBase: 14, theme: "swamp", tier: 1,
      bosses: {
        // 前後の文は Claude が書いた仮の文（保護者があとで直す）
        5: { enemy: "frog_boss", title: "沼をしずめし者",
             before: ["毒の沼が、ぶくぶくと泡を立てている。", "沼の底から、大きなカエルが顔を出した。", "「ゲロロ……この沼は、わしのものじゃ！」"],
             after: ["大ガマは、沼の底へもぐっていった。", "泡立っていた沼が、少し静かになった。", "森の奥へ、道が続いている。"] },
        10: { enemy: "witch_boss", title: "瘴気をはらう者",
              before: ["森のいちばん奥に、紫の霧がうずまいている。", "霧の中から、杖を持った魔女が現れた。", "「瘴気は、わたしの力。この森は、だれにもわたさないよ！」"],
              after: ["魔女は、霧といっしょに消えていった。", "森をおおっていた瘴気が晴れ、月の光がさしこむ。", "瘴気の森に、静けさがもどった。"] }
      }
    },
    // 原生の秘境（段階1、2026-10-25）：15階（8階にゴーレム、15階にダークエルフ）。沼の魔女をたおすと開く。
    // 深さは瘴気の森の続き（24＋階）。装備の段は鋼（段階6、2026-10-26。宝箱は鋼、開くとお店も鋼と特上の薬になる）
    hikyo: {
      id: "hikyo", name: PLACES.dungeon3, short: "秘境", floors: 15, needs: "shouki", depthBase: 24, theme: "wild", tier: 2,
      bosses: {
        8: { enemy: "golem_boss", title: "岩をくだく者",         // ゴーレム（段階4、2026-10-25）。前後の文は Claude が書いた仮の文
             before: ["遺跡の広場に、苔むした大きな岩がころがっている。", "岩が音を立てて組み上がり、青い目が光った！"],
             after: ["ゴーレムは音を立ててくずれ、ただの岩にもどった。", "胸のしるしの光が、静かに消えていく。"] },
        15: { enemy: "elf_boss", title: "秘境をきわめし者",     // ダークエルフ（段階5、2026-10-26）。前後の文は Claude が書いた仮の文
              before: ["いちばん奥の遺跡に、白い髪の弓使いが立っている。", "「ここまで来たか。だが、秘境の守りはわたしが最後だ」"],
              after: ["ダークエルフはひざをつき、弓を下ろした。", "「……見事だ。秘境の道は、おまえたちに開こう」"] }
      }
    }
  };
  var DUNGEON_ORDER = ["forest1", "shouki", "hikyo"];
  // 装備の段（2026-10-22）：0＝銅（新緑の樹海）、1＝鉄（瘴気の森）、2＝鋼（原生の秘境。2026-10-26）。段ごとの名前（書いていない段は item の名前）
  // 弓・杖・服・ローブは鉄ではないので、それらしい名前にした（保護者があとで直してよい）
  var TIER_NAMES = {
    1: { sword: "鉄の剣", greatsword: "鉄の大剣", axe: "鉄の斧", bow: "鉄の弓", spear: "鉄の槍", fist: "鉄のこて", staff: "銀の杖",
         heavy: "鉄のよろい", light: "なめし革の服", magic: "絹のローブ" },
    // 鋼の段（原生の秘境の段階6、2026-10-26）。弓・杖・服・ローブは、それらしい名前にした（保護者があとで直してよい）
    2: { sword: "鋼の剣", greatsword: "鋼の大剣", axe: "鋼の斧", bow: "風の長弓", spear: "鋼の槍", fist: "鋼のこて", staff: "水晶の杖",
         heavy: "鋼のよろい", light: "けものの皮の服", magic: "星のローブ" }
  };
  var TIER_LABEL = ["銅", "鉄", "鋼"];
  function dungeonOf(id) { return DUNGEONS[id] || DUNGEONS.forest1; }
  function isBossFloor(id, floor) { return !!dungeonOf(id).bosses[floor]; }
  function bossInfo(id, floor) { return dungeonOf(id).bosses[floor] || null; }
  function depthOf(id, floor) { return dungeonOf(id).depthBase + floor; }
  // 「新緑の樹海 3階」のような階の名前。dungeon を省くと新緑の樹海
  function floorLabel(floor, dungeon) { return dungeonOf(dungeon).name + " " + floor + "階"; }
  // 「3階」「7階（ボス）」
  function floorName(floor, dungeon) { return floor + "階" + (isBossFloor(dungeon, floor) ? "（ボス）" : ""); }
  // ふつうの攻撃の待ち時間（杖で魔法弾をうつ職は、魔法弾の待ち時間）
  function weaponWait(weapon, job) {
    var w = WEAPONS[weapon];
    if (w.bolt && w.bolt.wait && inLine(job, w.boltFor)) return w.bolt.wait;
    return w.wait;
  }

  // スキルの条件に合うか（合わないスキルはセットできない）
  function canSet(skill, job, weapon) {
    var c = skill.cond;
    if (!c) return true;
    if (c.weapons && c.weapons.indexOf(weapon) < 0) return false;
    if (c.line && !inLine(job, c.line)) return false;
    return true;
  }
  function condText(skill) {
    var c = skill.cond;
    if (!c) return "条件なし";
    if (c.weapons) return c.weapons.map(function (w) { return WEAPONS[w].name; }).join("・") + "を装備";
    if (c.line) return JOBS[c.line].name + "の系統";
    return "";
  }

  return {
    ELEMENTS: ELEMENTS, WEAPONS: WEAPONS, ARMORS: ARMORS, STARTER_ARMORS: STARTER_ARMORS, JOBS: JOBS, JOB_ORDER: JOB_ORDER, UPPER_ORDER: UPPER_ORDER, tierOf: tierOf, UPPER_JOBS: UPPER_JOBS, TOP_JOBS: TOP_JOBS, LINES: LINES,
    SKILLS: SKILLS, SKILL: SKILL, ENEMIES: ENEMIES, STATUS: STATUS, BOSSES: BOSSES,
    baseStats: baseStats, combatStats: combatStats, inLine: inLine, weaponWait: weaponWait, PLACES: PLACES, floorLabel: floorLabel, floorName: floorName,
    DUNGEONS: DUNGEONS, DUNGEON_ORDER: DUNGEON_ORDER, TIER_NAMES: TIER_NAMES, TIER_LABEL: TIER_LABEL, dungeonOf: dungeonOf, isBossFloor: isBossFloor, bossInfo: bossInfo, depthOf: depthOf, canSet: canSet, condText: condText
  };
})();
