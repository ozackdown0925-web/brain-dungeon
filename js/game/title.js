// タイトル画面（段階7-1）：1枚の絵と、短い物語。「はじめる」を押すと、つなぎ先・拠点へ（Base.boot）。
// 絵はプログラムで描いたもの（素材は使っていない）。320×180 で描いて、画面に合わせて広げる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Title = (function () {
  var W = 320, H = 180;
  var screen = document.getElementById("titleScreen");
  var cv = document.getElementById("titleArt");
  var done = null;

  // 決まった並びの乱数（毎回同じ絵になるように）
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function draw() {
    var dpr = window.devicePixelRatio || 1;
    // 絵・題名・物語・「はじめる」が1画面に入る大きさに（横長の低い画面では、絵を左・文を右に並べる）
    var side = window.innerHeight < 560 && window.innerWidth > window.innerHeight;
    var room = side ? window.innerHeight - 40 : window.innerHeight - 330;
    var cssW = side ? Math.min(window.innerWidth * 0.5, room * W / H) : Math.max(200, Math.min(cv.parentNode.clientWidth || 640, 900, room * W / H));
    var cssH = Math.round(cssW * H / W);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var c = cv.getContext("2d");
    c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    c.imageSmoothingEnabled = false;
    function r(x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
    function poly(pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }

    // 空（上から下へ、紫 → 赤むらさき）。帯のさかい目は市松もようでぼかす（ドット絵らしく）
    var sky = ["#140b24", "#1c0f30", "#26133a", "#321742", "#401b47", "#521f4a", "#66244b", "#7a2a48"];
    var band = 14;
    sky.forEach(function (col, i) {
      r(0, i * band, W, band, col);
      if (i > 0) for (var x = 0; x < W; x += 2) { r(x + (i % 2), i * band, 1, 1, sky[i - 1]); r(x + ((i + 1) % 2), i * band + 2, 1, 1, sky[i - 1]); }
    });
    // 星
    var rand = rng(7);
    for (var i = 0; i < 70; i++) {
      var sx = Math.floor(rand() * W), sy = Math.floor(rand() * 80), b = rand();
      r(sx, sy, 1, 1, b > 0.8 ? "#fff6d8" : b > 0.4 ? "#c9b8e8" : "#7d6aa0");
      if (b > 0.95) { r(sx - 1, sy, 3, 1, "#fff6d8"); r(sx, sy - 1, 1, 3, "#fff6d8"); }
    }
    // 月（左上。少し赤い）
    c.fillStyle = "#f3d9b0"; c.beginPath(); c.arc(54, 34, 17, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#e7c094"; c.beginPath(); c.arc(49, 30, 4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(60, 40, 3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(58, 27, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,120,120,0.18)"; c.beginPath(); c.arc(54, 34, 17, 0, Math.PI * 2); c.fill();

    // 魔王の影（空に大きく。角と、赤く光る目）
    var mx = 214, my = 50;
    c.fillStyle = "rgba(10,4,16,0.78)";
    c.beginPath(); c.ellipse(mx, my + 34, 70, 30, 0, Math.PI, 0); c.fill();                // 肩とマント
    c.beginPath(); c.ellipse(mx, my + 6, 22, 24, 0, 0, Math.PI * 2); c.fill();             // 頭
    poly([mx - 16, my - 8, mx - 38, my - 34, mx - 30, my - 30, mx - 8, my - 14], "rgba(10,4,16,0.78)"); // 角（左）
    poly([mx + 16, my - 8, mx + 38, my - 34, mx + 30, my - 30, mx + 8, my - 14], "rgba(10,4,16,0.78)"); // 角（右）
    poly([mx - 9, my + 2, mx - 2, my + 6, mx - 9, my + 7], "#ff3a4a");                     // 目
    poly([mx + 9, my + 2, mx + 2, my + 6, mx + 9, my + 7], "#ff3a4a");
    c.fillStyle = "rgba(255,58,74,0.25)"; c.fillRect(mx - 12, my + 1, 24, 8);
    // 雲（魔王の下をかくす）
    c.fillStyle = "#2a1236";
    [[150, 86, 30], [180, 82, 24], [214, 88, 34], [250, 82, 26], [282, 88, 30], [120, 90, 22]].forEach(function (p) { c.beginPath(); c.ellipse(p[0], p[1], p[2], 9, 0, 0, Math.PI * 2); c.fill(); });

    // 遠くの山（2重）
    poly([0, 120, 40, 96, 78, 112, 120, 90, 160, 110, 200, 88, 240, 104, 280, 86, 320, 100, 320, 180, 0, 180], "#2b1a3a");
    poly([0, 132, 30, 118, 70, 128, 104, 112, 140, 126, 176, 116, 205, 98, 236, 120, 270, 112, 320, 124, 320, 180, 0, 180], "#21142c");

    // 魔王の城（右の山の上）
    var cx = 232, cy = 98;
    r(cx - 22, cy, 44, 26, "#140c1c");                                          // 壁
    for (var k = 0; k < 6; k++) r(cx - 22 + k * 8, cy - 3, 4, 3, "#140c1c");     // 城壁のでこぼこ
    r(cx - 30, cy - 10, 10, 36, "#140c1c"); r(cx + 20, cy - 10, 10, 36, "#140c1c"); // 左右の塔
    r(cx - 6, cy - 22, 12, 22, "#140c1c");                                        // まんなかの塔
    poly([cx - 31, cy - 10, cx - 25, cy - 22, cx - 19, cy - 10], "#140c1c");
    poly([cx + 19, cy - 10, cx + 25, cy - 22, cx + 31, cy - 10], "#140c1c");
    poly([cx - 7, cy - 22, cx, cy - 38, cx + 7, cy - 22], "#140c1c");
    r(cx, cy - 44, 1, 7, "#140c1c"); r(cx + 1, cy - 44, 5, 3, "#8a1a2a");          // 旗
    [[cx - 27, cy - 2], [cx + 23, cy - 2], [cx - 2, cy - 14], [cx - 14, cy + 8], [cx + 10, cy + 8], [cx - 2, cy + 6]].forEach(function (p) { r(p[0], p[1], 3, 4, "#ff7a3a"); r(p[0], p[1], 3, 1, "#ffc06a"); });
    r(cx - 5, cy + 16, 10, 10, "#0a0610"); poly([cx - 5, cy + 16, cx, cy + 11, cx + 5, cy + 16], "#0a0610"); // 門

    // 森（手前の木の列）
    var rand2 = rng(19);
    for (var t = -6; t < W + 6; t += 9) {
      var th = 18 + Math.floor(rand2() * 10), tx = t + Math.floor(rand2() * 4), ty = 146 - Math.floor(rand2() * 6);
      poly([tx, ty - th, tx - 7, ty, tx + 7, ty], "#0f2a1c");
      poly([tx, ty - th + 3, tx - 4, ty - th / 2, tx + 1, ty - th / 2], "#174030");
    }
    r(0, 146, W, 34, "#0f2a1c");
    // 手前の丘と道
    poly([0, 156, 60, 148, 130, 152, 200, 150, 320, 158, 320, 180, 0, 180], "#1e3a22");
    poly([96, 180, 120, 160, 150, 152, 172, 152, 160, 160, 140, 180], "#5a4a34");
    for (var g = 0; g < 60; g++) { var gx = Math.floor(rand2() * W), gy = 152 + Math.floor(rand2() * 26); r(gx, gy, 1, 2, "#2c5a30"); }

    // 3人のなかま（手前の左。城を見上げる）
    hero(c, 70, 150, { body: "#3a6ad0", hair: "#5a3a1a", item: "sword" });
    hero(c, 84, 152, { body: "#a03ab0", hair: "#e8c070", item: "staff" });
    hero(c, 56, 152, { body: "#3a9a50", hair: "#2a2a2a", item: "bow" });
  }

  // 小さな勇者（後ろ姿。x,y は足もと）
  function hero(c, x, y, o) {
    function r(px, py, w, h, col) { c.fillStyle = col; c.fillRect(x + px, y + py, w, h); }
    r(-3, -16, 7, 5, o.hair);           // 頭（後ろ）
    r(-4, -12, 9, 2, o.hair);
    r(-4, -10, 9, 7, o.body);           // 体
    r(-5, -10, 1, 5, o.body); r(5, -10, 1, 5, o.body);
    r(-3, -3, 3, 3, "#2a2030"); r(1, -3, 3, 3, "#2a2030"); // 足
    r(-4, -6, 9, 1, "#3a2a1a");         // ベルト
    if (o.item === "sword") { r(6, -18, 1, 10, "#d8dce8"); r(5, -9, 3, 1, "#c8a040"); }
    if (o.item === "staff") { r(6, -20, 1, 17, "#8a5a2a"); r(5, -22, 3, 3, "#7ae0ff"); }
    if (o.item === "bow") { r(-7, -15, 1, 10, "#a07040"); r(-6, -16, 1, 1, "#a07040"); r(-6, -6, 1, 1, "#a07040"); }
  }

  function show(then) {
    done = then;
    // テストのときは、タイトルを出さない（この端末の設定。ふだんは使わない）
    var skip = false; try { skip = localStorage.getItem("bd-skip-title") === "1"; } catch (e) { skip = false; }
    if (skip) { go(); return; }
    screen.hidden = false;
    draw();
    Sound.bgm("title");
  }
  function go() {
    screen.hidden = true;
    Sound.unlock();
    var f = done; done = null;
    if (f) f();
  }
  document.getElementById("titleGo").addEventListener("click", go);
  window.addEventListener("resize", function () { if (!screen.hidden) draw(); });

  return { show: show, draw: draw };
})();
