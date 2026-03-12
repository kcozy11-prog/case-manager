import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// ── 비밀번호 설정 (여기서 변경하세요) ──────────────────────────────
const APP_PASSWORD = "lawfirm2024";
const SESSION_KEY  = "cm_auth_ok";

// ── Anthropic API 키: localStorage에서 런타임에 로드 (코드에 키 없음) ──
// 설정 방법: 앱 실행 후 ⚙ 설정 → API 키 입력란에 sk-ant-... 입력
let ANTHROPIC_API_KEY = "";
try { ANTHROPIC_API_KEY = localStorage.getItem("cm_api_key") || ""; } catch(e) {}

// ── Google Apps Script Web App URL (Sheets 저장용) ───────────────────
// 설정 방법: apps_script_server.js를 script.google.com에 배포 후 URL 입력
// AI 파싱은 위 API 키로 직접 처리하므로 Apps Script에는 AI 코드 불필요
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxWeBed5ZQ59NDblTJAHWqrGGGbpsev6bMGs5c0CoP4F8liAvlVa3yWlt4Cnj1SIGOSuA/exec";

// ── 날짜 유틸 ────────────────────────────────────────────────────────
const today        = new Date(); today.setHours(0,0,0,0);
const localDateStr = (d) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const addDays      = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return localDateStr(r); };
const todayStr     = localDateStr(today);
const dday         = (s) => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return Math.ceil((d-today)/86400000); };
const fmtDate      = (s) => s ? s.replace(/-/g,".") : "—";
const fmtMoney     = (n) => n ? Number(n).toLocaleString()+"원" : "—";

// ── 상수 ─────────────────────────────────────────────────────────────
const TYPES    = ["전체","민사","형사(고소)","형사(피의)","형사(재판)","행정","가사","강제집행","자문"];
const STATUSES = ["전체","진행중","종결"];
const TYPE_STYLE = {
  "민사":      {dot:"#6366F1",badge:"bg-indigo-50 text-indigo-700 border-indigo-200"},
  "형사(고소)": {dot:"#F59E0B",badge:"bg-amber-50 text-amber-700 border-amber-200"},
  "형사(피의)": {dot:"#EF4444",badge:"bg-red-50 text-red-700 border-red-200"},
  "형사(재판)": {dot:"#8B5CF6",badge:"bg-violet-50 text-violet-700 border-violet-200"},
  "행정":      {dot:"#14B8A6",badge:"bg-teal-50 text-teal-700 border-teal-200"},
  "가사":      {dot:"#EC4899",badge:"bg-pink-50 text-pink-700 border-pink-200"},
  "강제집행":   {dot:"#F97316",badge:"bg-orange-50 text-orange-700 border-orange-200"},
  "자문":      {dot:"#10B981",badge:"bg-emerald-50 text-emerald-700 border-emerald-200"},
};
// ── 수정3: MEMO_TYPES에서 "재판결발언" 제거 ──────────────────────────
const MEMO_TYPES = ["공식결과","의뢰인요청","기일진행","기일후요청","기타"];
const MEMO_STYLE = {
  "공식결과":   {badge:"bg-slate-100 text-slate-700 border-slate-300",  dot:"#647488"},
  "의뢰인요청": {badge:"bg-blue-50 text-blue-700 border-blue-200",      dot:"#3B82F6"},
  "기일진행":   {badge:"bg-violet-50 text-violet-700 border-violet-200",dot:"#8B5CF6"},
  "기일후요청": {badge:"bg-emerald-50 text-emerald-700 border-emerald-200",dot:"#10B981"},
  "기타":      {badge:"bg-slate-50 text-slate-500 border-slate-200",   dot:"#94A3B8"},
};
const DEADLINE_TYPES = [
  {label:"항소",days:14,base:"선고일"},
  {label:"상고",days:14,base:"항소심 선고일"},
  {label:"즉시항고",days:7,base:"결정/명령 고지일"},
  {label:"이의신청",days:14,base:"기준일"},
  {label:"재항고",days:7,base:"항고심 결정일"},
  {label:"특별항고",days:14,base:"결정 고지일"},
  {label:"집행이의",days:7,base:"집행일"},
  {label:"직접입력",days:0,base:""},
];

// ── 기일 유형 목록 ───────────────────────────────────────────────────
const HEARING_TYPES = ["변론기일","변론준비기일","공판기일","공판준비기일","선고기일","심문기일","조정기일","피의자조사동행","고소인진술","기타"];

// ── 초기 샘플 데이터 ─────────────────────────────────────────────────
const INITIAL_CASES = [
  {
    id:"c1", title:"아파트 분양대금 반환 청구", type:"민사", status:"진행중",
    client:"김민준", clientContact:"010-1234-5678", clientEmail:"", clientAddr:"서울시 강남구",
    clientNote:"",
    opponent:"㈜한강건설", opponentCounsel:"법무법인 대한 / 이대한 변호사",
    court:"서울중앙지방법원", caseNumber:"2026가합12345",
    tribunal:{name:"민사 3부", judge:"박서준", panel:"박서준·최유나·이도현", contact:"02-530-1715", clerk:"김서기"},
    manager:"", managerOrg:"", managerContact:"",
    retainer:{amount:3000000,date:"2026-01-15",successFee:"승소금액의 10%",successFeeAmount:""},
    hearings:[
      {id:1,date:addDays(today,5),  type:"변론기일",  result:""},
      {id:2,date:addDays(today,-30),type:"첫 변론기일",result:"변론 종결 교환 완료"},
    ],
    memos:[
      {id:1,type:"공식결과",   date:"2026-02-10",content:"수임 및 고소장 작성 착수.",createdAt:"2026-02-10T09:00:00Z"},
      {id:2,type:"공식결과",   date:"2026-02-25",content:"고소장 접수 완료.",createdAt:"2026-02-25T10:00:00Z"},
      {id:3,type:"의뢰인요청", date:"2026-02-10",content:"[의뢰인 회의]\n• 확인 전달사항: 피고인 주소 5회\n• 기타: 확인 필요",createdAt:"2026-02-10T10:00:00Z"},
    ],
    deadlines:[],
    documents:[{id:1,title:"고소장",date:"2026-02-25",url:"https://drive.google.com/file/d/sample3",note:""}],
    todos:[
      {id:1,text:"금융거래내역서 획부",       done:false,priority:"높음",dueDate:""},
      {id:2,text:"포화 걸어서 작성 (의뢰인 서명)",done:true, priority:"높음",dueDate:""},
    ],
  },
  {
    id:"c2", title:"사기 고소 — 투자금 편취", type:"형사(고소)", status:"진행중",
    client:"이수진", clientContact:"010-9876-5432", clientEmail:"", clientAddr:"서울시 서초구",
    clientNote:"",
    opponent:"김철수", opponentCounsel:"",
    court:"서울중앙지방검찰청", caseNumber:"2026형제99001",
    tribunal:{name:"형사 3부", judge:"", panel:"", contact:"02-530-4300", clerk:"박주임"},
    manager:"최형사", managerOrg:"서울중앙지방검찰청", managerContact:"",
    retainer:{amount:5000000,date:"2026-02-01",successFee:"기소 시 200만원 추가",successFeeAmount:""},
    hearings:[
      {id:1,date:addDays(today,12),type:"피의자 조사 동행",result:""},
      {id:2,date:addDays(today,-10),type:"고소인 진술",result:"진술 완료"},
    ],
    memos:[
      {id:1,type:"공식결과",date:"2026-02-01",content:"고소장 접수.",createdAt:"2026-02-01T09:00:00Z"},
    ],
    deadlines:[],
    documents:[],
    todos:[
      {id:1,text:"수사기록 열람 신청",done:false,priority:"높음",dueDate:""},
    ],
  },
  {
    id:"c4", title:"강제집행정지 신청 — 강진원", type:"강제집행", status:"진행중",
    client:"강진원", clientContact:"", clientEmail:"", clientAddr:"",
    clientNote:"신청인",
    opponent:"김도후", opponentCounsel:"",
    court:"서울북부지방법원", caseNumber:"2024카정10176",
    tribunal:{name:"", judge:"", panel:"", contact:"", clerk:""},
    manager:"", managerOrg:"", managerContact:"",
    retainer:{amount:"",date:"2024-11-28",successFee:"",successFeeAmount:""},
    hearings:[],
    memos:[
      {id:1,type:"공식결과",date:"2024-11-28",content:"신청서, 위임장 제출",createdAt:"2024-11-28T09:00:00Z"},
      {id:2,type:"공식결과",date:"2024-12-09",content:"담보제공명령 마감 (4,000만원 현금, 4,000만원 보험증권)",createdAt:"2024-12-09T09:00:00Z"},
      {id:3,type:"공식결과",date:"2024-12-09",content:"담보제공허가신청서 제출",createdAt:"2024-12-09T10:00:00Z"},
      {id:4,type:"공식결과",date:"2024-12-09",content:"담보물변경결정(증권 8,000만원)",createdAt:"2024-12-09T11:00:00Z"},
      {id:5,type:"공식결과",date:"2024-12-12",content:"담보변경허가신청서 제출",createdAt:"2024-12-12T09:00:00Z"},
      {id:6,type:"공식결과",date:"2024-12-13",content:"결정",createdAt:"2024-12-13T09:00:00Z"},
    ],
    deadlines:[],
    documents:[],
    todos:[],
  },
  {
    id:"c5", title:"구상금 청구 (항소심) — 엠에스종합건설", type:"민사", status:"진행중",
    client:"(유)엠에스종합건설", clientContact:"", clientEmail:"", clientAddr:"",
    clientNote:"피고",
    opponent:"삼성화재해상보험㈜", opponentCounsel:"",
    court:"서울중앙지방법원", caseNumber:"2024나56872",
    tribunal:{name:"항소 5-1민사부", judge:"", panel:"", contact:"", clerk:""},
    manager:"", managerOrg:"", managerContact:"",
    retainer:{amount:"",date:"2024-11-28",successFee:"",successFeeAmount:""},
    hearings:[
      {id:1,date:"2025-04-09",type:"선고기일",result:"1별관 312호 14:00"},
    ],
    memos:[
      {id:1,type:"공식결과",date:"2024-11-28",content:"신청서, 위임장 제출",createdAt:"2024-11-28T09:00:00Z"},
      {id:2,type:"공식결과",date:"2024-12-09",content:"담보제공명령 마감 (4,000만원 현금, 4,000만원 보험증권)",createdAt:"2024-12-09T09:00:00Z"},
      {id:3,type:"공식결과",date:"2024-12-09",content:"담보제공허가신청서 제출",createdAt:"2024-12-09T10:00:00Z"},
      {id:4,type:"공식결과",date:"2024-12-09",content:"담보물변경결정(증권 8,000만원)",createdAt:"2024-12-09T11:00:00Z"},
      {id:5,type:"공식결과",date:"2024-12-12",content:"담보변경허가신청서 제출",createdAt:"2024-12-12T09:00:00Z"},
      {id:6,type:"공식결과",date:"2024-12-13",content:"결정",createdAt:"2024-12-13T09:00:00Z"},
    ],
    deadlines:[],
    documents:[],
    todos:[],
  },
  {
    id:"c3", title:"업무상 횡령 형사 자문", type:"형사(자문)", status:"진행중",
    client:"최영호", clientContact:"010-5555-7777", clientEmail:"", clientAddr:"서울시 송파구",
    clientNote:"",
    opponent:"검사", opponentCounsel:"",
    court:"서울동부지방법원", caseNumber:"2026고합321",
    tribunal:{name:"형사 22부", judge:"이재원", panel:"이재원·김민지·박진호", contact:"02-530-2200", clerk:""},
    manager:"홍길동", managerOrg:"법무법인 여유", managerContact:"02-555-0001",
    retainer:{amount:8000000,date:"2025-11-01",successFee:"무죄/집행유예 시 5,000,000원",successFeeAmount:""},
    hearings:[
      {id:1,date:addDays(today,3), type:"공판기일",   result:""},
      {id:2,date:addDays(today,-15),type:"공판준비기일",result:"공판 목록 교환 완료"},
    ],
    memos:[
      {id:1,type:"공식결과",  date:"2025-11-01",content:"수임.",createdAt:"2025-11-01T09:00:00Z"},
      {id:2,type:"공식결과",  date:"2025-12-05",content:"공소장 수령 및 검토 완료.",createdAt:"2025-12-05T10:00:00Z"},
      {id:3,type:"기일진행",  date:addDays(today,-15),content:"[기일 진행]\n변론요지:\n\n상대방 주장:\n\n재판장 관심사안:\n",createdAt:"2025-12-10T09:00:00Z"},
      {id:4,type:"기일후요청",date:addDays(today,-15),content:"[기일 후 의뢰인 대화]\n• 요청 결과: 충분히 설명",createdAt:"2025-12-10T11:00:00Z"},
    ],
    deadlines:[],
    documents:[
      {id:1,title:"공소장",       date:"2025-12-05",url:"https://drive.google.com/file/d/sample4",note:""},
      {id:2,title:"변호인 의견서",date:"2026-01-08",url:"https://drive.google.com/file/d/sample5",note:""},
    ],
    todos:[
      {id:1,text:"피고인 진술서 작성",   done:false,priority:"높음",dueDate:""},
      {id:2,text:"증인 신청 여부 결정",  done:false,priority:"높음",dueDate:""},
      {id:3,text:"증거목록 정리",        done:true, priority:"보통",dueDate:""},
    ],
  },
];

