// ワールドマップ（段階5-2②）：地方の地図の上に、拠点とダンジョンが点在する（ロマサガ2の地図のイメージ。保護者の案）。
// 流れ：拠点 →（森の門）→ ワールドマップ → ダンジョンを選ぶ → 何階に挑むか → 知恵の試練（trial.js）→ ダンジョン。
// 終わったら（クリア・時間切れ・全滅・メニューでやめる）、いつも拠点にもどる。
// 地図の絵は、保護者が Gemini で作ったもの（assets/maps/forestveil.png、2026-10-18）。地方はこれから増える。
// 部屋の当たり判定の World（world.js）とは別もの：こちらは WorldMap。
var WorldMap = (function () {
  var el = document.getElementById("worldScreen");
  var cv = document.getElementById("worldMap");
  var dlg = document.getElementById("worldDialog");
  var trialEl = document.getElementById("trialScreen");
  var MW = 320, MH = 180;

  // 地方：フォレストヴェール（2026-10-18 決定）。拠点（エルム村）1つとダンジョン。まだ行けない場所は「？？？」
  // ダンジョンの階の数・ボス・開く条件は GameData.DUNGEONS。前のダンジョンの主をたおすと次が開く（2026-10-21 保護者と決定）
  var REGION = {
    name: GameData.PLACES.region,
    spots: [
      { id: "base", kind: "base", name: GameData.PLACES.base, x: 61, y: 124 },
      // 新緑の樹海は右下の森（2026-10-18 保護者が決定）
      { id: "forest1", kind: "dungeon", x: 283, y: 122,
        note: "若葉のしげる深い樹海。ゴブリンの部隊と、つる草の魔物がすむ。7階に大オオカミ、14階に森の主がいる。" },
      // 瘴気の森は左上の沼。樹海の主をたおすと開く
      { id: "shouki", kind: "dungeon", x: 94, y: 60,
        note: "毒の沼が広がる、暗い森。5階と10階に、強い魔物がいる。" },
      { id: "locked1", kind: "dungeon", locked: true, x: 200, y: 76 }    // 原生の秘境（まんなかの大木の森）。まだ作っていない
    ]
  };
  // 開いているか（作っていない場所はいつも閉じている）と、地図に出す名前
  function isOpen(s) { return s.kind === "base" || (!s.locked && GameState.unlocked(s.id)); }
  function nameOf(s) { return s.kind === "base" ? s.name : isOpen(s) ? GameData.dungeonOf(s.id).name : "？？？"; }
  function floorsOf(s) { return GameData.dungeonOf(s.id).floors; }
  var hover = null;

  function open() {
    Sound.bgm("world");
    el.hidden = false; dlg.hidden = true;
    document.getElementById("base").hidden = true;
    document.getElementById("worldTitle").textContent = REGION.name;
    draw();
  }
  function close() { el.hidden = true; Base.showBase(null); }
  document.getElementById("worldBack").addEventListener("click", close);

  // ---------- 地図の絵 ----------
  function draw() {
    var dpr = window.devicePixelRatio || 1;
    var cssW = Math.min(el.querySelector(".panel").clientWidth - 40 || 600, 760, Math.max(280, (window.innerHeight - 120) * MW / MH));
    var cssH = Math.round(cssW * MH / MW);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var ctx = cv.getContext("2d");
    ctx.setTransform(cv.width / MW, 0, 0, cv.height / MH, 0, 0);
    ctx.imageSmoothingEnabled = false;
    function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    function circle(x, y, rad, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); }
    // 地図の絵（mapart.js。読みこめたら描き直す）
    var art = MapArt.get("world", draw);
    if (art) ctx.drawImage(art, 0, 0, MW, MH); else r(0, 0, MW, MH, "#6a9a4a");
    // 場所の印
    REGION.spots.forEach(function (s) {
      var lit = hover === s.id;
      // 印：絵の上に、場所がわかる小さな印（村は絵に描いてあるので、指したときだけ光る輪）
      ctx.lineWidth = 1.5;
      if (s.kind === "base") {
        if (lit) { ctx.strokeStyle = "#f2c14e"; ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.stroke(); }
      } else if (isOpen(s)) {
        ctx.strokeStyle = lit ? "#f2c14e" : "#ffe066"; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.stroke();
        circle(s.x, s.y, 3, lit ? "#f2c14e" : "#ffe066"); r(s.x - 1, s.y - 16, 2, 6, "#ffe066");
      } else {
        circle(s.x, s.y, 8, "rgba(20,20,30,0.7)");
        ctx.fillStyle = "#a3a8bd"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", s.x, s.y + 0.5);
      }
      ctx.font = "bold 8px \"Hiragino Maru Gothic ProN\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      var open = isOpen(s);
      var label = s.kind === "dungeon" && open ? nameOf(s) + "（" + reached(s) + "/" + floorsOf(s) + "階）" : nameOf(s);
      var tw = Furi.width(ctx, label) + 6, ly = s.y + 12, rh = Furi.has(label) ? Furi.rubyHeight(8) : 0;   // ふりがなの分だけ札を上にのばす
      var lx = Math.max(tw / 2 + 2, Math.min(MW - tw / 2 - 2, s.x));   // 名前の札が地図からはみ出さないように
      r(lx - tw / 2, ly - rh, tw, 11 + rh, lit ? "rgba(242,193,78,0.95)" : "rgba(10,12,18,0.78)");
      ctx.fillStyle = lit ? "#1a1408" : !open ? "#a3a8bd" : "#ece7da"; Furi.draw(ctx, label, lx, ly + 1.5, 8);
    });
  }
  function reached(s) { return GameState.progressOf(s.id).deepest; }

  function spotAt(ev) {
    var rect = cv.getBoundingClientRect();
    var x = (ev.clientX - rect.left) / rect.width * MW, y = (ev.clientY - rect.top) / rect.height * MH;
    for (var i = 0; i < REGION.spots.length; i++) {
      var s = REGION.spots[i];
      if (Math.abs(x - s.x) <= 22 && y >= s.y - 16 && y <= s.y + 24) return s;
    }
    return null;
  }
  cv.addEventListener("click", function (ev) {
    var s = spotAt(ev);
    if (!s) return;
    if (s.kind === "base") { close(); return; }
    if (!isOpen(s)) { showNote("まだ行けない場所。先のダンジョンの主をたおすと、道が開けるかも…？"); return; }
    // 休みの日と、1日に出発できる回数（保護者画面で決める。テスト用の設定で外せる）
    if (!GameState.unlimited() && !GameState.inSandbox()) {
      if (GameState.restToday()) { toRestTrial(); return; } // 休みの日：知恵の試練だけ
      if (GameState.adventuredToday()) { showNote("今日の冒険は終了しました。また明日！"); return; }
    }
    showFloors(s);
  });
  cv.addEventListener("mousemove", function (ev) {
    var s = spotAt(ev), id = s ? s.id : null;
    cv.style.cursor = s ? "pointer" : "default";
    if (id !== hover) { hover = id; draw(); }
  });
  window.addEventListener("resize", function () { if (!el.hidden) draw(); });

  function showNote(t) { document.getElementById("worldNote").textContent = t; }

  // ---------- 何階に挑むか ----------
  function showFloors(s) {
    showNote("");
    var floors = floorsOf(s), deepest = reached(s), next = Math.min(floors, deepest + 1);
    document.getElementById("dlgTitle").textContent = nameOf(s);
    document.getElementById("dlgNote").textContent = s.note;
    var go = document.getElementById("dlgNext");
    go.textContent = deepest >= floors ? "主をたおした！ 好きな階を選ぼう" : next + "階に挑む" + (GameData.isBossFloor(s.id, next) ? "（ボス）" : "");
    go.disabled = deepest >= floors;
    go.onclick = function () { toTrial(s.id, next); };
    var sel = document.getElementById("dlgFloor"); sel.textContent = "";
    for (var f = 1; f <= Math.max(1, deepest); f++) {
      var o = document.createElement("option"); o.value = f; o.textContent = GameData.floorName(f, s.id); if (f === deepest) o.selected = true; sel.appendChild(o);
    }
    document.getElementById("dlgAgain").disabled = deepest < 1;
    document.getElementById("dlgAgain").onclick = function () { toTrial(s.id, Number(sel.value) || 1); };
    document.getElementById("dlgCancel").onclick = function () { dlg.hidden = true; };
    dlg.hidden = false;
  }

  // ---------- 知恵の試練（段階6-1）----------
  function toTrial(dungeon, floor) {
    dlg.hidden = true;
    el.hidden = true;
    // 全開放の試し：知恵の試練はなし（4問正解・4教科の加護あり）。もどると出発する前にもどり、記録にもセーブにも残らない
    if (GameState.inSandbox()) { Base.depart(floor, null, { minutes: 10, correct: 4, subjects: ["math", "japanese", "science", "social"] }, dungeon); return; }
    // 出発ごとに新しい4問（1日に出発できる回数まで。テスト用に回数の制限をはずしたときは、最後の回をくり返す）
    var round = Math.min(GameState.adventuresToday() + 1, GameState.perDayToday());   // 土日は4回まで（2026-10-25）
    Trial.open(floor, function (res) { Base.depart(floor, res, null, dungeon); }, { round: round, dungeon: dungeon });
  }

  // 休みの日（保護者画面で決める）：ダンジョンは閉じていて、知恵の試練だけ解ける（段階6-2）
  function toRestTrial() {
    dlg.hidden = true;
    el.hidden = true;
    Trial.open(0, function (res) {
      GameState.logRest(res);
      Base.showBase(null);
      document.getElementById("baseNote").textContent = "今日はお休みの日。知恵の試練、おつかれさま！ ダンジョンはまた明日。";
    }, { rest: true });
  }

  return { open: open, close: close };
})();
