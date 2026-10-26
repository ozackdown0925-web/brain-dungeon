// ボスの動き（段階4-3）：大オオカミ（7階）と大木の魔物（14階）。数字は data.js の ENEMIES、たたき台は docs/draft.md 2。
// ふつうの攻撃は「当たる前提」。かわすことを求めるのは、とても大きなダメージの大技だけで、地面で予告する（大突進0.9秒・根の大波1.2秒。2026-10-18）。
//   大オオカミ：大突進（赤い線で0.9秒予告）／大木の魔物：根の大波（地面が光って1.2秒予告。HP が半分になると増える）
//   大ガマ（瘴気の森5階）：沼にもぐる → 予告の輪（1.4秒。出る0.9秒前に輪がとまって赤くなる）のところから飛び出す／毒の雨（小さな輪0.9秒）
//   沼の魔女（瘴気の森10階）：瘴気の柱（紫の輪1.2秒）。大技はどちらも予告の輪の中にいなければ当たらない
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Bosses = (function () {
  var hazards = []; // 地面の予告と大技：{ kind: "line"|"rect", ..., t, warn, from }
  var dust = [];    // 大突進のあとの土けむり：{ x, y, t, max, s }
  var chips = [];   // 岩のかけら（見た目だけ。はねて落ちる）：{ x, y, z, vx, vy, vz, t, max, c }
  var waves = [];   // 地面を走る衝撃の輪とひび（ゴーレム）：{ x, y, t, max, r0, r1, cracks }
  var quake = { t: 0, amp: 0 };   // 画面のゆれ（ゴーレムの大きな攻撃）

  function clear() { hazards.length = 0; dust.length = 0; chips.length = 0; waves.length = 0; quake.t = 0; }
  // 画面をゆらす。amp はゆれのはば（ドット）、t は長さ（秒）
  function shake(amp, t) { if (amp >= quake.amp || quake.t <= 0) { quake.amp = amp; quake.t = t; } }
  function shakeOffset() {
    if (quake.t <= 0) return { x: 0, y: 0 };
    var a = Math.max(1, Math.round(quake.amp * Math.min(1, quake.t * 6)));
    return { x: Math.round((Math.random() * 2 - 1) * a), y: Math.round((Math.random() * 2 - 1) * a) };
  }
  function isBoss(e) { return !!(e && e.def && e.def.boss); }

  // ボスが出たときの準備
  function setup(e) {
    var d = e.def;
    e.ai = { charge: d.chargeEvery ? 4 : 0, howl: d.howlEvery ? 8 : 0, roots: d.rootEvery ? 5 : 0, pollen: d.pollenEvery ? 9 : 0,
             dive: d.diveEvery ? 5 : 0, rain: d.rainEvery ? 8 : 0, pillar: d.pillarEvery ? 6 : 0, blink: d.blinkEvery ? 4 : 0, summon: d.summonEvery ? 10 : 0, hop: 0.6,
             rock: d.rockEvery ? 6 : 0, combo: d.comboEvery ? 3 : 0, orb: d.orbEvery ? 4 : 0, spin: 0, da: d.daEvery ? 8 : 0 };
  }

  // 眠り・しびれで大技が止まったとき
  function interrupt(e) {
    if (e.state === "warn" || e.state === "charge" || e.state === "howl" || e.state === "pollen" || e.state === "seed" ||
        e.state === "rain" || e.state === "cast" || e.state === "dive" || e.state === "spin" || e.state === "combo" || e.state === "lift" || e.state === "back" || e.state === "aim" || e.state === "dark") { e.state = "recover"; e.t = 0.4; }
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
    ["charge", "howl", "roots", "pollen", "dive", "rain", "pillar", "blink", "summon", "hop", "rock", "combo", "orb", "spin", "da"].forEach(function (k) { e.ai[k] = Math.max(0, e.ai[k] - dt); });
    if (d.kind === "wolf_boss") wolf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "frog_boss") frogBoss(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "witch_boss") witch(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "golem_boss") golem(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "elf_boss") elf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
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
  // 消えて現れたあとと、瘴気の柱のあと：少しのあいだ、ふらつく（すきあり）
  function tire(e) { e.state = "tired"; e.t = e.def.tired; Battle.pop(e.x, e.y - 44, "すきあり！", "#ffe066", 8); }
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
          if (dd > d.appearMin * d.appearMin && dd < d.appearMax * d.appearMax) { best = { x: x, y: y }; break; }
          if (dd > bd) { bd = dd; best = { x: x, y: y }; }
        }
        if (best) { e.x = best.x; e.y = best.y; }
        e.state = "appear"; e.t = 0.4;
      }
      return;
    }
    if (e.state === "appear") { e.t -= dt; if (e.t <= 0) { e.untouchable = false; tire(e); } return; }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }   // ふらついている（動かず、攻撃もしない）
    if (e.state === "pillar") {   // 杖を上げて、瘴気の柱
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? 5 : 3;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 40 + Math.random() * 50;
          hazards.push({ kind: "circle", look: "pillar", from: e, x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, r: d.pillarRadius, t: 0, warn: d.pillarWarn, erupt: 0.5, hit: false,
                         opts: { magic: true, mult: d.pillarMult, big: true, status: { type: "poison", chance: 0.5, dur: 8 } } });
        }
        tire(e); e.ai.pillar = half ? d.pillarEveryHalf : d.pillarEvery;
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
    // 近くに nearTime 秒いられたら、消える（すぐには消えないので、近くで攻撃するすきがある）
    if (gap < 40) e.ai.near = (e.ai.near || 0) + dt; else if (gap > 60) e.ai.near = 0;
    if (e.ai.near >= d.nearTime && e.ai.blink <= 0) {
      e.state = "vanish"; e.t = 0.4; e.untouchable = true; e.ai.blink = half ? d.blinkEveryHalf : d.blinkEvery; e.ai.near = 0;
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

  // ---------- ゴーレム（原生の秘境8階・中ボス。段階4、2026-10-25） ----------
  // ぶん回し（近く・まわりの広い範囲）、ふみこみながらの3回攻撃、大技の岩石投げ（飛んでくる岩。投げ終わるとふらつく）
  function golem(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    if (e.state === "spin") {   // うでを広げて構える → ぶん回し（まわりにとどけば当たる）
      e.t -= dt;
      if (e.t <= 0) {
        e.sweep = 0.35;
        if (!p.down && dist - p.r <= d.spinRadius) hurt(e, p.x, p.y - 8, { mult: d.spinMult });
        addWave(e.x, e.y + 8, 8, d.spinRadius + e.r * 0.3 + 8, 0.45, 7);   // 地面を走る衝撃の輪とひび
        for (var sd = 0; sd < 8; sd++) { var sa = sd * Math.PI / 4 + Math.random() * 0.4; addDust(e.x + Math.cos(sa) * 30, e.y + 8 + Math.sin(sa) * 18); }
        shake(3, 0.3);
        e.state = "recover"; e.t = 0.6; e.cd = d.cooldown;
      }
      return;
    }
    if (e.state === "combo") {   // こぶしを上げる → 前へふみこんでたたく（3回）。上げているあいだは向きを合わせ直す
      e.t -= dt;
      if (e.t > d.comboWindup * 0.35 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        if (!e.status.para) room.move(e, e.aim.x * d.comboStep, e.aim.y * d.comboStep);
        var px = p.x - e.x, py = p.y - e.y, pd = Math.sqrt(px * px + py * py) || 1;
        if (!p.down && pd - e.r - p.r <= d.comboReach && (px * e.aim.x + py * e.aim.y) / pd > 0.2) hurt(e, p.x, p.y - 8, { mult: d.comboMult });
        e.punch = 0.22; e.hits--;
        addWave(e.x + e.aim.x * (e.r + d.comboReach * 0.7), e.y + 6 + e.aim.y * (e.r + d.comboReach * 0.7), 3, 16, 0.3, 0);
        shake(1, 0.12);
        if (e.hits > 0) e.t = d.comboWindup;
        else { e.state = "recover"; e.t = 0.9; e.cd = d.cooldown; e.ai.combo = d.comboEvery; }
      }
      return;
    }
    if (e.state === "lift") {   // 岩を持ち上げる → まっすぐ投げる（何回か続けて）。投げ終わるとふらつく
      e.t -= dt;
      if (!p.down) e.face = { x: ux, y: uy };
      if (e.t <= 0) {
        var sy = e.y - 24, ang = Math.atan2(p.y - sy, p.x - e.x);   // 頭の上から投げる
        api.addArrow(e, ang, half ? d.rockSpeedHalf : d.rockSpeed, { rock: true, big: true, mult: d.rockMult, rad: d.rockR, dy: -24, life: 3, split: half ? d.chipMult : 0, spin: Math.random() < 0.5 ? 1 : -1 });
        e.thrown = 0.2; e.rocks--;
        if (e.rocks > 0) e.t = half ? d.rockWindupHalf : d.rockWindup;
        else tire(e);
      }
      return;
    }
    if (e.state === "back") {   // 岩を投げる前に、近すぎたら後ろへ下がる（土けむり）
      e.t -= dt;
      if (!e.status.para) {
        room.move(e, -e.aim.x * d.backSpeed * dt, -e.aim.y * d.backSpeed * dt);
        e.dustAt = (e.dustAt || 0) + dt; if (e.dustAt > 0.08) { e.dustAt = 0; addDust(e.x + (Math.random() - 0.5) * 20, e.y + 14); }
      }
      if (e.t <= 0) startLift(e, half);
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.angry) { e.angry = true; Battle.pop(e.x, e.y - 50, "目が赤く光った！", "#ef5b5b", 9); }
    if (e.ai.rock <= 0) {
      if (gap < d.backGap) { e.state = "back"; e.t = d.backTime; e.aim = { x: ux, y: uy }; return; }   // 近いときは、先に下がる
      startLift(e, half);
      return;
    }
    if (gap <= d.spinRange && e.cd <= 0) { e.state = "spin"; e.t = d.spinWarn; return; }
    if (e.ai.combo <= 0 && e.cd <= 0 && gap <= d.comboRange) { e.state = "combo"; e.hits = half ? d.comboHitsHalf : d.comboHits; e.t = d.comboWindup; e.aim = { x: ux, y: uy }; return; }
    if (gap > d.spinRange - 6 && !e.status.para) { room.move(e, ux * d.speed * dt, uy * d.speed * dt); e.walk = (e.walk || 0) + dt * 6; }
  }
  // ---------- ダークエルフ（原生の秘境15階・主。段階5、2026-10-26） ----------
  // 弓（半分で3本）、闇の玉を扇に3つ、回転斬り → 宙返り、大技のダークアロー（動きながら8方向の貫通する闇の矢）
  function elf(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    if (half && !e.angry) { e.angry = true; Battle.pop(e.x, e.y - 50, "本気になった！", "#ef5b5b", 9); }
    if (e.state === "aim") {   // 弓を引く。放つ少し前までは、ねらいを合わせ直す
      e.t -= dt;
      if (e.t > 0.12 && !p.down) e.aim = { x: ux, y: uy };
      e.face = e.aim;
      if (e.t <= 0) {
        var a0 = Math.atan2(e.aim.y, e.aim.x), n = half ? d.fanHalf : 1;
        for (var k = 0; k < n; k++) api.addArrow(e, a0 + (k - (n - 1) / 2) * 0.22, d.arrowSpeed, { mult: d.arrowMult, elfArrow: true });
        e.shot = 0.15; e.state = "recover"; e.t = 0.3; e.cd = d.cooldown;
      }
      return;
    }
    if (e.state === "cast") {   // 手を上げて、闇の玉を扇に3つ
      e.t -= dt;
      if (!p.down) e.face = { x: ux, y: uy };
      if (e.t <= 0) {
        var a1 = Math.atan2(uy, ux);
        var on = half ? d.orbCountHalf : d.orbCount, osp = on > 3 ? 0.24 : 0.3;   // HP が半分を切ると、闇の玉が5つ
        for (var j = 0; j < on; j++) api.addArrow(e, a1 + (j - (on - 1) / 2) * osp, d.orbSpeed, { orb: true, magic: true, mult: d.orbMult });
        e.state = "recover"; e.t = 0.4; e.ai.orb = d.orbEvery;
      }
      return;
    }
    if (e.state === "spin") {   // 回転斬り：構え（足もとに銀の輪）→ まわりを斬る → 宙返り
      e.t -= dt;
      if (e.t <= 0) {
        e.spinFx = 0.35;
        if (!p.down && dist - p.r <= d.spinRadius) hurt(e, p.x, p.y - 8, { mult: d.spinMult });
        e.state = "flip"; e.t = d.flipTime; e.flipDir = { x: -ux, y: -uy }; e.untouchable = true; e.ai.spin = d.spinEvery;
      }
      return;
    }
    if (e.state === "flip") {   // 後ろへ宙返り（このあいだは、こちらの攻撃が当たらない）
      e.t -= dt;
      var bx = e.x, by = e.y;
      room.move(e, e.flipDir.x * d.flipSpeed * dt, e.flipDir.y * d.flipSpeed * dt);
      if (Math.abs(e.x - bx) + Math.abs(e.y - by) < d.flipSpeed * dt * 0.3) {   // 壁にあたったら、横へそれる
        var sx = -e.flipDir.y, sy = e.flipDir.x; room.move(e, sx * d.flipSpeed * dt, sy * d.flipSpeed * dt);
      }
      if (e.t <= 0) { e.untouchable = false; e.state = "recover"; e.t = 0.2; }
      return;
    }
    if (e.state === "dark") {   // ダークアロー（2026-10-26 作りなおし）：まわりに闇の玉を回して、プレイヤーをねらって1つずつ撃つ
      e.t -= dt;
      e.daAng = (e.daAng || 0) + dt * 3.2 * e.daSpin;
      if (!e.status.para) {
        var out = gap < d.keepMin ? -0.6 : gap > d.keepMax ? 0.6 : 0;
        var mx = -uy * e.strafe + ux * out, my = ux * e.strafe + uy * out, ml = Math.sqrt(mx * mx + my * my) || 1;
        var b2x = e.x, b2y = e.y;
        room.move(e, mx / ml * d.speed * dt, my / ml * d.speed * dt);
        if (Math.abs(e.x - b2x) + Math.abs(e.y - b2y) < d.speed * dt * 0.3) e.strafe = -e.strafe;
        e.walk = (e.walk || 0) + dt * 8;
      }
      e.face = { x: ux, y: uy };
      if (e.t <= 0 && e.daLeft > 0) {
        // いちばん前（プレイヤーに近い）玉から撃つ。撃つときのプレイヤーの場所をねらう
        var best = 0, bd = 1e9;
        for (var q = 0; q < e.daLeft; q++) {
          var op = orbPos(e, q), odx = p.x - op.x, ody = p.y - op.y, od = odx * odx + ody * ody;
          if (od < bd) { bd = od; best = q; }
        }
        var o = orbPos(e, best);
        e.daLeft--; e.daSlots.splice(best, 1);
        api.addArrow(e, Math.atan2(p.y - 6 - o.y, p.x - o.x), d.daSpeed, { darkArrow: true, magic: true, big: true, mult: d.daMult, rad: d.daR, life: 2.6, ox: o.x, oy: o.y });
        e.daFlash = 0.2; Sound.play("skill");
        if (e.daLeft > 0) e.t = half ? d.daGapHalf : d.daGap;
        else tire(e);   // 次のダークアローまでの時間は、始めたときから数える（眠りやしびれで止まっても、すぐにはくり返さない）
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (gap <= d.spinRange && e.ai.spin <= 0) { e.state = "spin"; e.t = d.spinWarn; return; }
    if (e.ai.da <= 0) {
      var rng = half ? d.daCountHalf : d.daCount;
      e.state = "dark"; e.ai.da = half ? d.daEveryHalf : d.daEvery; e.t = d.daWindup;
      e.daN = rng[0] + Math.floor(Math.random() * (rng[1] - rng[0] + 1)); e.daLeft = e.daN; e.daSlots = [];
      for (var sl = 0; sl < e.daN; sl++) e.daSlots.push(sl);   // 玉の場所（撃った玉の場所は空く）
      e.daSpin = Math.random() < 0.5 ? 1 : -1; e.daAng = Math.random() * Math.PI * 2;
      Battle.pop(e.x, e.y - 50, "ダークアロー！", "#ef5b5b", 9); return;
    }
    if (e.ai.orb <= 0 && gap <= d.keepMax + 40) { e.state = "cast"; e.t = d.orbWindup; return; }
    if (e.cd <= 0 && gap <= d.keepMax + 60) { e.state = "aim"; e.t = d.aimTime; e.aim = { x: ux, y: uy }; return; }
    // ふだんは、はなれたところを回る
    var m2x = 0, m2y = 0;
    if (gap < d.keepMin) { m2x = -ux; m2y = -uy; } else if (gap > d.keepMax) { m2x = ux; m2y = uy; } else { m2x = -uy * e.strafe * 0.6; m2y = ux * e.strafe * 0.6; }
    if (!e.status.para && (m2x || m2y)) {
      var b3x = e.x, b3y = e.y;
      room.move(e, m2x * d.speed * dt, m2y * d.speed * dt);
      if (Math.abs(e.x - b3x) + Math.abs(e.y - b3y) < 0.01) e.strafe = -e.strafe;
      e.walk = (e.walk || 0) + dt * 8;
    }
  }
  // ダークエルフの弓（向きに合わせて描く）。x, y は弓を持つ手、draw は弦を引く強さ（0〜1）
  function drawBow(ctx, x, y, aim, draw) {
    var ang = Math.atan2(aim.y, aim.x), r = 9, a1 = ang - 1.15, a2 = ang + 1.15;
    var bx = x - Math.cos(ang) * 3, by = y - Math.sin(ang) * 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#120c18"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, r, a1, a2); ctx.stroke();
    ctx.strokeStyle = "#8a90a4"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, r, a1, a2); ctx.stroke();
    ctx.strokeStyle = "#d0d4e0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, r, a1 + 0.25, ang - 0.15); ctx.stroke();
    var e1x = bx + Math.cos(a1) * r, e1y = by + Math.sin(a1) * r, e2x = bx + Math.cos(a2) * r, e2y = by + Math.sin(a2) * r;
    var pull = 2 + draw * 7, nx = bx - Math.cos(ang) * pull + Math.cos(ang) * r * Math.cos(1.15), ny = by - Math.sin(ang) * pull + Math.sin(ang) * r * Math.cos(1.15);
    ctx.strokeStyle = "rgba(230,220,255,0.9)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e1x, e1y); ctx.lineTo(nx, ny); ctx.lineTo(e2x, e2y); ctx.stroke();
    if (draw > 0.05) {   // つがえた矢（先が紫に光る）
      ctx.strokeStyle = "#e8d8b0"; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(bx + Math.cos(ang) * (r + 3), by + Math.sin(ang) * (r + 3)); ctx.stroke();
      Render.rect(Math.round(bx + Math.cos(ang) * (r + 3)) - 1, Math.round(by + Math.sin(ang) * (r + 3)) - 1, 2, 2, "#b47aff");
    }
    ctx.lineCap = "butt";
  }
  // ダークアロー（2026-10-26 保護者の希望で、シューティングゲームのエネルギー弾のように大きく派手にした）：
  // うしろに光の残像、紫の光の玉がふくらんだり縮んだりして、まんなかは白く光る。life で光り方をずらす
  // 回っている闇の玉 i の場所（エルフの胸のまわりを、横長の輪で回る）
  function orbPos(e, i) {
    var a = e.daAng + e.daSlots[i] / e.daN * Math.PI * 2;
    return { x: e.x + Math.cos(a) * 26, y: e.y - 18 + Math.sin(a) * 15 };
  }
  // 回っている闇の玉（まるい光。尾はない）
  function drawDarkOrb(ctx, x, y, s, glow) {
    var pulse = 0.85 + 0.15 * Math.sin(glow * 12 + x * 0.1);
    Combat.glowDot(ctx, x, y, 13 * s * pulse, "#e8c8ff", "#8a30e0", 0.7);
    ctx.fillStyle = "rgba(60,10,110,0.85)"; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(245,220,255,0.95)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(x - 1 - 1.5 * s), Math.round(y - 1 - 1.5 * s), 2, 2);
  }
  // 撃った闇の玉（2026-10-26）：飛ぶ向きにとがった頭と、後ろへのびる長い光の尾。回っている玉とちがって、向かう方向が分かる
  function drawDarkBolt(ctx, x, y, vx, vy, life) {
    var ang = Math.atan2(vy, vx), pulse = 0.9 + 0.1 * Math.sin((life || 0) * 30);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    var g = ctx.createLinearGradient(-34, 0, 0, 0);
    g.addColorStop(0, "rgba(138,48,224,0)"); g.addColorStop(0.6, "rgba(160,64,255,0.55)"); g.addColorStop(1, "rgba(230,200,255,0.9)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-4, -6 * pulse); ctx.lineTo(-4, 6 * pulse); ctx.closePath(); ctx.fill();   // 尾
    ctx.restore();
    Combat.glowDot(ctx, x, y, 14 * pulse, "#f0d8ff", "#a040ff", 0.75);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = "rgba(70,12,130,0.95)"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();   // とがった頭（矢じり）
    ctx.strokeStyle = "rgba(245,225,255,0.95)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(1, -1, 4, 2);
    ctx.restore();
  }
  function drawDarkArrow(ctx, x, y, vx, vy, life) {
    var l = Math.sqrt(vx * vx + vy * vy) || 1, ux = vx / l, uy = vy / l, pulse = 0.85 + 0.15 * Math.sin((life || 0) * 28);
    for (var i = 5; i >= 1; i--) Combat.glowDot(ctx, x - ux * i * 6, y - uy * i * 6, (14 - i * 1.8) * pulse, "#e8c8ff", "#8a30e0", 0.6 - i * 0.1);
    Combat.glowDot(ctx, x, y, 19 * pulse, "#ffffff", "#a040ff", 0.9);
    ctx.fillStyle = "rgba(150,60,230,0.55)"; ctx.beginPath(); ctx.arc(x, y, 9 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(245,220,255,0.95)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 9 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // ダークアローの魔法陣（足もと）：二重の輪と、まわる8つのしるし。k（0〜1）で光が強くなる
  function drawMagicCircle(ctx, x, y, glow, k, dir) {
    k = Math.max(0, Math.min(1, k));
    var R = 26, al = 0.45 + 0.45 * k, rot = glow * 1.5 * dir;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R + 6);
    g.addColorStop(0, "rgba(160,64,255," + (0.35 * al).toFixed(2) + ")"); g.addColorStop(1, "rgba(160,64,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(200,140,255," + al.toFixed(2) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();   // 星の形
    for (var i = 0; i <= 5; i++) { var a = rot + i * Math.PI * 4 / 5; if (i) ctx.lineTo(Math.cos(a) * (R - 7), Math.sin(a) * (R - 7)); else ctx.moveTo(Math.cos(a) * (R - 7), Math.sin(a) * (R - 7)); }
    ctx.stroke();
    ctx.fillStyle = "rgba(240,220,255," + al.toFixed(2) + ")";
    for (var j = 0; j < 8; j++) { var b = -rot + j * Math.PI / 4; ctx.fillRect(Math.round(Math.cos(b) * (R - 3.5)) - 1, Math.round(Math.sin(b) * (R - 3.5)) - 1, 3, 3); }
    ctx.restore();
  }

  function startLift(e, half) {
    var d = e.def;
    e.state = "lift"; e.rocks = half ? d.rockCountHalf : d.rockCount + (Math.random() < 0.5 ? 1 : 0);
    e.ai.rock = half ? d.rockEveryHalf : d.rockEvery;   // 次の岩石投げまでの時間は、始めたときから数える（止められても、すぐにはくり返さない）
    e.t = (half ? d.rockWindupHalf : d.rockWindup) + 0.3;
    Battle.pop(e.x, e.y - 50, "岩石投げ！", "#ef5b5b", 9);
  }
  // 投げられた岩（ゴーレム）：ドット絵（24×21）。2026-10-26 保護者が送ってくれた絵の形をそのまま使い、色はゴーレムに合わせた灰色にした。
  // 1〜5 が明るい順、5 はふちどり。投げた岩は 90度ずつ向きを変えて、回っているように見せる（ドットがにじまないように）
  var ROCK = [
    ".........4444...........",
    ".......4411224..........",
    "......411111125.........",
    ".....41111111115........",
    "....4311111111115.......",
    "....432111111112255.....",
    "...44332211111222245....",
    "..41133222112222224455..",
    ".4111134433442222244425.",
    "431111143334443224444225",
    "433111113344433344442225",
    "433211111124333444212225",
    "533431111243334421111245",
    "533433312243342111114445",
    "533443333441122111244445",
    ".53443333421112343344445",
    "..544333443222444334445.",
    "...5443444333444334445..",
    "....55344533344433555...",
    "......555555344555......",
    "............555........."
  ];
  var ROCK_PAL = { "1": "#bdb6a4", "2": "#968f7e", "3": "#6c665a", "4": "#4a463e", "5": "#2a2724" };
  var rockCv = [];
  function rockCanvas(turn) {
    if (rockCv[turn]) return rockCv[turn];
    var h = ROCK.length, w = ROCK[0].length, odd = turn % 2;
    var cv = document.createElement("canvas"); cv.width = odd ? h : w; cv.height = odd ? w : h;
    var c = cv.getContext("2d");
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var col = ROCK_PAL[ROCK[y][x]]; if (!col) continue;
      var px = x, py = y;
      if (turn === 1) { px = h - 1 - y; py = x; } else if (turn === 2) { px = w - 1 - x; py = h - 1 - y; } else if (turn === 3) { px = y; py = w - 1 - x; }
      c.fillStyle = col; c.fillRect(px, py, 1, 1);
    }
    rockCv[turn] = cv;
    return cv;
  }
  // x, y がまんなか。rad は当たりの大きさ（絵はそれに合わせて大きくする。かけらは小さく）。rot（ラジアン）で 90度ずつ回る
  function drawRock(ctx, x, y, rad, rot) {
    var turn = ((Math.floor((rot || 0) / (Math.PI / 2)) % 4) + 4) % 4;
    var cv = rockCanvas(turn), sc = rad >= 6 ? 1 : 0.34;
    var w = Math.round(cv.width * sc), h = Math.round(cv.height * sc);
    ctx.drawImage(cv, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }
  // 岩がくだけたとき：かけら（見た目）・土けむり・小さな衝撃の輪・ゆれ。big なら大きな岩
  function rockBreak(x, y, big) {
    var n = big ? 9 : 3;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (big ? 40 : 25) + Math.random() * 50;
      chips.push({ x: x, y: y, z: 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 50 + Math.random() * 60, t: 0, max: 0.7 + Math.random() * 0.4,
                   c: ["#bdb6a4", "#968f7e", "#6c665a", "#4a463e"][i % 4], s: i % 3 === 0 ? 3 : 2 });
    }
    for (var k = 0; k < (big ? 5 : 2); k++) addDust(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 10);
    if (big) { addWave(x, y + 4, 4, 22, 0.3, 3); shake(1, 0.12); }
  }
  // 地面を走る輪。cracks はまわりにのびるひびの数（0 ならひびなし）
  function addWave(x, y, r0, r1, max, cracks) {
    var cs = [];
    for (var i = 0; i < cracks; i++) cs.push({ a: i / cracks * Math.PI * 2 + Math.random() * 0.5, l: r1 * (0.6 + Math.random() * 0.4), s: Math.random() });
    waves.push({ x: x, y: y, t: 0, max: max, r0: r0, r1: r1, cracks: cs });
  }

  // ---------- 予告と大技（地面） ----------
  function updateHazards(dt, p, hurt) {
    for (var di = dust.length - 1; di >= 0; di--) { dust[di].t += dt; if (dust[di].t >= dust[di].max) dust.splice(di, 1); }
    for (var ci = chips.length - 1; ci >= 0; ci--) {   // かけら：はねて落ちる
      var c = chips[ci]; c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= 260 * dt; c.z += c.vz * dt;
      if (c.z < 0) { c.z = 0; c.vz = -c.vz * 0.35; c.vx *= 0.6; c.vy *= 0.6; }
      if (c.t >= c.max) chips.splice(ci, 1);
    }
    for (var wi = waves.length - 1; wi >= 0; wi--) { waves[wi].t += dt; if (waves[wi].t >= waves[wi].max + 0.6) waves.splice(wi, 1); }
    quake.t = Math.max(0, quake.t - dt);
    for (var i = hazards.length - 1; i >= 0; i--) {
      var h = hazards[i];
      h.t += dt;
      if (h.kind === "line") continue; // 大突進の線は、ボスが走り終わると消える
      if (h.track && h.t < h.warn && !h.track.dead) { h.x = h.track.x; h.y = h.track.y; }   // 魔物使いの瘴気の柱：予告のあいだ、ねらった敵についていく（track。大ガマの follow とは別。2026-10-26 名前がぶつかって大ガマが消えたので分けた）
      if (h.t >= h.warn && !h.hit) {
        h.hit = true;
        var inside = h.kind === "circle"
          ? (p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y) < (h.r + p.r) * (h.r + p.r)
          : p.x > h.x && p.x < h.x + h.w && p.y > h.y && p.y < h.y + h.h;
        if (h.ally) h.ally(h);   // 魔物使いが呼んだ主の大技（2026-10-26）：プレイヤーではなく敵に当たる
        else if (!p.down && inside && !h.from.dead) hurt(h.from, p.x, p.y - 8, h.opts || { mult: h.from.def.rootMult, big: true });
      }
      if (h.t >= h.warn + h.erupt) hazards.splice(i, 1);
    }
  }

  // ボスが倒れたら、地面の予告も消す
  // 魔物使いが呼んだ主の大技を置く（2026-10-26）。h.ally(h) が、予告がおわったときに敵に当てる
  function addAlly(h) { h.t = 0; h.hit = false; h.from = null; if (h.seed === undefined) h.seed = Math.random() * 100; hazards.push(h); }
  function bossDown() { hazards.length = 0; dust.length = 0; chips.length = 0; waves.length = 0; }

  // ---------- 描画 ----------
  // 大技の絵（2026-10-18 に仮の絵から差しかえ）：予告は半とうめいの光。本番は、根の大波が太いつる、大突進のあとは土けむり（ドット）
  function rnd(n) { var v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }

  function drawHazards(cam, glow) {
    var ctx = Render.ctx;
    waves.forEach(function (w) { drawWave(ctx, w, cam); });
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
    chips.forEach(function (c) {
      var x = Math.round(c.x - cam.x), y = Math.round(c.y - cam.y), al = Math.min(1, (c.max - c.t) * 4);
      ctx.globalAlpha = al;
      Render.rect(x - 1, y, c.s, 1, "rgba(0,0,0,0.3)");                      // かげ
      Render.rect(x - 1, y - Math.round(c.z) - c.s, c.s, c.s, c.c);
      Render.rect(x - 1, y - Math.round(c.z) - c.s, 1, 1, "#d8d2c2");
      ctx.globalAlpha = 1;
    });
  }
  // 衝撃の輪（はじめは明るく、広がりながらうすく）と、地面のひび（輪が消えたあとも少し残る）
  function drawWave(ctx, w, cam) {
    var x = w.x - cam.x, y = w.y - cam.y, k = Math.min(1, w.t / w.max), r = w.r0 + (w.r1 - w.r0) * (1 - (1 - k) * (1 - k));
    var fade = w.t > w.max ? Math.max(0, 1 - (w.t - w.max) / 0.6) : 1;
    w.cracks.forEach(function (c) {
      var L = c.l * Math.min(1, w.t / (w.max * 0.6)), px = x, py = y;
      ctx.strokeStyle = "rgba(30,26,22," + (0.75 * fade).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py);
      for (var j = 1; j <= 4; j++) {
        var tt = j / 4, bend = (rnd(c.s * 7 + j) - 0.5) * 0.6;
        px = x + Math.cos(c.a + bend) * L * tt; py = y + Math.sin(c.a + bend) * L * tt * 0.55;
        ctx.lineTo(Math.round(px), Math.round(py));
      }
      ctx.stroke();
    });
    if (k < 1) {
      var al = 1 - k;
      ctx.strokeStyle = "rgba(255,240,200," + (0.9 * al).toFixed(2) + ")"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(168,152,120," + (0.8 * al).toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.44, 0, 0, Math.PI * 2); ctx.stroke();
    }
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
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる（1点ずつ）
        for (var st = 0; st < 3; st++) {
          var ta = glow * 4 + st * 2.1, tx = Math.round(x + Math.cos(ta) * 10), ty = Math.round(y + 14 - 4 + bob - 50 + Math.sin(ta) * 3);
          Render.rect(tx, ty - 1, 1, 3, "#ffe066"); Render.rect(tx - 1, ty, 3, 1, "#ffe066");
        }
      }
      if (e.state === "vanish" || e.state === "appear") {   // 紫のけむり
        for (var sm = 0; sm < 8; sm++) { var sa = sm * 0.785 + glow; Render.rect(Math.round(x + Math.cos(sa) * 14), Math.round(y - 10 + Math.sin(sa) * 10), 3, 3, "rgba(150,90,200,0.6)"); }
      }
    } else if (d.kind === "golem_boss") {
      // ゴーレム（48×52）：足もとは y＋16
      Render.rect(x - 20, y + 12, 40, 6, "rgba(0,0,0,0.35)");
      if (e.state === "spin") {   // ぶん回しのとどく範囲：赤い輪が、だんだん濃くなる
        var ks = 1 - e.t / d.spinWarn;
        ctx.fillStyle = "rgba(239,91,91," + (0.08 + 0.22 * ks).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(x, y + 4, d.spinRadius + e.r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(239,91,91," + (0.4 + 0.5 * ks).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y + 4, d.spinRadius + e.r * 0.3, 0, Math.PI * 2); ctx.stroke();
      }
      var gph = Math.sin(e.walk || 0), gf = "stand";
      if (e.state === "chase") gf = gph > 0.3 ? "walkA" : gph < -0.3 ? "walkB" : "stand";
      if (e.state === "spin") gf = "swing";
      if (e.state === "lift" && !(e.thrown > 0)) gf = "lift";
      if (e.state === "combo" && !(e.punch > 0)) gf = e.hits % 2 ? "punchR" : "punchL";
      var shake = e.state === "tired" ? Math.round(Math.sin(glow * 20)) : 0;
      Monsters.drawBoss(ctx, e, x + shake, y + 16, gf);
      if (e.state === "lift" && !(e.thrown > 0)) drawRock(ctx, x, y - 44, d.rockR, 0);   // 頭の上に持ち上げた岩
      if (e.sweep > 0) {   // ぶん回しの風
        var kw = 1 - e.sweep / 0.35;
        ctx.strokeStyle = "rgba(216,208,184," + (1 - kw).toFixed(2) + ")"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y + 2, (d.spinRadius + e.r * 0.3) * (0.6 + 0.4 * kw), glow * 12, glow * 12 + Math.PI * 1.5); ctx.stroke();
      }
      if (e.punch > 0) Combat.drawSlash(ctx, x, y - 4, e.aim, 0.8, d.comboReach + e.r, "#d8d0b8", 1 - e.punch / 0.22, e.hits % 2 === 1);
      e.punch = Math.max(0, (e.punch || 0) - 1 / 60); e.thrown = Math.max(0, (e.thrown || 0) - 1 / 60);
      if (e.state === "spin" || e.state === "combo") Render.text("！", x, y - 46, { size: 11, align: "center", bold: true, color: "#ffd24a" });
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる（1点ずつ）
        for (var gs = 0; gs < 3; gs++) {
          var ga = glow * 4 + gs * 2.1, gx = Math.round(x + Math.cos(ga) * 12), gy = Math.round(y - 40 + Math.sin(ga) * 3);
          Render.rect(gx, gy - 1, 1, 3, "#ffe066"); Render.rect(gx - 1, gy, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "elf_boss") {
      // ダークエルフ（34×48）：足もとは y＋14。宙返りのときは、とび上がりながら1回転する
      var hop = 0, rot = 0;
      if (e.state === "flip") { var kf = 1 - e.t / d.flipTime; hop = Math.round(Math.sin(kf * Math.PI) * 14); rot = kf * Math.PI * 2 * (e.flipDir.x > 0 ? 1 : -1); }
      Render.rect(x - 10, y + 10, 20, 4, "rgba(0,0,0," + (hop ? 0.2 : 0.35) + ")");
      if (e.state === "spin") {   // 回転斬りの構え：足もとの銀の輪がだんだん濃くなる
        var kk = 1 - e.t / d.spinWarn;
        ctx.fillStyle = "rgba(208,212,224," + (0.08 + 0.2 * kk).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(x, y + 4, d.spinRadius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(239,91,91," + (0.4 + 0.5 * kk).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y + 4, d.spinRadius, 0, Math.PI * 2); ctx.stroke();
      }
      var ef = "stand", eph = Math.sin(e.walk || 0);
      if ((e.state === "chase" || e.state === "dark") && Math.abs(eph) > 0.3) ef = eph > 0 ? "walkA" : "walkB";
      if (e.state === "aim" || e.shot > 0) ef = "aim";
      if (e.state === "cast" || e.state === "dark") ef = e.state === "dark" ? ef : "cast";
      if (e.state === "dark") drawMagicCircle(ctx, x, y + 8, glow, 1 - Math.max(0, e.t) / d.daWindup, e.daSpin || 1);   // 足もとの魔法陣（エルフの後ろ）
      if (rot) {
        ctx.save(); ctx.translate(x, y - 10 - hop); ctx.rotate(rot); ctx.translate(-x, -(y - 10 - hop));
        Monsters.drawBoss(ctx, e, x, y + 14 - hop, "stand"); ctx.restore();
      } else Monsters.drawBoss(ctx, e, x, y + 14, ef);
      if (ef === "aim") {   // 弓：のばした手の先に、ねらう向きに合わせて
        var aimV = e.aim || e.face, side = e.face.x > 0 ? 1 : -1;
        var draw2 = e.state === "aim" ? Math.min(1, 1 - e.t / d.aimTime + 0.2) : 0;
        drawBow(ctx, x + side * 15, y + 14 - 48 + 18, aimV, draw2);
      }
      if (e.state === "cast") {   // 上げた手の先に、闇の光
        var hx = x + (e.face.x > 0 ? -6 : 6);
        Combat.glowDot(ctx, hx, y + 14 - 48 + 3, 7 + Math.sin(glow * 10) * 2, "#e0c0ff", "#7a3ab8", 0.85);
      }
      if (e.state === "dark" && e.daLeft > 0) {   // まわりを回る闇の玉（はじめは1つずつあらわれる）。奥の玉はエルフの後ろなので、うすく
        var shown = e.daLeft === e.daN ? Math.min(e.daN, Math.ceil(e.daN * Math.min(1, 1.15 - Math.max(0, e.t) / d.daWindup))) : e.daLeft;
        for (var oi = 0; oi < Math.min(shown, e.daLeft); oi++) {
          var op2 = orbPos(e, oi), behind = op2.y < e.y - 18;
          ctx.globalAlpha = behind ? 0.6 : 1;
          drawDarkOrb(ctx, Math.round(op2.x - cam.x), Math.round(op2.y - cam.y), 1.3, glow);
          ctx.globalAlpha = 1;
        }
      }
      if (e.state === "dark" && e.daLeft === e.daN) {   // 光が手もとに集まってくる（撃ちはじめるまで）
        var kg = Math.min(1, 1 - Math.max(0, e.t) / d.daWindup);
        for (var gq = 0; gq < 10; gq++) {
          var ga2 = gq * 0.628 + glow * 3 * (e.daSpin || 1), gr = 38 * (1 - ((kg + gq / 10) % 1));
          Render.rect(Math.round(x + Math.cos(ga2) * gr), Math.round(y - 44 + Math.sin(ga2) * gr * 0.8), 2, 2, gq % 2 ? "#e8d0ff" : "#b060ff");
        }
        Combat.glowDot(ctx, x, y - 44, 5 + kg * 9, "#ffffff", "#9a40ff", 0.4 + 0.5 * kg);   // 頭の上に、闇の光が集まる
      }
      if (e.daFlash > 0) {   // 撃った光：紫の輪が広がる
        var kf2 = 1 - e.daFlash / 0.2;
        Combat.glowDot(ctx, x, y - 8, 30 * (1 - kf2) + 8, "#ffffff", "#b060ff", 0.55 * (1 - kf2));
        ctx.strokeStyle = "rgba(220,170,255," + (1 - kf2).toFixed(2) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 8, 10 + 40 * kf2, 0, Math.PI * 2); ctx.stroke();
      }
      e.daFlash = Math.max(0, (e.daFlash || 0) - 1 / 60);
      if (e.spinFx > 0) {   // 回転斬りの銀の弧
        var ks2 = 1 - e.spinFx / 0.35;
        ctx.strokeStyle = "rgba(230,232,245," + (1 - ks2).toFixed(2) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 4, d.spinRadius * (0.7 + 0.3 * ks2), ks2 * Math.PI * 4, ks2 * Math.PI * 4 + Math.PI * 1.6); ctx.stroke();
      }
      e.spinFx = Math.max(0, (e.spinFx || 0) - 1 / 60); e.shot = Math.max(0, (e.shot || 0) - 1 / 60);
      if (e.state === "spin") Render.text("！", x, y - 44, { size: 11, align: "center", bold: true, color: "#ffd24a" });
      if (e.state === "tired") {
        for (var es = 0; es < 3; es++) {
          var ea = glow * 4 + es * 2.1, ex2 = Math.round(x + Math.cos(ea) * 9), ey2 = Math.round(y - 38 + Math.sin(ea) * 3);
          Render.rect(ex2, ey2 - 1, 1, 3, "#ffe066"); Render.rect(ex2 - 1, ey2, 3, 1, "#ffe066");
        }
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

  // ふつうの敵（ワイルドボア。原生の秘境の段階2）も使う：壁までの長さ・予告の線の絵・土けむり
  function addDust(x, y) { dust.push({ x: x, y: y, t: 0, max: 0.6, s: Math.random() }); }

  return { hazards: function () { return hazards; }, clear: clear, isBoss: isBoss, update: update, updateHazards: updateHazards, drawHazards: drawHazards, draw: draw, interrupt: interrupt, bossDown: bossDown,
           rayLength: rayLength, drawChargeLine: drawChargeLine, addDust: addDust, drawRock: drawRock, drawDarkArrow: drawDarkArrow,
           rockBreak: rockBreak, shakeOffset: shakeOffset, addAlly: addAlly, drawDarkBolt: drawDarkBolt, drawDarkOrb: drawDarkOrb };
})();
