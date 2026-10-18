import { Dictionary, HAN_RE, pinyinSyllables, pinyinText } from './dict.js';
import { analyticsConfigured, isAnalyticsEnabled, setAnalyticsEnabled, track } from '../analytics.js';

const HAN = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{20000}-\\u{2ebef}';
// CC-CEDICT cross-references: 開金|开金[kai1 jin1], 基友[ji1 you3], or bare 中文.
const XREF_RE = new RegExp(`([${HAN}]+)(?:\\|([${HAN}]+))?(?:\\[([^\\]]+)\\])?`, 'gu');

const $ = (sel) => document.querySelector(sel);
const view = $('#view');

let dict = null;
let script = 'trad'; // 'trad' | 'simp'
const history = [];
let pos = -1;

// ---- Navigation -----------------------------------------------------------

// History entries carry a `scroll` offset so going back to a long list of
// words returns to where you were.
const sameState = (a, b) => JSON.stringify({ ...a, scroll: 0 }) === JSON.stringify({ ...b, scroll: 0 });

function saveScroll() {
  if (history[pos]) history[pos].scroll = view.scrollTop;
}

// `source` says how the lookup was triggered, for anonymous usage stats; the
// looked-up text itself is never sent.
function navigate(state, source = 'click') {
  const cur = history[pos];
  if (cur && sameState(cur, state)) return render();
  track('lookup', {
    source,
    view: state.kind,
    script,
    ...(state.kind === 'text' && { words: dict.segment(state.text).filter((s) => s.entries.length).length }),
  });
  saveScroll();
  history.splice(pos + 1);
  history.push(state);
  pos = history.length - 1;
  render();
}

function go(delta) {
  const next = pos + delta;
  if (next < 0 || next >= history.length) return;
  saveScroll();
  pos = next;
  track('history_nav', { direction: delta < 0 ? 'back' : 'forward' });
  render();
}

// Empties the back/forward stack and search box, returning to the start screen.
// The stored page selection is dropped too so reopening the panel starts fresh.
function clearAll() {
  if (history.length || $('#search').value) track('clear');
  history.length = 0;
  pos = -1;
  $('#search').value = '';
  chrome.storage.session.remove('lastSelection');
  render();
}

function lookupText(text, source) {
  text = text.trim();
  if (!text) return;
  if (HAN_RE.test(text)) {
    const segs = dict.segment(text);
    // A single dictionary word goes straight to its entry page.
    if (segs.length === 1 && segs[0].entries.length) navigate({ kind: 'word', word: segs[0].text }, source);
    else navigate({ kind: 'text', text }, source);
  } else {
    navigate({ kind: 'search', q: text }, source);
  }
}

// ---- Rendering helpers ----------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const zhLang = () => (script === 'trad' ? 'zh-Hant' : 'zh-Hans');
const primary = (e) => (script === 'trad' ? e.trad : e.simp);
const secondary = (e) => (script === 'trad' ? e.simp : e.trad);

function pinyinEl(pinyin, cls = 'pinyin') {
  const sylls = pinyinSyllables(pinyin);
  return el('span', { class: cls },
    sylls.map((s, i) => [i ? ' ' : '', el('span', { class: `t${s.tone || 5}` }, s.text)]));
}

// Hanzi coloured by tone when characters and syllables line up one-to-one.
function hanziEl(word, pinyin, cls = 'hz') {
  const chars = Array.from(word);
  const sylls = pinyin ? pinyinSyllables(pinyin) : [];
  const node = el('span', { class: cls, lang: zhLang() });
  if (sylls.length === chars.length) {
    chars.forEach((c, i) => node.append(el('span', { class: `t${sylls[i].tone || 5}` }, c)));
  } else {
    node.textContent = word;
  }
  return node;
}

// Plain-text version of a definition for one-line glosses: 開金|开金[kai1 jin1] -> 開金
function plainDef(def) {
  return def.replace(XREF_RE, (_, trad, simp) => (script === 'simp' && simp ? simp : trad));
}

function shortGloss(entries) {
  return entries.map((e) => plainDef(e.defs[0])).filter((d, i, a) => a.indexOf(d) === i).join('; ');
}

