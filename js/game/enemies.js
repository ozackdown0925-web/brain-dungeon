// 敵：ゴブリンの剣士・槍兵・弓兵・つる草の魔物の動きと攻撃、矢、状態異常。
// ふつうの攻撃は「当たる前提」の設計。攻撃の前には短い予告（構え）があるが、かわすことは求めない。
var Enemies = (function () {
  var list = [];
  var arrows = [];
  var fxs = [];     // 敵の攻撃の見た目（剣の斬り・かみつき・針。2026-10-19）

  // depth：強さの深さ（docs/draft.md 2。深さ d で HP ×(1＋0.12×(d−1))、攻撃 ×(1＋0.10×(d−1))）。省くと1。
  function spawn(type, x, y, depth) {
    var d = GameData.ENEMIES[type];
    var k = Math.max(0, (depth || 1) - 1);
    var hp = Math.round(d.hp * (1 + 0.12 * k)), patk = Math.round(d.patk * (1 + 0.10 * k) * 10) / 10;
    var e = {
      type: type, def: d, x: x, y: y, r: d.r,
      hp: hp, maxHp: hp, patk: patk, pdef: d.pdef, mdef: d.mdef, res: d.res,
      state: "chase", t: 0, cd: 0.6 + Math.random() * 0.8,
      face: { x: -1, y: 0 }, aim: null, flash: 0, dead: false, fade: 0.4,
      strafe: Math.random() < 0.5 ? 1 : -1, walk: Math.random() * 6, status: {}
    };
    list.push(e);
    return e;
  }

  function clear() { list.length = 0; arrows.length = 0; fxs.length = 0; Bosses.clear(); }

  // 飛ぶもの（弓兵の矢・大木の魔物の種）。opts はダメージの倍率など（hurt にそのまま渡す）
  function addArrow(e, angle, speed, opts) {
    arrows.push({ x: e.x + Math.cos(angle) * (e.r + 2), y: e.y + Math.sin(angle) * (e.r + 2), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                  life: 2.6, from: e, opts: opts || null });
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
    if (type === "sleep" || type === "para") { if (e.state === "windup") { e.state = "recover"; e.t = 0.2; } }
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
  function hostile() { return list.filter(function (e) { return !e.dead && !e.charm; }); }
  // チャーム：敵1体を、決まった時間だけ味方にする（ほかの敵を攻撃し、ほかの敵にもねらわれる）
  function charm(e, dur) {
    if (e.dead || e.def.boss) return;
    e.charm = { t: dur };
    e.state = "chase"; e.t = 0; e.cd = 0.3;
    Battle.pop(e.x, e.y - 30, "仲間になった！", "#ff8ac8", 8);
  }
  function uncharm(e) {
    delete e.charm;
    e.state = "chase"; e.t = 0; e.cd = 0.8;
    Battle.pop(e.x, e.y - 30, "元にもどった", "#a3a8bd", 8);
  }
  // 敵が敵にダメージを与える（チャームした敵と、ほかの敵のあいだ）
  var killHook = function () {};
  function hitFoe(from, v, opts) {
    if (v.dead) return;
    opts = opts || {};
    var res = Battle.damage(from.patk * (opts.mult || 1), v.pdef, { element: "none", res: null, crit: 0, minPct: 0.3 });
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
          if ((d.kind !== "archer" || gap >= d.keepMin) && d.kind !== "bee") e.face = { x: ux, y: uy };
          var before = { x: e.x, y: e.y };
          room.move(e, mx * d.speed * dt, my * d.speed * dt);
          if (d.kind === "archer" && Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < 0.01) e.strafe = -e.strafe;
          e.walk += dt * 8;
        }
      }
    });

    Bosses.updateHazards(dt, p, hurt);

    // 敵どうし・プレイヤーと重ならないように押し合う（ボスは押されない）
    var live = alive();
    for (var i = 0; i < live.length; i++) {
      var a = live[i];
      for (var j = i + 1; j < live.length; j++) push(a, live[j], room);
      if (Bosses.isBoss(a)) continue;
      var dx = a.x - p.x, dy = a.y - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001, min = a.r + p.r;
      if (dist < min) room.move(a, dx / dist * (min - dist), dy / dist * (min - dist));
    }

    // 矢
    for (var k = arrows.length - 1; k >= 0; k--) {
      var ar = arrows[k];
      ar.life -= dt;
      ar.x += ar.vx * dt; ar.y += ar.vy * dt;
      var tx = Math.floor(ar.x / World.TILE), ty = Math.floor(ar.y / World.TILE);
      var hitWall = room.blocksShot(tx, ty);
      // 矢が当たる相手：チャームした敵の矢はほかの敵に、ふつうの敵の矢はプレイヤーとチャームした敵に
      var foe = null;
      list.forEach(function (o) {
        if (foe || o.dead || o === ar.from || !!o.charm === !!ar.ally) return;
        var ox = ar.x - o.x, oy = ar.y - (o.y - 3);
        if (ox * ox + oy * oy < (o.r + 2) * (o.r + 2)) foe = o;
      });
      if (foe) { hitFoe(ar.from, foe, ar.opts); arrows.splice(k, 1); continue; }
      var ddx = ar.x - p.x, ddy = ar.y - p.y;
      if (!ar.ally && !p.down && ddx * ddx + ddy * ddy < (p.r + 2) * (p.r + 2)) { hurt(ar.from, ar.x, ar.y, ar.opts); arrows.splice(k, 1); continue; }
      if (hitWall || ar.life <= 0) arrows.splice(k, 1);
    }

    // 消えきった敵をのぞく
    for (var m = list.length - 1; m >= 0; m--) if (list[m].dead && list[m].fade <= 0) list.splice(m, 1);
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
    else if (d.kind === "melee") fxs.push({ kind: e.type === "wolf_pup" ? "bite" : "slash", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.2, max: 0.2, flip: Math.random() < 0.5 });
    else if (d.kind === "bee") fxs.push({ kind: "sting", e: e, aim: { x: e.aim.x, y: e.aim.y }, reach: d.reach, t: 0.18, max: 0.18 });
  }

  // キャラを動かす。生きている敵にめりこむ方向には進めない（すり抜けない）。
  // 横と縦を別々に動かすので、敵のわきはすべるように回りこめる。離れる方向にはいつでも動ける。
  function moveBlocked(room, p, dx, dy) {
    var live = alive();
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
    var ab = Bosses.isBoss(a), bb = Bosses.isBoss(b);
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
      if (Bosses.isBoss(e)) { Bosses.draw(e, cam, clock); ctx.globalAlpha = 1; return; }
      Render.rect(x - 6, y + 4, 12, 3, "rgba(0,0,0,0.35)");
      // 段階7-2c：ドット絵（monsters.js）。足もとは y＋6。槍・弓・つるは、向きに合わせてここで描く
      var top = e.type === "wolf_pup" ? 8 : e.type === "mushroom" ? 10 : 15;   // 頭の上のはしが、まんなかから何点上か（HP のバーと「！」の位置）
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
      Monsters.drawSmall(ctx, e, x, y + 6);
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
    fxs.forEach(function (f) { drawFx(ctx, f, cam); });
    arrows.forEach(function (a) {
      var x = a.x - cam.x, y = a.y - cam.y;
      if (a.opts && a.opts.seed) { Render.rect(x - 2, y - 2, 4, 4, "#a8d070"); Render.rect(x - 1, y - 1, 2, 2, "#5a7a30"); return; }
      var len = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      ctx.strokeStyle = "#e8d8b0"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - a.vx / len * 6, y - a.vy / len * 6); ctx.stroke();
    });
  }

  // 敵の攻撃の見た目
  function drawFx(ctx, f, cam) {
    var e = f.e, x = e.x - cam.x, y = e.y - cam.y - 3, k = 1 - f.t / f.max, p = f.t / f.max;
    if (f.kind === "slash") {
      Combat.drawSlash(ctx, x, y, f.aim, 0.9, f.reach + e.r + 2, "#ff7a6a", k, f.flip);
    } else if (f.kind === "bite") {   // かみつき：上と下のきばが、前で閉じる
      var bx = x + f.aim.x * (e.r + f.reach * 0.7), by = y + f.aim.y * (e.r + f.reach * 0.7), gap = 6 * (1 - Math.min(1, k * 1.6));
      ctx.strokeStyle = "rgba(255,255,255," + p.toFixed(2) + ")"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(bx, by - gap, 5, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by + gap, 5, Math.PI + 0.3, Math.PI * 2 - 0.3); ctx.stroke();
      ctx.lineCap = "butt";
      if (k > 0.5) Combat.glowDot(ctx, bx, by, 6, "#ffffff", "#ff7a6a", 0.7 * p);
    } else if (f.kind === "sting") {  // 針：前へ、黄色い光がすっと出る
      var L = (e.r + f.reach) * Math.min(1, k * 1.8);
      ctx.strokeStyle = "rgba(255,230,120," + p.toFixed(2) + ")"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + f.aim.x * 4, y + f.aim.y * 4); ctx.lineTo(x + f.aim.x * L, y + f.aim.y * L); ctx.stroke();
      Combat.glowDot(ctx, x + f.aim.x * L, y + f.aim.y * L, 4, "#ffffff", "#ffe066", 0.8 * p);
    }
  }
  function updateFx(dt) { for (var i = fxs.length - 1; i >= 0; i--) { fxs[i].t -= dt; if (fxs[i].t <= 0) fxs.splice(i, 1); } }

  return { spawn: spawn, clear: clear, moveBlocked: moveBlocked, alive: alive, hostile: hostile, charm: charm, list: list, update: update, draw: draw, addStatus: addStatus };
})();
