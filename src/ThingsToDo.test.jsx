import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ThingsToDoScreen } from "./App";

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
      : { data: table === "places" ? [{ id: 1, name: "Local playground", type: "Playground", setting: "Outdoor" }] : [], error: null }).then(resolve),
  };
  return query;
}

function change(label, value) {
  const input = container.querySelector(`[aria-label="${label}"]`);
  const prototype = input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  inserted = null; saveError = ""; mockFrom.mockImplementation(queryFor);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<ThingsToDoScreen/>));
});

afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });

test("adds a place from the Things To Do screen and displays it immediately", async () => {
  await act(async () => container.querySelector('[aria-label="Add a place to Things To Do"]').click());
  await act(async () => {
    change("Place name", "Playmobil FunPark");
    change("Place type", "Play Area");
    change("Place setting", "Indoor");
  });
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save place").click());
  expect(inserted).toEqual({ name: "Playmobil FunPark", type: "Play Area", setting: "Indoor" });
  expect(container.textContent).toContain("Playmobil FunPark");
  expect(container.querySelector('[aria-label="New place"]')).toBeNull();
});

test("keeps the place form open and shows a useful save error", async () => {
  saveError = "Database unavailable";
  await act(async () => container.querySelector('[aria-label="Add a place to Things To Do"]').click());
  await act(async () => change("Place name", "New park"));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save place").click());
  expect(container.querySelector('[role="alert"]').textContent).toContain("Database unavailable");
  expect(container.querySelector('[aria-label="New place"]')).not.toBeNull();
  expect(container.textContent).not.toContain("New parkActivity");
});
