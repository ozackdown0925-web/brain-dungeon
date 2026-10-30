// 敵：ゴブリンの剣士・槍兵・弓兵・つる草の魔物の動きと攻撃、矢、状態異常。
// ふつうの攻撃は「当たる前提」の設計。攻撃の前には短い予告（構え）があるが、かわすことは求めない。
var Enemies = (function () {
  var list = [];
  var arrows = [];
  var fxs = [];     // 敵の攻撃の見た目（剣の斬り・かみつき・針。2026-10-19）
  var rivalLater = [];   // 闘技場の相手のスキル：少しあとに当たるもの（矢の雨・メテオ・ビーム。2026-10-31）
  var rivalZones = [];   // 闘技場の相手のスキル：その場に残るもの（炎の壁・ポイズンミスト・ダークホール）

  // depth：強さの深さ（docs/draft.md 2。深さ d で HP ×(1＋0.12×(d−1))、攻撃 ×(1＋0.10×(d−1))）。省くと1。
  function spawn(type, x, y, depth) {
    var d = GameData.ENEMIES[type];
    var k = Math.max(0, (depth || 1) - 1);
    var hp = Math.round(d.hp * (1 + 0.12 * k)), patk = Math.round(d.patk * (1 + 0.10 * k) * 10) / 10;
    var matk = Math.round((d.matk || 0) * (1 + 0.10 * k) * 10) / 10;   // 魔攻（魔法で攻撃する敵。2026-10-21）
    var e = {
      type: type, def: d, x: x, y: y, r: d.r,
      hp: hp, maxHp: hp, patk: patk, matk: matk, pdef: d.pdef, mdef: d.mdef, res: d.res,
      state: "chase", t: 0, cd: 0.6 + Math.random() * 0.8,
      face: { x: -1, y: 0 }, aim: null, flash: 0, dead: false, fade: 0.4,
      strafe: Math.random() < 0.5 ? 1 : -1, walk: Math.random() * 6, status: {},
      fly: d.kind === "wisp" || d.kind === "dwisp" || !!d.fly   // 瘴気の霊・ダークウィスプ・大コウモリは浮いている（水の上も通る）
    };
    list.push(e);
    return e;
  }

  function clear() { list.length = 0; arrows.length = 0; fxs.length = 0; rivalLater.length = 0; rivalZones.length = 0; Bosses.clear(); }

  // ---------- 闘技場の相手（2026-10-30）：相手のプレイヤーの仲間を、CPU が動かす敵にする ----------
  // 能力は仲間と同じ（装備・パッシブをふくむ GameState.heroStats）。動きは武器で決める：
  //   弓 → 弓兵、杖（魔術師の系統）→ 魔導士（魔法の玉）、槍 → 槍兵、それ以外 → 近くで斬る。スキルはまだ使わない（段階2の最初の版）
  // 攻撃の強さは「攻撃力 × 武器の倍率」（仲間のふつうの攻撃と同じ）。属性の弱点はない
  function rivalDef(h, idx) {
    var st = GameState.heroStats(h), wt = GameState.heroWeaponType(h), W = GameData.WEAPONS[wt] || GameData.WEAPONS.sword;
    var wait = GameData.weaponWait(wt, h.job) * (st.waitMul || 1);
    var mage = !!(W.bolt && GameData.inLine(h.job, W.boltFor));
    var d = {
      name: h.name, notInBook: true, rivalOf: idx, hp: st.hp, pdef: st.pdef, mdef: st.mdef, res: {}, r: 6, speed: 38,
      patk: Math.round(st.patk * (W.power || 1) * 10) / 10, matk: 0,
      windup: 0.3, cooldown: Math.max(0.25, wait - 0.3), lunge: 4, color: "#c8c0a8"
    };
    if (wt === "bow") { d.kind = "archer"; d.keepMin = 60; d.keepMax = 110; d.arrowSpeed = (W.shot && W.shot.speed) || 170; d.windup = 0.35; }
    else if (mage) { d.kind = "caster"; d.matk = Math.round(st.matk * (W.bolt.power || 1) * 10) / 10; d.keepMin = 45; d.keepMax = 80; d.orbSpeed = W.bolt.speed || 140; d.windup = 0.4; d.cooldown = Math.max(0.3, wait - 0.4); }
    else if (wt === "spear") { d.kind = "spear"; d.reach = W.reach || 28; d.keep = 18; }
    else { d.kind = "melee"; d.reach = W.reach || 18; }
    return d;
  }
  // 相手の仲間 h を、x・y に出す。idx：何人目か（0〜2）
  // store：闘技場の記録（交代しても HP・MP・スキルの待ち時間が続くように）
  function spawnRival(h, idx, x, y, store) {
    var type = "rival_" + idx;
    GameData.ENEMIES[type] = rivalDef(h, idx);
    var e = spawn(type, x, y, 1);
    var st = GameState.heroStats(h), wt = GameState.heroWeaponType(h);
    e.rival = { hero: h, idx: idx, job: h.job, hair: h.face || 0, weapon: wt, store: store || {} };
    e.face = { x: 0, y: 1 };
    // スキル（2026-10-30 保護者の希望：まだ持っていない職業の技を見て、興味をもてるように）
    var S = e.rival.store;
    if (S.mp === undefined || S.mp === null) S.mp = st.mp;
    S.ct = S.ct || {};
    e.maxMp = st.mp;
    e.base = { patk: e.patk, matk: e.matk, pdef: e.pdef, mdef: e.mdef, cooldown: e.def.cooldown, sp: st.patk, sm: st.matk, reach: (GameData.WEAPONS[wt] || {}).reach || 18 };
    e.bf = []; e.skTry = 1.5;
    e.plans = rivalPlans(h, e);
    return e;
  }

  // ---------- 闘技場の相手のスキル（2026-10-30） ----------
  // 仲間のスキル（data.js の fx）を、CPU が使える形にまとめる。動きは仲間のスキルと同じではなく、
  // 「構え（名前を出す）→ 技が出る」の形にそろえる：
  //   近くの攻撃（arc・around・rapid・dash）＝届けば当たる、遠くの攻撃（shot・beam・zone・rain・summon）＝光る玉を飛ばす、
  //   回復（heal・regen・cure）＝自分の HP、強くする（buff・enchant）＝自分の能力を少しのあいだ上げる。
  //   ほかの技（隠れる・チャーム・復活など）は使わない
  var RIVAL_STATUS = { poison: 1, para: 1, sleep: 1 };
  function rivalPlans(h, e) {
    var out = [];
    GameState.activeSlots(h).forEach(function (id) {
      var s = id && GameData.SKILL[id];
      if (!s || s.passive || !s.fx) return;
      var p = { id: id, name: s.name, mp: s.mp || 0, ct: s.ct || 4, prep: 0.5, mult: 0, range: 0, ranged: false, magic: false,
                heal: 0, cure: false, buffs: [], status: null, color: "", fx: [] };
      function dmg(f, k) {
        p.mult += (f.mult || 0) * k;
        if (f.stat === "m" || (f.stat === "best" && e.base.sm > e.base.sp)) p.magic = true;
        if (f.status && RIVAL_STATUS[f.status.type] && !p.status) p.status = f.status;
        if (f.color && !p.color) p.color = f.color;
      }
      s.fx.forEach(function (f) {
        if (f.t === "shot" || f.t === "beam" || f.t === "rain" || f.t === "zone") p.fx.push(f);   // 仲間と同じ見た目で出す（2026-10-31）
        if (f.t === "charge") p.prep += f.time || 0;
        else if (f.t === "arc") { dmg(f, 1); p.range = Math.max(p.range, f.reach || e.base.reach + 4); }
        else if (f.t === "around") { dmg(f, 1); p.range = Math.max(p.range, f.radius || 26); p.ring = true; }
        else if (f.t === "rapid") {
          var hs = f.hits || [f.hit];
          for (var i = 0; i < (f.count || 1); i++) { var hh = hs[i % hs.length]; if (hh) dmg(hh, 1); }
          p.range = Math.max(p.range, e.base.reach + 4 + (f.step || 0) * 2); p.rapid = f.count || 1;
        }
        else if (f.t === "dash") p.range += f.dist || 0;
        else if (f.t === "shot" || f.t === "beam") { dmg(f, 1); p.ranged = true; p.range = Math.max(p.range, f.range || f.length || 130); p.speed = f.speed || 180; }
        else if (f.t === "zone") { dmg(f, Math.max(1, (f.dur || 3) / (f.tick || 0.5)) * 0.5); p.ranged = true; p.range = Math.max(p.range, (f.dist || 30) + (f.radius || 20) + 40); }
        else if (f.t === "rain") { dmg(f, (f.count || 3) * 0.6); p.ranged = true; p.range = Math.max(p.range, (f.dist || 56) + (f.radius || 26)); }
        else if (f.t === "summon") { dmg(f, 1); p.ranged = true; p.range = Math.max(p.range, 110); }
        else if (f.t === "heal" || f.t === "regen") p.heal += f.pct || 0;
        else if (f.t === "cure") p.cure = true;
        else if (f.t === "buff" && /^(patk|matk|pdef|mdef|wait)$/.test(f.stat)) p.buffs.push({ stat: f.stat, pct: f.pct, dur: f.dur || 15 });
        else if (f.t === "enchant") p.buffs.push({ stat: "patk", pct: 0.15, dur: f.dur || 15 });
      });
      // はなれて戦う相手（弓・魔法）の近くの技は、光る玉にして飛ばす（近づかないので、そのままでは届かない）
      if ((p.mult > 0 || p.status) && !p.ranged && (e.def.kind === "archer" || e.def.kind === "caster")) { p.fx = []; p.ranged = true; p.range = Math.max(p.range, 90); p.ring = false; }
      if (p.mult > 0 || p.status) p.kind = "attack";   // ダメージのない技（スリープなど）は、状態異常だけ
      else if (p.heal > 0 || p.cure) p.kind = "heal";
      else if (p.buffs.length) p.kind = "buff";
      else return;   // CPU が使えない技
      if (!p.color) p.color = p.kind === "heal" || p.kind === "buff" ? "#8ce0a0" : p.magic ? "#c9a8ff" : "#ffd24a";
      out.push(p);
    });
    return out;
  }
  // 強くする技の効き目を、今の能力に入れなおす
  function rivalStats(e) {
    var m = { patk: 1, matk: 1, pdef: 1, mdef: 1, wait: 1 };
    e.bf.forEach(function (b) { m[b.stat] += b.pct; });
    e.patk = e.base.patk * m.patk; e.matk = e.base.matk * m.matk; e.pdef = e.base.pdef * m.pdef; e.mdef = e.base.mdef * m.mdef;
    e.mul = m;
  }
  // 毎フレーム：スキルを構えている・使うか決める。スキルを構えているあいだは true（ふつうの動きをしない）
  function rivalSkill(e, dt, P, gap, ux, uy, hit) {
    var S = e.rival.store;
    Object.keys(S.ct).forEach(function (k) { S.ct[k] = Math.max(0, S.ct[k] - dt); });
    for (var i = e.bf.length - 1; i >= 0; i--) { e.bf[i].t -= dt; if (e.bf[i].t <= 0) { e.bf.splice(i, 1); rivalStats(e); } }
    if (e.state === "cast") {
      e.t -= dt;
      e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
      if (e.t <= 0) rivalCast(e, P, gap, hit);
      return true;
    }
    e.skTry -= dt;
    if (e.skTry > 0 || e.state !== "chase" || P.down || e.status.para) return false;
    e.skTry = 0.6 + Math.random() * 0.8;   // 少し間をあけて考える
    var low = e.hp < e.maxHp * 0.45;
    var ok = e.plans.filter(function (p) {
      if ((S.ct[p.id] || 0) > 0 || S.mp < p.mp) return false;
      if (p.kind === "heal") return low || (p.cure && Object.keys(e.status).length > 0);
      if (p.kind === "buff") return !e.bf.some(function (b) { return b.from === p.id; });
      return gap <= p.range * (p.ranged ? 0.9 : 1);
    });
    if (!ok.length || Math.random() < 0.25) return false;
    var heal = ok.filter(function (p) { return p.kind === "heal"; });
    var p = heal.length ? heal[0] : ok[Math.floor(Math.random() * ok.length)];
    S.mp -= p.mp; S.ct[p.id] = p.ct;
    e.state = "cast"; e.t = p.prep; e.cast = p;
    e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
    Sound.play("skill");
    return true;
  }
  function rivalCast(e, P, gap, hit) {
    var p = e.cast;
    e.cast = null; e.state = "recover"; e.t = 0.45; e.cd = e.def.cooldown;
    if (p.kind === "heal") {
      var add = Math.round(e.maxHp * p.heal);
      if (add > 0) { e.hp = Math.min(e.maxHp, e.hp + add); Battle.pop(e.x, e.y - 24, "+" + add, "#7ee08a", 10); }
      if (p.cure) e.status = {};
      fxs.push({ kind: "ring", e: e, col: p.color, reach: 14, t: 0.5, max: 0.5 });
      return;
    }
    if (p.kind === "buff") {
      p.buffs.forEach(function (b) { e.bf.push({ stat: b.stat, pct: b.pct, t: b.dur, from: p.id }); });
      rivalStats(e);
      fxs.push({ kind: "ring", e: e, col: p.color, reach: 14, t: 0.5, max: 0.5 });
      Battle.pop(e.x, e.y - 24, "パワーアップ！", p.color, 8);
      return;
    }
    // 攻撃：強さは「攻撃力 × スキルの倍率」（仲間のスキルと同じ）。強くする技の効き目も入れる
    var m = e.mul || { patk: 1, matk: 1 };
    var opts = { atk: p.magic ? e.base.sm * m.matk : e.base.sp * m.patk, mult: p.mult, magic: p.magic, status: p.status, big: p.mult >= 2, noDamage: p.mult <= 0 };
    if (p.ranged && p.fx.length) { p.fx.forEach(function (f) { rivalFire(e, p, f, P); }); return; }
    if (p.ranged) {   // 呼び出し（魔物使い）など：光る玉を飛ばす
      var sp = p.speed || 170;
      arrows.push({ x: e.x + e.aim.x * 7, y: e.y - 4 + e.aim.y * 7, vx: e.aim.x * sp, vy: e.aim.y * sp, life: Math.max(0.6, p.range / sp + 0.2), from: e,
                    opts: { skillShot: true, color: p.color, size: p.mult >= 2 ? 6 : 4, atk: opts.atk, mult: opts.mult, magic: opts.magic, status: opts.status, big: opts.big, noDamage: opts.noDamage } });
      return;
    }
    if (p.ring) fxs.push({ kind: "ring", e: e, col: p.color, reach: p.range, t: 0.3, max: 0.3 });
    else fxs.push({ kind: "slash", col: p.color, e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: p.range, t: 0.25, max: 0.25, flip: Math.random() < 0.5 });
    if (!P.down && gap <= p.range + 4) hit(e, P.x, P.y - 8, opts);
  }
  // 闘技場の相手が、遠くへのスキルを仲間のスキルと同じ見た目で出す（2026-10-31 保護者の希望：三本矢がただの玉になっていた）
  //   shot＝矢・火の玉・手裏剣など（数・広がりも同じ）、rain＝矢の雨・メテオ（ねらった場所に落ちる）、
  //   zone＝炎の壁・ポイズンミスト・ダークホール（その場に残って、中にいると当たる）、beam＝前へのびる光のビーム
  function rivalOpts(e, f, p) {
    var m = e.mul || { patk: 1, matk: 1 };
    var mg = f.stat === "m" || (f.stat === "best" && e.base.sm > e.base.sp);
    var st = f.status && RIVAL_STATUS[f.status.type] ? f.status : null;
    return { atk: mg ? e.base.sm * m.matk : e.base.sp * m.patk, mult: f.mult || 0, magic: mg, status: st, big: (f.mult || 0) >= 2, noDamage: !(f.mult > 0) };
  }
  function rivalFire(e, p, f, P) {
    var o = rivalOpts(e, f, p), ang = Math.atan2(e.aim.y, e.aim.x);
    if (f.t === "shot") {
      var n = f.count || 1, spread = f.spread || 0, speed = f.speed || 170, range = f.range || 150;
      var col = f.color || (o.magic ? "#c9a8ff" : "#e8d8b0");
      for (var k = 0; k < n; k++) {
        var a = ang + (k - (n - 1) / 2) * spread;
        arrows.push({ x: e.x + Math.cos(a) * 6, y: e.y - 3 + Math.sin(a) * 6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: range / speed, from: e,
                      opts: { skillShot: true, spec: f, color: col, size: f.size || 1, arrow: !f.size, pierce: !!f.pierce, explode: f.explode || 0,
                              atk: o.atk, mult: o.mult, magic: o.magic, status: o.status, big: o.big, noDamage: o.noDamage } });
      }
      return;
    }
    if (f.t === "rain") {   // ねらった相手の足もとに降らせる
      var cx = P.x, cy = P.y;
      if (f.look === "meteor") {
        Combat.addEffect({ kind: "ring", x: cx, y: cy, r: f.radius + 10, t: 0.3 + f.count * 0.3 + 0.4, max: 0.3 + f.count * 0.3 + 0.4, color: "#ff8a3d" });
        for (var mm = 0; mm < f.count; mm++) {
          var an = Math.random() * Math.PI * 2, dd = Math.random() * f.radius * 0.8;
          rivalDrop(e, o, cx + Math.cos(an) * dd, cy + Math.sin(an) * dd * 0.7, 0.1 + mm * 0.3, 0.3, f.hitRadius || 22, "meteor");
        }
        return;
      }
      Combat.addEffect({ kind: "ring", x: cx, y: cy, r: f.radius, t: 0.15 + f.count * 0.12 + 0.3, max: 0.15 + f.count * 0.12 + 0.3, color: "#e8d8b0" });
      for (var r = 0; r < f.count; r++) {
        rivalDrop(e, o, cx + (Math.random() - 0.5) * f.radius * 1.4, cy + (Math.random() - 0.5) * f.radius * 1.4, 0.05 + r * 0.12, 0.12, 12, "arrowfall");
      }
      return;
    }
    if (f.t === "zone") {   // ねらった相手のところに出す（はなれれば当たらない）
      var gx = e.x + e.aim.x * Math.max(f.dist || 30, 0), gy = e.y + e.aim.y * Math.max(f.dist || 30, 0);
      var toP = Math.sqrt((P.x - e.x) * (P.x - e.x) + (P.y - e.y) * (P.y - e.y));
      if (toP > (f.dist || 30)) { gx = P.x; gy = P.y; }
      rivalZones.push({ e: e, f: f, o: o, x: gx, y: gy, t: f.dur || 3, max: f.dur || 3, tick: 0.2 });
      return;
    }
    if (f.t === "beam") {   // 十字の光のあと、前へ光のビーム
      var bx0 = e.x, by0 = e.y - 4;
      Combat.addEffect({ kind: "crossflash", e: { x: e.x, y: e.y, face: { x: e.aim.x, y: e.aim.y } }, t: 0.35, max: 0.35, color: f.color || "#fff2a0" });
      rivalLater.push({ t: 0.3, fn: function (pp, hurt, room) {
        var ux = Math.cos(ang), uy = Math.sin(ang), len = f.length || 190;
        for (var d0 = 8; d0 < len; d0 += 4) {
          if (room.blocksShot(Math.floor((bx0 + ux * d0) / World.TILE), Math.floor((by0 + 4 + uy * d0) / World.TILE))) { len = d0; break; }
        }
        Combat.addEffect({ kind: "beam", x: bx0, y: by0, ang: ang, len: len, w: f.width || 16, t: 0.55, max: 0.55, color: f.color || "#fff2a0" });
        Sound.play("hit");
        var ex = pp.x - bx0, ey = (pp.y - 3) - by0, along = ex * ux + ey * uy, side = Math.abs(-ex * uy + ey * ux);
        if (!pp.down && along > -pp.r && along < len + pp.r && side <= (f.width || 16) / 2 + pp.r) hurt(e, pp.x, pp.y - 8, o);
      } });
    }
  }
  // 空から落ちてくるもの（矢の雨の1本・メテオの1つ）：wait 秒後に落ちはじめ、さらに land 秒後に当たる
  function rivalDrop(e, o, x, y, wait, land, rad, look) {
    rivalLater.push({ t: wait, fn: function () {
      Combat.addEffect({ kind: look, x: x, y: y, t: look === "meteor" ? 0.75 : 0.45, max: look === "meteor" ? 0.75 : 0.45 });
      rivalLater.push({ t: land, fn: function (pp, hurt) {
        if (look === "meteor") { Combat.addEffect({ kind: "boom", x: x, y: y, r: rad, t: 0.45, max: 0.45 }); Sound.play("hit"); }
        var dx = pp.x - x, dy = pp.y - y;
        if (!pp.down && dx * dx + dy * dy <= (rad + pp.r) * (rad + pp.r)) hurt(e, pp.x, pp.y - 8, o);
      } });
    } });
  }
  function updateRivalFx(dt, p, hurt, room) {
    for (var i = rivalLater.length - 1; i >= 0; i--) {
      var q = rivalLater[i];
      q.t -= dt;
      if (q.t <= 0) { rivalLater.splice(i, 1); q.fn(p, hurt, room); }
    }
    for (var z = rivalZones.length - 1; z >= 0; z--) {
      var zn = rivalZones[z];
      zn.t -= dt; zn.tick -= dt;
      if (zn.tick <= 0) {
        zn.tick = zn.f.tick || 0.5;
        var dx = p.x - zn.x, dy = p.y - zn.y, rr = (zn.f.radius || 20) + p.r;
        if (!p.down && dx * dx + dy * dy <= rr * rr) hurt(zn.e, p.x, p.y - 8, zn.o);
      }
      if (zn.t <= 0) rivalZones.splice(z, 1);
    }
  }
  function remove(e) { var i = list.indexOf(e); if (i >= 0) list.splice(i, 1); }
  function drawRival(ctx, e, x, y) {
    var R = e.rival, moving = e.state === "chase";
    var ph = Math.sin(e.walk || 0);
    var atk = e.state === "windup" || (e.state === "recover" && e.t > 0.2);
    var frame = atk ? "attack" : !moving ? "stand" : ph > 0.3 ? "walkA" : ph < -0.3 ? "walkB" : "stand";
    var dd = Sprites.dirOf(e.face);
    var mode = atk ? "attack" : "hold";
    var behind = mode === "hold" ? dd.dir !== "down" : dd.dir === "up";
    Render.rect(x - 6, y + 5, 12, 3, "rgba(0,0,0,0.35)");
    if (e.flash > 0) Combat.glowDot(ctx, x, y - 6, 14, "#ffffff", "#ffffff", 0.6);
    if (behind) Sprites.drawWeapon(ctx, R.weapon, e.face, x, y + 6, mode, 0);
    Sprites.drawHero(ctx, R.job, R.hair, e.face, frame, x, y + 6);
    if (!behind) Sprites.drawWeapon(ctx, R.weapon, e.face, x, y + 6, mode, 0);
    // 相手のしるし：足もとに赤い輪
    ctx.strokeStyle = "rgba(239,91,91,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y + 5, 8, 3.5, 0, 0, Math.PI * 2); else ctx.arc(x, y + 5, 8, 0, Math.PI * 2); ctx.stroke();
    if (e.dead) return;
    if (e.state === "windup") Render.text("！", x, y - 26, { size: 9, align: "center", bold: true, color: "#ffd24a" });
    if (e.state === "cast" && e.cast) {   // スキルを構えている：まわりがスキルの色に光る
      Combat.glowDot(ctx, x, y - 6, 16, "#ffffff", e.cast.color, 0.35 + 0.2 * Math.sin(Date.now() / 70));
      // 技の名前：構えているあいだ、頭の上に出す（まだ持っていない職業の技を知るきっかけに）
      var nm = e.cast.name + "！", tw = nm.length * 9 + 8;
      Render.rect(x - tw / 2, y - 44, tw, 13, "rgba(10,12,18,0.75)");
      Render.text(nm, x, y - 42, { size: 9, align: "center", bold: true, color: e.cast.color });
    }
    Render.rect(x - 9, y - 21, 18, 2, "#2a2f42");
    Render.rect(x - 9, y - 21, Math.round(18 * Math.max(0, e.hp) / e.maxHp), 2, "#ef5b5b");
    if (e.maxMp) { Render.rect(x - 9, y - 18, 18, 1, "#2a2f42"); Render.rect(x - 9, y - 18, Math.round(18 * Math.max(0, e.rival.store.mp) / e.maxMp), 1, "#5aa9ff"); }
    var marks = Object.keys(e.status).filter(function (k) { return k !== "break"; });
    if (marks.length) Render.text(marks.map(function (k) { return GameData.STATUS[k].name; }).join(" "), x, y + 9, { size: 6, align: "center", color: GameData.STATUS[marks[0]].color });
  }

  // 飛ぶもの（弓兵の矢・大木の魔物の種）。opts はダメージの倍率など（hurt にそのまま渡す）
  function addArrow(e, angle, speed, opts) {
    // opts.dy：投げる高さ（ゴーレムは頭の上から）。opts.life：飛ぶ時間
    // opts.ox・oy：飛び出す場所（ダークエルフの回る闇の玉。2026-10-26）
    var sx = opts && opts.ox !== undefined ? opts.ox : e.x + Math.cos(angle) * (e.r + 2), sy = opts && opts.oy !== undefined ? opts.oy : e.y + (opts && opts.dy || 0) + Math.sin(angle) * (e.r + 2);
    arrows.push({ x: sx, y: sy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                  life: opts && opts.life || 2.6, from: e, opts: opts || null });
  }

  // 状態異常をかける（docs/draft.md 1.7。ボスはあとで：成功率×0.3・長さ半分）
  function addStatus(e, type, dur) {
    if (e.dead) return;
    // ボスには効きにくい：成功率×0.3、長さ半分（docs/draft.md 1.7）
    if (Bosses.isBoss(e)) {
      if (Math.random() >= 0.3) { Battle.pop(e.x, e.y - 30, "効かない", "#a3a8bd", 8); return; }
      dur = dur / 2;
      if (type === "sleep" || type === "para") Bosses.interrupt(e);
    }
    if (type === "poison") e.status.poison = { t: dur, tick: 2 };
    else e.status[type] = { t: dur };
    Battle.pop(e.x, e.y - 30, GameData.STATUS[type].name, GameData.STATUS[type].color, 8);
    if (type === "sleep" || type === "para") { if (e.state === "windup" || e.state === "warn" || e.state === "charge") { e.state = "recover"; e.t = 0.2; } }   // ボアの突進の予告・突進も止まる
  }

  function tickStatus(e, dt, onKill) {
    var s = e.status;
    if (s.poison) {
      s.poison.tick -= dt;
      if (s.poison.tick <= 0) {
        s.poison.tick += 2;
        var dmg = Math.max(1, Math.round(e.maxHp * 0.03));
        e.hp -= dmg;
        Battle.pop(e.x, e.y - 20, String(dmg), GameData.STATUS.poison.color, 9);
        if (e.hp <= 0 && !e.dead) { e.dead = true; onKill(e); }
      }
      s.poison.t -= dt; if (s.poison.t <= 0) delete s.poison;
    }
    ["para", "sleep", "break"].forEach(function (k) { if (s[k]) { s[k].t -= dt; if (s[k].t <= 0) delete s[k]; } });
  }
  function alive() { return list.filter(function (e) { return !e.dead; }); }
  // 味方にした敵（チャーム）をのぞいた、たたかう相手（2026-10-20）
  // untouchable：沼にもぐった大ガマ・消えている沼の魔女（こちらの攻撃が当たらない）
  function hostile() { return list.filter(function (e) { return !e.dead && !e.charm && !e.untouchable; }); }
  // チャーム：敵1体を、決まった時間だけ味方にする（ほかの敵を攻撃し、ほかの敵にもねらわれる）
  function charm(e, dur) {
    if (e.dead || e.def.boss || e.def.fixed) return;
    e.charm = { t: dur };
    e.state = "chase"; e.t = 0; e.cd = 0.3; e.untouchable = false;
    Battle.pop(e.x, e.y - 30, "仲間になった！", "#ff8ac8", 8);
  }
  function uncharm(e) {
    delete e.charm;
    e.state = "chase"; e.t = 0; e.cd = 0.8; e.untouchable = false;   // ダークウィスプが消えかけのままにならないように
    Battle.pop(e.x, e.y - 30, "元にもどった", "#a3a8bd", 8);
  }
  // 敵が敵にダメージを与える（チャームした敵と、ほかの敵のあいだ）
  var killHook = function () {};
  function hitFoe(from, v, opts) {
    if (v.dead) return;
    opts = opts || {};
    var mag = opts.magic;   // 魔法の攻撃は、魔攻と魔防で
    var res = Battle.damage((mag ? from.matk : from.patk) * (opts.mult || 1), mag ? v.mdef : v.pdef, { element: "none", res: null, crit: 0, minPct: 0.3 });
    v.hp -= res.amount; v.flash = 0.1;
    Battle.showHit(v.x, v.y - 20, res, false);
    Sound.play("hit");
    var st = opts.status || from.def.onHit;
    if (st && Math.random() < st.chance) addStatus(v, st.type, st.dur);
    if (v.hp <= 0) { v.dead = true; Sound.play("kill"); killHook(v); }   // 味方がたおした敵のごほうびも、もらえる
  }
  // e のねらう相手：ふつうの敵はプレイヤーかチャームした敵のうち近いほう、チャームした敵はいちばん近い敵。いなければ null
  // プレイヤーは、隠れみの術のあいだはねらわれない
  function pickTarget(e, p) {
    var best = null, bd = 0;
    function consider(t) {
      var dx = t.x - e.x, dy = t.y - e.y, d = dx * dx + dy * dy;
      if (!best || d < bd) { best = t; bd = d; }
    }
    if (e.charm) { hostile().forEach(function (o) { if (o !== e) consider(o); }); return best; }
    if (!p.down && !(p.hidden > 0)) consider(p);
    list.forEach(function (o) { if (!o.dead && o.charm) consider(o); });
    return best;
  }

  // 毎フレーム：p はプレイヤー、hurt(e, amount元の攻撃力) はプレイヤーにダメージを与える関数
  var api = { spawn: function (t, x, y, depth) { return spawn(t, x, y, depth); }, alive: function () { return hostile(); },
              addArrow: function (e, a, s, o) { addArrow(e, a, s, o); } };
  var hooksRoom = null;   // 攻撃のときにふみこむために、今の部屋を覚えておく
  function update(dt, room, p, hurt, onKill) {
    hooksRoom = room;
    killHook = onKill;
    var foes = hostile().length;
    updateFx(dt);
    list.forEach(function (e) {
      e.flash = Math.max(0, e.flash - dt);
      e.lash = Math.max(0, (e.lash || 0) - dt);
      e.sweep = Math.max(0, (e.sweep || 0) - dt);
      e.pollenFx = Math.max(0, (e.pollenFx || 0) - dt);
      e.puff = Math.max(0, (e.puff || 0) - dt);
      e.thrust = Math.max(0, (e.thrust || 0) - dt);
      e.burst = Math.max(0, (e.burst || 0) - dt);
      e.birth = Math.max(0, (e.birth || 0) - dt);   // モンスターの巣が敵を出したときの輪
      if (e.dead) { e.fade -= dt; return; }
      tickStatus(e, dt, onKill);
      if (e.dead) return;
      if (e.status.sleep) return; // 眠っているあいだは何もしない
      if (Bosses.isBoss(e)) { Bosses.update(e, dt, room, p, hurt, api); return; }
      // チャーム（2026-10-20）：時間が来るか、部屋のほかの敵がいなくなったら元にもどる
      if (e.charm) { e.charm.t -= dt; if (e.charm.t <= 0 || foes === 0) uncharm(e); }
      var P = p, hit = hurt;
      var tg = pickTarget(e, p);
      if (tg && tg !== p) { P = { x: tg.x, y: tg.y, r: tg.r, down: tg.dead }; hit = function (from, x, y, opts) { hitFoe(from, tg, opts); }; }
      else if (!tg) { P = { x: e.x + e.face.x * 999, y: e.y + e.face.y * 999, r: 0, down: true }; if (e.state === "windup") { e.state = "recover"; e.t = 0.3; } }
      var dx = P.x - e.x, dy = P.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      var ux = dx / dist, uy = dy / dist;
      var gap = dist - e.r - P.r; // おたがいのふちの間の距離
      var d = e.def;
      e.cd = Math.max(0, e.cd - dt);
      var mx = 0, my = 0;
      if (e.rival && rivalSkill(e, dt, P, gap, ux, uy, hit)) return;              // 闘技場の相手のスキル（2026-10-30）
      if (d.kind === "boar" && boar(e, dt, room, P, hit, ux, uy, gap)) return;   // 突進の予告・突進・ふらつき
      if (d.kind === "dwisp" && darkWisp(e, dt, room, P, gap)) return;           // 消える・現れる

      if (e.state === "windup") {
        e.t -= dt;
        if (e.t <= 0) attack(e, P, gap, hit);
      } else if (e.state === "recover") {
        e.t -= dt;
        if (e.t <= 0) e.state = "chase";
      } else if (P.down) {
        // プレイヤーが倒れているあいだ（ねらう相手がいないとき）は様子を見る
      } else if (d.kind === "melee") {
        // 届くところまで来たら構える（2026-10-18：前は届くところより少し手前まで近づいてから）
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
        else if (gap > d.reach - 2) { mx = ux; my = uy; }
      } else if (d.kind === "spear") {
        if (gap > d.keep + 8) { mx = ux; my = uy; }
        else if (gap < d.keep - 6) { mx = -ux; my = -uy; }
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "vine") {
        if (gap <= d.reach - 4 && e.cd <= 0) startWindup(e, ux, uy);
        else e.face = { x: ux, y: uy };
      } else if (d.kind === "spore") {
        // キノコ：ゆっくり近づき、届くところで胞子をまく
        if (gap > d.reach - 6) { mx = ux; my = uy; }
        if (gap <= d.reach - 4 && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "bee") {
        // 蜂：横にゆれながら（じぐざぐに）近づく
        e.zig = (e.zig || Math.random() * 6) + dt * 7;
        var sw = Math.sin(e.zig) * 0.9;
        if (gap > d.reach - 2) { mx = ux - uy * sw; my = uy + ux * sw; var ml = Math.sqrt(mx * mx + my * my) || 1; mx /= ml; my /= ml; }
        else if (e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "frog") {
        // 毒ガエル（2026-10-21）：はねて動く。はねているあいだだけ進み、とどくところでは毒のつばを吐く
        e.face = { x: ux, y: uy };
        e.hopCd = (e.hopCd === undefined ? Math.random() * d.hopEvery : e.hopCd) - dt;
        if (e.hop > 0) {
          e.hop -= dt;
          if (!e.status.para) room.move(e, e.hopDir.x * d.hopSpeed * dt, e.hopDir.y * d.hopSpeed * dt);
        } else if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
        else if (e.hopCd <= 0) {
          // 遠ければ近づき、近すぎれば少し下がる。あいだなら横へ
          var hx2 = gap > d.keep + 10 ? ux : gap < d.keep - 10 ? -ux : -uy * e.strafe;
          var hy2 = gap > d.keep + 10 ? uy : gap < d.keep - 10 ? -uy : ux * e.strafe;
          e.hopDir = { x: hx2, y: hy2 }; e.hop = d.hopTime; e.hopCd = d.hopEvery; e.strafe = -e.strafe;
        }
      } else if (d.kind === "lizard") {
        // 火トカゲ（黒鉄の坑道、2026-10-27）：少しはなれたところで止まり、とどけば火の玉を吐く
        if (gap > d.keep + 8) { mx = ux; my = uy; }
        else if (gap < d.keep - 8) { mx = -ux; my = -uy; }
        else e.face = { x: ux, y: uy };
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "caster") {
        // 影の魔導士（2026-10-21）：弓兵と同じく離れて回りこみ、闇の玉を撃つ
        if (gap < d.keepMin) { mx = -ux; my = -uy; }
        else if (gap > d.keepMax) { mx = ux; my = uy; }
        else { mx = -uy * e.strafe * 0.5; my = ux * e.strafe * 0.5; }
        if (gap <= d.keepMax + 20 && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "dwisp") {
        // ダークウィスプ（原生の秘境、段階3）：ゆらゆら漂いながら、はなれたところを回り、闇の玉を撃つ（消えるのは darkWisp()）
        e.zig = (e.zig || Math.random() * 6) + dt * 2.5;
        var sw4 = Math.sin(e.zig) * 0.5;
        if (gap < d.keepMin) { mx = -ux; my = -uy; }
        else if (gap > d.keepMax) { mx = ux; my = uy; }
        else { mx = -uy * e.strafe * 0.5; my = ux * e.strafe * 0.5; }
        mx += -uy * sw4; my += ux * sw4;
        if (gap <= d.keepMax + 20 && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "wisp") {
        // 瘴気の霊（2026-10-21）：ゆらゆらしながら近づき、とどくところで瘴気をはじけさせる
        e.zig = (e.zig || Math.random() * 6) + dt * 3;
        var sw2 = Math.sin(e.zig) * 0.6;
        if (gap > d.reach - 4) { mx = ux - uy * sw2; my = uy + ux * sw2; var ml2 = Math.sqrt(mx * mx + my * my) || 1; mx /= ml2; my /= ml2; }
        // 岩などにつかえたら、しばらく横へ回りこむ
        if (e.detour > 0) { e.detour -= dt; mx = -uy * e.strafe; my = ux * e.strafe; }
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "wolf") {
        // オオカミ（原生の秘境、2026-10-25）：とどけばとびこんでかみつく。休みのあいだは、少しはなれてまわりを回る（群れでかこむ）
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
        else if (e.cd > 0 && gap < d.circle + 20) {
          var out = gap < d.circle - 6 ? -0.7 : gap > d.circle + 6 ? 0.5 : 0;
          mx = -uy * e.strafe + ux * out; my = ux * e.strafe + uy * out;
          var ml3 = Math.sqrt(mx * mx + my * my) || 1; mx /= ml3; my /= ml3;
        } else if (gap > d.reach - 2) { mx = ux; my = uy; }
      } else if (d.kind === "boar") {
        // ワイルドボア：ゆっくり近づき、近くでは牙でつき上げる（突進は boar()）
        if (gap <= d.reach && e.cd <= 0) startWindup(e, ux, uy);
        else if (gap > d.reach - 2) { mx = ux; my = uy; }
      } else if (d.kind === "archer") {
        if (gap < d.keepMin) { mx = -ux; my = -uy; }
        else if (gap > d.keepMax) { mx = ux; my = uy; }
        else { mx = -uy * e.strafe * 0.5; my = ux * e.strafe * 0.5; }
        if (gap <= d.keepMax + 30 && e.cd <= 0) startWindup(e, ux, uy);
      }
      if (e.status.para) { mx = 0; my = 0; } // しびれているあいだは動けない（攻撃はできる）
      if (e.state === "chase" || mx || my) {
        if (mx || my) {
          e.face = { x: mx, y: my };
          if (((d.kind !== "archer" && d.kind !== "caster" && d.kind !== "dwisp") || gap >= d.keepMin) && d.kind !== "bee") e.face = { x: ux, y: uy };
          var before = { x: e.x, y: e.y };
          room.move(e, mx * d.speed * dt, my * d.speed * dt);
          if ((d.kind === "archer" || d.kind === "caster" || d.kind === "dwisp") && Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < 0.01) e.strafe = -e.strafe;
          if (d.kind === "wolf" && e.cd > 0 && Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < d.speed * dt * 0.3) e.strafe = -e.strafe;   // 回っていて岩につかえたら、反対へ
          if (d.kind === "wisp" && Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < d.speed * dt * 0.3) {
            if (e.detour > 0) e.strafe = -e.strafe;   // 回りこんでもつかえたら、反対へ
            e.detour = 0.9;
          }
          e.walk += dt * 8;
        }
      }
    });

    Bosses.updateHazards(dt, p, hurt);

    // 敵どうし・プレイヤーと重ならないように押し合う（ボスは押されない。沼にもぐった・消えたボスは押さない）
    var live = alive().filter(function (o) { return !o.untouchable; });
    for (var i = 0; i < live.length; i++) {
      var a = live[i];
      for (var j = i + 1; j < live.length; j++) push(a, live[j], room);
      if (Bosses.isBoss(a) || a.def.fixed) continue;
      var dx = a.x - p.x, dy = a.y - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001, min = a.r + p.r;
      if (dist < min) room.move(a, dx / dist * (min - dist), dy / dist * (min - dist));
    }

    if (rivalLater.length || rivalZones.length) updateRivalFx(dt, p, hurt, room);

    // 矢
    for (var k = arrows.length - 1; k >= 0; k--) {
      var ar = arrows[k];
      ar.life -= dt;
      if (ar.opts && ar.opts.curve) {   // 曲がる弾（ダークアロー）：少しずつ向きを回して、うずまきに広がる
        var cr = ar.opts.curve * dt, cc = Math.cos(cr), cs = Math.sin(cr), nvx = ar.vx * cc - ar.vy * cs;
        ar.vy = ar.vx * cs + ar.vy * cc; ar.vx = nvx;
      }
      if (ar.opts && ar.opts.skillShot) { ar.trail = ar.trail || []; ar.trail.push({ x: ar.x, y: ar.y }); if (ar.trail.length > 7) ar.trail.shift(); }
      ar.x += ar.vx * dt; ar.y += ar.vy * dt;
      var tx = Math.floor(ar.x / World.TILE), ty = Math.floor(ar.y / World.TILE);
      var hitWall = room.blocksShot(tx, ty);
      // 矢が当たる相手：チャームした敵の矢はほかの敵に、ふつうの敵の矢はプレイヤーとチャームした敵に
      var foe = null;
      list.forEach(function (o) {
        if (foe || o.dead || o === ar.from || !!o.charm === !!ar.ally) return;
        if (ar.hits && ar.hits.indexOf(o) >= 0) return;   // 貫通する矢（ダークアロー）は、同じ相手に1回だけ
        var ox = ar.x - o.x, oy = ar.y - (o.y - 3);
        if (ox * ox + oy * oy < (o.r + 2) * (o.r + 2)) foe = o;
      });
      if (foe) {
        hitFoe(ar.from, foe, ar.opts);
        if (ar.opts && ar.opts.pierce) { (ar.hits = ar.hits || []).push(foe); continue; }   // 貫通する矢は、そのまま飛ぶ
        arrows.splice(k, 1); continue;
      }
      var ddx = ar.x - p.x, ddy = ar.y - p.y, hr = p.r + 2 + (ar.opts && ar.opts.rad || 0);   // rad：大きなもの（ゴーレムの岩）
      if (!ar.ally && !p.down && !ar.hitP && ddx * ddx + ddy * ddy < hr * hr) {
        hurt(ar.from, ar.x, ar.y, ar.opts);
        if (ar.opts && ar.opts.explode) { Combat.addEffect({ kind: "boom", x: ar.x, y: ar.y, r: ar.opts.explode, t: 0.45, max: 0.45 }); Sound.play("hit"); }   // フレイムボムなど
        if (ar.opts && ar.opts.pierce) { ar.hitP = true; continue; }   // 貫通する矢（ダークアロー）は、当たってもそのまま飛ぶ
        if (ar.opts && ar.opts.rock) rockBreak(ar, false);
        arrows.splice(k, 1); continue;
      }
      if (hitWall || ar.life <= 0) { if (ar.opts && ar.opts.rock) rockBreak(ar, hitWall); arrows.splice(k, 1); }
    }

    // 消えきった敵をのぞく
    for (var m = list.length - 1; m >= 0; m--) if (list[m].dead && list[m].fade <= 0) list.splice(m, 1);
  }

  // ダークウィスプ（原生の秘境、段階3、2026-10-25）。この関数が動きを受け持ったフレームは true を返す。
  // ときどき（blinkEvery〜＋2秒ごと）消えて、べつの場所に現れ、すぐに闇の玉を構える。
  // 近くにいられたら、前に消えてから fleeAfter 秒たっていれば早めに消える（すぐには消えないので、近くで攻撃するすきがある）。
  // 消えかけ・現れかけのあいだ（blinkTime 秒ずつ）は、こちらの攻撃が当たらない（untouchable）
  function darkWisp(e, dt, room, P, gap) {
    var d = e.def;
    if (e.nextBlink === undefined) { e.nextBlink = 2 + Math.random() * d.blinkEvery; e.sinceBlink = 0; }
    e.sinceBlink += dt;
    if (e.state === "vanish") {
      e.t -= dt;
      if (e.t <= 0) {
        var spot = blinkSpot(e, room, P);
        if (spot) { e.x = spot.x; e.y = spot.y; }
        e.state = "appear"; e.t = d.blinkTime;
      }
      return true;
    }
    if (e.state === "appear") {
      e.t -= dt;
      if (e.t <= 0) {
        e.untouchable = false;
        var dx = P.x - e.x, dy = P.y - e.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
        if (!P.down) { startWindup(e, dx / dl, dy / dl); e.cd = 0; }   // 現れたら、すぐに闇の玉を構える
        else e.state = "chase";
      }
      return true;
    }
    if (e.state !== "chase" || P.down || e.status.para) return false;
    if (e.sinceBlink >= e.nextBlink || (gap < d.fleeGap && e.sinceBlink >= d.fleeAfter)) {
      e.state = "vanish"; e.t = d.blinkTime; e.untouchable = true;
      e.sinceBlink = 0; e.nextBlink = d.blinkEvery + Math.random() * 2;
      return true;
    }
    return false;
  }
  // 現れる場所：壁や水にかからず、ねらう相手から appearMin〜appearMax はなれたところ（なければ、いちばん遠いところ）
  function blinkSpot(e, room, P) {
    var d = e.def, best = null, bd = -1;
    for (var tr = 0; tr < 24; tr++) {
      var x = 30 + Math.random() * (room.pxW - 60), y = 30 + Math.random() * (room.pxH - 60);
      if (room.hitsWall(x - e.r, y - e.r, e.r * 2, e.r * 2)) continue;
      var dd = (x - P.x) * (x - P.x) + (y - P.y) * (y - P.y);
      if (dd > d.appearMin * d.appearMin && dd < d.appearMax * d.appearMax) return { x: x, y: y };
      if (dd > bd) { bd = dd; best = { x: x, y: y }; }
    }
    return best;
  }

  // ワイルドボアの突進（原生の秘境、2026-10-25）。この関数が動きを受け持ったフレームは true を返す。
  // 赤い線で予告（chargeWarn 秒。走り出す0.3秒前までは向きを合わせ直す）→ 線の先（壁の手前、最長 chargeMax）まで走る。
  // 当たると大きめのダメージ（よけられる技）。壁や岩にぶつかって止まると、tired 秒ふらつく（すきあり）
  function boar(e, dt, room, P, hit, ux, uy, gap) {
    var d = e.def;
    e.chargeCd = (e.chargeCd === undefined ? 1.5 + Math.random() * 2 : e.chargeCd) - dt;
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return true; }
    if (e.state === "warn") {
      e.t -= dt;
      if (e.t > 0.3 && !P.down) {
        e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
        e.chargeLen = Math.min(d.chargeMax, Bosses.rayLength(room, e.x, e.y, ux, uy, e.r));
      }
      e.lineX = e.x; e.lineY = e.y;
      if (e.t <= 0) { e.state = "charge"; e.travel = 0; e.hitDone = false; }
      return true;
    }
    if (e.state === "charge") {
      var step = d.chargeSpeed * dt, bx = e.x, by = e.y;
      room.move(e, e.aim.x * step, e.aim.y * step);
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step; e.walk += dt * 20;
      e.dustAt = (e.dustAt || 0) + moved;   // 走ったあとに土けむり
      if (e.dustAt >= 14) { e.dustAt = 0; Bosses.addDust(e.x - e.aim.x * 6 + (Math.random() - 0.5) * 6, e.y + 5); }
      if (!e.hitDone && !P.down) {
        var px = P.x - e.x, py = P.y - e.y;
        if (px * px + py * py < (e.r + P.r + 3) * (e.r + P.r + 3)) {
          e.hitDone = true; hit(e, P.x, P.y - 8, { mult: d.chargeMult, big: true });
          e.state = "recover"; e.t = 0.7; e.cd = d.cooldown;   // 当てたら止まる
          return true;
        }
      }
      if (moved < step * 0.4 || (e.travel >= e.chargeLen && e.chargeLen < d.chargeMax - 4)) {   // 壁・岩にぶつかった
        e.state = "tired"; e.t = d.tired; e.cd = 0.4;
        Battle.pop(e.x, e.y - 26, "すきあり！", "#ffe066", 8);
      } else if (e.travel >= e.chargeLen) { e.state = "recover"; e.t = 0.6; }
      return true;
    }
    if (e.state === "chase" && !P.down && !e.status.para && e.chargeCd <= 0 && gap >= d.chargeMin && gap <= d.chargeRange) {
      var len = Math.min(d.chargeMax, Bosses.rayLength(room, e.x, e.y, ux, uy, e.r));
      if (len < 40) { e.chargeCd = 0.8; return false; }   // 前がふさがっているときは、あとで
      e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; e.chargeLen = len;
      e.state = "warn"; e.t = d.chargeWarn; e.chargeCd = d.chargeEvery + Math.random() * 1.5;
      Battle.pop(e.x, e.y - 26, "突進の構え！", "#ef5b5b", 8);
      return true;
    }
    return false;
  }

  // ゴーレムの岩がくだけた：土けむり
  // ゴーレムの岩がくだける。HP が半分を切ってから投げた岩（split）は、壁などに当たると3つのかけらに割れて、はね返ってくる（かけらも当たる）
  function rockBreak(ar, wall) {
    var o = ar.opts, big = !o.chip;
    Bosses.rockBreak(ar.x, ar.y + 10, big);
    if (!big || !o.split || !wall) return;
    var sp = Math.sqrt(ar.vx * ar.vx + ar.vy * ar.vy) || 1, base = Math.atan2(-ar.vy, -ar.vx), bx = ar.x - ar.vx / sp * 6, by = ar.y - ar.vy / sp * 6;
    for (var i = -1; i <= 1; i++) {
      var a = base + i * 0.55;
      arrows.push({ x: bx, y: by, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.7, from: ar.from,
                    opts: { rock: true, chip: true, mult: o.split, rad: 3, spin: o.spin } });
    }
  }

  function startWindup(e, ux, uy) {
    e.state = "windup";
    e.t = e.def.windup;
    e.aim = { x: ux, y: uy };
    e.face = { x: ux, y: uy };
  }

  function attack(e, p, gap, hurt) {
    var d = e.def;
    e.state = "recover"; e.t = 0.35; e.cd = d.cooldown;
    if (d.kind === "archer") {
      arrows.push({ x: e.x + e.aim.x * 6, y: e.y + e.aim.y * 6, vx: e.aim.x * d.arrowSpeed, vy: e.aim.y * d.arrowSpeed, life: 2.2, from: e, ally: !!e.charm });
      return;
    }
    if (d.kind === "caster" || d.kind === "dwisp") {   // 闇の玉（魔法のダメージ。ダークウィスプも）
      arrows.push({ x: e.x + e.aim.x * 7, y: e.y - 4 + e.aim.y * 7, vx: e.aim.x * d.orbSpeed, vy: e.aim.y * d.orbSpeed, life: 2.6, from: e, ally: !!e.charm, opts: { orb: true, magic: true } });
      return;
    }
    if (d.kind === "wisp") {   // 瘴気がはじける：まわりにとどけば当たる（魔法のダメージ）
      e.burst = 0.4;
      if (!p.down && gap <= d.reach + 4) hurt(e, p.x, p.y - 8, { magic: true });
      return;
    }
    if (d.kind === "frog") {   // 毒のつば（当たると毒になることがある：onHit）。水のスライムは水のつぶ
      arrows.push({ x: e.x + e.aim.x * 6, y: e.y - 2 + e.aim.y * 6, vx: e.aim.x * d.spitSpeed, vy: e.aim.y * d.spitSpeed, life: 1.4, from: e, ally: !!e.charm, opts: d.water ? { drop: true } : { spit: true } });
      return;
    }
    if (d.kind === "lizard") {   // 火トカゲの火の玉（とどく距離は短い）
      arrows.push({ x: e.x + e.aim.x * 7, y: e.y - 3 + e.aim.y * 7, vx: e.aim.x * d.fireSpeed, vy: e.aim.y * d.fireSpeed, life: 0.75, from: e, ally: !!e.charm, opts: { fire: true } });
      return;
    }
    // 近い攻撃：構えたときの向きのまま。届けば当たる。剣士・槍兵は一歩ふみこんで振る（2026-10-18）
    if (d.lunge && hooksRoom) {
      var bx = e.x, by = e.y;
      hooksRoom.move(e, e.aim.x * d.lunge, e.aim.y * d.lunge);
      var stepped = Math.abs(e.x - bx) + Math.abs(e.y - by);
      var ddx = p.x - e.x, ddy = p.y - e.y;
      gap = Math.sqrt(ddx * ddx + ddy * ddy) - e.r - p.r;
      if (gap < 0) { hooksRoom.move(e, -e.aim.x * Math.min(stepped, -gap), -e.aim.y * Math.min(stepped, -gap)); gap = 0; }
    }
    if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8);
    if (d.kind === "vine") e.lash = 0.3;
    if (d.kind === "spore") e.puff = 0.45;   // 胞子の雲を少しのあいだ見せる
    // 攻撃の見た目（2026-10-19）：剣士は赤い斬り、子オオカミはかみつき、蜂は針、槍兵は槍をつき出す
    if (d.kind === "spear") e.thrust = 0.22;
    else if (d.kind === "melee" || d.kind === "wolf") fxs.push({ kind: e.type === "wolf_pup" || d.kind === "wolf" ? "bite" : "slash", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.2, max: 0.2, flip: Math.random() < 0.5 });
    else if (d.kind === "boar") fxs.push({ kind: "slash", col: "#f0e6c8", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.2, max: 0.2, flip: Math.random() < 0.5 });   // 牙のつき上げ（白っぽい）
    else if (d.kind === "bee" && e.type === "bat") fxs.push({ kind: "bite", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.2, max: 0.2 });   // 大コウモリはかみつく
    else if (d.kind === "bee") fxs.push({ kind: "sting", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.18, max: 0.18 });
  }

  // キャラを動かす。生きている敵にめりこむ方向には進めない（すり抜けない）。
  // 横と縦を別々に動かすので、敵のわきはすべるように回りこめる。離れる方向にはいつでも動ける。
  function moveBlocked(room, p, dx, dy) {
    var live = alive().filter(function (o) { return !o.untouchable; });
    function stepAxis(ax, d) {
      if (d === 0) return;
      var ox = p.x, oy = p.y;
      room.move(p, ax === "x" ? d : 0, ax === "y" ? d : 0);
      for (var i = 0; i < live.length; i++) {
        var e = live[i], min = e.r + p.r;
        var nx = p.x - e.x, ny = p.y - e.y, bx = ox - e.x, by = oy - e.y;
        var nd = nx * nx + ny * ny, bd = bx * bx + by * by;
        if (nd < min * min && nd < bd) { p.x = ox; p.y = oy; return; } // 近づいてめりこむなら、動かない
      }
    }
    // 大きく動くとき（うしろとびなど）に敵を飛びこえないよう、4ドットずつに分けて動かす
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    for (var k = 0; k < n; k++) { stepAxis("x", dx / n); stepAxis("y", dy / n); }
  }

  function push(a, b, room) {
    var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001, min = a.r + b.r;
    if (dist >= min) return;
    var s = (min - dist) / 2;
    var ab = Bosses.isBoss(a) || !!a.def.fixed, bb = Bosses.isBoss(b) || !!b.def.fixed;   // ボスとモンスターの巣は押されない
    if (ab) { room.move(b, dx / dist * s * 2, dy / dist * s * 2); return; }
    if (bb) { room.move(a, -dx / dist * s * 2, -dy / dist * s * 2); return; }
    room.move(a, -dx / dist * s, -dy / dist * s);
    room.move(b, dx / dist * s, dy / dist * s);
  }

  // ---------- 描画 ----------
  var clock = 0;
  function draw(cam) {
    var ctx = Render.ctx;
    clock += 1 / 60;
    Bosses.drawHazards(cam, clock);
    list.forEach(function (e) {
      var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
      var d = e.def;
      ctx.globalAlpha = e.dead ? Math.max(0, e.fade / 0.4) : 1;
      if (e.rival) { drawRival(ctx, e, x, y); ctx.globalAlpha = 1; return; }   // 闘技場の相手（2026-10-30）
      if (Bosses.isBoss(e)) { Bosses.draw(e, cam, clock); ctx.globalAlpha = 1; return; }
      if (d.kind === "nest") { drawNest(ctx, e, x, y); ctx.globalAlpha = 1; return; }
      if (d.kind === "dwisp" && !e.dead && (e.state === "vanish" || e.state === "appear")) {
        // ダークウィスプが消えかけ・現れかけ：すけていき（現れるときは濃くなり）、闇の粒が集まる（散る）
        var kv = e.state === "vanish" ? e.t / d.blinkTime : 1 - e.t / d.blinkTime;
        drawBlinkDots(ctx, x, y, e.state === "vanish" ? 1 - kv : kv, e.state === "appear");
        ctx.globalAlpha = Math.max(0, kv) * 0.85;
        Monsters.drawSmall(ctx, e, x, y + 6 - 3);
        ctx.globalAlpha = 1;
        return;
      }
      Render.rect(x - 6, y + 4, 12, 3, "rgba(0,0,0,0.35)");
      // 段階7-2c：ドット絵（monsters.js）。足もとは y＋6。槍・弓・つるは、向きに合わせてここで描く
      var top = e.type === "wolf_pup" || e.type === "frog" ? 8 : e.type === "wolf" || e.type === "boar" ? 10 : e.type === "mushroom" ? 10 : e.type === "wisp" || e.type === "dark_wisp" ? 14 : 15;   // 頭の上のはしが、まんなかから何点上か（HP のバーと「！」の位置）
      if (d.kind === "boar" && !e.dead && (e.state === "warn" || e.state === "charge") && e.chargeLen) {
        // 突進の予告の線（大オオカミと同じ絵。走っているあいだは、うすく残る）
        Bosses.drawChargeLine(ctx, { from: e, x1: e.lineX, y1: e.lineY, x2: e.lineX + e.aim.x * e.chargeLen, y2: e.lineY + e.aim.y * e.chargeLen,
                                     w: e.r * 2 + 4, t: d.chargeWarn - (e.state === "warn" ? e.t : 0), warn: d.chargeWarn }, cam, clock);
      }
      var hx = x + (e.face.x < 0 ? -4 : 4), hy = y - 1;    // 手のあたり
      var ang = Math.atan2(e.face.y, e.face.x);
      if (d.kind === "spear") {
        // 槍：木の柄と、鉄の穂先。突くときは前へのびる（2026-10-19）
        var ext = e.thrust > 0 ? Math.sin((1 - e.thrust / 0.22) * Math.PI) * (d.reach - 10) : 0;
        var ex = hx + e.face.x * (16 + ext), ey = hy + e.face.y * (16 + ext);
        if (ext > 2) { ctx.strokeStyle = "rgba(255,200,190,0.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx + e.face.x * 10, hy + e.face.y * 10); ctx.lineTo(ex, ey); ctx.stroke(); }
        ctx.strokeStyle = "#7a5230"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx - e.face.x * 4, hy - e.face.y * 4); ctx.lineTo(ex, ey); ctx.stroke();
        Render.rect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2, "#c8ccd4");
      }
      var lift = e.hop > 0 ? Math.round(Math.sin((1 - e.hop / d.hopTime) * Math.PI) * 7) : 0;   // 毒ガエルがはねる高さ
      if (d.kind === "frog" && e.state === "windup" && !e.dead) lift = -1;                      // つばを吐く前は、少しかがむ
      if (d.kind === "wisp" || d.kind === "dwisp") {   // 瘴気の霊・ダークウィスプ：ふわふわ上下にゆれて、少しすけている
        lift = 3 + Math.round(Math.sin(clock * 3 + e.x * 0.1) * 2);
        ctx.globalAlpha = ctx.globalAlpha * 0.85;
      }
      Monsters.drawSmall(ctx, e, x, y + 6 - lift);
      if (d.kind === "wisp" || d.kind === "dwisp") ctx.globalAlpha = e.dead ? Math.max(0, e.fade / 0.4) : 1;
      if ((d.kind === "caster" || d.kind === "dwisp") && e.state === "windup" && !e.dead) {   // 闇の玉をためる：手の先で、だんだん大きくなる
        var kc = 1 - e.t / d.windup, ox2 = x + e.face.x * 8, oy2 = y - 8 + e.face.y * 6;
        Combat.glowDot(ctx, ox2, oy2, 4 + kc * 7, "#e0c0ff", "#c890f0", 0.6 + 0.4 * kc);
        Render.rect(Math.round(ox2) - 1 - Math.round(kc), Math.round(oy2) - 1 - Math.round(kc), 2 + Math.round(kc) * 2, 2 + Math.round(kc) * 2, "#2a1040");
      }
      if (d.kind === "wisp" && !e.dead) {
        var rr3 = d.reach + e.r;
        if (e.state === "windup") {   // とどく範囲が、だんだん濃くなる
          var kw = 1 - e.t / d.windup;
          ctx.fillStyle = (d.glow ? "rgba(240,208,112," : "rgba(150,100,200,") + (0.08 + 0.2 * kw).toFixed(2) + ")";   // 光の精は金色
          ctx.beginPath(); ctx.arc(x, y - 2, rr3, 0, Math.PI * 2); ctx.fill();
        }
        if (e.burst > 0) {   // はじける瘴気の輪
          var kb = 1 - e.burst / 0.4;
          ctx.strokeStyle = (d.glow ? "rgba(255,242,160," : "rgba(200,154,224,") + (1 - kb).toFixed(2) + ")"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y - 2, rr3 * (0.5 + 0.6 * kb), 0, Math.PI * 2); ctx.stroke();
        }
      }
      if (d.kind === "spore" && !e.dead) {
        // 胞子：構えのあいだは、とどく範囲がだんだん濃くなる。まいたあとは、点の雲
        var rr2 = d.reach + e.r;
        if (e.state === "windup") {
          var k2 = 1 - e.t / d.windup;
          ctx.fillStyle = "rgba(170,110,200," + (0.08 + 0.18 * k2).toFixed(2) + ")";
          ctx.beginPath(); ctx.arc(x, y, rr2, 0, Math.PI * 2); ctx.fill();
        }
        if (e.puff > 0) {
          for (var sp = 0; sp < 18; sp++) {
            var ang2 = sp * 2.4 + e.puff * 3, rd = rr2 * (0.3 + 0.7 * ((sp * 37) % 10) / 10) * (1.2 - e.puff);
            Render.rect(Math.round(x + Math.cos(ang2) * rd), Math.round(y - 4 + Math.sin(ang2) * rd * 0.8), 2, 2, sp % 3 ? "#c890e0" : "#e8d8f0");
          }
        }
      }
      if (d.kind === "archer") {
        // 弓：木の弧と、白い弦
        ctx.strokeStyle = "#854c30"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(hx, hy, 5, ang - 1.2, ang + 1.2); ctx.stroke();
        ctx.strokeStyle = "#deeed6";
        ctx.beginPath(); ctx.moveTo(hx + Math.cos(ang - 1.2) * 5, hy + Math.sin(ang - 1.2) * 5); ctx.lineTo(hx + Math.cos(ang + 1.2) * 5, hy + Math.sin(ang + 1.2) * 5); ctx.stroke();
      }
      if (d.kind === "vine" && e.lash > 0) {
        // つるをのばす：しなりながら伸びて、もどる（2026-10-19）
        var lk = 1 - e.lash / 0.3, reachK = Math.sin(Math.min(1, lk * 1.4) * Math.PI * 0.5) * (lk > 0.7 ? 1 - (lk - 0.7) / 0.3 * 0.6 : 1);
        var L = (10 + d.reach) * reachK, nx = -e.face.y, ny = e.face.x, bend = Math.sin(lk * Math.PI * 2) * 8;
        var tx2 = x + e.face.x * L, ty2 = y - 2 + e.face.y * L, cx2 = x + e.face.x * L * 0.5 + nx * bend, cy2 = y - 2 + e.face.y * L * 0.5 + ny * bend;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#1e3f22"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(cx2, cy2, tx2, ty2); ctx.stroke();
        ctx.strokeStyle = "#5a9a4e"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(cx2, cy2, tx2, ty2); ctx.stroke();
        ctx.lineCap = "butt";
        Render.rect(Math.round(tx2) - 2, Math.round(ty2) - 2, 4, 3, "#8fd07a");   // 先の葉
      }
      // 状態異常の印
      var marks = Object.keys(e.status).filter(function (k) { return k !== "break"; });
      if (marks.length && !e.dead) Render.text(marks.map(function (k) { return GameData.STATUS[k].name; }).join(" "), x, y + 7, { size: 6, align: "center", color: GameData.STATUS[marks[0]].color });
      if (e.status.sleep && !e.dead) Render.text("Zz", x + 7, y - top - 4, { size: 7, color: "#b48cf0" });
      if (e.charm && !e.dead) {   // チャーム：頭の上にハートと、足もとにピンクの輪
        Render.text("♥", x, y - top - 10, { size: 8, align: "center", color: "#ff8ac8" });
        ctx.strokeStyle = "rgba(255,138,200,0.7)"; ctx.lineWidth = 1;
        ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y + 3, e.r + 2, (e.r + 2) * 0.45, 0, 0, Math.PI * 2); else ctx.arc(x, y + 3, e.r + 2, 0, Math.PI * 2); ctx.stroke();
      }
      // 構え（予告）
      if (e.state === "warn" && !e.dead) Render.text("！", x, y - top - 9, { size: 10, align: "center", bold: true, color: "#ff5040" });   // ボアの突進の予告は赤
      if (e.state === "tired" && !e.dead) {   // ふらついている：頭の上で、黄色い星がまわる（1点ずつ）
        for (var st = 0; st < 3; st++) {
          var ta = clock * 4 + st * 2.1, tx = Math.round(x + Math.cos(ta) * 7), ty = Math.round(y - top - 5 + Math.sin(ta) * 2);
          Render.rect(tx, ty - 1, 1, 3, "#ffe066"); Render.rect(tx - 1, ty, 3, 1, "#ffe066");
        }
      }
      if (e.state === "windup" && !e.dead) {
        Render.text("！", x, y - top - 9, { size: 9, align: "center", bold: true, color: "#ffd24a" });
        if (d.kind === "spear") {
          ctx.strokeStyle = "rgba(239,91,91,0.5)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + e.aim.x * (d.reach + e.r), y - 3 + e.aim.y * (d.reach + e.r)); ctx.stroke();
        }
      }
      // HP のバー（へっていたら出す）
      if (!e.dead && e.hp < e.maxHp) {
        Render.rect(x - 8, y - top - 3, 16, 2, "#2a2f42");
        Render.rect(x - 8, y - top - 3, Math.round(16 * e.hp / e.maxHp), 2, "#ef5b5b");
      }
    });
    ctx.globalAlpha = 1;
    rivalZones.forEach(function (zn) { Combat.drawZone(ctx, zn, cam); });
    fxs.forEach(function (f) { drawFx(ctx, f, cam); });
    arrows.forEach(function (a) {
      var x = a.x - cam.x, y = a.y - cam.y;
      if (a.opts && a.opts.seed) { Render.rect(x - 2, y - 2, 4, 4, "#a8d070"); Render.rect(x - 1, y - 1, 2, 2, "#5a7a30"); return; }
      if (a.opts && a.opts.rock) {   // ゴーレムの岩：地面にかげ、少しずつ回る
        var big = !a.opts.chip, sw = big ? 18 : 5;
        Render.rect(Math.round(x) - sw / 2, Math.round(y) + (big ? 20 : 8), sw, big ? 4 : 2, "rgba(0,0,0,0.35)");
        Bosses.drawRock(ctx, x, y, a.opts.rad, (3 - a.life) * 9 * (a.opts.spin || 1));
        return;
      }
      if (a.opts && a.opts.darkArrow) { Bosses.drawDarkBolt(ctx, x, y, a.vx, a.vy, a.life); return; }   // ダークエルフのダークアロー（撃った闇の玉）
      if (a.opts && a.opts.elfArrow) {   // ダークエルフのふつうの矢：銀の矢に、紫に光る矢じり
        var el = Math.sqrt(a.vx * a.vx + a.vy * a.vy), eux = a.vx / el, euy = a.vy / el;
        ctx.strokeStyle = "rgba(180,122,255,0.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - eux * 12, y - euy * 12); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = "#d0d4e0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - eux * 9, y - euy * 9); ctx.lineTo(x, y); ctx.stroke();
        Render.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, "#b47aff");
        return;
      }
      if (a.opts && a.opts.skillShot && a.opts.spec) {   // 闘技場の相手のスキル：仲間のスキルと同じ見た目（2026-10-31）
        Combat.drawShot(ctx, { x: a.x, y: a.y, vx: a.vx, vy: a.vy, life: a.life, trail: a.trail, spec: a.opts.spec, color: a.opts.color, size: a.opts.size, arrow: a.opts.arrow }, cam);
        return;
      }
      if (a.opts && a.opts.skillShot) {   // 闘技場の相手のスキルの玉（呼び出しなど）：スキルの色に光る
        Combat.glowDot(ctx, x, y, a.opts.size + 4, "#ffffff", a.opts.color, 0.9);
        return;
      }
      if (a.opts && a.opts.orb) {   // 闇の玉：黒い芯と紫の光
        Combat.glowDot(ctx, x, y, 7, "#1a0a2a", "#9a5ad0", 0.85);
        Render.rect(Math.round(x) - 2, Math.round(y) - 2, 4, 4, "#2a1040");
        return;
      }
      if (a.opts && a.opts.fire) {   // 火トカゲの火の玉：赤いふちに、黄色い芯
        Combat.glowDot(ctx, x, y, 6, "#ffe066", "#f8a040", 0.85);
        Render.rect(Math.round(x - a.vx * 0.04) - 1, Math.round(y - a.vy * 0.04) - 1, 2, 2, "rgba(208,70,72,0.6)");
        Render.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, "#fff2a0");
        return;
      }
      if (a.opts && a.opts.drop) {   // 水のスライムの水のつぶ：青と白
        Render.rect(Math.round(x - a.vx * 0.03) - 1, Math.round(y - a.vy * 0.03) - 1, 2, 2, "rgba(89,125,206,0.5)");
        Render.rect(Math.round(x) - 2, Math.round(y) - 2, 4, 4, "#597dce"); Render.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, "#deeed6");
        return;
      }
      if (a.opts && a.opts.spit) {   // 毒のつば：紫と緑のしずく
        Render.rect(Math.round(x - a.vx * 0.03) - 1, Math.round(y - a.vy * 0.03) - 1, 2, 2, "rgba(160,110,200,0.5)");
        Render.rect(Math.round(x) - 2, Math.round(y) - 2, 4, 4, "#9a5ad0"); Render.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, "#b8e870");
        return;
      }
      var len = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      ctx.strokeStyle = "#e8d8b0"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - a.vx / len * 6, y - a.vy / len * 6); ctx.stroke();
    });
  }

  // ダークウィスプが消える・現れるときの闇の粒（1点ずつ、まわりを回る）。k：0→1 で、gather なら外から集まり、ちがえば外へ散る
  function drawBlinkDots(ctx, x, y, k, gather) {
    var rad = gather ? 16 * (1 - k) + 2 : 4 + 14 * k, alpha = gather ? 0.4 + 0.6 * k : 1 - k;
    if (alpha <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 + k * 2.5;
      Render.rect(Math.round(x + Math.cos(a) * rad) - 1, Math.round(y - 6 + Math.sin(a) * rad * 0.8) - 1, 2, 2, i % 2 ? "#9a5ad0" : "#2a1040");
    }
    ctx.globalAlpha = 1;
  }

  // モンスターの巣（段階5）：泡立つ毒の沼。まんなかに黒い穴のあいた泥の山（ドット絵は props.js。泡は4コマ）。
  // 敵を出すとき（e.birth）は、紫の点の輪が広がる。のぼる瘴気も1点ずつ
  function drawNest(ctx, e, x, y) {
    var frame = Math.floor((clock + e.x * 0.01) * 4) % 4;
    ctx.drawImage(Props.get("nest_" + frame + (e.flash > 0 ? "_hit" : "")), x - 20, y - 12);
    var a0 = e.dead ? Math.max(0, e.fade / 0.4) : 1;
    for (var j = 0; j < 4; j++) {   // のぼる瘴気：2点の小さなかたまりが、ゆれながら上へ。上ほど暗い色
      var q = (clock * 0.45 + j / 4) % 1, sx = Math.round(x - 6 + j * 4 + Math.sin(clock * 2 + j) * 2), sy = Math.round(y - 4 - q * 18);
      if (q > 0.8) continue;
      var col = q < 0.3 ? "#c89ae0" : q < 0.55 ? "#8e52a8" : "#6a3684";
      Render.rect(sx, sy, 2, 1, col); if (q < 0.5) Render.rect(sx, sy - 1, 1, 1, col);
    }
    ctx.globalAlpha = a0;
    if (e.birth > 0) {   // 敵を出したところ：点の輪
      var rad = 10 + (1 - e.birth / 0.5) * 16;
      for (var k = 0; k < 16; k++) {
        var an = k / 16 * Math.PI * 2;
        Render.rect(Math.round(x + Math.cos(an) * rad), Math.round(y + Math.sin(an) * rad * 0.6), 1, 1, k % 2 ? "#c89ae0" : "#e8d8f0");
      }
    }
    var marks = Object.keys(e.status).filter(function (k2) { return k2 !== "break" && k2 !== "sleep" && k2 !== "para"; });
    if (marks.length && !e.dead) Render.text(marks.map(function (k2) { return GameData.STATUS[k2].name; }).join(" "), x, y + 16, { size: 6, align: "center", color: GameData.STATUS[marks[0]].color });
    if (!e.dead && e.hp < e.maxHp) {
      Render.rect(x - 14, y - 16, 28, 3, "#2a2f42");
      Render.rect(x - 14, y - 16, Math.round(28 * e.hp / e.maxHp), 3, "#ef5b5b");
    }
  }

  // 敵の攻撃の見た目
  function drawFx(ctx, f, cam) {
    var e = f.e, x = e.x - cam.x, y = e.y - cam.y - 3, k = 1 - f.t / f.max, p = f.t / f.max;
    if (f.kind === "slash") {
      Combat.drawSlash(ctx, x, y, f.aim, 0.9, f.reach + e.r + 2, f.col || "#ff7a6a", k, f.flip);
    } else if (f.kind === "bite") {   // かみつき：上と下のきばが、前で閉じる
      var bx = x + f.aim.x * (e.r + f.reach * 0.7), by = y + f.aim.y * (e.r + f.reach * 0.7), gap = 6 * (1 - Math.min(1, k * 1.6));
      ctx.strokeStyle = "rgba(255,255,255," + p.toFixed(2) + ")"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(bx, by - gap, 5, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by + gap, 5, Math.PI + 0.3, Math.PI * 2 - 0.3); ctx.stroke();
      ctx.lineCap = "butt";
      if (k > 0.5) Combat.glowDot(ctx, bx, by, 6, "#ffffff", "#ff7a6a", 0.7 * p);
    } else if (f.kind === "ring") {   // 闘技場の相手のスキル：まわりに広がる輪
      ctx.strokeStyle = f.col || "#ffd24a"; ctx.globalAlpha = Math.max(0, p); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, (f.reach || 14) * (0.4 + 0.6 * k)), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === "sting") {  // 針：前へ、黄色い光がすっと出る
      var L = (e.r + f.reach) * Math.min(1, k * 1.8);
      ctx.strokeStyle = "rgba(255,230,120," + p.toFixed(2) + ")"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + f.aim.x * 4, y + f.aim.y * 4); ctx.lineTo(x + f.aim.x * L, y + f.aim.y * L); ctx.stroke();
      Combat.glowDot(ctx, x + f.aim.x * L, y + f.aim.y * L, 4, "#ffffff", "#ffe066", 0.8 * p);
    }
  }
  function updateFx(dt) { for (var i = fxs.length - 1; i >= 0; i--) { fxs[i].t -= dt; if (fxs[i].t <= 0) fxs.splice(i, 1); } }

  return { spawn: spawn, clear: clear, moveBlocked: moveBlocked, alive: alive, hostile: hostile, charm: charm, list: list, update: update, draw: draw, addStatus: addStatus, spawnRival: spawnRival, remove: remove };
})();
