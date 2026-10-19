// 攻撃とスキル：ふつうの攻撃、スキル35の効果、飛ぶもの（矢・魔法弾・ファイア）、その場に残るもの（炎の壁）、降らせるもの（矢の雨）。
// 敵に当たったときの計算はここの hitEnemy にまとめる。
var Combat = (function () {
  var shots = [];   // 飛んでいるもの
  var zones = [];   // その場に残るもの
  var queue = [];   // あとで起きること（ためる・何回も・降ってくる）
  var effects = []; // 見た目だけ（まわりの輪、回復の光など）
  var hooks = { onKill: function () {}, room: null };

  function A() { return Party.actor; }

  // ---------- 敵に当たる ----------
  // spec：{ stat, mult, elem, crit, status, push }、ox/oy：押し返す向きの元
  function hitEnemy(e, c, spec, ox, oy) {
    if (e.dead) return 0;
    var dealt = 0;
    var weapon = GameData.WEAPONS[c.weapon];
    var elem = spec.elem === "weapon" ? weapon.element : spec.elem;
    var atk = spec.stat === "m" ? Party.eff(c, "matk") : Party.eff(c, "patk");
    var def = spec.stat === "m" ? e.mdef : e.pdef * (e.status["break"] ? 0.7 : 1);
    if (spec.mult > 0) {
      var res = Battle.damage(atk, def, { mult: spec.mult, element: elem, res: e.res, crit: Party.eff(c, "crit") + (spec.crit || 0), critMul: 1.5 + (c.stats.critDmg || 0) });
      dealt = res.amount;
      GameState.noteHit(e.type, elem, Battle.resOf(e, elem)); // 図鑑：試した属性の効き方
      e.hp -= res.amount; e.flash = 0.1;
      e.swingsTaken = (e.swingsTaken || 0) + 1;
      Battle.showHit(e.x, e.y - 20, res, false);
      Sound.play("hit");
      // 当たったところに、火花（物理）か、はじける光（魔法）を出す
      effects.push({ kind: spec.stat === "m" ? "burst" : "spark", x: e.x, y: e.y - 6, t: 0.2, max: 0.2, ang: Math.random() * Math.PI,
        color: spec.color || (elem === "fire" ? "#ff8a3d" : elem === "water" ? "#5aa9ff" : spec.stat === "m" ? "#c9a8ff" : "#fff3c4") });
      if (e.status.sleep) delete e.status.sleep;
    }
    if (spec.status && Math.random() < spec.status.chance) Enemies.addStatus(e, spec.status.type, spec.status.dur);
    var push = spec.push === undefined ? 3 : spec.push;
    if (push && hooks.room && !(e.def && e.def.boss)) { // ボスは押し返されない
      var dx = e.x - ox, dy = e.y - oy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      hooks.room.move(e, dx / d * push, dy / d * push);
    }
    if (e.hp <= 0) { e.dead = true; Sound.play("kill"); hooks.onKill(e); }
    return dealt;
  }
  // スキルで使うMP（パッシブ「MPの節約」でへる）
  function mpCost(c, s) { return Math.round((s.mp || 0) * (1 - ((c.stats && c.stats.mpcut) || 0))); }

  // 扇の範囲（reach・arc）の敵に当てる
  function hitArc(c, spec, reach, arc) {
    var a = A();
    var ang = Math.atan2(a.face.y, a.face.x);
    var n = 0;
    Enemies.alive().forEach(function (e) {
      var dx = e.x - a.x, dy = e.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > reach + e.r + a.r) return;
      var da = Math.abs(Math.atan2(dy, dx) - ang);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > arc && dist > e.r + a.r + 2) return;
      hitEnemy(e, c, spec, a.x, a.y); n++;
    });
    return n;
  }
  function hitAround(c, spec, x, y, radius) {
    Enemies.alive().forEach(function (e) {
      var dx = e.x - x, dy = e.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius + e.r) hitEnemy(e, c, spec, x, y);
    });
  }

  function addShot(c, spec, angle) {
    var a = A();
    var speed = spec.speed || 170, range = (spec.range || 150) * rangeMul(c);
    shots.push({
      c: c, spec: spec, x: a.x + Math.cos(angle) * 6, y: a.y - 3 + Math.sin(angle) * 6,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: range / speed,
      size: spec.size || 1, color: spec.color || (spec.stat === "m" ? "#c9a8ff" : "#e8d8b0"), arrow: !spec.size
    });
  }

  // ---------- 自動で狙う（飛ぶ攻撃） ----------
  // range より近い敵のうち、いちばん近い敵（向きに関係なく）。いなければ null
  function autoTarget(range) {
    var a = A(), best = null, bd = 0;
    Enemies.alive().forEach(function (e) {
      var dx = e.x - a.x, dy = e.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > range + e.r) return;
      if (!best || d < bd) { best = e; bd = d; }
    });
    return best;
  }
  // いちばん近い敵の方を向いて、その向き（角度）を返す。敵がいなければ今の向き
  function aimAt(range) {
    var a = A(), t = autoTarget(range);
    if (t) {
      var dx = t.x - a.x, dy = t.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      a.face = { x: dx / d, y: dy / d };
    }
    return Math.atan2(a.face.y, a.face.x);
  }
  // ふつうの攻撃が飛ぶ武器なら、その届く距離（飛ばない武器は 0）
  function shotRange(c) {
    var w = GameData.WEAPONS[c.weapon];
    if (w.shot) return w.shot.range * rangeMul(c);
    if (w.bolt && GameData.inLine(c.job, w.boltFor)) return w.bolt.range * rangeMul(c);
    return 0;
  }
  // 矢と魔法の玉のとどく距離の倍率（パッシブ「たかの目」）
  function rangeMul(c) { return (c && c.stats && c.stats.rangeMul) || 1; }
  // 今のキャラが狙っている敵（印を出すため）
  function targetFor(c) {
    var r = shotRange(c);
    return r ? autoTarget(r) : null;
  }

  // ---------- ふつうの攻撃 ----------
  // 遠くへ飛ばす攻撃（弓・魔法弾）は、狙いを定めるあいだ（撃つ前）と撃ったあと、少しのあいだ動けない
  // （逃げながら撃つと、敵が追いつけなかったため。2026-10-18 保護者の案）
  // 2026-10-18：まだ逃げられたので長くした（弓 0.25＋0.2 → 0.35＋0.3、魔法弾 0.2＋0.15 → 0.3＋0.25）
  var AIM = { bow: { before: 0.35, after: 0.3 }, bolt: { before: 0.3, after: 0.25 } };
  function shootAfterAim(c, aim, spec) {
    var a = A();
    a.busy = aim.before + aim.after;
    effects.push({ kind: "charge", t: aim.before, max: aim.before });
    later(aim.before, function () {
      if (Party.current() !== c || c.down) return;   // 狙っているあいだに入れかえた・たおれた
      Sound.play("swing");
      var r = shotRange(c), ang = r ? aimAt(r) : Math.atan2(a.face.y, a.face.x);   // 撃つときに狙い直す
      addShot(c, spec, ang);
    });
  }
  // スキル用：狙う時間のあとに fn を行う（撃つ前後に止まる）。ため（charge）のあとでも同じ
  function aimThen(c, aim, fn) {
    var a = A();
    a.busy = Math.max(a.busy, aim.before + aim.after);
    effects.push({ kind: "charge", t: aim.before, max: aim.before });
    later(aim.before, function () { if (Party.current() !== c || c.down) return; fn(); });
  }
  function normalAttack(c) {
    var a = A();
    var w = GameData.WEAPONS[c.weapon];
    a.wait = GameData.weaponWait(c.weapon, c.job) * Party.eff(c, "wait");
    // 1回の強さは武器ごとの倍率（data.js の power）
    if (w.shot) { shootAfterAim(c, AIM.bow, { stat: "p", mult: w.power || 1, elem: "weapon", speed: w.shot.speed, range: w.shot.range }); return; }
    if (w.bolt && GameData.inLine(c.job, w.boltFor)) {
      shootAfterAim(c, AIM.bolt, { stat: "m", mult: w.bolt.power || 1, elem: "none", speed: w.bolt.speed, range: w.bolt.range, size: 2, color: "#c9a8ff" });
      return;
    }
    Sound.play("swing");
    a.swing = 0.15; a.swingMax = 0.15; a.swingFlip = !a.swingFlip; a.swingArc = w.arc; a.swingReach = w.reach; a.swingColor = "#ffffff";
    hitArc(c, { stat: "p", mult: w.power || 1, elem: "weapon" }, w.reach, w.arc);
  }

  // ---------- スキル ----------
  // 使えないときは、その理由を返す（使えたら ""）
  function useSkill(c, id) {
    var s = GameData.SKILL[id];
    if (!s) return "";
    if (c.status.sleep) return "眠っている";
    if (s.once && c.used[id]) return "この冒険ではもう使った";
    if ((c.ct[id] || 0) > 0) return "まだ使えない";
    var cost = mpCost(c, s);
    if (c.mp < cost) return "MPがたりない";
    if (s.fx[0].t === "revive" && !Party.members().some(function (m) { return m.down; })) return "倒れた仲間がいない";
    c.mp -= cost;
    c.ct[id] = s.ct;
    if (s.once) c.used[id] = true;
    Battle.pop(A().x, A().y - 30, s.name, "#ffe7a0", 8);
    Sound.play("skill");
    run(c, s.fx, 0);
    return "";
  }

  // 効果を順に行う。charge があれば、その時間だけ待ってから続ける
  function run(c, fx, from) {
    for (var i = from; i < fx.length; i++) {
      var f = fx[i];
      if (f.t === "charge") {
        A().busy = f.time;
        effects.push({ kind: "charge", t: f.time, max: f.time });
        later(f.time, (function (next) { return function () { run(c, fx, next); }; })(i + 1));
        return;
      }
      apply(c, f);
    }
  }

  function apply(c, f) {
    var a = A();
    var w = GameData.WEAPONS[c.weapon];
    var ang = Math.atan2(a.face.y, a.face.x);
    switch (f.t) {
      case "arc":
        a.swing = 0.18; a.swingMax = 0.18; a.swingFlip = !a.swingFlip; a.swingArc = f.arc || w.arc || 1; a.swingReach = f.reach || w.reach || 18; a.swingColor = f.color || "#ffe7a0";
        var rch = f.reach || w.reach || 18;
        if (f.vis === "smash") effects.push({ kind: "smash", x: a.x + a.face.x * rch * 0.7, y: a.y + a.face.y * rch * 0.7, t: 0.45, max: 0.45 });
        if (f.vis === "lance") effects.push({ kind: "lance", reach: rch, t: 0.22, max: 0.22 });
        if (f.vis === "quake") effects.push({ kind: "crack", x: a.x, y: a.y, lines: crackLines(ang, rch * 1.3, f.arc || 0.8), t: 0.7, max: 0.7 });
        hitArc(c, f, rch, f.arc || w.arc || 1);
        break;
      case "around":
        if (f.vis === "spin" || f.vis === "sweep") {
          effects.push({ kind: "spin", low: f.vis === "sweep", r: f.radius, flip: (a.swingFlip = !a.swingFlip), t: 0.3, max: 0.3,
            color: f.vis === "sweep" ? "#ffcf8a" : "#ffe7a0" });
        } else if (f.vis === "tidal") {
          effects.push({ kind: "tidal", x: a.x, y: a.y, r: f.radius, t: 0.7, max: 0.7, seed: Math.random() * 6 });
        } else {
          effects.push({ kind: "wave", x: a.x, y: a.y, r: f.radius, t: f.stat === "m" ? 0.5 : 0.25, max: f.stat === "m" ? 0.5 : 0.25,
            color: f.color || "#ffe7a0", magic: f.stat === "m", seed: Math.random() * 6 });
        }
        hitAround(c, f, a.x, a.y, f.radius);
        break;
      case "dash":
      case "backstep":
        var dir = f.t === "dash" ? 1 : -1, go = f.dist;
        if (dir < 0) aimAt(150); // 下がるときは、いちばん近い敵の方を向いてから、その反対へ
        // 踏みこむときは、前にいる敵の手前で止まる（通りぬけない）
        if (dir > 0) { var front = nearestInFront(f.dist + 20, 0.6); if (front) go = Math.max(0, Math.min(go, front.dist - front.e.r - a.r - 4)); }
        var sx0 = a.x, sy0 = a.y;
        Enemies.moveBlocked(hooks.room, a, a.face.x * go * dir, a.face.y * go * dir); // 敵はすり抜けない
        a.inv = Math.max(a.inv, 0.2);
        effects.push({ kind: "trail", x0: sx0, y0: sy0, x1: a.x, y1: a.y, t: 0.35, max: 0.35 });   // 残像と土けむり
        break;
      case "shot":
        // 遠くへ飛ばすスキルも、ふつうの攻撃と同じく撃つ前後に少し止まる（2026-10-19 保護者の希望）
        aimThen(c, f.stat === "m" ? AIM.bolt : AIM.bow, function () {
          var ang2 = aimAt((f.range || 150) * rangeMul(c)); // いちばん近い敵へ向けて飛ばす
          var n = f.count || 1, spread = f.spread || 0;
          for (var k = 0; k < n; k++) addShot(c, f, ang2 + (k - (n - 1) / 2) * spread);
        });
        break;
      case "rapid":
        for (var r = 0; r < f.count; r++) later(r * f.interval, function () { apply(c, f.hit); });
        a.busy = f.count * f.interval;
        break;
      case "rain":
        aimThen(c, AIM.bow, function () { rain(c, f); });
        break;
      case "zone":
        aimThen(c, AIM.bolt, function () {
          zones.push({ c: c, f: f, x: a.x + a.face.x * f.dist, y: a.y + a.face.y * f.dist, t: f.dur, max: f.dur, tick: 0 });
        });
        break;
      case "pierceDash":   // グランドチャージ：敵を通りぬけて突進し、通った敵みんなに1回ずつ当てる（かべでは止まる）
        var px0 = a.x, py0 = a.y, hitList = [], stepN = Math.ceil(f.dist / 3);
        for (var st = 0; st < stepN; st++) {
          var bx = a.x, by = a.y;
          hooks.room.move(a, a.face.x * 3, a.face.y * 3);
          if (Math.abs(a.x - bx) + Math.abs(a.y - by) < 0.5) break;   // かべ
          Enemies.alive().forEach(function (e) {
            if (hitList.indexOf(e) >= 0) return;
            var ddx = e.x - a.x, ddy = e.y - a.y;
            if (ddx * ddx + ddy * ddy <= (e.r + a.r + 4) * (e.r + a.r + 4)) { hitList.push(e); hitEnemy(e, c, { stat: f.stat, mult: f.mult, elem: f.elem, push: 6 }, px0, py0); }
          });
        }
        a.inv = Math.max(a.inv, 0.5);
        effects.push({ kind: "trail", x0: px0, y0: py0, x1: a.x, y1: a.y, t: 0.45, max: 0.45 });
        effects.push({ kind: "lance", reach: 22, t: 0.25, max: 0.25 });
        break;
      case "mpheal":
        targets(c, f.party).forEach(function (m) {
          var amt = Math.round(m.stats.mp * f.pct);
          m.mp = Math.min(m.stats.mp, m.mp + amt);
          if (m === c || m === Party.current()) Battle.pop(a.x + 10, a.y - 28, "MP+" + amt, "#a3c8ff", 9);
        });
        effects.push({ kind: "glow", t: 0.5, max: 0.5, color: "#5aa9ff" });
        break;
      case "heal":
        targets(c, f.party).forEach(function (m) {
          var amt = Math.round(m.stats.hp * f.pct * (c.stats.healMul || 1)); // healMul：パッシブ「いやしの力」
          m.hp = Math.min(m.stats.hp, m.hp + amt);
          if (m === c || m === Party.current()) Battle.pop(a.x, a.y - 20, "+" + amt, "#6fd08c", 10);
        });
        effects.push({ kind: "glow", t: 0.5, max: 0.5, color: "#6fd08c" });
        break;
      case "cure":
        targets(c, f.party).forEach(function (m) { Party.cure(m); });
        effects.push({ kind: "glow", t: 0.4, max: 0.4, color: "#ffffff" });
        break;
      case "regen":
        targets(c, f.party).forEach(function (m) { m.regens.push({ perSec: m.stats.hp * f.pct * (c.stats.healMul || 1) / f.dur, t: f.dur }); });
        effects.push({ kind: "glow", t: 0.5, max: 0.5, color: "#9be36a" });
        break;
      case "buff":
        targets(c, f.party).forEach(function (m) {
          m.buffs = m.buffs.filter(function (b) { return b.stat !== f.stat; });
          m.buffs.push({ stat: f.stat, pct: f.pct, t: f.dur });
        });
        effects.push({ kind: "glow", t: 0.4, max: 0.4, color: "#f2c14e" });
        break;
      case "revive":
        var who = Party.members().filter(function (m) { return m.down; })[0];
        if (who) {
          who.down = false; who.hp = Math.round(who.stats.hp * f.pct);
          Battle.pop(a.x, a.y - 40, who.name + " が復活！", "#6fd08c", 8);
        }
        effects.push({ kind: "glow", t: 0.6, max: 0.6, color: "#ffffff" });
        break;
    }
  }

  // 矢の雨：前にいるいちばん近い敵のところへ降らせる（いなければ前の決まった場所）
  function rain(c, f) {
    var a = A();
    var tgt = nearestInFront(f.dist + 50, 0.8);
    var cx = tgt ? tgt.e.x : a.x + a.face.x * f.dist, cy = tgt ? tgt.e.y : a.y + a.face.y * f.dist;
    effects.push({ kind: "ring", x: cx, y: cy, r: f.radius, t: 0.15 + f.count * 0.12 + 0.3, max: 0.15 + f.count * 0.12 + 0.3, color: "#e8d8b0" });
    for (var m = 0; m < f.count; m++) {
      later(0.05 + m * 0.12, function () {
        var px = cx + (Math.random() - 0.5) * f.radius * 1.4, py = cy + (Math.random() - 0.5) * f.radius * 1.4;
        // 空から矢が落ちてきて、刺さったときに当たる（2026-10-19）
        effects.push({ kind: "arrowfall", x: px, y: py, t: 0.45, max: 0.45 });
        later(0.12, function () { hitAround(c, { stat: f.stat, mult: f.mult, elem: f.elem, push: 0 }, px, py, 12); });
      });
    }
  }

  // 向いている方（左右 arc ラジアン以内）で、range より近いいちばん近い敵
  function nearestInFront(range, arc) {
    var a = A(), ang = Math.atan2(a.face.y, a.face.x), best = null;
    Enemies.alive().forEach(function (e) {
      var dx = e.x - a.x, dy = e.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range) return;
      var da = Math.abs(Math.atan2(dy, dx) - ang);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > arc) return;
      if (!best || dist < best.dist) best = { e: e, dist: dist };
    });
    return best;
  }

  // party：3人全員（倒れているキャラはのぞく。待機中もふくむ）、そうでなければ自分だけ
  function targets(c, party) {
    if (!party) return [c];
    return Party.members().filter(function (m) { return !m.down; });
  }

  function later(t, fn) { queue.push({ t: t, fn: fn }); }

  // ---------- 毎フレーム ----------
  var clock = 0;
  function update(dt) {
    var room = hooks.room;
    clock += dt;
    for (var q = queue.length - 1; q >= 0; q--) {
      queue[q].t -= dt;
      if (queue[q].t <= 0) { var fn = queue[q].fn; queue.splice(q, 1); fn(); }
    }
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.trail = s.trail || [];
      s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 7) s.trail.shift();
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      var hit = null;
      Enemies.alive().forEach(function (e) {
        if (hit) return;
        var dx = e.x - s.x, dy = (e.y - 3) - s.y;
        if (dx * dx + dy * dy <= (e.r + s.size + 1) * (e.r + s.size + 1)) hit = e;
      });
      if (hit && s.spec.pierce) {   // つらぬく矢：同じ敵には1回だけ当たって、そのまま飛ぶ
        s.hitIds = s.hitIds || [];
        if (s.hitIds.indexOf(hit) < 0) { s.hitIds.push(hit); hitEnemy(hit, s.c, s.spec, s.x - s.vx, s.y - s.vy); }
        hit = null;
      }
      if (hit) {
        if (s.spec.explode) {   // 当たると爆発：まわりの敵にもまとめて当てる
          effects.push({ kind: "boom", x: s.x, y: s.y, r: s.spec.explode, t: 0.45, max: 0.45 });
          Sound.play("hit");
          hitAround(s.c, { stat: s.spec.stat, mult: s.spec.mult, elem: s.spec.elem, push: 8, color: s.spec.color }, s.x, s.y, s.spec.explode);
        } else {
          var got = hitEnemy(hit, s.c, s.spec, s.x - s.vx, s.y - s.vy);
          if (s.spec.drain && got > 0 && !s.c.down) {   // ドレイン：与えたダメージの一部で回復
            var back = Math.max(1, Math.round(got * s.spec.drain));
            s.c.hp = Math.min(s.c.stats.hp, s.c.hp + back);
            if (s.c === Party.current()) Battle.pop(A().x, A().y - 20, "+" + back, "#6fd08c", 10);
          }
        }
        shots.splice(i, 1); continue;
      }
      if (room.blocksShot(Math.floor(s.x / World.TILE), Math.floor(s.y / World.TILE)) || s.life <= 0) shots.splice(i, 1);
    }
    for (var z = zones.length - 1; z >= 0; z--) {
      var zn = zones[z];
      zn.t -= dt; zn.tick -= dt;
      if (zn.tick <= 0) { zn.tick = zn.f.tick; hitAround(zn.c, { stat: zn.f.stat, mult: zn.f.mult, elem: zn.f.elem, push: 0, status: zn.f.status }, zn.x, zn.y, zn.f.radius); }
      if (zn.f.pull && hooks.room) {   // ダークホール：まわりの敵を、まんなかへ吸いよせる
        Enemies.alive().forEach(function (e) {
          if (e.def && e.def.boss) return;
          var dx = zn.x - e.x, dy = zn.y - e.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 3 || d > zn.f.radius * 1.7) return;
          var mv = Math.min(d - 2, zn.f.pull * dt);
          hooks.room.move(e, dx / d * mv, dy / d * mv);
        });
      }
      if (zn.t <= 0) zones.splice(z, 1);
    }
    for (var k = effects.length - 1; k >= 0; k--) { effects[k].t -= dt; if (effects[k].t <= 0) effects.splice(k, 1); }
  }

  function clear() { shots.length = 0; zones.length = 0; queue.length = 0; effects.length = 0; }

  // ---------- 描画 ----------
  function draw(cam) {
    var ctx = Render.ctx, a = A();
    // 飛ぶ攻撃で狙っている敵の上に、小さな印
    var tg = targetFor(Party.current());
    if (tg) {
      var tx = Math.round(tg.x - cam.x), ty = Math.round(tg.y - cam.y) - 26;
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath(); ctx.moveTo(tx - 3, ty); ctx.lineTo(tx + 3, ty); ctx.lineTo(tx, ty + 4); ctx.closePath(); ctx.fill();
    }
    zones.forEach(function (zn) { drawZone(ctx, zn, cam); });
    shots.forEach(function (s) {
      var x = s.x - cam.x, y = s.y - cam.y;
      if (s.arrow) {   // 矢（今のまま）
        var len = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        ctx.strokeStyle = s.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx / len * 7, y - s.vy / len * 7); ctx.stroke();
        return;
      }
      if (s.spec.orb) { drawOrb(ctx, s, x, y, cam); return; }   // 気功波：気の玉
      if (s.spec.stat !== "m") {   // ねらい撃ちなどの大きな矢：光る矢と光の尾（2026-10-19）
        drawBigArrow(ctx, s, x, y, cam);
        return;
      }
      if (s.spec.elem === "fire") drawFireball(ctx, s, x, y, cam); else drawOrb(ctx, s, x, y, cam);
    });
    effects.forEach(function (ef) { drawEffect(ctx, ef, a, cam); });
  }

  // ---------- 絵の部品（2026-10-19。ドット絵ではなく、光とすけ感で表す） ----------
  function rgba(hex, al) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + Math.max(0, Math.min(1, al)).toFixed(3) + ")";
  }
  function glowDot(ctx, x, y, r, inner, outer, al) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(inner, al)); g.addColorStop(0.45, rgba(outer, al * 0.7)); g.addColorStop(1, rgba(outer, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 魔法の玉：すけた光の玉と、短い光の尾
  function drawOrb(ctx, s, x, y, cam) {
    var col = s.color || "#c9a8ff";
    (s.trail || []).forEach(function (t, i, all) {
      var k = (i + 1) / all.length;
      glowDot(ctx, t.x - cam.x, t.y - cam.y, 2 + 3 * k, "#ffffff", col, 0.25 * k);
    });
    var pulse = 0.85 + 0.15 * Math.sin(clock * 30);
    glowDot(ctx, x, y, 10 * pulse, "#ffffff", col, 0.7);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }
  // 火の玉：ゆらめく炎の玉と、火の粉
  function drawFireball(ctx, s, x, y, cam) {
    (s.trail || []).forEach(function (t, i, all) {
      var k = (i + 1) / all.length, jx = Math.sin(clock * 40 + i) * 1.5;
      glowDot(ctx, t.x - cam.x + jx, t.y - cam.y - (1 - k) * 3, 2 + 4 * k, "#ffd27a", "#ff5a1f", 0.35 * k);
    });
    var f = (0.85 + 0.2 * Math.sin(clock * 45)) * Math.max(1, (s.size || 3) / 3.5);   // フレイムボムは大きい
    glowDot(ctx, x, y, 10 * f, "#fff3c4", "#ff6a1f", 0.9);
    glowDot(ctx, x + Math.sin(clock * 50) * 1.2, y - 1, 4, "#ffffff", "#ffd27a", 0.9);
    for (var i = 0; i < 3; i++) {   // 火の粉
      var ph = (clock * 3 + i / 3) % 1;
      ctx.fillStyle = rgba("#ffd27a", 1 - ph);
      ctx.fillRect(Math.round(x - s.vx * 0.02 * ph * 6 + Math.sin(i * 7 + clock * 9) * 3), Math.round(y - ph * 6 - s.vy * 0.02 * ph * 6), 1, 1);
    }
  }
  // 炎の壁：ゆれる炎がいくつも並ぶ
  function drawZone(ctx, zn, cam) {
    var x = zn.x - cam.x, y = zn.y - cam.y, r = zn.f.radius;
    var life = Math.min(1, (zn.max - zn.t) / 0.2, zn.t / 0.3);   // 出てくるときと消えるときは、うすく
    if (zn.f.look === "mist") {   // ポイズンミスト：ゆっくり動く緑の霧
      for (var m = 0; m < 9; m++) {
        var am = m / 9 * Math.PI * 2 + clock * 0.6, dm = r * (0.25 + 0.55 * ((m * 7) % 9) / 9);
        glowDot(ctx, x + Math.cos(am) * dm, y + Math.sin(am) * dm * 0.7 - 2, r * 0.55, "#c8f0a0", "#5a9a3e", 0.35 * life);
      }
      for (var b2 = 0; b2 < 5; b2++) {   // 小さな泡
        var ph = (clock * 0.8 + b2 / 5) % 1;
        glowDot(ctx, x + Math.sin(b2 * 9) * r * 0.6, y - ph * 12, 2, "#ffffff", "#9be36a", (1 - ph) * life);
      }
      return;
    }
    if (zn.f.look === "hole") {   // ダークホール：回る闇の渦
      var hg = ctx.createRadialGradient(x, y, 0, x, y, r);
      hg.addColorStop(0, rgba("#000000", 0.85 * life)); hg.addColorStop(0.35, rgba("#3a1a5a", 0.6 * life)); hg.addColorStop(1, rgba("#6a3a98", 0));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5;
      for (var k2 = 0; k2 < 4; k2++) {
        ctx.strokeStyle = rgba(k2 % 2 ? "#c9a8ff" : "#9a5ad0", 0.7 * life);
        ctx.beginPath();
        for (var q2 = 0; q2 <= 16; q2++) {
          var tq = q2 / 16, aq = k2 / 4 * Math.PI * 2 - clock * 4 + tq * 2.6, rq = r * (0.95 - tq * 0.85);
          if (q2 === 0) ctx.moveTo(x + Math.cos(aq) * rq, y + Math.sin(aq) * rq * 0.8); else ctx.lineTo(x + Math.cos(aq) * rq, y + Math.sin(aq) * rq * 0.8);
        }
        ctx.stroke();
      }
      return;
    }
    var base = ctx.createRadialGradient(x, y, 0, x, y, r);
    base.addColorStop(0, rgba("#ff8a3d", 0.35 * life)); base.addColorStop(1, rgba("#ff5a1f", 0));
    ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2 + 0.4, d = r * (i % 2 ? 0.55 : 0.25);
      var fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.6;
      var h = (9 + 5 * Math.sin(clock * 9 + i * 1.7)) * life, w = 4 + (i % 3);
      var g = ctx.createLinearGradient(0, fy, 0, fy - h);
      g.addColorStop(0, rgba("#ff5a1f", 0.85)); g.addColorStop(0.5, rgba("#ffb84a", 0.8)); g.addColorStop(1, rgba("#fff3c4", 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(fx - w, fy);
      ctx.quadraticCurveTo(fx - w * 0.6, fy - h * 0.6, fx + Math.sin(clock * 7 + i) * 2, fy - h);
      ctx.quadraticCurveTo(fx + w * 0.6, fy - h * 0.6, fx + w, fy);
      ctx.closePath(); ctx.fill();
    }
  }
  // 大地斬りの割れめ：前の扇の中に、ぎざぎざの線を3本（作るときに形を決める）
  function crackLines(ang, len, arc) {
    var out = [];
    for (var i = 0; i < 3; i++) {
      var a0 = ang + (i - 1) * arc * 0.55, pts = [{ d: 4, o: 0 }], n = 6;
      for (var k = 1; k <= n; k++) pts.push({ d: 4 + len * k / n, o: (Math.random() - 0.5) * 6 });
      out.push({ ang: a0, pts: pts });
    }
    return out;
  }
  function drawBigArrow(ctx, s, x, y, cam) {
    var len = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1, ux = s.vx / len, uy = s.vy / len;
    (s.trail || []).forEach(function (t, i, all) {
      var k = (i + 1) / all.length;
      glowDot(ctx, t.x - cam.x, t.y - cam.y, 2 + 4 * k, "#ffffff", "#ffe066", 0.3 * k);
    });
    glowDot(ctx, x, y, 9, "#ffffff", "#ffe066", 0.6);
    ctx.strokeStyle = "#fff3c4"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 13, y - uy * 13); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(x + ux * 4, y + uy * 4); ctx.lineTo(x - uy * 3, y + ux * 3); ctx.lineTo(x + uy * 3, y - ux * 3); ctx.closePath(); ctx.fill();
  }
  function drawEffect(ctx, ef, a, cam) {
    var p = ef.t / ef.max, q = 1 - p;   // p：のこり、q：すすみぐあい
    if (ef.kind === "ring") {   // 矢の雨のねらう場所：地面のうすい輪
      ctx.strokeStyle = rgba(ef.color, 0.5 * Math.min(1, p * 3)); ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(ef.x - cam.x, ef.y - cam.y, ef.r, ef.r * 0.6, 0, 0, Math.PI * 2); else ctx.arc(ef.x - cam.x, ef.y - cam.y, ef.r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ef.kind === "arrowfall") {   // 矢の雨：空から落ちてきて刺さる
      var fx0 = ef.x - cam.x, fy0 = ef.y - cam.y, fall = Math.min(1, q / 0.27);
      if (fall < 1) {
        var yy = fy0 - 50 * (1 - fall);
        var tl = ctx.createLinearGradient(0, yy - 26, 0, yy);   // 落ちてくる光の尾
        tl.addColorStop(0, "rgba(255,255,255,0)"); tl.addColorStop(1, "rgba(255,246,220,0.7)");
        ctx.fillStyle = tl; ctx.fillRect(fx0 - 1.5, yy - 26, 3, 26);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx0 + 1, yy - 12); ctx.lineTo(fx0, yy); ctx.stroke();
        glowDot(ctx, fx0, yy, 5, "#ffffff", "#ffe7a0", 0.7);
      } else {
        var st = (q - 0.27) / 0.73;   // 刺さった矢と、土けむり
        ctx.strokeStyle = rgba("#ffffff", 1 - st); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx0 + 1, fy0 - 8); ctx.lineTo(fx0, fy0); ctx.stroke();
        for (var dd0 = 0; dd0 < 4; dd0++) glowDot(ctx, fx0 + (dd0 - 1.5) * 3 * (1 + st * 2), fy0 - st * 3, 3, "#d8c8a0", "#8a6840", 0.6 * (1 - st));
      }
    } else if (ef.kind === "spin") {   // 回転ぎり・足ばらい：自分のまわりを一回転する光
      var spx = a.x - cam.x, spy = a.y - cam.y + (ef.low ? 3 : -3);
      drawSlash(ctx, spx, spy, a.face, Math.PI, ef.r - 4, ef.color, q / 0.85, ef.flip);
      if (ef.low) for (var du = 0; du < 6; du++) {   // 足もとの土けむり
        var an0 = du / 6 * Math.PI * 2 + q * 4;
        glowDot(ctx, spx + Math.cos(an0) * ef.r * 0.8, spy + 2 + Math.sin(an0) * ef.r * 0.4, 4, "#e8d8b0", "#8a6840", 0.5 * p);
      }
    } else if (ef.kind === "smash") {   // かぶと割り：上からたたきつける光と、地面の衝撃
      var smx = ef.x - cam.x, smy = ef.y - cam.y;
      if (q < 0.25) {
        var dk = q / 0.25, top = smy - 34 + 30 * dk;
        var lg = ctx.createLinearGradient(0, smy - 34, 0, top + 4);
        lg.addColorStop(0, rgba("#ffe7a0", 0)); lg.addColorStop(1, rgba("#ffffff", 0.95));
        ctx.fillStyle = lg; ctx.fillRect(smx - 2, smy - 34, 4, top + 4 - (smy - 34));
      } else {
        var sk = (q - 0.25) / 0.75;
        glowDot(ctx, smx, smy, 8 + 6 * (1 - sk), "#ffffff", "#ffb84a", 0.9 * (1 - sk));
        ctx.strokeStyle = rgba("#ffe7a0", 0.8 * (1 - sk)); ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(smx, smy + 2, 4 + 18 * sk, 2 + 8 * sk, 0, 0, Math.PI * 2); else ctx.arc(smx, smy + 2, 4 + 18 * sk, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba("#ffffff", 1 - sk); ctx.lineWidth = 1.5; ctx.lineCap = "round";
        for (var rr = 0; rr < 6; rr++) {
          var an4 = -Math.PI / 2 + (rr - 2.5) * 0.45, r0 = 4 + 6 * sk, r1 = r0 + 7;
          ctx.beginPath(); ctx.moveTo(smx + Math.cos(an4) * r0, smy + Math.sin(an4) * r0); ctx.lineTo(smx + Math.cos(an4) * r1, smy + Math.sin(an4) * r1); ctx.stroke();
        }
        ctx.lineCap = "butt";
      }
    } else if (ef.kind === "crack") {   // 大地斬り：地面に走る光の割れめ
      var cx0 = ef.x - cam.x, cy0 = ef.y - cam.y + 2, grow = Math.min(1, q / 0.35), fade2 = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
      ef.lines.forEach(function (ln) {
        var ca = Math.cos(ln.ang), sa = Math.sin(ln.ang), upto = Math.max(1, Math.round((ln.pts.length - 1) * grow));
        [[4, rgba("#ff8a3d", 0.35 * fade2)], [1.5, rgba("#fff3c4", 0.95 * fade2)]].forEach(function (pen) {
          ctx.strokeStyle = pen[1]; ctx.lineWidth = pen[0]; ctx.lineJoin = "round";
          ctx.beginPath();
          for (var i = 0; i <= upto; i++) {
            var pt = ln.pts[i], px2 = cx0 + ca * pt.d - sa * pt.o, py2 = cy0 + sa * pt.d * 0.8 + ca * pt.o;
            if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
          }
          ctx.stroke();
        });
        var end = ln.pts[upto];
        glowDot(ctx, cx0 + ca * end.d, cy0 + sa * end.d * 0.8, 7, "#ffe7a0", "#8a6840", 0.6 * fade2);
      });
      ctx.lineJoin = "miter";
    } else if (ef.kind === "tidal") {   // タイダルウェーブ：まわりに広がる水の波としぶき
      var tx = ef.x - cam.x, ty = ef.y - cam.y - 2, tr = ef.r * (0.25 + 0.85 * Math.sqrt(q));
      var tg2 = ctx.createRadialGradient(tx, ty, tr * 0.6, tx, ty, tr);
      tg2.addColorStop(0, rgba("#5aa9ff", 0)); tg2.addColorStop(0.7, rgba("#5aa9ff", 0.4 * p + 0.1)); tg2.addColorStop(0.92, rgba("#cfe8ff", 0.7 * p)); tg2.addColorStop(1, rgba("#5aa9ff", 0));
      ctx.fillStyle = tg2; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba("#ffffff", 0.75 * p); ctx.lineWidth = 1.5;   // 波がしら（ゆれる白い線）
      ctx.beginPath();
      for (var w2 = 0; w2 <= 36; w2++) {
        var an5 = w2 / 36 * Math.PI * 2, rw = tr * 0.9 + Math.sin(an5 * 8 + ef.seed + q * 10) * 2;
        if (w2 === 0) ctx.moveTo(tx + Math.cos(an5) * rw, ty + Math.sin(an5) * rw); else ctx.lineTo(tx + Math.cos(an5) * rw, ty + Math.sin(an5) * rw);
      }
      ctx.stroke();
      for (var sp2 = 0; sp2 < 14; sp2++) {   // しぶき
        var an6 = sp2 / 14 * Math.PI * 2 + ef.seed, rs = tr + 3 + 6 * q * ((sp2 * 7) % 5) / 5;
        glowDot(ctx, tx + Math.cos(an6) * rs, ty + Math.sin(an6) * rs - 4 * Math.sin(q * Math.PI), 2.5, "#ffffff", "#9fd0ff", 0.8 * p);
      }
    } else if (ef.kind === "boom") {   // 爆発：はじける火の玉と、広がる輪と、火花
      var ox = ef.x - cam.x, oy = ef.y - cam.y, orr = ef.r * (0.4 + 0.8 * Math.sqrt(q));
      glowDot(ctx, ox, oy, orr, "#fff3c4", "#ff6a1f", 0.85 * p);
      ctx.strokeStyle = rgba("#ffe7a0", 0.8 * p); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, orr * 1.05, 0, Math.PI * 2); ctx.stroke();
      for (var bs = 0; bs < 10; bs++) {
        var ab = bs / 10 * Math.PI * 2 + ef.r, db = orr * (0.8 + 0.6 * q);
        glowDot(ctx, ox + Math.cos(ab) * db, oy + Math.sin(ab) * db, 2.5, "#ffffff", "#ffb84a", p);
      }
    } else if (ef.kind === "lance") {   // いなずま突き・グランドチャージ：前へ一直線にのびる光
      var lx = a.x - cam.x, ly = a.y - cam.y - 4, la = Math.atan2(a.face.y, a.face.x), lr = (ef.reach + 6) * Math.min(1, q * 2.5);
      var nx4 = -Math.sin(la), ny4 = Math.cos(la), w4 = 3 * p;
      ctx.fillStyle = rgba("#e8f4ff", 0.85 * p);
      ctx.beginPath();
      ctx.moveTo(lx + nx4 * w4, ly + ny4 * w4); ctx.lineTo(lx + Math.cos(la) * lr, ly + Math.sin(la) * lr); ctx.lineTo(lx - nx4 * w4, ly - ny4 * w4);
      ctx.closePath(); ctx.fill();
      glowDot(ctx, lx + Math.cos(la) * lr, ly + Math.sin(la) * lr, 6, "#ffffff", "#a8d8ff", 0.9 * p);
    } else if (ef.kind === "trail") {   // とっしん：通ったあとに残る残像と、出だしの土けむり
      var ddx = ef.x1 - ef.x0, ddy = ef.y1 - ef.y0, dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1, nx3 = -ddy / dl, ny3 = ddx / dl;
      for (var g3 = 0; g3 < 4; g3++) {
        var k3 = g3 / 4, gx3 = ef.x0 + ddx * k3 - cam.x, gy3 = ef.y0 + ddy * k3 - cam.y - 6;
        glowDot(ctx, gx3, gy3, 9, "#ffffff", "#a8d8ff", 0.6 * p * (0.4 + k3));
      }
      ctx.strokeStyle = rgba("#ffffff", 0.8 * p); ctx.lineWidth = 1.5; ctx.lineCap = "round";   // 走ったあとの白い線
      [-5, 0, 5].forEach(function (o, i) {
        var s0 = 0.15 + i * 0.1 + q * 0.4;
        ctx.beginPath();
        ctx.moveTo(ef.x0 + ddx * s0 + nx3 * o - cam.x, ef.y0 + ddy * s0 + ny3 * o - cam.y - 6);
        ctx.lineTo(ef.x0 + ddx * 0.95 + nx3 * o - cam.x, ef.y0 + ddy * 0.95 + ny3 * o - cam.y - 6);
        ctx.stroke();
      });
      ctx.lineCap = "butt";
      for (var d3 = 0; d3 < 4; d3++) glowDot(ctx, ef.x0 - cam.x + (d3 - 1.5) * 4 * (1 + q), ef.y0 - cam.y + 4 - q * 4, 4, "#e8d8b0", "#8a6840", 0.5 * p);
    } else if (ef.kind === "wave") {   // まわりの敵に：広がる光の輪（魔法は、ただよう光の粒も）
      var x = ef.x - cam.x, y = ef.y - cam.y - 3, r = ef.r * (0.35 + 0.75 * Math.sqrt(q));
      var g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, rgba(ef.color, 0)); g.addColorStop(0.75, rgba(ef.color, 0.45 * p + 0.1)); g.addColorStop(1, rgba(ef.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba("#ffffff", 0.6 * p); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, Math.PI * 2); ctx.stroke();
      if (ef.magic) {
        for (var i = 0; i < 10; i++) {
          var an = i / 10 * Math.PI * 2 + ef.seed, dd = r * (0.5 + 0.45 * ((i * 37) % 10) / 10);
          glowDot(ctx, x + Math.cos(an) * dd, y + Math.sin(an) * dd - q * 6, 3, "#ffffff", ef.color, 0.6 * p);
        }
      }
    } else if (ef.kind === "spark") {   // 物理の当たり：白い火花
      var sx = ef.x - cam.x, sy = ef.y - cam.y, len = 3 + 6 * q;
      ctx.strokeStyle = rgba("#ffffff", p); ctx.lineWidth = 1.5; ctx.lineCap = "round";
      for (var k = 0; k < 4; k++) {
        var an2 = ef.ang + k * Math.PI / 2, i0 = 2 + 4 * q;
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(an2) * i0, sy + Math.sin(an2) * i0); ctx.lineTo(sx + Math.cos(an2) * (i0 + len), sy + Math.sin(an2) * (i0 + len)); ctx.stroke();
      }
      glowDot(ctx, sx, sy, 6 * p + 2, "#ffffff", ef.color, 0.8 * p);
      ctx.lineCap = "butt";
    } else if (ef.kind === "burst") {   // 魔法の当たり：はじける光
      var bx = ef.x - cam.x, by = ef.y - cam.y;
      glowDot(ctx, bx, by, 6 + 10 * q, "#ffffff", ef.color, 0.8 * p);
      for (var m = 0; m < 6; m++) {
        var an3 = ef.ang + m / 6 * Math.PI * 2, d3 = 4 + 10 * q;
        glowDot(ctx, bx + Math.cos(an3) * d3, by + Math.sin(an3) * d3, 2, "#ffffff", ef.color, p);
      }
    } else if (ef.kind === "glow") {   // 回復・強くなる：やわらかい光と、のぼっていく光の粒
      var gx = a.x - cam.x, gy = a.y - cam.y - 6;
      glowDot(ctx, gx, gy, 22, "#ffffff", ef.color, 0.55 * p);
      ctx.strokeStyle = rgba(ef.color, 0.7 * p); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse ? ctx.ellipse(gx, gy + 12, 12 + 6 * q, 4 + 2 * q, 0, 0, Math.PI * 2) : ctx.arc(gx, gy + 12, 12, 0, Math.PI * 2); ctx.stroke();
      for (var n = 0; n < 10; n++) {
        var ph = (q * 1.4 + n / 10) % 1, ox = Math.sin(n * 2.4) * 11;
        glowDot(ctx, gx + ox, gy + 12 - ph * 28, 3.5, "#ffffff", ef.color, Math.min(1, (1 - ph) * 1.3) * p);
      }
    } else if (ef.kind === "charge") {   // ためる・狙う（今のまま）
      ctx.globalAlpha = Math.max(0, p);
      ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a.x - cam.x, a.y - cam.y - 4, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 斬る・たたく：振った方向へ流れる、三日月の光（core.js から呼ぶ）。k：振りのすすみぐあい 0〜1
  function drawSlash(ctx, px, py, face, arc, reach, color, k, flip) {
    var ang = Math.atan2(face.y, face.x);
    var dir = flip ? -1 : 1, from = ang - dir * arc, sweep = 2 * arc * Math.min(1, k * 1.35);
    var fade = 1 - Math.max(0, (k - 0.6) / 0.4);
    var R = reach + 4, N = 14;
    function band(rOut, rInK, alK, col) {
      for (var i = 0; i < N; i++) {
        var t0 = i / N, t1 = (i + 1) / N;
        var a0 = from + dir * sweep * t0, a1 = from + dir * sweep * t1;
        var al = Math.pow(t1, 1.4) * fade * alK;   // 振りの先ほど明るい
        var rIn = rOut * (rInK - 0.3 * t1);         // 振りの先ほど太い
        ctx.fillStyle = rgba(col, al);
        ctx.beginPath();
        ctx.arc(px, py, rOut, Math.min(a0, a1), Math.max(a0, a1) + 0.01);
        ctx.arc(px, py, rIn, Math.max(a0, a1) + 0.01, Math.min(a0, a1), true);
        ctx.closePath(); ctx.fill();
      }
    }
    band(R + 2, 0.72, 0.35, color === "#ffffff" ? "#a8d8ff" : color);   // まわりのうすい光
    band(R, 0.7, 0.85, color);                                           // 本体
    // ふちの白い線（振りの先のほう）
    ctx.strokeStyle = rgba("#ffffff", fade); ctx.lineWidth = 2; ctx.lineCap = "round";
    var e0 = from + dir * sweep * 0.45, e1 = from + dir * sweep;
    ctx.beginPath(); ctx.arc(px, py, R - 0.5, Math.min(e0, e1), Math.max(e0, e1)); ctx.stroke();
    ctx.lineCap = "butt";
  }

  return { hooks: hooks, targetFor: targetFor, normalAttack: normalAttack, useSkill: useSkill, update: update, draw: draw, clear: clear, drawSlash: drawSlash, glowDot: glowDot, mpCost: mpCost };
})();
