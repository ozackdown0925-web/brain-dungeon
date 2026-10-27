// 拠点とキャラクリ（段階5-1）。
// はじめて遊ぶとき：3人の名前・職業・顔を決める。そのあとは拠点の「森の門」からワールドマップへ出て（worldmap.js）、冒険が終わると拠点にもどる。
// 拠点のメニュー（装備・お店・鍛冶屋・転職・スキル・倉庫・図鑑・遊び方）は段階5-2で作る。
// 出発は1日2回、知恵の試練を解いてから（段階6）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Base = (function () {
  var baseEl = document.getElementById("base");
  var createEl = document.getElementById("create");

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
      GameData.floorLabel(a.floor, a.dungeon) + "を冒険している途中です（のこり " + Math.floor(t / 60) + ":" + (t % 60 < 10 ? "0" : "") + (t % 60) + "）。" +
      "その階の入口から続けます。拾った物と経験値はそのまま。開けた宝箱は開いたまま、たおした敵はもどっています。";
    document.getElementById("resumeGo").onclick = function () { el2.hidden = true; Adventure.resume(a); };
    document.getElementById("resumeQuit").onclick = function () {
      Dialog.confirm("冒険をやめて拠点にもどりますか？\n（拾った物と経験値は持ち帰れるけれど、階層は進みません）", function () {
        el2.hidden = true;
        returnFrom(Adventure.resultFromSnapshot(a, "quit"));
      }, null, { yes: "やめて拠点にもどる", no: "もどらない" });
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
      if (bad.length) { document.getElementById("createNote").textContent = "3人とも名前を入れてください"; return; }
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
          Dialog.confirm("いちばん新しいセーブ（" + list[0].label + "：" + list[0].summary + "）にもどしますか？", function () {
            Sync.restore(list[0].id, list[0].label).then(function () { createEl.hidden = true; showBase(null); },
              function (err) { document.getElementById("createNote").textContent = "もどせませんでした（" + err.message + "）"; });
          }, null, { yes: "もどす" });
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
    document.getElementById("sandboxBar").hidden = !GameState.inSandbox();   // 全開放の試しのとちゅうなら、上に知らせる
    // 上の行はゴールドと素材だけ（道具と装備の数は倉庫で見る。称号は書庫。2026-10-18 保護者の案）
    document.getElementById("baseMoney").textContent = (Sync.playerLabel() ? "（" + Sync.playerLabel() + "）" : "") + g.gold + "G　鉱石 " + g.mat.iron + "　魔石 " + g.mat.stone + "　宝玉 " + (g.mat.gem || 0);

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
      info.appendChild(el("div", "hero-stats", "熟練度 " + m + (st < GameState.MAX_STAR ? "（次の★まで " + ((st + 1) * GameState.starNeed(h.job) - m) + "）" : "（極めた！）")));
      info.appendChild(el("div", "hero-stats", "武器：" + (h.equip.weapon ? Loot.describe(h.equip.weapon) : GameData.WEAPONS[GameState.starterWeapon(h.job)].starter) +
        "　防具：" + (h.equip.armor ? Loot.describe(h.equip.armor) : GameData.STARTER_ARMORS[GameData.JOBS[h.job].armor].name)));
      info.appendChild(el("div", "hero-skills", "スキル：" + h.set.map(function (id) { return id ? GameData.SKILL[id].name : "なし"; }).join("・") +
        (h.setsOpen ? "　セットB：" + h.setB.map(function (id) { return id ? GameData.SKILL[id].name : "なし"; }).join("・") : "") +
        "　パッシブ：" + (h.pset || []).map(function (id) { return id ? GameData.SKILL[id].name : "なし"; }).join("・")));
      card.appendChild(info);
      pbox.appendChild(card);
    });

    // 町の名前と絵（建物を押すと開く）。いる地方の町（2026-10-27）
    var R = GameData.regionOf(GameState.region());
    document.getElementById("baseTitle").textContent = R.base;
    document.getElementById("baseHint").textContent = "建物を押すと開く。冒険には「" + R.gate + "」から出発する。";
    drawTown();
    document.getElementById("baseNote").textContent = "";

    // テスト用の設定
    var st2 = Adventure.settings;
    fillSelect("testCorrect", [0, 1, 2, 3, 4], st2.correct, function (n) { return n + "問"; });
    fillSelect("testMinutes", [1, 3, 5, 10], st2.minutes, function (n) { return n + "分"; });
    document.getElementById("testSeed").value = st2.seed;
    fillSelect("testLevel", [1, 5, 10, 20, 50, 100], g.party[0].level, function (n) { return "Lv" + n; });
    fillFloorSelect("testFloor");

    document.getElementById("testUnlimited").checked = GameState.unlimited();
    if (report) { showReport(report); baseEl.scrollTop = 0; } // もどったときの知らせが見えるように、いちばん上から
  }

  // ---------- 町の絵（上から見たエルム村。絵は保護者が Gemini で作ったもの。段階7-2d） ----------
  // 絵は 320×180 の大きさで描いて、画面の幅に合わせて広げる。b は建物の場所（x, y, w, h）。
  var TW = 320, TH = 180;
  // 建物の場所は、町の絵（assets/maps/elm_village.png）に合わせる
  var BUILDINGS = [
    { id: "gate",    name: "森の門（出発）",   x: 136, y: 4,   w: 48, h: 30 },   // 名前は地方の門（drawTown で決める）
    { id: "party",   name: "宿屋",             x: 18,  y: 16,  w: 58, h: 58 },
    { id: "shop",    name: "お店",             x: 18,  y: 100, w: 58, h: 40 },
    { id: "smith",   name: "鍛冶屋",           x: 242, y: 26,  w: 60, h: 48 },
    { id: "job",     name: "転職の神殿",       x: 243, y: 98,  w: 59, h: 45 },
    { id: "storage", name: "倉庫",             x: 82,  y: 138, w: 54, h: 36 },
    { id: "book",    name: "書庫（図鑑）",     x: 184, y: 138, w: 54, h: 36 },
    { id: "help",    name: "掲示板（遊び方）", x: 198, y: 66,  w: 24, h: 20, board: true }
  ];
  // 地方ごとの建物の場所（町の絵に合わせる。書いていない地方は上の BUILDINGS のまま＝エルム村）
  // 鉱山の町ボルダ（2026-10-27）：門＝坑道の入口、宿屋＝赤い屋根の家、お店＝左下の看板の家、鍛冶屋＝炉の家、
  //   転職の神殿＝白い教会、倉庫＝下の長い小屋、書庫＝まんなかの家、掲示板＝右下の看板
  var LAYOUTS = {
    frostcrest: {
      gate:    { x: 148, y: 10,  w: 36, h: 36 },
      party:   { x: 54,  y: 10,  w: 46, h: 58 },
      shop:    { x: 10,  y: 118, w: 40, h: 38 },
      smith:   { x: 222, y: 16,  w: 46, h: 56 },
      job:     { x: 270, y: 62,  w: 42, h: 54 },
      storage: { x: 84,  y: 128, w: 50, h: 40 },
      book:    { x: 112, y: 66,  w: 44, h: 52 },
      help:    { x: 262, y: 130, w: 24, h: 28 }
    }
  };
  BUILDINGS.forEach(function (b) { b.home = { x: b.x, y: b.y, w: b.w, h: b.h }; });   // エルム村の場所を覚えておく
  function placeBuildings(regionId) {
    var L = LAYOUTS[regionId] || {};
    BUILDINGS.forEach(function (b) {
      var p = L[b.id] || b.home;
      b.x = p.x; b.y = p.y; b.w = p.w; b.h = p.h;
    });
  }
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
    // 町の絵（mapart.js。読みこめたら描き直す）
    var R = GameData.regionOf(GameState.region());
    placeBuildings(R.id);
    var art = MapArt.get(R.art.town, drawTown);
    if (art) ctx.drawImage(art, 0, 0, TW, TH); else r(0, 0, TW, TH, "#3b5a2f");
    BUILDINGS[0].name = R.gate + "（出発）";
    BUILDINGS.forEach(function (b) {
      var lit = hover === b.id;
      if (lit) {   // 指している建物を、金色のわくで囲む
        ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 1;
        ctx.strokeRect(b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5);
      }
      // 名前の札
      ctx.font = "bold 7px \"Hiragino Maru Gothic ProN\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      var lx = b.x + b.w / 2, ly = Math.min(TH - 11, b.id === "gate" ? b.y + b.h + 1 : b.board ? b.y + b.h + 2 : b.y + b.h + 2);
      var tw = Furi.width(ctx, b.name) + 6, rh = Furi.has(b.name) ? Furi.rubyHeight(7) : 0;   // ふりがなの分だけ札を上にのばす
      r(lx - tw / 2, ly - rh, tw, 10 + rh, lit ? "rgba(242,193,78,0.95)" : "rgba(10,12,18,0.75)");
      ctx.fillStyle = lit ? "#1a1408" : "#ece7da"; Furi.draw(ctx, b.name, lx, ly + 1.5, 7);
    });
  }
  function buildingAt(ev) {
    var rect = townCanvas.getBoundingClientRect();
    var x = (ev.clientX - rect.left) / rect.width * TW, y = (ev.clientY - rect.top) / rect.height * TH;
    for (var i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i];
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 12) return b;
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
  // 保護者のテスト用：全部のダンジョンの全部の階を1つの選びわくに（値は「ダンジョン:階」。まだ開いていないダンジョンも選べる）
  // 選んでおくのは、新緑の樹海のまだ行っていない階
  function fillFloorSelect(id) {
    var s = document.getElementById(id); s.textContent = "";
    var cur = "forest1:" + Math.min(14, GameState.get().progress.deepest + 1);
    GameData.DUNGEON_ORDER.forEach(function (d) {
      var dd = GameData.dungeonOf(d);
      for (var f = 1; f <= dd.floors; f++) {
        var o = el("option", "", dd.name + " " + GameData.floorName(f, d)); o.value = d + ":" + f;
        if (o.value === cur) o.selected = true;
        s.appendChild(o);
      }
    });
  }
  function readFloorSelect(id) {
    var p = String(document.getElementById(id).value || "forest1:1").split(":");
    return { dungeon: GameData.dungeonOf(p[0]).id, floor: Number(p[1]) || 1 };
  }
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
  // dungeon：どのダンジョンか（省くと新緑の樹海）
  function depart(floor, trial, tryOpt, dungeon) {
    readTestSettings();
    if (trial) Adventure.settings.minutes = GameState.parent().minutes;
    if (tryOpt) { Adventure.settings.minutes = tryOpt.minutes; GameState.beginTry(); }
    baseEl.hidden = true;
    // ダンジョンに入る前にロード画面（Tips）を2秒出す。冒険の時間は、ダンジョンに入ってから数える
    dungeon = dungeon || "forest1";
    Loading.show(GameData.floorLabel(floor, dungeon) + "へ", function () {
      Adventure.start(floor, Adventure.settings.seed ? Number(Adventure.settings.seed) : 0,
        tryOpt ? { correct: tryOpt.correct, subjects: tryOpt.subjects, tryMode: true, dungeon: dungeon } :
        trial ? { correct: trial.correct, subjects: trial.subjects, skipped: !!trial.skipped, dungeon: dungeon } : { correct: Adventure.settings.correct, subjects: [], test: true, dungeon: dungeon });
    }, dungeon);
  }

  // 冒険から拠点にもどる：持ち帰った物と経験値は、ここで先に受け取る（このあと閉じても、もらいそこねない）。
  // そのあと、レベルアップなどを1行ずつ → ロード画面（Tips）→ 拠点（2026-10-18 保護者の案）
  function returnFrom(result) {
    var report = GameState.applyAdventure(result);
    // そのダンジョンの地方の町へ帰る（保護者のテスト用の出発で、ほかの地方のダンジョンに行ったときのため）
    GameState.setRegion(GameData.dungeonOf(result.dungeon).region);
    baseEl.hidden = true; createEl.hidden = true;
    var list = [], lvSound = false;
    (report || []).forEach(function (p) {
      p.lines.forEach(function (t) {
        var lv = /^レベルが (\d+) → (\d+)/.exec(t), sk = /^スキル「(.+)」を覚えた/.exec(t);
        var text = p.raw ? t : lv ? p.name + " は Lv" + lv[2] + " になった！" : sk ? p.name + " は「" + sk[1] + "」を覚えた！" :
          t.charAt(0) === "＠" ? p.name + " は" + t.slice(1) : p.name + " の" + t;
        list.push({ text: text, sound: lv && !lvSound ? "levelup" : "" });
        if (lv) lvSound = true;
      });
    });
    Loading.lines(list, "", function () {
      Loading.show(GameState.baseName() + "へ帰る", function () {
        showBase(null);
        if (result.tryMode) document.getElementById("baseNote").textContent = "試しモードだったので、出発する前のセーブにもどした（記録にもセーブにも残らない）。";
      });
    });
  }

  // もどったときの知らせ
  function showReport(rep) {
    var box = document.getElementById("baseReport"); box.textContent = "";
    var r = rep.result;
    box.appendChild(el("h3", "", r.cleared ? GameData.floorLabel(r.floor, r.dungeon) + "をクリアして、" + GameState.baseName() + "にもどった" : GameState.baseName() + "にもどった"));
    if (rep.note) box.appendChild(el("p", "", rep.note));
    if (!r.tryMode) box.appendChild(el("p", "", "持ち帰ったもの：" + r.gold + "G　鉱石 " + r.mat.iron + "　魔石 " + r.mat.stone + (r.mat.gem ? "　宝玉 " + r.mat.gem : "") + "　装備 " + r.items.length + "個" + (r.title ? "　称号「" + r.title + "」" : "")));
    if (rep.people.some(function (p) { return p.lines.some(function (t) { return t.indexOf("レベルが") === 0; }); })) Sound.play("levelup");
    rep.people.forEach(function (p) {
      var d = el("div", "rep-person");
      d.appendChild(el("b", "", p.name + "（経験値 +" + p.exp + "）"));
      p.lines.forEach(function (t) { d.appendChild(el("div", "rep-line", t.charAt(0) === "＠" ? t.slice(1) : t)); });
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
    document.getElementById("parentNote").textContent = "テスト用：3人のレベルを変えました";   // 保護者画面のまま
  });
  // テスト用の設定は保護者画面の中にある（2026-10-18 に拠点の下から移した）
  document.getElementById("testGo").addEventListener("click", function () {
    document.getElementById("parentScreen").hidden = true;
    var tf = readFloorSelect("testFloor");
    depart(tf.floor, null, null, tf.dungeon);
  });
  document.getElementById("testWipe").addEventListener("click", function () {
    Dialog.confirm("3人のデータを消して、キャラクリからやり直します。よいですか？", function () {
      GameState.wipe();
      document.getElementById("parentScreen").hidden = true;
      showCreate();
    }, null, { yes: "消してやり直す", danger: true });
  });

  return { boot: boot, returnFrom: returnFrom, showBase: showBase, depart: depart, el: el, fillFloorSelect: fillFloorSelect, readFloorSelect: readFloorSelect };
})();
