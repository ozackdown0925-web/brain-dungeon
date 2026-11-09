// 日本地図の棚の「印刷用の白地図」を作る（2026-11-09）。県名・県庁所在地を漢字で書いて仕上げる用。
// 使い方：node tools/make-chizu-print.js <出力する PDF のパス>   （playwright が必要）
// 1ページ目：番号つきの白地図（●は県庁所在地）　2ページ目：書きこむ表　3ページ目：答え
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
global.window = global;
eval(fs.readFileSync(path.join(root, "js/game/japanmap.js"), "utf8").replace("var JAPAN_MAP", "global.JAPAN_MAP"));
var Chizu = require(path.join(root, "js/game/chizu.js"));
var out = process.argv[2] || "白地図.pdf";

function table(withAnswers) {
  var rows = Chizu.PREFS.map(function (p) {
    var dif = Chizu.differs(Chizu.byCode[p[0]]);
    return "<tr><td class=n>" + Number(p[0]) + "</td><td>" + (withAnswers ? p[1] : "") + "</td><td" + (dif && withAnswers ? " class=dif" : "") + ">" +
      (withAnswers ? p[2] : "") + "</td></tr>";
  });
  var half = 24, head = "<tr><th>番号</th><th>都道府県</th><th>県庁所在地</th></tr>";
  return "<div class=cols><table>" + head + rows.slice(0, half).join("") + "</table><table>" + head + rows.slice(half).join("") + "</table></div>";
}
var css = "@page{size:A4;margin:12mm}body{font-family:'Noto Sans CJK JP','Hiragino Sans',sans-serif;margin:0;color:#222}" +
  ".pg{page-break-after:always}.pg:last-child{page-break-after:auto}h1{font-size:18px;margin:0 0 4px}.meta{font-size:13px;margin-bottom:6px}" +
  ".map svg{width:100%;height:auto;max-height:245mm}.cols{display:flex;gap:6mm}table{border-collapse:collapse;flex:1;font-size:13px}" +
  "th,td{border:1px solid #666;height:9.2mm;padding:0 6px}th{background:#eee;height:7mm}td.n{width:9mm;text-align:center}td.dif{font-weight:700;text-decoration:underline}" +
  ".note{font-size:12px;margin-top:6px}";
var html = "<!doctype html><meta charset=utf-8><style>" + css + "</style>" +
  "<div class=pg><h1>日本の白地図（都道府県と県庁所在地）</h1><div class=meta>月　　日（　　）　　●は県庁所在地。番号の都道府県名と県庁所在地を、次のページに漢字で書こう。</div>" +
  "<div class=map>" + Chizu.fullSvg({ numbers: true, caps: true }) + "</div></div>" +
  "<div class=pg><h1>書きこむ表</h1><div class=meta>月　　日（　　）　　正解した数：　　／94</div>" + table(false) + "</div>" +
  "<div class=pg><h1>答え</h1><div class=meta>太字・下線は、県の名前と県庁所在地の名前がちがう18の県。</div>" + table(true) +
  "<div class=note>地図：Natural Earth（パブリックドメイン）をもとに作成。</div></div>";
var { chromium } = require("playwright");
(async function () {
  var b = await chromium.launch(), p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: out, format: "A4", printBackground: true });
  await b.close();
  console.log("wrote", out);
})();
