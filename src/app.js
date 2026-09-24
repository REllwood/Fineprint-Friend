import { analyseSource, compareSources, groupObservations, normaliseSource, readingPack } from './core.js';

const storageKey = 'fineprint-friend:v0.1';
const sample = `STREAMBIRD SUBSCRIPTION TERMS — SYNTHETIC VERSION ONE

Your subscription automatically renews each month and the monthly fee is charged on the renewal date.

You may cancel through the account page at least 48 hours before the next renewal. Cancellation takes effect at the end of the current paid period.

We use personal information to provide the service. We may share account identifiers with third-party payment and hosting providers for those stated purposes.

To the extent described by applicable law, our liability for service interruption is limited to fees paid in the previous month.

These synthetic terms are governed by the law stated on your order page. Contact support with questions.`;

const sampleV2 = `STREAMBIRD SUBSCRIPTION TERMS — SYNTHETIC VERSION TWO

Your subscription automatically renews each month and the monthly fee is charged on the renewal date.

You may cancel through the account page at least 7 days before the next renewal. Cancellation takes effect at the end of the current paid period.

We use personal information to provide the service. We may share account identifiers with third-party payment, analytics and hosting providers for those stated purposes.

To the extent described by applicable law, our liability for service interruption is limited to fees paid in the previous month.

Disputes are handled through the process stated on your order page. Contact support with questions.`;

const elements = {
  title: document.querySelector('#document-title'),
  input: document.querySelector('#source-input'),
  file: document.querySelector('#source-file'),
  status: document.querySelector('#job-status'),
  cancel: document.querySelector('#cancel-job'),
  roomStatus: document.querySelector('#room-job-status'),
  roomCancel: document.querySelector('#room-cancel-job'),
  dialogStatus: document.querySelector('#dialog-job-status'),
  dialogCancel: document.querySelector('#dialog-cancel-job'),
  intake: document.querySelector('#intake'),
  room: document.querySelector('#reading-room'),
  projectTitle: document.querySelector('#project-title'),
  source: document.querySelector('#source-paragraphs'),
  guide: document.querySelector('#guide'),
  search: document.querySelector('#source-search'),
  projectStatus: document.querySelector('#project-status'),
  questionForm: document.querySelector('#question-form'),
  questionInput: document.querySelector('#question-input'),
  questions: document.querySelector('#question-list'),
  dialog: document.querySelector('#work-dialog'),
  dialogContent: document.querySelector('#dialog-content'),
  printPack: document.querySelector('#print-pack')
};

let project = null;
let activeController = null;

function setStatus(message, loading = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('loading', loading);
  elements.cancel.hidden = !loading;
  elements.roomStatus.textContent = message;
  elements.roomStatus.classList.toggle('loading', loading);
  elements.roomCancel.hidden = !loading;
  elements.dialogStatus.textContent = message;
  elements.dialogStatus.classList.toggle('loading', loading);
  elements.dialogStatus.hidden = !elements.dialog.open && !loading;
  elements.dialogCancel.hidden = !loading;
}

async function runJob(label, work) {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  setStatus(`Loading: ${label}`, true);
  try {
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, 50);
      controller.signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      }, { once: true });
    });
    const value = await work(controller.signal);
    setStatus(`${label} complete.`);
    return value;
  } catch (error) {
    setStatus(error.name === 'AbortError' ? `${label} cancelled. Existing source retained.` : `${label} failed: ${error.message}`);
    return null;
  } finally {
    if (activeController === controller) activeController = null;
  }
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(project));
  elements.projectStatus.textContent = `Saved locally at ${new Date().toLocaleTimeString('en-AU')}. Source and questions remain in this browser profile.`;
}

function renderSource() {
  elements.source.replaceChildren();
  for (const paragraph of project.document.paragraphs) {
    const item = document.createElement('li');
    item.id = `source-${paragraph.id}`;
    item.dataset.label = paragraph.id;
    item.tabIndex = -1;
    item.textContent = paragraph.text;
    elements.source.append(item);
  }
}

