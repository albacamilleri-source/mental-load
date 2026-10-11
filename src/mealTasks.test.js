import { loadMealPlanTasks, mealNeedsDefrosting } from './mealTasks';

function clientWith(dataByTable) {
  return {
    from(table) {
      const query = {
        select: () => query,
        gte: () => query,
        lte: () => query,
        then: (resolve, reject) => Promise.resolve({ data: dataByTable[table] || [], error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

test('detects meat and fish from recipe ingredients or tags', () => {
  expect(mealNeedsDefrosting({title:'Curry',ingredients:[{name:'chicken thighs'}]}, [])).toBe(true);
  expect(mealNeedsDefrosting({title:'Tacos',ingredients:[]}, ['beef'])).toBe(true);
  expect(mealNeedsDefrosting({title:'Tomato pasta',ingredients:[{name:'parmesan'}]}, ['vegetarian'])).toBe(false);
});

test('scheduled meals use every library for prep and defrost checklists', async () => {
  const recipe = {recipe_key:'adult-lunch-chicken',title:'Chicken Wrap',source_ref:'Shared book p.10',requires_prep:true,is_deleted:false,ingredients:[{name:'chicken breast'}]};
  const client = clientWith({
    weekly_meals: [{id:'dinner-1',week_of:'2026-W42',meal_number:3,title:'Chicken Wrap',source_ref:'Shared book p.10'}],
    lunch_recipe_library: [recipe],
    lunch_recipe_tags: [{recipe_key:'adult-lunch-chicken',tags:['chicken']}],
  });
  const result = await loadMealPlanTasks(client, '2026-10-14', '2026-10-14');
  expect(result.prep).toHaveLength(1);
  expect(result.defrost).toHaveLength(1);
  expect(result.defrost[0]).toMatchObject({mealType:'dinner',scheduledFor:'2026-10-14',recipeKey:'adult-lunch-chicken',label:'Dinner'});
});
