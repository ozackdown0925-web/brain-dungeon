// 地面と部屋のドット絵（段階7-2a）。すべてプログラムで1点ずつ描く（素材は使っていない）。
// 部屋に入ったときに、部屋全体を1枚の絵（canvas）に描いて覚えておき、毎フレームはその絵を写すだけにする。
// 木の葉は別の絵（行ごとの帯）にして、キャラより奥の行の葉はキャラの前に描く（木の後ろを歩けるように）。
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
    // 種類は先に表にしておく（まわり2マスぶんも）。何度も聞くので速くする
    var KB = 2, KW = w + KB * 2, kindGrid = [];
    function kindRaw(tx, ty) {
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
    for (var ky = -KB; ky < h + KB; ky++) for (var kx = -KB; kx < w + KB; kx++) kindGrid.push(kindRaw(kx, ky));
    function kind(tx, ty) {
      if (tx < -KB || ty < -KB || tx >= w + KB || ty >= h + KB) return "forest";
      return kindGrid[(ty + KB) * KW + tx + KB];
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
    // inside の答えを、種類ごとに部屋全体ぶん覚えておく（test 関数に名前 test.key をつけたものだけ）
    var masks = {};
    function inside(gx, gy, test, jit, seed) {
      if (test.key && gx >= 0 && gy >= 0 && gx < W && gy < H) {
        var mk = test.key + "|" + jit + "|" + seed, m = masks[mk];
        if (!m) { m = masks[mk] = new Int8Array(W * H); }
        var idx = gy * W + gx, v0 = m[idx];
        if (v0) return v0 > 0;
        var r = insideRaw(gx, gy, test, jit, seed);
        m[idx] = r ? 1 : -1;
        return r;
      }
      return insideRaw(gx, gy, test, jit, seed);
    }
    // タイルのまわり8マスが全部「中」なら 1、全部「外」なら -1、まざっていれば 0（覚えておく）
    var uni = {};
    function uniform(test, tx, ty) {
      var key3 = (test.key || "") + "|" + tx + "," + ty;
      if (test.key && uni[key3] !== undefined) return uni[key3];
      var me0 = test(tx, ty), res = me0 ? 1 : -1;
      for (var qy = -1; qy <= 1 && res; qy++) for (var qx = -1; qx <= 1; qx++) if (test(tx + qx, ty + qy) !== me0) { res = 0; break; }
      if (test.key) uni[key3] = res;
      return res;
    }
    function insideRaw(gx, gy, test, jit, seed) {
      // 速く決まるとき：まわり8マスが全部同じなら、中か外かはすぐわかる
      var qtx = Math.floor(gx / T), qty = Math.floor(gy / T), u = uniform(test, qtx, qty);
      if (u !== 0) return u > 0;
      if (!test(Math.floor(gx / T), Math.floor(gy / T)) && field(test, gx, gy) < 0.5) return false;
      var th = 0.5 + (jit ? (noise(gx / 3, gy / 3, seed || 0) - 0.5) * jit : 0);
      return field(test, gx, gy) >= th;
    }
    function edgeOf(gx, gy, test, jit, seed) {
      return !inside(gx - 1, gy, test, jit, seed) || !inside(gx + 1, gy, test, jit, seed) || !inside(gx, gy - 1, test, jit, seed) || !inside(gx, gy + 1, test, jit, seed);
    }
    function isK(name) { var f = function (tx, ty) { return kind(tx, ty) === name; }; f.key = name; return f; }

    // ---------- 1. 地面（どこにもまず草の地面を敷く） ----------
    // 道：部屋の出入口のまわりは土
    var doors = [];
    for (var ty = 0; ty < h; ty++) for (var tx = 0; tx < w; tx++) if (tile(tx, ty) === ":" || tile(tx, ty) === "L" || tile(tx, ty) === "V") doors.push([tx * T + 8, ty * T + 8]);
    // 出入口から遠いタイルは、計算しないで「道ではない」とする
    var nearTiles = {};
    doors.forEach(function (d0) { var dtx = Math.floor(d0[0] / T), dty = Math.floor(d0[1] / T); for (var a1 = -3; a1 <= 3; a1++) for (var b1 = -3; b1 <= 3; b1++) nearTiles[(dtx + a1) + "," + (dty + b1)] = 1; });
    var nearCache = {};
    function nearDoor(gx, gy) { var key2 = Math.floor(gx / T) + "," + Math.floor(gy / T); return !!nearTiles[key2]; }
    function pathAmount(gx, gy) {
      var best = 99;
      for (var d = 0; d < doors.length; d++) {
        var dx = gx - doors[d][0], dy = gy - doors[d][1], dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < best) best = dd;
      }
      return best;
    }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      // 草の地面：大きなまだらに、細かい点（市松もよう）をまぜる（SFC の地面のように、点が見える）
      var n = noise(x / 14, y / 14, 1) * 0.55 + noise(x / 4.5, y / 4.5, 2) * 0.45;
      var gv = dither(n, x, y);
      var c = gv < 0.34 ? GRASS[1] : gv < 0.6 ? GRASS[2] : gv < 0.8 ? GRASS[3] : GRASS[4];
      // 短い草の葉：明るい点の下に暗い点
      var hb = hash(x, y, 41);
      if (hb < 0.035) c = GRASS[4]; else if (hb < 0.05) c = GRASS[0];
      if (hash(x, y - 1, 41) < 0.035) c = GRASS[1];
      // 道（土）
      var pa = doors.length && nearDoor(x, y) ? pathAmount(x, y) : 99;
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
        var onDirt = nearDoor(px, py) && pathAmount(px, py) < 22;
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
    isWater.key = "water+bridge";
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
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      var k4 = kind(tx, ty);
      if (k4 !== "ground" && k4 !== "path" && k4 !== "tall") continue;
      // 木の影は、木のところで丸く落とす（ここでは、しげみとがけの影だけ）
      var ku = kind(tx, ty - 1), kl = kind(tx - 1, ty);
      var nUp = solidKind(ku) && ku !== "tree", nLf = solidKind(kl) && kl !== "tree";
      if (!nUp && !nLf) continue;
      for (var ly = 0; ly < T; ly++) for (var lx = 0; lx < T; lx++) {
        var x5 = tx * T + lx, y5 = ty * T + ly;
        var depthU = (ku === "forest" ? 5 : 3) + Math.round(noise(x5 / 4, ty, 8) * 3);
        if ((nUp && ly < depthU) || (nLf && lx < 1 + Math.round(noise(tx, y5 / 4, 9) * 2))) put(x5, y5, dark(get(x5, y5), 0.62));
      }
    }

    // ---------- 4. 草むら：タイルごとの丸をつなげた、でこぼこの形。暗い下地に草の束を立てる ----------
    var isTall = isK("tall");
    var tallM = new Uint8Array(W * H);
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      if (!isTall(tx, ty)) continue;
      // まわりも草むらなら大きな丸、はしのタイルは少し小さく（形にばらつき）
      var nb = (isTall(tx - 1, ty) ? 1 : 0) + (isTall(tx + 1, ty) ? 1 : 0) + (isTall(tx, ty - 1) ? 1 : 0) + (isTall(tx, ty + 1) ? 1 : 0);
      var ccx = tx * T + 8 + (hash(tx, ty, 50) - 0.5) * 5, ccy = ty * T + 8 + (hash(tx, ty, 51) - 0.5) * 5;
      var rad = (nb >= 3 ? 12 : 9.5) + hash(tx, ty, 52) * 2.5;
      for (y = Math.floor(ccy - rad - 2); y <= ccy + rad + 2; y++) for (x = Math.floor(ccx - rad - 2); x <= ccx + rad + 2; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        var kq = kind(Math.floor(x / T), Math.floor(y / T));
        if (kq !== "ground" && kq !== "tall" && kq !== "path") continue;   // 木や水の上にははみ出さない
        var ddx = x + 0.5 - ccx, ddy = (y + 0.5 - ccy) * 1.15;
        var rr = rad + (noise(x / 3, y / 3, 53) - 0.5) * 3;
        if (ddx * ddx + ddy * ddy <= rr * rr) tallM[y * W + x] = 1;
      }
    }
    function inTall(x6, y6) { return x6 >= 0 && y6 >= 0 && x6 < W && y6 < H && tallM[y6 * W + x6] === 1; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (!inTall(x, y)) continue;
      var tv2 = noise(x / 8, y / 8, 31);
      var edge7 = !inTall(x - 1, y) || !inTall(x + 1, y) || !inTall(x, y - 1) || !inTall(x, y + 1);
      put(x, y, edge7 ? (inTall(x, y - 1) ? OUT : TALL[0]) : tv2 < 0.45 ? TALL[1] : TALL[2]);
    }
    var tufts = [];
    for (y = 0; y < H + 4; y += 4) for (x = (y / 4) % 2 ? 0 : 3; x < W; x += 5) {
      var jx = x + Math.floor(hash(x, y, 23) * 3) - 1, jy = y + Math.floor(hash(x, y, 24) * 2);
      if (inTall(jx, jy) && inTall(jx - 2, jy) && inTall(jx + 2, jy)) tufts.push([jx, jy, 1]);
      // 草むらのすぐ外にも、ときどき草の束
      else if (!inTall(jx, jy) && (inTall(jx, jy - 4) || inTall(jx - 4, jy) || inTall(jx + 4, jy)) && hash(jx, jy, 54) < 0.35) {
        var kq2 = kind(Math.floor(jx / T), Math.floor(jy / T));
        if (kq2 === "ground" || kq2 === "path") tufts.push([jx, jy, 0]);
      }
    }
    tufts.forEach(function (tf) {
      var lv2 = noise(tf[0] / 10, tf[1] / 10, 25);
      var hi = lv2 > 0.55 ? 4 : 3;
      var small = !tf[2];
      var blades = small ? [[-1, 2, -1], [0, 3, 0], [1, 2, 1]] : [[-2, 3, -1], [0, 5, 0], [2, 3, 1]];
      if (!small) { put(tf[0] - 1, tf[1] + 1, TALL[0]); put(tf[0], tf[1] + 1, TALL[0]); put(tf[0] + 1, tf[1] + 1, TALL[0]); }
      blades.forEach(function (bl) {
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
    // 木の葉は、地面とは別の絵（帯）に描く。帯は「どの行の木か」で分け、キャラより前か後ろかを行で決める
    var over = new Uint8ClampedArray(W * H * 4), overBand = new Int16Array(W * H).fill(-99);
    function putOver(x, y, c, band) {
      if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
      var i = (y * W + x) * 4; over[i] = c[0]; over[i + 1] = c[1]; over[i + 2] = c[2]; over[i + 3] = 255; overBand[y * W + x] = band;
    }
    function crowns(list, palette, bright) {
      list.sort(function (p1, p2) { return p1[1] - p2[1]; });
      var put = function (x, y, c) { putOver(x, y, c, list[own[y * W + x]][3]); };
      var own = new Int16Array(W * H).fill(-1);
      function o(ax, ay) { return ax < 0 || ay < 0 || ax >= W || ay >= H ? -2 : own[ay * W + ax]; }
      list.forEach(function (cr, idx) {
        var r = cr[2];
        for (var yy = Math.floor(cr[1] - r - 1); yy <= cr[1] + r + 1; yy++) for (var xx = Math.floor(cr[0] - r - 1); xx <= cr[0] + r + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          var dx = xx + 0.5 - cr[0], dy = yy + 0.5 - cr[1];
          var rr = r + (noise(xx / 2.5, yy / 2.5, 27) - 0.5) * 2.2;
          if (dx * dx + dy * dy <= rr * rr) own[yy * W + xx] = idx;
        }
      });
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        var me = own[yy * W + xx];
        if (me < 0) continue;
        var cr = list[me];
        var l1 = o(xx - 1, yy), r1 = o(xx + 1, yy), u1 = o(xx, yy - 1), d1 = o(xx, yy + 1);
        if (l1 === -1 || r1 === -1 || u1 === -1 || d1 === -1) { put(xx, yy, OUT); continue; }
        // 前の山との境目 → 暗い
        if (d1 > me || r1 > me) { put(xx, yy, palette[0]); continue; }
        var dx = (xx + 0.5 - cr[0]) / cr[2], dy = (yy + 0.5 - cr[1]) / cr[2];
        var lit = -dx * 0.5 - dy * 0.85 + bright;
        var gx3 = ((xx + (Math.floor(yy / 3) % 2) * 2) % 4), gy3 = yy % 3;
        if (gx3 === 0 && gy3 === 0) lit += 0.35; else if (gx3 === 2 && gy3 === 2) lit -= 0.3;
        var li = lit > 0.55 ? 4 : lit > 0.15 ? 3 : lit > -0.35 ? 2 : 1;
        put(xx, yy, palette[li]);
      }
    }
    // みき（木のかたまりの下のはし）
    var isTree = isK("tree");
    var treeCrowns = [];
    for (ty = 0; ty < h; ty++) for (tx = 0; tx < w; tx++) {
      if (!isTree(tx, ty)) continue;
      var jx2 = (hash(tx, ty, 28) - 0.5) * 3, jy2 = (hash(tx, ty, 29) - 0.5) * 2;
      treeCrowns.push([tx * T + 8 + jx2, ty * T + 2 + jy2, 9, ty]);
      if (isTree(tx, ty + 1)) continue;
      if (isTree(tx - 1, ty) && !isTree(tx - 1, ty + 1) && (tx % 2 === 1) && isTree(tx + 1, ty)) continue;
      // 木の影：根もとに丸く
      var scx = tx * T + 9, scy = ty * T + 15;
      for (y = scy - 4; y <= scy + 4; y++) for (x = scx - 10; x <= scx + 10; x++) {
        var ex = (x + 0.5 - scx) / 10, ey = (y + 0.5 - scy) / 3.6;
        if (ex * ex + ey * ey > 1 || x < 0 || y < 0 || x >= W || y >= H) continue;
        var ks = kind(Math.floor(x / T), Math.floor(y / T));
        if (ks === "ground" || ks === "path" || ks === "tall" || ks === "tree") put(x, y, dark(get(x, y), 0.6));
      }
      // みきと根（根は左右に広がって、地面にもぐる）
      var TRUNK = ["..A3221A..", "..A3221A..", "..A3221A..", "..A3221A..", ".A332211A.", "A13A2211A.", "AA.A21A1AA", "....AA.A.."];
      var bx = tx * T + 3, by = ty * T + 8;
      for (y = 0; y < TRUNK.length; y++) for (x = 0; x < 10; x++) {
        var ch2 = TRUNK[y].charAt(x);
        if (ch2 === ".") continue;
        put(bx + x, by + y, ch2 === "A" ? OUT : BARK[+ch2]);
      }
      // 根もとの草
      [[bx + 1, by + 7], [bx + 6, by + 8], [bx + 9, by + 7]].forEach(function (g2) {
        put(g2[0], g2[1], GRASS[4]); put(g2[0], g2[1] + 1, GRASS[2]);
      });
    }
    // 森のしげみ（部屋のまわり）：部屋に面した南のはしには、みきが並んで見える
    var isForest = function (tx5, ty5) { var k5 = kind(tx5, ty5); return k5 === "forest" || k5 === "lock" || k5 === "vine"; };
    var forestCrowns = [];
    for (ty = -1; ty <= h; ty++) for (tx = -1; tx <= w; tx++) {
      if (kind(tx, ty) !== "forest") continue;
      var southOpen = ty + 1 < h && ty >= 0 && !isForest(tx, ty + 1);
      if (southOpen) {
        // 葉の下に見える、しげみの奥（暗い）と、みき。下のはしはでこぼこ
        for (x = 0; x < T; x++) {
          var gx4 = tx * T + x, tr = (gx4 + 3) % 8, trunkNo = Math.floor((gx4 + 3) / 8);
          var isTr = tr <= 4;
          var bottom = isTr ? 13 + Math.floor(hash(trunkNo, ty, 36) * 3) : 10 + Math.round(noise(gx4 / 3, ty, 37) * 3);
          for (y = 7; y <= bottom && y < T + 1; y++) {
            var cc2 = isTr ? (tr === 0 || tr === 4 ? OUT : BARK[tr === 1 ? 3 : tr === 2 ? 2 : 1]) : LEAF[0];
            if (y === bottom) cc2 = OUT;
            put(gx4, ty * T + y, cc2);
          }
          // 根もとが少し広がる
          if (isTr && (tr === 0 || tr === 4)) { put(gx4 + (tr === 0 ? -1 : 1), ty * T + bottom, OUT); put(gx4 + (tr === 0 ? -1 : 1), ty * T + bottom - 1, BARK[1]); }
        }
      }
      for (var q = 0; q < 2; q++) {
        var fx2 = tx * T + 4 + q * 8 + (hash(tx, ty, 30 + q) - 0.5) * 3, fy2 = ty * T + (southOpen ? 2 : 6) + (hash(tx, ty, 32 + q) - 0.5) * 4;
        forestCrowns.push([fx2, fy2, 7.5 + hash(tx, ty, 34 + q) * 2, ty]);
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
    // 木の葉の帯を、行ごとに別の絵にする
    var bands = [], byRow = {};
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var bnd = overBand[y * W + x];
      if (bnd === -99) continue;
      var bb = byRow[bnd];
      if (!bb) bb = byRow[bnd] = { row: bnd, y0: y, y1: y };
      if (y > bb.y1) bb.y1 = y;
    }
    Object.keys(byRow).forEach(function (kb) {
      var bb = byRow[kb], bh = bb.y1 - bb.y0 + 1;
      var bc = document.createElement("canvas"); bc.width = W; bc.height = bh;
      var bctx = bc.getContext("2d"), bimg = bctx.createImageData(W, bh), BD = bimg.data;
      for (var yy = 0; yy < bh; yy++) for (var xx = 0; xx < W; xx++) {
        var gi = (bb.y0 + yy) * W + xx;
        if (overBand[gi] !== bb.row) continue;
        var si = gi * 4, di = (yy * W + xx) * 4;
        BD[di] = over[si]; BD[di + 1] = over[si + 1]; BD[di + 2] = over[si + 2]; BD[di + 3] = 255;
      }
      bctx.putImageData(bimg, 0, 0);
      bands.push({ base: (bb.row + 1) * T, y0: bb.y0, canvas: bc });
    });
    bands.sort(function (a2, b2) { return a2.base - b2.base; });
    return { ground: cv, bands: bands };
  }

  // 部屋ごとに覚えておく（扉を開けるなどでタイルが変わったら、描き直す）。{ ground：地面の絵, bands：木の葉の帯 }
  function canvasFor(room) {
    var ver = room.ver || 0;
    if (!room._tilesCanvas || room._tilesVer !== ver) { room._tilesCanvas = render(room); room._tilesVer = ver; }
    return room._tilesCanvas;
  }

  return { canvasFor: canvasFor, render: render };
})();
