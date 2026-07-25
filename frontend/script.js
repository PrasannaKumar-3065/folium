const API_BASE = '/api';

/* ---------------- Navigation ---------------- */
const navUpload = document.getElementById('nav-upload');
const navAsk = document.getElementById('nav-ask');
const navPapers = document.getElementById('nav-papers');
const navBank = document.getElementById('nav-bank');
const viewUpload = document.getElementById('view-upload');
const viewAsk = document.getElementById('view-ask');
const viewPapers = document.getElementById('view-papers');
const viewBank = document.getElementById('view-bank');

navUpload.addEventListener('click', () => switchView('upload'));
navAsk.addEventListener('click', () => switchView('ask'));
navPapers.addEventListener('click', () => switchView('papers'));
navBank.addEventListener('click', () => switchView('bank'));

function switchView(view) {
  viewUpload.classList.toggle('hidden', view !== 'upload');
  viewAsk.classList.toggle('hidden', view !== 'ask');
  viewPapers.classList.toggle('hidden', view !== 'papers');
  viewBank.classList.toggle('hidden', view !== 'bank');
  navUpload.classList.toggle('active', view === 'upload');
  navAsk.classList.toggle('active', view === 'ask');
  navPapers.classList.toggle('active', view === 'papers');
  navBank.classList.toggle('active', view === 'bank');
  if (view === 'papers') {
    loadPaperDocOptions();
    loadQuestionPapers();
  }
  if (view === 'bank') {
    loadBankFilters();
    loadBankList();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ---------------- Upload ---------------- */
const uploadForm = document.getElementById('upload-form');
const uploadMessage = document.getElementById('upload-message');
const fileInput = document.getElementById('file-input');
const standardInput = document.getElementById('standard-input');
const subjectInput = document.getElementById('subject-input');

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = fileInput.files;
  if (!files.length) return;

  const formData = new FormData();
  for (const f of files) formData.append('files', f);
  if (standardInput.value.trim()) formData.append('standard', standardInput.value.trim());
  if (subjectInput.value.trim()) formData.append('subject', subjectInput.value.trim());

  const submitBtn = uploadForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  uploadMessage.textContent = 'Uploading...';

  try {
    const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      uploadMessage.textContent = data.detail || 'Upload failed.';
      return;
    }

    const results = data.results || [];
    const errors = results.filter((r) => r.error);
    const okCount = results.length - errors.length;

    if (errors.length) {
      const errText = errors.map((r) => `${r.filename} (${r.error})`).join('; ');
      uploadMessage.textContent = `${okCount} file(s) queued for processing. ${errors.length} rejected: ${errText}`;
    } else {
      uploadMessage.textContent = `${okCount} file(s) queued for processing — check status below.`;
    }

    uploadForm.reset();
    loadDocuments();
  } catch (err) {
    uploadMessage.textContent = 'Upload failed: ' + err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- Document list ---------------- */
const docsTbody = document.getElementById('docs-tbody');
document.getElementById('refresh-docs').addEventListener('click', loadDocuments);

async function loadDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) return;
    const docs = await res.json();
    renderDocuments(docs);
    const hasProcessing = docs.some((doc) => doc.status === 'processing');
    if (hasProcessing) {
      startDocumentPolling();
    } else {
      stopDocumentPolling();
    }
  } catch (err) {
    console.error('Failed to load documents', err);
  }
}

