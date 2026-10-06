import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCasesByQuery } from './caseSearch.js';

const CASES = [
  { id: 'c1', title: '아파트 분양대금 반환', caseNumber: '2026가합1234', client: '김민준' },
  { id: 'c2', title: '국민은행 대여금', caseNumber: '2026가단5678', client: '박지영' },
  { id: 'c3', title: '횡령 형사', caseNumber: '2026고단99', client: '최영호' },
];

test('빈 쿼리는 진행 중 사건 전체를 반환', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '').map(c => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(filterCasesByQuery(CASES, '   ').map(c => c.id), ['c1', 'c2', 'c3']);
});

test('종결 사건은 검색어가 없을 때 숨기고, 검색하면 진행 중 사건 다음에 보인다', () => {
  const cases = [
    { id: 'old', title: '김민준 대여금', caseNumber: '2024가단1', client: '김민준', status: '종결' },
    { id: 'now', title: '김민준 손해배상', caseNumber: '2026가합2', client: '김민준', status: '진행중' },
    { id: 'etc', title: '이서연 이혼', caseNumber: '2026드단3', client: '이서연' },
  ];
  assert.deepEqual(filterCasesByQuery(cases, '').map(c => c.id), ['now', 'etc']);
  assert.deepEqual(filterCasesByQuery(cases, '김민준').map(c => c.id), ['now', 'old']);
  assert.deepEqual(filterCasesByQuery(cases, '2024가단').map(c => c.id), ['old']);
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
  const cases = [{ id: 'x', title: 'ABC Corp', caseNumber: '', client: '' }];
  assert.deepEqual(filterCasesByQuery(cases, 'abc').map((c) => c.id), ['x']);
});

test('여러 토큰은 모두 포함(AND)', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '국민 대여').map(c => c.id), ['c2']);
  assert.deepEqual(filterCasesByQuery(CASES, '국민 형사').map(c => c.id), []);
});

test('일치 없으면 빈 배열', () => {
  assert.deepEqual(filterCasesByQuery(CASES, '존재안함'), []);
});
