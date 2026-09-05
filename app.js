/**
 * app.js
 * 画面の状態管理とイベント配線。HandDB/HandAuthはfirebase-backend.jsが
 * window上に公開しているものを利用する。（このファイルは login.html 専用）
 */

const MAX_FILES = 5;
let currentCase = null;
let lastResult = null;

// pdf.js（CDNから読み込み済み）にワーカーの場所を教える
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
}

// PDFファイルを1ページごとに画像(Blob)へ変換する
// 戻り値: [{ blob, name }, ...]（1ページ = 1件）
async function pdfFileToImageItems(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // A4を十分な解像度で描画
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const pageLabel = pdf.numPages > 1 ? `${file.name} (p.${i})` : file.name;
    items.push({ blob, name: pageLabel });
  }
  return items;
}

// 画像ファイル・PDFファイルが混ざったFileListを、
// すべて {blob, name} の画像アイテムのリストに変換する
async function filesToImageItems(fileList) {
  const out = [];
  for (const file of fileList) {
    if (file.type === 'application/pdf') {
      const pages = await pdfFileToImageItems(file);
      out.push(...pages);
    } else if (file.type.startsWith('image/')) {
      out.push({ blob: file, name: file.name });
    }
  }
  return out;
}

const el = {
  authSignedOut: document.getElementById('auth-signed-out'),
  authSignedIn: document.getElementById('auth-signed-in'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authStatus: document.getElementById('auth-status'),
  authUserEmail: document.getElementById('auth-user-email'),
  btnSignin: document.getElementById('btn-signin'),
  btnSignout: document.getElementById('btn-signout'),
  appBody: document.getElementById('app-body'),

  caseSelect: document.getElementById('case-select'),
  caseName: document.getElementById('case-name'),
  btnNewCase: document.getElementById('btn-new-case'),
  btnDeleteCase: document.getElementById('btn-delete-case'),

  inputSample: document.getElementById('input-sample'),
  inputReference: document.getElementById('input-reference'),
  listSample: document.getElementById('list-sample'),
  listReference: document.getElementById('list-reference'),
  uploadStatus: document.getElementById('upload-status'),

  btnAnalyze: document.getElementById('btn-analyze'),
  analyzeStatus: document.getElementById('analyze-status'),
  resultArea: document.getElementById('result-area'),
  scoreNumber: document.getElementById('score-number'),
  scoreRing: document.getElementById('score-ring'),
  scoreVerdict: document.getElementById('score-verdict'),
  scoreDetail: document.getElementById('score-detail'),
  featureTableBody: document.querySelector('#feature-table tbody'),
  btnCertificate: document.getElementById('btn-certificate'),

  certExaminer: document.getElementById('cert-examiner'),
  certNote: document.getElementById('cert-note'),
  btnPrint: document.getElementById('btn-print'),
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ================= AUTH =================
el.btnSignin.addEventListener('click', async () => {
  el.authStatus.textContent = 'ログインしています…';
  try {
    await window.HandAuth.signIn(el.authEmail.value.trim(), el.authPassword.value);
    el.authStatus.textContent = '';
  } catch (err) {
    console.error(err);
    el.authStatus.textContent = 'ログインできませんでした。メールアドレスとパスワードをご確認ください。';
  }
});

el.btnSignout.addEventListener('click', async () => {
  await window.HandAuth.signOutUser();
});

window.HandAuth.onChange(async (user) => {
  if (user) {
    el.authSignedOut.hidden = true;
    el.authSignedIn.hidden = false;
    el.authUserEmail.textContent = user.email || '(unknown)';
    el.appBody.hidden = false;
    await refreshCaseSelect();
    await loadCase('');
  } else {
    el.authSignedOut.hidden = false;
    el.authSignedIn.hidden = true;
    el.appBody.hidden = true;
  }
});

// ================= CASE LIST =================
async function refreshCaseSelect(selectId) {
  const cases = await window.HandDB.listCases();
  el.caseSelect.innerHTML = '<option value="">— 新しい案件を作成 —</option>' +
    cases.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (selectId) el.caseSelect.value = selectId;
}

async function loadCase(id) {
  if (!id) {
    currentCase = window.HandDB.newCase('');
    el.caseName.value = '';
    el.btnDeleteCase.hidden = true;
  } else {
    currentCase = await window.HandDB.getCase(id);
    el.caseName.value = currentCase.name;
    el.btnDeleteCase.hidden = false;
  }
  lastResult = currentCase.lastResult || null;
  renderThumbs('sample');
  renderThumbs('reference');
  updateAnalyzeButton();
  el.resultArea.hidden = true;
  document.getElementById('panel-certificate').hidden = true;
  el.analyzeStatus.textContent = '';
  el.uploadStatus.textContent = '';
}

el.caseSelect.addEventListener('change', () => loadCase(el.caseSelect.value));

el.btnNewCase.addEventListener('click', async () => {
  currentCase.name = el.caseName.value.trim() || '無題の案件';
  el.uploadStatus.textContent = '保存しています…';
  await window.HandDB.saveCase(currentCase);
  el.uploadStatus.textContent = '';
  await refreshCaseSelect(currentCase.id);
  el.btnDeleteCase.hidden = false;
});

el.btnDeleteCase.addEventListener('click', async () => {
  if (!currentCase || !currentCase.id) return;
  if (!confirm(`案件「${currentCase.name}」を削除します。画像もすべて削除されます。よろしいですか？`)) return;
  el.uploadStatus.textContent = '削除しています…';
  for (const item of [...currentCase.sampleImages, ...currentCase.referenceImages]) {
    await window.HandDB.deleteImageFile(item);
  }
  await window.HandDB.deleteCase(currentCase.id);
  await refreshCaseSelect();
  await loadCase('');
});

// ================= UPLOADS =================
function renderThumbs(kind) {
  const list = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
  const ul = kind === 'sample' ? el.listSample : el.listReference;
  ul.innerHTML = '';
  list.forEach(item => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = item.downloadURL || URL.createObjectURL(item.blob);
    img.alt = item.name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = '削除';
    btn.addEventListener('click', async () => {
      const arr = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) {
        await window.HandDB.deleteImageFile(item);
        arr.splice(idx, 1);
      }
      await persistIfSaved();
      renderThumbs(kind);
      updateAnalyzeButton();
    });
    li.appendChild(img);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function persistIfSaved() {
  if (currentCase.id && (await window.HandDB.getCase(currentCase.id))) {
    await window.HandDB.saveCase(currentCase);
  }
}

function wireUpload(input, kind) {
  input.addEventListener('change', async () => {
    const arr = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
    const incomingFiles = Array.from(input.files || []);
    input.value = '';

    el.uploadStatus.textContent = 'PDFを画像に変換しています…';
    let converted;
    try {
      converted = await filesToImageItems(incomingFiles);
    } catch (err) {
      console.error(err);
      el.uploadStatus.textContent = 'PDFの変換に失敗しました。別のファイルでお試しください。';
      return;
    }

    let blocked = false;
    for (const item of converted) {
      if (arr.length >= MAX_FILES) { blocked = true; break; }
      arr.push({ id: 'img-' + Date.now() + Math.random().toString(36).slice(2, 6), blob: item.blob, name: item.name });
    }

    el.uploadStatus.textContent = 'アップロードしています…';
    try {
      currentCase.name = currentCase.name || (el.caseName.value.trim() || '無題の案件');
      await window.HandDB.saveCase(currentCase);
      await refreshCaseSelect(currentCase.id);
      el.btnDeleteCase.hidden = false;
      el.uploadStatus.textContent = blocked
        ? `${kind === 'sample' ? '試料' : '対照'}筆跡は最大${MAX_FILES}枚までです。`
        : '';
    } catch (err) {
      console.error(err);
      el.uploadStatus.textContent = 'アップロードに失敗しました。ログイン状態と通信環境をご確認ください。';
    }
    renderThumbs(kind);
    updateAnalyzeButton();
  });
}
wireUpload(el.inputSample, 'sample');
wireUpload(el.inputReference, 'reference');

function updateAnalyzeButton() {
  const ok = currentCase.sampleImages.length > 0 && currentCase.referenceImages.length > 0;
  el.btnAnalyze.disabled = !ok;
}

// ================= ANALYZE =================
el.btnAnalyze.addEventListener('click', async () => {
  el.btnAnalyze.disabled = true;
  el.analyzeStatus.textContent = '画像を取得し、特徴を抽出しています…';
  el.resultArea.hidden = true;
  try {
    const sampleFeatures = [];
    for (const item of currentCase.sampleImages) {
      const blob = await window.HandDB.loadBlob(item);
      sampleFeatures.push(await HandAnalysis.extractFeatures(blob));
    }
    const referenceFeatures = [];
    for (const item of currentCase.referenceImages) {
      const blob = await window.HandDB.loadBlob(item);
      referenceFeatures.push(await HandAnalysis.extractFeatures(blob));
    }
    const sampleAvg = HandAnalysis.averageFeatures(sampleFeatures);
    const referenceAvg = HandAnalysis.averageFeatures(referenceFeatures);
    const result = HandAnalysis.compare(sampleAvg, referenceAvg);
    result.sampleAvg = sampleAvg;
    result.referenceAvg = referenceAvg;
    lastResult = result;
    currentCase.lastResult = result;
    await persistIfSaved();
    showResult(result);
    el.analyzeStatus.textContent = '';
  } catch (err) {
    console.error(err);
    el.analyzeStatus.textContent = '画像の解析中にエラーが発生しました。別の画像でお試しいただくか、通信環境をご確認ください。';
  } finally {
    el.btnAnalyze.disabled = false;
  }
});

function showResult(result) {
  const pct = Math.round(result.overall * 100);
  el.scoreNumber.textContent = pct;
  const verdict = HandAnalysis.verdictFor(result.overall);
  el.scoreVerdict.textContent = verdict.label;
  const ringColor = verdict.tone === 'good' ? '#3D6B4A' : verdict.tone === 'mid' ? '#2B3A55' : '#A63A2E';
  el.scoreRing.style.borderColor = ringColor;
  el.scoreDetail.textContent =
    '画像から抽出した統計的特徴（インク密度・線幅・傾き・空間分布・方向分布など）に基づく参考値です。';

  el.featureTableBody.innerHTML = '';
  result.items.forEach(it => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.label}</td>
      <td>${formatFeatureValue(it.key, result.sampleAvg)}</td>
      <td>${formatFeatureValue(it.key, result.referenceAvg)}</td>
      <td>${Math.round(it.score * 100)}%</td>`;
    el.featureTableBody.appendChild(tr);
  });

  el.resultArea.hidden = false;
  el.resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatFeatureValue(key, avg) {
  switch (key) {
    case 'inkRatio': return (avg.inkRatio * 100).toFixed(1) + '%';
    case 'aspect': return avg.aspect.toFixed(2);
    case 'strokeWidth': return avg.strokeWidth.toFixed(2) + 'px';
    case 'slant': return Math.round(avg.slant) + '°';
    case 'grid': return 'ベクトル';
    case 'orientHist': return 'ベクトル';
    default: return '—';
  }
}

// ================= CERTIFICATE =================
el.btnCertificate.addEventListener('click', () => {
  if (!lastResult) return;
  HandCertificate.render({
    caseObj: currentCase,
    result: lastResult,
    examiner: el.certExaminer.value,
    note: el.certNote.value
  });
});

el.btnPrint.addEventListener('click', () => window.print());
