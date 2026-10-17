// 知恵の試練の「ためしの問題」と「偽の窓口」（段階6-1）。
// GAS につなぐまで（config.js の gasUrl が空のとき）だけ使う。問題は Claude が作った簡単なもの（塾の教材ではない）。
// 記録は iPad の中（localStorage）にだけ残す。GAS につないだら、本物の問題と記録に切りかわる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var TrialMock = (function () {
  var RECORDS_KEY = "bd-mock-records";
  var QUESTIONS = [
    { id: "t-m1", subject: "math", unit: "かけ算", source: "ためしの問題",
      text: "1本 120円 のえんぴつを 7本 買いました。代金は何円ですか。",
      parts: [{ type: "number", answer: "840", suffix: "円", rate: 80 }],
      explanation: "120 × 7 = 840 なので、840円。" },
    { id: "t-m2", subject: "math", unit: "分数のたし算", source: "ためしの問題",
      text: "3/4 ＋ 5/8 を計算しましょう。答えは帯分数で書きましょう。",
      parts: [{ type: "fraction", answer: { w: "1", n: "3", d: "8" }, rate: 55 }],
      explanation: "3/4 ＝ 6/8 なので、6/8 ＋ 5/8 ＝ 11/8 ＝ 1と3/8。" },
    { id: "t-j1", subject: "japanese", unit: "ことわざ", source: "ためしの問題",
      text: "「いそがば ○○○」の ○○○ に入る言葉を、ひらがなで書きましょう。",
      parts: [{ type: "text", answer: "まわれ", alt: ["回れ"], rate: 70 }],
      explanation: "「急がば回れ」：急ぐときほど、安全で確かな方法をとるほうがよい、という意味。" },
    { id: "t-j2", subject: "japanese", unit: "主語と述語", source: "ためしの問題",
      text: "「ぼくは 公園で 元気に 走った。」の主語はどれですか。\nア ぼくは　イ 公園で　ウ 元気に　エ 走った",
      parts: [{ type: "choice", options: ["ア", "イ", "ウ", "エ"], answer: "ア", rate: 85 }],
      explanation: "「だれが」にあたる「ぼくは」が主語。「走った」は述語。" },
    { id: "t-s1", subject: "science", unit: "水のすがた", source: "ためしの問題",
      text: "水を熱しつづけると、およそ何度でふっとうしますか。\nア 50度　イ 100度　ウ 150度",
      parts: [{ type: "choice", options: ["ア", "イ", "ウ"], answer: "イ", rate: 90 }],
      explanation: "水はおよそ100度でふっとうする。" },
    { id: "t-s2", subject: "science", unit: "こん虫", source: "ためしの問題",
      text: "こん虫のなかまを、全部選びましょう。\nア クモ　イ アリ　ウ チョウ　エ ダンゴムシ",
      parts: [{ type: "multi", options: ["ア", "イ", "ウ", "エ"], answer: ["イ", "ウ"], rate: 60 }],
      explanation: "こん虫は、体が頭・むね・はらの3つに分かれ、あしが6本。クモ（8本）とダンゴムシはこん虫ではない。" },
    { id: "t-o1", subject: "social", unit: "日本の地理", source: "ためしの問題",
      text: "日本でいちばん長い川の名前を書きましょう。",
      parts: [{ type: "text", answer: "信濃川", alt: ["しなのがわ", "しなの川"], rate: 65 }],
      explanation: "信濃川（しなのがわ）。長野県と新潟県を流れる。" },
    { id: "t-o2", subject: "social", unit: "日本の地理", source: "ためしの問題",
      text: "北から南の順に、記号をタップして並べましょう。\nア 九州　イ 北海道　ウ 本州",
      parts: [{ type: "order", options: ["ア", "イ", "ウ"], answer: ["イ", "ウ", "ア"], rate: 75 }],
      explanation: "北から、北海道 → 本州 → 九州。" }
  ];

  function readRecords() { try { var v = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writeRecords(list) { try { localStorage.setItem(RECORDS_KEY, JSON.stringify(list)); } catch (e) { /* 入りきらなければ、そのまま */ } }

  // api.js の BD_MOCK のしくみを使う（GAS の URL が空のときだけ）
  function install() {
    window.BD_MOCK = {
      check: function () { return { player: "child" }; },
      drillQuestions: function () { return { questions: QUESTIONS }; },
      history: function () { return { records: readRecords(), player: "child" }; },
      saveAnswer: function (body) { var list = readRecords(); list.push(body.record); writeRecords(list); return {}; },
      image: function () { return { src: "" }; }
    };
  }

  return { install: install, QUESTIONS: QUESTIONS, clear: function () { writeRecords([]); } };
})();