// ── LockScreen ───────────────────────────────────────────────────────
function LockScreen({ onUnlock }) {
  const [pw, setPw]       = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const tryUnlock = () => {
    if (pw === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setPw("");
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{background:"#0F172A",height:"100dvh"}} className="flex items-center justify-center p-4">
      <div className={`bg-slate-800 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-slate-700 ${shake?'animate-shake':''}`}
           style={shake?{animation:"shake 0.4s ease"}:{}}>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
        <div className="flex flex-col items-center gap-5">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold">사건 관리</h1>
            <p className="text-slate-400 text-sm mt-1">법무법인 이신</p>
          </div>
          <input
            type="password"
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-center tracking-widest"
            placeholder="••••••••"
            value={pw}
            onChange={e=>{setPw(e.target.value);setError(false);}}
            onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
            autoFocus
          />
          {error && <div className="text-red-400 text-sm text-center">비밀번호가 틀렸습니다.</div>}
          <button
            onClick={tryUnlock}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            입력
          </button>
          <div className="text-slate-600 text-xs">법무법인 이신 · 내부 전용</div>
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
        {action}
      </div>
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Field 컴포넌트 ───────────────────────────────────────────────────
function Field({ label, value, edit, onChange, type="text", wide=false }) {
  return (
    <div className={`px-4 py-3 border-b border-slate-700/50 last:border-0 ${wide?"col-span-2":""}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {edit
        ? <input type={type} value={value||""} onChange={e=>onChange(e.target.value)}
                 className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"/>
        : <div className="text-slate-200 text-sm">{value||"—"}</div>
      }
    </div>
  );
}

// ── OverviewTab ──────────────────────────────────────────────────────
function OverviewTab({ c, editing, onUpdate }) {
  const [addingDL, setAddingDL] = useState(false);
  const [newDL, setNewDL]       = useState({label:"항소",note:"",baseDate:"",dueDate:""});
  // ── 수정1: 기일 추가 상태 ────────────────────────────────────────
  const [addingHearing, setAddingHearing] = useState(false);
  const [newHearing, setNewHearing]       = useState({date:todayStr, type:"변론기일", result:""});

  const handleDLType = (label) => {
    const t = DEADLINE_TYPES.find(d=>d.label===label);
    setNewDL(p => ({...p, label, dueDate: t&&t.days&&p.baseDate ? addDays(new Date(p.baseDate), t.days) : p.dueDate}));
  };
  const handleBase = (base) => {
    const t = DEADLINE_TYPES.find(d=>d.label===newDL.label);
    setNewDL(p => ({...p, baseDate:base, dueDate: t&&t.days&&base ? addDays(new Date(base), t.days) : p.dueDate}));
  };
  const addDL = () => {
    if (!newDL.dueDate) return;
    onUpdate({...c, deadlines:[...c.deadlines,{id:Date.now(),...newDL}]});
    setNewDL({label:"항소",note:"",baseDate:"",dueDate:""});
    setAddingDL(false);
  };

  // ── 기일 추가 핸들러 ─────────────────────────────────────────────
  const addHearing = () => {
    if (!newHearing.date) return;
    onUpdate({...c, hearings:[...c.hearings,{id:Date.now(),...newHearing}]});
    setNewHearing({date:todayStr, type:"변론기일", result:""});
    setAddingHearing(false);
  };

  return (
    <div>
      <Section title="의뢰인">
        <div className="grid grid-cols-2">
          <Field label="의뢰인" value={c.client} edit={editing} onChange={v=>onUpdate({...c,client:v})}/>
          <Field label="연락처" value={c.clientContact} edit={editing} onChange={v=>onUpdate({...c,clientContact:v})}/>
          <Field label="이메일" value={c.clientEmail} edit={editing} onChange={v=>onUpdate({...c,clientEmail:v})}/>
          <Field label="주소"   value={c.clientAddr}   edit={editing} onChange={v=>onUpdate({...c,clientAddr:v})}/>
          <Field label="상대방" value={c.opponent}     edit={editing} onChange={v=>onUpdate({...c,opponent:v})}/>
          <Field label="상대방 대리인" value={c.opponentCounsel} edit={editing} onChange={v=>onUpdate({...c,opponentCounsel:v})}/>
        </div>
      </Section>

      <Section title="재판부 · 사건">
        <div className="grid grid-cols-2">
          <Field label="법원"        value={c.court}               edit={editing} onChange={v=>onUpdate({...c,court:v})}/>
          <Field label="사건번호"     value={c.caseNumber}          edit={editing} onChange={v=>onUpdate({...c,caseNumber:v})}/>
          <Field label="재판부"       value={c.tribunal?.name}      edit={editing} onChange={v=>onUpdate({...c,tribunal:{...c.tribunal,name:v}})}/>
          <Field label="담당 판사"    value={c.tribunal?.judge}     edit={editing} onChange={v=>onUpdate({...c,tribunal:{...c.tribunal,judge:v}})}/>
          <Field label="재판부 구성"  value={c.tribunal?.panel}     edit={editing} onChange={v=>onUpdate({...c,tribunal:{...c.tribunal,panel:v}})}/>
          <Field label="연락처"       value={c.tribunal?.contact}   edit={editing} onChange={v=>onUpdate({...c,tribunal:{...c.tribunal,contact:v}})}/>
        </div>
      </Section>

      <Section title="선임약정">
        <div className="grid grid-cols-3">
          <Field label="착수금"  value={editing?c.retainer?.amount:fmtMoney(c.retainer?.amount)} type="number"
                 edit={editing} onChange={v=>onUpdate({...c,retainer:{...c.retainer,amount:v}})}/>
          <Field label="수임일"  value={c.retainer?.date}       type="date"
                 edit={editing} onChange={v=>onUpdate({...c,retainer:{...c.retainer,date:v}})}/>
          <Field label="성공보수" value={c.retainer?.successFee}
                 edit={editing} onChange={v=>onUpdate({...c,retainer:{...c.retainer,successFee:v}})}/>
        </div>
      </Section>

      <Section
        title="⚠ 불변기간"
        action={<button onClick={()=>setAddingDL(true)} className="text-xs text-orange-400 hover:text-orange-300">+ 추가</button>}
      >
        {c.deadlines.length===0 && !addingDL
          ? <div className="px-4 py-3 text-sm text-slate-500 italic">등록된 불변기간이 없습니다.</div>
          : c.deadlines.map(d => {
              const n = dday(d.dueDate);
              const urgent  = n!==null && n<=7 && n>=0;
              const expired = n!==null && n<0;
              return (
                <div key={d.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`text-xl font-bold tabular-nums w-16 ${urgent?"text-red-600":expired?"text-slate-400":"text-orange-400"}`}>
                      {n===null?"—":n<0?`D+${Math.abs(n)}`:n===0?"D-day":`D-${n}`}
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${urgent?"text-red-700":expired?"text-slate-500":""}`}>
                        {d.label}
                        {urgent&&<span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded ml-2">긴급</span>}
                      </div>
                      <div className="text-xs text-slate-400">기산일 {fmtDate(d.baseDate)} → 기한 {fmtDate(d.dueDate)}</div>
                      {d.note&&<div className="text-xs text-slate-500 mt-0.5">{d.note}</div>}
                    </div>
                  </div>
                  <button onClick={()=>onUpdate({...c,deadlines:c.deadlines.filter(x=>x.id!==d.id)})}
                          className="text-slate-600 hover:text-red-400 text-xs">✕</button>
                </div>
              );
            })
        }
        {addingDL && (
          <div className="border border-orange-200 rounded-xl p-3 bg-orange-50 space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <select className="input-sm" value={newDL.label} onChange={e=>handleDLType(e.target.value)}>
                {DEADLINE_TYPES.map(d=><option key={d.label}>{d.label}</option>)}
              </select>
              <input className="input-sm" placeholder="메모 (선택)" value={newDL.note} onChange={e=>setNewDL(p=>({...p,note:e.target.value}))}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-xs text-slate-500 mb-1">기산일 (충당일 등)</div><input type="date" className="input-sm w-full" value={newDL.baseDate} onChange={e=>handleBase(e.target.value)}/></div>
              <div><div className="text-xs text-slate-500 mb-1">기한 (자동계산)</div><input type="date" className="input-sm w-full" value={newDL.dueDate} onChange={e=>setNewDL(p=>({...p,dueDate:e.target.value}))}/></div>
            </div>
            <div className="text-xs text-orange-600">{DEADLINE_TYPES.find(d=>d.label===newDL.label)?.base ? `기산일 기준: ${DEADLINE_TYPES.find(d=>d.label===newDL.label).base}` : ""}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setAddingDL(false)} className="btn-ghost text-xs">취소</button>
              <button onClick={addDL} className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-lg">저장</button>
            </div>
          </div>
        )}
      </Section>

      {/* ── 수정1: 기일 섹션 + 기일 추가 버튼/폼 ── */}
      <Section
        title="기일"
        action={<button onClick={()=>setAddingHearing(true)} className="text-xs text-indigo-400 hover:text-indigo-300">+ 기일 추가</button>}
      >
        {addingHearing && (
          <div className="border border-indigo-700 rounded-xl p-3 bg-slate-900 space-y-2 m-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-slate-400 mb-1">날짜</div>
                <input type="date" className="input-sm w-full" value={newHearing.date}
                       onChange={e=>setNewHearing(p=>({...p,date:e.target.value}))}/>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">기일 유형</div>
                <select className="input-sm w-full" value={newHearing.type}
                        onChange={e=>setNewHearing(p=>({...p,type:e.target.value}))}>
                  {HEARING_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">결과 (선택)</div>
              <input className="input-sm w-full" placeholder="기일 결과 또는 메모"
                     value={newHearing.result}
                     onChange={e=>setNewHearing(p=>({...p,result:e.target.value}))}/>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setAddingHearing(false)} className="btn-ghost text-xs">취소</button>
              <button onClick={addHearing} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg">저장</button>
            </div>
          </div>
        )}
        {c.hearings.length===0 && !addingHearing
          ? <div className="px-4 py-3 text-sm text-slate-500 italic">등록된 기일이 없습니다.</div>
          : c.hearings.map(h=><HearingRow key={h.id} h={h} c={c} onUpdate={onUpdate} editing={editing}/>)
        }
      </Section>
    </div>
  );
}

