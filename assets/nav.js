/* ============================================================
   ヘッダーのモバイル用メニュー開閉（ハンバーガーメニュー）
   すべてのページで共通に読み込む、小さな独立スクリプト。
   ============================================================ */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".gnav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // メニュー内のリンクをクリックしたら閉じる（スマホでの操作性向上）
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  });
})();
