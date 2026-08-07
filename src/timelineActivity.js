// 사건 진행경과의 활동 유형. activityType이 없는 기존 기록은 그대로 유형 미표시로 둔다.
export const TIMELINE_ACTIVITY_TYPES = [
  { value: "document", label: "문서 제출", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "call", label: "통화", className: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "meeting", label: "회의", className: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "review", label: "내부 검토", className: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "other", label: "기타", className: "bg-slate-50 text-slate-600 border-slate-200" },
];

export const DEFAULT_TIMELINE_ACTIVITY_TYPE = "other";

export function getTimelineActivity(activityType) {
  return TIMELINE_ACTIVITY_TYPES.find((item) => item.value === activityType) || null;
}
