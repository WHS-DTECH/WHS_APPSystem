const express = require('express');
const router = express.Router();
const inventoryRouter = require('./inventory');
router.use('/inventory', inventoryRouter);

// --- CRUD: Aisle Keywords ---
const aisleKeywordsRouter = require('./aisleKeywords');
router.use('/aisle_keywords', aisleKeywordsRouter);

// --- Desired Servings Endpoints ---
const desiredServingsRouter = require('./desiredServings');
router.use('/desired_servings_ingredients', desiredServingsRouter);

// --- Aisle Category CRUD API ---
// Modularized: handled in aisleCategory.js
const aisleCategoryRouter = require('./aisleCategory');
router.use('/aisle_category', aisleCategoryRouter);

// --- Food Brands CRUD API ---
// Modularized: handled in foodBrands.js
const foodBrandsRouter = require('./foodBrands');
router.use('/food_brands', foodBrandsRouter);

// --- Shopping List Endpoints ---
const shoppingListRouter = require('./shoppingList');
router.use('/shopping_list', shoppingListRouter);

module.exports = router;
