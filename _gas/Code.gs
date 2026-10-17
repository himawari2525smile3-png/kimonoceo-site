/**
 * 日程のご相談ページ（HiMaWaRi合同会社 飯村惇）
 * Googleカレンダーの空きから選んでもらい、Meet付きの予定を自動で入れる。
 * LINEで都合を送る方法も同じページで選べる。
 */
const CONFIG = {
  OWNER_NAME: '飯村 惇',
  OWNER_EMAIL: 'KimonoCEO@kimonoceo.com',   // 予約が入った時のお知らせ先
  CALENDAR_IDS: ['primary'],                // 「埋まっている」と見なすカレンダー（増やす時はIDを足す）
  BOOK_CALENDAR_ID: 'primary',              // 予約を入れるカレンダー
  TZ: 'Asia/Tokyo',
  DAYS_AHEAD: 30,          // 何日先まで表示するか
  MIN_NOTICE_HOURS: 12,    // 何時間後から予約を受けるか
  STEP_MIN: 30,            // 開始時刻の刻み（分）
  BUFFER_MIN: 0,           // 前後に空ける時間（分）
  // 曜日ごとの受付時間（0=日 1=月 … 6=土）。[開始時, 終了時]
  HOURS: {
    0: [[10, 13], [18, 21]], // 日曜：13時〜18時はNG
    1: [],                   // 月曜：終日NG
    2: [],                   // 火曜：終日NG
    3: [[10, 21]],
    4: [[10, 21]],
    5: [[10, 21]],
    6: [[10, 21]],
  },
  // 所要時間（分）：new=はじめての方、client=2回目以降の方
  DURATIONS: { new: [30, 60], client: [30, 60, 90] },
  DEFAULT_DURATION: 60,
  LINE_URL: 'https://lin.ee/TypjZLM',
  SHEET_ID: '',            // 空なら初回に「日程調整_予約一覧」を自動で作る（予約とアンケートの2枚）
  REVIEW_URL: 'https://g.page/r/CZ1A6Bk47D2LEAE/review',   // Googleの口コミ画面（全員に同じように案内する）
  SALES_SHEET_ID: '1T_XFw0YZDaZDv8TTcAbO9Ro9bVs9FvFEXmpz9zdn_Gs', // 営業管理シート（アンケートの結果を「メモ」欄に書き足す）
  SALES_TABS: ['C1進行中', 'C2卒業', 'N新規', 'Rリピート既存'],
  SALES_MEMO_COL: 15,      // 「メモ」はO列（15列目）
  GOOGLE_CLIENT_ID: '',    // Googleログイン用のクライアントID（空ならログインのボタンは出ない）
};

/* ───────── 入口 ───────── */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api === 'info') return json_(getInfo());
  if (p.api === 'slots') return json_(getSlots(p.kind, Number(p.dur)));
  if (p.p === 'survey') return HtmlService.createHtmlOutputFromFile('survey')
    .setTitle('面談アンケート｜飯村 惇')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('日程のご相談｜飯村 惇')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '送信内容を読み取れませんでした' }); }
  return json_(body.type === 'survey' ? submitSurvey(body) : book(body));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────── 画面から呼ぶ処理 ───────── */
function getInfo() {
  return { durations: CONFIG.DURATIONS, defaultDuration: CONFIG.DEFAULT_DURATION, lineUrl: CONFIG.LINE_URL, owner: CONFIG.OWNER_NAME, clientId: CONFIG.GOOGLE_CLIENT_ID };
}

function getSlots(kind, dur) {
  const allowed = CONFIG.DURATIONS[kind] || CONFIG.DURATIONS.new;
  if (allowed.indexOf(dur) < 0) dur = CONFIG.DEFAULT_DURATION;
  const now = new Date();
  const earliest = new Date(now.getTime() + CONFIG.MIN_NOTICE_HOURS * 3600e3);
  const start = startOfDay_(now);
  const end = new Date(start.getTime() + (CONFIG.DAYS_AHEAD + 1) * 86400e3);
  const busy = getBusy_(start, end);
  return { dur: dur, days: buildSlots_(start, CONFIG.DAYS_AHEAD, earliest, dur, busy) };
}