// Turns Chinese words inside a definition into links.
function definitionEl(def) {
  const li = el('li');
  let last = 0;
  for (const m of def.matchAll(XREF_RE)) {
    li.append(def.slice(last, m.index));
    const [, trad, simp, py] = m;
    const shown = script === 'simp' && simp ? simp : trad;
    const link = el('a', {
      class: 'xref',
      lang: zhLang(),
      title: py ? `${shown} ${pinyinText(py)}` : shown,
      onclick: (ev) => {
        ev.preventDefault();
        if (dict.lookup(trad).length) navigate({ kind: 'word', word: trad, pinyin: py || null }, 'definition_link');
        else lookupText(trad, 'definition_link');
      },
    }, shown);
    if (py) link.append(el('span', { class: 'xpy' }, `[${pinyinText(py)}]`));
    li.append(link);
    last = m.index + m[0].length;
  }
  li.append(def.slice(last));
  return li;
}

const SPEAKER_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/>' +
  '<path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>';

function speakButton(text) {
  const btn = el('button', { class: 'icon-btn speak', title: 'Listen' });
  btn.innerHTML = SPEAKER_SVG;
  btn.addEventListener('click', () => speak(text, btn));
  return btn;
}

// ---- Views ----------------------------------------------------------------

// Entries whose headword (in the current script) is the word itself come first,
// ahead of e.g. old variants that merely simplify to it.
function sortedEntries(word) {
  const rank = (e) => (primary(e) === word ? 0 : e.trad === word ? 1 : 2);
  return dict.lookup(word).sort((a, b) => rank(a) - rank(b));
}

const CHEVRON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

// One card per distinct traditional/simplified pair, with each reading listed.
// With `open`, the headword links to the word's dedicated page.
function entryCards(entries, preferPinyin, open) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.trad}\t${e.simp}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const norm = (p) => p.toLowerCase().replace(/\s+/g, '');
  const cards = [];
  for (const group of groups.values()) {
    if (preferPinyin) {
      group.sort((a, b) => (norm(b.pinyin) === norm(preferPinyin)) - (norm(a.pinyin) === norm(preferPinyin)));
    }
    const head = group[0];
    const word = primary(head);
    const other = secondary(head);
    let hz = hanziEl(word, group.every((e) => norm(e.pinyin) === norm(head.pinyin)) ? head.pinyin : null,
      `hanzi${Array.from(word).length > 4 ? ' long' : ''}`);
    let openBtn = null;
    if (open) {
      openBtn = el('button', { class: 'icon-btn open', title: `Open ${word}`, onclick: open });
      openBtn.innerHTML = CHEVRON_SVG;
      const link = el('button', { class: 'headword-link', title: `Open ${word}`, onclick: open }, hz);
      hz = link;
    }
    cards.push(el('section', { class: 'card' },
      el('div', { class: 'head' },
        el('div', { class: 'head-text' },
          hz,
          other !== word && el('span', { class: 'alt', lang: script === 'trad' ? 'zh-Hans' : 'zh-Hant',
            title: script === 'trad' ? 'Simplified' : 'Traditional' }, other)),
        speakButton(word),
        openBtn),
      group.map((e) => el('div', { class: 'reading' },
        pinyinEl(e.pinyin),
        el('ol', { class: 'defs' }, e.defs.map(definitionEl)))),
    ));
  }
  return cards;
}

function chip(word, entries, onclick) {
  const e = entries[0];
  return el('button', { class: 'chip', onclick },
    hanziEl(word, e.pinyin),
    pinyinEl(e.pinyin, 'py'),
    el('span', { class: 'gloss' }, shortGloss(entries)));
}

function listRow(e) {
  return el('button', { class: 'list-row', onclick: () => navigate({ kind: 'word', word: e.trad, pinyin: e.pinyin }, 'word_list') },
    hanziEl(primary(e), e.pinyin),
    pinyinEl(e.pinyin, 'py'),
    el('span', { class: 'gloss' }, e.defs.map(plainDef).join('; ')));
}

function renderWord({ word, pinyin }) {
  const entries = sortedEntries(word);
  if (!entries.length) return renderText({ text: word });
  const out = [...entryCards(entries, pinyin)];

  const chars = Array.from(word);
  if (chars.length > 1) {
    const seen = new Set();
    const shown = Array.from(primary(entries[0]));
    const chips = [];
    chars.forEach((c, i) => {
      if (seen.has(c)) return;
      seen.add(c);
      const ce = dict.lookup(c);
      const display = shown[i] || c;
      if (ce.length) chips.push(chip(display, ce, () => navigate({ kind: 'word', word: c }, 'character')));
    });
    if (chips.length) {
      out.push(el('div', { class: 'section-label' }, 'Characters'), el('div', { class: 'chips' }, chips));
    }
  }

  if (chars.length <= 2) {
    const compounds = findCompounds(word, 30);
    if (compounds.length) {
      out.push(el('div', { class: 'section-label' }, `Words with ${primary(entries[0])}`),
        el('div', {}, compounds.map(listRow)));
    }
  }
  return out;
}

