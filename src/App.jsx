import { useState, useMemo, useCallback } from "react";

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────
const today = new Date();
today.setHours(0, 0, 0, 0);
const localDateStr = (d) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, "0"),
  String(d.getDate()).padStart(2, "0"),
].join("-");
const addDays = (d, n) => {
  const r = new Date(d); r.setDate(r.getDate() + n);
  return localDateStr(r);
};
const todayStr = localDateStr(today);
const dday = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
};
const fmtDate = (s) => s ? s.replace(/-/g, ".") : "—";
const fmtMoney = (n) => n ? Number(n).toLocaleString() + "원" : "—";

// ── 샘플 데이터 ───────────────────────────────────────────────────────────────
const SAMPLE_CASES = [
  {
    id: "c1", title: "아파트 분양대금 반환 청구", type: "민사", status: "진행중",
    client: "김민준", clientContact: "010-1234-5678",
    opponent: "㈜한강건설",
    manager: "홍길동", managerOrg: "법무법인 여유", managerContact: "02-555-0001",
    court: "서울중앙지방법원", caseNumber: "2026가합12345",
    retainer: { amount: 3000000, date: "2026-01-15", successFee: "승소금액의 10%", successFeeAmount: "" },
    hearings: [
      { id: 1, date: addDays(today, 5), type: "변론기일", result: "" },
      { id: 2, date: addDays(today, -30), type: "첫 변론기일", result: "준비서면 제출 명령" },
    ],
    timeline: [
      { id: 1, date: "2026-01-15", content: "수임 계약 체결" },
      { id: 2, date: "2026-02-01", content: "소장 접수 완료" },
      { id: 3, date: "2026-02-20", content: "피고 답변서 수령 및 검토" },
    ],
    memo: "계약서 원본 추가 수령 필요. 피고 답변서 검토 완료.",
    documents: [
      { id: 1, title: "소장", date: "2026-02-01", url: "https://drive.google.com/file/d/sample1", note: "" },
      { id: 2, title: "준비서면 1호", date: "2026-03-10", url: "https://drive.google.com/file/d/sample2", note: "1차 변론 제출용" },
    ],
    todos: [
      { id: 1, text: "피고 답변서 반박 준비서면 작성", done: false, priority: "높음", dueDate: "" },
      { id: 2, text: "계약서 원본 수령", done: false, priority: "보통", dueDate: "" },
      { id: 3, text: "원고 본인신문 사전 준비", done: true, priority: "보통", dueDate: "" },
    ],
  },
  {
    id: "c2", title: "사기 고소 — 투자금 편취", type: "형사(고소)", status: "진행중",
    client: "이수진", clientContact: "010-9876-5432",
    opponent: "박철수",
    manager: "홍길동", managerOrg: "법무법인 여유", managerContact: "02-555-0001",
    court: "서울중앙지방검찰청", caseNumber: "2026형제56789",
    retainer: { amount: 5000000, date: "2026-02-10", successFee: "기소 시 2,000,000원", successFeeAmount: 2000000 },
    hearings: [
      { id: 1, date: addDays(today, 12), type: "피의자 조사 동행", result: "" },
    ],
    timeline: [
      { id: 1, date: "2026-02-10", content: "수임 및 고소장 작성 착수" },
      { id: 2, date: "2026-02-25", content: "고소장 접수" },
    ],
    memo: "금융거래내역 확보 필요. 피해금액 5천만원.",
    documents: [
      { id: 1, title: "고소장", date: "2026-02-25", url: "https://drive.google.com/file/d/sample3", note: "" },
    ],
    todos: [
      { id: 1, text: "금융거래내역서 확보", done: false, priority: "높음", dueDate: "" },
      { id: 2, text: "피해 경위서 작성 (의뢰인 서명)", done: true, priority: "높음", dueDate: "" },
    ],
  },
  {
    id: "c3", title: "업무상 횡령 형사 재판", type: "형사(재판)", status: "진행중",
    client: "최영호", clientContact: "010-5555-7777",
    opponent: "검사",
    manager: "홍길동", managerOrg: "법무법인 여유", managerContact: "02-555-0001",
    court: "서울중앙지방법원", caseNumber: "2026고합321",
    retainer: { amount: 8000000, date: "2025-11-01", successFee: "무죄 또는 집행유예 시 5,000,000원", successFeeAmount: 5000000 },
    hearings: [
      { id: 1, date: addDays(today, 3), type: "공판기일", result: "" },
      { id: 2, date: addDays(today, -15), type: "공판준비기일", result: "증거 목록 교환 완료" },
    ],
    timeline: [
      { id: 1, date: "2025-11-01", content: "수임" },
      { id: 2, date: "2025-12-05", content: "공소장 수령 및 검토" },
      { id: 3, date: "2026-01-10", content: "공판준비기일 출석" },
    ],
    memo: "피고인 진술서 추가 작성 예정. 증인 신청 여부 검토 중.",
    documents: [
      { id: 1, title: "공소장", date: "2025-12-05", url: "https://drive.google.com/file/d/sample4", note: "" },
      { id: 2, title: "변호인 의견서", date: "2026-01-08", url: "https://drive.google.com/file/d/sample5", note: "" },
    ],
    todos: [
      { id: 1, text: "피고인 진술서 추가 작성", done: false, priority: "높음", dueDate: "" },
      { id: 2, text: "증인 신청 여부 결정", done: false, priority: "높음", dueDate: "" },
      { id: 3, text: "증거목록 정리", done: true, priority: "보통", dueDate: "" },
    ],
  },
  {
    id: "c4", title: "스타트업 주주간 계약 자문", type: "자문", status: "종결",
    client: "㈜넥스트랩", clientContact: "02-333-4444",
    opponent: "—",
    manager: "홍길동", managerOrg: "법무법인 여유", managerContact: "02-555-0001",
    court: "—", caseNumber: "—",
    retainer: { amount: 2000000, date: "2025-09-01", successFee: "없음", successFeeAmount: "" },
    hearings: [],
    timeline: [
      { id: 1, date: "2025-09-01", content: "자문 계약 체결" },
      { id: 2, date: "2025-09-20", content: "주주간 계약서 초안 검토 완료" },
      { id: 3, date: "2025-10-05", content: "최종 의견 전달 및 종결" },
    ],
    memo: "계약서 최종본 클라이언트 전달 완료.",
    documents: [
      { id: 1, title: "자문 의견서", date: "2025-10-05", url: "https://drive.google.com/file/d/sample6", note: "" },
    ],
    todos: [
      { id: 1, text: "최종 자문료 청구서 발송", done: true, priority: "보통", dueDate: "" },
    ],
  },
  {
    id: "c5", title: "교통사고 도주 피의자 변호", type: "형사(피의)", status: "진행중",
    client: "정대현", clientContact: "010-7777-2222",
    opponent: "검사",
    manager: "홍길동", managerOrg: "법무법인 여유", managerContact: "02-555-0001",
    court: "서울강남경찰서", caseNumber: "2026-강남형사-1122",
    retainer: { amount: 4000000, date: "2026-03-01", successFee: "불기소 처분 시 2,000,000원", successFeeAmount: 2000000 },
    hearings: [
      { id: 1, date: addDays(today, 2), type: "경찰 조사 동행", result: "" },
    ],
    timeline: [
      { id: 1, date: "2026-03-01", content: "수임 및 사건 경위 청취" },
      { id: 2, date: "2026-03-02", content: "블랙박스 영상 확보 완료" },
    ],
    memo: "블랙박스 영상 분석 결과 유리한 정황 있음. 합의 가능성 타진 중.",
    documents: [],
    todos: [
      { id: 1, text: "블랙박스 영상 분석 의견서 작성", done: false, priority: "높음", dueDate: "" },
      { id: 2, text: "피해자 측 합의 의향 확인", done: false, priority: "보통", dueDate: "" },
    ],
  },
];

