const path = require('path');

// Recipe PDFs, raw recipe text and extracted ingredient files live beside the front-end pages.
const publicDir = path.join(__dirname, '..', '..', '..', 'public', 'food-room');

module.exports = { publicDir };
