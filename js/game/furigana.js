// ふりがな（段階7-3）。
// 小4までに習わない漢字に、自動でふりがなをつける。
// - 読みは下の辞書 WORDS に書く（左が画面の文字、右が {漢字|よみ} をつけた形）。長い言葉から先に当てはめる。
// - 辞書で決まらない読みは、文の中に直接 {漢字|よみ} と書いてもよい。
// - ふつうの画面（HTML の文字）は、画面に文字が出たときに自動でつける（data-noruby のついた所の中はつけない）。
// - キャンバスに描く文字（ダンジョンの中、町・地図の名前の札）は Furi.draw で描く。
// - つけ忘れは  node tools/check-furigana.js  で確かめる。
var Furi = (function () {
  "use strict";

  // 2文字以上の言葉は、読みが1文字ずつに分けにくいものや、1文字のときと読みが変わるもの。
  // 1文字だけのものは、ほかの言葉に当てはまらなかったときの読み。
  var WORDS = {
    // ゲームの言葉
    "冒険": "{冒険|ぼうけん}", "装備": "{装備|そうび}", "攻撃": "{攻撃|こうげき}", "報酬": "{報酬|ほうしゅう}",
    "鍛冶": "{鍛冶|かじ}", "掲示": "{掲示|けいじ}", "保護": "{保護|ほご}", "条件": "{条件|じょうけん}",
    "系統": "{系統|けいとう}", "属性": "{属性|ぞくせい}", "探検": "{探検|たんけん}", "準備": "{準備|じゅんび}",
    "防御": "{防御|ぼうぎょ}", "呼吸": "{呼吸|こきゅう}", "秘境": "{秘境|ひきょう}", "制限": "{制限|せいげん}",
    "僧侶": "{僧侶|そうりょ}", "狩人": "{狩人|かりゅうど}", "武術": "{武術|ぶじゅつ}", "暗証": "暗{証|しょう}",
    "槍兵": "{槍|そう}兵", "突進": "{突|とっ}進", "使用済": "使用{済|ずみ}", "設定": "{設|せっ}定",
    // 1文字のときと読みが変わるもの
    "正解": "正{解|かい}", "分解": "分{解|かい}", "解放": "{解|かい}放",
    "効き": "{効|き}き", "効か": "{効|き}か", "効く": "{効|き}く", "効け": "{効|き}け",
    "斬る": "{斬|き}る", "斬り": "{斬|き}り", "斬れ": "{斬|き}れ",
    "撃ち": "{撃|う}ち", "撃つ": "{撃|う}つ", "撃て": "{撃|う}て", "撃た": "{撃|う}た",
    "拳で": "{拳|こぶし}で",
    // 1文字の読み
    "魔": "{魔|ま}", "攻": "{攻|こう}", "防": "{防|ぼう}", "職": "{職|しょく}", "熟": "{熟|じゅく}",
    "経": "{経|けい}", "値": "{値|ち}", "拠": "{拠|きょ}", "宝": "{宝|たから}", "鍵": "{鍵|かぎ}",
    "扉": "{扉|とびら}", "罠": "{罠|わな}", "敵": "{敵|てき}", "毒": "{毒|どく}", "沼": "{沼|ぬま}",
    "穴": "{穴|あな}", "剣": "{剣|けん}", "斧": "{斧|おの}", "杖": "{杖|つえ}", "拳": "{拳|けん}",
    "槍": "{槍|やり}", "奥": "{奥|おく}", "霧": "{霧|きり}", "壁": "{壁|かべ}", "炎": "{炎|ほのお}",
    "蜂": "{蜂|はち}", "姿": "{姿|すがた}", "髪": "{髪|かみ}", "棚": "{棚|たな}", "株": "{株|かぶ}",
    "個": "{個|こ}", "称": "{称|しょう}", "鑑": "{鑑|かん}", "護": "{護|ご}", "殿": "{殿|でん}",
    "武": "{武|ぶ}", "術": "{術|じゅつ}", "士": "{士|し}", "撃": "{撃|げき}", "斬": "{斬|ざん}",
    "刺": "{刺|し}", "効": "{効|こう}", "解": "{解|と}", "突": "{突|つ}", "割": "{割|わ}",
    "構": "{構|かま}", "眠": "{眠|ねむ}", "済": "{済|すみ}", "替": "{替|かえ}", "押": "{押|お}",
    "復": "{復|ふく}", "層": "{層|そう}", "段": "{段|だん}", "恵": "{恵|え}", "率": "{率|りつ}",
    "閉": "{閉|と}", "挑": "{挑|いど}", "控": "{控|ひか}", "伸": "{伸|の}", "増": "{増|ふ}",
    "過": "{過|す}", "迷": "{迷|まよ}", "倒": "{倒|たお}", "祈": "{祈|いの}", "得": "{得|とく}",
    "途": "{途|と}", "移": "{移|い}", "均": "{均|きん}", "樹": "{樹|じゅ}", "瘴": "{瘴|しょう}",
    "若": "{若|わか}", "素": "{素|そ}", "筋": "{筋|きん}", "能": "{能|のう}", "基": "{基|き}",
    "技": "{技|わざ}", "逃": "{逃|に}", "隠": "{隠|かく}", "停": "{停|てい}", "端": "{端|たん}",
    "覧": "{覧|らん}", "粉": "{粉|ふん}", "応": "{応|おう}", "銅": "{銅|どう}", "鉱": "{鉱|こう}", "革": "{革|かわ}", "布": "{布|ぬの}", "師": "{師|し}", "飾": "{飾|かざ}", "忘": "{忘|わす}"
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

  // 文を部品（{t:文字} か {t:漢字, r:よみ}）に分ける
  function parse(str) {
    str = String(str);
    var first = parseMarkup(str, []), out = [];
    for (var i = 0; i < first.length; i++) {
      var seg = first[i];
      if (seg.r != null) { out.push(seg); continue; }
      var s = seg.t, plain = "", p = 0;
      while (p < s.length) {
        var hit = null;
        if (/[一-鿿]/.test(s.charAt(p)) || /^[0-9０-９]/.test(s.charAt(p))) {
          for (var j = 0; j < keys.length; j++) {
            if (s.substr(p, keys[j].length) === keys[j]) { hit = keys[j]; break; }
          }
        }
        if (hit) {
          if (plain) { out.push({ t: plain }); plain = ""; }
          parseMarkup(WORDS[hit], out);
          p += hit.length;
        } else { plain += s.charAt(p); p++; }
      }
      if (plain) out.push({ t: plain });
    }
    // となり合うふりがなは1つにまとめる（{魔|ま}{術|じゅつ}{師|し} → {魔術師|まじゅつし}。漢字の間があかないように）
    var merged = [];
    for (var q = 0; q < out.length; q++) {
      var last = merged[merged.length - 1];
      if (last && last.r != null && out[q].r != null) merged[merged.length - 1] = { t: last.t + out[q].t, r: last.r + out[q].r };
      else merged.push(out[q]);
    }
    return merged;
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
