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
    if (c.mp < s.mp) return "MPがたりない";
    if (s.fx[0].t === "revive" && !Party.members().some(function (m) { return m.down; })) return "倒れた仲間がいない";
    c.mp -= s.mp;
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
        hitArc(c, f, f.reach || w.reach || 18, f.arc || w.arc || 1);
        break;
      case "around":
        effects.push({ kind: "wave", x: a.x, y: a.y, r: f.radius, t: f.stat === "m" ? 0.5 : 0.25, max: f.stat === "m" ? 0.5 : 0.25,
          color: f.color || "#ffe7a0", magic: f.stat === "m", seed: Math.random() * 6 });
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
        // 遠くへ飛ばすスキルも、ふつうの攻撃と同じく撃つ前後に少し止まる（2026-10-19 保護者の希望）
        aimThen(c, f.stat === "m" ? AIM.bolt : AIM.bow, function () {
          var ang2 = aimAt(f.range || 150); // いちばん近い敵へ向けて飛ばす
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

  // 矢の雨：前にいるいちばん近い敵のところへ降らせる（いなければ前の決まった場所）
  function rain(c, f) {
    var a = A();
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
    zones.forEach(function (zn) { drawZone(ctx, zn, cam); });
    shots.forEach(function (s) {
      var x = s.x - cam.x, y = s.y - cam.y;
      if (s.arrow) {   // 矢（今のまま）
        var len = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        ctx.strokeStyle = s.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx / len * 7, y - s.vy / len * 7); ctx.stroke();
        return;
      }
      if (s.spec.stat !== "m") {   // ねらい撃ちなどの大きな矢：今のまま
        ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, y, s.size, 0, Math.PI * 2); ctx.fill();
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
    var f = 0.85 + 0.2 * Math.sin(clock * 45);
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
  function drawEffect(ctx, ef, a, cam) {
    var p = ef.t / ef.max, q = 1 - p;   // p：のこり、q：すすみぐあい
    if (ef.kind === "ring") {   // 矢の雨の印（今のまま）
      ctx.globalAlpha = Math.max(0, p);
      ctx.strokeStyle = ef.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ef.x - cam.x, ef.y - cam.y - 3, ef.r * (1.1 - p * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
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

  return { hooks: hooks, targetFor: targetFor, normalAttack: normalAttack, useSkill: useSkill, update: update, draw: draw, clear: clear, drawSlash: drawSlash };
})();
