// 업무일지 사건 선택 검색: 사건명 + 사건번호 + 의뢰인을 대상으로 토큰 AND 부분 일치(대소문자 무시).
export function filterCasesByQuery(cases = [], query = '') {
  const list = Array.isArray(cases) ? cases : [];
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return list;
  return list.filter((c) => {
    const hay = [c?.title, c?.caseNumber, c?.client].filter(Boolean).join(' ').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
