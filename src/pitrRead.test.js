import test from 'node:test';
import assert from 'node:assert/strict';
import { fromFirestoreValue, fromFirestoreFields, kstToReadTime, readTimeAgeMinutes, listCollectionAt, readUserSnapshotAt } from './pitrRead.js';

test('Firestore REST 값을 일반 값으로 바꾼다', () => {
  const fields = {
    id: { stringValue: 'c1' },
    retainer: { mapValue: { fields: { amount: { stringValue: '330' }, paid: { integerValue: '1650000' } } } },
    timeline: { arrayValue: { values: [
      { mapValue: { fields: { id: { integerValue: '1727000000000' }, content: { stringValue: '소장 접수' }, done: { booleanValue: false } } } },
    ] } },
    empty: { arrayValue: {} },
    emptyMap: { mapValue: {} },
    ratio: { doubleValue: 0.5 },
    none: { nullValue: null },
    at: { timestampValue: '2026-10-06T11:00:00Z' },
  };
  assert.deepEqual(fromFirestoreFields(fields), {
    id: 'c1',
    retainer: { amount: '330', paid: 1650000 },
    timeline: [{ id: 1727000000000, content: '소장 접수', done: false }],
    empty: [],
    emptyMap: {},
    ratio: 0.5,
    none: null,
    at: '2026-10-06T11:00:00Z',
  });
  assert.equal(fromFirestoreValue(undefined), null);
});

test('한국시간을 분 단위 UTC 조회 시각으로 바꾼다', () => {
  assert.equal(kstToReadTime('2026-10-06', '20:00'), '2026-10-06T11:00:00Z');
  assert.equal(kstToReadTime('2026-10-07', '8:05'), '2026-10-06T23:05:00Z');
  assert.equal(kstToReadTime('2026-10-07', ''), null);
  assert.equal(kstToReadTime('10/07', '08:00'), null);
  assert.equal(readTimeAgeMinutes('2026-10-06T11:00:00Z', Date.parse('2026-10-06T12:30:00Z')), 90);
});

function fakeFetch(pages, status = 200) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, auth: opts?.headers?.Authorization });
    if (status !== 200) return { ok: false, status, json: async () => ({ error: { message: pages } }) };
    const token = new URL(url).searchParams.get('pageToken') || '';
    const page = pages[token];
    return { ok: true, status: 200, json: async () => page };
  };
  return { impl, calls };
}

test('여러 쪽으로 나뉜 결과를 모두 읽고 readTime·토큰을 붙여 요청한다', async () => {
  const { impl, calls } = fakeFetch({
    '': { documents: [{ name: 'projects/p/databases/(default)/documents/users/u1/cases/c1', fields: { title: { stringValue: '강남연립' } } }], nextPageToken: 'n2' },
    n2: { documents: [{ name: 'projects/p/databases/(default)/documents/users/u1/cases/c2', fields: { title: { stringValue: '원기업' } } }] },
  });
  const docs = await listCollectionAt({ projectId: 'p', path: 'users/u1/cases', idToken: 'tok', readTime: '2026-10-06T11:00:00Z', fetchImpl: impl });
  assert.deepEqual(docs.map((d) => [d.id, d.data.title]), [['c1', '강남연립'], ['c2', '원기업']]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.startsWith('https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/users/u1/cases?'));
  assert.equal(new URL(calls[0].url).searchParams.get('readTime'), '2026-10-06T11:00:00Z');
  assert.equal(calls[0].auth, 'Bearer tok');
});

test('사건·업무일지를 복원용 원본과 같은 모양으로 돌려준다', async () => {
  const impl = async (url) => {
    const isCases = url.includes('/cases?');
    const body = isCases
      ? { documents: [{ name: 'x/users/u1/cases/c9', fields: { title: { stringValue: 't' } } }] }
      : { documents: [{ name: 'x/users/u1/journal/2026-10-06', fields: { todayWork: { stringValue: 'w' } } }] };
    return { ok: true, status: 200, json: async () => body };
  };
  const snap = await readUserSnapshotAt({ projectId: 'p', uid: 'u1', idToken: 't', readTime: '2026-10-06T11:00:00Z', fetchImpl: impl });
  assert.equal(snap.source, 'raw');
  assert.deepEqual(snap.cases, [{ id: 'c9', title: 't' }]);
  assert.deepEqual(snap.journal, { '2026-10-06': { todayWork: 'w' } });
});

test('보관 기간을 넘긴 시점은 알아듣기 쉬운 말로 거절한다', async () => {
  const { impl } = fakeFetch('The requested snapshot version is too old.', 400);
  await assert.rejects(
    listCollectionAt({ projectId: 'p', path: 'users/u1/cases', idToken: 't', readTime: '2026-09-01T00:00:00Z', fetchImpl: impl }),
    (e) => e.tooOld === true && /최근 1시간/.test(e.message),
  );
  const denied = fakeFetch('denied', 403);
  await assert.rejects(
    listCollectionAt({ projectId: 'p', path: 'users/u1/cases', idToken: 't', readTime: '2026-10-06T11:00:00Z', fetchImpl: denied.impl }),
    /권한/,
  );
  await assert.rejects(readUserSnapshotAt({ projectId: '', uid: 'u1', idToken: 't', readTime: 'x' }), /필요한 정보/);
});
