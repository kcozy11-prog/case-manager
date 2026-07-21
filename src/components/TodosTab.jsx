import { useState } from "react";
import { sortPendingTodos } from "../todoSort";
import { getDueDateLabel, getTodoCardTone, isOverdueTodo } from "../todoUi";
import { todayStr } from "../utils";
import { markTodoDone, markTodoPending } from "../caseLink";
import { DdayBadge } from "./Badges";

const EMPTY_TODO = { text: "", details: "", priority: "보통", dueDate: "" };

export default function TodosTab({ c, onUpdate, onPushTodo }) {
  const [newTodo, setNewTodo] = useState(EMPTY_TODO);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(EMPTY_TODO);
  const [pushingId, setPushingId] = useState(null);
  const [pushError, setPushError] = useState(null);

  const pushTodo = async (t) => {
    if (!onPushTodo || !t.dueDate) return;
    setPushingId(t.id); setPushError(null);
    try {
      const eventId = await onPushTodo({
        eventId: t.googleEventId, title: t.text, details: t.details, date: t.dueDate,
      });
      onUpdate({
        ...c,
        todos: (c.todos || []).map(td =>
          td.id === t.id ? { ...td, googleEventId: eventId, calSyncedAt: new Date().toISOString() } : td),
      });
    } catch (e) {
      setPushError({ id: t.id, msg: e.message || "캘린더 등록 실패" });
    } finally {
      setPushingId(null);
    }
  };

  const todos = c.todos || [];
  const pending = todos.filter(t => !t.done);

  const toggleDone = (id) => {
    const target = todos.find(t => t.id === id);
    if (!target) return;
    onUpdate(target.done ? markTodoPending(c, id) : markTodoDone(c, id, todayStr));
  };

  const delTodo = (id) => {
    onUpdate({ ...c, todos: todos.filter(t => t.id !== id) });
  };

  const addTodo = () => {
    if (!newTodo.text.trim()) return;
    onUpdate({
      ...c,
      todos: [...todos, { id: Date.now(), done: false, ...newTodo }],
    });
    setNewTodo(EMPTY_TODO);
    setAdding(false);
  };

  const PRIO = {
    "높음": { label: "text-red-500 font-semibold" },
    "보통": { label: "text-slate-700" },
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditData({
      text: t.text || "",
      details: t.details || "",
      dueDate: t.dueDate || "",
      priority: t.priority || "보통",
    });
  };

  const saveEdit = (t) => {
    if (!editData.text.trim()) return;
    onUpdate({
      ...c,
      todos: todos.map(td => td.id === t.id ? { ...td, ...editData } : td),
    });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const TodoRow = ({ t }) => {
    const p = PRIO[t.priority] || PRIO["보통"];
    const overdue = isOverdueTodo(t);
    const isEditing = editingId === t.id;

    if (isEditing) {
      return (
        <div className="border border-indigo-200 rounded-lg px-3 py-2.5 bg-indigo-50 space-y-2">
          <input
            className="input-sm w-full"
            placeholder="할 일 제목 *"
            value={editData.text}
            onChange={e => setEditData(p => ({ ...p, text: e.target.value }))}
            autoFocus
          />
          <textarea
            className="input-sm w-full min-h-[96px] resize-y"
            placeholder="상세 내용(길게 작성 가능)"
            value={editData.details}
            onChange={e => setEditData(p => ({ ...p, details: e.target.value }))}
          />
          <div className="flex gap-2 max-sm:flex-col">
            <select className="input-sm flex-1" value={editData.priority}
              onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))}>
              <option>높음</option><option>보통</option>
            </select>
            <input className="input-sm flex-1" type="date" value={editData.dueDate}
              onChange={e => setEditData(p => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancelEdit} className="btn-ghost text-xs py-1 px-3">취소</button>
            <button onClick={() => saveEdit(t)} className="btn-primary text-xs py-1 px-3">저장</button>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-all ${getTodoCardTone(t)}`}>
        <button onClick={() => toggleDone(t.id)}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            t.done ? "bg-emerald-400 border-emerald-400 text-white" : "border-slate-300 hover:border-indigo-400"
          }`}>
          {t.done && <span className="text-white text-xs leading-none">✓</span>}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className={`text-sm leading-snug whitespace-pre-wrap break-words ${t.done ? "line-through text-slate-400" : p.label}`}>
            {t.fromCalendar && <span className="text-blue-400 mr-1" title="캘린더에서 가져옴">📅</span>}
            {t.fromTasks && <span className="text-indigo-400 mr-1" title="Google Tasks에서 가져옴">📋</span>}
            {t.text}
          </div>
          {t.details && (
            <div className={`text-xs whitespace-pre-wrap break-words leading-relaxed ${t.done ? "text-slate-300" : "text-slate-500"}`}>
              {t.details}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {overdue && (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                기한 지남
              </span>
            )}
            {t.dueDate && (
              <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                {overdue ? "⚠" : "📅"} {getDueDateLabel(t)}
                {!t.done && <DdayBadge dateStr={t.dueDate} small />}
              </span>
            )}
          </div>
        </div>
        {onPushTodo && t.dueDate && (
          <button
            onClick={() => pushTodo(t)}
            disabled={pushingId === t.id}
            className={`flex-shrink-0 text-xs px-1 disabled:opacity-40 ${
              t.googleEventId ? "text-emerald-500 hover:text-emerald-600" : "text-slate-300 hover:text-indigo-400"
            }`}
            title={t.googleEventId ? "캘린더에 동기화됨 (다시 누르면 갱신)" : "구글 캘린더에 추가"}>
            {pushingId === t.id ? "…" : t.googleEventId ? "📅✓" : "📅"}
          </button>
        )}
        <button onClick={() => startEdit(t)} className="text-slate-300 hover:text-indigo-400 flex-shrink-0 text-xs px-1" title="수정">✎</button>
        <button onClick={() => delTodo(t.id)} className="text-slate-200 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
        {pushError && pushError.id === t.id && (
          <span className="text-[11px] text-red-500 flex-shrink-0">⚠ {pushError.msg}</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {pending.length === 0 && !adding && (
        <div className="text-sm text-slate-400 italic py-4 text-center">등록된 미완료 할 일이 없습니다.</div>
      )}
      <div className="space-y-2">
        {sortPendingTodos(pending).map(t => <TodoRow key={t.id} t={t} />)}
      </div>

      {adding ? (
        <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <input className="input-sm w-full" placeholder="할 일 제목 *" value={newTodo.text}
            onChange={e => setNewTodo(p => ({ ...p, text: e.target.value }))} autoFocus />
          <textarea className="input-sm w-full min-h-[96px] resize-y" placeholder="상세 내용(길게 작성 가능)" value={newTodo.details}
            onChange={e => setNewTodo(p => ({ ...p, details: e.target.value }))} />
          <div className="flex gap-2 max-sm:flex-col">
            <select className="input-sm flex-1" value={newTodo.priority}
              onChange={e => setNewTodo(p => ({ ...p, priority: e.target.value }))}>
              <option>높음</option><option>보통</option>
            </select>
            <input className="input-sm flex-1" type="date" value={newTodo.dueDate}
              onChange={e => setNewTodo(p => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setNewTodo(EMPTY_TODO); }} className="btn-ghost text-xs">취소</button>
            <button onClick={addTodo} className="btn-primary text-xs py-1 px-3">추가</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">
          + 할 일 추가
        </button>
      )}

    </div>
  );
}
