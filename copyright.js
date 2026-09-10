/**
 * copyright.js
 * フッターの著作権表示年を自動更新する。
 * 開始年(START_YEAR)は固定し、現在の年がそれより後になったら
 * 「開始年-現在の年」の範囲表示に自動的に切り替わる。
 * 例: 2026年中は「© 2026」、2027年になったら自動的に「© 2026-2027」。
 * 年が変わるたびに手動で書き換える必要はない。
 */
(function () {
  var START_YEAR = 2026;
  var currentYear = new Date().getFullYear();
  var text = currentYear > START_YEAR ? (START_YEAR + '\u2013' + currentYear) : String(START_YEAR);

  var els = document.querySelectorAll('.js-copyright-year');
  els.forEach(function (el) {
    el.textContent = text;
  });
})();