function renderDocuments(docs) {
  if (!docs.length) {
    docsTbody.innerHTML = '<tr><td colspan="8">No documents uploaded yet.</td></tr>';
    return;
  }

  docsTbody.innerHTML = '';
  for (const doc of docs) {
    const tr = document.createElement('tr');
    const hasChapters = doc.status === 'ready' && doc.chapter_count > 0;
    tr.innerHTML = `
      <td>${escapeHtml(doc.filename)}</td>
      <td>${escapeHtml(doc.standard || '—')}</td>
      <td>${escapeHtml(doc.subject || '—')}</td>
      <td>
        <span class="status status-${escapeHtml(doc.status)}">${escapeHtml(doc.status)}</span>
        ${doc.error_message ? `<div class="error-text">${escapeHtml(doc.error_message)}</div>` : ''}
      </td>
      <td>${doc.chunk_count ?? '—'}</td>
      <td>${doc.page_count ?? '—'}</td>
      <td>${
        hasChapters
          ? `<button class="chapters-toggle" type="button" data-id="${doc.id}">${doc.chapter_count}</button>`
          : (doc.chapter_count ?? '—')
      }</td>
      <td><button class="delete-btn" type="button" data-id="${doc.id}">Delete</button></td>
    `;
    docsTbody.appendChild(tr);

    // Hidden detail row for this document's chapter list, fetched lazily
    // the first time it's expanded and cached in the DOM after that.
    if (hasChapters) {
      const detailTr = document.createElement('tr');
      detailTr.className = 'chapters-detail hidden';
      detailTr.innerHTML = `<td colspan="8"><ul class="chapters-list"></ul></td>`;
      docsTbody.appendChild(detailTr);
    }
  }

  docsTbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteDocument(btn.dataset.id));
  });

  docsTbody.querySelectorAll('.chapters-toggle').forEach((btn) => {
    btn.addEventListener('click', () => toggleChapters(btn));
  });
}

async function toggleChapters(btn) {
  const detailRow = btn.closest('tr').nextElementSibling;
  const list = detailRow.querySelector('.chapters-list');
  const isHidden = detailRow.classList.contains('hidden');

  if (isHidden && !list.dataset.loaded) {
    list.innerHTML = '<li>Loading…</li>';
    try {
      const res = await fetch(`${API_BASE}/documents/${btn.dataset.id}/chapters`);
      const chapters = res.ok ? await res.json() : [];
      list.innerHTML = chapters.length
        ? chapters
            .map((c) => `<li>${c.chapter_number ? `Ch. ${escapeHtml(c.chapter_number)}: ` : ''}${escapeHtml(c.title)} <span class="chapter-pages">(p. ${c.start_page}–${c.end_page})</span></li>`)
            .join('')
        : '<li>No chapter detail available.</li>';
      list.dataset.loaded = 'true';
    } catch (err) {
      list.innerHTML = '<li>Could not load chapters.</li>';
    }
  }

  detailRow.classList.toggle('hidden');
}

async function deleteDocument(id) {
  if (!confirm('Delete this document and all its indexed content? This cannot be undone.')) return;
  try {
    await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
  } finally {
    loadDocuments();
  }
}

const DOCS_POLL_MS = 15000;
let docsPollInterval = null;

function startDocumentPolling() {
  if (docsPollInterval !== null) return;
  docsPollInterval = setInterval(loadDocuments, DOCS_POLL_MS);
}

function stopDocumentPolling() {
  if (docsPollInterval === null) return;
  clearInterval(docsPollInterval);
  docsPollInterval = null;
}

// Poll periodically only when there are documents still processing.
loadDocuments();

/* ---------------- Ask ---------------- */
const askForm = document.getElementById('ask-form');
const questionInput = document.getElementById('question-input');
const askStandardInput = document.getElementById('ask-standard-input');
const askSubjectInput = document.getElementById('ask-subject-input');
const askResults = document.getElementById('ask-results');

askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  const submitBtn = askForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Thinking...';

  const entry = document.createElement('div');
  entry.className = 'qa-entry';
  entry.innerHTML = `<p class="qa-question">${escapeHtml(question)}</p><p class="qa-answer">Thinking...</p>`;
  askResults.prepend(entry);

  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        standard: askStandardInput.value.trim() || null,
        subject: askSubjectInput.value.trim() || null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      entry.querySelector('.qa-answer').textContent = data.detail || 'Something went wrong.';
      return;
    }

    entry.querySelector('.qa-answer').textContent = data.answer;

    if (data.sources && data.sources.length) {
      const srcList = document.createElement('ul');
      srcList.className = 'qa-sources';
      data.sources.forEach((s) => {
        const li = document.createElement('li');
        li.textContent = `${s.filename}${s.chapter ? ', ' + s.chapter : ''}${s.page ? ', page ' + s.page : ''}`;
        srcList.appendChild(li);
      });
      entry.appendChild(srcList);
    }
  } catch (err) {
    entry.querySelector('.qa-answer').textContent = 'Request failed: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ask';
    questionInput.value = '';
  }
});

