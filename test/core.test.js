import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSource, compareSources, normaliseSource, readingPack } from '../src/core.js';

const versionOneText = `Synthetic subscription terms

The service automatically renews monthly and charges a recurring fee.

You may cancel at least 48 hours before renewal.

We may share personal information with third-party hosting providers.`;

const versionTwoText = `Synthetic subscription terms

The service automatically renews monthly and charges a recurring fee.

You may cancel at least 7 days before renewal.

We may share personal information with third-party hosting and analytics providers.

Disputes use arbitration under the governing law named on the order page.`;

test('source normalisation creates stable, bounded paragraph identifiers', () => {
  const document = normaliseSource(versionOneText, { title: 'Synthetic terms', method: 'test fixture' });
  assert.deepEqual(document.paragraphs.map(({ id }) => id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(document.title, 'Synthetic terms');
  assert.throws(() => normaliseSource('x'.repeat(400_001)), /limited/i);
});

test('paragraph offsets point at the source text each paragraph came from', () => {
  const document = normaliseSource('Hard-wrapped first\n   paragraph  with   gaps.\n\n\n  Second\tparagraph.\n \n\nThird.');
  assert.deepEqual(document.paragraphs.map(({ text }) => text), ['Hard-wrapped first paragraph with gaps.', 'Second paragraph.', 'Third.']);
  for (const paragraph of document.paragraphs) {
    assert.equal(document.text.slice(paragraph.start, paragraph.end).replace(/\s+/gu, ' '), paragraph.text);
  }
  assert.deepEqual(normaliseSource('Same text.\n\nSame text.').paragraphs.map(({ start, end }) => [start, end]), [[0, 10], [12, 22]]);
  assert.deepEqual(normaliseSource(' \n\n \n ').paragraphs, []);
});

test('every observation links to exact source evidence and states rule certainty', () => {
  const document = normaliseSource(versionOneText);
  const analysis = analyseSource(document);
  assert.ok(analysis.observations.length >= 3);
  for (const observation of analysis.observations) {
    assert.equal(observation.paragraphIds.length, 1);
    assert.equal(document.paragraphs.some((paragraph) => paragraph.id === observation.paragraphIds[0] && paragraph.text === observation.evidence), true);
    assert.match(observation.certainty, /rule match/);
  }
});

const categoriesIn = (text) => analyseSource(normaliseSource(text)).observations.map(({ categoryId }) => categoryId);

test('catalogue recognises common alternative wording', () => {
  const expectations = [
    ['These terms are governed by the laws of New South Wales.', 'disputes'],
    ['These terms are governed by and construed in accordance with the laws of Victoria.', 'disputes'],
    ['The laws of Victoria govern these terms.', 'disputes'],
    ['You waive any right to bring a class action.', 'disputes'],
    ['Usage data goes to third-party vendors.', 'data-use'],
    ['We sell your information to advertisers.', 'data-use'],
    ['You may request refunds within 14 days.', 'fees'],
    ['Annual plans are non-refundable.', 'fees'],
    ['We will notify you before charging your card.', 'fees'],
    ['Prices may change with notice.', 'fees'],
    ['Your subscription was canceled.', 'cancellation'],
    ['Your account is terminated immediately.', 'cancellation'],
    ['Plans renew automatically each year.', 'renewal'],
    ['Auto-renewal is on by default.', 'renewal'],
    ['We are not liable for indirect loss.', 'liability'],
    ['You provide an indemnity for claims arising from your use.', 'liability']
  ];
  for (const [text, category] of expectations) assert.ok(categoriesIn(text).includes(category), `expected ${category} for: ${text}`);
});

test('catalogue avoids common look-alike words', () => {
  assert.deepEqual(categoriesIn('Products sold in our stores are listed online.'), []);
  assert.deepEqual(categoriesIn('The government publishes guidance.'), []);
  assert.deepEqual(categoriesIn('To the extent described by applicable law, see the order page.'), []);
});

test('absence is explicitly incomplete rather than a conclusion', () => {
  const analysis = analyseSource(normaliseSource('A short unrelated sentence.'));
  assert.equal(analysis.observations.length, 0);
  assert.match(analysis.limitation, /may still be present/i);
});

test('version comparison preserves additions and removals without legal interpretation', () => {
  const comparison = compareSources(normaliseSource(versionOneText), normaliseSource(versionTwoText));
  assert.ok(comparison.changes.some(({ type, text }) => type === 'removed' && text.includes('48 hours')));
  assert.ok(comparison.changes.some(({ type, text }) => type === 'added' && text.includes('7 days')));
  assert.ok(comparison.categoryChanges.newlyDetected.includes('disputes'));
  assert.match(comparison.limitation, /without interpreting/i);
});

test('version comparison treats case and punctuation edits as wording changes', () => {
  const previous = normaliseSource('Cancellation requires notice.');
  const current = normaliseSource('cancellation requires notice!');
  const changes = compareSources(previous, current).changes;
  assert.deepEqual(changes.map(({ type }) => type), ['added', 'removed']);
  assert.equal(changes.find(({ type }) => type === 'removed').text, 'Cancellation requires notice.');
  assert.equal(changes.find(({ type }) => type === 'added').text, 'cancellation requires notice!');
});

test('reading pack includes evidence, source and explicit limitations without a rating', () => {
  const document = normaliseSource(versionOneText, { title: 'Synthetic terms', method: 'test fixture', acquiredAt: '2026-07-24' });
  const pack = readingPack({ document, analysis: analyseSource(document), questions: ['Which cancellation clock applies?'] });
  assert.match(pack, /Evidence p\d/);
  assert.match(pack, /not legal advice/i);
  assert.match(pack, /Which cancellation clock applies/);
  assert.doesNotMatch(pack, /safety score|safe contract/i);
});

test('reading pack escapes untrusted Markdown in metadata, evidence, questions and source', () => {
  const document = normaliseSource('# Hidden heading\n\n[Click](javascript:alert(1)) cancellation.', {
    title: '# Injected title',
    method: '[method](https://example.test)'
  });
  const pack = readingPack({ document, analysis: analyseSource(document), questions: ['# New heading\n- hidden list'] });
  assert.match(pack, /^# \\# Injected title/m);
  assert.doesNotMatch(pack, /^# New heading/m);
  assert.doesNotMatch(pack, /\[Click\]\(javascript:/);
  assert.match(pack, /\\\[Click\\\]\\\(javascript:alert\\\(1\\\)\\\)/);
});
