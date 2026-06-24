# 대기서면 제출→진행경과 자동기록 + 업무일지 사건선택 검색 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사건 서면 탭에서 대기서면을 제출 처리하면 진행경과에 자동 기록(되돌리면 자동 제거)되게 하고, 업무일지의 모든 사건 선택 드롭다운을 검색형으로 바꾼다.

**Architecture:** 순수 변환 로직은 `caseLink.js`/`caseSearch.js`에 두고 `node:test`로 검증한다(기존 패턴). UI는 재사용 컴포넌트 `CaseSearchSelect`로 네이티브 `<select>`를 1:1 대체하고, `BriefsTab`은 순수 헬퍼를 호출만 한다. 데이터는 서면에 `submitTimelineId` 선택 필드만 추가(하위호환).

**Tech Stack:** React 18, Vite, Tailwind, `node:test`(테스트 러너), Firebase(런타임만).

테스트 실행 명령(공통): `node --test 'src/**/*.test.js'`

---

## File Structure

- Create: `src/caseSearch.js` — `filterCasesByQuery(cases, query)` 순수 필터.
- Create: `src/caseSearch.test.js` — 위 함수 테스트.
- Modify: `src/caseLink.js` — `markBriefSubmitted`, `markBriefPending` 순수 헬퍼 추가.
- Modify: `src/caseLink.test.js` — 위 헬퍼 테스트 추가.
- Create: `src/components/journal/CaseSearchSelect.jsx` — 검색형 사건 선택 콤보박스.
- Modify: `src/components/BriefsTab.jsx` — `markSubmitted`/`markPending`를 순수 헬퍼로 위임.
- Modify: `src/components/journal/ChecklistEditor.jsx` — 사건 `<select>` 2곳 → `CaseSearchSelect`.
- Modify: `src/components/journal/CaseNoteEditor.jsx` — `caseSelect` 헬퍼 → `CaseSearchSelect`.

---

## Task 1: `filterCasesByQuery` 순수 필터

**Files:**
- Create: `src/caseSearch.js`
- Test: `src/caseSearch.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`src/caseSearch.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCasesByQuery } from './caseSearch.js';

const CASES = [
  { id: 'c1', title: '아파트 분양대금 반환', caseNumber: '2026가합1234', client: '김민준' },
  { id: 'c2', title: '국민은행 대여금', caseNumber: '2026가단5678', client: '박지영' },
  { id: 'c3', title: '횡령 형사', caseNumber: '2026고단99', client: '최영호' },
];

test('빈 쿼리는 전체를 반환', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '').map(c => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(filterCasesByQuery(CASES, '   ').map(c => c.id), ['c1', 'c2', 'c3']);
});

test('사건명 부분 일치', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '국민').map(c => c.id), ['c2']);
});

test('사건번호로 매칭', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '가합').map(c => c.id), ['c1']);
});

test('의뢰인으로 매칭', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '박지영').map(c => c.id), ['c2']);
});

test('대소문자 무시', () => {
  const c = [{ id: 'x', title: 'ABC Corp', caseNumber: '', client: '' }];
  assert.deepEqual(filterCasesByQuery(c, 'abc').map(c => c.id), ['x']);
});

test('여러 토큰은 모두 포함(AND)', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '국민 대여').map(c => c.id), ['c2']);
  assert.deepEqual(filterCasesByQuery(CASES, '국민 형사').map(c => c.id), []);
});

test('일치 없으면 빈 배열', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '존재안함'), []);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test src/caseSearch.test.js`
Expected: FAIL — `does not provide an export named 'filterCasesByQuery'`

- [ ] **Step 3: 최소 구현**

`src/caseSearch.js`:
```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test src/caseSearch.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/caseSearch.js src/caseSearch.test.js
git commit -m "feat: filterCasesByQuery 사건 검색 순수 필터"
```

---

## Task 2: `markBriefSubmitted` / `markBriefPending` 순수 헬퍼

**Files:**
- Modify: `src/caseLink.js` (파일 끝에 export 함수 추가)
- Test: `src/caseLink.test.js` (테스트 추가)

- [ ] **Step 1: 실패 테스트 작성**

`src/caseLink.test.js` 파일 맨 위 import에 `markBriefSubmitted, markBriefPending`가 포함되도록 하고(기존 import 줄 수정), 파일 끝에 다음 테스트를 추가:
```js
test('markBriefSubmitted: 진행경과에 "{제목} 제출" 자동 추가 + 서면 상태 갱신', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: '준비서면 2호', status: 'pending', preparedDate: '2026-06-20', submittedDate: '' }], timeline: [] };
  const out = markBriefSubmitted(c, 'b1', '2026-06-24', () => 999);
  const b = out.briefs.find(x => x.id === 'b1');
  assert.equal(b.status, 'submitted');
  assert.equal(b.submittedDate, '2026-06-24');
  assert.equal(b.submitTimelineId, 999);
  assert.equal(out.timeline.length, 1);
  assert.deepEqual(out.timeline[0], { id: 999, date: '2026-06-24', content: '준비서면 2호 제출' });
});

