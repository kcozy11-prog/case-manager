// 이식 출처: law-journal/law-journal-logic.js (통합 시 window 글로벌 블록 제거, ES export 유지)
function normalizeDateValue(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(`${dateValue}T00:00:00+09:00`).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function makeId(prefix = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseJsonArray(raw, fallback = []) {
  if (!raw) return [...fallback];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function entrySavedAtMs(entry = {}) {
  const timestamp = Date.parse(entry?._savedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function chooseNewerEntry(firstEntry, secondEntry) {
  if (!firstEntry) return secondEntry || null;
  if (!secondEntry) return firstEntry;
  const firstSavedAt = entrySavedAtMs(firstEntry);
  const secondSavedAt = entrySavedAtMs(secondEntry);
  if (firstSavedAt > secondSavedAt) return firstEntry;
  if (secondSavedAt > firstSavedAt) return secondEntry;
  return secondEntry;
}

export function mergeEntryMapsBySavedAt(localEntries = {}, remoteEntries = {}) {
  const entries = { ...(localEntries || {}) };
  const localWins = [];
  const remoteWins = [];
  const remoteEntryMap = remoteEntries || {};

  Object.entries(remoteEntryMap).forEach(([dateKey, remoteEntry]) => {
    const localEntry = localEntries?.[dateKey];
    const chosen = chooseNewerEntry(localEntry, remoteEntry);
    if (!chosen) return;
    entries[dateKey] = chosen;
    if (localEntry && remoteEntry && chosen === localEntry) localWins.push(dateKey);
    if (chosen === remoteEntry) remoteWins.push(dateKey);
  });

  Object.keys(localEntries || {}).forEach((dateKey) => {
    if (!(dateKey in remoteEntryMap) && localEntries[dateKey]) localWins.push(dateKey);
  });

  return { entries, localWins, remoteWins };
}

export function parseChecklistItems(raw = '') {
  if (!raw.trim()) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('[x] ')) return { id: null, text: line.slice(4), done: true };
      if (line.startsWith('[ ] ')) return { id: null, text: line.slice(4), done: false };
      return { id: null, text: line, done: false };
    });
}

export function serializeChecklistItems(items = []) {
  return items
    .filter((item) => item && item.text && item.text.trim())
    .map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text.trim()}`)
    .join('\n');
}

export function normalizeTaskItem(item, prefix = 'task') {
  if (!item || !item.text || !item.text.trim()) return null;
  return {
    id: item.id || makeId(prefix),
    text: item.text.trim(),
    done: Boolean(item.done),
    dueDate: item.dueDate || '',
    assignee: item.assignee || '',
    sourceDate: item.sourceDate || '',
    createdAt: item.createdAt || '',
    // 사건 연결·상세·연동 식별자는 이월 시에도 보존(끊김 방지)
    details: item.details || '',
    cmCaseId: item.cmCaseId || '',
    cmCaseTitle: item.cmCaseTitle || '',
    googleEventId: item.googleEventId || '',
    cmBriefId: item.cmBriefId || '',
    cmBriefSyncedAt: item.cmBriefSyncedAt || '',
  };
}

export function sortChecklistByDueDate(items = []) {
  return [...items].sort((a, b) => {
    const dueCompare = normalizeDateValue(a.dueDate) - normalizeDateValue(b.dueDate);
    if (dueCompare !== 0) return dueCompare;
    return (a.text || '').localeCompare(b.text || '', 'ko');
  });
}

export function carryForwardTomorrowTasks(entries = {}, targetDate) {
  const current = parseJsonArray(entries[targetDate]?.todayTasks).map((item) => normalizeTaskItem(item, 'today')).filter(Boolean);
  const existingTexts = new Set(current.map((item) => item.text));

  const previousDates = Object.keys(entries)
    .filter((dateKey) => dateKey < targetDate)
    .sort((a, b) => b.localeCompare(a));

  previousDates.forEach((dateKey) => {
    const tomorrowTasks = parseJsonArray(entries[dateKey]?.tomorrowTasks)
      .map((item) => normalizeTaskItem(item, 'tomorrow'))
      .filter(Boolean);

    tomorrowTasks.forEach((item) => {
      if (item.done || existingTexts.has(item.text)) return;
      existingTexts.add(item.text);
      current.push({ ...item, sourceDate: item.sourceDate || dateKey, done: false });
    });
  });

  return sortChecklistByDueDate(current);
}

function pendingDocCompletionKeys(item, fallbackSourceDate = '') {
  if (!item || !item.text) return [];
  const sourceDate = item.sourceDate || fallbackSourceDate || '';
  const textKey = `text:${item.text.trim()}|due:${item.dueDate || ''}|source:${sourceDate}`;
  return item.id ? [`id:${item.id}|source:${sourceDate}`, textKey] : [textKey];
}

function hasPendingDocCompletion(completedKeys, item, fallbackSourceDate = '') {
  return pendingDocCompletionKeys(item, fallbackSourceDate).some((key) => completedKeys.has(key));
}

function addPendingDocIdentityKeys(keySet, item, fallbackSourceDate = '') {
  pendingDocCompletionKeys(item, fallbackSourceDate).forEach((key) => keySet.add(key));
}

function hasPendingDocIdentity(keySet, item, fallbackSourceDate = '') {
  return pendingDocCompletionKeys(item, fallbackSourceDate).some((key) => keySet.has(key));
}

function normalizePendingDocCompletion(item, fallbackSourceDate = '') {
  if (!item || !item.text || !item.text.trim()) return null;
  return {
    id: item.id || '',
    text: item.text.trim(),
    dueDate: item.dueDate || '',
    sourceDate: item.sourceDate || fallbackSourceDate || '',
    completedAt: item.completedAt || '',
  };
}

function collectPendingDocCompletionKeys(entries = {}, targetDate) {
  const completed = new Set();
  Object.keys(entries)
    .filter((dateKey) => dateKey <= targetDate)
    .forEach((dateKey) => {
      parseJsonArray(entries[dateKey]?.pendingDocCompletions)
        .map((item) => normalizePendingDocCompletion(item, dateKey))
        .filter(Boolean)
        .forEach((item) => pendingDocCompletionKeys(item, item.sourceDate || dateKey).forEach((key) => completed.add(key)));
    });
  return completed;
}

export function createPendingDocCompletion(item, completedAt = new Date().toISOString(), fallbackSourceDate = '') {
  const normalized = normalizePendingDocCompletion(item, fallbackSourceDate);
  if (!normalized) return null;
  return { ...normalized, completedAt };
}

function shiftDateKey(dateKey, days = 0) {
  const timestamp = Date.parse(`${dateKey}T00:00:00+09:00`);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp + days * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeSubmittedDocId(item, submittedDate) {
  if (item.submittedDocId) return item.submittedDocId;
  if (item.id && String(item.id).startsWith('submitted_')) return item.id;
  if (item.id) return `submitted_${item.id}_${submittedDate || 'date'}`;
  return makeId('submitted-doc');
}

export function normalizeSubmittedDocItem(item, fallbackSubmittedDate = '', fallbackSourceDate = '') {
  if (!item || !item.text || !item.text.trim()) return null;
  const submittedDate = item.submittedDate || fallbackSubmittedDate || '';
  const sourceDate = item.sourceDate || fallbackSourceDate || submittedDate;
  return {
    id: makeSubmittedDocId(item, submittedDate),
    pendingId: item.pendingId || (String(item.id || '').startsWith('submitted_') ? '' : item.id || ''),
    text: item.text.trim(),
    dueDate: item.dueDate || '',
    sourceDate,
    submittedDate,
    completedAt: item.completedAt || '',
    cmCaseId: item.cmCaseId || '',
    cmSyncedAt: item.cmSyncedAt || '',
    cmProgressContent: item.cmProgressContent || '',
  };
}

export function createSubmittedDocItem(item, submittedDate, completedAt = new Date().toISOString(), fallbackSourceDate = '') {
  const normalized = normalizeSubmittedDocItem({
    ...item,
    pendingId: item?.pendingId || item?.id || '',
    submittedDate,
    completedAt,
  }, submittedDate, fallbackSourceDate || item?.sourceDate || submittedDate);
  return normalized;
}

function submittedDocIdentityKeys(item) {
  if (!item || !item.text) return [];
  const submittedDate = item.submittedDate || '';
  const sourceDate = item.sourceDate || '';
  const textKey = `text:${item.text.trim()}|due:${item.dueDate || ''}|submitted:${submittedDate}|source:${sourceDate}`;
  const keys = [textKey];
  if (item.id) keys.push(`id:${item.id}`);
  if (item.pendingId) keys.push(`pending:${item.pendingId}|submitted:${submittedDate}`);
  return keys;
}

export function collectVisibleSubmittedDocs(entries = {}, targetDate, visibleThroughDays = 1) {
  if (!targetDate) return [];
  const visible = [];
  const seen = new Set();

  Object.entries(entries || {}).forEach(([dateKey, entry]) => {
    parseJsonArray(entry?.submittedDocItems)
      .map((item) => normalizeSubmittedDocItem(item, dateKey, dateKey))
      .filter(Boolean)
      .forEach((item) => {
        if (!item.submittedDate) return;
        const visibleUntil = shiftDateKey(item.submittedDate, visibleThroughDays);
        if (targetDate < item.submittedDate || (visibleUntil && targetDate > visibleUntil)) return;
        const keys = submittedDocIdentityKeys(item);
        if (keys.some((key) => seen.has(key))) return;
        keys.forEach((key) => seen.add(key));
        visible.push(item);
      });
  });

  return visible.sort((a, b) => {
    if (a.submittedDate !== b.submittedDate) return b.submittedDate.localeCompare(a.submittedDate);
    return a.text.localeCompare(b.text, 'ko');
  });
}

export function formatKoreanMonthDay(dateKey = '') {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(dateKey || '').trim();
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

const DOCUMENT_TYPE_PATTERNS = [
  '청구취지 및 청구원인 변경신청서',
  '청구취지변경신청서',
  '청구원인변경신청서',
  '문서송부촉탁신청서',
  '사실조회신청서',
  '항소이유서',
  '상고이유서',
  '준비서면',
  '답변서',
  '의견서',
  '참고서면',
  '보정서',
  '증거신청서',
  '증거설명서',
  '서증',
  '소장',
  '고소장',
  '고발장',
  '신청서',
  '진술서',
];

export function extractDocumentType(text = '') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const found = DOCUMENT_TYPE_PATTERNS.find((pattern) => clean.includes(pattern));
  if (found) return found;
  return clean
    .replace(/\d{4}[가-힣]{1,4}\d+/g, '')
    .replace(/제출\s*$/g, '')
    .replace(/[\[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSubmittedDocProgressContent(dateKey, caseTitle = '관련 사건', docText = '서면') {
  const dateLabel = formatKoreanMonthDay(dateKey);
  const title = String(caseTitle || '관련 사건').trim();
  const docType = extractDocumentType(docText) || '서면';
  const docLabel = docType.endsWith('제출') ? docType.replace(/제출\s*$/g, '').trim() : docType;
  return `${dateLabel} ${title} ${docLabel} 제출`.replace(/\s+/g, ' ').trim();
}

export function carryForwardPendingDocs(entries = {}, targetDate) {
  const completedKeys = collectPendingDocCompletionKeys(entries, targetDate);
  const current = parseJsonArray(entries[targetDate]?.pendingDocItems)
    .map((item) => normalizeTaskItem(item, 'pending-doc'))
    .filter(Boolean)
    .filter((item) => !hasPendingDocCompletion(completedKeys, item, item.sourceDate || targetDate));
  const existingKeys = new Set();
  current.forEach((item) => addPendingDocIdentityKeys(existingKeys, item, item.sourceDate || targetDate));

  const previousDates = Object.keys(entries)
    .filter((dateKey) => dateKey < targetDate)
    .sort((a, b) => b.localeCompare(a));

  previousDates.forEach((dateKey) => {
    const pendingDocs = parseJsonArray(entries[dateKey]?.pendingDocItems)
      .map((item) => normalizeTaskItem(item, 'pending-doc'))
      .filter(Boolean);

    pendingDocs.forEach((item) => {
      const sourceDate = item.sourceDate || dateKey;
      const forwarded = { ...item, sourceDate, done: false };
      if (item.done || hasPendingDocCompletion(completedKeys, forwarded, sourceDate) || hasPendingDocIdentity(existingKeys, forwarded, sourceDate)) return;
      addPendingDocIdentityKeys(existingKeys, forwarded, sourceDate);
      current.push(forwarded);
    });
  });

  return sortChecklistByDueDate(current);
}

export function sortDelegatedTasks(items = []) {
  return [...items]
    .map((item) => normalizeTaskItem(item, 'delegated'))
    .filter(Boolean)
    .sort((a, b) => {
      const dueCompare = normalizeDateValue(a.dueDate) - normalizeDateValue(b.dueDate);
      if (dueCompare !== 0) return dueCompare;
      const assigneeCompare = (a.assignee || '').localeCompare(b.assignee || '', 'ko');
      if (assigneeCompare !== 0) return assigneeCompare;
      return a.text.localeCompare(b.text, 'ko');
    });
}

function normalizeLearnedItem(item, dateKey) {
  if (!item) return null;
  const title = (item.title || '').trim();
  const content = (item.content || '').trim();
  if (!title && !content) return null;
  return {
    id: item.id || makeId('learned'),
    topic: (item.topic || '미분류').trim() || '미분류',
    subtopic: (item.subtopic || '').trim(),
    title: title || '(제목 없음)',
    content,
    date: item.date || dateKey,
  };
}

function legacyLearnedToItems(raw, dateKey) {
  if (!raw || !raw.trim()) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const topicMatch = line.match(/^\[(.+?)\]\s*(.*)$/);
      const topic = topicMatch ? topicMatch[1].trim() : '미분류';
      const body = topicMatch ? topicMatch[2].trim() : line;
      const [titlePart, ...rest] = body.split(/\s*[—:-]\s*/);
      return normalizeLearnedItem({
        id: `legacy_${dateKey}_${index}`,
        topic,
        subtopic: '',
        title: titlePart || '(제목 없음)',
        content: rest.join(' — ') || body,
      }, dateKey);
    })
    .filter(Boolean);
}

export function getLearnedItemsFromEntry(entry = {}, dateKey = '') {
  const structured = parseJsonArray(entry.learnedItems)
    .map((item) => normalizeLearnedItem(item, dateKey))
    .filter(Boolean);
  if (structured.length) return structured;
  return legacyLearnedToItems(entry.learned || '', dateKey);
}

export function buildLearnedTopicGroups(entries = {}) {
  const groups = new Map();
  Object.entries(entries).forEach(([dateKey, entry]) => {
    getLearnedItemsFromEntry(entry, dateKey).forEach((item) => {
      if (!groups.has(item.topic)) groups.set(item.topic, []);
      groups.get(item.topic).push(item);
    });
  });

  return Array.from(groups.entries())
    .map(([topic, items]) => ({
      topic,
      items: items.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.title.localeCompare(b.title, 'ko');
      }),
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic, 'ko'));
}

export function buildLearnedTopicOptions(entries = {}) {
  return buildLearnedTopicGroups(entries).map((group) => group.topic);
}

export function filterLearnedItemsByTopic(entries = {}, topic = '', options = {}) {
  const excludeDates = new Set(
    [options.excludeDate, ...(options.excludeDates || [])]
      .filter(Boolean)
      .map(String)
  );
  return (buildLearnedTopicGroups(entries).find((group) => group.topic === topic)?.items || [])
    .filter((item) => !excludeDates.has(item.date));
}


export function searchLearnedItems(entries = {}, query = '', topic = '') {
  const normalizedQuery = (query || '').trim().toLowerCase();
  const items = buildLearnedTopicGroups(entries).flatMap((group) => group.items);
  return items.filter((item) => {
    if (topic && item.topic !== topic) return false;
    if (!normalizedQuery) return true;
    return [item.topic, item.subtopic, item.title, item.content, item.date]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  }).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.title.localeCompare(b.title, 'ko');
  });
}

export function buildLearnedArchiveStats(entries = {}, monthPrefix = '') {
  const groups = buildLearnedTopicGroups(entries);
  const items = groups.flatMap((group) => group.items);
  return {
    totalItems: items.length,
    totalTopics: groups.length,
    monthItems: monthPrefix ? items.filter((item) => item.date.startsWith(monthPrefix)).length : items.length,
    topTopic: groups.slice().sort((a, b) => b.items.length - a.items.length)[0]?.topic || '',
  };
}

