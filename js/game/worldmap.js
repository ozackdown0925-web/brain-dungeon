// ワールドマップ（段階5-2②）：地方の地図の上に、拠点とダンジョンが点在する（ロマサガ2の地図のイメージ。保護者の案）。
// 流れ：拠点 →（森の門）→ ワールドマップ → ダンジョンを選ぶ → 何階に挑むか → 知恵の試練（trial.js）→ ダンジョン。
// 終わったら（クリア・時間切れ・全滅・メニューでやめる）、いつも拠点にもどる。
// 地図の絵は仮（段階7で差しかえ）。地方はこれから増える（森の地方が最初）。
// 部屋の当たり判定の World（world.js）とは別もの：こちらは WorldMap。
var WorldMap = (function () {
  var el = document.getElementById("worldScreen");
  var cv = document.getElementById("worldMap");
  var dlg = document.getElementById("worldDialog");
  var trialEl = document.getElementById("trialScreen");
  var MW = 320, MH = 180, FLOORS = 14;

  // 地方：森の地方。拠点1つとダンジョン。まだ行けない場所は「？？？」
  var REGION = {
    name: "森の地方",
    spots: [
      { id: "base", kind: "base", name: "森の拠点", x: 92, y: 112 },
      { id: "forest1", kind: "dungeon", name: "深い森", floors: FLOORS, x: 208, y: 58, open: true,
        note: "ゴブリンの部隊と、つる草の魔物がすむ森。7階に大オオカミ、14階に森の主がいる。" },
      { id: "locked1", kind: "dungeon", name: "？？？", x: 262, y: 128, open: false },
      { id: "locked2", kind: "dungeon", name: "？？？", x: 44, y: 40, open: false }
    ]
  };
  var hover = null;

  function open() {
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
    // 草原・森・山・川・湖
    r(0, 0, MW, MH, "#6a9a4a");
    for (var i = 0; i < 70; i++) { var fx = 150 + (i * 29) % 160, fy = 10 + (i * 17) % 90; circle(fx, fy, 6, i % 2 ? "#2f6a2a" : "#3a7a32"); }   // 森
    for (var j = 0; j < 12; j++) { var mx = 10 + j * 14, my = 8 + (j % 3) * 6; ctx.fillStyle = "#8a8070"; ctx.beginPath(); ctx.moveTo(mx, my + 18); ctx.lineTo(mx + 9, my); ctx.lineTo(mx + 18, my + 18); ctx.fill(); ctx.fillStyle = "#e8e8f0"; ctx.beginPath(); ctx.moveTo(mx + 6, my + 6); ctx.lineTo(mx + 9, my); ctx.lineTo(mx + 12, my + 6); ctx.fill(); } // 山
    ctx.strokeStyle = "#4a8ac0"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 150); ctx.bezierCurveTo(80, 140, 120, 175, 200, 160); ctx.bezierCurveTo(240, 150, 270, 160, 320, 150); ctx.stroke(); // 川
    circle(262, 140, 18, "#4a8ac0"); circle(256, 136, 10, "#6aaae0");                                      // 湖
    // 道
    ctx.strokeStyle = "#c8b080"; ctx.lineWidth = 3; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(92, 112); ctx.quadraticCurveTo(150, 100, 208, 58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(92, 112); ctx.quadraticCurveTo(180, 130, 262, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(92, 112); ctx.quadraticCurveTo(60, 80, 44, 40); ctx.stroke();
    ctx.setLineDash([]);
    // 場所の印
    REGION.spots.forEach(function (s) {
      var lit = hover === s.id;
      if (s.kind === "base") {
        r(s.x - 10, s.y - 6, 20, 12, "#d8c8a8"); r(s.x - 12, s.y - 12, 24, 7, lit ? "#f2c14e" : "#b0473a"); r(s.x - 2, s.y, 4, 6, "#5a3d22");
      } else if (s.open) {
        circle(s.x, s.y, 10, lit ? "#f2c14e" : "#1a3a18"); circle(s.x, s.y, 7, "#0b0d13"); r(s.x - 1, s.y - 14, 2, 6, "#ffe066");
      } else {
        circle(s.x, s.y, 9, "rgba(20,20,30,0.75)");
      }
      ctx.font = "bold 8px \"Hiragino Maru Gothic ProN\", \"Hiragino Sans\", \"Yu Gothic\", sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      var label = s.kind === "dungeon" && s.open ? s.name + "（" + reached() + "/" + s.floors + "階）" : s.name;
      var tw = ctx.measureText(label).width + 6, ly = s.y + 12;
      r(s.x - tw / 2, ly, tw, 11, lit ? "rgba(242,193,78,0.95)" : "rgba(10,12,18,0.78)");
      ctx.fillStyle = lit ? "#1a1408" : s.open === false ? "#a3a8bd" : "#ece7da"; ctx.fillText(label, s.x, ly + 1.5);
    });
  }
  function reached() { return GameState.get().progress.deepest; }

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
    if (!s.open) { showNote("まだ行けない場所。森の主をたおすと、道が開けるかも…？"); return; }
    // 休みの日と、1日に出発できる回数（保護者画面で決める。テスト用の設定で外せる）
    if (!GameState.unlimited()) {
      if (GameState.restToday()) { toRestTrial(); return; } // 休みの日：知恵の試練だけ
      if (GameState.adventuredToday()) { showNote("今日の冒険は、もう終わったよ。また明日！"); return; }
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
    var deepest = reached(), next = Math.min(s.floors, deepest + 1);
    document.getElementById("dlgTitle").textContent = s.name;
    document.getElementById("dlgNote").textContent = s.note;
    var go = document.getElementById("dlgNext");
    go.textContent = deepest >= s.floors ? "森の主をたおした！ 好きな階を選ぼう" : next + "階に挑む" + (next === 7 || next === 14 ? "（ボス）" : "");
    go.disabled = deepest >= s.floors;
    go.onclick = function () { toTrial(next); };
    var sel = document.getElementById("dlgFloor"); sel.textContent = "";
    for (var f = 1; f <= Math.max(1, deepest); f++) {
      var o = document.createElement("option"); o.value = f; o.textContent = f + "階" + (f === 7 || f === 14 ? "（ボス）" : ""); if (f === deepest) o.selected = true; sel.appendChild(o);
    }
    document.getElementById("dlgAgain").disabled = deepest < 1;
    document.getElementById("dlgAgain").onclick = function () { toTrial(Number(sel.value) || 1); };
    document.getElementById("dlgCancel").onclick = function () { dlg.hidden = true; };
    dlg.hidden = false;
  }

  // ---------- 知恵の試練（段階6-1）----------
  function toTrial(floor) {
    dlg.hidden = true;
    el.hidden = true;
    // 出発ごとに新しい4問（1日に出発できる回数まで。テスト用に回数の制限をはずしたときは、最後の回をくり返す）
    var round = Math.min(GameState.adventuresToday() + 1, GameState.parent().perDay);
    Trial.open(floor, function (res) { Base.depart(floor, res); }, { round: round });
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
