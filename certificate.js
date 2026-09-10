/**
 * certificate.js
 * 照合結果から「筆跡照合報告書」の表示内容を組み立てる。
 */
const HandCertificate = (() => {

  // 本報告書を発行しているのは人間の鑑定人ではなく、以下のプログラム（AI照合エンジン）である旨を
  // 明示するための名称。証明書上の「発行システム」欄に表示する。
  const SYSTEM_NAME = '筆跡照合支援ツール AI照合エンジン（AIHC-1）';

  // 検証コード（透かし）生成用の固定文字列。
  // 様式だけをコピーして手動で内容を書き換えた「偽の」報告書と、本ツールが実際に算出した報告書とを
  // 運営者側で見分けるための簡易的な符丁。コード自体はこのファイル（公開リポジトリ）内にあるため
  // 暗号学的に破られない仕組みではないが、目視・手入力での改ざんを検知する目的には十分機能する。
  const VERIFY_SALT = '筆跡照合支援ツール-SHD-2026';

  function makeCertId() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `HCD-${datePart}-${rand}`;
  }

  // 簡易ハッシュ（32bit FNV-1a）。crypto.subtle に依存しないため、httpsでなくても動作する。
  function fnv1aHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  // 証明書に表示している内容（発行システム名・報告書番号・作成日・案件名・スコア等）から
  // 検証コードを算出する。表示内容のいずれかが後から書き換えられると、この関数を再実行しても
  // 同じコードにはならないため、運営者はコードを再計算して一致するかどうかを確認できる。
  function makeVerifyCode({ certId, dateStr, caseName, pct, examiner }) {
    const base = [VERIFY_SALT, SYSTEM_NAME, certId, dateStr, caseName || '', pct, examiner || '']
      .join('|');
    const hex = fnv1aHash(base) + fnv1aHash(base.split('').reverse().join(''));
    const grouped = hex.toUpperCase().match(/.{1,4}/g).join('-');
    return grouped;
  }

  function render({ caseObj, result, examiner, note }) {
    const d = new Date();
    const certId = makeCertId();
    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}）`;
    const caseName = caseObj.name || '無題の案件';

    document.getElementById('cert-id').textContent = '報告書番号: ' + certId;
    document.getElementById('certificate').dataset.certId = certId;
    document.getElementById('cert-date').textContent = dateStr;
    document.getElementById('cert-system').textContent = SYSTEM_NAME;
    document.getElementById('cert-case-name').textContent = caseName;
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

    const itemLabels = result.items.map(it => it.label).join('・');
    const methodNote = document.getElementById('cert-method-note');
    if (methodNote) {
      methodNote.textContent =
        `この照合は「${SYSTEM_NAME}」が、画像から抽出した統計的特徴（インク密度・線の太さ・傾き・空間分布・線の方向分布など）をもとに、` +
        `試料筆跡（${caseObj.sampleImages.length}枚）と対照筆跡（${caseObj.referenceImages.length}枚）を自動的に比較したものです。` +
        `判定は、上記「総合一致度」の表示のとおり「${pct}%（${verdict.label}）」です。` +
        `判定の基準は、下表に示す${result.items.length}項目（${itemLabels}）それぞれの近さを重み付け平均して算出したものです。`;
    }

    const verifyCode = makeVerifyCode({ certId, dateStr, caseName, pct, examiner });
    const verifyEl = document.getElementById('cert-verify');
    if (verifyEl) {
      verifyEl.textContent = `検証コード: ${verifyCode}`;
      verifyEl.title = '内容の改変がないか運営者が照合するためのコードです。';
    }

    const inquireLink = document.getElementById('btn-inquire-cert');
    if (inquireLink) {
      const ref = `${caseName}（${certId} / 検証コード: ${verifyCode}）`;
      inquireLink.href = 'contact.html?ref=' + encodeURIComponent(ref);
    }

    document.getElementById('panel-certificate').hidden = false;
    document.getElementById('panel-certificate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
