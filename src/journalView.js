// ─────────────────────────────────────────────────────────────────────────────
//  업무일지 화면 표시용 (순수 함수)
//   - 위임 업무 배지는 확인일(dueDate) 기준으로 단다(D-n, 오늘, n일 지남). 위임일은 따로 작게 보인다.
//   - 담당자는 기본값 「정실장」에 자주 쓴 담당자를 더해 버튼으로 고른다.
// ─────────────────────────────────────────────────────────────────────────────
import { parseJsonArray } from "./journalLogic.js";

export const DEFAULT_ASSIGNEE = "정실장";

const DAY_MS = 24 * 60 * 60 * 1000;

// 날짜 키 사이 날수(end - start). 형식이 맞지 않으면 null
export function dateKeyDiff(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${startDate}T00:00:00+09:00`);
  const end = Date.parse(`${endDate}T00:00:00+09:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / DAY_MS);
}

// 날짜 키에 날수를 더한다
export function addDaysToKey(dateKey, days = 0) {
  const t = Date.parse(`${dateKey}T00:00:00+09:00`);
  if (!Number.isFinite(t)) return "";
  return new Date(t + days * DAY_MS + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 확인일 기준 배지: { text, tone: "red" | "amber" | "slate" }
export function dueBadge(dueDate, currentDate) {
  const diff = dateKeyDiff(currentDate, dueDate);
  if (diff === null) return { text: "확인일 없음", tone: "slate" };
  if (diff < 0) return { text: `${-diff}일 지남`, tone: "red" };
  if (diff === 0) return { text: "오늘", tone: "amber" };
  return { text: `D-${diff}`, tone: diff <= 1 ? "amber" : "slate" };
}

// 위임 업무 목록 → 화면 순서: 미완료(확인일 빠른 순, 확인일 없는 것은 뒤) / 완료
export function splitDelegatedForDisplay(items = []) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.text);
  const byDue = (a, b) => {
    const ad = a.dueDate || "9999-99-99";
    const bd = b.dueDate || "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.text).localeCompare(String(b.text), "ko");
  };
  return {
    pending: list.filter((it) => !it.done).sort(byDue),
    done: list.filter((it) => it.done),
  };
}

// 자주 쓴 담당자 (기본 담당자가 늘 첫째). 같은 이름은 공백만 정리해 한 번만 센다.
export function frequentAssignees(entries = {}, { limit = 5, defaultAssignee = DEFAULT_ASSIGNEE } = {}) {
  const counts = new Map();
  Object.values(entries || {}).forEach((entry) => {
    parseJsonArray(entry?.delegatedItems).forEach((it) => {
      const name = String(it?.assignee || "").trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  });
  const ranked = [...counts.entries()]
    .filter(([name]) => name !== defaultAssignee)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([name]) => name);
  return [defaultAssignee, ...ranked].filter(Boolean).slice(0, Math.max(1, limit));
}
