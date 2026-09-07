/* ============================================================
   共通ユーティリティ
   - 都道府県／公安委員会名データ
   - 和暦日付の組み立て
   - 一時保存（このブラウザに保存）／ファイル書き出し・読み込み
   すべてブラウザ内で完結し、サーバーには一切送信されません。
   ============================================================ */
(function (global) {
  "use strict";

  // 47都道府県。表記は「〇〇県公安委員会」が基本だが、
  // 北海道・東京都・大阪府・京都府のみ例外。
  var PREFS = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
    "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
    "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
    "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
    "熊本県","大分県","宮崎県","鹿児島県","沖縄県"
  ];

  function publicSafetyCommissionName(pref) {
    if (!pref) return "";
    // 「県」「都」「府」は既に含まれているのでそのまま「公安委員会」を付す
    return pref + "公安委員会";
  }

  var PREF_DATA = PREFS.map(function (p) {
    return { name: p, commission: publicSafetyCommissionName(p) };
  });

  var ERA_OPTIONS = [
    { v: "令和", start: 2019 },
    { v: "平成", start: 1989 },
    { v: "昭和", start: 1926 },
    { v: "大正", start: 1912 },
    { v: "明治", start: 1868 }
  ];

  function eraDateText(v) {
    if (!v || !v.era || !v.y || !v.m || !v.d) return "";
    return v.era + v.y + "年" + v.m + "月" + v.d + "日";
  }
  function eraDateFilled(v){
    return !!(v && v.era && v.y && v.m && v.d);
  }

  // ---- ローカル保存（このブラウザ内のみ・サーバー送信なし） ----
  var STORAGE_PREFIX = "tantei_todokede_";

  function saveState(formId, state) {
    try {
      localStorage.setItem(STORAGE_PREFIX + formId, JSON.stringify({
        savedAt: new Date().toISOString(),
        data: state
      }));
      return true;
    } catch (e) {
      console.warn("保存に失敗しました", e);
      return false;
    }
  }
  function loadState(formId) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + formId);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  function clearState(formId) {
    try { localStorage.removeItem(STORAGE_PREFIX + formId); } catch (e) {}
  }

  // ---- ファイルに書き出し／読み込み（PC・スマホへの保存用） ----
  function downloadJSON(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function readJSONFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try { resolve(JSON.parse(reader.result)); }
        catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }

  function isKatakana(str) {
    return /^[\u30A0-\u30FFー\s]*$/.test(str || "");
  }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function todayEra() {
    // 現在日付を「令和」ベースの初期値として返す（未入力の目安表示用）
    var d = new Date();
    var y = d.getFullYear() - 2018; // 令和元年=2019
    return { era: "令和", y: String(y > 0 ? y : 1), m: String(d.getMonth() + 1), d: String(d.getDate()) };
  }

  global.Tantei = {
    PREFS: PREFS,
    PREF_DATA: PREF_DATA,
    ERA_OPTIONS: ERA_OPTIONS,
    publicSafetyCommissionName: publicSafetyCommissionName,
    eraDateText: eraDateText,
    eraDateFilled: eraDateFilled,
    saveState: saveState,
    loadState: loadState,
    clearState: clearState,
    downloadJSON: downloadJSON,
    readJSONFile: readJSONFile,
    isKatakana: isKatakana,
    esc: esc,
    todayEra: todayEra
  };
})(window);
