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

  function clear() { hazards.length = 0; dust.length = 0; chips.length = 0; waves.length = 0; quake.t = 0; if (typeof blizz !== "undefined") blizz.t = 0; if (typeof frost !== "undefined") frost.length = 0; }
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
             rock: d.rockEvery ? 6 : 0, combo: d.comboEvery ? 3 : 0, orb: d.orbEvery ? 4 : 0, spin: 0, da: d.daEvery ? 8 : 0,
             dash: d.dashEvery ? 4 : 0, bomb: d.bombEvery ? 7 : 0,
             guard: d.guardEvery ? 5 : 0, slam: d.slamEvery ? 7 : 0, toss: d.axeEvery ? 4 : 0,
             fog: d.fogEvery ? 4 : 0, inhale: d.inhaleEvery ? 9 : 0, bud: d.budEvery ? 6 : 0, storm: d.stormEvery ? 12 : 0,
             leap: d.leapEvery ? 5 : 0, breath: d.breathEvery ? 7 : 0, icerain: d.rainEvery ? 9 : 0,
             bubble: d.bubbleEvery ? 3 : 0, shell: d.shellEvery ? 8 : 0,
             web: d.webEvery ? 3 : 0, ceil: d.ceilEvery ? 9 : 0, beam: d.beamEvery ? 6 : 0,
             ink: d.inkEvery ? 5 : 0, arm: d.armFirst || 0,
             jet: d.jetFirst || 0, wave: d.waveFirst || 0,
             stomp: d.stompEvery ? 5 : 0, ball: d.ballFirst || 0, flame: d.flameFirst || 0,
             fbreath: d.fbreathFirst || 0, erupt: d.eruptFirst || 0, soar: d.soarFirst || 0,
             tbreath: d.tbreathFirst || 0, hell: d.hellFirst || 0 };
  }

  // 眠り・しびれで大技が止まったとき
  function interrupt(e) {
    if (e.state === "warn" || e.state === "charge" || e.state === "howl" || e.state === "pollen" || e.state === "seed" ||
        e.state === "rain" || e.state === "cast" || e.state === "dive" || e.state === "spin" || e.state === "combo" || e.state === "lift" || e.state === "back" || e.state === "aim" || e.state === "dark" || e.state === "throw" || e.state === "slash" ||
        e.state === "guard" || e.state === "slam" || e.state === "toss" || e.state === "inhale" || e.state === "breath" ||
        e.state === "rise" || e.state === "swoop" || e.state === "flap") { e.state = "recover"; e.t = 0.4; }
    e.guarding = false;
    if (e.def.kind === "crab_boss" && e.state !== "shell") e.shelled = false;
    if (e.def.kind === "spider_boss" && e.state === "beamWarn") {   // 水晶の大グモ：光線をためている途中なら、やめる（予告の帯も消す）
      e.state = "recover"; e.t = 0.4;
      for (var bj = hazards.length - 1; bj >= 0; bj--) if (hazards[bj].from === e && hazards[bj].kind === "beam" && hazards[bj].t < hazards[bj].warn) hazards.splice(bj, 1);
    }   // ヨロイガニ：回る突進が止まったら、からから出る
    if (e.def.kind === "octo_boss" && (e.state === "slamWarn" || e.state === "inkWarn")) {   // 大ダコ：たたきつけ・墨はきをためている途中なら、やめる（予告も消す）
      e.state = "recover"; e.t = 0.4;
      for (var oj = hazards.length - 1; oj >= 0; oj--) if (hazards[oj].from === e && (hazards[oj].kind === "beam" || hazards[oj].kind === "cone") && hazards[oj].t < hazards[oj].warn) hazards.splice(oj, 1);
    }
    if (e.def.kind === "wdragon_boss" && e.state === "jetWarn") {   // 水竜：水のブレスをためている途中なら、やめる（予告の帯も消す）。もぐっているあいだ（大波）は止まらない
      e.state = "recover"; e.t = 0.4;
      for (var wj = hazards.length - 1; wj >= 0; wj--) if (hazards[wj].from === e && hazards[wj].kind === "beam" && hazards[wj].t < hazards[wj].warn) hazards.splice(wj, 1);
    }
    if (e.def.kind === "giant_boss" && (e.state === "stompWarn" || e.state === "lift")) {   // 炎の巨人：地ならし・岩投げをためている途中なら、やめる（地ならしの予告も消す）
      e.state = "recover"; e.t = 0.4;
      for (var gj = hazards.length - 1; gj >= 0; gj--) if (hazards[gj].from === e && hazards[gj].look === "flamering" && hazards[gj].t < hazards[gj].warn) hazards.splice(gj, 1);
    }
    if (e.def.kind === "fdragon_boss") {   // 紅蓮の竜：空にいたら下りる。炎の息をためている途中なら、やめる
      if (e.state === "soar" || e.state === "dvwarn" || e.state === "dvdash") { landDragon(e, null); e.state = "recover"; e.t = 0.4; }
      if (e.state === "fbreathWarn") { e.state = "recover"; e.t = 0.4; }
      for (var fj = hazards.length - 1; fj >= 0; fj--) if (hazards[fj].from === e && hazards[fj].kind === "cone" && hazards[fj].t < hazards[fj].warn) hazards.splice(fj, 1);
    }
    if (e.def.kind === "cerberus_gj" && (e.state === "tbreathWarn" || e.state === "hellHowl" || e.state === "bite")) {   // ケルベロス：火球をためている・ほえている・かみついている途中なら、やめる
      e.state = "recover"; e.t = 0.4;
    }
    if (e.def.kind === "icefang_boss") {   // 氷牙獣：大ジャンプ・こおりの息の途中なら、その場でやめる（空にいたら下りる）
      if (e.state === "crouch" || e.state === "air" || e.state === "breathWarn" || e.state === "bighowl") { e.state = "recover"; e.t = 0.4; }
      e.untouchable = false; e.leapsLeft = 0;
      for (var j = hazards.length - 1; j >= 0; j--) if (hazards[j].from === e && (hazards[j].look === "leap" || hazards[j].kind === "cone") && hazards[j].t < hazards[j].warn) hazards.splice(j, 1);
    }
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
    ["charge", "howl", "roots", "pollen", "dive", "rain", "pillar", "blink", "summon", "hop", "rock", "combo", "orb", "spin", "da", "dash", "bomb", "guard", "slam", "toss", "fog", "inhale", "bud", "storm", "leap", "breath", "icerain", "bubble", "shell", "web", "ceil", "beam", "ink", "arm", "jet", "wave", "stomp", "ball", "flame", "fbreath", "erupt", "soar", "tbreath", "hell"].forEach(function (k) { e.ai[k] = Math.max(0, e.ai[k] - dt); });
    if (d.kind === "wolf_boss") wolf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "icefang_boss") iceFang(e, dt, room, p, hurt, api, ux, uy, gap, dist);   // 氷牙獣は大オオカミがもと
    else if (d.kind === "frog_boss") frogBoss(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "witch_boss") witch(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "golem_boss" || d.kind === "snowgolem_boss") golem(e, dt, room, p, hurt, api, ux, uy, gap, dist);   // スノーゴーレムはゴーレムがもと（d.snow）
    else if (d.kind === "elf_boss") elf(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "bandit_boss") bandit(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "dwarf_boss") dwarfKing(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "crab_boss") crab(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "spider_boss") spider(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "octo_boss") octo(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "wdragon_boss") wdragon(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "giant_boss") giant(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "fdragon_boss") fdragon(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "raff_boss") raff(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "roc_boss") roc(e, dt, room, p, hurt, api, ux, uy, gap, dist);
    else if (d.kind === "cerberus_gj") cerberus(e, dt, room, p, hurt, api, ux, uy, gap, dist);
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
    if (wolfCharge(e, dt, room, p, hurt)) return;
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

  // 大突進（大オオカミ・氷牙獣）：予告の赤い線（warn）→ 走る（charge）。この2つのときは true
  function wolfCharge(e, dt, room, p, hurt) {
    var d = e.def;
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
      return true;
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
      return true;
    }
    return false;
  }
  function startCharge(e, room, ux, uy) {
    var d = e.def;
    e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
    e.chargeLen = Math.min(260, rayLength(room, e.x, e.y, ux, uy, e.r));
    e.chargeLine = { kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ux * e.chargeLen, y2: e.y + uy * e.chargeLen, w: e.r * 2 + 4, t: 0, warn: d.chargeWarn };
    hazards.push(e.chargeLine);
    e.state = "warn"; e.t = d.chargeWarn; e.ai.charge = d.chargeEvery + Math.random() * 2;
    Battle.pop(e.x, e.y - 30, "大突進の構え！", "#ef5b5b", 9);
  }

  // ---------- 氷牙獣（白銀の霊峰12階・主。段階4、2026-11-09。大オオカミがもと） ----------
  // かみつき・大突進・遠ぼえ（雪オオカミを呼ぶ）は大オオカミと同じ。大ジャンプ（落ちる場所に影 → 着地のまわりに氷のトゲ）、
  // こおりの息（扇の形に予告 → 吐く。床が少しのあいだ「すべる氷」になる）。HP 半分から氷のよろい（受けるダメージ半分。火か時間でとける）、大ジャンプが3回続けて
  var frost = [];   // こおりの息で凍った床（core.js の罠と同じ形。すべる氷として調べる）：{ type: "ice", tx, ty, w, h, found, t, max }
  var TILE = 16;
  function iceFang(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.armorCd = Math.max(0, (e.armorCd || 0) - dt);
    if (e.armor > 0) { e.armor -= dt; if (e.armor <= 0) meltArmor(e, false); }
    if (e.state === "windup") { // かみつき
      e.t -= dt;
      if (e.t <= 0) { if (!p.down && gap <= d.reach + 2) hurt(e, p.x, p.y - 8); e.state = "recover"; e.t = 0.35; e.cd = half ? d.cooldownHalf : d.cooldown; }
      return;
    }
    if (e.state === "howl") {
      e.t -= dt;
      if (e.t <= 0) {
        for (var i = 0; i < d.pups; i++) {
          var a = Math.random() * Math.PI * 2, sx = e.x + Math.cos(a) * 30, sy = e.y + Math.sin(a) * 30;
          if (room.hitsWall(sx - 5, sy - 5, 10, 10)) { sx = e.x; sy = e.y + 20; }
          var pup = api.spawn("snow_wolf", sx, sy, 1);
          pup.hp = pup.maxHp = d.pupHp; pup.patk = d.pupAtk;   // 霊峰の雪オオカミの強さ（呼ばれた敵は深さで強くならないので、ここで決める）
          pup.summoned = true; pup.owner = e;
        }
        e.state = "recover"; e.t = 0.5; e.ai.howl = d.howlEvery;
      }
      return;
    }
    if (e.state === "bighowl") {   // 大遠ぼえ：空を向いてほえ終わると、つららが降りはじめる
      e.t -= dt;
      if (e.t <= 0) { icicleRain(e, room, p, half); e.state = "recover"; e.t = 0.8; e.ai.icerain = half ? d.rainEveryHalf : d.rainEvery; }
      return;
    }
    if (wolfCharge(e, dt, room, p, hurt)) return;
    if (e.state === "crouch") {   // 大ジャンプの前に、ぐっと身をかがめる
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "air"; e.t = d.leapAir; e.untouchable = true; e.leapFrom = { x: e.x, y: e.y };
        e.mark = { kind: "circle", look: "leap", from: e, x: p.x, y: p.y, r: d.leapR, t: 0, warn: d.leapAir, erupt: 0.3, hit: false, opts: { mult: d.leapMult, big: true } };
        hazards.push(e.mark);
      }
      return;
    }
    if (e.state === "air") {   // 空にいるあいだ（当たらない）：影はプレイヤーを追い、着地の leapLock 秒前に止まる
      e.t -= dt;
      var m = e.mark;
      if (e.t > d.leapLock && !p.down && !room.hitsWall(p.x - e.r, p.y - e.r, e.r * 2, e.r * 2)) { m.x = p.x; m.y = p.y; }
      var k = 1 - Math.max(0, e.t) / d.leapAir;
      e.x = e.leapFrom.x + (m.x - e.leapFrom.x) * k; e.y = e.leapFrom.y + (m.y - e.leapFrom.y) * k;
      var fx = m.x - e.leapFrom.x; if (Math.abs(fx) > 2) e.face = { x: fx > 0 ? 1 : -1, y: 0 };
      if (e.t <= 0) {   // 着地：ずしん。まわりに氷のトゲ（少しおくれて生える）
        e.x = m.x; e.y = m.y; e.untouchable = false;
        shake(3, 0.3); Sound.play("hit");
        waves.push({ x: e.x, y: e.y + 8, t: 0, max: 0.4, r0: 8, r1: d.spikeDist + 6, cracks: [], ice: true });
        for (var s = 0; s < d.spikeCount; s++) {
          var sa = (s + (e.leapsLeft % 2) * 0.5) / d.spikeCount * Math.PI * 2;
          hazards.push({ kind: "circle", look: "spike", from: e, x: e.x + Math.cos(sa) * d.spikeDist, y: e.y + 6 + Math.sin(sa) * d.spikeDist * 0.7,
                         r: d.spikeR, t: 0, warn: d.spikeWarn, erupt: 0.6, hit: false, seed: Math.random() * 100, opts: { mult: d.spikeMult } });
        }
        e.leapsLeft--;
        if (e.leapsLeft > 0 && !p.down) { e.state = "crouch"; e.t = 0.3; }
        else { e.state = "recover"; e.t = 0.9; e.ai.leap = half ? d.leapEveryHalf : d.leapEvery; }
      }
      return;
    }
    if (e.state === "breathWarn") {   // こおりの息の予告：扇の形が光る
      e.t -= dt;
      if (e.t <= 0) { e.state = "breath"; e.t = 0.5; }
      return;
    }
    if (e.state === "breath") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.7; } return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    if (half && !(e.armor > 0) && e.armorCd <= 0) {   // 氷のよろいを着る
      e.armor = d.armorTime; e.armorCd = d.armorEvery;
      Battle.pop(e.x, e.y - 40, "氷のよろい！", "#9ff4ff", 9); Sound.play("trap");
      e.state = "recover"; e.t = 0.5;
      return;
    }
    if (e.ai.icerain <= 0) {
      e.state = "bighowl"; e.t = d.rainHowl;
      Battle.pop(e.x, e.y - 34, "大遠ぼえ！", "#9ff4ff", 10); shake(1, d.rainHowl);
      return;
    }
    var pups = api.alive().filter(function (o) { return o.owner === e; }).length;
    if (e.ai.howl <= 0 && pups < 1) {
      e.state = "howl"; e.t = 0.8;
      Battle.pop(e.x, e.y - 34, "遠ぼえ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.leap <= 0) {
      e.state = "crouch"; e.t = d.leapCrouch; e.leapsLeft = half ? d.leapsHalf : 1;
      Battle.pop(e.x, e.y - 34, "大ジャンプ！", "#9ff4ff", 9);
      return;
    }
    if (e.ai.breath <= 0 && dist < d.breathLen) {
      e.face = { x: ux, y: uy };
      hazards.push({ kind: "cone", from: e, x: e.x + ux * 10, y: e.y + uy * 6, ang: Math.atan2(uy, ux), spread: d.breathSpread, len: d.breathLen,
                     t: 0, warn: d.breathWarn, erupt: 0.5, hit: false, seed: Math.random() * 100, opts: { mult: d.breathMult } });
      e.state = "breathWarn"; e.t = d.breathWarn; e.ai.breath = d.breathEvery + Math.random() * 2;
      Battle.pop(e.x, e.y - 34, "こおりの息！", "#9ff4ff", 9);
      return;
    }
    if (e.ai.charge <= 0) { startCharge(e, room, ux, uy); return; }
    if (gap > d.reach - 2) {
      if (!e.status.para) { room.move(e, ux * d.speed * dt, uy * d.speed * dt); e.walk += dt * 8; }
      e.face = { x: ux, y: uy };
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = d.windup; e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
    }
  }
  // 大遠ぼえのつらら：1本目はプレイヤーの足もと、半分はプレイヤーのまわり、のこりは部屋のどこか。少しずつずらして落ちる
  function icicleRain(e, room, p, half) {
    var d = e.def, n = half ? d.rainCountHalf : d.rainCount;
    for (var i = 0; i < n; i++) {
      var x = p.x, y = p.y, tries = 0;
      do {
        if (i === 0) { x = p.x; y = p.y; }
        else if (i % 2) { var a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 60; x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r * 0.8; }
        else { x = 24 + Math.random() * (room.pxW - 48); y = 24 + Math.random() * (room.pxH - 48); }
        tries++;
      } while (i > 0 && tries < 8 && room.hitsWall(x - 6, y - 6, 12, 12));
      hazards.push({ kind: "circle", look: "icicle", from: e, x: x, y: y, r: d.rainR, t: 0, warn: d.rainWarn + i * d.rainGap, erupt: 0.45, hit: false,
                     seed: Math.random() * 100, opts: { mult: d.rainMult, big: true } });
    }
  }
  // 氷のよろいがとける（fire：火の攻撃でとけた）。skills.js の hitEnemy からも呼ぶ
  function meltArmor(e, fire) {
    if (!(e.armor > 0) && fire) return;
    e.armor = 0;
    Battle.pop(e.x, e.y - 40, fire ? "よろいがとけた！" : "よろいがはがれた", fire ? "#ffb84a" : "#bfe6f8", 9);
    for (var i = 0; i < 10; i++) {   // 氷のかけらが飛びちる
      var a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 40;
      chips.push({ x: e.x, y: e.y, z: 10 + Math.random() * 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 60 + Math.random() * 60, t: 0, max: 0.8, c: i % 2 ? "#bfe6f8" : "#ffffff", s: 2 });
    }
  }
  // 受けるダメージの倍率（氷のよろいを着ているとき）
  function armorMult(e) { return e.armor > 0 ? e.def.armorCut : 1; }
  // こおりの息の扇の中か
  function inCone(h, x, y, pad) {
    var dx = x - h.x, dy = y - h.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l > h.len + pad) return false;
    if (l < 8) return true;
    var diff = Math.atan2(dy, dx) - h.ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= h.spread + pad / Math.max(l, 1);
  }
  // こおりの息が当たった：プレイヤーにダメージ、扇の床を凍らせる
  function breathHit(h, p, hurt, room) {
    if (!p.down && !h.from.dead && inCone(h, p.x, p.y, p.r)) hurt(h.from, p.x, p.y - 8, h.opts);
    if (!h.from.def.frostLife) return;   // 床が凍るのは氷牙獣のこおりの息だけ（大ダコの墨はきは凍らない）
    var d = h.from.def, x0 = Math.floor((h.x - h.len) / TILE), x1 = Math.floor((h.x + h.len) / TILE), y0 = Math.floor((h.y - h.len) / TILE), y1 = Math.floor((h.y + h.len) / TILE);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      var cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      if (!inCone(h, cx, cy, 0) || room.hitsWall(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4)) continue;
      var old = null;
      for (var i = 0; i < frost.length; i++) if (frost[i].tx === tx && frost[i].ty === ty) old = frost[i];
      if (old) { old.t = 0; old.max = d.frostLife; continue; }
      frost.push({ type: "ice", tx: tx, ty: ty, w: 1, h: 1, found: true, hidden: false, t: 0, max: d.frostLife, seed: Math.random() * 100 });
    }
  }
  function updateFrost(dt) {
    for (var i = frost.length - 1; i >= 0; i--) {
      var f = frost[i]; f.t += dt; if (f.wait > 0) f.wait -= dt;
      if (f.t >= f.max) frost.splice(i, 1);
    }
  }

  // ---------- 盗賊のおかしら（黒鉄の坑道6階。2026-11-03 保護者と決定） ----------
  // すばやく近づいて剣で2回斬る（HP半分から3回）。影走り（赤い線で予告 → 走りぬけて斬る）。爆弾投げ（足もとに輪で予告）。
  // HP が半分になると、子分（盗賊の剣士と弓使い）を1回だけ呼び、速くなる
  function bandit(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.pose = Math.max(0, (e.pose || 0) - dt);       // 斬ったあとの絵を出す時間
    e.slashT = Math.max(0, (e.slashT || 0) - dt);   // 斬りの光
    if (e.state === "windup") {   // 剣を構える → 斬りへ
      e.t -= dt;
      if (e.t <= 0) { e.state = "slash"; e.left = half ? d.slashesHalf : d.slashes; e.t = 0; }
      return;
    }
    if (e.state === "slash") {   // 2回（3回）つづけて斬る。1回ごとに少しふみこむ
      e.t -= dt;
      if (e.t > 0) return;
      var ddx = p.x - e.x, ddy = p.y - e.y, dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      if (!p.down) { e.aim = { x: ddx / dl, y: ddy / dl }; e.face = { x: e.aim.x, y: e.aim.y }; }
      if (dl - e.r - p.r > 4) room.move(e, e.aim.x * Math.min(8, dl - e.r - p.r - 4), e.aim.y * Math.min(8, dl - e.r - p.r - 4));
      var g2 = Math.sqrt((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y)) - e.r - p.r;
      if (!p.down && g2 <= d.reach + 4) hurt(e, p.x, p.y - 8, { mult: d.slashMult });
      e.pose = 0.3; e.slashT = 0.2; e.slashFlip = !e.slashFlip;
      Sound.play("swing");
      e.left--;
      if (e.left > 0) { e.t = d.slashGap; return; }
      e.state = "recover"; e.t = 0.45; e.cd = half ? d.cooldownHalf : d.cooldown;
      return;
    }
    if (e.state === "warn") {   // 影走りの予告：赤い線。走り出す 0.3 秒前まで向きを合わせ直す
      e.t -= dt;
      if (e.t > 0.3 && !p.down && e.chargeLine) {
        var ax = p.x - e.x, ay = p.y - e.y, al = Math.sqrt(ax * ax + ay * ay) || 1;
        ax /= al; ay /= al;
        e.aim = { x: ax, y: ay }; e.face = { x: ax, y: ay };
        e.chargeLen = Math.min(240, rayLength(room, e.x, e.y, ax, ay, e.r));
        e.chargeLine.x2 = e.x + ax * e.chargeLen; e.chargeLine.y2 = e.y + ay * e.chargeLen;
      }
      if (e.t <= 0) { e.state = "charge"; e.travel = 0; e.hitDone = false; e.dashFrom = { x: e.x, y: e.y }; }
      return;
    }
    if (e.state === "charge") {   // 影走り：線のとおりに走りぬける（プレイヤーにぶつかっても止まらない）
      var step = d.dashSpeed * dt, bx = e.x, by = e.y;
      room.move(e, e.aim.x * step, e.aim.y * step);
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step; e.walk += dt * 24;
      var px = p.x - e.x, py = p.y - e.y;
      if (!e.hitDone && !p.down && px * px + py * py < (e.r + p.r + 6) * (e.r + p.r + 6)) { e.hitDone = true; hurt(e, p.x, p.y - 8, { mult: d.dashMult, big: true }); e.slashT = 0.2; }
      if (moved < step * 0.4 || e.travel >= e.chargeLen) {
        Combat.addEffect({ kind: "trail", x0: e.dashFrom.x, y0: e.dashFrom.y, x1: e.x, y1: e.y, t: 0.45, max: 0.45 });   // 走ったあとの残像
        e.state = "recover"; e.t = 0.8; e.pose = 0.6;
        removeLines(e);
      }
      return;
    }
    if (e.state === "throw") {   // 爆弾を投げる：足もとに輪で予告 → 爆発
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? d.bombCountHalf : d.bombCount;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 36 + Math.random() * 40;
          hazards.push({ kind: "circle", look: "bomb", from: e, x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, r: d.bombRadius, t: 0, warn: d.bombWarn + i * 0.15, erupt: 0.45, hit: false,
                         sx: e.x, sy: e.y - 16, opts: { mult: d.bombMult, big: true } });
        }
        e.state = "recover"; e.t = 0.5; e.pose = 0.4; e.ai.bomb = half ? d.bombEveryHalf : d.bombEvery;
      }
      return;
    }
    if (e.state === "call") {   // 子分を呼ぶ
      e.t -= dt;
      if (e.t <= 0) {
        ["thief_sword", "thief_archer"].forEach(function (t, k) {
          var ang = Math.random() * Math.PI * 2, f = api.spawn(t, e.x + Math.cos(ang) * 34, e.y + Math.sin(ang) * 34, 44);
          f.summoned = true;
        });
        e.state = "recover"; e.t = 0.5;
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.called) {   // HP が半分：子分を呼ぶ（1回だけ）。ここから速くなる
      e.called = true;
      e.state = "call"; e.t = 0.6;
      Battle.pop(e.x, e.y - 44, "おまえたち、出てこい！", "#ffd24a", 9);
      return;
    }
    if (e.ai.dash <= 0) {
      e.aim = { x: ux, y: uy };
      e.chargeLen = Math.min(240, rayLength(room, e.x, e.y, ux, uy, e.r));
      e.chargeLine = { kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ux * e.chargeLen, y2: e.y + uy * e.chargeLen, w: e.r * 2 + 4, t: 0, warn: half ? d.dashWarnHalf : d.dashWarn };
      hazards.push(e.chargeLine);
      e.state = "warn"; e.t = half ? d.dashWarnHalf : d.dashWarn; e.ai.dash = (half ? d.dashEveryHalf : d.dashEvery) + Math.random() * 2;
      Battle.pop(e.x, e.y - 44, "影走り！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.bomb <= 0) {
      e.state = "throw"; e.t = d.bombWindup;
      Battle.pop(e.x, e.y - 44, "爆弾だ！", "#ff9a4d", 9);
      return;
    }
    if (gap > d.reach - 2) {
      var sp = half ? d.speedHalf : d.speed;
      if (!e.status.para) { room.move(e, ux * sp * dt, uy * sp * dt); e.walk += dt * 10; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy };
    }
  }

  // ---------- ドワーフキング（黒鉄の坑道12階・主。2026-11-07） ----------
  // ハンマーの一撃。盾がまえ（前からの攻撃を減らす。ゆっくり向きなおる → 盾でなぐる）。
  // 大地たたき（まわり＋こちらへ向けて、光の柱が根もとから順に立つ）。トマホーク投げ（回りながらまっすぐ飛ぶ）。HP 半分から、トマホーク3本 → 大地たたきの連携・子分を呼ぶ
  function dwarfKing(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.pose = Math.max(0, (e.pose || 0) - dt);   // ハンマーをたたきつけた絵を出す時間
    e.swingT = Math.max(0, (e.swingT || 0) - dt);
    if (e.state === "windup") {   // ハンマーを振り上げる → 前へふり下ろす
      e.t -= dt;
      if (e.t > 0.15 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var px = p.x - e.x, py = p.y - e.y, pd = Math.sqrt(px * px + py * py) || 1;
        if (!p.down && pd - e.r - p.r <= d.reach + 4 && (px * e.aim.x + py * e.aim.y) / pd > 0.2) hurt(e, p.x, p.y - 8, { mult: d.swingMult });
        addWave(e.x + e.aim.x * (e.r + 10), e.y + 6 + e.aim.y * (e.r + 10), 3, 16, 0.3, 0);
        shake(1, 0.12); Sound.play("swing");
        e.pose = 0.35; e.swingT = 0.22;
        e.state = "recover"; e.t = 0.55; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "guard") {   // 盾がまえ：ゆっくりこちらへ向きなおる。前からの攻撃は減る（skills.js の hitEnemy）
      e.t -= dt;
      if (!p.down) turnToward(e, ux, uy, d.guardTurn * dt);
      if (e.t <= 0) {
        e.guarding = false;
        var bx = p.x - e.x, by = p.y - e.y, bd = Math.sqrt(bx * bx + by * by) || 1;
        if (!p.down && bd - e.r - p.r <= d.bashReach && (bx * e.face.x + by * e.face.y) / bd > 0.3) {   // 前にいれば、盾でなぐる
          hurt(e, p.x, p.y - 8, { mult: d.bashMult });
          e.swingT = 0.22; e.aim = { x: e.face.x, y: e.face.y }; shake(1, 0.12);
        }
        e.state = "recover"; e.t = 0.5; e.ai.guard = d.guardEvery;
      }
      return;
    }
    if (e.state === "slam") {   // 大地たたき：振り上げ（赤い輪）→ たたく
      e.t -= dt;
      if (e.t <= 0) {
        if (!p.down && dist - p.r <= d.slamNear) hurt(e, p.x, p.y - 8, { mult: d.slamMult, big: true });
        addWave(e.x, e.y + 8, 8, d.slamNear + 10, 0.45, 8);
        for (var sd = 0; sd < 8; sd++) { var sa = sd * Math.PI / 4 + Math.random() * 0.4; addDust(e.x + Math.cos(sa) * 26, e.y + 8 + Math.sin(sa) * 16); }
        shake(3, 0.35); Sound.play("hit");
        e.pose = 0.7;
        if (e.combo) { e.combo = false; tire(e); }
        else { e.state = "recover"; e.t = 0.8; }
        e.ai.slam = half ? d.slamEveryHalf : d.slamEvery;
      }
      return;
    }
    if (e.state === "toss") {   // トマホークを振りかぶる → 回しながら、まっすぐ投げる（HP 半分から扇に3本 → すぐ大地たたき）
      e.t -= dt;
      if (e.t > 0.15 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var a0 = Math.atan2(e.aim.y, e.aim.x), n = half ? d.axeCountHalf : 1;
        for (var k = 0; k < n; k++) api.addArrow(e, a0 + (k - (n - 1) / 2) * d.axeSpread, d.axeSpeed, { tomahawk: true, big: true, pierce: true, mult: d.axeMult, rad: 5, dy: -14, life: 3, spin: e.aim.x >= 0 ? 1 : -1 });
        Sound.play("swing");
        e.thrown = 0.25; e.ai.toss = half ? d.axeEveryHalf : d.axeEvery;
        if (half) {   // HP 半分から：投げてすぐ大地たたき（連携）
          e.state = "slam"; e.t = d.slamWarn; e.combo = true; startQuake(e, room, p, half);
          Battle.pop(e.x, e.y - 50, "大地たたき！", "#ef5b5b", 9);
        } else { e.state = "recover"; e.t = 0.6; }
      }
      return;
    }
    if (e.state === "call") {   // 子分を呼ぶ
      e.t -= dt;
      if (e.t <= 0) {
        ["dwarf_axe", "dwarf_hammer"].forEach(function (t) {
          var ang = Math.random() * Math.PI * 2, f = api.spawn(t, e.x + Math.cos(ang) * 36, e.y + Math.sin(ang) * 36, 50);
          f.summoned = true;
        });
        e.state = "recover"; e.t = 0.5;
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.called) {   // HP が半分：子分を呼ぶ（1回だけ）
      e.called = true;
      e.state = "call"; e.t = 0.6;
      Battle.pop(e.x, e.y - 50, "者ども、かかれ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.toss <= 0 && gap > 30) {   // 少しはなれていると、トマホーク
      e.state = "toss"; e.t = d.axeWindup; e.aim = { x: ux, y: uy };
      Battle.pop(e.x, e.y - 50, "トマホーク！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.slam <= 0) {
      e.state = "slam"; e.t = d.slamWarn; e.combo = false; startQuake(e, room, p, half);
      Battle.pop(e.x, e.y - 50, "大地たたき！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.guard <= 0) {
      e.state = "guard"; e.t = d.guardTime; e.guarding = true;
      Battle.pop(e.x, e.y - 50, "盾がまえ", "#c8d0dc", 8);
      return;
    }
    if (gap > d.reach - 2) {
      var sp = half ? d.speedHalf : d.speed;
      if (!e.status.para) { room.move(e, ux * sp * dt, uy * sp * dt); e.walk = (e.walk || 0) + dt * 6; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // ---------- ヨロイガニ（水晶の鍾乳洞5階・中ボス。段階3、2026-11-15）。からにこもったら、打でたたいてわる ----------
  function crab(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.cracked = Math.max(0, (e.cracked || 0) - dt);
    e.snipT = Math.max(0, (e.snipT || 0) - dt);
    if (e.state !== "shell" && e.state !== "warn" && e.state !== "charge") e.shelled = false;
    if (e.state === "windup") {   // はさみを振り上げる → はさむ（2回）
      e.t -= dt;
      if (e.t > 0.15 && !p.down && !e.hits) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var px = p.x - e.x, py = p.y - e.y, pd = Math.sqrt(px * px + py * py) || 1;
        if (!p.down && pd - e.r - p.r <= d.reach + 4 && (px * e.aim.x + py * e.aim.y) / pd > 0.2) hurt(e, p.x, p.y - 8, { mult: d.pinchMult });
        e.snipT = 0.2; e.snipFlip = !e.snipFlip; Sound.play("swing");
        e.hits = (e.hits || 0) + 1;
        if (e.hits < 2) { e.t = d.pinchGap; return; }
        e.hits = 0; e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "bubble") {   // あわはき：口の前にあわがふくらむ → 扇に吐く
      e.t -= dt;
      if (e.t > 0.15 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var a0 = Math.atan2(e.aim.y, e.aim.x), n = half ? d.bubblesHalf : d.bubbles;
        for (var k = 0; k < n; k++) {
          var sp = d.bubbleSpeed * (0.85 + Math.random() * 0.3);
          api.addArrow(e, a0 + (k - (n - 1) / 2) * d.bubbleSpread, sp, { bubble: true, mult: d.bubbleMult, rad: 4, dy: -8, life: d.bubbleLife, wob: Math.random() * 6 });
        }
        Sound.play("swing");
        e.state = "recover"; e.t = 0.5; e.ai.bubble = half ? d.bubbleEveryHalf : d.bubbleEvery;
      }
      return;
    }
    if (e.state === "shell") {   // からごもり：打でたたかれると、ひびが入る（skills.js の hitEnemy → crackShell）
      e.t -= dt;
      if (e.t <= 0) { e.spinsLeft = half ? d.spinsHalf : d.spins; startSpin(e, room, p); }
      return;
    }
    if (e.state === "warn" || e.state === "charge") {   // からのまま回って突進（大オオカミの大突進と同じ）
      var was = e.state;
      wolfCharge(e, dt, room, p, hurt);
      if (was === "charge" && e.state === "recover") {
        e.spinsLeft--;
        shake(2, 0.2); addWave(e.x + e.aim.x * e.r, e.y + 6 + e.aim.y * e.r, 4, 22, 0.35, 4);
        if (e.spinsLeft > 0 && !p.down) startSpin(e, room, p);
        else { e.shelled = false; e.t = 1.0; e.ai.shell = half ? d.shellEveryHalf : d.shellEvery; }
      }
      return;
    }
    if (e.state === "call") {   // 子分（洞くつガニ）を呼ぶ
      e.t -= dt;
      if (e.t <= 0) {
        for (var c = 0; c < 2; c++) {
          var ang = Math.random() * Math.PI * 2, sx = e.x + Math.cos(ang) * 36, sy = e.y + Math.sin(ang) * 36;
          if (room.hitsWall(sx - 6, sy - 6, 12, 12)) { sx = e.x + (c ? 30 : -30); sy = e.y + 24; }
          var f = api.spawn("cave_crab", sx, sy, 1);
          f.hp = f.maxHp = d.callHp; f.patk = d.callAtk;   // 呼ばれた敵は深さで強くならないので、ここで決める
          f.summoned = true;
        }
        e.state = "recover"; e.t = 0.5;
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.called) {   // HP が半分：子分を呼ぶ（1回だけ）
      e.called = true; e.state = "call"; e.t = 0.6;
      Battle.pop(e.x, e.y - 50, "カチカチカチ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.shell <= 0) {
      e.state = "shell"; e.t = d.shellTime; e.shelled = true; e.crack = 0;
      Battle.pop(e.x, e.y - 50, "からにこもった！", "#c8d0dc", 9);
      return;
    }
    if (e.ai.bubble <= 0 && gap > 34) {
      e.state = "bubble"; e.t = d.bubbleWindup; e.aim = { x: ux, y: uy };
      Battle.pop(e.x, e.y - 50, "あわはき！", "#9fd8ff", 9);
      return;
    }
    if (gap > d.reach - 2) {   // 横歩き：こちらを向いたまま、横にずれながら近づく（ときどき向きをかえる）
      e.sideT = (e.sideT || 0) - dt;
      if (e.sideT <= 0) { e.sideT = 1.2 + Math.random() * 1.2; e.side = Math.random() < 0.5 ? 1 : -1; }
      var spd = half ? d.speedHalf : d.speed, mx = ux * 0.6 - uy * 0.8 * (e.side || 1), my = uy * 0.6 + ux * 0.8 * (e.side || 1);
      if (!e.status.para) {
        var bx = e.x, by = e.y;
        room.move(e, mx * spd * dt, my * spd * dt);
        if (Math.abs(e.x - bx) + Math.abs(e.y - by) < spd * dt * 0.3) { e.side = -(e.side || 1); room.move(e, ux * spd * dt, uy * spd * dt); }   // かべに当たったら反対へ
        e.walk = (e.walk || 0) + dt * 10;
      }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy }; e.hits = 0;
    }
  }
  function startSpin(e, room, p) {
    var d = e.def, ax = p.x - e.x, ay = p.y - e.y, al = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= al; ay /= al;
    e.aim = { x: ax, y: ay }; e.face = { x: ax, y: ay };
    e.chargeLen = Math.min(260, rayLength(room, e.x, e.y, ax, ay, e.r));
    e.chargeLine = { kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ax * e.chargeLen, y2: e.y + ay * e.chargeLen, w: e.r * 2 + 4, t: 0, warn: d.chargeWarn };
    hazards.push(e.chargeLine);
    e.state = "warn"; e.t = d.chargeWarn; e.shelled = true;
    Battle.pop(e.x, e.y - 40, "回転アタック！", "#ef5b5b", 9);
  }
  // からごもりのヨロイガニを打でたたいた（skills.js の hitEnemy から）。shellBreak 回でわれて、ひっくりかえる
  function crackShell(e) {
    if (!e.shelled || e.state !== "shell") return false;
    e.crack = (e.crack || 0) + 1;
    if (e.crack < e.def.shellBreak) { Battle.pop(e.x, e.y - 46, "ピシッ！ " + e.crack + "/" + e.def.shellBreak, "#ffe066", 8); return false; }
    e.shelled = false; e.crack = 0; e.cracked = e.def.crackTime;
    e.state = "tired"; e.t = e.def.crackTime; e.ai.shell = e.hp <= e.maxHp / 2 ? e.def.shellEveryHalf : e.def.shellEvery;
    shake(2, 0.25);
    for (var i = 0; i < 10; i++) { var a = Math.random() * Math.PI * 2; chips.push({ x: e.x, y: e.y - 6, z: 8, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30, vz: 60 + Math.random() * 40, t: 0, max: 0.8, c: i % 3 ? "#c84a3a" : "#c8f0ff", s: 2 }); }
    Battle.pop(e.x, e.y - 50, "からがわれた！", "#ffe066", 10);
    return true;
  }
  // からにこもっているあいだ・われたあとの、受けるダメージの倍率（打以外）
  function shellMult(e, elem) {
    if (e.shelled) return elem === "strike" ? 1 : e.def.shellCut;
    if (e.cracked > 0) return e.def.crackMult;
    return 1;
  }
  // ---------- 水晶の大グモ（水晶の鍾乳洞10階・主。段階4、2026-11-15）。天井へのぼって落ちてくる・糸で足止め・水晶の光線 ----------
  function spider(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.biteT = Math.max(0, (e.biteT || 0) - dt);
    if (e.state === "windup") {   // かみつき
      e.t -= dt;
      if (e.t > 0.12 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        if (!p.down && gap <= d.reach + 4) hurt(e, p.x, p.y - 8, { mult: d.biteMult, status: { type: "poison", chance: 0.3, dur: 6 } });
        e.biteT = 0.2; Sound.play("swing");
        e.state = "recover"; e.t = 0.45; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "web") {   // 糸はき
      e.t -= dt;
      if (e.t > 0.15 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var a0 = Math.atan2(e.aim.y, e.aim.x), n = half ? d.websHalf : d.webs;
        for (var k = 0; k < n; k++) api.addArrow(e, a0 + (k - (n - 1) / 2) * d.webSpread, d.webSpeed, { web: true, mult: d.webMult, rad: 3, dy: -6, life: 2.2, status: { type: "para", chance: 0.6, dur: 1.5 } });
        Sound.play("swing");
        e.state = "recover"; e.t = 0.45; e.ai.web = half ? d.webEveryHalf : d.webEvery;
      }
      return;
    }
    if (e.state === "beamWarn") {   // 水晶の光線：おしりの水晶に光をためる（赤い帯で予告）→ 撃つ（帯は hazards の beam）
      e.t -= dt;
      if (e.t <= 0) { e.state = "beam"; e.t = d.beamTime; shake(1, 0.2); Sound.play("hit"); }
      return;
    }
    if (e.state === "beam") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "climb") {   // 糸を出して、天井へのぼる
      e.t -= dt;
      e.lift = (1 - Math.max(0, e.t) / d.climbTime);
      if (e.t <= 0) {
        e.state = "ceil"; e.t = d.ceilTime + d.leapLock; e.untouchable = true;
        e.mark = { kind: "circle", look: "leap", from: e, x: p.x, y: p.y, r: d.dropR, t: 0, warn: e.t, erupt: 0.3, hit: false, opts: { mult: d.dropMult, big: true } };
        hazards.push(e.mark);
      }
      return;
    }
    if (e.state === "ceil") {   // 天井にいるあいだ（当たらない）：影がプレイヤーを追い、落ちる leapLock 秒前に止まる
      e.t -= dt;
      var m = e.mark;
      if (e.t > d.leapLock && !p.down) {
        var mx = p.x - m.x, my = p.y - m.y, ml = Math.sqrt(mx * mx + my * my), st = d.ceilFollow * dt;
        if (ml > st) { mx = mx / ml * st; my = my / ml * st; }
        if (!room.hitsWall(m.x + mx - e.r, m.y + my - e.r, e.r * 2, e.r * 2)) { m.x += mx; m.y += my; }
      }
      e.x = m.x; e.y = m.y;
      e.lift = e.t > d.leapLock ? 1 : Math.max(0, e.t / d.leapLock);
      if (e.t <= 0) {   // 落ちてくる：ずしん（ダメージは輪の hazards で）
        e.untouchable = false; e.lift = 0;
        shake(3, 0.3); Sound.play("hit");
        addWave(e.x, e.y + 8, 8, d.dropR + 10, 0.4, 6);
        for (var c = 0; c < 8; c++) { var ca = Math.random() * Math.PI * 2; chips.push({ x: e.x, y: e.y, z: 6, vx: Math.cos(ca) * 60, vy: Math.sin(ca) * 36, vz: 70 + Math.random() * 50, t: 0, max: 0.7, c: c % 2 ? "#7ad8f8" : "#e8fbff", s: 2 }); }
        e.ai.ceil = half ? d.ceilEveryHalf : d.ceilEvery;
        tire(e);
      }
      return;
    }
    if (e.state === "call") {   // 子グモを呼ぶ（おしりの水晶から、ぽろぽろ出てくる）
      e.t -= dt;
      if (e.t <= 0) {
        for (var q = 0; q < d.kids; q++) {
          var ang = q / d.kids * Math.PI * 2 + Math.random() * 0.5, sx = e.x + Math.cos(ang) * 30, sy = e.y + Math.sin(ang) * 24;
          if (room.hitsWall(sx - 5, sy - 5, 10, 10)) { sx = e.x; sy = e.y + 22; }
          var f = api.spawn("crystal_spiderling", sx, sy, 1);
          f.hp = f.maxHp = d.kidHp; f.patk = d.kidAtk;   // 呼ばれた敵は深さで強くならないので、ここで決める
          f.summoned = true;
        }
        e.state = "recover"; e.t = 0.5;
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (half && !e.called) {   // HP が半分：子グモを呼ぶ（1回だけ）
      e.called = true; e.state = "call"; e.t = 0.7;
      Battle.pop(e.x, e.y - 50, "子グモがあらわれた！", "#ffd24a", 9);
      return;
    }
    if (e.ai.ceil <= 0) {
      e.state = "climb"; e.t = d.climbTime; e.lift = 0;
      Battle.pop(e.x, e.y - 50, "天井へのぼった！", "#c8d0dc", 9);
      return;
    }
    if (e.ai.beam <= 0) {   // 水晶の光線：こちらへ向けて（HP 半分から扇に3本）。根もとはボスのまんなか
      var n2 = half ? d.beamsHalf : d.beams, b0 = Math.atan2(uy, ux);
      for (var bi = 0; bi < n2; bi++) {
        var ba = b0 + (bi - (n2 - 1) / 2) * d.beamSpread, bx = Math.cos(ba), by = Math.sin(ba);
        hazards.push({ kind: "beam", from: e, x: e.x, y: e.y - 6, ux: bx, uy: by, len: Math.min(d.beamLen, rayLength(room, e.x, e.y, bx, by, 2) + 8), w: d.beamW,
                       t: 0, warn: d.beamWarn, erupt: d.beamTime, hit: false, opts: { mult: d.beamMult, big: true } });
      }
      e.state = "beamWarn"; e.t = d.beamWarn; e.ai.beam = half ? d.beamEveryHalf : d.beamEvery;
      Battle.pop(e.x, e.y - 50, "水晶の光線！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.web <= 0 && gap > 30) {
      e.state = "web"; e.t = d.webWindup; e.aim = { x: ux, y: uy };
      return;
    }
    if (gap > d.reach - 2) {   // カサカサと、ななめにゆれながら近づく
      var spd = half ? d.speedHalf : d.speed, wig = Math.sin((e.walk || 0) * 0.35) * 0.5;
      if (!e.status.para) { room.move(e, (ux - uy * wig) * spd * dt, (uy + ux * wig) * spd * dt); e.walk = (e.walk || 0) + dt * 14; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // ---------- 大ダコ（しずみの湖底神殿6階・中ボス。段階3、2026-11-18）。足ばらい・足のたたきつけ・墨はき・床から足を出す（全部切るとひるむ） ----------
  function octo(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.sweepT = Math.max(0, (e.sweepT || 0) - dt);
    e.stun = Math.max(0, (e.stun || 0) - dt);
    // 床から出した足：全部切られたら、ひるむ。armLife 秒たったら、のこった足は引っこむ
    if (e.arms && e.arms.length) {
      e.armT -= dt;
      var left = e.arms.filter(function (a) { return !a.dead && a.hp > 0; });
      if (!left.length) {
        e.arms = [];
        e.stun = d.stunTime; e.state = "tired"; e.t = d.stunTime;
        removeHazards(e);
        shake(2, 0.3);
        Battle.pop(e.x, e.y - 56, "足を全部切った！ 大ダコがひるんだ！", "#ffe066", 10);
        return;
      }
      if (e.armT <= 0) {
        left.forEach(function (a) { a.dead = true; a.fade = 0.4; });
        e.arms = [];
        Battle.pop(e.x, e.y - 56, "足が引っこんだ", "#c8d0dc", 8);
      }
    }
    if (e.state === "windup") {   // 足ばらい（2回）
      e.t -= dt;
      if (e.t > 0.15 && !p.down && !e.hits) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        if (!p.down && gap <= d.reach + 4) hurt(e, p.x, p.y - 8, { mult: d.sweepMult });
        e.sweepT = 0.22; e.sweepFlip = !e.sweepFlip; Sound.play("swing");
        e.hits = (e.hits || 0) + 1;
        if (e.hits < 2) { e.t = d.sweepGap; return; }
        e.hits = 0; e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "slamWarn") {   // 足をふり上げて、ためる（赤い帯で予告）→ たたきつける（帯は hazards の beam。look: tentacle）
      e.t -= dt;
      if (e.t <= 0) { e.state = "slam"; e.t = d.slamTime; shake(2, 0.2); Sound.play("hit"); }
      return;
    }
    if (e.state === "slam") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "inkWarn") {   // 墨をためる（扇が光る）→ はく（扇は hazards の cone。look: ink）
      e.t -= dt;
      if (e.t <= 0) { e.state = "ink"; e.t = 0.5; }
      return;
    }
    if (e.state === "ink") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "arms") {   // 足を床にさしこむ → プレイヤーのまわりの床から、足が出てくる
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? d.armCountHalf : d.armCount, a0 = Math.random() * Math.PI * 2;
        e.arms = [];
        for (var q = 0; q < n; q++) {
          var ang = a0 + q / n * Math.PI * 2, rr = 34 + Math.random() * 16, sx = p.x + Math.cos(ang) * rr, sy = p.y + Math.sin(ang) * rr * 0.8, tries = 0;
          while (room.hitsWall(sx - 6, sy - 6, 12, 12) && tries < 6) { ang += 0.6; sx = p.x + Math.cos(ang) * rr; sy = p.y + Math.sin(ang) * rr * 0.8; tries++; }
          if (room.hitsWall(sx - 6, sy - 6, 12, 12)) continue;
          var f = api.spawn("octo_arm", sx, sy, 1);
          f.hp = f.maxHp = d.armHp; f.patk = d.armAtk;   // 呼ばれた敵は深さで強くならないので、ここで決める
          f.summoned = true; f.cd = 0.8 + q * 0.3;
          e.arms.push(f);
          for (var c2 = 0; c2 < 5; c2++) { var ca = Math.random() * Math.PI * 2; chips.push({ x: sx, y: sy, z: 2, vx: Math.cos(ca) * 40, vy: Math.sin(ca) * 24, vz: 50 + Math.random() * 40, t: 0, max: 0.6, c: c2 % 2 ? "#466068" : "#a8c4c0", s: 2 }); }
        }
        e.armT = d.armLife;
        shake(1, 0.2);
        e.state = "recover"; e.t = 0.6; e.ai.arm = half ? d.armEveryHalf : d.armEvery;
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (e.ai.arm <= 0 && !(e.arms && e.arms.length)) {
      e.state = "arms"; e.t = 0.8;
      Battle.pop(e.x, e.y - 56, "足を床にもぐらせた！", "#ffd24a", 9);
      return;
    }
    if (e.ai.slam <= 0) {   // 足のたたきつけ：こちらへ向けて（HP 半分から扇に3本）。根もとはボスのまんなか
      var n2 = half ? d.slamsHalf : d.slams, b0 = Math.atan2(uy, ux);
      for (var bi = 0; bi < n2; bi++) {
        var ba = b0 + (bi - (n2 - 1) / 2) * d.slamSpread, bx = Math.cos(ba), by = Math.sin(ba);
        hazards.push({ kind: "beam", look: "tentacle", from: e, x: e.x, y: e.y - 4, ux: bx, uy: by, len: Math.min(d.slamLen, rayLength(room, e.x, e.y, bx, by, 2) + 8), w: d.slamW,
                       t: 0, warn: d.slamWarn, erupt: d.slamTime, hit: false, seed: Math.random() * 100, opts: { mult: d.slamMult, big: true } });
      }
      e.state = "slamWarn"; e.t = d.slamWarn; e.ai.slam = half ? d.slamEveryHalf : d.slamEvery;
      Battle.pop(e.x, e.y - 56, "足のたたきつけ！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.ink <= 0 && dist < d.inkLen + 20) {
      hazards.push({ kind: "cone", look: "ink", from: e, x: e.x + ux * 12, y: e.y - 4 + uy * 8, ang: Math.atan2(uy, ux), spread: d.inkSpread, len: d.inkLen,
                     t: 0, warn: d.inkWarn, erupt: 0.5, hit: false, seed: Math.random() * 100, opts: { mult: d.inkMult, status: { type: "break", chance: 0.5, dur: 6 } } });
      e.state = "inkWarn"; e.t = d.inkWarn; e.ai.ink = half ? d.inkEveryHalf : d.inkEvery;
      Battle.pop(e.x, e.y - 56, "墨はき！", "#b48cf0", 9);
      return;
    }
    if (gap > d.reach - 2) {   // くねくねと、ゆっくり近づく
      var spd = half ? d.speedHalf : d.speed, wig = Math.sin((e.walk || 0) * 0.25) * 0.4;
      if (!e.status.para) { room.move(e, (ux - uy * wig) * spd * dt, (uy + ux * wig) * spd * dt); e.walk = (e.walk || 0) + dt * 8; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy }; e.hits = 0;
    }
  }
  // ---------- 炎の巨人（紅蓮の火山6階・中ボス。段階3、2026-11-20） ----------
  // こぶし・地ならし（まわりから火がふき出す）・溶岩の岩投げ（落ちたところが少しのあいだ溶岩だまり）・炎のよろい（たたいて消す。水は3回分）
  function giant(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.punchT = Math.max(0, (e.punchT || 0) - dt);
    e.stun = Math.max(0, (e.stun || 0) - dt);
    if (e.flame > 0) {   // 炎のよろい：近くにいると熱い。flameTime 秒で自分で消える
      e.flame -= dt;
      e.heatT = (e.heatT || 0) - dt;
      var hx = p.x - e.x, hy = p.y - e.y, hd = Math.sqrt(hx * hx + hy * hy);
      if (!p.down && e.heatT <= 0 && hd < e.r + p.r + d.heatR) { hurt(e, p.x, p.y - 8, { mult: d.heatMult }); e.heatT = d.heatTick; }
      if (e.flame <= 0) {
        e.flame = 0; e.ai.flame = half ? d.flameEveryHalf : d.flameEvery;
        Battle.pop(e.x, e.y - 60, "炎がおさまった", "#c8d0dc", 8);
      }
    }
    if (e.state === "windup") {   // こぶし
      e.t -= dt;
      if (e.t > 0.15 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        var px = p.x - e.x, py = p.y - e.y, pd = Math.sqrt(px * px + py * py) || 1;
        if (!p.down && pd - e.r - p.r <= d.reach + 4 && (px * e.aim.x + py * e.aim.y) / pd > 0.2) hurt(e, p.x, p.y - 8, { mult: d.punchMult });
        e.punchT = 0.22; e.punchFlip = !e.punchFlip; Sound.play("swing"); shake(1, 0.1);
        e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "stompWarn") {   // 両うでを上げて、ためる（まわりに赤い輪）→ 地面をたたく
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "stomp"; e.t = 0.5; shake(3, 0.3); Sound.play("hit");
        addWave(e.x, e.y + 8, 6, d.stompR, 0.4, 6);
      }
      return;
    }
    if (e.state === "stomp") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "lift") {   // 溶岩の岩を頭の上に持ち上げる → 投げる
      e.t -= dt;
      if (e.t <= 0) {
        var n = half ? d.ballsHalf : d.balls, sx = e.x, sy = e.y - 52;
        for (var k = 0; k < n; k++) {
          var tx = p.x, ty = p.y, tries = 0;
          if (k > 0) do { var a = Math.random() * Math.PI * 2, rr = 26 + Math.random() * 44; tx = p.x + Math.cos(a) * rr; ty = p.y + Math.sin(a) * rr * 0.8; tries++; }
                       while (room.hitsWall(tx - 6, ty - 6, 12, 12) && tries < 8);
          if (room.hitsWall(tx - 6, ty - 6, 12, 12)) continue;
          hazards.push({ kind: "circle", look: "magma", from: e, x: tx, y: ty, sx: sx, sy: sy, r: d.ballR, t: 0, warn: d.ballWarn + k * 0.15, erupt: 0.4, hit: false,
                         seed: Math.random() * 100, opts: { mult: d.ballMult, big: true } });
        }
        Sound.play("swing");
        e.state = "throw"; e.t = 0.4; e.ai.ball = half ? d.ballEveryHalf : d.ballEvery;
      }
      return;
    }
    if (e.state === "throw") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.5; } return; }
    if (e.state === "ignite") {   // ほえて、体の炎が燃え上がる
      e.t -= dt;
      if (e.t <= 0) {
        e.flame = d.flameTime; e.flameHit = 0; e.heatT = 0.6;
        shake(2, 0.3);
        Battle.pop(e.x, e.y - 60, "炎のよろい！ たたいて消そう", "#ffb84a", 9);
        e.state = "recover"; e.t = 0.4;
      }
      return;
    }
    if (e.state === "tired") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (e.ai.flame <= 0 && !(e.flame > 0)) {
      e.state = "ignite"; e.t = 0.8; e.ai.flame = 99;
      Battle.pop(e.x, e.y - 60, "グオオオ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.stomp <= 0 && gap < d.stompR - 12) {
      hazards.push({ kind: "circle", look: "flamering", from: e, x: e.x, y: e.y + 6, r: d.stompR, t: 0, warn: d.stompWarn, erupt: 0.5, hit: false,
                     seed: Math.random() * 100, opts: { mult: d.stompMult, big: true } });
      e.state = "stompWarn"; e.t = d.stompWarn; e.ai.stomp = half ? d.stompEveryHalf : d.stompEvery;
      Battle.pop(e.x, e.y - 60, "地ならし！", "#ef5b5b", 9);
      return;
    }
    if (e.ai.ball <= 0) {
      e.state = "lift"; e.t = d.ballLift;
      Battle.pop(e.x, e.y - 60, "溶岩の岩投げ！", "#ffb84a", 9);
      return;
    }
    if (gap > d.reach - 2) {   // のっしのっしと近づく
      var spd = half ? d.speedHalf : d.speed;
      if (!e.status.para) {
        var ow = Math.floor((e.walk || 0) / Math.PI);
        room.move(e, ux * spd * dt, uy * spd * dt); e.walk = (e.walk || 0) + dt * 6;
        if (Math.floor(e.walk / Math.PI) !== ow) { shake(1, 0.06); addDust(e.x + (ow % 2 ? 8 : -8), e.y + 12); }   // 一歩ごとに、ずしん
      }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // 炎の巨人に攻撃が当たった（skills.js の hitEnemy から）。炎のよろいのあいだは数を数えて、flameHits 回で消える（水は3回分）
  function douse(e, elem) {
    if (!(e.flame > 0)) return;
    var d = e.def;
    e.flameHit = (e.flameHit || 0) + (elem === "water" ? 3 : 1);
    for (var i = 0; i < 3; i++) { var a = Math.random() * Math.PI * 2; chips.push({ x: e.x, y: e.y - 10, z: 14, vx: Math.cos(a) * 30, vy: Math.sin(a) * 18, vz: 50, t: 0, max: 0.5, c: elem === "water" ? "#e8f8ff" : "#ffb030", s: 2 }); }
    if (e.flameHit < d.flameHits) {
      if (!(e.dousePop > Date.now()) || elem === "water") { e.dousePop = Date.now() + 500; Battle.pop(e.x, e.y - 56, (elem === "water" ? "ジュワッ！ " : "ジュッ ") + Math.min(e.flameHit, d.flameHits) + "/" + d.flameHits, elem === "water" ? "#9fd8ff" : "#ffd24a", 8); }
      return;
    }
    e.flame = 0; e.flameHit = 0; e.stun = d.stunTime;
    if (e.state === "stompWarn" || e.state === "lift") interrupt(e);
    e.state = "tired"; e.t = d.stunTime; e.ai.flame = e.hp <= e.maxHp / 2 ? d.flameEveryHalf : d.flameEvery;
    shake(2, 0.3);
    for (var j = 0; j < 12; j++) { var b = Math.random() * Math.PI * 2; chips.push({ x: e.x, y: e.y - 16, z: 20, vx: Math.cos(b) * 40, vy: Math.sin(b) * 24, vz: 60 + Math.random() * 50, t: 0, max: 0.9, c: j % 2 ? "#e8f0f4" : "#a8b0b8", s: 2 }); }
    Battle.pop(e.x, e.y - 60, "炎が消えた！ 巨人がふらついた！", "#ffe066", 10);
  }
  // 受けるダメージの倍率：炎のよろいのあいだは flameCut（水はそのまま）、ふらついているあいだは stunMult
  function giantMult(e, elem) {
    if (e.flame > 0) return elem === "water" ? 1 : e.def.flameCut;
    if (e.stun > 0) return e.def.stunMult;
    return 1;
  }
  // ---------- 紅蓮の竜（紅蓮の火山12階・主。段階4、2026-11-20） ----------
  // かみつき・炎の息（扇）・噴火（溶岩の岩がふる）・空からの突進（線の先の岩の柱にぶつかると目を回す）
  function fdragon(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.biteT = Math.max(0, (e.biteT || 0) - dt);
    e.crash = Math.max(0, (e.crash || 0) - dt);
    if (e.state === "windup") {   // かみつき
      e.t -= dt;
      if (e.t > 0.12 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        if (!p.down && gap <= d.reach + 4) hurt(e, p.x, p.y - 8, { mult: d.biteMult });
        e.biteT = 0.2; Sound.play("swing");
        e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "fbreathWarn") { e.t -= dt; if (e.t <= 0) { e.state = "fbreath"; e.t = 0.5; Sound.play("hit"); } return; }
    if (e.state === "fbreath") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "roar") {   // ほえる → 火口から溶岩の岩がふってくる
      e.t -= dt;
      if (e.t <= 0) {
        if (!e.lava) {   // 溶岩のマス（岩が飛び出すところ）
          e.lava = [];
          for (var ty = 0; ty * TILE < room.pxH; ty++) for (var tx = 0; tx * TILE < room.pxW; tx++) if (room.tile(tx, ty) === "~") e.lava.push({ x: tx * TILE + 8, y: ty * TILE + 8 });
        }
        var n = half ? d.eruptsHalf : d.erupts;
        for (var k = 0; k < n; k++) {
          var tx2 = p.x, ty2 = p.y, tries = 0;
          if (k > 0) do { var a = Math.random() * Math.PI * 2, rr = 24 + Math.random() * 90; tx2 = p.x + Math.cos(a) * rr; ty2 = p.y + Math.sin(a) * rr * 0.8; tries++; }
                       while (room.hitsWall(tx2 - 6, ty2 - 6, 12, 12) && tries < 8);
          if (room.hitsWall(tx2 - 6, ty2 - 6, 12, 12)) continue;
          var src = e.lava.length ? e.lava[Math.floor(Math.random() * e.lava.length)] : { x: e.x, y: e.y };
          hazards.push({ kind: "circle", look: "magma", from: e, x: tx2, y: ty2, sx: src.x, sy: src.y, r: d.ballR, t: 0, warn: d.eruptWarn + k * 0.12, erupt: 0.4, hit: false,
                         seed: Math.random() * 100, opts: { mult: d.eruptMult, big: true } });
        }
        shake(2, 0.4);
        e.state = "recover"; e.t = 0.6; e.ai.erupt = half ? d.eruptEveryHalf : d.eruptEvery;
      }
      return;
    }
    if (e.state === "soar") {   // 空へ舞い上がる（攻撃が当たらない）
      e.t -= dt;
      e.alt = Math.min(34, (e.alt || 0) + dt * 60);
      if (e.t <= 0) aimDive(e, room, p);
      return;
    }
    if (e.state === "dvwarn") {   // 突進の予告：赤い線。走り出す 0.4 秒前までは、プレイヤーのほうへ向きを合わせ直す
      e.t -= dt;
      if (e.t > 0.4 && !p.down) setDiveLine(e, room, p.x - e.x, p.y - e.y);
      if (e.t <= 0) { e.state = "dvdash"; e.travel = 0; e.hitDone = false; e.untouchable = false; Sound.play("swing"); }
      return;
    }
    if (e.state === "dvdash") {   // 線の先へ、まっすぐ突っこむ（溶岩の上も飛ぶ）
      var step = d.diveSpeed * dt, bx = e.x, by = e.y;
      e.alt = Math.max(8, (e.alt || 0) - dt * 120);
      e.fly = true; room.move(e, e.aim.x * step, e.aim.y * step); e.fly = false;
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step;
      var px = p.x - e.x, py = p.y - e.y;
      if (!e.hitDone && !p.down && px * px + py * py < (e.r + p.r + 3) * (e.r + p.r + 3)) { e.hitDone = true; hurt(e, p.x, p.y - 8, { mult: d.diveMult, big: true }); }
      if (moved < step * 0.4 || e.travel >= e.diveLen) {
        var hx = e.x + e.aim.x * (e.r + 6), hy = e.y + e.aim.y * (e.r + 6);
        var pillar = room.tile(Math.floor(hx / TILE), Math.floor(hy / TILE)) === "I" || e.diveHit === "I";
        landDragon(e, room);
        if (pillar) {   // 柱にぶつかった：目を回す（すきあり）
          e.crash = d.crashTime; e.state = "tired"; e.t = d.crashTime; e.divesLeft = 0;
          shake(3, 0.4);
          addWave(hx, hy + 6, 4, 26, 0.4, 5);
          for (var c = 0; c < 12; c++) { var ca = Math.random() * Math.PI * 2; chips.push({ x: hx, y: hy, z: 12, vx: Math.cos(ca) * 50, vy: Math.sin(ca) * 30, vz: 60 + Math.random() * 50, t: 0, max: 0.8, c: c % 2 ? "#4a3a36" : "#8a7468", s: 2 }); }
          Battle.pop(e.x, e.y - 56, "柱にぶつかった！ 竜が目を回している！", "#ffe066", 10);
        } else {
          shake(2, 0.2); addWave(e.x, e.y + 8, 6, 30, 0.4, 3);
          e.divesLeft = (e.divesLeft || 1) - 1;
          if (e.divesLeft > 0 && !p.down) { e.state = "soar"; e.t = 0.5; e.untouchable = true; e.alt = 10; }
          else { e.state = "recover"; e.t = d.landTime; }
        }
      }
      return;
    }
    if (e.state === "tired" || e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (e.ai.soar <= 0) {
      e.state = "soar"; e.t = d.soarTime; e.untouchable = true; e.alt = 0;
      e.divesLeft = half ? d.divesHalf : d.dives;
      e.ai.soar = half ? d.soarEveryHalf : d.soarEvery;
      e.ai.fbreath = Math.max(e.ai.fbreath, 3); e.ai.erupt = Math.max(e.ai.erupt, 4);
      Battle.pop(e.x, e.y - 56, "紅蓮の竜が空へ舞い上がった！", "#ffd24a", 9);
      return;
    }
    if (e.ai.erupt <= 0) {
      e.state = "roar"; e.t = 0.8;
      Battle.pop(e.x, e.y - 56, "ガアアア！ 火口が噴火した！", "#ffb84a", 9);
      return;
    }
    if (e.ai.fbreath <= 0 && dist < d.fbreathLen + 20) {
      hazards.push({ kind: "cone", look: "fire", from: e, x: e.x + ux * 12, y: e.y - 6 + uy * 8, ang: Math.atan2(uy, ux), spread: half ? d.fbreathSpreadHalf : d.fbreathSpread, len: d.fbreathLen,
                     t: 0, warn: d.fbreathWarn, erupt: 0.5, hit: false, seed: Math.random() * 100, opts: { mult: d.fbreathMult, big: true } });
      e.state = "fbreathWarn"; e.t = d.fbreathWarn; e.ai.fbreath = half ? d.fbreathEveryHalf : d.fbreathEvery;
      Battle.pop(e.x, e.y - 56, "炎の息！", "#ef5b5b", 9);
      return;
    }
    if (gap > d.reach - 2) {
      var spd = half ? d.speedHalf : d.speed;
      if (!e.status.para) { room.move(e, ux * spd * dt, uy * spd * dt); e.walk = (e.walk || 0) + dt * 7; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // ---------- ケルベロス（幻獣の祠。2026-11-22 Claude の案） ----------
  // 三連がみ・大突進（大オオカミと同じ）・三つ首の炎（3本の扇。すきまでよける。HP 半分から、すきまをうめる2回目）・
  // 地獄の炎（床のあちこちが組ごとに順に光って火柱。光っていない場所へ。終わるとつかれて、すきあり）
  function cerberus(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.biteT = Math.max(0, (e.biteT || 0) - dt);
    if (e.state === "bite") {   // 三連がみ：biteGap 秒ごとに1回ずつ
      e.t -= dt;
      if (e.t <= 0) {
        if (!p.down && gap <= d.reach + 6) hurt(e, p.x, p.y - 8, { mult: d.biteMult });
        e.biteT = 0.15; Sound.play("swing");
        e.bitesLeft--;
        if (e.bitesLeft > 0) { e.t = d.biteGap; if (!p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; } }
        else { e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown; }
      }
      return;
    }
    if (e.state === "windup") { e.t -= dt; if (e.t <= 0) { e.state = "bite"; e.t = 0; e.bitesLeft = d.bites; } return; }
    if (wolfCharge(e, dt, room, p, hurt)) return;
    if (e.state === "tbreathWarn") {
      e.t -= dt;
      if (e.t <= 0) {
        triFire(e, api, e.breathAng, half);
        if (e.secondBreath) {   // HP 半分から：0.55秒あとに、すきまをねらう2回目
          e.secondBreath = false; e.breathAng += d.tbreathGap / 2;
          e.state = "tbreathWarn"; e.t = 0.55;
        } else { e.state = "tbreath"; e.t = 0.5; }
      }
      return;
    }
    if (e.state === "tbreath") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "hellHowl") {   // 地獄の炎：ほえているあいだに、床の組ごとに予告が出る
      e.t -= dt;
      if (e.t <= 0) { e.state = "hell"; e.t = (half ? d.hellSetsHalf : d.hellSets) * d.hellStep + d.hellWarn - d.hellStep + 0.6; }
      return;
    }
    if (e.state === "hell") { e.t -= dt; if (e.t <= 0) tire(e); return; }
    if (e.state === "tired" || e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (e.ai.hell <= 0) {
      startHellFire(e, room, p, half);
      e.state = "hellHowl"; e.t = d.hellHowl; e.ai.hell = half ? d.hellEveryHalf : d.hellEvery;
      e.ai.tbreath = Math.max(e.ai.tbreath, 3); e.ai.charge = Math.max(e.ai.charge, 4);
      Battle.pop(e.x, e.y - 60, "ウォォォン！ 地獄の炎！ 光っていない床へ！", "#ff8a4a", 10);
      return;
    }
    if (e.ai.charge <= 0) { startCharge(e, room, ux, uy); e.ai.tbreath = Math.max(e.ai.tbreath, 2); return; }
    if (e.ai.tbreath <= 0) {
      e.breathAng = Math.atan2(uy, ux);
      e.secondBreath = half;
      e.state = "tbreathWarn"; e.t = d.tbreathWarn; e.ai.tbreath = half ? d.tbreathEveryHalf : d.tbreathEvery;
      Battle.pop(e.x, e.y - 60, "三つ首の火球！ すきまへ！", "#ef5b5b", 9);
      return;
    }
    if (gap > d.reach - 2) {
      var spd = half ? d.speedHalf : d.speed;
      if (!e.status.para) { room.move(e, ux * spd * dt, uy * spd * dt); e.walk = (e.walk || 0) + dt * 8; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // 三つ首の炎：3方向に特大の火球を1発ずつ（まんなかが ang。あいだは tbreathGap。大きさと速さはゴーレムの岩石投げくらい。2026-11-22 保護者）
  function triFire(e, api, ang, half) {
    var d = e.def;
    for (var i = -1; i <= 1; i++) api.addArrow(e, ang + i * d.tbreathGap, half ? d.fireSpeedHalf : d.fireSpeed, { bigFire: true, big: true, mult: d.tbreathMult, rad: d.fireR, dy: -10, life: 3 });
    Sound.play("skill");
  }
  // 地獄の炎：部屋の床に、ななめの格子で火柱の場所を置き、組（k）ごとに順に立つ（組のあいだは hellStep 秒）。
  // 同じ組の場所どうしは、はなれていて、そのあいだは安全
  function startHellFire(e, room, p, half) {
    var d = e.def, sets = half ? d.hellSetsHalf : d.hellSets, step = d.hellR * 2;
    var shift = Math.floor(Math.random() * sets);
    for (var gy = 0, y = 40; y < room.pxH - 24; y += step, gy++) {
      for (var gx = 0, x = 40 + (gy % 2) * (step / 2); x < room.pxW - 24; x += step, gx++) {
        if (room.hitsWall(x - 6, y - 6, 12, 12)) continue;
        var k = (gx + gy + shift) % sets;
        hazards.push({ kind: "circle", look: "hellfire", from: e, x: x, y: y, r: d.hellR * 0.82, t: 0, warn: d.hellWarn + k * d.hellStep, show: k * d.hellStep, erupt: 0.45, hit: false,
                       seed: Math.random() * 100, opts: { mult: d.hellMult, big: true } });
      }
    }
  }
  // 突進の線を (ax, ay) の向きに引く。溶岩の上は通りぬけ、岩の柱か壁で止まる（diveHit に止まったマス）
  function setDiveLine(e, room, ax, ay) {
    var al = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= al; ay /= al;
    e.aim = { x: ax, y: ay }; e.face = { x: ax, y: ay };
    room._fly = true;
    var len = Math.min(330, rayLength(room, e.x, e.y, ax, ay, e.r - 4));
    room._fly = false;
    var ex = e.x + ax * (len + e.r + 2), ey = e.y + ay * (len + e.r + 2);
    e.diveHit = room.tile(Math.floor(ex / TILE), Math.floor(ey / TILE));
    e.diveLen = len + 4;
    if (!e.chargeLine) { e.chargeLine = { kind: "line", from: e, w: e.r * 2 + 4, t: 0, warn: e.def.diveWarn }; hazards.push(e.chargeLine); }
    e.chargeLine.x1 = e.x; e.chargeLine.y1 = e.y; e.chargeLine.x2 = e.x + ax * len; e.chargeLine.y2 = e.y + ay * len;
  }
  function aimDive(e, room, p) {
    e.chargeLine = null;
    setDiveLine(e, room, p.x - e.x, p.y - e.y);
    e.state = "dvwarn"; e.t = e.def.diveWarn;
    Battle.pop(e.x, e.y - 60, "突進の構え！ 柱の前でよけよう", "#ef5b5b", 9);
  }
  // 地面に下りる（溶岩の上なら、来た向きへもどって岩の上に下りる）
  function landDragon(e, room) {
    e.alt = 0; e.untouchable = false; e.fly = false;
    removeLines(e); e.chargeLine = null;
    if (room && e.aim) {
      for (var i = 0; i < 40 && room.hitsWall(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); i++) { e.x -= e.aim.x * 8; e.y -= e.aim.y * 8; }
      room.keepInside(e);
    }
  }
  // 受けるダメージの倍率：柱にぶつかって目を回しているあいだ
  function fdragonMult(e) { return e.crash > 0 ? e.def.crashMult : 1; }
  // ---------- 水竜（しずみの湖底神殿12階・主。段階4、2026-11-19） ----------
  // かみつき・水のブレス（HP 半分から、なぎはらい）・大波（水にもぐって、反対がわの水路から部屋いっぱいの波。柱のかげでよける）
  function wdragon(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.biteT = Math.max(0, (e.biteT || 0) - dt);
    e.splash = Math.max(0, (e.splash || 0) - dt);
    if (e.state === "windup") {   // かみつき
      e.t -= dt;
      if (e.t > 0.12 && !p.down) { e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy }; }
      if (e.t <= 0) {
        if (!p.down && gap <= d.reach + 4) hurt(e, p.x, p.y - 8, { mult: d.biteMult });
        e.biteT = 0.2; Sound.play("swing");
        e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "jetWarn") { e.t -= dt; if (e.t <= 0) { e.state = "jet"; e.t = d.jetTime + 0.1; Sound.play("hit"); } return; }
    if (e.state === "jet") { e.t -= dt; if (e.t <= 0) { e.state = "recover"; e.t = 0.6; } return; }
    if (e.state === "sink") {   // 水にもぐる → 大波を起こす
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "under"; e.wave = startWave(e, room, p);
        Battle.pop(p.x, p.y - 30, "大波が来る！ 柱のかげにかくれろ！", "#7ad8f8", 10);
      }
      return;
    }
    if (e.state === "under") {   // 波が通りすぎるまで、水の中
      if (hazards.indexOf(e.wave) < 0) {
        e.state = "rise"; e.t = d.riseWarn;
        hazards.push({ kind: "circle", look: "leap", from: e, x: e.x, y: e.y, r: d.riseR, t: 0, warn: d.riseWarn, erupt: 0.3, hit: false, opts: { mult: d.riseMult, big: true } });
      }
      return;
    }
    if (e.state === "rise") {   // もぐった場所から飛び出す
      e.t -= dt;
      if (e.t <= 0) {
        e.untouchable = false; e.splash = 0.6; shake(2, 0.25);
        addWave(e.x, e.y + 8, 30, 8, 0.5, 0);
        e.state = "tired"; e.t = d.tiredTime;
        Battle.pop(e.x, e.y - 56, "水竜がつかれている！ いまだ！", "#ffe066", 10);
      }
      return;
    }
    if (e.state === "tired" || e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    e.face = { x: ux, y: uy };
    if (e.ai.wave <= 0) {
      e.state = "sink"; e.t = d.waveSink; e.untouchable = true; e.splash = d.waveSink;
      e.ai.wave = half ? d.waveEveryHalf : d.waveEvery;
      e.ai.jet = Math.max(e.ai.jet, 3);
      Battle.pop(e.x, e.y - 56, "水竜が水にもぐった！", "#ffd24a", 9);
      return;
    }
    if (e.ai.jet <= 0 && dist < d.jetLen) {   // 水のブレス：ふつうは1本。HP 半分からは、なぎはらい（帯が順に出る）
      var n = half ? d.jetsHalf : d.jets, a0 = Math.atan2(uy, ux), sweep = Math.random() < 0.5 ? 1 : -1;
      for (var i = 0; i < n; i++) {
        var ba = a0 + (i - (n - 1) / 2) * d.jetSpread * sweep, bx = Math.cos(ba), by = Math.sin(ba);
        hazards.push({ kind: "beam", look: "torrent", from: e, x: e.x + bx * 8, y: e.y - 8, ux: bx, uy: by, len: Math.min(d.jetLen, rayLength(room, e.x, e.y, bx, by, 2) + 8), w: d.jetW,
                       t: 0, warn: d.jetWarn + i * d.jetGap, erupt: d.jetTime, hit: false, seed: Math.random() * 100, opts: { mult: d.jetMult, big: true } });
      }
      e.state = "jetWarn"; e.t = d.jetWarn + (n - 1) * d.jetGap; e.ai.jet = half ? d.jetEveryHalf : d.jetEvery;
      Battle.pop(e.x, e.y - 56, n > 1 ? "水のブレス（なぎはらい）！" : "水のブレス！", "#ef5b5b", 9);
      return;
    }
    if (gap > d.reach - 2) {
      var spd = half ? d.speedHalf : d.speed;
      if (!e.status.para) { room.move(e, ux * spd * dt, uy * spd * dt); e.walk = (e.walk || 0) + dt * 7; }
    } else if (e.cd <= 0) {
      e.state = "windup"; e.t = half ? d.windupHalf : d.windup; e.aim = { x: ux, y: uy };
    }
  }
  // 大波：プレイヤーから遠いほうの水路（部屋の上か下）から、部屋のはばいっぱいの波が反対がわへ進む
  function startWave(e, room, p) {
    var d = e.def, T = room.pxH / room.h, mid = Math.floor(room.h / 2), cx = Math.floor(room.w / 2);
    var topEdge = 1, botEdge = room.h - 2;
    for (var ty = 1; ty < mid; ty++) if (room.tile(cx, ty) === "~") topEdge = ty + 1;
    for (var ty2 = room.h - 2; ty2 > mid; ty2--) if (room.tile(cx, ty2) === "~") botEdge = ty2 - 1;
    var fromTop = p.y > room.pxH / 2;
    var h = { kind: "tsunami", from: e, dir: fromTop ? 1 : -1, y0: fromTop ? topEdge * T : (botEdge + 1) * T, y1: fromTop ? (botEdge + 1) * T : topEdge * T,
              w: room.pxW, tile: T, t: 0, warn: d.waveWarn, speed: d.waveSpeed, hit: false, done: false, fade: 0, seed: Math.random() * 100,
              shades: [], opts: { mult: d.waveMult, big: true } };
    // 柱のかげ（波が来る向きの反対がわ waveShade マス）。予告で光らせる
    for (var y = 0; y < room.h; y++) for (var x = 0; x < room.w; x++) {
      if (room.tile(x, y) !== "I") continue;
      var pc = (y + 0.5) * T;
      if ((pc - h.y0) * h.dir <= 0 || (h.y1 - pc) * h.dir <= 0) continue;   // 波が通らない柱（水路の向こう）は光らせない
      var sy = y + h.dir, ey = y + h.dir * d.waveShade;
      h.shades.push({ x: x * T, y: Math.min(sy, ey) * T, h: d.waveShade * T });
    }
    hazards.push(h);
    shake(1, d.waveWarn);
    return h;
  }
  // 柱のかげにいるか：プレイヤーの足もとから、波が来る向きに waveShade マス以内に柱がある
  function inShade(h, p, room, n) {
    var T = h.tile, xs = [p.x - 3, p.x, p.x + 3];
    for (var i = 0; i < xs.length; i++) {
      var tx = Math.floor(xs[i] / T), ty = Math.floor(p.y / T);
      for (var k = 1; k <= n; k++) if (room.tile(tx, ty - h.dir * k) === "I") return true;
    }
    return false;
  }
  function updateWave(h, dt, p, hurt, room) {
    if (h.t < h.warn) return false;
    var front = h.y0 + h.dir * h.speed * (h.t - h.warn);
    h.front = front;
    if (!h.hit && !p.down && (front - p.y) * h.dir >= 0 && (p.y - h.y0) * h.dir > 0) {
      h.hit = true;
      if (inShade(h, p, room, h.from.def.waveShade)) Battle.pop(p.x, p.y - 30, "柱のかげで、よけた！", "#7ad8f8", 9);
      else if (!h.from.dead) {
        hurt(h.from, p.x, p.y - 8, h.opts);
        room.move(p, 0, h.dir * 18);   // 波におされる
      }
    }
    if ((front - h.y1) * h.dir >= 0) { h.fade += dt; if (h.fade >= 0.4) return true; }
    return false;
  }
  // 水竜の水のブレス：予告は赤い帯。本番は、太い水の流れ（白いしぶき）
  function drawTorrent(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y, x2 = x + h.ux * h.len, y2 = y + h.uy * h.len;
    ctx.save(); ctx.lineCap = "round";
    if (h.t < h.warn) {
      var k = Math.max(0, (h.t - (h.warn - 0.9)) / 0.9);
      ctx.strokeStyle = "rgba(239,91,91," + (0.1 + 0.25 * k + 0.05 * Math.sin(glow * 18)).toFixed(2) + ")"; ctx.lineWidth = h.w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,120,110," + (0.3 + 0.6 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, al = q < 0.7 ? 1 : Math.max(0, (1 - q) / 0.3), reach = Math.min(1, q * 3);
    var ex = x + h.ux * h.len * reach, ey = y + h.uy * h.len * reach;
    ctx.strokeStyle = "rgba(34,96,154," + (0.7 * al).toFixed(2) + ")"; ctx.lineWidth = h.w + 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = "rgba(90,169,255," + (0.9 * al).toFixed(2) + ")"; ctx.lineWidth = h.w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = "rgba(200,236,255," + (0.9 * al).toFixed(2) + ")"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    var nx = -h.uy, ny = h.ux;
    for (var i = 0; i < 14; i++) {   // しぶき
      var u = rnd(h.seed + i * 1.7 + Math.floor(glow * 24)) * reach, side = (rnd(h.seed + i * 2.3 + Math.floor(glow * 24)) - 0.5) * (h.w + 8);
      Render.rect(Math.round(x + h.ux * h.len * u + nx * side), Math.round(y + h.uy * h.len * u + ny * side), 2, 2, "rgba(255,255,255," + (0.85 * al).toFixed(2) + ")");
    }
    for (var j = 0; j < 8; j++) {   // 先の水しぶき
      var a = j / 8 * Math.PI * 2 + glow * 3, r = 4 + rnd(h.seed + j) * 8;
      Render.rect(Math.round(ex + Math.cos(a) * r), Math.round(ey + Math.sin(a) * r * 0.6), 2, 2, "rgba(220,244,255," + (0.8 * al).toFixed(2) + ")");
    }
    ctx.restore();
  }
  // 大波：予告は、波が来る水路のふちが白く光り、部屋のはばいっぱいに赤い線。柱のかげが青く光る。本番は、白い波がしらの水のかべ
  function drawTsunami(ctx, h, cam, glow) {
    var x0 = -cam.x, W = h.w;
    var fadeAll = 1 - Math.min(1, h.fade / 0.4);
    // 柱のかげ（波がとおりすぎるまで光る）
    if (!h.hit || h.t < h.warn + 0.4) {
      var ka = h.t < h.warn ? 0.25 + 0.2 * Math.sin(glow * 10) : 0.3;
      h.shades.forEach(function (s) {
        Render.rect(Math.round(s.x - cam.x) + 1, Math.round(s.y - cam.y), h.tile - 2, s.h, "rgba(122,216,248," + (ka * fadeAll).toFixed(2) + ")");
        ctx.strokeStyle = "rgba(200,244,255," + (0.6 * fadeAll).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(s.x - cam.x) + 1.5, Math.round(s.y - cam.y) + 0.5, h.tile - 3, s.h - 1);
      });
    }
    var y0 = h.y0 - cam.y;
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.fillStyle = "rgba(239,91,91," + (0.12 + 0.2 * k + 0.06 * Math.sin(glow * 16)).toFixed(2) + ")";
      var bandH = 10 + 14 * k;
      ctx.fillRect(x0, h.dir > 0 ? y0 : y0 - bandH, W, bandH);
      for (var i = 0; i < 40; i++) {   // 水路のふちのあわ
        var bx = x0 + rnd(h.seed + i) * W, by = y0 - h.dir * (2 + rnd(h.seed + i * 2.1 + Math.floor(glow * 10)) * 6 * k);
        Render.rect(Math.round(bx), Math.round(by), 2, 2, "rgba(255,255,255," + (0.4 + 0.5 * k).toFixed(2) + ")");
      }
      return;
    }
    var f = (h.front === undefined ? h.y0 : h.front) - cam.y, top = Math.min(y0, f), bot = Math.max(y0, f), depth = 46;
    // 水のかべ：前のほうがこく、うしろはうすい
    var tail = h.dir > 0 ? Math.max(top, f - depth) : Math.min(bot, f + depth);
    ctx.fillStyle = "rgba(58,138,200," + (0.25 * fadeAll).toFixed(2) + ")";
    ctx.fillRect(x0, top, W, bot - top);
    ctx.fillStyle = "rgba(34,96,154," + (0.6 * fadeAll).toFixed(2) + ")";
    ctx.fillRect(x0, Math.min(tail, f), W, Math.abs(f - tail));
    ctx.fillStyle = "rgba(90,169,255," + (0.7 * fadeAll).toFixed(2) + ")";
    ctx.fillRect(x0, h.dir > 0 ? f - 10 : f, W, 10);
    for (var c = 0; c < W; c += 4) {   // 白い波がしら（くねくね）
      var wy = f + Math.sin(c * 0.09 + glow * 9) * 3 - h.dir * 4;
      Render.rect(Math.round(x0 + c), Math.round(wy), 4, 3, "rgba(255,255,255," + (0.9 * fadeAll).toFixed(2) + ")");
      if (rnd(c + Math.floor(glow * 14)) > 0.7) Render.rect(Math.round(x0 + c + 1), Math.round(wy + h.dir * (4 + rnd(c * 3.3) * 8)), 2, 2, "rgba(220,244,255," + (0.8 * fadeAll).toFixed(2) + ")");
    }
  }
  // 大ダコがひるんでいるあいだの、受けるダメージの倍率（skills.js の hitEnemy から）
  function octoMult(e) { return e.stun > 0 ? e.def.stunMult : 1; }
  function removeHazards(e) { for (var i = hazards.length - 1; i >= 0; i--) if (hazards[i].from === e) hazards.splice(i, 1); }
  // 光線が (px, py) に当たるか：線からのきょりが、太さの半分＋r より近い
  function beamTouches(h, px, py, r) {
    var dx = px - h.x, dy = py - h.y, along = dx * h.ux + dy * h.uy;
    if (along < -r || along > h.len + r) return false;
    var side = Math.abs(dx * h.uy - dy * h.ux);
    return side < h.w / 2 + r;
  }
  // 水晶の光線の絵：予告は赤い帯（だんだん濃く）、本番は水色の太い光と白いしん
  function drawBeam(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y, x2 = x + h.ux * h.len, y2 = y + h.uy * h.len;
    ctx.save(); ctx.lineCap = "round";
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.strokeStyle = "rgba(239,91,91," + (0.12 + 0.25 * k + 0.05 * Math.sin(glow * 18)).toFixed(2) + ")"; ctx.lineWidth = h.w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,120,110," + (0.4 + 0.5 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    } else {
      var q = (h.t - h.warn) / h.erupt, al = q < 0.7 ? 1 : Math.max(0, (1 - q) / 0.3);
      ctx.strokeStyle = "rgba(122,216,248," + (0.45 * al).toFixed(2) + ")"; ctx.lineWidth = h.w + 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(200,244,255," + (0.85 * al).toFixed(2) + ")"; ctx.lineWidth = h.w * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255," + al.toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      for (var i = 0; i < 6; i++) {   // 光のつぶ
        var t2 = rnd(i * 3.1 + Math.floor(glow * 20)), px = x + h.ux * h.len * t2 + (rnd(i + glow) - 0.5) * h.w, py = y + h.uy * h.len * t2 + (rnd(i * 2 + glow) - 0.5) * h.w;
        Render.rect(Math.round(px), Math.round(py), 2, 2, "rgba(255,255,255," + (0.8 * al).toFixed(2) + ")");
      }
    }
    ctx.restore();
  }
  // 大地たたきの光の柱：こちらへ向けて扇に何本か。それぞれの道に、根もとから先へ順に立つ（壁で止まる）。
  // 立つ少し前（0.35秒）に、その場所の地面が光る
  function startQuake(e, room, p, half) {
    var d = e.def, n = half ? d.slamLinesHalf : d.slamLines, a0 = Math.atan2(p.y - e.y, p.x - e.x);
    for (var i = 0; i < n; i++) {
      var a = a0 + (i - (n - 1) / 2) * d.slamSpread, cx = Math.cos(a), cy = Math.sin(a);
      var len = Math.min(d.slamLen, rayLength(room, e.x, e.y, cx, cy, 4));
      for (var s = d.slamNear, j = 0; s <= len; s += d.slamStep, j++) {
        hazards.push({ kind: "circle", look: "quake", from: e, x: e.x + cx * s, y: e.y + 6 + cy * s, r: d.slamR, t: 0, warn: e.t + j * d.slamGap, erupt: 0.4, hit: false,
                       opts: { mult: d.quakeMult, big: true } });
      }
    }
  }
  // 向き（face）を、(ux, uy) のほうへ、1回に最大 step（ラジアン）だけまわす
  function turnToward(e, ux, uy, step) {
    var a = Math.atan2(e.face.y, e.face.x), b = Math.atan2(uy, ux), diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a += Math.max(-step, Math.min(step, diff));
    e.face = { x: Math.cos(a), y: Math.sin(a) };
  }
  // 盾がまえのとき、(ox, oy) から来た攻撃が前からか（skills.js の hitEnemy から呼ぶ）
  function guardFront(e, ox, oy) {
    if (!e.guarding || ox === undefined) return false;
    var dx = ox - e.x, dy = oy - e.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1) return false;
    return (dx * e.face.x + dy * e.face.y) / l > 0.35;
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

  // ---------- ラフレシア（烈風の峰6階。段階3、2026-11-08）。動かない。毒の霧で立つ場所をうばい、吸いこみで引きよせる ----------
  function raff(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.face = { x: ux, y: uy };
    e.whipT = Math.max(0, (e.whipT || 0) - dt);
    e.puffT = Math.max(0, (e.puffT || 0) - dt);
    if (half && !e.bloomed) {   // HP が半分：花びらが大きく開く（1回だけ。少しのあいだ止まって、まわりの霧を吹きとばす見た目）
      e.bloomed = true; e.state = "recover"; e.t = 0.8; e.puffT = 0.6;
      Battle.pop(e.x, e.y - 50, "花びらが大きく開いた！", "#ff7aa0", 9);
      return;
    }
    if (e.state === "windup") {   // つるのむち：まわりをなぎはらう
      e.t -= dt;
      if (e.t <= 0) {
        if (!p.down && gap <= d.whipReach + 2) hurt(e, p.x, p.y - 8, { mult: d.whipMult });
        e.whipT = 0.3; Sound.play("swing");
        e.state = "recover"; e.t = 0.5; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "seed") {   // 毒の種を吐く（扇に3つ。HP 半分から5つ）
      e.t -= dt;
      if (e.t <= 0) {
        var a0 = Math.atan2(uy, ux), n = half ? d.seedsHalf : d.seeds;
        for (var k = 0; k < n; k++) api.addArrow(e, a0 + (k - (n - 1) / 2) * d.seedSpread, d.seedSpeed, { spit: true, mult: d.seedMult, dy: -16, life: 2.4, status: { type: "venom", chance: 0.3, dur: 6 } });
        e.puffT = 0.25; Sound.play("swing");
        e.state = "recover"; e.t = 0.5; e.cd = (half ? d.cooldownHalf : d.cooldown) + 0.4;
      }
      return;
    }
    if (e.state === "inhale") {   // 吸いこみ：まんなかへ引きよせる（歩けば逃げられる）
      e.t -= dt;
      if (!p.down && dist > e.r + p.r + 4) room.move(p, -ux * d.inhalePull * dt, -uy * d.inhalePull * dt);
      if (e.t <= 0) { e.state = "breath"; e.t = d.breathWarn; Battle.pop(e.x, e.y - 50, "毒の息！", "#ef5b5b", 9); }
      return;
    }
    if (e.state === "breath") {   // 毒の息：まわりに大ダメージと毒（赤い輪で予告）
      e.t -= dt;
      if (e.t <= 0) {
        if (!p.down && dist - p.r <= d.breathRadius) hurt(e, p.x, p.y - 8, { mult: d.breathMult, big: true, status: { type: "venom", chance: 1, dur: 8 } });
        e.breathFx = 0.5; Sound.play("hit"); shake(2, 0.25);
        e.state = "recover"; e.t = 0.9;
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    if (e.ai.inhale <= 0) {
      e.state = "inhale"; e.t = d.inhaleTime; e.ai.inhale = half ? d.inhaleEveryHalf : d.inhaleEvery;
      Battle.pop(e.x, e.y - 50, "吸いこみ！", "#ffd24a", 9);
      return;
    }
    if (e.ai.fog <= 0) {   // 毒の霧：1つはプレイヤーの足もと、ほかはまわりのどこか
      var nf = half ? d.fogCountHalf : d.fogCount;
      for (var f = 0; f < nf; f++) {
        var fx = p.x, fy = p.y;
        if (f > 0) { var fa = Math.random() * Math.PI * 2, fr = 40 + Math.random() * 70; fx = e.x + Math.cos(fa) * fr; fy = e.y + Math.sin(fa) * fr * 0.8; }
        addFog(e, fx, fy, d.fogWarn);
      }
      e.ai.fog = half ? d.fogEveryHalf : d.fogEvery; e.puffT = 0.3;
      Battle.pop(e.x, e.y - 50, "毒の霧", "#b46ad8", 8);
      e.state = "recover"; e.t = 0.4;
      return;
    }
    if (e.ai.bud <= 0 && e.hp <= e.maxHp * 0.75) {   // つぼみを生やす（HP が 75% を切ってから）
      var nb = half ? d.budsHalf : d.buds;
      for (var b = 0; b < nb; b++) {
        var ba = Math.random() * Math.PI * 2, br = 56 + Math.random() * 40, bx = e.x + Math.cos(ba) * br, by = e.y + Math.sin(ba) * br * 0.8;
        if (room.hitsWall(bx - 6, by - 6, 12, 12)) { bx = e.x + Math.cos(ba) * 46; by = e.y + Math.sin(ba) * 36; }
        var bud = api.spawn("raff_bud", bx, by, e.depth || 1);
        bud.summoned = true; bud.owner = e; bud.bloomT = d.budTime; bud.birth = 0.4;
      }
      e.ai.bud = d.budEvery;
      Battle.pop(e.x, e.y - 50, "つぼみが生えた！", "#ff7aa0", 8);
      e.state = "recover"; e.t = 0.5;
      return;
    }
    if (e.cd > 0) return;
    if (gap <= d.whipReach) { e.state = "windup"; e.t = d.windup; return; }
    // はなれているとき：毒の種と、つるの一撃（大木の魔物の「根の大波」を1本だけ。2026-11-08 保護者の案）をかわりばんこに
    e.vineNext = !e.vineNext;
    if (!e.vineNext) { e.state = "seed"; e.t = 0.55; return; }
    var W = d.vineW, vert = Math.abs(p.y - e.y) > Math.abs(p.x - e.x);   // プレイヤーのいる場所を通る帯。ボスから見て上下にいるなら縦、左右なら横
    hazards.push(vert
      ? { kind: "rect", from: e, x: p.x - W / 2, y: 0, w: W, h: room.pxH, t: 0, warn: d.vineWarn, erupt: 0.4, hit: false, seed: Math.random() * 100, opts: { mult: d.vineMult, big: true } }
      : { kind: "rect", from: e, x: 0, y: p.y - W / 2, w: room.pxW, h: W, t: 0, warn: d.vineWarn, erupt: 0.4, hit: false, seed: Math.random() * 100, opts: { mult: d.vineMult, big: true } });
    e.puffT = 0.25;
    e.state = "recover"; e.t = 0.6; e.cd = (half ? d.cooldownHalf : d.cooldown) + 0.6;
  }

  // ---------- 大怪鳥（烈風の峰12階・主。段階4、2026-11-09）。飛ぶ。急降下・かぎづめ・羽ばたきがふつうの技、大技は空へ飛んで竜巻 ----------
  // 竜巻を起こすときに飛んでいく空の場所（峰のいただきの上側は崖の外の空。rooms.js の PeakBossRoom）。
  // いちばん近い床から 60 ドットほどはなれる（剣・槍のふつうの攻撃は届かない）
  var SKY_X = 352, SKY_Y = 88;
  function roc(e, dt, room, p, hurt, api, ux, uy, gap, dist) {
    var d = e.def, half = e.hp <= e.maxHp / 2;
    e.slashT = Math.max(0, (e.slashT || 0) - dt);
    var tx = Math.floor(e.x / World.TILE), ty = Math.floor(e.y / World.TILE);
    e.overSky = room.tile(tx, ty) === "C";   // 崖の外の空の上（影を描かない）
    // 高さ（絵だけ）：ふだんは少し浮く。急降下の前は高く、突っこむときは低く
    var altTo = e.state === "rise" ? 26 : e.state === "swoop" ? 3 : e.state === "sky" ? 4 : e.state === "takeoff" || e.state === "land" ? 14 : 10;
    e.alt = (e.alt === undefined ? 10 : e.alt) + (altTo - (e.alt === undefined ? 10 : e.alt)) * Math.min(1, dt * 6);
    if (e.state === "windup") {   // かぎづめ
      e.t -= dt;
      if (e.t <= 0) {
        if (!p.down && gap <= d.clawReach + 2) hurt(e, p.x, p.y - 8, { mult: d.clawMult });
        e.slashT = 0.25; Sound.play("swing");
        e.state = "recover"; e.t = 0.45; e.cd = half ? d.cooldownHalf : d.cooldown;
      }
      return;
    }
    if (e.state === "flap") {   // 羽ばたき：風の刃を扇に
      e.face = { x: ux, y: uy };
      e.t -= dt;
      if (e.t <= 0) { rocBlades(e, api, ux, uy, half ? d.bladesHalf : d.blades); e.state = "recover"; e.t = 0.5; e.cd = (half ? d.cooldownHalf : d.cooldown) + 0.6; }
      return;
    }
    if (e.state === "rise") {   // 急降下の構え：高く舞い上がり、赤い線でねらう（0.3 秒前まで向きを合わせ直す）
      e.t -= dt;
      if (e.t > 0.3 && !p.down && e.chargeLine) {
        e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
        e.chargeLen = Math.min(d.diveMax, Math.max(dist + 40, 120));
        e.chargeLine.x2 = e.x + ux * e.chargeLen; e.chargeLine.y2 = e.y + uy * e.chargeLen;
      }
      if (e.t <= 0) { e.state = "swoop"; e.travel = 0; e.hitDone = false; Sound.play("swing"); }
      return;
    }
    if (e.state === "swoop") {   // 急降下：線にそって一気に突っこむ（壁で止まる）
      var step = d.diveSpeed * dt, bx = e.x, by = e.y;
      room.move(e, e.aim.x * step, e.aim.y * step);
      var moved = Math.abs(e.x - bx) + Math.abs(e.y - by);
      e.travel += step;
      var px = p.x - e.x, py = p.y - e.y;
      if (!e.hitDone && !p.down && px * px + py * py < (e.r + p.r + 4) * (e.r + p.r + 4)) { e.hitDone = true; hurt(e, p.x, p.y - 8, { mult: d.diveMult, big: true }); }
      if (moved < step * 0.4 || e.travel >= e.chargeLen) {
        e.state = "recover"; e.t = 0.9; addDust(e.x, e.y + 6); shake(1, 0.15);
        removeLines(e);
      }
      return;
    }
    if (e.state === "takeoff" || e.state === "land") {   // 空へ飛んでいく・もどってくる（壁は気にせず、まっすぐ）
      var gx = e.goal.x - e.x, gy = e.goal.y - e.y, gl = Math.sqrt(gx * gx + gy * gy);
      var sp = 150 * dt;
      if (gl <= sp) {
        e.x = e.goal.x; e.y = e.goal.y;
        if (e.state === "takeoff") {
          e.state = "sky"; e.t = d.stormTime; e.skyShot = 1.2;
          var n = half ? d.stormCountHalf : d.stormCount;
          for (var k = 0; k < n; k++) addTornado(e, room, p, k);
          Battle.pop(e.x, e.y - 40, "竜巻！", "#ef5b5b", 10); shake(1, 0.3);
        } else { e.state = "recover"; e.t = 0.6; e.cd = 0.8; }
      } else { e.x += gx / gl * sp; e.y += gy / gl * sp; e.face = { x: gx / gl, y: gy / gl }; }
      return;
    }
    if (e.state === "sky") {   // 崖の外の空：竜巻が動いているあいだ、空から風の刃を撃つ（剣などは届かない）
      e.face = { x: ux, y: uy };
      e.t -= dt; e.skyShot -= dt;
      if (e.skyShot <= 0 && !p.down) { rocBlades(e, api, ux, uy, 3); e.skyShot = d.skyShot; }
      if (e.t <= 0) {
        e.state = "land";
        e.goal = { x: Math.max(80, Math.min(room.pxW - 80, p.x + (Math.random() < 0.5 ? -50 : 50))), y: Math.max(170, Math.min(room.pxH - 70, p.y - 40)) };
      }
      return;
    }
    if (e.state === "recover") { e.t -= dt; if (e.t <= 0) e.state = "chase"; return; }
    if (p.down) return;
    if (e.ai.storm <= 0) {   // 大技：空へ
      e.ai.storm = half ? d.stormEveryHalf : d.stormEvery;
      e.state = "takeoff"; e.goal = { x: SKY_X, y: SKY_Y };
      Battle.pop(e.x, e.y - 40, "空へ舞い上がった！", "#ffd24a", 9);
      return;
    }
    if (e.ai.dive <= 0) {   // 急降下
      e.ai.dive = (half ? d.diveEveryHalf : d.diveEvery) + Math.random() * 1.5;
      e.aim = { x: ux, y: uy }; e.face = { x: ux, y: uy };
      e.chargeLen = Math.min(d.diveMax, Math.max(dist + 40, 120));
      e.chargeLine = { kind: "line", from: e, x1: e.x, y1: e.y, x2: e.x + ux * e.chargeLen, y2: e.y + uy * e.chargeLen, w: e.r * 2 + 2, t: 0, warn: d.diveWarn };
      hazards.push(e.chargeLine);
      e.state = "rise"; e.t = d.diveWarn;
      Battle.pop(e.x, e.y - 40, "急降下！", "#ef5b5b", 9);
      return;
    }
    e.face = { x: ux, y: uy };
    if (e.cd <= 0 && gap <= d.clawReach) { e.state = "windup"; e.t = d.windup; return; }
    if (e.cd <= 0 && gap > 44) { e.state = "flap"; e.t = 0.45; return; }
    if (gap > d.clawReach - 4 && !e.status.para) room.move(e, ux * d.speed * dt, uy * d.speed * dt);
  }
  function rocBlades(e, api, ux, uy, n) {
    var d = e.def, a0 = Math.atan2(uy, ux);
    for (var k = 0; k < n; k++) api.addArrow(e, a0 + (k - (n - 1) / 2) * d.bladeSpread, d.bladeSpeed, { wind: true, mult: d.bladeMult, dy: -8, life: 3 });
    e.flapFx = 0.3;
  }
  // 竜巻：1つめはプレイヤーの近く、ほかは部屋のどこか（床の上）
  function addTornado(boss, room, p, k) {
    var d = boss.def, x = p.x, y = p.y;
    for (var tries = 0; tries < 20; tries++) {
      if (k === 0) { var a = Math.random() * Math.PI * 2; x = p.x + Math.cos(a) * 60; y = p.y + Math.sin(a) * 40; }
      else { x = 40 + Math.random() * (room.pxW - 80); y = 150 + Math.random() * (room.pxH - 200); }
      if (!room.hitsWall(x - 8, y - 8, 16, 16)) break;
    }
    hazards.push({ kind: "tornado", from: boss, x: x, y: y, r: d.tornadoR, t: 0, warn: d.stormWarn, life: d.stormTime - 0.5, tick: 0, seed: Math.random() * 100, push: 0 });
  }
  function updateTornado(h, dt, p, hurt, room) {
    var d = h.def || h.from.def;   // h.def：闘技場の相手の魔物使いが呼んだ竜巻（2026-11-22）
    if (h.push > 0 && room) { h.push -= dt; room.move(p, h.px * d.tornadoPush / 0.3 * dt, h.py * d.tornadoPush / 0.3 * dt); }
    if (h.t < h.warn) return;
    // プレイヤーのほうへ、ふらふらと寄っていく
    var a = Math.atan2(p.y - h.y, p.x - h.x) + Math.sin(h.t * 1.3 + h.seed) * 1.3;
    var nx = h.x + Math.cos(a) * d.tornadoSpeed * dt, ny = h.y + Math.sin(a) * d.tornadoSpeed * dt;
    if (room && room.hitsWall(nx - 6, ny - 6, 12, 12)) { h.seed += 1.7; }
    else { h.x = nx; h.y = ny; }
    h.tick -= dt;
    var dx = p.x - h.x, dy = p.y - h.y, dd = Math.sqrt(dx * dx + dy * dy) || 0.001;
    if (h.tick <= 0 && !p.down && !h.from.dead && dd < h.r + p.r) {
      hurt(h.from, p.x, p.y - 8, h.opts || { mult: d.tornadoMult });
      h.tick = 1.0; h.push = 0.3; h.px = dx / dd; h.py = dy / dd;   // 外へはじき飛ばす
      Battle.pop(p.x, p.y - 30, "巻きこまれた！", "#cfe8ff", 8);
    }
  }
  // 毒の霧を置く（ラフレシアと、咲いたつぼみ）：予告の輪 warn 秒 → 霧が fogTime 秒のこる
  function addFog(boss, x, y, warn) {
    var d = boss.def;
    hazards.push({ kind: "circle", look: "fog", from: boss, x: x, y: y, r: d.fogR, t: 0, warn: warn, erupt: d.fogTime, hit: false, tick: 0,
                   seed: Math.random() * 100, opts: { mult: d.fogMult, status: { type: "venom", chance: 0.4, dur: 5 } } });
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
                         opts: { mult: d.rainMult, status: { type: "venom", chance: 0.8, dur: 8 } } });   // 猛毒（2026-11-01）
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
                         opts: { magic: true, mult: d.pillarMult, big: true, status: { type: "venom", chance: 0.5, dur: 8 } } });   // 猛毒（2026-11-01）
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
    if (d.snow && snowGolem(e, dt, room, p, api, half)) return;   // スノーゴーレム：吹雪・雪だるまに分かれる
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
      if (e.t <= 0 && d.snow) {   // スノーゴーレム：大きな雪玉を地面に転がす（壁ではね返る）
        rollBall(e, ux, uy, half);
        e.thrown = 0.2; e.rocks--;
        if (e.rocks > 0) e.t = half ? d.rockWindupHalf : d.rockWindup;
        else tire(e);
      } else if (e.t <= 0) {
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
      // 回っている玉にさわるとダメージ（2026-10-26 保護者の案）。1つの玉は0.6秒に1回まで
      e.daHitT = e.daHitT || {};
      var shownN = e.daPhase === "gather" ? Math.ceil(e.daN * Math.min(1, 1.15 - Math.max(0, e.t) / d.daWindup)) : e.daLeft;
      for (var tq = 0; tq < Math.min(shownN, e.daLeft); tq++) {
        var sl = e.daSlots[tq], tp = orbPos(e, tq);
        e.daHitT[sl] = Math.max(0, (e.daHitT[sl] || 0) - dt);
        var tdx = p.x - tp.x, tdy = (p.y - 6) - tp.y;
        if (!p.down && e.daHitT[sl] <= 0 && tdx * tdx + tdy * tdy < (p.r + 6) * (p.r + 6)) { e.daHitT[sl] = 0.6; hurt(e, p.x, p.y - 8, { mult: d.daTouch, magic: true }); }
      }
      if (e.daPhase === "gather" && e.t <= 0) { e.daPhase = "orbit"; e.t = d.daOrbit; }   // そろったら、少し回ってから撃ちはじめる
      else if (e.daPhase === "orbit" && e.t <= 0) { e.daPhase = "fire"; e.t = 0; }
      if (e.daPhase === "fire" && e.t <= 0 && e.daLeft > 0) {
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
      e.state = "dark"; e.ai.da = half ? d.daEveryHalf : d.daEvery; e.t = d.daWindup; e.daPhase = "gather"; e.daHitT = {};
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
    Battle.pop(e.x, e.y - 50, d.snow ? "雪玉ころがし！" : "岩石投げ！", "#ef5b5b", 9);
  }

  // ---------- スノーゴーレム（白銀の霊峰6階・中ボス。段階3、2026-11-09 保護者と決定）。ゴーレムがもと ----------
  // ぶん回し・3回攻撃はゴーレムと同じ。岩石投げのかわりに「雪玉ころがし」：大きな雪玉を地面に転がす（壁で ballBounce 回はね返る）。
  // 吹雪（blizzardEvery 秒ごと、blizzardTime 秒）：画面が白くなり、まわりしか見えない（core.js の drawSnowfall。Bosses.blizzard() で強さ）。
  // HP が半分を切ると、1回だけ、くずれて雪の山になり、雪だるまを splitCount 体出す（雪の山には攻撃が当たらない）。
  //   雪だるまを全部たおすと、雪が集まってもとにもどり、しばらくふらつく（すきあり）。
  //   splitPile 秒たってものこっていたら、のこった雪だるまを吸いこんで合体し、1体につき最大HPの splitHeal だけ回復する。
  // この関数が動きを受け持ったフレームは true を返す
  var blizz = { t: 0, max: 1 };
  function blizzard() { return blizz.t > 0 ? Math.min(1, blizz.t / 0.6, (blizz.max - blizz.t) / 0.6 + 0.001) : 0; }
  function snowGolem(e, dt, room, p, api, half) {
    var d = e.def;
    if (blizz.t > 0) blizz.t = Math.max(0, blizz.t - dt);
    e.blizzCd = (e.blizzCd === undefined ? 7 : e.blizzCd) - dt;
    if (e.state === "pile") {
      e.t -= dt;
      var mates = api.alive().filter(function (o) { return o.owner === e; });
      e.face = { x: 0, y: 1 };
      if (!mates.length) {   // 全部たおした：雪が集まってもとにもどり、ふらつく
        e.untouchable = false; e.state = "tired"; e.t = d.reformTired;
        addWave(e.x, e.y + 8, 6, 40, 0.45, 0);
        Battle.pop(e.x, e.y - 50, "体がもどった！ ふらついている！", "#ffe066", 9);
        return true;
      }
      if (e.t <= 0) {   // 時間切れ：のこった雪だるまを吸いこんで合体し、回復する
        mates.forEach(function (m) { m.dead = true; m.fade = 0.4; m.absorbed = true; });
        var heal = Math.round(e.maxHp * d.splitHeal * mates.length);
        e.hp = Math.min(e.maxHp, e.hp + heal);
        e.untouchable = false; e.state = "recover"; e.t = 0.8;
        addWave(e.x, e.y + 8, 40, 6, 0.45, 0);
        Battle.pop(e.x, e.y - 50, "合体した！ HP が " + heal + " もどった", "#ef5b5b", 9);
        return true;
      }
      return true;
    }
    if (half && !e.splitDone && (e.state === "chase" || e.state === "recover")) {   // くずれて、雪だるまに分かれる
      e.splitDone = true; e.state = "pile"; e.t = d.splitPile; e.untouchable = true;
      for (var i = 0; i < d.splitCount; i++) {
        var a = -Math.PI / 2 + i / d.splitCount * Math.PI * 2, sx = e.x + Math.cos(a) * 30, sy = e.y + Math.sin(a) * 22;
        if (room.hitsWall(sx - 6, sy - 6, 12, 12)) { sx = e.x; sy = e.y + 20; }
        var m = api.spawn("snowman", sx, sy, 1);
        m.summoned = true; m.owner = e; m.cd = 0.8 + i * 0.3;
      }
      for (var k = 0; k < 10; k++) { var ka = Math.random() * Math.PI * 2; addDust(e.x + Math.cos(ka) * 20, e.y + 8 + Math.sin(ka) * 12); }
      shake(2, 0.3);
      Battle.pop(e.x, e.y - 50, "くずれて、雪だるまに分かれた！", "#ef5b5b", 9);
      return true;
    }
    if (e.blizzCd <= 0 && e.state === "chase" && !p.down) {   // 吹雪（動きは止めない。見えにくくなるだけ）
      e.blizzCd = (half ? d.blizzardEveryHalf : d.blizzardEvery) + d.blizzardTime;
      blizz.t = blizz.max = d.blizzardTime;
      Battle.pop(e.x, e.y - 50, "吹雪だ！", "#ef5b5b", 9);
    }
    return false;
  }
  // 雪玉：ゴーレムの前に出して、プレイヤーのほうへ転がす。壁や岩にぶつかると、はね返る（ballBounce 回まで。そのあとはくだける）
  function rollBall(e, ux, uy, half) {
    var d = e.def, sp = half ? d.ballSpeedHalf : d.ballSpeed;
    var a = Math.atan2(uy, ux) + (Math.random() - 0.5) * 0.25;
    hazards.push({ kind: "ball", from: e, x: e.x + Math.cos(a) * (e.r + 4), y: e.y + 6 + Math.sin(a) * (e.r + 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                   r: d.ballR, t: 0, life: d.ballLife, bounce: d.ballBounce, hitCd: 0, roll: 0, opts: { mult: d.ballMult, big: true } });
    Sound.play("swing");
  }
  function updateBall(h, dt, p, hurt, room) {
    h.hitCd = Math.max(0, h.hitCd - dt);
    var nx = h.x + h.vx * dt, ny = h.y + h.vy * dt, r = h.r * 0.8;
    if (room.hitsWall(nx - r, h.y - r, r * 2, r * 2)) { h.vx = -h.vx; h.bounce--; nx = h.x; shake(1, 0.08); }
    if (room.hitsWall(h.x - r, ny - r, r * 2, r * 2)) { h.vy = -h.vy; h.bounce--; ny = h.y; shake(1, 0.08); }
    h.x = nx; h.y = ny; h.roll += Math.sqrt(h.vx * h.vx + h.vy * h.vy) * dt;
    var dx = p.x - h.x, dy = p.y - h.y;
    if (!p.down && h.hitCd <= 0 && dx * dx + dy * dy < (h.r + p.r) * (h.r + p.r) && !h.from.dead) {
      hurt(h.from, p.x, p.y - 8, h.opts);
      h.bounce = -1;   // 当たると、くだける
    }
    if (h.bounce < 0 || h.t >= h.life) { snowBreak(h.x, h.y); return true; }
    return false;
  }
  // 雪玉がくだけた：白いかけら
  function snowBreak(x, y) {
    for (var i = 0; i < 9; i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 50;
      chips.push({ x: x, y: y, z: 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 50 + Math.random() * 60, t: 0, max: 0.7 + Math.random() * 0.4,
                   c: ["#ffffff", "#e2e8f0", "#c8d2de", "#a8b4c4"][i % 4], s: i % 3 === 0 ? 3 : 2 });
    }
  }
  // 雪玉の絵：白い玉に、転がる向きに回るもよう（青いかげ）
  function drawSnowball(ctx, x, y, r, roll) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = "#140c1c"; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c8d2de"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f4f8fc"; ctx.beginPath(); ctx.arc(x - 2, y - 2, r - 2, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 4; i++) {   // 転がるもよう
      var a = roll / r + i * Math.PI / 2, px = x + Math.cos(a) * (r - 4), py = y + Math.sin(a) * (r - 4) * 0.8;
      Render.rect(Math.round(px) - 1, Math.round(py) - 1, 2, 2, "#a8b4c4");
    }
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
  function updateHazards(dt, p, hurt, room) {
    for (var di = dust.length - 1; di >= 0; di--) { dust[di].t += dt; if (dust[di].t >= dust[di].max) dust.splice(di, 1); }
    for (var ci = chips.length - 1; ci >= 0; ci--) {   // かけら：はねて落ちる
      var c = chips[ci]; c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= 260 * dt; c.z += c.vz * dt;
      if (c.z < 0) { c.z = 0; c.vz = -c.vz * 0.35; c.vx *= 0.6; c.vy *= 0.6; }
      if (c.t >= c.max) chips.splice(ci, 1);
    }
    for (var wi = waves.length - 1; wi >= 0; wi--) { waves[wi].t += dt; if (waves[wi].t >= waves[wi].max + 0.6) waves.splice(wi, 1); }
    quake.t = Math.max(0, quake.t - dt);
    updateFrost(dt);
    for (var i = hazards.length - 1; i >= 0; i--) {
      var h = hazards[i];
      h.t += dt;
      if (h.kind === "line") continue; // 大突進の線は、ボスが走り終わると消える
      if (h.kind === "ball") {   // スノーゴーレムの雪玉
        if (updateBall(h, dt, p, hurt, room) || h.from.dead) hazards.splice(i, 1);
        continue;
      }
      if (h.kind === "cone") {   // 氷牙獣のこおりの息
        if (h.ally) {   // 召喚士が呼んだケルベロスの炎（2026-11-22）：敵に当たる
          if (h.t >= h.warn && !h.hit) { h.hit = true; h.ally(h); }
          if (h.t >= h.warn + h.erupt) hazards.splice(i, 1);
          continue;
        }
        if (h.t >= h.warn && !h.hit) { h.hit = true; breathHit(h, p, hurt, room); }
        if (h.t >= h.warn + h.erupt || h.from.dead) hazards.splice(i, 1);
        continue;
      }
      if (h.kind === "beam") {   // 水晶の大グモの光線
        if (h.t >= h.warn && !h.hit) { h.hit = true; if (!p.down && !h.from.dead && beamTouches(h, p.x, p.y - 4, p.r)) hurt(h.from, p.x, p.y - 8, h.opts); }
        if (h.t >= h.warn + h.erupt || h.from.dead) hazards.splice(i, 1);
        continue;
      }
      if (h.kind === "tsunami") {   // 水竜の大波
        if (updateWave(h, dt, p, hurt, room) || h.from.dead) hazards.splice(i, 1);
        continue;
      }
      if (h.kind === "tornado") {   // 大怪鳥の竜巻
        if (h.ally) {   // 魔物使いが呼んだ大怪鳥の竜巻（2026-11-22）：敵を追いかけて当たる
          if (h.t >= h.warn) h.allyMove(h, dt);
          if (h.t >= h.warn + h.life) hazards.splice(i, 1);
          continue;
        }
        updateTornado(h, dt, p, hurt, room);
        if (h.t >= h.warn + h.life || h.from.dead) hazards.splice(i, 1);
        continue;
      }
      if ((h.look === "fog" || h.look === "lavapool") && h.t >= h.warn) {   // 毒の霧・溶岩だまり（炎の巨人）：のこっているあいだ、中にいると 0.7 秒ごとに少しダメージと毒
        h.hit = true; h.tick -= dt;
        var fin = (p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y) < (h.r + p.r * 0.5) * (h.r + p.r * 0.5);
        if (fin && h.tick <= 0 && !p.down && !h.from.dead) { hurt(h.from, p.x, p.y - 8, h.opts); h.tick = 0.7; }
        if (h.t >= h.warn + h.erupt) hazards.splice(i, 1);
        continue;
      }
      if (h.track && h.t < h.warn && !h.track.dead) { h.x = h.track.x; h.y = h.track.y; }   // 魔物使いの瘴気の柱：予告のあいだ、ねらった敵についていく（track。大ガマの follow とは別。2026-10-26 名前がぶつかって大ガマが消えたので分けた）
      if (h.t >= h.warn && !h.hit) {
        h.hit = true;
        if (h.look === "bomb") { Sound.play("hit"); addDust(h.x, h.y); }
        if (h.look === "magma") {   // 溶岩の岩が落ちた：ずしん。少しのあいだ、溶岩だまりがのこる
          Sound.play("hit"); shake(1, 0.1);
          if (h.from && !h.from.dead) hazards.push({ kind: "circle", look: "lavapool", from: h.from, x: h.x, y: h.y, r: h.r * 0.9, t: 0, warn: 0.35, erupt: h.from.def.poolTime, hit: false, tick: 0.3,
                                                     seed: Math.random() * 100, opts: { mult: h.from.def.poolMult } });
        }
        if (h.look === "flamering") shake(2, 0.15);
        if (h.look === "quake") shake(1, 0.06);
        if (h.look === "icicle") {   // つららがささる：ずしん。大きな氷のかけらが飛びちる
          shake(2, 0.12);
          for (var ic = 0; ic < 12; ic++) {
            var ia = Math.random() * Math.PI * 2, isp = 30 + Math.random() * 60;
            chips.push({ x: h.x, y: h.y, z: 8 + Math.random() * 20, vx: Math.cos(ia) * isp, vy: Math.sin(ia) * isp * 0.6, vz: 70 + Math.random() * 80, t: 0, max: 0.7 + Math.random() * 0.4,
                         c: ic % 3 === 0 ? "#ffffff" : ic % 3 === 1 ? "#c8eaf8" : "#8cc4e4", s: ic % 4 === 0 ? 4 : 2 + (ic % 2) });
          }
        }
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
  function bossDown() { hazards.length = 0; dust.length = 0; chips.length = 0; waves.length = 0; blizz.t = 0; frost.length = 0; }

  // ---------- 描画 ----------
  // 大技の絵（2026-10-18 に仮の絵から差しかえ）：予告は半とうめいの光。本番は、根の大波が太いつる、大突進のあとは土けむり（ドット）
  function rnd(n) { var v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }

  // 大怪鳥の竜巻：予告は地面の風の輪。本番は、白い風が何段にも回る、上ほど太いうず
  function drawTornado(ctx, h, cam, glow) {
    var x = Math.round(h.x - cam.x), y = Math.round(h.y - cam.y);
    if (h.t < h.warn) {
      var kw = h.t / h.warn;
      for (var i = 0; i < 10; i++) {
        var a = glow * 6 + i / 10 * Math.PI * 2, r = 4 + kw * h.r;
        Render.rect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), 2, 1, "rgba(230,245,255," + (0.3 + 0.6 * kw).toFixed(2) + ")");
      }
      return;
    }
    var end = h.warn + h.life, fade = Math.min(1, (end - h.t) / 0.5, (h.t - h.warn) / 0.3);
    ctx.fillStyle = "rgba(0,0,0," + (0.25 * fade).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y + 2, h.r, h.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    var H = 46;
    for (var j = 0; j < 9; j++) {   // 下から上へ：輪が太くなり、左右にゆれる
      var k = j / 8, ry = y - k * H, rr = 3 + k * (h.r + 4), sx = Math.sin(glow * 5 + j * 0.7 + h.seed) * 3 * k;
      ctx.strokeStyle = "rgba(" + (j % 2 ? "236,246,255" : "176,196,214") + "," + ((0.55 + 0.3 * (1 - k)) * fade).toFixed(2) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x + sx, ry, rr, rr * 0.32, 0, glow * 9 + j, glow * 9 + j + Math.PI * 1.4); ctx.stroke();
    }
    for (var q = 0; q < 8; q++) {   // 巻き上げられた小石と葉
      var qa = glow * 7 + q * 0.8 + h.seed, qk = ((glow * 0.9 + q * 0.13) % 1), qr = 4 + qk * (h.r + 2);
      Render.rect(Math.round(x + Math.cos(qa) * qr), Math.round(y - qk * H + Math.sin(qa) * qr * 0.3), 2, 2, q % 3 ? "rgba(120,110,96," + fade.toFixed(2) + ")" : "rgba(110,160,90," + fade.toFixed(2) + ")");
    }
  }
  function drawHazards(cam, glow) {
    var ctx = Render.ctx;
    frost.forEach(function (f) { drawFrost(ctx, f, cam, glow); });
    waves.forEach(function (w) { drawWave(ctx, w, cam); });
    hazards.forEach(function (h) {
      if (h.kind === "cone") { if (h.look === "ink") drawInk(ctx, h, cam, glow); else if (h.look === "fire") drawFireCone(ctx, h, cam, glow); else drawCone(ctx, h, cam, glow); return; }
      if (h.kind === "line") { drawChargeLine(ctx, h, cam, glow); return; }
      if (h.kind === "circle") { drawCircle(ctx, h, cam, glow); return; }
      if (h.kind === "tornado") { drawTornado(ctx, h, cam, glow); return; }
      if (h.kind === "beam") { if (h.look === "tentacle") drawTentacle(ctx, h, cam, glow); else if (h.look === "torrent") drawTorrent(ctx, h, cam, glow); else drawBeam(ctx, h, cam, glow); return; }
      if (h.kind === "tsunami") { drawTsunami(ctx, h, cam, glow); return; }
      if (h.kind === "ball") {   // 雪玉：地面にかげ
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(Math.round(h.x - cam.x), Math.round(h.y - cam.y) + h.r - 2, h.r, h.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        drawSnowball(ctx, h.x - cam.x, h.y - cam.y - 2, h.r, h.roll);
        return;
      }
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
      ctx.strokeStyle = (w.ice ? "rgba(240,252,255," : "rgba(255,240,200,") + (0.9 * al).toFixed(2) + ")"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = (w.ice ? "rgba(122,184,220," : "rgba(168,152,120,") + (0.8 * al).toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.44, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 輪の大技（2026-10-21）：look＝dive（大ガマが飛び出す）・drop（毒の雨）・pillar（瘴気の柱）
  // 予告：地面の輪がだんだん濃くなり、まんなかへちぢむ光の輪。本番：それぞれの絵
  function drawCircle(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y, k = Math.min(1, h.t / h.warn);
    var locked = h.look === "dive" && h.from && h.from.def.diveLock !== undefined && h.warn - h.t <= h.from.def.diveLock;
    if (h.look === "fog" && h.t >= h.warn) { drawFog(ctx, h, x, y, glow); return; }
    if (h.look === "lavapool") { if (h.t >= h.warn) drawLavaPool(ctx, h, x, y, glow); return; }
    if (h.look === "flamering" && h.t >= h.warn) { drawFlameRing(ctx, h, x, y, glow); return; }
    var col = h.look === "magma" ? [255, 110, 40] : h.look === "flamering" ? [255, 80, 40] : h.look === "fog" ? [170, 90, 220] : h.look === "pillar" ? [180, 90, 230] : h.look === "drop" ? [150, 200, 90] : h.look === "bomb" ? [255, 110, 60] : locked ? [255, 60, 50] : [240, 150, 90];
    function c(a) { return "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + a.toFixed(2) + ")"; }
    if (h.look === "quake") { drawQuake(ctx, h, x, y, glow); return; }
    if (h.look === "hellfire") { drawHellFire(ctx, h, x, y, glow); return; }
    if (h.look === "leap") { drawLeapMark(ctx, h, x, y, glow); return; }
    if (h.look === "spike") { drawSpike(ctx, h, x, y, glow); return; }
    if (h.look === "icicle") { drawIcicleDrop(ctx, h, x, y, glow); return; }
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
      if (h.look === "magma") {   // 炎の巨人の溶岩の岩：頭の上から、山なりに飛んでくる（光る岩と、火の粉の尾）
        var mk = Math.min(1, h.t / Math.max(0.01, h.warn)), mx = (h.sx - cam.x) + (x - (h.sx - cam.x)) * mk, my = (h.sy - cam.y) + (y - (h.sy - cam.y)) * mk - Math.sin(mk * Math.PI) * 70;
        for (var mt = 1; mt <= 3; mt++) Render.rect(Math.round(mx - mt * 3 * (x - (h.sx - cam.x)) / 200) - 1, Math.round(my + mt * 3) - 1, 2, 2, mt === 1 ? "#f8a040" : "rgba(216,68,16,0.6)");
        Combat.glowDot(ctx, mx, my - 4, 9, "#ffe066", "#f06a18", 0.7);
        ctx.fillStyle = "#3a1610"; ctx.beginPath(); ctx.arc(mx, my - 4, 5, 0, Math.PI * 2); ctx.fill();
        Render.rect(Math.round(mx) - 3, Math.round(my) - 6, 3, 1, "#ffb030"); Render.rect(Math.round(mx), Math.round(my) - 3, 3, 1, "#f06a18"); Render.rect(Math.round(mx) - 1, Math.round(my) - 8, 2, 1, "#fff2a0");
      }
      if (h.look === "bomb") {   // おかしらの爆弾：投げたところから、山なりに飛んでくる（導火線の火花つき）
        var bx2 = (h.sx - cam.x) + (x - (h.sx - cam.x)) * k, by2 = (h.sy - cam.y) + (y - (h.sy - cam.y)) * k - Math.sin(k * Math.PI) * 60;
        ctx.fillStyle = "#1e1a22"; ctx.beginPath(); ctx.arc(bx2, by2 - 4, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4a4652"; ctx.fillRect(Math.round(bx2) - 2, Math.round(by2) - 7, 2, 2);
        Combat.glowDot(ctx, bx2 + 3, by2 - 9, 3 + Math.sin(glow * 40), "#ffffff", "#ffb84a", 0.9);
      }
      if (locked) Render.text("！", x, y - h.r * 0.7 - 12, { size: 11, align: "center", bold: true, color: "#ff5040" });
      if (h.look === "dive") {   // 沼の中を進んでくる泡
        for (var b = 0; b < 4; b++) { var ph = (glow * 2 + b / 4) % 1; ctx.fillStyle = "rgba(200,220,150," + (1 - ph).toFixed(2) + ")"; ctx.fillRect(Math.round(x + Math.sin(b * 2.1) * h.r * 0.5), Math.round(y - ph * 8), 2, 2); }
      }
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q;
    if (h.look === "bomb" || h.look === "magma") {   // 爆発：はじける火の玉と、広がる輪と、火花（溶岩の岩も）
      var orr = h.r * (0.5 + 0.8 * Math.sqrt(q));
      Combat.glowDot(ctx, x, y - 4, orr, "#fff3c4", "#ff6a1f", 0.85 * fade);
      ctx.strokeStyle = "rgba(255,231,160," + (0.8 * fade).toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 4, orr * 1.05, 0, Math.PI * 2); ctx.stroke();
      for (var bs = 0; bs < 10; bs++) { var ab = bs / 10 * Math.PI * 2, db = orr * (0.8 + 0.6 * q); Combat.glowDot(ctx, x + Math.cos(ab) * db, y - 4 + Math.sin(ab) * db, 2.5, "#ffffff", "#ffb84a", fade); }
      return;
    }
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

  // 炎の巨人の溶岩だまり：赤〜だいだいの光るたまりに、ぷくぷくの泡。終わりぎわは黒くかたまる
  function drawLavaPool(ctx, h, x, y, glow) {
    var q = (h.t - h.warn) / h.erupt, grow = Math.min(1, (h.t - h.warn) / 0.25), fade = q > 0.8 ? (1 - q) / 0.2 : 1;
    var r = h.r * (0.6 + 0.4 * grow);
    ctx.fillStyle = "rgba(40,14,10," + (0.7 * fade + 0.2).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, r + 2, (r + 2) * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(232,80,26," + (0.85 * fade).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,176,48," + (0.8 * fade).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x - r * 0.15, y - r * 0.08, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    for (var b = 0; b < 3; b++) {   // 泡：ふくらんで、はじける
      var ph = (glow * 1.6 + b / 3 + h.seed) % 1, bx = x + Math.sin(b * 2.3 + h.seed) * r * 0.5, by = y + Math.cos(b * 1.7 + h.seed) * r * 0.25;
      if (ph < 0.8) Render.rect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2, "rgba(255,242,160," + (fade * (1 - ph)).toFixed(2) + ")");
    }
  }
  // 炎の巨人の地ならし：まわりの輪の上に、火の舌がいっせいに立つ
  function drawFlameRing(ctx, h, x, y, glow) {
    var q = Math.min(1, (h.t - h.warn) / h.erupt), fade = 1 - q;
    ctx.fillStyle = "rgba(255,110,40," + (0.3 * fade).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    var n = 22;
    for (var i = 0; i < n; i++) {
      for (var ring = 0; ring < 2; ring++) {
        var a = (i + ring * 0.5) / n * Math.PI * 2, rr = h.r * (ring ? 0.6 : 0.92), fx = x + Math.cos(a) * rr, fy = y + Math.sin(a) * rr * 0.62;
        var hh = (14 + ((i * 7 + ring * 3) % 5) * 3) * Math.min(1, q * 6) * (0.6 + 0.4 * fade);
        var g = ctx.createLinearGradient(0, fy - hh, 0, fy);
        g.addColorStop(0, "rgba(232,80,26,0)"); g.addColorStop(0.5, "rgba(255,150,40," + (0.8 * fade).toFixed(2) + ")"); g.addColorStop(1, "rgba(255,242,160," + (0.95 * fade).toFixed(2) + ")");
        ctx.fillStyle = g; ctx.fillRect(Math.round(fx) - 2, Math.round(fy - hh), 4, Math.round(hh));
      }
    }
  }
  // ケルベロスの特大の火球（2026-11-22）：ゴーレムの岩くらいの大きさ（r）。燃える玉と、うしろに長い炎の尾と火の粉
  function drawBigFireball(ctx, x, y, vx, vy, r) {
    var l = Math.sqrt(vx * vx + vy * vy) || 1, ux = vx / l, uy = vy / l, t = Date.now() / 1000;
    Render.rect(Math.round(x) - r, Math.round(y) + 20, r * 2, 4, "rgba(0,0,0,0.3)");   // 地面のかげ
    for (var i = 6; i >= 1; i--) {   // 尾：うしろほど小さく赤く
      var k = i / 6, jx = Math.sin(t * 30 + i * 1.7) * 2;
      Combat.glowDot(ctx, x - ux * i * r * 0.55 + jx * uy, y - uy * i * r * 0.55 - jx * ux, r * (1.2 - 0.12 * i), "#ffb030", "#c82a10", 0.55 * (1 - k * 0.6));
    }
    var p = 1 + 0.08 * Math.sin(t * 40);
    Combat.glowDot(ctx, x, y, r * 2.2 * p, "#ffe080", "#ff5a1a", 0.95);
    ctx.fillStyle = "#ffb030"; ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff2a0"; ctx.beginPath(); ctx.arc(x + ux * r * 0.2 - 1, y + uy * r * 0.2 - 2, r * 0.55, 0, Math.PI * 2); ctx.fill();
    for (var s2 = 0; s2 < 5; s2++) {   // 火の粉
      var ph = (t * 2.5 + s2 / 5) % 1, a = s2 * 1.3 + t;
      Render.rect(Math.round(x - ux * ph * r * 3 + Math.cos(a) * r), Math.round(y - uy * ph * r * 3 + Math.sin(a) * r - ph * 6), 2, 2, "rgba(255,220,120," + (1 - ph).toFixed(2) + ")");
    }
  }
  // ケルベロスの地獄の炎（2026-11-22）：自分の組の番が近づくと、床に赤い輪がうかび（show から）、だんだん明るくなる。
  // 立つと、黒い炎のふちどりの赤い火柱が、ふくらんで消える
  function drawHellFire(ctx, h, x, y, glow) {
    if (h.t < (h.show || 0)) return;
    if (h.t < h.warn) {
      var k = (h.t - (h.show || 0)) / Math.max(0.01, h.warn - (h.show || 0));
      ctx.fillStyle = "rgba(255,60,30," + (0.10 + 0.30 * k + 0.06 * Math.sin(glow * 18)).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,140,60," + (0.5 + 0.45 * k).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.stroke();
      var rr = h.r * (1 - k) + 2;   // ちぢむ輪：0になったときに火柱が立つ
      ctx.strokeStyle = "rgba(255,230,160,0.85)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    var q = Math.min(1, (h.t - h.warn) / h.erupt), fade = 1 - q, hh = 54 * Math.min(1, q * 5) * (0.5 + 0.5 * fade);
    var g = ctx.createLinearGradient(0, y - hh, 0, y);
    g.addColorStop(0, "rgba(120,20,20,0)"); g.addColorStop(0.35, "rgba(232,70,28," + (0.75 * fade).toFixed(2) + ")"); g.addColorStop(1, "rgba(255,230,140," + (0.95 * fade).toFixed(2) + ")");
    ctx.fillStyle = g; ctx.fillRect(Math.round(x - h.r * 0.7), Math.round(y - hh), Math.round(h.r * 1.4), Math.round(hh));
    for (var i = 0; i < 6; i++) {   // 火の粉
      var a = rnd(h.seed + i) * Math.PI * 2, rr2 = h.r * (0.3 + 0.7 * q);
      Render.rect(Math.round(x + Math.cos(a) * rr2), Math.round(y - q * 30 - rnd(h.seed * 2 + i) * 20), 2, 2, "rgba(255,200,90," + fade.toFixed(2) + ")");
    }
  }
  // ラフレシアの毒の霧：紫のもやが、ゆっくりうずを巻いてのこる。はじめはふわっと広がり、終わりぎわはうすくなる
  function drawFog(ctx, h, x, y, glow) {
    var q = (h.t - h.warn) / h.erupt, grow = Math.min(1, (h.t - h.warn) / 0.3), fade = q > 0.85 ? (1 - q) / 0.15 : 1, a = grow * fade;
    ctx.fillStyle = "rgba(110,50,150," + (0.28 * a).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, h.r * grow, h.r * 0.7 * grow, 0, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 7; i++) {   // もやのかたまり：まわりをゆっくり回る
      var an = glow * 0.6 + i * 0.9 + h.seed, rr = h.r * (0.25 + 0.5 * rnd(h.seed + i)) * grow;
      var bx = x + Math.cos(an) * rr, by = y + Math.sin(an) * rr * 0.7 - 3;
      ctx.fillStyle = "rgba(180,110,230," + (0.22 * a).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(bx, by, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (var j = 0; j < 6; j++) {   // のぼっていく泡（1点ずつ）
      var ph = (glow * 0.8 + j / 6 + h.seed) % 1, px = x + (rnd(h.seed * 3 + j) - 0.5) * h.r * 1.4, py = y + (rnd(h.seed * 5 + j) - 0.5) * h.r * 0.8 - ph * 10;
      Render.rect(Math.round(px), Math.round(py), 2, 2, "rgba(220,170,255," + ((1 - ph) * a).toFixed(2) + ")");
    }
  }

  // ドワーフキングの大地たたき（2026-11-07 保護者の案）：その場所が立つ 0.35 秒前から地面が光り、光の柱が立って消える。
  // 柱は根もとから先へ順に立つので、光が走ってくるように見える
  function drawQuake(ctx, h, x, y, glow) {
    var left = h.warn - h.t;
    if (left > 0) {
      if (left > 0.35) return;
      var k = 1 - left / 0.35;
      ctx.fillStyle = "rgba(255,200,90," + (0.15 + 0.35 * k).toFixed(2) + ")";
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r * (0.5 + 0.5 * k), h.r * 0.6 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,150,60," + (0.5 + 0.4 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    var q = Math.min(1, (h.t - h.warn) / h.erupt), fade = 1 - q;
    var hh = 64 * Math.min(1, q * 5), w = h.r * (1.3 - 0.5 * q);
    var g = ctx.createLinearGradient(0, y - hh, 0, y);
    g.addColorStop(0, "rgba(255,170,60,0)");
    g.addColorStop(0.35, "rgba(255,190,90," + (0.6 * fade).toFixed(2) + ")");
    g.addColorStop(1, "rgba(255,245,200," + (0.95 * fade).toFixed(2) + ")");
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - hh, w, hh);
    ctx.fillStyle = "rgba(255,255,235," + (0.9 * fade).toFixed(2) + ")"; ctx.fillRect(x - w / 6, y - hh * 0.8, w / 3, hh * 0.8);   // まんなかの白い芯
    ctx.fillStyle = "rgba(255,140,50," + (0.45 * fade).toFixed(2) + ")";
    ctx.beginPath(); if (ctx.ellipse) ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); else ctx.arc(x, y, h.r, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 4; i++) {   // 立ちのぼる光のつぶ
      var py = y - ((q * 1.5 + i * 0.25) % 1) * hh;
      Render.rect(Math.round(x + Math.sin(i * 2.3 + h.x) * w * 0.6), Math.round(py), 1, 2, "rgba(255,240,180," + fade.toFixed(2) + ")");
    }
  }
  // トマホーク（回る斧）：柄（木）と、刃（鋼）。rot は回る角度
  function drawTomahawk(ctx, x, y, rot) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(1.4, 1.4);
    ctx.fillStyle = "#140c1c"; ctx.fillRect(-7, -2, 14, 4); ctx.fillRect(2, -7, 7, 10);
    ctx.fillStyle = "#8a5a32"; ctx.fillRect(-6, -1, 12, 2);
    ctx.fillStyle = "#b8c0cc"; ctx.fillRect(3, -6, 5, 8);
    ctx.fillStyle = "#e6ecf4"; ctx.fillRect(7, -6, 1, 8);
    ctx.fillStyle = "#7a8494"; ctx.fillRect(3, 1, 5, 1);
    ctx.restore();
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

  // ---------- 氷牙獣の絵 ----------
  // こおりの息で凍った床：うす青の氷に白い光（とける前はうすくなる）
  function drawFrost(ctx, f, cam, glow) {
    var x = f.tx * TILE - Math.round(cam.x), y = f.ty * TILE - Math.round(cam.y);
    var a = Math.min(1, f.t / 0.25, (f.max - f.t) / 1.2);
    ctx.fillStyle = "rgba(190,230,250," + (0.55 * a).toFixed(2) + ")"; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255," + (0.6 * a).toFixed(2) + ")";
    var o = Math.floor(rnd(f.seed) * 8);
    ctx.fillRect(x + 2 + o, y + 3, 5, 1); ctx.fillRect(x + 3, y + 10 + (o % 3), 3, 1);
    if (Math.sin(glow * 3 + f.seed) > 0.85) Render.rect(x + 8 + (o % 5), y + 6, 1, 1, "rgba(255,255,255," + a.toFixed(2) + ")");
  }
  // こおりの息：予告は扇の形のうす青い光（だんだん濃く）。本番は、白と水色の息の粒が扇に広がる
  function drawCone(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y;
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.fillStyle = "rgba(150,220,255," + (0.12 + 0.25 * k + 0.05 * Math.sin(glow * 16)).toFixed(2) + ")";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, h.len, h.ang - h.spread, h.ang + h.spread); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(190,240,255," + (0.5 + 0.4 * k).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;   // 外へ広がっていく線：外のはしに着いたときに息が来る
      ctx.beginPath(); ctx.arc(x, y, h.len * k, h.ang - h.spread, h.ang + h.spread); ctx.stroke();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q;
    for (var i = 0; i < 40; i++) {
      var r1 = rnd(h.seed + i), r2 = rnd(h.seed + i * 3.7);
      var dd = h.len * Math.min(1, q * 1.6) * (0.25 + 0.75 * r1), aa = h.ang + (r2 * 2 - 1) * h.spread;
      var px = Math.round(x + Math.cos(aa) * dd), py = Math.round(y + Math.sin(aa) * dd);
      Render.rect(px, py, i % 3 ? 2 : 3, i % 3 ? 2 : 3, (i % 2 ? "rgba(255,255,255," : "rgba(159,244,255,") + fade.toFixed(2) + ")");
    }
  }
  // 大ダコの墨はき：予告はうすむらさきの扇（外へ広がる線が外のはしに着くと、はく）。本番は黒い墨のつぶが広がる
  // 紅蓮の竜の炎の息：予告は赤い扇。はくと、扇いっぱいに炎がふくらんで広がる
  function drawFireCone(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y;
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      var ac = h.ally ? "255,200,80" : "255,90,40", al2 = h.ally ? "255,220,120" : "239,91,91";   // 召喚士のケルベロスの炎（味方）は、金色の予告
      ctx.fillStyle = "rgba(" + ac + "," + (0.12 + 0.22 * k + 0.05 * Math.sin(glow * 16)).toFixed(2) + ")";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, h.len, h.ang - h.spread, h.ang + h.spread); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(" + al2 + "," + (0.4 + 0.5 * k).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,230,140,0.8)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, h.len * k, h.ang - h.spread, h.ang + h.spread); ctx.stroke();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q, reach = h.len * Math.min(1, q * 1.8);
    ctx.fillStyle = "rgba(240,106,24," + (0.4 * fade).toFixed(2) + ")";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, reach, h.ang - h.spread, h.ang + h.spread); ctx.closePath(); ctx.fill();
    for (var i = 0; i < 60; i++) {   // 火の玉のつぶ：手前は黄色、先は赤
      var r1 = rnd(h.seed + i), r2 = rnd(h.seed + i * 3.7);
      var dd = reach * (0.1 + 0.9 * r1), aa = h.ang + (r2 * 2 - 1) * h.spread * (0.3 + 0.7 * r1);
      var sz = Math.round(3 + (1 - r1) * 5), col = r1 < 0.35 ? "#fff2a0" : r1 < 0.7 ? "#ffb030" : "#e8501a";
      Combat.glowDot(ctx, x + Math.cos(aa) * dd, y + Math.sin(aa) * dd, sz, col, "#f06a18", fade);
    }
  }
  function drawInk(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y;
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.fillStyle = "rgba(120,80,160," + (0.12 + 0.25 * k + 0.05 * Math.sin(glow * 16)).toFixed(2) + ")";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, h.len, h.ang - h.spread, h.ang + h.spread); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(239,91,91," + (0.4 + 0.5 * k).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,200,255,0.8)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, h.len * k, h.ang - h.spread, h.ang + h.spread); ctx.stroke();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q, reach = h.len * Math.min(1, q * 1.6);
    ctx.fillStyle = "rgba(24,14,34," + (0.45 * fade).toFixed(2) + ")";   // 墨の広がり
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, reach, h.ang - h.spread, h.ang + h.spread); ctx.closePath(); ctx.fill();
    for (var i = 0; i < 80; i++) {
      var r1 = rnd(h.seed + i), r2 = rnd(h.seed + i * 3.7);
      var dd = reach * (0.15 + 0.85 * r1), aa = h.ang + (r2 * 2 - 1) * h.spread;
      var px = Math.round(x + Math.cos(aa) * dd), py = Math.round(y + Math.sin(aa) * dd), sz = i % 4 === 0 ? 8 : i % 3 ? 5 : 6;
      Render.rect(px - 1, py - 1, sz, sz, (i % 5 === 0 ? "rgba(106,58,152," : "rgba(20,12,28,") + (0.9 * fade).toFixed(2) + ")");
    }
  }
  // 大ダコの足のたたきつけ：予告は赤い帯。本番は、太い赤むらさきの足が帯にそってたたきつけられ、吸盤が見える。先で水しぶき
  function drawTentacle(ctx, h, cam, glow) {
    var x = h.x - cam.x, y = h.y - cam.y, x2 = x + h.ux * h.len, y2 = y + h.uy * h.len;
    ctx.save(); ctx.lineCap = "round";
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.strokeStyle = "rgba(239,91,91," + (0.12 + 0.25 * k + 0.05 * Math.sin(glow * 18)).toFixed(2) + ")"; ctx.lineWidth = h.w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,120,110," + (0.4 + 0.5 * k).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, al = q < 0.7 ? 1 : Math.max(0, (1 - q) / 0.3);
    var nx = -h.uy, ny = h.ux, bend = Math.sin(h.seed) * 8;
    var cx = (x + x2) / 2 + nx * bend, cy = (y + y2) / 2 + ny * bend;
    ctx.globalAlpha = al;
    ctx.strokeStyle = "#140c1c"; ctx.lineWidth = h.w * 0.75 + 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
    ctx.strokeStyle = "#a04a7a"; ctx.lineWidth = h.w * 0.75;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
    ctx.strokeStyle = "#d87ab0"; ctx.lineWidth = h.w * 0.3;
    ctx.beginPath(); ctx.moveTo(x - nx * 2, y - ny * 2); ctx.quadraticCurveTo(cx - nx * 2, cy - ny * 2, x2 - nx * 2, y2 - ny * 2); ctx.stroke();
    for (var i = 1; i < 7; i++) {   // 吸盤
      var t = i / 7, bx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * x2, by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * y2;
      Render.rect(Math.round(bx + nx * 3) - 1, Math.round(by + ny * 3) - 1, 3, 3, "#f8d0e8"); Render.rect(Math.round(bx + nx * 3), Math.round(by + ny * 3), 1, 1, "#a04a7a");
    }
    for (var j = 0; j < 8; j++) {   // 先の水しぶき
      var ja = j * Math.PI / 4 + h.seed, jr = 6 + q * 14;
      Render.rect(Math.round(x2 + Math.cos(ja) * jr) - 1, Math.round(y2 + Math.sin(ja) * jr * 0.6) - 1, 2, 2, j % 2 ? "#bff4ff" : "#4ab8d8");
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // 大ジャンプの落ちる場所：影がだんだん大きく濃く。着地の leapLock 秒前からは赤い「！」
  function drawLeapMark(ctx, h, x, y, glow) {
    if (h.t >= h.warn) return;
    var k = Math.min(1, h.t / h.warn), locked = h.from && h.warn - h.t <= h.from.def.leapLock;
    ctx.fillStyle = "rgba(20,30,50," + (0.15 + 0.35 * k).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, h.r * (0.4 + 0.6 * k), h.r * 0.6 * (0.4 + 0.6 * k), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = locked ? "rgba(255,80,64,0.9)" : "rgba(159,244,255," + (0.5 + 0.3 * Math.sin(glow * 14)).toFixed(2) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    if (locked) Render.text("！", x, y - h.r * 0.6 - 12, { size: 11, align: "center", bold: true, color: "#ff5040" });
  }
  // 氷のトゲ：予告は地面の小さな水色の輪とひび。本番は、地面から氷のトゲが3本つき出て、くだけて消える
  function drawSpike(ctx, h, x, y, glow) {
    if (h.t < h.warn) {
      var k = h.t / h.warn;
      ctx.fillStyle = "rgba(150,220,255," + (0.2 + 0.35 * k).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var q = (h.t - h.warn) / h.erupt, up = q < 0.2 ? q / 0.2 : q > 0.7 ? Math.max(0, (1 - q) / 0.3) : 1;
    ctx.fillStyle = "rgba(60,110,150," + (0.35 * up).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    [[-5, 12, 4], [0, 20, 5], [5, 14, 4]].forEach(function (v, i) {
      var bx = Math.round(x + v[0] + (rnd(h.seed + i) - 0.5) * 3), hh = Math.round(v[1] * up), w = v[2];
      if (hh < 1) return;
      ctx.fillStyle = "#3a6a96"; ctx.beginPath(); ctx.moveTo(bx - w - 1, y + 1); ctx.lineTo(bx, y - hh - 1); ctx.lineTo(bx + w + 1, y + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#bfe6f8"; ctx.beginPath(); ctx.moveTo(bx - w, y); ctx.lineTo(bx, y - hh); ctx.lineTo(bx + w, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(bx - 1, y - 1); ctx.lineTo(bx, y - hh + 1); ctx.lineTo(bx + 1, y - 1); ctx.closePath(); ctx.fill();
    });
  }
  // 大遠ぼえのつらら：予告は地面の影（だんだん濃く）と、上から落ちてくるつらら。本番は、くだけて氷のかけらが飛びちる
  function drawIcicleDrop(ctx, h, x, y, glow) {
    var img = icicleImg();
    if (h.t < h.warn) {
      var k = Math.min(1, h.t / h.warn), last = h.warn - h.t < 0.35;
      ctx.fillStyle = "rgba(20,40,70," + (0.12 + 0.3 * k).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(x, y, h.r * (0.5 + 0.5 * k), h.r * 0.6 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = last ? "rgba(255,90,70,0.85)" : "rgba(159,244,255," + (0.4 + 0.4 * k).toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      if (last) {   // 最後の 0.35 秒：上から大きなつららが落ちてくる（うしろに光のすじ）
        var fy = Math.round(y - (h.warn - h.t) / 0.35 * 170), ix = Math.round(x);
        for (var sl = 0; sl < 3; sl++) {
          var sx = ix + (sl - 1) * 6, sy = fy - img.height - 6;
          var g = ctx.createLinearGradient(0, sy - 40, 0, sy + 16);
          g.addColorStop(0, "rgba(220,245,255,0)"); g.addColorStop(1, "rgba(220,245,255,0.6)");
          ctx.fillStyle = g; ctx.fillRect(sx, sy - 40 + (sl % 2) * 8, 1, 56);
        }
        ctx.drawImage(img, ix - Math.floor(img.width / 2), fy - img.height + 2);
      }
      return;
    }
    var q = (h.t - h.warn) / h.erupt, fade = 1 - q;
    if (q < 0.5) {   // つきささったつららが、下から上へくだけていく
      var keep = Math.max(0, Math.round(img.height * (1 - q / 0.5) * 0.75));
      if (keep > 0) ctx.drawImage(img, 0, 0, img.width, keep, Math.round(x) - Math.floor(img.width / 2), Math.round(y) + 6 - keep, img.width, keep);
    }
    ctx.strokeStyle = "rgba(230,250,255," + (0.8 * fade).toFixed(2) + ")"; ctx.lineWidth = 2;   // 冷たい衝撃の輪
    ctx.beginPath(); ctx.ellipse(x, y, h.r * (0.6 + q * 0.8), h.r * 0.6 * (0.6 + q * 0.8), 0, 0, Math.PI * 2); ctx.stroke();
    for (var i = 0; i < 6; i++) {   // きらきら光る氷の粉
      var a = i / 6 * Math.PI * 2 + h.seed, R = h.r * (0.4 + q * 1.1);
      if (Math.sin(glow * 20 + i) > 0) Render.rect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.6 - q * 10), 1, 1, "rgba(255,255,255," + fade.toFixed(2) + ")");
    }
  }
  // 大遠ぼえのつららの絵（はば23・長さ70のドット絵。はじめの1回だけ作る）：上に雪のかたまり、左から光が当たって4段のかげ、
  // まんなかに白い光のすじ、中のひび、ところどころに小さなつららの枝。先はとがって、うすい水色
  var icicleCache = null;
  function icicleImg() {
    if (icicleCache) return icicleCache;
    var W = 23, H = 70, C = 11, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    function px(x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
    var OUT = "#1c3656", T = ["#f4fcff", "#c8eaf8", "#8cc4e4", "#5a94c4", "#3a6a9c"];
    function halfAt(y) {   // なめらかな太さ（ところどころ少しふくらむ）
      var f = (y - 7) / (H - 7);
      return Math.max(0, Math.round((C - 2) * Math.pow(1 - f, 0.9) + 1.2 * Math.sin(f * 10) * (1 - f)));
    }
    for (var y = 7; y < H; y++) {   // 本体
      var f = (y - 7) / (H - 7), half = halfAt(y);
      for (var x = C - half - 1; x <= C + half + 1; x++) {
        if (x === C - half - 1 || x === C + half + 1) { px(x, y, OUT); continue; }
        var t = half ? (x - (C - half)) / (2 * half) : 0.5;
        var col = t < 0.2 ? T[0] : t < 0.42 ? T[1] : t < 0.64 ? T[2] : t < 0.86 ? T[3] : T[4];
        if (f > 0.82) col = t < 0.5 ? "#e8f8ff" : "#b0e0f6";   // 先はうすい水色
        px(x, y, col);
      }
      if (f < 0.78 && half > 1) px(C - Math.round(half * 0.5), y, "#ffffff");   // 光のすじ
      if (f > 0.15 && f < 0.6 && half > 3 && y % 9 < 3) px(C + Math.round(half * 0.35), y, "rgba(255,255,255,0.55)");   // 奥の光
    }
    px(C, H - 1, OUT);
    for (var cr = 0; cr < 3; cr++) {   // 中のひび
      var cy = 16 + cr * 12, cx = C + (cr % 2 ? 2 : -1);
      for (var j = 0; j < 4; j++) px((cx + (cr % 2 ? -j : j) * 0.6) | 0, cy + j, "rgba(255,255,255,0.7)");
    }
    [[2, 5], [20, 4]].forEach(function (b) {   // 雪のふちからぶら下がる、小さなつらら
      for (var k = 0; k < b[1]; k++) {
        px(b[0], 9 + k, k === b[1] - 1 ? OUT : T[1]); px(b[0] - 1, 9 + k, OUT); px(b[0] + 1, 9 + k, k < b[1] - 2 ? T[3] : OUT);
      }
    });
    for (var sx = 0; sx < W; sx++) {   // 上の雪のかたまり（まるい山の形。下のふちは少しでこぼこ）
      var dd = (sx - C) / (C + 0.5), top = 1 + Math.round(4 * dd * dd), bot = 8 + (rnd(sx * 2.1) > 0.6 ? 1 : 0);
      for (var sy = top; sy <= bot; sy++) px(sx, sy, sy === top || sy === bot ? OUT : sy === top + 1 ? "#ffffff" : sy >= bot - 1 ? "#a8bcd0" : sy >= bot - 2 ? "#d0deec" : "#eef6fc");
    }
    icicleCache = cv;
    return cv;
  }
  // 氷牙獣：大オオカミの絵（52×40）を氷の色にして、1.3倍で描く。空にいるときは高く、よろいを着ているときは白い光と氷のかけら
  var FANG_SCALE = 1.3;
  function drawIceFang(ctx, e, x, y, glow) {
    var d = e.def, lift = 0, frame;
    if (e.state === "air") { var k = 1 - Math.max(0, e.t) / d.leapAir; lift = Math.round(Math.sin(k * Math.PI) * 80); }
    var moving = e.state === "chase" || e.state === "charge" || e.state === "air", ph = Math.sin(e.walk || 0);
    frame = e.state === "air" ? "walkA" : !moving ? "stand" : ph > 0 ? "walkA" : "walkB";
    var crouch = e.state === "crouch" ? 3 : 0;
    var sh = e.state === "air" ? Math.max(0.3, 1 - lift / 100) : 1;   // 影（空にいるときは小さく）
    Render.rect(Math.round(x - 22 * sh), y + 10, Math.round(44 * sh), 6, "rgba(0,0,0,0.35)");
    ctx.save();
    ctx.translate(x, y + 14 - lift + crouch); ctx.scale(FANG_SCALE, FANG_SCALE - crouch * 0.03);
    Monsters.drawBoss(ctx, e, 0, 0, frame);
    if (e.armor > 0) {   // 氷のよろい：白い光を重ねる
      var fl = e.flash; e.flash = 1;
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(glow * 6);
      Monsters.drawBoss(ctx, e, 0, 0, frame);
      ctx.globalAlpha = 1; e.flash = fl;
    }
    ctx.restore();
    if (e.armor > 0) {   // まわりを回る氷のかけら
      for (var i = 0; i < 5; i++) {
        var a = glow * 1.6 + i / 5 * Math.PI * 2, cx = Math.round(x + Math.cos(a) * 30), cy = Math.round(y - 14 - lift + Math.sin(a) * 10);
        Render.rect(cx - 1, cy - 3, 3, 6, "#bfe6f8"); Render.rect(cx, cy - 2, 1, 3, "#ffffff");
      }
    }
    if (e.state === "warn") Render.text("！", x, y - 46 - lift, { size: 12, align: "center", bold: true, color: "#ef5b5b" });
    if (e.state === "howl") Render.text("ウォォーン", x, y - 46, { size: 8, align: "center", bold: true, color: "#ffd24a" });
    if (e.state === "bighowl") Render.text("ウォォォーーン！", x, y - 48, { size: 9, align: "center", bold: true, color: "#9ff4ff" });
    if (e.state === "breathWarn" || e.state === "breath") {   // 口もとに冷たい息
      var mx = x + e.face.x * 30, my = y - 18 + e.face.y * 8;
      Combat.glowDot(ctx, mx, my, 4 + Math.sin(glow * 30), "#ffffff", "#9ff4ff", 0.8);
    }
  }

  // ボスの絵
  function draw(e, cam, glow) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y), d = e.def, ctx = Render.ctx;
    if (d.kind === "icefang_boss") drawIceFang(ctx, e, x, y, glow);
    else if (d.kind === "wolf_boss") {
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
        var sx = x - 12, sy = y + 14 - 4 + bob - 46 + 3;   // 杖の先の頭がい骨（2026-10-30 描き直しで1点左へ）
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
    } else if (d.kind === "golem_boss" || d.kind === "snowgolem_boss") {
      // ゴーレム（48×52）：足もとは y＋16。スノーゴーレムは同じ絵の雪の色（monsters.js の BOSS_PAL.snowgolem_boss）
      if (e.state === "pile") { drawSnowPile(ctx, e, x, y, glow); return; }
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
      if (e.state === "lift" && !(e.thrown > 0)) {
        if (d.snow) drawSnowball(ctx, x, y - 44, d.ballR, 0);   // 頭の上に持ち上げた雪玉
        else drawRock(ctx, x, y - 44, d.rockR, 0);              // 頭の上に持ち上げた岩
      }
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
    } else if (d.kind === "bandit_boss") {
      // 盗賊のおかしら（48×48、右向きの絵）：足もとは y＋14。斬ったあと・走りぬけたあとは「攻撃後」の絵。歩くと少し上下にゆれる
      var bph = Math.sin(e.walk || 0), bob2 = e.state === "chase" && Math.abs(bph) > 0.5 ? -1 : 0;
      Render.rect(x - 14, y + 10, 28, 5, "rgba(0,0,0,0.35)");
      if (e.state === "windup" || e.state === "throw" || e.state === "warn") Combat.glowDot(ctx, x, y - 8, 22, "#ffffff", e.state === "throw" ? "#ff9a4d" : "#ef5b5b", 0.25 + 0.15 * Math.sin(glow * 20));
      if (e.state === "charge") {   // 走っているあいだの残像
        ctx.save(); ctx.globalAlpha = 0.3;
        Monsters.drawBoss(ctx, e, x - e.aim.x * 14, y + 14 - e.aim.y * 10, "stand");
        ctx.restore();
      }
      Monsters.drawBoss(ctx, e, x, y + 14 + bob2, e.pose > 0 || e.state === "charge" ? "attack" : "stand");
      if (e.slashT > 0) Combat.drawSlash(ctx, x, y - 6, e.aim || e.face, 1.1, d.reach + 14, "#ffe7a0", 1 - e.slashT / 0.2, e.slashFlip);
      if (e.state === "windup" || e.state === "warn") Render.text("！", x, y - 44, { size: 11, align: "center", bold: true, color: e.state === "warn" ? "#ef5b5b" : "#ffd24a" });
    } else if (d.kind === "dwarf_boss") {
      // ドワーフキング（43×48、正面向き）：足もとは y＋14。たたいたあとは「攻撃」の絵
      Render.rect(x - 16, y + 9, 32, 6, "rgba(0,0,0,0.35)");
      if (e.state === "slam") {   // 大地たたきの構え：まわりの赤い輪が、だんだん濃くなる
        var kq = 1 - Math.max(0, e.t) / d.slamWarn;
        ctx.fillStyle = "rgba(239,91,91," + (0.08 + 0.22 * kq).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(x, y + 6, d.slamNear, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(239,91,91," + (0.4 + 0.5 * kq).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y + 6, d.slamNear, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.state === "windup" || e.state === "toss") Combat.glowDot(ctx, x, y - 10, 22, "#ffffff", "#ef5b5b", 0.25 + 0.15 * Math.sin(glow * 20));
      if (e.guarding) {   // 盾がまえ：向いている側に、銀の光の弧（ここからの攻撃は減る）
        var ga0 = Math.atan2(e.face.y, e.face.x);
        ctx.strokeStyle = "rgba(220,228,240," + (0.55 + 0.25 * Math.sin(glow * 12)).toFixed(2) + ")"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y - 6, e.r + 12, ga0 - 1.1, ga0 + 1.1); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y - 6, e.r + 14, ga0 - 0.8, ga0 + 0.8); ctx.stroke();
      }
      var dshake = e.state === "tired" ? Math.round(Math.sin(glow * 20)) : 0;
      Monsters.drawBoss(ctx, e, x + dshake, y + 14, e.pose > 0 ? "attack" : "stand");
      if (e.swingT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 6, e.aim, 0.9, d.reach + e.r, "#e6ecf4", 1 - e.swingT / 0.22, false);
      if (e.state === "toss") drawTomahawk(ctx, x + (e.face.x < -0.2 ? 14 : -14), y - 40, -0.6 + (1 - e.t / d.axeWindup) * 0.8 * (e.face.x < -0.2 ? -1 : 1));   // 振りかぶったトマホーク
      if (e.state === "windup" || e.state === "slam" || e.state === "toss") Render.text("！", x, y - 50, { size: 11, align: "center", bold: true, color: e.state === "windup" ? "#ffd24a" : "#ef5b5b" });
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる
        for (var ds = 0; ds < 3; ds++) {
          var da2 = glow * 4 + ds * 2.1, dx2 = Math.round(x + Math.cos(da2) * 12), dy2 = Math.round(y - 44 + Math.sin(da2) * 3);
          Render.rect(dx2, dy2 - 1, 1, 3, "#ffe066"); Render.rect(dx2 - 1, dy2, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "spider_boss") {
      // 水晶の大グモ（64×46、正面）：足もとは y＋14。天井にいるあいだは、糸にぶら下がって上にいる（lift：0〜1）
      var lift = e.state === "climb" || e.state === "ceil" ? (e.lift || 0) : 0, up = Math.round(lift * 64);
      Render.rect(x - 24, y + 9, 48, 6, "rgba(0,0,0," + (0.35 * (1 - lift)).toFixed(2) + ")");
      if (lift > 0) {   // 天井からの糸
        ctx.strokeStyle = "rgba(232,240,255,0.7)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - up - 40); ctx.lineTo(x, y - 260); ctx.stroke();
      }
      var sf = "stand", sph = Math.sin(e.walk || 0);
      if (e.state === "chase") sf = sph > 0.3 ? "walkA" : sph < -0.3 ? "walkB" : "stand";
      if (e.state === "windup" || e.state === "web" || e.state === "beamWarn" || e.state === "beam" || e.state === "call" || e.biteT > 0) sf = "rear";
      var sshake = e.state === "tired" ? Math.round(Math.sin(glow * 20)) : 0;
      ctx.save();
      if (lift > 0.5) ctx.globalAlpha = ctx.globalAlpha * Math.max(0.55, 1 - (lift - 0.5));   // 天井では少しうすく（攻撃が当たらない）
      Monsters.drawBoss(ctx, e, x + sshake, y + 14 - up, sf);
      ctx.restore();
      if (e.state === "beamWarn" || e.state === "beam") {   // おしりの水晶が光る
        var kbw = e.state === "beam" ? 1 : 1 - Math.max(0, e.t) / d.beamWarn;
        Combat.glowDot(ctx, x, y - 18, 10 + kbw * 12, "#ffffff", "#7ad8f8", 0.3 + 0.6 * kbw);
      }
      if (e.state === "web") {   // 口の前に糸のかたまり
        var kw2 = 1 - Math.max(0, e.t) / d.webWindup;
        drawWeb(ctx, x + e.aim.x * 10, y + 4 + e.aim.y * 6, 2 + kw2 * 3);
      }
      if (e.biteT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 2, e.aim, 0.7, d.reach + e.r, "#ffd0d0", 1 - e.biteT / 0.2, false);
      if (e.state === "windup" || e.state === "beamWarn") Render.text("！", x, y - 50, { size: 11, align: "center", bold: true, color: e.state === "beamWarn" ? "#ef5b5b" : "#ffd24a" });
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる
        for (var ss = 0; ss < 3; ss++) {
          var sa3 = glow * 4 + ss * 2.1, sx3 = Math.round(x + Math.cos(sa3) * 14), sy3 = Math.round(y - 40 + Math.sin(sa3) * 3);
          Render.rect(sx3, sy3 - 1, 1, 3, "#ffe066"); Render.rect(sx3 - 1, sy3, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "octo_boss") {
      // 大ダコ（60×46、正面）：足もとは y＋14。たたきつけ・足をもぐらせるときは「raise」、墨はきは「ink」の絵
      Render.rect(x - 24, y + 9, 48, 7, "rgba(0,0,0,0.35)");
      if (e.state === "windup" || e.state === "slamWarn" || e.state === "inkWarn" || e.state === "arms")
        Combat.glowDot(ctx, x, y - 12, 26, "#ffffff", e.state === "inkWarn" ? "#9a5ad0" : "#ef5b5b", 0.22 + 0.15 * Math.sin(glow * 20));
      var of = "stand", oph = Math.sin(e.walk || 0);
      if (e.state === "chase") of = oph > 0.3 ? "walkA" : oph < -0.3 ? "walkB" : "stand";
      else if (e.state === "recover" || e.state === "windup") of = Math.sin(glow * 6) > 0 ? "walkA" : "walkB";
      if (e.state === "slamWarn" || e.state === "slam" || e.state === "arms") of = "raise";
      if (e.state === "inkWarn" || e.state === "ink") of = "ink";
      var oshake = e.state === "tired" || e.state === "slamWarn" ? Math.round(Math.sin(glow * 24)) : 0;
      Monsters.drawBoss(ctx, e, x + oshake, y + 14, of);
      if (e.sweepT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 6, e.aim, 0.9, d.reach + e.r, "#f0a0d0", 1 - e.sweepT / 0.22, e.sweepFlip);
      if (e.state === "windup" || e.state === "slamWarn") Render.text("！", x, y - 50, { size: 11, align: "center", bold: true, color: e.state === "slamWarn" ? "#ef5b5b" : "#ffd24a" });
      if (e.arms && e.arms.length) {   // 出ている足の数（全部切るとひるむ）
        var aleft = e.arms.filter(function (a) { return !a.dead && a.hp > 0; }).length;
        Render.text("足 のこり " + aleft, x, y + 26, { size: 8, align: "center", bold: true, color: "#f8c8e4" });
      }
      if (e.state === "tired") {   // ひるんでいる：頭の上で、黄色い星がまわる
        for (var os2 = 0; os2 < 3; os2++) {
          var oa2 = glow * 4 + os2 * 2.1, ox2 = Math.round(x + Math.cos(oa2) * 16), oy2 = Math.round(y - 42 + Math.sin(oa2) * 3);
          Render.rect(ox2, oy2 - 1, 1, 3, "#ffe066"); Render.rect(ox2 - 1, oy2, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "giant_boss") {
      // 炎の巨人（56×60、正面）：足もとは y＋14。地ならし・岩投げは「raise」、火が消えてふらつくときは「tired」
      var burning = e.flame > 0;
      if (burning) {   // 炎のよろい：足もとに熱の輪（この中にいると熱い）と、体のまわりの大きな炎
        var hr = e.r + d.heatR;
        ctx.fillStyle = "rgba(255,110,40," + (0.10 + 0.05 * Math.sin(glow * 8)).toFixed(2) + ")";
        ctx.beginPath(); ctx.ellipse(x, y + 8, hr, hr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,150,60,0.55)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + 8, hr, hr * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
      Render.rect(x - 22, y + 9, 44, 7, "rgba(0,0,0,0.35)");
      if (e.state === "windup" || e.state === "stompWarn" || e.state === "lift" || e.state === "ignite")
        Combat.glowDot(ctx, x, y - 22, 28, "#ffffff", e.state === "lift" || e.state === "ignite" ? "#ffb030" : "#ef5b5b", 0.22 + 0.15 * Math.sin(glow * 20));
      var gfr = Math.sin(glow * 10) > 0 ? "stand" : "stand2", gph = Math.sin(e.walk || 0);
      if (e.state === "chase") gfr = gph > 0.3 ? "walkA" : gph < -0.3 ? "walkB" : gfr;
      if (e.state === "stompWarn" || e.state === "stomp" || e.state === "lift" || e.state === "ignite") gfr = Math.sin(glow * 10) > 0 ? "raise" : "raise2";
      if (e.state === "tired") gfr = "tired";
      var gsh = e.state === "tired" || e.state === "stompWarn" || e.state === "ignite" ? Math.round(Math.sin(glow * 24)) : 0;
      var gy = e.state === "stomp" ? y + 16 : y + 14;
      Monsters.drawBoss(ctx, e, x + gsh, gy, gfr);
      if (burning) {   // 体から立ちのぼる炎
        // 炎の舌：かた・うで・こしのまわりから、ゆらゆら立ちのぼる（外が赤、中が黄色）
        var FL = [[-24, -26], [-17, -34], [-8, -40], [8, -40], [17, -34], [24, -26], [-26, -12], [26, -12], [-14, -16], [14, -16]];
        for (var gf = 0; gf < FL.length; gf++) {
          var gx = x + FL[gf][0], gb = gy + FL[gf][1], gh = 10 + (gf % 3) * 3 + Math.sin(glow * 12 + gf * 1.7) * 3, sw2 = Math.sin(glow * 9 + gf * 2.3) * 3;
          for (var lay = 0; lay < 2; lay++) {
            var fw = lay ? 2 : 4, fh = lay ? gh * 0.6 : gh;
            ctx.fillStyle = lay ? "rgba(255,242,160,0.85)" : "rgba(240,106,24,0.75)";
            ctx.beginPath(); ctx.moveTo(gx - fw, gb);
            ctx.quadraticCurveTo(gx - fw * 1.2, gb - fh * 0.55, gx + sw2, gb - fh);
            ctx.quadraticCurveTo(gx + fw * 1.2, gb - fh * 0.55, gx + fw, gb);
            ctx.closePath(); ctx.fill();
          }
        }
        Render.text("炎 " + Math.max(0, d.flameHits - (e.flameHit || 0)), x, y + 26, { size: 8, align: "center", bold: true, color: "#ffb84a" });
      }
      if (e.state === "lift") {   // 頭の上の溶岩の岩（だんだん大きく光る）
        var lk = 1 - Math.max(0, e.t) / d.ballLift;
        Combat.glowDot(ctx, x, gy - 64, 12 + lk * 4, "#ffe066", "#f06a18", 0.6 + 0.3 * lk);
        ctx.fillStyle = "#3a1610"; ctx.beginPath(); ctx.arc(x, gy - 64, 8, 0, Math.PI * 2); ctx.fill();
        Render.rect(x - 5, gy - 67, 5, 1, "#ffb030"); Render.rect(x, gy - 62, 4, 1, "#f06a18"); Render.rect(x - 2, gy - 70, 3, 1, "#fff2a0"); Render.rect(x + 3, gy - 66, 1, 3, "#ffb030");
      }
      if (e.punchT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 8, e.aim, 0.9, d.reach + e.r, "#ffb030", 1 - e.punchT / 0.22, e.punchFlip);
      if (e.state === "windup" || e.state === "stompWarn") Render.text("！", x, y - 62, { size: 11, align: "center", bold: true, color: e.state === "stompWarn" ? "#ef5b5b" : "#ffd24a" });
      if (e.state === "tired") {   // ふらついている：白いけむりと、頭の上で黄色い星
        for (var gs = 0; gs < 4; gs++) { var sp2 = (glow * 0.8 + gs / 4) % 1; Render.rect(Math.round(x - 6 + gs * 4 + Math.sin(sp2 * 6 + gs) * 2), Math.round(y - 44 - sp2 * 18), 3, 3, "rgba(220,224,230," + (0.7 * (1 - sp2)).toFixed(2) + ")"); }
        for (var gt = 0; gt < 3; gt++) {
          var ga = glow * 4 + gt * 2.1, gx2 = Math.round(x + Math.cos(ga) * 14), gy2 = Math.round(y - 48 + Math.sin(ga) * 3);
          Render.rect(gx2, gy2 - 1, 1, 3, "#ffe066"); Render.rect(gx2 - 1, gy2, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "fdragon_boss") {
      // 紅蓮の竜（78×62、横向き。絵は左向きで、右を向くときは裏返す）：足もとは y＋14。空にいるあいだは alt だけ上に描き、地面にかげ
      var alt = Math.round(e.alt || 0), flying = alt > 0, fdir = e.face.x > 0 ? 1 : -1;
      Render.rect(x - 28 + Math.round(alt * 0.3), y + 9, 56 - Math.round(alt * 0.6), 7, "rgba(0,0,0," + (flying ? 0.25 : 0.35) + ")");
      if (e.state === "windup" || e.state === "fbreathWarn" || e.state === "roar")
        Combat.glowDot(ctx, x, y - 22 - alt, 26, "#ffffff", e.state === "roar" ? "#ffb030" : "#ef5b5b", 0.22 + 0.15 * Math.sin(glow * 20));
      var fy = y + 14 - alt, mouthX = x + fdir * 34, mouthY = fy - 44;   // 口のあたり（炎がたまるところ）
      var ff = "stand", fph = Math.sin(e.walk || 0);
      if (e.state === "chase") ff = fph > 0.3 ? "walkA" : fph < -0.3 ? "walkB" : "stand";
      if (e.state === "windup" || e.biteT > 0 || e.state === "fbreathWarn" || e.state === "fbreath") ff = "open";
      if (e.state === "roar") ff = "roar";
      if (flying) ff = e.state === "dvdash" ? "flyB" : Math.sin(glow * 14) > 0 ? "flyA" : "flyB";   // 空では、つばさを上げ下げ
      if (e.state === "tired") ff = "tired";
      var fshake = e.state === "roar" ? Math.round(Math.sin(glow * 30)) : 0;
      Monsters.drawBoss(ctx, e, x + fshake, fy, ff);
      if (e.state === "fbreathWarn" || e.state === "fbreath") {   // 口に炎がたまる
        var kf = e.state === "fbreath" ? 1 : 1 - Math.max(0, e.t) / (d.fbreathWarn + 0.4);
        Combat.glowDot(ctx, mouthX, mouthY, 6 + kf * 8, "#fff2a0", "#f06a18", 0.4 + 0.5 * kf);
      }
      if (e.biteT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 6, e.aim, 0.7, d.reach + e.r, "#ffb030", 1 - e.biteT / 0.2, false);
      if (e.state === "windup" || e.state === "fbreathWarn" || e.state === "dvwarn") Render.text("！", x, fy - 72, { size: 11, align: "center", bold: true, color: e.state === "windup" ? "#ffd24a" : "#ef5b5b" });
      if (e.state === "tired") {
        for (var fs = 0; fs < 3; fs++) {
          var fa = glow * 4 + fs * 2.1, fx = Math.round(x + fdir * 26 + Math.cos(fa) * 10), fy2 = Math.round(fy - 32 + Math.sin(fa) * 3);   // 下げた頭の上
          Render.rect(fx, fy2 - 1, 1, 3, "#ffe066"); Render.rect(fx - 1, fy2, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "wdragon_boss") {
      // 水竜（64×56、正面）：足もとは y＋14。もぐる・飛び出すときは、下から水にしずむ（sink：0〜1）
      var sink = 0;
      if (e.state === "sink") sink = 1 - Math.max(0, e.t) / d.waveSink;
      else if (e.state === "under") sink = 1;
      else if (e.state === "rise") sink = Math.max(0, e.t) / d.riseWarn;
      if (sink < 1) {
        Render.rect(x - 26, y + 9, 52, 7, "rgba(0,0,0," + (0.35 * (1 - sink)).toFixed(2) + ")");
        if (e.state === "windup" || e.state === "jetWarn")
          Combat.glowDot(ctx, x, y - 26, 22, "#ffffff", e.state === "jetWarn" ? "#5aa9ff" : "#ef5b5b", 0.22 + 0.15 * Math.sin(glow * 20));
        var wf = "stand", wph = Math.sin(e.walk || 0);
        if (e.state === "chase") wf = wph > 0.3 ? "walkA" : wph < -0.3 ? "walkB" : "stand";
        if (e.state === "windup" || e.biteT > 0 || e.state === "jetWarn" || e.state === "jet") wf = "open";
        if (e.state === "sink" || e.state === "rise") wf = "roar";
        if (e.state === "tired") wf = "tired";
        var wshake = e.state === "sink" ? Math.round(Math.sin(glow * 30)) : 0;
        ctx.save();
        if (sink > 0) { ctx.beginPath(); ctx.rect(x - 40, y + 14 - 80, 80, 80); ctx.clip(); }
        Monsters.drawBoss(ctx, e, x + wshake, y + 14 + Math.round(sink * 56), wf);
        ctx.restore();
        if (e.state === "jetWarn" || e.state === "jet") {   // 口に水がたまる
          var kj = e.state === "jet" ? 1 : 1 - Math.max(0, e.t) / (d.jetWarn + 0.6);
          Combat.glowDot(ctx, x, y - 22, 6 + kj * 8, "#ffffff", "#5aa9ff", 0.4 + 0.5 * kj);
        }
        if (e.biteT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 6, e.aim, 0.7, d.reach + e.r, "#c8ecff", 1 - e.biteT / 0.2, false);
        if (e.state === "windup" || e.state === "jetWarn") Render.text("！", x, y - 58, { size: 11, align: "center", bold: true, color: e.state === "jetWarn" ? "#ef5b5b" : "#ffd24a" });
        if (e.state === "tired") {
          for (var ws = 0; ws < 3; ws++) {
            var wa = glow * 4 + ws * 2.1, wx = Math.round(x + Math.cos(wa) * 14), wy = Math.round(y - 50 + Math.sin(wa) * 3);
            Render.rect(wx, wy - 1, 1, 3, "#ffe066"); Render.rect(wx - 1, wy, 3, 1, "#ffe066");
          }
        }
      }
      if (sink > 0 || e.splash > 0) {   // 水面の輪としぶき
        for (var wr = 0; wr < 2; wr++) {
          var rr2 = 14 + ((glow * 30 + wr * 12) % 24);
          ctx.strokeStyle = "rgba(200,236,255," + (0.6 * (1 - (rr2 - 14) / 24)).toFixed(2) + ")"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(x, y + 10, rr2, rr2 * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "rgba(58,138,200,0.45)"; ctx.beginPath(); ctx.ellipse(x, y + 10, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
        if (e.splash > 0) for (var sp2 = 0; sp2 < 10; sp2++) {
          var sa = sp2 / 10 * Math.PI * 2, sr = 10 + (1 - e.splash / 0.6) * 18;
          Render.rect(Math.round(x + Math.cos(sa) * sr), Math.round(y + 6 + Math.sin(sa) * sr * 0.4 - Math.abs(Math.sin(sa * 2)) * 10 * e.splash), 2, 2, "#e8f6ff");
        }
      }
    } else if (d.kind === "crab_boss") {
      // ヨロイガニ（56×38、正面）：足もとは y＋12。はさむときは「pinch」、からにこもる・回るときは「shell」の絵
      Render.rect(x - 22, y + 8, 44, 6, "rgba(0,0,0,0.35)");
      var spin = e.state === "charge" || e.state === "warn", inShell = e.shelled || spin;
      if (e.state === "windup" || e.state === "bubble") Combat.glowDot(ctx, x, y - 10, 24, "#ffffff", e.state === "bubble" ? "#5aa9ff" : "#ef5b5b", 0.22 + 0.15 * Math.sin(glow * 20));
      if (e.shelled) {   // からごもり：まわりに銀の光（打のほかはほとんど効かない）
        ctx.strokeStyle = "rgba(220,228,240," + (0.45 + 0.25 * Math.sin(glow * 10)).toFixed(2) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y - 4, e.r + 12, e.r + 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      var cf = "stand", cph = Math.sin(e.walk || 0);
      if (e.state === "chase") cf = cph > 0.3 ? "walkA" : cph < -0.3 ? "walkB" : "stand";
      if (e.state === "windup" || e.snipT > 0) cf = "pinch";
      if (inShell) cf = "shell";
      var cshake = e.state === "tired" || (e.state === "warn") ? Math.round(Math.sin(glow * 24)) : 0;
      if (e.state === "tired" && e.cracked > 0) {   // われて、ひっくりかえっている：絵をさかさまに
        ctx.save(); ctx.translate(x + cshake, y - 7); ctx.scale(1, -1);
        Monsters.drawBoss(ctx, e, 0, 19, "stand");
        ctx.restore();
      } else Monsters.drawBoss(ctx, e, x + cshake, y + 12, cf);
      if (inShell && e.crack > 0) {   // ひび
        ctx.strokeStyle = "#140c1c"; ctx.lineWidth = 1; ctx.beginPath();
        for (var ck = 0; ck < e.crack; ck++) {
          var cx0 = x - 12 + ck * 8, cy0 = y - 10;
          ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + 3, cy0 + 5); ctx.lineTo(cx0 - 1, cy0 + 9); ctx.lineTo(cx0 + 2, cy0 + 14);
        }
        ctx.stroke();
      }
      if (e.state === "charge") {   // 回っている：からのまわりに、白い回転の線
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2;
        for (var sl = 0; sl < 2; sl++) { var sa0 = glow * 18 + sl * Math.PI; ctx.beginPath(); ctx.ellipse(x, y - 4, e.r + 6, e.r, 0, sa0, sa0 + 1.2); ctx.stroke(); }
      }
      if (e.state === "bubble") {   // 口の前に、あわがふくらむ
        var kbb = 1 - Math.max(0, e.t) / d.bubbleWindup;
        drawBubble(ctx, x + e.aim.x * 10, y - 12 + e.aim.y * 6, 2 + kbb * 5, glow);
      }
      if (e.snipT > 0 && e.aim) Combat.drawSlash(ctx, x, y - 6, e.aim, 0.8, d.reach + e.r, "#ffd0c0", 1 - e.snipT / 0.2, e.snipFlip);
      if (e.state === "windup" || e.state === "warn") Render.text("！", x, y - 46, { size: 11, align: "center", bold: true, color: e.state === "warn" ? "#ef5b5b" : "#ffd24a" });
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる
        for (var cs2 = 0; cs2 < 3; cs2++) {
          var ca2 = glow * 4 + cs2 * 2.1, cx2 = Math.round(x + Math.cos(ca2) * 14), cy2 = Math.round(y - 36 + Math.sin(ca2) * 3);
          Render.rect(cx2, cy2 - 1, 1, 3, "#ffe066"); Render.rect(cx2 - 1, cy2, 3, 1, "#ffe066");
        }
      }
    } else if (d.kind === "raff_boss") {
      // ラフレシア（56×44、正面）：足もとは y＋16。吸いこみ・毒の息・種を吐くときは、まんなかが開いた「攻撃」の絵
      Render.rect(x - 24, y + 10, 48, 7, "rgba(0,0,0,0.35)");
      if (e.state === "breath") {   // 毒の息の予告：まわりの赤い輪が、だんだん濃くなる
        var kb2 = 1 - Math.max(0, e.t) / d.breathWarn;
        ctx.fillStyle = "rgba(239,91,91," + (0.1 + 0.25 * kb2).toFixed(2) + ")";
        ctx.beginPath(); ctx.ellipse(x, y + 4, d.breathRadius, d.breathRadius * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(239,91,91," + (0.5 + 0.4 * kb2).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + 4, d.breathRadius, d.breathRadius * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.state === "windup") {   // つるのむちの構え：とどく範囲が黄色く
        var kwh = 1 - Math.max(0, e.t) / d.windup;
        ctx.strokeStyle = "rgba(255,210,74," + (0.3 + 0.5 * kwh).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + 4, d.whipReach + e.r, (d.whipReach + e.r) * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
      }
      var open = e.state === "inhale" || e.state === "breath" || e.state === "seed" || e.puffT > 0 || e.breathFx > 0;
      var sway = e.state === "inhale" ? Math.round(Math.sin(glow * 30)) : 0;
      Monsters.drawBoss(ctx, e, x + sway, y + 16, (e.bloomed ? "big" : "") + (open ? "open" : "stand"));
      if (e.state === "inhale") {   // 吸いこみ：まわりから、まんなかへ流れこむ風の線
        for (var iw = 0; iw < 12; iw++) {
          var ia = iw / 12 * Math.PI * 2 + glow, ip = (glow * 1.6 + iw * 0.37) % 1, ir = 90 * (1 - ip) + 14;
          Render.rect(Math.round(x + Math.cos(ia) * ir), Math.round(y - 6 + Math.sin(ia) * ir * 0.7), 3, 1, "rgba(240,250,255," + (0.3 + 0.6 * ip).toFixed(2) + ")");
        }
      }
      if (e.breathFx > 0) {   // 毒の息：紫の輪が広がる
        e.breathFx -= 1 / 60;
        var kbf = 1 - e.breathFx / 0.5;
        ctx.fillStyle = "rgba(150,70,200," + (0.4 * (1 - kbf)).toFixed(2) + ")";
        ctx.beginPath(); ctx.ellipse(x, y + 4, d.breathRadius * (0.4 + 0.6 * kbf), d.breathRadius * 0.75 * (0.4 + 0.6 * kbf), 0, 0, Math.PI * 2); ctx.fill();
        for (var bp = 0; bp < 16; bp++) { var bpa = bp / 16 * Math.PI * 2, bpr = d.breathRadius * kbf; Render.rect(Math.round(x + Math.cos(bpa) * bpr), Math.round(y + 4 + Math.sin(bpa) * bpr * 0.75), 3, 3, "rgba(200,140,240," + (1 - kbf).toFixed(2) + ")"); }
      }
      if (e.whipT > 0) {   // つるのむち：まわりを回る緑の弧
        var kwp = 1 - e.whipT / 0.3, wr = d.whipReach + e.r;
        ctx.strokeStyle = "rgba(94,168,74," + (1 - kwp).toFixed(2) + ")"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y + 2, wr, wr * 0.75, 0, kwp * 6, kwp * 6 + Math.PI * 1.3); ctx.stroke();
        ctx.strokeStyle = "rgba(200,240,140," + (1 - kwp).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + 2, wr - 2, (wr - 2) * 0.75, 0, kwp * 6, kwp * 6 + Math.PI * 1.3); ctx.stroke();
      }
      if (e.state === "windup" || e.state === "breath") Render.text("！", x, y - 40, { size: 11, align: "center", bold: true, color: e.state === "windup" ? "#ffd24a" : "#ef5b5b" });
    } else if (d.kind === "cerberus_gj") {
      // ケルベロス（69×50、左向き）：足もとは y＋14。炎をはく・ほえる・かみつくあいだは、口をあけた絵
      var cph = Math.sin(e.walk || 0), cmove = e.state === "chase" || e.state === "charge";
      var cf = e.state === "tbreathWarn" || e.state === "tbreath" || e.state === "hellHowl" || e.state === "bite" || e.biteT > 0 ? "breath" : !cmove ? "stand" : cph > 0 ? "walkA" : "walkB";
      var ctk = e.state === "tired" ? Math.round(Math.sin(glow * 20)) : 0;
      Render.rect(x - 26, y + 10, 52, 6, "rgba(0,0,0,0.35)");
      Monsters.drawBoss(ctx, e, x + ctk, y + 14, cf);
      if (e.state === "tbreathWarn" || e.state === "hellHowl") {   // 3つの口もとに火の光
        var fl = e.face.x > 0 ? -1 : 1;
        [[-22, -10], [-17, -22], [-4, -33]].forEach(function (m) { Combat.glowDot(ctx, x + m[0] * fl, y + 14 + m[1] - 6, 4 + Math.sin(glow * 30), "#fff0a0", "#ff6a1f", 0.8); });
      }
      if (e.state === "tired") {   // ふらついている：頭の上で、黄色い星がまわる
        for (var cs = 0; cs < 3; cs++) {
          var cta = glow * 4 + cs * 2.1, ctx2 = Math.round(x + Math.cos(cta) * 14), cty = Math.round(y - 42 + Math.sin(cta) * 3);
          Render.rect(ctx2, cty - 1, 1, 3, "#ffe066"); Render.rect(ctx2 - 1, cty, 3, 1, "#ffe066");
        }
      }
      if (e.state === "warn") Render.text("！", x, y - 46, { size: 12, align: "center", bold: true, color: "#ef5b5b" });
      if (e.state === "windup") Render.text("！", x, y - 46, { size: 11, align: "center", bold: true, color: "#ffd24a" });
      if (e.state === "hellHowl") Render.text("ウォォォン！", x, y - 48, { size: 9, align: "center", bold: true, color: "#ff8a4a" });
    } else if (d.kind === "roc_boss") {
      // 大怪鳥（飛ぶ）：絵は e.alt だけ上に描く。地面の影は、崖の外の空の上では描かない
      var alt = Math.round(e.alt || 10) + Math.round(Math.sin(glow * 4) * 2);
      if (!e.overSky) { var sw2 = e.state === "rise" ? 18 : 26; Render.rect(x - sw2 / 2, y + 6, sw2, 5, "rgba(0,0,0,0.3)"); }
      if (e.state === "windup") {   // かぎづめの構え：とどく範囲が黄色く
        var kc2 = 1 - Math.max(0, e.t) / d.windup;
        ctx.strokeStyle = "rgba(255,210,74," + (0.3 + 0.5 * kc2).toFixed(2) + ")"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y + 4, d.clawReach + e.r, (d.clawReach + e.r) * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
      }
      var fr = e.state === "swoop" ? "dive" : (e.state === "rise" || e.state === "flap" || e.flapFx > 0 || Math.floor(glow * (e.state === "sky" || e.state === "takeoff" ? 8 : 5)) % 2) ? "down" : "up";
      if (e.flapFx > 0) e.flapFx -= 1 / 60;
      Monsters.drawBoss(ctx, e, x, y + 12 - alt, fr);
      if (e.state === "sky" || e.state === "takeoff" || e.state === "land") {   // 空を飛ぶあいだは、まわりに風の線
        for (var sw = 0; sw < 6; sw++) {
          var swk = (glow * 1.4 + sw * 0.17) % 1;
          Render.rect(Math.round(x - 40 + swk * 80), Math.round(y - alt - 20 + sw * 7), 6, 1, "rgba(240,250,255," + (0.5 * (1 - Math.abs(swk - 0.5) * 2)).toFixed(2) + ")");
        }
      }
      if (e.slashT > 0) {   // かぎづめ：3本の白い線
        var ks = 1 - e.slashT / 0.25, fx3 = x + e.face.x * 18, fy3 = y - 4 + e.face.y * 12;
        ctx.strokeStyle = "rgba(255,255,255," + (1 - ks).toFixed(2) + ")"; ctx.lineWidth = 1;
        for (var cl = -1; cl <= 1; cl++) { ctx.beginPath(); ctx.moveTo(fx3 - 7 + cl * 3, fy3 - 7); ctx.lineTo(fx3 + 7 + cl * 3, fy3 + 7); ctx.stroke(); }
      }
      if (e.state === "windup" || e.state === "rise") Render.text("！", x, y - alt - 34, { size: 11, align: "center", bold: true, color: e.state === "windup" ? "#ffd24a" : "#ef5b5b" });
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
        var shown = e.daPhase === "gather" ? Math.min(e.daN, Math.ceil(e.daN * Math.min(1, 1.15 - Math.max(0, e.t) / d.daWindup))) : e.daLeft;
        for (var oi = 0; oi < Math.min(shown, e.daLeft); oi++) {
          var op2 = orbPos(e, oi), behind = op2.y < e.y - 18;
          ctx.globalAlpha = behind ? 0.6 : 1;
          drawDarkOrb(ctx, Math.round(op2.x - cam.x), Math.round(op2.y - cam.y), 1.3, glow);
          ctx.globalAlpha = 1;
        }
      }
      if (e.state === "dark" && e.daPhase === "gather") {   // 光が手もとに集まってくる（玉がそろうまで）
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

  // スノーゴーレムがくずれた雪の山：白い山がゆっくり上下し、雪だるまがのこっている時間を、まわりの輪で見せる
  function drawSnowPile(ctx, e, x, y, glow) {
    var d = e.def, k = Math.max(0, e.t / d.splitPile), bob = Math.round(Math.sin(glow * 3) * 1);
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + 14, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#140c1c"; ctx.beginPath(); ctx.ellipse(x, y + 8 + bob, 23, 13, 0, Math.PI, 0); ctx.lineTo(x + 23, y + 14); ctx.lineTo(x - 23, y + 14); ctx.fill();
    ctx.fillStyle = "#c8d2de"; ctx.beginPath(); ctx.ellipse(x, y + 9 + bob, 21, 11, 0, Math.PI, 0); ctx.lineTo(x + 21, y + 13); ctx.lineTo(x - 21, y + 13); ctx.fill();
    ctx.fillStyle = "#f4f8fc"; ctx.beginPath(); ctx.ellipse(x - 4, y + 7 + bob, 14, 8, 0, Math.PI, 0); ctx.fill();
    Render.rect(x - 7, y + 2 + bob, 3, 2, "#2e9ab8"); Render.rect(x + 4, y + 2 + bob, 3, 2, "#2e9ab8");   // 雪の中で光る目
    ctx.strokeStyle = "rgba(122,200,240,0.7)"; ctx.lineWidth = 2;   // のこり時間の輪
    ctx.beginPath(); ctx.arc(x, y - 18, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }

  // ふつうの敵（ワイルドボア。原生の秘境の段階2）も使う：壁までの長さ・予告の線の絵・土けむり
  // 水晶の大グモの糸のかたまり：白い糸が、からまった玉
  function drawWeb(ctx, x, y, r) {
    ctx.fillStyle = "rgba(240,244,255,0.35)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(240,244,255,0.9)"; ctx.lineWidth = 1;
    for (var i = 0; i < 3; i++) { var a = i * 1.05; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  // ヨロイガニのあわ：すきとおった水色の玉に、白い光
  function drawBubble(ctx, x, y, r, glow) {
    ctx.fillStyle = "rgba(120,190,255,0.28)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(200,236,255,0.9)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    Render.rect(Math.round(x - r * 0.45), Math.round(y - r * 0.5), 2, 2, "#ffffff");
  }
  function addDust(x, y) { dust.push({ x: x, y: y, t: 0, max: 0.6, s: Math.random() }); }

  return { hazards: function () { return hazards; }, clear: clear, isBoss: isBoss, update: update, updateHazards: updateHazards, drawHazards: drawHazards, draw: draw, interrupt: interrupt, bossDown: bossDown,
           rayLength: rayLength, drawChargeLine: drawChargeLine, addDust: addDust, drawRock: drawRock, drawDarkArrow: drawDarkArrow,
           rockBreak: rockBreak, guardFront: guardFront, crackShell: crackShell, shellMult: shellMult, octoMult: octoMult, douse: douse, giantMult: giantMult, fdragonMult: fdragonMult, drawBubble: drawBubble, drawWeb: drawWeb, drawTomahawk: drawTomahawk, shakeOffset: shakeOffset, addAlly: addAlly, drawDarkBolt: drawDarkBolt, drawBigFireball: drawBigFireball, drawDarkOrb: drawDarkOrb, addFog: addFog, blizzard: blizzard,
           frost: function () { return frost; }, meltArmor: meltArmor, armorMult: armorMult, icicleImg: icicleImg };
})();
