// ─────────────────────────────────────────────────────────────────────────────
//  마지막 백업 날짜 (users/{uid}/meta/exports.items 기준)
//  - 백업으로 치는 기록: 내보내기(kind "export")와 복원 전 백업(kind "backup"). 둘 다 전체 데이터와
//    '복원용 원본' 시트를 담는다. 복원에 쓴 파일(kind "source")은 백업이 아니다.
//  - 며칠 전인지는 한국시간 날짜로 센다(오늘 = 0일 전).
// ─────────────────────────────────────────────────────────────────────────────

export const BACKUP_STALE_DAYS = 7;
const BACKUP_KINDS = new Set(["export", "backup"]);
const DAY_MS = 24 * 60 * 60 * 1000;

// 한국시간 기준 날짜 번호(1970-01-01부터 며칠째)
function kstDayNumber(ms) {
  return Math.floor((ms + 9 * 60 * 60 * 1000) / DAY_MS);
}

export function lastBackupInfo(items, now = Date.now()) {
  const list = (Array.isArray(items) ? items : [])
    .filter((it) => it && BACKUP_KINDS.has(it.kind) && Number.isFinite(Date.parse(it.at)));
  if (!list.length) return { none: true, at: null, days: null, stale: true, url: "", title: "" };
  const latest = list.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
  const days = Math.max(0, kstDayNumber(now) - kstDayNumber(Date.parse(latest.at)));
  return {
    none: false,
    at: latest.at,
    days,
    stale: days > BACKUP_STALE_DAYS,
    url: latest.url || "",
    title: latest.title || "",
  };
}

export function backupAgeLabel(info) {
  if (!info || info.none) return "백업 기록 없음";
  if (info.days === 0) return "마지막 백업 오늘";
  if (info.days === 1) return "마지막 백업 어제";
  return `마지막 백업 ${info.days}일 전`;
}

export function formatBackupDate(at) {
  if (!at) return "";
  try {
    return new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(at);
  }
}
