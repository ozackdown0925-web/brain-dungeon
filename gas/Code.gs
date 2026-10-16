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
// ・切りかえが終わるまで、GAS が配る今の画面（doGet の HTML と google.script.run 用の関数）も残す。

const RECORD_SHEET = '記録';
const RECORD_HEADERS = ['日付', '教科', '問題ID', '単元', '答え', '正誤', '復習', '時刻', 'メモ', '詳細', 'プレイヤー'];
const PLAYERS = ['child', 'parent'];   // 記録の「プレイヤー」列が空の行は child とみなす
const DEFAULT_PLAYER = 'child';
const QUESTION_SHEET = '問題';
const QUESTION_HEADERS = ['ID', '有効', '教科', '単元', '出典', '更新日時', 'データ'];
const SUBJECTS = ['math', 'japanese', 'science', 'social'];
const IMAGE_FOLDER_NAME = '毎日4問ドリル 画像';

// 最初に1回（と、このファイルを更新したあとに1回）実行する
function setup() {
  const props = PropertiesService.getScriptProperties();
  getRecordSheet_();
  getQuestionSheet_();
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

// ---------- 公開ページ ----------
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
  if (p.page === 'editor') {
    return HtmlService.createTemplateFromFile('editor').evaluate()
      .setTitle('問題エディタ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('毎日4問ドリル')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
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
const READ_ACTIONS = ['check', 'drillQuestions', 'image', 'history'];   // GET でも使えるもの
const PLAYER_ACTIONS = {
  check: function (p, role, player) { return { role: role, player: player }; },
  drillQuestions: function () { return { questions: readQuestions_(true) }; },
  image: function (p) { return { src: getImage(String(p.id || '')) }; },
  history: function (p, role, player) { return { records: readRecords_(player), player: player }; },
  saveAnswer: function (p, role, player) { saveAnswer(p.record, player); return {}; },
};
const ADMIN_ACTIONS = {
  questions: function () { return { questions: readQuestions_(false) }; },
  saveQuestion: function (p) { return { question: adminSaveQuestion(p.key, p.question) }; },
  deleteQuestion: function (p) { adminDeleteQuestion(p.key, String(p.id || '')); return {}; },
  uploadImage: function (p) { return { id: adminUploadImage(p.key, p.dataUrl, p.name) }; },
  export: function (p) { return { records: readRecords_(p.player || DEFAULT_PLAYER) }; },
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

// ---------- ドリルから呼ばれる（google.script.run 版。切りかえが終わったら消す） ----------
function getQuestions() {
  return readQuestions_(true);
}

function getHistory() {
  return readRecords_(DEFAULT_PLAYER);
}

function getImage(id) {
  const folder = getImageFolder_();
  const file = DriveApp.getFileById(id);
  const parents = file.getParents();
  let ok = false;
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) ok = true;
  if (!ok) throw new Error('not allowed');
  const blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveAnswer(rec, player) {
  if (PLAYERS.indexOf(player) < 0) player = DEFAULT_PLAYER;   // google.script.run 版（子どもの iPad）からは player なし
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

// ---------- エディタから呼ばれる（管理用の鍵が必要） ----------
function adminCheck(key) {
  return isKey_(key);
}

function adminListQuestions(key) {
  mustKey_(key);
  return readQuestions_(false);
}

function adminSaveQuestion(key, q) {
  mustKey_(key);
  if (!q || !q.id) throw new Error('IDがありません');
  if (SUBJECTS.indexOf(q.subject) < 0) throw new Error('教科を選んでください');
  writeQuestion_(q, true);
  return readQuestionById_(q.id);
}

function adminDeleteQuestion(key, id) {
  mustKey_(key);
  withLock_(() => {
    const sheet = getQuestionSheet_();
    const row = findQuestionRow_(sheet, id);
    if (row) sheet.deleteRow(row);
  });
  return true;
}

function adminUploadImage(key, dataUrl, name) {
  mustKey_(key);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('画像を読みこめませんでした');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name || 'image');
  return getImageFolder_().createFile(blob).getId();
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
