// 仲間のドット絵（段階7-2b）。16×24 点の縦長。すべてプログラムで描く（素材は使っていない）。
// 形（体・頭・足）をぬってから、まわりにふちどりを自動でつける。光は左上から（右下が影）。
// 職業で服と頭（かぶと・帽子・フード・はちまき・頭巾）が変わる。髪の色は顔の番号で変わる（同じ職業でも見分けられる）。
// 向き：down（前）・up（後ろ）・side（右向き。左向きは左右反転）。
// コマ：stand・walkA・walkB・attack・runA・runB。描いた絵は覚えておく（同じ絵は1回だけ描く）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Sprites = (function () {
  var SW = 16, SH = 24;
  var cache = {};

  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function pal(list) { return list.map(hex); }

  // 髪の色（顔の番号 0〜7）：[影, ふつう, 明るい]
  var HAIR = [
    pal(["#4a2a12", "#7a4a20", "#a8743a"]),   // 茶
    pal(["#8a6a20", "#d0a838", "#f4d870"]),   // 金
    pal(["#14141e", "#2a2a3e", "#4a4a6a"]),   // 黒
    pal(["#7a1e14", "#b8402a", "#e4704a"]),   // 赤
    pal(["#4a4a5a", "#8a8a9a", "#c8c8d4"]),   // 銀
    pal(["#1a2a5a", "#2e4a9a", "#5a7ad0"]),   // 青
    pal(["#2a4a1a", "#4a7a2a", "#7aaa4a"]),   // 緑
    pal(["#5a1a4a", "#8a2a7a", "#c050a8"])    // 紫
  ];
  var SKIN = pal(["#c8865a", "#f0c49a", "#ffe0c0"]);
  var OUT = hex("#1c1424");
  var BOOT = pal(["#2a1a14", "#4a3020", "#6a4a30"]);

  // 職業ごとの服：cloth（服）・pants（ズボン）・trim（ふち）・head（頭の物）
  var JOB = {
    warrior: { cloth: pal(["#2a3a6a", "#3e5aa0", "#6a8ad0"]), pants: pal(["#2a2a3a", "#3e3e54", "#5a5a74"]), trim: pal(["#8a6a20", "#c8a040", "#f0d070"]),
               head: "helmet", headPal: pal(["#4a5060", "#8a92a8", "#d0d6e4"]), cape: pal(["#5a1018", "#8a1e28", "#b83a40"]) },
    mage:    { cloth: pal(["#3a1a5a", "#5a2a8a", "#8a4ac0"]), pants: pal(["#3a1a5a", "#5a2a8a", "#8a4ac0"]), trim: pal(["#8a6a20", "#c8a040", "#f0d070"]),
               head: "hat", headPal: pal(["#2a1240", "#46206a", "#6a3a98"]), robe: true },
    hunter:  { cloth: pal(["#1e4a24", "#2e6a34", "#4e9a50"]), pants: pal(["#4a3420", "#6a4a2e", "#8a6a44"]), trim: pal(["#5a3a1a", "#7a5428", "#a07440"]),
               head: "hood", headPal: pal(["#1a3a1e", "#2a5a2e", "#3e7e42"]) },
    fighter: { cloth: pal(["#a04a14", "#d8701e", "#f8a040"]), pants: pal(["#7a3a10", "#a85418", "#d0782a"]), trim: pal(["#1a1a24", "#2a2a3a", "#44445a"]),
               head: "band", headPal: pal(["#8a1418", "#c8242a", "#f05050"]), bareArms: true },
    priest:  { cloth: pal(["#a8a8b8", "#e0e0e8", "#ffffff"]), pants: pal(["#a8a8b8", "#e0e0e8", "#ffffff"]), trim: pal(["#1e4a8a", "#2e6ac8", "#5a9af0"]),
               head: "cap", headPal: pal(["#a8a8b8", "#e0e0e8", "#ffffff"]), robe: true }
  };

  // ---------- 1枚の絵を描く ----------
  // dir：down / up / side（右向き）。frame：stand・walkA・walkB・attack・runA・runB
  function paint(job, hairId, dir, frame) {
    var J = JOB[job] || JOB.warrior, H = HAIR[(hairId | 0) % HAIR.length];
    var g = []; for (var i = 0; i < SW * SH; i++) g.push(null);
    function set(x, y, c) { if (x >= 0 && y >= 0 && x < SW && y < SH && c) g[y * SW + x] = c; }
    function get(x, y) { return x >= 0 && y >= 0 && x < SW && y < SH ? g[y * SW + x] : null; }
    function rect(x, y, w, h, c) { for (var j = 0; j < h; j++) for (var k = 0; k < w; k++) set(x + k, y + j, c); }
    // 3色（影・ふつう・明るい）で、左上が明るく右下が暗い四角
    function shaded(x, y, w, h, p) {
      for (var j = 0; j < h; j++) for (var k = 0; k < w; k++) {
        var c = p[1];
        if (k === 0 || j === 0 && k < w - 1) c = p[2];
        if (k === w - 1 || j === h - 1) c = p[0];
        set(x + k, y + j, c);
      }
    }

    var walk = frame === "walkA" ? 1 : frame === "walkB" ? -1 : 0;
    var run = frame === "runA" ? 1 : frame === "runB" ? -1 : 0;
    var atk = frame === "attack";
    var lean = run ? 1 : 0;                 // 走るときは少し前かがみ（頭が1点下がる）
    var bob = walk || run ? 1 : 0;           // 歩く・走るとき、体が1点しずむ
    var hy = 2 + lean + bob;                 // 頭の上のはし
    var by = 12 + bob;                       // 体の上のはし

    // ---- マント（戦士。体の後ろ） ----
    if (J.cape && dir !== "up") { /* 前と横では体にかくれる */ }
    if (J.cape && dir === "up") shaded(4, by, 8, 9 + (run ? 0 : 1), J.cape);
    if (J.cape && dir === "side") shaded(2 - run, by + 1, 3, 8, J.cape);

    // ---- 足 ----
    var legY = 19;
    if (dir === "side") {
      var s = run || walk;
      // 前の足と後ろの足（歩くと前後に開く）
      shaded(6 + s * 2, legY, 3, 4, J.pants); rect(6 + s * 2, legY + 3, 4, 2, BOOT[1]); set(9 + s * 2, legY + 4, BOOT[0]);
      shaded(7 - s * 2, legY, 3, 4, J.pants); rect(7 - s * 2, legY + 3, 4, 2, BOOT[0]);
    } else {
      var l = walk || run, up = function (side) { return l === side ? 1 : 0; };
      shaded(4, legY - up(1), 3, 4, J.pants); rect(4, legY + 3 - up(1), 3, 2, BOOT[1]); set(4, legY + 4 - up(1), BOOT[2]);
      shaded(9, legY - up(-1), 3, 4, J.pants); rect(9, legY + 3 - up(-1), 3, 2, BOOT[1]); set(11, legY + 4 - up(-1), BOOT[0]);
    }

    // ---- 体（服） ----
    if (J.robe) {
      // ローブ：すそが広がる
      for (var j = 0; j < 9; j++) { var wdt = 8 + Math.floor(j / 3) * 2; shaded(8 - wdt / 2, by + j, wdt, 1, J.cloth); }
      for (j = 0; j < 9; j++) { var w2 = 8 + Math.floor(j / 3) * 2; set(8 - w2 / 2, by + j, J.cloth[2]); set(8 + w2 / 2 - 1, by + j, J.cloth[0]); }
      if (dir !== "up") { rect(7, by + 1, 2, 8, J.trim[1]); set(7, by + 1, J.trim[2]); }
    } else {
      shaded(4, by, 8, 7, J.cloth);
      rect(4, by + 5, 8, 1, J.trim[1]); set(4, by + 5, J.trim[2]);           // ベルト
      if (dir === "down") set(7, by + 5, J.trim[2]), set(8, by + 5, J.trim[0]);
      if (job === "warrior" && dir !== "up") { rect(5, by + 1, 6, 2, J.headPal[1]); set(5, by + 1, J.headPal[2]); }  // むね当て
    }

    // ---- うで ----
    var armC = J.bareArms ? SKIN : J.cloth;
    var aSwing = run ? run * 2 : walk;
    if (dir === "side") {
      if (atk) { rect(10, by + 2, 5, 2, armC[1]); set(14, by + 2, SKIN[1]); set(14, by + 3, SKIN[0]); }   // 前にのばす
      else { shaded(7 + aSwing, by + 1, 3, 5, armC); set(7 + aSwing, by + 5, SKIN[1]); set(8 + aSwing, by + 5, SKIN[1]); }
    } else {
      var la = atk && dir === "down" ? 2 : aSwing, ra = atk && dir === "up" ? 2 : -aSwing;
      shaded(2, by + 1 - Math.max(0, la), 2, 5, armC); set(2, by + 6 - Math.max(0, la), SKIN[1]); set(3, by + 6 - Math.max(0, la), SKIN[0]);
      shaded(12, by + 1 - Math.max(0, ra), 2, 5, armC); set(12, by + 6 - Math.max(0, ra), SKIN[1]); set(13, by + 6 - Math.max(0, ra), SKIN[0]);
    }

    // ---- 頭 ----
    // 顔と髪（10×10 の丸い頭）
    function head() {
      for (var y = 0; y < 10; y++) for (var x = 0; x < 10; x++) {
        var dx = x - 4.5, dy = y - 4.8, inside = dx * dx / 26 + dy * dy / 28 <= 1;
        if (!inside) continue;
        var X = 3 + x, Y = hy + y, c;
        if (dir === "up") c = H[x < 3 && y < 5 ? 2 : x > 6 || y > 7 ? 0 : 1];
        else if (dir === "down") {
          var hairTop = y < 4 || (y < 6 && (x < 2 || x > 7)) || (y === 4 && (x === 3 || x === 6));
          c = hairTop ? H[x < 4 && y < 3 ? 2 : x > 6 ? 0 : 1] : SKIN[x > 7 ? 0 : y > 8 ? 0 : 1];
        } else { // side（右向き）：顔は右、髪は左と上
          var hairS = y < 4 || x < 4 || (y < 6 && x < 6);
          c = hairS ? H[x < 3 && y < 4 ? 2 : x < 2 || y > 7 ? 0 : 1] : SKIN[y > 8 ? 0 : 1];
        }
        set(X, Y, c);
      }
      // 目
      if (dir === "down") { set(5, hy + 6, OUT); set(5, hy + 7, OUT); set(10, hy + 6, OUT); set(10, hy + 7, OUT); set(6, hy + 8, SKIN[0]); set(9, hy + 8, SKIN[0]); }
      if (dir === "side") { set(10, hy + 6, OUT); set(10, hy + 7, OUT); set(12, hy + 7, SKIN[1]); }
    }
    head();

    // 頭の物（職業）
    var P = J.headPal;
    if (J.head === "helmet") {        // かぶと（上半分）と、まんなかの線
      for (var x2 = 3; x2 < 13; x2++) for (var y2 = 0; y2 < 4; y2++) if (get(x2, hy + y2)) set(x2, hy + y2, P[x2 < 6 ? 2 : x2 > 10 ? 0 : 1]);
      rect(3, hy + 4, 10, 1, P[0]);
      if (dir !== "up") { rect(dir === "side" ? 9 : 7, hy, 1, 4, P[2]); }
      if (dir === "side") { rect(3, hy + 4, 3, 3, P[1]); }
    }
    if (J.head === "hat") {           // とがった帽子（つばと、とがった先）
      rect(1, hy + 3, 14, 2, P[1]); rect(1, hy + 4, 14, 1, P[0]); set(1, hy + 3, P[2]);
      for (var k2 = 0; k2 < 6; k2++) { var wd = 8 - k2; rect(4 + Math.floor(k2 / 2) + (dir === "side" ? -1 : 0), hy + 2 - k2, wd, 1, P[k2 % 2 ? 1 : 2]); }
      rect(5, hy + 2, 6, 1, J.trim[1]);                                // 帽子の帯
      set(dir === "side" ? 3 : 7, hy - 4, P[1]); set(dir === "side" ? 2 : 6, hy - 4, P[0]);   // 先が折れている
    }
    if (J.head === "hood") {          // フード（頭のまわりをかこむ）
      for (var yy = 0; yy < 10; yy++) for (var xx = 0; xx < 10; xx++) {
        var X2 = 3 + xx, Y2 = hy + yy;
        if (!get(X2, Y2)) continue;
        var edge = dir === "up" || yy < 3 || xx < 2 || xx > 7 || (dir === "side" && xx < 5);
        if (edge) set(X2, Y2, P[xx < 3 && yy < 4 ? 2 : xx > 7 ? 0 : 1]);
      }
      if (dir !== "side") rect(4, hy + 9, 8, 2, P[1]);
    }
    if (J.head === "band") {          // はちまき（結び目が後ろにたれる）
      rect(3, hy + 3, 10, 1, P[1]); set(3, hy + 3, P[2]);
      if (dir === "up") { set(7, hy + 4, P[1]); set(8, hy + 4, P[0]); set(7, hy + 5, P[0]); }
      if (dir === "side") { rect(1, hy + 3, 2, 1, P[1]); rect(0, hy + 4 + (run ? 0 : 1), 2, 1, P[0]); }
    }
    if (J.head === "cap") {           // 頭巾
      for (var y3 = 0; y3 < 4; y3++) for (var x3 = 3; x3 < 13; x3++) if (get(x3, hy + y3)) set(x3, hy + y3, P[x3 < 6 ? 2 : x3 > 10 ? 0 : 1]);
      if (dir !== "up") rect(7, hy + 1, 2, 2, J.trim[1]);
      if (dir === "up") rect(4, hy + 4, 8, 3, P[1]);
    }

    // ---- ふちどり（色のある点のとなりのすき間を、こい色に） ----
    var out = g.slice();
    for (var yy2 = 0; yy2 < SH; yy2++) for (var xx2 = 0; xx2 < SW; xx2++) {
      if (g[yy2 * SW + xx2]) continue;
      if (get(xx2 - 1, yy2) || get(xx2 + 1, yy2) || get(xx2, yy2 - 1) || get(xx2, yy2 + 1)) out[yy2 * SW + xx2] = OUT;
    }

    var cv = document.createElement("canvas"); cv.width = SW; cv.height = SH;
    var ctx = cv.getContext("2d"), id = ctx.createImageData(SW, SH);
    for (i = 0; i < out.length; i++) if (out[i]) { id.data[i * 4] = out[i][0]; id.data[i * 4 + 1] = out[i][1]; id.data[i * 4 + 2] = out[i][2]; id.data[i * 4 + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return cv;
  }

  // ---------- 手に持つ武器 ----------
  // 足もと（x, y）と向きから、手の場所に武器を描く。体より前に描くか後ろに描くかは behind で決める
  var WCOL = {
    blade: pal(["#5a6078", "#c8ccd8", "#ffffff"]), gold: pal(["#7a5a18", "#c8a040", "#f0d070"]), wood: pal(["#4a2c14", "#7a4e26", "#a87840"]),
    gem: pal(["#1a7a9a", "#5ad8f8", "#d8f8ff"]), string: pal(["#c8c0a8", "#e8e0c8", "#ffffff"])
  };
  function px(ctx, x, y, c) { ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  // (x0, y0) から向き (dx, dy) に len 点、太さ wid の棒
  function bar(ctx, x0, y0, dx, dy, len, wid, P) {
    for (var i = 0; i < len; i++) for (var w = 0; w < wid; w++) {
      var x = x0 + dx * i - dy * w, y = y0 + dy * i + dx * w;
      px(ctx, x, y, P[w === 0 ? 2 : 1]);
      if (i === len - 1) px(ctx, x, y, P[0]);
    }
  }
  // weapon：sword・greatsword・axe・bow・fist・staff。face：向き。mode：hold（持つ）・attack（ふる）・back（背中にしまう）
  function drawWeapon(ctx, weapon, face, x, y, mode) {
    if (weapon === "fist") return;   // 拳は手そのもの
    var d = dirOf(face), sx = d.flip ? -1 : 1;
    var hx, hy, dx, dy;
    if (mode === "back") {           // 背中（ななめ）
      hx = x - 4 * sx; hy = y - 18; dx = 0.45 * sx; dy = 0.9;
      if (d.dir === "down") { hx = x + 4; hy = y - 19; dx = -0.45; dy = 0.9; }
    } else if (mode === "attack") {  // 向いているほうへつき出す
      hx = x + face.x * 7; hy = y - 9 + face.y * 5; dx = face.x; dy = face.y;
    } else {                          // 手に持って、少し上に向ける
      if (d.dir === "side") { hx = x + 2 * sx; hy = y - 7; dx = 0.35 * sx; dy = -0.94; }
      else if (d.dir === "down") { hx = x + 5; hy = y - 6; dx = 0.2; dy = -0.98; }
      else { hx = x - 5; hy = y - 7; dx = -0.2; dy = -0.98; }
    }
    if (weapon === "sword") { bar(ctx, hx, hy, dx, dy, 9, 1, WCOL.blade); bar(ctx, hx - dy * 1.5 * -1 - dx, hy + dx * 1.5 * -1 - dy, -dy, dx, 3, 1, WCOL.gold); }
    if (weapon === "greatsword") { bar(ctx, hx, hy, dx, dy, 12, 2, WCOL.blade); bar(ctx, hx + dy * 2 - dx, hy - dx * 2 - dy, -dy, dx, 5, 1, WCOL.gold); }
    if (weapon === "axe") {
      bar(ctx, hx, hy, dx, dy, 11, 1, WCOL.wood);
      var ax = hx + dx * 8, ay = hy + dy * 8;
      for (var i = 0; i < 4; i++) bar(ctx, ax + dx * i, ay + dy * i, -dy * (sx || 1), dx * (sx || 1), 4 - Math.abs(i - 1.5) > 2 ? 4 : 3, 1, WCOL.blade);
    }
    if (weapon === "staff") { bar(ctx, hx - dx * 3, hy - dy * 3, dx, dy, 14, 1, WCOL.wood); var gx = hx + dx * 11, gy = hy + dy * 11; px(ctx, gx, gy, WCOL.gem[1]); px(ctx, gx + 1, gy, WCOL.gem[0]); px(ctx, gx, gy - 1, WCOL.gem[2]); px(ctx, gx + 1, gy - 1, WCOL.gem[1]); }
    if (weapon === "bow") {
      // 弓：手のところで弧をえがく（弦は直線）
      for (var t = -5; t <= 5; t++) {
        var bend = 2.5 - (t * t) / 10;
        var bx = hx - dy * t * 1 + dx * bend, by = hy + dx * t * 1 + dy * bend;
        px(ctx, bx, by, WCOL.wood[Math.abs(t) > 3 ? 0 : 1]);
        px(ctx, hx - dy * t, hy + dx * t, WCOL.string[1]);
      }
    }
  }

  function hero(job, hairId, dir, frame) {
    var k = job + "|" + hairId + "|" + dir + "|" + frame;
    if (!cache[k]) cache[k] = paint(job, hairId, dir, frame);
    return cache[k];
  }

  // 向き（face：{x, y}）から、down / up / side と、左右反転するか
  function dirOf(face) {
    if (Math.abs(face.x) > Math.abs(face.y) + 0.01) return { dir: "side", flip: face.x < 0 };
    return { dir: face.y < 0 ? "up" : "down", flip: false };
  }

  // 足もと（x, y）を基準に描く。opt：{ flip, alpha }
  function drawHero(ctx, job, hairId, face, frame, x, y, opt) {
    var d = dirOf(face), img = hero(job, hairId, d.dir, frame);
    ctx.save();
    if (opt && opt.alpha != null) ctx.globalAlpha = opt.alpha;
    if (d.flip) { ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.drawImage(img, -SW / 2, Math.round(y) - SH); }
    else ctx.drawImage(img, Math.round(x) - SW / 2, Math.round(y) - SH);
    ctx.restore();
  }
  // たおれた姿（横にたおれる）
  function drawDown(ctx, job, hairId, x, y) {
    var img = hero(job, hairId, "side", "stand");
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -SH + 2, -SW / 2); ctx.restore();
  }

  return { SW: SW, SH: SH, hero: hero, drawHero: drawHero, drawDown: drawDown, drawWeapon: drawWeapon, dirOf: dirOf, JOBS: Object.keys(JOB), HAIRS: HAIR.length };
})();