function book(p) {
  p = p || {};
  if (p.website) return { ok: false, error: '送信できませんでした' };          // ロボット対策（見えない欄）
  const name = String(p.name || '').trim().slice(0, 60);
  const email = String(p.email || '').trim().slice(0, 120);
  const intro = String(p.intro || '').trim().slice(0, 60);
  const note = String(p.note || '').trim().slice(0, 500);
  const kind = p.kind === 'client' ? 'client' : 'new';
  const dur = Number(p.dur);
  if (!name) return { ok: false, error: 'お名前をご入力ください' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'メールアドレスをご確認ください' };
  if (CONFIG.DURATIONS[kind].indexOf(dur) < 0) return { ok: false, error: '時間の長さをお選びください' };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(p.start || ''));
  if (!m) return { ok: false, error: '日時をお選びください' };
  const s = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const e = new Date(s.getTime() + dur * 60e3);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'ただいま混み合っています。少し置いてお試しください' };
  try {
    // 受付時間内か・空いているかを、確定の直前にもう一度確かめる
    const earliest = new Date(Date.now() + CONFIG.MIN_NOTICE_HOURS * 3600e3);
    const day = startOfDay_(s);
    const ok = buildSlots_(day, 0, earliest, dur, getBusy_(day, new Date(day.getTime() + 86400e3)))
      .some(d => d.times.indexOf(hm_(s)) >= 0);
    if (!ok) return { ok: false, error: 'その時間は埋まってしまいました。別の時間をお選びください', taken: true };

    const title = `${name}様｜飯村（${dur}分）`;
    const desc = [
      `お名前：${name}`, `メール：${email}`, `ご紹介者：${intro || '—'}`,
      `区分：${kind === 'client' ? '2回目以降' : 'はじめて'}`, `ひとこと：${note || '—'}`,
      '', '日程のご相談ページから予約',
    ].join('\n');
    const ev = Calendar.Events.insert({
      summary: title,
      description: desc,
      start: { dateTime: s.toISOString(), timeZone: CONFIG.TZ },
      end: { dateTime: e.toISOString(), timeZone: CONFIG.TZ },
      attendees: [{ email: email, displayName: name }],
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    }, CONFIG.BOOK_CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });
    const meet = ev.hangoutLink || '';
    const when = `${Utilities.formatDate(s, CONFIG.TZ, 'M月d日')}（${'日月火水木金土'[s.getDay()]}）${hm_(s)}〜${hm_(e)}`;

    appendRow_([new Date(), when, dur, name, email, intro, kind === 'client' ? '2回目以降' : 'はじめて', note, meet, ev.id]);
    sendMails_(name, email, intro, note, when, dur, meet);
    return { ok: true, when: when, meet: meet };
  } finally {
    lock.releaseLock();
  }
}

/* ───────── 空き時間の計算 ───────── */
// start の日から days 日後までの、予約できる開始時刻を返す
function buildSlots_(start, days, earliest, dur, busy) {
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const wins = CONFIG.HOURS[d.getDay()] || [];
    const times = [];
    wins.forEach(([h1, h2]) => {
      const wEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h2);
      for (let t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h1);
        t.getTime() + dur * 60e3 <= wEnd.getTime();
        t = new Date(t.getTime() + CONFIG.STEP_MIN * 60e3)) {
        if (t < earliest) continue;
        const a = t.getTime() - CONFIG.BUFFER_MIN * 60e3;
        const b = t.getTime() + (dur + CONFIG.BUFFER_MIN) * 60e3;
        if (busy.some(x => a < x[1] && x[0] < b)) continue;
        times.push(hm_(t));
      }
    });
    if (times.length) out.push({ date: ymd_(d), label: `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`, times: times });
  }
  return out;
}

