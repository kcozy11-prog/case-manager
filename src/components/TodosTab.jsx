import { useState } from "react";
import { todayStr, dday, fmtDate } from "../utils";
import { DdayBadge } from "./Badges";

export default function TodosTab({ c, onUpdate }) {
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
            {t.fromCalendar && <span className="text-blue-400 mr-1" title="캘린더에서 가져옴">📅</span>}
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
