import { fmtDate } from "./utils.js";

function normalizeDate(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function isOverdueTodo(todo, today = new Date()) {
  if (!todo?.dueDate || todo?.done) return false;

  const dueDate = normalizeDate(todo.dueDate);
  const compareDate = normalizeDate(today);
  return dueDate < compareDate;
}

export function getTodoCardTone(todo, today = new Date()) {
  if (todo?.done) return "bg-slate-50 border-slate-100 opacity-50";
  if (isOverdueTodo(todo, today)) return "bg-rose-50 border-rose-300 shadow-md shadow-rose-100 hover:border-rose-400";
  return "bg-white border-slate-100 hover:border-slate-200 shadow-sm";
}

export function getDueDateLabel(todo) {
  return todo?.dueDate ? `기한 ${fmtDate(todo.dueDate)}` : "";
}
