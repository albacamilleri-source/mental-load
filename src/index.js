import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import MealPlanner from './MealPlanner';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
const isMealPlanner = window.location.hash === '#meal-planner';
const RootApp = isMealPlanner ? MealPlanner : App;

root.render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
