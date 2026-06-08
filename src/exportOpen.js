export function openSpreadsheetUrl(url, win = window) {
  let popup = null;
  try {
    popup = win.open?.(url, "_blank", "noopener,noreferrer") ?? null;
  } catch {
    popup = null;
  }

  if (popup) {
    try {
      popup.opener = null;
      popup.focus?.();
    } catch {
      // Some browsers expose a restricted WindowProxy. Opening succeeded, so ignore.
    }
    return "new-tab";
  }

  if (typeof win.location?.assign === "function") {
    win.location.assign(url);
  } else if (win.location) {
    win.location.href = url;
  }
  return "same-tab";
}
