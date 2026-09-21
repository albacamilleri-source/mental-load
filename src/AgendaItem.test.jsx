import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EditableAgendaItem } from "./App";

jest.mock("./MealPlanner", () => ({ __esModule: true, default: () => null }));
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  }),
}));

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const renderItem = async (overrides = {}) => {
  const props = {
    item: { id: "agenda-1", text: "Discuss school forms", notes: "Bring the letter" },
    onComplete: jest.fn(),
    onSave: jest.fn().mockResolvedValue(true),
    onDelete: jest.fn(),
    ...overrides,
  };
  await act(async () => root.render(<EditableAgendaItem {...props} />));
  return props;
};

const changeValue = (element, value) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

test("edits an agenda item's title and notes without completing it", async () => {
  const props = await renderItem();

  await act(async () => container.querySelector('[aria-label="Edit Discuss school forms"]').click());
  const title = container.querySelector('[aria-label="Agenda item"]');
  const notes = container.querySelector('[aria-label="Agenda notes"]');

  await act(async () => {
    changeValue(title, "Discuss holiday dates");
    changeValue(notes, "Check both calendars");
  });
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save").click());

  expect(props.onSave).toHaveBeenCalledWith(props.item, "Discuss holiday dates", "Check both calendars");
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Agenda item"]')).toBeNull();
});

test("keeps completion on the checkbox and exposes delete while editing", async () => {
  const props = await renderItem();

  await act(async () => container.querySelector('[aria-label="Complete Discuss school forms"]').click());
  expect(props.onComplete).toHaveBeenCalledWith(props.item);
  expect(container.querySelector('[aria-label="Agenda item"]')).toBeNull();

  await act(async () => container.querySelector('[aria-label="Edit Discuss school forms"]').click());
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Delete").click());
  expect(props.onDelete).toHaveBeenCalledWith(props.item);
});
