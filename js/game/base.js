// 拠点とキャラクリ（段階5-1）。
// はじめて遊ぶとき：3人の名前・職業・顔を決める。そのあとは拠点の画面から出発し、冒険が終わると拠点にもどる。
// 拠点のメニュー（装備・お店・鍛冶屋・転職・スキル・倉庫・図鑑・遊び方）は段階5-2で作る。
// 「1日1回」と「知恵の試練を解いてから出発」は段階6。それまでは何回でも出発できる。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Base = (function () {
  var baseEl = document.getElementById("base");
  var createEl = document.getElementById("create");
  var FLOORS = 14;

  // 職業の説明（キャラクリで出す）
  var JOB_NOTES = {
    warrior: "剣で近くの敵を斬る。体力があって、かたい。",
    mage: "杖から魔法の玉を飛ばす。火と水の魔法が得意。",
    hunter: "弓で遠くから撃つ。矢は何本でも撃てる。",
    fighter: "拳ですばやくなぐる。攻撃の間かくが短い。",
    priest: "杖でたたく。仲間全員の HP を回復できる。"
  };
  var DEFAULT = [
    { name: "アレン", job: "warrior", face: 0 },
    { name: "ミラ", job: "mage", face: 1 },
    { name: "ロイ", job: "hunter", face: 2 }
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function faceCanvas(id, size) {
    var c = el("canvas", "face");
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
    c.style.width = size + "px"; c.style.height = size + "px";
    var ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
    Faces.draw(ctx, id, 0, 0, size * dpr);
    return c;
  }

  // ---------- はじめに ----------
  function boot() {
    if (GameState.load()) showBase(null);
    else showCreate();
  }

  // ---------- キャラクリ ----------
  function showCreate() {
    var picks = DEFAULT.map(function (d) { return { name: d.name, job: d.job, face: d.face }; });
    var box = document.getElementById("createList"); box.textContent = "";
    picks.forEach(function (p, i) {
      var card = el("div", "cc-card");
      card.appendChild(el("h3", "", (i + 1) + "人目"));
      var nameRow = el("label", "cc-name", "名前 ");
      var input = el("input"); input.type = "text"; input.maxLength = 6; input.value = p.name;
      input.addEventListener("input", function () { p.name = input.value; });
      nameRow.appendChild(input); card.appendChild(nameRow);

      card.appendChild(el("div", "cc-label", "職業"));
      var jobs = el("div", "cc-jobs"), note = el("p", "cc-note", JOB_NOTES[p.job]);
      GameData.JOB_ORDER.forEach(function (j) {
        var b = el("button", "btn chip" + (j === p.job ? " sel" : ""), GameData.JOBS[j].name); b.type = "button";
        b.addEventListener("click", function () {
          p.job = j; note.textContent = JOB_NOTES[j];
          Array.prototype.forEach.call(jobs.children, function (x) { x.classList.remove("sel"); }); b.classList.add("sel");
        });
        jobs.appendChild(b);
      });
      card.appendChild(jobs); card.appendChild(note);

      card.appendChild(el("div", "cc-label", "顔（仮の絵。段階7で差しかえ）"));
      var faces = el("div", "cc-faces");
      for (var f = 0; f < Faces.count; f++) (function (f) {
        var b = el("button", "face-btn" + (f === p.face ? " sel" : "")); b.type = "button";
        b.appendChild(faceCanvas(f, 40));
        b.addEventListener("click", function () {
          p.face = f;
          Array.prototype.forEach.call(faces.children, function (x) { x.classList.remove("sel"); }); b.classList.add("sel");
        });
        faces.appendChild(b);
      })(f);
      card.appendChild(faces);
      box.appendChild(card);
    });
    document.getElementById("createNote").textContent = "同じ職業を2人以上にしてもだいじょうぶ。職業は、あとで転職の神殿で変えられる（段階5-2）。";
    document.getElementById("createGo").onclick = function () {
      var bad = picks.filter(function (p) { return !p.name || !p.name.replace(/\s/g, ""); });
      if (bad.length) { document.getElementById("createNote").textContent = "3人とも名前を入れてね"; return; }
      GameState.newGame(picks.map(function (p) { return { name: p.name.replace(/^\s+|\s+$/g, ""), job: p.job, face: p.face }; }));
      createEl.hidden = true;
      showBase(null);
    };
    baseEl.hidden = true;
    createEl.hidden = false;
  }

  // ---------- 拠点 ----------
  // report：冒険からもどったときの知らせ（なければ null）
  function showBase(report) {
    var g = GameState.get();
    createEl.hidden = true;
    baseEl.hidden = false;
    var tools = GameState.TOOL_ORDER.filter(function (k) { return g.items[k] > 0; }).map(function (k) { return GameState.TOOLS[k].name + g.items[k]; });
    document.getElementById("baseMoney").textContent = g.gold + "G　鉄 " + g.mat.iron + "　魔石 " + g.mat.stone + "　倉庫の装備 " + g.storage.length + "個" +
      (tools.length ? "　道具：" + tools.join("・") : "") +
      (g.titles.length ? "　称号：" + g.titles.join("・") : "");

    // 仲間
    var pbox = document.getElementById("baseParty"); pbox.textContent = "";
    g.party.forEach(function (h) {
      var card = el("div", "hero");
      card.appendChild(faceCanvas(h.face, 48));
      var info = el("div", "hero-info");
      var st = GameState.stars(h);
      info.appendChild(el("div", "hero-name", h.name + "　" + GameData.JOBS[h.job].name + "　" + "★".repeat(st) + "☆".repeat(GameState.MAX_STAR - st)));
      var need = GameState.expNeed(h.level);
      info.appendChild(el("div", "hero-lv", "Lv " + h.level + (h.level < GameState.MAX_LEVEL ? "　次のレベルまで " + (need - h.exp) : "（いちばん上）")));
      var bar = el("div", "bar"); var fill = el("div", "bar-fill"); fill.style.width = Math.round(h.exp / need * 100) + "%"; bar.appendChild(fill); info.appendChild(bar);
      var s = GameState.heroStats(h);
      info.appendChild(el("div", "hero-stats", "HP " + s.hp + "　MP " + s.mp + "　物攻 " + s.patk + "　物防 " + s.pdef + "　魔攻 " + s.matk + "　魔防 " + s.mdef));
      var m = h.mastery[h.job] || 0;
      info.appendChild(el("div", "hero-stats", "熟練度 " + m + (st < GameState.MAX_STAR ? "（次の★まで " + ((st + 1) * GameState.STAR_NEED - m) + "）" : "（極めた！）")));
      info.appendChild(el("div", "hero-stats", "武器：" + (h.equip.weapon ? Loot.describe(h.equip.weapon) : "はじめの" + GameData.WEAPONS[GameState.starterWeapon(h.job)].name) +
        "　防具：" + (h.equip.armor ? Loot.describe(h.equip.armor) : GameData.STARTER_ARMORS[GameData.JOBS[h.job].armor].name)));
      info.appendChild(el("div", "hero-skills", "スキル：" + h.set.map(function (id) { return id ? GameData.SKILL[id].name : "なし"; }).join("・") +
        (h.learned.length ? "" : "（★1 になると覚える）")));
      card.appendChild(info);
      pbox.appendChild(card);
    });

    // 出発
    var deepest = g.progress.deepest;
    var next = Math.min(FLOORS, deepest + 1);
    var go = document.getElementById("goNext");
    go.textContent = deepest >= FLOORS ? "森の主をたおした！ 好きな階層へ" : "森の " + next + " 階へ出発" + (next === 7 || next === 14 ? "（ボス）" : "");
    go.disabled = deepest >= FLOORS;
    go.onclick = function () { depart(next); };
    var sel = document.getElementById("goAgainFloor"); sel.textContent = "";
    for (var f = 1; f <= Math.max(1, deepest); f++) {
      var o = el("option", "", f + "階" + (f === 7 || f === 14 ? "（ボス）" : "")); o.value = f; if (f === deepest) o.selected = true; sel.appendChild(o);
    }
    document.getElementById("goAgain").disabled = deepest < 1;
    document.getElementById("goAgain").onclick = function () { depart(Number(sel.value) || 1); };

    // メニュー：装備・お店・鍛冶屋・倉庫は 5-2①、ほかは 5-2②で作る
    var OPEN = { "装備": "equip", "お店": "shop", "鍛冶屋": "smith", "倉庫": "storage" };
    Array.prototype.forEach.call(document.querySelectorAll("#baseMenu .btn"), function (b) {
      var name = b.textContent;
      b.onclick = OPEN[name] ? function () { Town.open(OPEN[name]); }
        : function () { document.getElementById("baseNote").textContent = "「" + name + "」は段階5-2②で作ります"; };
    });
    document.getElementById("baseNote").textContent = "";

    // テスト用の設定
    var st2 = Adventure.settings;
    fillSelect("testCorrect", [0, 1, 2, 3, 4], st2.correct, function (n) { return n + "問"; });
    fillSelect("testMinutes", [1, 3, 5, 10], st2.minutes, function (n) { return n + "分"; });
    document.getElementById("testSeed").value = st2.seed;
    fillSelect("testLevel", [1, 5, 10, 20, 50, 100], g.party[0].level, function (n) { return "Lv" + n; });
    fillSelect("testFloor", range(1, FLOORS), next, function (n) { return n + "階" + (n === 7 || n === 14 ? "（ボス）" : ""); });

    if (report) showReport(report);
  }

  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function fillSelect(id, values, cur, label) {
    var s = document.getElementById(id); s.textContent = "";
    values.forEach(function (v) { var o = el("option", "", label(v)); o.value = v; if (v === cur) o.selected = true; s.appendChild(o); });
  }
  function readTestSettings() {
    var st = Adventure.settings;
    st.correct = Number(document.getElementById("testCorrect").value) || 0;
    st.minutes = Number(document.getElementById("testMinutes").value) || 5;
    st.seed = String(document.getElementById("testSeed").value || "").replace(/[^0-9]/g, "");
  }

  function depart(floor) {
    readTestSettings();
    baseEl.hidden = true;
    Adventure.start(floor, Adventure.settings.seed ? Number(Adventure.settings.seed) : 0);
  }

  // 冒険から拠点にもどる
  function returnFrom(result) {
    var report = GameState.applyAdventure(result);
    showBase({ result: result, people: report });
  }

  // もどったときの知らせ
  function showReport(rep) {
    var box = document.getElementById("baseReport"); box.textContent = "";
    var r = rep.result;
    box.appendChild(el("h3", "", r.cleared ? "森の " + r.floor + " 階をクリアして、拠点にもどった" : "拠点にもどった"));
    box.appendChild(el("p", "", "持ち帰ったもの：" + r.gold + "G　鉄 " + r.mat.iron + "　魔石 " + r.mat.stone + "　装備 " + r.items.length + "個" + (r.title ? "　称号「" + r.title + "」" : "")));
    rep.people.forEach(function (p) {
      var d = el("div", "rep-person");
      d.appendChild(el("b", "", p.name + "（経験値 +" + p.exp + "）"));
      p.lines.forEach(function (t) { d.appendChild(el("div", "rep-line", t)); });
      box.appendChild(d);
    });
    var ok = el("button", "btn", "OK"); ok.type = "button";
    ok.onclick = function () { box.hidden = true; };
    box.appendChild(ok);
    box.hidden = false;
  }

  // テスト用のボタン
  document.getElementById("testLevelApply").addEventListener("click", function () {
    GameState.setLevelForTest(Number(document.getElementById("testLevel").value) || 1);
    showBase(null);
    document.getElementById("baseNote").textContent = "テスト用：3人のレベルを変えました";
  });
  document.getElementById("testGo").addEventListener("click", function () { depart(Number(document.getElementById("testFloor").value) || 1); });
  document.getElementById("testWipe").addEventListener("click", function () {
    if (!window.confirm("3人のデータを消して、キャラクリからやり直します。よいですか？")) return;
    GameState.wipe();
    showCreate();
  });

  return { boot: boot, returnFrom: returnFrom, showBase: showBase };
})();
