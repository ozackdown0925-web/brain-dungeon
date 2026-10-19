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
    // 宝箱の鍵（銀）と、金の宝箱（2026-10-19）
    else if (name === "keySilver") img = fromMap(KEY, { y: "U", G: "S", g: "s" });
    else if (name === "chestGold") img = fromMap(CHEST, { h: "y", W: "G", w: "g", d: "w", S: "W", s: "w" });
    else if (name === "chestOpenGold") img = fromMap(CHEST_OPEN, { h: "y", W: "G", w: "g", d: "w", S: "W", s: "w" });
    else if (name === "pit") img = fromMap(PIT);
    cache[name] = img;
    return img;
  }

  return { get: get };
})();