function applySearch() {
  const query = elements.search.value.trim().toLocaleLowerCase('en-AU');
  for (const item of elements.source.children) item.classList.toggle('filtered-out', Boolean(query) && !item.textContent.toLocaleLowerCase('en-AU').includes(query));
}

function showEvidence(paragraphId) {
  const target = document.querySelector(`#source-${CSS.escape(paragraphId)}`);
  if (!target) return;
  if (target.classList.contains('filtered-out')) {
    elements.search.value = '';
    applySearch();
    setStatus(`Search cleared to show evidence ${paragraphId}.`);
  }
  for (const item of elements.source.children) item.classList.remove('highlight');
  target.classList.add('highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

function renderGuide() {
  elements.guide.replaceChildren();
  if (project.analysis.observations.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No catalogue categories were detected. This does not mean they are absent; read the complete numbered source.';
    elements.guide.append(empty);
  }
  for (const group of groupObservations(project.analysis.observations)) {
    const article = document.createElement('article');
    article.className = 'observation';
    const heading = document.createElement('h3');
    heading.textContent = group.category;
    const count = document.createElement('p');
    count.className = 'observation-count';
    count.textContent = `Found in ${group.observations.length} ${group.observations.length === 1 ? 'paragraph' : 'paragraphs'}`;
    const prompt = document.createElement('p');
    prompt.textContent = group.prompt;
    const list = document.createElement('ul');
    list.className = 'evidence-list';
    for (const observation of group.observations) {
      const item = document.createElement('li');
      const certainty = document.createElement('span');
      certainty.className = 'certainty';
      certainty.textContent = observation.certainty;
      const rationale = document.createElement('p');
      rationale.textContent = observation.rationale;
      const evidence = document.createElement('button');
      evidence.type = 'button';
      evidence.className = 'evidence-button';
      evidence.textContent = `Show evidence ${observation.paragraphIds.join(', ')}`;
      evidence.addEventListener('click', () => showEvidence(observation.paragraphIds[0]));
      item.append(certainty, rationale, evidence);
      list.append(item);
    }
    article.append(heading, count, prompt, list);
    elements.guide.append(article);
  }
  if (project.analysis.absentCategories.length) {
    const absent = document.createElement('p');
    absent.className = 'absent';
    absent.textContent = `Not detected by this catalogue: ${project.analysis.absentCategories.map(({ label }) => label).join(', ')}. These topics may still be present in unfamiliar wording.`;
    elements.guide.append(absent);
  }
}

function renderQuestions() {
  elements.questions.replaceChildren();
  project.questions.forEach((question, index) => {
    const item = document.createElement('li');
    item.className = 'question-item';
    const text = document.createElement('span');
    text.textContent = question;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      project.questions.splice(index, 1);
      try { persist(); } catch (error) { elements.projectStatus.textContent = `Question removed in this page, but local save failed: ${error.message}`; }
      renderQuestions();
    });
    item.append(text, remove);
    elements.questions.append(item);
  });
}

function renderProject() {
  elements.projectTitle.textContent = project.document.title;
  elements.intake.hidden = true;
  elements.room.hidden = false;
  renderSource();
  renderGuide();
  renderQuestions();
}

async function analyse(text, title, method = 'pasted text') {
  const result = await runJob('numbering source and running local clause rules', async (signal) => {
    const documentModel = normaliseSource(text, { title, acquiredAt: new Date().toISOString(), method });
    if (documentModel.paragraphs.length === 0) throw new RangeError('No readable text paragraphs were supplied.');
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return { document: documentModel, analysis: analyseSource(documentModel), questions: [] };
  });
  if (!result) return;
  project = result;
  renderProject();
  try {
    persist();
    setStatus(`Analysis complete: ${project.document.paragraphs.length} numbered paragraphs and ${project.analysis.observations.length} evidence-linked observations.`);
  } catch (error) {
    setStatus(`Analysis is available in this page, but local saving failed: ${error.message}`);
  }
}

function showIntake() {
  project = null;
  try { localStorage.removeItem(storageKey); } catch { /* Storage unavailable; nothing saved to clear. */ }
  elements.search.value = '';
  elements.title.value = 'Untitled supplied document';
  elements.input.value = '';
  elements.room.hidden = true;
  elements.intake.hidden = false;
  elements.input.focus();
  setStatus('Previous project cleared. Paste or open the next source.');
}

