// Brain Dungeon / 毎日4問ドリル：データの窓口（Apps Script）
// ・問題は「問題」シート、画像はGoogleドライブの「毎日4問ドリル 画像」フォルダに置く
// ・解いた結果は「記録」シートに1問1行で保存する
// ・GitHub Pages の画面からは fetch で呼ぶ（下の「fetch 用の窓口」）。
//   POST は Content-Type: text/plain、中身は JSON 文字列 { key, action, ... }。GET ?action=…&key=… でも読める。
//   プレイヤー用の鍵（PLAYER_KEYS、プレイヤーごとに1つ）：check・drillQuestions・image・history・saveAnswer
//     鍵からプレイヤー（child／parent）を決め、そのプレイヤーの記録だけを読み書きする。画面からは player を送らせない。
//   管理用の鍵（EXPORT_KEY）：上のすべて＋ questions・saveQuestion・deleteQuestion・uploadImage・export
// ・Claude 用：記録の書き出し（?action=export）、問題の書き出し（?action=questions）、問題の取りこみ（POST action=import）
//   いずれも管理用の鍵が必要。成績管理フォルダの upload.py・mark_misses.py が使うので形を変えない。
//   export は子ども（child）の記録だけを返す。&player=parent でそのプレイヤー、&player=all で全員分（各行に player が付く）。
// ・画面は配らない（GAS が配っていた旧画面「毎日4問ドリル」と google.script.run 用の関数は 2026-10-27 に消した。
//   鍵なしで問題・答え・記録が見えてしまうため）。URL だけを開いても { error } が返るだけ。
// ・ゲーム（Brain Dungeon）のセーブ・冒険の記録・保護者の暗証番号（段階G-1）：
//   セーブは「セーブ」シートにプレイヤーごとに1行（大きいときは右の列へ分けて入れる）。区切りごとの控えは「セーブの控え」シートに最近の10回分。
//   冒険の記録は「冒険の記録」シートに1回1行。保護者の暗証番号は固定で、スプレッドシートのメニューから1回入れる。
//   スクリプトプロパティに、そのままではなく「ハッシュ」（元にもどせない形）で置く。番号はこのファイルには書かない（公開されるため）。

const RECORD_SHEET = '記録';
const RECORD_HEADERS = ['日付', '教科', '問題ID', '単元', '答え', '正誤', '復習', '時刻', 'メモ', '詳細', 'プレイヤー'];
const PLAYERS = ['child', 'parent'];   // 記録の「プレイヤー」列が空の行は child とみなす
const DEFAULT_PLAYER = 'child';
const QUESTION_SHEET = '問題';
const QUESTION_HEADERS = ['ID', '有効', '教科', '単元', '出典', '更新日時', 'データ'];
const SUBJECTS = ['math', 'japanese', 'science', 'social'];
const IMAGE_FOLDER_NAME = '毎日4問ドリル 画像';
const SOUND_FOLDER_NAME = 'Brain Dungeon の音（配布禁止の素材）';
// ゲーム（段階G-1）
const SAVE_SHEET = 'セーブ';
const SAVE_HEADERS = ['プレイヤー', '保存日時', '版', '大きさ', 'データ（右の列へ続く）'];
const CHECKPOINT_SHEET = 'セーブの控え';
const CHECKPOINT_HEADERS = ['ID', '日時', 'プレイヤー', '区切り', 'まとめ', '大きさ', 'データ（右の列へ続く）'];
const CHECKPOINT_MAX = 10;          // プレイヤーごとに残す控えの数
const ADVENTURE_SHEET = '冒険の記録';
const ADVENTURE_HEADERS = ['日付', '時刻', 'プレイヤー', '終わり方', '階', '正解数', '正解した教科', 'くわしく'];
const ADVENTURE_KINDS = ['clear', 'timeout', 'wipe', 'quit', 'rest'];
const CHUNK = 40000;                // 1つのセルに入れる文字数（セルは5万文字まで）
const SAVE_MAX = 800000;            // セーブの大きさの上限（文字数）
const PIN_FAIL_MAX = 5;             // 暗証番号を続けてまちがえられる回数
const PIN_LOCK_SECONDS = 600;       // まちがえすぎたら、この秒数だけ受けつけない