function findCompounds(word, limit) {
  const hits = [];
  const seen = new Set();
  for (const e of dict.entries) {
    if (e.trad === word || e.simp === word) continue;
    if (!e.trad.includes(word) && !e.simp.includes(word)) continue;
    if (e.trad.length > 4 || /^(surname|variant of|old variant|see )/.test(e.defs[0])) continue;
    if (seen.has(e.trad)) continue;
    seen.add(e.trad);
    hits.push(e);
  }
  // Prefer short words and words that start with the query.
  const rank = (e) => e.trad.length * 2 - (e.trad.startsWith(word) || e.simp.startsWith(word) ? 1 : 0);
  return hits.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

function renderText({ text }) {
  const segs = dict.segment(text);
  const sentence = el('div', { class: 'sentence' });
  const details = [];
  const seen = new Set();
  for (const s of segs) {
    if (!s.entries.length) {
      if (s.text.trim()) sentence.append(el('span', { class: 'token plain' }, el('span', { class: 'py' }, ' '),
        el('span', { class: 'hz', lang: zhLang() }, s.text)));
      continue;
    }
    const e = s.entries[0];
    const display = s.entries.find((x) => x.trad === s.text || x.simp === s.text);
    const shown = script === 'trad' ? display.trad : display.simp;
    const open = () => navigate({ kind: 'word', word: s.text }, 'selection_word');
    sentence.append(el('button', { class: 'token', onclick: open, title: shortGloss(s.entries) },
      pinyinEl(e.pinyin, 'py'), hanziEl(shown, e.pinyin)));
    if (!seen.has(s.text)) {
      seen.add(s.text);
      details.push(el('div', { class: 'word-block' }, entryCards(sortedEntries(s.text), null, open)));
    }
  }
  const out = [el('div', { class: 'section-label' }, 'Selection'), sentence];
  if (details.length) {
    out.push(el('div', { class: 'section-label' }, `${details.length} word${details.length > 1 ? 's' : ''}`),
      ...details);
  }
  return out;
}

function renderSearch({ q }) {
  const results = dict.search(q);
  if (!results.length) return [el('div', { class: 'empty' }, `No results for “${q}”.`)];
  return [el('div', { class: 'section-label' }, `Results for “${q}”`), el('div', {}, results.map(listRow))];
}

function renderEmpty() {
  return [el('div', { class: 'empty' },
    el('span', { class: 'big', lang: zhLang() }, '中文'),
    'Highlight Chinese text on any page to look it up here.',
    el('br'), el('br'),
    'Click any linked word to follow it, and use ← → (or ',
    el('kbd', {}, 'Alt'), '+', el('kbd', {}, '←'), ') to go back.',
    el('br'), el('br'),
    'Tip: you can highlight text inside this panel too — try the ',
    el('span', { lang: 'zh-Hant' }, '繁'), ' / ', el('span', { lang: 'zh-Hans' }, '简'), ' switch.')];
}

function render() {
  $('#back').disabled = pos <= 0;
  $('#forward').disabled = pos >= history.length - 1;
  $('#clear').disabled = history.length === 0 && !$('#search').value;
  document.querySelectorAll('.script-toggle [data-script]').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.script === script)));
  if (!dict) return;

  const state = history[pos];
  const nodes = !state ? renderEmpty()
    : state.kind === 'word' ? renderWord(state)
    : state.kind === 'text' ? renderText(state)
    : renderSearch(state);
  view.replaceChildren(...nodes);
  view.scrollTop = state?.scroll || 0;

  const input = $('#search');
  if (document.activeElement !== input) {
    input.value = !state ? '' : state.kind === 'word' ? state.word : state.kind === 'text' ? state.text : state.q;
  }
}

// ---- Pronunciation --------------------------------------------------------

let voices = null;

