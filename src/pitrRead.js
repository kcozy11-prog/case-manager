// ─────────────────────────────────────────────────────────────────────────────
//  과거 시점 데이터 읽기 (Firestore REST API 의 readTime)
//  Firestore 는 문서의 예전 판본을 보관한다. 시점 복구(PITR)를 켜지 않으면 최근 1시간,
//  켜 두면 최근 7일 안의 '분 단위' 시점을 읽을 수 있다(그보다 오래되면 서버가 거절).
//  로그인한 사용자의 ID 토큰으로 요청하므로 보안 규칙이 그대로 적용되고, 자기 데이터만 읽는다.
//  읽은 결과는 '복원용 원본'과 같은 모양({ cases, journal })으로 돌려주어 복원 미리보기에 그대로 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

// Firestore REST 값 → 일반 JS 값
export function fromFirestoreValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return !!v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("geoPointValue" in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ("arrayValue" in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue?.fields);
  return null;
}

export function fromFirestoreFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = fromFirestoreValue(value);
  return out;
}

// 한국시간 날짜(YYYY-MM-DD)·시각(HH:MM) → 분 단위 UTC 시각(RFC 3339). 형식이 틀리면 null.
export function kstToReadTime(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":");
  const ms = Date.parse(`${d}T${hh.padStart(2, "0")}:${mm}:00+09:00`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

// 조회 가능 범위 안내용 (실제 판단은 서버가 한다)
export function readTimeAgeMinutes(readTime, now = Date.now()) {
  const ms = Date.parse(readTime || "");
  return Number.isFinite(ms) ? Math.floor((now - ms) / 60000) : null;
}

class PitrReadError extends Error {
  constructor(message, { status = 0, tooOld = false } = {}) {
    super(message);
    this.status = status;
    this.tooOld = tooOld;
  }
}

async function errorFrom(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || "";
  } catch { /* 본문 없음 */ }
  const tooOld = res.status === 400 || /too old|earliest|version|retention|point.in.time/i.test(detail);
  if (tooOld) {
    return new PitrReadError(
      "그 시점의 데이터는 조회할 수 없습니다. 시점 복구(PITR)가 꺼져 있으면 최근 1시간, 켜져 있으면 최근 7일 안의 시점만 됩니다."
        + (detail ? ` (서버 응답: ${detail})` : ""),
      { status: res.status, tooOld: true },
    );
  }
  if (res.status === 401 || res.status === 403) {
    return new PitrReadError(`조회 권한이 없습니다(${res.status}). 로그아웃 후 다시 로그인해 주세요.`, { status: res.status });
  }
  return new PitrReadError(`과거 시점 조회 실패(${res.status})${detail ? `: ${detail}` : ""}`, { status: res.status });
}

// 컬렉션 문서 전체를 readTime 시점 기준으로 읽는다 (페이지를 넘겨 가며)
export async function listCollectionAt({ projectId, path, idToken, readTime, fetchImpl = fetch, pageSize = 300 }) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  const docs = [];
  let pageToken = "";
  for (let guard = 0; guard < 100; guard++) {
    const params = new URLSearchParams({ readTime, pageSize: String(pageSize) });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetchImpl(`${base}?${params}`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) throw await errorFrom(res);
    const body = await res.json();
    for (const d of body.documents || []) {
      const id = String(d.name || "").split("/").pop();
      if (id) docs.push({ id, data: fromFirestoreFields(d.fields) });
    }
    pageToken = body.nextPageToken || "";
    if (!pageToken) break;
  }
  return docs;
}

// 사용자 데이터(사건·업무일지)를 readTime 시점 그대로 읽는다 → 복원 미리보기용 사본
export async function readUserSnapshotAt({ projectId, uid, idToken, readTime, fetchImpl = fetch }) {
  if (!projectId || !uid || !idToken || !readTime) throw new PitrReadError("시점 조회에 필요한 정보가 없습니다.");
  const [cases, journal] = await Promise.all([
    listCollectionAt({ projectId, path: `users/${uid}/cases`, idToken, readTime, fetchImpl }),
    listCollectionAt({ projectId, path: `users/${uid}/journal`, idToken, readTime, fetchImpl }),
  ]);
  return {
    source: "raw",
    cases: cases.map(({ id, data }) => ({ ...data, id: data.id || id })),
    journal: Object.fromEntries(journal.map(({ id, data }) => [id, data])),
  };
}