// 最初に1回（と、このファイルを更新したあとに1回）実行する
function setup() {
  const props = PropertiesService.getScriptProperties();
  getRecordSheet_();
  getQuestionSheet_();
  getSheet_(SAVE_SHEET, SAVE_HEADERS);
  getSheet_(CHECKPOINT_SHEET, CHECKPOINT_HEADERS);
  getSheet_(ADVENTURE_SHEET, ADVENTURE_HEADERS);
  let key = props.getProperty('EXPORT_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('EXPORT_KEY', key);
  }
  const playerKeys = getPlayerKeys_();
  if (!playerKeys.child && props.getProperty('PLAYER_KEY')) playerKeys.child = props.getProperty('PLAYER_KEY'); // 前の版で作った鍵
  PLAYERS.forEach(name => {
    if (!playerKeys[name]) playerKeys[name] = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  });
  props.setProperty('PLAYER_KEYS', JSON.stringify(playerKeys));
  const folder = getImageFolder_();
  Logger.log('管理用の鍵：' + key);
  PLAYERS.forEach(name => Logger.log('プレイヤー用の鍵（' + name + '）：' + playerKeys[name]));
  Logger.log('画像フォルダ：' + folder.getName() + '（' + folder.getId() + '）');
}

// ---------- GET の窓口 ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'export') {
    if (!isKey_(p.key)) return json_({ error: 'forbidden' });
    return json_({ records: readRecords_(p.player || DEFAULT_PLAYER) });
  }
  if (p.action === 'questions') {
    if (!isKey_(p.key)) return json_({ error: 'forbidden' });
    return json_({ questions: readQuestions_(false) });
  }
  if (p.action) return json_(READ_ACTIONS.indexOf(p.action) >= 0 ? api_(p.action, p) : { error: 'unknown action' });
  return json_({ error: 'forbidden' });   // 画面は配らない（旧画面は 2026-10-27 に消した）
}

// Claude からの問題の取りこみ
// body: { key, action: 'import', questions: [...], images: { 名前: { data: base64, mime } } }
// 問題の images / explainImages に 'img:名前' と書くと、取りこんだ画像のIDに置きかわる
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  if (body.action !== 'import') return json_(api_(body.action, body));
  if (!isKey_(body.key)) return json_({ error: 'forbidden' });
  const folder = getImageFolder_();
  const ids = {};
  const imgs = body.images || {};
  Object.keys(imgs).forEach(name => {
    const blob = Utilities.newBlob(Utilities.base64Decode(imgs[name].data), imgs[name].mime || 'image/png', name);
    ids[name] = folder.createFile(blob).getId();
  });
  const swap = list => (list || []).map(v => (typeof v === 'string' && v.indexOf('img:') === 0) ? (ids[v.slice(4)] || '') : v).filter(Boolean);
  let n = 0;
  (body.questions || []).forEach(q => {
    q.images = swap(q.images);
    q.explainImages = swap(q.explainImages);
    (q.parts || []).forEach(pt => { pt.images = swap(pt.images); });
    writeQuestion_(q, !!body.overwrite);
    n++;
  });
  return json_({ ok: true, questions: n, images: Object.keys(ids).length });
}

