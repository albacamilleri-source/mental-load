const contexts = {
  breakfast: {
    key: "breakfast",
    label: "breakfast",
    tagGuidance: "Use practical breakfast tags such as eggs, oats, make ahead, quick, fruit, savory, or vegetarian.",
  },
  lunch: {
    key: "lunch",
    label: "lunch",
    tagGuidance: "Use practical lunch tags such as sandwich, salad, soup, pasta, leftovers, quick, vegetarian, chicken, or fish.",
  },
  sides: {
    key: "sides",
    label: "side dish",
    tagGuidance: "Use practical side-dish tags such as vegetables, salad, potatoes, grains, make ahead, quick, vegetarian, or freezer friendly.",
  },
  treats: {
    key: "treats",
    label: "treat or snack",
    tagGuidance: "Use practical treat and snack tags such as baking, no bake, chocolate, fruit, bars, cookies, make ahead, freezer friendly, or lunchbox.",
  },
  dinner: {
    key: "dinner",
    label: "dinner",
    tagGuidance: "Use practical tags such as soup, pasta, instant pot, slow cooker, vegetarian, chicken, fish, or quick.",
  },
};

export function importMealContext(value) {
  return contexts[value] || contexts.dinner;
}
