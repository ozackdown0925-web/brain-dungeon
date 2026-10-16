// 敵：ゴブリンの剣士・槍兵・弓兵・つる草の魔物の動きと攻撃、矢、状態異常。
// ふつうの攻撃は「当たる前提」の設計。攻撃の前には短い予告（構え）があるが、かわすことは求めない。
var Enemies = (function () {
  var list = [];
  var arrows = [];

  function spawn(type, x, y) {
    var d = GameData.ENEMIES[type];
    var e = {
      type: type, def: d, x: x, y: y, r: d.r,
      hp: d.hp, maxHp: d.hp, patk: d.patk, pdef: d.pdef, mdef: d.mdef, res: d.res,
      state: "chase", t: 0, cd: 0.6 + Math.random() * 0.8,
      face: { x: -1, y: 0 }, aim: null, flash: 0, dead: false, fade: 0.4,
      strafe: Math.random() < 0.5 ? 1 : -1, walk: Math.random() * 6, status: {}
    };
    list.push(e);
    return e;
  }

  function clear() { list.length = 0; arrows.length = 0; }

  // 状態異常をかける（docs/draft.md 1.7。ボスはあとで：成功率×0.3・長さ半分）
  function addStatus(e, type, dur) {
    if (e.dead) return;
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

  // 毎フレーム：p はプレイヤー、hurt(e, amount元の攻撃力) はプレイヤーにダメージを与える関数
  function update(dt, room, p, hurt, onKill) {
    list.forEach(function (e) {
      e.flash = Math.max(0, e.flash - dt);
      e.lash = Math.max(0, (e.lash || 0) - dt);
      if (e.dead) { e.fade -= dt; return; }
      tickStatus(e, dt, onKill);
      if (e.dead) return;
      if (e.status.sleep) return; // 眠っているあいだは何もしない
      var dx = p.x - e.x, dy = p.y - e.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      var ux = dx / dist, uy = dy / dist;
      var gap = dist - e.r - p.r; // おたがいのふちの間の距離
      var d = e.def;
      e.cd = Math.max(0, e.cd - dt);
      var mx = 0, my = 0;

      if (e.state === "windup") {
        e.t -= dt;
        if (e.t <= 0) attack(e, p, gap, hurt);
      } else if (e.state === "recover") {
        e.t -= dt;
        if (e.t <= 0) e.state = "chase";
      } else if (p.down) {
        // プレイヤーが倒れているあいだは様子を見る
      } else if (d.kind === "melee") {
        if (gap > d.reach - 2) { mx = ux; my = uy; }
        else if (e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "spear") {
        if (gap > d.keep + 8) { mx = ux; my = uy; }
        else if (gap < d.keep - 6) { mx = -ux; my = -uy; }
        if (gap <= d.reach - 4 && e.cd <= 0) startWindup(e, ux, uy);
      } else if (d.kind === "vine") {
        if (gap <= d.reach - 4 && e.cd <= 0) startWindup(e, ux, uy);
        else e.face = { x: ux, y: uy };
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
          if (d.kind !== "archer" || gap >= d.keepMin) e.face = { x: ux, y: uy };
          var before = { x: e.x, y: e.y };
          room.move(e, mx * d.speed * dt, my * d.speed * dt);
          if (d.kind === "archer" && Math.abs(e.x - before.x) + Math.abs(e.y - before.y) < 0.01) e.strafe = -e.strafe;
          e.walk += dt * 8;
        }
      }
    });

    // 敵どうし・プレイヤーと重ならないように押し合う
    var live = alive();
    for (var i = 0; i < live.length; i++) {
      var a = live[i];
      for (var j = i + 1; j < live.length; j++) push(a, live[j], room);
      var dx = a.x - p.x, dy = a.y - p.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001, min = a.r + p.r;
      if (dist < min) room.move(a, dx / dist * (min - dist), dy / dist * (min - dist));
    }

    // 矢
    for (var k = arrows.length - 1; k >= 0; k--) {
      var ar = arrows[k];
      ar.life -= dt;
      ar.x += ar.vx * dt; ar.y += ar.vy * dt;
      var tx = Math.floor(ar.x / World.TILE), ty = Math.floor(ar.y / World.TILE);
      var hitWall = room.tile(tx, ty) === "#";
      var ddx = ar.x - p.x, ddy = ar.y - p.y;
      if (!p.down && ddx * ddx + ddy * ddy < (p.r + 2) * (p.r + 2)) { hurt(ar.from, ar.x, ar.y); arrows.splice(k, 1); continue; }
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
      arrows.push({ x: e.x + e.aim.x * 6, y: e.y + e.aim.y * 6, vx: e.aim.x * d.arrowSpeed, vy: e.aim.y * d.arrowSpeed, life: 2.2, from: e });
      return;
    }
    // 近い攻撃：構えたときの向きのまま。届けば当たる
    if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8);
    if (d.kind === "vine") e.lash = 0.25;
  }

  function push(a, b, room) {
    var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001, min = a.r + b.r;
    if (dist >= min) return;
    var s = (min - dist) / 2;
    room.move(a, -dx / dist * s, -dy / dist * s);
    room.move(b, dx / dist * s, dy / dist * s);
  }

  // ---------- 描画（仮の絵） ----------
  function draw(cam) {
    var ctx = Render.ctx;
    list.forEach(function (e) {
      var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
      var d = e.def;
      ctx.globalAlpha = e.dead ? Math.max(0, e.fade / 0.4) : 1;
      var bob = Math.sin(e.walk) > 0 ? 1 : 0;
      Render.rect(x - 6, y + 4, 12, 3, "rgba(0,0,0,0.35)");
      var body = e.flash > 0 ? "#ffffff" : d.color;
      Render.rect(x - 5, y - 6 - bob, 10, 10, body);
      Render.rect(x - 4, y - 11 - bob, 8, 6, e.flash > 0 ? "#ffffff" : "#9bbf5a");
      Render.rect(x - 3 + Math.round(e.face.x * 2), y - 9 - bob, 2, 2, "#c0392b");
      Render.rect(x + 1 + Math.round(e.face.x * 2), y - 9 - bob, 2, 2, "#c0392b");
      // 持ち物で見分ける
      if (d.kind === "melee") Render.rect(x + (e.face.x < 0 ? -8 : 5), y - 5 - bob, 3, 8, "#8a6a3a");
      if (d.kind === "spear") {
        ctx.strokeStyle = "#c9ccd6"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + e.face.x * 16, y - 3 + e.face.y * 16); ctx.stroke();
      }
      if (d.kind === "vine") {
        var la = e.lash > 0 ? 1 : 0;
        ctx.strokeStyle = "#2f6a2a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 2);
        ctx.lineTo(x + e.face.x * (8 + la * (d.reach + 2)), y - 2 + e.face.y * (8 + la * (d.reach + 2))); ctx.stroke();
      }
      if (d.kind === "archer") {
        ctx.strokeStyle = "#a0703a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x + e.face.x * 5, y - 3, 5, Math.atan2(e.face.y, e.face.x) - 1.2, Math.atan2(e.face.y, e.face.x) + 1.2); ctx.stroke();
      }
      // 状態異常の印
      var marks = Object.keys(e.status).filter(function (k) { return k !== "break"; });
      if (marks.length && !e.dead) Render.text(marks.map(function (k) { return GameData.STATUS[k].name; }).join(" "), x, y + 7, { size: 6, align: "center", color: GameData.STATUS[marks[0]].color });
      if (e.status.sleep && !e.dead) Render.text("Zz", x + 7, y - 20, { size: 7, color: "#b48cf0" });
      // 構え（予告）
      if (e.state === "windup" && !e.dead) {
        Render.text("！", x, y - 24 - bob, { size: 9, align: "center", bold: true, color: "#ffd24a" });
        if (d.kind === "spear") {
          ctx.strokeStyle = "rgba(239,91,91,0.5)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + e.aim.x * (d.reach + e.r), y - 3 + e.aim.y * (d.reach + e.r)); ctx.stroke();
        }
      }
      // HP のバー（へっていたら出す）
      if (!e.dead && e.hp < e.maxHp) {
        Render.rect(x - 8, y - 17 - bob, 16, 2, "#2a2f42");
        Render.rect(x - 8, y - 17 - bob, Math.round(16 * e.hp / e.maxHp), 2, "#ef5b5b");
      }
    });
    ctx.globalAlpha = 1;
    arrows.forEach(function (a) {
      var x = a.x - cam.x, y = a.y - cam.y;
      var len = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      ctx.strokeStyle = "#e8d8b0"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - a.vx / len * 6, y - a.vy / len * 6); ctx.stroke();
    });
  }

  return { spawn: spawn, clear: clear, alive: alive, list: list, update: update, draw: draw, addStatus: addStatus };
})();
