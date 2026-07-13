import TodosTab from "./TodosTab";
import { buildStandaloneTodoCase, STANDALONE_TODOS_TITLE } from "../standaloneTodos";

export default function StandaloneTodosModal({ todos, onUpdate, onPushTodo, onClose }) {
  const standaloneCase = buildStandaloneTodoCase(todos);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4" style={{ background: "#1E293B" }}>
          <div>
            <div className="text-white font-semibold">📝 {STANDALONE_TODOS_TITLE}</div>
            <div className="text-slate-400 text-xs mt-0.5">특정 사건과 연결하지 않는 개인/공통 업무를 관리합니다.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">
          <TodosTab c={standaloneCase} onUpdate={onUpdate} onPushTodo={onPushTodo} />
        </div>
      </div>
    </div>
  );
}
