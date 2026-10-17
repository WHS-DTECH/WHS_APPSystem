const path = require('path');

// Recipe PDFs, raw recipe text and extracted ingredient files live beside the front-end pages.
const publicDir = path.join(__dirname, '..', '..', '..', 'public', 'food-room');

// Public address of the Food Room pages, used for links inside emails.
function foodRoomSiteUrl() {
  const base = String(process.env.SITE_URL || process.env.APP_URL || process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://whs-appsystem.onrender.com').trim().replace(/\/+$/, '');
  return /\/food-room$/.test(base) ? base : `${base}/food-room`;
}

module.exports = { publicDir, foodRoomSiteUrl };
