// ふりがな（段階7-3）。
// 小4までに習わない漢字に、自動でふりがなをつける。
// - 読みは下の辞書 WORDS に、言葉ごとに書く（左が画面の言葉、右が読み）。長い言葉から先に当てはめる。
// - 辞書で決まらない読みは、文の中に直接 {漢字|よみ} と書いてもよい。
// - ふつうの画面（HTML の文字）は、画面に文字が出たときに自動でつける（data-noruby のついた所の中はつけない）。
// - キャンバスに描く文字（ダンジョンの中、町・地図の名前の札）は Furi.draw で描く。
// - つけ忘れは  node tools/check-furigana.js  で確かめる。
var Furi = (function () {
  "use strict";

  // ふりがなは言葉ごとにつける（2026-10-18 保護者の希望。1文字だけに出ると読みにくいため）。
  // ・漢字だけの言葉（例「経験値」）：言葉全体の上に読みをつける。
  // ・漢字＋ひらがなの言葉（例「移す」）：右の読みは漢字の部分の読み（ひらがなはそのまま）。読みが変わる言葉を見分けるため。
  // ・習った言葉とくっついているとき（例「装備強化」）は、習っていない言葉にだけつける。
  // 新しい言葉を足したら、node tools/check-furigana.js で確かめる。
  var WORDS = {
    // 冒険・ダンジョン
    "冒険": "ぼうけん", "拠点": "きょてん", "階層": "かいそう", "宝箱": "たからばこ", "鍵": "かぎ", "扉": "とびら", "罠": "わな",
    "敵": "てき", "毒": "どく", "毒消": "どくけ", "毒矢": "どくや", "沼": "ぬま", "穴": "あな", "奥": "おく", "霧": "きり", "壁": "かべ",
    "炎": "ほのお", "蜂": "はち", "株": "かぶ", "樹海": "じゅかい", "瘴気": "しょうき", "秘境": "ひきょう", "若葉": "わかば",
    "魔物": "まもの", "魔王": "まおう", "探検": "たんけん", "途中": "とちゅう", "移動": "いどう", "一時停止": "いちじていし", "停止": "ていし",
    "花粉": "かふん", "知恵": "ちえ", "加護": "かご", "報酬": "ほうしゅう", "正解": "せいかい", "正解数": "せいかいすう", "正答率": "せいとうりつ",
    "神殿": "しんでん", "掲示板": "けいじばん", "鍛冶": "かじ", "鍛冶屋": "かじや", "図鑑": "ずかん", "称号": "しょうごう", "棚": "たな",
    "解放": "かいほう", "分解": "ぶんかい",
    // 装備・素材・道具
    "装備": "そうび", "軽装備": "けいそうび", "重装備": "じゅうそうび", "武器": "ぶき", "防具": "ぼうぐ", "属性": "ぞくせい",
    "剣": "けん", "剣士": "けんし", "大剣": "たいけん", "斧": "おの", "杖": "つえ", "拳": "けん", "槍兵": "そうへい", "銅": "どう", "革": "かわ", "布": "ぬの",
    "鉱石": "こうせき", "魔石": "ませき", "素材": "そざい", "回復": "かいふく", "回復薬": "かいふくやく", "復活": "ふっかつ", "復活薬": "ふっかつやく",
    "復元": "ふくげん", "個": "こ", "使用済": "しようずみ", "済": "すみ",
    // 仲間・強さ
    "職業": "しょくぎょう", "転職": "てんしょく", "上級職": "じょうきゅうしょく", "基本職": "きほんしょく", "戦士": "せんし", "魔術師": "まじゅつし",
    "狩人": "かりゅうど", "武術家": "ぶじゅつか", "僧侶": "そうりょ", "熟練度": "じゅくれんど", "経験値": "けいけんち", "能力": "のうりょく",
    "筋力": "きんりょく", "魔力": "まりょく", "魔法": "まほう", "物攻": "ぶっこう", "物防": "ぶつぼう", "魔攻": "まこう", "魔防": "まぼう",
    "攻撃": "こうげき", "一撃": "いちげき", "連撃": "れんげき", "防御": "ぼうぎょ", "突進": "とっしん", "大突進": "だいとっしん", "大技": "おおわざ",
    "呼吸": "こきゅう", "応急手当": "おうきゅうてあて", "系統": "けいとう", "条件": "じょうけん", "無効": "むこう", "効果音": "こうかおん",
    "斬": "ざん", "刺": "し", "姿": "すがた", "髪": "かみ", "得意": "とくい", "平均": "へいきん",
    // 設定
    "保護者": "ほごしゃ", "設定": "せってい", "制限": "せいげん", "端末": "たんまつ", "暗証番号": "あんしょうばんごう", "準備": "じゅんび", "切替": "きりかえ",
    // 漢字＋ひらがな（読みは漢字の部分）
    "移す": "うつ", "移せ": "うつ", "移し": "うつ", "移そ": "うつ", "移る": "うつ", "移り": "うつ",
    "撃つ": "う", "撃て": "う", "撃ち": "う", "撃と": "う", "撃っ": "う",
    "斬る": "き", "斬り": "き", "斬れ": "き", "効き": "き", "効か": "き", "効く": "き", "効け": "き",
    "解く": "と", "解き": "と", "解け": "と", "解こ": "と", "解い": "と",
    "拳で": "こぶし", "割り": "わ", "割": "わり", "突き": "つ", "構え": "かま", "眠り": "ねむ", "眠っ": "ねむ", "眠る": "ねむ",
    "祈り": "いの", "伸び": "の", "押し": "お", "押す": "お", "倒れ": "たお", "忘れ": "わす", "隠れ": "かく", "閉じ": "と",
    "逃げ": "に", "飾ら": "かざ", "飾る": "かざ", "迷い": "まよ", "挑む": "いど", "挑み": "いど", "控え": "ひか", "増え": "ふ", "増や": "ふ"
  };

  // 長い言葉から先に当てはめるための並び
  var keys = [];
  function build() {
    keys = [];
    for (var k in WORDS) if (WORDS.hasOwnProperty(k)) keys.push(k);
    keys.sort(function (a, b) { return b.length - a.length; });
  }
  build();

  // "{漢字|よみ}" の書きこみを、部品に分ける
  function parseMarkup(str, out) {
    var re = /\{([^|{}]+)\|([^|{}]+)\}/g, m, last = 0;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push({ t: str.slice(last, m.index) });
      out.push({ t: m[1], r: m[2] });
      last = re.lastIndex;
    }
    if (last < str.length) out.push({ t: str.slice(last) });
    return out;
  }

  function isKanji(c) { return /[\u4e00-\u9fff々]/.test(c); }
  // 言葉の漢字の部分の長さ（「移す」なら1）
  function kanjiLen(k) { var n = 0; while (n < k.length && isKanji(k.charAt(n))) n++; return n; }

  // 文を部品（{t:文字} か {t:漢字, r:よみ}）に分ける。{漢字|よみ} の書きこみはそのまま使う
  function parse(str) {
    str = String(str);
    var first = parseMarkup(str, []), out = [];
    for (var i = 0; i < first.length; i++) {
      var seg = first[i];
      if (seg.r != null) { out.push(seg); continue; }
      var s = seg.t, plain = "", p = 0;
      while (p < s.length) {
        var hit = null;
        if (isKanji(s.charAt(p))) {
          for (var j = 0; j < keys.length; j++) {
            if (s.substr(p, keys[j].length) === keys[j]) { hit = keys[j]; break; }
          }
        }
        if (hit) {
          var n = kanjiLen(hit);
          if (plain) { out.push({ t: plain }); plain = ""; }
          out.push({ t: hit.substr(0, n), r: WORDS[hit] });
          p += n;   // ひらがなの部分は、ふつうの文字として続ける
        } else { plain += s.charAt(p); p++; }
      }
      if (plain) out.push({ t: plain });
    }
    return out;
  }

  function has(segs) { for (var i = 0; i < segs.length; i++) if (segs[i].r != null) return true; return false; }
  // ふりがなをはずした文字
  function plain(str) { return String(str).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, "$1"); }
  // 確かめ用：ふりがなを {漢字|よみ} の形で見せる
  function markup(str) {
    return parse(str).map(function (s) { return s.r != null ? "{" + s.t + "|" + s.r + "}" : s.t; }).join("");
  }

  // ---------- ふつうの画面（HTML） ----------
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1, RUBY: 1, RT: 1, RP: 1, INPUT: 1, CANVAS: 1, TITLE: 1 };
  function skipped(node) {
    for (var e = node; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP_TAGS[e.tagName]) return true;
      if (e.hasAttribute("data-noruby")) return true;
      if (e.isContentEditable) return true;
    }
    return false;
  }
  function fixText(tn) {
    var v = tn.nodeValue;
    if (!v || !/[一-鿿{]/.test(v)) return;
    var p = tn.parentNode;
    if (!p || skipped(p)) return;
    var segs = parse(v);
    if (!has(segs)) {
      var pl = plain(v);
      if (pl !== v) tn.nodeValue = pl;
      return;
    }
    var frag = document.createDocumentFragment();
    segs.forEach(function (s) {
      if (s.r == null) { frag.appendChild(document.createTextNode(s.t)); return; }
      var rb = document.createElement("ruby");
      rb.appendChild(document.createTextNode(s.t));
      var rt = document.createElement("rt");
      rt.appendChild(document.createTextNode(s.r));
      rb.appendChild(rt);
      frag.appendChild(rb);
    });
    p.replaceChild(frag, tn);
  }
  function apply(node) {
    if (!node) return;
    if (node.nodeType === 3) { fixText(node); return; }
    if (node.nodeType !== 1 || skipped(node)) return;
    var list = [], w = document.createTreeWalker(node, 4, null, false), t;
    while ((t = w.nextNode())) list.push(t);
    for (var i = 0; i < list.length; i++) fixText(list[i]);
  }
  var observer = null;
  function start() {
    apply(document.body);
    if (!window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      observer.disconnect();   // 自分で入れかえた分には反応しない
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") apply(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) apply(m.addedNodes[j]);
      }
      watch();
    });
    watch();
  }
  function watch() { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); }

  // ---------- キャンバス ----------
  // 文の幅（ふりがなは入れない）。ctx.font はあらかじめ決めておく
  function width(ctx, str) { return ctx.measureText(plain(str)).width; }
  // ふりがなの分の高さ（文字の大きさ size に対して）
  function rubyHeight(size) { return Math.max(3, Math.round(size * 0.5)); }
  // ふりがなつきで描く。ctx.font・textAlign・fillStyle はあらかじめ決めておき、size（文字の大きさ）を渡す。
  // textBaseline は "top" か "middle" を想定。ふりがなは文字のすぐ上に、半分の大きさで描く。
  function draw(ctx, str, x, y, size) {
    var segs = parse(str);
    if (!has(segs)) { ctx.fillText(plain(str), x, y); return; }
    var align = ctx.textAlign, base = ctx.textBaseline, font = ctx.font;
    var total = 0, i, ws = [];
    for (i = 0; i < segs.length; i++) { ws.push(ctx.measureText(segs[i].t).width); total += ws[i]; }
    var cx = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
    var top = base === "middle" ? y - size / 2 : base === "bottom" || base === "alphabetic" ? y - size : y;
    var rs = rubyHeight(size);
    ctx.textAlign = "left";
    for (i = 0; i < segs.length; i++) {
      ctx.font = font;
      ctx.fillText(segs[i].t, cx, y);
      if (segs[i].r != null) {
        ctx.font = font.replace(/[0-9.]+px/, rs + "px");
        var rw = ctx.measureText(segs[i].r).width, sx = 1;
        var rx = cx + ws[i] / 2;
        // ふりがなが漢字より長いときは、横を少しちぢめる
        if (rw > ws[i] + rs) sx = (ws[i] + rs) / rw;
        ctx.save();
        ctx.textBaseline = "bottom";
        ctx.translate(rx, top + 0.5);
        ctx.scale(sx, 1);
        ctx.textAlign = "center";
        ctx.fillText(segs[i].r, 0, 0);
        ctx.restore();
      }
      cx += ws[i];
    }
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base;
  }

  var api = { WORDS: WORDS, parse: parse, plain: plain, markup: markup, has: function (str) { return has(parse(str)); },
    apply: apply, start: start, width: width, draw: draw, rubyHeight: rubyHeight };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
  return api;
})();
