// ─────────────────────────────────────────────────────────────────────────────
//  law-journal → 통합앱 일지 마이그레이션
//
//  데이터 출처(우선순위):
//   1) localStorage 'lawJournal_entries' — law-journal 이 매 저장 시 함께 기록.
//      uid 와 무관하므로 같은 브라우저라면 가장 손쉬운 경로.
//   2) (선택) 구 Realtime DB(law-jounal 프로젝트) users/{uid}/entries —
//      Firebase Auth UID 는 프로젝트마다 달라 별도 Google 인증이 필요.
//
//  두 출처를 _savedAt 기준으로 병합(mergeEntryMapsBySavedAt) 후
//  case-manager-74bcb Firestore 의 users/{uid}/journal 로 일괄 기록.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";
import { writeBatch, doc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { mergeEntryMapsBySavedAt } from "./journalLogic";

const LS_KEY = "lawJournal_entries";

// 구 law-journal Realtime DB 설정 (읽기 전용 가져오기에만 사용)
const LEGACY_RTDB_CONFIG = {
  apiKey: "AIzaSyCa0UxpbroPInD0_aDz0mlJLlXVqTR2yl0",
  authDomain: "law-jounal.firebaseapp.com",
  databaseURL: "https://law-jounal-default-rtdb.firebaseio.com",
  projectId: "law-jounal",
  storageBucket: "law-jounal.firebasestorage.app",
  messagingSenderId: "1049097224898",
  appId: "1:1049097224898:web:6104af07ba199a74b9f15b",
};

// 1) localStorage 에서 일지 읽기
export function importFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("[migrate] localStorage 파싱 실패", e);
    return {};
  }
}

// 2) 구 Realtime DB 에서 일지 읽기 (별도 Google 인증)
export async function importFromLegacyRealtimeDb() {
  const legacyApp = initializeApp(LEGACY_RTDB_CONFIG, "legacy-law-journal");
  try {
    const auth = getAuth(legacyApp);
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const uid = result.user?.uid;
    if (!uid) return {};
    const rdb = getDatabase(legacyApp);
    const snap = await get(ref(rdb, `users/${uid}/entries`));
    const val = snap.val();
    return val && typeof val === "object" ? val : {};
  } finally {
    await deleteApp(legacyApp).catch(() => {});
  }
}

// Firestore 에 일괄 기록 (500개 배치 제한 고려해 청크 분할)
async function batchWriteJournal(uid, entries) {
  const dateKeys = Object.keys(entries);
  const colRef = collection(db, "users", uid, "journal");
  for (let i = 0; i < dateKeys.length; i += 400) {
    const batch = writeBatch(db);
    dateKeys.slice(i, i + 400).forEach((dateKey) => {
      const entry = { ...entries[dateKey] };
      if (!entry._savedAt) entry._savedAt = new Date().toISOString();
      entry.entryDate = entry.entryDate || dateKey;
      batch.set(doc(colRef, dateKey), entry);
    });
    await batch.commit();
  }
  return dateKeys.length;
}

// 메인: 출처들을 병합 후 Firestore 로 마이그레이션
//  options.includeRealtimeDb=true 이면 구 RTDB 도 가져옴(추가 인증 발생)
//  existing = 현재 Firestore 에 이미 있는 일지 맵 (덮어쓰기 방지용 병합 기준)
export async function migrateJournal(uid, { includeRealtimeDb = false, existing = {} } = {}) {
  if (!uid) throw new Error("로그인이 필요합니다.");

  let merged = { ...existing };
  let localCount = 0;
  let rtdbCount = 0;

  const local = importFromLocalStorage();
  localCount = Object.keys(local).length;
  merged = mergeEntryMapsBySavedAt(merged, local).entries;

  if (includeRealtimeDb) {
    const rtdb = await importFromLegacyRealtimeDb();
    rtdbCount = Object.keys(rtdb).length;
    merged = mergeEntryMapsBySavedAt(merged, rtdb).entries;
  }

  // 기존 Firestore 항목과 동일하지 않은 것만 기록 대상에 (간단히 전체 기록)
  const toWrite = {};
  Object.keys(merged).forEach((dateKey) => {
    if (!existing[dateKey] || existing[dateKey]._savedAt !== merged[dateKey]._savedAt) {
      toWrite[dateKey] = merged[dateKey];
    }
  });

  const written = await batchWriteJournal(uid, toWrite);
  return { localCount, rtdbCount, written, total: Object.keys(merged).length };
}
