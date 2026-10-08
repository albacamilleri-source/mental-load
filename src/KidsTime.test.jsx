import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { KidsTimeScreen } from "./App";

const mockFrom = jest.fn();
jest.mock("./MealPlanner", () => ({ __esModule: true, default: () => null }));
jest.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (...args) => mockFrom(...args), channel: jest.fn(), removeChannel: jest.fn() }) }));

let container;
let root;
let inserted;
let saveError;

function queryFor(table) {
  let action = "read";
  let payload;
  const query = {
    select: () => query,
    order: () => query,
    insert: value => { action = "insert"; payload = value; inserted = value; return query; },
    single: () => query,
    then: resolve => Promise.resolve(action === "insert"
      ? saveError ? { data: null, error: { message: saveError } } : { data: { id: 3, ...payload }, error: null }
      : { data: table === "kids_time_options" ? [{ id: 1, label: "Read", icon: "📚", description: "Story time", sort_order: 2 }] : [], error: null }).then(resolve),
  };
  return query;
}

const change = (label, value) => {
  const input = container.querySelector(`[aria-label="${label}"]`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  inserted = null; saveError = ""; mockFrom.mockImplementation(queryFor);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<KidsTimeScreen/>));
});

afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });

test("adds a new Kids Time activity and displays it immediately", async () => {
  await act(async () => container.querySelector('[aria-label="Add a Kids Time activity"]').click());
  await act(async () => {
    change("Kids Time activity name", "Build a den");
    change("Kids Time activity icon", "⛺");
    change("Kids Time activity description", "Use blankets and cushions");
  });
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save activity").click());
  expect(inserted).toEqual({ label: "Build a den", icon: "⛺", description: "Use blankets and cushions", sort_order: 3 });
  expect(container.textContent).toContain("Build a den");
  expect(container.querySelector('[aria-label="New Kids Time activity"]')).toBeNull();
});

test("keeps the form open and shows a useful save error", async () => {
  saveError = "Database unavailable";
  await act(async () => container.querySelector('[aria-label="Add a Kids Time activity"]').click());
  await act(async () => change("Kids Time activity name", "Make puppets"));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save activity").click());
  expect(container.querySelector('[role="alert"]').textContent).toContain("Database unavailable");
  expect(container.querySelector('[aria-label="New Kids Time activity"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Make puppetsUse");
});