test('markBriefSubmitted: 재호출해도 진행경과 중복 없음(submitTimelineId 재사용)', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: '답변서', status: 'pending', submittedDate: '' }], timeline: [] };
  const once = markBriefSubmitted(c, 'b1', '2026-06-24', () => 111);
  const twice = markBriefSubmitted(once, 'b1', '2026-06-25', () => 222);
  assert.equal(twice.timeline.length, 1);
  assert.equal(twice.timeline[0].id, 111);
});

test('markBriefPending: 연결된 진행경과 항목 제거 + 서면 필드 비움', () => {
  const submitted = markBriefSubmitted(
    { id: 'c1', briefs: [{ id: 'b1', title: '답변서', status: 'pending', submittedDate: '' }], timeline: [{ id: 'keep', date: '2026-06-01', content: '기존 기록' }] },
    'b1', '2026-06-24', () => 555,
  );
  const out = markBriefPending(submitted, 'b1');
  const b = out.briefs.find(x => x.id === 'b1');
  assert.equal(b.status, 'pending');
  assert.equal(b.submittedDate, '');
  assert.equal(b.submitTimelineId, '');
  assert.deepEqual(out.timeline.map(t => t.id), ['keep']); // 자동기록만 제거, 기존 기록 보존
});

test('markBriefPending: submitTimelineId 없으면 timeline 변경 없음', () => {
  const c = { id: 'c1', briefs: [{ id: 'b1', title: 'x', status: 'submitted', submittedDate: '2026-06-24' }], timeline: [{ id: 't1', date: '2026-06-01', content: 'a' }] };
  const out = markBriefPending(c, 'b1');
  assert.deepEqual(out.timeline.map(t => t.id), ['t1']);
});