// Mandarin voice for the current script. Voices installed on the device are
// preferred; Chrome's "remote" (Google network) voices send the text to Google,
// so they are used only when no local Mandarin voice exists.
async function pickVoice() {
  if (!voices) voices = await chrome.tts.getVoices();
  const langs = script === 'trad' ? ['zh-TW', 'zh-CN'] : ['zh-CN', 'zh-TW'];
  const matches = (v, lang) => v.lang && v.lang.replace('_', '-').startsWith(lang);
  for (const remote of [false, true]) {
    for (const lang of langs) {
      const v = voices.find((x) => !!x.remote === remote && matches(x, lang));
      if (v) return v;
    }
  }
  // zh-HK voices speak Cantonese, so they are a last resort.
  return voices.find((x) => !x.remote && matches(x, 'zh')) || voices.find((x) => matches(x, 'zh')) || null;
}

const voiceKind = (v) => (!v ? 'none' : v.remote ? 'remote' : 'local');

async function speak(text, btn) {
  const voice = await pickVoice();
  track('speak', { script, voice: voiceKind(voice) });
  btn?.classList.add('playing');
  const done = () => btn?.classList.remove('playing');
  chrome.tts.speak(text, {
    voiceName: voice?.voiceName,
    lang: voice?.lang || (script === 'trad' ? 'zh-TW' : 'zh-CN'),
    rate: 0.8,
    onEvent: (ev) => {
      if (['end', 'interrupted', 'cancelled', 'error'].includes(ev.type)) done();
    },
  });
}

// ---- Wiring ---------------------------------------------------------------

$('#back').addEventListener('click', () => go(-1));
$('#forward').addEventListener('click', () => go(1));
$('#clear').addEventListener('click', clearAll);
$('#search').addEventListener('input', () => {
  $('#clear').disabled = history.length === 0 && !$('#search').value;
});
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') go(-1);
  if (e.altKey && e.key === 'ArrowRight') go(1);
  // Esc in a non-empty search box just clears the box (native behaviour).
  if (e.key === 'Escape' && !(e.target === $('#search') && $('#search').value)) clearAll();
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#search').value;
  $('#search').blur();
  if (dict) lookupText(q, 'search');
});

// The 繁/简 labels are selectable text: a plain click switches character set,
// while highlighting them (handled below) looks the character up instead.
function setScript(value) {
  if (value === script) return;
  script = value;
  chrome.storage.local.set({ script });
  track('script_change', { script });
  render();
}

document.querySelectorAll('.script-toggle [data-script]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && btn.contains(sel.anchorNode)) return;
    setScript(btn.dataset.script);
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setScript(btn.dataset.script);
    }
  });
});

// Highlighting Chinese text anywhere in the panel looks it up.
document.addEventListener('mouseup', (e) => {
  if (e.target.closest('input')) return;
  setTimeout(() => {
    const text = window.getSelection()?.toString().trim();
    if (!dict || !text || !HAN_RE.test(text)) return;
    window.getSelection().removeAllRanges();
    lookupText(text, 'panel_highlight');
  }, 0);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.lastSelection?.newValue && dict) {
    const { text, source } = changes.lastSelection.newValue;
    lookupText(text, source || 'page');
  }
  if (area === 'local' && changes.script && changes.script.newValue !== script) {
    script = changes.script.newValue; // Keep multiple windows' panels in sync.
    render();
  }
});

// Usage-stats opt-out. Only shown in builds that have analytics credentials.
async function initAnalyticsToggle() {
  if (!analyticsConfigured) return;
  const toggle = $('#analytics-toggle');
  toggle.checked = await isAnalyticsEnabled();
  $('#analytics-row').hidden = false;
  toggle.addEventListener('change', async () => {
    // Opting out sends nothing, not even an "opted out" event.
    await setAnalyticsEnabled(toggle.checked);
    if (toggle.checked) track('analytics_enabled');
  });
}

(async () => {
  initAnalyticsToggle();
  track('page_view', { page_title: 'Side panel', page_location: location.href });
  const stored = await chrome.storage.local.get('script');
  if (stored.script === 'simp' || stored.script === 'trad') script = stored.script;
  render();

  const t0 = performance.now();
  dict = await Dictionary.load(chrome.runtime.getURL('data/cedict_ts.u8'));
  console.log(`Loaded ${dict.entries.length} entries in ${Math.round(performance.now() - t0)} ms`);

  const { lastSelection } = await chrome.storage.session.get('lastSelection');
  if (lastSelection?.text) lookupText(lastSelection.text, lastSelection.source || 'page');
  else render();
})();
