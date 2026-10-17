// 拠点とキャラクリ（段階5-1）。
// はじめて遊ぶとき：3人の名前・職業・顔を決める。そのあとは拠点の「森の門」からワールドマップへ出て（worldmap.js）、冒険が終わると拠点にもどる。
// 拠点のメニュー（装備・お店・鍛冶屋・転職・スキル・倉庫・図鑑・遊び方）は段階5-2で作る。
// 出発は1日2回、知恵の試練を解いてから（段階6）。
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
    { name: "アレン", job: "warrior", face: 1 },
    { name: "ミラ", job: "mage", face: 4 },
    { name: "ロイ", job: "hunter", face: 3 }
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
  // 開いたとき：途中で閉じた冒険があれば「続きから」、終わったのに拠点にもどっていなければ受け取る（段階5-3）
  // G-2：まず GAS につなぎ、GAS のセーブと iPad の中の控えの新しい方を使う（つながらなければ遊べない）
  function boot() {
    Sync.start(function (hasGame) {
      if (!hasGame) { showCreate(); return; }
      afterLoad();
    });
  }
  function afterLoad() {
    var a = GameState.adventure();
    if (a && a.state === "finished") { returnFrom(a.result); return; }
    if (a && a.state === "playing") {
      if (GameState.adventureDate() === GameState.todayStr()) { showResume(a); return; }
      // 日付が変わっていたら、時間切れと同じあつかいで終わらせる
      var rep = GameState.applyAdventure(Adventure.resultFromSnapshot(a, "timeout"));
      showBase({ result: Adventure.resultFromSnapshot(a, "timeout"), people: rep, note: "前の冒険は、日付が変わったので終わりにした（時間切れと同じ）。" });
      return;
    }
    showBase(null);
  }

  // 「続きから」の画面
  function showResume(a) {
    var el2 = document.getElementById("resumeScreen");
    var t = Math.ceil(a.timeLeft);
    document.getElementById("resumeText").textContent =
      GameData.floorLabel(a.floor) + "を冒険している途中です（のこり " + Math.floor(t / 60) + ":" + (t % 60 < 10 ? "0" : "") + (t % 60) + "）。" +
      "その階の入口から続けます。拾った物と経験値はそのまま。開けた宝箱は開いたまま、たおした敵はもどっています。";
    document.getElementById("resumeGo").onclick = function () { el2.hidden = true; Adventure.resume(a); };
    document.getElementById("resumeQuit").onclick = function () {
      if (!window.confirm("冒険をやめて拠点にもどりますか？（拾った物と経験値は持ち帰れるけれど、階層は進みません）")) return;
      el2.hidden = true;
      returnFrom(Adventure.resultFromSnapshot(a, "quit"));
    };
    baseEl.hidden = true; createEl.hidden = true;
    el2.hidden = false;
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

      card.appendChild(el("div", "cc-label", "顔（髪の色は、ダンジョンの中の姿と同じ）"));
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
    document.getElementById("createNote").textContent = "同じ職業を2人以上にしてもだいじょうぶ。職業は、あとで拠点の転職の神殿で変えられる。";
    document.getElementById("createGo").onclick = function () {
      var bad = picks.filter(function (p) { return !p.name || !p.name.replace(/\s/g, ""); });
      if (bad.length) { document.getElementById("createNote").textContent = "3人とも名前を入れてね"; return; }
      GameState.newGame(picks.map(function (p) { return { name: p.name.replace(/^\s+|\s+$/g, ""), job: p.job, face: p.face }; }));
      createEl.hidden = true;
      showBase(null);
    };
    // GAS の「セーブの控え」から、いちばん新しいものにもどす（保護者の暗証番号を聞く）
    var rb = document.getElementById("createRestore");
    rb.hidden = true;
    Sync.checkpoints().then(function (list) {
      rb.hidden = !list.length;
      rb.onclick = function () {
        Parent.askPin(function () {
          if (!window.confirm("いちばん新しいセーブ（" + list[0].label + "：" + list[0].summary + "）にもどしますか？")) return;
          Sync.restore(list[0].id, list[0].label).then(function () { createEl.hidden = true; showBase(null); },
            function (err) { document.getElementById("createNote").textContent = "もどせませんでした（" + err.message + "）"; });
        });
      };
    }, function () { rb.hidden = true; });
    baseEl.hidden = true;
    createEl.hidden = false;
  }

  // ---------- 拠点 ----------
  // report：冒険からもどったときの知らせ（なければ null）
  function showBase(report) {
    Sound.bgm("town");
    var g = GameState.get();
    createEl.hidden = true;
    baseEl.hidden = false;
    var tools = GameState.TOOL_ORDER.filter(function (k) { return g.items[k] > 0; }).map(function (k) { return GameState.TOOLS[k].name + g.items[k]; });
    document.getElementById("baseMoney").textContent = (Sync.playerLabel() ? "（" + Sync.playerLabel() + "）" : "") + g.gold + "G　鉄 " + g.mat.iron + "　魔石 " + g.mat.stone + "　倉庫の装備 " + g.storage.length + "個" +
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
        ""));
      card.appendChild(info);
      pbox.appendChild(card);
    });

    // 町の絵（建物を押すと開く）
    drawTown();
    document.getElementById("baseNote").textContent = "";

    // テスト用の設定
    var st2 = Adventure.settings;
    fillSelect("testCorrect", [0, 1, 2, 3, 4], st2.correct, function (n) { return n + "問"; });
    fillSelect("testMinutes", [1, 3, 5, 10], st2.minutes, function (n) { return n + "分"; });
    document.getElementById("testSeed").value = st2.seed;
    fillSelect("testLevel", [1, 5, 10, 20, 50, 100], g.party[0].level, function (n) { return "Lv" + n; });
    fillSelect("testFloor", range(1, FLOORS), Math.min(FLOORS, g.progress.deepest + 1), function (n) { return n + "階" + (n === 7 || n === 14 ? "（ボス）" : ""); });

    document.getElementById("testUnlimited").checked = GameState.unlimited();
    if (report) { showReport(report); baseEl.scrollTop = 0; } // もどったときの知らせが見えるように、いちばん上から
  }

  // ---------- 町の絵（上から見た町。仮の絵。段階7で素材に差しかえ） ----------
  // 絵は 320×180 の大きさで描いて、画面の幅に合わせて広げる。b は建物の場所（x, y, w, h）。
  var TW = 320, TH = 180;
  var BUILDINGS = [
    { id: "gate",    name: "森の門（出発）",   x: 138, y: 6,   w: 44, h: 22, roof: "#6e4a26" },
    { id: "party",   name: "宿屋",             x: 18,  y: 34,  w: 56, h: 34, roof: "#b0473a" },
    { id: "shop",    name: "お店",             x: 18,  y: 104, w: 56, h: 34, roof: "#3a6ab0" },
    { id: "smith",   name: "鍛冶屋",           x: 246, y: 34,  w: 56, h: 34, roof: "#4a4f5a" },
    { id: "job",     name: "転職の神殿",       x: 246, y: 104, w: 56, h: 34, roof: "#d8b84a" },
    { id: "storage", name: "倉庫",             x: 84,  y: 140, w: 50, h: 28, roof: "#7a5a34" },
    { id: "book",    name: "書庫（図鑑）",     x: 186, y: 140, w: 50, h: 28, roof: "#6a4a9a" },
    { id: "help",    name: "掲示板（遊び方）", x: 200, y: 66,  w: 22, h: 14, roof: "#8a6a3a", board: true }
  ];
  var townCanvas = document.getElementById("townMap"), townScale = 1, hover = null;
  function drawTown() {
    var dpr = window.devicePixelRatio || 1;
    // 幅は画面に合わせ、高さは画面の高さより少し小さく（スマホの横向きでも、町ぜんぶが1画面に入るように）
    var cssW = Math.min(townCanvas.parentNode.clientWidth || 600, 720, Math.max(280, (window.innerHeight - 140) * TW / TH));
    var cssH = Math.round(cssW * TH / TW);
    townCanvas.style.width = cssW + "px"; townCanvas.style.height = cssH + "px";
    townCanvas.width = Math.round(cssW * dpr); townCanvas.height = Math.round(cssH * dpr);
    townScale = cssW / TW;
    var ctx = townCanvas.getContext("2d");
    ctx.setTransform(townCanvas.width / TW, 0, 0, townCanvas.height / TH, 0, 0);
    ctx.imageSmoothingEnabled = false;
    function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    // 地面と森
    r(0, 0, TW, TH, "#3b5a2f");
    for (var i = 0; i < 40; i++) { var tx = (i * 37) % TW, ty = (i * 53) % 30; if (tx > 128 && tx < 192) continue; r(tx, ty, 8, 8, "#1f4a22"); r(tx + 3, ty + 7, 2, 3, "#5a3d22"); }
    r(0, 0, TW, 4, "#1f4a22");
    // 道と広場
    r(152, 26, 16, 60, "#8a8264");            // 門から広場へ
    r(70, 92, 180, 14, "#8a8264");            // 横の道
    r(100, 106, 14, 40, "#8a8264"); r(206, 106, 14, 40, "#8a8264");
    ctx.fillStyle = "#a8a088"; ctx.beginPath(); ctx.arc(160, 99, 30, 0, Math.PI * 2); ctx.fill();   // 広場
    ctx.fillStyle = "#5a8ab0"; ctx.beginPath(); ctx.arc(160, 99, 9, 0, Math.PI * 2); ctx.fill();    // 噴水
    ctx.fillStyle = "#a8d0f0"; ctx.beginPath(); ctx.arc(160, 97, 3, 0, Math.PI * 2); ctx.fill();
    // 建物
    BUILDINGS.forEach(function (b) {
      var lit = hover === b.id;
      if (b.id === "gate") {
        r(b.x, b.y + 4, 6, b.h - 4, "#5a3d22"); r(b.x + b.w - 6, b.y + 4, 6, b.h - 4, "#5a3d22"); r(b.x - 2, b.y, b.w + 4, 6, lit ? "#c08a4a" : b.roof);
        r(b.x + 6, b.y + 6, b.w - 12, b.h - 6, "#16301a");
      } else if (b.board) {
        r(b.x + 4, b.y + b.h, 2, 6, "#5a3d22"); r(b.x + b.w - 6, b.y + b.h, 2, 6, "#5a3d22");
        r(b.x, b.y, b.w, b.h, lit ? "#c8a46a" : b.roof); r(b.x + 3, b.y + 3, b.w - 6, 2, "#e8dcc0"); r(b.x + 3, b.y + 7, b.w - 8, 2, "#e8dcc0");
      } else {
        r(b.x + 2, b.y + b.h - 2, b.w, 4, "rgba(0,0,0,0.3)");                                  // かげ
        r(b.x, b.y + 12, b.w, b.h - 12, "#d8c8a8");                                            // かべ
        r(b.x - 2, b.y, b.w + 4, 14, lit ? "#f2c14e" : b.roof);                                // 屋根
        r(b.x - 2, b.y + 12, b.w + 4, 2, "rgba(0,0,0,0.25)");
        r(b.x + b.w / 2 - 4, b.y + b.h - 10, 8, 10, "#5a3d22");                                // 戸
        r(b.x + 6, b.y + 17, 8, 6, "#8ab0d0"); r(b.x + b.w - 14, b.y + 17, 8, 6, "#8ab0d0");   // 窓
        if (b.id === "smith") { r(b.x + b.w - 12, b.y - 6, 6, 8, "#3a3a3a"); r(b.x + b.w - 11, b.y - 12, 4, 4, "rgba(200,200,200,0.5)"); }
        if (b.id === "job") { r(b.x + b.w / 2 - 1, b.y - 8, 2, 8, "#f2e6a0"); r(b.x + b.w / 2 - 4, b.y - 5, 8, 2, "#f2e6a0"); }
      }
      // 名前の札
      ctx.font = "bold 7px \"Hiragino Maru Gothic ProN\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      var lx = b.x + b.w / 2, ly = b.id === "gate" ? b.y + b.h + 1 : b.board ? b.y + b.h + 6 : b.y + b.h + 2;
      var tw = ctx.measureText(b.name).width + 6;
      r(lx - tw / 2, ly, tw, 10, lit ? "rgba(242,193,78,0.95)" : "rgba(10,12,18,0.75)");
      ctx.fillStyle = lit ? "#1a1408" : "#ece7da"; ctx.fillText(b.name, lx, ly + 1.5);
    });
  }
  function buildingAt(ev) {
    var rect = townCanvas.getBoundingClientRect();
    var x = (ev.clientX - rect.left) / rect.width * TW, y = (ev.clientY - rect.top) / rect.height * TH;
    for (var i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i];
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 14) return b;
    }
    return null;
  }
  townCanvas.addEventListener("click", function (ev) {
    var b = buildingAt(ev);
    if (!b) return;
    if (b.id === "gate") { WorldMap.open(); return; } // 森の門 → ワールドマップ
    Town.open(b.id);
  });
  document.getElementById("parentBtn").addEventListener("click", function () { Parent.open(); });
  townCanvas.addEventListener("mousemove", function (ev) {
    var b = buildingAt(ev), id = b ? b.id : null;
    townCanvas.style.cursor = b ? "pointer" : "default";
    if (id !== hover) { hover = id; drawTown(); }
  });
  window.addEventListener("resize", function () { if (!baseEl.hidden) drawTown(); });

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

  // trial：知恵の試練の結果 { correct, subjects }。テスト用の出発（trial なし）は、テスト用の正解数を使い、加護はなし
  // 冒険の時間：ふだんは保護者画面で決めた時間、テスト用の出発はテスト用の設定の時間
  // try：試しモード（保護者画面）{ minutes, correct, subjects }。記録にもセーブにも残らない
  function depart(floor, trial, tryOpt) {
    readTestSettings();
    if (trial) Adventure.settings.minutes = GameState.parent().minutes;
    if (tryOpt) { Adventure.settings.minutes = tryOpt.minutes; GameState.beginTry(); }
    baseEl.hidden = true;
    Adventure.start(floor, Adventure.settings.seed ? Number(Adventure.settings.seed) : 0,
      tryOpt ? { correct: tryOpt.correct, subjects: tryOpt.subjects, tryMode: true } :
      trial ? { correct: trial.correct, subjects: trial.subjects } : { correct: Adventure.settings.correct, subjects: [], test: true });
  }

  // 冒険から拠点にもどる
  function returnFrom(result) {
    var report = GameState.applyAdventure(result);
    showBase({ result: result, people: report, note: result.tryMode ? "試しモードだったので、出発する前のセーブにもどした（記録にもセーブにも残らない）。" : "" });
  }

  // もどったときの知らせ
  function showReport(rep) {
    var box = document.getElementById("baseReport"); box.textContent = "";
    var r = rep.result;
    box.appendChild(el("h3", "", r.cleared ? GameData.floorLabel(r.floor) + "をクリアして、" + GameData.PLACES.base + "にもどった" : GameData.PLACES.base + "にもどった"));
    if (rep.note) box.appendChild(el("p", "", rep.note));
    if (!r.tryMode) box.appendChild(el("p", "", "持ち帰ったもの：" + r.gold + "G　鉄 " + r.mat.iron + "　魔石 " + r.mat.stone + "　装備 " + r.items.length + "個" + (r.title ? "　称号「" + r.title + "」" : "")));
    if (rep.people.some(function (p) { return p.lines.some(function (t) { return t.indexOf("レベルが") === 0; }); })) Sound.play("levelup");
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
  document.getElementById("testUnlimited").addEventListener("change", function (e) { GameState.setUnlimited(e.target.checked); });
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

  return { boot: boot, returnFrom: returnFrom, showBase: showBase, depart: depart, el: el };
})();
