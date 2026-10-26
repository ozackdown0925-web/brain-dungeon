// 拠点の町とワールドマップの絵（段階7-2d）。
// エルム村とフォレストヴェールの絵は、保護者が Gemini で作ったもの（2026-10-18）。Claude が 320×180 点にちぢめて、色を128色にへらした（assets/maps/）。
// 地方2（フロストクレスト・鉱山の町ボルダ。2026-10-27）は、保護者の絵ができるまで、ここでプログラムで描く仮の絵を使う。
//   絵ができたら assets/maps/ に置いて FILES に足し、PLACEHOLDER から消す（町の建物の場所は base.js の BUILDINGS、地図の場所は worldmap.js の SPOTS を絵に合わせる）。
// 絵は読みこみに少し時間がかかるので、読みこめたら then(絵) を呼ぶ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var MapArt = (function () {
  var FILES = { town: "assets/maps/elm_village.png?v=1", world: "assets/maps/forestveil.png?v=1" };
  var imgs = {}, waiting = {};
  var W = 320, H = 180;

  // ---------- 仮の絵（プログラムで描く） ----------
  function hash(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y, s) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    var a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function canvas() { var c = document.createElement("canvas"); c.width = W; c.height = H; return c; }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }

  // 1点ずつ描く下地：f(x, y) が色（[r,g,b]）を返す
  function paint(ctx, f) {
    var img = ctx.createImageData(W, H), D = img.data;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = f(x, y), i = (y * W + x) * 4;
      D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // フロストクレストの地図（仮）：左下に町、まんなかに坑道の黒い岩山、右へ山、右上に雪山。南西のはしに前の地方への道
  function drawWorld2() {
    var cv = canvas(), ctx = cv.getContext("2d");
    var GROUND = ["#4a4636", "#5a5640", "#6a654a", "#7a7454"].map(hex);
    var ROCK = ["#2c2a30", "#3e3b42", "#55505a", "#6e6874"].map(hex);
    var SNOW = ["#9aa8bc", "#bcc8d8", "#dbe4ee", "#f4f8fc"].map(hex);
    var GRASS = ["#3a4a2c", "#4a5c36"].map(hex);
    paint(ctx, function (x, y) {
      // 高さ：右上ほど高い。でこぼこはノイズ
      var h = (x / W) * 0.6 + (1 - y / H) * 0.6 + (noise(x / 26, y / 26, 3) - 0.5) * 0.3 + (noise(x / 8, y / 8, 4) - 0.5) * 0.08;
      var d = (hash(x, y, 9) - 0.5) * 0.06;
      if (h + d > 1.0) { var s = noise(x / 6, y / 6, 5); return SNOW[s < 0.3 ? 1 : s < 0.7 ? 2 : 3]; }
      if (h + d > 0.93) return SNOW[0];
      if (h + d > 0.7) { var r = noise(x / 5, y / 5, 6); return ROCK[r < 0.3 ? 1 : r < 0.7 ? 2 : 3]; }
      if (h + d < 0.42) return GRASS[noise(x / 7, y / 7, 7) < 0.5 ? 0 : 1];
      var g = noise(x / 6, y / 6, 8);
      return GROUND[g < 0.25 ? 0 : g < 0.55 ? 1 : g < 0.85 ? 2 : 3];
    });
    // 山の三角（影は右がわ）
    function mountain(cx, by, w, hh, snow) {
      for (var y = 0; y < hh; y++) {
        var half = Math.round((y + 1) / hh * w / 2);
        for (var x = -half; x <= half; x++) {
          var c = x < 0 ? (snow && y < hh * 0.4 ? "#f4f8fc" : "#6e6874") : (snow && y < hh * 0.4 ? "#bcc8d8" : "#3e3b42");
          ctx.fillStyle = c; ctx.fillRect(cx + x, by - hh + y, 1, 1);
        }
      }
    }
    [[30, 40, 34, 26, false], [70, 30, 40, 30, false], [180, 52, 46, 36, false], [226, 48, 40, 32, true], [262, 30, 50, 40, true], [300, 36, 40, 30, true], [150, 70, 30, 22, false]].forEach(function (m) { mountain(m[0], m[1], m[2], m[3], m[4]); });
    // 道：南西のはし → 町 → 坑道 → 山 → 雪山
    ctx.strokeStyle = "#a08a5a"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(4, 176); ctx.lineTo(30, 150); ctx.lineTo(70, 112); ctx.lineTo(100, 104); ctx.lineTo(128, 96);
    ctx.lineTo(170, 86); ctx.lineTo(206, 76); ctx.lineTo(240, 54); ctx.lineTo(266, 38); ctx.stroke();
    // 坑道の入口：黒い岩山にあいた穴
    mountain(128, 96, 38, 26, false);
    ctx.fillStyle = "#0c0a10"; ctx.fillRect(123, 87, 10, 9); ctx.fillRect(124, 86, 8, 1);
    ctx.fillStyle = "#6a4a2a"; ctx.fillRect(122, 86, 1, 10); ctx.fillRect(133, 86, 1, 10); ctx.fillRect(122, 85, 12, 1);
    // 町：小さな家々
    [[56, 102], [66, 98], [76, 104], [62, 110], [74, 112], [84, 108]].forEach(function (p, i) {
      ctx.fillStyle = "#7a7468"; ctx.fillRect(p[0], p[1] + 3, 8, 5);
      ctx.fillStyle = i % 2 ? "#8a3a2a" : "#4a5a7a"; ctx.fillRect(p[0] - 1, p[1], 10, 3);
      ctx.fillStyle = "#1a1408"; ctx.fillRect(p[0] + 3, p[1] + 5, 2, 3);
    });
    // 煙突のけむり（鉱山の町）
    ctx.fillStyle = "rgba(220,220,230,0.5)"; ctx.fillRect(68, 92, 2, 2); ctx.fillRect(70, 89, 3, 2); ctx.fillRect(72, 85, 3, 3);
    return cv;
  }

  // 鉱山の町ボルダ（仮）：建物の場所は エルム村（base.js の BUILDINGS）と同じ。岩の地面、北に山なみと山の門
  function drawTown2() {
    var cv = canvas(), ctx = cv.getContext("2d");
    var STONE = ["#4a463e", "#57524a", "#645e54", "#726c60"].map(hex);
    paint(ctx, function (x, y) {
      // 広場のまんなかは石だたみ
      var px = x - 160, py = y - 100, plaza = px * px / 3600 + py * py / 1600 < 1;
      if (plaza) { var b = ((x >> 3) + (y >> 2)) % 2, e = (x % 8 === 0) || (y % 4 === 0); return e ? hex("#3a362e") : b ? hex("#8a8274") : hex("#7c7468"); }
      var n = noise(x / 9, y / 9, 11) * 0.7 + hash(x, y, 12) * 0.3;
      return STONE[n < 0.3 ? 0 : n < 0.55 ? 1 : n < 0.8 ? 2 : 3];
    });
    // 北の山なみ
    for (var x = 0; x < W; x++) {
      var top = 10 + Math.round(noise(x / 18, 0, 13) * 18);
      for (var y = 0; y < top; y++) { ctx.fillStyle = y < top - 6 ? "#3e3b42" : "#55505a"; ctx.fillRect(x, y, 1, 1); }
      if (top > 22) { ctx.fillStyle = "#dbe4ee"; ctx.fillRect(x, 0, 1, Math.max(0, top - 22)); }
    }
    // 山の門（出発）：岩の門
    ctx.fillStyle = "#2c2a30"; ctx.fillRect(140, 2, 40, 30);
    ctx.fillStyle = "#6e6874"; ctx.fillRect(136, 4, 8, 30); ctx.fillRect(176, 4, 8, 30); ctx.fillRect(136, 2, 48, 5);
    ctx.fillStyle = "#0c0a10"; ctx.fillRect(148, 10, 24, 24);
    ctx.fillStyle = "#e0a040"; ctx.fillRect(145, 12, 2, 3); ctx.fillRect(173, 12, 2, 3);   // たいまつ
    // 建物：石のかべに屋根。場所は BUILDINGS と同じ（宿屋・お店・鍛冶屋・転職の神殿・倉庫・書庫）
    var HOUSES = [
      { x: 18, y: 16, w: 58, h: 58, roof: "#8a3a2a" },  // 宿屋
      { x: 18, y: 100, w: 58, h: 40, roof: "#4a5a7a" }, // お店
      { x: 242, y: 26, w: 60, h: 48, roof: "#3a3436", smith: true }, // 鍛冶屋
      { x: 243, y: 98, w: 59, h: 45, roof: "#6a6a8a", temple: true }, // 転職の神殿
      { x: 82, y: 138, w: 54, h: 36, roof: "#6a4a2a" }, // 倉庫
      { x: 184, y: 138, w: 54, h: 36, roof: "#3a5a4a" } // 書庫
    ];
    HOUSES.forEach(function (b) {
      var rh = Math.round(b.h * 0.45);
      ctx.fillStyle = "#1a1612"; ctx.fillRect(b.x + 2, b.y + 2, b.w, b.h);           // かげ
      ctx.fillStyle = "#8e887c"; ctx.fillRect(b.x, b.y + rh, b.w, b.h - rh);          // 石のかべ
      ctx.fillStyle = "#6e685c";
      for (var yy = b.y + rh + 3; yy < b.y + b.h; yy += 4) ctx.fillRect(b.x, yy, b.w, 1);
      ctx.fillStyle = b.roof; ctx.fillRect(b.x - 2, b.y, b.w + 4, rh);                // 屋根
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(b.x - 2, b.y, b.w + 4, 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; for (var xx = b.x; xx < b.x + b.w; xx += 6) ctx.fillRect(xx, b.y + 2, 1, rh - 2);
      ctx.fillStyle = "#2a1c10"; ctx.fillRect(b.x + b.w / 2 - 4, b.y + b.h - 10, 8, 10);  // 戸
      ctx.fillStyle = "#e8c860"; ctx.fillRect(b.x + 6, b.y + rh + 5, 5, 4); ctx.fillRect(b.x + b.w - 11, b.y + rh + 5, 5, 4);  // 窓
      if (b.smith) { ctx.fillStyle = "#e06020"; ctx.fillRect(b.x + 6, b.y + b.h - 9, 6, 5); ctx.fillStyle = "rgba(220,220,230,0.5)"; ctx.fillRect(b.x + b.w - 10, b.y - 6, 4, 6); }
      if (b.temple) { ctx.fillStyle = "#f0d070"; ctx.fillRect(b.x + b.w / 2 - 1, b.y - 6, 2, 8); ctx.fillRect(b.x + b.w / 2 - 3, b.y - 4, 6, 2); }
    });
    // 掲示板（遊び方）
    ctx.fillStyle = "#4a3020"; ctx.fillRect(200, 76, 2, 10); ctx.fillRect(218, 76, 2, 10);
    ctx.fillStyle = "#94683c"; ctx.fillRect(198, 66, 24, 12); ctx.fillStyle = "#e8e0c8"; ctx.fillRect(201, 68, 6, 7); ctx.fillRect(210, 69, 8, 5);
    // トロッコの線路（鉱山の町らしく）
    ctx.fillStyle = "#5a4a3a"; for (var tx = 86; tx < 236; tx += 4) ctx.fillRect(tx, 121, 2, 6);
    ctx.fillStyle = "#9a9aa2"; ctx.fillRect(84, 122, 154, 1); ctx.fillRect(84, 126, 154, 1);
    return cv;
  }
  var PLACEHOLDER = { world2: drawWorld2, town2: drawTown2 };

  // name：town・world など（GameData.REGIONS の art）。読みこめていれば絵を返す。まだなら null を返し、読みこめたら done() を呼ぶ
  function get(name, done) {
    if (!FILES[name] && PLACEHOLDER[name]) {
      if (!imgs[name]) imgs[name] = PLACEHOLDER[name]();
      return imgs[name];
    }
    var im = imgs[name];
    if (im && im.complete && im.naturalWidth) return im;
    if (!im) {
      im = imgs[name] = new Image();
      waiting[name] = [];
      im.onload = function () { var w = waiting[name]; waiting[name] = []; w.forEach(function (f) { f(); }); };
      im.src = FILES[name];
    }
    if (done && waiting[name].indexOf(done) < 0) waiting[name].push(done);
    return null;
  }
  return { get: get };
})();
