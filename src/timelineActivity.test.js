import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIMELINE_ACTIVITY_TYPE,
  getTimelineActivity,
  setTimelineActivityType,
  collectTimelineActivityTypes,
  TIMELINE_ACTIVITY_TYPES,
} from './timelineActivity.js';

test('timeline activity options cover the manual classification labels', () => {
  assert.deepEqual(
    TIMELINE_ACTIVITY_TYPES.map((item) => item.label),
    ['문서 제출', '서류 수령', '기일', '통화', '회의', '내부 검토', '결정·판결', '정산', '기타'],
  );
  assert.equal(DEFAULT_TIMELINE_ACTIVITY_TYPE, 'other');
  assert.equal(new Set(TIMELINE_ACTIVITY_TYPES.map((item) => item.value)).size, TIMELINE_ACTIVITY_TYPES.length);
});

test('getTimelineActivity returns null for legacy records without a type', () => {
  assert.equal(getTimelineActivity('call').label, '통화');
  assert.equal(getTimelineActivity('hearing').label, '기일');
  assert.equal(getTimelineActivity(''), null);
  assert.equal(getTimelineActivity(undefined), null);
});

test('setTimelineActivityType changes only the targeted entry and keeps the source immutable', () => {
  const timeline = [
    { id: 1, date: '2026-01-01', content: '수임' },
    { id: 2, date: '2026-02-01', content: '소장 접수', activityType: 'other' },
  ];
  const out = setTimelineActivityType(timeline, 2, 'document');
  assert.equal(out[1].activityType, 'document');
  assert.equal(out[0].activityType, undefined);
  assert.equal(timeline[1].activityType, 'other');
});

test('setTimelineActivityType clears the type for empty or unknown values', () => {
  const timeline = [{ id: 1, date: '2026-01-01', content: '수임', activityType: 'call' }];
  assert.equal('activityType' in setTimelineActivityType(timeline, 1, '')[0], false);
  assert.equal('activityType' in setTimelineActivityType(timeline, 1, 'nope')[0], false);
});

test('collectTimelineActivityTypes lists used types in canonical order and flags untyped entries', () => {
  const timeline = [
    { id: 1, content: 'a', activityType: 'other' },
    { id: 2, content: 'b', activityType: 'document' },
    { id: 3, content: 'c' },
  ];
  const out = collectTimelineActivityTypes(timeline);
  assert.deepEqual(out.types.map((t) => t.value), ['document', 'other']);
  assert.equal(out.hasUntyped, true);
  assert.deepEqual(collectTimelineActivityTypes([]), { types: [], hasUntyped: false });
});
