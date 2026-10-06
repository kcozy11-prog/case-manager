import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadsheetIdFromInput, readRestoreSource } from './restoreSource.js';
import { buildRawBackupRows } from './rawBackup.js';

const ID = '1cRvcT2KY494oeukdAtF4i4dATaarZFQ_-abcdef';

test('시트 주소나 파일 id 에서 파일 id 를 꺼낸다', () => {
  assert.equal(spreadsheetIdFromInput(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drivesdk`), ID);
  assert.equal(spreadsheetIdFromInput(` ${ID} `), ID);
  assert.equal(spreadsheetIdFromInput('https://example.com/x'), null);
  assert.equal(spreadsheetIdFromInput(''), null);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404, statusText: 'nf', text: async () => '' };
    const [, status, body] = hit;
    return { ok: status === 200, status, statusText: '', json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { impl, calls };
}

test('예전 내보내기 파일은 사람이 읽는 시트를 읽어 사본을 만든다', async () => {
  const { impl, calls } = fakeFetch([
    [/\?fields=/, 200, { properties: { title: '사건관리 내보내기 2026. 9. 21.' }, sheets: [{ properties: { title: '사건 목록' } }, { properties: { title: '진행경과' } }] }],
    [/values:batchGet/, 200, { valueRanges: [
      { values: [['사건명', '분류', '상태'], ['원기업 민사', '민사', '진행중']] },
      { values: [['사건명', '날짜', '내용'], ['원기업 민사', '2026-09-10', '조정 성립']] },
    ] }],
  ]);
  const src = await readRestoreSource('tok', ID, { fetchImpl: impl });
  assert.equal(src.kind, 'export');
  assert.equal(src.fileTitle, '사건관리 내보내기 2026. 9. 21.');
  assert.deepEqual(src.snapshot.cases[0].timeline, [{ date: '2026-09-10', content: '조정 성립' }]);
  assert.ok(decodeURIComponent(calls[1]).includes("ranges='사건 목록'&ranges='진행경과'"));
});

test('복원용 원본 시트가 있으면 그것을 읽는다', async () => {
  const rows = buildRawBackupRows({ cases: [{ id: 'c1', title: 't', timeline: [{ id: 5, content: 'x' }] }], journal: { '2026-10-06': { todayWork: 'w' } } });
  const { impl } = fakeFetch([
    [/\?fields=/, 200, { properties: { title: '사건관리 내보내기 2026. 10. 7.' }, sheets: [{ properties: { title: '사건 목록' } }, { properties: { title: '복원용 원본' } }] }],
    [/values:batchGet/, 200, { valueRanges: [{ values: rows }] }],
  ]);
  const src = await readRestoreSource('tok', ID, { fetchImpl: impl });
  assert.equal(src.kind, 'raw');
  assert.equal(src.snapshot.cases[0].timeline[0].id, 5);
  assert.equal(src.snapshot.journal['2026-10-06'].todayWork, 'w');
});

test('인증 만료와 열 수 없는 파일을 구별해 알린다', async () => {
  const expired = fakeFetch([[/\?fields=/, 401, {}]]);
  await assert.rejects(readRestoreSource('tok', ID, { fetchImpl: expired.impl }), (e) => e.authError === true);
  const denied = fakeFetch([[/\?fields=/, 403, {}]]);
  await assert.rejects(readRestoreSource('tok', ID, { fetchImpl: denied.impl }), /파일을 열 수 없습니다/);
  const notExport = fakeFetch([[/\?fields=/, 200, { properties: { title: 'x' }, sheets: [{ properties: { title: '시트1' } }] }]]);
  await assert.rejects(readRestoreSource('tok', ID, { fetchImpl: notExport.impl }), /내보내기 파일이 아닙니다/);
});
