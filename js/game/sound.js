// 音（段階7-1）：BGM と効果音。Web Audio で鳴らす（iPad の Safari でも音量を変えられ、効果音がおくれないように）。
// ・音のファイルは assets/sound/ に置き、下の FILES に名前を書く。ファイルがまだない音は鳴らさない（何も起きない）。
// ・iPad の Safari は、画面にさわるまで音を鳴らせない。はじめてさわったときに鳴らす準備をする（unlock）。
// ・BGM と効果音は、それぞれ設定で消せる（この端末だけ。localStorage）。
// iPadOS 16 の Safari で動くように、新しい構文（?. や ?? など）は使わない。OGG は iPadOS 16 で鳴らないので、mp3 にして置く。
var Sound = (function () {
  var STORE = "bd-sound";
  var DIR = "assets/sound/";
  // 名前 → ファイル（assets/sound/ の中）。空のものは、まだ音がない
  var FILES = {
    // NOT JAM MUSIC PACK 2（CC0）。OGG と WAV を mp3 にした（docs/credits.md）
    bgm: {
      title: "bgm_lich_king_ascendant.mp3", town: "bgm_lazy_river_rally.mp3", world: "bgm_rainy_foothills.mp3",
      trial: "bgm_crystal_caverns.mp3", dungeon: "bgm_leading_the_charge.mp3", boss: "bgm_locrian_chipdoom.mp3"
    },
    se: {
      click: "se_click.mp3", ok: "se_accept.mp3", cancel: "se_click_2.mp3",                                        // 画面のボタン
      correct: "se_green_light_tone.mp3", wrong: "se_red_light_tone.mp3", trialDone: "se_powerup_b.mp3",          // 知恵の試練
      swing: "se_swipe_metallic.mp3", hit: "se_attack_a.mp3", hurt: "se_crunch_a.mp3", kill: "se_chirp_crunch.mp3",
      down: "se_fall_and_die.mp3", skill: "se_rising_metallic.mp3", heal: "se_powerup_a.mp3",                     // たたかい
      coin: "se_chirp_a.mp3", chest: "se_boost_pad.mp3", key: "se_lockon_available.mp3", door: "se_scene_transition.mp3",
      trap: "se_alarm.mp3", item: "se_bounce_2.mp3",                                                              // ダンジョン
      clear: "se_lap_complete.mp3", fail: "se_you_died.mp3", levelup: "se_rising_tone_explosion.mp3", boss: "se_siren_explosion.mp3"   // 区切り
    }
  };
  // BGM のくり返しの長さ（秒。もとの OGG の長さ）。mp3 にすると終わりに少し無音がつくので、ここでくり返す
  var LOOP = {
    title: 37.317, town: 38.519, world: 36.364, trial: 33.391, dungeon: 78.367, boss: 117.736
  };
  var VOL = { bgm: 0.45, se: 0.8 };

  var ctx = null, bgmGain = null, seGain = null;
  var buffers = {}, loading = {};
  var bgmSrc = null, bgmName = "", bgmWant = "";

  function readSettings() {
    try { var v = JSON.parse(localStorage.getItem(STORE) || "null"); if (v && typeof v === "object") return { bgm: v.bgm !== false, se: v.se !== false }; } catch (e) { /* そのまま */ }
    return { bgm: true, se: true };
  }
  var settings = readSettings();
  function saveSettings() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* そのまま */ } }

  // ---------- 鳴らす準備（はじめて画面にさわったとき） ----------
  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      bgmGain = ctx.createGain(); bgmGain.gain.value = VOL.bgm; bgmGain.connect(ctx.destination);
      seGain = ctx.createGain(); seGain.gain.value = VOL.se; seGain.connect(ctx.destination);
      // 無音を1回鳴らすと、iPad で音が出るようになる
      try { var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* そのまま */ }
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    if (bgmWant && !bgmSrc) startBgm(bgmWant);
  }
  ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
    document.addEventListener(ev, unlock, true);
  });
  // 画面を閉じたら止め、開いたら続ける
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) { if (ctx.suspend) ctx.suspend(); } else if (ctx.resume) ctx.resume();
  });

  // ---------- 読みこみ ----------
  function load(file) {
    if (buffers[file]) return Promise.resolve(buffers[file]);
    if (loading[file]) return loading[file];
    loading[file] = fetch(DIR + file).then(function (r) {
      if (!r.ok) throw new Error("no file");
      return r.arrayBuffer();
    }).then(function (data) {
      return new Promise(function (ok, ng) { ctx.decodeAudioData(data, ok, ng); }); // 古い Safari でも動く形
    }).then(function (buf) { buffers[file] = buf; return buf; }, function (e) { delete loading[file]; throw e; });
    return loading[file];
  }

  // ---------- 効果音 ----------
  function play(name) {
    if (!settings.se || !ctx) return;
    var file = FILES.se[name];
    if (!file) return;
    load(file).then(function (buf) {
      var s = ctx.createBufferSource(); s.buffer = buf; s.connect(seGain); s.start(0);
    }, function () { /* 鳴らせなければ、そのまま */ });
  }

  // ---------- BGM ----------
  function bgm(name) {
    bgmWant = name || "";
    if (bgmWant === bgmName && bgmSrc) return;
    stopBgm();
    if (bgmWant) startBgm(bgmWant);
  }
  function startBgm(name) {
    if (!ctx || !settings.bgm) return;
    var file = FILES.bgm[name];
    if (!file) return;
    bgmName = name;
    load(file).then(function (buf) {
      if (bgmWant !== name || bgmSrc || !settings.bgm) return;
      var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      if (LOOP[name] && LOOP[name] < buf.duration) { s.loopStart = 0; s.loopEnd = LOOP[name]; }
      s.connect(bgmGain); s.start(0);
      bgmSrc = s;
    }, function () { bgmName = ""; });
  }
  function stopBgm() {
    if (bgmSrc) { try { bgmSrc.stop(0); } catch (e) { /* そのまま */ } bgmSrc = null; }
    bgmName = "";
  }

  // ---------- 設定 ----------
  function setBgm(on) { settings.bgm = !!on; saveSettings(); if (on) { unlock(); if (bgmWant) startBgm(bgmWant); } else stopBgm(); paintButtons(); }
  function setSe(on) { settings.se = !!on; saveSettings(); if (on) unlock(); paintButtons(); }

  // 「BGM：オン」「効果音：オン」のボタン（class="sound-bgm"・"sound-se"）。どの画面に置いても同じように動く
  function paintButtons() {
    Array.prototype.forEach.call(document.querySelectorAll(".sound-bgm"), function (b) { b.textContent = "BGM：" + (settings.bgm ? "オン" : "オフ"); b.setAttribute("aria-pressed", String(settings.bgm)); });
    Array.prototype.forEach.call(document.querySelectorAll(".sound-se"), function (b) { b.textContent = "効果音：" + (settings.se ? "オン" : "オフ"); b.setAttribute("aria-pressed", String(settings.se)); });
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.classList) return;
    // ボタンを押した音。試練の問題の中のボタン（選択肢・図にかく道具など）は鳴らさない（「次の問い」などの dq-btn は鳴らす）
    var cls = String(t.className || "");
    if (t.tagName === "BUTTON" && (!/(^|\s)dq-/.test(cls) || /(^|\s)dq-btn(\s|$)/.test(cls)) && !(t.closest && t.closest(".dq-ann-bar"))) play("click");
    if (t.classList.contains("sound-bgm")) setBgm(!settings.bgm);
    else if (t.classList.contains("sound-se")) setSe(!settings.se);
  });
  paintButtons();

  return {
    play: play, bgm: bgm, unlock: unlock, setBgm: setBgm, setSe: setSe, paintButtons: paintButtons,
    settings: function () { return { bgm: settings.bgm, se: settings.se }; },
    FILES: FILES
  };
})();