test('mark* : 없는 briefId면 원본 그대로', () => {
  const c = { id: 'c1', briefs: [], timeline: [] };
  assert.equal(markBriefSubmitted(c, 'nope', '2026-06-24'), c);
  assert.equal(markBriefPending(c, 'nope'), c);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test src/caseLink.test.js`
Expected: FAIL — `markBriefSubmitted is not exported` (또는 import 에러)

- [ ] **Step 3: 최소 구현**

`src/caseLink.js` 파일 끝에 추가:
```js
// 대기서면 제출 처리: status=submitted + submittedDate + 진행경과(timeline)에 "{제목} 제출" 자동 기록.
// 같은 서면 재제출 시 submitTimelineId 재사용 → 진행경과 중복 없음. makeId/today 주입(테스트 결정론).
export function markBriefSubmitted(caseObj, briefId, today = '', makeId = () => Date.now()) {
  const briefs = Array.isArray(caseObj?.briefs) ? caseObj.briefs : [];
  const target = briefs.find((b) => b && b.id === briefId);
  if (!target) return caseObj;
  const submittedDate = target.submittedDate || today;
  const timelineId = target.submitTimelineId || makeId();
  const nextBriefs = briefs.map((b) =>
    b.id === briefId ? { ...b, status: 'submitted', submittedDate, submitTimelineId: timelineId } : b);
  const withBriefs = { ...caseObj, briefs: nextBriefs };
  return upsertTimelineEntry(withBriefs, { id: timelineId, date: submittedDate, content: `${target.title || '서면'} 제출` });
}

// 제출 대기로 되돌리기: status=pending + submittedDate/submitTimelineId 비움 + 연결된 진행경과 항목 제거.
export function markBriefPending(caseObj, briefId) {
  const briefs = Array.isArray(caseObj?.briefs) ? caseObj.briefs : [];
  const target = briefs.find((b) => b && b.id === briefId);
  if (!target) return caseObj;
  const nextBriefs = briefs.map((b) =>
    b.id === briefId ? { ...b, status: 'pending', submittedDate: '', submitTimelineId: '' } : b);
  const timeline = Array.isArray(caseObj?.timeline) ? caseObj.timeline : [];
  const nextTimeline = target.submitTimelineId
    ? timeline.filter((t) => t && t.id !== target.submitTimelineId)
    : timeline;
  return { ...caseObj, briefs: nextBriefs, timeline: nextTimeline };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test src/caseLink.test.js`
Expected: PASS (기존 + 신규 5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/caseLink.js src/caseLink.test.js
git commit -m "feat: markBriefSubmitted/markBriefPending — 제출↔진행경과 동기화 순수 헬퍼"
```

---

## Task 3: BriefsTab — 순수 헬퍼로 위임

**Files:**
- Modify: `src/components/BriefsTab.jsx`

- [ ] **Step 1: import 추가**

`src/components/BriefsTab.jsx` 상단 import 블록에 추가:
```js
import { markBriefSubmitted, markBriefPending } from "../caseLink";
```

- [ ] **Step 2: markSubmitted / markPending 교체**

기존:
```js
  const markSubmitted = (id) =>
    onUpdate({ ...c, briefs: briefs.map((b) => b.id === id ? { ...b, status: "submitted", submittedDate: b.submittedDate || todayStr } : b) });
  const markPending = (id) =>
    onUpdate({ ...c, briefs: briefs.map((b) => b.id === id ? { ...b, status: "pending", submittedDate: "" } : b) });
```
교체:
```js
  const markSubmitted = (id) => onUpdate(markBriefSubmitted(c, id, todayStr));
  const markPending = (id) => onUpdate(markBriefPending(c, id));
```
(`del`은 변경 없음 — 서면만 제거, 진행경과 보존)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `✓ built in ...` (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/components/BriefsTab.jsx
git commit -m "feat: 대기서면 제출/되돌리기 → 진행경과 자동 동기화(BriefsTab 배선)"
```

---

## Task 4: `CaseSearchSelect` 검색형 콤보박스 컴포넌트

**Files:**
- Create: `src/components/journal/CaseSearchSelect.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/journal/CaseSearchSelect.jsx`:
```jsx
import { useState, useRef, useEffect } from "react";
import { filterCasesByQuery } from "../../caseSearch";

// 검색형 사건 선택 콤보박스 — 네이티브 <select> 대체.
// props: cases, value(선택 사건 id), onChange(id), placeholder, className(트리거 크기/flex)
export default function CaseSearchSelect({ cases = [], value = "", onChange, placeholder = "관련 사건(선택)", className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = cases.find((c) => c.id === value) || null;
  const filtered = filterCasesByQuery(cases, query);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const pick = (id) => { onChange(id); setOpen(false); setQuery(""); };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); const c = filtered[hi]; if (c) pick(c.id); return; }
  };

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <div onClick={() => setOpen((o) => !o)}
        className="input text-xs w-full text-left flex items-center justify-between gap-1 cursor-pointer">
        <span className={`truncate ${selected ? "text-slate-700" : "text-slate-400"}`}>
          {selected ? selected.title : placeholder}
        </span>
        {selected ? (
          <span onClick={(e) => { e.stopPropagation(); pick(""); }}
            className="text-slate-300 hover:text-red-500 flex-shrink-0 px-0.5" title="선택 해제">✕</span>
        ) : <span className="text-slate-300 flex-shrink-0">▾</span>}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg">
          <input ref={inputRef} value={query}
            onChange={(e) => { setQuery(e.target.value); setHi(0); }}
            onKeyDown={onKeyDown}
            placeholder="사건명·번호·의뢰인 검색"
            className="input text-xs w-full rounded-b-none" />
          <ul className="max-h-52 overflow-y-auto py-1">
            <li>
              <button type="button" onClick={() => pick("")}
                className="w-full text-left text-xs px-2.5 py-1.5 text-slate-400 hover:bg-slate-50">선택 안 함</button>
            </li>
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c.id)} onMouseEnter={() => setHi(i)}
                  className={`w-full text-left text-xs px-2.5 py-1.5 truncate ${
                    i === hi ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                  } ${c.id === value ? "font-medium" : ""}`}>
                  {c.title}
                  {c.caseNumber && <span className="text-slate-400 ml-1.5">{c.caseNumber}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-xs text-slate-400 px-2.5 py-2">검색 결과 없음</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `✓ built in ...` (에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/components/journal/CaseSearchSelect.jsx
git commit -m "feat: CaseSearchSelect 검색형 사건 선택 콤보박스"
```

---

## Task 5: ChecklistEditor — `<select>` 2곳 교체

**Files:**
- Modify: `src/components/journal/ChecklistEditor.jsx`

- [ ] **Step 1: import 추가**

`src/components/journal/ChecklistEditor.jsx` 상단(첫 import 아래)에 추가:
```js
import CaseSearchSelect from "./CaseSearchSelect";
```

- [ ] **Step 2: 행별 사건칸(제출예정서면 서브행) 교체**

기존(제출예정서면 서브행의 `<select value={it.cmCaseId ...>` 블록 전체):
```jsx
                  <select
                    value={it.cmCaseId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      updateItem(it.id, { cmCaseId: id, cmCaseTitle: cases.find((c) => c.id === id)?.title || "" });
                    }}
                    className="input text-[11px] py-0.5 w-[150px] flex-shrink-0"
                    title="관련 사건">
                    <option value="">관련 사건 선택…</option>
                    {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
```
교체:
```jsx
                  <CaseSearchSelect
                    cases={cases}
                    value={it.cmCaseId || ""}
                    onChange={(id) => updateItem(it.id, { cmCaseId: id, cmCaseTitle: cases.find((c) => c.id === id)?.title || "" })}
                    placeholder="관련 사건 선택…"
                    className="w-[170px] flex-shrink-0" />
```

- [ ] **Step 3: 하단 추가행 사건칸 교체**

기존(하단 입력행의 `{showCase && (<select value={caseId} ...>)}` 블록):
```jsx
        {showCase && (
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="input text-xs flex-[0_1_120px] min-w-[100px]">
            <option value="">관련 사건(선택)</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
```
교체:
```jsx
        {showCase && (
          <CaseSearchSelect
            cases={cases}
            value={caseId}
            onChange={setCaseId}
            placeholder="관련 사건(선택)"
            className="flex-[0_1_150px] min-w-[120px]" />
        )}
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: `✓ built in ...` (에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/components/journal/ChecklistEditor.jsx
git commit -m "feat: 업무일지 체크리스트 사건 선택을 검색형으로 교체"
```

---

## Task 6: CaseNoteEditor — `caseSelect` 헬퍼 교체

**Files:**
- Modify: `src/components/journal/CaseNoteEditor.jsx`

- [ ] **Step 1: import 추가**

`src/components/journal/CaseNoteEditor.jsx` 상단(첫 import 아래)에 추가:
```js
import CaseSearchSelect from "./CaseSearchSelect";
```

- [ ] **Step 2: caseSelect 헬퍼 본문 교체**

기존:
```jsx
  const caseSelect = (value, onPick, extraClass = "") => (
    <select value={value} onChange={(e) => onPick(e.target.value)}
      className={`input text-xs ${extraClass}`}>
      <option value="">관련 사건(선택)</option>
      {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select>
  );
```
교체:
```jsx
  const caseSelect = (value, onPick, extraClass = "") => (
    <CaseSearchSelect cases={cases} value={value} onChange={onPick}
      placeholder="관련 사건(선택)" className={extraClass} />
  );
```
(호출부 line 85/135는 동일 시그니처라 변경 불필요)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `✓ built in ...` (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/components/journal/CaseNoteEditor.jsx
git commit -m "feat: 사건 진행/통화 기록 사건 선택을 검색형으로 교체"
```

---

## Task 7: 전체 검증(테스트 + 빌드 + 에뮬레이터 스모크)

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 단위 테스트**

Run: `node --test 'src/**/*.test.js'`
Expected: PASS — 기존 77 + 신규(caseSearch 7, caseLink 5) = 89 tests, fail 0

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: `✓ built in ...`

- [ ] **Step 3: 에뮬레이터 스모크(실제 동작 재현)**

`docs/superpowers/specs/2026-06-24-...` 검증 계획대로, 이 세션에서 사용한 방식(Firestore+Auth 에뮬레이터 + 익명 로그인 + 실제 App 마운트)으로 다음을 확인:
- (a) 업무일지 제출예정서면에서 **검색형 사건칸**에 일부 글자 입력 → 목록 필터 → 선택 → 📄 사건에 보내기 → 사건탭 서면 제출대기에 표시.
- (b) 사건 서면 탭에서 그 대기서면 **제출함** 클릭 → 개요 **진행경과**에 "{제목} 제출" 항목 등장.
- (c) 같은 서면 **되돌리기** 클릭 → 진행경과 항목 사라짐, 다른 진행경과는 유지.
- (d) 콘솔 에러 없음.

검증 후 임시 에뮬레이터 설정/하네스 파일은 모두 삭제하고 `firebase.js` 원복(이 세션의 정리 절차와 동일).

- [ ] **Step 4: (선택) 배포**

사용자 확인 후:
```bash
npm run deploy && git push origin main
```

---

## Self-Review (작성자 체크)

- **스펙 커버리지:** 기능1(제출→진행경과: Task 2·3, 되돌리기 제거: Task 2·3, 삭제 시 진행경과 보존: Task 3에서 del 미변경 + Task 2 테스트로 보존 확인) / 기능2(검색 컴포넌트: Task 4, 전체 드롭다운 교체: Task 5·6, 순수 필터: Task 1) — 모두 매핑됨.
- **플레이스홀더:** 없음(모든 코드 블록 완전).
- **타입/이름 일관성:** `filterCasesByQuery`, `markBriefSubmitted(caseObj,briefId,today,makeId)`, `markBriefPending(caseObj,briefId)`, `submitTimelineId`, `CaseSearchSelect({cases,value,onChange,placeholder,className})` — 전 태스크에서 동일하게 사용.
- **범위:** 단일 계획으로 적정(두 작은 기능, 공유 컴포넌트).
