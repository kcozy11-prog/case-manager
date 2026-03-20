import { dday, TYPE_STYLE } from "../utils";

export function DdayBadge({ dateStr, small }) {
  const n = dday(dateStr);
  if (n === null) return null;
  let cls, label;
  if (n < 0) { cls = "text-gray-400"; label = `D+${Math.abs(n)}`; }
  else if (n === 0) { cls = "text-red-600 font-bold"; label = "D-day"; }
  else if (n <= 7) { cls = "text-red-500 font-semibold"; label = `D-${n}`; }
  else if (n <= 30) { cls = "text-amber-500 font-semibold"; label = `D-${n}`; }
  else { cls = "text-gray-500"; label = `D-${n}`; }
  return <span className={`${cls} ${small ? "text-xs" : "text-sm"} tabular-nums`}>{label}</span>;
}

export function TypeBadge({ type }) {
  const s = TYPE_STYLE[type] || { badge: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${s.badge}`}>
      {type}
    </span>
  );
}