// ── 상수 ──────────────────────────────────────────────────────────────────────
const TYPES = ["전체", "민사", "형사(고소)", "형사(피의)", "형사(재판)", "자문"];
const STATUSES = ["전체", "진행중", "종결"];

const TYPE_STYLE = {
  "민사":       { dot: "#6366F1", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "형사(고소)": { dot: "#F59E0B", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  "형사(피의)": { dot: "#EF4444", badge: "bg-red-50 text-red-700 border-red-200" },
  "형사(재판)": { dot: "#8B5CF6", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  "자문":       { dot: "#10B981", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const emptyCase = () => ({
  id: `c${Date.now()}`, title: "", type: "민사", status: "진행중",
  client: "", clientContact: "",
  opponent: "",
  manager: "", managerOrg: "", managerContact: "",
  court: "", caseNumber: "",
  retainer: { amount: "", date: "", successFee: "", successFeeAmount: "" },
  hearings: [], timeline: [], memo: "", documents: [], todos: [],
});

// ── D-day 배지 ────────────────────────────────────────────────────────────────
function DdayBadge({ dateStr, small }) {
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

// ── 타입 배지 ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const s = TYPE_STYLE[type] || { badge: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${s.badge}`}>
      {type}
    </span>
  );
}

// ── 통계 바 ───────────────────────────────────────────────────────────────────
function StatsBar({ cases }) {
  const active = cases.filter(c => c.status === "진행중").length;
  const thisMonth = cases.flatMap(c => c.hearings).filter(h => {
    const d = new Date(h.date); 
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && dday(h.date) >= 0;
  }).length;
  const week7 = cases.flatMap(c => c.hearings).filter(h => {
    const n = dday(h.date); return n !== null && n >= 0 && n <= 7;
  }).length;
  const pendingTodos = cases.filter(c=>c.status==="진행중").flatMap(c=>c.todos||[]).filter(t=>!t.done).length;

  return (
    <div style={{ background: "#1E293B" }} className="flex items-center gap-0 px-6 py-0 border-b border-slate-700">
      {[
        { label: "진행 중 사건", value: active, unit: "건", color: "#60A5FA" },
        { label: "이번 달 기일", value: thisMonth, unit: "건", color: "#34D399" },
        { label: "7일 내 기일", value: week7, unit: "건", color: week7 > 0 ? "#F87171" : "#94A3B8" },
        { label: "미완료 할 일", value: pendingTodos, unit: "건", color: pendingTodos > 0 ? "#FBBF24" : "#94A3B8" },
      ].map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-6 py-3 border-r border-slate-700 last:border-r-0">
          <div>
            <div className="text-xs text-slate-400 leading-none mb-1">{s.label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold leading-none" style={{ color: s.color, fontFamily: "'Courier New', monospace" }}>{s.value}</span>
              <span className="text-xs text-slate-400">{s.unit}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 사건 목록 아이템 ──────────────────────────────────────────────────────────
function CaseItem({ c, selected, onClick }) {
  const nextHearing = c.hearings
    .filter(h => dday(h.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const dot = TYPE_STYLE[c.type]?.dot || "#94A3B8";
  const urgent = nextHearing && dday(nextHearing.date) <= 7;

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer border-b border-slate-100 transition-all duration-150 ${
        selected ? "bg-indigo-50 border-l-4 border-l-indigo-500" : "hover:bg-slate-50 border-l-4 border-l-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: dot }} />
          <span className="text-sm font-semibold text-slate-800 truncate">{c.title}</span>
        </div>
        {urgent && nextHearing && <DdayBadge dateStr={nextHearing.date} small />}
      </div>
      <div className="flex items-center gap-2 ml-4">
        <TypeBadge type={c.type} />
        <span className="text-xs text-slate-400">{c.client}</span>
        {c.status === "종결" && (
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">종결</span>
        )}
      </div>
      <div className="ml-4 mt-1 flex items-center gap-2">
        {nextHearing && (
          <span className="text-xs text-slate-400">
            다음 기일: {fmtDate(nextHearing.date)} {nextHearing.type}
          </span>
        )}
        {(() => { const pending = (c.todos||[]).filter(t=>!t.done).length; return pending > 0 ? (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-xs font-bold leading-none flex-shrink-0" style={{fontSize:"10px"}}>
            {pending}
          </span>
        ) : null; })()}
      </div>
    </div>
  );
}

// ── 상세 패널 — 개요 탭 ───────────────────────────────────────────────────────
function OverviewTab({ c, onEdit }) {
  const upcomingHearings = [...c.hearings]
    .filter(h => dday(h.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const pastHearings = [...c.hearings]
    .filter(h => dday(h.date) < 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-5">
      {/* 기본 정보 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="의뢰인" value={c.client} sub={c.clientContact} />
        <InfoCard label="상대방" value={c.opponent} />
        <InfoCard label="관할 기관" value={c.court} sub={c.caseNumber ? `사건번호: ${c.caseNumber}` : ""} />
        <InfoCard label="담당자" value={c.manager}
          sub={[c.managerOrg, c.managerContact].filter(Boolean).join(" · ")} />
      </div>

      {/* 선임약정 */}
      <Section title="선임약정">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">착수금</div>
            <div className="text-sm font-semibold text-slate-800">{fmtMoney(c.retainer?.amount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">수임일</div>
            <div className="text-sm text-slate-700">{fmtDate(c.retainer?.date)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">성공보수</div>
            <div className="text-sm text-slate-700">{c.retainer?.successFee || "—"}</div>
            {c.retainer?.successFeeAmount && (
              <div className="text-xs text-slate-400">{fmtMoney(c.retainer.successFeeAmount)}</div>
            )}
          </div>
        </div>
      </Section>

      {/* 기일 */}
      <Section title="기일">
        {c.hearings.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 기일이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {upcomingHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">예정</div>
                {upcomingHearings.map(h => (
                  <HearingRow key={h.id} h={h} upcoming />
                ))}
              </>
            )}
            {pastHearings.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2 mb-1">지난 기일</div>
                {pastHearings.map(h => (
                  <HearingRow key={h.id} h={h} />
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      {/* 진행경과 타임라인 */}
      <Section title="진행경과">
        {c.timeline.length === 0 ? (
          <div className="text-sm text-slate-400 italic">등록된 경과가 없습니다.</div>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-200" />
            {[...c.timeline].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t, i) => (
              <div key={t.id} className="relative mb-3 last:mb-0">
                <div className="absolute -left-2.5 top-1.5 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white" />
                <div className="text-xs text-slate-400 mb-0.5">{fmtDate(t.date)}</div>
                <div className="text-sm text-slate-700">{t.content}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 메모 */}
      <Section title="메모">
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {c.memo || <span className="text-slate-400 italic">메모가 없습니다.</span>}
        </div>
      </Section>
    </div>
  );
}

function HearingRow({ h, upcoming }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
      upcoming ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50"
    }`}>
      <div className="flex items-center gap-3">
        <DdayBadge dateStr={h.date} small />
        <div>
          <div className="text-sm font-medium text-slate-700">{h.type}</div>
          {h.result && <div className="text-xs text-slate-400">{h.result}</div>}
        </div>
      </div>
      <div className="text-xs text-slate-500">{fmtDate(h.date)}</div>
    </div>
  );
}

function InfoCard({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value || "—"}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}

// ── 상세 패널 — 문서 탭 ───────────────────────────────────────────────────────
function DocumentsTab({ c, onUpdate }) {
  const [newDoc, setNewDoc] = useState({ title: "", date: todayStr, url: "", note: "" });
  const [adding, setAdding] = useState(false);

  const addDoc = () => {
    if (!newDoc.title.trim()) return;
    const updated = { ...c, documents: [...c.documents, { id: Date.now(), ...newDoc }] };
    onUpdate(updated);
    setNewDoc({ title: "", date: todayStr, url: "", note: "" });
    setAdding(false);
  };

  const delDoc = (id) => onUpdate({ ...c, documents: c.documents.filter(d => d.id !== id) });

  return (
    <div className="space-y-3">
      {c.documents.length === 0 && !adding && (
        <div className="text-sm text-slate-400 italic py-4 text-center">등록된 문서가 없습니다.</div>
      )}
      {c.documents.map(doc => (
        <div key={doc.id} className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 truncate">{doc.title}</span>
              <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(doc.date)}</span>
            </div>
            {doc.note && <div className="text-xs text-slate-500 mt-0.5">{doc.note}</div>}
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-500 hover:text-indigo-700 underline truncate block mt-0.5">
                {doc.url.length > 50 ? doc.url.slice(0, 50) + "…" : doc.url}
              </a>
            )}
          </div>
          <button onClick={() => delDoc(doc.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
        </div>
      ))}

      {adding ? (
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input-sm" placeholder="문서 제목 *" value={newDoc.title}
              onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} />
            <input className="input-sm" type="date" value={newDoc.date}
              onChange={e => setNewDoc(p => ({ ...p, date: e.target.value }))} />
          </div>
          <input className="input-sm w-full" placeholder="Google Drive URL"
            value={newDoc.url} onChange={e => setNewDoc(p => ({ ...p, url: e.target.value }))} />
          <input className="input-sm w-full" placeholder="메모 (선택)"
            value={newDoc.note} onChange={e => setNewDoc(p => ({ ...p, note: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-ghost text-xs">취소</button>
            <button onClick={addDoc} className="btn-primary text-xs py-1 px-3">추가</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">
          + 문서 추가
        </button>
      )}
    </div>
  );
}


// ── 상세 패널 — 할 일 탭 ──────────────────────────────────────────────────────
function TodosTab({ c, onUpdate }) {
  const [newTodo, setNewTodo] = useState({ text: "", priority: "보통", dueDate: "" });
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(true);

  const todos = c.todos || [];
  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);

  const toggleDone = (id) => {
    onUpdate({ ...c, todos: todos.map(t => t.id === id ? { ...t, done: !t.done } : t) });
  };
  const delTodo = (id) => {
    onUpdate({ ...c, todos: todos.filter(t => t.id !== id) });
  };
  const addTodo = () => {
    if (!newTodo.text.trim()) return;
    onUpdate({ ...c, todos: [...todos, { id: Date.now(), ...newTodo }] });
    setNewTodo({ text: "", priority: "보통", dueDate: "" });
    setAdding(false);
  };

  const PRIO = {
    "높음": { label: "text-red-500 font-semibold" },
    "보통": { label: "text-slate-700" },
  };

  const TodoRow = ({ t }) => {
    const p = PRIO[t.priority] || PRIO["보통"];
    const overdue = t.dueDate && dday(t.dueDate) < 0 && !t.done;
    return (
      <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-all ${
        t.done ? "bg-slate-50 border-slate-100 opacity-50" : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
      }`}>
        <button onClick={() => toggleDone(t.id)}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            t.done ? "bg-emerald-400 border-emerald-400 text-white" : "border-slate-300 hover:border-indigo-400"
          }`}>
          {t.done && <span className="text-white text-xs leading-none">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm leading-snug ${t.done ? "line-through text-slate-400" : p.label}`}>
            {t.text}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {t.dueDate && (
              <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                {overdue ? "⚠" : "📅"} {fmtDate(t.dueDate)}
                {!t.done && <DdayBadge dateStr={t.dueDate} small />}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => delTodo(t.id)} className="text-slate-200 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 미완료 */}
      {pending.length === 0 && !adding && done.length === 0 && (
        <div className="text-sm text-slate-400 italic py-4 text-center">등록된 할 일이 없습니다.</div>
      )}
      {pending.length === 0 && !adding && done.length > 0 && (
        <div className="text-sm text-slate-400 italic py-2 text-center">미완료 항목이 없습니다. 🎉</div>
      )}
      <div className="space-y-2">
        {pending.sort((a, b) => {
          const prioOrder = { "높음": 0, "보통": 1 };
          return (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1);
        }).map(t => <TodoRow key={t.id} t={t} />)}
      </div>

      {/* 추가 폼 */}
      {adding ? (
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <input className="input-sm w-full" placeholder="할 일 내용 *" value={newTodo.text}
            onChange={e => setNewTodo(p => ({ ...p, text: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && addTodo()} autoFocus />
          <div className="flex gap-2">
            <select className="input-sm flex-1" value={newTodo.priority}
              onChange={e => setNewTodo(p => ({ ...p, priority: e.target.value }))}>
              <option>높음</option><option>보통</option>
            </select>
            <input className="input-sm flex-1" type="date" value={newTodo.dueDate}
              onChange={e => setNewTodo(p => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-ghost text-xs">취소</button>
            <button onClick={addTodo} className="btn-primary text-xs py-1 px-3">추가</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">
          + 할 일 추가
        </button>
      )}

      {/* 완료 항목 */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(p => !p)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-2 transition-colors">
            <span>{showDone ? "▾" : "▸"}</span>
            <span>완료 {done.length}건</span>
          </button>
          {showDone && (
            <div className="space-y-2">
              {done.map(t => <TodoRow key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 로컬 파싱 (법원 알림 / 카카오톡 등) ──────────────────────────────────────
function parseText(text) {
  const result = {
    client: null, title: null, type: null, court: null, caseNumber: null,
    hearingDate: null, hearingType: null, timelineContent: null, memo: null, opponent: null,
  };

  // ●사건: 대전지방법원-2025구합200477 [전자] 손실보상금 등
  const caseMatch = text.match(/[●•]\s*사건\s*[:：]\s*([^\n●•]+)/);
  if (caseMatch) {
    const caseStr = caseMatch[1].trim();
    const courtCaseMatch = caseStr.match(/^(.+?(?:법원|검찰청|경찰서))[- ](\S+)/);
    if (courtCaseMatch) {
      result.court = courtCaseMatch[1].trim();
      result.caseNumber = courtCaseMatch[2].trim();
      const rest = caseStr.slice(courtCaseMatch[0].length).replace(/\[전자\]/g, "").trim();
      if (rest) result.title = rest;
    } else {
      result.title = caseStr;
    }
  }

  // ●당사자명: 아둘람
  const clientMatch = text.match(/[●•]\s*당사자명\s*[:：]\s*([^\n●•]+)/);
  if (clientMatch) result.client = clientMatch[1].trim();

  // ●내용: [기일] 변론기일(...)
  const contentMatch = text.match(/[●•]\s*내용\s*[:：]\s*([^\n●•]+)/);
  if (contentMatch) {
    const content = contentMatch[1].trim();
    const htMatch = content.match(/\[([^\]]+)\]\s*([^(\（\n]+)/);
    if (htMatch) result.hearingType = htMatch[2].trim() || htMatch[1].trim();
    result.timelineContent = content;
  }

  // ●일시/장소: 2026. 01. 29. 15:30 별관 제332호 법정
  const dateMatch = text.match(/[●•]\s*일시[^:：]*\s*[:：]\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (dateMatch) {
    result.hearingDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[3]).padStart(2,"0")}`;
  }

  // ●결과: 기일변경
  const resultMatch = text.match(/[●•]\s*결과\s*[:：]\s*([^\n●•]+)/);
  const resultVal = resultMatch ? resultMatch[1].trim() : "";
  if (resultVal && resultVal !== "-") result.memo = `결과: ${resultVal}`;

  // 사건번호로 유형 추론
  if (result.caseNumber) {
    const cn = result.caseNumber;
    if (/가합|가단|가소/.test(cn)) result.type = "민사";
    else if (/고합|고단|고정/.test(cn)) result.type = "형사(재판)";
    else if (/형제|형사/.test(cn)) result.type = "형사(고소)";
    else if (/구합|구단/.test(cn)) result.type = "민사";
  }

  return result;
}

// ── AI 파싱 모달 ──────────────────────────────────────────────────────────────
function AiParseModal({ cases, onClose, onApply }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [matchedCase, setMatchedCase] = useState(null);
  const [error, setError] = useState("");

  const parse = () => {
    if (!text.trim()) return;
    setError(""); setResult(null); setMatchedCase(null);
    try {
      const parsed = parseText(text);
      const hasAny = Object.values(parsed).some(v => v !== null);
      if (!hasAny) {
        setError("인식할 수 있는 항목이 없습니다. 법원 알림 형식(●사건: / ●당사자명: 등)을 확인해 주세요.");
        return;
      }
      setResult(parsed);
      const nameToMatch = (parsed.client || "").toLowerCase();
      const numToMatch = (parsed.caseNumber || "").toLowerCase();
      const found = cases.find(c => {
        const cName = c.client.toLowerCase();
        const cNum = (c.caseNumber || "").toLowerCase();
        const nameMatch = nameToMatch && (cName.includes(nameToMatch) || nameToMatch.includes(cName));
        const numMatch = numToMatch && (cNum.includes(numToMatch) || numToMatch.includes(cNum));
        return nameMatch || numMatch;
      });
      setMatchedCase(found || null);
    } catch (e) {
      setError("파싱 중 오류가 발생했습니다: " + e.message);
    }
  };

  const apply = () => {
    if (!result) return;
    onApply(result, matchedCase);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">AI 파싱</div>
            <div className="text-slate-400 text-xs">카카오톡/메모 붙여넣기 → 자동 추출</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-400 bg-slate-50 rounded px-3 py-2">
            💡 법원 알림 문자(●사건: / ●당사자명: / ●일시 등)를 붙여넣으면 자동으로 파싱합니다.
          </div>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            rows={6} placeholder="카카오톡 대화, 메모 등을 붙여넣으세요..."
            value={text} onChange={e => setText(e.target.value)}
          />
          {error && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>}

          {result && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">추출 결과</div>
              {Object.entries(result).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-28 flex-shrink-0">{k}</span>
                  <span className="text-slate-700 font-medium">{String(v)}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2 mt-2">
                {matchedCase ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <span>✓</span>
                    <span>일치 사건: <strong>{matchedCase.title}</strong>에 적용됩니다.</span>
                  </div>
                ) : (
                  <div className="text-sm text-amber-600">일치 사건 없음 → 새 사건으로 등록됩니다.</div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-ghost">취소</button>
            {!result ? (
              <button onClick={parse} disabled={!text.trim()} className="btn-primary">
                파싱하기
              </button>
            ) : (
              <button onClick={apply} className="btn-primary">적용하기</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 사건 등록/수정 모달 ────────────────────────────────────────────────────────
function CaseFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || emptyCase());
  const [newHearing, setNewHearing] = useState({ date: todayStr, type: "", result: "" });
  const [newTimeline, setNewTimeline] = useState({ date: todayStr, content: "" });
  const set = (path, val) => {
    setForm(prev => {
      const next = { ...prev };
      const parts = path.split(".");
      if (parts.length === 2) next[parts[0]] = { ...prev[parts[0]], [parts[1]]: val };
      else next[path] = val;
      return next;
    });
  };

  const addHearing = () => {
    if (!newHearing.date || !newHearing.type.trim()) return;
    setForm(p => ({ ...p, hearings: [...p.hearings, { id: Date.now(), ...newHearing }] }));
    setNewHearing({ date: todayStr, type: "", result: "" });
  };
  const delHearing = (id) => setForm(p => ({ ...p, hearings: p.hearings.filter(h => h.id !== id) }));

  const addTimeline = () => {
    if (!newTimeline.content.trim()) return;
    setForm(p => ({ ...p, timeline: [...p.timeline, { id: Date.now(), ...newTimeline }] }));
    setNewTimeline({ date: todayStr, content: "" });
  };
  const delTimeline = (id) => setForm(p => ({ ...p, timeline: p.timeline.filter(t => t.id !== id) }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#1E293B" }}>
          <div className="text-white font-semibold">{initial?.id && !initial._isNew ? "사건 수정" : "새 사건 등록"}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* 기본 */}
          <FormSection title="기본 정보">
            <div className="space-y-2">
              <input className="input w-full" placeholder="사건명 *" value={form.title}
                onChange={e => set("title", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={form.type} onChange={e => set("type", e.target.value)}>
                  {TYPES.slice(1).map(t => <option key={t}>{t}</option>)}
                </select>
                <select className="input" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option>진행중</option><option>종결</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="관할 법원/기관" value={form.court}
                  onChange={e => set("court", e.target.value)} />
                <input className="input" placeholder="사건번호" value={form.caseNumber}
                  onChange={e => set("caseNumber", e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 당사자 */}
          <FormSection title="당사자">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="의뢰인 이름" value={form.client}
                onChange={e => set("client", e.target.value)} />
              <input className="input" placeholder="의뢰인 연락처" value={form.clientContact}
                onChange={e => set("clientContact", e.target.value)} />
              <input className="input col-span-2" placeholder="상대방" value={form.opponent}
                onChange={e => set("opponent", e.target.value)} />
            </div>
          </FormSection>

          {/* 담당자 */}
          <FormSection title="담당자">
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="이름" value={form.manager}
                onChange={e => set("manager", e.target.value)} />
              <input className="input" placeholder="소속" value={form.managerOrg}
                onChange={e => set("managerOrg", e.target.value)} />
              <input className="input" placeholder="연락처" value={form.managerContact}
                onChange={e => set("managerContact", e.target.value)} />
            </div>
          </FormSection>

          {/* 선임약정 */}
          <FormSection title="선임약정">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="number" placeholder="착수금 (원)" value={form.retainer.amount}
                onChange={e => set("retainer.amount", e.target.value)} />
              <input className="input" type="date" value={form.retainer.date}
                onChange={e => set("retainer.date", e.target.value)} />
            </div>
            <input className="input w-full mt-2" placeholder="성공보수 조건 (예: 승소 시 회수금의 10%)"
              value={form.retainer.successFee}
              onChange={e => set("retainer.successFee", e.target.value)} />
            <input className="input w-full mt-2" type="number" placeholder="성공보수 금액 (원, 선택)"
              value={form.retainer.successFeeAmount}
              onChange={e => set("retainer.successFeeAmount", e.target.value)} />
          </FormSection>

          {/* 기일 */}
          <FormSection title="기일">
            {form.hearings.map(h => (
              <div key={h.id} className="flex items-center gap-2 text-sm mb-1.5 bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-400 w-24">{fmtDate(h.date)}</span>
                <span className="text-slate-700 flex-1">{h.type}</span>
                {h.result && <span className="text-slate-400 text-xs">{h.result}</span>}
                <button onClick={() => delHearing(h.id)} className="text-slate-300 hover:text-red-400 ml-1">✕</button>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <input className="input" type="date" value={newHearing.date}
                onChange={e => setNewHearing(p => ({ ...p, date: e.target.value }))} />
              <input className="input" placeholder="기일 종류" value={newHearing.type}
                onChange={e => setNewHearing(p => ({ ...p, type: e.target.value }))} />
              <div className="flex gap-1">
                <input className="input flex-1" placeholder="결과 (선택)" value={newHearing.result}
                  onChange={e => setNewHearing(p => ({ ...p, result: e.target.value }))} />
                <button onClick={addHearing} className="btn-primary px-2.5">+</button>
              </div>
            </div>
          </FormSection>

          {/* 진행경과 */}
          <FormSection title="진행경과">
            {form.timeline.map(t => (
              <div key={t.id} className="flex items-start gap-2 text-sm mb-1.5 bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-400 w-24 flex-shrink-0">{fmtDate(t.date)}</span>
                <span className="text-slate-700 flex-1">{t.content}</span>
                <button onClick={() => delTimeline(t.id)} className="text-slate-300 hover:text-red-400 ml-1">✕</button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input className="input w-36 flex-shrink-0" type="date" value={newTimeline.date}
                onChange={e => setNewTimeline(p => ({ ...p, date: e.target.value }))} />
              <input className="input flex-1" placeholder="경과 내용" value={newTimeline.content}
                onChange={e => setNewTimeline(p => ({ ...p, content: e.target.value }))} />
              <button onClick={addTimeline} className="btn-primary px-2.5">+</button>
            </div>
          </FormSection>

          {/* 메모 */}
          <FormSection title="메모">
            <textarea className="input w-full resize-none" rows={3} placeholder="메모 입력..."
              value={form.memo} onChange={e => set("memo", e.target.value)} />
          </FormSection>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">취소</button>
          <button onClick={() => { if (!form.title.trim()) return; onSave(form); onClose(); }}
            className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}

// ── 메인 앱 ───────────────────────────────────────────────────────────────────
export default function App() {
  const [cases, setCases] = useState(() => {
    try {
      const saved = localStorage.getItem("case_manager_cases");
      return saved ? JSON.parse(saved) : SAMPLE_CASES;
    } catch {
      return SAMPLE_CASES;
    }
  });
  const [selectedId, setSelectedId] = useState("c1");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [activeTab, setActiveTab] = useState("overview");
  const [showForm, setShowForm] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [showAI, setShowAI] = useState(false);

  const filtered = useMemo(() => cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title.toLowerCase().includes(q) || c.client.toLowerCase().includes(q)
      || c.caseNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "전체" || c.status === statusFilter;
    const matchType = typeFilter === "전체" || c.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [cases, search, statusFilter, typeFilter]);

  const selected = cases.find(c => c.id === selectedId);

  const saveCase = useCallback((c) => {
    setCases(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      const next = idx >= 0
        ? prev.map((x, i) => i === idx ? c : x)
        : [c, ...prev];
      try { localStorage.setItem("case_manager_cases", JSON.stringify(next)); } catch {}
      return next;
    });
    setSelectedId(c.id);
  }, []);

  const applyAI = useCallback((result, matchedCase) => {
    if (matchedCase) {
      // 기존 사건에 적용
      const updated = { ...matchedCase };
      if (result.memo) updated.memo = (updated.memo ? updated.memo + "\n" : "") + result.memo;
      if (result.hearingDate && result.hearingType) {
        updated.hearings = [...updated.hearings, {
          id: Date.now(), date: result.hearingDate, type: result.hearingType, result: ""
        }];
      }
      if (result.timelineContent) {
        updated.timeline = [...updated.timeline, {
          id: Date.now(), date: todayStr, content: result.timelineContent
        }];
      }
      saveCase(updated);
      setSelectedId(matchedCase.id);
    } else {
      // 새 사건 등록
      const nc = emptyCase();
      if (result.client) nc.client = result.client;
      if (result.title) nc.title = result.title;
      if (result.type && TYPES.includes(result.type)) nc.type = result.type;
      if (result.court) nc.court = result.court;
      if (result.caseNumber) nc.caseNumber = result.caseNumber;
      if (result.opponent) nc.opponent = result.opponent;
      if (result.memo) nc.memo = result.memo;
      if (result.hearingDate && result.hearingType) {
        nc.hearings = [{ id: Date.now(), date: result.hearingDate, type: result.hearingType, result: "" }];
      }
      if (result.timelineContent) {
        nc.timeline = [{ id: Date.now(), date: todayStr, content: result.timelineContent }];
      }
      setEditCase({ ...nc, _isNew: true });
      setShowForm(true);
    }
  }, [saveCase]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif; }
        .input { border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 10px; font-size: 13px; 
          color: #334155; background: white; outline: none; width: 100%; }
        .input:focus { border-color: #818CF8; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
        .input-sm { border: 1px solid #E2E8F0; border-radius: 6px; padding: 5px 8px; font-size: 12px;
          color: #334155; background: white; outline: none; width: 100%; }
        .input-sm:focus { border-color: #818CF8; box-shadow: 0 0 0 2px rgba(99,102,241,0.12); }
        .btn-primary { background: #4F46E5; color: white; border: none; border-radius: 8px; 
          padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 600; transition: background 0.15s; }
        .btn-primary:hover { background: #4338CA; }
        .btn-primary:disabled { background: #A5B4FC; cursor: not-allowed; }
        .btn-ghost { background: transparent; color: #64748B; border: 1px solid #E2E8F0; border-radius: 8px;
          padding: 7px 14px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .btn-ghost:hover { background: #F8FAFC; border-color: #CBD5E1; }
        ::-webkit-scrollbar { width: 5px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      `}</style>

      <div className="flex flex-col h-screen bg-slate-100" style={{ minHeight: "100vh" }}>
        {/* 헤더 */}
        <div style={{ background: "#0F172A" }} className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">⚖</div>
            <span className="text-white font-bold text-base tracking-tight">사건 관리</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">
              <span>✨</span> AI 파싱
            </button>
            <button onClick={() => { setEditCase(null); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold">
              <span>+</span> 새 사건
            </button>
          </div>
        </div>

        {/* 통계 바 */}
        <StatsBar cases={cases} />

        {/* 본문 */}
        <div className="flex flex-1 min-h-0">
          {/* 좌측 목록 */}
          <div className="w-72 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">
            {/* 검색 */}
            <div className="p-3 border-b border-slate-100">
              <input className="input" placeholder="사건명, 의뢰인, 사건번호 검색…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {/* 필터 */}
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
              <div className="flex gap-1 flex-wrap">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      statusFilter === s
                        ? "bg-slate-800 text-white border-slate-800"
                        : "text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}>{s}</button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      typeFilter === t
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "text-slate-400 border-slate-200 hover:border-indigo-300"
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            {/* 목록 */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-10">검색 결과 없음</div>
              ) : (
                filtered.map(c => (
                  <CaseItem key={c.id} c={c} selected={selectedId === c.id}
                    onClick={() => { setSelectedId(c.id); setActiveTab("overview"); }} />
                ))
              )}
            </div>
          </div>

          {/* 우측 상세 */}
          <div className="flex-1 flex flex-col bg-white min-w-0">
            {selected ? (
              <>
                {/* 상세 헤더 */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <TypeBadge type={selected.type} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selected.status === "진행중"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>{selected.status}</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 leading-snug">{selected.title}</h2>
                    {selected.caseNumber && selected.caseNumber !== "—" && (
                      <div className="text-xs text-slate-400 mt-0.5">{selected.court} · {selected.caseNumber}</div>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditCase(selected); setShowForm(true); }}
                    className="btn-ghost text-xs flex-shrink-0">수정</button>
                </div>
                {/* 탭 */}
                <div className="flex border-b border-slate-100 px-6">
                  {[["overview", "개요"], ["todos", "할 일"], ["documents", "문서"]].map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === key
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}>{label}</button>
                  ))}
                </div>
                {/* 탭 콘텐츠 */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {activeTab === "overview"
                    ? <OverviewTab c={selected} onEdit={() => { setEditCase(selected); setShowForm(true); }} />
                    : activeTab === "todos"
                    ? <TodosTab c={selected} onUpdate={saveCase} />
                    : <DocumentsTab c={selected} onUpdate={saveCase} />
                  }
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
                좌측에서 사건을 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 모달 */}
      {showAI && <AiParseModal cases={cases} onClose={() => setShowAI(false)} onApply={applyAI} />}
      {showForm && (
        <CaseFormModal
          initial={editCase}
          onSave={saveCase}
          onClose={() => { setShowForm(false); setEditCase(null); }}
        />
      )}
    </>
  );
}
