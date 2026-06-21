# 업무일지 ↔ 사건 연동 + 착수금 일괄처리 + 내보내기 확장

작성일: 2026-06-21
브랜치: `feat/journal-case-linking`

## 배경 / 현황

- 통합 케이스매니저는 `사건`(cases) 탭과 `업무일지`(journal) 탭으로 구성.
- 사건 데이터: `users/{uid}/cases/{id}` — `timeline`(진행경과), `memos`(카테고리별, "의뢰인요청" 포함), `briefs`(제출대기/완료 서면), `retainer`(착수금/입금).
- 업무일지 데이터: `users/{uid}/journal/{날짜}` — 대부분 JSON 문자열 필드.
- 현재 업무일지 체크리스트의 "관련 사건"(`cmCaseId`)은 **라벨만 저장**, 실제 사건에 쓰지 않음.
- `submittedDocItems`/`cmCaseId`/`cmSyncedAt`/`cmProgressContent` 등 연동용 필드는 로직에만 이식돼 있고 **사건 쓰기 미배선**.
- `normalizeTaskItem`(carry-forward)은 `cmCaseId`/`details`/`googleEventId`를 **버림** → 이월 시 연결 끊김.
- 내보내기(`exportToGoogleSheet`)는 사건 5시트만 생성, **업무일지·서면 미포함**.

## 목표 (6 항목)

### ① 사건 진행 기록 (오늘 한 일 → 진행경과)
- 일지 작성 화면 "오늘 업무" 아래 새 섹션. 기존 자유 textarea(`todayWork`)는 유지.
- 입력: `관련 사건(선택)` + `내용` + `날짜`(기본 = 해당 일지 날짜).
- 항목별 **[사건에 기록]** 버튼 → 선택 사건의 `timeline`에 `{id, date, content}` upsert.
- 기록 후 ✓ 표시, 재클릭 시 같은 `timelineId` 항목 갱신(중복 방지).
- 신규 일지 필드 `caseProgressItems`(JSON 배열): `{id, caseId, caseTitle, content, date, recordedAt, timelineId}`.

### ② 통화·상담 기록 (→ 진행경과 + 의뢰인요청 메모)
- 기존 통화메모 textarea(`callNotes`) 유지 + 구조화 리스트 추가.
- 입력: `관련 사건` + `제목/상대방` + `상세` + `날짜` + ☐ **의뢰인 요청 메모로도 저장**.
- **[사건에 기록]** → 항상 `timeline`에 `[통화/상담] 제목 — 상세` upsert; 체크 시 `memos`에 `{category:"의뢰인요청", title, content:상세}` upsert.
- 신규 일지 필드 `callLogItems`(JSON 배열): `{id, caseId, caseTitle, title, detail, date, asClientRequest, recordedAt, timelineId, memoId}`.

### ⑤ 제출예정서면 → 사건 제출대기서면(briefs)
- 제출 예정 서면 항목에 **[서면 보내기]** 버튼(관련 사건 지정된 항목만 활성).
- → 그 사건 `briefs`에 `{id, title, status:"pending", preparedDate, submittedDate:""}` upsert. ✓ 표시·재클릭 갱신.
- **행별 인라인 사건 선택** 추가: 추가 시 dropdown만 있던 것을, 기존/이월 항목도 행에서 사건 지정·변경 가능하게.
- 이월 시 연결 보존: `normalizeTaskItem`이 `cmCaseId`/`cmCaseTitle`/`details`/`googleEventId`/`cmBriefId`를 유지하도록 보완.

### ④ 착수금 일괄 완납처리
- ⋯ 고급 메뉴에 "착수금 일괄 완납처리".
- `amount>0 && paidAmount<amount`인 **모든 사건**(종결 포함) `paidAmount=amount`. 확인창+건수, batch 저장, 멱등.

### ⑥ 내보내기에 업무일지 포함
- 기존 "내보내기" 버튼 하나로 사건 + 업무일지 동시 내보내기.
- `runExport`가 `fetchAllJournalEntries(uid)`(1회 getDocs) → `exportToGoogleSheet(token, cases, journalEntries)`.
- "업무일지" 시트(날짜/출근/퇴근/오늘업무/오늘할일/내일할일/제출예정서면/위임/통화메모/배운점/기타) 추가. 빠져 있던 "서면" 시트도 추가.

## 구현 방식

- **A안 채택**: 신규 `CaseNoteEditor` + `JournalApp`이 `App.saveCase`를 `onUpdateCase`로 받아 사건에 직접 쓰기.
- 모든 "사건에 쓰기"는 **id 기반 upsert**(append 또는 동일 id 갱신) — 재클릭/재기록 시 중복 없음. 캘린더 전송(`googleEventId`) 패턴과 동일.
- 순수 로직은 TDD(`node:test`).

## 파일 변경

- 신규 `src/caseLink.js` — `upsertTimelineEntry`, `upsertCaseMemo`, `upsertBrief`, `buildCallTimelineContent`, `computeRetainerPayups` (+ `src/caseLink.test.js`)
- 신규 `src/components/journal/CaseNoteEditor.jsx`
- 수정 `src/journalLogic.js` — `normalizeTaskItem` 연결 필드 보존 (+ 테스트)
- 수정 `src/journalStore.js` — `JOURNAL_FIELDS`에 `caseProgressItems`/`callLogItems` 추가, `fetchAllJournalEntries`
- 수정 `src/components/journal/ChecklistEditor.jsx` — `onSendToCase` 옵션 + 행별 사건 선택
- 수정 `src/components/journal/JournalApp.jsx` — 섹션 ①②, 핸들러(record/send), 폼 필드, ⑤ 배선
- 수정 `src/exportSheet.js` — `buildJournalRows` + 서면 rows (+ 테스트)
- 수정 `src/migrateLegacy.js` — `exportToGoogleSheet(token, cases, journalEntries)`
- 수정 `src/App.jsx` — `onUpdateCase` 전달, 착수금 일괄 핸들러+메뉴, `runExport` 일지 조회

## 하위호환

- 기존 문자열 필드(`callNotes`, `todayWork`, `pendingDocs` 등) 그대로 유지.
- 신규 필드는 없으면 빈 배열로 동작. 기존 일지/사건 데이터 변형 없음.
