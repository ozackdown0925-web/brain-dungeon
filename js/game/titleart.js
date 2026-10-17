// タイトル画面の絵（段階7-1）。16ビット時代のドット絵ふう（雰囲気だけ。特定のゲームの絵はまねしない）。
// すべてプログラムで1点ずつ描く（素材は使っていない）。384×216 の絵を1回だけ作って、画面に広げて使う。
// 色の変わり目は「点の模様（ディザ）」でぼかす。月明かりが左上から、魔王の赤い光が城の上から当たる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var TitleArt = (function () {
  var W = 384, H = 216;
  var img = null;   // 作った絵（canvas）

  // 4×4 の点の模様（0〜15）。t（0〜1）がこれより大きければ、次の色にする
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dith(x, y, t) { return t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }

  function paint() {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var id = ctx.createImageData(W, H), px = id.data;

    // ---------- 点を打つ道具 ----------
    function set(x, y, c) {
      x = x | 0; y = y | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      var i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    function get(x, y) { var i = ((y | 0) * W + (x | 0)) * 4; return [px[i], px[i + 1], px[i + 2]]; }
    // 色の帯（pal）の中の位置 t（0〜1）を、点の模様でえらぶ
    function band(x, y, pal, t) {
      t = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
      var i = Math.floor(t), f = t - i;
      return pal[Math.min(pal.length - 1, i + (dith(x, y, f) ? 1 : 0))];
    }
    // 今の色に、べつの色を a（0〜1）だけまぜる（光やもやに使う）
    function mix(x, y, c, a) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      var o = get(x, y);
      set(x, y, [o[0] + (c[0] - o[0]) * a, o[1] + (c[1] - o[1]) * a, o[2] + (c[2] - o[2]) * a]);
    }
    function rect(x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) set(x + i, y + j, c); }
    function disc(cx, cy, r, fn) { // fn(x, y, d) で色を返す（d：中心からの近さ 0〜1）
      for (var y = Math.floor(cy - r); y <= cy + r; y++) for (var x = Math.floor(cx - r); x <= cx + r; x++) {
        var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
        if (d <= 1) { var c = fn(x, y, d); if (c) set(x, y, c); }
      }
    }
    function ell(cx, cy, rx, ry, fn) {
      for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
        if (d <= 1) { var c = fn(x, y, d, dx, dy); if (c) set(x, y, c); }
      }
    }
    function poly(pts, fn) { // 多角形をぬる（fn(x, y) で色）
      var minY = H, maxY = 0, i;
      for (i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
      for (var y = Math.floor(minY); y <= maxY; y++) {
        var xs = [], n = pts.length / 2;
        for (i = 0; i < n; i++) {
          var x1 = pts[i * 2], y1 = pts[i * 2 + 1], x2 = pts[((i + 1) % n) * 2], y2 = pts[((i + 1) % n) * 2 + 1];
          if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) xs.push(x1 + (y + 0.5 - y1) / (y2 - y1) * (x2 - x1));
        }
        xs.sort(function (a, b) { return a - b; });
        for (var k = 0; k + 1 < xs.length; k += 2) for (var x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) { var c = fn(x, y); if (c) set(x, y, c); }
      }
    }
    var C = function (h) { return hex(h); };

    // ---------- 空 ----------
    var SKY = ["#0b0a1e", "#120f2e", "#1b143e", "#26184a", "#341c52", "#461f58", "#5c2459", "#762a55", "#93334f", "#b04548"].map(C);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      // 城（右）のほうが赤く光る
      var glow = Math.max(0, 1 - Math.sqrt((x - 290) * (x - 290) * 0.6 + (y - 120) * (y - 120)) / 210);
      set(x, y, band(x, y, SKY, y / 150 * 0.82 + glow * 0.35));
    }
    // 天の川（うすい帯）と星
    var r1 = rng(11);
    for (var s = 0; s < 900; s++) {
      var t = r1(), bx = t * W, by = 8 + t * 60 + (r1() - 0.5) * 26;
      if (r1() < 0.5) mix(bx, by, [150, 130, 200], 0.18);
    }
    var STAR = [C("#fffbe8"), C("#d8ccff"), C("#9b8cc8"), C("#6d5f96")];
    for (s = 0; s < 160; s++) {
      var sx = Math.floor(r1() * W), sy = Math.floor(r1() * 110), b = r1();
      var col = b > 0.93 ? STAR[0] : b > 0.7 ? STAR[1] : b > 0.4 ? STAR[2] : STAR[3];
      if (sy > 100 && b < 0.7) continue;
      set(sx, sy, col);
      if (b > 0.975) { set(sx - 1, sy, STAR[1]); set(sx + 1, sy, STAR[1]); set(sx, sy - 1, STAR[1]); set(sx, sy + 1, STAR[1]); set(sx - 2, sy, STAR[3]); set(sx + 2, sy, STAR[3]); }
    }

    // ---------- 月（左上。かさと、影の三日月） ----------
    var MX = 62, MY = 42, MR = 20;
    for (y = MY - 44; y < MY + 44; y++) for (x = MX - 44; x < MX + 44; x++) {
      var dd = Math.sqrt((x - MX) * (x - MX) + (y - MY) * (y - MY));
      if (dd > MR && dd < 44 && dith(x, y, (1 - (dd - MR) / 24) * 0.55)) mix(x, y, [250, 220, 190], 0.16);
    }
    var MOON = ["#8a6a72", "#b8949a", "#d9b8b0", "#efd9c2", "#fbefd8"].map(C);
    disc(MX, MY, MR, function (x, y, d) {
      var lx = (x - MX) / MR, ly = (y - MY) / MR;
      var lit = 0.75 - (lx * 0.55 + ly * 0.35) * 0.5 - d * d * 0.25;     // 左上が明るい
      var shadow = Math.sqrt((x - MX - 9) * (x - MX - 9) + (y - MY + 4) * (y - MY + 4)) < MR - 1 ? 0.28 : 0; // 右下の影
      return band(x, y, MOON, lit - shadow);
    });
    [[56, 36, 4], [68, 48, 3], [60, 52, 2], [71, 35, 2], [52, 46, 2]].forEach(function (k) {
      disc(k[0], k[1], k[2], function (x, y, d) { return d > 0.6 && x < k[0] ? C("#c7a5a2") : band(x, y, MOON, 0.42); });
    });

    // ---------- 雷雲と、魔王の影 ----------
    var CL = ["#1a0f26", "#2a1534", "#3e1c3e", "#5c2442", "#8a3446", "#c45a4c"].map(C);
    var r2 = rng(23);
    function cloud(cx, cy, w, h, lightBelow) {
      for (var k = 0; k < Math.floor(w / 6); k++) {
        var px2 = cx - w / 2 + r2() * w, py2 = cy + (r2() - 0.5) * h * 0.6, rr = 6 + r2() * h * 0.6;
        ell(px2, py2, rr * 1.4, rr * 0.8, function (x, y, d, dx, dy) {
          var t = 0.25 + (dy > 0 ? dy * lightBelow : -dy * 0.12) - d * 0.12;   // 下（城の光）が赤く光る
          return band(x, y, CL, t);
        });
      }
    }
    // 魔王（雲の後ろから、大きな上半身）
    var DX = 262, DY = 58;
    var DEM = ["#08040c", "#120a18", "#1e0f24"].map(C);
    ell(DX, DY + 52, 96, 46, function (x, y, d) { return y < DY + 52 ? band(x, y, DEM, 0.5 - d * 0.4) : null; });        // 肩とマント
    ell(DX, DY + 8, 25, 28, function (x, y, d, dx) { return band(x, y, DEM, 0.55 - dx * 0.3 - d * 0.2); });            // 頭
    // まがった角（左右）
    for (var a = 0; a < 1; a += 0.02) {
      var hx = 20 + a * 26, hy = -6 - Math.sin(a * 2.4) * 30, hw = 6 * (1 - a) + 1;
      ell(DX - hx, DY + hy, hw, hw, function (x, y) { return band(x, y, DEM, 0.7); });
      ell(DX + hx, DY + hy, hw, hw, function (x, y) { return band(x, y, DEM, 0.7); });
    }
    // 目（赤く光る）と、光のにじみ
    [[-10, 4], [10, 4]].forEach(function (e) {
      for (y = DY + e[1] - 9; y <= DY + e[1] + 9; y++) for (x = DX + e[0] - 14; x <= DX + e[0] + 14; x++) {
        var q = Math.sqrt((x - DX - e[0]) * (x - DX - e[0]) * 0.4 + (y - DY - e[1]) * (y - DY - e[1]));
        if (q < 9 && dith(x, y, (1 - q / 9) * 0.6)) mix(x, y, [255, 60, 70], 0.35);
      }
      var sgn = e[0] < 0 ? 1 : -1;
      poly([DX + e[0] - 6 * sgn, DY + e[1] - 2, DX + e[0] + 5 * sgn, DY + e[1] + 2, DX + e[0] - 6 * sgn, DY + e[1] + 2], function () { return C("#ff4050"); });
      set(DX + e[0] - 4 * sgn, DY + e[1], C("#ffd0a0"));
    });
    // 雲（魔王の下半身をかくす）
    cloud(250, 104, 230, 26, 0.9);
    cloud(150, 100, 120, 18, 0.6);
    cloud(330, 96, 110, 20, 0.8);
    // ---------- 遠くの山（3重。遠いほど空の色に近い） ----------
    function ridge(base, amp, seed, pal, rim) {
      var rr = rng(seed), hgt = [], v = 0;
      for (x = 0; x < W; x++) { if (x % 12 === 0) v = rr(); hgt.push(v); }
      for (x = 0; x < W; x++) {
        var k0 = Math.floor(x / 12) * 12, k1 = Math.min(W - 1, k0 + 12), f = (x - k0) / 12;
        var top = base - amp * (hgt[k0] * (1 - f) + hgt[k1] * f) - Math.sin(x * 0.03 + seed) * amp * 0.4;
        for (y = Math.floor(top); y < H; y++) {
          var tt = (y - top) / 40;
          set(x, y, y - top < 2 && rim ? rim : band(x, y, pal, 0.15 + tt * 0.5 - (x < 160 ? 0.1 : 0)));
        }
      }
    }
    ridge(132, 26, 3, ["#3a2050", "#2e1a42", "#241536"].map(C), C("#6a4a7a"));
    ridge(146, 22, 8, ["#2a1838", "#21132e", "#1a0f26"].map(C), C("#54406a"));

    // ---------- 魔王の城（右の崖の上） ----------
    var CX = 300, CY = 128;
    poly([CX - 60, H, CX - 44, CY + 12, CX - 30, CY + 6, CX + 34, CY + 8, CX + 54, CY + 20, CX + 70, H], function (x, y) {   // 崖
      return band(x, y, ["#120a18", "#1c1024", "#2a1830", "#3a2238"].map(C), 0.2 + ((x * 7 + y * 3) % 11) / 40 + (x < CX - 30 ? 0.25 : 0));
    });
    var ST = ["#0e0814", "#181020", "#24182c", "#342238", "#4a3248"].map(C);
    function stone(x0, y0, w, h) {   // 石の壁（左のふちが月明かりで明るい）
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var row = Math.floor(j / 3), joint = (j % 3 === 0) || ((i + (row % 2) * 3) % 6 === 0);
        var t = 0.35 - i / w * 0.25 + (i < 2 ? 0.35 : 0) - (joint ? 0.15 : 0);
        set(x0 + i, y0 + j, band(x0 + i, y0 + j, ST, t));
      }
    }
    function roof(cx, top, w, h) {
      poly([cx - w / 2 - 1, top + h, cx, top, cx + w / 2 + 1, top + h], function (x, y) {
        return band(x, y, ["#1a0a14", "#2e1020", "#4a1628", "#6a2032"].map(C), 0.3 + (x < cx ? 0.35 : 0) - (y - top) / h * 0.2);
      });
    }
    function windowLit(x, y, h) {
      rect(x, y, 2, h, C("#ff8a3a")); set(x, y, C("#ffd27a")); set(x + 1, y, C("#ffd27a"));
      for (var j = -3; j < h + 3; j++) for (var i = -3; i < 5; i++) if (dith(x + i, y + j, 0.25)) mix(x + i, y + j, [255, 140, 60], 0.2);
    }
    stone(CX - 30, CY - 8, 62, 22);                                      // 城壁
    for (var cr = 0; cr < 62; cr += 6) rect(CX - 30 + cr, CY - 11, 3, 3, ST[2]);
    stone(CX - 38, CY - 30, 12, 44); roof(CX - 32, CY - 46, 14, 16);       // 左の塔
    stone(CX + 28, CY - 26, 12, 40); roof(CX + 34, CY - 42, 14, 16);       // 右の塔
    stone(CX - 9, CY - 46, 18, 38); roof(CX, CY - 72, 22, 26);             // まんなかの塔
    stone(CX - 22, CY - 28, 9, 20); roof(CX - 18, CY - 40, 11, 12);
    stone(CX + 14, CY - 24, 9, 16); roof(CX + 18, CY - 36, 11, 12);
    rect(CX, CY - 84, 1, 12, C("#2a1a30")); poly([CX + 1, CY - 84, CX + 9, CY - 82, CX + 1, CY - 79], function () { return C("#a01a30"); });
    [[CX - 34, CY - 24, 4], [CX - 34, CY - 12, 4], [CX + 32, CY - 18, 4], [CX - 2, CY - 38, 5], [CX - 2, CY - 24, 4], [CX - 20, CY - 2, 3], [CX + 10, CY - 2, 3], [CX + 18, CY - 18, 3]].forEach(function (w) { windowLit(w[0], w[1], w[2]); });
    poly([CX - 6, CY + 14, CX - 6, CY + 4, CX, CY, CX + 6, CY + 4, CX + 6, CY + 14], function () { return C("#06030a"); }); // 門

    // 稲妻（雲から、城の右の崖へ。城を描いたあとに描く）
    var lx2 = 352, ly2 = 100, r3 = rng(5);
    while (ly2 < 148) {
      var nx = lx2 + (r3() - 0.5) * 10, ny = ly2 + 4 + r3() * 5;
      for (var u = 0; u <= 1; u += 0.1) { var qx = lx2 + (nx - lx2) * u, qy = ly2 + (ny - ly2) * u; set(qx, qy, C("#fff4d0")); set(qx + 1, qy, C("#c8a0ff")); for (var gy2 = -3; gy2 <= 3; gy2++) for (var gx2 = -4; gx2 <= 4; gx2++) if ((gx2 || gy2) && dith(qx + gx2, qy + gy2, 0.3)) mix(qx + gx2, qy + gy2, [200, 170, 255], 0.18); }
      lx2 = nx; ly2 = ny;
    }

    // ---------- 中ほどの森（丸い木が重なる） ----------
    var LEAF = ["#08180f", "#0e2617", "#15361f", "#1f4a28", "#2c6032", "#3e7a3c", "#5a9448"].map(C);
    var r4 = rng(41);
    function tree(cx, cy, rad, light) {
      for (var k = 0; k < 5; k++) {
        var ox = cx + (r4() - 0.5) * rad, oy = cy + (r4() - 0.5) * rad * 0.6, rr = rad * (0.5 + r4() * 0.35);
        disc(ox, oy, rr, function (x, y, d) {
          var lx3 = (x - ox) / rr, ly3 = (y - oy) / rr;
          var t = light - (lx3 * 0.35 + ly3 * 0.45) * 0.45 - d * 0.18;
          if (d > 0.82 && ((x * 13 + y * 7) % 5) < 2) return null;   // ふちを葉っぱらしくギザギザに
          return band(x, y, LEAF, t);
        });
      }
    }
    // 遠い森の帯
    for (x = 0; x < W; x++) for (y = 150 + Math.floor(Math.sin(x * 0.11) * 2); y < 168; y++) set(x, y, band(x, y, LEAF, 0.12));
    for (var tx = -10; tx < W + 10; tx += 11) tree(tx + r4() * 6, 152 + r4() * 6, 10 + r4() * 5, 0.32);
    for (tx = -10; tx < W + 10; tx += 16) tree(tx + r4() * 8, 164 + r4() * 6, 13 + r4() * 6, 0.45);

    // ---------- 手前の丘・道・草花 ----------
    var GR = ["#0c1e10", "#143018", "#1e4220", "#2a5628", "#3a6c30", "#4e8436"].map(C);
    var groundTop = function (x) { return 176 + Math.sin(x * 0.02) * 4 - (x < 120 ? (120 - x) * 0.06 : 0); };
    for (x = 0; x < W; x++) for (y = Math.floor(groundTop(x)); y < H; y++) {
      set(x, y, band(x, y, GR, 0.55 - (y - groundTop(x)) / 60 - x / W * 0.15));
    }
    // 道（手前から城のほうへ、曲がりながら細くなる）
    var DIRT = ["#3a2a1e", "#54402a", "#6e5638", "#8a7048"].map(C);
    for (y = 178; y < H; y++) {
      var p = (y - 178) / (H - 178), center = 210 - p * 50 + Math.sin(p * 3) * 12, half = 4 + p * 26;
      for (x = Math.floor(center - half); x <= center + half; x++) {
        var e = Math.abs(x - center) / half;
        set(x, y, band(x, y, DIRT, 0.6 - e * 0.4 + ((x * 5 + y * 11) % 7) / 40));
      }
    }
    // 草（短い線）と花
    var r5 = rng(77);
    for (s = 0; s < 700; s++) {
      var gx = Math.floor(r5() * W), gy = Math.floor(178 + r5() * 38);
      var c2 = get(gx, gy); if (c2[0] > 60) continue; // 道の上はなし
      var hh = 1 + Math.floor(r5() * 3);
      for (var q2 = 0; q2 < hh; q2++) set(gx, gy - q2, band(gx, gy - q2, GR, 0.6 + r5() * 0.4));
    }
    var FL = [C("#f0e070"), C("#e88aa8"), C("#a8c8ff"), C("#ffffff")];
    for (s = 0; s < 40; s++) { var fx = Math.floor(r5() * W), fy = Math.floor(186 + r5() * 28); var cc = get(fx, fy); if (cc[0] > 60) continue; set(fx, fy, FL[s % 4]); set(fx, fy + 1, GR[2]); }
    // 岩（なかまが立つ）
    ell(96, 186, 34, 12, function (x, y, d, dx, dy) { return y > 180 && d < 1 ? band(x, y, ["#1c1a24", "#2c2a36", "#3e3c4a", "#5a5868", "#7a7888"].map(C), 0.5 - dx * 0.3 - dy * 0.4) : null; });

    // ---------- 3人のなかま（岩の上。後ろ姿で、城を見上げる） ----------
    function figure(fx2, fy2, o) {
      var P = o.pal; // [影, 体, 明るい]
      // マント（風になびく）
      poly([fx2 - 5, fy2 - 20, fx2 + 5, fy2 - 20, fx2 + 8, fy2 - 4, fx2 + 11, fy2 - 2, fx2 - 6, fy2 - 3], function (x, y) { return band(x, y, o.cape, 0.5 - (x - fx2) / 14 * 0.5 + (x < fx2 - 2 ? 0.3 : 0)); });
      // 足
      rect(fx2 - 3, fy2 - 3, 2, 3, C("#2a2030")); rect(fx2 + 1, fy2 - 3, 2, 3, C("#2a2030")); set(fx2 - 3, fy2 - 1, C("#4a3a2a"));
      // 頭（髪）
      ell(fx2, fy2 - 23, 4, 4, function (x, y, d, dx, dy) { return band(x, y, o.hair, 0.6 - dx * 0.4 - dy * 0.3); });
      set(fx2 - 2, fy2 - 26, o.hair[3] || o.hair[2]);
      if (o.extra) o.extra(fx2, fy2);
      // 月明かり（左のふち）
      for (var j = fy2 - 27; j < fy2; j++) for (var i = fx2 - 8; i < fx2; i++) {
        var c3 = get(i, j), cl = get(i - 1, j);
        if ((c3[0] + c3[1] + c3[2]) < 200 && (c3[0] + c3[1] + c3[2]) > 40 && (cl[0] + cl[1] + cl[2]) > 200 - 1 && false) set(i, j, P[2]);
      }
    }
    var HAIR_B = ["#2a1608", "#4a2a12", "#6e4420", "#9a6a34"].map(C);
    var HAIR_G = ["#7a5a20", "#b08a34", "#e0c060", "#fff0a0"].map(C);
    var HAIR_K = ["#0e0e14", "#1e1e2a", "#34344a", "#5a5a7a"].map(C);
    // 戦士（まんなか。赤いマント、背中に大きな剣）
    figure(98, 178, { cape: ["#3a0c14", "#6a1622", "#9a2430", "#c8404a"].map(C), hair: HAIR_B, pal: [], extra: function (x0, y0) {
      for (var j = 0; j < 22; j++) { set(x0 + 4 - Math.floor(j / 3), y0 - 34 + j, C("#d8dce8")); set(x0 + 5 - Math.floor(j / 3), y0 - 34 + j, C("#8a90a8")); }
      rect(x0 - 2, y0 - 16, 6, 2, C("#c8a040"));
    } });
    // 魔術師（右。紫のマント、とがった帽子、光る杖）
    figure(116, 180, { cape: ["#1e0c34", "#38165a", "#562284", "#7a38b0"].map(C), hair: HAIR_G, pal: [], extra: function (x0, y0) {
      poly([x0 - 6, y0 - 24, x0 + 6, y0 - 24, x0 + 3, y0 - 30, x0 + 6, y0 - 37], function (x, y) { return band(x, y, ["#1e0c34", "#38165a", "#562284", "#7a38b0"].map(C), 0.6 - (x - x0) / 12); });
      for (var j = 0; j < 26; j++) set(x0 + 9, y0 - 26 + j, C("#7a4a22"));
      disc(x0 + 9, y0 - 28, 3, function () { return C("#9ef0ff"); });
      for (var yy = y0 - 40; yy < y0 - 16; yy++) for (var xx = x0 - 3; xx < x0 + 22; xx++) { var q = Math.sqrt((xx - x0 - 9) * (xx - x0 - 9) + (yy - y0 + 28) * (yy - y0 + 28)); if (q < 11 && dith(xx, yy, (1 - q / 11) * 0.5)) mix(xx, yy, [120, 230, 255], 0.3); }
    } });
    // 狩人（左。緑のマント、ポニーテール、弓）
    figure(80, 180, { cape: ["#0c2a14", "#164a22", "#226a30", "#38904a"].map(C), hair: HAIR_K, pal: [], extra: function (x0, y0) {
      rect(x0 + 2, y0 - 24, 3, 2, HAIR_K[1]); rect(x0 + 4, y0 - 23, 2, 5, HAIR_K[2]);
      for (var j = 0; j < 20; j++) { var bx2 = x0 - 9 + Math.round(Math.sin(j / 19 * Math.PI) * -3); set(bx2, y0 - 26 + j, C("#a07040")); }
      for (j = 0; j < 20; j++) set(x0 - 8, y0 - 26 + j, C("#e8e0c8"));
    } });

    // ---------- 手前の木の枝（左右のすみ。奥行きを出す） ----------
    var DARK = ["#030806", "#06100a", "#0a1a10", "#10261a"].map(C);
    function branchLeaves(cx, cy, rr) {
      disc(cx, cy, rr, function (x, y, d) { if (d > 0.85 && ((x * 7 + y * 13) % 4) < 2) return null; return band(x, y, DARK, 0.6 - d * 0.5 + (((x * 3 + y * 5) % 9) === 0 ? 0.3 : 0)); });
    }
    poly([0, 0, 40, 0, 26, 8, 10, 30, 0, 40], function (x, y) { return band(x, y, DARK, 0.4); });
    [[8, 4, 16], [30, 2, 12], [4, 26, 14], [46, 6, 9], [18, 18, 10]].forEach(function (b2) { branchLeaves(b2[0], b2[1], b2[2]); });
    [[W - 6, 6, 18], [W - 30, 2, 12], [W - 4, 30, 13], [W - 46, 8, 8]].forEach(function (b2) { branchLeaves(b2[0], b2[1], b2[2]); });
    rect(W - 4, 0, 4, 60, DARK[1]);

    // ---------- ホタルの光 ----------
    var r6 = rng(99);
    for (s = 0; s < 22; s++) {
      var hx2 = Math.floor(r6() * W), hy2 = Math.floor(150 + r6() * 55);
      set(hx2, hy2, C("#f8ffa0"));
      for (var j2 = -2; j2 <= 2; j2++) for (var i2 = -2; i2 <= 2; i2++) if (Math.abs(i2) + Math.abs(j2) <= 2 && (i2 || j2)) mix(hx2 + i2, hy2 + j2, [220, 255, 120], 0.25);
    }

    ctx.putImageData(id, 0, 0);
    return cv;
  }

  return {
    W: W, H: H,
    image: function () { if (!img) img = paint(); return img; }
  };
})();
