import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCaseList, countCasesByListStatus, firstActiveCaseId, matchesCaseSearch } from './caseList.js';

const CASES = [
  { id: 'c1', title: '김민준 대여금', client: '김민준', opponent: '박철수', caseNumber: '2026가단100906', status: '종결', type: '민사' },
  { id: 'c2', title: '이서연 이혼', client: '이서연', opponent: '정우성', caseNumber: '2026드단1234', status: '진행중', type: '가사' },
  { id: 'c3', title: '김민준 손해배상', client: '김민준', opponent: '㈜한강', caseNumber: '2026가합777', status: '진행중', type: '민사' },
  { id: 'c4', title: '최영호 횡령', client: '최영호', opponent: '검사', caseNumber: '2025고단99', status: '종결', type: '형사(재판)' },
  { id: 'c5', title: '상태 미기재 사건', client: '홍길동', caseNumber: '', type: '민사' },
];
const ids = (list) => list.map((c) => c.id);

test('기본 목록에는 진행 중 사건만 보인다 (상태 미기재는 진행 중으로 본다)', () => {
  assert.deepEqual(ids(filterCaseList(CASES)), ['c2', 'c3', 'c5']);
  assert.deepEqual(ids(filterCaseList(CASES, { status: '진행중' })), ['c2', 'c3', 'c5']);
});

test("'종결' 목록을 고르면 종결 사건만 보인다", () => {
  assert.deepEqual(ids(filterCaseList(CASES, { status: '종결' })), ['c1', 'c4']);
});

test('검색어가 있으면 종결 사건도 찾고, 진행 중 사건을 먼저 보여 준다', () => {
  assert.deepEqual(ids(filterCaseList(CASES, { search: '김민준' })), ['c3', 'c1']);
  // '종결' 목록을 고른 상태에서 검색해도 진행 중 사건까지 함께 찾는다
  assert.deepEqual(ids(filterCaseList(CASES, { search: '김민준', status: '종결' })), ['c3', 'c1']);
  // 사건번호·상대방으로도 찾는다
  assert.deepEqual(ids(filterCaseList(CASES, { search: '2025고단' })), ['c4']);
  assert.deepEqual(ids(filterCaseList(CASES, { search: '박철수' })), ['c1']);
  // 공백만 있는 검색어는 검색으로 보지 않는다
  assert.deepEqual(ids(filterCaseList(CASES, { search: '   ' })), ['c2', 'c3', 'c5']);
});

test('사건 유형 필터는 목록·검색 모두에 함께 적용된다', () => {
  assert.deepEqual(ids(filterCaseList(CASES, { type: '민사' })), ['c3', 'c5']);
  assert.deepEqual(ids(filterCaseList(CASES, { type: '민사', status: '종결' })), ['c1']);
  assert.deepEqual(ids(filterCaseList(CASES, { type: '민사', search: '김민준' })), ['c3', 'c1']);
});

test('필드가 비어 있는 사건도 오류 없이 처리한다', () => {
  assert.equal(matchesCaseSearch({ title: undefined, client: null }, '김'), false);
  assert.deepEqual(ids(filterCaseList([null, { id: 'x' }], { search: 'x' })), []);
  assert.deepEqual(ids(filterCaseList(undefined)), []);
});

test('상태별 건수와 첫 진행 중 사건', () => {
  assert.deepEqual(countCasesByListStatus(CASES), { 진행중: 3, 종결: 2 });
  assert.equal(firstActiveCaseId(CASES), 'c2');
  assert.equal(firstActiveCaseId([CASES[0]]), 'c1', '진행 중 사건이 없으면 첫 사건');
  assert.equal(firstActiveCaseId([]), null);
});
