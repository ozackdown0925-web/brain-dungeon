// GAS につなぐ（段階G-2）：つなぎ先（URL と鍵）、セーブの読み書き、冒険の記録、インターネットにつながらないときの画面。
// ・つなぎ先は、はじめて開いたときに入れる（iPad の中（localStorage）に覚える。URL も鍵もコードには書かない）。
// ・セーブは iPad の中にこまめに置き、区切り（冒険に出る・拠点にもどる・セーブの復元・保護者画面の決まりを変える）で GAS に送る。
// ・インターネットにつながらないときは遊べない（「もう一度」で送り直す）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。
var Sync = (function () {
  var URL_KEY = "bd-gas-url";
  var META_KEY = "bd-sync";              // { player, rev（GAS にあるセーブの版）, dirty（まだ送っていない変更がある） }
  var LOG_KEY = "bd-adv-pending";        // まだ送れていない冒険の記録
  var PLAYER_NAME = { child: "", parent: "保護者" };

  function $(id) { return document.getElementById(id); }
  function readJSON(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* そのまま */ } }

  // ---------- つなぎ先 ----------
  function url() { try { return localStorage.getItem(URL_KEY) || ""; } catch (e) { return ""; } }
  function key() { return BDApi.getKey("player"); }
  function connected() { return !!(url() && key()); }
  function meta() { var m = readJSON(META_KEY, null); return m && typeof m === "object" ? m : { player: "", rev: 0, dirty: false }; }
  function setMeta(m) { writeJSON(META_KEY, m); }
  function player() { return meta().player || ""; }
  function playerLabel() { return PLAYER_NAME[player()] || ""; }
  // GameState.save() のたびに呼ぶ：まだ GAS に送っていない変更がある
  function markDirty() { var m = meta(); if (!m.dirty) { m.dirty = true; setMeta(m); } }

  // つなぎ先の画面（はじめて開いたとき・鍵が変わったとき・保護者画面から入れ直すとき）
  function showConnect(msg, then) {
    hideAll();
    var box = $("connectScreen");
    $("connectUrl").value = url();
    $("connectKey").value = "";
    $("connectMsg").textContent = msg || "";
    box.hidden = false;
    $("connectGo").onclick = function () {
      var u = String($("connectUrl").value || "").replace(/\s+/g, ""), k = String($("connectKey").value || "").replace(/\s+/g, "");
      if (!/^https?:\/\/\S+$/.test(u)) { $("connectMsg").textContent = "URL は https:// ではじまる長い文字です（…/exec で終わる）"; return; }
      if (!k) { $("connectMsg").textContent = "プレイヤー用の鍵を入れてください"; return; }
      $("connectMsg").textContent = "つないでいます…";
      $("connectGo").disabled = true;
      var oldUrl = url();
      try { localStorage.setItem(URL_KEY, u); } catch (e) { /* そのまま */ }
      BDApi.call("check", {}, k).then(function (r) {
        $("connectGo").disabled = false;
        if (r.role !== "player") { $("connectMsg").textContent = "これはプレイヤー用の鍵ではありません（管理用の鍵は使わない）"; return; }
        BDApi.setKey("player", k);
        var m = meta();
        if (m.player !== r.player) {
          // はじめてつないだ・別のプレイヤーに変えた：この iPad のゲームのデータは捨てて、GAS のセーブを使う（2026-10-17 決定）
          GameState.wipeLocal();
          writeJSON(LOG_KEY, []);
          m = { player: r.player, rev: 0, dirty: false };
          setMeta(m);
        }
        box.hidden = true;
        then();
      }, function (err) {
        $("connectGo").disabled = false;
        try { if (oldUrl) localStorage.setItem(URL_KEY, oldUrl); else localStorage.removeItem(URL_KEY); } catch (e) { /* そのまま */ }
        $("connectMsg").textContent = err.kind === "forbidden" ? "鍵がちがいます。もう一度たしかめてください。" :
          err.kind === "network" ? "つながりませんでした。URL とインターネットをたしかめてください。" : "つながりませんでした（" + err.message + "）";
      });
    };
  }
  function reconnect(msg) { showConnect(msg || "", function () { Base.boot(); }); }

  // ---------- インターネットにつながらないとき ----------
  // retry：「もう一度」を押したときにやること
  function showOffline(msg, retry) {
    var box = $("netScreen");
    $("netText").textContent = msg || "インターネットにつないでね。つないだら「もう一度」を押してください。";
    $("netRetry").hidden = !retry;
    $("netRetry").onclick = function () { box.hidden = true; if (retry) retry(); };
    $("netOk").hidden = true;
    box.hidden = false;
  }
  function showNotice(msg, ok) {
    var box = $("netScreen");
    $("netText").textContent = msg;
    $("netRetry").hidden = true;
    $("netOk").hidden = false;
    $("netOk").onclick = function () { box.hidden = true; if (ok) ok(); };
    box.hidden = false;
  }
  function hideAll() {
    ["base", "create", "worldScreen", "town", "trialScreen", "parentScreen", "resumeScreen"].forEach(function (id) { var e = $(id); if (e) e.hidden = true; });
  }
  // 失敗したときの共通の扱い：鍵がちがう → つなぎ先の画面、つながらない → もう一度
  function onError(err, retry) {
    if (err && err.kind === "forbidden") { BDApi.clearKey("player"); reconnect("鍵が使えなくなりました。新しいプレイヤー用の鍵を入れてください。"); return; }
    showOffline(err && err.kind === "network" ? "" : "うまく送れませんでした（" + (err ? err.message : "") + "）。少し待って「もう一度」を押してください。", retry);
  }

  // ---------- はじめに（Base.boot から） ----------
  // GAS のセーブと iPad の中の控えをくらべて、新しい方を使う。done(hasGame)
  function start(done) {
    if (!connected()) { reconnect(""); return; }
    BDApi.call("loadGame", {}, key()).then(function (r) {
      var m = meta();
      var local = GameState.load();
      if (local && m.dirty && Number(m.rev) === Number(r.rev)) {
        // iPad の中の方が新しい（送りそこねていた）：送ってから始める
        save("", "").then(function () { done(true); });
        return;
      }
      if (r.data) {
        if (!GameState.adopt(r.data)) { showOffline("GAS のセーブを読めませんでした。保護者に知らせてください。", null); return; }
        setMeta({ player: m.player, rev: Number(r.rev) || 0, dirty: false });
        done(true);
        return;
      }
      // GAS にセーブがない：キャラクリから
      GameState.wipeLocal();
      setMeta({ player: m.player, rev: Number(r.rev) || 0, dirty: false });
      done(false);
    }, function (err) { onError(err, function () { start(done); }); });
  }

  // ---------- セーブを送る ----------
  // label：区切りの名前（あれば GAS の「セーブの控え」にも残す）。もどり値：Promise（送れたら resolve）
  var chain = Promise.resolve();
  function save(label, summary) {
    var p = chain.then(function () { return sendOnce(label, summary); });
    chain = p.then(null, function () { /* 次の送信は続ける */ });
    return p;
  }
  function sendOnce(label, summary) {
    var g = GameState.get();
    if (!g || !connected()) return Promise.resolve();
    var m = meta();
    return BDApi.call("saveGame", { data: JSON.stringify(g), base: Number(m.rev) || 0, checkpoint: label || "", summary: summary || "" }, key())
      .then(function (r) {
        if (r.conflict) {
          // ほかの端末（や古い画面）が先に保存していた：GAS のセーブを読みこみ直す
          return new Promise(function () {
            showNotice("ほかの画面でセーブが進んでいました。新しいセーブを読みこみ直します。", function () { location.reload(); });
          });
        }
        setMeta({ player: m.player, rev: r.rev, dirty: false });
        flushLogs();
      }, function (err) {
        // 送れなかった：「もう一度」で送り直す（送れるまで先に進めない）
        return new Promise(function (resolve) {
          onError(err, function () { sendOnce(label, summary).then(resolve); });
        });
      });
  }

  // ---------- 冒険の記録 ----------
  // entry：{ date, kind, floor, correct, subjects }
  function log(entry) {
    var list = readJSON(LOG_KEY, []);
    list.push(entry);
    writeJSON(LOG_KEY, list);
    flushLogs();
  }
  var flushing = false;
  function flushLogs() {
    if (flushing || !connected()) return;
    var list = readJSON(LOG_KEY, []);
    if (!list.length) return;
    flushing = true;
    BDApi.call("logAdventure", { entry: list[0] }, key()).then(function () {
      var now = readJSON(LOG_KEY, []); now.shift(); writeJSON(LOG_KEY, now);
      flushing = false; flushLogs();
    }, function (err) {
      flushing = false;
      if (err && err.kind === "server") { var now = readJSON(LOG_KEY, []); now.shift(); writeJSON(LOG_KEY, now); } // 受けつけてもらえない記録は捨てる
    });
  }

  // ---------- セーブの控え（保護者画面） ----------
  function checkpoints() { return BDApi.call("checkpoints", {}, key()).then(function (r) { return r.checkpoints || []; }); }
  function restore(id, label) {
    return BDApi.call("loadCheckpoint", { id: id }, key()).then(function (r) {
      if (!GameState.adopt(r.data)) throw new Error("控えを読めませんでした");
      var g = GameState.get();
      g.today = { date: GameState.todayStr(), adventure: null };
      GameState.save();
      return save("セーブを復元（" + label + "）", GameState.summary());
    });
  }

  // ---------- 保護者の暗証番号（GAS で確かめる。番号は固定） ----------
  // もどり値：Promise { match, locked（受けつけない残り秒）, notSet }
  function checkPin(pin) { return BDApi.call("pinCheck", { pin: pin }, key()); }

  return {
    connected: connected, player: player, playerLabel: playerLabel, url: url, markDirty: markDirty,
    start: start, save: save, log: log, checkpoints: checkpoints, restore: restore, checkPin: checkPin,
    reconnect: reconnect, showOffline: showOffline, onError: onError
  };
})();
