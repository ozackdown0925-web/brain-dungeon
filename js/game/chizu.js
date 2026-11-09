// 書庫の「日本地図の棚」（2026-11-09）：47都道府県の名前と県庁所在地を、地図を見て覚える。
// ・塾の先生から「冬までに県と県庁所在地を完璧に」と言われたため（保護者と決定）。組分けテストは日本全体から出るので、
//   その回の地方だけの確認テストとは別に、全国をくり返す。
// ・問題は塾の教材ではなく、このリポジトリで作る（地図は Natural Earth・パブリックドメイン。js/game/japanmap.js）。
//   GAS の「問題」シートには入れない。答えは知識の棚と同じ「書庫の記録」シートに入る（qid が "map-" で始まる）。
// ・1つの都道府県で3問：①赤い所の都道府県の名前 ②その県庁所在地（地図の●）。この2つは group でまとめて続けて出す。
//   ③「〇〇県はどこ？」地図をタップして答える（2026-11-09 追加。自動で○×）。①の答えを見たすぐあとだと意味がないので、
//   TAP_LAG 番あとの都道府県といっしょの日に出す（id の番号を TAP_LAG だけずらす。北海道のタップは8番の茨城県のあと、など）。
// ・問題の文にはふりがなをつけない（知識の棚と同じ。tools/check-furigana.js でもこのファイルは見ない）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Chizu = (function () {
  // [番号, 名前, 県庁所在地, 地方, 所在地の経度, 緯度]
  var PREFS = [
    ["01", "北海道", "札幌市", "北海道地方", 141.35, 43.06],
    ["02", "青森県", "青森市", "東北地方", 140.74, 40.82],
    ["03", "岩手県", "盛岡市", "東北地方", 141.15, 39.70],
    ["04", "宮城県", "仙台市", "東北地方", 140.87, 38.27],
    ["05", "秋田県", "秋田市", "東北地方", 140.10, 39.72],
    ["06", "山形県", "山形市", "東北地方", 140.36, 38.24],
    ["07", "福島県", "福島市", "東北地方", 140.47, 37.75],
    ["08", "茨城県", "水戸市", "関東地方", 140.45, 36.34],
    ["09", "栃木県", "宇都宮市", "関東地方", 139.88, 36.57],
    ["10", "群馬県", "前橋市", "関東地方", 139.06, 36.39],
    ["11", "埼玉県", "さいたま市", "関東地方", 139.65, 35.86],
    ["12", "千葉県", "千葉市", "関東地方", 140.12, 35.61],
    ["13", "東京都", "東京（新宿区）", "関東地方", 139.69, 35.69],
    ["14", "神奈川県", "横浜市", "関東地方", 139.64, 35.45],
    ["15", "新潟県", "新潟市", "中部地方", 139.02, 37.90],
    ["16", "富山県", "富山市", "中部地方", 137.21, 36.70],
    ["17", "石川県", "金沢市", "中部地方", 136.63, 36.59],
    ["18", "福井県", "福井市", "中部地方", 136.22, 36.07],
    ["19", "山梨県", "甲府市", "中部地方", 138.57, 35.66],
    ["20", "長野県", "長野市", "中部地方", 138.18, 36.65],
    ["21", "岐阜県", "岐阜市", "中部地方", 136.72, 35.42],
    ["22", "静岡県", "静岡市", "中部地方", 138.38, 34.98],
    ["23", "愛知県", "名古屋市", "中部地方", 136.91, 35.18],
    ["24", "三重県", "津市", "近畿地方", 136.51, 34.73],
    ["25", "滋賀県", "大津市", "近畿地方", 135.87, 35.00],
    ["26", "京都府", "京都市", "近畿地方", 135.76, 35.02],
    ["27", "大阪府", "大阪市", "近畿地方", 135.52, 34.69],
    ["28", "兵庫県", "神戸市", "近畿地方", 135.18, 34.69],
    ["29", "奈良県", "奈良市", "近畿地方", 135.83, 34.69],
    ["30", "和歌山県", "和歌山市", "近畿地方", 135.17, 34.23],
    ["31", "鳥取県", "鳥取市", "中国地方", 134.24, 35.50],
    ["32", "島根県", "松江市", "中国地方", 133.05, 35.47],
    ["33", "岡山県", "岡山市", "中国地方", 133.93, 34.66],
    ["34", "広島県", "広島市", "中国地方", 132.46, 34.40],
    ["35", "山口県", "山口市", "中国地方", 131.47, 34.19],
    ["36", "徳島県", "徳島市", "四国地方", 134.56, 34.07],
    ["37", "香川県", "高松市", "四国地方", 134.04, 34.34],
    ["38", "愛媛県", "松山市", "四国地方", 132.77, 33.84],
    ["39", "高知県", "高知市", "四国地方", 133.53, 33.56],
    ["40", "福岡県", "福岡市", "九州地方", 130.42, 33.61],
    ["41", "佐賀県", "佐賀市", "九州地方", 130.30, 33.25],
    ["42", "長崎県", "長崎市", "九州地方", 129.87, 32.74],
    ["43", "熊本県", "熊本市", "九州地方", 130.74, 32.79],
    ["44", "大分県", "大分市", "九州地方", 131.61, 33.24],
    ["45", "宮崎県", "宮崎市", "九州地方", 131.42, 31.91],
    ["46", "鹿児島県", "鹿児島市", "九州地方", 130.56, 31.56],
    ["47", "沖縄県", "那覇市", "九州地方", 127.68, 26.21]
  ];
  // japanmap.js と同じ平らにし方（1 = 約1km）
  var LON0 = 127, LAT0 = 46, K = 100, COS = Math.cos(36 * Math.PI / 180);
  function proj(lon, lat) { return [(lon - LON0) * COS * K, (LAT0 - lat) * K]; }
  // 全国の地図で、沖縄県を左上の四角に移す量（印刷用の白地図）
  var OKI_DX = 150, OKI_DY = -1850;
  var FULL = [90, 15, 1460, 1640];   // 全国の地図の範囲 [左, 上, 幅, 高さ]

  var TAP_LAG = 7, CAP_LAG = 12;   // タップの問題を、何番あとの都道府県といっしょに出すか（1日5つなので、約2日後）
  // タップの問題の地図の範囲（地方ごと。北海道は東北といっしょ、中国と四国もいっしょ）
  var TAP_VIEW = { "北海道地方": "n", "東北地方": "n", "関東地方": "k", "中部地方": "c", "近畿地方": "w", "中国地方": "s", "四国地方": "s", "九州地方": "q" };
  var byCode = {};
  PREFS.forEach(function (p) {
    byCode[p[0]] = { code: p[0], name: p[1], capital: p[2], region: p[3], cap: proj(p[4], p[5]) };
  });
  function capWord(name) {
    // 東京都は都庁所在地、北海道は道庁所在地、京都府・大阪府は府庁所在地
    var last = name.charAt(name.length - 1);
    return (last === "都" ? "都" : last === "道" ? "道" : last === "府" ? "府" : "県") + "庁所在地";
  }
  // 県の名前と県庁所在地の名前がちがう（「〇〇市」の〇〇が県の名前の〇〇とちがう）。東京都は入れない（ふつう18として数える）
  function differs(p) {
    if (p.code === "13") return false;
    var base = p.name.replace(/[都道府県]$/, ""), city = p.capital.replace(/市$/, "");
    return base !== city;
  }

  // ---------- 問題 ----------
  function questions() {
    var out = [];
    PREFS.forEach(function (row) {
      var p = byCode[row[0]], w = capWord(p.name);
      out.push({
        id: "map-" + p.code + "-1", kind: "shelf", subject: "social", unit: "日本地図（都道府県）", source: "日本地図 " + p.code,
        group: "map-" + p.code, enabled: true,
        text: "地図の赤い所の都道府県の名前を答えましょう。",
        images: ["map:" + p.code],
        parts: [{ label: "", prompt: "", type: "recall", answer: p.name }],
        explanation: p.region + "の" + p.name + "。"
      });
      out.push({
        id: "map-" + p.code + "-2", kind: "shelf", subject: "social", unit: "日本地図（" + w + "）", source: "日本地図 " + p.code,
        group: "map-" + p.code, enabled: true,
        text: p.name + "の" + w + "はどこですか。（地図の●）",
        images: ["map:" + p.code + ":c"],
        parts: [{ label: "", prompt: "", type: "recall", answer: p.capital }],
        explanation: differs(p) ? "県の名前と" + w + "の名前がちがう県（18あるうちの1つ）。" + p.name + "＝" + p.capital + "とセットで覚えよう。" :
          p.code === "13" ? "東京都の都庁は新宿区にある。" : ""
      });
    });
    // ③タップの問題（id は「map-出す順の番号-t都道府県の番号」）
    PREFS.forEach(function (row) {
      var p = byCode[row[0]], at = ("0" + (Number(p.code) + TAP_LAG)).slice(-2);
      out.push({
        id: "map-" + at + "-t" + p.code, kind: "shelf", subject: "social", unit: "日本地図（場所）", source: "日本地図 " + at,
        group: "map-t" + p.code, enabled: true, tap: p.code,
        text: p.name + "はどこですか。地図の上でタップしよう。",
        parts: [],
        explanation: p.region + "の" + p.name + "。"
      });
    });
    // ④県庁所在地の●をタップ（名前がちがう18県だけ。同じ名前の所は県をタップするのとほぼ同じなので。2026-11-09 保護者と決定）
    PREFS.forEach(function (row) {
      var p = byCode[row[0]];
      if (!differs(p)) return;
      var at = ("0" + (Number(p.code) + CAP_LAG)).slice(-2);
      out.push({
        id: "map-" + at + "-u" + p.code, kind: "shelf", subject: "social", unit: "日本地図（県庁所在地の場所）", source: "日本地図 " + at,
        group: "map-u" + p.code, enabled: true, tapCap: p.code,
        text: p.capital + "はどこですか。地図の●をタップしよう。",
        parts: [],
        explanation: p.capital + "は" + p.name + "の県庁所在地。"
      });
    });
    out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return out;
  }
  function isMapId(qid) { return String(qid || "").indexOf("map-") === 0; }

  // ---------- 地図の絵（SVG） ----------
  function paths(opts) {
    var s = "", M = window.JAPAN_MAP ? JAPAN_MAP.prefs : {};
    Object.keys(M).sort().forEach(function (code) {
      var on = opts.focus === code;
      var d = M[code].d;
      var g = '<path d="' + d + '" fill="' + (on ? "#e2493b" : "#f6f0de") + '" stroke="#7a705c" stroke-width="' + opts.sw + '" stroke-linejoin="round"/>';
      if (opts.okinawaInset && code === "47") g = '<g transform="translate(' + OKI_DX + " " + OKI_DY + ')">' + g + "</g>";
      s += g;
    });
    return s;
  }
  // 問題の地図：その都道府県のまわりを大きく見せる。dot が true なら県庁所在地に●
  function focusSvg(code, dot) {
    var p = byCode[code], b = JAPAN_MAP.prefs[code].box;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var span = Math.max((b[2] - b[0]) * 1.9, (b[3] - b[1]) * 1.9 * 4 / 3, 300);
    var w = span, h = span * 3 / 4, sw = (span / 450).toFixed(2);
    var vb = [cx - w / 2, cy - h / 2, w, h].map(function (v) { return Math.round(v); }).join(" ");
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="800" height="600">' +
      '<rect x="' + Math.round(cx - w) + '" y="' + Math.round(cy - h) + '" width="' + Math.round(w * 2) + '" height="' + Math.round(h * 2) + '" fill="#cfe6f2"/>' +
      paths({ focus: code, sw: sw });
    if (dot) {
      var r = (span / 70).toFixed(1);
      s += '<circle cx="' + p.cap[0].toFixed(1) + '" cy="' + p.cap[1].toFixed(1) + '" r="' + r + '" fill="#1e1e1e" stroke="#fff" stroke-width="' + (span / 260).toFixed(2) + '"/>';
    }
    return s + "</svg>";
  }
  // 印刷用の全国の白地図。numbers が true なら都道府県の番号、caps が true なら県庁所在地の●
  function fullSvg(opts) {
    opts = opts || {};
    var vb = FULL.join(" "), M = JAPAN_MAP.prefs;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' +
      '<rect x="' + FULL[0] + '" y="' + FULL[1] + '" width="' + FULL[2] + '" height="' + FULL[3] + '" fill="#fff"/>' +
      paths({ sw: 1.3, okinawaInset: true });
    // 沖縄県の四角
    s += '<rect x="105" y="25" width="185" height="140" fill="none" stroke="#7a705c" stroke-width="1.5"/>';
    PREFS.forEach(function (row) {
      var p = byCode[row[0]], b = M[p.code].box;
      var dx = p.code === "47" ? OKI_DX : 0, dy = p.code === "47" ? OKI_DY : 0;
      if (opts.caps) s += '<circle cx="' + (p.cap[0] + dx).toFixed(1) + '" cy="' + (p.cap[1] + dy).toFixed(1) + '" r="5" fill="#1e1e1e"/>';
      if (opts.numbers) {
        var lp = LABEL[p.code] || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        var x = lp[0] + dx, y = lp[1] + dy;
        s += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="13" fill="#fff" stroke="#333" stroke-width="1.2"/>' +
          '<text x="' + x.toFixed(0) + '" y="' + (y + 5).toFixed(0) + '" font-size="15" text-anchor="middle" font-family="sans-serif">' + Number(p.code) + "</text>";
      }
    });
    return s + "</svg>";
  }
  // 番号の位置（まん中だと重なる小さな県だけ、ずらす。1 = 約1km）
  var LABEL = {};

  // ---------- タップの問題（知識の棚の画面から呼ぶ） ----------
  // 地方の地図を出し、子どもが都道府県をタップ →「これで答える」で自動で○×。opts.onFinish({ correct, input, parts })
  function viewBox(code) {
    var key = TAP_VIEW[byCode[code].region], M = JAPAN_MAP.prefs, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    PREFS.forEach(function (r) {
      if (TAP_VIEW[r[3]] !== key) return;
      var b = M[r[0]].box; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    });
    var w = (x1 - x0) * 1.15, h = (y1 - y0) * 1.15, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (w < h * 4 / 3) w = h * 4 / 3; else h = w * 3 / 4;
    return [cx - w / 2, cy - h / 2, w, h];
  }
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function renderTap(card, ans, q, opts) {
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var cap = !!q.tapCap, code = q.tap || q.tapCap, vb = viewBox(code), sw = (vb[2] / 450).toFixed(2), picked = null, done = false;
    var wrap = el("div", "dq"); card.textContent = ""; card.appendChild(wrap);
    var meta = el("div", "dq-meta");
    meta.appendChild(el("span", "dq-chip", "社会・" + q.unit));
    if (opts.review) { meta.appendChild(el("span", "dq-chip review", "復習")); meta.appendChild(el("span", null, "前にまちがえた問題です")); }
    wrap.appendChild(meta);
    wrap.appendChild(el("p", "dq-text", q.text));
    var svg = svgEl("svg", { viewBox: vb.map(function (v) { return Math.round(v); }).join(" "), "class": "chizu-tap" });
    svg.appendChild(svgEl("rect", { x: Math.round(vb[0] - vb[2]), y: Math.round(vb[1] - vb[3]), width: Math.round(vb[2] * 3), height: Math.round(vb[3] * 3), fill: "#cfe6f2" }));
    var shapes = {};
    Object.keys(JAPAN_MAP.prefs).sort().forEach(function (c) {
      var path = svgEl("path", { d: JAPAN_MAP.prefs[c].d, fill: "#f6f0de", stroke: "#7a705c", "stroke-width": sw, "stroke-linejoin": "round" });
      if (!cap) path.addEventListener("click", function () { pick(c); });
      shapes[c] = path; svg.appendChild(path);
    });
    // 県庁所在地のタップ：●を全部出し、タップした所にいちばん近い●をえらぶ（●が小さくてもえらべるように）
    var dots = {}, R = vb[2] / 85;
    if (cap) {
      PREFS.forEach(function (row) {
        var c = row[0], pt = byCode[c].cap;
        dots[c] = svgEl("circle", { cx: pt[0].toFixed(1), cy: pt[1].toFixed(1), r: R.toFixed(1), fill: "#1e1e1e", stroke: "#fff", "stroke-width": (R / 3).toFixed(2) });
        svg.appendChild(dots[c]);
      });
      svg.addEventListener("click", function (ev) {
        var m = svg.getScreenCTM(); if (!m) return;
        var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; pt = pt.matrixTransform(m.inverse());
        var best = null, bd = 1e9;
        PREFS.forEach(function (row) { var c = byCode[row[0]].cap, d = Math.hypot(c[0] - pt.x, c[1] - pt.y); if (d < bd) { bd = d; best = row[0]; } });
        if (best && bd < vb[2] / 12) pick(best);
      });
    }
    var figure = el("div", "chizu-tap-box"); figure.appendChild(svg); wrap.appendChild(figure);

    ans.textContent = ""; var box = el("div", "dq"); ans.appendChild(box);
    var say = el("p", "dq-note", cap ? "地図の●をタップしてから、「これで答える」を押そう。" : "地図の都道府県をタップしてから、「これで答える」を押そう。");
    var go = el("button", "dq-btn", "これで答える"); go.type = "button"; go.disabled = true;
    box.appendChild(say); box.appendChild(go);
    function paint(c, color) {
      if (cap) { dots[c].setAttribute("fill", color); dots[c].setAttribute("r", (R * 1.5).toFixed(1)); svg.appendChild(dots[c]); return; }
      shapes[c].setAttribute("fill", color); svg.appendChild(shapes[c]);   // 上に重ねて、さかいの線を見せる
    }
    function pick(c) {
      if (done) return;
      if (picked) { if (cap) { dots[picked].setAttribute("fill", "#1e1e1e"); dots[picked].setAttribute("r", R.toFixed(1)); } else shapes[picked].setAttribute("fill", "#f6f0de"); }
      picked = c; paint(c, "#5b8def");
      say.textContent = "この場所でいい？　よければ「これで答える」。";
      go.disabled = false;
    }
    go.addEventListener("click", function () {
      if (done || !picked) return;
      done = true; go.remove(); say.remove();
      var ok = picked === code;
      if (!ok) paint(picked, "#9aa6b8");
      paint(code, ok ? "#3aa35b" : "#e2493b");
      var r = el("div", "dq-result " + (ok ? "ok" : "ng"));
      r.appendChild(el("div", "dq-verdict", ok ? "○ 正解！" : "× ざんねん"));
      if (!ok) r.appendChild(el("p", "dq-ex", cap ? "えらんだのは " + byCode[picked].capital + "（" + byCode[picked].name + "）。" + byCode[code].capital + "は赤い●。" :
        "えらんだのは " + byCode[picked].name + "。" + byCode[code].name + "は赤い所。"));
      if (cap) { shapes[code].setAttribute("fill", "#f7d7c4"); svg.appendChild(shapes[code]); Object.keys(dots).forEach(function (c) { svg.appendChild(dots[c]); }); svg.appendChild(dots[code]); if (!ok) svg.appendChild(dots[picked]); }
      if (q.explanation) r.appendChild(el("p", "dq-ex", q.explanation));
      box.appendChild(r);
      var name = byCode[picked] ? (cap ? byCode[picked].capital : byCode[picked].name) : picked;
      if (opts.onFinish) opts.onFinish({ correct: ok, input: name, parts: [{ label: "", value: name, correct: ok, note: "" }] });
    });
  }

  function dataUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  // 問題の図の id（"map:03" か "map:03:c"）から絵を作る。ちがう id なら null
  function image(id) {
    var m = /^map:(\d\d)(:c)?$/.exec(String(id || ""));
    if (!m || !byCode[m[1]] || !window.JAPAN_MAP) return null;
    return dataUrl(focusSvg(m[1], !!m[2]));
  }

  return { PREFS: PREFS, byCode: byCode, questions: questions, isMapId: isMapId, image: image, renderTap: renderTap, focusSvg: focusSvg, fullSvg: fullSvg, differs: differs, LABEL: LABEL };
})();
if (typeof module !== "undefined") module.exports = Chizu;
