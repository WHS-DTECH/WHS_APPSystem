const express = require('express');
const router = express.Router();

// Sub-routers
const inventoryRouter = require('./inventory');
router.use('/inventory', inventoryRouter);

const aisleKeywordsRouter = require('./aisleKeywords');
router.use('/aisle_keywords', aisleKeywordsRouter);

const desiredServingsRouter = require('./desiredServings');
router.use('/desired_servings_ingredients', desiredServingsRouter);

const aisleCategoryRouter = require('./aisleCategory');
router.use('/aisle_category', aisleCategoryRouter);

const foodBrandsRouter = require('./foodBrands');
router.use('/food_brands', foodBrandsRouter);

const shoppingListRouter = require('./shoppingList');
router.use('/shopping_list', shoppingListRouter);

module.exports = router;
