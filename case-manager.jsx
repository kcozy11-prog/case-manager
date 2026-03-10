import { useState, useMemo, useCallback, useRef } from "react";

// ── 날짜 유틸 ──────────────────────────────────────────────────────────────────
const today = new Date(); today.setHours(0,0,0,0);
const localDateStr = (d) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return localDateStr(r); };
const todayStr = localDateStr(today);
const dday = (s) => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return Math.ceil((d-today)/86400000); };
const fmtDate = (s) => s ? s.replace(/-/g,".") : "—";
const fmtMoney = (n) => n ? Number(n).toLocaleString()+"원" : "—";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const TYPES = ["전체","민사","형사(고소)","형사(피의)","형사(재판)","행정","가사","강제집행","자문"];
const STATUSES = ["전체","진행중","종결"];
const TYPE_STYLE = {
  "민사":       {dot:"#6366F1",badge:"bg-indigo-50 text-indigo-700 border-indigo-200"},
  "형사(고소)": {dot:"#F59E0B",badge:"bg-amber-50 text-amber-700 border-amber-200"},
  "형사(피의)": {dot:"#EF4444",badge:"bg-red-50 text-red-700 border-red-200"},
  "형사(재판)": {dot:"#8B5CF6",badge:"bg-violet-50 text-violet-700 border-violet-200"},
  "행정":       {dot:"#14B8A6",badge:"bg-teal-50 text-teal-700 border-teal-200"},
  "가사":       {dot:"#EC4899",badge:"bg-pink-50 text-pink-700 border-pink-200"},
  "강제집행":   {dot:"#F97316",badge:"bg-orange-50 text-orange-700 border-orange-200"},
  "자문":       {dot:"#10B981",badge:"bg-emerald-50 text-emerald-700 border-emerald-200"},
};
const MEMO_TYPES = ["공식경과","의뢰인회의","기일진행","재판장발언","기일후대화","자료요청","기타"];
const MEMO_STYLE = {
  "공식경과":   {badge:"bg-slate-100 text-slate-700 border-slate-300",  dot:"#64748B"},
  "의뢰인회의": {badge:"bg-blue-50 text-blue-700 border-blue-200",       dot:"#3B82F6"},
  "기일진행":   {badge:"bg-violet-50 text-violet-700 border-violet-200", dot:"#8B5CF6"},
  "재판장발언": {badge:"bg-red-50 text-red-700 border-red-200",          dot:"#EF4444"},
  "기일후대화": {badge:"bg-sky-50 text-sky-700 border-sky-200",          dot:"#0EA5E9"},
  "자료요청":   {badge:"bg-amber-50 text-amber-700 border-amber-200",    dot:"#F59E0B"},
  "기타":       {badge:"bg-gray-50 text-gray-600 border-gray-200",       dot:"#94A3B8"},
};
const DEADLINE_TYPES = [
  {label:"항소",     days:14, hint:"판결 송달일로부터 14일 (민사소송법 제396조)"},
  {label:"상고",     days:14, hint:"항소심 판결 송달일로부터 14일 (민사소송법 제425조)"},
  {label:"즉시항고", days:7,  hint:"재판 고지/송달일로부터 7일 (민사소송법 제444조)"},
  {label:"재항고",   days:7,  hint:"항고심 결정 고지일로부터 7일"},
  {label:"이의신청", days:7,  hint:"고지/송달일로부터 7일"},
  {label:"기타",     days:null, hint:"기한을 직접 입력하세요"},
];
const MEMO_TEMPLATES = {
  "기일진행":   "[기일 진행]\n• 출석: \n• 재판장 발언: \n• 우리측 진술: \n• 상대방 진술: \n• 결과: \n• 다음 기일: ",
  "재판장발언": "[재판장 발언]\n• 발언 내용: \n• 지시사항: \n• 제출 요청: ",
  "기일후대화": "[기일 후 의뢰인 대화]\n• 주요 질문: \n• 설명한 내용: \n• 의뢰인 요청사항: \n• 다음 연락 예정: ",
  "의뢰인회의": "[의뢰인 회의]\n• 의뢰인 전달사항: \n• 논의 내용: \n• 확인 필요사항: \n• 자료 수령 예정: ",
  "자료요청":   "[자료 요청]\n• 요청 자료: \n• 제출 기한: \n• 수령 방법: ",
};

const emptyCase = () => ({
  id:`c${Date.now()}`, title:"", type:"민사", status:"진행중",
  client:"", clientContact:"", clientEmail:"", clientAddr:"", clientNote:"",
  opponent:"", opponentCounsel:"",
  court:"", caseNumber:"",
  tribunal:{name:"",judge:"",panel:"",contact:"",clerk:""},
  manager:"", managerOrg:"", managerContact:"",
  retainer:{amount:"",date:"",successFee:"",successFeeAmount:""},
  hearings:[], memos:[], documents:[], todos:[], deadlines:[],
});

