import { useState } from "react";
import { sortPendingTodos } from "../todoSort";
import { getDueDateLabel, getTodoCardTone, isOverdueTodo } from "../todoUi";
import { todayStr } from "../utils";
import { markTodoDone, markTodoPending } from "../caseLink";
import { DdayBadge } from "./Badges";

const EMPTY_TODO = { text: "", details: "", priority: "보통", dueDate: "" };

const PRIO = {
  "높음": { label: "text-red-500 font-semibold" },
  "보통": { label: "text-slate-700" },
};

// 할 일 입력/수정 폼.
// 반드시 모듈 최상위 컴포넌트여야 한다: 부모 컴포넌트 안에서 매 렌더마다 새로 정의되면
// React 가 매 키 입력마다 폼을 통째로 다시 마운트해 포커스가 튕기고 한글 조합(IME)이
// 자음·모음 단위로 끊긴다. 입력 중 값은 이 컴포넌트의 로컬 상태에만 두고, 저장 시 1회 상위로 넘긴다.
function TodoForm({ initial, onSave, onCancel, saveLabel = "저장" }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_TODO, ...(initial || {}) }));
  const canSave = draft.text.trim().length > 0;

  return (
    <div className="border border-indigo-200 rounded-lg px-3 py-2.5 bg-indigo-50 space-y-2">
      <input
        className="input-sm w-full"
        placeholder="할 일 제목 *"
        value={draft.text}
        onChange={e => setDraft(p => ({ ...p, text: e.target.value }))}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
        autoFocus
      />
      <textarea
        className="input-sm w-full min-h-[96px] resize-y"
        placeholder="상세 내용(길게 작성 가능)"
        value={draft.details}
        onChange={e => setDraft(p => ({ ...p, details: e.target.value }))}
      />
      <div className="flex gap-2 max-sm:flex-col">
        <select className="input-sm flex-1" value={draft.priority}
          onChange={e => setDraft(p => ({ ...p, priority: e.target.value }))}>
          <option>높음</option><option>보통</option>
        </select>
        <input className="input-sm flex-1" type="date" value={draft.dueDate}
          onChange={e => setDraft(p => ({ ...p, dueDate: e.target.value }))} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-xs py-1 px-3">취소</button>
        <button onClick={() => { if (canSave) onSave({ ...draft, text: draft.text.trim() }); }}
          disabled={!canSave} className="btn-primary text-xs py-1 px-3 disabled:opacity-40">{saveLabel}</button>
      </div>
    </div>
  );
}

function TodoRow({ t, onToggleDone, onDelete, onStartEdit, onPush, pushing, pushError, canPush }) {
  const p = PRIO[t.priority] || PRIO["보통"];
  const overdue = isOverdueTodo(t);

  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-all ${getTodoCardTone(t)}`}>
      <button onClick={() => onToggleDone(t.id)}
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
      {canPush && t.dueDate && (
        <button
          onClick={() => onPush(t)}
          disabled={pushing}
          className={`flex-shrink-0 text-xs px-1 disabled:opacity-40 ${
            t.googleEventId ? "text-emerald-500 hover:text-emerald-600" : "text-slate-300 hover:text-indigo-400"
          }`}
          title={t.googleEventId ? "캘린더에 동기화됨 (다시 누르면 갱신)" : "구글 캘린더에 추가"}>
          {pushing ? "…" : t.googleEventId ? "📅✓" : "📅"}
        </button>
      )}
      <button onClick={() => onStartEdit(t)} className="text-slate-300 hover:text-indigo-400 flex-shrink-0 text-xs px-1" title="수정">✎</button>
      <button onClick={() => onDelete(t.id)} className="text-slate-200 hover:text-red-400 flex-shrink-0 text-xs px-1">✕</button>
      {pushError && (
        <span className="text-[11px] text-red-500 flex-shrink-0">⚠ {pushError}</span>
      )}
    </div>
  );
}

export default function TodosTab({ c, onUpdate, onPushTodo }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pushingId, setPushingId] = useState(null);
  const [pushError, setPushError] = useState(null);

  const todos = c.todos || [];
  const pending = todos.filter(t => !t.done);

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

  const toggleDone = (id) => {
    const target = todos.find(t => t.id === id);
    if (!target) return;
    onUpdate(target.done ? markTodoPending(c, id) : markTodoDone(c, id, todayStr));
  };

  const delTodo = (id) => {
    onUpdate({ ...c, todos: todos.filter(t => t.id !== id) });
  };

  const addTodo = (draft) => {
    onUpdate({
      ...c,
      todos: [...todos, { id: Date.now(), done: false, ...draft }],
    });
    setAdding(false);
  };

  const saveEdit = (id, draft) => {
    onUpdate({
      ...c,
      todos: todos.map(td => td.id === id ? { ...td, ...draft } : td),
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      {pending.length === 0 && !adding && (
        <div className="text-sm text-slate-400 italic py-4 text-center">등록된 미완료 할 일이 없습니다.</div>
      )}
      <div className="space-y-2">
        {sortPendingTodos(pending).map(t => (
          editingId === t.id ? (
            <TodoForm
              key={t.id}
              initial={{ text: t.text || "", details: t.details || "", dueDate: t.dueDate || "", priority: t.priority || "보통" }}
              onSave={(draft) => saveEdit(t.id, draft)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TodoRow
              key={t.id}
              t={t}
              onToggleDone={toggleDone}
              onDelete={delTodo}
              onStartEdit={(todo) => setEditingId(todo.id)}
              onPush={pushTodo}
              pushing={pushingId === t.id}
              pushError={pushError && pushError.id === t.id ? pushError.msg : null}
              canPush={Boolean(onPushTodo)}
            />
          )
        ))}
      </div>

      {adding ? (
        <TodoForm initial={EMPTY_TODO} onSave={addTodo} onCancel={() => setAdding(false)} saveLabel="추가" />
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-slate-200 text-slate-400 text-sm py-2.5 rounded-lg hover:border-indigo-300 hover:text-indigo-400 transition-colors">
          + 할 일 추가
        </button>
      )}

    </div>
  );
}
