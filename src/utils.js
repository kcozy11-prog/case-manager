// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────
export const today = new Date();
today.setHours(0, 0, 0, 0);

export const localDateStr = (d) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, "0"),
  String(d.getDate()).padStart(2, "0"),
].join("-");

export const addDays = (d, n) => {
  const r = new Date(d); r.setDate(r.getDate() + n);
  return localDateStr(r);
};

export const todayStr = localDateStr(today);

export const dday = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
};

export const fmtDate = (s) => s ? s.replace(/-/g, ".") : "—";
export const fmtMoney = (n) => n ? Number(n).toLocaleString() + "원" : "—";

// ── 상수 ──────────────────────────────────────────────────────────────────────
export const TYPES = ["전체", "민사", "형사(고소)", "형사(피의)", "형사(재판)", "자문"];
export const STATUSES = ["전체", "진행중", "종결"];

export const TYPE_STYLE = {
  "민사":       { dot: "#6366F1", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "형사(고소)": { dot: "#F59E0B", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  "형사(피의)": { dot: "#EF4444", badge: "bg-red-50 text-red-700 border-red-200" },
  "형사(재판)": { dot: "#8B5CF6", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  "자문":       { dot: "#10B981", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const MEMO_CATEGORIES = ["의뢰인요청", "기일메모", "공식결과메모", "일반메모"];

export const MEMO_CAT_STYLE = {
  "의뢰인요청":   "bg-blue-50 text-blue-600 border-blue-200",
  "기일메모":     "bg-amber-50 text-amber-600 border-amber-200",
  "공식결과메모": "bg-emerald-50 text-emerald-600 border-emerald-200",
  "일반메모":     "bg-slate-100 text-slate-600 border-slate-200",
};

export const emptyCase = () => ({
  id: `c${Date.now()}`, title: "", type: "민사", status: "진행중",
  client: "", clientContact: "",
  opponent: "",
  manager: "", managerOrg: "", managerContact: "",
  court: "", caseNumber: "",
  retainer: { amount: "", date: "", successFee: "", successFeeAmount: "" },
  hearings: [], timeline: [], memos: [], documents: [], todos: [],
});

// ── 샘플 데이터 ───────────────────────────────────────────────────────────────
export const SAMPLE_CASES = [
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
    memos: [
      { id: 101, category: "의뢰인요청", title: "계약서 원본 요청", content: "계약서 원본 추가 수령 필요.", date: "2026-02-18" },
      { id: 102, category: "공식결과메모", title: "답변서 검토", content: "피고 답변서 검토 완료.", date: "2026-02-20" },
    ],
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
    memos: [
      { id: 201, category: "의뢰인요청", title: "금융거래내역", content: "금융거래내역 확보 필요. 피해금액 5천만원.", date: "2026-02-15" },
    ],
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
    memos: [
      { id: 301, category: "기일메모", title: "진술서 작성 예정", content: "피고인 진술서 추가 작성 예정. 증인 신청 여부 검토 중.", date: "2026-01-15" },
    ],
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
    memos: [
      { id: 401, category: "공식결과메모", title: "자문 완료", content: "계약서 최종본 클라이언트 전달 완료.", date: "2025-10-05" },
    ],
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
    memos: [
      { id: 501, category: "일반메모", title: "블랙박스 분석", content: "블랙박스 영상 분석 결과 유리한 정황 있음. 합의 가능성 타진 중.", date: "2026-03-05" },
    ],
    documents: [],
    todos: [
      { id: 1, text: "블랙박스 영상 분석 의견서 작성", done: false, priority: "높음", dueDate: "" },
      { id: 2, text: "피해자 측 합의 의향 확인", done: false, priority: "보통", dueDate: "" },
    ],
  },
];
