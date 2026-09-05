/**
 * certificate.js
 * 照合結果から「鑑定書（報告書）」の表示内容を組み立てる。
 */
const HandCertificate = (() => {

  function makeCertId() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `HCD-${datePart}-${rand}`;
  }

  function render({ caseObj, result, examiner, note }) {
    const d = new Date();
    const certId = makeCertId();
    document.getElementById('cert-id').textContent = '報告書番号: ' + certId;
    document.getElementById('certificate').dataset.certId = certId;
    document.getElementById('cert-date').textContent =
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    document.getElementById('cert-case-name').textContent = caseObj.name || '無題の案件';
    document.getElementById('cert-sample-count').textContent = `${caseObj.sampleImages.length} 枚`;
    document.getElementById('cert-reference-count').textContent = `${caseObj.referenceImages.length} 枚`;
    document.getElementById('cert-examiner-out').textContent = examiner || '（未記入）';

    const pct = Math.round(result.overall * 100);
    document.getElementById('cert-score').textContent = pct + '%';
    const verdict = HandAnalysis.verdictFor(result.overall);
    document.getElementById('cert-verdict').textContent =
      `統計的特徴の一致度は「${verdict.label}」と算出されました。`;

    const tbody = document.querySelector('#cert-feature-table tbody');
    tbody.innerHTML = '';
    result.items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.label}</td><td>${Math.round(it.score * 100)}%</td>`;
      tbody.appendChild(tr);
    });

    document.getElementById('cert-note-out').textContent = note && note.trim() ? note.trim() : '—';

    document.getElementById('panel-certificate').hidden = false;
    document.getElementById('panel-certificate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
