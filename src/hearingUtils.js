export function hearingMemoText(hearing) {
  return String(hearing?.memo || "");
}

export function setHearingMemo(hearings = [], hearingId, memoText = "") {
  const nextMemo = String(memoText || "").trim();
  return (hearings || []).map((hearing) => {
    if (hearing?.id !== hearingId) return hearing;
    const next = { ...hearing };
    if (nextMemo) {
      next.memo = nextMemo;
    } else {
      delete next.memo;
    }
    return next;
  });
}