// ---------- fetch 用の窓口（GitHub Pages の画面から呼ばれる） ----------
// 応答は { ok: true, ... } か { error: 'メッセージ' }。鍵がちがうときは error: 'forbidden'。
const READ_ACTIONS = ['check', 'drillQuestions', 'image', 'history'];   // GET でも使えるもの（セーブ・暗証番号は POST だけ）
const PLAYER_ACTIONS = {
  check: function (p, role, player) { return { role: role, player: player }; },
  drillQuestions: function () { return { questions: readQuestions_(true) }; },
  image: function (p) { return { src: getImage_(String(p.id || '')) }; },
  history: function (p, role, player) { return { records: readRecords_(player), player: player }; },
  saveAnswer: function (p, role, player) { saveAnswer_(p.record, player); return {}; },
  // ゲーム（段階G-1）
  loadGame: function (p, role, player) { return loadGame_(player); },
  saveGame: function (p, role, player) { return saveGame_(player, p); },
  checkpoints: function (p, role, player) { return { checkpoints: listCheckpoints_(player) }; },
  loadCheckpoint: function (p, role, player) { return { data: loadCheckpoint_(player, String(p.id || '')) }; },
  logAdventure: function (p, role, player) { logAdventure_(player, p.entry); return {}; },
  adventures: function (p, role, player) { return { adventures: readAdventures_(player) }; },
  pinStatus: function () { return pinStatus_(); },
  pinCheck: function (p) { return pinCheck_(String(p.pin || '')); },
  // 音（配布が禁止されている素材は、公開リポジトリに置かずにここから渡す。2026-10-18）
  sound: function (p) { return getSound_(String(p.name || '')); },
};
const ADMIN_ACTIONS = {
  questions: function () { return { questions: readQuestions_(false) }; },
  saveQuestion: function (p) { return { question: adminSaveQuestion_(p.key, p.question) }; },
  deleteQuestion: function (p) { adminDeleteQuestion_(p.key, String(p.id || '')); return {}; },
  uploadImage: function (p) { return { id: adminUploadImage_(p.key, p.dataUrl, p.name) }; },
  export: function (p) { return { records: readRecords_(p.player || DEFAULT_PLAYER) }; },
  sounds: function () { return { sounds: listSounds_() }; },
  uploadSound: function (p) { return uploadSound_(String(p.name || ''), p.dataUrl); },
  deleteSound: function (p) { deleteSound_(String(p.name || '')); return {}; },
};

