// ふりがなのつけ忘れを見つける確かめ用の道具（ゲームの画面では使わない）。
// 使い方（リポジトリのいちばん上のフォルダで）：  node tools/check-furigana.js
//   画面に出る文（js/game/*.js の文字列と game.html の文字）の中で、
//   小4までに習わない漢字なのに、ふりがなの辞書（js/game/furigana.js）にも
//   {漢字|よみ} の書きこみにもない所を出す。何も出なければ OK。
//   node tools/check-furigana.js --all   … 辞書で読みがついた所も含めて、全部の文を出す
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var KANJI = require("./kanji-sho4.js");
var Furi = require(path.join(root, "js/game/furigana.js"));

// ふりがなをつけない画面のファイル（保護者画面・つなぎ先の画面）
var SKIP_FILES = ["parent.js", "sync.js"];

var known = {};
for (var i = 0; i < KANJI.length; i++) known[KANJI.charAt(i)] = true;
function isKanji(c) { return /[一-鿿]/.test(c); }

// JS から文字列だけを取り出す（コメントは飛ばす）
function jsStrings(src) {
  var out = [], i = 0, n = src.length, line = 1;
  while (i < n) {
    var c = src.charAt(i), d = src.charAt(i + 1);
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && d === "/") { while (i < n && src.charAt(i) !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src.charAt(i) === "*" && src.charAt(i + 1) === "/")) { if (src.charAt(i) === "\n") line++; i++; } i += 2; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      var q = c, s = "", start = line; i++;
      while (i < n && src.charAt(i) !== q) {
        if (src.charAt(i) === "\\") { s += src.charAt(i + 1) === "n" ? "\n" : src.charAt(i + 1); i += 2; continue; }
        if (src.charAt(i) === "\n") line++;
        s += src.charAt(i); i++;
      }
      i++;
      out.push({ text: s, line: start });
      continue;
    }
    i++;
  }
  return out;
}

// HTML から画面に出る文字を取り出す（コメント・script・data-noruby のついた要素の中は飛ばす）
function htmlTexts(src) {
  var out = [], re = /<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<([a-zA-Z0-9]+)([^>]*)>|<\/([a-zA-Z0-9]+)>|([^<]+)/g, m;
  var stack = [], skipDepth = -1;
  var VOID = { br: 1, img: 1, input: 1, meta: 1, link: 1, hr: 1, source: 1, canvas: 0 };
  while ((m = re.exec(src))) {
    var line = src.slice(0, m.index).split("\n").length;
    if (m[1]) {
      var tag = m[1].toLowerCase(), attrs = m[2];
      var al = /aria-label="([^"]*)"/.exec(attrs);
      if (VOID[tag] || /\/$/.test(attrs)) continue;
      stack.push(tag);
      if (skipDepth < 0 && /data-noruby/.test(attrs)) skipDepth = stack.length;
    } else if (m[3]) {
      if (skipDepth === stack.length) skipDepth = -1;
      stack.pop();
    } else if (m[4]) {
      if (skipDepth < 0 && stack[stack.length - 1] !== "title") out.push({ text: m[4], line: line });
    }
  }
  return out;
}

var all = process.argv.indexOf("--all") >= 0, problems = 0;
var files = fs.readdirSync(path.join(root, "js/game")).filter(function (f) { return /\.js$/.test(f) && f !== "furigana.js"; })
  .map(function (f) { return "js/game/" + f; }).concat(["game.html"]);
files.forEach(function (f) {
  if (SKIP_FILES.indexOf(path.basename(f)) >= 0) return;
  var src = fs.readFileSync(path.join(root, f), "utf8");
  var list = /\.js$/.test(f) ? jsStrings(src) : htmlTexts(src);
  list.forEach(function (s) {
    var hasK = false, miss = "";
    Furi.parse(s.text).forEach(function (seg) {
      if (seg.r != null) { hasK = true; return; }
      for (var k = 0; k < seg.t.length; k++) {
        var c = seg.t.charAt(k);
        if (isKanji(c) && !known[c]) miss += c;
      }
    });
    if (miss) { problems++; console.log(f + ":" + s.line + "  [" + miss + "]  " + s.text.replace(/\s+/g, " ").trim()); }
    else if (all && hasK) console.log(f + ":" + s.line + "  " + Furi.markup(s.text).replace(/\s+/g, " ").trim());
  });
});
if (!all) console.log(problems ? "\nふりがなのない、小4までに習わない漢字：" + problems + " か所" : "OK：ふりがなのつけ忘れはありません");
process.exitCode = problems ? 1 : 0;
