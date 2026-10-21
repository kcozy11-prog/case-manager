import { parseJsonArray } from "../../journalLogic";

// 예전 칸(읽기 전용): 칸을 합치기 전에 적은 내용을 지우지 않고 그대로 보여 준다.
//  오늘 업무·통화 메모·기타·작성 서면(글), 사건 진행 기록·통화 상담 기록, 내일 할 일, 제출 예정 서면
//  form 은 JournalApp 의 폼(목록은 이미 배열). 저장된 값은 그대로 다시 저장된다.
export function legacyFieldCount(form = {}) {
  const lists = ["caseProgressItems", "callLogItems", "tomorrowTasks", "pendingDocItems"]
    .reduce((n, f) => n + (Array.isArray(form[f]) ? form[f] : parseJsonArray(form[f])).filter(Boolean).length, 0);
  const texts = ["todayWork", "callNotes", "etc", "writtenDocs"].filter((f) => String(form[f] || "").trim()).length;
  return lists + texts;
}

const Block = ({ title, note, children }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <div className="text-[11px] font-semibold text-slate-500 mb-1">{title}{note && <span className="font-normal text-slate-400 ml-1.5">{note}</span>}</div>
    {children}
  </div>
);

const Text = ({ value }) => <div className="text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed">{value}</div>;

export default function LegacyFields({ form = {} }) {
  const list = (f) => (Array.isArray(form[f]) ? form[f] : parseJsonArray(form[f])).filter(Boolean);
  const progress = list("caseProgressItems");
  const calls = list("callLogItems");
  const tomorrow = list("tomorrowTasks");
  const docs = list("pendingDocItems");
  const rec = (it) => (it.recordedAt ? <span className="text-emerald-600"> ✓사건 기록</span> : it.caseId ? <span className="text-amber-600"> 사건 미기록</span> : null);
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-400">칸을 합치기 전에 적은 내용입니다. 고칠 수 없고, 지우지 않고 보관합니다.</div>
      {String(form.todayWork || "").trim() && <Block title="오늘 업무"><Text value={form.todayWork} /></Block>}
      {progress.length > 0 && (
        <Block title="사건 진행 기록">
          <ul className="text-sm text-slate-600 space-y-0.5">
            {progress.map((it, i) => (
              <li key={it.id || i}>{it.content}{it.detail ? ` — ${it.detail}` : ""}{it.caseTitle ? <span className="text-indigo-400"> · {it.caseTitle}</span> : null}{rec(it)}</li>
            ))}
          </ul>
        </Block>
      )}
      {calls.length > 0 && (
        <Block title="통화 상담 기록">
          <ul className="text-sm text-slate-600 space-y-0.5">
            {calls.map((it, i) => (
              <li key={it.id || i}>{[it.title, it.detail].filter(Boolean).join(" — ")}{it.caseTitle ? <span className="text-indigo-400"> · {it.caseTitle}</span> : null}{it.asClientRequest ? " [의뢰인요청]" : ""}{rec(it)}</li>
            ))}
          </ul>
        </Block>
      )}
      {String(form.callNotes || "").trim() && <Block title="통화·상담 메모"><Text value={form.callNotes} /></Block>}
      {tomorrow.length > 0 && (
        <Block title="내일 할 일" note="남은 것은 다음 날 「할 일」로 이월됩니다">
          <ul className="text-sm text-slate-600 space-y-0.5">
            {tomorrow.map((it, i) => (
              <li key={it.id || i} className={it.done ? "line-through text-slate-300" : ""}>{it.text}{it.dueDate ? ` (~${it.dueDate})` : ""}{it.cmCaseTitle ? <span className="text-indigo-400"> · {it.cmCaseTitle}</span> : null}</li>
            ))}
          </ul>
        </Block>
      )}
      {docs.length > 0 && (
        <Block title="제출 예정 서면" note="이제 사건의 제출대기 서면에서 관리합니다">
          <ul className="text-sm text-slate-600 space-y-0.5">
            {docs.map((it, i) => (
              <li key={it.id || i} className={it.done ? "line-through text-slate-300" : ""}>
                {it.text}{it.dueDate ? ` (~${it.dueDate})` : ""}{it.cmCaseTitle ? <span className="text-indigo-400"> · {it.cmCaseTitle}</span> : null}
                {it.cmBriefId ? <span className="text-emerald-600"> ✓사건에 보냄</span> : !it.done ? <span className="text-amber-600"> 사건에 안 보냄</span> : null}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {String(form.writtenDocs || "").trim() && <Block title="작성 서면"><Text value={form.writtenDocs} /></Block>}
      {String(form.etc || "").trim() && <Block title="기타"><Text value={form.etc} /></Block>}
    </div>
  );
}
