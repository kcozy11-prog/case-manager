function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export function formatGoogleApiError(prefix, status, statusText = "", bodyText = "") {
  const statusPart = [status, statusText].filter(Boolean).join(" ");
  let detail = "";

  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message || parsed?.message || "";
    } catch {
      detail = bodyText;
    }
  }

  return `${prefix}: ${statusPart}${detail ? ` — ${compact(detail)}` : ""}`;
}

export async function responseErrorMessage(prefix, response) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }
  return formatGoogleApiError(prefix, response.status, response.statusText, bodyText);
}
