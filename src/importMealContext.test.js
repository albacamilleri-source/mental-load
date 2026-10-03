import { importMealContext } from "../supabase/functions/meal-recipe-import/meal-type";

describe("recipe import meal contexts", () => {
  test("uses side-dish extraction and tag guidance", () => {
    const context = importMealContext("sides");

    expect(context.label).toBe("side dish");
    expect(context.tagGuidance).toContain("side-dish tags");
    expect(context.tagGuidance).toContain("vegetables");
  });

  test("uses treat and snack extraction and tag guidance", () => {
    const context = importMealContext("treats");

    expect(context.label).toBe("treat or snack");
    expect(context.tagGuidance).toContain("treat and snack tags");
    expect(context.tagGuidance).toContain("lunchbox");
  });

  test("keeps dinner as the safe fallback", () => {
    expect(importMealContext("unknown").key).toBe("dinner");
    expect(importMealContext().key).toBe("dinner");
  });
});
