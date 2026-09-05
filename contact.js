/**
 * contact.js
 * お問い合わせページ（contact.html）専用のスクリプト。
 * Formspreeへフォームを送信する。ここをFormspreeで発行された自分の
 * フォームIDに置き換えてください（例: https://formspree.io/f/abcdwxyz）。
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xoeqlyay';

const inquiryForm = document.getElementById('inquiry-form');
const inquiryStatus = document.getElementById('inquiry-status');
const inquiryReference = document.getElementById('inquiry-reference');

// 鑑定書ページの「この鑑定書について問い合わせる」リンクから来た場合、
// URLの ?ref=... の値を案件名・報告書番号欄に自動入力する
const params = new URLSearchParams(window.location.search);
const ref = params.get('ref');
if (ref) inquiryReference.value = ref;

inquiryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (FORMSPREE_ENDPOINT.includes('REPLACE_ME')) {
    inquiryStatus.textContent = 'お問い合わせフォームは準備中です（Formspreeの設定が必要です）。';
    return;
  }
  inquiryStatus.textContent = '送信しています…';
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(inquiryForm)
    });
    if (res.ok) {
      inquiryStatus.textContent = '送信しました。ご連絡ありがとうございます。';
      inquiryForm.reset();
    } else {
      inquiryStatus.textContent = '送信に失敗しました。時間をおいて再度お試しください。';
    }
  } catch (err) {
    console.error(err);
    inquiryStatus.textContent = '送信に失敗しました。通信環境をご確認ください。';
  }
});
