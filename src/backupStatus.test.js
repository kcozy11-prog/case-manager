import test from 'node:test';
import assert from 'node:assert/strict';
import { lastBackupInfo, backupAgeLabel, BACKUP_STALE_DAYS } from './backupStatus.js';

const NOW = Date.parse('2026-10-11T03:00:00Z'); // 한국시간 10. 11. 12:00

test('가장 최근 내보내기·복원 전 백업으로 마지막 백업 날짜를 센다 (복원에 쓴 파일은 빼고)', () => {
  const items = [
    { kind: 'export', at: '2026-09-21T00:37:00Z', url: 'a' },
    { kind: 'backup', at: '2026-10-07T02:00:00Z', url: 'b' },
    { kind: 'source', at: '2026-10-10T02:00:00Z', url: 'c' }, // 백업 아님
    { kind: 'export', at: 'not-a-date' },
  ];
  const info = lastBackupInfo(items, NOW);
  assert.equal(info.url, 'b');
  assert.equal(info.days, 4);
  assert.equal(info.stale, false);
  assert.equal(backupAgeLabel(info), '마지막 백업 4일 전');
});

test('7일이 넘으면 눈에 띄게 표시할 대상(stale)이고, 기록이 없어도 그렇다', () => {
  assert.equal(BACKUP_STALE_DAYS, 7);
  const seven = lastBackupInfo([{ kind: 'export', at: '2026-10-04T05:00:00Z' }], NOW);
  assert.equal(seven.days, 7);
  assert.equal(seven.stale, false);
  const eight = lastBackupInfo([{ kind: 'export', at: '2026-10-03T05:00:00Z' }], NOW);
  assert.equal(eight.days, 8);
  assert.equal(eight.stale, true);
  const none = lastBackupInfo([], NOW);
  assert.equal(none.none, true);
  assert.equal(none.stale, true);
  assert.equal(backupAgeLabel(none), '백업 기록 없음');
  assert.equal(lastBackupInfo(undefined, NOW).none, true);
});

test('날짜는 한국시간 기준으로 센다 (오늘·어제)', () => {
  // 한국시간 10. 11. 00:30 = UTC 10. 10. 15:30 → 오늘
  assert.equal(backupAgeLabel(lastBackupInfo([{ kind: 'export', at: '2026-10-10T15:30:00Z' }], NOW)), '마지막 백업 오늘');
  // 한국시간 10. 10. 23:50 → 어제
  assert.equal(backupAgeLabel(lastBackupInfo([{ kind: 'export', at: '2026-10-10T14:50:00Z' }], NOW)), '마지막 백업 어제');
});
