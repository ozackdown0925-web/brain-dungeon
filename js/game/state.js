// ゲームの中身（段階5）：3人の仲間（名前・顔・職業・レベル・能力・熟練度・スキル）、ゴールド・素材・倉庫、進み具合、図鑑。
// 経験値と熟練度は、冒険から拠点にもどったときにまとめて入る（「拾った装備と経験値は持ち帰れる」）。
// 数字は docs/draft.md 1.1（成長の速さ）。iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var GameState = (function () {
  var STAR_NEED = 40;  // 基本職：★1つに必要な熟練度
  var STAR_NEED_UPPER = 60, STAR_NEED_TOP = 80; // 上級職・最上級職（2026-10-19 決定。上級職を作るときに使う）
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
      mastery: {}, learned: [], set: [null, null, null], pset: [null, null],
      equip: { weapon: null, armor: null } // null は、はじめから持っている武器・防具
    };
  }

  // 古いセーブに、あとから足した項目を入れる
  function upgrade(g) {
    g.party.forEach(function (h) {
      if (!h.equip) h.equip = { weapon: null, armor: null };
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
    if (!g.log) g.log = [];
    if (!g.progress.dungeons) g.progress.dungeons = {};   // ダンジョンごとの進み具合（瘴気の森の段階1、2026-10-21）
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
      items: { potion: 0, ether: 0, revive: 0, antidote: 0, paraheal: 0, wake: 0 },
      progress: { deepest: 0, bosses: [], dungeons: {} },
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
  function expNeed(level) { return 100 + 48 * level; }
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

  // 今の職業のスキルを、★の数に合わせて上から順に覚える。覚えたスキルは、空いているスキル1〜3に自動でセットする。
  // ★k のスキルは ★(k−1) で覚える：★1 のスキルは、その職業になったときから使える（2026-10-17。Lv1 でも職業の差が出るように）。★7 は「極めた」印。
  function learnSkills(h) {
    var got = [], st = stars(h);
    GameData.SKILLS.forEach(function (sk) {
      if (sk.job !== h.job || sk.star > st + 1 || h.learned.indexOf(sk.id) >= 0) return;
      h.learned.push(sk.id); got.push(sk.name);
      // 覚えたスキルは、空いている枠に自動でセットする（アクティブはスキル1〜3、パッシブはパッシブの枠）
      var slots = sk.passive ? h.pset : h.set;
      var free = slots ? slots.indexOf(null) : -1;
      if (free >= 0 && GameData.canSet(sk, h.job, h.equip ? heroWeaponType(h) : starterWeapon(h.job))) slots[free] = sk.id;
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
      var st0 = stars(h);
      h.mastery[h.job] = (h.mastery[h.job] || 0) + Math.round(r.mastery[i] || 0);
      var st1 = stars(h);
      if (st1 > st0) lines.push(GameData.JOBS[h.job].name + "の熟練度が ★" + st1 + " になった！");
      learnSkills(h).forEach(function (n) { lines.push("スキル「" + n + "」を覚えた！"); });
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
    if (r.title && game.titles.indexOf(r.title) < 0) game.titles.push(r.title);
    if (r.cleared) {
      var pg = progressOf(r.dungeon);
      pg.deepest = Math.max(pg.deepest, r.floor);
      if (r.boss && pg.bosses.indexOf(r.floor) < 0) pg.bosses.push(r.floor);
    }
    if (lost) report.push({ name: "倉庫", lines: ["倉庫がいっぱいで、装備を " + lost + "個 持ち帰れなかった"], exp: 0 });
    game.today = { date: todayStr(), adventure: null };
    // 出発できるのは1日2回（テスト用の出発は数えない）
    if (!r.test) {
      game.adventureCount = { date: todayStr(), n: adventuresToday() + 1 }; game.lastAdventure = todayStr();
      // 遊んだ記録（保護者画面で見る）。最近の100回分
      game.log.unshift({ date: todayStr(), at: new Date().toISOString(), dungeon: r.dungeon || "forest1", floor: r.floor, kind: r.kind, cleared: !!r.cleared,
                         correct: r.correct || 0, subjects: r.subjects || [] });
      if (game.log.length > LOG_MAX) game.log.length = LOG_MAX;
    }
    save();
    var dn = GameData.dungeonOf(r.dungeon);
    pushHistory(r.cleared ? dn.short + "の" + r.floor + "階をクリア" : dn.short + "の" + r.floor + "階から帰った");
    // 冒険の記録（GAS）：ダンジョンの名前は、前からある「メモ」の列に入れる（GAS の形は変えない）
    if (!r.test && window.Sync) Sync.log({ date: todayStr(), kind: r.kind, floor: r.floor, correct: r.correct || 0, subjects: r.subjects || [], note: dn.name });
    return report;
  }

  // ---------- 装備（段階5-2） ----------
  var STORAGE_MAX = 200;
  var TOOLS = {
    potion:   { name: "回復薬", price: 30, note: "HP を 40% 回復" },
    ether:    { name: "MP回復薬", price: 40, note: "MP を 40% 回復" },   // MP は自然に回復しない（2026-10-18 決定）
    revive:   { name: "復活薬", price: 1000, note: "たおれた仲間を HP30% で復活" },   // 2026-10-18 に 150G から変更
    antidote: { name: "毒消し", price: 20, note: "毒を治す", cures: "poison" },
    paraheal: { name: "しびれ治し", price: 20, note: "しびれを治す", cures: "para" },
    wake:     { name: "目覚まし", price: 20, note: "眠りを治す", cures: "sleep" }
  };
  var TOOL_ORDER = ["potion", "ether", "revive", "antidote", "paraheal", "wake"];
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

  // 倉庫の物を装備する（前の装備は倉庫へ）
  function equipItem(h, id) {
    var i = indexOf(id); if (i < 0) return false;
    var it = game.storage[i];
    if (!canEquip(h, it)) return false;
    game.storage.splice(i, 1);
    var old = h.equip[it.slot];
    h.equip[it.slot] = it;
    if (old) game.storage.push(old);
    fixSkills(h);
    save();
    return true;
  }
  // 外して倉庫へ（はじめの装備にもどる）
  function unequip(h, slot) {
    var it = h.equip[slot]; if (!it) return false;
    if (game.storage.length >= STORAGE_MAX) return false;
    h.equip[slot] = null; game.storage.push(it);
    fixSkills(h);
    save();
    return true;
  }
  // 職業や武器を変えて、条件に合わなくなったスキルを外す。外した名前を返す
  function fixSkills(h) {
    var removed = [];
    h.set = h.set.map(function (id) {
      if (id && !GameData.canSet(GameData.SKILL[id], h.job, heroWeaponType(h))) { removed.push(GameData.SKILL[id].name); return null; }
      return id;
    });
    h.pset = (h.pset || []).map(function (id) {
      if (id && !GameData.canSet(GameData.SKILL[id], h.job, heroWeaponType(h))) { removed.push(GameData.SKILL[id].name); return null; }
      return id;
    });
    return removed;
  }
  function indexOf(id) { for (var i = 0; i < game.storage.length; i++) if (game.storage[i].id === id) return i; return -1; }

  // 値段：ノーマルは 100＋20×ilv（draft 4）。レア度が高いほど高い（仮：×1・×2・×4・×8）。強化 ＋1 ごとに 10% 高い
  function itemValue(it) { return Math.round((100 + 20 * it.ilv) * [1, 2, 4, 8][it.r] * (1 + 0.1 * (it.plus || 0))); }
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
    Object.keys(GameData.WEAPONS).forEach(function (b) { list.push(shopItem("weapon", b, ilv)); });
    Object.keys(GameData.ARMORS).forEach(function (b) { list.push(shopItem("armor", b, ilv)); });
    return list;
  }
  function shopItem(slot, base, ilv) {
    var def = slot === "weapon" ? GameData.WEAPONS[base] : GameData.ARMORS[base], k = 1 + Loot.ILV_STEP * (ilv - 1);
    var it = { slot: slot, base: base, r: 0, ilv: ilv, tier: 0, plus: 0, buff: [], debuff: [], sp: null, name: def.item || def.name };
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
  var RARITY_UP = [{ gem: 1, gold: 200 }, { gem: 2, gold: 500 }, { gem: 4, gold: 1000 }];
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
    var moved = back.map(function (slot) { var it = h.equip[slot]; h.equip[slot] = null; game.storage.push(it); return Loot.label(it); });
    h.job = job;
    var removed = fitPassiveSlots(h).concat(fixSkills(h));
    var learned = learnSkills(h);
    save();
    return { ok: true, moved: moved, removed: removed, learned: learned };
  }
  // スキル i 番目をセットする（id が null なら外す）。条件に合わない・同じスキルを2つは、できない
  function setSkill(h, i, id) {
    if (id) {
      var sk = GameData.SKILL[id];
      if (!sk || sk.passive || h.learned.indexOf(id) < 0 || !GameData.canSet(sk, h.job, heroWeaponType(h))) return false;
      h.set = h.set.map(function (x, k) { return k !== i && x === id ? null : x; });
    }
    h.set[i] = id || null;
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

  // ---------- 図鑑（段階5-2②） ----------
  function monster(type) {
    var b = game.book.monsters[type] || (game.book.monsters[type] = { kills: 0 });
    if (!b.tried) b.tried = {};
    return b;
  }
  function noteSeen(type) { if (game) { monster(type).seen = true; } }
  // 攻撃した属性の効き方を覚える：weak（弱点）・normal・half（いまひとつ）・none（無効）
  function noteHit(type, elem, mult) {
    if (!game || !elem) return;
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
  function defaultParent() { return { minutes: 5, perDay: 2, restWeek: [], restDates: [] }; }
  function parent() { return game ? game.parent : defaultParent(); }
  function setParent(p) {
    if (!game) return;
    var c = game.parent;
    if (p.minutes) c.minutes = p.minutes;
    if (p.perDay) c.perDay = p.perDay;
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
  function adventuredToday() { return adventuresToday() >= parent().perDay; }
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
    get: function () { return game; }, progressOf: progressOf, unlocked: unlocked, newGame: newGame, load: load, save: save, wipe: wipe, adopt: adopt, wipeLocal: wipeLocal, summary: summary,
    inSandbox: inSandbox, beginSandbox: beginSandbox, endSandbox: endSandbox,
    todayStr: todayStr, adventuredToday: adventuredToday, adventuresToday: adventuresToday, parent: parent, setParent: setParent, restToday: restToday, log: log, logRest: logRest, beginTry: beginTry, unlimited: unlimited, setUnlimited: setUnlimited, setAdventure: setAdventure, adventure: adventure, adventureDate: adventureDate,
    history: history, restore: restore,
    expNeed: expNeed, stars: stars, starterWeapon: starterWeapon, applyAdventure: applyAdventure, setLevelForTest: setLevelForTest,
    STORAGE_MAX: STORAGE_MAX, TOOLS: TOOLS, TOOL_ORDER: TOOL_ORDER, TOOL_MAX: TOOL_MAX, REROLL: REROLL,
    changeJob: changeJob, canBecome: canBecome, starNeed: starNeed, setSkill: setSkill, setPassive: setPassive, passiveSlots: passiveSlots, passiveFx: passiveFx, noteSeen: noteSeen, noteHit: noteHit, learnSkills: learnSkills,
    canEquip: canEquip, heroStats: heroStats, heroWeaponType: heroWeaponType, equipItem: equipItem, unequip: unequip, fixSkills: fixSkills,
    itemValue: itemValue, sellPrice: sellPrice, matOf: matOf, dismantleCount: dismantleCount, releaseValue: releaseValue, release: release,
    shopEquipList: shopEquipList, buyEquip: buyEquip, buyTool: buyTool, useTool: useTool, gainTool: gainTool,
    rarityUpCost: rarityUpCost, rarityUp: rarityUp,
    upgradeCost: upgradeCost, upgradeItem: upgradeItem, transferCost: transferCost, transferTargets: transferTargets, transferPlus: transferPlus, rerollItem: rerollItem, allItems: allItems
  };
})();
