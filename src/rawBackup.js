// ─────────────────────────────────────────────────────────────────────────────
//  원본 백업(복원용) — 내보내기 파일에 숨김 시트로 함께 저장
//  사람이 읽는 시트(사건 목록·기일·…)는 항목 id·상세 메모 등이 빠져 있어 그것만으로는 정확히
//  되돌릴 수 없다. 그래서 사건·업무일지·설정 문서를 JSON 그대로 잘라 담아 두고,
//  '데이터 복원'에서 이 시트를 읽어 원래 모양 그대로 비교·복원한다.
//  한 칸 최대 50,000자 제한이 있어 문서를 40,000자 조각으로 나눈다.
// ─────────────────────────────────────────────────────────────────────────────
export const RAW_SHEET_TITLE = "복원용 원본";
export const RAW_FORMAT = "case-manager-raw-v1";
const CHUNK_SIZE = 40000;
const HEADER = ["경로", "조각", "내용"];

// 서로게이트 쌍(이모지 등)이 조각 경계에서 잘리지 않게 나눈다
export function splitForCells(text, size = CHUNK_SIZE) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out.length ? out : [""];
}

// data: { cases: [사건], journal: { 날짜: 일지 }, meta: { 문서id: 내용 } }
export function buildRawBackupRows(data = {}, info = {}) {
  const docs = [];
  for (const c of data.cases || []) if (c && c.id) docs.push([`cases/${c.id}`, c]);
  for (const [dateKey, entry] of Object.entries(data.journal || {})) if (entry) docs.push([`journal/${dateKey}`, entry]);
  for (const [id, value] of Object.entries(data.meta || {})) if (value) docs.push([`meta/${id}`, value]);
  const header = {
    format: RAW_FORMAT,
    createdAt: info.createdAt || new Date().toISOString(),
    fromServer: info.fromServer !== false,
    appBuild: info.appBuild || "",
    counts: {
      cases: (data.cases || []).filter((c) => c && c.id).length,
      journal: Object.keys(data.journal || {}).length,
      meta: Object.keys(data.meta || {}).length,
    },
  };
  const rows = [HEADER, ["#info", "0", JSON.stringify(header)]];
  for (const [path, value] of docs) {
    splitForCells(JSON.stringify(value)).forEach((piece, i) => rows.push([path, String(i), piece]));
  }
  return rows;
}

// 시트 값(2차원 배열) → { info, cases, journal, meta }. 원본 백업 형식이 아니면 null.
export function parseRawBackupRows(rows = []) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const infoRow = rows.find((r) => Array.isArray(r) && r[0] === "#info");
  if (!infoRow) return null;
  let info;
  try { info = JSON.parse(infoRow[2] || ""); } catch { return null; }
  if (!info || info.format !== RAW_FORMAT) return null;

  const pieces = new Map(); // path → [[index, text]]
  for (const r of rows) {
    if (!Array.isArray(r) || !r[0] || r[0] === "#info" || r[0] === HEADER[0]) continue;
    const path = String(r[0]);
    if (!pieces.has(path)) pieces.set(path, []);
    pieces.get(path).push([Number(r[1]) || 0, r[2] == null ? "" : String(r[2])]);
  }
  const out = { info, cases: [], journal: {}, meta: {}, errors: [] };
  for (const [path, parts] of pieces) {
    const json = parts.sort((a, b) => a[0] - b[0]).map((p) => p[1]).join("");
    let value;
    try { value = JSON.parse(json); } catch { out.errors.push(path); continue; }
    const [kind, ...rest] = path.split("/");
    const id = rest.join("/");
    if (kind === "cases") out.cases.push(value);
    else if (kind === "journal") out.journal[id] = value;
    else if (kind === "meta") out.meta[id] = value;
  }
  return out;
}
