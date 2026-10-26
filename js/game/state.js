// ゲームの中身（段階5）：3人の仲間（名前・顔・職業・レベル・能力・熟練度・スキル）、ゴールド・素材・倉庫、進み具合、図鑑。
// 経験値と熟練度は、冒険から拠点にもどったときにまとめて入る（「拾った装備と経験値は持ち帰れる」）。
// 数字は docs/draft.md 1.1（成長の速さ）。iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var GameState = (function () {
  var STAR_NEED = 40;  // 基本職：★1つに必要な熟練度
  // 上級職・最上級職（2026-10-19 決定）。2026-10-22 に 60・80 → 75・100（地方1のうちに職が育ちきってしまうため）
  var STAR_NEED_UPPER = 75, STAR_NEED_TOP = 100;
  var OLD_STAR_NEED_UPPER = 60;   // 前のセーブの上級職の熟練度を、★がへらないように直すため
  var MAX_STAR = 7;    // 基本職の★の数（スキルの数と同じ）
  var MAX_LEVEL = 100;
  var SAVE_KEY = "brain-dungeon-save-v1";       // iPad の中の控え（こまめに書きかえる）
  var HISTORY_KEY = "brain-dungeon-history-v1"; // セーブの復元用：区切り（拠点にもどる・はじめる）ごとに最近の10回分
  var HISTORY_MAX = 10;

  var game = null;

  function newHero(name, face, job) {
    return {
      name: name, face: face, job: job, level: 1, exp: 0,
      base: { str: 10, vit: 10, mag: 10, int: 10 },
      mastery: {}, learned: [], set: [null, null, null], setB: [null, null, null], pset: [null, null],
      weaponSets: {},   // 武器の種類ごとに覚えておくスキルのセット（2026-10-22）
      setsOpen: false,  // スキルセットの切りかえ（セットB）が使えるか（上級職になれるようになったら。2026-10-22）
      equip: { weapon: null, armor: null } // null は、はじめから持っている武器・防具
    };
  }

  // 古いセーブに、あとから足した項目を入れる
  function upgrade(g) {
    game = g;   // learnSkills の中で図鑑を見るため（魔物使いのスキル）
    g.party.forEach(function (h) {
      // 職に合わない装備は倉庫へ（2026-10-26：剣闘士を重装備から軽装備にした）
      if (h.equip) ["weapon", "armor"].forEach(function (slot) {
        var it = h.equip[slot], J = GameData.JOBS[h.job];
        if (it && J && !(slot === "weapon" ? J.weapons.indexOf(it.base) >= 0 : it.base === J.armor)) { h.equip[slot] = null; g.storage.push(it); }
      });
      if (!h.equip) h.equip = { weapon: null, armor: null };
      if (!h.setB) h.setB = [null, null, null];
      if (!h.weaponSets) h.weaponSets = {};
      if (!h.setsOpen && upperOpen(h)) h.setsOpen = true;   // もう上級職になれる仲間は、はじめから使える
      // パッシブの枠（2026-10-19）：前はアクティブだったスキルがパッシブに変わったので、スキル1〜3から外してパッシブの枠へ
      fitPassiveSlots(h);
      h.learned = h.learned.filter(function (id) { return !!GameData.SKILL[id]; });
      h.set = h.set.map(function (id) {
        var sk = id && GameData.SKILL[id];
        if (!sk) return null;
        if (sk.passive) { var f = h.pset.indexOf(null); if (f >= 0 && h.pset.indexOf(id) < 0) h.pset[f] = id; return null; }
        return id;
      });
      learnSkills(h);
    });
    if (!g.items) g.items = {};
    TOOL_ORDER.forEach(function (k) { if (typeof g.items[k] !== "number") g.items[k] = 0; });
    if (typeof g.mat.gem !== "number") g.mat.gem = 0;   // 宝玉（2026-10-20）   // 新しい道具（MP回復薬など）
    if (!g.today) g.today = { date: todayStr(), adventure: null };
    if (!g.parent) g.parent = defaultParent();
    if (!g.parent.perWeekend) g.parent.perWeekend = 4;   // 土日の回数（2026-10-25 に足した）
    if (!g.log) g.log = [];
    if (!g.progress.dungeons) g.progress.dungeons = {};   // ダンジョンごとの進み具合（瘴気の森の段階1、2026-10-21）
    // 上級職の★1つに必要な熟練度を 60 → 75 にした（2026-10-22）。前のセーブは、★と次の★までの進み具合がそのままになるよう、上級職の熟練度を 75/60 倍にする（1回だけ）
    if (!g.masteryV2) {
      g.party.forEach(function (h) {
        Object.keys(h.mastery || {}).forEach(function (j) { if (GameData.tierOf(j) === 2) h.mastery[j] = Math.round(h.mastery[j] * STAR_NEED_UPPER / OLD_STAR_NEED_UPPER); });
      });
      g.masteryV2 = true;
    }
    return g;
  }

  // ---------- ダンジョンごとの進み具合（2026-10-21） ----------
  // 新緑の樹海は、前からある progress.deepest・progress.bosses をそのまま使う（今までのセーブがそのまま読めるように）。
  // ほかのダンジョンは progress.dungeons[id] に { deepest, bosses } で持つ。
  function progressOf(id, g) {
    g = g || game;
    if (!id || id === "forest1") return g.progress;
    var d = g.progress.dungeons || (g.progress.dungeons = {});
    return d[id] || (d[id] = { deepest: 0, bosses: [] });
  }
  // そのダンジョンに入れるか：needs のダンジョンの主（いちばん下の階）をたおしていれば開く
  function unlocked(id) {
    var dd = GameData.dungeonOf(id);
    if (!dd.needs) return true;
    return progressOf(dd.needs).deepest >= GameData.dungeonOf(dd.needs).floors;
  }
  // ---------- 地方（地方2の段階1、2026-10-27） ----------
  // 地方に行けるか：その地方の needs のダンジョンが開いていれば行ける
  function regionOpen(id) {
    var R = GameData.REGIONS[id];
    return !!R && (!R.needs || unlocked(R.needs));
  }
  // 今いる地方（拠点の町とワールドマップ）。行けない地方なら最初の地方
  function region() {
    var id = game && game.region;
    return id && regionOpen(id) ? id : "forestveil";
  }
  function setRegion(id) {
    if (!game || !regionOpen(id) || game.region === id) return;
    game.region = id; save();
  }
  // 今いる地方の拠点の町の名前
  function baseName() { return GameData.regionOf(region()).base; }

  // 今いちばん深く行った強さの深さ（お店の装備のレベルに使う）
  function deepestPower(g) {
    var best = 0;
    GameData.DUNGEON_ORDER.forEach(function (id) {
      var d = progressOf(id, g).deepest;
      if (d > 0) best = Math.max(best, GameData.depthOf(id, d));
    });
    return best;
  }
  // 「新緑の樹海 14階まで」のような進み具合の短い文（いちばん奥に開いたダンジョン）
  function progressText(g) {
    var text = g.progress.deepest + "階まで";
    GameData.DUNGEON_ORDER.forEach(function (id) {
      if (id !== "forest1" && g.progress.dungeons && g.progress.dungeons[id] && g.progress.dungeons[id].deepest > 0)
        text = GameData.dungeonOf(id).short + " " + g.progress.dungeons[id].deepest + "階まで";
    });
    return text;
  }

  function newGame(list) {
    game = {
      v: 1,
      party: list.map(function (h) { return newHero(h.name, h.face, h.job); }),
      gold: 0, mat: { iron: 0, stone: 0, gem: 0 }, storage: [], nextId: 1,
      items: { potion: 0, hipotion: 0, xpotion: 0, ether: 0, hiether: 0, xether: 0, revive: 0, antidote: 0, paraheal: 0, wake: 0 },
      progress: { deepest: 0, bosses: [], dungeons: {} },
      masteryV2: true,   // 上級職の熟練度は、はじめから新しい数（75）で数える
      titles: [],
      book: { monsters: {}, items: [] },
      today: { date: todayStr(), adventure: null },
      parent: defaultParent(), // 保護者画面の決まり（段階6-2）
      log: []                  // 遊んだ記録（段階6-2）
    };
    game.party.forEach(function (h) { learnSkills(h); });
    save();
    pushHistory("はじめた");
    return game;
  }

  // ---------- 成長 ----------
  // 次のレベルまでの経験値。Lv25 までは前のまま（100＋48×Lv）。そこから先は少しずつふえ、半年（180日）ごろに Lv100 になる（2026-10-22。前は100日ごろに Lv100 で止まった）
  function expNeed(level) { return 100 + 48 * level + (level > 25 ? 4 * (level - 25) * (level - 25) : 0); }
  // パッシブの枠の数：基本職は2つ（上級職3・最上級職4は、上級職を作るときに）
  function passiveSlots(h) { return GameData.tierOf(h.job) >= 2 ? 3 : 2; }
  // ★1つに必要な熟練度：基本職40・上級職60（2026-10-19 決定）
  function starNeed(job) { var t = GameData.tierOf(job); return t >= 3 ? STAR_NEED_TOP : t >= 2 ? STAR_NEED_UPPER : STAR_NEED; }
  function stars(h, job) { job = job || h.job; return Math.min(MAX_STAR, Math.floor((h.mastery[job] || 0) / starNeed(job))); }
  // パッシブの枠の数を、今の職に合わせる（上級職は3つ。基本職にもどると3つ目は外れる）
  function fitPassiveSlots(h) {
    if (!h.pset) h.pset = [];
    var n = passiveSlots(h);
    while (h.pset.length < n) h.pset.push(null);
    var off = h.pset.slice(n).filter(function (x) { return x; });
    h.pset.length = n;
    return off.map(function (id) { return GameData.SKILL[id].name; });
  }
  // その職になれるか（基本職はいつでも。上級職は、もとの職の★が足りているとき）
  function canBecome(h, job) {
    var J = GameData.JOBS[job];
    if (!J) return false;
    if (GameData.tierOf(job) === 1) return true;
    var u = GameData.UPPER_JOBS.filter(function (x) { return x.id === job; })[0];
    if (!u) return false;
    return u.need.every(function (n) { return stars(h, n[0]) >= n[1]; });
  }
  function starterWeapon(job) { return GameData.JOBS[job].weapons[0]; }
  // なれる上級職の一覧（今の職はのぞく）
  function upperList(h) { return GameData.UPPER_JOBS.filter(function (u) { return u.id !== h.job && canBecome(h, u.id); }).map(function (u) { return u.id; }); }
  // スキルセットの切りかえ（セットB）が使えるか：上級職になれるようになったら（2026-10-22 保護者の案）
  function upperOpen(h) { return GameData.tierOf(h.job) >= 2 || upperList(h).length > 0; }
  // アクティブの枠（セットA の3つと、使えるならセットB の3つ）
  function activeSlots(h) { return h.setsOpen ? h.set.concat(h.setB) : h.set.slice(); }

  // 今の職業のスキルを、★の数に合わせて上から順に覚える。覚えたスキルは、空いているスキル1〜3に自動でセットする。
  // ★k のスキルは ★(k−1) で覚える：★1 のスキルは、その職業になったときから使える（2026-10-17。Lv1 でも職業の差が出るように）。★7 は「極めた」印。
  // そのボスをたおしたことがあるか（図鑑のたおした数。魔物使いのスキル、2026-10-26）
  function beatBoss(type) {
    var b = game && game.book && game.book.monsters[type];
    return !!(b && b.kills > 0);
  }
  function learnSkills(h) {
    var got = [], st = stars(h);
    GameData.SKILLS.forEach(function (sk) {
      if (sk.job !== h.job || sk.star > st + 1 || h.learned.indexOf(sk.id) >= 0) return;
      if (sk.future || (sk.boss && !beatBoss(sk.boss))) return;   // 魔物使い：その主をたおしていないと覚えない。まだないスキルは覚えない
      h.learned.push(sk.id); got.push(sk.name);
      // 覚えたスキルは、空いている枠に自動でセットする（アクティブはセットA、空きがなければセットB。パッシブはパッシブの枠）
      if (!GameData.canSet(sk, h.job, h.equip ? heroWeaponType(h) : starterWeapon(h.job))) return;
      if (sk.passive) { var pf = h.pset ? h.pset.indexOf(null) : -1; if (pf >= 0) h.pset[pf] = sk.id; return; }
      var free = h.set.indexOf(null);
      if (free >= 0) h.set[free] = sk.id;
      else if (h.setsOpen && h.setB) { var fb = h.setB.indexOf(null); if (fb >= 0) h.setB[fb] = sk.id; }
    });
    return got;
  }

  // 冒険の結果を受け取る。r：{ exp: [3人分], mastery: [3人分], gold, mat, items, title, floor, cleared, kills: { 敵の種類: 数 } }
  // もどり値：拠点で見せる知らせ（1人ずつの行）
  function applyAdventure(r) {
    // 試しモード（保護者）：出発する前のセーブにもどす。記録にもセーブにも残らない（段階6-2）
    if (r.tryMode) {
      var back = null;
      try { back = JSON.parse(localStorage.getItem(TRY_KEY) || "null"); } catch (e) { back = null; }
      if (back) game = upgrade(back);
      try { localStorage.removeItem(TRY_KEY); } catch (e) { /* そのまま */ }
      game.today = { date: todayStr(), adventure: null };
      save();
      if (window.Sync) Sync.save("", ""); // 試しモードの前のセーブにもどったことを送る
      return [];
    }
    var report = [];
    game.party.forEach(function (h, i) {
      var lines = [];
      var lv0 = h.level;
      h.exp += Math.round(r.exp[i] || 0);
      while (h.level < MAX_LEVEL && h.exp >= expNeed(h.level)) {
        h.exp -= expNeed(h.level);
        h.level++;
        var g = GameData.JOBS[h.job].growth; // レベルが上がったときの伸びは、そのときの職業で決まる
        h.base.str += g.str; h.base.vit += g.vit; h.base.mag += g.mag; h.base.int += g.int;
      }
      if (h.level >= MAX_LEVEL) h.exp = 0;
      if (h.level > lv0) lines.push("レベルが " + lv0 + " → " + h.level + " に上がった！");
      var st0 = stars(h), up0 = upperList(h);
      h.mastery[h.job] = (h.mastery[h.job] || 0) + Math.round(r.mastery[i] || 0);
      var st1 = stars(h);
      if (st1 > st0) lines.push(GameData.JOBS[h.job].name + "の熟練度が ★" + st1 + " になった！");
      learnSkills(h).forEach(function (n) { lines.push("スキル「" + n + "」を覚えた！"); });
      // 新しく上級職になれるようになった・スキルセットの切りかえが使えるようになった（2026-10-22 保護者の希望：その場で知らせる）
      // 「＠」で始まる行は、レベルアップの画面で「（名前）は……」と出す
      upperList(h).forEach(function (j) {
        if (up0.indexOf(j) >= 0) return;
        lines.push("＠上級職「" + GameData.JOBS[j].name + "」に転職できるようになった！（転職の神殿で。上級職はパッシブの枠が3つになる）");
      });
      if (!h.setsOpen && upperOpen(h)) {
        h.setsOpen = true;
        lines.push("＠スキルセットの切りかえが使えるようになった！（宿屋でセットBにもスキルを3つセットでき、たたかいの中で切りかえられる）");
      }
      report.push({ name: h.name, lines: lines, exp: Math.round(r.exp[i] || 0) });
    });
    game.gold += r.gold || 0;
    Object.keys(r.mat || {}).forEach(function (m) { game.mat[m] = (game.mat[m] || 0) + r.mat[m]; });
    // 知恵の試練のごほうび：4問正解なら15%・3問正解なら5%で宝玉（テスト用の出発・試しモードはなし）
    if (!r.test && !sandbox) {
      var gc = (r.correct || 0) >= 4 ? Loot.GEM_CHANCE.trial4 : (r.correct || 0) === 3 ? Loot.GEM_CHANCE.trial3 : 0;
      if (gc && Math.random() < gc) { game.mat.gem = (game.mat.gem || 0) + 1; report.push({ name: "", raw: true, lines: ["知恵の試練のごほうびに、宝玉を1こ手に入れた！"], exp: 0 }); }
    }
    var lost = 0;
    (r.items || []).forEach(function (it) {
      if (game.storage.length >= STORAGE_MAX) { lost++; return; } // 倉庫がいっぱい（200）なら持ち帰れない
      it.id = game.nextId++;
      game.storage.push(it);
      if (game.book.items.indexOf(it.base) < 0) game.book.items.push(it.base);
    });
    Object.keys(r.kills || {}).forEach(function (t) {
      var b = game.book.monsters[t] || (game.book.monsters[t] = { kills: 0 });
      b.kills += r.kills[t];
    });
    // 主をはじめてたおすと、魔物使いがその主を呼ぶスキルを覚える（2026-10-26）
    game.party.forEach(function (h, i) {
      learnSkills(h).forEach(function (n) { report[i].lines.push("スキル「" + n + "」を覚えた！"); });
    });
    if (r.title && game.titles.indexOf(r.title) < 0) game.titles.push(r.title);
    var open0 = GameData.DUNGEON_ORDER.filter(function (id) { return unlocked(id); }), shop0 = shopTier();
    if (r.cleared) {
      var pg = progressOf(r.dungeon);
      pg.deepest = Math.max(pg.deepest, r.floor);
      if (r.boss && pg.bosses.indexOf(r.floor) < 0) pg.bosses.push(r.floor);
    }
    if (lost) report.push({ name: "倉庫", lines: ["倉庫がいっぱいで、装備を " + lost + "個 持ち帰れなかった"], exp: 0 });
    // 新しいダンジョンが開いた・お店に新しい段の装備がならんだ（2026-10-22 保護者の希望：主をたおした結果の画面で知らせる）
    if (r.cleared && !r.tryMode) {
      GameData.DUNGEON_ORDER.forEach(function (id) {
        if (open0.indexOf(id) >= 0 || !unlocked(id)) return;
        // 新しい地方の最初のダンジョンなら、地方への道が開けたことを知らせる（2026-10-27）
        var R = GameData.regionOf(GameData.dungeonOf(id).region);
        if (R.needs === id) {
          report.push({ name: "", raw: true, lines: ["新しい地方「" + R.name + "」への道が開けた！（ワールドマップの北の山道から行ける）"], exp: 0 });
          return;
        }
        report.push({ name: "", raw: true, lines: [GameData.dungeonOf(id).name + "への道が開けた！（ワールドマップで選べる）"], exp: 0 });
      });
      var st = shopTier();
      if (st > shop0) {
        var newTools = TOOL_ORDER.filter(function (k) { return (TOOLS[k].tier || 0) > shop0 && (TOOLS[k].tier || 0) <= st; }).map(function (k) { return TOOLS[k].name; });
        report.push({ name: "", raw: true, lines: ["お店で" + GameData.TIER_LABEL[st] + "の装備" + (newTools.length ? "と" + newTools.join("・") : "") + "が買えるようになった！"], exp: 0 });
      }
    }
    game.today = { date: todayStr(), adventure: null };
    // 出発できるのは1日2回（テスト用の出発は数えない）
    if (!r.test) {
      game.adventureCount = { date: todayStr(), n: adventuresToday() + 1 }; game.lastAdventure = todayStr();
      // 遊んだ記録（保護者画面で見る）。最近の100回分
      game.log.unshift({ date: todayStr(), at: new Date().toISOString(), dungeon: r.dungeon || "forest1", floor: r.floor, kind: r.kind, cleared: !!r.cleared,
                         correct: r.correct || 0, subjects: r.subjects || [], skipped: !!r.skipped });
      if (game.log.length > LOG_MAX) game.log.length = LOG_MAX;
    }
    save();
    var dn = GameData.dungeonOf(r.dungeon);
    pushHistory(r.cleared ? dn.short + "の" + r.floor + "階をクリア" : dn.short + "の" + r.floor + "階から帰った");
    // 冒険の記録（GAS）：ダンジョンの名前は、前からある「メモ」の列に入れる（GAS の形は変えない）
    if (!r.test && window.Sync) Sync.log({ date: todayStr(), kind: r.kind, floor: r.floor, correct: r.correct || 0, subjects: r.subjects || [], note: dn.name + (r.skipped ? "（試練なし：問題を読みこめず）" : "") });
    return report;
  }

  // ---------- 装備（段階5-2） ----------
  var STORAGE_MAX = 200;
  var TOOLS = {
    // 回復薬（2026-10-22 保護者と決定）：前は HP・MP の40%を回復して30G・40Gだったが、レベルが上がるほどお得になり、ゴールドがあまったので、
    // 回復する量を数で決め、強い薬ほど高くした（強い薬ほど、1回復あたりの値段も上がる）。tier：お店に並ぶ段（装備と同じ。1＝瘴気の森が開いたら、2＝原生の秘境が開いたら）
    potion:   { name: "回復薬", price: 60, hp: 60, tier: 0, note: "HP を 60 回復" },
    hipotion: { name: "上回復薬", price: 300, hp: 150, tier: 1, note: "HP を 150 回復" },
    xpotion:  { name: "特上回復薬", price: 1000, hp: 350, tier: 2, note: "HP を 350 回復" },
    ether:    { name: "MP回復薬", price: 80, mp: 20, tier: 0, note: "MP を 20 回復" },   // MP は自然に回復しない（2026-10-18 決定）
    hiether:  { name: "上MP回復薬", price: 400, mp: 50, tier: 1, note: "MP を 50 回復" },
    xether:   { name: "特上MP回復薬", price: 1200, mp: 100, tier: 2, note: "MP を 100 回復" },
    revive:   { name: "復活薬", price: 1000, note: "たおれた仲間を HP30% で復活" },   // 2026-10-18 に 150G から変更
    antidote: { name: "毒消し", price: 20, note: "毒を治す", cures: "poison" },
    paraheal: { name: "しびれ治し", price: 20, note: "しびれを治す", cures: "para" },
    wake:     { name: "目覚まし", price: 20, note: "眠りを治す", cures: "sleep" }
  };
  var TOOL_ORDER = ["potion", "hipotion", "xpotion", "ether", "hiether", "xether", "revive", "antidote", "paraheal", "wake"];
  // お店に並ぶ道具：強い回復薬は、ダンジョンが開くと並ぶ
  function shopTools() { var t = shopTier(); return TOOL_ORDER.filter(function (k) { return (TOOLS[k].tier || 0) <= t; }); }
  var TOOL_MAX = 99;

  // 装備できるか：武器は職業の武器の種類、防具は職業の防具の種類
  function canEquip(h, item) {
    var J = GameData.JOBS[h.job];
    return item.slot === "weapon" ? J.weapons.indexOf(item.base) >= 0 : item.base === J.armor;
  }
  function plusMult(item) { return 1 + Loot.PLUS_STEP * (item.plus || 0); } // 強化 ＋1 ごとに基本の強さ＋6%（2026-10-18 決定）

  // 能力に入れる武器・防具（はじめの装備か、装備している物）
  function weaponOf(h) {
    var it = h.equip.weapon;
    if (!it) return GameData.WEAPONS[starterWeapon(h.job)];
    var w = GameData.WEAPONS[it.base], k = plusMult(it);
    return { patk: Math.round(it.patk * k), matk: Math.round(it.matk * k), base: w };
  }
  function armorOf(h) {
    var it = h.equip.armor;
    if (!it) return GameData.STARTER_ARMORS[GameData.JOBS[h.job].armor];
    var k = plusMult(it);
    return { pdef: Math.round(it.pdef * k), mdef: Math.round(it.mdef * k) };
  }
  // 戦うときの能力（武器・防具・バフ・デバフをふくむ）
  function heroStats(h) {
    var s = GameData.combatStats(h.base, weaponOf(h), armorOf(h), h.level);
    [h.equip.weapon, h.equip.armor].forEach(function (it) {
      if (!it) return;
      it.buff.forEach(function (b) { s[b[0]] += b[1]; });
      it.debuff.forEach(function (d) { s[d[0]] = Math.max(0, s[d[0]] - d[1]); });
    });
    // パッシブスキル（2026-10-19）
    var p = passiveFx(h);
    ["hp", "mp", "patk", "pdef", "matk", "mdef"].forEach(function (k) { if (p[k]) s[k] = Math.round(s[k] * (1 + p[k])); });
    s.crit += p.crit || 0;
    s.waitMul = 1 - (p.wait || 0);     // ふつうの攻撃の待ち時間
    s.rangeMul = 1 + (p.range || 0);   // 矢と魔法の玉のとどく距離
    s.healMul = 1 + (p.heal || 0);     // 回復のスキルの量
    s.roomHp = p.roomHp || 0; s.roomMp = p.roomMp || 0; // 部屋の敵を全部たおしたときの回復
    // 上級職のパッシブ（2026-10-19）：受けるダメージ・会心のダメージ・止まっているときの物攻・MP・仲間の状態異常よけ
    s.cut = p.cut || 0; s.critDmg = p.critDmg || 0; s.still = p.still || 0; s.mpcut = p.mpcut || 0; s.aura = p.aura || 0;
    // 組み合わせの上級職のパッシブ（2026-10-20）：魔力吸収・影分身・疾走・背水・闘志・オートヒール・聖なる盾（HPが少ないとき）・オートチャージ・賢者の知恵
    s.mpOnHit = p.mpOnHit || 0; s.double = p.double || 0; s.speedMul = 1 + (p.speed || 0); s.backwater = p.backwater || 0; s.fervor = p.fervor || 0;
    s.autoHeal = p.autoHeal || 0; s.cutLow = p.cutLow || 0; s.autoMp = p.autoMp || 0; s.ctcut = p.ctcut || 0;
    s.castcut = p.castcut || 0;   // 魔物使い「すばやい構え」：スキルの構え・ための時間が短い（2026-10-26）
    s.hp = Math.max(1, s.hp); s.mp = Math.max(0, s.mp);
    return s;
  }
  // セットしているパッシブの効き目を合わせる
  function passiveFx(h) {
    var p = {};
    (h.pset || []).forEach(function (id) {
      var sk = id && GameData.SKILL[id];
      if (!sk || !sk.passive || !GameData.canSet(sk, h.job, heroWeaponType(h))) return;
      Object.keys(sk.passive).forEach(function (k) { p[k] = (p[k] || 0) + sk.passive[k]; });
    });
    return p;
  }
  function heroWeaponType(h) { return h.equip.weapon ? h.equip.weapon.base : starterWeapon(h.job); }

  // ---------- 装備や職業を変えたときのスキル（2026-10-22 保護者の希望） ----------
  // 武器の種類が変わるときは、前の武器のスキルのセットを覚えておき、新しい武器で前にセットしていたものがあれば、それにもどす。
  // そのあと、条件に合わないスキルを外し、空いた枠には、いまセットできるスキルを自動で入れる（スキルがないまま冒険に出ないように）。
  // もどり値：{ removed：外れた名前, added：入った名前 }
  function beforeGear(h) {
    var wt = heroWeaponType(h);
    h.weaponSets[wt] = { set: h.set.slice(), setB: h.setB.slice() };
    return { wt: wt, before: activeSlots(h).concat(h.pset) };
  }
  function afterGear(h, b) {
    var wt = heroWeaponType(h);
    if (wt !== b.wt && h.weaponSets[wt]) {
      var m = h.weaponSets[wt];
      h.set = m.set.slice(); h.setB = (m.setB || [null, null, null]).slice();
      // 覚えていないスキル（念のため）は入れない
      h.set = h.set.map(function (id) { return id && h.learned.indexOf(id) >= 0 ? id : null; });
      h.setB = h.setB.map(function (id) { return id && h.learned.indexOf(id) >= 0 ? id : null; });
    }
    fixSkills(h);
    autoFill(h);
    var after = activeSlots(h).concat(h.pset);
    function names(list) { return list.filter(function (x) { return x; }).map(function (id) { return GameData.SKILL[id].name; }); }
    return {
      removed: names(b.before.filter(function (id) { return id && after.indexOf(id) < 0; })),
      added: names(after.filter(function (id) { return id && b.before.indexOf(id) < 0; }))
    };
  }
  // 空いている枠に、いまセットできるスキルを入れる。今の職のスキル → 上の段の職のスキル → ★の大きいスキルの順
  function autoFill(h) {
    var wt = heroWeaponType(h), used = activeSlots(h).concat(h.pset);
    function rank(sk) { return (sk.job === h.job ? 1000 : 0) + GameData.tierOf(sk.job) * 100 + sk.star; }
    var cand = h.learned.map(function (id) { return GameData.SKILL[id]; })
      .filter(function (sk) { return sk && used.indexOf(sk.id) < 0 && GameData.canSet(sk, h.job, wt); })
      .sort(function (a, b) { return rank(b) - rank(a); });
    function fill(slots, passive) {
      for (var i = 0; i < slots.length; i++) {
        if (slots[i]) continue;
        for (var k = 0; k < cand.length; k++) if (!!cand[k].passive === passive) { slots[i] = cand[k].id; cand.splice(k, 1); break; }
      }
    }
    fill(h.set, false);
    if (h.setsOpen) fill(h.setB, false);
    fill(h.pset, true);
  }

  // 倉庫の物を装備する（前の装備は倉庫へ）。もどり値：{ removed, added }（スキルの変わり方）か false
  function equipItem(h, id) {
    var i = indexOf(id); if (i < 0) return false;
    var it = game.storage[i];
    if (!canEquip(h, it)) return false;
    var b = beforeGear(h);
    game.storage.splice(i, 1);
    var old = h.equip[it.slot];
    h.equip[it.slot] = it;
    if (old) game.storage.push(old);
    var r = afterGear(h, b);
    save();
    return r;
  }
  // 外して倉庫へ（はじめの装備にもどる）。もどり値：{ removed, added } か false
  function unequip(h, slot) {
    var it = h.equip[slot]; if (!it) return false;
    if (game.storage.length >= STORAGE_MAX) return false;
    var b = beforeGear(h);
    h.equip[slot] = null; game.storage.push(it);
    var r = afterGear(h, b);
    save();
    return r;
  }
  // 職業や武器を変えて、条件に合わなくなったスキルを外す。外した名前を返す
  function fixSkills(h) {
    var removed = [];
    function act(id) {
      if (id && !GameData.canSet(GameData.SKILL[id], h.job, heroWeaponType(h))) { removed.push(GameData.SKILL[id].name); return null; }
      return id;
    }
    h.set = h.set.map(act);
    h.setB = (h.setB || [null, null, null]).map(act);
    h.pset = (h.pset || []).map(function (id) {
      if (id && !GameData.canSet(GameData.SKILL[id], h.job, heroWeaponType(h))) { removed.push(GameData.SKILL[id].name); return null; }
      return id;
    });
    return removed;
  }
  function indexOf(id) { for (var i = 0; i < game.storage.length; i++) if (game.storage[i].id === id) return i; return -1; }

  // 値段：ノーマルは 100＋20×ilv（draft 4）。レア度が高いほど高い（仮：×1・×2・×4・×8）。強化 ＋1 ごとに 10% 高い
  // 鉄の段は、もとの強さと同じく1.6倍（2026-10-22）
  function itemValue(it) { return Math.round((100 + 20 * it.ilv) * [1, 2, 4, 8][it.r] * (1 + 0.1 * (it.plus || 0)) * Loot.TIER_MULT[it.tier || 0]); }
  function sellPrice(it) { return Math.round(itemValue(it) * 0.25); } // 売る：値段の 25%
  // 素材：杖と魔法装備は魔石、それ以外は鉱石
  function matOf(it) { return it.base === "staff" || it.base === "magic" ? "stone" : "iron"; }
  function dismantleCount(it) { return [0, 1, 1, 1][it.r]; }   // 売却したときの素材：ふつう0、R以上1（2026-10-18 に 1〜3 から変更）
  // 手放す（売ると分解を1つに。2026-10-18 決定）：ゴールド（値段の25%）と素材（1〜3）に加えて、強化に使ったゴールドと素材の8割がもどる
  function spentOn(it) {
    var gold = 0, n = 0;
    for (var p = 0; p < (it.plus || 0); p++) { var c = upgradeCostAt(it, p); gold += c.gold; n += c.n; }
    return { gold: gold, n: n };
  }
  function releaseValue(it) {
    var s = spentOn(it);
    return { gold: sellPrice(it) + Math.floor(s.gold * 0.8), mat: matOf(it), n: dismantleCount(it) + Math.floor(s.n * 0.8) };
  }
  function release(id) {
    var i = indexOf(id); if (i < 0) return null;
    var v = releaseValue(game.storage[i]);
    game.storage.splice(i, 1); game.gold += v.gold; game.mat[v.mat] += v.n; save();
    return v;
  }

  // お店：ふつうの装備（ノーマル。バフ・デバフなし）。ilv は今いちばん深く行った階層まで（draft 4）
  function shopEquipList() {
    var ilv = Math.max(1, deepestPower(game));
    var list = [];
    // 瘴気の森が開いたら、お店の装備は鉄になる（2026-10-22 保護者の希望）
    var tier = shopTier();
    Object.keys(GameData.WEAPONS).forEach(function (b) { list.push(shopItem("weapon", b, ilv, tier)); });
    Object.keys(GameData.ARMORS).forEach(function (b) { list.push(shopItem("armor", b, ilv, tier)); });
    return list;
  }
  function shopTier() {
    var t = 0;
    GameData.DUNGEON_ORDER.forEach(function (id) { if (unlocked(id)) t = Math.max(t, GameData.dungeonOf(id).tier || 0); });
    return t;
  }
  function shopItem(slot, base, ilv, tier) {
    tier = tier || 0;
    var def = slot === "weapon" ? GameData.WEAPONS[base] : GameData.ARMORS[base], k = (1 + Loot.ILV_STEP * (ilv - 1)) * Loot.TIER_MULT[tier];
    var it = { slot: slot, base: base, r: 0, ilv: ilv, tier: tier, plus: 0, buff: [], debuff: [], sp: null, name: def.item || def.name };
    if (slot === "weapon") { it.patk = Math.round(def.patk * k); it.matk = Math.round(def.matk * k); }
    else { it.pdef = Math.round(def.pdef * k); it.mdef = Math.round(def.mdef * k); }
    return it;
  }
  function buyEquip(it) {
    var price = itemValue(it);
    if (game.gold < price || game.storage.length >= STORAGE_MAX) return false;
    game.gold -= price;
    var copy = JSON.parse(JSON.stringify(it)); copy.id = game.nextId++;
    game.storage.push(copy);
    if (game.book.items.indexOf(copy.base) < 0) game.book.items.push(copy.base);
    save(); return true;
  }
  function buyTool(key, n) {
    var t = TOOLS[key], cost = t.price * n;
    if (game.gold < cost || game.items[key] + n > TOOL_MAX) return false;
    game.gold -= cost; game.items[key] += n; save(); return true;
  }
  function useTool(key) { if (game.items[key] <= 0) return false; game.items[key]--; save(); return true; }

  // 鍛冶屋：強化 ＋1〜＋10。必ず成功。ゴールドは少なめ（＋n に 10×n G）で、素材が中心（2026-10-18 決定）
  // 素材は＋が上がるほど1.4倍ずつ増える（案A）：2・3・4・5・8・11・15・21・30・41（＋10まで合計140）。鉄は2倍、鋼は3倍
  // （1つだけ＋10にするより、ほかの仲間の装備も上げたくなるように）
  function upgradeMatCount(plus) { return Math.max(1, Math.round(2 * Math.pow(1.4, plus))); }
  function upgradeCostAt(it, plus) { var n = plus + 1; return { mat: matOf(it), n: upgradeMatCount(plus) * ((it.tier || 0) + 1), gold: 10 * n }; }
  function upgradeCost(it) { return upgradeCostAt(it, it.plus || 0); }
  function upgradeItem(it) {
    if ((it.plus || 0) >= Loot.PLUS_MAX) return false;
    var c = upgradeCost(it);
    if (game.gold < c.gold || game.mat[c.mat] < c.n) return false;
    game.gold -= c.gold; game.mat[c.mat] -= c.n; it.plus = (it.plus || 0) + 1; save(); return true;
  }
  // 引き直し：魔石2＋100G で、バフ・デバフを全部引き直す（数はレア度の決まりのまま）
  var REROLL = { stone: 2, gold: 100 };
  // レア度を上げる（鍛冶屋。2026-10-20）：ノーマル→R 宝玉1＋200G、R→SR 宝玉2＋500G、SR→UR 宝玉4＋1000G
  // 2026-10-22：宝玉の数を 1・2・4（合わせて7こ）から 1・1・2（合わせて4こ）に下げた（ゴールドはそのまま）
  var RARITY_UP = [{ gem: 1, gold: 200 }, { gem: 1, gold: 500 }, { gem: 2, gold: 1000 }];
  function rarityUpCost(it) { return it.r >= 3 ? null : RARITY_UP[it.r]; }
  function rarityUp(it) {
    var c = rarityUpCost(it);
    if (!c || game.gold < c.gold || (game.mat.gem || 0) < c.gem) return false;
    game.gold -= c.gold; game.mat.gem -= c.gem;
    Loot.raiseRarity(it);
    save(); return true;
  }
  function rerollItem(it) {
    if (game.gold < REROLL.gold || game.mat.stone < REROLL.stone) return false;
    game.gold -= REROLL.gold; game.mat.stone -= REROLL.stone;
    var fresh = Loot.rerollMods(it.r, it.ilv);
    it.buff = fresh.buff; it.debuff = fresh.debuff;
    save(); return true;
  }
  // 強化の引きつぎ（2026-10-18 決定）：同じ種類（剣なら剣、弓なら弓）・同じ段の装備へ、＋をそのまま移す。もとの装備はなくなる。手数料は 10G×(＋の数)
  // （前は同じ部位ならよかったが、弓から杖へ移せてしまったので、同じ種類だけにした）
  function transferCost(it) { return 10 * (it.plus || 0); }
  function transferTargets(it) {
    return allItems().filter(function (x) {
      return x.item !== it && x.item.slot === it.slot && x.item.base === it.base && (x.item.tier || 0) === (it.tier || 0) && (x.item.plus || 0) < (it.plus || 0);
    });
  }
  function ownerOf(it) {
    for (var i = 0; i < game.party.length; i++) { var h = game.party[i]; if (h.equip[it.slot] === it) return h; }
    return null;
  }
  // もどり値：null（できない）か { equipped: 新しい装備をつけた仲間（なければ null） }
  function transferPlus(from, to) {
    var cost = transferCost(from);
    if (!(from.plus > 0) || game.gold < cost) return null;
    var h = ownerOf(from), equipped = null;
    game.gold -= cost;
    to.plus = from.plus;
    if (h) {
      h.equip[from.slot] = null;
      // もとの装備をつけていた仲間が、新しい装備をつけられるなら、そのままつける
      var j = indexOf(to.id);
      if (j >= 0 && canEquip(h, to)) { game.storage.splice(j, 1); h.equip[to.slot] = to; equipped = h; }
      fixSkills(h);
    } else {
      var i = indexOf(from.id); if (i >= 0) game.storage.splice(i, 1);
    }
    save();
    return { equipped: equipped };
  }
  // 冒険の中で道具を拾う（持てる数をこえたら拾えない）
  function gainTool(key) {
    if (!TOOLS[key] || game.items[key] >= TOOL_MAX) return false;
    game.items[key]++; save(); return true;
  }

  // 倉庫と、3人が装備している物を全部（鍛冶屋で使う）
  function allItems() {
    var out = game.storage.map(function (it) { return { item: it, who: null }; });
    game.party.forEach(function (h) { ["weapon", "armor"].forEach(function (s) { if (h.equip[s]) out.push({ item: h.equip[s], who: h }); }); });
    return out;
  }

  // ---------- 転職とスキルのセット（段階5-2②） ----------
  // 基本職どうしは、いつでも転職できる（上級職は段階8）。熟練度は職業ごとに残る。
  // 新しい職業で装備できない武器・防具は倉庫へ。条件に合わなくなったスキルは外す。新しい職業の1つ目のスキルはすぐ覚える。
  function changeJob(h, job) {
    if (h.job === job) return { ok: false, why: "いまの職業と同じ" };
    if (!canBecome(h, job)) return { ok: false, why: "まだその職業にはなれない" };
    var J = GameData.JOBS[job], back = [];
    ["weapon", "armor"].forEach(function (slot) {
      var it = h.equip[slot];
      if (it && !(slot === "weapon" ? J.weapons.indexOf(it.base) >= 0 : it.base === J.armor)) back.push(slot);
    });
    if (game.storage.length + back.length > STORAGE_MAX) return { ok: false, why: "倉庫がいっぱいで、装備をしまえない" };
    var b = beforeGear(h);
    var moved = back.map(function (slot) { var it = h.equip[slot]; h.equip[slot] = null; game.storage.push(it); return Loot.label(it); });
    h.job = job;
    var off = fitPassiveSlots(h);
    var learned = learnSkills(h);
    if (!h.setsOpen && upperOpen(h)) h.setsOpen = true;
    var r = afterGear(h, b);
    save();
    return { ok: true, moved: moved, removed: off.concat(r.removed.filter(function (n) { return off.indexOf(n) < 0; })), added: r.added.filter(function (n) { return learned.indexOf(n) < 0; }), learned: learned };
  }
  // スキル i 番目をセットする（id が null なら外す）。i は 0〜2 がセットA、3〜5 がセットB（使えるときだけ）。
  // 条件に合わない・同じスキルを2つ（セットA と B をまたいでも）は、できない
  function setSkill(h, i, id) {
    if (i >= 3 && !h.setsOpen) return false;
    if (id) {
      var sk = GameData.SKILL[id];
      if (!sk || sk.passive || h.learned.indexOf(id) < 0 || !GameData.canSet(sk, h.job, heroWeaponType(h))) return false;
      h.set = h.set.map(function (x, k) { return k !== i && x === id ? null : x; });
      h.setB = h.setB.map(function (x, k) { return k + 3 !== i && x === id ? null : x; });
    }
    if (i >= 3) h.setB[i - 3] = id || null; else h.set[i] = id || null;
    save();
    return true;
  }
  // パッシブの枠 i 番目をセットする（id が null なら外す）。ほかの職で覚えたパッシブもつけられる
  function setPassive(h, i, id) {
    if (i < 0 || i >= passiveSlots(h)) return false;
    if (id) {
      var sk = GameData.SKILL[id];
      if (!sk || !sk.passive || h.learned.indexOf(id) < 0 || !GameData.canSet(sk, h.job, heroWeaponType(h))) return false;
      h.pset = h.pset.map(function (x, k) { return k !== i && x === id ? null : x; });
    }
    h.pset[i] = id || null;
    save();
    return true;
  }

  // ---------- おすすめ（2026-10-26 保護者の案） ----------
  // 装備：倉庫と装備中の物から、選んでいる1人の武器と防具を選ぶ。装備したあとの数字（おまけの効果もふくむ）で、
  //   物攻 → 物防 → 魔攻 → 魔防 の順にくらべる。魔法の職（魔術師・僧侶・黒魔道士・白魔道士・賢者）は 魔攻 → 魔防 → 物攻 → 物防。
  //   武器の種類が変わったときのスキルは、いまのしくみ（前の武器のセットにもどす）のまま。
  // アクティブ：攻撃スキルは威力（倍率×当たる回数）の大きい順。回復と強化は1枠ずつ、効き目の大きいものを入れる。
  //   同じなら、上の段の職 → ★の大きいもの。セットBが使えるときは6枠ぜんぶ。
  //   セットA：攻撃1・攻撃2・回復　セットB：攻撃3・攻撃4・強化（セットBがないとき：攻撃1・回復・強化）
  // パッシブ：上の段の職 → ★の大きいものの順。
  var MAGIC_JOBS = ["mage", "priest", "blackmage", "whitemage", "sage", "tamer"];
  function statOrder(h) { return MAGIC_JOBS.indexOf(h.job) >= 0 ? ["matk", "mdef", "patk", "pdef"] : ["patk", "pdef", "matk", "mdef"]; }
  function better(a, b, order) { // a が b より上なら 正
    for (var i = 0; i < order.length; i++) if (a[order[i]] !== b[order[i]]) return a[order[i]] - b[order[i]];
    return 0;
  }
  function statsWith(h, weapon, armor) {
    var sw = h.equip.weapon, sa = h.equip.armor;
    h.equip.weapon = weapon; h.equip.armor = armor;
    var s = heroStats(h);
    h.equip.weapon = sw; h.equip.armor = sa;
    return s;
  }
  // もどり値：{ weapon, armor }（おすすめの物。null ははじめの装備）
  function recommendEquip(h) {
    var order = statOrder(h);
    function pick(slot, other) {
      var cur = h.equip[slot];
      var list = [cur].concat(game.storage.filter(function (x) { return x.slot === slot && canEquip(h, x); }));
      var best = cur, bestS = null;
      list.forEach(function (it) {
        var s = slot === "weapon" ? statsWith(h, it, other) : statsWith(h, other, it);
        if (!bestS || better(s, bestS, order) > 0) { best = it; bestS = s; }
      });
      return best;
    }
    var w = pick("weapon", h.equip.armor);
    var a = pick("armor", w);
    return { weapon: w, armor: a };
  }
  // おすすめの装備にしたときのようす（何も変えない）：{ changed, before, after（能力）, skills：{ removed, added } }
  function previewEquip(h, rec) {
    var snap = JSON.stringify({ set: h.set, setB: h.setB, pset: h.pset, ws: h.weaponSets });
    var sw = h.equip.weapon, sa = h.equip.armor, before = heroStats(h);
    var b = beforeGear(h);
    h.equip.weapon = rec.weapon; h.equip.armor = rec.armor;
    var r = afterGear(h, b), after = heroStats(h);
    h.equip.weapon = sw; h.equip.armor = sa;
    var o = JSON.parse(snap); h.set = o.set; h.setB = o.setB; h.pset = o.pset; h.weaponSets = o.ws;
    return { changed: rec.weapon !== sw || rec.armor !== sa, before: before, after: after, skills: r };
  }
  // おすすめの装備にする（倉庫から付けかえる）。もどり値：{ removed, added }
  function applyEquip(h, rec) {
    var out = { removed: [], added: [] };
    function add(r) {
      if (!r) return;
      r.removed.forEach(function (n) { var k = out.added.indexOf(n); if (k >= 0) out.added.splice(k, 1); else if (out.removed.indexOf(n) < 0) out.removed.push(n); });
      r.added.forEach(function (n) { var k = out.removed.indexOf(n); if (k >= 0) out.removed.splice(k, 1); else if (out.added.indexOf(n) < 0) out.added.push(n); });
    }
    if (rec.weapon && rec.weapon !== h.equip.weapon) add(equipItem(h, rec.weapon.id));
    if (rec.armor && rec.armor !== h.equip.armor) add(equipItem(h, rec.armor.id));
    return out;
  }

  // スキルの中の効き目をぜんぶ集める（連続の攻撃の中の1つずつもふくむ）
  function fxList(sk) {
    var out = [];
    function walk(list, times) {
      list.forEach(function (f) {
        var n = times * (f.t === "rapid" && !f.hits ? (f.count || 1) : 1);
        out.push({ f: f, n: n });
        if (f.hit) walk([f.hit], n);
        if (f.hits) walk(f.hits, times);
      });
    }
    walk(sk.fx || [], 1);
    return out;
  }
  // 攻撃の威力：倍率 × 当たる回数（矢や玉の数、雨の数、ゾーンは続くあいだに当たる回数）
  function skillPower(sk) {
    var p = 0;
    fxList(sk).forEach(function (x) {
      var f = x.f; if (!f.mult) return;
      var n = x.n;
      if (f.t === "shot" || f.t === "rain") n *= f.count || 1;
      if (f.t === "zone") n *= Math.max(1, Math.round((f.dur || 1) / (f.tick || 1)));
      if (f.orbs) n *= f.orbs;    // 何回も当たるもの（呼んだダークエルフの闇の玉6つ。2026-10-26：おすすめで選ばれなかったため）
      p += f.mult * n;
    });
    return p;
  }
  // 回復の効き目：HP・MP の回復の割合（仲間みんななら3倍）。治す・生き返らせるも少し足す
  function healPower(sk) {
    var p = 0;
    fxList(sk).forEach(function (x) {
      var f = x.f, k = f.party ? 3 : 1;
      if (f.t === "heal" || f.t === "regen" || f.t === "mpheal") p += (f.pct || 0) * k;
      else if (f.t === "revive") p += f.pct || 0;
      else if (f.t === "cure") p += 0.05 * k;
    });
    return p;
  }
  // 強化の効き目：上がる割合（仲間みんななら3倍）。下がるほうは数えない。待ち時間は短くなるのが強化
  function buffPower(sk) {
    var p = 0;
    fxList(sk).forEach(function (x) {
      var f = x.f; if (f.t !== "buff") return;
      var v = f.stat === "wait" ? -f.pct : f.pct;
      if (v > 0) p += v * (f.party ? 3 : 1);
    });
    return p;
  }
  function skillRank(sk) { return GameData.tierOf(sk.job) * 100 + sk.star; }
  // もどり値：おすすめの枠（アクティブは activeSlots と同じ並び、パッシブは pset と同じ長さ）
  function recommendSkills(h, passive) {
    var wt = heroWeaponType(h);
    var cand = h.learned.map(function (id) { return GameData.SKILL[id]; })
      .filter(function (sk) { return sk && !!sk.passive === passive && GameData.canSet(sk, h.job, wt); });
    function byRank(a, b) { return skillRank(b) - skillRank(a); }
    if (passive) {
      cand.sort(byRank);
      return h.pset.map(function (x, i) { return cand[i] ? cand[i].id : null; });
    }
    function sorted(fn) {
      return cand.filter(function (sk) { return fn(sk) > 0; }).sort(function (a, b) { return fn(b) - fn(a) || byRank(a, b); });
    }
    var used = [];
    function take(list) { for (var i = 0; i < list.length; i++) if (used.indexOf(list[i].id) < 0) { used.push(list[i].id); return list[i].id; } return null; }
    var atk = sorted(skillPower);
    // 回復・強化は、攻撃でないものから選ぶ（攻撃しながら少し回復するものは攻撃に入れる）
    var heal = sorted(function (sk) { return skillPower(sk) > 0 ? 0 : healPower(sk); });
    var buff = sorted(function (sk) { return skillPower(sk) > 0 ? 0 : buffPower(sk); });
    var plan = h.setsOpen ? ["atk", "atk", "heal", "atk", "atk", "buff"] : ["atk", "heal", "buff"];
    var slots = plan.map(function (kind) { return take(kind === "atk" ? atk : kind === "heal" ? heal : buff); });
    // 空いた枠：残りの攻撃 → 回復 → 強化 → ほかのスキル（上の段の職・★の大きい順）
    var rest = atk.concat(heal, buff, cand.slice().sort(byRank));
    slots = slots.map(function (id) { return id || take(rest); });
    return slots;
  }
  // おすすめのスキルにする
  function applySkills(h, passive, slots) {
    if (passive) h.pset = slots.slice();
    else { h.set = slots.slice(0, 3); if (h.setsOpen) h.setB = slots.slice(3, 6); }
    save();
  }

  // ---------- 図鑑（段階5-2②） ----------
  function monster(type) {
    var b = game.book.monsters[type] || (game.book.monsters[type] = { kills: 0 });
    if (!b.tried) b.tried = {};
    return b;
  }
  // 訓練場の像（training）は図鑑に入れない
  function training(type) { var d = GameData.ENEMIES[type]; return !!(d && (d.training || d.notInBook)); }   // 訓練場の像・モンスターの巣は図鑑に入れない
  function noteSeen(type) { if (game && !training(type)) { monster(type).seen = true; } }
  // 攻撃した属性の効き方を覚える：weak（弱点）・normal・half（いまひとつ）・none（無効）
  function noteHit(type, elem, mult) {
    if (!game || !elem || training(type)) return;
    monster(type).tried[elem] = mult === 0 ? "none" : mult < 1 ? "half" : mult > 1 ? "weak" : "normal";
  }

  // テスト用：3人のレベルをまとめて変える（能力は今の職業で育ったものとして作りなおす）
  function setLevelForTest(level) {
    game.party.forEach(function (h) {
      h.level = level; h.exp = 0;
      h.base = GameData.baseStats(h.job, level);
    });
    save();
  }

  // ---------- 冒険の途中（段階5-3） ----------
  // 今日の日付（端末の時計。iPad の日本時間）
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  // ダンジョンの中の様子を控える（state："playing" 遊んでいる／"finished" 終わったが、まだ拠点にもどっていない）
  function setAdventure(a) {
    if (!game) return;
    game.today = { date: game.today && game.today.adventure && game.today.adventure.state === "playing" ? game.today.date : todayStr(), adventure: a };
    save();
  }
  function adventure() { return game && game.today ? game.today.adventure : null; }
  function adventureDate() { return game && game.today ? game.today.date : null; }

  // ---------- 保護者画面の決まり（段階6-2） ----------
  // minutes：冒険の時間（分）、perDay：1日に出発できる回数、restWeek：休みの曜日（0＝日〜6＝土）、restDates：休みの日（"2026-10-20" の形）
  var LOG_MAX = 100;
  var TRY_KEY = "bd-try-backup"; // 試しモードで出発する前のセーブ
  // 全開放の試し（2026-10-20 保護者の希望）：本当のセーブを iPad の中にしまってから、職業とスキルを全部開放する。
  // そのあいだは、セーブも記録も GAS に送らない（save・pushHistory・Sync を止める）。「試しを終える」か、開きなおすと、しまったセーブにもどる
  var SANDBOX_KEY = "bd-sandbox-backup", sandbox = false;
  function inSandbox() { return sandbox; }
  function beginSandbox() {
    if (sandbox || !game) return false;
    try { localStorage.setItem(SANDBOX_KEY, JSON.stringify(game)); } catch (e) { return false; }
    sandbox = true;
    var all = GameData.SKILLS.map(function (sk) { return sk.id; });
    game.party.forEach(function (h) {
      Object.keys(GameData.JOBS).forEach(function (j) { h.mastery[j] = MAX_STAR * starNeed(j); });
      h.learned = all.slice();
      fitPassiveSlots(h);
    });
    return true;
  }
  function endSandbox() {
    var back = null;
    try { back = JSON.parse(localStorage.getItem(SANDBOX_KEY) || "null"); } catch (e) { back = null; }
    try { localStorage.removeItem(SANDBOX_KEY); localStorage.removeItem(TRY_KEY); } catch (e) { /* そのまま */ }
    sandbox = false;
    if (back) game = upgrade(back);
    save();
    return !!back;
  }
  // perWeekend：土日に出発できる回数（2026-10-25 保護者の希望。はじめは4回。知恵の試練も同じ回数まで）
  function defaultParent() { return { minutes: 5, perDay: 2, perWeekend: 4, restWeek: [], restDates: [] }; }
  function parent() { return game ? game.parent : defaultParent(); }
  function setParent(p) {
    if (!game) return;
    var c = game.parent;
    if (p.minutes) c.minutes = p.minutes;
    if (p.perDay) c.perDay = p.perDay;
    if (p.perWeekend) c.perWeekend = p.perWeekend;
    if (p.restWeek) c.restWeek = p.restWeek.slice().sort();
    if (p.restDates) c.restDates = p.restDates.slice().sort();
    save();
  }
  function restToday() {
    if (!game) return false;
    var c = game.parent, d = new Date();
    return c.restWeek.indexOf(d.getDay()) >= 0 || c.restDates.indexOf(todayStr()) >= 0;
  }
  function log() { return game ? game.log : []; }
  // 休みの日に知恵の試練だけ解いたとき（その日1回だけ記録する）
  function logRest(res) {
    if (!game) return;
    var t = todayStr();
    if (game.log.some(function (r) { return r.date === t && r.kind === "rest"; })) return;
    game.log.unshift({ date: t, at: new Date().toISOString(), floor: 0, kind: "rest", cleared: false, correct: res.correct || 0, subjects: res.subjects || [] });
    if (game.log.length > LOG_MAX) game.log.length = LOG_MAX;
    save();
    if (window.Sync) { Sync.log({ date: t, kind: "rest", floor: 0, correct: res.correct || 0, subjects: res.subjects || [] }); Sync.save("", ""); }
  }
  // 試しモードで出発する前に、今のセーブを控える（もどったら、これにもどす）
  function beginTry() { try { localStorage.setItem(TRY_KEY, JSON.stringify(game)); } catch (e) { /* そのまま */ } }

  // 1日に出発できる回数は保護者画面で決める（はじめは2回）。テスト用に外せる（この端末だけ）
  // 今日もう何回冒険したか（拠点にもどった回数で数える）
  function adventuresToday() {
    if (!game) return 0;
    var c = game.adventureCount;
    if (c && c.date === todayStr()) return c.n || 0;
    return game.lastAdventure === todayStr() ? 1 : 0; // 1日1回だったころのセーブ
  }
  // 今日出発できる回数：土日（土曜・日曜）は perWeekend、ほかの日は perDay（2026-10-25）
  function isWeekend() { var d = new Date().getDay(); return d === 0 || d === 6; }
  function perDayToday() { var p = parent(); return isWeekend() ? (p.perWeekend || 4) : p.perDay; }
  function adventuredToday() { return adventuresToday() >= perDayToday(); }
  function unlimited() { try { return localStorage.getItem("bd-test-unlimited") === "1"; } catch (e) { return false; } }
  function setUnlimited(on) { try { if (on) localStorage.setItem("bd-test-unlimited", "1"); else localStorage.removeItem("bd-test-unlimited"); } catch (e) { /* そのまま */ } }

  // ---------- セーブの復元（最近の10回分） ----------
  function readHistory() {
    try { var s = localStorage.getItem(HISTORY_KEY); return s ? JSON.parse(s) : []; } catch (e) { return []; }
  }
  function pushHistory(label) {
    if (!game || sandbox) return;
    var list = readHistory();
    list.unshift({ at: new Date().toISOString(), label: label, data: JSON.stringify(game) });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 入りきらなければ、そのまま */ }
    // GAS にも送る（区切り。「セーブの控え」に残る）
    if (window.Sync) Sync.save(label, summary());
  }
  function history() {
    return readHistory().map(function (h, i) {
      var g = null; try { g = JSON.parse(h.data); } catch (e) { /* こわれた控えは見せるだけ */ }
      return { index: i, at: h.at, label: h.label, summary: g ? g.party.map(function (p) { return p.name + " Lv" + p.level; }).join("・") + "　" + g.gold + "G　" + progressText(g) : "読めない控え" };
    });
  }
  function restore(index) {
    var h = readHistory()[index];
    if (!h) return false;
    try { game = upgrade(JSON.parse(h.data)); } catch (e) { return false; }
    game.today = { date: todayStr(), adventure: null };
    save();
    return true;
  }

  // GAS とのやりとりは sync.js（段階G-2）。区切りで Sync.save、冒険の記録は Sync.log。

  // ---------- iPad の中の控え ----------
  function save() {
    if (sandbox) return;   // 全開放の試しのあいだは、本当のセーブを書きかえない
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* 保存できない端末では、そのまま遊ぶ */ }
    if (window.Sync) Sync.markDirty(); // まだ GAS に送っていない変更がある（区切りで送る）
  }
  // GAS から読んだセーブ（JSON の文字列）を使う。読めなければ false
  function adopt(json) {
    var g = null;
    try { g = JSON.parse(json); } catch (e) { return false; }
    if (!g || !Array.isArray(g.party)) return false;
    game = upgrade(g); sandbox = false;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); localStorage.removeItem(SANDBOX_KEY); } catch (e) { /* そのまま */ }
    return true;
  }
  // この iPad の中のゲームのデータを捨てる（はじめて GAS につないだとき・GAS にセーブがないとき）
  function wipeLocal() {
    [SAVE_KEY, HISTORY_KEY, TRY_KEY, "bd-mock-records"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* そのまま */ } });
    game = null;
  }
  // セーブのまとめ（控えの一覧に出す）
  function summary() {
    if (!game) return "";
    return game.party.map(function (p) { return p.name + " Lv" + p.level; }).join("・") + "　" + game.gold + "G　" + progressText(game);
  }
  function load() {
    // 全開放の試しのとちゅうで閉じたとき：試しのあいだは本当のセーブを書きかえていないので、しまった控えを捨てるだけでよい
    try { localStorage.removeItem(SANDBOX_KEY); } catch (e) { /* そのまま */ }
    try {
      var s = localStorage.getItem(SAVE_KEY);
      if (s) { game = upgrade(JSON.parse(s)); return game; }
    } catch (e) { /* 読めなければ、はじめから */ }
    return null;
  }
  function wipe() {
    // セーブの復元の控え（HISTORY_KEY）は消さない：うっかり消したときに、もどせるように
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* なにもしない */ }
    game = null;
  }

  return {
    STAR_NEED: STAR_NEED, STAR_NEED_UPPER: STAR_NEED_UPPER, STAR_NEED_TOP: STAR_NEED_TOP, MAX_STAR: MAX_STAR, MAX_LEVEL: MAX_LEVEL,
    get: function () { return game; }, activeSlots: activeSlots, upperOpen: upperOpen, progressOf: progressOf, unlocked: unlocked, regionOpen: regionOpen, region: region, setRegion: setRegion, baseName: baseName, newGame: newGame, load: load, save: save, wipe: wipe, adopt: adopt, wipeLocal: wipeLocal, summary: summary,
    inSandbox: inSandbox, beginSandbox: beginSandbox, endSandbox: endSandbox,
    todayStr: todayStr, adventuredToday: adventuredToday, adventuresToday: adventuresToday, perDayToday: perDayToday, isWeekend: isWeekend, parent: parent, setParent: setParent, restToday: restToday, log: log, logRest: logRest, beginTry: beginTry, unlimited: unlimited, setUnlimited: setUnlimited, setAdventure: setAdventure, adventure: adventure, adventureDate: adventureDate,
    history: history, restore: restore,
    expNeed: expNeed, stars: stars, starterWeapon: starterWeapon, applyAdventure: applyAdventure, setLevelForTest: setLevelForTest,
    STORAGE_MAX: STORAGE_MAX, TOOLS: TOOLS, TOOL_ORDER: TOOL_ORDER, shopTools: shopTools, TOOL_MAX: TOOL_MAX, REROLL: REROLL,
    changeJob: changeJob, canBecome: canBecome, starNeed: starNeed, setSkill: setSkill, setPassive: setPassive, passiveSlots: passiveSlots, passiveFx: passiveFx, noteSeen: noteSeen, noteHit: noteHit, learnSkills: learnSkills,
    recommendEquip: recommendEquip, previewEquip: previewEquip, applyEquip: applyEquip, recommendSkills: recommendSkills, applySkills: applySkills,
    canEquip: canEquip, heroStats: heroStats, heroWeaponType: heroWeaponType, equipItem: equipItem, unequip: unequip, fixSkills: fixSkills,
    itemValue: itemValue, sellPrice: sellPrice, matOf: matOf, dismantleCount: dismantleCount, releaseValue: releaseValue, release: release,
    shopEquipList: shopEquipList, buyEquip: buyEquip, buyTool: buyTool, useTool: useTool, gainTool: gainTool,
    rarityUpCost: rarityUpCost, rarityUp: rarityUp,
    upgradeCost: upgradeCost, upgradeItem: upgradeItem, transferCost: transferCost, transferTargets: transferTargets, transferPlus: transferPlus, rerollItem: rerollItem, allItems: allItems
  };
})();
