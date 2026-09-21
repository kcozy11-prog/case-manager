// 사건 진행경과의 활동 유형. activityType이 없는 기존 기록은 그대로 유형 미표시로 둔다.
// 개요 탭에서 배지를 눌러 언제든 유형을 직접 지정·변경할 수 있다.
export const TIMELINE_ACTIVITY_TYPES = [
  { value: "document", label: "문서 제출", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "receipt", label: "서류 수령", className: "bg-teal-50 text-teal-700 border-teal-200" },
  { value: "hearing", label: "기일", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "call", label: "통화", className: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "meeting", label: "회의", className: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "review", label: "내부 검토", className: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "ruling", label: "결정·판결", className: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "payment", label: "정산", className: "bg-lime-50 text-lime-700 border-lime-200" },
  { value: "other", label: "기타", className: "bg-slate-50 text-slate-600 border-slate-200" },
];

export const DEFAULT_TIMELINE_ACTIVITY_TYPE = "other";

export function getTimelineActivity(activityType) {
  return TIMELINE_ACTIVITY_TYPES.find((item) => item.value === activityType) || null;
}

// 진행경과 항목의 유형을 바꾼다. 빈 값이면 유형을 지운다(미분류). 원본 불변.
export function setTimelineActivityType(timeline = [], id, activityType) {
  return (timeline || []).map((entry) => {
    if (!entry || entry.id !== id) return entry;
    const next = { ...entry };
    if (activityType && getTimelineActivity(activityType)) next.activityType = activityType;
    else delete next.activityType;
    return next;
  });
}

// 진행경과 목록에 실제로 쓰인 유형만 순서대로 돌려준다(필터 칩용). 미분류가 있으면 hasUntyped=true.
export function collectTimelineActivityTypes(timeline = []) {
  const used = new Set();
  let hasUntyped = false;
  (timeline || []).forEach((entry) => {
    if (!entry) return;
    if (getTimelineActivity(entry.activityType)) used.add(entry.activityType);
    else hasUntyped = true;
  });
  return { types: TIMELINE_ACTIVITY_TYPES.filter((type) => used.has(type.value)), hasUntyped };
}