// ── 샘플 데이터 ────────────────────────────────────────────────────────────────
const SAMPLE_CASES = [
  {
    id:"c1", title:"아파트 분양대금 반환 청구", type:"민사", status:"진행중",
    client:"김민준", clientContact:"010-1234-5678", clientEmail:"kim@email.com",
    clientAddr:"서울시 강남구 테헤란로 123", clientNote:"평일 오후 선호. 연락 빠름.",
    opponent:"㈜한강건설", opponentCounsel:"법무법인 대한 / 이대한 변호사",
    court:"서울중앙지방법원", caseNumber:"2026가합12345",
    tribunal:{name:"민사합의 15부",judge:"박정호",panel:"박정호·이소연·최민준",contact:"02-530-1715",clerk:"김서기"},
    manager:"홍길동", managerOrg:"법무법인 여유", managerContact:"02-555-0001",
    retainer:{amount:3000000,date:"2026-01-15",successFee:"승소금액의 10%",successFeeAmount:""},
    hearings:[
      {id:1,date:addDays(today,5),   type:"변론기일",   result:""},
      {id:2,date:addDays(today,-30), type:"첫 변론기일",result:"준비서면 제출 명령"},
    ],
    memos:[
      {id:1,type:"공식경과",   date:"2026-01-15",content:"수임 계약 체결. 착수금 300만원 수령.",createdAt:"2026-01-15T10:00:00Z"},
      {id:2,type:"공식경과",   date:"2026-02-01",content:"소장 접수 완료.",createdAt:"2026-02-01T09:00:00Z"},
      {id:3,type:"의뢰인회의",date:"2026-01-15",content:"[의뢰인 회의]\n• 의뢰인 전달사항: 분양 계약 당시 설명과 실제 사양 상이 주장\n• 논의 내용: 계약서 검토 및 소송 전략\n• 확인 필요사항: 분양 당시 광고 자료\n• 자료 수령 예정: 계약서 원본",createdAt:"2026-01-15T11:00:00Z"},
      {id:4,type:"자료요청",   date:"2026-02-10",content:"[자료 요청]\n• 요청 자료: 계약서 원본(도장 있는 것)\n• 제출 기한: 2026-02-20\n• 수령 방법: 방문 지참",createdAt:"2026-02-10T10:00:00Z"},
      {id:5,type:"기일진행",   date:addDays(today,-30),content:"[기일 진행]\n• 출석: 원피고 대리인 모두 출석\n• 재판장 발언: 원고 측 청구원인 보완 필요\n• 우리측 진술: 분양 광고 허위 내용 특정\n• 상대방 진술: 계약서 내용 준수 주장\n• 결과: 준비서면 제출 명령\n• 다음 기일: 미정",createdAt:"2026-02-08T11:00:00Z"},
    ],
    deadlines:[{id:1,label:"항소",baseDate:"2026-05-01",dueDate:"2026-05-15",note:"1심 판결 대비"}],
    documents:[
      {id:1,title:"소장",        date:"2026-02-01",url:"https://drive.google.com/file/d/sample1",note:""},
      {id:2,title:"준비서면 1호",date:"2026-03-10",url:"https://drive.google.com/file/d/sample2",note:"1차 변론 제출용"},
    ],
    todos:[
      {id:1,text:"피고 답변서 반박 준비서면 작성",done:false,priority:"높음",dueDate:""},
      {id:2,text:"계약서 원본 수령",              done:false,priority:"보통",dueDate:""},
      {id:3,text:"원고 본인신문 사전 준비",        done:true, priority:"보통",dueDate:""},
    ],
  },
  {
    id:"c2", title:"사기 고소 — 투자금 편취", type:"형사(고소)", status:"진행중",
    client:"이수진", clientContact:"010-9876-5432", clientEmail:"", clientAddr:"서울시 서초구", clientNote:"",
    opponent:"박철수", opponentCounsel:"",
    court:"서울중앙지방검찰청", caseNumber:"2026형제56789",
    tribunal:{name:"형사6부",judge:"김담당 검사",panel:"",contact:"02-530-4400",clerk:""},
    manager:"홍길동", managerOrg:"법무법인 여유", managerContact:"02-555-0001",
    retainer:{amount:5000000,date:"2026-02-10",successFee:"기소 시 2,000,000원",successFeeAmount:2000000},
    hearings:[{id:1,date:addDays(today,12),type:"피의자 조사 동행",result:""}],
    memos:[
      {id:1,type:"공식경과",   date:"2026-02-10",content:"수임 및 고소장 작성 착수.",createdAt:"2026-02-10T09:00:00Z"},
      {id:2,type:"공식경과",   date:"2026-02-25",content:"고소장 접수 완료.",createdAt:"2026-02-25T10:00:00Z"},
      {id:3,type:"의뢰인회의",date:"2026-02-10",content:"[의뢰인 회의]\n• 의뢰인 전달사항: 피해금액 5천만원, 투자 계약서 보관 중\n• 논의 내용: 고소장 작성 방향, 증거 확보 계획\n• 확인 필요사항: 금융거래 내역\n• 자료 수령 예정: 투자 계약서, 이체 내역서",createdAt:"2026-02-10T14:00:00Z"},
      {id:4,type:"자료요청",   date:"2026-02-15",content:"[자료 요청]\n• 요청 자료: 금융거래내역서\n• 제출 기한: 2026-02-20\n• 수령 방법: 이메일 전송",createdAt:"2026-02-15T10:00:00Z"},
    ],
    deadlines:[],
    documents:[{id:1,title:"고소장",date:"2026-02-25",url:"https://drive.google.com/file/d/sample3",note:""}],
    todos:[
      {id:1,text:"금융거래내역서 확보",            done:false,priority:"높음",dueDate:""},
      {id:2,text:"피해 경위서 작성 (의뢰인 서명)",done:true, priority:"높음",dueDate:""},
    ],
  },
  {
    id:"c3", title:"업무상 횡령 형사 재판", type:"형사(재판)", status:"진행중",
    client:"최영호", clientContact:"010-5555-7777", clientEmail:"", clientAddr:"서울시 송파구", clientNote:"불안감 높음. 면담 자주 필요.",
    opponent:"검사", opponentCounsel:"",
    court:"서울중앙지방법원", caseNumber:"2026고합321",
    tribunal:{name:"형사합의 22부",judge:"이재원",panel:"이재원·김민지·박준호",contact:"02-530-2200",clerk:"최담당"},
    manager:"홍길동", managerOrg:"법무법인 여유", managerContact:"02-555-0001",
    retainer:{amount:8000000,date:"2025-11-01",successFee:"무죄/집행유예 시 5,000,000원",successFeeAmount:5000000},
    hearings:[
      {id:1,date:addDays(today,3),  type:"공판기일",    result:""},
      {id:2,date:addDays(today,-15),type:"공판준비기일",result:"증거 목록 교환 완료"},
    ],
    memos:[
      {id:1,type:"공식경과",  date:"2025-11-01",content:"수임.",createdAt:"2025-11-01T09:00:00Z"},
      {id:2,type:"공식경과",  date:"2025-12-05",content:"공소장 수령 및 검토 완료.",createdAt:"2025-12-05T10:00:00Z"},
      {id:3,type:"기일진행",  date:addDays(today,-15),content:"[기일 진행]\n• 출석: 피고인 및 변호인, 검사 출석\n• 재판장 발언: 증거 목록 교환\n• 결과: 증거 목록 교환 완료\n• 다음 기일: "+addDays(today,3),createdAt:"2026-02-23T11:00:00Z"},
      {id:4,type:"재판장발언",date:addDays(today,-15),content:"[재판장 발언]\n• 발언 내용: 피고인 진술이 불분명한 부분 있다\n• 지시사항: 다음 기일까지 구체적 경위 진술서 제출\n• 제출 요청: 피고인 자필 진술서",createdAt:"2026-02-23T11:30:00Z"},
      {id:5,type:"기일후대화",date:addDays(today,-15),content:"[기일 후 의뢰인 대화]\n• 주요 질문: 증인 신청 필요한지\n• 설명한 내용: 진술서 작성 방향\n• 의뢰인 요청사항: 다음 주 중 면담\n• 다음 연락 예정: "+addDays(today,-10),createdAt:"2026-02-23T14:00:00Z"},
    ],
    deadlines:[],
    documents:[
      {id:1,title:"공소장",       date:"2025-12-05",url:"https://drive.google.com/file/d/sample4",note:""},
      {id:2,title:"변호인 의견서",date:"2026-01-08",url:"https://drive.google.com/file/d/sample5",note:""},
    ],
    todos:[
      {id:1,text:"피고인 진술서 작성",  done:false,priority:"높음",dueDate:""},
      {id:2,text:"증인 신청 여부 결정",done:false,priority:"높음",dueDate:""},
      {id:3,text:"증거목록 정리",       done:true, priority:"보통",dueDate:""},
    ],
  },
];

