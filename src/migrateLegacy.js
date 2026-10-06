// ── Google Sheets "사건진행부" → 케이스매니저 가져오기 ────────────────────
import { db } from "./firebase";
import { collection, doc, runTransaction } from "firebase/firestore";
import { todayStr } from "./utils";
import { buildExportBatchUpdateData, EXPORT_SHEET_TITLES, a1Range } from "./exportSheet";
import { buildRawBackupRows, RAW_SHEET_TITLE } from "./rawBackup";
import { responseErrorMessage } from "./googleApiError";

const SPREADSHEET_ID = "1zgH0S46N0-RobcGOM7VWhZU6ssjDxizHtKdt0wZsY-I";
const CIVIL_RANGE = "김명진(민사)!A1:I100";
const CRIMINAL_RANGE = "김명진(형사)!A1:I100";

// ── Sheets API로 데이터 가져오기 ────────────────────────────────────
async function fetchSheetData(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Sheets API: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.values || [];
}

// ── 행 → 사건 객체 변환 ─────────────────────────────────────────────
function rowToCase(row, type, idx) {
  // 빈 셀 패딩 (Sheets API는 뒤쪽 빈 셀을 생략)
  const padded = Array.from({ length: 9 }, (_, i) => (row[i] || "").toString());
  const [, client, opponent, court, tribunal, caseNumber, caseName, hearing, progress] = padded;
  if (!client.trim() && !caseName.trim() && !caseNumber.trim()) return null;

  // 의뢰인 파싱: "이름\n(자격)" → 이름, 자격
  const clientLines = client.split("\n");
  const clientName = clientLines[0].trim();
  const clientRole = clientLines.find(l => l.match(/^\(.*\)$/))?.replace(/[()]/g, "") || "";

  // 사건번호 첫 번째만
  const cleanCaseNum = caseNumber.split(/---/)[0].trim();

  // 기일 파싱
  const hearings = [];
  if (hearing.trim()) {
    const dateMatch = hearing.match(/(\d{2,4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (dateMatch) {
      let y = dateMatch[1]; if (y.length === 2) y = "20" + y;
      const hearingDate = `${y}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
      const typeLines = hearing.split("\n").filter(l => !l.match(/^\d/));
      hearings.push({
        id: Date.now() + idx,
        date: hearingDate,
        type: typeLines[0]?.trim() || "기일",
        result: "",
      });
    }
  }

  // 사건진행 → 메모 변환
  const memos = [];
  if (progress.trim()) {
    const lines = progress.split("\n").filter(l => l.trim());
    let curDate = "", curContent = [];

    for (const line of lines) {
      const dm = line.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[.\s]/);
      if (dm) {
        if (curContent.length > 0 && curDate) {
          const text = curContent.join("\n");
          memos.push({
            id: Date.now() + memos.length + idx * 100,
            category: "공식결과메모",
            title: text.substring(0, 15) + (text.length > 15 ? "…" : ""),
            content: text,
            date: curDate,
          });
        }
        curDate = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
        curContent = [line.replace(/^\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}[.\s]*/, "").trim()];
      } else {
        curContent.push(line.trim());
      }
    }
    if (curContent.length > 0 && curDate) {
      const text = curContent.join("\n");
      memos.push({
        id: Date.now() + memos.length + idx * 100,
        category: "공식결과메모",
        title: text.substring(0, 15) + (text.length > 15 ? "…" : ""),
        content: text,
        date: curDate,
      });
    }
  }

  // 재판부/법원 정보 메모
  if (tribunal.trim()) {
    memos.push({
      id: Date.now() + memos.length + idx * 100 + 500,
      category: "일반메모",
      title: "재판부 정보",
      content: tribunal.trim(),
      date: todayStr,
    });
  }

  return {
    id: `sheet_${type}_${idx}`,
    title: caseName.trim().split(/\r?\n/)[0] || `${clientName} 사건`,
    type: type === "civil" ? "민사" : "형사(고소)",
    status: "진행중",
    client: clientName,
    clientContact: clientRole ? `(${clientRole})` : "",
    opponent: opponent.trim(),
    manager: "",
    managerOrg: "",
    managerContact: "",
    court: court.split(/---/)[0].split("\n")[0].trim(),
    caseNumber: cleanCaseNum,
    retainer: { amount: "", date: "", successFee: "", successFeeAmount: "" },
    hearings,
    timeline: [],
    memos,
    documents: [],
    todos: [],
  };
}

// ── 메인: Sheets 읽기 + Firebase 저장 ───────────────────────────────
export async function migrateLegacyData(userId, token) {
  if (!token) throw new Error("Google 토큰이 필요합니다. 로그아웃 후 다시 로그인하세요.");

  // 민사 / 형사 시트 읽기
  const [civilRows, crimRows] = await Promise.all([
    fetchSheetData(token, CIVIL_RANGE),
    fetchSheetData(token, CRIMINAL_RANGE),
  ]);

  if (!civilRows && !crimRows) {
    throw new Error("Sheets 인증 만료. 로그아웃 후 다시 로그인하세요.");
  }

  // 헤더 제외, 변환
  const civilCases = (civilRows || []).slice(1).map((r, i) => rowToCase(r, "civil", i)).filter(Boolean);
  const crimCases = (crimRows || []).slice(1).map((r, i) => rowToCase(r, "criminal", i + 100)).filter(Boolean);
  const allCases = [...civilCases, ...crimCases];

  // Firebase에 저장 — 이미 있는 사건은 건드리지 않는다.
  // (사건 id 가 시트 행 순서로 정해지므로, 예전처럼 덮어쓰면 다시 실행할 때 그 뒤 기록한
  //  진행경과·할 일·서면이 3월 시트 내용으로 모두 지워진다)
  const colRef = collection(db, "users", userId, "cases");
  let added = 0;
  let skipped = 0;
  for (const c of allCases) {
    const ref = doc(colRef, c.id);
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return "skipped";
      tx.set(ref, c);
      return "added";
    });
    if (result === "added") added++;
    else skipped++;
  }

  return { civil: civilCases.length, criminal: crimCases.length, total: allCases.length, added, skipped };
}

// ── 구글시트 내보내기 ─────────────────────────────────────────────────

// raw: { data: { cases, journal, meta }, info } 를 주면 '복원용 원본' 숨김 시트에 원본 그대로 함께 담는다.
// title: 파일 이름 (기본: 사건관리 내보내기 날짜)
export async function exportToGoogleSheet(token, cases, journalEntries = {}, { raw = null, title = "" } = {}) {
  const rawRows = raw ? buildRawBackupRows(raw.data || {}, raw.info || {}) : null;
  const sheets = EXPORT_SHEET_TITLES.map(sheetTitle => ({ properties: { title: sheetTitle } }));
  if (rawRows) {
    sheets.push({
      properties: {
        title: RAW_SHEET_TITLE,
        hidden: true,
        gridProperties: { rowCount: Math.max(1000, rawRows.length + 10), columnCount: 3 },
      },
    });
  }

  // 1. 새 스프레드시트 생성
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: title || `사건관리 내보내기 ${new Date().toLocaleDateString("ko-KR")}` },
      sheets,
    }),
  });

  if (createRes.status === 401 || createRes.status === 403) return null;
  if (!createRes.ok) throw new Error(await responseErrorMessage("시트 생성 실패", createRes));

  const spreadsheet = await createRes.json();
  const writeValues = async (data, label) => {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
    if (!res.ok) throw new Error(await responseErrorMessage(label, res));
  };

  // 2. 사람이 읽는 시트 (사건 + 업무일지)
  await writeValues(buildExportBatchUpdateData(cases, journalEntries), "데이터 입력 실패");

  // 3. 복원용 원본 — 요청 하나가 너무 커지지 않게 나눠 보낸다
  if (rawRows) {
    const MAX_CHARS = 2_000_000;
    let start = 0;
    while (start < rawRows.length) {
      let end = start;
      let size = 0;
      while (end < rawRows.length && (end === start || size + rawRows[end][2].length < MAX_CHARS)) {
        size += rawRows[end][2].length;
        end++;
      }
      await writeValues([{ range: a1Range(RAW_SHEET_TITLE, `A${start + 1}`), values: rawRows.slice(start, end) }], "복원용 원본 입력 실패");
      start = end;
    }
  }

  return spreadsheet.spreadsheetUrl;
}
