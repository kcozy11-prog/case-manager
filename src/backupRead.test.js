import test from 'node:test';
import assert from 'node:assert/strict';
import { readWithServerPolicy } from './backupRead.js';

test('백업용 읽기(requireServer)는 서버에 닿지 못하면 기기 사본을 쓰지 않고 실패한다', async () => {
  const calls = [];
  const readAll = async (fromServer) => {
    calls.push(fromServer);
    if (fromServer) throw Object.assign(new Error('Failed to get documents from server.'), { code: 'unavailable' });
    return { fromServer: false };
  };
  await assert.rejects(readWithServerPolicy(readAll, { requireServer: true }), /from server/);
  assert.deepEqual(calls, [true]);

  // 화면 표시용 등 requireServer 가 아니면 기기 사본으로 읽고 알린다
  let warned = null;
  const r = await readWithServerPolicy(readAll, { onFallback: (e) => { warned = e.code; } });
  assert.equal(r.fromServer, false);
  assert.equal(warned, 'unavailable');
});

test('서버에서 읽히면 서버 판본을 그대로 돌려준다', async () => {
  const r = await readWithServerPolicy(async (fromServer) => ({ fromServer }), { requireServer: true });
  assert.equal(r.fromServer, true);
});