// ── HearingRow ───────────────────────────────────────────────────────
function HearingRow({ h, c, onUpdate, editing }) {
  const n = dday(h.date);
  const upcoming = n!==null && n>=0;
  return (
    <div className={`px-4 py-3 border-b border-slate-700/50 last:border-0 ${upcoming?"bg-indigo-950/30":""}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${upcoming?"text-indigo-300":"text-slate-400"}`}>{h.type}</span>
            {upcoming && <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">{n===0?"오늘":`D-${n}`}</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{fmtDate(h.date)}</div>
          {h.result && <div className="text-xs text-slate-300 mt-1">결과: {h.result}</div>}
        </div>
        {editing && (
          <button onClick={()=>onUpdate({...c,hearings:c.hearings.filter(x=>x.id!==h.id)})}
                  className="text-slate-600 hover:text-red-400 text-xs">✕</button>
        )}
      </div>
    </div>
  );
}

// ── MemosTab ─────────────────────────────────────────────────────────
function MemosTab({ c, onUpdate }) {
  const [adding, setAdding]       = useState(false);
  const [newType, setNewType]     = useState("공식결과");
  const [newDate, setNewDate]     = useState(todayStr);
  const [newContent, setNewContent] = useState("");
  const [editId, setEditId]       = useState(null);
  const [editContent, setEditContent] = useState("");
  const [sheetsStatus, setSheetsStatus] = useState("");
  // ── 수정4: 메모 종류별 필터 ─────────────────────────────────────
  const [memoFilter, setMemoFilter] = useState("전체");

  // ── 수정1(메모): 기일진행 선택 시 기본 템플릿 삽입 ──────────────
  const handleTypeChange = (type) => {
    setNewType(type);
    if (type === "기일진행" && !newContent.trim()) {
      setNewContent("변론요지:\n\n상대방 주장:\n\n재판장 관심사안:\n");
    }
  };

  const addMemo = () => {
    if (!newContent.trim()) return;
    const m = {id:Date.now(),type:newType,date:newDate,content:newContent.trim(),createdAt:new Date().toISOString()};
    onUpdate({...c,memos:[m,...c.memos]});
    setNewContent(""); setAdding(false);
  };

  const saveEdit = (id) => {
    onUpdate({...c,memos:c.memos.map(m=>m.id===id?{...m,content:editContent}:m)});
    setEditId(null);
  };

  const syncToSheets = async () => {
    if (!APPS_SCRIPT_URL) {
      setSheetsStatus("⚠ Apps Script URL이 설정되지 않았습니다.");
      setTimeout(()=>setSheetsStatus(""),4000);
      return;
    }
    setSheetsStatus("동기화 중...");
    try {
      setSheetsStatus("✓ 동기화 완료");
      setTimeout(()=>setSheetsStatus(""),3000);
    } catch(e) {
      setSheetsStatus("✗ 오류: "+e.message);
      setTimeout(()=>setSheetsStatus(""),5000);
    }
  };

  // ── 필터 적용 ─────────────────────────────────────────────────
  const filteredMemos = memoFilter === "전체" ? c.memos : c.memos.filter(m=>m.type===memoFilter);

  return (
    <div>
      {sheetsStatus && <div className="mb-2 text-xs text-center text-slate-400">{sheetsStatus}</div>}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">{c.memos.length}건</span>
        <div className="flex gap-2">
          <button onClick={syncToSheets} className="text-xs text-teal-400 hover:text-teal-300 border border-teal-700 px-2 py-1 rounded-lg">
            ↑ Sheets 저장
          </button>
          <button onClick={()=>{setAdding(true);setNewContent("");setNewType("공식결과");}} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700 px-2 py-1 rounded-lg">
            + 메모 추가
          </button>
        </div>
      </div>

      {/* ── 수정4: 메모 종류별 필터 버튼 ── */}
      <div className="flex flex-wrap gap-1 mb-3">
        {["전체", ...MEMO_TYPES].map(t => (
          <button key={t} onClick={()=>setMemoFilter(t)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${memoFilter===t?"bg-indigo-600 border-indigo-500 text-white":"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
            {t}
            {t!=="전체" && <span className="ml-1 opacity-60">{c.memos.filter(m=>m.type===t).length}</span>}
          </button>
        ))}
      </div>

      {adding && (
        <div className="bg-slate-800 border border-indigo-700 rounded-xl p-3 mb-3">
          <div className="flex flex-wrap gap-1 mb-2">
            {MEMO_TYPES.map(t=>(
              <button key={t} onClick={()=>handleTypeChange(t)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${newType===t?"bg-indigo-600 border-indigo-500 text-white":"border-slate-600 text-slate-400 hover:border-slate-500"}`}>
                {t}
              </button>
            ))}
          </div>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                 className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm mb-2 focus:outline-none focus:border-indigo-500"/>
          <textarea value={newContent} onChange={e=>setNewContent(e.target.value)}
                    placeholder="메모 내용..."
                    rows={5}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 resize-none"/>
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={()=>setAdding(false)} className="text-xs text-slate-400 hover:text-slate-300 px-3 py-1">취소</button>
            <button onClick={addMemo} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg">저장</button>
          </div>
        </div>
      )}

      {filteredMemos.map(m=>{
        const st = MEMO_STYLE[m.type]||MEMO_STYLE["기타"];
        return (
          <div key={m.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 mb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${st.badge}`}>{m.type}</span>
                <span className="text-xs text-slate-500">{fmtDate(m.date)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>{setEditId(m.id);setEditContent(m.content);}} className="text-xs text-slate-500 hover:text-slate-300">편집</button>
                <button onClick={()=>onUpdate({...c,memos:c.memos.filter(x=>x.id!==m.id)})} className="text-xs text-slate-500 hover:text-red-400">삭제</button>
              </div>
            </div>
            {editId===m.id
              ? <>
                  <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} rows={5}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none resize-none"/>
                  <div className="flex gap-2 justify-end mt-1">
                    <button onClick={()=>setEditId(null)} className="text-xs text-slate-400">취소</button>
                    <button onClick={()=>saveEdit(m.id)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg">저장</button>
                  </div>
                </>
              : <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans">{m.content}</pre>
            }
          </div>
        );
      })}
      {filteredMemos.length===0&&!adding&&<div className="text-sm text-slate-500 italic py-4 text-center">{memoFilter==="전체"?"메모가 없습니다.":`'${memoFilter}' 메모가 없습니다.`}</div>}
    </div>
  );
}

// ── TodosTab ─────────────────────────────────────────────────────────
function TodosTab({ c, onUpdate }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("보통");
  const [dueDate, setDueDate]   = useState("");

  const toggle = (id) => onUpdate({...c,todos:c.todos.map(t=>t.id===id?{...t,done:!t.done}:t)});
  const del    = (id) => onUpdate({...c,todos:c.todos.filter(t=>t.id!==id)});
  const add    = () => {
    if(!text.trim()) return;
    onUpdate({...c,todos:[...c.todos,{id:Date.now(),text:text.trim(),done:false,priority,dueDate}]});
    setText(""); setDueDate("");
  };

  const TodoRow = ({t}) => {
    const n = dday(t.dueDate);
    const urgent  = n!==null && n<=3 && n>=0;
    const expired = n!==null && n<0;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-700/50 last:border-0 ${t.done?"opacity-40":""}`}>
        <button onClick={()=>toggle(t.id)}
                className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${t.done?"bg-emerald-600 border-emerald-600":"border-slate-500 hover:border-indigo-500"}`}>
          {t.done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-200">{t.text}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${t.priority==="높음"?"bg-red-900/50 text-red-400":t.priority==="낮음"?"bg-slate-700 text-slate-500":"bg-slate-700 text-slate-400"}`}>{t.priority}</span>
            {t.dueDate && <span className={`text-xs ${urgent?"text-red-400":expired?"text-slate-500 line-through":"text-slate-400"}`}>
              {fmtDate(t.dueDate)}{n!==null&&!expired?` (D-${n})`:""}
            </span>}
          </div>
        </div>
        <button onClick={()=>del(t.id)} className="text-slate-600 hover:text-red-400 text-xs flex-shrink-0">✕</button>
      </div>
    );
  };

  const pending  = c.todos.filter(t=>!t.done);
  const done     = c.todos.filter(t=>t.done);

  return (
    <div>
      <div className="bg-slate-800 border border-indigo-700 rounded-xl p-3 mb-3">
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
               placeholder="새 할 일..." className="w-full bg-transparent text-slate-100 text-sm focus:outline-none mb-2"/>
        <div className="flex items-center gap-2 flex-wrap">
          {["높음","보통","낮음"].map(p=>(
            <button key={p} onClick={()=>setPriority(p)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${priority===p?"bg-indigo-600 border-indigo-500 text-white":"border-slate-600 text-slate-400"}`}>
              {p}
            </button>
          ))}
          <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
                 className="ml-auto bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-slate-300 text-xs focus:outline-none"/>
          <button onClick={add} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg">추가</button>
        </div>
      </div>
      {pending.length>0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-2">
          {pending.map(t=><TodoRow key={t.id} t={t}/>)}
        </div>
      )}
      {done.length>0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden opacity-60">
          {done.map(t=><TodoRow key={t.id} t={t}/>)}
        </div>
      )}
      {c.todos.length===0 && <div className="text-sm text-slate-500 italic py-4 text-center">할 일이 없습니다.</div>}
    </div>
  );
}

// ── DocumentsTab ─────────────────────────────────────────────────────
function DocumentsTab({ c, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newDoc, setNewDoc] = useState({title:"",date:todayStr,url:"",note:""});

  const addDoc = () => {
    if(!newDoc.title.trim()) return;
    onUpdate({...c,documents:[...c.documents,{id:Date.now(),...newDoc}]});
    setNewDoc({title:"",date:todayStr,url:"",note:""});
    setAdding(false);
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={()=>setAdding(true)} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700 px-2 py-1 rounded-lg">+ 문서 추가</button>
      </div>
      {adding && (
        <div className="bg-slate-800 border border-indigo-700 rounded-xl p-3 mb-3 space-y-2">
          <input placeholder="문서명" value={newDoc.title} onChange={e=>setNewDoc(p=>({...p,title:e.target.value}))}
                 className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm focus:outline-none"/>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={newDoc.date} onChange={e=>setNewDoc(p=>({...p,date:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm focus:outline-none"/>
            <input placeholder="Google Drive URL" value={newDoc.url} onChange={e=>setNewDoc(p=>({...p,url:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm focus:outline-none"/>
          </div>
          <input placeholder="메모" value={newDoc.note} onChange={e=>setNewDoc(p=>({...p,note:e.target.value}))}
                 className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-100 text-sm focus:outline-none"/>
          <div className="flex gap-2 justify-end">
            <button onClick={()=>setAdding(false)} className="text-xs text-slate-400 px-3 py-1">취소</button>
            <button onClick={addDoc} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg">저장</button>
          </div>
        </div>
      )}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {c.documents.length===0
          ? <div className="px-4 py-6 text-sm text-slate-500 italic text-center">문서가 없습니다.</div>
          : c.documents.map(d=>(
              <div key={d.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 last:border-0">
                <div>
                  <div className="text-sm text-slate-200">{d.url?<a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 underline">{d.title}</a>:d.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{fmtDate(d.date)}{d.note&&` · ${d.note}`}</div>
                </div>
                <button onClick={()=>onUpdate({...c,documents:c.documents.filter(x=>x.id!==d.id)})} className="text-slate-600 hover:text-red-400 text-xs">✕</button>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── AI 파싱 Modal (신규등록 + 기존사건 업데이트) ─────────────────────
function AIModal({ onClose, onResult, onBulkResult, onUpdateResult, existingCases }) {
  const [text, setText]             = useState("");
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");
  const [parsedList, setParsedList] = useState([]);
  const [step, setStep]             = useState("input"); // "input" | "preview"
  const [progress, setProgress]     = useState("");

  // ── 프롬프트 ────────────────────────────────────────────────────
  const PROMPT_BULK = (txt) => `아래 텍스트에서 법률 사건 정보를 추출해줘. 사건이 여러 개일 수도 있어.
엑셀 표, 목록, 자유형식 등 어떤 형태든 최대한 파싱해.

텍스트:
${txt}

JSON 배열만 출력 (설명·마크다운 없이):
[
  {
    "title": "사건명 (없으면 의뢰인+사건유형으로 생성)",
    "type": "민사|형사(고소)|형사(피의)|형사(재판)|행정|가사|강제집행|자문",
    "court": "법원명",
    "caseNumber": "사건번호 (있으면 반드시 포함)",
    "client": "의뢰인 이름",
    "clientContact": "연락처",
    "opponent": "상대방 이름",
    "opponentCounsel": "상대방 대리인",
    "judge": "담당 판사",
    "panel": "재판부명",
    "retainerAmount": 0,
    "retainerDate": "YYYY-MM-DD 또는 빈 문자열",
    "successFee": "성공보수 조건",
    "manager": "담당자 이름",
    "managerOrg": "담당자 소속",
    "managerContact": "담당자 연락처",
    "newHearings": [{"date":"YYYY-MM-DD","type":"기일유형","result":"결과(없으면 빈 문자열)"}],
    "newDocuments": [{"title":"서면명","date":"YYYY-MM-DD","note":"비고"}],
    "memoContent": "진행경과·특이사항 (있는 경우, 없으면 빈 문자열)"
  }
]`;

  // ── API 호출 ────────────────────────────────────────────────────
  const callAPI = async (prompt, maxTokens=4000) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "";
  };

  // ── 기존 사건 매칭: 사건번호 > 의뢰인명 순으로 시도 ──────────────
  const matchExisting = (parsed) => {
    if (!existingCases?.length) return null;
    if (parsed.caseNumber) {
      const m = existingCases.find(c => c.caseNumber && c.caseNumber.trim() === parsed.caseNumber.trim());
      if (m) return m;
    }
    if (parsed.client) {
      const m = existingCases.find(c => c.client && c.client.trim() === parsed.client.trim());
      if (m) return m;
    }
    return null;
  };

  // ── 파싱 결과 정규화 ─────────────────────────────────────────────
  const normalize = (parsed, idx) => {
    const c = {...parsed};
    // retainer 통합
    if (c.retainerAmount || c.retainerDate || c.successFee) {
      c.retainer = { amount: c.retainerAmount||"", date: c.retainerDate||"", successFee: c.successFee||"", successFeeAmount:"" };
      delete c.retainerAmount; delete c.retainerDate; delete c.successFee;
    }
    // 기존 사건 매칭 여부
    const matched = matchExisting(c);
    // 업데이트 항목 계산 (변경된 필드만)
    const updates = {};
    if (matched) {
      if (c.court      && c.court      !== matched.court)      updates.court      = c.court;
      if (c.opponent   && c.opponent   !== matched.opponent)   updates.opponent   = c.opponent;
      if (c.opponentCounsel && c.opponentCounsel !== matched.opponentCounsel) updates.opponentCounsel = c.opponentCounsel;
      if (c.judge      && c.judge      !== matched.tribunal?.judge)  updates.judge      = c.judge;
      if (c.panel      && c.panel      !== matched.tribunal?.name)   updates.panel      = c.panel;
      if (c.manager    && c.manager    !== matched.manager)    updates.manager    = c.manager;
      if (c.managerOrg && c.managerOrg !== matched.managerOrg) updates.managerOrg = c.managerOrg;
      if (c.managerContact && c.managerContact !== matched.managerContact) updates.managerContact = c.managerContact;
      if (c.retainer?.amount && String(c.retainer.amount) !== String(matched.retainer?.amount)) updates.retainerAmount = c.retainer.amount;
    }
    return {
      ...c,
      _key: idx,
      _checked: true,
      _matchedCase: matched || null,  // null이면 신규
      _updates: updates,              // 기존 사건 변경 필드
      _newHearings:  (c.newHearings  || []).filter(h=>h.date),
      _newDocuments: (c.newDocuments || []).filter(d=>d.title),
      _memoContent:  c.memoContent || "",
    };
  };

  // ── 파싱 실행 ─────────────────────────────────────────────────
  const run = async () => {
    if (!text.trim()) return;
    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "여기에_API_키_입력") {
      setErr("API 키가 설정되지 않았습니다."); return;
    }
    setLoading(true); setErr(""); setProgress("AI 분석 중...");
    try {
      const raw = await callAPI(PROMPT_BULK(text));
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (!arrMatch) throw new Error("파싱 결과를 찾지 못했습니다.");
      const arr = JSON.parse(arrMatch[0]);
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("파싱된 사건이 없습니다.");
      setParsedList(arr.map((c,i) => normalize(c, i)));
      setStep("preview");
    } catch(e) { setErr("오류: " + e.message); }
    setLoading(false); setProgress("");
  };

  const toggleCheck = (key) => setParsedList(p => p.map(c => c._key===key ? {...c,_checked:!c._checked} : c));
  const toggleAll   = (v)   => setParsedList(p => p.map(c => ({...c,_checked:v})));
  const updateField = (key, field, val) => setParsedList(p => p.map(c => c._key===key ? {...c,[field]:val} : c));

  // ── 적용 ─────────────────────────────────────────────────────
  const applySelected = () => {
    const selected = parsedList.filter(c => c._checked);
    if (!selected.length) return;

    const toCreate = [];
    const toUpdate = [];

    selected.forEach(c => {
      const { _key, _checked, _matchedCase, _updates, _newHearings, _newDocuments, _memoContent, newHearings, newDocuments, memoContent, judge, panel, ...caseData } = c;

      if (_matchedCase) {
        // ── 기존 사건 업데이트 ──────────────────────────────────
        let updated = {..._matchedCase};
        // 기본정보 변경
        if (_updates.court)           updated.court = _updates.court;
        if (_updates.opponent)        updated.opponent = _updates.opponent;
        if (_updates.opponentCounsel) updated.opponentCounsel = _updates.opponentCounsel;
        if (_updates.judge || _updates.panel) {
          updated.tribunal = {...(updated.tribunal||{}),
            judge: _updates.judge || updated.tribunal?.judge || "",
            name:  _updates.panel || updated.tribunal?.name  || "",
          };
        }
        // 담당자
        if (_updates.manager)        updated.manager        = _updates.manager;
        if (_updates.managerOrg)     updated.managerOrg     = _updates.managerOrg;
        if (_updates.managerContact) updated.managerContact = _updates.managerContact;
        // 착수금
        if (_updates.retainerAmount) updated.retainer = {...(updated.retainer||{}), amount: _updates.retainerAmount};
        // 새 기일 추가
        if (_newHearings.length) {
          const newH = _newHearings.map(h => ({id:Date.now()+Math.random()*1000|0, ...h}));
          updated.hearings = [...(updated.hearings||[]), ...newH];
        }
        // 상대방 제출서면 → 문서 탭에 추가
        if (_newDocuments.length) {
          const newD = _newDocuments.map(d => ({id:Date.now()+Math.random()*1000|0, url:"", ...d}));
          updated.documents = [...(updated.documents||[]), ...newD];
        }
        // 메모 추가
        if (_memoContent.trim()) {
          updated.memos = [{id:Date.now()+Math.random()*1000|0, type:"공식결과", date:todayStr, content:_memoContent.trim(), createdAt:new Date().toISOString()}, ...(updated.memos||[])];
        }
        toUpdate.push(updated);
      } else {
        // ── 신규 사건 등록 ──────────────────────────────────────
        const memos = _memoContent.trim()
          ? [{id:Date.now()+Math.random()*1000|0, type:"공식결과", date:todayStr, content:_memoContent.trim(), createdAt:new Date().toISOString()}]
          : [];
        const hearings = _newHearings.map(h => ({id:Date.now()+Math.random()*1000|0, ...h}));
        const documents = _newDocuments.map(d => ({id:Date.now()+Math.random()*1000|0, url:"", ...d}));
        toCreate.push({
          id: "c"+Date.now()+Math.random().toString(36).slice(2,6),
          status: "진행중",
          clientEmail:"", clientAddr:"", clientNote:"",
          opponentCounsel: caseData.opponentCounsel||"",
          tribunal:{name: panel||"", judge: judge||"", panel:"", contact:"", clerk:""},
          manager: caseData.manager||"", managerOrg: caseData.managerOrg||"", managerContact: caseData.managerContact||"",
          retainer: caseData.retainer || {amount:"",date:todayStr,successFee:"",successFeeAmount:""},
          deadlines:[], todos:[],
          hearings, documents, memos,
          ...caseData,
        });
      }
    });

    onUpdateResult({ toCreate, toUpdate });
    onClose();
  };

  // ── 입력 화면 ────────────────────────────────────────────────────
  if (step === "input") return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-5 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold">✨ AI 파싱</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <p className="text-xs text-slate-400 mb-1">
          텍스트를 붙여넣으면 AI가 <span className="text-violet-400 font-semibold">신규 사건 등록</span> 또는 <span className="text-amber-400 font-semibold">기존 사건 업데이트</span>를 자동으로 구분합니다.
        </p>
        <div className="flex gap-3 text-xs text-slate-500 mb-3">
          <span>• 새 기일 일정</span>
          <span>• 재판부·상대방 변경</span>
          <span>• 담당자 변경</span>
          <span>• 상대방 제출서면</span>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={10}
                  placeholder={"[신규 사건 예시]\n강진원 vs 김도후, 서울북부지방법원 2024카정10176, 강제집행정지\n\n[기존 사건 업데이트 예시]\n2024나56872 구상금\n다음 기일: 2025-04-09 선고기일, 1별관 312호\n상대방 제출서면: 2025-03-10 준비서면\n재판장: 김민수 부장판사"}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 resize-none font-mono"/>
        {err && <div className="text-red-400 text-xs mt-2">{err}</div>}
        {progress && <div className="text-violet-400 text-xs mt-2 animate-pulse">{progress}</div>}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
          <button onClick={run} disabled={loading}
                  className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl">
            {loading ? "분석 중..." : "✨ 파싱하기"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── 미리보기 화면 ────────────────────────────────────────────────
  const checkedCount = parsedList.filter(c=>c._checked).length;
  const newCount     = parsedList.filter(c=>c._checked && !c._matchedCase).length;
  const updateCount  = parsedList.filter(c=>c._checked && c._matchedCase).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-5 w-full max-w-3xl flex flex-col" style={{maxHeight:"90vh"}}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold">✨ 파싱 결과 — {parsedList.length}건</h2>
            <div className="flex gap-3 mt-0.5">
              {newCount>0    && <span className="text-xs text-indigo-400">신규 {newCount}건</span>}
              {updateCount>0 && <span className="text-xs text-amber-400">업데이트 {updateCount}건</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 flex-shrink-0 ml-4">✕</button>
        </div>

        {/* 전체 선택 */}
        <div className="flex items-center gap-3 mb-2 flex-shrink-0">
          <button onClick={()=>toggleAll(true)}  className="text-xs text-indigo-400 hover:text-indigo-300">전체 선택</button>
          <button onClick={()=>toggleAll(false)} className="text-xs text-slate-500 hover:text-slate-300">전체 해제</button>
          <span className="text-xs text-slate-500 ml-auto">{checkedCount}/{parsedList.length}건 선택됨</span>
        </div>

        {/* 카드 목록 */}
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          {parsedList.map((c) => {
            const isUpdate = !!c._matchedCase;
            const borderColor = isUpdate ? "border-amber-600" : "border-indigo-600";
            const bgColor     = isUpdate ? "bg-amber-950/20"  : "bg-indigo-950/20";
            const tagStyle    = isUpdate
              ? "bg-amber-900/50 text-amber-400 border-amber-700"
              : "bg-indigo-900/50 text-indigo-400 border-indigo-700";
            const hasChanges = isUpdate && Object.keys(c._updates).length > 0;

            return (
              <div key={c._key}
                   className={`border rounded-xl p-3 transition-colors ${c._checked ? `${borderColor} ${bgColor}` : "border-slate-700 bg-slate-800/50 opacity-40"}`}>
                <div className="flex items-start gap-3">
                  {/* 체크박스 */}
                  <button onClick={()=>toggleCheck(c._key)}
                          className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${c._checked?(isUpdate?"bg-amber-600 border-amber-500":"bg-indigo-600 border-indigo-500"):"border-slate-500"}`}>
                    {c._checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* 태그 + 매칭 사건명 */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded border ${tagStyle}`}>
                        {isUpdate ? "업데이트" : "신규 등록"}
                      </span>
                      {isUpdate && (
                        <span className="text-xs text-slate-400">→ {c._matchedCase.title}</span>
                      )}
                    </div>

                    {/* 기본 정보 (신규만 편집 가능) */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                      <EditableField label="사건명"   value={c.title}       onChange={v=>updateField(c._key,"title",v)}       readonly={isUpdate}/>
                      <EditableField label="사건번호" value={c.caseNumber}  onChange={v=>updateField(c._key,"caseNumber",v)}  readonly={isUpdate}/>
                      <EditableField label="의뢰인"   value={c.client}      onChange={v=>updateField(c._key,"client",v)}      readonly={isUpdate}/>
                      <EditableField label="상대방"   value={c.opponent}    onChange={v=>updateField(c._key,"opponent",v)}    readonly={isUpdate}/>
                      {!isUpdate && <>
                        <EditableField label="법원"     value={c.court}     onChange={v=>updateField(c._key,"court",v)}/>
                        <EditableField label="사건유형" value={c.type}      onChange={v=>updateField(c._key,"type",v)}/>
                      </>}
                    </div>

                    {/* 업데이트 항목 요약 */}
                    {isUpdate && (
                      <div className="space-y-1">
                        {hasChanges && (
                          <div className="text-xs bg-amber-900/30 border border-amber-800/50 rounded px-2 py-1.5">
                            <div className="text-amber-400 font-semibold mb-1">기본정보 변경</div>
                            {Object.entries(c._updates).map(([k,v]) => {
                              const labels = {court:"법원",opponent:"상대방",opponentCounsel:"상대방 대리인",judge:"담당 판사",panel:"재판부",manager:"담당자",managerOrg:"담당자 소속",managerContact:"담당자 연락처",retainerAmount:"착수금"};
                              return <div key={k} className="text-xs text-slate-300">• {labels[k]||k}: <span className="text-amber-300">{v}</span></div>;
                            })}
                          </div>
                        )}
                        {c._newHearings.length > 0 && (
                          <div className="text-xs bg-indigo-900/30 border border-indigo-800/50 rounded px-2 py-1.5">
                            <div className="text-indigo-400 font-semibold mb-1">새 기일 {c._newHearings.length}건</div>
                            {c._newHearings.map((h,i) => (
                              <div key={i} className="text-xs text-slate-300">• {h.date} {h.type} {h.result&&`(${h.result})`}</div>
                            ))}
                          </div>
                        )}
                        {c._newDocuments.length > 0 && (
                          <div className="text-xs bg-teal-900/30 border border-teal-800/50 rounded px-2 py-1.5">
                            <div className="text-teal-400 font-semibold mb-1">서면 {c._newDocuments.length}건</div>
                            {c._newDocuments.map((d,i) => (
                              <div key={i} className="text-xs text-slate-300">• {d.date} {d.title} {d.note&&`(${d.note})`}</div>
                            ))}
                          </div>
                        )}
                        {c._memoContent && (
                          <div className="text-xs bg-slate-700/50 border border-slate-600/50 rounded px-2 py-1.5">
                            <div className="text-slate-400 font-semibold mb-0.5">메모 추가</div>
                            <div className="text-slate-300 truncate">{c._memoContent.substring(0,80)}{c._memoContent.length>80?"…":""}</div>
                          </div>
                        )}
                        {!hasChanges && !c._newHearings.length && !c._newDocuments.length && !c._memoContent && (
                          <div className="text-xs text-slate-500 italic">변경사항이 감지되지 않았습니다.</div>
                        )}
                      </div>
                    )}

                    {/* 신규: 기일/메모 미리보기 */}
                    {!isUpdate && (
                      <div className="space-y-1">
                        {c._newHearings.length > 0 && (
                          <div className="text-xs text-slate-400 bg-slate-700/40 rounded px-2 py-1">
                            기일: {c._newHearings.map(h=>`${h.date} ${h.type}`).join(" / ")}
                          </div>
                        )}
                        {c._newDocuments.length > 0 && (
                          <div className="text-xs text-slate-400 bg-slate-700/40 rounded px-2 py-1">
                            서면: {c._newDocuments.map(d=>d.title).join(", ")}
                          </div>
                        )}
                        {c._memoContent && (
                          <div className="text-xs text-slate-400 bg-slate-700/40 rounded px-2 py-1 truncate">
                            메모: {c._memoContent.substring(0,60)}{c._memoContent.length>60?"…":""}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 justify-between mt-3 flex-shrink-0 pt-2 border-t border-slate-700">
          <button onClick={()=>setStep("input")} className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2">← 다시 입력</button>
          <button onClick={applySelected} disabled={checkedCount===0}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl font-semibold">
            {newCount>0&&updateCount>0 ? `신규 ${newCount} + 업데이트 ${updateCount}건 적용`
              : newCount>0 ? `${newCount}건 신규 등록`
              : `${updateCount}건 업데이트 적용`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditableField (AI 파싱 미리보기용 인라인 편집) ───────────────────
function EditableField({ label, value, onChange, readonly=false }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      {readonly
        ? <div className="text-xs text-slate-300 py-0.5 truncate">{value||"—"}</div>
        : <input value={value||""} onChange={e=>onChange(e.target.value)}
                 className="w-full bg-transparent border-b border-slate-600 text-slate-200 text-xs py-0.5 focus:outline-none focus:border-indigo-400"/>
      }
    </div>
  );
}

// ── 설정 Modal ───────────────────────────────────────────────────────
function SettingsModal({ onClose, onSave, currentUrl, currentApiKey }) {
  const [url, setUrl]         = useState(currentUrl || "");
  const [apiKey, setApiKeyLocal] = useState(currentApiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved]     = useState(false);

  const apiKeySet = apiKey && apiKey.startsWith("sk-ant-");

  const handleSave = () => {
    onSave(url, apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">⚙ 설정</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div className="space-y-4">
          {/* API 키 입력 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-300 font-semibold">Anthropic API 키</div>
              <span className={`text-xs ${apiKeySet ? "text-emerald-400" : "text-amber-400"}`}>
                {apiKeySet ? "✓ 설정됨" : "미설정"}
              </span>
            </div>
            <div className="text-xs text-slate-500 mb-2">
              코드에 저장되지 않고 이 기기의 브라우저에만 보관됩니다. GitHub에 노출되지 않습니다.
            </div>
            <div className="relative">
              <input
                value={apiKey}
                onChange={e=>setApiKeyLocal(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="sk-ant-api03-..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 pr-16 font-mono"
              />
              <button onClick={()=>setShowKey(v=>!v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200">
                {showKey ? "숨기기" : "보기"}
              </button>
            </div>
            {apiKey && !apiKeySet && (
              <div className="text-xs text-red-400 mt-1">sk-ant- 로 시작하는 키를 입력하세요</div>
            )}
          </div>

          {/* Sheets URL */}
          <div>
            <div className="text-xs text-slate-400 mb-1 font-semibold">Google Sheets 연동 URL (선택)</div>
            <div className="text-xs text-slate-500 mb-2">
              입력하면 수정사항이 자동으로 Google Sheets에 저장됩니다.<br/>
              <span className="text-indigo-400">설정: </span>apps_script_server.js를 script.google.com에 배포 후 URL 복사
            </div>
            <input value={url} onChange={e=>setUrl(e.target.value)}
                   placeholder="https://script.google.com/macros/s/.../exec"
                   className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"/>
          </div>

          {/* 상태 요약 */}
          <div className="bg-slate-700/50 rounded-xl p-3 text-xs text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">현재 상태</div>
            <div>• AI 파싱: {apiKeySet ? "✓ 준비됨 (Anthropic API)" : "✗ API 키 입력 필요"}</div>
            <div>• 로컬 저장: ✓ 브라우저 localStorage (새로고침 후 유지)</div>
            <div>• Sheets 공유: {url ? "✓ 설정됨" : "△ 미설정 (로컬만)"}</div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
          <button onClick={handleSave}
                  className={`text-xs px-4 py-2 rounded-xl transition-colors ${saved ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>
            {saved ? "✓ 저장됨" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 새 사건 폼 ───────────────────────────────────────────────────────
function NewCaseModal({ onClose, onCreate, prefill }) {
  const [form, setForm] = useState({
    title: prefill?.title||"",
    type:  prefill?.type||"민사",
    court: prefill?.court||"",
    caseNumber: prefill?.caseNumber||"",
    client: prefill?.client||"",
    clientContact: prefill?.clientContact||"",
    opponent: prefill?.opponent||"",
    summary: prefill?.summary||"",
  });

  const submit = () => {
    if(!form.title.trim()) return;
    const newCase = {
      id: "c"+Date.now(),
      ...form,
      status:"진행중",
      clientEmail:"", clientAddr:"", clientNote:"",
      opponentCounsel:"",
      tribunal:{name:"",judge:"",panel:"",contact:"",clerk:""},
      manager:"", managerOrg:"", managerContact:"",
      retainer:{amount:"",date:todayStr,successFee:"",successFeeAmount:""},
      hearings:[], memos:[], deadlines:[], documents:[], todos:[],
    };
    onCreate(newCase);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">새 사건 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="space-y-3">
          <input placeholder="사건명 *" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}
                 className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"/>
          <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500">
            {TYPES.slice(1).map(t=><option key={t}>{t}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="의뢰인" value={form.client} onChange={e=>setForm(p=>({...p,client:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none"/>
            <input placeholder="연락처" value={form.clientContact} onChange={e=>setForm(p=>({...p,clientContact:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none"/>
            <input placeholder="법원" value={form.court} onChange={e=>setForm(p=>({...p,court:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none"/>
            <input placeholder="사건번호" value={form.caseNumber} onChange={e=>setForm(p=>({...p,caseNumber:e.target.value}))}
                   className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none"/>
          </div>
          <input placeholder="상대방" value={form.opponent} onChange={e=>setForm(p=>({...p,opponent:e.target.value}))}
                 className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none"/>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
          <button onClick={submit} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl">등록</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 App ─────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(!!sessionStorage.getItem(SESSION_KEY));

  const loadCases = () => {
    try {
      const saved = localStorage.getItem("cm_cases_v2");
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return INITIAL_CASES;
  };

  const [cases, setCasesRaw]   = useState(loadCases);
  const [appsScriptUrl, setAppsScriptUrl] = useState(() => localStorage.getItem("cm_apps_script_url") || APPS_SCRIPT_URL);
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem("cm_api_key") || ""; } catch(e) { return ""; } });

  // API 키가 바뀌면 모듈 스코프 변수도 동기화
  useEffect(() => { ANTHROPIC_API_KEY = apiKey; }, [apiKey]);

  const saveApiKey = (key) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    ANTHROPIC_API_KEY = trimmed;
    try { localStorage.setItem("cm_api_key", trimmed); } catch(e) {}
  };

  const setCases = useCallback((newCases) => {
    setCasesRaw(newCases);
    try { localStorage.setItem("cm_cases_v2", JSON.stringify(newCases)); } catch(e) {}
  }, []);

  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState("개요");
  const [editing, setEditing]     = useState(false);
  const [filterStatus, setFilterStatus] = useState("전체");
  const [filterType,   setFilterType]   = useState("전체");
  const [search, setSearch]       = useState("");
  const [showAI, setShowAI]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewCase, setShowNewCase]   = useState(false);
  const [aiPrefill, setAiPrefill] = useState(null);
  const [syncStatus, setSyncStatus] = useState("");

  const saveSettings = (url, key) => {
    setAppsScriptUrl(url);
    try { localStorage.setItem("cm_apps_script_url", url); } catch(e) {}
    saveApiKey(key);
    setShowSettings(false);
  };

  const loadFromSheets = useCallback(async () => {
    const url = appsScriptUrl || APPS_SCRIPT_URL;
    if (!url) return;
    setSyncStatus("loading");
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && data.cases?.length > 0) {
        const loaded = data.cases.map(c => c.data || c);
        setCases(loaded);
        setSyncStatus("ok");
        setTimeout(() => setSyncStatus(""), 3000);
      } else {
        setSyncStatus("");
      }
    } catch(e) {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(""), 5000);
    }
  }, [appsScriptUrl, setCases]);

  const saveToSheets = useCallback(async (casesToSave) => {
    const url = appsScriptUrl || APPS_SCRIPT_URL;
    if (!url) return;
    setSyncStatus("loading");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "save_cases", cases: casesToSave })
      });
      const data = await res.json();
      if (data.ok) {
        setSyncStatus("ok");
        setTimeout(() => setSyncStatus(""), 3000);
      } else {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus(""), 5000);
      }
    } catch(e) {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(""), 5000);
    }
  }, [appsScriptUrl]);

  useEffect(() => {
    if (unlocked && (appsScriptUrl || APPS_SCRIPT_URL)) {
      loadFromSheets();
    }
  }, [unlocked]); // eslint-disable-line

  const updateCase = useCallback((updated) => {
    const next = cases.map(c => c.id===updated.id ? updated : c);
    setCases(next);
    if (selected?.id===updated.id) setSelected(updated);
    saveToSheets(next);
  }, [cases, selected, setCases, saveToSheets]);

  const createCase = (newCase) => {
    const next = [newCase, ...cases];
    setCases(next);
    setSelected(newCase);
    setTab("개요");
    setEditing(true);
    saveToSheets(next);
  };

  const deleteCase = (id) => {
    const next = cases.filter(c => c.id!==id);
    setCases(next);
    if (selected?.id===id) setSelected(null);
    saveToSheets(next);
  };

  // ── 필터 ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return cases.filter(c => {
      if (filterStatus!=="전체" && c.status!==filterStatus) return false;
      if (filterType!=="전체" && c.type!==filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.title.toLowerCase().includes(q) || c.client?.toLowerCase().includes(q) || c.caseNumber?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [cases, filterStatus, filterType, search]);

  // ── 대시보드 통계 ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = cases.filter(c=>c.status==="진행중");
    const upcoming7 = active.filter(c => c.hearings.some(h=>{const n=dday(h.date);return n!==null&&n>=0&&n<=7;}));
    const urgentDL  = active.filter(c => c.deadlines.some(d=>{const n=dday(d.dueDate);return n!==null&&n>=0&&n<=7;}));
    const pendingTodos = active.reduce((sum,c)=>sum+c.todos.filter(t=>!t.done).length,0);
    return { active: active.length, upcoming7: upcoming7.length, urgentDL: urgentDL.length, pendingTodos };
  }, [cases]);

  // ── 수정2: 대시보드 클릭 필터 핸들러 ────────────────────────────
  const handleStatClick = (statType) => {
    setSelected(null);
    if (statType === "active") {
      setFilterStatus("진행중");
      setFilterType("전체");
      setSearch("");
    } else if (statType === "upcoming7") {
      setFilterStatus("진행중");
      setFilterType("전체");
      setSearch("__upcoming7__");
    } else if (statType === "urgentDL") {
      setFilterStatus("진행중");
      setFilterType("전체");
      setSearch("__urgentDL__");
    } else if (statType === "pendingTodos") {
      setFilterStatus("진행중");
      setFilterType("전체");
      setSearch("__pendingTodos__");
    }
  };

  // ── 수정2: 특수 필터 처리 ────────────────────────────────────────
  const filteredWithSpecial = useMemo(() => {
    if (search === "__upcoming7__") {
      return cases.filter(c => c.status==="진행중" && c.hearings.some(h=>{const n=dday(h.date);return n!==null&&n>=0&&n<=7;}));
    }
    if (search === "__urgentDL__") {
      return cases.filter(c => c.status==="진행중" && c.deadlines.some(d=>{const n=dday(d.dueDate);return n!==null&&n>=0&&n<=7;}));
    }
    if (search === "__pendingTodos__") {
      return cases.filter(c => c.status==="진행중" && c.todos.some(t=>!t.done));
    }
    return filtered;
  }, [filtered, cases, search]);

  // ── 수정2: 특수 필터 활성 여부 ──────────────────────────────────
  const specialFilterLabel = search==="__upcoming7__" ? "7일 내 기일" : search==="__urgentDL__" ? "불변기간 임박" : search==="__pendingTodos__" ? "미완료 할 일" : null;

  // ── CaseItem ──────────────────────────────────────────────────────
  const CaseItem = useCallback(({ c }) => {
    const st  = TYPE_STYLE[c.type] || TYPE_STYLE["민사"];
    const nextH = c.hearings.filter(h=>dday(h.date)!==null&&dday(h.date)>=0).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const n   = nextH ? dday(nextH.date) : null;
    const urgDL = c.deadlines.filter(d=>{const x=dday(d.dueDate);return x!==null&&x>=0&&x<=7;});
    const pending = c.todos.filter(t=>!t.done).length;
    return (
      <button
        onClick={()=>{setSelected(c);setTab("개요");setEditing(false);}}
        className={`w-full text-left px-4 py-3 border-b border-slate-700/50 last:border-0 hover:bg-slate-750 transition-colors ${selected?.id===c.id?"bg-indigo-950/40 border-l-2 border-l-indigo-500":""}`}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{background:st.dot}}/>
          <div className="flex-1 min-w-0">
            <div className="text-slate-200 text-sm font-medium truncate">{c.title}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${st.badge}`}>{c.type}</span>
              <span className="text-xs text-slate-500">{c.client}</span>
            </div>
            {(nextH||urgDL.length>0||pending>0) && (
              <div className="mt-1.5 space-y-0.5">
                {nextH && <div className="text-xs text-slate-400">다음 기일: {fmtDate(nextH.date)} {nextH.type} {n!==null&&<span className={`${n<=3?"text-red-400":"text-indigo-400"}`}>D-{n}</span>}</div>}
                {urgDL.length>0 && <div className="text-xs text-orange-400">⚠ 불변기간 {urgDL.length}건 임박</div>}
                {pending>0 && <div className="text-xs text-emerald-400">✓ 할 일 {pending}건</div>}
              </div>
            )}
          </div>
          {n!==null && n<=7 && <div className={`text-xs font-bold flex-shrink-0 ${n<=3?"text-red-400":"text-amber-400"}`}>D-{n}</div>}
        </div>
      </button>
    );
  }, [selected]);

  if (!unlocked) return <LockScreen onUnlock={()=>setUnlocked(true)}/>;

  const TAB_LABELS = ["개요","메모","할 일","문서"];

  return (
    <div style={{background:"#0F172A",minHeight:"100dvh",fontFamily:"'Pretendard','Noto Sans KR',sans-serif"}}>
      <style>{`
        .input-sm{background:#334155;border:1px solid #475569;border-radius:8px;padding:6px 10px;color:#e2e8f0;font-size:12px;}
        .input-sm:focus{outline:none;border-color:#6366f1;}
        .btn-ghost{color:#94a3b8;font-size:12px;padding:4px 8px;border-radius:8px;}
        .btn-ghost:hover{color:#e2e8f0;background:#334155;}
        * { box-sizing: border-box; }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
      `}</style>

      {/* 상단 헤더 */}
      <div style={{background:"#1E293B",borderBottom:"1px solid #334155"}} className="px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="text-white font-bold text-sm">사건 관리</span>
        </div>

        {/* 검색 */}
        <div className="flex-1 max-w-xs relative">
          <input value={specialFilterLabel ? "" : search}
                 onChange={e=>{setSearch(e.target.value);}}
                 placeholder={specialFilterLabel ? `필터: ${specialFilterLabel}` : "사건명, 의뢰인, 사건번호..."}
                 className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-400"/>
          {specialFilterLabel && (
            <button onClick={()=>setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs">✕</button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {syncStatus==="loading" && <span className="text-xs text-slate-400 animate-pulse">동기화 중...</span>}
          {syncStatus==="ok"      && <span className="text-xs text-emerald-400">✓ 저장됨</span>}
          {syncStatus==="error"   && <span className="text-xs text-red-400">✗ 저장 실패</span>}

          <button onClick={()=>setShowAI(true)} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 py-1.5 rounded-xl transition-colors">
            ✨ AI 파싱
          </button>
          <button onClick={loadFromSheets} title="Sheets에서 새로고침"
                  className="text-slate-400 hover:text-slate-200 text-sm p-1.5 rounded-lg hover:bg-slate-700">
            ↓
          </button>
          <button onClick={()=>setShowSettings(true)} className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-700">
            ⚙
          </button>
          <button onClick={()=>{setUnlocked(false);sessionStorage.removeItem(SESSION_KEY);}}
                  className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-700">
            🔒
          </button>
          <button onClick={()=>{setAiPrefill(null);setShowNewCase(true);}}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-xl transition-colors">
            + 새 사건
          </button>
        </div>
      </div>

      {/* ── 수정2: 대시보드 바 — 클릭 필터 ── */}
      <div style={{background:"#1E293B",borderBottom:"1px solid #334155"}} className="px-4 py-2 flex gap-6">
        {[
          {label:"진행 중 사건", val:stats.active,      color:"text-indigo-400", key:"active",       activeColor:"bg-indigo-900/40"},
          {label:"7일 내 기일",  val:stats.upcoming7,   color:"text-amber-400",  key:"upcoming7",    activeColor:"bg-amber-900/40"},
          {label:"불변기간 임박", val:stats.urgentDL,    color:"text-orange-400", key:"urgentDL",     activeColor:"bg-orange-900/40"},
          {label:"미완료 할 일", val:stats.pendingTodos, color:"text-emerald-400",key:"pendingTodos", activeColor:"bg-emerald-900/40"},
        ].map(s => {
          const isActive = (s.key==="active" && filterStatus==="진행중" && !specialFilterLabel) ||
                           (s.key==="upcoming7"    && search==="__upcoming7__") ||
                           (s.key==="urgentDL"     && search==="__urgentDL__") ||
                           (s.key==="pendingTodos" && search==="__pendingTodos__");
          return (
            <button key={s.label}
                    onClick={()=>handleStatClick(s.key)}
                    className={`text-center px-2 py-1 rounded-lg transition-colors hover:opacity-80 ${isActive?s.activeColor:""}`}>
              <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* 메인 레이아웃 */}
      <div className="flex h-[calc(100dvh-108px)]">

        {/* 사건 목록 사이드바 */}
        <div style={{width:"280px",borderRight:"1px solid #334155",overflowY:"auto"}} className="flex-shrink-0">
          {/* 필터 */}
          <div className="p-3 border-b border-slate-700/50 space-y-2">
            {specialFilterLabel && (
              <div className="flex items-center gap-1 text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-700/50 rounded-lg px-2 py-1">
                <span>필터: {specialFilterLabel}</span>
                <button onClick={()=>setSearch("")} className="ml-auto text-indigo-400 hover:text-white">✕</button>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {STATUSES.map(s=>(
                <button key={s} onClick={()=>{setFilterStatus(s);setSearch("");}}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus===s&&!specialFilterLabel?"bg-indigo-600 border-indigo-500 text-white":"border-slate-600 text-slate-400 hover:border-slate-400"}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPES.map(t=>(
                <button key={t} onClick={()=>setFilterType(t)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterType===t?"bg-slate-600 border-slate-500 text-white":"border-slate-700 text-slate-500 hover:border-slate-500"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* 사건 리스트 */}
          {filteredWithSpecial.length===0
            ? <div className="p-4 text-slate-500 text-sm italic text-center">조건에 맞는 사건이 없습니다.</div>
            : filteredWithSpecial.map(c=><CaseItem key={c.id} c={c}/>)
          }
        </div>

        {/* 상세 패널 */}
        {selected ? (
          <div className="flex-1 overflow-y-auto">
            {/* 상세 헤더 */}
            <div style={{background:"#1E293B",borderBottom:"1px solid #334155"}} className="px-5 py-3 flex items-start justify-between sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded border ${TYPE_STYLE[selected.type]?.badge||""}`}>{selected.type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${selected.status==="진행중"?"bg-emerald-900/50 text-emerald-400 border-emerald-700":"bg-slate-700 text-slate-400 border-slate-600"}`}>{selected.status}</span>
                </div>
                <h2 className="text-white font-bold text-base">{selected.title}</h2>
                <div className="text-slate-400 text-xs mt-0.5">{selected.court} · {selected.caseNumber}</div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button onClick={()=>window.print()} className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-700 text-sm">🖨</button>
                {editing
                  ? <button onClick={()=>setEditing(false)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl">완료</button>
                  : <button onClick={()=>setEditing(true)}  className="text-xs border border-slate-600 text-slate-300 hover:bg-slate-700 px-3 py-1.5 rounded-xl">수정</button>
                }
                <button onClick={()=>{if(confirm(`"${selected.title}" 사건을 삭제하시겠습니까?`)) deleteCase(selected.id);}}
                        className="text-xs border border-red-800 text-red-400 hover:bg-red-900/30 px-3 py-1.5 rounded-xl">삭제</button>
              </div>
            </div>

            {/* 탭 */}
            <div style={{borderBottom:"1px solid #334155"}} className="px-5 flex gap-1">
              {TAB_LABELS.map(t=>{
                const badge = t==="메모"?selected.memos.length:t==="할 일"?selected.todos.filter(x=>!x.done).length:t==="문서"?selected.documents.length:null;
                return (
                  <button key={t} onClick={()=>setTab(t)}
                          className={`px-3 py-2 text-sm border-b-2 transition-colors ${tab===t?"border-indigo-500 text-white font-semibold":"border-transparent text-slate-400 hover:text-slate-200"}`}>
                    {t} {badge>0&&<span className="ml-1 text-xs bg-slate-600 px-1.5 py-0.5 rounded-full">{badge}</span>}
                  </button>
                );
              })}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-5">
              {tab==="개요"  && <OverviewTab  c={selected} editing={editing} onUpdate={updateCase}/>}
              {tab==="메모"  && <MemosTab     c={selected} onUpdate={updateCase}/>}
              {tab==="할 일" && <TodosTab     c={selected} onUpdate={updateCase}/>}
              {tab==="문서"  && <DocumentsTab c={selected} onUpdate={updateCase}/>}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-600">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-sm">사건을 선택하거나 새 사건을 등록하세요.</div>
            </div>
          </div>
        )}
      </div>

      {/* 모달들 */}
      {showAI && (
        <AIModal
          onClose={()=>setShowAI(false)}
          existingCases={cases}
          onResult={(parsed)=>{
            setAiPrefill(parsed);
            setShowAI(false);
            setShowNewCase(true);
          }}
          onBulkResult={(newCases)=>{
            const next = [...newCases, ...cases];
            setCases(next); saveToSheets(next);
            setSelected(newCases[0]); setTab("개요");
          }}
          onUpdateResult={({ toCreate, toUpdate }) => {
            let next = toCreate.length ? [...toCreate, ...cases] : [...cases];
            toUpdate.forEach(updated => {
              next = next.map(c => c.id === updated.id ? updated : c);
            });
            setCases(next);
            saveToSheets(next);
            const focus = toUpdate[0] || toCreate[0];
            if (focus) { setSelected(focus); setTab("개요"); }
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={()=>setShowSettings(false)}
          onSave={saveSettings}
          currentUrl={appsScriptUrl}
          currentApiKey={apiKey}
        />
      )}
      {showNewCase && (
        <NewCaseModal
          onClose={()=>{setShowNewCase(false);setAiPrefill(null);}}
          onCreate={createCase}
          prefill={aiPrefill}
        />
      )}
    </div>
  );
}
