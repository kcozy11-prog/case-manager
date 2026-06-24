# 대기서면 제출→진행경과 자동기록 + 업무일지 사건 선택 검색

작성일: 2026-06-24

## 배경
- 업무일지 제출예정서면 → 사건 제출대기서면(briefs) 전송은 동작 확정됨.
- 두 가지 후속 요청:
  1. 사건 '서면' 탭에서 대기서면을 **실제 제출(제출함)** 처리하면 그 사건의 **진행경과(timeline)에 자동 기록**.
  2. 업무일지의 **사건 선택 드롭다운에 검색 기능**(사건이 많아 스크롤이 불편).

## 데이터 구조(현행)
- 사건 `c.timeline`: `[{ id, date, content }]` — OverviewTab에서 날짜 내림차순 렌더.
- 사건 `c.briefs`: `[{ id, title, status:'pending'|'submitted', preparedDate, submittedDate }]`.
- `caseLink.upsertTimelineEntry(caseObj, {id,date,content})` → id 기반 upsert(중복 방지), 원본 불변.

---

## 기능 1 — 대기서면 제출 → 진행경과 자동 기록

**위치:** 순수 변환 로직은 `src/caseLink.js`(기존 순수 헬퍼 패턴), UI는 `src/components/BriefsTab.jsx`. `BriefsTab`의 외부 인터페이스(`c`, `onUpdate`) 변경 없음.

**서면 데이터에 필드 1개 추가:** `submitTimelineId`(선택) — 제출 시 생성한 진행경과 항목 id를 보관(되돌리기 시 정확히 제거하기 위함). 없으면 빈 값 — 기존 데이터 호환.

**신규 순수 헬퍼(`caseLink.js`, 원본 불변):**
- `markBriefSubmitted(caseObj, briefId, today, makeId)` → 해당 서면 `status:'submitted', submittedDate(기존값||today), submitTimelineId(기존값||makeId())` 로 갱신 + `upsertTimelineEntry(.., {id:submitTimelineId, date:submittedDate, content:"{title} 제출"})`. 갱신된 case 반환.
- `markBriefPending(caseObj, briefId)` → 해당 서면 `status:'pending', submittedDate:'', submitTimelineId:''` + `submitTimelineId` 동일 id의 timeline 항목 제거. 갱신된 case 반환.
- (`makeId`/`today` 주입 → 테스트 결정론 확보)

**UI(BriefsTab) 동작:**
- **제출함:** `onUpdate(markBriefSubmitted(c, id, todayStr, () => Date.now()))`
- **되돌리기:** `onUpdate(markBriefPending(c, id))`
- **서면 삭제(del):** 현행대로 briefs에서만 제거. **진행경과는 건드리지 않음**(사용자가 진행경과에서 직접 삭제).

**멱등성/순서:** 같은 서면을 제출↔되돌리기 반복해도 `submitTimelineId` 재사용으로 중복 진행경과가 생기지 않음. 되돌린 뒤 다시 제출하면 새 id로 다시 추가.

**비고:** content는 제출 시점의 서면 제목 사용. 제목을 나중에 바꿔도 기존 진행경과 문구는 그대로(이력성).

---

## 기능 2 — 업무일지 사건 선택 검색(전체 드롭다운)

**신규 컴포넌트:** `src/components/journal/CaseSearchSelect.jsx` (재사용 검색형 콤보박스)
- **Props:** `cases`, `value`(선택된 사건 id), `onChange(id)`, `placeholder`, `className`(트리거 크기 조절용).
- **상태:** `open`, `query`.
- **닫힘:** 선택된 사건 제목 표시(없으면 placeholder 회색). 클릭 시 열림.
- **열림:** 자동 포커스되는 **검색 입력** + 필터된 사건 목록(스크롤). 맨 위에 "선택 안 함"(빈 값) 항목.
- **필터:** 대소문자 무시, `사건명 + 사건번호 + 의뢰인`에 대해 부분 일치. 순수 함수 `filterCasesByQuery(cases, query)`로 분리(테스트 대상).
- **선택:** 항목 클릭 → `onChange(id)` + 닫힘 + query 초기화.
- **닫기:** 바깥 클릭(ref+mousedown 리스너) 또는 Esc → 닫힘. Enter → 필터 첫 항목 선택(편의). 
- **스타일:** 기존 `.input` 톤, 행에 맞는 컴팩트 크기(className으로 조절).

**교체 위치(네이티브 `<select>` → `CaseSearchSelect`):**
- `ChecklistEditor.jsx`: ① 제출예정서면 행별 사건칸(`it.cmCaseId`), ② 하단 추가행 사건칸(`caseId`).
- `CaseNoteEditor.jsx`: `caseSelect` 헬퍼를 `CaseSearchSelect`로 교체 → 항목행·추가행(사건 진행 기록·통화 상담 기록) 모두 반영.
- 결과적으로 제출예정서면·오늘/내일 할일·사건 진행 기록·통화 상담 기록 전부 검색 가능.

**순수 로직 모듈:** `src/caseSearch.js` — `filterCasesByQuery(cases, query)` (+ `node:test` 단위 테스트).

---

## 범위 밖(안 함)
- 사건 탭 자체 기능/디자인 변경 없음. 진행경과 수동 편집/삭제 흐름 변경 없음.
- 위임 업무(담당자 입력) 등 사건과 무관한 입력칸은 그대로.

## 검증 계획
- 순수 로직 단위 테스트(`node:test`): `filterCasesByQuery`(이름/번호/의뢰인 매칭, 공백/대소문자), `markBriefSubmitted`/`markBriefPending`(진행경과 추가·제거, 제출↔되돌리기 반복 멱등성, 서면 삭제 시 진행경과 보존).
- 빌드 통과 + 에뮬레이터(인증)로 실제 동작 재현: 제출→진행경과 표시, 되돌리기→진행경과 제거, 검색형 선택 후 전송 정상.
- 회귀: 기존 77개 테스트 유지.

## 하위호환
- 기존 서면/사건 데이터 변형 없음. `submitTimelineId`는 없으면 빈 값으로 동작.
- `CaseSearchSelect`는 동일한 `value`/`onChange(id)` 계약으로 네이티브 select를 1:1 대체.
