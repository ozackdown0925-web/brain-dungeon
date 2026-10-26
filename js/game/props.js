// ダンジョンの小物のドット絵（段階7-3。2026-10-18）：宝箱・鍵・落とし穴。
// （毒の沼と出口は、保護者の希望で床の上に重ねる今の描き方のまま。core.js）
// すべて Claude が描いた（素材は使っていない）。床のタイル（tiles.js）と同じ色・同じふち（#140c1c）・光は左上から。
// 地図の1文字が1点。描いた絵は覚えておく。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Props = (function () {
  var PAL = {
    A: "#140c1c",                                        // ふち
    d: "#2a1a12", w: "#4a3020", W: "#6e4a2c", h: "#94683c", // 木（暗い→明るい）
    S: "#8e8a96", s: "#4a4452", U: "#e4e8f0",            // 鉄の帯・銀
    g: "#7a5a18", G: "#c8a040", y: "#f0d070",            // 金
    k: "#0b0906", K: "#1c140c",                          // 穴・箱の中
    e: "#4a3420", f: "#6a4c2e", F: "#8a6840",            // 土
    q: "#2a5a2e", Q: "#4e8a40", r: "#7aaa4a", R: "#b0dc70", // 葉（薬草。2026-10-20）
    b: "#30346d", B: "#597dce", c: "#a8d8ff", m: "#deeed6", // 青いかさ・白いじく（魔力のキノコ）
    n: "#1e4a52", N: "#2e7a7a", o: "#5ab8a8", O: "#b8f4e4"  // 水色の葉（毒消し草。2026-10-21）
  };

  // 宝箱（閉じた）16×13。鉄の帯（S）は、R以上が出る宝箱では金（G）になる
  var CHEST = [
    "..AAAAAAAAAAAA..",
    ".AhhhShhhhShhhA.",
    ".AWWWSWWWWSWWWA.",
    "AWWWWSWWWWSWWWWA",
    "AwwwwSwwwwSwwwwA",
    "AAAAAAGGGGAAAAAA",
    "AhhhhSGyyGShhhhA",
    "AWWWWSgGGgSWWWWA",
    "AWWWWSWWWWSWWWWA",
    "AwwwwSwwwwSwwwwA",
    "AwwwwSwwwwSwwwwA",
    "AddddddddddddddA",
    ".AAAAAAAAAAAAAA."
  ];
  // 宝箱（開いた）：ふたが後ろに開いて、中が見える
  var CHEST_OPEN = [
    "..AAAAAAAAAAAA..",
    ".AhhhShhhhShhhA.",
    ".AwwwSwwwwSwwwA.",
    "AAAAAAAAAAAAAAAA",
    "AKKKKKKKKKKKKKKA",
    "AkkkkkkkkkkkkkkA",
    "AAAAAAAAAAAAAAAA",
    "AhhhhShhhhShhhhA",
    "AWWWWSWWWWSWWWWA",
    "AwwwwSwwwwSwwwwA",
    "AwwwwSwwwwSwwwwA",
    "AddddddddddddddA",
    ".AAAAAAAAAAAAAA."
  ];
  // 鍵 13×7
  var KEY = [
    ".AAAA........",
    "AyyGGA.......",
    "AyAAGAAAAAAA.",
    "AG.AGyyyyyyGA",
    "AyAAGAAAAgGA.",
    "AGGggA..AgA..",
    ".AAAA...AA..."
  ];
  // 落とし穴 16×16（奥の土のかべが見える）
  var PIT = [
    "................",
    ".....FFFFFF.....",
    "...FFffffffFF...",
    "..FfAAAAAAAAfF..",
    ".FfAeeeeeeeeAfF.",
    ".FAeeeeeeeeeeAF.",
    "FfAKeeeeeeeeKAfF",
    "FfAKKKKKKKKKKAfF",
    "FfAkkkkkkkkkkAfF",
    "FfAkkkkkkkkkkAfF",
    "FfAkkkkkkkkkkAfF",
    ".FAkkkkkkkkkkAF.",
    ".FfAkkkkkkkkAfF.",
    "..FfAAAAAAAAfF..",
    "...FFffffffFF...",
    ".....FFFFFF....."
  ];

  // 薬草 9×9：3まいの葉（2026-10-20）
  var HERB = [
    "..AA.AA..",
    ".ARRARRA.",
    ".ARQAQRA.",
    "..AQRQA..",
    "...AQA...",
    "..AAQAA..",
    ".AQRQRQA.",
    "..AAqAA..",
    "...AqA..."
  ];
  // 魔力のキノコ 9×9：青いかさに白い点、白いじく
  var MUSH = [
    "..AAAAA..",
    ".ABBcBBA.",
    "ABcBBBcBA",
    "ABBBBBBBA",
    "AbbbbbbbA",
    ".AAmmmAA.",
    "...AmmA..",
    "...AmmA..",
    "....AA..."
  ];

  // ---------- 回復の泉・モンスターの巣（2026-10-22 保護者の感想：まわりのドット絵からういて見えたので、1点ずつの絵にした） ----------
  // 形はだ円を1点ずつ決めて描く（なめらかな線や光のぼかしは使わない）。ふちは #140c1c、光は左上から。
  // frame：水面のきらめき・泡の動き（コマ）
  function canvas(w, h) { var cv = document.createElement("canvas"); cv.width = w; cv.height = h; return cv; }
  function inEll(x, y, cx, cy, rx, ry) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; }
  // まわりにふち（A）をつける：色のある点のとなりの、色のない点をふちにする
  function outline(px, w, h) {
    var out = px.map(function (r) { return r.slice(); });
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (px[y][x]) continue;
      var near = (x > 0 && px[y][x - 1]) || (x < w - 1 && px[y][x + 1]) || (y > 0 && px[y - 1][x]) || (y < h - 1 && px[y + 1][x]);
      if (near) out[y][x] = "#140c1c";
    }
    return out;
  }
  function paint(px, w, h, flash) {
    var cv = canvas(w, h), ctx = cv.getContext("2d");
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = px[y][x]; if (!c) continue;
      ctx.fillStyle = flash && c !== "#140c1c" ? "#ffffff" : c; ctx.fillRect(x, y, 1, 1);
    }
    return cv;
  }
  function grid(w, h) { var g = []; for (var y = 0; y < h; y++) { g.push([]); for (var x = 0; x < w; x++) g[y].push(null); } return g; }

  // 回復の泉 30×18：石をならべたふちと、明るい水。石の色は部屋の岩と同じ（樹海・瘴気の森・原生の秘境）
  var SPRING_ROCK = {
    forest: ["#2c2834", "#4a4452", "#6a6474", "#8e8a96", "#b4b0b8"],
    swamp: ["#221f2e", "#363248", "#4c4862", "#68647e", "#8c88a2"],
    wild: ["#262a2a", "#3e4442", "#5a605a", "#7c8278", "#a2a89c"],   // 原生の秘境：苔むした石
    cave: ["#16141a", "#28252e", "#3c3842", "#544f5a", "#706a76"]     // 黒鉄の坑道：暗い岩
  };
  var SPRING_WATER = ["#1f4a72", "#2a6090", "#4a88b8", "#7fc8ec", "#c8f0ff", "#ffffff"];
  function buildSpring(theme, frame) {
    var W = 30, H = 18, cx = 15, cy = 9, R = SPRING_ROCK[theme] || SPRING_ROCK.forest, px = grid(W, H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!inEll(x, y, cx, cy, 14, 8)) continue;
      if (inEll(x, y, cx, cy + 0.5, 10, 5)) {
        // 水：ふちの近く（とくに上）は暗く、まんなかは明るい
        var dx = (x + 0.5 - cx) / 10, dy = (y + 0.5 - cy - 0.5) / 5, d = Math.sqrt(dx * dx + dy * dy);
        var k = d > 0.85 ? 0 : d > 0.6 ? 1 : 2;
        if (dy < -0.55) k = Math.min(k, 0);   // 上のふちの影
        if (k === 2 && (x + y) % 2 === 0 && d > 0.45) k = 1;   // あいだは市松でまぜる
        px[y][x] = SPRING_WATER[k + 1];   // 不思議な泉なので、ふつうの水より明るい
      } else {
        // 石：角度で10こに分け、石と石のさかいは暗く。左上が明るい
        var ang = Math.atan2((y + 0.5 - cy) / 8, (x + 0.5 - cx) / 14), seg = (ang + Math.PI) / (Math.PI * 2) * 10;
        var edge = seg - Math.floor(seg) < 0.16;
        var outer = !inEll(x, y, cx, cy, 12.6, 6.9);
        var lit = (x - cx) / 14 + (y - cy) / 8;
        var shade = edge ? 0 : lit < -0.6 ? 4 : lit < 0 ? 3 : lit < 0.6 ? 2 : 1;
        if (outer && y > cy && !edge) shade = Math.max(1, shade - 1);   // 手前の面は少し暗い
        px[y][x] = R[shade];
      }
    }
    // 水面のきらめき（コマごとに場所がかわる、横に短い光）
    var GL = [[[10, 8], [17, 10], [14, 7]], [[12, 9], [18, 8], [9, 10]], [[15, 10], [11, 7], [19, 9]]][frame % 3];
    GL.forEach(function (p, i) {
      var x0 = p[0], y0 = p[1];
      if (px[y0] && px[y0][x0] && px[y0][x0 + 1]) { px[y0][x0] = SPRING_WATER[5]; px[y0][x0 + 1] = SPRING_WATER[4]; }
    });
    return paint(outline(px, W, H), W, H, false);
  }

  // モンスターの巣 40×26：暗い泥のふち、泡立つ紫の毒の水（緑のにごり）、まんなかに黒い穴のあいた泥の山
  var MUD = ["#1a1220", "#2a1e30", "#3e2e44", "#56425c", "#6e5878"];
  var VENOM = ["#2e1640", "#4a2462", "#6a3684", "#8e52a8", "#c89ae0"];
  var SCUM = ["#3e6a32", "#5e8a3e", "#8aba58"];
  function buildNest(frame, flash) {
    var W = 40, H = 26, cx = 20, cy = 14, px = grid(W, H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!inEll(x, y, cx, cy, 19, 10.5)) continue;
      var lit = (x - cx) / 19 + (y - cy) / 10.5;
      if (!inEll(x, y, cx, cy + 0.5, 15.5, 7.5)) {
        // 泥のふち：左上が明るい。ところどころ点
        var s = lit < -0.7 ? 3 : lit < 0 ? 2 : lit < 0.7 ? 1 : 0;
        if ((x * 7 + y * 3) % 11 === 0) s = Math.min(4, s + 1);
        px[y][x] = MUD[s];
      } else {
        // 毒の水：上のふちの近くは影。まんなかへ明るく、あいだは市松
        var dx = (x + 0.5 - cx) / 15.5, dy = (y + 0.5 - cy - 0.5) / 7.5, d = Math.sqrt(dx * dx + dy * dy);
        var v = d > 0.85 ? 1 : d > 0.55 ? 2 : 3;
        if (dy < -0.6) v = 0;
        if (v === 3 && (x + y) % 2 === 0 && d > 0.4) v = 2;
        px[y][x] = VENOM[v];
        // 緑のにごり（決まった場所に、すこし）
        if (((x * 13 + y * 7) % 23 === 0 || (x * 5 + y * 11) % 29 === 0) && d > 0.45) px[y][x] = SCUM[(x + y) % 2];
      }
    }
    // まんなかの泥の山（もり上がり。上が明るい）と、敵の出てくる穴
    var MX = 20, MY = 11.5, MRX = 6.5, MRY = 4.5;
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      if (!inEll(x2, y2, MX, MY, MRX, MRY)) continue;
      var l2 = (x2 - MX) / MRX + (y2 - MY) / MRY * 1.3;
      px[y2][x2] = MUD[l2 < -0.9 ? 4 : l2 < -0.2 ? 3 : l2 < 0.6 ? 2 : 1];
    }
    for (var x3 = 0; x3 < W; x3++) for (var y3 = H - 2; y3 > 0; y3--) {   // 山の下のかげ（毒の水の上に1点）
      if (inEll(x3, y3, MX, MY, MRX, MRY)) { if (px[y3 + 1][x3] && VENOM.indexOf(px[y3 + 1][x3]) >= 0) px[y3 + 1][x3] = VENOM[0]; break; }
    }
    [[16, 11, 2], [21, 12, 2], [19, 9, 1]].forEach(function (h) {   // 穴：黒い中と、上に明るいふち
      for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < h[2]; xx++) px[h[1] + yy][h[0] + xx] = "#0a0410";
      for (var xx2 = 0; xx2 < h[2]; xx2++) if (px[h[1] - 1][h[0] + xx2]) px[h[1] - 1][h[0] + xx2] = MUD[4];
    });
    // 泡：コマごとに、ふくらむ → はじける
    var BUB = [[8, 15], [30, 13], [12, 18], [27, 18], [33, 16], [6, 12]];
    BUB.forEach(function (b, i) {
      var st = (frame + i) % 4, x0 = b[0], y0 = b[1];
      if (!px[y0] || !px[y0][x0] || px[y0][x0] === MUD[0] || MUD.indexOf(px[y0][x0]) >= 0) return;
      if (st === 0) px[y0][x0] = VENOM[4];
      else if (st === 1) { px[y0][x0] = VENOM[4]; px[y0][x0 + 1] = VENOM[3]; px[y0 - 1][x0] = "#e8d8f0"; px[y0 - 1][x0 + 1] = VENOM[4]; }
      else if (st === 2) { px[y0 - 1][x0 - 1] = "#e8d8f0"; px[y0 - 1][x0 + 2] = "#e8d8f0"; px[y0][x0] = VENOM[1]; px[y0][x0 + 1] = VENOM[1]; }
    });
    return paint(outline(px, W, H), W, H, flash);
  }

  var cache = {};
  function fromMap(map, swap) {
    var h = map.length, w = map[0].length;
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d");
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var ch = map[y].charAt(x);
      if (swap && swap[ch]) ch = swap[ch];
      if (ch === "." || !PAL[ch]) continue;
      ctx.fillStyle = PAL[ch]; ctx.fillRect(x, y, 1, 1);
    }
    return cv;
  }
  function get(name) {
    if (cache[name]) return cache[name];
    var img;
    if (name === "chest") img = fromMap(CHEST);
    else if (name === "chestRare") img = fromMap(CHEST, { S: "G", s: "g" });
    else if (name === "chestOpen") img = fromMap(CHEST_OPEN);
    else if (name === "chestOpenRare") img = fromMap(CHEST_OPEN, { S: "G", s: "g" });
    else if (name === "key") img = fromMap(KEY);
    // 宝箱の鍵（銀）と、金の宝箱（2026-10-19）
    else if (name === "keySilver") img = fromMap(KEY, { y: "U", G: "S", g: "s" });
    else if (name === "chestGold") img = fromMap(CHEST, { h: "y", W: "G", w: "g", d: "w", S: "W", s: "w" });
    else if (name === "chestOpenGold") img = fromMap(CHEST_OPEN, { h: "y", W: "G", w: "g", d: "w", S: "W", s: "w" });
    else if (name === "pit") img = fromMap(PIT);
    else if (name === "herb") img = fromMap(HERB);
    else if (name === "mush") img = fromMap(MUSH);
    else if (name === "cure") img = fromMap(HERB, { q: "n", Q: "N", r: "o", R: "O" });   // 毒消し草：薬草の形で、水色の葉
    // 回復の泉：spring_<forest|swamp|wild|cave>_<コマ0〜2>。モンスターの巣：nest_<コマ0〜3>（_hit は当たったときの白）
    else if (name.indexOf("spring_") === 0) { var sp = name.split("_"); img = buildSpring(sp[1], +sp[2]); }
    else if (name.indexOf("nest_") === 0) { var ns = name.split("_"); img = buildNest(+ns[1], ns[2] === "hit"); }
    cache[name] = img;
    return img;
  }

  return { get: get };
})();
