// Tiny i18n layer. Locale files (/i18n/<code>.js) are classic scripts that fill self.JLL_LOCALES so the service worker
// can use the very same texts for push notifications. English is the fallback for anything missing.
export const LANGS = [['en', 'English'], ['lv', 'Latviešu'], ['ru', 'Русский'], ['uk', 'Українська']];
const LOCALE = { en: 'en-GB', lv: 'lv-LV', ru: 'ru-RU', uk: 'uk-UA' };
let cur = 'en';

export const getLang = () => cur;
export const getLocale = () => LOCALE[cur] || 'en-GB';
const dict = () => self.JLL_LOCALES || {};

export function t(key, args) {
  const d = dict();
  let s = (d[cur] && d[cur][key]) ?? (d.en && d.en[key]) ?? key;
  if (args) s = s.replace(/\{(\w+)\}/g, (m, k) => (args[k] != null ? args[k] : ''));
  return s;
}
export const has = (key) => !!(dict().en && dict().en[key]);

export function loadLang(code) {
  if (dict()[code]) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/i18n/' + code + '.js'; s.onload = resolve; s.onerror = resolve;
    document.head.appendChild(s);
  });
}

export function detectLang() {
  let saved = null;
  try { saved = localStorage.getItem('jll.lang'); } catch {}
  if (saved && LANGS.some(([c]) => c === saved)) return saved;
  const nav = (navigator.languages || [navigator.language || 'en']).map((l) => String(l).slice(0, 2).toLowerCase());
  return nav.find((l) => LANGS.some(([c]) => c === l)) || 'en';
}

export async function setLang(code, persist = true) {
  await Promise.all([loadLang('en'), loadLang(code)]);
  cur = code;
  document.documentElement.lang = code;
  if (persist) { try { localStorage.setItem('jll.lang', code); } catch {} }
  window.dispatchEvent(new Event('jll-lang'));
}

// ---- translated content of the DEFAULT tasks/cards (items carry item.tr = {en:{...}, ru:{...}}; base text is Latvian)
export function tx(item, field) {
  const tr = item && item.tr;
  if (cur === 'lv' || !tr) return item[field];
  return (tr[cur] && tr[cur][field]) || (tr.en && tr.en[field]) || item[field];
}

// ---- server error messages (English) -> current language
let ERR = null;
export async function loadErrors() {
  if (!ERR) { const m = await import('/js/errors.js'); ERR = m.ERRORS.map(([re, key]) => [new RegExp('^' + re + '$'), key]); }
}
export function te(msg) {
  if (cur === 'en' || !ERR) return msg;
  for (const [re, key] of ERR) {
    const m = re.exec(msg);
    if (m) { const k = 'e.' + key; return has(k) ? t(k, Object.fromEntries(m.slice(1).map((v, i) => [i + 1, v]))) : msg; }
  }
  return msg;
}

// ---- question and answer texts are built from structured data so every language gets a proper sentence
export function qText(q, cityName) {
  const id = q.qid || q.id;
  const p = id.split(':');
  switch (p[0]) {
    case 'radar': return t('q.radar', { km: p[1] });
    case 'thermo': return t('q.thermo', { d: +p[1] < 1000 ? p[1] + ' m' : +p[1] / 1000 + ' km' });
    case 'match': return t('q.match.' + p[1]);
    case 'measure': return p[1] === 'c' ? t('q.measure.to', { city: cityName(p[2]) }) : t('q.measure.' + p[1]);
    case 'tent': return t('q.tent.' + p[1], { km: p[2] });
    case 'photo': return t('q.photo.' + p[1]);
    default: return q.text || id;
  }
}
export function aText(q, cityName) {
  const a = q.answer, id = q.qid, p = id.split(':');
  if (!a) return '';
  if (q.cat === 'radar') return t(a.hit ? 'a.radar.yes' : 'a.radar.no', { km: p[1] });
  if (q.cat === 'thermo') return t(a.hot ? 'a.hot' : 'a.cold');
  if (q.cat === 'matching') return t(a.same ? 'a.match.yes' : 'a.match.no', { what: t('q.matchwhat.' + p[1]) });
  if (q.cat === 'measuring') return t(a.closer ? 'a.measure.yes' : 'a.measure.no');
  if (q.cat === 'tentacles') return a.outside ? t('a.tent.out', { km: p[2] }) : t('a.tent.in', { km: p[2], city: cityName(a.city) });
  return '';
}

export const noticeText = (n) => (n.key === 'announce' ? (n.args && n.args.text) || '' : t('n.' + n.key, n.args));
