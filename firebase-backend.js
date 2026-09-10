/**
 * firebase-backend.js
 * 共有データベース層。IndexedDB版のHandDBと同じ形の呼び出し方(newCase/saveCase/
 * getCase/listCases/deleteCase)を維持しつつ、内部をFirestore(案件データ)＋
 * Storage(画像本体)に置き換えている。ログイン(HandAuth)も併せて提供する。
 */
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, orderBy, increment
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const CASES = 'cases';

// スタッフ全員で共有する、サイト全体の実行回数（件数）用の定数。
// 「照合する」ボタンの実行回数・「筆跡照合報告書」の作成回数を、
// 個々の案件とは別に、1つの集計用ドキュメントに保持する。
const STATS_COLLECTION = 'stats';
const COUNTERS_DOC_ID = 'counters';

// ---------------- Auth ----------------
const HandAuth = {
  onChange(cb) { return onAuthStateChanged(auth, cb); },
  signIn(email, password) { return signInWithEmailAndPassword(auth, email, password); },
  signOutUser() { return signOut(auth); },
  currentUser() { return auth.currentUser; }
};

// ---------------- helpers ----------------
function newId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// アップロード済みでない画像(ローカルのBlobのみ持つもの)をStorageへ上げ、
// Firestoreに保存できる形(id/name/storagePath/downloadURL)に変換する
async function uploadImageIfNeeded(caseId, kind, item) {
  if (item.downloadURL && item.storagePath) return item; // 既にアップロード済み
  const path = `cases/${caseId}/${kind}/${item.id}-${item.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, item.blob, { contentType: (item.blob && item.blob.type) || 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return { id: item.id, name: item.name, storagePath: path, downloadURL: url };
}

function stripForFirestore(list) {
  return list.map(({ id, name, storagePath, downloadURL }) => ({ id, name, storagePath, downloadURL }));
}

// ---------------- HandDB ----------------
const HandDB = {
  newCase(name) {
    return {
      id: newId('case'),
      name: name || '無題の案件',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sampleImages: [],
      referenceImages: [],
      lastResult: null
    };
  },

  async saveCase(caseObj) {
    for (const kind of ['sampleImages', 'referenceImages']) {
      const shortKind = kind === 'sampleImages' ? 'sample' : 'reference';
      for (let i = 0; i < caseObj[kind].length; i++) {
        caseObj[kind][i] = await uploadImageIfNeeded(caseObj.id, shortKind, caseObj[kind][i]);
      }
    }
    const updatedAt = Date.now();
    const data = {
      name: caseObj.name,
      createdAt: caseObj.createdAt || updatedAt,
      updatedAt,
      sampleImages: stripForFirestore(caseObj.sampleImages),
      referenceImages: stripForFirestore(caseObj.referenceImages),
      lastResult: caseObj.lastResult || null
    };
    await setDoc(doc(db, CASES, caseObj.id), data, { merge: true });
    caseObj.updatedAt = updatedAt;
    caseObj.createdAt = data.createdAt;
    return caseObj;
  },

  async getCase(id) {
    const snap = await getDoc(doc(db, CASES, id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id,
      name: data.name,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      sampleImages: data.sampleImages || [],
      referenceImages: data.referenceImages || [],
      lastResult: data.lastResult || null
    };
  },

  async listCases() {
    const q = query(collection(db, CASES), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  },

  async deleteCase(id) {
    await deleteDoc(doc(db, CASES, id));
  },

  // Storage上の画像ファイルを削除する（1枚単位の削除・案件削除の両方から呼ぶ）
  async deleteImageFile(item) {
    if (!item || !item.storagePath) return;
    try { await deleteObject(ref(storage, item.storagePath)); }
    catch (e) { console.warn('storage delete failed', e); }
  },

  // 解析・サムネイル表示のために実バイナリを取得する
  // ローカルにBlobがまだ残っていればそれを使い、なければdownloadURLから取得する
  async loadBlob(item) {
    if (item.blob) return item.blob;
    const res = await fetch(item.downloadURL);
    if (!res.ok) throw new Error('画像の取得に失敗しました: ' + item.name);
    return await res.blob();
  },

  // ---------------- 実行回数（サイト全体の集計） ----------------
  // field: 'analyzeCount'（照合を実行した回数） | 'certificateCount'（報告書を作成した回数）
  // 案件・画像とは紐付かない、単純な合計カウンタ。ログインしているスタッフ全員で共有される。
  async incrementCounter(field) {
    try {
      await setDoc(
        doc(db, STATS_COLLECTION, COUNTERS_DOC_ID),
        { [field]: increment(1) },
        { merge: true }
      );
    } catch (e) {
      // 集計の失敗が本来の照合・報告書作成の操作自体を妨げないよう、ここでは握りつぶして警告のみ出す
      console.warn('counter increment failed', e);
    }
  },

  async getCounters() {
    try {
      const snap = await getDoc(doc(db, STATS_COLLECTION, COUNTERS_DOC_ID));
      const data = snap.exists() ? snap.data() : {};
      return {
        analyzeCount: data.analyzeCount || 0,
        certificateCount: data.certificateCount || 0
      };
    } catch (e) {
      console.warn('counter fetch failed', e);
      return { analyzeCount: 0, certificateCount: 0 };
    }
  }
};

window.HandDB = HandDB;
window.HandAuth = HandAuth;
