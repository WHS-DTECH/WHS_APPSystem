
// Strategies for Serving Size Extractor (logic will be applied to rawData)
const strategies = [
  {
    name: 'Find common yield phrases: serves/makes/yield',
    fn: raw => {
      const match = raw.match(/\b(?:serves?|servings?|makes?|yield)\b\s*[:\-]?\s*(\d{1,3})\b/i);
      return match ? match[1] : '';
    }
  },
  {
    name: 'Hard-coded: <label class="field-label">Servings:</label> <text>24</text>',
    fn: raw => {
      const match = raw.match(/<label class="field-label">Servings:<\/label>\s*<text>(\d+)<\/text>/i);
      return match ? match[1] : '';
    }
  },
  {
    name: 'Look for <label class="field-label">Servings:</label> and get nearest number',
    fn: raw => {
      const match = raw.match(/<label class="field-label">Servings:<\/label>[^\d]*(\d+)/i);
      return match ? match[1] : '';
    }
  },
  {
    name: 'Look for <label> with Serving and get nearest number',
    fn: raw => {
      const match = raw.match(/<label[^>]*>[^<]*serving[^<]*<\/label>[^\d]*(\d+)/i);
      return match ? match[1] : '';
    }
  },
  {
    name: 'Find numbers near "serving"/"serves" in text',
    fn: raw => {
      const lines = raw.split(/\n|<br\s*\/?\s*>/i);
      for (let line of lines) {
        if (/(?:serving|serves|yield|makes)/i.test(line)) {
          const match = line.match(/(\d+)/);
          if (match) return match[1];
        }
      }
      return '';
    }
  },
  {
    name: 'Check for numbers in title',
    fn: raw => {
      const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) {
        const match = titleMatch[1].match(/(\d+)/);
        if (match) return match[1];
      }
      return '';
    }
  },
  {
    name: 'Fallback: number in first lines (skip step numbers)',
    fn: raw => {
      const lines = raw.split(/\n|<br\s*\/?\s*>/i).slice(0, 40);
      for (let line of lines) {
        const trimmed = String(line || '').trim();
        if (!trimmed) continue;
        // Ignore common numbered instruction step lines like "1. Preheat..."
        if (/^\d+\./.test(trimmed)) continue;
        const match = line.match(/(\d+)/);
        if (match) return match[1];
      }
      return '';
    }
  },
  {
    name: 'If none, returns "N/A"',
    fn: raw => 'N/A'
  }
];


function renderServingExtractorTable(results) {
  const tbody = document.getElementById('servingExtractorTableBody');
  if (!Array.isArray(results)) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = results.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.name}</td>
      <td>${s.applied ? '\u2713' : '\u2014'}</td>
      <td class='extractor-result'>${s.result}</td>
      <td>${s.solved ? "<span class='extractor-status'>\u2714</span>" : "<span class='extractor-status unsolved'>\u2717</span>"}</td>
    </tr>
  `).join('');
}
window.strategies = strategies;
window.renderServingExtractorTable = renderServingExtractorTable;
