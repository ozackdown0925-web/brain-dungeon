// 拠点の町とワールドマップの絵（段階7-2d）。
// エルム村とフォレストヴェールの絵は、保護者が Gemini で作ったもの（2026-10-18）。Claude が 320×180 点にちぢめて、色を128色にへらした（assets/maps/）。
// 鉱山の町ボルダとフロストクレストの絵（地方2）も、保護者が Gemini で作ったもの（2026-10-27）。同じように 320×180 点・128色にした。
//   町の絵は横長だったので、横を少しちぢめている。建物の場所は base.js の LAYOUTS、地図の場所は worldmap.js の SPOTS で絵に合わせた。
// これからの地方も、絵ができるまでは、ここでプログラムで描く仮の絵（PLACEHOLDER）を使える。ヴォルカマリン（地方3。2026-11-14）は今この仮の絵。
//   絵ができたら assets/maps/ に置いて FILES に足し、PLACEHOLDER から消す。
// 絵は読みこみに少し時間がかかるので、読みこめたら then(絵) を呼ぶ。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var MapArt = (function () {
  var FILES = { town: "assets/maps/elm_village.png?v=1", world: "assets/maps/forestveil.png?v=1",
    town2: "assets/maps/borda.png?v=1", world2: "assets/maps/frostcrest.png?v=1" };
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

  // ---------- ヴォルカマリン（地方3。2026-11-14）の仮の絵。保護者の絵ができたら差しかえる ----------
  // 地図：まんなかから右に大きな湖、北西に水晶の鍾乳洞の岩山（青く光る穴）、北東に赤い火山（溶岩とけむり）、
  //   湖の西岸に湖畔の街リムネ。西のはしから道が街へ入る。場所は worldmap.js の SPOTS.volcamarine と合わせる
  function drawWorld3() {
    var cv = canvas(), ctx = cv.getContext("2d");
    var GRASS = ["#3c5a2e", "#4a6c34", "#587e3c", "#6a9046"].map(hex);
    var SAND = ["#b8a070", "#c8b484"].map(hex);
    var WATER = ["#16406a", "#1e5288", "#2a66a0", "#4a8cc4", "#a8d8f0"].map(hex);
    var ROCK = ["#2a2c3a", "#3c3f52", "#53566c", "#6c6f86"].map(hex);
    var ASH = ["#3a2a26", "#4e3630", "#64443a", "#7a5446"].map(hex);
    paint(ctx, function (x, y) {
      // 湖：だ円にでこぼこ
      var lx = (x - 182) / 112, ly = (y - 112) / 52, lake = lx * lx + ly * ly + (noise(x / 14, y / 14, 21) - 0.5) * 0.35;
      if (lake < 0.82) {
        var dv = (0.82 - lake) * 2.4 + (noise(x / 10, y / 6, 22) - 0.5) * 0.4;
        var c = WATER[dv < 0.2 ? 3 : dv < 0.7 ? 2 : dv < 1.3 ? 1 : 0];
        if (noise(x / 3, y, 23) > 0.8 && y % 3 === 0) c = WATER[3];
        if (hash(x, y, 24) < 0.004) c = WATER[4];
        return c;
      }
      if (lake < 0.95) return SAND[hash(x, y, 25) < 0.5 ? 0 : 1];
      // 火山のまわり（北東）は灰色の荒れ地
      var vx = (x - 266) / 70, vy = (y - 52) / 46, vol = vx * vx + vy * vy + (noise(x / 12, y / 12, 26) - 0.5) * 0.4;
      if (vol < 1) { var a = noise(x / 6, y / 6, 27); return ASH[a < 0.3 ? 0 : a < 0.55 ? 1 : a < 0.8 ? 2 : 3]; }
      // 鍾乳洞のまわり（北西）は岩山
      var cx = (x - 56) / 52, cy = (y - 40) / 36, rk = cx * cx + cy * cy + (noise(x / 10, y / 10, 28) - 0.5) * 0.4;
      if (rk < 1) { var r = noise(x / 5, y / 5, 29); return ROCK[r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : 3]; }
      var g = noise(x / 8, y / 8, 30) * 0.7 + hash(x, y, 31) * 0.3;
      return GRASS[g < 0.3 ? 0 : g < 0.55 ? 1 : g < 0.8 ? 2 : 3];
    });
    function tri(cx0, by, w, hh, light, shade, top, topH) {
      for (var y = 0; y < hh; y++) {
        var half = Math.round((y + 1) / hh * w / 2);
        for (var x = -half; x <= half; x++) {
          ctx.fillStyle = top && y < topH ? top : x < 0 ? light : shade; ctx.fillRect(cx0 + x, by - hh + y, 1, 1);
        }
      }
    }
    // 北西の岩山と、水晶の鍾乳洞の入口（青く光る穴）
    [[22, 44, 34, 26], [44, 34, 40, 30], [82, 40, 36, 24], [66, 58, 30, 18]].forEach(function (m) { tri(m[0], m[1], m[2], m[3], "#6c6f86", "#3c3f52"); });
    ctx.fillStyle = "#0a0c18"; ctx.fillRect(52, 46, 12, 10); ctx.fillRect(53, 45, 10, 1);
    ctx.fillStyle = "#4ab0f0"; ctx.fillRect(55, 50, 2, 5); ctx.fillRect(59, 49, 2, 6);
    ctx.fillStyle = "#c8f0ff"; ctx.fillRect(55, 50, 1, 2); ctx.fillRect(59, 49, 1, 2);
    ctx.fillStyle = "#9a7cf0"; ctx.fillRect(57, 52, 2, 3);
    // 北東の火山：赤茶の山、てっぺんに溶岩、流れ落ちる溶岩の筋、けむり
    tri(266, 70, 92, 54, "#7a4a36", "#4e2e24");
    ctx.fillStyle = "#2a1410"; ctx.fillRect(258, 15, 17, 3);
    ctx.fillStyle = "#f06020"; ctx.fillRect(259, 16, 15, 2);
    ctx.fillStyle = "#ffc040"; ctx.fillRect(263, 16, 6, 1);
    [[262, 18, 0.35], [270, 18, -0.25], [266, 18, 0.05]].forEach(function (l) {
      for (var i = 0; i < 26; i++) { ctx.fillStyle = i % 5 === 0 ? "#ffc040" : "#e04a18"; ctx.fillRect(Math.round(l[0] + l[2] * i * 1.6 + Math.sin(i * 0.7) * 1.2), l[1] + i, 2, 1); }
    });
    ctx.fillStyle = "rgba(90,80,80,0.75)";
    [[264, 8, 6], [268, 2, 7], [274, -3, 6]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1] + 6, c[2], 0, Math.PI * 2); ctx.fill(); });
    // 湖のまんなかの、しずんだ神殿の屋根（水の下に白い柱が見える）
    ctx.fillStyle = "rgba(200,230,250,0.55)";
    for (var p = 0; p < 4; p++) ctx.fillRect(168 + p * 5, 98, 2, 8);
    ctx.fillRect(166, 96, 20, 2);
    // 道：西のはし → 街 → 鍾乳洞、街 → 湖の北岸 → 火山
    ctx.strokeStyle = "#c8b080"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, 98); ctx.lineTo(30, 100); ctx.lineTo(62, 112); ctx.lineTo(78, 116); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(72, 108); ctx.lineTo(66, 86); ctx.lineTo(60, 62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(84, 104); ctx.lineTo(118, 74); ctx.lineTo(170, 60); ctx.lineTo(214, 62); ctx.lineTo(246, 66); ctx.stroke();
    // 街：白いかべに青と橙の屋根。湖へのびる桟橋と小舟
    [[70, 112], [80, 108], [90, 114], [76, 122], [88, 124], [98, 118], [66, 124]].forEach(function (q, i) {
      ctx.fillStyle = "#e8e0d0"; ctx.fillRect(q[0], q[1] + 3, 8, 5);
      ctx.fillStyle = i % 2 ? "#d07a30" : "#3a6ab0"; ctx.fillRect(q[0] - 1, q[1], 10, 3);
      ctx.fillStyle = "#2a1c10"; ctx.fillRect(q[0] + 3, q[1] + 5, 2, 3);
    });
    ctx.fillStyle = "#8a6a40"; ctx.fillRect(104, 120, 14, 2); ctx.fillRect(104, 128, 10, 2);
    ctx.fillStyle = "#6a4a2a"; ctx.fillRect(120, 124, 6, 2); ctx.fillStyle = "#e8e0d0"; ctx.fillRect(122, 120, 1, 4);
    return cv;
  }

  // 湖畔の街リムネ（仮）：建物の場所はエルム村（base.js の BUILDINGS）と同じ。北に湖が広がり、湖の門（出発）は湖に出る桟橋の門。
  //   白いかべに青と橙の屋根の家、広場は石だたみ、地面は砂と草
  function drawTown3() {
    var cv = canvas(), ctx = cv.getContext("2d");
    var GROUND = ["#9a8c62", "#a89a6c", "#6c8a48", "#7a9a52"].map(hex);
    var WATER = ["#1e5288", "#2a66a0", "#4a8cc4", "#a8d8f0"].map(hex);
    paint(ctx, function (x, y) {
      var shore = 30 + Math.round(noise(x / 16, 0, 41) * 8);
      if (y < shore) {
        var c = WATER[y < shore - 14 ? 0 : 1];
        if (noise(x / 4, y, 42) > 0.75 && y % 3 === 0) c = WATER[2];
        if (hash(x, y, 43) < 0.006) c = WATER[3];
        return c;
      }
      if (y < shore + 3) return hex("#c8b484");
      var px = x - 160, py = y - 100, plaza = px * px / 3600 + py * py / 1600 < 1;
      if (plaza) { var b = ((x >> 3) + (y >> 2)) % 2, e = (x % 8 === 0) || (y % 4 === 0); return e ? hex("#8a8478") : b ? hex("#d8d0c0") : hex("#c8c0b0"); }
      var n = noise(x / 9, y / 9, 44) * 0.7 + hash(x, y, 45) * 0.3;
      return GROUND[n < 0.25 ? 0 : n < 0.45 ? 1 : n < 0.75 ? 2 : 3];
    });
    // 湖の門：湖へのびる桟橋と、木の門
    ctx.fillStyle = "#6a4a2a"; ctx.fillRect(150, 0, 20, 34);
    ctx.fillStyle = "#94683c"; for (var yy = 0; yy < 34; yy += 3) ctx.fillRect(150, yy, 20, 2);
    ctx.fillStyle = "#4a3020"; ctx.fillRect(138, 6, 6, 28); ctx.fillRect(176, 6, 6, 28); ctx.fillRect(136, 4, 48, 5);
    ctx.fillStyle = "#3a6ab0"; ctx.fillRect(136, 2, 48, 2);
    ctx.fillStyle = "#6a4a2a"; ctx.fillRect(110, 14, 16, 5); ctx.fillStyle = "#e8e0d0"; ctx.fillRect(117, 6, 1, 8);   // 小舟
    var HOUSES = [
      { x: 18, y: 16, w: 58, h: 58, roof: "#d07a30" },  // 宿屋
      { x: 18, y: 100, w: 58, h: 40, roof: "#3a6ab0" }, // お店
      { x: 242, y: 26, w: 60, h: 48, roof: "#4a4a52", smith: true }, // 鍛冶屋
      { x: 243, y: 98, w: 59, h: 45, roof: "#5a8ac8", temple: true }, // 転職の神殿
      { x: 82, y: 138, w: 54, h: 36, roof: "#a0602a" }, // 倉庫
      { x: 184, y: 138, w: 54, h: 36, roof: "#2a7a8a" } // 書庫
    ];
    HOUSES.forEach(function (b) {
      var rh = Math.round(b.h * 0.45);
      ctx.fillStyle = "#3a3020"; ctx.fillRect(b.x + 2, b.y + 2, b.w, b.h);           // かげ
      ctx.fillStyle = "#ece6d8"; ctx.fillRect(b.x, b.y + rh, b.w, b.h - rh);          // 白いかべ
      ctx.fillStyle = "#c8c0b0"; ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
      ctx.fillStyle = b.roof; ctx.fillRect(b.x - 2, b.y, b.w + 4, rh);                // 屋根
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(b.x - 2, b.y, b.w + 4, 2);
      ctx.fillStyle = "rgba(0,0,0,0.22)"; for (var xx = b.x; xx < b.x + b.w; xx += 5) ctx.fillRect(xx, b.y + 2, 1, rh - 2);
      ctx.fillStyle = "#5a3a20"; ctx.fillRect(b.x + b.w / 2 - 4, b.y + b.h - 10, 8, 10);  // 戸
      ctx.fillStyle = "#4a8cc4"; ctx.fillRect(b.x + 6, b.y + rh + 5, 5, 4); ctx.fillRect(b.x + b.w - 11, b.y + rh + 5, 5, 4);  // 窓
      if (b.smith) { ctx.fillStyle = "#e06020"; ctx.fillRect(b.x + 6, b.y + b.h - 9, 6, 5); ctx.fillStyle = "rgba(220,220,230,0.5)"; ctx.fillRect(b.x + b.w - 10, b.y - 6, 4, 6); }
      if (b.temple) { ctx.fillStyle = "#f0d070"; ctx.fillRect(b.x + b.w / 2 - 1, b.y - 6, 2, 8); ctx.fillRect(b.x + b.w / 2 - 3, b.y - 4, 6, 2); }
    });
    // 掲示板（遊び方）
    ctx.fillStyle = "#4a3020"; ctx.fillRect(200, 76, 2, 10); ctx.fillRect(218, 76, 2, 10);
    ctx.fillStyle = "#94683c"; ctx.fillRect(198, 66, 24, 12); ctx.fillStyle = "#e8e0c8"; ctx.fillRect(201, 68, 6, 7); ctx.fillRect(210, 69, 8, 5);
    // 広場の噴水
    ctx.fillStyle = "#8a8478"; ctx.beginPath(); ctx.arc(160, 100, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a8cc4"; ctx.beginPath(); ctx.arc(160, 100, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a8d8f0"; ctx.fillRect(159, 94, 2, 6);
    return cv;
  }

  var PLACEHOLDER = { world3: drawWorld3, town3: drawTown3 };   // 絵がまだない地方の仮の絵（name: 描く関数）

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
