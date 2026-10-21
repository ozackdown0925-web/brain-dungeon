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
    // 「武器の属性」：魔法剣士の火炎剣などがかかっていれば、その属性（2026-10-20）
    var elem = spec.elem === "weapon" ? (c.enchant ? c.enchant.elem : weapon.element) : spec.elem;
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
        color: spec.color || ELEM_COLOR[elem] || (spec.stat === "m" ? "#c9a8ff" : "#fff3c4") });
      if (e.status.sleep) delete e.status.sleep;
    }
    if (spec.status && Math.random() < spec.status.chance) Enemies.addStatus(e, spec.status.type, spec.status.dur);
    var push = spec.push === undefined ? 3 : spec.push;
    if (push && hooks.room && !(e.def && e.def.boss)) { // ボスは押し返されない
      var dx = e.x - ox, dy = e.y - oy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      hooks.room.move(e, dx / d * push, dy / d * push);
    }
    if (e.hp <= 0) {
      e.dead = true; Sound.play("kill"); hooks.onKill(e);
      // パッシブ「闘志」：敵をたおすと、少しのあいだ物攻が上がる（かけ直すと時間がのびる）
      if (c.stats.fervor) addBuff(c, { stat: "patk", pct: c.stats.fervor, dur: 5 }, "fervor");
    }
    return dealt;
  }
  var ELEM_COLOR = { fire: "#ff8a3d", water: "#5aa9ff", grass: "#9be36a", light: "#fff2a0", dark: "#9a5ad0" };
  // 強くする効果をかける（2026-10-20 保護者と決定）：同じスキルをかけ直すと時間がのびるだけ。
  // ちがうスキルの同じ効果は、2つまで足し算で重なる（3つ目をかけると、いちばん古いものが消える）
  function addBuff(m, f, src) {
    m.buffs = m.buffs.filter(function (b) { return !(b.stat === f.stat && b.src === src); });
    var same = m.buffs.filter(function (b) { return b.stat === f.stat; });
    if (same.length >= 2) m.buffs.splice(m.buffs.indexOf(same[0]), 1);
    m.buffs.push({ stat: f.stat, pct: f.pct, t: f.dur, src: src });
  }
  // 隠れみの術：こちらから攻撃すると終わる
  function unhide() { if (A().hidden > 0) { A().hidden = 0; Battle.pop(A().x, A().y - 30, "見つかった", "#a3a8bd", 7); } }
  // スキルで使うMP（パッシブ「MPの節約」でへる）
  function mpCost(c, s) { return Math.round((s.mp || 0) * (1 - ((c.stats && c.stats.mpcut) || 0))); }

  // 扇の範囲（reach・arc）の敵に当てる
  function hitArc(c, spec, reach, arc) {
    var a = A();
    var ang = Math.atan2(a.face.y, a.face.x);
    var n = 0;
    Enemies.hostile().forEach(function (e) {
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
    Enemies.hostile().forEach(function (e) {
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
    Enemies.hostile().forEach(function (e) {
      var dx = e.x - a.x, dy = e.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > range + e.r) return;
      if (!best || d < bd) { best = e; bd = d; }
    });
    return best;
  }
  // range より近い敵がいれば、その方を向く（槍の突き。向きに関係なく、いちばん近い敵）
  function faceNearest(range) {
    var a = A(), t = autoTarget(range);
    if (!t) return;
    var dx = t.x - a.x, dy = t.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    a.face = { x: dx / d, y: dy / d };
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
  function shootAfterAim(c, aim, spec, n) {
    var a = A();
    a.busy = aim.before + aim.after;
    effects.push({ kind: "charge", t: aim.before, max: aim.before });
    later(aim.before, function () {
      if (Party.current() !== c || c.down) return;   // 狙っているあいだに入れかえた・たおれた
      Sound.play("swing");
      var r = shotRange(c), ang = r ? aimAt(r) : Math.atan2(a.face.y, a.face.x);   // 撃つときに狙い直す
      if ((n || 1) > 1) { addShot(c, spec, ang - 0.08); addShot(c, spec, ang + 0.08); }   // 影分身：2つ飛ぶ
      else addShot(c, spec, ang);
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
    unhide();
    a.wait = GameData.weaponWait(c.weapon, c.job) * Party.eff(c, "wait");
    // パッシブ「影分身」（2026-10-20）：1回の強さを下げて2回当てる。弓と魔法の玉は2つ飛ぶ
    var dbl = c.stats.double || 0, k = dbl ? dbl : 1;
    // 1回の強さは武器ごとの倍率（data.js の power）
    if (w.shot) { shootAfterAim(c, AIM.bow, { stat: "p", mult: (w.power || 1) * k, elem: "weapon", speed: w.shot.speed, range: w.shot.range, onHit: mpOnHit }, dbl ? 2 : 1); return; }
    if (w.bolt && GameData.inLine(c.job, w.boltFor)) {
      shootAfterAim(c, AIM.bolt, { stat: "m", mult: (w.bolt.power || 1) * k, elem: "none", speed: w.bolt.speed, range: w.bolt.range, size: 2, color: "#c9a8ff", onHit: mpOnHit }, dbl ? 2 : 1);
      return;
    }
    Sound.play("swing");
    if (w.thrust) faceNearest(w.reach + 12);   // 槍：いちばん近い敵の方を向いてから突く（2026-10-21）
    a.swing = 0.15; a.swingMax = 0.15; a.swingFlip = !a.swingFlip; a.swingArc = w.arc; a.swingReach = w.reach;
    a.swingKind = w.thrust ? "thrust" : "";
    a.swingColor = c.enchant ? ELEM_COLOR[c.enchant.elem] : "#ffffff";
    if (w.thrust) effects.push({ kind: "lance", reach: w.reach, t: 0.16, max: 0.16, thin: true, color: c.enchant ? ELEM_COLOR[c.enchant.elem] : "#e8f4ff" });
    var spec = { stat: "p", mult: (w.power || 1) * k, elem: "weapon" };
    if (hitArc(c, spec, w.reach, w.arc)) mpOnHit(c);
    if (dbl) later(0.1, function () {   // 影分身：少しおくれて、もう1回
      if (Party.current() !== c || c.down) return;
      a.swing = 0.15; a.swingMax = 0.15; a.swingFlip = !a.swingFlip; a.swingColor = "#9a8ad0";
      if (w.thrust) effects.push({ kind: "lance", reach: w.reach, t: 0.16, max: 0.16, thin: true, color: "#9a8ad0" });
      if (hitArc(c, spec, w.reach, w.arc)) mpOnHit(c);
    });
  }
  // パッシブ「魔力吸収」：ふつうの攻撃が当たると、MPが少し回復する
  function mpOnHit(c) {
    if (!c.stats.mpOnHit || c.down) return;
    c.mp = Math.min(c.stats.mp, c.mp + c.stats.mp * c.stats.mpOnHit);
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
    c.ct[id] = s.ct * (1 - (c.stats.ctcut || 0));   // パッシブ「賢者の知恵」
    if (s.fx[0].t !== "hide") unhide();
    if (s.once) c.used[id] = true;
    Battle.pop(A().x, A().y - 30, s.name, "#ffe7a0", 8);
    Sound.play("skill");
    // スキルの演出（2026-10-21 保護者の案）：構え（黄色い輪）→ 画面が少し暗くなり、使った仲間のまわりが光る → 技が出る。
    // どのスキルも 0.25 秒は構える。もともと構えやためが長いスキル（弓・魔法・ためる技）は、そのままの長さ。時間は止めない
    var own = ownWindup(s.fx), col = castColor(s);
    if (own > 0) {
      curSkill = id;
      run(c, s.fx, 0);
      later(own, function () { if (Party.current() === c && !c.down) castFlash(col); });
      return "";
    }
    var a = A();
    a.busy = Math.max(a.busy, CAST_TIME);
    effects.push({ kind: "charge", t: CAST_TIME, max: CAST_TIME });
    later(CAST_TIME, function () {
      if (Party.current() !== c || c.down || c.status.sleep) {   // 構えているあいだに入れかえた・たおれた・眠った：MP と待ち時間はもどす
        c.mp = Math.min(c.stats.mp, c.mp + cost); c.ct[id] = 0; if (s.once) c.used[id] = false;
        return;
      }
      castFlash(col);
      curSkill = id;
      run(c, s.fx, 0);
    });
    return "";
  }

  var CAST_TIME = 0.25;
  // もともとある構え・ための長さ（なければ 0）：ためる技（charge）、狙ってから撃つ技（shot・rain・zone）
  function ownWindup(fx) {
    var f = fx[0];
    if (f.t === "charge") return f.time;
    if (f.t === "shot") return f.stat === "m" ? AIM.bolt.before : AIM.bow.before;
    if (f.t === "rain") return AIM.bow.before;
    if (f.t === "zone") return AIM.bolt.before;
    return 0;
  }
  // 光の色：スキルの色があればその色。なければ魔法は青紫、回復・強くする技は緑、ほかは金色
  function castColor(s) {
    for (var i = 0; i < s.fx.length; i++) if (s.fx[i].color) return s.fx[i].color;
    var t = s.fx[0].t;
    if (t === "heal" || t === "buff" || t === "cure" || t === "revive" || t === "regen") return "#9fe8a0";
    for (var j = 0; j < s.fx.length; j++) if (s.fx[j].stat === "m") return "#b48cff";
    return "#ffe7a0";
  }
  // 画面が少し暗くなり、使った仲間のまわりが光る（0.4秒）
  var cast = null;
  function castFlash(color) {
    cast = { t: 0.4, max: 0.4, color: color, seed: Math.random() * 6 };
  }
  // 敵のあとで、キャラより先に描く（使った仲間は暗くならない）
  function drawCastBack(cam, view) {
    if (!cast) return;
    var ctx = Render.ctx, a = A(), q = 1 - cast.t / cast.max;
    var env = q < 0.15 ? q / 0.15 : q > 0.6 ? (1 - q) / 0.4 : 1;
    Render.rect(0, 0, view.w, view.h, "rgba(8,6,20," + (0.32 * env).toFixed(3) + ")");
    var x = a.x - cam.x, y = a.y - cam.y - 6;
    glowDot(ctx, x, y, 22 + 10 * q, "#ffffff", cast.color, 0.55 * env);
    ctx.strokeStyle = rgba(cast.color, 0.8 * env); ctx.lineWidth = 1.5;
    ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y + 11, 10 + 10 * q, (10 + 10 * q) * 0.4, 0, 0, Math.PI * 2); else ctx.arc(x, y + 11, 10 + 10 * q, 0, Math.PI * 2); ctx.stroke();
  }
  // キャラの前：のぼる光の粒
  function drawCastFront(ctx, cam) {
    if (!cast) return;
    var a = A(), q = 1 - cast.t / cast.max, env = q > 0.6 ? (1 - q) / 0.4 : 1;
    for (var n = 0; n < 8; n++) {
      var ph = (q * 1.6 + n / 8) % 1, ang = cast.seed + n * 0.785;
      var px = a.x - cam.x + Math.cos(ang) * (8 + 6 * ph), py = a.y - cam.y + 4 - ph * 26;
      glowDot(ctx, px, py, 2.5, "#ffffff", cast.color, (1 - ph) * env);
    }
  }

  // 効果を順に行う。charge があれば、その時間だけ待ってから続ける
  function run(c, fx, from) {
    for (var i = from; i < fx.length; i++) {
      var f = fx[i];
      if (f.t === "charge" || f.t === "pause") {   // pause：見た目を出さずに少し待つ（旋風撃の回転のあと）
        A().busy = Math.max(A().busy, f.time);
        if (f.t === "charge") effects.push({ kind: "charge", t: f.time, max: f.time });
        later(f.time, (function (next) { return function () { run(c, fx, next); }; })(i + 1));
        return;
      }
      apply(c, f);
    }
  }

  var curSkill = "";   // いま使っているスキル（強くする効果の出どころ）
  function apply(c, f) {
    var a = A();
    var w = GameData.WEAPONS[c.weapon];
    var ang = Math.atan2(a.face.y, a.face.x);
    switch (f.t) {
      case "arc":
        var rch = f.reach || w.reach || 18;
        if (f.vis === "lance") { faceNearest(rch + 12); ang = Math.atan2(a.face.y, a.face.x); }   // 槍の突きのスキルも、近い敵の方を向く
        a.swing = 0.18; a.swingMax = 0.18; a.swingFlip = !a.swingFlip; a.swingArc = f.arc || w.arc || 1; a.swingReach = rch; a.swingColor = f.color || "#ffe7a0";
        a.swingKind = f.vis === "lance" ? "thrust" : "";
        if (f.vis === "smash") effects.push({ kind: "smash", x: a.x + a.face.x * rch * 0.7, y: a.y + a.face.y * rch * 0.7, t: 0.45, max: 0.45 });
        if (f.vis === "lance") effects.push({ kind: "lance", reach: rch, t: 0.22, max: 0.22, color: f.color });
        if (f.vis === "quake") effects.push({ kind: "crack", x: a.x, y: a.y, lines: crackLines(ang, rch * 1.3, f.arc || 0.8), t: 0.7, max: 0.7 });
        hitArc(c, f, rch, f.arc || w.arc || 1);
        break;
      case "around":
        if (f.vis === "spin" || f.vis === "sweep") {
          effects.push({ kind: "spin", low: f.vis === "sweep", r: f.radius, flip: (a.swingFlip = !a.swingFlip), t: 0.3, max: 0.3,
            color: f.color || (f.vis === "sweep" ? "#ffcf8a" : "#ffe7a0") });
        } else if (f.vis === "flame" || f.vis === "firestorm" || f.vis === "leaf") {
          // 火遁の術・ファイアストーム・リーフストーム：まわりを回るうず（2026-10-20）
          effects.push({ kind: "swirl", look: f.vis, x: a.x, y: a.y, r: f.radius, t: 0.8, max: 0.8, seed: Math.random() * 6 });
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
        // hits：1回ごとにちがう斬り（エレメントブレイク）。step：1回ごとに前へ進む（迅雷斬。敵はすりぬけない）
        for (var r = 0; r < f.count; r++) later(r * f.interval, (function (r) { return function () {
          if (Party.current() !== c || c.down) return;
          if (f.step) {   // 迅雷斬：一歩ふみこむ（残像を少し残す）
            var sx0 = a.x, sy0 = a.y;
            Enemies.moveBlocked(hooks.room, a, a.face.x * f.step, a.face.y * f.step);
            effects.push({ kind: "trail", x0: sx0, y0: sy0, x1: a.x, y1: a.y, t: 0.25, max: 0.25 });
          }
          apply(c, f.hits ? f.hits[r % f.hits.length] : f.hit);
        }; })(r));
        a.busy = f.count * f.interval;
        if (f.step) a.inv = Math.max(a.inv, f.count * f.interval);
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
          Enemies.hostile().forEach(function (e) {
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
        targets(c, f.party).forEach(function (m) { addBuff(m, f, f.src || curSkill); });
        effects.push({ kind: "glow", t: 0.4, max: 0.4, color: f.pct < 0 ? "#ff9a4d" : "#f2c14e" });
        break;
      case "beam":      // グランドクロス（2026-10-21）：十字の光のあと、前へ太い光のビーム。とどくところの敵みんなに1回ずつ当たる
        faceNearest(f.length);
        a.busy = Math.max(a.busy, 0.75);
        var bang = Math.atan2(a.face.y, a.face.x), bx0 = a.x, by0 = a.y - 4;
        effects.push({ kind: "crossflash", t: 0.35, max: 0.35, color: f.color });
        later(0.3, function () {
          if (Party.current() !== c || c.down) return;
          var ux = Math.cos(bang), uy = Math.sin(bang), len = f.length;
          for (var d0 = 8; d0 < f.length; d0 += 4) {   // かべで止まる
            if (hooks.room.blocksShot(Math.floor((bx0 + ux * d0) / World.TILE), Math.floor((by0 + 4 + uy * d0) / World.TILE))) { len = d0; break; }
          }
          effects.push({ kind: "beam", x: bx0, y: by0, ang: bang, len: len, w: f.width, t: 0.55, max: 0.55, color: f.color });
          Sound.play("hit");
          Enemies.hostile().forEach(function (e) {
            var ex = e.x - bx0, ey = (e.y - 3) - by0, along = ex * ux + ey * uy, side = Math.abs(-ex * uy + ey * ux);
            if (along > -e.r && along < len + e.r && side <= f.width / 2 + e.r) hitEnemy(e, c, { stat: f.stat, mult: f.mult, elem: f.elem, push: 6, color: f.color }, bx0, by0);
          });
        });
        break;
      case "enchant":   // 魔法剣士：剣に属性をのせる（新しくかけると前のものは消える）
        c.enchant = { elem: f.elem, t: f.dur };
        effects.push({ kind: "glow", t: 0.5, max: 0.5, color: ELEM_COLOR[f.elem] || "#ffffff" });
        break;
      case "hide":      // 隠れみの術：敵にねらわれない（キャラは半分すける）
        a.hidden = f.dur;
        effects.push({ kind: "glow", t: 0.4, max: 0.4, color: "#a3a8bd" });
        break;
      case "guts":      // 不屈の光：HPが0になるダメージを受けても、HP1で持ちこたえる
        c.guts = f.dur;
        effects.push({ kind: "glow", t: 0.6, max: 0.6, color: "#fff2a0" });
        break;
      case "charm":     // チャーム：近くの敵1体を味方にする（ボスには効かない）
        var ce = null, cd = 0;
        Enemies.hostile().forEach(function (e) {
          if (e.def.boss) return;
          var dx = e.x - a.x, dy = e.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d <= f.range + e.r && (!ce || d < cd)) { ce = e; cd = d; }
        });
        if (ce) Enemies.charm(ce, f.dur); else Battle.pop(a.x, a.y - 40, "近くに敵がいない", "#a3a8bd", 8);
        effects.push({ kind: "glow", t: 0.4, max: 0.4, color: "#ff8ac8" });
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
    if (f.look === "meteor") { meteors(c, f, cx, cy); return; }
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

  // メテオ：空から隕石が1つずつ落ちて、落ちたところのまわりに当たる（2026-10-20）
  function meteors(c, f, cx, cy) {
    effects.push({ kind: "ring", x: cx, y: cy, r: f.radius + 10, t: 0.3 + f.count * 0.3 + 0.4, max: 0.3 + f.count * 0.3 + 0.4, color: "#ff8a3d" });
    for (var m = 0; m < f.count; m++) {
      later(0.1 + m * 0.3, function () {
        var an = Math.random() * Math.PI * 2, dd = Math.random() * f.radius * 0.8;
        var px = cx + Math.cos(an) * dd, py = cy + Math.sin(an) * dd * 0.7;
        effects.push({ kind: "meteor", x: px, y: py, t: 0.75, max: 0.75 });
        later(0.3, function () {
          effects.push({ kind: "boom", x: px, y: py, r: f.hitRadius, t: 0.45, max: 0.45 });
          Sound.play("hit");
          hitAround(c, { stat: f.stat, mult: f.mult, elem: f.elem, push: 10 }, px, py, f.hitRadius);
        });
      });
    }
  }

  // 向いている方（左右 arc ラジアン以内）で、range より近いいちばん近い敵
  function nearestInFront(range, arc) {
    var a = A(), ang = Math.atan2(a.face.y, a.face.x), best = null;
    Enemies.hostile().forEach(function (e) {
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
    if (cast) { cast.t -= dt; if (cast.t <= 0) cast = null; }
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
      Enemies.hostile().forEach(function (e) {
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
          if (s.spec.onHit && got > 0) s.spec.onHit(s.c);
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
        Enemies.hostile().forEach(function (e) {
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

  function clear() { shots.length = 0; zones.length = 0; queue.length = 0; effects.length = 0; cast = null; }

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
      if (s.spec.look) { drawLook(ctx, s, x, y, cam); return; }   // 手裏剣・破衝撃・グランドクロス（2026-10-20）
      if (s.spec.orb) { drawOrb(ctx, s, x, y, cam); return; }   // 気功波：気の玉
      if (s.spec.stat !== "m") {   // ねらい撃ちなどの大きな矢：光る矢と光の尾（2026-10-19）
        drawBigArrow(ctx, s, x, y, cam);
        return;
      }
      if (s.spec.elem === "fire") drawFireball(ctx, s, x, y, cam); else drawOrb(ctx, s, x, y, cam);
    });
    effects.forEach(function (ef) { drawEffect(ctx, ef, a, cam); });
    drawCastFront(ctx, cam);
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
  // 形のある飛ぶもの（2026-10-20）
  function drawLook(ctx, s, x, y, cam) {
    var len = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1, ang = Math.atan2(s.vy, s.vx);
    ctx.save(); ctx.translate(x, y);
    if (s.spec.look === "shuriken") {   // 手裏剣：回る4つの刃
      glowDot(ctx, 0, 0, 6, "#ffffff", s.color, 0.35);
      ctx.rotate(clock * 25);
      ctx.fillStyle = s.color;
      for (var i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(4, 0); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#30346d"; ctx.fillRect(-0.5, -0.5, 1, 1);
    } else if (s.spec.look === "crescent") {   // 破衝撃：飛んでいく三日月の斬撃
      ctx.rotate(ang);
      (s.trail || []).forEach(function (t, i, all) { glowDot(ctx, -(all.length - i) * 2.5, 0, 4, "#ffffff", s.color, 0.15 * (i + 1) / all.length); });
      ctx.fillStyle = rgba(s.color, 0.85);
      ctx.beginPath(); ctx.arc(-4, 0, 9, -1.2, 1.2); ctx.arc(-7, 0, 8, 1.1, -1.1, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-4, 0, 9, -1.0, 1.0); ctx.stroke();
    } else if (s.spec.look === "cross") {   // グランドクロス：光の十字
      glowDot(ctx, 0, 0, 16, "#ffffff", s.color, 0.6);
      (s.trail || []).forEach(function (t, i, all) { glowDot(ctx, t.x - s.x, t.y - s.y, 4 + 6 * (i + 1) / all.length, "#ffffff", s.color, 0.2 * (i + 1) / all.length); });
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(-1.5, -9, 3, 18); ctx.fillRect(-7, -2.5, 14, 3);
    }
    ctx.restore();
  }
  function drawEffect(ctx, ef, a, cam) {
    var p = ef.t / ef.max, q = 1 - p;   // p：のこり、q：すすみぐあい
    if (ef.kind === "swirl") {   // 火遁の術・ファイアストーム・リーフストーム：まわりを回るうず
      var wx = ef.x - cam.x, wy = ef.y - cam.y - 3, wr = ef.r * (0.4 + 0.6 * Math.min(1, q * 2.2));
      var col = ef.look === "leaf" ? "#9be36a" : "#ff8a3d", col2 = ef.look === "leaf" ? "#e0ffb0" : "#fff3c4";
      var bg = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      bg.addColorStop(0, rgba(col, 0.05)); bg.addColorStop(0.75, rgba(col, 0.3 * p)); bg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
      var n = ef.look === "firestorm" ? 18 : 14;
      for (var i = 0; i < n; i++) {
        var an = ef.seed + i / n * Math.PI * 2 + q * (ef.look === "firestorm" ? 9 : 7), rr = wr * (0.45 + 0.5 * ((i * 5) % 7) / 7);
        var px = wx + Math.cos(an) * rr, py = wy + Math.sin(an) * rr * 0.75;
        if (ef.look === "leaf") {   // 葉の刃
          ctx.save(); ctx.translate(px, py); ctx.rotate(an + Math.PI / 2);
          ctx.fillStyle = rgba(i % 2 ? "#6fd08c" : "#b8f08a", p);
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(2.5, 0, 0, 4); ctx.quadraticCurveTo(-2.5, 0, 0, -4); ctx.fill();
          ctx.restore();
        } else {
          glowDot(ctx, px, py - Math.sin(q * Math.PI) * 4, 5 + (i % 3), col2, col, 0.8 * p);
        }
      }
      return;
    }
    if (ef.kind === "crossflash") {   // グランドクロスのため：キャラの前に光の十字が広がる
      var cx2 = a.x - cam.x + a.face.x * 8, cy2 = a.y - cam.y - 6 + a.face.y * 6, s2 = 4 + 10 * Math.min(1, q * 1.6);
      glowDot(ctx, cx2, cy2, s2 * 1.8, "#ffffff", ef.color, 0.7);
      ctx.fillStyle = rgba("#ffffff", 0.95);
      ctx.fillRect(cx2 - 1.5, cy2 - s2, 3, s2 * 2); ctx.fillRect(cx2 - s2 * 0.7, cy2 - s2 * 0.35, s2 * 1.4, 3);
      return;
    }
    if (ef.kind === "beam") {   // グランドクロス：前へのびる太い光のビーム（出たときがいちばん太く、だんだん細くなって消える）
      var bx = ef.x - cam.x, by = ef.y - cam.y, grow = Math.min(1, q / 0.12), L = ef.len * grow, W = ef.w * (q < 0.15 ? 1.15 : p * 1.1);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(ef.ang);
      var lg = ctx.createLinearGradient(0, -W, 0, W);
      lg.addColorStop(0, rgba(ef.color, 0)); lg.addColorStop(0.3, rgba(ef.color, 0.55)); lg.addColorStop(0.5, rgba("#ffffff", 0.95));
      lg.addColorStop(0.7, rgba(ef.color, 0.55)); lg.addColorStop(1, rgba(ef.color, 0));
      ctx.fillStyle = lg; ctx.fillRect(4, -W, L, W * 2);
      ctx.fillStyle = rgba("#ffffff", Math.min(1, p * 1.5)); ctx.fillRect(4, -W * 0.18, L, W * 0.36);   // まんなかの白い芯
      glowDot(ctx, 6, 0, W * 1.4, "#ffffff", ef.color, 0.8 * p);   // 出口の光
      glowDot(ctx, 4 + L, 0, W, "#ffffff", ef.color, 0.6 * p);     // 先の光
      for (var bp = 0; bp < 8; bp++) {   // 流れる光の粒
        var ph = (q * 3 + bp / 8) % 1;
        glowDot(ctx, 4 + L * ph, Math.sin(bp * 5.1) * W * 0.7, 2.5, "#ffffff", ef.color, 0.8 * p);
      }
      ctx.restore();
      return;
    }
    if (ef.kind === "meteor") {   // メテオ：ななめ上から落ちてくる、燃える岩
      var mx = ef.x - cam.x, my = ef.y - cam.y, fall = Math.min(1, q / 0.4);
      if (fall < 1) {
        var hx = mx + 40 * (1 - fall), hy = my - 70 * (1 - fall);
        for (var k = 1; k <= 5; k++) glowDot(ctx, hx + k * 5, hy - k * 9, 7 - k, "#fff3c4", "#ff5a1f", 0.5 * (1 - k / 6));
        glowDot(ctx, hx, hy, 10, "#ffffff", "#ff6a1f", 0.9);
        ctx.fillStyle = "#5a3d22"; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = rgba("#ff8a3d", 0.6 * (1 - fall * 0.5) * p); ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(mx, my, 10, 5, 0, 0, Math.PI * 2); else ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
      return;
    }
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
      var nx4 = -Math.sin(la), ny4 = Math.cos(la), w4 = (ef.thin ? 1.6 : 3) * p;
      ctx.fillStyle = rgba(ef.color || "#e8f4ff", 0.85 * p);
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

  return { hooks: hooks, targetFor: targetFor, normalAttack: normalAttack, useSkill: useSkill, update: update, draw: draw, clear: clear, drawSlash: drawSlash, glowDot: glowDot, mpCost: mpCost, drawCastBack: drawCastBack };
})();