function confirmNewDocument() {
  elements.dialogContent.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Start a new document?';
  const count = project.questions.length;
  const explanation = document.createElement('p');
  explanation.textContent = `This clears “${project.document.title}”${count ? ` and your ${count} ${count === 1 ? 'question' : 'questions'}` : ''} from this browser. Prepare a reading pack first if you want to keep a copy.`;
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'primary';
  clear.textContent = 'Clear and start again';
  clear.addEventListener('click', () => {
    elements.dialog.close();
    showIntake();
  });
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.textContent = 'Keep current project';
  keep.addEventListener('click', () => elements.dialog.close());
  actions.append(clear, keep);
  elements.dialogContent.append(heading, explanation, actions);
  elements.dialog.showModal();
}

function restore() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const documentModel = normaliseSource(saved.document?.text ?? '', saved.document);
    if (documentModel.paragraphs.length === 0) return;
    project = {
      document: documentModel,
      analysis: analyseSource(documentModel),
      questions: Array.isArray(saved.questions) ? saved.questions.filter((item) => typeof item === 'string').map((item) => item.slice(0, 1000)).slice(0, 100) : []
    };
    renderProject();
    setStatus('Recovered the local reading project.');
  } catch (error) {
    setStatus(`Stored project could not be recovered: ${error.message}`);
  }
}

const blockElements = 'address,article,aside,blockquote,caption,dd,details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,li,main,nav,ol,p,pre,section,summary,table,tr,ul';

// A parsed document is never rendered, so innerText would lose paragraph breaks.
// Rebuild them from the markup instead: blocks become blank-line separated paragraphs.
function plainTextFromHtml(html) {
  const documentModel = new DOMParser().parseFromString(html, 'text/html');
  const body = documentModel.body;
  if (!body) return '';
  body.querySelectorAll('script,style,noscript,template,svg,[hidden]').forEach((node) => node.remove());
  const walker = documentModel.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('pre')) node.data = node.data.replace(/\s+/gu, ' ');
  }
  body.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  body.querySelectorAll('td,th').forEach((cell) => { if (cell.nextElementSibling) cell.append(' | '); });
  body.querySelectorAll(blockElements).forEach((node) => {
    node.before('\n\n');
    node.after('\n\n');
  });
  return body.textContent.replace(/[^\S\n]*\n[^\S\n]*\n\s*/gu, '\n\n').trim();
}

async function compareVersion() {
  elements.dialogContent.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Compare preserved versions';
  const explanation = document.createElement('p');
  explanation.textContent = 'Paste the complete newer source. Comparison reports structural text changes and catalogue detection changes without interpreting legal effect.';
  const label = document.createElement('label');
  label.htmlFor = 'comparison-source';
  label.textContent = 'Newer supplied source';
  const textarea = document.createElement('textarea');
  textarea.id = 'comparison-source';
  textarea.className = 'compare-input';
  textarea.value = sampleV2;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Compare versions locally';
  const output = document.createElement('div');
  button.addEventListener('click', async () => {
    const comparison = await runJob('comparing preserved versions', async (signal) => {
      const next = normaliseSource(textarea.value, { title: `${project.document.title} — comparison`, acquiredAt: new Date().toISOString(), method: 'comparison paste' });
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return compareSources(project.document, next);
    });
    if (!comparison) return;
    output.replaceChildren();
    const limitation = document.createElement('p');
    limitation.textContent = comparison.limitation;
    const categories = document.createElement('p');
    categories.textContent = `Newly detected categories: ${comparison.categoryChanges.newlyDetected.join(', ') || 'none'}. No longer detected: ${comparison.categoryChanges.noLongerDetected.join(', ') || 'none'}.`;
    const list = document.createElement('ol');
    list.className = 'comparison';
    for (const change of comparison.changes.filter(({ type }) => type !== 'unchanged')) {
      const item = document.createElement('li');
      item.className = change.type;
      item.textContent = `${change.type === 'added' ? 'Added in newer version' : 'Removed from newer version'}: ${change.text}`;
      list.append(item);
    }
    if (!list.children.length) {
      const same = document.createElement('p');
      same.textContent = 'No paragraph wording changes were detected.';
      output.append(limitation, categories, same);
    } else output.append(limitation, categories, list);
  });
  elements.dialogContent.append(heading, explanation, label, textarea, button, output);
  elements.dialog.showModal();
}

