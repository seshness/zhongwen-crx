// CC-CEDICT loading, lookup, segmentation and pinyin formatting.

export const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2ebef}]/u;
const MAX_WORD_LEN = 12;

export class Dictionary {
  constructor() {
    this.entries = []; // { trad, simp, pinyin, defs: string[] }
    this.index = new Map(); // headword (trad or simp) -> entry indices
  }

  static async load(url) {
    const dict = new Dictionary();
    const text = await (await fetch(url)).text();
    const lineRe = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;
    for (const line of text.split('\n')) {
      if (!line || line[0] === '#') continue;
      const m = lineRe.exec(line);
      if (!m) continue;
      const id = dict.entries.length;
      dict.entries.push({ trad: m[1], simp: m[2], pinyin: m[3], defs: m[4].split('/') });
      dict.#add(m[1], id);
      if (m[2] !== m[1]) dict.#add(m[2], id);
    }
    return dict;
  }

  #add(key, id) {
    const list = this.index.get(key);
    if (list) list.push(id);
    else this.index.set(key, [id]);
  }

  lookup(word) {
    return (this.index.get(word) || []).map((i) => this.entries[i]);
  }

  // Greedy longest-match segmentation. Non-dictionary runs (punctuation,
  // Latin text, unknown characters) are returned as { text, entries: [] }.
  segment(text) {
    const chars = Array.from(text);
    const out = [];
    let pending = '';
    const flush = () => {
      if (pending) out.push({ text: pending, entries: [] });
      pending = '';
    };
    for (let i = 0; i < chars.length; ) {
      let found = null;
      // Words may start with Latin letters or digits (K金, 3D打印) but must
      // contain at least one Chinese character.
      if (!/\s/.test(chars[i])) {
        for (let len = Math.min(MAX_WORD_LEN, chars.length - i); len > 0; len--) {
          const w = chars.slice(i, i + len).join('');
          if (!HAN_RE.test(w)) break;
          const entries = this.lookup(w);
          if (entries.length) {
            found = { text: w, entries, len };
            break;
          }
        }
      }
      if (found) {
        flush();
        out.push({ text: found.text, entries: found.entries });
        i += found.len;
      } else {
        pending += chars[i];
        i++;
      }
    }
    flush();
    return out;
  }

  // English / pinyin search for the search box. Pinyin may be typed with or
  // without tone numbers ("ni hao", "ni3hao3", "nihao").
  search(query, limit = 40) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qCompact = q.replace(/\s+/g, '');
    const hasTones = /[1-5]/.test(qCompact);
    const wordRe = new RegExp(`(^|[^a-z])${escapeRe(q)}($|[^a-z])`, 'i');
    const pinyinHits = [];
    const defHits = [];
    for (const e of this.entries) {
      const py = e.pinyin.toLowerCase().replace(/u:/g, 'v').replace(/\s+/g, '');
      const pyBare = py.replace(/[1-5]/g, '');
      if ((hasTones ? py : pyBare) === qCompact.replace(/ü/g, 'v')) {
        pinyinHits.push(e);
      } else if (defHits.length < limit * 4 && e.defs.some((d) => wordRe.test(d))) {
        defHits.push(e);
      }
    }
    // Shorter definitions and shorter headwords are usually the best matches.
    const score = (e) =>
      Math.min(...e.defs.filter((d) => wordRe.test(d)).map((d) => d.length)) + e.simp.length * 3;
    defHits.sort((a, b) => score(a) - score(b));
    return [...pinyinHits, ...defHits].slice(0, limit);
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- Pinyin ---------------------------------------------------------------

const TONE_MARKS = {
  a: 'āáǎàa', e: 'ēéěèe', i: 'īíǐìi', o: 'ōóǒòo', u: 'ūúǔùu', ü: 'ǖǘǚǜü',
};

// "ni3" -> { text: "nǐ", tone: 3 }. Non-syllables (e.g. "C", "·") pass through.
export function syllable(raw) {
  const m = /^([a-zA-Zü:]+?)([1-5])$/.exec(raw);
  if (!m) return { text: raw.replace(/u:/g, 'ü'), tone: 0 };
  let s = m[1].replace(/u:/g, 'ü').replace(/U:/g, 'Ü');
  const tone = Number(m[2]);
  if (tone === 5) return { text: s, tone };
  const lower = s.toLowerCase();
  let pos;
  if (lower.includes('a')) pos = lower.indexOf('a');
  else if (lower.includes('e')) pos = lower.indexOf('e');
  else if (lower.includes('ou')) pos = lower.indexOf('o');
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i])) { pos = i; break; }
    }
  }
  if (pos === undefined) return { text: s, tone };
  const ch = lower[pos];
  let marked = TONE_MARKS[ch][tone - 1];
  if (s[pos] !== ch) marked = marked.toUpperCase();
  return { text: s.slice(0, pos) + marked + s.slice(pos + 1), tone };
}

export function pinyinSyllables(pinyin) {
  return pinyin.split(/\s+/).filter(Boolean).map(syllable);
}

export function pinyinText(pinyin) {
  return pinyinSyllables(pinyin).map((s) => s.text).join(' ');
}
