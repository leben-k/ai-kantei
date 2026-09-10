// firebase-config.js
//
// プロジェクト: tasuku-kanri-2380a (https://console.firebase.google.com/project/tasuku-kanri-2380a)
//
// projectId / authDomain / storageBucket はプロジェクトIDから機械的に決まるため、
// あらかじめ埋めてあります。ただし apiKey / messagingSenderId / appId は
// 「ウェブアプリを登録した時にだけ」発行される値で、プロジェクトIDからは分からず、
// Firebaseコンソールへのログインが必要なため、下記の手順でご自身で取得し、
// REPLACE_ME の部分を書き換えてください。
//
// 【取得手順】
// 1. https://console.firebase.google.com/project/tasuku-kanri-2380a/settings/general を開く
// 2. 下の方の「マイアプリ」で、ウェブアプリ（</> アイコン）をまだ登録していなければ
//    「アプリを追加」→ ウェブ を選び、ニックネームを付けて登録する
//    （Firebase Hostingは使わないのでチェック不要）
// 3. 登録すると表示される、または既に登録済みなら「SDK の設定と構成」に表示される
//    firebaseConfig の値（apiKey, messagingSenderId, appId）をコピーし、下に貼り付ける
//
// 補足: これらの値は「秘密鍵」ではありません。公開リポジトリにコミットしてかまいません。
// 実際のアクセス制御は Firestore / Storage のセキュリティルールと Authentication（ログイン）で行います。

export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "tasuku-kanri-2380a.firebaseapp.com",
  projectId: "tasuku-kanri-2380a",
  storageBucket: "tasuku-kanri-2380a.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};
