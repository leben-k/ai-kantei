// firebase-config.js
//
// ここにあなた自身のFirebaseプロジェクトの設定値を入れてください。
// Firebaseコンソール → プロジェクトの設定 → 全般 → 「マイアプリ」→ ウェブアプリの
// 「SDK の設定と構成」に表示される値をそのままコピーします。
//
// 補足: これらの値（apiKey等）は「秘密鍵」ではありません。公開リポジトリに
// コミットしても構わない設計です（Googleの公式ドキュメントの説明通りです）。
// 実際のアクセス制御は Firestore / Storage のセキュリティルールと
// Authentication（ログイン）で行います。README.md の手順に従って設定してください。

export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};
