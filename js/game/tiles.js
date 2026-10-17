// 地面と部屋のドット絵（段階7-2a）。すべてプログラムで1点ずつ描く（素材は使っていない）。
// 部屋に入ったときに、部屋全体を1枚の絵（canvas）に描いて覚えておき、毎フレームはその絵を写すだけにする。
// タイル（16×16点）の文字：. 地面　: となりの部屋への道　* 草むら　~ 水　= 橋　T 木　# 壁　L 鍵のかかった扉　V つる
// 壁は2種類：部屋のまわりの壁（外とつながっている）は「森のしげみ」、部屋の中の壁は「岩のがけ」（上が草、南の面が岩）。
// 水・草むら・木・壁のさかい目は、となりのタイルを見て丸くつなぐ。光は左上から（影は右下）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Tiles = (function () {
  var T = 16;

  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function pal(list) { return list.map(hex); }
  var OUT = hex("#140c1c");
  var GRASS = pal(["#2b4424", "#3a5c2e", "#4a7036", "#5e8a3e", "#82aa4a"]);     // 地面の草（暗い→明るい）
  var DIRT = pal(["#4a3420", "#6a4c2e", "#8a6840", "#a88452"]);                 // 土の道
  var TALL = pal(["#1e3a1e", "#2e5428", "#467634", "#6a9a40", "#9cc458"]);      // 草むら
  var WATER = pal(["#16304e", "#1f4a72", "#2a6090", "#4a88b8", "#a8d8ec"]);     // 水
  var LEAF = pal(["#0e2416", "#183a20", "#24522a", "#3a7034", "#5c9440"]);      // 木の葉
  var BARK = pal(["#2a1a12", "#4a3020", "#6e4a2c", "#94683c"]);                 // 木のみき・橋の板
  var ROCK = pal(["#2c2834", "#4a4452", "#6a6474", "#8e8a96", "#b4b0b8"]);      // 岩
  var FLOWER = pal(["#e8e0c8", "#f0d860", "#d86a8a"]);
  var GOLD = pal(["#7a5a18", "#c8a040", "#f0d070"]);
  var VINE = pal(["#0e1e10", "#1f3a1c", "#2f6a2a", "#4d8a3c"]);

  // ---------- 乱数とノイズ（場所で決まる。同じ部屋はいつも同じ絵） ----------
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
  // 市松もようのまぜ方（2×2）
  var BAYER = [[0, 0.5], [0.75, 0.25]];
  function dither(v, x, y) { return v + (BAYER[y & 1][x & 1] - 0.375) * 0.5; }

  // ---------- 部屋1つを絵にする ----------
  function render(room) {
    var W = room.pxW, H = room.pxH, w = room.w, h = room.h;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var img = ctx.createImageData(W, H), D = img.data;
    function put(x, y, c) {
      if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
      var i = (y * W + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
    function get(x, y) {
      var i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]];
    }
    function dark(c, k) { return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]; }
    function tile(tx, ty) { return room.tile(tx, ty); }

    // 外とつながっている壁（森のしげみ）と、部屋の中の壁（岩のがけ）を分ける
    var outer = {};
    var stack = [];
    for (var i = 0; i < w; i++) { stack.push([i, 0]); stack.push([i, h - 1]); }
    for (i = 0; i < h; i++) { stack.push([0, i]); stack.push([w - 1, i]); }
    while (stack.length) {
      var p = stack.pop(), k = p[0] + "," + p[1];
      if (p[0] < 0 || p[1] < 0 || p[0] >= w || p[1] >= h || outer[k] || tile(p[0], p[1]) !== "#") continue;
      outer[k] = true;
      stack.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]);
    }
    // 種類：forest（しげみ）・rock（がけ）・tree・water・tall・path・ground など
    function kind(tx, ty) {
      var t = tile(tx, ty);
      if (t === "#") {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return "forest";
        return outer[tx + "," + ty] ? "forest" : "rock";
      }
      if (t === "T") return "tree";
      if (t === "~") return "water";
      if (t === "*") return "tall";
      if (t === "=") return "bridge";
      if (t === ":") return "path";
      if (t === "L") return "lock";
      if (t === "V") return "vine";
      return "ground";
    }
    // 1点ごとの「その種類の中か」：タイルのまんなかの値（中＝1・外＝0）を、なめらかにつないで 0.5 で切る。
    // まっすぐなさかい目はタイルの境目のまま、角はななめに丸くなる。jit で少しゆらす
    function field(test, gx, gy) {
      var u = (gx + 0.5) / T - 0.5, v = (gy + 0.5) / T - 0.5;
      var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      var a = test(x0, y0) ? 1 : 0, b = test(x0 + 1, y0) ? 1 : 0, c = test(x0, y0 + 1) ? 1 : 0, d = test(x0 + 1, y0 + 1) ? 1 : 0;
      fx = smooth(fx); fy = smooth(fy);
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
    function inside(gx, gy, test, jit, seed) {
      if (!test(Math.floor(gx / T), Math.floor(gy / T)) && field(test, gx, gy) < 0.5) return false;
      var th = 0.5 + (jit ? (noise(gx / 3, gy / 3, seed || 0) - 0.5) * jit : 0);
      return field(test, gx, gy) >= th;
    }
    function edgeOf(gx, gy, test, jit, seed) {
      return !inside(gx - 1, gy, test, jit, seed) || !inside(gx + 1, gy, test, jit, seed) || !inside(gx, gy - 1, test, jit, seed) || !inside(gx, gy + 1, test, jit, seed);
    }
    function isK(name) { return function (tx, ty) { return kind(tx, ty) === name; }; }

    // ---------- 1. 地面（どこにもまず草の地面を敷く） ----------
    // 道：部屋の出入口のまわりは土
    var doors = [];
    for (var ty = 0; ty < h; ty++) for (var tx = 0; tx < w; tx++) if (tile(tx, ty) === ":" || tile(tx, ty) === "L" || tile(tx, ty) === "V") doors.push([tx * T + 8, ty * T + 8]);
    function pathAmount(gx, gy) {
      var best = 99;
      for (var d = 0; d < doors.length; d++) {
        var dx = gx - doors[d][0], dy = gy - doors[d][1], dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < best) best = dd;
      }
      return best;
    }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var n = noise(x / 14, y / 14, 1) * 0.7 + noise(x / 5, y / 5, 2) * 0.3;
      var c = n < 0.36 ? GRASS[1] : n < 0.66 ? GRASS[2] : GRASS[3];
      // さかい目だけ市松もようでまぜる
      if (Math.abs(n - 0.36) < 0.025 || Math.abs(n - 0.66) < 0.025) c = (x + y) % 2 ? GRASS[n < 0.5 ? 1 : 2] : GRASS[n < 0.5 ? 2 : 3];
      // 道（土）
      var pa = doors.length ? pathAmount(x, y) : 99;
      var lim = 22 + noise(x / 4, y / 4, 3) * 10;
      if (pa < lim) {
        var dv = dither(noise(x / 5, y / 5, 4), x, y);
        c = dv < 0.35 ? DIRT[1] : dv < 0.75 ? DIRT[2] : DIRT[3];
        if (pa > lim - 2) c = GRASS[1];
      }
      put(x, y, c);
    }
    // 小さな草・花・小石
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      var kk = kind(tx, ty);
      if (kk !== "ground" && kk !== "path") continue;
      for (var s = 0; s < 3; s++) {
        var r0 = hash(tx, ty, 10 + s), px = tx * T + Math.floor(hash(tx, ty, 20 + s) * 13) + 1, py = ty * T + Math.floor(hash(tx, ty, 30 + s) * 12) + 2;
        var onDirt = pathAmount(px, py) < 22;
        if (r0 < 0.45 && !onDirt) {        // 草の葉（V の形）
          put(px, py, GRASS[4]); put(px + 2, py, GRASS[4]); put(px + 1, py + 1, GRASS[3]); put(px, py + 1, GRASS[0]); put(px + 2, py + 1, GRASS[0]);
        } else if (r0 < 0.53 && !onDirt) { // 花
          var fc = FLOWER[Math.floor(hash(tx, ty, 40 + s) * 3)];
          put(px, py, fc); put(px + 1, py + 1, GRASS[0]);
        } else if (r0 < 0.57) {            // 小石
          put(px, py, ROCK[3]); put(px + 1, py, ROCK[2]); put(px, py + 1, ROCK[1]); put(px + 1, py + 1, ROCK[0]);
        }
      }
    }

    // ---------- 2. 水（北の岸は土の段、ほかの岸は細いふち） ----------
    var isWater = function (tx, ty) { var k2 = kind(tx, ty); return k2 === "water" || k2 === "bridge"; };
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (!inside(x, y, isWater, 0.3, 21)) continue;
      // 北の岸からの深さ（上が水でないところから下へ何点か）
      var depth = 0;
      while (depth < 6 && inside(x, y - depth - 1, isWater, 0.3, 21)) depth++;
      var c2;
      if (depth === 0) c2 = OUT;
      else if (depth <= 2) c2 = DIRT[depth === 1 ? 1 : 0];        // 岸の土の面
      else if (depth === 3) c2 = WATER[0];
      else {
        var wv = dither(noise(x / 6, y / 3, 5), x, y);
        c2 = wv < 0.35 ? WATER[1] : wv < 0.85 ? WATER[2] : WATER[3];
        if (hash(x, y, 6) < 0.012) c2 = WATER[4];
        // さざ波：横に短い明るい線
        if (noise(x / 4, y, 7) > 0.78 && (y % 4 === 0)) c2 = WATER[3];
      }
      if (depth > 0 && edgeOf(x, y, isWater, 0.3, 21)) c2 = depth <= 3 ? OUT : WATER[0];
      put(x, y, c2);
    }
    // 岸のまわりの草を少し暗く（ぬれた土）
    // 橋
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      if (kind(tx, ty) !== "bridge") continue;
      var horiz = isWater(tx - 1, ty) || isWater(tx + 1, ty) ? !(isWater(tx, ty - 1) && isWater(tx, ty + 1)) || isWater(tx - 1, ty) : false;
      var vert = isWater(tx - 1, ty) && isWater(tx + 1, ty) && !(isWater(tx, ty - 1) && !isWater(tx, ty + 1));
      for (y = 0; y < T; y++) for (x = 0; x < T; x++) {
        var gx = tx * T + x, gy = ty * T + y, bc;
        if (vert || !horiz) {
          // 縦にわたる橋：板は横向き、左右に手すり
          if (x <= 1 || x >= 14) bc = x === 0 || x === 15 ? OUT : BARK[x === 1 ? 2 : 1];
          else bc = (y % 4 === 3) ? BARK[0] : x < 4 ? BARK[3] : BARK[2];
        } else {
          // 横にわたる橋：板は縦向き、上下に手すり
          if (y <= 1 || y >= 14) bc = y === 0 || y === 15 ? OUT : BARK[y === 1 ? 3 : 1];
          else bc = (x % 4 === 3) ? BARK[0] : y < 4 ? BARK[3] : y > 11 ? BARK[1] : BARK[2];
        }
        put(gx, gy, bc);
      }
    }

    // ---------- 3. 影（木・しげみ・がけの南と東の地面を暗く） ----------
    function solidKind(k3) { return k3 === "tree" || k3 === "forest" || k3 === "rock" || k3 === "lock" || k3 === "vine"; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var tx2 = Math.floor(x / T), ty2 = Math.floor(y / T), k4 = kind(tx2, ty2);
      if (k4 !== "ground" && k4 !== "path" && k4 !== "tall") continue;
      var ly = y - ty2 * T, lx = x - tx2 * T;
      var shade = false;
      if (solidKind(kind(tx2, ty2 - 1)) && ly < 4 + (hash(x, 0, 8) < 0.5 ? 1 : 0)) shade = true;
      if (solidKind(kind(tx2 - 1, ty2)) && lx < 2) shade = true;
      if (shade) put(x, y, dark(get(x, y), 0.62));
    }

    // ---------- 4. 草むら：暗い下地の上に、草の束（3〜5本の葉）をたくさん立てる ----------
    var isTall = isK("tall");
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (!inside(x, y, isTall, 0.35, 22)) continue;
      var tv2 = noise(x / 8, y / 8, 31);
      put(x, y, edgeOf(x, y, isTall, 0.35, 22) ? OUT : tv2 < 0.45 ? TALL[1] : TALL[2]);
    }
    var tufts = [];
    for (y = 0; y < H + 4; y += 4) for (x = (y / 4) % 2 ? 0 : 3; x < W; x += 6) {
      var jx = x + Math.floor(hash(x, y, 23) * 3) - 1, jy = y + Math.floor(hash(x, y, 24) * 2);
      if (inside(jx, jy, isTall, 0.35, 22)) tufts.push([jx, jy]);
    }
    tufts.forEach(function (tf) {
      var lv2 = noise(tf[0] / 10, tf[1] / 10, 25);
      var hi = lv2 > 0.55 ? 4 : 3;
      // 葉：まんなかは高く、両わきは低くななめ
      var blades = [[-2, 3, -1], [0, 5, 0], [2, 3, 1]];
      put(tf[0] - 1, tf[1] + 1, TALL[0]); put(tf[0], tf[1] + 1, TALL[0]); put(tf[0] + 1, tf[1] + 1, TALL[0]);
      blades.forEach(function (bl, bi) {
        for (var k6 = 0; k6 < bl[1]; k6++) {
          var bx2 = tf[0] + bl[0] + (k6 === bl[1] - 1 ? bl[2] : 0), by2 = tf[1] - k6;
          put(bx2, by2, k6 === bl[1] - 1 ? TALL[hi] : k6 > bl[1] / 2 ? TALL[hi - 1] : TALL[2]);
        }
        put(tf[0] + bl[0] + bl[2], tf[1] - bl[1], OUT);
      });
    });

    // ---------- 5. 岩のがけ（部屋の中の壁） ----------
    var isRock = isK("rock");
    // がけの上の草（角は丸い）。南のはしのタイルは、上5点が草で、その下が岩の面
    function plateau(gx, gy) {
      var tx3 = Math.floor(gx / T), ty3 = Math.floor(gy / T);
      if (!isRock(tx3, ty3)) return false;
      var face = !isRock(tx3, ty3 + 1);
      if (face && gy - ty3 * T >= 5) return false;
      // 南のはしのタイルの横の広がりは、そのすぐ上（ふち）の行で決める
      return inside(gx, face ? Math.min(gy, ty3 * T + 3) : gy, isRock, 0, 0);
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var tx3 = Math.floor(x / T), ty3 = Math.floor(y / T);
      if (!isRock(tx3, ty3)) continue;
      var ly3 = y - ty3 * T, lx3 = x - tx3 * T;
      var faceTile = !isRock(tx3, ty3 + 1), c4;
      if (faceTile && ly3 >= 5) {
        // 岩の面：横に長い石を積む。横の広がりは上の草と同じ
        if (!plateau(x, ty3 * T + 4)) continue;
        var row = Math.floor((ly3 - 5) / 4), off = (row % 2) * 4 + Math.floor(hash(tx3, row, 12) * 3);
        var sx2 = (x + off) % 7, sy2 = (ly3 - 5) % 4;
        c4 = sy2 === 0 ? ROCK[3] : sy2 === 3 ? ROCK[0] : sx2 === 0 ? ROCK[0] : sx2 === 1 ? ROCK[3] : ROCK[2];
        if (sx2 > 4 && sy2 > 1) c4 = ROCK[1];
        if (ly3 >= T - 2) c4 = ly3 === T - 1 ? OUT : ROCK[0];
        if (!plateau(x - 1, ty3 * T + 4) || !plateau(x + 1, ty3 * T + 4)) c4 = OUT;
      } else {
        if (!plateau(x, y)) continue;
        var tv = noise(x / 7, y / 7, 13);
        c4 = tv < 0.4 ? GRASS[2] : tv < 0.8 ? GRASS[3] : GRASS[4];
        var up = plateau(x, y - 1), lf = plateau(x - 1, y), rt = plateau(x + 1, y), dn = plateau(x, y + 1);
        if (!up || !lf || !rt) c4 = OUT;
        else if (!plateau(x, y - 2) || !plateau(x - 2, y)) c4 = GRASS[4];
        if (!dn) c4 = OUT;                         // がけのふち
        else if (!plateau(x, y + 2)) c4 = GRASS[1];
      }
      put(x, y, c4);
    }

    // ---------- 6. 木と、森のしげみ ----------
    // 葉のかたまり：丸い葉の山をならべる。手前（下）の山ほど前。山ごとに左上が明るく、山の境目は暗い
    function crowns(list, palette, bright) {
      list.sort(function (p1, p2) { return p1[1] - p2[1]; });
      var own = {};
      list.forEach(function (cr, idx) {
        var r = cr[2];
        for (var yy = Math.floor(cr[1] - r); yy <= cr[1] + r; yy++) for (var xx = Math.floor(cr[0] - r); xx <= cr[0] + r; xx++) {
          var dx = xx + 0.5 - cr[0], dy = yy + 0.5 - cr[1];
          var rr = r + (noise(xx / 2.5, yy / 2.5, 27) - 0.5) * 2.2;
          if (dx * dx + dy * dy <= rr * rr) own[xx + "," + yy] = idx;
        }
      });
      Object.keys(own).forEach(function (kk2) {
        var pp = kk2.split(","), xx = +pp[0], yy = +pp[1];
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return;
        var cr = list[own[kk2]];
        var o = function (ax, ay) { return own[ax + "," + ay]; };
        if (o(xx - 1, yy) === undefined || o(xx + 1, yy) === undefined || o(xx, yy - 1) === undefined || o(xx, yy + 1) === undefined) { put(xx, yy, OUT); return; }
        // 前の山との境目（上や左の点が、もっと前の山のもの）→ 暗い
        var me = own[kk2];
        if (o(xx, yy + 1) > me || o(xx + 1, yy) > me) { put(xx, yy, palette[0]); return; }
        var dx = (xx + 0.5 - cr[0]) / cr[2], dy = (yy + 0.5 - cr[1]) / cr[2];
        var lit = -dx * 0.5 - dy * 0.85 + bright;
        // 小さな葉のつぶ
        var gx3 = ((xx + (Math.floor(yy / 3) % 2) * 2) % 4), gy3 = yy % 3;
        if (gx3 === 0 && gy3 === 0) lit += 0.35; else if (gx3 === 2 && gy3 === 2) lit -= 0.3;
        var li = lit > 0.55 ? 4 : lit > 0.15 ? 3 : lit > -0.35 ? 2 : 1;
        put(xx, yy, palette[li]);
      });
    }
    // みき（木のかたまりの下のはし）
    var isTree = isK("tree");
    var treeCrowns = [];
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      if (!isTree(tx, ty)) continue;
      var jx2 = (hash(tx, ty, 28) - 0.5) * 3, jy2 = (hash(tx, ty, 29) - 0.5) * 2;
      treeCrowns.push([tx * T + 8 + jx2, ty * T + 2 + jy2, 9]);
      if (isTree(tx, ty + 1)) continue;
      if (isTree(tx - 1, ty) && !isTree(tx - 1, ty + 1) && (tx % 2 === 1) && isTree(tx + 1, ty)) continue;
      var bx = tx * T + 5, by = ty * T + 8;
      for (y = 0; y < 7; y++) for (x = 0; x < 6; x++) {
        var bc2 = x === 0 || x === 5 ? OUT : x === 1 ? BARK[3] : x === 4 ? BARK[1] : BARK[2];
        if (y === 6 && (x === 0 || x === 5)) bc2 = null;
        if (y === 6 && x > 0 && x < 5) bc2 = OUT;
        if (bc2) put(bx + x, by + y, bc2);
      }
      put(bx - 1, by + 6, OUT); put(bx + 6, by + 6, OUT); put(bx, by + 5, BARK[1]); put(bx + 5, by + 5, BARK[1]);
    }
    // 森のしげみ（部屋のまわり）：部屋に面した南のはしには、みきが並んで見える
    var isForest = function (tx5, ty5) { var k5 = kind(tx5, ty5); return k5 === "forest" || k5 === "lock" || k5 === "vine"; };
    var forestCrowns = [];
    for (ty = -1; ty <= h; ty++) for (tx = -1; tx <= w; tx++) {
      if (kind(tx, ty) !== "forest") continue;
      var southOpen = ty + 1 < h && ty >= 0 && !isForest(tx, ty + 1);
      if (southOpen) {
        for (x = 0; x < T; x++) for (y = 8; y < T; y++) {
          var tr = (x + tx * 5) % 8;
          var cc2 = tr === 0 || tr === 4 ? OUT : tr < 4 ? BARK[tr === 1 ? 2 : 1] : LEAF[0];
          if (y === T - 1) cc2 = OUT;
          put(tx * T + x, ty * T + y, cc2);
        }
      }
      for (var q = 0; q < 2; q++) {
        var fx2 = tx * T + 4 + q * 8 + (hash(tx, ty, 30 + q) - 0.5) * 3, fy2 = ty * T + (southOpen ? 2 : 6) + (hash(tx, ty, 32 + q) - 0.5) * 4;
        forestCrowns.push([fx2, fy2, 7.5 + hash(tx, ty, 34 + q) * 2]);
      }
    }
    crowns(forestCrowns, LEAF, -0.25);
    crowns(treeCrowns, LEAF, 0.05);

    // ---------- 7. 鍵のかかった扉と、つる ----------
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      var t7 = tile(tx, ty);
      if (t7 === "L") {
        for (y = 0; y < T; y++) for (x = 0; x < T; x++) {
          var lc = (x % 5 === 0) ? BARK[0] : x % 5 === 1 ? BARK[3] : BARK[2];
          if (y === 3 || y === 12) lc = BARK[0];
          if (y === 2 || y === 11) lc = BARK[1];
          if (y === 0 || y === T - 1) lc = OUT;
          put(tx * T + x, ty * T + y, lc);
        }
        // まんなかの扉なら錠をつける
        if (tile(tx - 1, ty) === "L" && tile(tx + 1, ty) === "L" || tile(tx, ty - 1) === "L" && tile(tx, ty + 1) === "L") {
          var ox = tx * T + 5, oy = ty * T + 5;
          for (y = 0; y < 6; y++) for (x = 0; x < 6; x++) put(ox + x, oy + y, x === 0 || y === 0 ? GOLD[2] : x === 5 || y === 5 ? GOLD[0] : GOLD[1]);
          put(ox + 2, oy + 2, OUT); put(ox + 3, oy + 2, OUT); put(ox + 2, oy + 3, OUT); put(ox + 2, oy + 4, OUT);
        }
      }
      if (t7 === "V") {
        for (y = 0; y < T; y++) for (x = 0; x < T; x++) {
          var a = Math.sin((x + tx * T) * 0.55 + y * 0.35) + Math.sin((x + tx * T) * 0.3 - y * 0.6 + 2);
          var vc = a > 1.0 ? VINE[3] : a > 0.3 ? VINE[2] : a > -0.6 ? VINE[1] : VINE[0];
          if (Math.abs(a - 0.3) < 0.08) vc = OUT;
          if (hash(x + tx * T, y + ty * T, 16) < 0.02) vc = FLOWER[2];
          put(tx * T + x, ty * T + y, vc);
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // 部屋ごとに覚えておく（扉を開けるなどでタイルが変わったら、描き直す）
  function canvasFor(room) {
    var sig = room.rows.join("|");
    if (!room._tilesCanvas || room._tilesSig !== sig) { room._tilesCanvas = render(room); room._tilesSig = sig; }
    return room._tilesCanvas;
  }

  return { canvasFor: canvasFor, render: render };
})();
