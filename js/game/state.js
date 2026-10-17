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
      mastery: {}, learned: [], set: [null, null, null]
    };
  }

  function newGame(list) {
    game = {
      v: 1,
      party: list.map(function (h) { return newHero(h.name, h.face, h.job); }),
      gold: 0, mat: { iron: 0, stone: 0 }, storage: [], nextId: 1,
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
      if (free >= 0 && GameData.canSet(sk, h.job, starterWeapon(h.job))) h.set[free] = sk.id;
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
    (r.items || []).forEach(function (it) {
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
    save();
    return report;
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
      if (s) { game = JSON.parse(s); return game; }
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
    expNeed: expNeed, stars: stars, starterWeapon: starterWeapon, applyAdventure: applyAdventure, setLevelForTest: setLevelForTest
  };
})();
