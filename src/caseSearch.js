// 업무일지 사건 선택 검색: 사건명 + 사건번호 + 의뢰인을 대상으로 토큰 AND 부분 일치(대소문자 무시).
// 사건 목록과 같은 규칙: 검색어가 없으면 진행 중 사건만, 검색어가 있으면 종결 사건까지 찾되 진행 중 사건을 먼저.
export function filterCasesByQuery(cases = [], query = '') {
  const list = (Array.isArray(cases) ? cases : []).filter(Boolean);
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return list.filter((c) => c.status !== '종결');
  const hits = list.filter((c) => {
    const hay = [c?.title, c?.caseNumber, c?.client].filter(Boolean).join(' ').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
  return [...hits.filter((c) => c.status !== '종결'), ...hits.filter((c) => c.status === '종결')];
}
