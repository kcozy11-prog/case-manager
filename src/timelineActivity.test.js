import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIMELINE_ACTIVITY_TYPE,
  getTimelineActivity,
  TIMELINE_ACTIVITY_TYPES,
} from './timelineActivity.js';

test('timeline activity options use the five requested labels', () => {
  assert.deepEqual(
    TIMELINE_ACTIVITY_TYPES.map((item) => item.label),
    ['문서 제출', '통화', '회의', '내부 검토', '기타'],
  );
  assert.equal(DEFAULT_TIMELINE_ACTIVITY_TYPE, 'other');
});

test('getTimelineActivity returns null for legacy records without a type', () => {
  assert.equal(getTimelineActivity('call').label, '통화');
  assert.equal(getTimelineActivity(''), null);
  assert.equal(getTimelineActivity(undefined), null);
});
