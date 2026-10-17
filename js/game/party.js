// パーティ：3人のキャラ、切りかえ、HP・MP、強くする効果（バフ）、状態異常。
// 画面に出ているのは選んだ1人だけ。位置や向きは actor（1つ）をみんなで使う。
// 状態異常の時間は、画面に出ているあいだだけ進む（切りかえても治らない）。
var Party = (function () {
  var SWITCH_CD = 3;   // 切りかえたあと、もう一度切りかえられるまでの秒
  var MP_REGEN = 0.01; // 1秒に MP の上限の 1%

  var members = [];
  var active = 0;
  var switchCd = 0;
  var actor = {
    x: 0, y: 0, r: 6, face: { x: 1, y: 0 }, walk: 0,
    wait: 0, swing: 0, swingArc: 1, swingReach: 18, swingColor: "#fff",
    inv: 0, busy: 0 // busy：ためている・踏みこんでいるあいだは動けない
  };

  function makeChar(name, job, weapon, level, skills) {
    var c = { name: name, job: job, weapon: weapon, level: level || 1, skills: skills || [null, null, null] };
    c.ct = {}; c.used = {}; c.buffs = []; c.regens = []; c.status = {}; c.down = false;
    recalc(c);
    c.hp = c.stats.hp; c.mp = c.stats.mp;
    return c;
  }

  // 職業・武器・レベルから能力を計算しなおす
  function recalc(c) {
    var J = GameData.JOBS[c.job];
    c.base = GameData.baseStats(c.job, c.level);
    // 防具は、装備のしくみ（段階5）ができるまでは、はじめから持っている防具
    c.stats = GameData.combatStats(c.base, GameData.WEAPONS[c.weapon], GameData.STARTER_ARMORS[J.armor], c.level);
  }

  // バフをふくめた値。stat：patk/pdef/matk/mdef/crit/wait（wait は倍率）
  function eff(c, stat) {
    var add = 0;
    c.buffs.forEach(function (b) { if (b.stat === stat) add += b.pct; });
    if (stat === "wait") return Math.max(0.3, 1 + add);
    if (stat === "crit") return c.stats.crit + add;
    return c.stats[stat] * (1 + add);
  }

  function setup(list) {
    members = list;
    active = 0; switchCd = 0;
  }
  function current() { return members[active]; }

  function canSwitch() {
    return switchCd <= 0 && members.some(function (m, i) { return i !== active && !m.down; });
  }
  // 次の（倒れていない）キャラへ
  function switchNext() {
    if (!canSwitch()) return false;
    for (var k = 1; k <= members.length; k++) {
      var i = (active + k) % members.length;
      if (!members[i].down) { switchTo(i); return true; }
    }
    return false;
  }
  function switchTo(i) {
    if (members[i].down) return;
    active = i; switchCd = SWITCH_CD;
    actor.inv = Math.max(actor.inv, 1); // 入れかわった直後1秒は無敵
    actor.wait = 0; actor.swing = 0; actor.busy = 0;
  }

  function tick(dt) {
    switchCd = Math.max(0, switchCd - dt);
    members.forEach(function (c, i) {
      for (var id in c.ct) c.ct[id] = Math.max(0, c.ct[id] - dt);
      if (c.down) return;
      c.mp = Math.min(c.stats.mp, c.mp + c.stats.mp * MP_REGEN * dt);
      for (var b = c.buffs.length - 1; b >= 0; b--) { c.buffs[b].t -= dt; if (c.buffs[b].t <= 0) c.buffs.splice(b, 1); }
      for (var r = c.regens.length - 1; r >= 0; r--) {
        var g = c.regens[r];
        c.hp = Math.min(c.stats.hp, c.hp + g.perSec * dt);
        g.t -= dt; if (g.t <= 0) c.regens.splice(r, 1);
      }
      // 状態異常は画面に出ているキャラだけ時間が進む
      if (i !== active) return;
      var s = c.status;
      if (s.poison) {
        s.poison.tick -= dt;
        if (s.poison.tick <= 0) {
          s.poison.tick += 2;
          var dmg = Math.max(1, Math.round(c.stats.hp * 0.03));
          c.hp = Math.max(1, c.hp - dmg); // 毒では倒れない（HP1で止まる）
          Battle.pop(actor.x, actor.y - 18, String(dmg), GameData.STATUS.poison.color, 9);
        }
        s.poison.t -= dt; if (s.poison.t <= 0) delete s.poison;
      }
      ["para", "sleep"].forEach(function (k) { if (s[k]) { s[k].t -= dt; if (s[k].t <= 0) delete s[k]; } });
    });
  }

  function addStatus(c, type, dur) {
    if (type === "poison") c.status.poison = { t: dur, tick: 2 };
    else c.status[type] = { t: dur };
    Battle.pop(actor.x, actor.y - 28, GameData.STATUS[type].name, GameData.STATUS[type].color, 8);
  }
  function cure(c) { c.status = {}; }

  // 画面に出ているキャラがダメージを受ける。倒れたら true
  function hurtActive(amount) {
    var c = current();
    c.hp = Math.max(0, c.hp - amount);
    if (c.status.sleep) { delete c.status.sleep; } // 眠りはダメージで起きる
    if (c.hp <= 0) { c.down = true; c.status = {}; c.buffs = []; c.regens = []; return true; }
    return false;
  }

  function allDown() { return members.every(function (m) { return m.down; }); }

  function resetAll() {
    members.forEach(function (c) {
      recalc(c);
      c.hp = c.stats.hp; c.mp = c.stats.mp; c.down = false;
      c.ct = {}; c.used = {}; c.buffs = []; c.regens = []; c.status = {};
    });
    active = 0; switchCd = 0;
  }

  return {
    actor: actor, makeChar: makeChar, recalc: recalc, eff: eff, setup: setup, current: current,
    members: function () { return members; }, activeIndex: function () { return active; },
    canSwitch: canSwitch, switchNext: switchNext, switchTo: switchTo, switchCd: function () { return switchCd; },
    tick: tick, addStatus: addStatus, cure: cure, hurtActive: hurtActive, allDown: allDown, resetAll: resetAll
  };
})();