/* ---------------- Question Papers ---------------- */
const paperForm = document.getElementById('paper-form');
const paperDocSelect = document.getElementById('paper-doc-select');
const paperChaptersList = document.getElementById('paper-chapters-list');
const paperMessage = document.getElementById('paper-message');
const paperResult = document.getElementById('paper-result');
const papersTbody = document.getElementById('papers-tbody');

async function loadPaperDocOptions() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) return;
    const docs = (await res.json()).filter((d) => d.status === 'ready');
    const previouslySelected = paperDocSelect.value;

    paperDocSelect.innerHTML = docs.length
      ? docs.map((d) => `<option value="${d.id}">${escapeHtml(d.filename)} (${escapeHtml(d.standard || '—')}, ${escapeHtml(d.subject || '—')})</option>`).join('')
      : '<option value="">No ready books yet — upload one first</option>';

    if (docs.some((d) => d.id === previouslySelected)) {
      paperDocSelect.value = previouslySelected;
    } else if (docs.length) {
      loadChaptersForPaperForm(paperDocSelect.value);
    }
  } catch (err) {
    console.error('Failed to load documents for paper form', err);
  }
}

paperDocSelect.addEventListener('change', () => loadChaptersForPaperForm(paperDocSelect.value));

async function loadChaptersForPaperForm(docId) {
  if (!docId) {
    paperChaptersList.innerHTML = 'Pick a book first.';
    return;
  }
  paperChaptersList.innerHTML = 'Loading chapters…';
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}/chapters`);
    const chapters = res.ok ? await res.json() : [];
    paperChaptersList.innerHTML = chapters.length
      ? chapters
          .map(
            (c) => `
        <label class="chapter-checkbox">
          <input type="checkbox" name="chapter" value="${c.id}" checked>
          ${c.chapter_number ? `Ch. ${escapeHtml(c.chapter_number)}: ` : ''}${escapeHtml(c.title)}
        </label>`
          )
          .join('')
      : 'No chapters detected for this book yet.';
  } catch (err) {
    paperChaptersList.innerHTML = 'Could not load chapters.';
  }
}

paperForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const docId = paperDocSelect.value;
  const chapterIds = Array.from(paperChaptersList.querySelectorAll('input[name="chapter"]:checked')).map((el) => el.value);

  if (!docId) { paperMessage.textContent = 'Pick a book first.'; return; }
  if (!chapterIds.length) { paperMessage.textContent = 'Select at least one chapter.'; return; }

  const totalMarksVal = document.getElementById('paper-total-marks').value;
  const body = {
    doc_id: docId,
    chapter_ids: chapterIds,
    total_questions: Number(document.getElementById('paper-total-questions').value),
    total_marks: totalMarksVal ? Number(totalMarksVal) : null,
    distribution_mode: paperForm.querySelector('input[name="distribution"]:checked').value,
    pass_percentage: Number(document.getElementById('paper-pass-percentage').value),
    difficulty: document.getElementById('paper-difficulty').value,
  };

  const submitBtn = paperForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  paperMessage.textContent = 'Starting generation…';
  paperResult.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/question-papers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      paperMessage.textContent = data.detail || 'Could not start generation.';
      return;
    }
    paperMessage.textContent = 'Generating questions — this can take a little while for larger papers…';
    pollPaper(data.id);
  } catch (err) {
    paperMessage.textContent = 'Request failed: ' + err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

async function pollPaper(paperId) {
  const poll = async () => {
    const res = await fetch(`${API_BASE}/question-papers/${paperId}`);
    if (!res.ok) return;
    const paper = await res.json();
    if (paper.status === 'generating') {
      setTimeout(poll, 2500);
      return;
    }
    paperMessage.textContent = '';
    renderPaperResult(paper);
    loadQuestionPapers();
  };
  poll();
}

function renderPaperResult(paper) {
  paperResult.classList.remove('hidden');
  paperResult.dataset.paperId = paper.id;

  const planRows = Object.entries(paper.distribution_plan || {})
    .map(([chapterId, count]) => {
      const q = (paper.questions || []).find((x) => x.chapter_id === chapterId);
      return `<li>${escapeHtml(q ? q.chapter_title : chapterId)}: ${count} question(s)</li>`;
    })
    .join('');

  const feasibilityNote =
    paper.distribution_feasible === false
      ? `<p class="feasibility-warning">With this many chapters and a ${paper.pass_percentage}% pass mark, the paper couldn't guarantee every chapter its own full pass-floor — the split above is the closest even fallback instead.</p>`
      : '';

  const questionsHtml = (paper.questions || [])
    .map(
      (q, i) => `
    <div class="question-card" data-question-id="${q.id}">
      <div class="question-view">
        <p class="question-text">${i + 1}. ${escapeHtml(q.question_text)}
          <span class="question-meta">(${escapeHtml(q.chapter_title || 'Unknown chapter')} · ${q.marks} mark${q.marks === 1 ? '' : 's'} · ${escapeHtml(q.difficulty || '—')})</span>
          ${q.accepted ? '<span class="accepted-badge">Accepted</span>' : ''}
        </p>
        <ul class="options-list">
          ${Object.entries(q.options)
            .map(([key, val]) => `<li class="${key === q.correct_option ? 'correct-option' : ''}">${key}. ${escapeHtml(val)}</li>`)
            .join('')}
        </ul>
        <div class="question-actions">
          <button class="q-accept-btn" type="button">${q.accepted ? 'Accepted ✓' : 'Accept'}</button>
          <button class="q-edit-btn" type="button">Edit</button>
          <button class="q-regen-btn" type="button">Regenerate</button>
          <button class="q-delete-btn" type="button">Delete</button>
        </div>
        <p class="q-action-message"></p>
      </div>
      <form class="question-edit-form hidden">
        <textarea class="edit-question-text" rows="2">${escapeHtml(q.question_text)}</textarea>
        ${['A', 'B', 'C', 'D']
          .map(
            (key) => `
          <label class="edit-option-label">${key}.
            <input type="text" class="edit-option" data-key="${key}" value="${escapeHtml(q.options[key] || '')}">
          </label>`
          )
          .join('')}
        <label>Correct option
          <select class="edit-correct-option">
            ${['A', 'B', 'C', 'D'].map((key) => `<option value="${key}" ${key === q.correct_option ? 'selected' : ''}>${key}</option>`).join('')}
          </select>
        </label>
        <label>Marks <input type="number" class="edit-marks" min="1" value="${q.marks}"></label>
        <div class="question-actions">
          <button type="submit" class="q-save-btn">Save</button>
          <button type="button" class="q-cancel-btn">Cancel</button>
        </div>
      </form>
    </div>`
    )
    .join('');

  paperResult.innerHTML = `
    <h3>Paper status: <span class="status status-${escapeHtml(paper.status)}">${escapeHtml(paper.status)}</span></h3>
    ${paper.error_message ? `<p class="error-text">${escapeHtml(paper.error_message)}</p>` : ''}
    <p><strong>Distribution (${escapeHtml(paper.distribution_mode)}):</strong></p>
    <ul>${planRows}</ul>
    ${feasibilityNote}
    ${questionsHtml ? `<h3>Questions (${paper.questions.length})</h3>${questionsHtml}` : ''}
  `;

  wireQuestionCardActions(paper.id);
}

