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
    if (e.dead) return;
    var weapon = GameData.WEAPONS[c.weapon];
    var elem = spec.elem === "weapon" ? weapon.element : spec.elem;
    var atk = spec.stat === "m" ? Party.eff(c, "matk") : Party.eff(c, "patk");
    var def = spec.stat === "m" ? e.mdef : e.pdef * (e.status["break"] ? 0.7 : 1);
    if (spec.mult > 0) {
      var res = Battle.damage(atk, def, { mult: spec.mult, element: elem, res: e.res, crit: Party.eff(c, "crit") + (spec.crit || 0) });
      GameState.noteHit(e.type, elem, Battle.resOf(e, elem)); // 図鑑：試した属性の効き方
      e.hp -= res.amount; e.flash = 0.1;
      e.swingsTaken = (e.swingsTaken || 0) + 1;
      Battle.showHit(e.x, e.y - 20, res, false);
      if (e.status.sleep) delete e.status.sleep;
    }
    if (spec.status && Math.random() < spec.status.chance) Enemies.addStatus(e, spec.status.type, spec.status.dur);
    var push = spec.push === undefined ? 3 : spec.push;
    if (push && hooks.room && !(e.def && e.def.boss)) { // ボスは押し返されない
      var dx = e.x - ox, dy = e.y - oy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      hooks.room.move(e, dx / d * push, dy / d * push);
    }
    if (e.hp <= 0) { e.dead = true; hooks.onKill(e); }
  }

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
    var speed = spec.speed || 170, range = spec.range || 150;
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
    if (w.shot) return w.shot.range;
    if (w.bolt && GameData.inLine(c.job, w.boltFor)) return w.bolt.range;
    return 0;
  }
  // 今のキャラが狙っている敵（印を出すため）
  function targetFor(c) {
    var r = shotRange(c);
    return r ? autoTarget(r) : null;
  }

  // ---------- ふつうの攻撃 ----------
  function normalAttack(c) {
    var a = A();
    var w = GameData.WEAPONS[c.weapon];
    a.wait = GameData.weaponWait(c.weapon, c.job) * Party.eff(c, "wait");
    var ang = shotRange(c) ? aimAt(shotRange(c)) : Math.atan2(a.face.y, a.face.x);
    // 1回の強さは武器ごとの倍率（data.js の power）
    if (w.shot) { addShot(c, { stat: "p", mult: w.power || 1, elem: "weapon", speed: w.shot.speed, range: w.shot.range }, ang); return; }
    if (w.bolt && GameData.inLine(c.job, w.boltFor)) {
      addShot(c, { stat: "m", mult: w.bolt.power || 1, elem: "none", speed: w.bolt.speed, range: w.bolt.range, size: 2, color: "#c9a8ff" }, ang);
      return;
    }
    a.swing = 0.15; a.swingArc = w.arc; a.swingReach = w.reach; a.swingColor = "#ffffff";
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
    if (c.mp < s.mp) return "MPがたりない";
    if (s.fx[0].t === "revive" && !Party.members().some(function (m) { return m.down; })) return "倒れた仲間がいない";
    c.mp -= s.mp;
    c.ct[id] = s.ct;
    if (s.once) c.used[id] = true;
    Battle.pop(A().x, A().y - 30, s.name, "#ffe7a0", 8);
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
        a.swing = 0.18; a.swingArc = f.arc || w.arc || 1; a.swingReach = f.reach || w.reach || 18; a.swingColor = f.color || "#ffe7a0";
        hitArc(c, f, f.reach || w.reach || 18, f.arc || w.arc || 1);
        break;
      case "around":
        effects.push({ kind: "ring", x: a.x, y: a.y, r: f.radius, t: 0.25, max: 0.25, color: f.color || "#ffe7a0" });
        hitAround(c, f, a.x, a.y, f.radius);
        break;
      case "dash":
      case "backstep":
        var dir = f.t === "dash" ? 1 : -1, go = f.dist;
        if (dir < 0) aimAt(150); // 下がるときは、いちばん近い敵の方を向いてから、その反対へ
        // 踏みこむときは、前にいる敵の手前で止まる（通りぬけない）
        if (dir > 0) { var front = nearestInFront(f.dist + 20, 0.6); if (front) go = Math.max(0, Math.min(go, front.dist - front.e.r - a.r - 4)); }
        Enemies.moveBlocked(hooks.room, a, a.face.x * go * dir, a.face.y * go * dir); // 敵はすり抜けない
        a.inv = Math.max(a.inv, 0.2);
        break;
      case "shot":
        ang = aimAt(f.range || 150); // いちばん近い敵へ向けて飛ばす
        var n = f.count || 1, spread = f.spread || 0;
        for (var k = 0; k < n; k++) addShot(c, f, ang + (k - (n - 1) / 2) * spread);
        break;
      case "rapid":
        for (var r = 0; r < f.count; r++) later(r * f.interval, function () { apply(c, f.hit); });
        a.busy = f.count * f.interval;
        break;
      case "rain":
        // 前にいるいちばん近い敵のところへ降らせる（いなければ前の決まった場所）
        var tgt = nearestInFront(f.dist + 50, 0.8);
        var cx = tgt ? tgt.e.x : a.x + a.face.x * f.dist, cy = tgt ? tgt.e.y : a.y + a.face.y * f.dist;
        effects.push({ kind: "ring", x: cx, y: cy, r: f.radius, t: 0.6, max: 0.6, color: "#e8d8b0" });
        for (var m = 0; m < f.count; m++) {
          later(0.15 + m * 0.12, function () {
            var px = cx + (Math.random() - 0.5) * f.radius * 1.4, py = cy + (Math.random() - 0.5) * f.radius * 1.4;
            effects.push({ kind: "ring", x: px, y: py, r: 6, t: 0.2, max: 0.2, color: "#e8d8b0" });
            hitAround(c, { stat: f.stat, mult: f.mult, elem: f.elem, push: 0 }, px, py, 12);
          });
        }
        break;
      case "zone":
        zones.push({ c: c, f: f, x: a.x + a.face.x * f.dist, y: a.y + a.face.y * f.dist, t: f.dur, tick: 0 });
        break;
      case "heal":
        targets(c, f.party).forEach(function (m) {
          var amt = Math.round(m.stats.hp * f.pct);
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
        targets(c, f.party).forEach(function (m) { m.regens.push({ perSec: m.stats.hp * f.pct / f.dur, t: f.dur }); });
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
  function update(dt) {
    var room = hooks.room;
    for (var q = queue.length - 1; q >= 0; q--) {
      queue[q].t -= dt;
      if (queue[q].t <= 0) { var fn = queue[q].fn; queue.splice(q, 1); fn(); }
    }
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      var hit = null;
      Enemies.alive().forEach(function (e) {
        if (hit) return;
        var dx = e.x - s.x, dy = (e.y - 3) - s.y;
        if (dx * dx + dy * dy <= (e.r + s.size + 1) * (e.r + s.size + 1)) hit = e;
      });
      if (hit) { hitEnemy(hit, s.c, s.spec, s.x - s.vx, s.y - s.vy); shots.splice(i, 1); continue; }
      if (room.blocksShot(Math.floor(s.x / World.TILE), Math.floor(s.y / World.TILE)) || s.life <= 0) shots.splice(i, 1);
    }
    for (var z = zones.length - 1; z >= 0; z--) {
      var zn = zones[z];
      zn.t -= dt; zn.tick -= dt;
      if (zn.tick <= 0) { zn.tick = zn.f.tick; hitAround(zn.c, { stat: zn.f.stat, mult: zn.f.mult, elem: zn.f.elem, push: 0 }, zn.x, zn.y, zn.f.radius); }
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
    zones.forEach(function (zn) {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(zn.t * 20);
      ctx.fillStyle = zn.f.color;
      ctx.beginPath(); ctx.arc(zn.x - cam.x, zn.y - cam.y, zn.f.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    shots.forEach(function (s) {
      var x = s.x - cam.x, y = s.y - cam.y;
      if (s.arrow) {
        var len = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        ctx.strokeStyle = s.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx / len * 7, y - s.vy / len * 7); ctx.stroke();
      } else {
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(x, y, s.size, 0, Math.PI * 2); ctx.fill();
      }
    });
    effects.forEach(function (ef) {
      var p = ef.t / ef.max;
      ctx.globalAlpha = Math.max(0, p);
      if (ef.kind === "ring") {
        ctx.strokeStyle = ef.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ef.x - cam.x, ef.y - cam.y - 3, ef.r * (1.1 - p * 0.3), 0, Math.PI * 2); ctx.stroke();
      } else if (ef.kind === "glow") {
        ctx.strokeStyle = ef.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(a.x - cam.x, a.y - cam.y - 4, 12 + (1 - p) * 8, 0, Math.PI * 2); ctx.stroke();
      } else if (ef.kind === "charge") {
        ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(a.x - cam.x, a.y - cam.y - 4, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  return { hooks: hooks, targetFor: targetFor, normalAttack: normalAttack, useSkill: useSkill, update: update, draw: draw, clear: clear };
})();