function api_(action, p) {
  // プレイヤーは鍵で決める。管理用の鍵のときは player を指定できる（なければ child）
  const admin = isKey_(p.key);
  const role = admin ? 'admin' : (playerOfKey_(p.key) ? 'player' : '');
  if (!role) return { error: 'forbidden' };
  const player = admin ? (PLAYERS.indexOf(p.player) >= 0 ? p.player : DEFAULT_PLAYER) : playerOfKey_(p.key);
  const fn = PLAYER_ACTIONS[action] || (role === 'admin' ? ADMIN_ACTIONS[action] : null);
  if (!fn) return { error: ADMIN_ACTIONS[action] ? 'forbidden' : 'unknown action' };
  try {
    const out = fn(p, role, player);
    out.ok = true;
    return out;
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------- 問題の画像・答えの保存（窓口から呼ばれる。名前の最後の _ は、外から直接呼べない印） ----------
function getImage_(id) {
  const folder = getImageFolder_();
  const file = DriveApp.getFileById(id);
  const parents = file.getParents();
  let ok = false;
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) ok = true;
  if (!ok) throw new Error('not allowed');
  const blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveAnswer_(rec, player) {
  if (PLAYERS.indexOf(player) < 0) player = DEFAULT_PLAYER;
  if (!rec || typeof rec !== 'object') throw new Error('bad record');
  const date = String(rec.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad date');
  if (SUBJECTS.indexOf(rec.subject) < 0) throw new Error('bad subject');
  const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
  const row = [
    date, rec.subject, clip(rec.qid, 40), clip(rec.unit, 60), clip(rec.input, 300),
    rec.correct ? '○' : '×', rec.review ? '復習' : '', clip(rec.answeredAt, 40), clip(rec.note, 200),
    clip(JSON.stringify(rec.parts || []), 5000), player,
  ];
  withLock_(() => {
    const sheet = getRecordSheet_();
    const r = sheet.getLastRow() + 1;
    sheet.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  });
  return true;
}

// ---------- 問題の追加・修正・削除（窓口から呼ばれる。管理用の鍵が必要） ----------
function adminSaveQuestion_(key, q) {
  mustKey_(key);
  if (!q || !q.id) throw new Error('IDがありません');
  if (SUBJECTS.indexOf(q.subject) < 0) throw new Error('教科を選んでください');
  writeQuestion_(q, true);
  return readQuestionById_(q.id);
}

function adminDeleteQuestion_(key, id) {
  mustKey_(key);
  withLock_(() => {
    const sheet = getQuestionSheet_();
    const row = findQuestionRow_(sheet, id);
    if (row) sheet.deleteRow(row);
  });
  return true;
}

function adminUploadImage_(key, dataUrl, name) {
  mustKey_(key);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('画像を読みこめませんでした');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name || 'image');
  return getImageFolder_().createFile(blob).getId();
}

// ---------- ゲーム（段階G-1） ----------
// セーブ：プレイヤーごとに1行。返す data は JSON の文字列のまま（画面で読む）
function loadGame_(player) {
  const sheet = getSheet_(SAVE_SHEET, SAVE_HEADERS);
  const row = findRow_(sheet, 1, player);
  if (!row) return { data: null, savedAt: '', rev: 0 };
  const width = sheet.getLastColumn();
  const r = sheet.getRange(row, 1, 1, width).getDisplayValues()[0];
  return { data: unchunk_(r.slice(4)) || null, savedAt: r[1], rev: Number(r[2]) || 0 };
}

// p：{ data（JSON の文字列）, base（画面が持っている版。ちがえば上書きしない）, force, checkpoint（区切りの名前。あれば控えにも残す）, summary }
function saveGame_(player, p) {
  const data = checkGameData_(p.data);
  return withLock_(() => {
    const sheet = getSheet_(SAVE_SHEET, SAVE_HEADERS);
    let row = findRow_(sheet, 1, player);
    const cur = row ? Number(sheet.getRange(row, 3).getValue()) || 0 : 0;
    // 別の端末（や古い画面）が先に保存していたら、上書きしないで知らせる
    if (p.base != null && !p.force && Number(p.base) !== cur) {
      return { conflict: true, rev: cur, savedAt: row ? sheet.getRange(row, 2).getDisplayValue() : '' };
    }
    const rev = cur + 1;
    const at = nowStr_();
    const parts = chunks_(data);
    if (!row) row = sheet.getLastRow() + 1;
    const width = Math.max(sheet.getLastColumn(), 4 + parts.length);
    const values = [player, at, String(rev), String(data.length)].concat(parts);
    while (values.length < width) values.push('');
    sheet.getRange(row, 1, 1, width).setNumberFormat('@').setValues([values]);
    if (p.checkpoint) addCheckpoint_(player, String(p.checkpoint).slice(0, 40), String(p.summary || '').slice(0, 200), data, at);
    return { rev: rev, savedAt: at };
  });
}

// ゲームのセーブとして読めるか確かめる（こわれたものや大きすぎるものは入れない）
function checkGameData_(data) {
  if (typeof data !== 'string' || !data) throw new Error('bad save');
  if (data.length > SAVE_MAX) throw new Error('save too large');
  let g;
  try { g = JSON.parse(data); } catch (err) { throw new Error('bad save'); }
  if (!g || typeof g !== 'object' || !Array.isArray(g.party)) throw new Error('bad save');
  return data;
}

// 区切りごとの控え（最近の CHECKPOINT_MAX 回分）
function addCheckpoint_(player, label, summary, data, at) {
  const sheet = getSheet_(CHECKPOINT_SHEET, CHECKPOINT_HEADERS);
  const parts = chunks_(data);
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const values = [id, at, player, label, summary, String(data.length)].concat(parts);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setNumberFormat('@').setValues([values]);
  // 古いものを消す（上の行ほど古い）
  const n = sheet.getLastRow() - 1;
  const who = sheet.getRange(2, 3, n, 1).getDisplayValues();
  const mine = [];
  for (let i = 0; i < who.length; i++) if (who[i][0] === player) mine.push(i + 2);
  for (let k = mine.length - CHECKPOINT_MAX - 1; k >= 0; k--) sheet.deleteRow(mine[k]);
}
function listCheckpoints_(player) {
  const sheet = getSheet_(CHECKPOINT_SHEET, CHECKPOINT_HEADERS);
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return [];
  return sheet.getRange(2, 1, n, 6).getDisplayValues()
    .filter(r => r[2] === player)
    .map(r => ({ id: r[0], at: r[1], label: r[3], summary: r[4], size: Number(r[5]) || 0 }))
    .reverse();   // 新しい順
}
function loadCheckpoint_(player, id) {
  const sheet = getSheet_(CHECKPOINT_SHEET, CHECKPOINT_HEADERS);
  const row = findRow_(sheet, 1, id);
  if (!row) throw new Error('not found');
  const r = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (r[2] !== player) throw new Error('not found');
  return unchunk_(r.slice(6));
}

// 冒険の記録：1回1行。entry：{ date, kind, floor, correct, subjects, note }
function logAdventure_(player, entry) {
  if (!entry || typeof entry !== 'object') throw new Error('bad entry');
  const date = String(entry.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad date');
  if (ADVENTURE_KINDS.indexOf(entry.kind) < 0) throw new Error('bad kind');
  const subjects = (Array.isArray(entry.subjects) ? entry.subjects : []).filter(s => SUBJECTS.indexOf(s) >= 0);
  const row = [date, Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm'), player, entry.kind,
    String(Math.max(0, Math.min(99, Number(entry.floor) || 0))), String(Math.max(0, Math.min(4, Number(entry.correct) || 0))),
    subjects.join(','), String(entry.note == null ? '' : entry.note).slice(0, 300)];
  withLock_(() => {
    const sheet = getSheet_(ADVENTURE_SHEET, ADVENTURE_HEADERS);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  });
}
function readAdventures_(player) {
  const sheet = getSheet_(ADVENTURE_SHEET, ADVENTURE_HEADERS);
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return [];
  const all = player === 'all';
  return sheet.getRange(2, 1, n, ADVENTURE_HEADERS.length).getDisplayValues()
    .filter(r => r[0] && (all || r[2] === player))
    .map(r => {
      const a = { date: r[0], time: r[1], kind: r[3], floor: Number(r[4]) || 0, correct: Number(r[5]) || 0,
        subjects: r[6] ? r[6].split(',') : [], note: r[7] };
      if (all) a.player = r[2];
      return a;
    });
}

// ---------- 保護者の暗証番号（4けた。子どもの iPad でも保護者の端末でも同じ番号） ----------
// 番号はそのまま置かず、ハッシュにして PARENT_PIN に置く。続けて5回まちがえると10分受けつけない。
function pinStatus_() {
  return { set: !!PropertiesService.getScriptProperties().getProperty('PARENT_PIN'), locked: pinLocked_() };
}
function pinCheck_(pin) {
  const locked = pinLocked_();
  if (locked) return { match: false, locked: locked };
  const saved = PropertiesService.getScriptProperties().getProperty('PARENT_PIN');
  if (!saved) return { match: false, notSet: true, locked: 0 };
  const match = /^[0-9]{4}$/.test(pin) && pinHash_(pin) === saved;
  pinCount_(match);
  return { match: match, locked: pinLocked_() };
}
// 番号は固定（2026-10-17 決定）。画面からは決めたり変えたりできない。
// 入れるとき・入れかえるとき：スプレッドシートの上のメニュー「Brain Dungeon」→「保護者の暗証番号を入れる」。
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Brain Dungeon')
    .addItem('保護者の暗証番号を入れる', 'enterParentPin')
    .addToUi();
}
function enterParentPin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('保護者の暗証番号', '4けたの数字を入れてください（ゲームの保護者画面で使う番号）。', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pin = String(res.getResponseText() || '').trim();
  if (!/^[0-9]{4}$/.test(pin)) { ui.alert('4けたの数字にしてください。もう一度メニューから入れてください。'); return; }
  savePin_(pin);
  ui.alert('暗証番号を入れました。');
}
function savePin_(pin) {
  PropertiesService.getScriptProperties().setProperty('PARENT_PIN', pinHash_(pin));
  const cache = CacheService.getScriptCache();
  cache.remove('PIN_FAIL'); cache.remove('PIN_LOCK');
}
function pinHash_(pin) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('PIN_SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('PIN_SALT', salt); }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
// まちがえた回数（CacheService に PIN_LOCK_SECONDS のあいだ覚える）
function pinCount_(ok) {
  const cache = CacheService.getScriptCache();
  if (ok) { cache.remove('PIN_FAIL'); return; }
  const n = (Number(cache.get('PIN_FAIL')) || 0) + 1;
  cache.put('PIN_FAIL', String(n), PIN_LOCK_SECONDS);
  if (n >= PIN_FAIL_MAX) cache.put('PIN_LOCK', String(Date.now() + PIN_LOCK_SECONDS * 1000), PIN_LOCK_SECONDS);
}
// 受けつけない残りの秒数（0 なら受けつける）
function pinLocked_() {
  const until = Number(CacheService.getScriptCache().get('PIN_LOCK')) || 0;
  const left = Math.ceil((until - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

// ---------- 内部 ----------
function isKey_(k) {
  const key = PropertiesService.getScriptProperties().getProperty('EXPORT_KEY');
  return !!key && k === key;
}
function getPlayerKeys_() {
  let keys = {};
  try { keys = JSON.parse(PropertiesService.getScriptProperties().getProperty('PLAYER_KEYS') || '{}') || {}; } catch (err) { keys = {}; }
  return keys;
}
// 鍵に合うプレイヤーの名前（child／parent）。合わなければ ''
function playerOfKey_(k) {
  if (!k) return '';
  const keys = getPlayerKeys_();
  for (let i = 0; i < PLAYERS.length; i++) if (keys[PLAYERS[i]] && keys[PLAYERS[i]] === k) return PLAYERS[i];
  return '';
}
function mustKey_(k) {
  if (!isKey_(k)) throw new Error('管理用の鍵がちがいます');
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
// col 列が value の行（見出しの下から探す）。なければ 0
function findRow_(sheet, col, value) {
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return 0;
  const v = sheet.getRange(2, col, n, 1).getDisplayValues();
  for (let i = 0; i < v.length; i++) if (v[i][0] === value) return i + 2;
  return 0;
}
// 長い文字を CHUNK 文字ずつに分ける。どれも「~」で始めて、セルが式（=…）や数として読まれないようにする
function chunks_(s) {
  const out = [];
  for (let i = 0; i < s.length; i += CHUNK) out.push('~' + s.slice(i, i + CHUNK));
  return out;
}
function unchunk_(cells) {
  return cells.filter(c => c).map(c => (c.charAt(0) === '~' ? c.slice(1) : c)).join('');
}
function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function getRecordSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RECORD_SHEET);
    sheet.setFrozenRows(1);
  }
  sheet.getRange(1, 1, 1, RECORD_HEADERS.length).setValues([RECORD_HEADERS]).setFontWeight('bold');
  return sheet;
}

function getQuestionSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(QUESTION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(QUESTION_SHEET);
    sheet.getRange(1, 1, 1, QUESTION_HEADERS.length).setValues([QUESTION_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:G').setNumberFormat('@');
  }
  return sheet;
}

// ---------- 音（段階7。配布が禁止されている素材をドライブに置き、鍵のある端末にだけ渡す） ----------
// 名前は英数字・_・-・. だけ（例：michinarini.mp3）。同じ名前で取りこむと、前のファイルはごみ箱へ
function soundName_(name) {
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name)) throw new Error('音の名前は英数字と _ - . だけにしてください');
  return name;
}
function getSoundFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SOUND_FOLDER');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* 消されていたら作り直す */ }
  }
  const folder = DriveApp.createFolder(SOUND_FOLDER_NAME);
  props.setProperty('SOUND_FOLDER', folder.getId());
  return folder;
}
function findSound_(name) {
  const it = getSoundFolder_().getFilesByName(soundName_(name));
  return it.hasNext() ? it.next() : null;
}
function getSound_(name) {
  const file = findSound_(name);
  if (!file) throw new Error('音がありません：' + name);
  const blob = file.getBlob();
  return { name: name, mime: blob.getContentType(), size: file.getSize(), updated: file.getLastUpdated().toISOString(), data: Utilities.base64Encode(blob.getBytes()) };
}
function listSounds_() {
  const out = [];
  const it = getSoundFolder_().getFiles();
  while (it.hasNext()) { const f = it.next(); out.push({ name: f.getName(), size: f.getSize(), updated: f.getLastUpdated().toISOString() }); }
  out.sort((a, b) => a.name < b.name ? -1 : 1);
  return out;
}
function uploadSound_(name, dataUrl) {
  soundName_(name);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('音のファイルを読みこめませんでした');
  const old = findSound_(name);
  if (old) old.setTrashed(true);
  const file = getSoundFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
  return { name: name, size: file.getSize() };
}
function deleteSound_(name) {
  const file = findSound_(name);
  if (file) file.setTrashed(true);
}

function getImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('IMAGE_FOLDER');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* 消されていたら作り直す */ }
  }
  const folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('IMAGE_FOLDER', folder.getId());
  return folder;
}

