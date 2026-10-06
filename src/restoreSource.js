// ─────────────────────────────────────────────────────────────────────────────
//  복원 원본 읽기: 구글 시트(내보내기 파일) → 비교용 사본
//  - '복원용 원본' 숨김 시트가 있으면 그것을 읽는다(항목 id 까지 그대로).
//  - 없으면(예전 내보내기 파일) 사람이 읽는 시트들을 읽는다(사건명·날짜·내용으로 비교).
// ─────────────────────────────────────────────────────────────────────────────
import { RAW_SHEET_TITLE, parseRawBackupRows } from "./rawBackup.js";
import { snapshotFromExportSheets } from "./restorePlan.js";
import { EXPORT_SHEET_TITLES, quoteSheetName } from "./exportSheet.js";
import { responseErrorMessage } from "./googleApiError.js";

// 시트 주소(URL) 또는 파일 id → 파일 id
export function spreadsheetIdFromInput(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

class GoogleAuthNeeded extends Error {
  constructor(message) {
    super(message);
    this.authError = true;
  }
}

async function googleGet(token, url, label, fetchImpl) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new GoogleAuthNeeded("Google 인증이 만료되었습니다.");
  if (res.status === 403 || res.status === 404) {
    throw new Error(`${label}: 파일을 열 수 없습니다. 주소가 맞는지, 이 Google 계정으로 열 수 있는 파일인지 확인해 주세요.`);
  }
  if (!res.ok) throw new Error(await responseErrorMessage(label, res));
  return res.json();
}

async function readSheets(token, spreadsheetId, titles, fetchImpl) {
  const params = titles.map((t) => `ranges=${encodeURIComponent(quoteSheetName(t))}`).join("&");
  const data = await googleGet(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
    "시트 읽기 실패",
    fetchImpl,
  );
  const out = {};
  (data.valueRanges || []).forEach((vr, i) => { out[titles[i]] = vr.values || []; });
  return out;
}

// 반환: { kind: "raw" | "export", fileTitle, snapshot, info?, errors? }
export async function readRestoreSource(token, spreadsheetId, { fetchImpl = fetch } = {}) {
  const meta = await googleGet(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    "파일 열기 실패",
    fetchImpl,
  );
  const fileTitle = meta?.properties?.title || "내보내기 파일";
  const titles = (meta?.sheets || []).map((s) => s?.properties?.title).filter(Boolean);

  if (titles.includes(RAW_SHEET_TITLE)) {
    const rows = (await readSheets(token, spreadsheetId, [RAW_SHEET_TITLE], fetchImpl))[RAW_SHEET_TITLE];
    const raw = parseRawBackupRows(rows);
    if (raw) {
      return { kind: "raw", fileTitle, snapshot: { source: "raw", cases: raw.cases, journal: raw.journal }, info: raw.info, errors: raw.errors };
    }
  }
  const wanted = EXPORT_SHEET_TITLES.filter((t) => titles.includes(t));
  if (!wanted.includes("사건 목록")) {
    throw new Error("사건관리 내보내기 파일이 아닙니다('사건 목록' 시트가 없습니다).");
  }
  const sheets = await readSheets(token, spreadsheetId, wanted, fetchImpl);
  return { kind: "export", fileTitle, snapshot: snapshotFromExportSheets(sheets, { label: fileTitle }) };
}
