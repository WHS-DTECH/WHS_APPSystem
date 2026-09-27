const fs = require('fs');
const path = require('path');

// Load extracted ingredients from ExtractedIngredients/RecipeID.txt
function loadExtractedIngredients(recipeId, callback) {
  const dir = path.join(__dirname, 'ExtractedIngredients');
  const filePath = path.join(dir, `${recipeId}.txt`);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`[ExtractedIngredients] Failed to load file: ${filePath}`, err);
      callback(err, null);
    } else {
      console.log(`[ExtractedIngredients] Successfully loaded file: ${filePath}`);
      callback(null, data);
    }
  });
}

module.exports = { loadExtractedIngredients };
