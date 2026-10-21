// ─────────────────────────────────────────────────────────────────────────────
//  업무일지의 미완료 할 일 (사건 화면 '미완료 할 일' 집계용)
//  업무일지 화면이 오늘 날짜에 보여 주는 목록과 같은 기준으로 계산한다.
//   - 오늘 일지가 있으면: 그 일지의 할 일(todayTasks) + 예전 칸 「내일 할 일」(tomorrowTasks, 다음 날 할 일로 이월됨)
//   - 없으면: 직전 일지의 미완료 할 일과 예전 「내일 할 일」을 이월한 목록(업무일지를 열면 보이는 것과 같음)
//   - 앞선 날짜에 이미 완료 기록이 있는(되살아난) 할 일은 뺀다.
//  저장된 일지 기준이다(작성 중이고 아직 저장하지 않은 입력은 들어가지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import { parseJsonArray, normalizeTaskItem, carryForwardTasks, dropResurrectedTodayTasks } from "./journalLogic.js";

export const JOURNAL_TASK_LABELS = { today: "업무일지 · 할 일", tomorrow: "업무일지 · 내일 할 일(예전 칸)" };

export function journalTodayKey(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function journalPendingTasks(entries = {}, todayKey = journalTodayKey()) {
  const map = entries || {};
  const base = map[todayKey] || null;
  const todayItems = base
    ? parseJsonArray(base.todayTasks).map((it) => normalizeTaskItem(it, "today")).filter(Boolean)
    : carryForwardTasks(map, todayKey);
  const tomorrowItems = base
    ? parseJsonArray(base.tomorrowTasks).map((it) => normalizeTaskItem(it, "tomorrow")).filter(Boolean)
    : [];
  const today = dropResurrectedTodayTasks(map, todayKey, todayItems).items;
  const shape = (list) => (it) => ({
    id: `journal:${list}:${it.id}`,
    text: it.text,
    dueDate: it.dueDate || "",
    priority: "보통",
    done: false,
    cmCaseId: it.cmCaseId || "",
    cmCaseTitle: it.cmCaseTitle || "",
    journalList: list,
  });
  return [
    ...today.filter((it) => !it.done).map(shape("today")),
    ...tomorrowItems.filter((it) => !it.done).map(shape("tomorrow")),
  ];
}
