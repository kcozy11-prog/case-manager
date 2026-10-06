// ─────────────────────────────────────────────────────────────────────────────
//  백업·복원용 전체 데이터 읽기
//  내보내기(원본 백업 시트)와 복원 미리보기는 기기 캐시가 아니라 서버 판본을 기준으로 해야 한다.
//  서버에 닿지 않으면 기기 사본으로 읽되, 그 사실(fromServer=false)을 함께 돌려준다.
// ─────────────────────────────────────────────────────────────────────────────
import { collection, doc, getDocs, getDocsFromServer, getDoc, getDocFromServer } from "firebase/firestore";
import { db } from "./firebase";

export const BACKUP_META_DOCS = ["standaloneTodos", "taskSync", "calendarSync", "restoreLog"];

async function readAll(uid, fromServer) {
  const casesCol = collection(db, "users", uid, "cases");
  const journalCol = collection(db, "users", uid, "journal");
  const metaRefs = BACKUP_META_DOCS.map((id) => doc(db, "users", uid, "meta", id));
  const [casesSnap, journalSnap, ...metaSnaps] = await Promise.all([
    fromServer ? getDocsFromServer(casesCol) : getDocs(casesCol),
    fromServer ? getDocsFromServer(journalCol) : getDocs(journalCol),
    ...metaRefs.map((ref) => (fromServer ? getDocFromServer(ref) : getDoc(ref))),
  ]);
  const journal = {};
  journalSnap.docs.forEach((d) => { journal[d.id] = d.data(); });
  const meta = {};
  metaSnaps.forEach((snap, i) => { if (snap.exists()) meta[BACKUP_META_DOCS[i]] = snap.data(); });
  return {
    cases: casesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    journal,
    meta,
    fromServer,
  };
}

// { cases: [저장된 그대로], journal: { 날짜: 일지 }, meta: { 문서id: 내용 }, fromServer }
export async function collectAllUserData(uid, { requireServer = false } = {}) {
  try {
    return await readAll(uid, true);
  } catch (e) {
    if (requireServer) throw e;
    console.warn("[백업] 서버에서 읽지 못해 기기 사본으로 만듭니다.", e);
    return readAll(uid, false);
  }
}
