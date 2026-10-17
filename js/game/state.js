// ゲームの中身（段階5）：3人の仲間（名前・顔・職業・レベル・能力・熟練度・スキル）、ゴールド・素材・倉庫、進み具合、図鑑。
// 経験値と熟練度は、冒険から拠点にもどったときにまとめて入る（「拾った装備と経験値は持ち帰れる」）。
// 数字は docs/draft.md 1.1（成長の速さ）。iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var GameState = (function () {
  var STAR_NEED = 40;  // 基本職：★1つに必要な熟練度
  var MAX_STAR = 7;    // 基本職の★の数（スキルの数と同じ）
  var MAX_LEVEL = 100;
  var SAVE_KEY = "brain-dungeon-save-v1"; // iPad の中の控え（段階5-3で、GAS へのセーブと再開・復元を足す）

  var game = null;

  function newHero(name, face, job) {
    return {
      name: name, face: face, job: job, level: 1, exp: 0,
      base: { str: 10, vit: 10, mag: 10, int: 10 },
      mastery: {}, learned: [], set: [null, null, null],
      equip: { weapon: null, armor: null } // null は、はじめから持っている武器・防具
    };
  }

  // 古いセーブに、あとから足した項目を入れる
  function upgrade(g) {
    g.party.forEach(function (h) { if (!h.equip) h.equip = { weapon: null, armor: null }; });
    if (!g.items) g.items = { potion: 0, revive: 0, antidote: 0, paraheal: 0, wake: 0 };
    return g;
  }

  function newGame(list) {
    game = {
      v: 1,
      party: list.map(function (h) { return newHero(h.name, h.face, h.job); }),
      gold: 0, mat: { iron: 0, stone: 0 }, storage: [], nextId: 1,
      items: { potion: 0, revive: 0, antidote: 0, paraheal: 0, wake: 0 },
      progress: { deepest: 0, bosses: [] },
      titles: [],
      book: { monsters: {}, items: [] }
    };
    game.party.forEach(function (h) { learnSkills(h); });
    save();
    return game;
  }

  // ---------- 成長 ----------
  function expNeed(level) { return 100 + 48 * level; }
  function stars(h, job) { return Math.min(MAX_STAR, Math.floor((h.mastery[job || h.job] || 0) / STAR_NEED)); }
  function starterWeapon(job) { return GameData.JOBS[job].weapons[0]; }

  // 今の職業の★までのスキルを覚える（上から順）。覚えたスキルは、空いているスキル1〜3に自動でセットする（スキルのセットの画面は段階5-2）
  function learnSkills(h) {
    var got = [], st = stars(h);
    GameData.SKILLS.forEach(function (sk) {
      if (sk.job !== h.job || sk.star > st || h.learned.indexOf(sk.id) >= 0) return;
      h.learned.push(sk.id); got.push(sk.name);
      var free = h.set.indexOf(null);
      if (free >= 0 && GameData.canSet(sk, h.job, h.equip ? heroWeaponType(h) : starterWeapon(h.job))) h.set[free] = sk.id;
    });
    return got;
  }

  // 冒険の結果を受け取る。r：{ exp: [3人分], mastery: [3人分], gold, mat, items, title, floor, cleared, kills: { 敵の種類: 数 } }
  // もどり値：拠点で見せる知らせ（1人ずつの行）
  function applyAdventure(r) {
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
      game.progress.deepest = Math.max(game.progress.deepest, r.floor);
      if (r.boss && game.progress.bosses.indexOf(r.floor) < 0) game.progress.bosses.push(r.floor);
    }
    if (lost) report.push({ name: "倉庫", lines: ["倉庫がいっぱいで、装備を " + lost + "個 持ち帰れなかった"], exp: 0 });
    save();
    return report;
  }

  // ---------- 装備（段階5-2） ----------
  var STORAGE_MAX = 200;
  var TOOLS = {
    potion:   { name: "回復薬", price: 30, note: "HP を 40% 回復" },
    revive:   { name: "復活薬", price: 150, note: "たおれた仲間を HP30% で復活" },
    antidote: { name: "毒消し", price: 20, note: "毒を治す", cures: "poison" },
    paraheal: { name: "しびれ治し", price: 20, note: "しびれを治す", cures: "para" },
    wake:     { name: "目覚まし", price: 20, note: "眠りを治す", cures: "sleep" }
  };
  var TOOL_ORDER = ["potion", "revive", "antidote", "paraheal", "wake"];
  var TOOL_MAX = 99;

  // 装備できるか：武器は職業の武器の種類、防具は職業の防具の種類
  function canEquip(h, item) {
    var J = GameData.JOBS[h.job];
    return item.slot === "weapon" ? J.weapons.indexOf(item.base) >= 0 : item.base === J.armor;
  }
  function plusMult(item) { return 1 + 0.05 * (item.plus || 0); } // 強化 ＋1 ごとに基本の強さ＋5%（draft 4）

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
    s.hp = Math.max(1, s.hp); s.mp = Math.max(0, s.mp);
    return s;
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
    return removed;
  }
  function indexOf(id) { for (var i = 0; i < game.storage.length; i++) if (game.storage[i].id === id) return i; return -1; }

  // 値段：ノーマルは 100＋20×ilv（draft 4）。レア度が高いほど高い（仮：×1・×2・×4・×8）。強化 ＋1 ごとに 10% 高い
  function itemValue(it) { return Math.round((100 + 20 * it.ilv) * [1, 2, 4, 8][it.r] * (1 + 0.1 * (it.plus || 0))); }
  function sellPrice(it) { return Math.round(itemValue(it) * 0.25); } // 売る：値段の 25%
  // 分解：杖と魔法装備は魔石、それ以外は鉄。1〜3（レア度が高いほど多い）
  function matOf(it) { return it.base === "staff" || it.base === "magic" ? "stone" : "iron"; }
  function dismantleCount(it) { return [1, 2, 2, 3][it.r]; }
  function sell(id) {
    var i = indexOf(id); if (i < 0) return 0;
    var g = sellPrice(game.storage[i]); game.storage.splice(i, 1); game.gold += g; save(); return g;
  }
  function dismantle(id) {
    var i = indexOf(id); if (i < 0) return null;
    var it = game.storage[i], m = matOf(it), n = dismantleCount(it);
    game.storage.splice(i, 1); game.mat[m] += n; save();
    return { mat: m, n: n };
  }

  // お店：ふつうの装備（ノーマル。バフ・デバフなし）。ilv は今いちばん深く行った階層まで（draft 4）
  function shopEquipList() {
    var ilv = Math.max(1, game.progress.deepest);
    var list = [];
    Object.keys(GameData.WEAPONS).forEach(function (b) { list.push(shopItem("weapon", b, ilv)); });
    Object.keys(GameData.ARMORS).forEach(function (b) { list.push(shopItem("armor", b, ilv)); });
    return list;
  }
  function shopItem(slot, base, ilv) {
    var def = slot === "weapon" ? GameData.WEAPONS[base] : GameData.ARMORS[base], k = 1 + 0.08 * (ilv - 1);
    var it = { slot: slot, base: base, r: 0, ilv: ilv, plus: 0, buff: [], debuff: [], sp: null, name: def.name };
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

  // 鍛冶屋：強化 ＋1〜＋10。費用は「素材×(今の段階＋1)＋50×(今の段階＋1) G」（draft 4）。必ず成功
  function upgradeCost(it) { var n = (it.plus || 0) + 1; return { mat: matOf(it), n: n, gold: 50 * n }; }
  function upgradeItem(it) {
    if ((it.plus || 0) >= 10) return false;
    var c = upgradeCost(it);
    if (game.gold < c.gold || game.mat[c.mat] < c.n) return false;
    game.gold -= c.gold; game.mat[c.mat] -= c.n; it.plus = (it.plus || 0) + 1; save(); return true;
  }
  // 引き直し：魔石2＋100G で、バフ・デバフを全部引き直す（数はレア度の決まりのまま）
  var REROLL = { stone: 2, gold: 100 };
  function rerollItem(it) {
    if (game.gold < REROLL.gold || game.mat.stone < REROLL.stone) return false;
    game.gold -= REROLL.gold; game.mat.stone -= REROLL.stone;
    var fresh = Loot.rerollMods(it.r, it.ilv);
    it.buff = fresh.buff; it.debuff = fresh.debuff;
    save(); return true;
  }
  // 倉庫と、3人が装備している物を全部（鍛冶屋で使う）
  function allItems() {
    var out = game.storage.map(function (it) { return { item: it, who: null }; });
    game.party.forEach(function (h) { ["weapon", "armor"].forEach(function (s) { if (h.equip[s]) out.push({ item: h.equip[s], who: h }); }); });
    return out;
  }

  // テスト用：3人のレベルをまとめて変える（能力は今の職業で育ったものとして作りなおす）
  function setLevelForTest(level) {
    game.party.forEach(function (h) {
      h.level = level; h.exp = 0;
      h.base = GameData.baseStats(h.job, level);
    });
    save();
  }

  // ---------- iPad の中の控え ----------
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* 保存できない端末では、そのまま遊ぶ */ }
  }
  function load() {
    try {
      var s = localStorage.getItem(SAVE_KEY);
      if (s) { game = upgrade(JSON.parse(s)); return game; }
    } catch (e) { /* 読めなければ、はじめから */ }
    return null;
  }
  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* なにもしない */ }
    game = null;
  }

  return {
    STAR_NEED: STAR_NEED, MAX_STAR: MAX_STAR, MAX_LEVEL: MAX_LEVEL,
    get: function () { return game; }, newGame: newGame, load: load, save: save, wipe: wipe,
    expNeed: expNeed, stars: stars, starterWeapon: starterWeapon, applyAdventure: applyAdventure, setLevelForTest: setLevelForTest,
    STORAGE_MAX: STORAGE_MAX, TOOLS: TOOLS, TOOL_ORDER: TOOL_ORDER, TOOL_MAX: TOOL_MAX, REROLL: REROLL,
    canEquip: canEquip, heroStats: heroStats, heroWeaponType: heroWeaponType, equipItem: equipItem, unequip: unequip, fixSkills: fixSkills,
    itemValue: itemValue, sellPrice: sellPrice, matOf: matOf, dismantleCount: dismantleCount, sell: sell, dismantle: dismantle,
    shopEquipList: shopEquipList, buyEquip: buyEquip, buyTool: buyTool, useTool: useTool,
    upgradeCost: upgradeCost, upgradeItem: upgradeItem, rerollItem: rerollItem, allItems: allItems
  };
})();