// player：そのプレイヤーの記録だけ返す。'all' なら全員分（各行に player を付ける）
function readRecords_(player) {
  const sheet = getRecordSheet_();
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return [];
  const all = player === 'all';
  return sheet.getRange(2, 1, n, RECORD_HEADERS.length).getDisplayValues()
    .filter(r => r[0] && r[1] && (all || (r[10] || DEFAULT_PLAYER) === player))
    .map(r => {
      let parts = [];
      try { parts = r[9] ? JSON.parse(r[9]) : []; } catch (err) { parts = []; }
      const rec = {
        date: r[0], subject: r[1], qid: r[2], unit: r[3], input: r[4],
        correct: r[5] === '○', review: r[6] === '復習', answeredAt: r[7], note: r[8], parts: parts,
      };
      if (all) rec.player = r[10] || DEFAULT_PLAYER;
      return rec;
    });
}

function readQuestions_(enabledOnly) {
  const sheet = getQuestionSheet_();
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return [];
  const out = [];
  sheet.getRange(2, 1, n, QUESTION_HEADERS.length).getValues().forEach(r => {
    if (!r[0] || !r[6]) return;
    let q;
    try { q = JSON.parse(r[6]); } catch (err) { return; }
    q.id = String(r[0]);
    q.enabled = r[1] === true || String(r[1]).toUpperCase() === 'TRUE' || r[1] === '○';
    q.updatedAt = String(r[5] || '');
    if (enabledOnly && !q.enabled) return;
    out.push(q);
  });
  return out;
}

function readQuestionById_(id) {
  return readQuestions_(false).filter(q => q.id === id)[0] || null;
}

function findQuestionRow_(sheet, id) {
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return 0;
  const ids = sheet.getRange(2, 1, n, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function writeQuestion_(q, overwrite) {
  const data = Object.assign({}, q);
  const enabled = data.enabled !== false;
  delete data.enabled; delete data.updatedAt;
  const json = JSON.stringify(data);
  if (json.length > 45000) throw new Error('問題のデータが大きすぎます（' + q.id + '）');
  const row = [q.id, enabled ? '○' : '', q.subject || '', q.unit || '', q.source || '',
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'), json];
  withLock_(() => {
    const sheet = getQuestionSheet_();
    const at = findQuestionRow_(sheet, q.id);
    if (at && !overwrite) return;
    const r = at || sheet.getLastRow() + 1;
    sheet.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
