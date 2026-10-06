// 사건 목록 표시 규칙
//  - 기본 목록에는 진행 중 사건만 보인다.
//  - 종결 사건은 '종결' 목록을 고르거나, 검색어를 넣었을 때만 보인다.
//  - 검색 중에는 진행 중·종결을 모두 찾되, 진행 중 사건을 먼저 보여 준다.
export const CLOSED_STATUS = "종결";
export const LIST_STATUSES = ["진행중", "종결"];

export function isClosedCase(c) {
  return c?.status === CLOSED_STATUS;
}

export function matchesCaseSearch(c, query = "") {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [c?.title, c?.client, c?.opponent, c?.caseNumber]
    .some((v) => typeof v === "string" && v.toLowerCase().includes(q));
}

export function filterCaseList(cases = [], { search = "", status = "진행중", type = "전체" } = {}) {
  const q = String(search || "").trim();
  const list = (Array.isArray(cases) ? cases : []).filter((c) => {
    if (!c) return false;
    if (type && type !== "전체" && c.type !== type) return false;
    if (q) return matchesCaseSearch(c, q);
    return status === CLOSED_STATUS ? isClosedCase(c) : !isClosedCase(c);
  });
  if (!q) return list;
  return [...list.filter((c) => !isClosedCase(c)), ...list.filter((c) => isClosedCase(c))];
}

export function countCasesByListStatus(cases = []) {
  const list = Array.isArray(cases) ? cases : [];
  const closed = list.filter((c) => isClosedCase(c)).length;
  return { 진행중: list.length - closed, 종결: closed };
}

// 처음 열 때 오른쪽에 보여 줄 사건: 진행 중 사건이 있으면 그 첫 사건.
export function firstActiveCaseId(cases = []) {
  const list = Array.isArray(cases) ? cases : [];
  return (list.find((c) => c && !isClosedCase(c)) || list[0])?.id || null;
}
