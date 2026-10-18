// 数字の定義（たたき台 docs/draft.md から）。遊んでみて直すときは、まずここの数字を変える。
// 段階3：基本職5つ・武器・防具・スキル35・森の敵4種。
var GameData = (function () {
  // 属性の名前（表示用）
  var ELEMENTS = { slash: "斬", pierce: "刺", strike: "打", fire: "火", water: "水", grass: "草", none: "なし" };

  // 武器（ノーマル・アイテムレベル1）。reach＝届く距離（ドット）、arc＝ふりの広さ（左右それぞれのラジアン）
  // shot：ふつうの攻撃が飛ぶもの（弓の矢、魔術師の系統の杖の魔法弾）
  // power：ふつうの攻撃の「1回の強さ」の倍率（2026-10-17 決定）。近い武器ほど1秒あたりのダメージが強く、遠い武器ほど弱い
  //   （レベルが上がるとダメージは能力でほぼ決まるので、間かくの長い大剣・斧が弱く、離れて戦える職と差がなかったため）
  var WEAPONS = {
    // item＝拾う・買う装備の名前（最初の地方。R以上は名前のあとに〈R〉〈SR〉〈UR〉がつく）、starter＝はじめから持っている武器の名前（2026-10-18 決定）
    sword:      { name: "剣",   item: "銅の剣",   starter: "古い剣", element: "slash",  patk: 8,  matk: 0, wait: 0.6, power: 1.0,  reach: 18, arc: 1.05 },
    greatsword: { name: "大剣", item: "銅の大剣", element: "slash",  patk: 13, matk: 0, wait: 1.0, power: 1.65, reach: 22, arc: 1.4 },
    axe:        { name: "斧",   item: "銅の斧",   element: "slash",  patk: 11, matk: 0, wait: 0.9, power: 1.5,  reach: 20, arc: 1.3 },
    bow:        { name: "弓",   item: "木の弓",   starter: "古い弓", element: "pierce", patk: 9,  matk: 0, wait: 1.1, power: 0.85, shot: { speed: 170, range: 150, stat: "p" } },
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
               growth: { str: 1.0, vit: 1.5, mag: 1.5, int: 1.0 } }
  };
  var JOB_ORDER = ["warrior", "mage", "hunter", "fighter", "priest"];
  // 系統：その職と、その職からつながる上級職・最上級職
  var LINES = { warrior: ["warrior"], mage: ["mage"], hunter: ["hunter"], fighter: ["fighter"], priest: ["priest"] };

  // スキル（docs/draft.md 3.1）。star＝覚える★、cond＝使える条件（weapons：装備している武器、line：系統、null：条件なし）
  // fx＝効果の並び。t の種類：
  //   arc（前の扇）、around（まわり）、dash（踏みこむ）、shot（飛ばす）、rapid（何回も）、charge（ためる）、backstep（下がる）
  //   heal（回復）、cure（状態異常を治す）、regen（少しずつ回復）、revive（復活）、buff（強くする）、zone（その場に残る）、rain（降らせる）
  // stat：p＝物攻、m＝魔攻。elem：weapon＝武器の属性。status：{ type: poison/para/sleep/break, chance, dur }
  var EDGE = ["sword", "greatsword", "axe"];
  var HEAVY = ["greatsword", "axe"];
  var SKILLS = [
    // 戦士
    { id: "w.spin",   job: "warrior", star: 1, name: "回転ぎり",   short: "回転",   cond: { weapons: EDGE }, mp: 6, ct: 4,
      fx: [{ t: "around", stat: "p", mult: 1.2, radius: 26, elem: "weapon" }] },
    { id: "w.focus",  job: "warrior", star: 2, name: "気合い",     short: "気合",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "w.rush",   job: "warrior", star: 3, name: "とっしん",   short: "突進",   cond: { weapons: EDGE }, mp: 7, ct: 6,
      fx: [{ t: "dash", dist: 36 }, { t: "arc", stat: "p", mult: 1.5, elem: "weapon" }] },
    { id: "w.power",  job: "warrior", star: 4, name: "ちからため", short: "力ため", cond: { line: "warrior" }, mp: 6, ct: 30,
      fx: [{ t: "buff", stat: "patk", pct: 0.2, dur: 15 }] },
    { id: "w.crush",  job: "warrior", star: 5, name: "かぶと割り", short: "割り",   cond: { weapons: HEAVY }, mp: 8, ct: 8,
      fx: [{ t: "arc", stat: "p", mult: 1.8, elem: "strike", status: { type: "break", chance: 1, dur: 10 } }] },
    { id: "w.guard",  job: "warrior", star: 6, name: "かたい守り", short: "守り",   cond: { line: "warrior" }, mp: 6, ct: 30,
      fx: [{ t: "buff", stat: "pdef", pct: 0.3, dur: 10 }] },
    { id: "w.quake",  job: "warrior", star: 7, name: "大地斬り",   short: "大地",   cond: { weapons: HEAVY }, mp: 14, ct: 15,
      fx: [{ t: "arc", stat: "p", mult: 2.0, elem: "weapon", reach: 44, arc: 0.8 }] },
    // 魔術師
    { id: "m.fire",   job: "mage", star: 1, name: "ファイア",         short: "ファイア", cond: { line: "mage" }, mp: 5, ct: 2,
      fx: [{ t: "shot", stat: "m", mult: 1.3, elem: "fire", speed: 150, range: 130, size: 3, color: "#ff8a3d" }] },
    { id: "m.heal",   job: "mage", star: 2, name: "小さないやし",     short: "いやし",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "m.aqua",   job: "mage", star: 3, name: "アクア",           short: "アクア",   cond: { line: "mage" }, mp: 7, ct: 5,
      fx: [{ t: "arc", stat: "m", mult: 1.0, elem: "water", reach: 36, arc: 0.7, push: 26, color: "#5aa9ff" }] },
    { id: "m.sleep",  job: "mage", star: 4, name: "スリープ",         short: "スリープ", cond: { line: "mage" }, mp: 8, ct: 15,
      fx: [{ t: "around", stat: "m", mult: 0, radius: 44, status: { type: "sleep", chance: 0.6, dur: 5 }, color: "#b48cf0" }] },
    { id: "m.barrier",job: "mage", star: 5, name: "マジックバリア",   short: "バリア",   cond: { line: "mage" }, mp: 6, ct: 30,
      fx: [{ t: "buff", stat: "mdef", pct: 0.3, dur: 10 }] },
    { id: "m.wall",   job: "mage", star: 6, name: "フレイムウォール", short: "炎の壁",   cond: { line: "mage" }, mp: 12, ct: 12,
      fx: [{ t: "zone", stat: "m", mult: 0.5, elem: "fire", dist: 28, radius: 18, dur: 3, tick: 0.5, color: "#ff8a3d" }] },
    { id: "m.tidal",  job: "mage", star: 7, name: "タイダルウェーブ", short: "大波",     cond: { line: "mage" }, mp: 16, ct: 18,
      fx: [{ t: "around", stat: "m", mult: 2.0, radius: 60, elem: "water", push: 20, color: "#5aa9ff" }] },
    // 狩人
    { id: "h.triple", job: "hunter", star: 1, name: "三本撃ち",   short: "三本",   cond: { weapons: ["bow"] }, mp: 5, ct: 3,
      fx: [{ t: "shot", stat: "p", mult: 0.8, elem: "weapon", count: 3, spread: 0.28 }] },
    { id: "h.aid",    job: "hunter", star: 2, name: "応急手当",   short: "手当",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "h.poison", job: "hunter", star: 3, name: "毒矢",       short: "毒矢",   cond: { weapons: ["bow"] }, mp: 5, ct: 6,
      fx: [{ t: "shot", stat: "p", mult: 1.0, elem: "weapon", status: { type: "poison", chance: 0.7, dur: 10 }, color: "#9be36a" }] },
    { id: "h.back",   job: "hunter", star: 4, name: "うしろとび", short: "うしろ", cond: { weapons: ["bow"] }, mp: 4, ct: 5,
      fx: [{ t: "backstep", dist: 34 }, { t: "shot", stat: "p", mult: 1.0, elem: "weapon" }] },
    { id: "h.para",   job: "hunter", star: 5, name: "しびれ矢",   short: "しびれ", cond: { weapons: ["bow"] }, mp: 6, ct: 8,
      fx: [{ t: "shot", stat: "p", mult: 1.0, elem: "weapon", status: { type: "para", chance: 0.6, dur: 3 }, color: "#ffe066" }] },
    { id: "h.aim",    job: "hunter", star: 6, name: "ねらい撃ち", short: "ねらい", cond: { weapons: ["bow"] }, mp: 8, ct: 8,
      fx: [{ t: "charge", time: 1.0 }, { t: "shot", stat: "p", mult: 2.5, elem: "weapon", crit: 0.3, speed: 240, range: 200, size: 2 }] },
    { id: "h.rain",   job: "hunter", star: 7, name: "矢の雨",     short: "矢の雨", cond: { weapons: ["bow"] }, mp: 14, ct: 15,
      fx: [{ t: "rain", stat: "p", mult: 0.6, elem: "weapon", count: 5, dist: 56, radius: 26 }] },
    // 武術家
    { id: "f.combo",  job: "fighter", star: 1, name: "れんげき",         short: "連撃",   cond: { weapons: ["fist"] }, mp: 4, ct: 3,
      fx: [{ t: "rapid", count: 3, interval: 0.09, hit: { t: "arc", stat: "p", mult: 0.6, elem: "weapon" } }] },
    { id: "f.breath", job: "fighter", star: 2, name: "いきをととのえる", short: "呼吸",   cond: null, mp: 5, ct: 20, fx: [{ t: "heal", pct: 0.15 }] },
    { id: "f.sweep",  job: "fighter", star: 3, name: "足ばらい",         short: "足ばらい", cond: { weapons: ["fist"] }, mp: 6, ct: 8,
      fx: [{ t: "around", stat: "p", mult: 0.5, radius: 24, elem: "weapon", status: { type: "para", chance: 0.5, dur: 2 } }] },
    { id: "f.stance", job: "fighter", star: 4, name: "気合いの構え",     short: "構え",   cond: { line: "fighter" }, mp: 6, ct: 30,
      fx: [{ t: "buff", stat: "wait", pct: -0.3, dur: 10 }] },
    { id: "f.punch",  job: "fighter", star: 5, name: "せいけん突き",     short: "突き",   cond: { weapons: ["fist"] }, mp: 7, ct: 6,
      fx: [{ t: "arc", stat: "p", mult: 2.0, elem: "weapon", crit: 0.2 }] },
    { id: "f.kick",   job: "fighter", star: 6, name: "とびげり",         short: "とびげり", cond: { weapons: ["fist"] }, mp: 6, ct: 6,
      fx: [{ t: "dash", dist: 40 }, { t: "arc", stat: "p", mult: 1.5, elem: "weapon" }] },
    { id: "f.barrage",job: "fighter", star: 7, name: "百れつけん",       short: "百れつ", cond: { weapons: ["fist"] }, mp: 15, ct: 18,
      fx: [{ t: "rapid", count: 10, interval: 0.07, hit: { t: "arc", stat: "p", mult: 0.4, elem: "weapon" } }] },
    // 僧侶
    { id: "p.heal",   job: "priest", star: 1, name: "ヒール",           short: "ヒール", cond: { line: "priest" }, mp: 8, ct: 6,
      fx: [{ t: "heal", pct: 0.25, party: true }] },
    { id: "p.cure",   job: "priest", star: 2, name: "キュア",           short: "キュア", cond: { line: "priest" }, mp: 5, ct: 6,
      fx: [{ t: "cure", party: true }] },
    { id: "p.calm",   job: "priest", star: 3, name: "しずめの一撃",     short: "しずめ", cond: { weapons: ["staff"] }, mp: 6, ct: 6,
      fx: [{ t: "arc", stat: "p", mult: 1.4, elem: "strike", status: { type: "sleep", chance: 0.3, dur: 5 } }] },
    { id: "p.protect",job: "priest", star: 4, name: "まもりの祈り",     short: "まもり", cond: { line: "priest" }, mp: 8, ct: 30,
      fx: [{ t: "buff", stat: "pdef", pct: 0.2, dur: 15, party: true }] },
    { id: "p.regen",  job: "priest", star: 5, name: "リジェネ",         short: "リジェネ", cond: { line: "priest" }, mp: 10, ct: 20,
      fx: [{ t: "regen", pct: 0.2, dur: 10, party: true }] },
    { id: "p.revive", job: "priest", star: 6, name: "よみがえりの祈り", short: "よみがえり", cond: { line: "priest" }, mp: 20, ct: 0, once: true,
      fx: [{ t: "revive", pct: 0.3 }] },
    { id: "p.grand",  job: "priest", star: 7, name: "大いなるいやし",   short: "大いやし", cond: { line: "priest" }, mp: 20, ct: 40,
      fx: [{ t: "heal", pct: 0.6, party: true }, { t: "cure", party: true }] }
  ];
  var SKILL = {};
  SKILLS.forEach(function (s) { SKILL[s.id] = s; });

  // 森の敵（深さ1のとき）。res は属性ごとの倍率（1.5＝弱点、0.5＝半減、0＝無効。書いていない属性は1）
  // kind：melee＝近づいて斬る、spear＝少し離れて突く、archer＝離れて矢を撃つ、vine＝動かず、つるで打つ
  var ENEMIES = {
    goblin_sword: {
      name: "ゴブリンの剣士", kind: "melee", hp: 40, patk: 8, pdef: 5, mdef: 2,
      res: { strike: 1.5, pierce: 0.5 }, speed: 24, r: 6,
      reach: 14, windup: 0.45, cooldown: 1.6, color: "#6f8f3e"
    },
    goblin_spear: {
      name: "ゴブリンの槍兵", kind: "spear", hp: 32, patk: 9, pdef: 3, mdef: 2,
      res: { slash: 1.5 }, speed: 28, r: 6,
      reach: 30, keep: 20, windup: 0.6, cooldown: 1.9, color: "#7d8f4a"
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
      chargeWarn: 1.5, chargeSpeed: 280, chargeMult: 3.5, chargeEvery: 5.5, howlEvery: 13
    },
    tree_boss: {
      name: "大木の魔物", kind: "tree_boss", boss: true, hp: 1500, patk: 23, pdef: 7, mdef: 5,
      res: { fire: 1.5, water: 0.5, grass: 0 }, speed: 0, r: 18,
      reach: 40, windup: 0.6, cooldown: 1.25, color: "#5a3d22",
      rootWarn: 2.0, rootMult: 3.0, rootEvery: 8, rootEveryHalf: 5, pollenEvery: 10, pollenRadius: 80, seedSpeed: 110
    }
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
    poison: { name: "毒", color: "#9be36a" },
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
  // 場所の名前（2026-10-18 保護者が決定）。ダンジョン2・3は、まだ行けない（地図では「？？？」）
  var PLACES = { region: "フォレストヴェール", base: "エルム村", dungeon1: "新緑の樹海", dungeon2: "瘴気の森", dungeon3: "原生の秘境" };
  // 「新緑の樹海 3階」のような階の名前（今はダンジョン1だけ）
  function floorLabel(floor) { return PLACES.dungeon1 + " " + floor + "階"; }
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
    ELEMENTS: ELEMENTS, WEAPONS: WEAPONS, ARMORS: ARMORS, STARTER_ARMORS: STARTER_ARMORS, JOBS: JOBS, JOB_ORDER: JOB_ORDER, LINES: LINES,
    SKILLS: SKILLS, SKILL: SKILL, ENEMIES: ENEMIES, STATUS: STATUS, BOSSES: BOSSES,
    baseStats: baseStats, combatStats: combatStats, inLine: inLine, weaponWait: weaponWait, PLACES: PLACES, floorLabel: floorLabel, canSet: canSet, condText: condText
  };
})();
