const fs = require('fs');
const path = require('path');

// Save extracted ingredients to ExtractedIngredients/RecipeID.txt
function saveExtractedIngredients(recipeId, ingredientsText, callback) {
  const dir = path.join(__dirname, 'ExtractedIngredients');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${recipeId}.txt`);
  fs.writeFile(filePath, ingredientsText, (err) => {
    if (err) {
      console.error(`[ExtractedIngredients] Failed to save file: ${filePath}`, err);
    } else {
      console.log(`[ExtractedIngredients] Successfully saved file: ${filePath}`);
    }
    callback(err, filePath);
  });
}

module.exports = { saveExtractedIngredients };
