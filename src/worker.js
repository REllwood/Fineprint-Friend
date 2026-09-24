import { analyseSource, compareSources, normaliseSource, readingPack, readingPackModel } from './core.js';

// Runs document work off the page's main thread, so the page stays responsive and
// cancelling a job can stop it immediately by terminating this worker.
const tasks = {
  analyse({ text, source }) {
    const document = normaliseSource(text, source);
    if (document.paragraphs.length === 0) throw new RangeError('No readable text paragraphs were supplied.');
    return { document, analysis: analyseSource(document) };
  },
  compare({ previous, text, source }) {
    const next = normaliseSource(text, source);
    if (next.paragraphs.length === 0) throw new RangeError('Paste the newer version before comparing.');
    return compareSources(previous, next);
  },
  pack({ project }) {
    return { markdown: readingPack(project), model: readingPackModel(project) };
  }
};

self.addEventListener('message', ({ data }) => {
  const { id, task, payload } = data;
  try {
    if (!Object.hasOwn(tasks, task)) throw new TypeError(`Unknown task: ${task}`);
    self.postMessage({ id, value: tasks[task](payload) });
  } catch (error) {
    self.postMessage({ id, error: { name: error?.name ?? 'Error', message: error?.message ?? String(error) } });
  }
});
