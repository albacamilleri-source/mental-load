import { loadMealPlanTasks, mealNeedsDefrosting, sundayWeekRange } from './mealTasks';

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

test('Sunday prep weeks run through Saturday', () => {
  expect(sundayWeekRange('2026-10-14')).toEqual({start:'2026-10-11',end:'2026-10-17'});
  expect(sundayWeekRange('2026-10-18')).toEqual({start:'2026-10-18',end:'2026-10-24'});
});

test('paused scheduled meals never create prep or defrost tasks', async () => {
  const recipe = {recipe_key:'paused-chicken',title:'Chicken Dinner',source_ref:'Book p.1',requires_prep:true,is_deleted:false,ingredients:[{name:'chicken'}]};
  const client = clientWith({
    weekly_meals: [{id:'dinner-5',week_of:'2026-W42',meal_number:5,title:'Chicken Dinner',source_ref:'Book p.1'}],
    meal_day_pauses: [{week_of:'2026-W42',day_number:5,is_paused:true}],
    meal_recipe_library: [recipe],
  });
  const result = await loadMealPlanTasks(client, '2026-10-16', '2026-10-16');
  expect(result).toEqual({prep:[],defrost:[]});
});
