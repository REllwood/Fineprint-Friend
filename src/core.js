export const MAX_DOCUMENT_CHARACTERS = 400_000;
export const MAX_PARAGRAPHS = 2_000;
export const CATALOGUE_VERSION = 2;

export const CLAUSE_CATALOGUE = [
  {
    id: 'renewal',
    label: 'Renewal and recurring terms',
    terms: [/\bauto(?:matic(?:ally)?)?[- ]?renew\w*/iu, /\brenew(?:s|ed)? automatically\b/iu, /\brenewals?\b/iu, /\brecurring\b/iu],
    prompt: 'Check when renewal occurs, how notice is given and whether the text describes a way to prevent the next renewal.'
  },
  {
    id: 'cancellation',
    label: 'Cancellation and termination',
    terms: [/\bcancel(?:s|led|ed|ling|ing|lations?)?\b/iu, /\bterminat(?:e[sd]?|ing|ions?)\b/iu, /\bnotice period\b/iu],
    prompt: 'Locate the stated cancellation steps, timing and any conditions. Record questions where the process is unclear.'
  },
  {
    id: 'data-use',
    label: 'Data use and sharing',
    terms: [
      /\bpersonal (?:data|information)\b/iu,
      /\bthird[- ]part(?:y|ies)\b/iu,
      /\bshar(?:e[ds]?|ing)\b/iu,
      /\bdisclos\w*/iu,
      /\b(?:sell|sells|selling|sold)\b[^.]{0,40}\b(?:data|information)\b/iu
    ],
    prompt: 'Identify the data described, the stated purposes and the recipients named in the source passage.'
  },
  {
    id: 'disputes',
    label: 'Disputes and governing terms',
    terms: [
      /\barbitrat\w*/iu,
      /\bgovern(?:s|ed|ing)?\b[^.]{0,60}\blaws?\b|\blaws?\b[^.]{0,60}\bgovern(?:s|ed|ing)?\b/iu,
      /\bjurisdictions?\b/iu,
      /\bdisputes?\b/iu,
      /\bclass action\b/iu
    ],
    prompt: 'Note the process and location described for disputes, then ask a qualified adviser how it may apply to your circumstances.'
  },
  {
    id: 'liability',
    label: 'Liability and responsibility',
    terms: [/\bliabilit\w*/iu, /\bliable\b/iu, /\bindemni\w*/iu, /\bwarrant(?:y|ies)\b/iu, /\bdamages?\b/iu],
    prompt: 'Read which losses, responsibilities or remedies the text discusses and note any terms that need professional interpretation.'
  },
  {
    id: 'fees',
    label: 'Fees and price changes',
    terms: [/\bfees?\b/iu, /\bpric(?:e|es|ing)\b/iu, /\bcharg(?:e|es|ed|ing)\b/iu, /\b(?:non-?)?refund\w*/iu, /\bbill(?:ed|ing)\b/iu],
    prompt: 'Check when charges occur, how price changes are communicated and what the source says about refunds.'
  }
];

export function normaliseSource(value, source = {}) {
  if (typeof value !== 'string') throw new TypeError('Source material must be text.');
  if (value.length > MAX_DOCUMENT_CHARACTERS) throw new RangeError(`Documents are limited to ${MAX_DOCUMENT_CHARACTERS.toLocaleString('en-AU')} characters.`);
  const cleaned = value.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD').trim();
  // Paragraphs are separated by blank lines. start/end index the paragraph's span in `text`;
  // the paragraph's own text has its internal whitespace collapsed.
  const spans = [];
  let cursor = 0;
  for (const separator of cleaned.matchAll(/\n\s*\n/gu)) {
    spans.push([cursor, separator.index]);
    cursor = separator.index + separator[0].length;
  }
  spans.push([cursor, cleaned.length]);
  const trimmedSpans = spans
    .map(([start, end]) => {
      const raw = cleaned.slice(start, end);
      return [start + raw.length - raw.trimStart().length, end - (raw.length - raw.trimEnd().length)];
    })
    .filter(([start, end]) => end > start);
  if (trimmedSpans.length > MAX_PARAGRAPHS) throw new RangeError(`Documents are limited to ${MAX_PARAGRAPHS.toLocaleString('en-AU')} paragraphs.`);
  const paragraphs = trimmedSpans.map(([start, end], index) => ({
    id: `p${index + 1}`,
    number: index + 1,
    text: cleaned.slice(start, end).replace(/\s+/gu, ' '),
    start,
    end
  }));
  return {
    version: 1,
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim().slice(0, 160) : 'Untitled supplied document',
    acquiredAt: typeof source.acquiredAt === 'string' ? source.acquiredAt.slice(0, 80) : new Date(0).toISOString(),
    method: typeof source.method === 'string' ? source.method.slice(0, 80) : 'pasted text',
    text: cleaned,
    paragraphs,
    warnings: paragraphs.length === 0 ? ['No readable text paragraphs were supplied.'] : []
  };
}

const listFormat = new Intl.ListFormat('en-AU', { type: 'conjunction' });

