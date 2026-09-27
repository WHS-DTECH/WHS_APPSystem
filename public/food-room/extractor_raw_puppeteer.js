// extractor_raw_puppeteer.js
// This script uses Puppeteer to fetch and extract rendered recipe data from a URL.
// It can be called from extractor_raw.js to get the real HTML content for extraction.

const puppeteer = require('puppeteer');

/**
 * Fetches the fully rendered HTML of a recipe page using Puppeteer.
 * @param {string} url - The URL of the recipe page to extract.
 * @returns {Promise<string>} - The full HTML after JS rendering.
 */
async function fetchRenderedHTML(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const html = await page.content();
  await browser.close();
  return html;
}

// Example usage: node extractor_raw_puppeteer.js <url>
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node extractor_raw_puppeteer.js <url>');
    process.exit(1);
  }
  fetchRenderedHTML(url)
    .then(html => {
      console.log(html);
    })
    .catch(err => {
      console.error('Error fetching rendered HTML:', err);
      process.exit(1);
    });
}

module.exports = { fetchRenderedHTML };