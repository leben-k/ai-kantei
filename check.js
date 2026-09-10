/**
 * check.js
 * check.html（誰でも使える・ログイン不要）専用の画面配線。
 * 画像はブラウザのメモリ上にのみ保持し、どこにも送信・保存しない。
 * app.js（login.html専用）と違い、Firebase（HandDB/HandAuth）は一切使わない。
 */

const MAX_FILES = 5;

// このページ内だけで完結する「案件」データ（保存はしない・メモリ上のみ）
const currentCase = {
  name: '',
  sampleImages: [],   // { id, blob, name }
  referenceImages: []
};
let lastResult = null;

// pdf.js（CDNから読み込み済み）にワーカーの場所を教える
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
}

// PDFファイルを1ページごとに画像(Blob)へ変換する
async function pdfFileToImageItems(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
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

  certCaseNameInput: document.getElementById('cert-case-name-input'),
  certExaminer: document.getElementById('cert-examiner'),
  certNote: document.getElementById('cert-note'),
  btnPrint: document.getElementById('btn-print'),
  btnDownloadPdf: document.getElementById('btn-download-pdf'),
  downloadStatus: document.getElementById('download-status'),
};

// ================= UPLOADS =================
function renderThumbs(kind) {
  const list = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
  const ul = kind === 'sample' ? el.listSample : el.listReference;
  ul.innerHTML = '';
  list.forEach(item => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(item.blob);
    img.alt = item.name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = '削除';
    btn.addEventListener('click', () => {
      const arr = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) arr.splice(idx, 1);
      renderThumbs(kind);
      updateAnalyzeButton();
    });
    li.appendChild(img);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function wireUpload(input, kind) {
  input.addEventListener('change', async () => {
    const arr = kind === 'sample' ? currentCase.sampleImages : currentCase.referenceImages;
    const incomingFiles = Array.from(input.files || []);
    input.value = '';

    el.uploadStatus.textContent = 'このパソコン内でPDFを画像に変換しています…';
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

    el.uploadStatus.textContent = blocked
      ? `${kind === 'sample' ? '試料' : '対照'}筆跡は最大${MAX_FILES}枚までです。`
      : '';
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
  el.analyzeStatus.textContent = 'このパソコン内で特徴を抽出しています…（通信は発生しません）';
  el.resultArea.hidden = true;
  try {
    const sampleFeatures = [];
    for (const item of currentCase.sampleImages) {
      sampleFeatures.push(await HandAnalysis.extractFeatures(item.blob));
    }
    const referenceFeatures = [];
    for (const item of currentCase.referenceImages) {
      referenceFeatures.push(await HandAnalysis.extractFeatures(item.blob));
    }
    const sampleAvg = HandAnalysis.averageFeatures(sampleFeatures);
    const referenceAvg = HandAnalysis.averageFeatures(referenceFeatures);
    const result = HandAnalysis.compare(sampleAvg, referenceAvg);
    result.sampleAvg = sampleAvg;
    result.referenceAvg = referenceAvg;
    lastResult = result;
    showResult(result);
    el.analyzeStatus.textContent = '';
  } catch (err) {
    console.error(err);
    el.analyzeStatus.textContent = '画像の解析中にエラーが発生しました。別の画像でお試しください。';
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
  currentCase.name = el.certCaseNameInput.value.trim();
  HandCertificate.render({
    caseObj: currentCase,
    result: lastResult,
    examiner: el.certExaminer.value,
    note: el.certNote.value
  });
});

// 「印刷 / PDF保存（別の方法）」— ブラウザ標準の印刷ダイアログを使う方式
el.btnPrint.addEventListener('click', () => window.print());

// 「鑑定書をPDFでダウンロード」— ワンクリックで直接PDFファイルを保存する方式
el.btnDownloadPdf.addEventListener('click', async () => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    el.downloadStatus.textContent = 'PDF作成用の部品の読み込みに失敗しました。「印刷 / PDF保存」をお試しください。';
    return;
  }
  const certEl = document.getElementById('certificate');
  el.btnDownloadPdf.disabled = true;
  el.downloadStatus.textContent = 'このパソコン内でPDFを作成しています…';
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    await pdf.html(certEl, {
      x: 24,
      y: 24,
      width: 547,             // A4幅(595pt) - 左右余白
      windowWidth: certEl.scrollWidth || 700,
      autoPaging: 'text',
    });
    const certId = certEl.dataset.certId || ('report-' + Date.now());
    pdf.save(`鑑定書_${certId}.pdf`);
    el.downloadStatus.textContent = 'ダウンロードフォルダに保存しました。';
  } catch (err) {
    console.error(err);
    el.downloadStatus.textContent = 'PDFの作成に失敗しました。「印刷 / PDF保存」をお試しください。';
  } finally {
    el.btnDownloadPdf.disabled = false;
  }
});