export function analyseSource(document) {
  if (!document || !Array.isArray(document.paragraphs)) throw new TypeError('A normalised source document is required.');
  const observations = [];
  for (const paragraph of document.paragraphs) {
    for (const category of CLAUSE_CATALOGUE) {
      const matches = category.terms.map((term) => paragraph.text.match(term)?.[0]).filter(Boolean);
      if (matches.length === 0) continue;
      const matchedText = [...new Map(matches.map((text) => [text.toLocaleLowerCase('en-AU'), text])).values()];
      observations.push({
        id: `${category.id}:${paragraph.id}`,
        categoryId: category.id,
        category: category.label,
        paragraphIds: [paragraph.id],
        evidence: paragraph.text,
        matchedText,
        rationale: `The local rules matched ${listFormat.format(matchedText.map((text) => `“${text}”`))} in paragraph ${paragraph.number}.`,
        certainty: matches.length >= 2 ? 'multiple rule matches' : 'limited rule match',
        prompt: category.prompt
      });
    }
  }
  return {
    catalogueVersion: CATALOGUE_VERSION,
    observations,
    absentCategories: CLAUSE_CATALOGUE.filter((category) => !observations.some((item) => item.categoryId === category.id)).map(({ id, label }) => ({ id, label })),
    limitation: 'Rule detection can miss unusual drafting. A category not detected may still be present.'
  };
}

export function groupObservations(observations) {
  return CLAUSE_CATALOGUE
    .map(({ id, label, prompt }) => ({ categoryId: id, category: label, prompt, observations: observations.filter(({ categoryId }) => categoryId === id) }))
    .filter((group) => group.observations.length > 0);
}

const PAIRING_THRESHOLD = 0.5;
const PAIRING_WINDOW = 20;
const MAX_WORD_DIFF_CELLS = 250_000;

function wordSimilarity(a, b) {
  const wordsIn = (text) => new Set(text.toLocaleLowerCase('en-AU').match(/[\p{L}\p{N}]+/gu) ?? []);
  const left = wordsIn(a);
  const right = wordsIn(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

// Within a run of removed and added paragraphs, pair up the ones that are clearly edits of each other.
function pairEdits(removed, added) {
  const pairs = [];
  let nextAdded = 0;
  for (let r = 0; r < removed.length; r += 1) {
    for (let a = nextAdded; a < Math.min(added.length, nextAdded + PAIRING_WINDOW); a += 1) {
      if (wordSimilarity(removed[r].text, added[a].text) >= PAIRING_THRESHOLD) {
        pairs.push([r, a]);
        nextAdded = a + 1;
        break;
      }
    }
  }
  const result = [];
  let r = 0;
  let a = 0;
  for (const [pairedRemoved, pairedAdded] of pairs) {
    while (r < pairedRemoved) result.push(removed[r++]);
    while (a < pairedAdded) result.push(added[a++]);
    const before = removed[r++];
    const after = added[a++];
    result.push({ type: 'modified', previousId: before.previousId, currentId: after.currentId, previousText: before.text, text: after.text, words: diffWords(before.text, after.text) });
  }
  while (r < removed.length) result.push(removed[r++]);
  while (a < added.length) result.push(added[a++]);
  return result;
}

// Word-level changes between two paragraph texts. Segments hold whole words (type same, removed
// or added); joining the same and added segments with single spaces rebuilds the current text,
// and the same and removed segments the previous text.
export function diffWords(previousText, currentText) {
  const left = previousText.split(/\s+/u).filter(Boolean);
  const right = currentText.split(/\s+/u).filter(Boolean);
  if (left.length * right.length > MAX_WORD_DIFF_CELLS) {
    return [{ type: 'removed', text: left.join(' ') }, { type: 'added', text: right.join(' ') }].filter(({ text }) => text);
  }
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const segments = [];
  const push = (type, words) => {
    if (words.length === 0) return;
    const last = segments.at(-1);
    if (last?.type === type) last.text += ` ${words.join(' ')}`;
    else segments.push({ type, text: words.join(' ') });
  };
  let removedRun = [];
  let addedRun = [];
  const flush = () => {
    push('removed', removedRun);
    push('added', addedRun);
    removedRun = [];
    addedRun = [];
  };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      flush();
      push('same', [right[j]]);
      i += 1;
      j += 1;
    } else if (i < left.length && (j === right.length || table[i + 1][j] >= table[i][j + 1])) {
      removedRun.push(left[i]);
      i += 1;
    } else {
      addedRun.push(right[j]);
      j += 1;
    }
  }
  flush();
  return segments;
}

