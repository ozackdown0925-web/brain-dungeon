// ボスの動き（段階4-3）：大オオカミ（7階）と大木の魔物（14階）。数字は data.js の ENEMIES、たたき台は docs/draft.md 2。
// ふつうの攻撃は「当たる前提」。かわすことを求めるのは、とても大きなダメージの大技だけで、地面で 1.5〜2 秒前に予告する。
//   大オオカミ：大突進（赤い線で1.5秒予告）／大木の魔物：根の大波（地面が光って2秒予告。HP が半分になると増える）
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Bosses = (function () {
  var hazards = []; // 地面の予告と大技：{ kind: "line"|"rect", ..., t, warn, from }

  function clear() { hazards.length = 0; }
  function isBoss(e) { return !!(e && e.def && e.def.boss); }

  // ボスが出たときの準備
  function setup(e) {
    var d = e.def;
    e.ai = { charge: d.chargeEvery ? 4 : 0, howl: d.howlEvery ? 8 : 0, roots: d.rootEvery ? 5 : 0, pollen: d.pollenEvery ? 9 : 0 };
  }

  // 眠り・しびれで大技が止まったとき
  function interrupt(e) {
    if (e.state === "warn" || e.state === "charge" || e.state === "howl" || e.state === "pollen" || e.state === "seed") { e.state = "recover"; e.t = 0.4; }
    for (var i = hazards.length - 1; i >= 0; i--) if (hazards[i].from === e && hazards[i].kind === "line") hazards.splice(i, 1);
  }

  // 毎フレーム。p はプレイヤー、hurt(e, x, y, opts) はプレイヤーにダメージ、api は Enemies の中の道具
  function update(e, dt, room, p, hurt, api) {
    if (!e.ai) setup(e);
    var dx = p.x - e.x, dy = p.y - e.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var ux = dx / dist, uy = dy / dist, gap = dist - e.r - p.r;
    var d = e.def;
    e.cd = Math.max(0, e.cd - dt);
    ["charge", "howl", "roots", "pollen"].forEach(function (k) { e.ai[k] = Math.max(0, e.ai[k] - dt); });
    if (d.kind === "wolf_boss") wolf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else tree(e, dt, room, p, hurt, api, ux, uy, gap, dist);
  }

  // ---------- 大オオカミ ----------
  function wolf(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def;
    if (e.state === "windup") { // かみつき
      e.t -= dt;
      if (e.t <= 0) { if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8); e.state = "recover"; e.t = 0.4; e.cd = d.cooldown; }
      return;
    }
    if (e.state === "howl") {
      e.t -= dt;
      if (e.t <= 0) {
        for (var i = 0; i < 2; i++) {
          var a = Math.random() * Math.PI * 2;
          var pup = api.spawn("wolf_pup", e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, 1);
          pup.summoned = true;
        }
        e.state = "recover"; e.t = 0.5; e.ai.howl = d.howlEvery;
      }
      return;
    }
    if (e.state === "warn") { // 大突進の予告：赤い線
      e.t -= dt;
      if (e.t <= 0) { e.state = "charge"; e.travel = 0; e.hitDone = false; }
      return;
    }
    if (e.state === "charge") {
      var step = d.chargeSpeed * dt, bx = e.x, by = e.y;
      room.move(e, e.aim.x * step, e.aim.y * step);
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step;
      e.walk += dt * 20;
      var px = p.x - e.x, py = p.y - e.y;
      if (!e.hitDone && !p.down && px * px + py * py < (e.r + p.r + 3) * (e.r + p.r + 3)) { e.hitDone = true; hurt(e, p.x, p.y - 8, { mult: d.chargeMult, big: true }); }
      if (moved < step * 0.4 || e.travel >= e.chargeLen) {
        e.state = "recover"; e.t = 0.9;
        removeLines(e);
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    var pups = api.alive().filter(function (o) { return o.type === "wolf_pup"; }).length;
    if (e.ai.howl <= 0 && pups < 2) {
      e.state = "howl"; e.t = 0.8;
      Battle.pop(e.x, e.y - 30, "遠ぼえ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.charge <= 0) { // 近くにいても大突進する（くっついているだけでは勝てないように）
      // 大突進：プレイヤーへ向けて、壁まで（最大260ドット）走る。線で予告する
      e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
      e.chargeLen = Math.min(260, rayLength(room, e.x, e.y, ux, uy, e.r));
      hazards.push({ kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ux * e.chargeLen, y2: e.y + uy * e.chargeLen, w: e.r * 2 + 4, t: 0, warn: d.chargeWarn });
      e.state = "warn"; e.t = d.chargeWarn; e.ai.charge = d.chargeEvery + Math.random() * 2;
      Battle.pop(e.x, e.y - 30, "大突進の構え！", "#ef5b5b", 9);
      return;
    }
    if (gap > d.reach - 2) {
      if (!e.status.para) { room.move(e, ux * d.speed * dt, uy * d.speed * dt); e.walk += dt * 8; }
      e.face = { x: ux, y: uy };
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = d.windup; e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
    }
  }

  function removeLines(e) {
    for (var i = hazards.length - 1; i >= 0; i--) if (hazards[i].from === e && hazards[i].kind === "line") hazards.splice(i, 1);
  }
  // (x, y) から (ux, uy) の向きに、壁にぶつかるまでの長さ
  function rayLength(room, x, y, ux, uy, r) {
    for (var s = 0; s < 400; s += 4) {
      if (room.hitsWall(x + ux * s - r, y + uy * s - r, r * 2, r * 2)) return Math.max(0, s - 4);
    }
    return 400;
  }

  // ---------- 大木の魔物（動かない） ----------
  function tree(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def;
    e.face = { x: ux, y: uy };
    if (e.state === "windup") { // 枝はらい（まわり）
      e.t -= dt;
      if (e.t <= 0) { if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8, { mult: 1.2 }); e.sweep = 0.25; e.state = "recover"; e.t = 0.5; e.cd = d.cooldown; }
      return;
    }
    if (e.state === "seed") { // 種とばし（3方向）
      e.t -= dt;
      if (e.t <= 0) {
        var ang = Math.atan2(uy, ux);
        for (var k = -1; k <= 1; k++) api.addArrow(e, ang + k * 0.35, d.seedSpeed, { mult: 0.8, seed: true });
        e.state = "recover"; e.t = 0.6; e.cd = d.cooldown + 0.4;
      }
      return;
    }
    if (e.state === "pollen") { // ねむりの花粉（まわり）
      e.t -= dt;
      if (e.t <= 0) {
        e.pollenFx = 0.6;
        if (!p.down && dist <= d.pollenRadius + p.r) hurt(e, p.x, p.y - 8, { noDamage: true, status: { type: "sleep", chance: 0.6, dur: 3 } });
        e.state = "recover"; e.t = 0.6;
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    var half = e.hp <= e.maxHp / 2;
    if (e.ai.roots <= 0) {
      // 根の大波：部屋を横切る帯が光って2秒後に根がつき出る。1本はいつもプレイヤーの場所を通る。HP が半分になると本数が増える
      var n = half ? 4 : 2 + (Math.random() < 0.5 ? 1 : 0), W = 28;
      for (var i = 0; i < n; i++) {
        var vertical = Math.random() < 0.5;
        var cx = i === 0 ? p.x : 24 + Math.random() * (room.pxW - 48);
        var cy = i === 0 ? p.y : 24 + Math.random() * (room.pxH - 48);
        hazards.push(vertical
          ? { kind: "rect", from: e, x: cx - W / 2, y: 0, w: W, h: room.pxH, t: 0, warn: d.rootWarn, erupt: 0.4, hit: false }
          : { kind: "rect", from: e, x: 0, y: cy - W / 2, w: room.pxW, h: W, t: 0, warn: d.rootWarn, erupt: 0.4, hit: false });
      }
      e.ai.roots = half ? d.rootEveryHalf : d.rootEvery;
      Battle.pop(e.x, e.y - 40, "根の大波！", "#ef5b5b", 9);
      e.state = "recover"; e.t = 0.6;
      return;
    }
    if (e.ai.pollen <= 0 && dist < d.pollenRadius + 10) {
      e.state = "pollen"; e.t = 0.8; e.ai.pollen = d.pollenEvery;
      Battle.pop(e.x, e.y - 40, "ねむりの花粉", "#b48cf0", 8);
      return;
    }
    if (e.cd > 0) return;
    if (gap <= d.reach) { e.state = "windup"; e.t = d.windup; }
    else { e.state = "seed"; e.t = 0.5; }
  }

  // ---------- 予告と大技（地面） ----------
  function updateHazards(dt, p, hurt) {
    for (var i = hazards.length - 1; i >= 0; i--) {
      var h = hazards[i];
      h.t += dt;
      if (h.kind === "line") continue; // 大突進の線は、ボスが走り終わると消える
      if (h.t >= h.warn && !h.hit) {
        h.hit = true;
        if (!p.down && p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h && !h.from.dead) hurt(h.from, p.x, p.y - 8, { mult: h.from.def.rootMult, big: true });
      }
      if (h.t >= h.warn + h.erupt) hazards.splice(i, 1);
    }
  }

  // ボスが倒れたら、地面の予告も消す
  function bossDown() { hazards.length = 0; }

  // ---------- 描画 ----------
  function drawHazards(cam, glow) {
    var ctx = Render.ctx;
    hazards.forEach(function (h) {
      var blink = 0.35 + 0.25 * Math.sin(glow * 14);
      if (h.kind === "line") {
        ctx.strokeStyle = "rgba(239,91,91," + blink.toFixed(2) + ")"; ctx.lineWidth = h.w; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(h.x1 - cam.x, h.y1 - cam.y); ctx.lineTo(h.x2 - cam.x, h.y2 - cam.y); ctx.stroke();
        ctx.lineCap = "butt";
        return;
      }
      var x = h.x - cam.x, y = h.y - cam.y;
      if (h.t < h.warn) {
        // 光る帯：時間がたつほど明るくなる
        var k = h.t / h.warn;
        Render.rect(x, y, h.w, h.h, "rgba(255,220,90," + (0.12 + 0.3 * k + 0.1 * Math.sin(glow * 16)).toFixed(2) + ")");
      } else {
        Render.rect(x, y, h.w, h.h, "rgba(90,60,30,0.75)");
        var along = h.w > h.h, len = along ? h.w : h.h;
        for (var s = 4; s < len; s += 10) {
          if (along) Render.rect(x + s, y + 4, 4, h.h - 8, "#8a6a3a"); else Render.rect(x + 4, y + s, h.w - 8, 4, "#8a6a3a");
        }
      }
    });
  }

  // ボスの絵
  function draw(e, cam, glow) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y), d = e.def, ctx = Render.ctx;
    if (d.kind === "wolf_boss") {
      // 段階7-2c：ドット絵（monsters.js、52×40）。足もとは y＋11
      var ph = Math.sin(e.walk || 0), moving = e.state === "chase" || e.state === "charge";
      Render.rect(x - 18, y + 8, 36, 5, "rgba(0,0,0,0.35)");
      Monsters.drawBoss(ctx, e, x, y + 11, !moving ? "stand" : ph > 0 ? "walkA" : "walkB");
      if (e.state === "warn") Render.text("！", x, y - 34, { size: 12, align: "center", bold: true, color: "#ef5b5b" });
      if (e.state === "howl") Render.text("ウォォーン", x, y - 34, { size: 8, align: "center", bold: true, color: "#ffd24a" });
    } else {
      // 段階7-2c：ドット絵（monsters.js、64×64）。足もとは y＋18。構えのときはうでを上げ、ふだんは葉がゆれる
      Render.rect(x - 22, y + 13, 44, 7, "rgba(0,0,0,0.35)");
      var tf = e.state === "windup" ? "windup" : Math.sin(glow * 2) > 0 ? "sway" : "stand";
      Monsters.drawBoss(ctx, e, x, y + 18, tf);
      if (e.sweep > 0) {
        ctx.strokeStyle = "rgba(160,112,58,0.8)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, d.reach + e.r - 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.state === "windup") Render.text("！", x, y - 50, { size: 11, align: "center", bold: true, color: "#ffd24a" });
      if (e.state === "pollen" || e.pollenFx > 0) {
        ctx.fillStyle = "rgba(180,140,240," + (e.state === "pollen" ? 0.15 : 0.3) + ")";
        ctx.beginPath(); ctx.arc(x, y, d.pollenRadius, 0, Math.PI * 2); ctx.fill();
      }
    }
    var marks = Object.keys(e.status).filter(function (k) { return k !== "break"; });
    if (marks.length) Render.text(marks.map(function (k) { return GameData.STATUS[k].name; }).join(" "), x, y + 16, { size: 7, align: "center", color: GameData.STATUS[marks[0]].color });
  }

  return { hazards: function () { return hazards; }, clear: clear, isBoss: isBoss, update: update, updateHazards: updateHazards, drawHazards: drawHazards, draw: draw, interrupt: interrupt, bossDown: bossDown };
})();
