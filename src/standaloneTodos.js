export const STANDALONE_TODOS_CASE_ID = "__standalone_todos__";
export const STANDALONE_TODOS_TITLE = "일반 할 일";

const defaultTodoId = () => Date.now() + Math.floor(Math.random() * 10000);

export function readStandaloneTodos(data) {
  return Array.isArray(data?.todos) ? data.todos : [];
}

export function buildStandaloneTodoCase(todos = []) {
  return {
    id: STANDALONE_TODOS_CASE_ID,
    title: STANDALONE_TODOS_TITLE,
    type: "자문",
    status: "진행중",
    client: "",
    opponent: "",
    manager: "",
    managerOrg: "",
    managerContact: "",
    court: "",
    caseNumber: "",
    retainer: { amount: "", date: "", successFee: "", successFeeAmount: "", paidAmount: "", successFeeCollected: "" },
    closeResult: "",
    closeReason: "",
    closedDate: "",
    hearings: [],
    timeline: [],
    memos: [],
    documents: [],
    todos: Array.isArray(todos) ? todos : [],
    briefs: [],
  };
}

export function buildStandaloneTodoFromGoogleTask(task) {
  const dueDate = task?.due ? task.due.split("T")[0] : "";
  return {
    text: task?.title || "",
    details: task?.notes || "",
    priority: "보통",
    dueDate,
    done: task?.status === "completed",
    calendarTaskId: task?.id || "",
    fromTasks: true,
    sourceTaskList: task?._listName || "",
    sourceUpdatedAt: task?.updated || "",
  };
}

export function mergeGoogleTaskIntoStandaloneTodos(todos = [], task, makeId = defaultTodoId) {
  const nextTodo = buildStandaloneTodoFromGoogleTask(task);
  const currentTodos = Array.isArray(todos) ? todos : [];
  const index = currentTodos.findIndex((t) => t.calendarTaskId === task?.id);

  if (index >= 0) {
    // 완료 상태는 Google 할 일이 지난 동기화 뒤에 바뀌었을 때만 따른다 (앱에서 체크한 값 보존)
    const current = currentTodos[index];
    const googleUnchanged = !!current.sourceUpdatedAt && !!nextTodo.sourceUpdatedAt
      && current.sourceUpdatedAt === nextTodo.sourceUpdatedAt;
    const done = googleUnchanged ? !!current.done : nextTodo.done;
    const mergedTodos = currentTodos.map((todo, i) => (
      i === index
        ? { ...todo, ...nextTodo, id: todo.id, done }
        : todo
    ));
    return { todos: mergedTodos, added: false, updated: true };
  }

  return {
    todos: [...currentTodos, { id: makeId(), ...nextTodo }],
    added: true,
    updated: false,
  };
}