function download(content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fineprint-reading-pack.md';
  link.click();
  URL.revokeObjectURL(url);
}

async function preparePack() {
  const pack = await runJob('preparing evidence-linked reading pack', async (signal) => {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return readingPack(project);
  });
  if (!pack) return;
  elements.dialogContent.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Annotated reading pack';
  const disclosure = document.createElement('p');
  disclosure.textContent = 'The pack includes the complete numbered source, rule-generated prompts, exact evidence, your questions, source date and method, and the professional-advice limitation.';
  const actions = document.createElement('div');
  actions.className = 'export-actions';
  const markdown = document.createElement('button');
  markdown.type = 'button';
  markdown.textContent = 'Download Markdown';
  markdown.addEventListener('click', async () => {
    const output = await runJob('preparing Markdown download', async (signal) => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return readingPack(project);
    });
    if (output) download(output);
  });
  const print = document.createElement('button');
  print.type = 'button';
  print.textContent = 'Print or save as PDF';
  print.addEventListener('click', async () => {
    const output = await runJob('preparing print view', async (signal) => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return readingPack(project);
    });
    if (!output) return;
    elements.printPack.textContent = output;
    window.print();
  });
  actions.append(markdown, print);
  const preview = document.createElement('pre');
  preview.textContent = pack;
  elements.dialogContent.append(heading, disclosure, actions, preview);
  elements.dialog.showModal();
}

document.querySelector('#analyse-button').addEventListener('click', () => analyse(elements.input.value, elements.title.value));
document.querySelector('#sample-button').addEventListener('click', () => {
  elements.title.value = 'Streambird subscription terms — synthetic version one';
  elements.input.value = sample;
  elements.input.focus();
  setStatus('Synthetic agreement loaded. Choose Number and analyse locally.');
});
elements.file.addEventListener('change', async () => {
  const file = elements.file.files?.[0];
  if (!file) return;
  const text = await runJob('reading local source file', async (signal) => {
    if (file.size > 400_000) throw new RangeError('Source files are limited to 400,000 bytes.');
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const raw = await file.text();
    return file.type === 'text/html' || /\.html?$/iu.test(file.name) ? plainTextFromHtml(raw) : raw;
  });
  if (text !== null) {
    elements.input.value = text;
    elements.title.value = file.name.slice(0, 160);
    setStatus('Local file extracted as plain text. Review it, then analyse locally.');
  }
});
elements.search.addEventListener('input', applySearch);
elements.questionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = elements.questionInput.value.trim().slice(0, 1000);
  if (!question) return;
  project.questions.push(question);
  elements.questionInput.value = '';
  try { persist(); } catch (error) { elements.projectStatus.textContent = `Question remains in this page, but local save failed: ${error.message}`; }
  renderQuestions();
});
document.querySelector('#compare-button').addEventListener('click', compareVersion);
document.querySelector('#export-button').addEventListener('click', preparePack);
document.querySelector('#new-document-button').addEventListener('click', confirmNewDocument);
document.querySelector('#limitations-button').addEventListener('click', () => {
  elements.dialogContent.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Reading limitations';
  const text = document.createElement('p');
  text.textContent = 'Fineprint Friend uses a small deterministic phrase catalogue. It can miss relevant text and cannot determine legal meaning, fairness, enforceability or what action you should take. Preserve the source, verify every prompt against its evidence and seek a qualified professional where needed.';
  elements.dialogContent.append(heading, text);
  elements.dialog.showModal();
});
elements.cancel.addEventListener('click', () => activeController?.abort());
elements.roomCancel.addEventListener('click', () => activeController?.abort());
elements.dialogCancel.addEventListener('click', () => activeController?.abort());

restore();