export function compareSources(previous, current) {
  if (!previous?.paragraphs || !current?.paragraphs) throw new TypeError('Two normalised source documents are required.');
  const left = previous.paragraphs;
  const right = current.paragraphs;
  if (left.length > MAX_PARAGRAPHS || right.length > MAX_PARAGRAPHS) throw new RangeError(`Comparison is limited to ${MAX_PARAGRAPHS.toLocaleString('en-AU')} paragraphs per version.`);
  const unchanged = (before, after) => ({ type: 'unchanged', previousId: before.id, currentId: after.id, text: after.text });
  // Matching opening and closing paragraphs never need the table, which keeps typical comparisons small.
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix].text === right[prefix].text) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix].text === right[right.length - 1 - suffix].text) suffix += 1;
  const middleLeft = left.slice(prefix, left.length - suffix);
  const middleRight = right.slice(prefix, right.length - suffix);
  const table = Array.from({ length: middleLeft.length + 1 }, () => new Uint16Array(middleRight.length + 1));
  for (let i = middleLeft.length - 1; i >= 0; i -= 1) {
    for (let j = middleRight.length - 1; j >= 0; j -= 1) {
      table[i][j] = middleLeft[i].text === middleRight[j].text
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changes = [];
  for (let k = 0; k < prefix; k += 1) changes.push(unchanged(left[k], right[k]));
  let removed = [];
  let added = [];
  const flush = () => {
    changes.push(...pairEdits(removed, added));
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < middleLeft.length || j < middleRight.length) {
    if (i < middleLeft.length && j < middleRight.length && middleLeft[i].text === middleRight[j].text) {
      flush();
      changes.push(unchanged(middleLeft[i], middleRight[j]));
      i += 1;
      j += 1;
    } else if (j < middleRight.length && (i === middleLeft.length || table[i][j + 1] >= table[i + 1][j])) {
      added.push({ type: 'added', currentId: middleRight[j].id, text: middleRight[j].text });
      j += 1;
    } else {
      removed.push({ type: 'removed', previousId: middleLeft[i].id, text: middleLeft[i].text });
      i += 1;
    }
  }
  flush();
  for (let k = suffix; k > 0; k -= 1) changes.push(unchanged(left[left.length - k], right[right.length - k]));
  const previousCategories = new Set(analyseSource(previous).observations.map(({ categoryId }) => categoryId));
  const currentCategories = new Set(analyseSource(current).observations.map(({ categoryId }) => categoryId));
  return {
    changes,
    categoryChanges: {
      newlyDetected: [...currentCategories].filter((item) => !previousCategories.has(item)),
      noLongerDetected: [...previousCategories].filter((item) => !currentCategories.has(item))
    },
    limitation: 'Wording changes are shown without interpreting their legal effect.'
  };
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\r\n?|\n/gu, ' ')
    .replace(/([\\`*_{}\[\]()<>#+.!|>-])/gu, '\\$1');
}

// The pack's content as plain text, shared by the Markdown export and the print view.
export function readingPackModel(project) {
  if (!project?.document?.paragraphs || !project?.analysis?.observations) throw new TypeError('An analysed project is required.');
  const questions = Array.isArray(project.questions)
    ? project.questions.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 1_000)).slice(0, 100)
    : [];
  return {
    title: project.document.title,
    disclaimer: 'Informational reading guide. It may be incomplete and is not legal advice. It does not judge fairness, enforceability or safety.',
    details: [
      ['Source method', project.document.method],
      ['Source date', project.document.acquiredAt],
      ['Catalogue version', String(project.analysis.catalogueVersion)]
    ],
    guide: groupObservations(project.analysis.observations).map((group) => ({
      category: group.category,
      prompt: group.prompt,
      evidence: group.observations.map(({ paragraphIds, certainty, evidence, rationale }) => ({ paragraphIds, certainty, text: evidence, rationale }))
    })),
    emptyGuideNote: 'No catalogue categories were detected. This does not mean they are absent.',
    questions,
    noQuestionsNote: 'No questions recorded.',
    paragraphs: project.document.paragraphs.map(({ id, text }) => ({ id, text }))
  };
}

export function readingPack(project) {
  const pack = readingPackModel(project);
  const lines = [`# ${escapeMarkdown(pack.title)}`, '', pack.disclaimer, ''];
  pack.details.forEach(([label, value]) => lines.push(`${label}: ${escapeMarkdown(value)}`));
  lines.push('', '## Reading guide', '');
  if (pack.guide.length === 0) lines.push(pack.emptyGuideNote, '');
  for (const group of pack.guide) {
    lines.push(`### ${escapeMarkdown(group.category)}`, '', escapeMarkdown(group.prompt), '');
    for (const item of group.evidence) {
      lines.push(`Evidence ${item.paragraphIds.map(escapeMarkdown).join(', ')} (${escapeMarkdown(item.certainty)}):`, '', `> ${escapeMarkdown(item.text)}`, '', escapeMarkdown(item.rationale), '');
    }
  }
  lines.push('## My questions', '');
  if (pack.questions.length === 0) lines.push(`- ${pack.noQuestionsNote}`);
  else pack.questions.forEach((question) => lines.push(`- ${escapeMarkdown(question)}`));
  lines.push('', '## Numbered source', '');
  pack.paragraphs.forEach(({ id, text }) => lines.push(`${escapeMarkdown(id)}. ${escapeMarkdown(text)}`, ''));
  return lines.join('\n').trim();
}
