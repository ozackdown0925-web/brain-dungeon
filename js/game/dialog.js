// ゲームの中の確認の画面（2026-10-19）。
// iPad の Safari は、ブラウザの確認の窓（window.confirm・alert・prompt）が出ているあいだ、ゲームの音を止めてしまうので、
// 同じことをゲームの画面の上に重ねて出す。押したボタンで、あとの処理を呼ぶ（その場では止まらない）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Dialog = (function () {
  var box = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function open(build) {
    close();
    box = el("div", "dlg-screen");
    var panel = el("div", "dlg-panel");
    box.appendChild(panel);
    build(panel);
    document.body.appendChild(box);
    var first = panel.querySelector("input, .dlg-yes");
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* そのまま */ } }, 30);
  }
  function close() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }
  function lines(panel, text) {
    String(text).split("\n").forEach(function (t) { panel.appendChild(el("p", "dlg-text", t)); });
  }
  function button(row, label, cls, fn) {
    var b = el("button", "btn " + cls, label); b.type = "button";
    b.addEventListener("click", function () { close(); if (fn) fn(); });
    row.appendChild(b);
    return b;
  }

  // 確認：「はい」なら yes()、「いいえ」なら no()。opts：{ yes: ボタンの文字, no: ボタンの文字, danger: 赤いボタン }
  function confirm(text, yes, no, opts) {
    opts = opts || {};
    open(function (panel) {
      lines(panel, text);
      var row = el("div", "dlg-row");
      button(row, opts.no || "やめる", "dlg-no", no);
      button(row, opts.yes || "はい", "dlg-yes" + (opts.danger ? " danger" : ""), yes);
      panel.appendChild(row);
    });
  }
  // お知らせ：OK で ok()
  function alert(text, ok) {
    open(function (panel) {
      lines(panel, text);
      var row = el("div", "dlg-row");
      button(row, "OK", "dlg-yes", ok);
      panel.appendChild(row);
    });
  }
  // 文字を入れる：OK なら ok(入れた文字)、やめたら cancel()。opts：{ password, numeric, maxLength }
  function prompt(text, ok, cancel, opts) {
    opts = opts || {};
    open(function (panel) {
      lines(panel, text);
      var inp = el("input", "dlg-input");
      inp.type = opts.password ? "password" : "text";
      if (opts.numeric) { inp.inputMode = "numeric"; inp.setAttribute("pattern", "[0-9]*"); }
      if (opts.maxLength) inp.maxLength = opts.maxLength;
      inp.autocomplete = "off";
      panel.appendChild(inp);
      var row = el("div", "dlg-row");
      button(row, "やめる", "dlg-no", cancel);
      var go = button(row, "OK", "dlg-yes", null);
      go.onclick = null;
      go.addEventListener("click", function () { var v = inp.value; close(); ok(v); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = inp.value; close(); ok(v); } });
      panel.appendChild(row);
    });
  }

  return { confirm: confirm, alert: alert, prompt: prompt, close: close };
})();