function wireQuestionCardActions(paperId) {
  paperResult.querySelectorAll('.question-card').forEach((card) => {
    const questionId = card.dataset.questionId;
    const msgEl = card.querySelector('.q-action-message');

    card.querySelector('.q-accept-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/questions/${questionId}/accept`, { method: 'POST' });
        if (res.ok) refreshCurrentPaper(paperId);
        else msgEl.textContent = (await res.json()).detail || 'Could not accept.';
      } finally {
        e.target.disabled = false;
      }
    });

    card.querySelector('.q-regen-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      msgEl.textContent = 'Asking Gemini for a replacement…';
      try {
        const res = await fetch(`${API_BASE}/questions/${questionId}/regenerate`, { method: 'POST' });
        if (res.ok) { refreshCurrentPaper(paperId); }
        else { msgEl.textContent = (await res.json()).detail || 'Could not regenerate.'; }
      } catch (err) {
        msgEl.textContent = 'Request failed: ' + err.message;
      } finally {
        e.target.disabled = false;
      }
    });

    card.querySelector('.q-delete-btn').addEventListener('click', async (e) => {
      if (!confirm('Remove this question from the paper?')) return;
      e.target.disabled = true;
      const res = await fetch(`${API_BASE}/questions/${questionId}`, { method: 'DELETE' });
      if (res.ok) refreshCurrentPaper(paperId);
      else { msgEl.textContent = 'Could not delete.'; e.target.disabled = false; }
    });

    const editForm = card.querySelector('.question-edit-form');
    const questionView = card.querySelector('.question-view');
    card.querySelector('.q-edit-btn').addEventListener('click', () => {
      questionView.classList.add('hidden');
      editForm.classList.remove('hidden');
    });
    card.querySelector('.q-cancel-btn').addEventListener('click', () => {
      editForm.classList.add('hidden');
      questionView.classList.remove('hidden');
    });
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const options = {};
      editForm.querySelectorAll('.edit-option').forEach((input) => { options[input.dataset.key] = input.value; });
      const body = {
        question_text: editForm.querySelector('.edit-question-text').value,
        options,
        correct_option: editForm.querySelector('.edit-correct-option').value,
        marks: Number(editForm.querySelector('.edit-marks').value),
      };
      const res = await fetch(`${API_BASE}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) refreshCurrentPaper(paperId);
      else msgEl.textContent = (await res.json()).detail || 'Could not save changes.';
    });
  });
}

async function refreshCurrentPaper(paperId) {
  const res = await fetch(`${API_BASE}/question-papers/${paperId}`);
  if (res.ok) renderPaperResult(await res.json());
}

document.getElementById('refresh-papers').addEventListener('click', loadQuestionPapers);

async function loadQuestionPapers() {
  try {
    const res = await fetch(`${API_BASE}/question-papers`);
    if (!res.ok) return;
    renderPapersTable(await res.json());
  } catch (err) {
    console.error('Failed to load question papers', err);
  }
}

function renderPapersTable(papers) {
  if (!papers.length) {
    papersTbody.innerHTML = '<tr><td colspan="6">No question papers yet.</td></tr>';
    return;
  }
  papersTbody.innerHTML = papers
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.subject || '—')} / ${escapeHtml(p.standard || '—')}</td>
      <td>${p.total_questions}</td>
      <td>${p.pass_percentage}%</td>
      <td>${escapeHtml(p.distribution_mode)}</td>
      <td><span class="status status-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
      <td><button class="view-paper-btn" type="button" data-id="${p.id}">View</button></td>
    </tr>`
    )
    .join('');

  papersTbody.querySelectorAll('.view-paper-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`${API_BASE}/question-papers/${btn.dataset.id}`);
      if (res.ok) renderPaperResult(await res.json());
    });
  });
}