// ── 로고 ──────────────────────────────────────────────────────────────────────
function Logo({size=28}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#4F46E5"/>
      <line x1="16" y1="7"  x2="16" y2="25" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="7"  y1="12" x2="25" y2="12" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="8.5" y1="12" x2="7"   y2="17" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="7"   y1="12" x2="8.5" y2="17" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="23.5" y1="12" x2="25"   y2="17" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="25"   y1="12" x2="23.5" y2="17" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M5.5 17 Q8.5 20 11.5 17"   stroke="white" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <path d="M20.5 17 Q23.5 20 26.5 17" stroke="white" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <line x1="13" y1="25" x2="19" y2="25" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="16" cy="7" r="1.3" fill="white"/>
    </svg>
  );
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────────
function DdayBadge({dateStr,small}) {
  const n=dday(dateStr); if(n===null) return null;
  let cls,label;
  if(n<0)      {cls="text-gray-400";label=`D+${Math.abs(n)}`;}
  else if(n===0){cls="text-red-600 font-bold";label="D-day";}
  else if(n<=7) {cls="text-red-500 font-semibold";label=`D-${n}`;}
  else if(n<=30){cls="text-amber-500 font-semibold";label=`D-${n}`;}
  else          {cls="text-gray-500";label=`D-${n}`;}
  return <span className={`${cls} ${small?"text-xs":"text-sm"} tabular-nums`}>{label}</span>;
}
function TypeBadge({type}){const s=TYPE_STYLE[type]||{badge:"bg-gray-100 text-gray-600 border-gray-200"};return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${s.badge}`}>{type}</span>;}
function MemoBadge({type}){const s=MEMO_STYLE[type]||MEMO_STYLE["기타"];return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${s.badge}`}>{type}</span>;}
function Section({title,children}){return <div><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</div>{children}</div>;}
function InfoCard({label,value,sub}){return <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100"><div className="text-xs text-slate-400 mb-0.5">{label}</div><div className="text-sm font-semibold text-slate-800">{value||"—"}</div>{sub&&<div className="text-xs text-slate-500 mt-0.5">{sub}</div>}</div>;}

// ── 통계 바 ───────────────────────────────────────────────────────────────────
function StatsBar({cases}) {
  const active=cases.filter(c=>c.status==="진행중").length;
  const week7=cases.flatMap(c=>c.hearings).filter(h=>{const n=dday(h.date);return n!==null&&n>=0&&n<=7;}).length;
  const urgDL=cases.flatMap(c=>c.deadlines||[]).filter(d=>{const n=dday(d.dueDate);return n!==null&&n>=0&&n<=14;}).length;
  const pendingTodos=cases.filter(c=>c.status==="진행중").flatMap(c=>c.todos||[]).filter(t=>!t.done).length;
  return(
    <div style={{background:"#1E293B"}} className="flex border-b border-slate-700 overflow-x-auto flex-shrink-0">
      {[
        {label:"진행 중 사건",value:active,      color:"#60A5FA"},
        {label:"7일 내 기일", value:week7,        color:week7>0?"#F87171":"#94A3B8"},
        {label:"불변기간 임박",value:urgDL,       color:urgDL>0?"#FB923C":"#94A3B8"},
        {label:"미완료 할 일",value:pendingTodos, color:pendingTodos>0?"#FBBF24":"#94A3B8"},
      ].map((s,i)=>(
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-r border-slate-700 last:border-r-0 flex-shrink-0">
          <div>
            <div className="text-xs text-slate-400 leading-none mb-1">{s.label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold leading-none tabular-nums" style={{color:s.color,fontFamily:"'SF Mono','Fira Code',monospace"}}>{s.value}</span>
              <span className="text-xs text-slate-400">건</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 사건 목록 아이템 ──────────────────────────────────────────────────────────
function CaseItem({c,selected,onClick}) {
  const nextH=c.hearings.filter(h=>dday(h.date)>=0).sort((a,b)=>new Date(a.date)-new Date(b.date))[0];
  const urgDL=(c.deadlines||[]).filter(d=>{const n=dday(d.dueDate);return n!==null&&n>=0&&n<=14;}).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate))[0];
  const dot=TYPE_STYLE[c.type]?.dot||"#94A3B8";
  const pending=(c.todos||[]).filter(t=>!t.done).length;
  return(
    <div onClick={onClick} className={`px-4 py-3 cursor-pointer border-b border-slate-100 transition-all duration-150 ${selected?"bg-indigo-50 border-l-4 border-l-indigo-500":"hover:bg-slate-50 border-l-4 border-l-transparent"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{background:dot}}/>
          <span className="text-sm font-semibold text-slate-800 truncate">{c.title}</span>
        </div>
        {nextH&&dday(nextH.date)<=7&&<DdayBadge dateStr={nextH.date} small/>}
      </div>
      <div className="flex items-center gap-1.5 ml-4 flex-wrap">
        <TypeBadge type={c.type}/>
        <span className="text-xs text-slate-400">{c.client}</span>
        {c.status==="종결"&&<span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">종결</span>}
        {urgDL&&<span className="text-xs text-orange-600 font-semibold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">⚠ {urgDL.label} D-{dday(urgDL.dueDate)}</span>}
      </div>
      {nextH&&(
        <div className="ml-4 mt-1 flex items-center gap-2">
          <span className="text-xs text-slate-400">다음 기일: {fmtDate(nextH.date)} {nextH.type}</span>
          {pending>0&&<span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white font-bold flex-shrink-0" style={{fontSize:"10px"}}>{pending}</span>}
        </div>
      )}
    </div>
  );
}

// ── 개요 탭 ───────────────────────────────────────────────────────────────────
function OverviewTab({c,onUpdate}) {
  const [addingDL,setAddingDL]=useState(false);
  const [newDL,setNewDL]=useState({label:"항소",baseDate:todayStr,dueDate:"",note:""});
  const deadlines=c.deadlines||[];
  const handleDLType=(label)=>{const dt=DEADLINE_TYPES.find(d=>d.label===label);const due=dt?.days&&newDL.baseDate?addDays(new Date(newDL.baseDate),dt.days):"";setNewDL(p=>({...p,label,dueDate:due}));};
  const handleBase=(base)=>{const dt=DEADLINE_TYPES.find(d=>d.label===newDL.label);const due=dt?.days&&base?addDays(new Date(base),dt.days):newDL.dueDate;setNewDL(p=>({...p,baseDate:base,dueDate:due}));};
  const addDL=()=>{if(!newDL.dueDate)return;onUpdate({...c,deadlines:[...deadlines,{id:Date.now(),...newDL}]});setNewDL({label:"항소",baseDate:todayStr,dueDate:"",note:""});setAddingDL(false);};
  const upH=[...c.hearings].filter(h=>dday(h.date)>=0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const pastH=[...c.hearings].filter(h=>dday(h.date)<0).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return(
    <div className="space-y-5">
      <Section title="의뢰인">
        <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-xl p-4 border border-indigo-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">{c.client?c.client[0]:"?"}</div>
            <div><div className="font-bold text-slate-800 text-base">{c.client||"—"}</div><div className="text-xs text-slate-500">{c.clientContact}</div></div>
          </div>
          <div className="space-y-1 text-xs">
            {c.clientEmail&&<div className="flex gap-2"><span className="text-slate-400 w-14 flex-shrink-0">이메일</span><span className="text-slate-600">{c.clientEmail}</span></div>}
            {c.clientAddr&&<div className="flex gap-2"><span className="text-slate-400 w-14 flex-shrink-0">주소</span><span className="text-slate-600">{c.clientAddr}</span></div>}
            {c.clientNote&&<div className="flex gap-2"><span className="text-slate-400 w-14 flex-shrink-0">비고</span><span className="text-slate-600 whitespace-pre-wrap">{c.clientNote}</span></div>}
          </div>
        </div>
      </Section>
      <Section title="재판부 · 사건">
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="재판부" value={c.tribunal?.name} sub={c.court}/>
          <InfoCard label="재판장" value={c.tribunal?.judge} sub={c.tribunal?.panel?`합의: ${c.tribunal.panel}`:""}/>
          <InfoCard label="사건번호" value={c.caseNumber} sub={c.opponent?`상대방: ${c.opponent}`:""}/>
          <InfoCard label="연락처" value={c.tribunal?.contact} sub={c.tribunal?.clerk?`담당: ${c.tribunal.clerk}`:""}/>
        </div>
        {c.opponentCounsel&&<div className="mt-2 bg-slate-50 rounded-lg px-3 py-2 text-xs border border-slate-100"><span className="text-slate-400 mr-2">상대방 대리인</span><span className="text-slate-700">{c.opponentCounsel}</span></div>}
      </Section>
      <Section title="선임약정">
        <div className="grid grid-cols-3 gap-3">
          <div><div className="text-xs text-slate-400 mb-0.5">착수금</div><div className="text-sm font-semibold text-slate-800">{fmtMoney(c.retainer?.amount)}</div></div>
          <div><div className="text-xs text-slate-400 mb-0.5">수임일</div><div className="text-sm text-slate-700">{fmtDate(c.retainer?.date)}</div></div>
          <div><div className="text-xs text-slate-400 mb-0.5">성공보수</div><div className="text-sm text-slate-700">{c.retainer?.successFee||"—"}</div></div>
        </div>
      </Section>
      <Section title="⚠ 불변기간">
        {deadlines.length===0&&!addingDL&&<div className="text-sm text-slate-400 italic text-center py-2">등록된 불변기간이 없습니다.</div>}
        <div className="space-y-2">
          {[...deadlines].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).map(d=>{
            const n=dday(d.dueDate);
            const urgent=n!==null&&n>=0&&n<=14;
            const expired=n!==null&&n<0;
            return(
              <div key={d.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${urgent?"bg-red-50 border-red-200":expired?"bg-slate-50 border-slate-100 opacity-60":"bg-orange-50 border-orange-100"}`}>
                <div className="flex items-center gap-3">
                  <div className={`text-xl font-bold tabular-nums w-16 ${urgent?"text-red-600":expired?"text-slate-400":"text-orange-500"}`}>
                    {n===null?"—":n<0?`D+${Math.abs(n)}`:n===0?"D-day":`D-${n}`}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${urgent?"text-red-700":expired?"text-slate-500":"text-orange-700"}`}>{d.label}</span>
                      {urgent&&<span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-bold">임박</span>}
                    </div>
                    <div className="text-xs text-slate-400">기산일 {fmtDate(d.baseDate)} → 기한 {fmtDate(d.dueDate)}</div>
                    {d.note&&<div className="text-xs text-slate-500 mt-0.5">{d.note}</div>}
                  </div>
                </div>
                <button onClick={()=>onUpdate({...c,deadlines:deadlines.filter(x=>x.id!==d.id)})} className="text-slate-300 hover:text-red-400 text-xs px-1">✕</button>
              </div>
            );
          })}
        </div>
        {addingDL?(
          <div className="border border-orange-200 rounded-xl p-3 bg-orange-50 space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <select className="input-sm" value={newDL.label} onChange={e=>handleDLType(e.target.value)}>{DEADLINE_TYPES.map(d=><option key={d.label}>{d.label}</option>)}</select>
              <input className="input-sm" placeholder="메모 (선택)" value={newDL.note} onChange={e=>setNewDL(p=>({...p,note:e.target.value}))}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-xs text-slate-500 mb-1">기산일 (송달일 등)</div><input className="input-sm" type="date" value={newDL.baseDate} onChange={e=>handleBase(e.target.value)}/></div>
              <div><div className="text-xs text-slate-500 mb-1">기한 (자동계산)</div><input className="input-sm" type="date" value={newDL.dueDate} onChange={e=>setNewDL(p=>({...p,dueDate:e.target.value}))}/></div>
            </div>
            <div className="text-xs text-orange-600">{DEADLINE_TYPES.find(d=>d.label===newDL.label)?.hint}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setAddingDL(false)} className="btn-ghost text-xs">취소</button>
              <button onClick={addDL} className="text-xs bg-orange-500 hover:bg-orange-600 text-white border-none rounded-lg px-3 py-1.5 font-semibold cursor-pointer">등록</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setAddingDL(true)} className="w-full border-2 border-dashed border-orange-200 text-orange-400 text-sm py-2 rounded-xl hover:border-orange-300 hover:text-orange-500 transition-colors mt-2">+ 불변기간 등록</button>
        )}
      </Section>
      <Section title="기일">
        {c.hearings.length===0?<div className="text-sm text-slate-400 italic">등록된 기일이 없습니다.</div>:(
          <div className="space-y-1.5">
            {upH.length>0&&<><div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">예정</div>{upH.map(h=><HearingRow key={h.id} h={h} upcoming/>)}</>}
            {pastH.length>0&&<><div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2 mb-1">지난 기일</div>{pastH.map(h=><HearingRow key={h.id} h={h}/>)}</>}
          </div>
        )}
      </Section>
    </div>
  );
}
function HearingRow({h,upcoming}) {
  return(
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${upcoming?"bg-indigo-50 border border-indigo-100":"bg-slate-50"}`}>
      <div className="flex items-center gap-3"><DdayBadge dateStr={h.date} small/><div><div className="text-sm font-medium text-slate-700">{h.type}</div>{h.result&&<div className="text-xs text-slate-400">{h.result}</div>}</div></div>
      <div className="text-xs text-slate-500">{fmtDate(h.date)}</div>
    </div>
  );
}

// ── 메모 탭 ───────────────────────────────────────────────────────────────────
function MemosTab({c,onUpdate,scriptUrl}) {
  const [filter,setFilter]=useState("전체");
  const [adding,setAdding]=useState(false);
  const [editId,setEditId]=useState(null);
  const [editContent,setEditContent]=useState("");
  const [newMemo,setNewMemo]=useState({type:"의뢰인회의",date:todayStr,content:""});
  const [syncing,setSyncing]=useState(false);
  const [syncMsg,setSyncMsg]=useState("");
  const memos=c.memos||[];
  const handleTypeChange=(type)=>{setNewMemo(p=>({...p,type,content:MEMO_TEMPLATES[type]||""}));};
  const sorted=[...memos].filter(m=>filter==="전체"||m.type===filter).sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id);
  const counts=MEMO_TYPES.reduce((acc,t)=>{acc[t]=memos.filter(m=>m.type===t).length;return acc;},{});
  const addMemo=()=>{if(!newMemo.content.trim())return;onUpdate({...c,memos:[...memos,{id:Date.now(),...newMemo,createdAt:new Date().toISOString()}]});setNewMemo({type:"의뢰인회의",date:todayStr,content:""});setAdding(false);};
  const saveEdit=(id)=>{onUpdate({...c,memos:memos.map(m=>m.id===id?{...m,content:editContent}:m)});setEditId(null);};
  const syncToSheets=async()=>{
    if(!scriptUrl){setSyncMsg("⚠ 설정에서 URL을 입력해주세요.");setTimeout(()=>setSyncMsg(""),4000);return;}
    setSyncing(true);
    try{await fetch(scriptUrl,{method:"POST",body:JSON.stringify({action:"saveMemos",caseId:c.id,caseTitle:c.title,client:c.client,memos})});setSyncMsg("✓ Sheets에 저장되었습니다.");}
    catch(e){setSyncMsg("실패: "+e.message);}
    finally{setSyncing(false);setTimeout(()=>setSyncMsg(""),4000);}
  };
  return(
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={()=>setFilter("전체")} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter==="전체"?"bg-slate-800 text-white border-slate-800":"text-slate-500 border-slate-200 hover:border-slate-400"}`}>전체 {memos.length>0&&<span className="ml-1 opacity-60">{memos.length}</span>}</button>
        {MEMO_TYPES.map(t=>(
          <button key={t} onClick={()=>setFilter(t)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter===t?"bg-slate-800 text-white border-slate-800":"text-slate-500 border-slate-200 hover:border-slate-400"}`}>
            {t}{counts[t]>0&&<span className="ml-1 opacity-60">{counts[t]}</span>}
          </button>
        ))}
      </div>
      {sorted.length===0&&!adding&&<div className="text-sm text-slate-400 italic py-6 text-center">{filter==="전체"?"등록된 메모가 없습니다.":`'${filter}' 메모가 없습니다.`}</div>}
      <div className="space-y-2">
        {sorted.map(m=>(
          <div key={m.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2"><MemoBadge type={m.type}/><span className="text-xs text-slate-400">{fmtDate(m.date)}</span></div>
              <div className="flex gap-1">
                <button onClick={()=>{setEditId(editId===m.id?null:m.id);setEditContent(m.content);}} className="text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-0.5 rounded hover:bg-indigo-50">{editId===m.id?"취소":"수정"}</button>
                <button onClick={()=>onUpdate({...c,memos:memos.filter(x=>x.id!==m.id)})} className="text-xs text-slate-300 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-50">삭제</button>
              </div>
            </div>
            <div className="px-3 py-2.5">
              {editId===m.id?(
                <div className="space-y-2">
                  <textarea className="input-sm w-full resize-none" rows={5} value={editContent} onChange={e=>setEditContent(e.target.value)} autoFocus/>
                  <div className="flex justify-end"><button onClick={()=>saveEdit(m.id)} className="btn-primary text-xs py-1 px-3">저장</button></div>
                </div>
              ):(
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.content}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {adding?(
        <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50 space-y-2">
          <div className="flex gap-2">
            <select className="input-sm flex-1" value={newMemo.type} onChange={e=>handleTypeChange(e.target.value)}>{MEMO_TYPES.map(t=><option key={t}>{t}</option>)}</select>
            <input className="input-sm flex-1" type="date" value={newMemo.date} onChange={e=>setNewMemo(p=>({...p,date:e.target.value}))}/>
          </div>
          <textarea className="input-sm w-full resize-none" rows={6} value={newMemo.content} onChange={e=>setNewMemo(p=>({...p,content:e.target.value}))} autoFocus/>
          <div className="flex gap-2 justify-end">
            <button onClick={()=>setAdding(false)} className="btn-ghost text-xs">취소</button>
            <button onClick={addMemo} className="btn-primary text-xs py-1 px-3">저장</button>
          </div>
        </div>
      ):(
        <button onClick={()=>{setAdding(true);setNewMemo({type:"의뢰인회의",date:todayStr,content:MEMO_TEMPLATES["의뢰인회의"]||""});}} className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-xl hover:border-indigo-300 hover:text-indigo-400 transition-colors">+ 메모 추가</button>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-400">{syncMsg}</span>
        <button onClick={syncToSheets} disabled={syncing} className="text-xs text-slate-500 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          {syncing?"저장 중…":"📊 Sheets에 저장"}
        </button>
      </div>
    </div>
  );
}

// ── 할 일 탭 ──────────────────────────────────────────────────────────────────
function TodosTab({c,onUpdate}) {
  const [newTodo,setNewTodo]=useState({text:"",priority:"보통",dueDate:""});
  const [adding,setAdding]=useState(false);
  const [showDone,setShowDone]=useState(true);
  const todos=c.todos||[];
  const pending=todos.filter(t=>!t.done);
  const done=todos.filter(t=>t.done);
  const toggle=(id)=>onUpdate({...c,todos:todos.map(t=>t.id===id?{...t,done:!t.done}:t)});
  const del=(id)=>onUpdate({...c,todos:todos.filter(t=>t.id!==id)});
  const add=()=>{if(!newTodo.text.trim())return;onUpdate({...c,todos:[...todos,{id:Date.now(),...newTodo}]});setNewTodo({text:"",priority:"보통",dueDate:""});setAdding(false);};
  const TodoRow=({t})=>{
    const overdue=t.dueDate&&dday(t.dueDate)<0&&!t.done;
    return(
      <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-all ${t.done?"bg-slate-50 border-slate-100 opacity-50":"bg-white border-slate-100 hover:border-slate-200 shadow-sm"}`}>
        <button onClick={()=>toggle(t.id)} className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${t.done?"bg-emerald-400 border-emerald-400":"border-slate-300 hover:border-indigo-400"}`}>{t.done&&<span className="text-white text-xs leading-none">✓</span>}</button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm leading-snug ${t.done?"line-through text-slate-400":t.priority==="높음"?"text-red-600 font-semibold":"text-slate-700"}`}>{t.text}</div>
          {t.dueDate&&<span className={`text-xs flex items-center gap-1 mt-0.5 ${overdue?"text-red-500 font-semibold":"text-slate-400"}`}>{overdue?"⚠":"📅"} {fmtDate(t.dueDate)} {!t.done&&<DdayBadge dateStr={t.dueDate} small/>}</span>}
        </div>
        <button onClick={()=>del(t.id)} className="text-slate-200 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
      </div>
    );
  };
  return(
    <div className="space-y-3">
      {pending.length===0&&!adding&&done.length===0&&<div className="text-sm text-slate-400 italic py-4 text-center">등록된 할 일이 없습니다.</div>}
      {pending.length===0&&!adding&&done.length>0&&<div className="text-sm text-slate-400 italic py-2 text-center">미완료 항목이 없습니다. 🎉</div>}
      <div className="space-y-2">{[...pending].sort((a,b)=>({"높음":0,"보통":1}[a.priority]??1)-({"높음":0,"보통":1}[b.priority]??1)).map(t=><TodoRow key={t.id} t={t}/>)}</div>
      {adding?(
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <input className="input-sm w-full" placeholder="할 일 내용 *" value={newTodo.text} onChange={e=>setNewTodo(p=>({...p,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&add()} autoFocus/>
          <div className="flex gap-2">
            <select className="input-sm flex-1" value={newTodo.priority} onChange={e=>setNewTodo(p=>({...p,priority:e.target.value}))}><option>높음</option><option>보통</option></select>
            <input className="input-sm flex-1" type="date" value={newTodo.dueDate} onChange={e=>setNewTodo(p=>({...p,dueDate:e.target.value}))}/>
          </div>
          <div className="flex gap-2 justify-end"><button onClick={()=>setAdding(false)} className="btn-ghost text-xs">취소</button><button onClick={add} className="btn-primary text-xs py-1 px-3">추가</button></div>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">+ 할 일 추가</button>
      )}
      {done.length>0&&(
        <div>
          <button onClick={()=>setShowDone(p=>!p)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-2">{showDone?"▾":"▸"} 완료 {done.length}건</button>
          {showDone&&<div className="space-y-2">{done.map(t=><TodoRow key={t.id} t={t}/>)}</div>}
        </div>
      )}
    </div>
  );
}

// ── 문서 탭 ───────────────────────────────────────────────────────────────────
function DocumentsTab({c,onUpdate}) {
  const [newDoc,setNewDoc]=useState({title:"",date:todayStr,url:"",note:""});
  const [adding,setAdding]=useState(false);
  const add=()=>{if(!newDoc.title.trim())return;onUpdate({...c,documents:[...c.documents,{id:Date.now(),...newDoc}]});setNewDoc({title:"",date:todayStr,url:"",note:""});setAdding(false);};
  return(
    <div className="space-y-3">
      {c.documents.length===0&&!adding&&<div className="text-sm text-slate-400 italic py-4 text-center">등록된 문서가 없습니다.</div>}
      {c.documents.map(doc=>(
        <div key={doc.id} className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800 truncate">{doc.title}</span><span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(doc.date)}</span></div>
            {doc.note&&<div className="text-xs text-slate-500 mt-0.5">{doc.note}</div>}
            {doc.url&&<a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline truncate block mt-0.5">{doc.url.length>50?doc.url.slice(0,50)+"…":doc.url}</a>}
          </div>
          <button onClick={()=>onUpdate({...c,documents:c.documents.filter(d=>d.id!==doc.id)})} className="text-slate-300 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
        </div>
      ))}
      {adding?(
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input-sm" placeholder="문서 제목 *" value={newDoc.title} onChange={e=>setNewDoc(p=>({...p,title:e.target.value}))}/>
            <input className="input-sm" type="date" value={newDoc.date} onChange={e=>setNewDoc(p=>({...p,date:e.target.value}))}/>
          </div>
          <input className="input-sm w-full" placeholder="Google Drive URL" value={newDoc.url} onChange={e=>setNewDoc(p=>({...p,url:e.target.value}))}/>
          <input className="input-sm w-full" placeholder="메모 (선택)" value={newDoc.note} onChange={e=>setNewDoc(p=>({...p,note:e.target.value}))}/>
          <div className="flex gap-2 justify-end"><button onClick={()=>setAdding(false)} className="btn-ghost text-xs">취소</button><button onClick={add} className="btn-primary text-xs py-1 px-3">추가</button></div>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">+ 문서 추가</button>
      )}
    </div>
  );
}

// ── AI 파싱 모달 ──────────────────────────────────────────────────────────────
function AiParseModal({cases,onClose,onApply}) {
  const [text,setText]=useState("");
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  const [matched,setMatched]=useState(null);
  const [error,setError]=useState("");
  const parse=async()=>{
    if(!text.trim())return;
    setLoading(true);setResult(null);setError("");setMatched(null);
    try{
      const prompt=`다음 텍스트(카카오톡 대화 또는 메모)를 분석하여 법률 사건 관련 정보를 추출하세요. JSON만 응답, 다른 텍스트 포함 금지.\n\n추출 항목:\n- client: 의뢰인 이름 (null 가능)\n- title: 사건명/요약 (null 가능)\n- type: 사건유형 (민사/형사(고소)/형사(피의)/형사(재판)/행정/가사/강제집행/자문 중 하나, null 가능)\n- court: 법원/수사기관 (null 가능)\n- caseNumber: 사건번호 (null 가능)\n- hearingDate: 기일 날짜 YYYY-MM-DD (null 가능)\n- hearingType: 기일 종류 (null 가능)\n- memoType: 메모 유형 (공식경과/의뢰인회의/기일진행/재판장발언/기일후대화/자료요청/기타 중 가장 적합한 것)\n- memoContent: 메모로 정리할 핵심 내용 (null 가능)\n- opponent: 상대방 (null 가능)\n\n텍스트:\n${text}`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const raw=data.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setResult(parsed);
      const nm=(parsed.client||"").toLowerCase();
      const tm=(parsed.title||"").toLowerCase();
      setMatched(cases.find(c=>(nm&&c.client.toLowerCase().includes(nm))||(tm&&c.title.toLowerCase().includes(tm)))||null);
    }catch(e){setError("파싱 오류: "+e.message);}
    finally{setLoading(false);}
  };
  const apply=()=>{if(!result)return;onApply(result,matched);onClose();};
  return(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{background:"#1E293B"}}>
          <div><div className="text-white font-semibold">✨ AI 파싱</div><div className="text-slate-400 text-xs">카카오톡 대화 → 사건 메모 자동 등록</div></div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" rows={7} placeholder="카카오톡 대화, 상담 메모 등을 붙여넣으세요..." value={text} onChange={e=>setText(e.target.value)}/>
          {error&&<div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>}
          {result&&(
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">추출 결과</div>
              {Object.entries(result).filter(([,v])=>v).map(([k,v])=>(
                <div key={k} className="flex gap-2 text-sm"><span className="text-slate-400 w-28 flex-shrink-0 text-xs">{k}</span><span className="text-slate-700 font-medium">{String(v)}</span></div>
              ))}
              <div className="border-t border-slate-200 pt-2 mt-2">
                {matched?<div className="text-sm text-emerald-600">✓ <strong>{matched.title}</strong>에 메모로 추가됩니다.</div>:<div className="text-sm text-amber-600">일치 사건 없음 → 새 사건으로 등록됩니다.</div>}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-ghost">취소</button>
            {!result?<button onClick={parse} disabled={loading||!text.trim()} className="btn-primary">{loading?"분석 중…":"파싱하기"}</button>:<button onClick={apply} className="btn-primary">적용하기</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 통합 검색 모달 ────────────────────────────────────────────────────────────
function SearchModal({cases,onClose,onSelectCase}) {
  const [q,setQ]=useState("");
  const results=useMemo(()=>{
    if(!q.trim())return[];
    const lower=q.toLowerCase();
    const out=[];
    cases.forEach(c=>{
      const cm=c.title.toLowerCase().includes(lower)||c.client.toLowerCase().includes(lower)||c.caseNumber?.toLowerCase().includes(lower);
      (c.memos||[]).forEach(m=>{
        if(m.content.toLowerCase().includes(lower)){
          const idx=m.content.toLowerCase().indexOf(lower);
          const start=Math.max(0,idx-30);
          const end=Math.min(m.content.length,idx+lower.length+60);
          const snippet=(start>0?"…":"")+m.content.slice(start,idx)+"【"+m.content.slice(idx,idx+lower.length)+"】"+m.content.slice(idx+lower.length,end)+(end<m.content.length?"…":"");
          out.push({caseId:c.id,caseTitle:c.title,client:c.client,type:c.type,memo:m,snippet});
        }
      });
      if(cm&&!(c.memos||[]).some(m=>m.content.toLowerCase().includes(lower)))
        out.push({caseId:c.id,caseTitle:c.title,client:c.client,type:c.type,memo:null,snippet:null});
    });
    return out.slice(0,30);
  },[cases,q]);
  return(
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-4 border-b">
          <input autoFocus className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="전체 사건 메모 검색…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!q.trim()&&<div className="text-center text-slate-400 text-sm py-8">검색어를 입력하세요</div>}
          {q.trim()&&results.length===0&&<div className="text-center text-slate-400 text-sm py-8">검색 결과가 없습니다.</div>}
          {results.map((r,i)=>(
            <div key={i} onClick={()=>{onSelectCase(r.caseId);onClose();}} className="px-4 py-3 border-b border-slate-50 hover:bg-indigo-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2 mb-1"><TypeBadge type={r.type}/><span className="text-sm font-semibold text-slate-700">{r.caseTitle}</span><span className="text-xs text-slate-400">{r.client}</span></div>
              {r.memo&&r.snippet&&<div className="ml-1 flex items-start gap-2"><MemoBadge type={r.memo.type}/><span className="text-xs text-slate-500 leading-relaxed">{r.snippet}</span></div>}
            </div>
          ))}
        </div>
        {q.trim()&&results.length>0&&<div className="px-4 py-2 text-xs text-slate-400 border-t">{results.length}건 발견</div>}
      </div>
    </div>
  );
}

// ── 설정 모달 ─────────────────────────────────────────────────────────────────
function SettingsModal({scriptUrl,onSave,onClose}) {
  const [url,setUrl]=useState(scriptUrl||"");
  const SCRIPT=`function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("사건메모");
    if (!sheet) {
      sheet = ss.insertSheet("사건메모");
      sheet.appendRow(["메모ID","사건ID","사건명","의뢰인","유형","날짜","내용","생성일시"]);
    }
    if (data.action === "saveMemos") {
      const all = sheet.getDataRange().getValues();
      const others = all.filter((r,i) => i===0 || r[1]!==data.caseId);
      sheet.clearContents();
      others.forEach(r => sheet.appendRow(r));
      (data.memos||[]).forEach(m => {
        sheet.appendRow([m.id, data.caseId, data.caseTitle, data.client, m.type, m.date, m.content, m.createdAt]);
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}`;
  return(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl my-auto" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:"#1E293B"}}><div className="text-white font-semibold">⚙️ 설정 — Google Sheets 연동</div></div>
        <div className="p-5 space-y-4">
          <div><div className="text-sm font-semibold text-slate-700 mb-1">Apps Script 웹 앱 URL</div><input className="input w-full" placeholder="https://script.google.com/macros/s/..." value={url} onChange={e=>setUrl(e.target.value)}/></div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="text-xs font-semibold text-slate-600">📋 설정 방법 (최초 1회)</div>
            <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
              <li><a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">script.google.com</a> → 새 프로젝트</li>
              <li>아래 코드 전체 복사 → 붙여넣기</li>
              <li>배포 → 새 배포 → 유형: 웹 앱</li>
              <li>실행 계정: <b>나</b> / 액세스: <b>모든 사용자</b></li>
              <li>배포 URL을 위 칸에 붙여넣기</li>
            </ol>
            <div className="relative">
              <textarea className="w-full text-xs font-mono bg-slate-800 text-slate-200 rounded-lg p-3 resize-none border-0 outline-none" rows={12} value={SCRIPT} readOnly/>
              <button onClick={()=>navigator.clipboard?.writeText(SCRIPT).then(()=>alert("복사되었습니다."))} className="absolute top-2 right-2 text-xs bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 rounded">복사</button>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2"><button onClick={onClose} className="btn-ghost">취소</button><button onClick={()=>{onSave(url);onClose();}} className="btn-primary">저장</button></div>
      </div>
    </div>
  );
}

// ── 사건 등록/수정 모달 ───────────────────────────────────────────────────────
function CaseFormModal({initial,onSave,onClose}) {
  const [form,setForm]=useState(initial||emptyCase());
  const [newH,setNewH]=useState({date:todayStr,type:"",result:""});
  const set=(path,val)=>{setForm(prev=>{const next={...prev};const pts=path.split(".");if(pts.length===2)next[pts[0]]={...prev[pts[0]],[pts[1]]:val};else if(pts.length===3)next[pts[0]]={...prev[pts[0]],[pts[1]]:{...(prev[pts[0]][pts[1]]||{}),[pts[2]]:val}};else next[path]=val;return next;});};
  const addH=()=>{if(!newH.date||!newH.type.trim())return;setForm(p=>({...p,hearings:[...p.hearings,{id:Date.now(),...newH}]}));setNewH({date:todayStr,type:"",result:""});};
  const FS=({title,children})=><div className="space-y-2"><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{title}</div>{children}</div>;
  return(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-auto" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{background:"#1E293B"}}>
          <div className="text-white font-semibold">{initial?.id&&!initial._isNew?"사건 수정":"새 사건 등록"}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <FS title="기본 정보">
            <input className="input w-full" placeholder="사건명 *" value={form.title} onChange={e=>set("title",e.target.value)}/>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.type} onChange={e=>set("type",e.target.value)}>{TYPES.slice(1).map(t=><option key={t}>{t}</option>)}</select>
              <select className="input" value={form.status} onChange={e=>set("status",e.target.value)}><option>진행중</option><option>종결</option></select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="관할 법원/기관" value={form.court} onChange={e=>set("court",e.target.value)}/>
              <input className="input" placeholder="사건번호" value={form.caseNumber} onChange={e=>set("caseNumber",e.target.value)}/>
            </div>
          </FS>
          <FS title="의뢰인">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="이름 *" value={form.client} onChange={e=>set("client",e.target.value)}/>
              <input className="input" placeholder="연락처" value={form.clientContact} onChange={e=>set("clientContact",e.target.value)}/>
              <input className="input" placeholder="이메일" value={form.clientEmail} onChange={e=>set("clientEmail",e.target.value)}/>
              <input className="input" placeholder="주소" value={form.clientAddr} onChange={e=>set("clientAddr",e.target.value)}/>
            </div>
            <textarea className="input resize-none" rows={2} placeholder="비고 (연락 선호 시간 등)" value={form.clientNote} onChange={e=>set("clientNote",e.target.value)}/>
          </FS>
          <FS title="상대방">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="상대방" value={form.opponent} onChange={e=>set("opponent",e.target.value)}/>
              <input className="input" placeholder="상대방 대리인 (법인/변호사)" value={form.opponentCounsel} onChange={e=>set("opponentCounsel",e.target.value)}/>
            </div>
          </FS>
          <FS title="재판부">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="재판부 (예: 민사합의 15부)" value={form.tribunal?.name||""} onChange={e=>set("tribunal.name",e.target.value)}/>
              <input className="input" placeholder="재판장 이름" value={form.tribunal?.judge||""} onChange={e=>set("tribunal.judge",e.target.value)}/>
              <input className="input" placeholder="합의부 구성 (선택)" value={form.tribunal?.panel||""} onChange={e=>set("tribunal.panel",e.target.value)}/>
              <input className="input" placeholder="법원 연락처" value={form.tribunal?.contact||""} onChange={e=>set("tribunal.contact",e.target.value)}/>
              <input className="input col-span-2" placeholder="담당 서기관/주사 (선택)" value={form.tribunal?.clerk||""} onChange={e=>set("tribunal.clerk",e.target.value)}/>
            </div>
          </FS>
          <FS title="담당자">
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="이름" value={form.manager} onChange={e=>set("manager",e.target.value)}/>
              <input className="input" placeholder="소속" value={form.managerOrg} onChange={e=>set("managerOrg",e.target.value)}/>
              <input className="input" placeholder="연락처" value={form.managerContact} onChange={e=>set("managerContact",e.target.value)}/>
            </div>
          </FS>
          <FS title="선임약정">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="number" placeholder="착수금 (원)" value={form.retainer.amount} onChange={e=>set("retainer.amount",e.target.value)}/>
              <input className="input" type="date" value={form.retainer.date} onChange={e=>set("retainer.date",e.target.value)}/>
            </div>
            <input className="input w-full" placeholder="성공보수 조건" value={form.retainer.successFee} onChange={e=>set("retainer.successFee",e.target.value)}/>
          </FS>
          <FS title="기일">
            {form.hearings.map(h=>(
              <div key={h.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-400 w-24">{fmtDate(h.date)}</span><span className="text-slate-700 flex-1">{h.type}</span>
                <button onClick={()=>setForm(p=>({...p,hearings:p.hearings.filter(x=>x.id!==h.id)}))} className="text-slate-300 hover:text-red-400">✕</button>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2">
              <input className="input" type="date" value={newH.date} onChange={e=>setNewH(p=>({...p,date:e.target.value}))}/>
              <input className="input" placeholder="기일 종류" value={newH.type} onChange={e=>setNewH(p=>({...p,type:e.target.value}))}/>
              <div className="flex gap-1"><input className="input flex-1" placeholder="결과(선택)" value={newH.result} onChange={e=>setNewH(p=>({...p,result:e.target.value}))}/><button onClick={addH} className="btn-primary px-2.5">+</button></div>
            </div>
          </FS>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">취소</button>
          <button onClick={()=>{if(!form.title.trim())return;onSave(form);onClose();}} className="btn-primary">저장</button>
        </div>
      </div>
    </div>
  );
}

// ── 인쇄 ──────────────────────────────────────────────────────────────────────
function printCase(c) {
  const memos=(c.memos||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const deadlines=(c.deadlines||[]).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const todos=(c.todos||[]).filter(t=>!t.done);
  const upH=c.hearings.filter(h=>dday(h.date)>=0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${c.title}</title>
<style>body{font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:13px;color:#1e293b;max-width:800px;margin:0 auto;padding:24px;}
h1{font-size:20px;margin-bottom:4px;font-weight:700;}
.meta{color:#64748b;font-size:12px;margin-bottom:20px;}
h2{font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin:20px 0 10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;}
.label{font-size:10px;color:#94a3b8;margin-bottom:2px;text-transform:uppercase;}
.val{font-weight:600;font-size:13px;}
.memo{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;}
.badge{display:inline-block;font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid #e2e8f0;font-weight:600;margin-right:6px;background:#f1f5f9;}
.dl{background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:12px;}
.dl-n{font-size:18px;font-weight:700;color:#ea580c;width:60px;flex-shrink:0;}
.todo{padding:5px 0;border-bottom:1px solid #f1f5f9;}
@media print{@page{margin:15mm;}body{padding:0;}}</style></head><body>
<h1>${c.title}</h1>
<div class="meta">${c.type} · ${c.status} · ${c.court||""} ${c.caseNumber?`(${c.caseNumber})`:""} · 출력일: ${todayStr}</div>
<h2>의뢰인</h2>
<div class="grid">
<div class="card"><div class="label">이름</div><div class="val">${c.client||"—"}</div></div>
<div class="card"><div class="label">연락처</div><div class="val">${c.clientContact||"—"}</div></div>
</div>
<h2>재판부</h2>
<div class="grid">
<div class="card"><div class="label">재판부</div><div class="val">${c.tribunal?.name||"—"}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${c.court||""}</div></div>
<div class="card"><div class="label">재판장</div><div class="val">${c.tribunal?.judge||"—"}</div>${c.tribunal?.panel?`<div style="font-size:11px;color:#64748b;margin-top:2px">${c.tribunal.panel}</div>`:""}
</div></div>
${deadlines.length>0?`<h2>불변기간</h2>${deadlines.map(d=>{const n=dday(d.dueDate);const lbl=n===null?"—":n<0?`D+${Math.abs(n)}`:n===0?"D-day":`D-${n}`;return`<div class="dl"><div class="dl-n">${lbl}</div><div><strong>${d.label}</strong> — 기한: ${fmtDate(d.dueDate)}<div style="font-size:11px;color:#94a3b8">기산일: ${fmtDate(d.baseDate)}</div></div></div>`;}).join("")}`:""}
${upH.length>0?`<h2>예정 기일</h2>${upH.map(h=>`<div class="todo">${fmtDate(h.date)} ${h.type}</div>`).join("")}`:""}
${todos.length>0?`<h2>미완료 할 일</h2>${todos.map(t=>`<div class="todo">☐ ${t.text}${t.dueDate?` <span style="color:#94a3b8;font-size:11px">(${fmtDate(t.dueDate)})</span>`:""}</div>`).join("")}`:""}
<h2>메모 전체 (${memos.length}건)</h2>
${memos.map(m=>`<div class="memo"><span class="badge">${m.type}</span><span style="color:#94a3b8;font-size:11px">${fmtDate(m.date)}</span><div style="margin-top:8px;white-space:pre-wrap;line-height:1.7;font-size:13px">${m.content}</div></div>`).join("")}
<script>window.onload=()=>window.print();</script></body></html>`;
  const w=window.open("","_blank");
  if(w){w.document.write(html);w.document.close();}
}

// ── 메인 앱 ───────────────────────────────────────────────────────────────────
export default function App() {
  const [cases,setCases]=useState(SAMPLE_CASES);
  const [selectedId,setSelectedId]=useState("c1");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("전체");
  const [typeFilter,setTypeFilter]=useState("전체");
  const [activeTab,setActiveTab]=useState("overview");
  const [showForm,setShowForm]=useState(false);
  const [editCase,setEditCase]=useState(null);
  const [showAI,setShowAI]=useState(false);
  const [showSearch,setShowSearch]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [scriptUrl,setScriptUrl]=useState("");
  const [mobileView,setMobileView]=useState("list");

  const filtered=useMemo(()=>cases.filter(c=>{
    const q=search.toLowerCase();
    const ms=!q||c.title.toLowerCase().includes(q)||c.client.toLowerCase().includes(q)||c.caseNumber?.toLowerCase().includes(q);
    return ms&&(statusFilter==="전체"||c.status===statusFilter)&&(typeFilter==="전체"||c.type===typeFilter);
  }),[cases,search,statusFilter,typeFilter]);

  const selected=cases.find(c=>c.id===selectedId);

  const saveCase=useCallback((c)=>{
    setCases(prev=>{const idx=prev.findIndex(x=>x.id===c.id);if(idx>=0){const n=[...prev];n[idx]=c;return n;}return[c,...prev];});
    setSelectedId(c.id);
  },[]);

  const selectCase=(id)=>{setSelectedId(id);setActiveTab("overview");setMobileView("detail");};

  const applyAI=useCallback((result,matched)=>{
    if(matched){
      const updated={...matched};
      if(result.memoContent)updated.memos=[...(updated.memos||[]),{id:Date.now(),type:result.memoType||"기타",date:todayStr,content:result.memoContent,createdAt:new Date().toISOString()}];
      if(result.hearingDate&&result.hearingType)updated.hearings=[...updated.hearings,{id:Date.now(),date:result.hearingDate,type:result.hearingType,result:""}];
      saveCase(updated);setSelectedId(matched.id);setActiveTab("memos");setMobileView("detail");
    }else{
      const nc=emptyCase();
      if(result.client)nc.client=result.client;
      if(result.title)nc.title=result.title;
      if(result.type&&TYPES.includes(result.type))nc.type=result.type;
      if(result.court)nc.court=result.court;
      if(result.caseNumber)nc.caseNumber=result.caseNumber;
      if(result.opponent)nc.opponent=result.opponent;
      if(result.memoContent)nc.memos=[{id:Date.now(),type:result.memoType||"기타",date:todayStr,content:result.memoContent,createdAt:new Date().toISOString()}];
      if(result.hearingDate&&result.hearingType)nc.hearings=[{id:Date.now(),date:result.hearingDate,type:result.hearingType,result:""}];
      setEditCase({...nc,_isNew:true});setShowForm(true);
    }
  },[saveCase]);

  const TABS=[["overview","개요"],["memos","메모"],["todos","할 일"],["documents","문서"]];
  const tabCount=(key)=>{if(!selected)return 0;if(key==="memos")return(selected.memos||[]).length;if(key==="todos")return(selected.todos||[]).filter(t=>!t.done).length;return 0;};

  return(
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Apple SD Gothic Neo','Noto Sans KR',-apple-system,sans-serif;}
        .input{border:1px solid #E2E8F0;border-radius:8px;padding:7px 10px;font-size:13px;color:#334155;background:white;outline:none;width:100%;}
        .input:focus{border-color:#818CF8;box-shadow:0 0 0 2px rgba(99,102,241,.15);}
        .input-sm{border:1px solid #E2E8F0;border-radius:6px;padding:5px 8px;font-size:12px;color:#334155;background:white;outline:none;width:100%;}
        .input-sm:focus{border-color:#818CF8;box-shadow:0 0 0 2px rgba(99,102,241,.12);}
        .btn-primary{background:#4F46E5;color:white;border:none;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-weight:600;transition:background .15s;}
        .btn-primary:hover{background:#4338CA;}
        .btn-primary:disabled{background:#A5B4FC;cursor:not-allowed;}
        .btn-ghost{background:transparent;color:#64748B;border:1px solid #E2E8F0;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;transition:all .15s;}
        .btn-ghost:hover{background:#F8FAFC;border-color:#CBD5E1;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:2px;}
        .list-panel{width:288px;flex-shrink:0;}
        @media(max-width:900px){.list-panel{width:220px;}}
        @media(max-width:640px){
          .list-panel{width:100%!important;}
          .detail-panel{width:100%!important;}
          .hide-mobile{display:none!important;}
        }
        select.input{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;appearance:none;padding-right:28px;}
        select.input-sm{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;appearance:none;padding-right:24px;}
      `}</style>
      <div className="flex flex-col bg-slate-100" style={{height:"100dvh"}}>
        {/* 헤더 */}
        <div style={{background:"#0F172A"}} className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {mobileView==="detail"&&(
              <button onClick={()=>setMobileView("list")} style={{display:"none"}} className="mobile-back text-slate-400 hover:text-white mr-1 hide-desktop">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd"/></svg>
              </button>
            )}
            <Logo size={26}/>
            <span className="text-white font-bold text-base tracking-tight">사건 관리</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={()=>setShowSearch(true)} title="검색" className="flex items-center gap-1 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-2.5 py-1.5 rounded-lg transition-colors">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
              <span className="hidden sm:inline">검색</span>
            </button>
            <button onClick={()=>setShowAI(true)} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-2.5 py-1.5 rounded-lg transition-colors">
              ✨<span className="hidden sm:inline">AI 파싱</span>
            </button>
            <button onClick={()=>setShowSettings(true)} title="설정" className="text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 p-1.5 rounded-lg transition-colors">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
            </button>
            <button onClick={()=>{setEditCase(null);setShowForm(true);}} className="flex items-center gap-1 text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-2.5 py-1.5 rounded-lg transition-colors font-semibold">
              +<span className="hidden sm:inline">새 사건</span>
            </button>
          </div>
        </div>
        <StatsBar cases={cases}/>
        {/* 본문 */}
        <div className="flex flex-1 min-h-0">
          <div className={`list-panel bg-white border-r border-slate-100 flex flex-col ${mobileView==="detail"?"hide-mobile":""}`}>
            <div className="p-3 border-b border-slate-100"><input className="input" placeholder="사건명, 의뢰인, 사건번호…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
              <div className="flex gap-1 flex-wrap">{STATUSES.map(s=><button key={s} onClick={()=>setStatusFilter(s)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statusFilter===s?"bg-slate-800 text-white border-slate-800":"text-slate-500 border-slate-200 hover:border-slate-400"}`}>{s}</button>)}</div>
              <div className="flex gap-1 flex-wrap">{TYPES.map(t=><button key={t} onClick={()=>setTypeFilter(t)} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${typeFilter===t?"bg-indigo-600 text-white border-indigo-600":"text-slate-400 border-slate-200 hover:border-indigo-300"}`}>{t}</button>)}</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length===0?<div className="text-center text-slate-400 text-sm py-10">검색 결과 없음</div>:filtered.map(c=><CaseItem key={c.id} c={c} selected={selectedId===c.id} onClick={()=>selectCase(c.id)}/>)}
            </div>
          </div>
          <div className={`detail-panel flex-1 flex flex-col bg-white min-w-0 ${mobileView==="list"?"hide-mobile":""}`}>
            {selected?(
              <>
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap"><TypeBadge type={selected.type}/><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selected.status==="진행중"?"bg-green-50 text-green-700 border border-green-200":"bg-slate-100 text-slate-500 border border-slate-200"}`}>{selected.status}</span></div>
                    <h2 className="text-lg font-bold text-slate-900 leading-snug">{selected.title}</h2>
                    {selected.caseNumber&&selected.caseNumber!=="—"&&<div className="text-xs text-slate-400 mt-0.5">{selected.court} · {selected.caseNumber}</div>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={()=>printCase(selected)} title="인쇄" className="btn-ghost text-xs px-2.5">🖨️</button>
                    <button onClick={()=>{setEditCase(selected);setShowForm(true);}} className="btn-ghost text-xs">수정</button>
                  </div>
                </div>
                <div className="flex border-b border-slate-100 px-5 flex-shrink-0 overflow-x-auto">
                  {TABS.map(([key,label])=>{const cnt=tabCount(key);return(
                    <button key={key} onClick={()=>setActiveTab(key)} className={`py-2.5 px-1 mr-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 flex-shrink-0 ${activeTab===key?"border-indigo-500 text-indigo-600":"border-transparent text-slate-400 hover:text-slate-600"}`}>
                      {label}{cnt>0&&<span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab===key?"bg-indigo-100 text-indigo-600":"bg-slate-100 text-slate-500"}`}>{cnt}</span>}
                    </button>
                  );})}
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  {activeTab==="overview"?<OverviewTab c={selected} onUpdate={saveCase}/>
                   :activeTab==="memos"?<MemosTab c={selected} onUpdate={saveCase} scriptUrl={scriptUrl}/>
                   :activeTab==="todos"?<TodosTab c={selected} onUpdate={saveCase}/>
                   :<DocumentsTab c={selected} onUpdate={saveCase}/>}
                </div>
              </>
            ):(
              <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">좌측에서 사건을 선택하세요</div>
            )}
          </div>
        </div>
      </div>
      {showAI&&<AiParseModal cases={cases} onClose={()=>setShowAI(false)} onApply={applyAI}/>}
      {showSearch&&<SearchModal cases={cases} onClose={()=>setShowSearch(false)} onSelectCase={selectCase}/>}
      {showForm&&<CaseFormModal initial={editCase} onSave={saveCase} onClose={()=>{setShowForm(false);setEditCase(null);}}/>}
      {showSettings&&<SettingsModal scriptUrl={scriptUrl} onSave={setScriptUrl} onClose={()=>setShowSettings(false)}/>}
    </>
  );
}
