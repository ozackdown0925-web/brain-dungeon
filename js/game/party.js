// パーティ：3人のキャラ、切りかえ、HP・MP、強くする効果（バフ）、状態異常。
// 画面に出ているのは選んだ1人だけ。位置や向きは actor（1つ）をみんなで使う。
// 状態異常の時間は、画面に出ているあいだだけ進む（切りかえても治らない）。
var Party = (function () {
  var SWITCH_CD = 3;   // 切りかえたあと、もう一度切りかえられるまでの秒
  var MP_REGEN = 0; // MP は自然に回復しない（2026-10-18 決定。MP回復薬で回復する。前は 1秒に上限の 1%）

  var members = [];
  var active = 0;
  var switchCd = 0;
  var actor = {
    x: 0, y: 0, r: 6, face: { x: 1, y: 0 }, walk: 0,
    wait: 0, swing: 0, swingArc: 1, swingReach: 18, swingColor: "#fff",
    inv: 0, busy: 0 // busy：ためている・踏みこんでいるあいだは動けない
  };

  function makeChar(name, job, weapon, level, skills, hero) {
    var c = { name: name, job: job, weapon: weapon, level: level || 1, skills: skills || [null, null, null], hero: hero || null, face: hero ? hero.face : 0 };
    c.ct = {}; c.used = {}; c.buffs = []; c.regens = []; c.status = {}; c.down = false;
    recalc(c);
    c.hp = c.stats.hp; c.mp = c.stats.mp;
    return c;
  }

  // 拠点の仲間（GameState の hero）から、冒険に出るキャラを作る。武器は、装備のしくみ（段階5-2）ができるまでは、職業のはじめの武器
  function fromHero(h) {
    var c = makeChar(h.name, h.job, GameState.heroWeaponType(h), h.level, h.set.slice(), h);
    // スキルセットの切りかえ（2026-10-22）：セットB と、いまどちらを使っているか（0＝A・1＝B）
    c.setsOn = !!h.setsOpen; c.skillsB = (h.setB || [null, null, null]).slice(); c.page = 0;
    return c;
  }

  // 職業・武器・レベルから能力を計算しなおす。hero があれば、その能力（職業を変えながら育った値）を使う
  function recalc(c) {
    var J = GameData.JOBS[c.job];
    c.base = c.hero ? c.hero.base : GameData.baseStats(c.job, c.level);
    // 拠点の仲間なら、装備（武器・防具・バフ・デバフ・強化）をふくめた能力
    c.stats = c.hero ? GameState.heroStats(c.hero) : GameData.combatStats(c.base, GameData.WEAPONS[c.weapon], GameData.STARTER_ARMORS[J.armor], c.level);
  }

  // バフをふくめた値。stat：patk/pdef/matk/mdef/crit/wait（wait は倍率）
  function eff(c, stat) {
    var add = 0;
    c.buffs.forEach(function (b) { if (b.stat === stat) add += b.pct; });
    if (stat === "wait") return Math.max(0.3, (1 + add) * (c.stats.waitMul || 1)); // waitMul：パッシブ「身軽」
    if (stat === "crit") return c.stats.crit + add;
    if (stat === "evade") return Math.max(0, add);   // 身躱しの術：よける確率
    if (stat === "patk" && c.stats.still && actor.move < 0.1) add += c.stats.still;   // パッシブ「狙撃の構え」：止まっているあいだ
    // パッシブ「背水」（2026-10-20）：HPが半分より少ないと物攻が上がる。HPが少ないほど上がり、0に近いとき最大
    if (stat === "patk" && c.stats.backwater && c.hp < c.stats.hp * 0.5) add += c.stats.backwater * (1 - c.hp / (c.stats.hp * 0.5));
    return c.stats[stat] * (1 + add);
  }

  // いま使っているスキルのセット（ボタン3つぶん）
  function skillsOf(c) { return c.page === 1 && c.setsOn ? c.skillsB : c.skills; }
  // セットA ⇔ B を入れかえる。できなければ false
  function flipSet(c) { if (!c.setsOn) return false; c.page = c.page === 1 ? 0 : 1; return true; }

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
    actor.wait = 0; actor.swing = 0; actor.busy = 0; actor.hidden = 0;   // 隠れみの術は、交代すると終わる
  }

  function tick(dt) {
    switchCd = Math.max(0, switchCd - dt);
    members.forEach(function (c, i) {
      for (var id in c.ct) c.ct[id] = Math.max(0, c.ct[id] - dt);
      if (c.down) return;
      c.mp = Math.min(c.stats.mp, c.mp + c.stats.mp * MP_REGEN * dt);
      for (var b = c.buffs.length - 1; b >= 0; b--) { c.buffs[b].t -= dt; if (c.buffs[b].t <= 0) c.buffs.splice(b, 1); }
      if (c.enchant) { c.enchant.t -= dt; if (c.enchant.t <= 0) c.enchant = null; }   // 魔法剣士の火炎剣など
      if (c.guts > 0) c.guts = Math.max(0, c.guts - dt);                                 // 不屈の光
      // パッシブ「オートヒール」（5秒ごとに HP）・「オートチャージ」（10秒ごとに MP）（2026-10-20）。待機中の仲間にも効く
      if (c.stats.autoHeal) { c.autoHealT = (c.autoHealT || 0) + dt; if (c.autoHealT >= 5) { c.autoHealT -= 5; c.hp = Math.min(c.stats.hp, c.hp + c.stats.hp * c.stats.autoHeal); } }
      if (c.stats.autoMp) { c.autoMpT = (c.autoMpT || 0) + dt; if (c.autoMpT >= 10) { c.autoMpT -= 10; c.mp = Math.min(c.stats.mp, c.mp + c.stats.mp * c.stats.autoMp); } }
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
          Battle.pop(actor.x, actor.y - 18, "毒 " + dmg, GameData.STATUS.poison.color, 10);
        }
        s.poison.t -= dt; if (s.poison.t <= 0) delete s.poison;
      }
      ["para", "sleep"].forEach(function (k) { if (s[k]) { s[k].t -= dt; if (s[k].t <= 0) delete s[k]; } });
    });
  }

  function addStatus(c, type, dur) {
    // パッシブ「聖なる守り」：それをつけた仲間がいれば、毒・しびれ・眠りにかかりにくい（2026-10-19）
    var aura = 0;
    members.forEach(function (m) { if (!m.down && m.stats && m.stats.aura > aura) aura = m.stats.aura; });
    if (aura && Math.random() < aura) { Battle.pop(actor.x, actor.y - 28, "ふせいだ", "#ffffff", 8); return; }
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
    if (c.hp <= 0 && c.guts > 0) { c.hp = 1; Battle.pop(actor.x, actor.y - 34, "持ちこたえた！", "#fff2a0", 8); }   // 不屈の光
    if (c.hp <= 0) { c.down = true; c.status = {}; c.buffs = []; c.regens = []; c.enchant = null; c.guts = 0; return true; }
    return false;
  }

  function allDown() { return members.every(function (m) { return m.down; }); }

  function resetAll() {
    members.forEach(function (c) {
      recalc(c);
      c.hp = c.stats.hp; c.mp = c.stats.mp; c.down = false;
      c.ct = {}; c.used = {}; c.buffs = []; c.regens = []; c.status = {}; c.enchant = null; c.guts = 0;
    });
    active = 0; switchCd = 0; actor.hidden = 0;
  }

  return {
    actor: actor, skillsOf: skillsOf, flipSet: flipSet, makeChar: makeChar, fromHero: fromHero, recalc: recalc, eff: eff, setup: setup, current: current,
    members: function () { return members; }, activeIndex: function () { return active; },
    canSwitch: canSwitch, switchNext: switchNext, switchTo: switchTo, switchCd: function () { return switchCd; },
    tick: tick, addStatus: addStatus, cure: cure, hurtActive: hurtActive, allDown: allDown, resetAll: resetAll
  };
})();