function getBusy_(start, end) {
  const res = Calendar.Freebusy.query({
    timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: CONFIG.TZ,
    items: CONFIG.CALENDAR_IDS.map(id => ({ id: id })),
  });
  const busy = [];
  Object.keys(res.calendars || {}).forEach(k => {
    (res.calendars[k].busy || []).forEach(b => busy.push([new Date(b.start).getTime(), new Date(b.end).getTime()]));
  });
  return busy;
}

/* ───────── 記録とメール ───────── */
const SHEETS_ = {
  '予約': ['受付日時', '面談日時', '分', 'お名前', 'メール', 'ご紹介者', '区分', 'ひとこと', 'Meet', '予定ID'],
  'アンケート': ['受付日時', 'お名前', '総合評価（5段階）', '良かったこと', '良かったこと（ひとこと）', 'いちばん役に立った話', '紹介してほしい方の業種', '地域', 'どんな方か', '飯村を紹介したい方', 'これからやりたいこと', '紹介候補を送った日', 'メール（Googleログイン）'],
};

function sheet_(name) {
  const props = PropertiesService.getScriptProperties();
  const id = CONFIG.SHEET_ID || props.getProperty('SHEET_ID');
  let ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('日程調整_予約一覧');
    props.setProperty('SHEET_ID', ss.getId());
    ss.getSheets()[0].setName('予約').appendRow(SHEETS_['予約']);
  }
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEETS_[name]); }
  return sh;
}

function appendRow_(row) { sheet_('予約').appendRow(row); }

/* ───────── 面談後のアンケート ───────── */
function submitSurvey(p) {
  p = p || {};
  if (p.website) return { ok: false, error: '送信できませんでした' };
  const t = (v, n) => String(v || '').trim().slice(0, n);
  let name = t(p.name, 60), email = '';
  if (p.idToken) {                       // Googleでログインした方：本人確認してメールと名前を受け取る
    const g = verifyGoogle_(p.idToken);
    if (!g) return { ok: false, error: 'Googleのログインを確認できませんでした。もう一度お試しください' };
    email = g.email; if (!name) name = t(g.name, 60);
  }
  const stars = Math.round(Number(p.stars));
  const good = (Array.isArray(p.good) ? p.good : [p.good]).filter(Boolean).map(x => t(x, 40)).join('、');
  if (!name) return { ok: false, error: 'お名前をご入力ください' };
  if (!(stars >= 1 && stars <= 5)) return { ok: false, error: '総合評価を星でお選びください' };
  if (!good) return { ok: false, error: '「良かったこと」を1つ以上お選びください' };
  const row = [new Date(), name, stars, good, t(p.goodNote, 300), t(p.useful, 500), t(p.wantIndustry, 80), t(p.wantArea, 60), t(p.wantWho, 300), t(p.introduce, 300), t(p.next, 300), '', email];
  sheet_('アンケート').appendRow(row);
  let salesNote = '';
  try { salesNote = writeToSales_(name, row); } catch (err) { salesNote = '営業管理シートに書き込めませんでした（' + err + '）'; }
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, `【アンケート】${name}様から届きました（${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}）`, [
    `お名前：${name}`, `総合評価：${stars} / 5`, `良かったこと：${good}`, `ひとこと：${row[4] || '—'}`, `役に立った話：${row[5] || '—'}`,
    `紹介してほしい方：${[row[6], row[7], row[8]].filter(Boolean).join('／') || '—'}`,
    `飯村を紹介したい方：${row[9] || '—'}`, `これから：${row[10] || '—'}`, `メール：${email || '—（ログインなし）'}`, `営業管理シート：${salesNote}`,
    '', '紹介の候補は、定期実行（紹介マッチング部）が20:43にまとめてお送りします。'].join('\n'));
  return { ok: true, reviewUrl: CONFIG.REVIEW_URL };
}

