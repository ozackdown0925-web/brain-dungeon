// 保護者画面（段階6-2）：拠点の「保護者」から、4けたの暗証番号で入る。
// できること：冒険の時間・1日に出発できる回数、休みの日、遊んだ記録、セーブの復元、試しモード。
// 決まりはセーブ（GameState.get().parent）に入る。暗証番号は iPad の中（localStorage）にだけ覚える。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Parent = (function () {
  var PIN_KEY = "bd-parent-pin";
  var screen = document.getElementById("parentScreen");
  var pinBox = document.getElementById("parentPin");
  var body = document.getElementById("parentBody");
  var input1 = document.getElementById("parentPinInput");
  var input2 = document.getElementById("parentPinInput2");
  var mode = "enter"; // enter：入れる／set：決める（2回入れる）
  var WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  var SUBJECTS = [
    { id: "math", name: "算数" }, { id: "japanese", name: "国語" }, { id: "science", name: "理科" }, { id: "social", name: "社会" }
  ];
  var KIND = { clear: "クリア", timeout: "時間切れ", wipe: "3人ともたおれた", quit: "やめた" };
  var FLOORS = 14;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function getPin() { try { return localStorage.getItem(PIN_KEY) || ""; } catch (e) { return ""; } }
  function setPin(p) { try { if (p) localStorage.setItem(PIN_KEY, p); else localStorage.removeItem(PIN_KEY); } catch (e) { /* そのまま */ } }
  function fillSelect(id, values, cur, label) {
    var s = document.getElementById(id); s.textContent = "";
    values.forEach(function (v) { var o = el("option", "", label(v)); o.value = v; if (v === cur) o.selected = true; s.appendChild(o); });
  }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  // ---------- 開く・閉じる ----------
  function open() {
    ["base", "worldScreen", "town", "trialScreen"].forEach(function (id) { var e = document.getElementById(id); if (e) e.hidden = true; });
    screen.hidden = false;
    body.hidden = true;
    showPin(getPin() ? "enter" : "set");
    window.scrollTo(0, 0);
  }
  function close() {
    screen.hidden = true;
    Base.showBase(null);
  }
  document.getElementById("parentBack").addEventListener("click", close);

  // ---------- 暗証番号 ----------
  function showPin(m) {
    mode = m;
    pinBox.hidden = false;
    input1.value = ""; input2.value = "";
    input2.hidden = mode !== "set";
    document.getElementById("parentPinLead").textContent = mode === "set" ?
      "保護者の暗証番号（4けたの数字）を決めてください。同じ番号を2回入れます。" : "暗証番号（4けた）を入れてください。";
    document.getElementById("parentPinMsg").textContent = "";
    try { input1.focus(); } catch (e) { /* そのまま */ }
  }
  function pinGo() {
    var a = input1.value, msg = document.getElementById("parentPinMsg");
    if (!/^[0-9]{4}$/.test(a)) { msg.textContent = "4けたの数字を入れてね"; return; }
    if (mode === "set") {
      if (a !== input2.value) { msg.textContent = "2回の番号がちがいます"; return; }
      setPin(a);
      unlocked("暗証番号を決めました");
      return;
    }
    if (a !== getPin()) { msg.textContent = "番号がちがいます"; input1.value = ""; return; }
    unlocked("");
  }
  document.getElementById("parentPinGo").addEventListener("click", pinGo);
  [input1, input2].forEach(function (inp) {
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") pinGo(); });
  });
  document.getElementById("parentPinChange").addEventListener("click", function () { body.hidden = true; showPin("set"); });
  // キャラクリの画面のセーブの復元など、ほかの画面から確かめる（暗証番号を決めていなければ、そのまま通す）
  function checkPin() {
    var p = getPin();
    if (!p) return true;
    var a = window.prompt("保護者の暗証番号（4けた）");
    if (a === null) return false;
    if (a !== p) { window.alert("番号がちがいます"); return false; }
    return true;
  }
  document.getElementById("testPinReset").addEventListener("click", function () {
    if (!window.confirm("保護者の暗証番号を消します。次に保護者画面を開いたときに、新しく決めます。よいですか？")) return;
    setPin("");
    document.getElementById("baseNote").textContent = "保護者の暗証番号を消しました";
  });

  function unlocked(note) {
    pinBox.hidden = true;
    body.hidden = false;
    render(note);
  }

  // ---------- 中身 ----------
  function render(note) {
    document.getElementById("parentNote").textContent = note || "";
    var g = GameState.get();
    if (!g) return;
    var p = GameState.parent();

    // 冒険の決まり
    fillSelect("parentMinutes", [3, 5, 7, 10, 15], p.minutes, function (n) { return n + "分"; });
    fillSelect("parentPerDay", [1, 2, 3], p.perDay, function (n) { return n + "回"; });
    document.getElementById("parentToday").textContent = "今日の出発：" + GameState.adventuresToday() + " / " + p.perDay + " 回" +
      (GameState.restToday() ? "　（今日は休みの日）" : "") +
      (GameState.unlimited() ? "　※この端末は、テスト用の設定で回数の制限をはずしている" : "");

    // 休みの日
    var week = document.getElementById("parentWeek"); week.textContent = "";
    WEEK.forEach(function (w, i) {
      var lb = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = p.restWeek.indexOf(i) >= 0;
      cb.addEventListener("change", function () {
        var list = GameState.parent().restWeek.filter(function (x) { return x !== i; });
        if (cb.checked) list.push(i);
        GameState.setParent({ restWeek: list }); render("休みの曜日を変えました");
      });
      lb.appendChild(cb); lb.appendChild(document.createTextNode(w + "曜"));
      week.appendChild(lb);
    });
    // 過ぎた日は消す
    var today = GameState.todayStr();
    var dates = p.restDates.filter(function (d) { return d >= today; });
    if (dates.length !== p.restDates.length) GameState.setParent({ restDates: dates });
    var dbox = document.getElementById("parentDates"); dbox.textContent = "";
    dates.forEach(function (d) {
      var row = el("div", "item-line");
      row.appendChild(el("span", "item-name", dateLabel(d)));
      var b = el("button", "btn small-btn", "消す"); b.type = "button";
      b.onclick = function () { GameState.setParent({ restDates: GameState.parent().restDates.filter(function (x) { return x !== d; }) }); render("休みの日を消しました"); };
      row.appendChild(b);
      dbox.appendChild(row);
    });
    if (!document.getElementById("parentDate").value) document.getElementById("parentDate").value = today;

    renderLog();
    renderHistory();

    // 試しモード
    fillSelect("tryFloor", range(1, FLOORS), Math.min(FLOORS, g.progress.deepest + 1), function (n) { return n + "階" + (n === 7 || n === 14 ? "（ボス）" : ""); });
    fillSelect("tryCorrect", [0, 1, 2, 3, 4], 4, function (n) { return n + "問"; });
    fillSelect("tryMinutes", [5, 10, 30, 60], 10, function (n) { return n + "分"; });
  }
  function dateLabel(d) {
    var p = d.split("-"), dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number(p[1]) + "/" + Number(p[2]) + "（" + WEEK[dt.getDay()] + "）";
  }

  document.getElementById("parentMinutes").addEventListener("change", function (e) {
    GameState.setParent({ minutes: Number(e.target.value) || 5 }); render("冒険の時間を変えました（次の出発から）");
  });
  document.getElementById("parentPerDay").addEventListener("change", function (e) {
    GameState.setParent({ perDay: Number(e.target.value) || 2 }); render("1日に出発できる回数を変えました");
  });
  document.getElementById("parentDateAdd").addEventListener("click", function () {
    var v = document.getElementById("parentDate").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (v < GameState.todayStr()) { document.getElementById("parentNote").textContent = "過ぎた日は足せません"; return; }
    var list = GameState.parent().restDates.slice();
    if (list.indexOf(v) < 0) list.push(v);
    GameState.setParent({ restDates: list }); render(dateLabel(v) + "を休みの日にしました");
  });

  // 遊んだ記録：日ごとに、知恵の試練の結果と、出発した回
  function renderLog() {
    var box = document.getElementById("parentLog"); box.textContent = "";
    var list = GameState.log();
    if (!list.length) { box.appendChild(el("p", "note", "まだ記録がない（試しモードとテスト用の出発は記録しない）")); return; }
    var days = [], byDay = {};
    list.forEach(function (r) {
      if (!byDay[r.date]) { byDay[r.date] = []; days.push(r.date); }
      byDay[r.date].push(r);
    });
    days.slice(0, 30).forEach(function (d) {
      var trips = byDay[d].slice().reverse(); // 朝 → 夜の順
      var div = el("div", "log-day");
      var head = el("div");
      head.appendChild(el("b", "", dateLabel(d)));
      var t = trips[trips.length - 1]; // その日の知恵の試練（どの回も同じ）
      head.appendChild(document.createTextNode("知恵の試練 正解 " + t.correct + " / 4　"));
      SUBJECTS.forEach(function (s) {
        var ok = t.subjects.indexOf(s.id) >= 0;
        head.appendChild(el("span", ok ? "ok" : "ng", s.name + (ok ? "○" : "×") + " "));
      });
      div.appendChild(head);
      var n = 0;
      trips.forEach(function (r) {
        if (r.kind !== "rest") n++;
        var at = new Date(r.at);
        var hm = at.getHours() + ":" + ("0" + at.getMinutes()).slice(-2);
        div.appendChild(el("div", "log-line", r.kind === "rest" ? "休みの日（知恵の試練だけ）　" + hm :
          n + "回目　" + hm + "　森の " + r.floor + " 階　" + (KIND[r.kind] || r.kind)));
      });
      box.appendChild(div);
    });
  }

  // セーブの復元（最近の10回分）
  function renderHistory() {
    var box = document.getElementById("historyList"); box.textContent = "";
    var list = GameState.history();
    if (!list.length) { box.appendChild(el("p", "note", "まだ控えがない")); return; }
    list.forEach(function (h) {
      var row = el("div", "item-line");
      var d = new Date(h.at);
      row.appendChild(el("span", "item-name", (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2) + "　" + h.label));
      row.appendChild(el("span", "item-extra", h.summary));
      var b = el("button", "btn small-btn", "このセーブにもどす"); b.type = "button";
      b.onclick = function () {
        if (!window.confirm("この時のセーブにもどします。今のセーブは、一覧に残っている時点までもどります。よいですか？")) return;
        if (GameState.restore(h.index)) render("セーブを復元した");
      };
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  // 試しモードで出発
  document.getElementById("tryGo").addEventListener("click", function () {
    var floor = Number(document.getElementById("tryFloor").value) || 1;
    var correct = Number(document.getElementById("tryCorrect").value) || 0;
    var minutes = Number(document.getElementById("tryMinutes").value) || 10;
    screen.hidden = true;
    Base.depart(floor, null, {
      minutes: minutes, correct: correct,
      subjects: SUBJECTS.slice(0, correct).map(function (s) { return s.id; })
    });
  });

  return { open: open, close: close, checkPin: checkPin };
})();
