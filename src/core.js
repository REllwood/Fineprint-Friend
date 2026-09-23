export const MAX_DOCUMENT_CHARACTERS = 400_000;
export const MAX_PARAGRAPHS = 2_000;

export const CLAUSE_CATALOGUE = [
  {
    id: 'renewal',
    label: 'Renewal and recurring terms',
    terms: [/\bautomatic(?:ally)? renew\w*/iu, /\brenewal\b/iu, /\brecurring\b/iu],
    prompt: 'Check when renewal occurs, how notice is given and whether the text describes a way to prevent the next renewal.'
  },
  {
    id: 'cancellation',
    label: 'Cancellation and termination',
    terms: [/\bcancel(?:lation|led|ing)?\b/iu, /\bterminat(?:e|ion)\b/iu, /\bnotice period\b/iu],
    prompt: 'Locate the stated cancellation steps, timing and any conditions. Record questions where the process is unclear.'
  },
  {
    id: 'data-use',
    label: 'Data use and sharing',
    terms: [/\bpersonal (?:data|information)\b/iu, /\bthird part(?:y|ies)\b/iu, /\bshare[ds]?\b/iu, /\bdisclos\w*\b/iu],
    prompt: 'Identify the data described, the stated purposes and the recipients named in the source passage.'
  },
  {
    id: 'disputes',
    label: 'Disputes and governing terms',
    terms: [/\barbitration\b/iu, /\bgovern(?:ing|ed by) (?:the )?law\b/iu, /\bjurisdiction\b/iu, /\bdisputes?\b/iu],
    prompt: 'Note the process and location described for disputes, then ask a qualified adviser how it may apply to your circumstances.'
  },
  {
    id: 'liability',
    label: 'Liability and responsibility',
    terms: [/\bliabilit\w*\b/iu, /\bindemnif\w*\b/iu, /\bwarrant(?:y|ies)\b/iu, /\bdamages\b/iu],
    prompt: 'Read which losses, responsibilities or remedies the text discusses and note any terms that need professional interpretation.'
  },
  {
    id: 'fees',
    label: 'Fees and price changes',
    terms: [/\bfee[s]?\b/iu, /\bprice change\w*\b/iu, /\bcharg(?:e|ed|es)\b/iu, /\brefund\b/iu],
    prompt: 'Check when charges occur, how price changes are communicated and what the source says about refunds.'
  }
];

export function normaliseSource(value, source = {}) {
  if (typeof value !== 'string') throw new TypeError('Source material must be text.');
  if (value.length > MAX_DOCUMENT_CHARACTERS) throw new RangeError(`Documents are limited to ${MAX_DOCUMENT_CHARACTERS.toLocaleString('en-AU')} characters.`);
  const cleaned = value.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD').trim();
  const rawParagraphs = cleaned ? cleaned.split(/\n\s*\n+/u).map((text) => text.replace(/\s*\n\s*/g, ' ').replace(/\s+/gu, ' ').trim()).filter(Boolean) : [];
  if (rawParagraphs.length > MAX_PARAGRAPHS) throw new RangeError(`Documents are limited to ${MAX_PARAGRAPHS.toLocaleString('en-AU')} paragraphs.`);
  let offset = 0;
  const paragraphs = rawParagraphs.map((text, index) => {
    const start = cleaned.indexOf(text, offset);
    const safeStart = start >= 0 ? start : offset;
    offset = safeStart + text.length;
    return { id: `p${index + 1}`, number: index + 1, text, start: safeStart, end: safeStart + text.length };
  });
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

export function analyseSource(document) {
  if (!document || !Array.isArray(document.paragraphs)) throw new TypeError('A normalised source document is required.');
  const observations = [];
  for (const paragraph of document.paragraphs) {
    for (const category of CLAUSE_CATALOGUE) {
      const matches = category.terms.filter((term) => term.test(paragraph.text)).map((term) => term.source);
      if (matches.length === 0) continue;
      observations.push({
        id: `${category.id}:${paragraph.id}`,
        categoryId: category.id,
        category: category.label,
        paragraphIds: [paragraph.id],
        evidence: paragraph.text,
        rationale: `The local rule matched ${matches.length} catalogue ${matches.length === 1 ? 'expression' : 'expressions'} in paragraph ${paragraph.number}.`,
        certainty: matches.length >= 2 ? 'multiple rule matches' : 'limited rule match',
        prompt: category.prompt
      });
    }
  }
  return {
    catalogueVersion: 1,
    observations,
    absentCategories: CLAUSE_CATALOGUE.filter((category) => !observations.some((item) => item.categoryId === category.id)).map(({ id, label }) => ({ id, label })),
    limitation: 'Rule detection can miss unusual drafting. A category not detected may still be present.'
  };
}

export function compareSources(previous, current) {
  if (!previous?.paragraphs || !current?.paragraphs) throw new TypeError('Two normalised source documents are required.');
  const left = previous.paragraphs;
  const right = current.paragraphs;
  if (left.length > 800 || right.length > 800) throw new RangeError('Comparison is limited to 800 paragraphs per version.');
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i].text === right[j].text
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i].text === right[j].text) {
      changes.push({ type: 'unchanged', previousId: left[i].id, currentId: right[j].id, text: right[j].text });
      i += 1;
      j += 1;
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      changes.push({ type: 'added', currentId: right[j].id, text: right[j].text });
      j += 1;
    } else {
      changes.push({ type: 'removed', previousId: left[i].id, text: left[i].text });
      i += 1;
    }
  }
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

export function readingPack(project) {
  if (!project?.document?.paragraphs || !project?.analysis?.observations) throw new TypeError('An analysed project is required.');
  const questions = Array.isArray(project.questions)
    ? project.questions.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 1_000)).slice(0, 100)
    : [];
  const lines = [
    `# ${escapeMarkdown(project.document.title)}`,
    '',
    'Informational reading guide. It may be incomplete and is not legal advice. It does not judge fairness, enforceability or safety.',
    '',
    `Source method: ${escapeMarkdown(project.document.method)}`,
    `Source date: ${escapeMarkdown(project.document.acquiredAt)}`,
    `Catalogue version: ${project.analysis.catalogueVersion}`,
    '',
    '## Reading guide',
    ''
  ];
  if (project.analysis.observations.length === 0) lines.push('No catalogue categories were detected. This does not mean they are absent.', '');
  for (const observation of project.analysis.observations) {
    lines.push(`### ${escapeMarkdown(observation.category)}`, '', escapeMarkdown(observation.prompt), '', `Evidence ${observation.paragraphIds.map(escapeMarkdown).join(', ')} (${escapeMarkdown(observation.certainty)}):`, '', `> ${escapeMarkdown(observation.evidence)}`, '');
  }
  lines.push('## My questions', '');
  if (questions.length === 0) lines.push('- No questions recorded.');
  else questions.forEach((question) => lines.push(`- ${escapeMarkdown(question)}`));
  lines.push('', '## Numbered source', '');
  project.document.paragraphs.forEach((paragraph) => lines.push(`${escapeMarkdown(paragraph.id)}\. ${escapeMarkdown(paragraph.text)}`, ''));
  return lines.join('\n').trim();
}