function sendMails_(name, email, intro, note, when, dur, meet) {
  const body = [
    `${name}様`, '',
    'このたびはご予約いただき、ありがとうございます。',
    'AI時代の経営者専属顧問の飯村です。', '',
    `■ 日時　${when}（${dur}分）`,
    `■ 場所　オンライン（Google Meet）`,
    meet ? `　　　　${meet}` : '　　　　Meetのリンクは、カレンダーの招待に記載しています',
    '', 'お会いできるのを楽しみにしております。',
    `日時の変更などは、LINE（${CONFIG.LINE_URL}）またはこのメールへのご返信でお知らせください。`,
    '', '──────────', 'HiMaWaRi合同会社', 'AI時代の経営者専属顧問　飯村 惇',
  ].join('\n');
  MailApp.sendEmail({ to: email, subject: `【ご予約の確認】${when}　飯村 惇`, body: body, name: CONFIG.OWNER_NAME, replyTo: CONFIG.OWNER_EMAIL });
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, `【予約が入りました】${name}様　${when}`,
    [`お名前：${name}`, `メール：${email}`, `ご紹介者：${intro || '—'}`, `日時：${when}（${dur}分）`, `ひとこと：${note || '—'}`, `Meet：${meet || '—'}`].join('\n'));
}

/* Googleログインの本人確認（IDトークンをGoogleに問い合わせる） */
function verifyGoogle_(token) {
  if (!CONFIG.GOOGLE_CLIENT_ID) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const j = JSON.parse(r.getContentText());
  if (j.aud !== CONFIG.GOOGLE_CLIENT_ID || String(j.email_verified) !== 'true') return null;
  return { email: j.email, name: j.name || '' };
}

/* 営業管理シートの、同じ名前の方の「メモ」欄に1行書き足す（1人に決まる時だけ） */
function writeToSales_(name, row) {
  const norm = v => String(v || '').replace(/[\s　]/g, '').replace(/(さん|様|ちゃん|くん|代表|社長)$/, '');
  const key = norm(name);
  if (!key) return '名前が空のため書き込みなし';
  const ss = SpreadsheetApp.openById(CONFIG.SALES_SHEET_ID);
  const hits = [];
  CONFIG.SALES_TABS.forEach(tab => {
    const sh = ss.getSheetByName(tab); if (!sh) return;
    const vals = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
    vals.forEach((v, i) => { if (i > 0 && (norm(v[0]) === key || norm(v[1]) === key)) hits.push({ sh: sh, r: i + 1, tab: tab }); });
  });
  if (hits.length === 0) return '同じ名前の方が見つからず、書き込みなし';
  if (hits.length > 1) return '同じ名前の方が' + hits.length + '人いるため、書き込みなし（' + hits.map(h => h.tab + ' ' + h.r + '行').join('、') + '）';
  const h = hits[0], cell = h.sh.getRange(h.r, CONFIG.SALES_MEMO_COL);
  const line = Utilities.formatDate(new Date(), CONFIG.TZ, 'M/d') + ' アンケート★' + row[2] + '：' + row[3]
    + (row[6] || row[8] ? '／紹介希望：' + [row[6], row[7], row[8]].filter(Boolean).join('・') : '')
    + (row[9] ? '／飯村を紹介したい方：' + row[9] : '') + (row[12] ? '／メール：' + row[12] : '');
  const old = String(cell.getValue() || '');
  cell.setValue(old ? old + '\n' + line : line);
  return h.tab + ' ' + h.r + '行の「メモ」に書き足しました';
}

/* ───────── 小さな道具 ───────── */
function startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function hm_(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function ymd_(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

/* 設置後に1回だけ実行：権限の許可と、空き時間が取れるかの確認 */
function setupCheck() {
  const r = getSlots('new', 60);
  Logger.log('予約できる日：' + r.days.length + '日　例：' + (r.days[0] ? r.days[0].label + ' ' + r.days[0].times.slice(0, 5).join(', ') : 'なし'));
}
