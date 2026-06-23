// ─────────────────────────────────────────────────────────────────────────────
//  업무일지(Journal) Firestore 데이터 레이어
//  통합 전: law-journal 이 Realtime DB(law-jounal) + localStorage 에 저장하던 것을
//  통합 후: case-manager-74bcb Firestore 의 users/{uid}/journal/{dateKey} 로 일원화.
//
//  일지 entry 는 law-journal 의 필드 스키마를 그대로 유지한다.
//  (대부분 JSON 문자열 필드 — journalLogic.js 의 함수들이 이 형태를 그대로 소비)
// ─────────────────────────────────────────────────────────────────────────────
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// law-journal 의 FIELDS 와 동일한 entry 필드 집합
export const JOURNAL_FIELDS = [
  "entryDate", "arrivalTime", "leaveTime",
  "todayTasks", "todayTaskCompletions", "todayWork", "eventMemos", "callNotes", "writtenDocs",
  "submittedDocItems", "pendingDocs", "pendingDocItems", "pendingDocCompletions",
  "delegated", "delegatedItems", "learned", "learnedItems",
  "tomorrowTasks", "etc",
  // 사건 연동: 진행 기록 / 통화 상담 기록 (JSON 배열 문자열)
  "caseProgressItems", "callLogItems",
];

export function emptyJournalEntry(dateKey) {
  const entry = {};
  JOURNAL_FIELDS.forEach((f) => { entry[f] = ""; });
  entry.entryDate = dateKey || "";
  return entry;
}

// 컬렉션 참조
function journalCol(uid) {
  return collection(db, "users", uid, "journal");
}

// 실시간 구독 → 콜백에 { [dateKey]: entry } 맵 전달
export function subscribeJournal(uid, cb, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    journalCol(uid),
    (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      cb(map);
    },
    (err) => { console.error("[journal] 구독 오류:", err); onError && onError(err); }
  );
}

// 단일 일지 저장 (dateKey 를 문서 ID 로 사용, _savedAt 갱신)
export async function saveJournalEntry(uid, dateKey, data) {
  if (!uid || !dateKey) return;
  const entry = { ...data, entryDate: dateKey, _savedAt: new Date().toISOString() };
  await setDoc(doc(journalCol(uid), dateKey), entry);
  return entry;
}

// 일지 삭제
export async function deleteJournalEntry(uid, dateKey) {
  if (!uid || !dateKey) return;
  await deleteDoc(doc(journalCol(uid), dateKey));
}

// 전체 일지 1회 조회 → { [dateKey]: entry } 맵 (내보내기 등 단발성 용도)
export async function fetchAllJournalEntries(uid) {
  if (!uid) return {};
  const snap = await getDocs(journalCol(uid));
  const map = {};
  snap.docs.forEach((d) => { map[d.id] = d.data(); });
  return map;
}
