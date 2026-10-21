// GAS（データの窓口）とのやりとり。ドリル・エディタ（あとでゲームも）で共通。
// ・POST の Content-Type は text/plain（ブラウザの事前確認を起こさないため）。中身は JSON 文字列 { key, action, ... }。
// ・鍵はこのブラウザの中（localStorage）にだけ覚える。コードには書かない。
// iPadOS 16 の Safari で動くように、?. や ?? は使わない。
(function () {
  var STORE = { player: "bd-key-player", admin: "bd-key-admin" };
  var TIMEOUT_MS = 30000;

  // GAS の URL：はじめて開いたときに入れて、このブラウザの中（localStorage）に覚えたものを使う（公開リポジトリに URL を書かないため。G-2）
  var URL_STORE = "bd-gas-url";
  function gasUrl() {
    var u = "";
    try { u = localStorage.getItem(URL_STORE) || ""; } catch (e) { u = ""; }
    return u || (window.BD_CONFIG && window.BD_CONFIG.gasUrl) || "";
  }

  function getKey(kind) { try { return localStorage.getItem(STORE[kind]) || ""; } catch (e) { return ""; } }
  function setKey(kind, v) { try { localStorage.setItem(STORE[kind], v); } catch (e) {} }
  function clearKey(kind) { try { localStorage.removeItem(STORE[kind]); } catch (e) {} }

  function fail(message, kind) { var e = new Error(message); e.kind = kind; return e; }

  // 戻り値：Promise。成功なら GAS の応答（{ ok: true, ... }）。
  // 失敗なら Error。err.kind は "forbidden"（鍵がちがう）・"network"（つながらない）・"server"（GAS 側のエラー）。
  // opts.timeout：待つ時間（ミリ秒。省くと30秒）
  function call(action, params, key, opts) {
    var body = {};
    var src = params || {};
    Object.keys(src).forEach(function (k) { body[k] = src[k]; });
    body.action = action; body.key = key || "";

    if (window.BD_MOCK) { // 手元確認用のプレビュー（保存はしない）
      return new Promise(function (resolve, reject) {
        var fn = window.BD_MOCK[action];
        if (!fn) return reject(fail("unknown action", "server"));
        var out = fn(body); out.ok = true; resolve(out);
      });
    }
    if (!gasUrl()) return Promise.reject(fail("GAS の URL が入っていません", "server"));

    var ctrl = window.AbortController ? new AbortController() : null, wait = (opts && opts.timeout) || TIMEOUT_MS, t0 = Date.now();
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, wait) : 0;
    return fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw fail("サーバーの応答がおかしいです（" + res.status + "）", "network");
      return res.json().catch(function () { throw fail("サーバーの応答を読めませんでした", "network"); });
    }, function () {
      clearTimeout(timer);
      // 時間切れか、つながらなかったかを分ける（2026-10-22：問題の読みこみが失敗する原因を調べるため）
      if (ctrl && ctrl.signal.aborted) throw fail("時間がかかりすぎました（" + Math.round(wait / 1000) + "秒）", "network");
      throw fail("インターネットにつながりませんでした（" + Math.round((Date.now() - t0) / 100) / 10 + "秒後）", "network");
    }).then(function (data) {
      if (!data || data.error) {
        var msg = data && data.error ? String(data.error) : "応答が空です";
        throw fail(msg === "forbidden" ? "鍵がちがいます" : msg, msg === "forbidden" ? "forbidden" : "server");
      }
      return data;
    });
  }

  window.BDApi = { call: call, getKey: getKey, setKey: setKey, clearKey: clearKey, hasUrl: function () { return !!gasUrl() || !!window.BD_MOCK; } };
})();
