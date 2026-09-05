# 筆跡照合支援ツール（Handwriting Comparison Desk）

試料筆跡（鑑定したい筆跡）と対照筆跡（本人のものと分かっている筆跡）を、それぞれA4画像で最大5枚までアップロードし、
画像の統計的特徴（インク密度・線の太さ・傾き・空間分布・線の方向分布）を比較して、一致度と鑑定書（報告書）を出力するWebアプリです。
GitHub Pages（無料）でホスティングし、Firebase（無料のSparkプラン）を共有データベースとして使います。

## 全体構成

| 役割 | 使用サービス | 無料枠の目安 |
|---|---|---|
| ホスティング（HTML/CSS/JS） | GitHub Pages | 無料・無制限（公開リポジトリ） |
| ログイン（スタッフのみ利用） | Firebase Authentication | 無料 |
| 案件データ（案件名・照合結果など） | Cloud Firestore | 無料枠: 保存1GiB、読み取り5万回/日、書き込み2万回/日 |
| 画像本体（試料・対照） | Firebase Storage | 無料枠: 保存5GB、ダウンロード1GB/日 |
| お問い合わせフォーム | Formspree | 無料枠: 1フォームにつき月50件まで、**添付ファイル不可** |

すべて無料枠の範囲で運用できますが、アクセス数・画像サイズが増えると有料プランへの移行が必要になる場合があります。

## 重要な限界（必ずお読みください）

- このツールは画像から機械的に取り出せる二次的な特徴（線の太さ・傾き・密度・方向分布など）を比較する簡易的な参考ツールです。実際の筆跡鑑定士が行う鑑定（筆順、筆圧、運筆速度、個別の字形の分析など）とは精度も方法もまったく異なり、**法的な証拠能力を持つ鑑定書ではありません**。裁判・契約・警察提出など正式な証拠が必要な場面では、必ず有資格の筆跡鑑定士に依頼してください。
- Formspreeの無料プランは**ファイル添付ができません**。鑑定書（PDF）を相手に渡す場合は、「印刷 / PDF保存」でPDF化したものを、メール等で手動送付する運用にしてください。お問い合わせフォームは「案件名・報告書番号を書いて連絡してもらう」窓口として使います。

## ファイル構成

```
handwriting-appraisal/
├── index.html                 # 画面本体（ログイン・案件・アップロード・照合・鑑定書・問い合わせ）
├── css/style.css               # デザイン
├── js/analysis.js              # 画像特徴抽出・類似度計算（ブラウザ内で完結）
├── js/certificate.js           # 鑑定書（報告書）の描画
├── js/firebase-config.js       # あなたのFirebaseプロジェクトの設定値（要編集）
├── js/firebase-backend.js      # Firestore/Storage/Authのラッパー（共有データベース層）
├── js/app.js                   # 画面の状態管理・イベント配線（Formspreeの送信先もここで設定）
├── methodology.html            # 「鑑定の手段・方法」ページ
├── reliability.html            # 「鑑定の信頼度について」ページ
└── privacy.html                # 「プライバシーポリシー」ページ（要編集・下記参照）
```

`methodology.html`・`reliability.html`は内容の編集は不要ですが、`privacy.html`は運営者名・連絡先・最終更新日などを実際の内容に書き換えてから公開してください（本文中に記入箇所を示すコメントがあります）。このプライバシーポリシーはひな形であり、法的助言ではありません。実際の運用前に必要に応じて専門家の確認を受けてください。

---

## セットアップ手順

### 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ にアクセスし、Googleアカウントでログインして「プロジェクトを追加」。
2. プロジェクト名を入力（例: `handwriting-appraisal`）。Googleアナリティクスは不要なのでオフでよい。
3. 料金プランは **Spark（無料）** のままでOKです。

### 2. ウェブアプリを登録し、設定値を取得する

1. プロジェクトのトップ画面で `</>`（ウェブ）アイコンをクリックしてアプリを追加。
2. アプリのニックネームを入力（例: `handwriting-web`）。Firebase Hostingは今回使わないのでチェック不要。
3. 表示される `firebaseConfig` の値（apiKey, authDomain, projectId など）をコピーし、`js/firebase-config.js` の該当箇所に貼り付けます。

   ```js
   export const firebaseConfig = {
     apiKey: "実際の値",
     authDomain: "実際の値",
     projectId: "実際の値",
     storageBucket: "実際の値",
     messagingSenderId: "実際の値",
     appId: "実際の値"
   };
   ```
   この値は秘密鍵ではないため、GitHubに公開してかまいません（アクセス制御はステップ4・5のルールで行います）。

