// ダンジョンの小物のドット絵（段階7-3。2026-10-18）：宝箱・鍵・落とし穴・毒の沼・出口。
// すべて Claude が描いた（素材は使っていない）。床のタイル（tiles.js）と同じ色・同じふち（#140c1c）・光は左上から。
// 地図の1文字が1点。描いた絵は覚えておく。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Props = (function () {
  var PAL = {
    A: "#140c1c",                                        // ふち
    d: "#2a1a12", w: "#4a3020", W: "#6e4a2c", h: "#94683c", // 木（暗い→明るい）
    S: "#8e8a96", s: "#4a4452",                          // 鉄の帯
    g: "#7a5a18", G: "#c8a040", y: "#f0d070",            // 金
    k: "#0b0906", K: "#1c140c",                          // 穴・箱の中
    e: "#4a3420", f: "#6a4c2e", F: "#8a6840"             // 土
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
    else if (name === "pit") img = fromMap(PIT);
    else if (name === "exit") img = makeExit();
    cache[name] = img;
    return img;
  }

  // ---------- 1点ずつ描く絵（毒の沼・出口） ----------
  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function hash(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  var BAYER = [[0, 0.5], [0.75, 0.25]];
  function image(w, h, fn) {
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), D = img.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = fn(x, y); if (!c) continue;
      var i = (y * w + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // 毒の沼：まるみのある水たまり。ふちは泥、水はにごった紫（光は左上から）。seed で形が少し変わる
  var SWAMP = [hex("#2a1438"), hex("#3e1e52"), hex("#5a2e72"), hex("#74428e"), hex("#a878d0")];
  var MUD = [hex("#3a2a1c"), hex("#54402a"), hex("#76603e")];
  var OUTLINE = hex("#140c1c");
  function swamp(w, h, seed) {
    var key = "swamp" + w + "x" + h + "_" + (seed % 4);
    if (cache[key]) return cache[key];
    var cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2 - 1, ry = h / 2 - 1;
    function inside(x, y, shrink) {
      var a = Math.atan2(y - cy, x - cx);
      var wob = 0.94 + 0.04 * Math.sin(a * 3 + seed) + 0.025 * Math.sin(a * 5 + seed * 2);
      var dx = (x - cx) / (rx - shrink), dy = (y - cy) / (ry - shrink);
      return dx * dx + dy * dy <= wob * wob;
    }
    var img = image(w, h, function (x, y) {
      if (!inside(x, y, 0)) return null;
      if (!inside(x, y, 1.2)) return OUTLINE;
      if (!inside(x, y, 3.6)) {   // 泥のふち：上と左が明るく、右下が暗い
        var m = 1 - (x - cx + y - cy) / (w * 0.6);
        m += (hash(x, y, 7) - 0.5) * 0.9;
        return MUD[Math.max(0, Math.min(2, Math.round(m)))];
      }
      if (!inside(x, y, 4.6)) return SWAMP[0];   // 水のふちの暗いところ（泥のかげ）
      // 水：奥（上）は暗く、手前は少し明るい
      var v = 1.4 + (y - cy) / h * 1.4 + (BAYER[y & 1][x & 1] - 0.375) * 0.9;
      // 左上の光の筋（2本）
      var lx = x - cx + w * 0.18, ly = y - cy + h * 0.22;
      if (Math.abs(ly + lx * 0.15) < 0.6 && Math.abs(lx) < 4) return SWAMP[4];
      if (Math.abs(ly - 3 + lx * 0.15) < 0.6 && lx > -1 && lx < 2) return SWAMP[3];
      return SWAMP[Math.max(1, Math.min(3, Math.round(v)))];
    });
    cache[key] = img;
    return img;
  }
  // 毒の沼の泡（毎フレーム、絵の上に描く）
  function swampBubbles(ctx, x, y, w, h, t, seed) {
    for (var i = 0; i < 3; i++) {
      var p = (t * 0.6 + i / 3 + hash(i, seed, 3)) % 1;
      var bx = Math.round(x + w * (0.3 + 0.4 * hash(i, seed, 1))), by = Math.round(y + h * (0.35 + 0.35 * hash(i, seed, 2)));
      if (p < 0.25) {          // 小さな泡
        ctx.fillStyle = "#a878d0"; ctx.fillRect(bx, by, 1, 1);
      } else if (p < 0.55) {   // まるい泡（十字の形＋光）
        ctx.fillStyle = "#74428e"; ctx.fillRect(bx - 1, by, 3, 1); ctx.fillRect(bx, by - 1, 1, 3);
        ctx.fillStyle = "#d8b0f0"; ctx.fillRect(bx - 1, by - 1, 1, 1);
      } else if (p < 0.65) {   // はじけた
        ctx.fillStyle = "#c89ae0"; ctx.fillRect(bx - 2, by, 1, 1); ctx.fillRect(bx + 2, by - 1, 1, 1); ctx.fillRect(bx, by - 2, 1, 1);
      }
    }
  }

  // 出口：石をならべた輪（32×32）。まんなかの光は毎フレーム描く
  var STONE = [hex("#2c2834"), hex("#4a4452"), hex("#6a6474"), hex("#8e8a96"), hex("#b4b0b8")];
  function makeExit() {
    var c = 15.5;
    return image(32, 32, function (x, y) {
      var dx = x - c, dy = y - c, r = Math.sqrt(dx * dx + dy * dy);
      if (r > 15.5 || r < 9) return null;
      if (r > 14.6 || r < 9.9) return OUTLINE;
      // 石と石のすきま（12個の石）
      var a = Math.atan2(dy, dx), seg = (a / (Math.PI * 2) * 12 + 12.5) % 1;
      if (seg < 0.08) return STONE[0];
      // 左上が明るい・右下が暗い。石の上側（外側）も明るい
      var v = 2 - (dx + dy) / 20 + (r - 12) / 3 + (BAYER[y & 1][x & 1] - 0.375) * 0.8;
      return STONE[Math.max(1, Math.min(4, Math.round(v)))];
    });
  }
  // 出口を描く（x, y はまんなか）。pulse は 0〜1
  function drawExit(ctx, x, y, pulse) {
    ctx.fillStyle = "rgba(242,193,78," + (0.18 + 0.2 * pulse).toFixed(2) + ")";
    ctx.beginPath(); ctx.arc(x, y, 17 + pulse * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1408"; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    // まんなかの光（うずまき）
    ctx.fillStyle = "rgba(255,224,102," + (0.55 + 0.35 * pulse).toFixed(2) + ")";
    ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,248,214," + (0.6 + 0.4 * pulse).toFixed(2) + ")";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    ctx.drawImage(get("exit"), Math.round(x) - 16, Math.round(y) - 16);
  }

  return { get: get, swamp: swamp, swampBubbles: swampBubbles, drawExit: drawExit };
})();