/* ---------------- Question Bank ---------------- */
const bankDocFilter = document.getElementById('bank-doc-filter');
const bankChapterFilter = document.getElementById('bank-chapter-filter');
const bankDifficultyFilter = document.getElementById('bank-difficulty-filter');
const bankTargetPaper = document.getElementById('bank-target-paper');
const bankList = document.getElementById('bank-list');

async function loadBankFilters() {
  try {
    const [docsRes, papersRes] = await Promise.all([
      fetch(`${API_BASE}/documents`),
      fetch(`${API_BASE}/question-papers`),
    ]);
    const docs = docsRes.ok ? (await docsRes.json()).filter((d) => d.status === 'ready') : [];
    const papers = papersRes.ok ? await papersRes.json() : [];

    bankDocFilter.innerHTML =
      '<option value="">All books</option>' +
      docs.map((d) => `<option value="${d.id}">${escapeHtml(d.filename)}</option>`).join('');

    bankTargetPaper.innerHTML = papers.length
      ? papers.map((p) => `<option value="${p.id}">${escapeHtml(p.subject || '—')} / ${escapeHtml(p.standard || '—')} (${p.total_questions}q)</option>`).join('')
      : '<option value="">No papers yet</option>';
  } catch (err) {
    console.error('Failed to load bank filters', err);
  }
}

