// ボスの動き（段階4-3）：大オオカミ（7階）と大木の魔物（14階）。数字は data.js の ENEMIES、たたき台は docs/draft.md 2。
// ふつうの攻撃は「当たる前提」。かわすことを求めるのは、とても大きなダメージの大技だけで、地面で予告する（大突進0.9秒・根の大波1.2秒。2026-10-18）。
//   大オオカミ：大突進（赤い線で0.9秒予告）／大木の魔物：根の大波（地面が光って1.2秒予告。HP が半分になると増える）
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Bosses = (function () {
  var hazards = []; // 地面の予告と大技：{ kind: "line"|"rect", ..., t, warn, from }
  var dust = [];    // 大突進のあとの土けむり：{ x, y, t, max, s }

  function clear() { hazards.length = 0; dust.length = 0; }
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
      // 走り出す 0.3 秒前までは、プレイヤーのほうへ向きを合わせ直す（早めに動いてもよけきれないように。2026-10-18）
      if (e.t > 0.3 && !p.down && e.chargeLine) {
        var ax = p.x - e.x, ay = p.y - e.y, al = Math.sqrt(ax * ax + ay * ay) || 1;
        ax /= al; ay /= al;
        e.aim = { x: ax, y: ay }; e.face = { x: ax, y: ay };
        e.chargeLen = Math.min(260, rayLength(room, e.x, e.y, ax, ay, e.r));
        e.chargeLine.x2 = e.x + ax * e.chargeLen; e.chargeLine.y2 = e.y + ay * e.chargeLen;
      }
      if (e.t <= 0) { e.state = "charge"; e.travel = 0; e.hitDone = false; }
      return;
    }
    if (e.state === "charge") {
      var step = d.chargeSpeed * dt, bx = e.x, by = e.y;
      room.move(e, e.aim.x * step, e.aim.y * step);
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step;
      e.walk += dt * 20;
      // 走ったあとに土けむりを残す（12ドットごと）
      e.dustAt = (e.dustAt || 0) + moved;
      if (e.dustAt >= 12) { e.dustAt = 0; dust.push({ x: e.x - e.aim.x * 8 + (Math.random() - 0.5) * 8, y: e.y + 8 + (Math.random() - 0.5) * 4, t: 0, max: 0.7, s: Math.random() }); }
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
      e.chargeLine = { kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ux * e.chargeLen, y2: e.y + uy * e.chargeLen, w: e.r * 2 + 4, t: 0, warn: d.chargeWarn };
      hazards.push(e.chargeLine);
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
          ? { kind: "rect", from: e, x: cx - W / 2, y: 0, w: W, h: room.pxH, t: 0, warn: d.rootWarn, erupt: 0.4, hit: false, seed: Math.random() * 100 }
          : { kind: "rect", from: e, x: 0, y: cy - W / 2, w: room.pxW, h: W, t: 0, warn: d.rootWarn, erupt: 0.4, hit: false, seed: Math.random() * 100 });
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
    for (var di = dust.length - 1; di >= 0; di--) { dust[di].t += dt; if (dust[di].t >= dust[di].max) dust.splice(di, 1); }
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
  function bossDown() { hazards.length = 0; dust.length = 0; }

  // ---------- 描画 ----------
  // 大技の絵（2026-10-18 に仮の絵から差しかえ）：予告は半とうめいの光、本番（つき出る根・土けむり）はドット絵
  // 地面からつき出る根（9×12。光は左上から。大木の魔物と同じ色）
  var ROOT = [
    "....A....",
    "...AtA...",
    "...AtuA..",
    "..AttuA..",
    "..AtuvA..",
    "..AtuvA..",
    ".AttuvvA.",
    ".AtuuvvA.",
    ".AtuvvwA.",
    "AttuvvwwA",
    "AtuuvvwwA",
    "AtuvvwwwA"
  ];
  var ROOT_PAL = { A: "#140c1c", t: "#a87a4a", u: "#7a5230", v: "#4a3020", w: "#2a1a12" };
  var rootImg = null;
  function rootSprite() {
    if (rootImg) return rootImg;
    var cv = document.createElement("canvas"); cv.width = 9; cv.height = ROOT.length;
    var c = cv.getContext("2d");
    for (var y = 0; y < ROOT.length; y++) for (var x = 0; x < 9; x++) {
      var ch = ROOT[y].charAt(x); if (ch === ".") continue;
      c.fillStyle = ROOT_PAL[ch]; c.fillRect(x, y, 1, 1);
    }
    rootImg = cv; return cv;
  }
  function rnd(n) { var v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }

  function drawHazards(cam, glow) {
    var ctx = Render.ctx;
    hazards.forEach(function (h) {
      if (h.kind === "line") { drawChargeLine(ctx, h, cam, glow); return; }
      var x = h.x - cam.x, y = h.y - cam.y;
      if (h.t < h.warn) drawRootWarn(ctx, h, x, y, glow);
      else drawRootErupt(ctx, h, x, y);
    });
    // 土けむり（ドット）：ふわっと広がって、うすくなる
    dust.forEach(function (d) {
      var k = d.t / d.max, a = (1 - k) * 0.8, r = 2 + Math.round(k * 3);
      var x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y - k * 4);
      ctx.fillStyle = "rgba(168,152,120," + a.toFixed(2) + ")";
      ctx.fillRect(x - r, y - 1, r * 2, 3); ctx.fillRect(x - r + 1, y - 2, r * 2 - 2, 5);
      ctx.fillStyle = "rgba(220,206,170," + (a * 0.9).toFixed(2) + ")";
      ctx.fillRect(x - r + 1, y - 2, 2, 2);
      if (d.s > 0.5) { ctx.fillStyle = "rgba(140,124,96," + a.toFixed(2) + ")"; ctx.fillRect(x + r, y - 3 - Math.round(k * 2), 2, 2); }
    });
  }

  // 大突進の予告：走る方向へ、赤い矢じるしの光が流れる。時間がたつほど強くなる
  function drawChargeLine(ctx, h, cam, glow) {
    var e = h.from, k = e.state === "warn" ? Math.min(1, h.t / h.warn) : 1;
    var x1 = h.x1 - cam.x, y1 = h.y1 - cam.y, dx = h.x2 - h.x1, dy = h.y2 - h.y1;
    var L = Math.sqrt(dx * dx + dy * dy); if (L < 1) return;
    var w = h.w;
    ctx.save();
    ctx.translate(x1, y1); ctx.rotate(Math.atan2(dy, dx));
    var fade = e.state === "charge" ? 0.5 : 1;
    // 帯：まんなかが明るく、ふちがとうめい
    var g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    g.addColorStop(0, "rgba(239,70,60,0)");
    g.addColorStop(0.5, "rgba(239,70,60," + ((0.12 + 0.22 * k) * fade).toFixed(2) + ")");
    g.addColorStop(1, "rgba(239,70,60,0)");
    ctx.fillStyle = g; ctx.fillRect(0, -w / 2, L, w);
    // 矢じるし：ボスから先へ流れる
    var gap = 16, off = (glow * 70) % gap;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var s = off; s < L - 4; s += gap) {
      var edge = Math.min(1, s / 20, (L - s) / 30);
      var a = (0.25 + 0.6 * k) * edge * fade;
      ctx.strokeStyle = "rgba(255,120,95," + a.toFixed(2) + ")";
      ctx.beginPath(); ctx.moveTo(s - 6, -w * 0.32); ctx.lineTo(s, 0); ctx.lineTo(s - 6, w * 0.32); ctx.stroke();
    }
    ctx.restore();
  }

  // 根の大波の予告：帯がだんだん明るくなり、まんなかのひび割れが両はしへのびていく
  function drawRootWarn(ctx, h, x, y, glow) {
    var k = h.t / h.warn, along = h.w > h.h, len = along ? h.w : h.h, thick = along ? h.h : h.w;
    var g = along ? ctx.createLinearGradient(0, y, 0, y + h.h) : ctx.createLinearGradient(x, 0, x + h.w, 0);
    var a = 0.10 + 0.32 * k + 0.06 * Math.sin(glow * 16);
    g.addColorStop(0, "rgba(255,200,90,0)");
    g.addColorStop(0.5, "rgba(255,206,100," + a.toFixed(2) + ")");
    g.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = g; ctx.fillRect(x, y, h.w, h.h);
    // ひび割れ：プレイヤーに近いまんなかから、両はしへ
    var mid = len / 2, reach = len * Math.min(1, k * 1.3) / 2;
    ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(60,34,14," + (0.45 + 0.4 * k).toFixed(2) + ")";
    ctx.beginPath();
    var first = true;
    for (var s = mid - reach; s <= mid + reach; s += 6) {
      var j = (rnd(h.seed + Math.floor(s / 6)) - 0.5) * thick * 0.35;
      var px = along ? x + s : x + thick / 2 + j, py = along ? y + thick / 2 + j : y + s;
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // ひびのふちが光る
    ctx.strokeStyle = "rgba(255,236,170," + (0.2 + 0.4 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 根の大波の本番：地面から根（ドット絵）が何本もつき出て、引っこむ
  function drawRootErupt(ctx, h, x, y) {
    var q = (h.t - h.warn) / h.erupt;
    var rise = q < 0.35 ? q / 0.35 : q > 0.75 ? Math.max(0, (1 - q) / 0.25) : 1;
    var along = h.w > h.h, len = along ? h.w : h.h, thick = along ? h.h : h.w;
    var img = rootSprite(), H = img.height, show = Math.max(1, Math.round(H * rise));
    ctx.fillStyle = "rgba(60,40,20,0.35)"; ctx.fillRect(x, y, h.w, h.h);   // 土がもり上がったところ
    for (var s = 6; s < len - 4; s += 12) {
      var i = Math.floor(s / 12), j = (rnd(h.seed + i * 7) - 0.5) * thick * 0.5;
      var bx = Math.round(along ? x + s : x + thick / 2 + j), by = Math.round(along ? y + thick / 2 + j + 4 : y + s + 4);
      // 根もとの土
      ctx.fillStyle = "rgba(42,26,18,0.85)"; ctx.fillRect(bx - 6, by - 1, 12, 3);
      ctx.fillStyle = "rgba(110,74,44,0.9)"; ctx.fillRect(bx - 5, by - 2, 3, 1); ctx.fillRect(bx + 2, by - 2, 3, 1);
      // 根：下から見えている分だけ描く（地面から出てくるように）
      var sc = 1 + (rnd(h.seed + i * 3) > 0.5 ? 0.3 : 0);
      ctx.drawImage(img, 0, 0, 9, show, Math.round(bx - 4.5 * sc), Math.round(by - show * sc), Math.round(9 * sc), Math.round(show * sc));
    }
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
