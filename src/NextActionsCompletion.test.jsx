import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TasksScreen } from "./App";

const mockFrom = jest.fn();
const mockRemoveChannel = jest.fn();

jest.mock("./MealPlanner", () => ({ __esModule: true, default: () => null }));
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (...args) => mockFrom(...args),
    channel: () => {
      const subscription = { on: () => subscription, subscribe: () => subscription };
      return subscription;
    },
    removeChannel: (...args) => mockRemoveChannel(...args),
  }),
}));

let container;
let root;
let writes;

beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  writes = [];
  mockFrom.mockImplementation(table => {
    let action = "";
    let payload;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      update: value => { action = "update"; payload = value; return query; },
      insert: value => { action = "insert"; payload = value; return query; },
      delete: () => { action = "delete"; return query; },
      then: (resolve, reject) => {
        if (action) writes.push({ table, action, payload });
        const data = !action && table === "next_actions"
          ? [{ id: "task-1", text: "Book dentist", notes: "", context: "phone", due_date: null, done: false }]
          : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (container.isConnected) await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test("commits a pending Next Action completion when leaving before Undo expires", async () => {
  await act(async () => root.render(<TasksScreen who="alba" />));
  await act(async () => container.querySelector('[aria-label="Complete Book dentist"]').click());
  await act(async () => { jest.advanceTimersByTime(600); });

  expect(container.textContent).not.toContain("Book dentist");
  expect(writes).not.toContainEqual({ table: "next_actions", action: "update", payload: { done: true } });

  await act(async () => {
    root.unmount();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(writes).toContainEqual({ table: "next_actions", action: "update", payload: { done: true } });
  expect(writes).toContainEqual(expect.objectContaining({ table: "history_items", action: "insert" }));
});