bankDocFilter.addEventListener('change', async () => {
  const docId = bankDocFilter.value;
  if (!docId) {
    bankChapterFilter.innerHTML = '<option value="">All chapters</option>';
    loadBankList();
    return;
  }
  const res = await fetch(`${API_BASE}/documents/${docId}/chapters`);
  const chapters = res.ok ? await res.json() : [];
  bankChapterFilter.innerHTML =
    '<option value="">All chapters</option>' +
    chapters.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  loadBankList();
});
bankChapterFilter.addEventListener('change', loadBankList);
bankDifficultyFilter.addEventListener('change', loadBankList);

async function loadBankList() {
  bankList.innerHTML = 'Loading…';
  const params = new URLSearchParams();
  if (bankChapterFilter.value) params.set('chapter_id', bankChapterFilter.value);
  if (bankDifficultyFilter.value) params.set('difficulty', bankDifficultyFilter.value);

  try {
    const res = await fetch(`${API_BASE}/question-bank?${params.toString()}`);
    const entries = res.ok ? await res.json() : [];
    if (!entries.length) {
      bankList.innerHTML = '<p>No questions in the bank yet — accept a generated question to add one.</p>';
      return;
    }
    bankList.innerHTML = entries
      .map(
        (bq) => `
      <div class="question-card">
        <p class="question-text">${escapeHtml(bq.question_text)}
          <span class="question-meta">(${escapeHtml(bq.chapter_title || 'Unknown chapter')} · ${bq.marks} mark${bq.marks === 1 ? '' : 's'} · ${escapeHtml(bq.difficulty || '—')} · used ${bq.times_used}×)</span>
        </p>
        <ul class="options-list">
          ${Object.entries(bq.options)
            .map(([key, val]) => `<li class="${key === bq.correct_option ? 'correct-option' : ''}">${key}. ${escapeHtml(val)}</li>`)
            .join('')}
        </ul>
        <div class="question-actions">
          <button class="bank-add-btn" type="button" data-id="${bq.id}">Add to selected paper</button>
        </div>
        <p class="bank-add-message"></p>
      </div>`
      )
      .join('');

    bankList.querySelectorAll('.bank-add-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const paperId = bankTargetPaper.value;
        const msgEl = btn.closest('.question-card').querySelector('.bank-add-message');
        if (!paperId) { msgEl.textContent = 'Pick a paper to add it to first.'; return; }
        btn.disabled = true;
        const res = await fetch(`${API_BASE}/question-bank/${btn.dataset.id}/add-to-paper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper_id: paperId }),
        });
        if (res.ok) { msgEl.textContent = 'Added.'; loadBankFilters(); }
        else { msgEl.textContent = (await res.json()).detail || 'Could not add.'; }
        btn.disabled = false;
      });
    });
  } catch (err) {
    bankList.innerHTML = 'Could not load the question bank.';
  }
}
