// ボスの動き（段階4-3）：大オオカミ（7階）と大木の魔物（14階）。数字は data.js の ENEMIES、たたき台は docs/draft.md 2。
// ふつうの攻撃は「当たる前提」。かわすことを求めるのは、とても大きなダメージの大技だけで、地面で予告する（大突進0.9秒・根の大波1.2秒。2026-10-18）。
//   大オオカミ：大突進（赤い線で0.9秒予告）／大木の魔物：根の大波（地面が光って1.2秒予告。HP が半分になると増える）
//   大ガマ（瘴気の森5階）：沼にもぐる → 予告の輪（1.4秒。出る0.9秒前に輪がとまって赤くなる）のところから飛び出す／毒の雨（小さな輪0.9秒）
//   沼の魔女（瘴気の森10階）：瘴気の柱（紫の輪1.2秒）。大技はどちらも予告の輪の中にいなければ当たらない
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Bosses = (function () {
  var hazards = []; // 地面の予告と大技：{ kind: "line"|"rect", ..., t, warn, from }
  var dust = [];    // 大突進のあとの土けむり：{ x, y, t, max, s }

  function clear() { hazards.length = 0; dust.length = 0; }
  function isBoss(e) { return !!(e && e.def && e.def.boss); }

  // ボスが出たときの準備
  function setup(e) {
    var d = e.def;
    e.ai = { charge: d.chargeEvery ? 4 : 0, howl: d.howlEvery ? 8 : 0, roots: d.rootEvery ? 5 : 0, pollen: d.pollenEvery ? 9 : 0,
             dive: d.diveEvery ? 5 : 0, rain: d.rainEvery ? 8 : 0, pillar: d.pillarEvery ? 6 : 0, blink: d.blinkEvery ? 4 : 0, summon: d.summonEvery ? 10 : 0, hop: 0.6 };
  }

  // 眠り・しびれで大技が止まったとき
  function interrupt(e) {
    if (e.state === "warn" || e.state === "charge" || e.state === "howl" || e.state === "pollen" || e.state === "seed" ||
        e.state === "rain" || e.state === "cast" || e.state === "dive") { e.state = "recover"; e.t = 0.4; }
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
    ["charge", "howl", "roots", "pollen", "dive", "rain", "pillar", "blink", "summon", "hop"].forEach(function (k) { e.ai[k] = Math.max(0, e.ai[k] - dt); });
    if (d.kind === "wolf_boss") wolf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "frog_boss") frogBoss(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "witch_boss") witch(e, dt, room, p, hurt, api, ux, uy, gap, dist);
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

  // ---------- 大ガマ（瘴気の森5階。2026-10-21） ----------
  // はねて近づき、舌でたたく。沼にもぐる → プレイヤーの足もとに予告の輪 → そこから飛び出す（大技）。
  // 毒の雨：まわりに小さな輪がいくつも出て、毒のしずくが落ちる。HP が半分になると、1回だけ毒ガエルを2ひき呼ぶ
  function frogBoss(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    if (e.state === "windup") {   // 舌でたたく
      e.face = { x: ux, y: uy };
      e.t -= dt;
      if (e.t <= 0) { e.tongue = 0.25; if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8); e.state = "recover"; e.t = 0.4; e.cd = d.cooldown; }
      return;
    }
    if (e.state === "hop") {
      e.t -= dt;
      if (!e.status.para) room.move(e, e.hopDir.x * d.hopSpeed * dt, e.hopDir.y * d.hopSpeed * dt);
      if (e.t <= 0) { e.state = "chase"; e.ai.hop = d.hopEvery; }
      return;
    }
    if (e.state === "dive") {   // しゃがんで、沼にもぐる
      e.t -= dt;
      if (e.t <= 0) {
        e.untouchable = true; e.state = "under"; e.diveFrom = { x: e.x, y: e.y };
        e.mark = { kind: "circle", look: "dive", from: e, x: p.x, y: p.y, r: d.diveRadius, t: 0, warn: d.diveWarn, erupt: 0.45, hit: false,
                   opts: { mult: d.diveMult, big: true }, follow: true };
        hazards.push(e.mark);
      }
      return;
    }
    if (e.state === "under") {   // 沼の中：予告の輪は、出る diveLock 秒前までプレイヤーについていく。とまったら輪が赤くこくなる（にげる合図）
      var m = e.mark;
      if (m.follow && m.warn - m.t > e.def.diveLock && !p.down) { m.x += (p.x - m.x) * Math.min(1, dt * 6); m.y += (p.y - m.y) * Math.min(1, dt * 6); }
      if (m.t >= m.warn) {
        e.x = m.x; e.y = m.y; room.keepInside(e);
        // 壁や木にかかるときは、近くのあいている場所に出る（めりこんで動けなくならないように）
        if (room.hitsWall(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2)) {
          var ok = false;
          for (var rad = 8; rad <= 96 && !ok; rad += 8) for (var an = 0; an < 16 && !ok; an++) {
            var tx = m.x + Math.cos(an / 16 * Math.PI * 2) * rad, ty = m.y + Math.sin(an / 16 * Math.PI * 2) * rad;
            if (!room.hitsWall(tx - e.r, ty - e.r, e.r * 2, e.r * 2)) { e.x = tx; e.y = ty; ok = true; }
          }
          if (!ok) { e.x = e.diveFrom.x; e.y = e.diveFrom.y; }
        }
        e.untouchable = false; e.state = "recover"; e.t = 0.8; e.splash = 0.5;
        e.ai.dive = half ? d.diveEveryHalf : d.diveEvery;
      }
      return;
    }
    if (e.state === "rain") {   // ほおをふくらませて、毒の雨
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? 8 : 5;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 24 + Math.random() * 70;
          hazards.push({ kind: "circle", look: "drop", from: e, x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, r: d.rainRadius, t: 0, warn: d.rainWarn + i * 0.08, erupt: 0.35, hit: false,
                         opts: { mult: d.rainMult, status: { type: "poison", chance: 0.8, dur: 8 } } });
        }
        e.state = "recover"; e.t = 0.5; e.ai.rain = d.rainEvery;
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.called) {   // HP が半分：毒ガエルを2ひき呼ぶ（1回だけ）
      e.called = true;
      for (var k = 0; k < 2; k++) { var ang = Math.random() * Math.PI * 2; var f = api.spawn("frog", e.x + Math.cos(ang) * 30, e.y + Math.sin(ang) * 30, 19); f.summoned = true; }
      Battle.pop(e.x, e.y - 40, "仲間を呼んだ！", "#ffd24a", 9);
      e.state = "recover"; e.t = 0.6;
      return;
    }
    if (e.ai.dive <= 0) { e.state = "dive"; e.t = 0.5; Battle.pop(e.x, e.y - 40, "沼にもぐった！", "#ef5b5b", 9); return; }
    if (e.ai.rain <= 0) { e.state = "rain"; e.t = 0.6; Battle.pop(e.x, e.y - 40, "毒の雨！", "#b46ad8", 9); return; }
    if (gap <= d.reach && e.cd <= 0) { e.state = "windup"; e.t = d.windup; e.aim = { x: ux, y: uy }; return; }
    if (gap > d.reach - 4 && e.ai.hop <= 0) { e.state = "hop"; e.t = d.hopTime; e.hopDir = { x: ux, y: uy }; }
  }

  // ---------- 沼の魔女（瘴気の森10階・主。2026-10-21） ----------
  // 離れたところに浮かび、闇の玉を3つ撃つ（魔法）。近づかれると消えて、はなれた場所に現れる。
  // 瘴気の柱（大技）：プレイヤーのまわりに紫の輪 → 柱が立つ（魔法の大ダメージ、毒になることがある）。瘴気の霊を呼ぶ
  function witch(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.face = { x: ux, y: uy };
    if (e.state === "cast") {   // 闇の玉（3つ）
      e.t -= dt;
      if (e.t <= 0) {
        var ang = Math.atan2(uy, ux);
        for (var k = -1; k <= 1; k++) api.addArrow(e, ang + k * 0.3, d.orbSpeed, { orb: true, magic: true, mult: 0.9 });
        e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldown * 0.75 : d.cooldown;
      }
      return;
    }
    if (e.state === "vanish") {   // 消える → べつの場所に現れる
      e.t -= dt;
      if (e.t <= 0) {
        var best = null, bd = -1;
        for (var tr = 0; tr < 24; tr++) {
          var x = 30 + Math.random() * (room.pxW - 60), y = 30 + Math.random() * (room.pxH - 60);
          if (room.hitsWall(x - e.r, y - e.r, e.r * 2, e.r * 2)) continue;
          var dd = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
          if (dd > 110 * 110 && dd < 200 * 200) { best = { x: x, y: y }; break; }
          if (dd > bd) { bd = dd; best = { x: x, y: y }; }
        }
        if (best) { e.x = best.x; e.y = best.y; }
        e.state = "appear"; e.t = 0.4;
      }
      return;
    }
    if (e.state === "appear") { e.t -= dt; if (e.t <= 0) { e.untouchable = false; e.state = "recover"; e.t = 0.3; } return; }
    if (e.state === "pillar") {   // 杖を上げて、瘴気の柱
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? 5 : 3;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 40 + Math.random() * 50;
          hazards.push({ kind: "circle", look: "pillar", from: e, x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, r: d.pillarRadius, t: 0, warn: d.pillarWarn, erupt: 0.5, hit: false,
                         opts: { magic: true, mult: d.pillarMult, big: true, status: { type: "poison", chance: 0.5, dur: 8 } } });
        }
        e.state = "recover"; e.t = 0.6; e.ai.pillar = half ? d.pillarEveryHalf : d.pillarEvery;
      }
      return;
    }
    if (e.state === "summon") {
      e.t -= dt;
      if (e.t <= 0) {
        for (var s = 0; s < 2; s++) { var sa = Math.random() * Math.PI * 2; var w = api.spawn("wisp", e.x + Math.cos(sa) * 28, e.y + Math.sin(sa) * 28, 22); w.summoned = true; }
        e.state = "recover"; e.t = 0.5; e.ai.summon = d.summonEvery;
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    if (gap < 40 && e.ai.blink <= 0) {   // 近づかれたら、消える
      e.state = "vanish"; e.t = 0.4; e.untouchable = true; e.ai.blink = half ? 4 : 6;
      Battle.pop(e.x, e.y - 40, "消えた！", "#b48cff", 8);
      return;
    }
    if (e.ai.pillar <= 0) { e.state = "pillar"; e.t = 0.7; Battle.pop(e.x, e.y - 44, "瘴気の柱！", "#ef5b5b", 9); return; }
    var wisps = api.alive().filter(function (o) { return o.type === "wisp" && o.summoned; }).length;
    if (e.ai.summon <= 0 && wisps < 2) { e.state = "summon"; e.t = 0.7; Battle.pop(e.x, e.y - 44, "瘴気の霊を呼んだ！", "#b48cff", 8); return; }
    if (e.cd <= 0 && gap <= d.keepMax + 40) { e.state = "cast"; e.t = d.windup; return; }
    // ふだんは、はなれたところへゆっくり動く
    var mx = 0, my = 0;
    if (gap < d.keepMin) { mx = -ux; my = -uy; } else if (gap > d.keepMax) { mx = ux; my = uy; } else { mx = -uy * 0.4; my = ux * 0.4; }
    if (!e.status.para) room.move(e, mx * d.speed * dt, my * d.speed * dt);
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
        var inside = h.kind === "circle"
          ? (p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y) < (h.r + p.r) * (h.r + p.r)
          : p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h;
        if (!p.down && inside && !h.from.dead) hurt(h.from, p.x, p.y - 8, h.opts || { mult: h.from.def.rootMult, big: true });
      }
      if (h.t >= h.warn + h.erupt) hazards.splice(i, 1);
    }
  }

  // ボスが倒れたら、地面の予告も消す
  function bossDown() { hazards.length = 0; dust.length = 0; }

  // ---------- 描画 ----------
  // 大技の絵（2026-10-18 に仮の絵から差しかえ）：予告は半とうめいの光。本番は、根の大波が太いつる、大突進のあとは土けむり（ドット）
  function rnd(n) { var v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }

  function drawHazards(cam, glow) {
    var ctx = Render.ctx;
    hazards.forEach(function (h) {
      if (h.kind === "line") { drawChargeLine(ctx, h, cam, glow); return; }
      if (h.kind === "circle") { drawCircle(ctx, h, cam, glow); return; }
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

  // 輪の大技（2026-10-21）：look＝dive（大ガマが飛び出す）・drop（毒の雨）・pillar（瘴気の柱）
  // 予告：地面の輪がだんだん濃くなり、まんなかへちぢむ光の輪。本番：それぞれの絵
  function drawCircle(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y, k = Math.min(1, h.t / h.warn);
    var locked = h.look === "dive" && h.from && h.from.def.diveLock !== undefined && h.warn - h.t <= h.from.def.diveLock;
    var col = h.look === "pillar" ? [180, 90, 230] : h.look === "drop" ? [150, 200, 90] : locked ? [255, 60, 50] : [240, 150, 90];
    function c(a) { return "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + a.toFixed(2) + ")"; }
    if (h.t < h.warn) {
      ctx.fillStyle = c(0.10 + 0.25 * k + 0.05 * Math.sin(glow * 16));
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r, h.r * 0.7, 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c(0.5 + 0.4 * k); ctx.lineWidth = 2;
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r, h.r * 0.7, 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r, 0, Math.PI * 2); ctx.stroke();
      var rr = h.r * (1 - k) + 2;   // ちぢむ輪：0になったときに大技が来る
      ctx.strokeStyle = c(0.8); ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, rr, rr * 0.7, 0, 0, Math.PI * 2); else ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      if (h.look === "drop") {   // 毒のしずくが、上から落ちてくる
        var hy = (1 - k) * 90;
        ctx.fillStyle = "#9a5ad0"; ctx.fillRect(Math.round(x) - 2, Math.round(y - hy) - 4, 4, 5);
        ctx.fillStyle = "#b8e870"; ctx.fillRect(Math.round(x) - 1, Math.round(y - hy) - 3, 2, 2);
      }
      if (locked) Render.text("！", x, y - h.r * 0.7 - 12, { size: 11, align: "center", bold: true, color: "#ff5040" });
      if (h.look === "dive") {   // 沼の中を進んでくる泡
        for (var b = 0; b < 4; b++) { var ph = (glow * 2 + b / 4) % 1; ctx.fillStyle = "rgba(200,220,150," + (1 - ph).toFixed(2) + ")"; ctx.fillRect(Math.round(x + Math.sin(b * 2.1) * h.r * 0.5), Math.round(y - ph * 8), 2, 2); }
      }
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q;
    if (h.look === "pillar") {   // 紫の柱が立つ
      var hh = 70 * Math.min(1, q * 4);
      var g = ctx.createLinearGradient(0, y - hh, 0, y);
      g.addColorStop(0, "rgba(180,90,230,0)"); g.addColorStop(0.4, "rgba(180,110,240," + (0.55 * fade).toFixed(2) + ")"); g.addColorStop(1, "rgba(240,210,255," + (0.85 * fade).toFixed(2) + ")");
      ctx.fillStyle = g; ctx.fillRect(x - h.r * 0.8, y - hh, h.r * 1.6, hh);
      ctx.fillStyle = "rgba(60,20,90," + (0.4 * fade).toFixed(2) + ")";
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r, h.r * 0.7, 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r, 0, Math.PI * 2); ctx.fill();
    } else {   // しぶき（毒のしずく・大ガマが飛び出したところ）
      var n = h.look === "dive" ? 14 : 8, R = h.r * (0.6 + q * 0.9);
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        ctx.fillStyle = h.look === "dive" ? "rgba(170,210,130," + fade.toFixed(2) + ")" : "rgba(170,110,220," + fade.toFixed(2) + ")";
        ctx.fillRect(Math.round(x + Math.cos(a) * R) - 1, Math.round(y + Math.sin(a) * R * 0.7 - Math.sin(q * Math.PI) * 6) - 1, 3, 3);
      }
    }
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

  // 根の大波の本番：予告のひび割れと同じギザギザの形で、太いつる（緑）がのびて、すぐ引っこむ（2026-10-18 保護者の案）
  function drawRootErupt(ctx, h, x, y) {
    var q = (h.t - h.warn) / h.erupt;
    var rise = q < 0.3 ? q / 0.3 : q > 0.7 ? Math.max(0, (1 - q) / 0.3) : 1;
    var along = h.w > h.h, len = along ? h.w : h.h, thick = along ? h.h : h.w;
    ctx.fillStyle = "rgba(40,28,14," + (0.3 * rise).toFixed(2) + ")"; ctx.fillRect(x, y, h.w, h.h);   // 土がわれたところ
    function path(seed, sway) {
      ctx.beginPath();
      for (var s = 0; s <= len; s += 6) {
        var j = (rnd(seed + Math.floor(s / 6)) - 0.5) * thick * sway;
        var px = along ? x + s : x + thick / 2 + j, py = along ? y + thick / 2 + j : y + s;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // 2本のつるがからみ合う。ふち（暗い緑）→ 本体（緑）→ 光（明るい緑）の順に重ねる
    [[h.seed, 0.35], [h.seed + 50, 0.5]].forEach(function (v, i) {
      var w = (i === 0 ? 7 : 5) * rise;
      if (w < 0.5) return;
      path(v[0], v[1]);
      ctx.strokeStyle = "#0e1e10"; ctx.lineWidth = w + 2; ctx.stroke();
      ctx.strokeStyle = i === 0 ? "#2f6a2a" : "#3a7a30"; ctx.lineWidth = w; ctx.stroke();
      ctx.strokeStyle = "rgba(122,170,74,0.9)"; ctx.lineWidth = Math.max(1, w * 0.3); ctx.stroke();
    });
    // とげ（短い線）をところどころに
    ctx.strokeStyle = "#1f3a1c"; ctx.lineWidth = 2;
    for (var s2 = 9; s2 < len; s2 += 18) {
      var j2 = (rnd(h.seed + Math.floor(s2 / 6)) - 0.5) * thick * 0.35, side = rnd(h.seed + s2) > 0.5 ? 1 : -1, tl = 5 * rise;
      var bx = along ? x + s2 : x + thick / 2 + j2, by = along ? y + thick / 2 + j2 : y + s2;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(along ? bx + 2 : bx + side * tl, along ? by + side * tl : by + 2); ctx.stroke();
    }
    ctx.lineCap = "butt"; ctx.lineJoin = "miter";
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
    } else if (d.kind === "frog_boss") {
      // 大ガマ（56×40）：沼にもぐっているあいだは、泡だけ
      if (e.state === "under") {
        for (var bb = 0; bb < 5; bb++) { var ph2 = (glow * 1.5 + bb / 5) % 1; Render.rect(x - 14 + bb * 7, y + 6 - Math.round(ph2 * 6), 2, 2, "rgba(200,220,150," + (1 - ph2).toFixed(2) + ")"); }
      } else {
        var hopY = e.state === "hop" ? Math.round(Math.sin((1 - e.t / d.hopTime) * Math.PI) * 10) : 0;
        var sink = e.state === "dive" ? Math.round((1 - e.t / 0.5) * 18) : 0;
        Render.rect(x - 22, y + 10, 44, 6, "rgba(0,0,0,0.35)");
        if (sink > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - 40, y - 60, 80, 74); ctx.clip(); }
        Monsters.drawBoss(ctx, e, x, y + 14 - hopY + sink, e.state === "windup" || e.state === "dive" || e.state === "rain" ? "crouch" : "stand");
        if (sink > 0) ctx.restore();
        if (e.tongue > 0) {   // 舌：ピンクの線がのびて、もどる
          var tk = Math.sin((1 - e.tongue / 0.25) * Math.PI), tl2 = (d.reach + e.r) * tk;
          ctx.strokeStyle = "#d86a8a"; ctx.lineWidth = 3; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + e.face.x * tl2, y - 6 + e.face.y * tl2); ctx.stroke(); ctx.lineCap = "butt";
        }
        if (e.state === "rain") Render.text("ゲコッ！", x, y - 34, { size: 8, align: "center", bold: true, color: "#b46ad8" });
        if (e.state === "windup") Render.text("！", x, y - 34, { size: 11, align: "center", bold: true, color: "#ffd24a" });
      }
      e.tongue = Math.max(0, (e.tongue || 0) - 1 / 60);
      if (e.splash > 0) {   // 飛び出したときのしぶき
        e.splash -= 1 / 60;
        ctx.strokeStyle = "rgba(170,210,130," + Math.max(0, e.splash * 2).toFixed(2) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y + 6, 40 * (1 - e.splash), 0, Math.PI * 2); ctx.stroke();
      }
    } else if (d.kind === "witch_boss") {
      // 沼の魔女（34×46）：ふわふわ浮いている。消えるときと現れるときは、すける
      var bob = Math.round(Math.sin(glow * 2.5) * 2), al = 1;
      if (e.state === "vanish") al = Math.max(0, e.t / 0.4);
      if (e.state === "appear") al = 1 - Math.max(0, e.t / 0.4);
      Render.rect(x - 12, y + 10, 24, 4, "rgba(0,0,0," + (0.3 * al).toFixed(2) + ")");
      ctx.save(); ctx.globalAlpha = ctx.globalAlpha * al;
      var cast = e.state === "cast" || e.state === "pillar" || e.state === "summon";
      Monsters.drawBoss(ctx, e, x, y + 14 - 4 + bob, cast ? "cast" : "stand");
      ctx.restore();
      if (cast) {   // 杖の先（頭がい骨）の紫の光
        var sx = x - 11, sy = y + 14 - 4 + bob - 46 + 3;   // 杖の先の頭がい骨
        Combat.glowDot(ctx, sx, sy, 9 + Math.sin(glow * 10) * 2, "#ffe0ff", e.state === "pillar" ? "#e070ff" : "#9a5ad0", 0.85);
      }
      if (e.state === "vanish" || e.state === "appear") {   // 紫のけむり
        for (var sm = 0; sm < 8; sm++) { var sa = sm * 0.785 + glow; Render.rect(Math.round(x + Math.cos(sa) * 14), Math.round(y - 10 + Math.sin(sa) * 10), 3, 3, "rgba(150,90,200,0.6)"); }
      }
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