### 3. Authentication（ログイン）を有効化し、スタッフのアカウントを作る

1. 左メニュー「Authentication」→「始める」→ ログイン方法で **メール/パスワード** を有効化。
2. 「Users」タブ →「ユーザーを追加」で、実際に使うスタッフのメールアドレスとパスワードを手動で登録します。
   - このアプリには自己登録（サインアップ）機能はありません。アカウントは管理者がここで発行してください。

### 4. Cloud Firestoreを有効化する

1. 左メニュー「Firestore Database」→「データベースの作成」。本番環境モードを選択し、リージョンは `asia-northeast1`（東京）などお近くのものを選択。
2. 「ルール」タブを開き、以下に置き換えて「公開」します（ログインuser以外は読み書き不可にする設定）。

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /cases/{caseId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

### 5. Firebase Storageを有効化する

1. 左メニュー「Storage」→「始める」。デフォルト設定のまま進めてOKです。
2. 「Rules」タブを以下に置き換えて「公開」します。

   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /cases/{caseId}/{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

3. **CORS設定（重要）**: 画像の特徴解析はブラウザ内でピクセルデータを読み取るため、Storageから画像を取得する際にCORSの許可が必要です。Google Cloud SDK（`gcloud`/`gsutil`）をインストールしたパソコンから、以下のようなファイルを作って設定してください。

   `cors.json`
   ```json
   [
     {
       "origin": ["https://<あなたのユーザー名>.github.io"],
       "method": ["GET"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

   ```bash
   gsutil cors set cors.json gs://<あなたのプロジェクトID>.appspot.com
   ```
   ローカルで動作確認する場合は `origin` に `http://localhost:xxxx` も追加してください。

### 6. Formspree（お問い合わせフォーム）を作る

1. https://formspree.io/ でアカウントを作成（無料）。
2. 「New Form」でフォームを作成すると、`https://formspree.io/f/xxxxxxx` のようなエンドポイントURLが発行されます。
3. `js/app.js` の先頭にある以下の行を、発行されたURLに書き換えます。

   ```js
   const FORMSPREE_ENDPOINT = 'https://formspree.io/f/REPLACE_ME';
   ```

4. 無料プランは月50件・添付ファイル不可です。件数が増えそうな場合は有料プランへの切り替えを検討してください。

### 7. GitHub Pagesで公開する

1. GitHubで新しい **Publicリポジトリ**を作成します（例: `handwriting-appraisal`）。
2. このフォルダの中身（`index.html`, `css/`, `js/`, `README.md`）をリポジトリのルートにアップロードします。

   ```bash
   git init
   git add .
   git commit -m "init: handwriting comparison desk (firebase + formspree)"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/handwriting-appraisal.git
   git push -u origin main
   ```

3. リポジトリの **Settings → Pages** →「Build and deployment」の「Source」で **Deploy from a branch** を選び、Branchを `main` / フォルダを `/(root)` に設定して保存。
4. 数十秒〜数分後、`https://<あなたのユーザー名>.github.io/handwriting-appraisal/` でアクセスできます。
5. ステップ5のCORS設定の `origin` を、この実際のURLに合わせて再確認してください。

---

## 使い方

1. トップの「ログイン」でステップ3で発行したメールアドレス・パスワードを入力してログイン。
2. 「案件を選ぶ」で案件名を入力（新規作成時は画像追加のタイミングで自動的に保存されます）。
3. 「試料筆跡」「対照筆跡」それぞれにA4画像をアップロード（各最大5枚）。アップロードはFirebase Storageに保存され、他のログインユーザーからも同じ案件が見えるようになります。
4. 「特徴を抽出して照合する」で一致度スコアを表示。
5. 「鑑定書を作成する」で報告書を生成。「印刷 / PDF保存」でPDF化できます。
6. 依頼者からの問い合わせは、ページ下部の「お問い合わせ」フォーム（Formspree経由）で受け付けます。

## 既知の制限・今後の拡張候補

- Formspree無料プランはファイル添付不可のため、鑑定書PDFの送付は手動運用です。添付が必要ならFormspreeの有料プラン、またはEmailJS等への切り替えを検討してください。
- 案件・画像の削除は取り消せません。
- より高度な特徴量（筆圧の推定、字形単位の照合など）や、Firestoreのリアルタイム更新（複数人が同時に同じ案件を見て自動更新）は未実装です。
