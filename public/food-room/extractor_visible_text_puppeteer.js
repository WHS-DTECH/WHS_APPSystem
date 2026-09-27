const puppeteer = require('puppeteer');

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
    window.scrollTo(0, 0);
  });
}

async function extractVisibleData(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await autoScroll(page);

    const payload = await page.evaluate(() => {
      const parseRecipeInstructionsFromJsonLd = () => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        const lines = [];

        const unwrapCandidates = (json) => {
          if (Array.isArray(json)) return json;
          if (json && Array.isArray(json['@graph'])) return json['@graph'];
          return [json];
        };

        const normalizeStep = (step) => {
          if (!step) return '';
          if (typeof step === 'string') return step.trim();
          if (typeof step === 'object') {
            return String(step.text || step.name || step['@value'] || '').trim();
          }
          return '';
        };

        for (const script of scripts) {
          const content = script.textContent || '';
          if (!content.trim()) continue;

          let parsed;
          try {
            parsed = JSON.parse(content);
          } catch (_) {
            continue;
          }

          const nodes = unwrapCandidates(parsed);
          for (const node of nodes) {
            if (!node) continue;
            const type = node['@type'];
            const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
            if (!isRecipe) continue;

            const instructions = node.recipeInstructions;
            if (!instructions) continue;

            if (Array.isArray(instructions)) {
              for (const step of instructions) {
                const text = normalizeStep(step);
                if (text) lines.push(text);
              }
            } else {
              const single = normalizeStep(instructions);
              if (single) lines.push(single);
            }
          }
        }

        return lines;
      };

      const visibleText = (document.body && document.body.innerText ? document.body.innerText : '').trim();

      const listItems = Array.from(document.querySelectorAll('ol li, ul li'))
        .map((el) => (el.innerText || '').trim())
        .filter((line) => line.length > 1)
        .slice(0, 300);

      const headingCandidates = [];
      const headingRegex = /(method|instructions|directions|how to make|preparation)/i;
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5'));

      for (const heading of headings) {
        const title = (heading.innerText || '').trim();
        if (!headingRegex.test(title)) continue;

        const lines = [];
        let sibling = heading.nextElementSibling;
        let hops = 0;
        while (sibling && hops < 12) {
          if (/^H[1-5]$/.test(sibling.tagName)) break;
          const text = (sibling.innerText || '').trim();
          if (text) lines.push(text);
          sibling = sibling.nextElementSibling;
          hops += 1;
        }

        if (lines.length > 0) {
          headingCandidates.push(`${title}\n${lines.join('\n')}`);
        }
      }

      const jsonLdInstructions = parseRecipeInstructionsFromJsonLd();

      return {
        visibleText,
        listItems,
        headingCandidates,
        jsonLdInstructions
      };
    });

    return payload;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node extractor_visible_text_puppeteer.js <url>');
    process.exit(1);
  }

  extractVisibleData(url)
    .then((data) => {
      process.stdout.write(JSON.stringify(data));
    })
    .catch((err) => {
      console.error('Error extracting visible data:', err);
      process.exit(1);
    });
}

module.exports = { extractVisibleData };
