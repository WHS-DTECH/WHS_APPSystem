
// JS for Recipe Name (Title) Extractor, modeled after other extractors
document.addEventListener('DOMContentLoaded', function () {
  const recipeSelect = document.getElementById('recipeSelect');
  // Use the correct button ID as in the HTML
  const startStepBtn = document.getElementById('startStepByStepBtn');
  const solutionBox = document.getElementById('solutionBox');
  const sendSolutionBtn = document.getElementById('sendSolutionBtn');
  const rawDataBox = document.getElementById('rawDataBox');
  const stepControls = document.getElementById('stepControls');
  const acceptResultBtn = document.getElementById('acceptResultBtn');
  const continueBtn = document.getElementById('continueBtn');
  const titleAutoExtractBtn = document.getElementById('titleAutoExtractBtn');
  const titleAutoResultBox = document.getElementById('titleAutoResultBox');
  const titleAutoResultText = document.getElementById('titleAutoResultText');
  const titleAutoAcceptSendBtn = document.getElementById('titleAutoAcceptSendBtn');
  const titleAutoDeclineBtn = document.getElementById('titleAutoDeclineBtn');
  let currentRecipeId = null;
  let rawData = '';
  let stepStrategies = [];
  let stepIndex = 0;
  let autoExtractedTitle = '';
  const recipesById = new Map();

  function hasTitleSignal(text) {
    const raw = String(text || '');
    return /<title|<h1|"@type"\s*:\s*"Recipe"|\brecipe name\b|\bJSON-LD Recipe name\b/i.test(raw);
  }

  function isNoiseTitleLine(line) {
    const s = String(line || '').trim();
    if (!s) return true;
    if (/^(json-ld|visible page text|visible list items|heading candidates)\s*:/i.test(s)) return true;
    if (/^(prep\s*&?\s*cook\s*time|prep\s*time|cook\s*time|servings?|sponsored recipe|see more recipes)$/i.test(s)) return true;
    if (/^(home|contact|privacy|terms|shop|menu)$/i.test(s)) return true;
    return false;
  }

  function titleCase(text) {
    return String(text || '')
      .split(' ')
      .map(word => word ? (word.charAt(0).toUpperCase() + word.slice(1)) : '')
      .join(' ')
      .trim();
  }

  function cleanTitleFromSlug(slug) {
    const cleaned = decodeURIComponent(String(slug || ''))
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // Remove trailing upload stamps added by SavedPDF upload naming (e.g. _1775706668021).
    const withoutUploadSuffix = cleaned.replace(/\s+\d{6,}\s*$/i, '').trim();

    return titleCase(withoutUploadSuffix || cleaned);
  }

  async function fetchVisibleTextByRecipeId(recipeId) {
    const recipe = recipesById.get(String(recipeId));
    const url = recipe && recipe.url ? String(recipe.url).trim() : '';
    if (!url) return '';

    const res = await fetch(`/api/extract-visible-text?url=${encodeURIComponent(url)}`);
    if (!res.ok) return '';
    const data = await res.json();

    const sections = [];
    if (data.visibleText) {
      sections.push(String(data.visibleText));
    }
    if (Array.isArray(data.listItems) && data.listItems.length) {
      sections.push(data.listItems.join('\n'));
    }

    return sections.join('\n').trim();
  }

  // Fetch recipes for dropdown
  fetch('/api/recipes')
    .then(res => res.json())
    .then(recipes => {
      console.log('[DEBUG][Dropdown] Recipes loaded:', recipes);
      recipes.forEach(recipe => {
        recipesById.set(String(recipe.id), recipe);
        const opt = document.createElement('option');
        opt.value = recipe.id;
        opt.setAttribute('data-recipeid', recipe.id);
        const url = recipe.url || 'No URL';
        opt.textContent = '[ID: ' + recipe.id + '] ' + url;
        recipeSelect.appendChild(opt);
      });
      console.log('[DEBUG][Dropdown] Options:', Array.from(recipeSelect.options).map(o => ({value: o.value, text: o.textContent, dataRecipeId: o.getAttribute('data-recipeid')})));
    });

  function updateRawDataBox(val) {
    rawDataBox.value = val || '';
  }

  function runAllStrategiesAndUpdateUI() {
    console.log('[DEBUG] Running all strategies');
    console.log('[DEBUG] rawData:', rawData);
    stepStrategies = strategies.map(s => {
      const result = s.fn(rawData);
      console.log(`[DEBUG] Strategy: ${s.name}, Result:`, result);
      return {
        name: s.name,
        result,
        applied: false,
        solved: !!result
      };
    });
    stepIndex = 0;
    console.log('[DEBUG] stepStrategies:', stepStrategies);
    renderStepTable();
    updateStepControls();
  }

  recipeSelect.addEventListener('change', function () {
    currentRecipeId = recipeSelect.value;
    const selectedOption = recipeSelect.options[recipeSelect.selectedIndex];
    console.log('[DEBUG][Dropdown] Changed. Selected option:', selectedOption ? selectedOption.textContent : '(none)', 'RecipeID:', currentRecipeId);
    if (!currentRecipeId) {
      rawData = '';
      updateRawDataBox(rawData);
      stepStrategies = [];
      stepIndex = 0;
      renderStepTable();
      updateStepControls();
      return;
    }
    fetch('/api/recipes')
      .then(res => res.json())
      .then(recipes => {
        // Always use the selected RecipeID for the file name
        const fetchUrl = `/RawDataTXT/${currentRecipeId}.txt`;
        console.log('[DEBUG][LoadRawData] Fetching URL:', fetchUrl, 'for RecipeID:', currentRecipeId);
        fetch(fetchUrl)
          .then(res => res.ok ? res.text() : '')
          .then(async text => {
            rawData = text || '';
            if (!hasTitleSignal(rawData)) {
              const visibleRaw = await fetchVisibleTextByRecipeId(currentRecipeId);
              if (visibleRaw && visibleRaw.length > rawData.length) {
                rawData = visibleRaw;
              }
            }
            updateRawDataBox(rawData);
            runAllStrategiesAndUpdateUI();
          });
      });
  });

  // On page load, if a recipe is already selected, load its data and run strategies
  if (recipeSelect.value) {
    currentRecipeId = recipeSelect.value;
    const selectedOption = recipeSelect.options[recipeSelect.selectedIndex];
    console.log('[DEBUG][Dropdown] On page load. Selected option:', selectedOption ? selectedOption.textContent : '(none)', 'RecipeID:', currentRecipeId);
    fetch('/api/recipes')
      .then(res => res.json())
      .then(recipes => {
        const recipe = recipes.find(r => r.id == currentRecipeId);
        const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : currentRecipeId;
        const fetchUrl = `/RawDataTXT/${fileId}.txt`;
        console.log('[DEBUG][LoadRawData] Fetching URL:', fetchUrl, 'for RecipeID:', currentRecipeId);
        fetch(fetchUrl)
          .then(res => res.ok ? res.text() : '')
          .then(text => {
            rawData = text || '';
            updateRawDataBox(rawData);
            runAllStrategiesAndUpdateUI();
          });
      });
  }

  // ...existing code...

  // Define strategies for extracting the recipe name
  const strategies = [
    {
      name: 'Extract title from recipe URL slug',
      fn: () => {
        const recipe = recipesById.get(String(currentRecipeId));
        const url = recipe && recipe.url ? String(recipe.url).trim() : '';
        if (!url) return '';

        let slug = '';
        try {
          const parsed = new URL(url);
          const parts = parsed.pathname.split('/').filter(Boolean);
          slug = parts.length ? parts[parts.length - 1] : '';
        } catch (_) {
          const parts = url.split('/').filter(Boolean);
          slug = parts.length ? parts[parts.length - 1] : '';
        }

        if (!slug) return '';

        return cleanTitleFromSlug(slug);
      }
    },
    {
      name: 'Look for title tag',
      fn: raw => {
        const match = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
        return match ? match[1].trim() : '';
      }
    },
    {
      name: 'Look for h1 tag',
      fn: raw => {
        const match = raw.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        return match ? match[1].trim() : '';
      }
    },
    {
      name: 'Look for JSON-LD Recipe name',
      fn: raw => {
        // Find <script type="application/ld+json"> blocks
        const scripts = [...raw.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const script of scripts) {
          try {
            const json = JSON.parse(script[1]);
            // If it's an array, look for Recipe type
            if (Array.isArray(json)) {
              for (const obj of json) {
                if (obj['@type'] === 'Recipe' && obj.name) return obj.name;
              }
            } else if (json['@type'] === 'Recipe' && json.name) {
              return json.name;
            }
          } catch (e) { /* ignore parse errors */ }
        }
        // Fallback: try to find '"@type"\s*:\s*"Recipe"' and '"name"\s*:\s*"..."' in text
        const recipeBlock = raw.match(/\{[^\}]*"@type"\s*:\s*"Recipe"[^\}]*\}/);
        if (recipeBlock) {
          const nameMatch = recipeBlock[0].match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch) return nameMatch[1];
        }
        return '';
      }
    },
    {
      name: 'First non-empty line',
      fn: raw => {
        const lines = raw.split(/\n|<br\s*\/\?\s*>/i);
        const found = lines.find(line => line.trim().length > 0);
        return found ? found.trim() : '';
      }
    },
    {
      name: 'Visible text: first meaningful title-like line',
      fn: raw => {
        const lines = String(raw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (isNoiseTitleLine(line)) continue;
          if (line.length < 4) continue;
          if (/^\d+[.)]\s/.test(line)) continue;
          if (/\b(servings?|prep|cook)\b/i.test(line)) continue;
          return line;
        }
        return '';
      }
    },
    {
      name: 'Dropdown recipe name fallback',
      fn: () => {
        const recipe = recipesById.get(String(currentRecipeId));
        return recipe && recipe.name ? String(recipe.name).trim() : '';
      }
    },
    {
      name: 'Fallback: Any text before <body>',
      fn: raw => {
        const match = raw.match(/([\s\S]*?)<body/i);
        return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
      }
    }
  ];

  function renderStepTable() {
    const tbody = document.getElementById('titleExtractorTableBody');
    console.log('[DEBUG] Rendering table, stepStrategies:', stepStrategies);
    tbody.innerHTML = stepStrategies.map((s, i) => `
      <tr${i === stepIndex ? " style='background:#e3f2fd;'" : ''}>
        <td>${s.name}</td>
        <td>${s.applied ? '✓' : '—'}</td>
        <td class='extractor-result'>${s.result ? s.result : '<span style=\"color:#bbb\">(no result)</span>'}</td>
        <td>${s.solved ? "<span class='extractor-status'>✔</span>" : "<span class='extractor-status unsolved'>✗</span>"}</td>
      </tr>
    `).join('');
  }

  function runStrategies() {
    stepStrategies = strategies.map(s => ({
      name: s.name,
      result: s.fn(rawData),
      applied: false,
      solved: false
    }));
    stepIndex = 0;
    renderStepTable();
    showStep(stepIndex);
  }


  // Always show step controls and update them
  function updateStepControls() {
    const nameDiv = document.getElementById('currentStrategyName');
    const resultDiv = document.getElementById('currentStrategyResult');
    if (!stepStrategies.length) {
      nameDiv.textContent = 'No strategy selected.';
      resultDiv.textContent = '';
      return;
    }
    const s = stepStrategies[stepIndex];
    nameDiv.innerHTML = `<b>Current Strategy:</b> ${s.name}`;
    resultDiv.innerHTML = s.result ? `<b>Result:</b> ${s.result}` : '<span style="color:#bbb">(no result)</span>';
  }

  startStepBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }
    // Re-run strategies to reset stepper and table
    stepStrategies = strategies.map(s => {
      const result = s.fn(rawData);
      return {
        name: s.name,
        result,
        applied: false,
        solved: !!result
      };
    });
    stepIndex = 0;
    renderStepTable();
    updateStepControls();
  });

  acceptResultBtn.addEventListener('click', function () {
    if (!stepStrategies.length) return;
    stepStrategies[stepIndex].applied = true;
    stepStrategies[stepIndex].solved = !!stepStrategies[stepIndex].result;
    solutionBox.value = stepStrategies[stepIndex].result || '';
    renderStepTable();
    updateStepControls();
  });

  continueBtn.addEventListener('click', function () {
    if (stepIndex < stepStrategies.length - 1) {
      stepIndex++;
      renderStepTable();
      updateStepControls();
    }
  });

  // When strategies are run, update controls
  function runStrategies() {
    stepStrategies = strategies.map(s => ({
      name: s.name,
      result: s.fn(rawData),
      applied: false,
      solved: false
    }));
    stepIndex = 0;
    renderStepTable();
    updateStepControls();
  }

  // When recipe changes, clear step controls
  recipeSelect.addEventListener('change', function () {
    // ...existing code...
    stepStrategies = [];
    stepIndex = 0;
    updateStepControls();
  });

  // On page load, show initial step controls
  updateStepControls();

function showStep(index) {
  solutionBox.value = stepStrategies[index].result || '';
  stepControls.style.display = 'block';
}

function sendTitleSolution(recipeId, solution) {
  return fetch('/api/title-extractor/solution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId, solution })
  });
}

if (titleAutoExtractBtn) {
  titleAutoExtractBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }

    const strategyOne = strategies[0];
    autoExtractedTitle = strategyOne && typeof strategyOne.fn === 'function' ? (strategyOne.fn(rawData) || '') : '';

    stepStrategies = strategies.map((s, idx) => {
      const result = s.fn(rawData);
      return {
        name: s.name,
        result,
        applied: idx === 0,
        solved: !!result
      };
    });
    stepIndex = 0;
    renderStepTable();
    updateStepControls();

    if (titleAutoResultText) {
      titleAutoResultText.textContent = autoExtractedTitle
        ? `Strategy 1 result: ${autoExtractedTitle}`
        : 'Strategy 1 found no title value.';
    }
    if (titleAutoResultBox) titleAutoResultBox.style.display = '';
  });
}

if (titleAutoAcceptSendBtn) {
  titleAutoAcceptSendBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }
    if (!autoExtractedTitle) {
      alert('No auto extract result to send.');
      return;
    }

    solutionBox.value = autoExtractedTitle;
    sendTitleSolution(currentRecipeId, autoExtractedTitle)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Title saved!');
        } else {
          alert('Failed to save title.');
        }
      })
      .catch(() => alert('Error saving title.'));
  });
}

if (titleAutoDeclineBtn) {
  titleAutoDeclineBtn.addEventListener('click', function () {
    window.location.href = 'extractor_title.html';
  });
}

// Hook up SEND SOLUTION button
sendSolutionBtn.addEventListener('click', function () {
    console.log('[SEND SOLUTION] currentRecipeId:', typeof currentRecipeId, currentRecipeId);
    console.log('[SEND SOLUTION] recipeSelect:', recipeSelect ? recipeSelect.value : '(no select)');
    let recipeIdToSend = null;
    if (typeof currentRecipeId !== 'undefined' && currentRecipeId) {
      recipeIdToSend = currentRecipeId;
    } else if (recipeSelect && recipeSelect.value) {
      recipeIdToSend = recipeSelect.value;
    }
    if (!recipeIdToSend) {
      alert('Please select a recipe. [Debug: recipeIdToSend not found]');
      return;
    }
    const solution = solutionBox.value.trim();
    if (!solution) {
      alert('No solution to save.');
      return;
    }
    console.log('[SEND SOLUTION] recipeIdToSend:', recipeIdToSend, 'solution:', solution);
    sendTitleSolution(recipeIdToSend, solution)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Title saved!');
        } else {
          alert('Failed to save title.');
        }
      })
      .catch(() => alert('Error saving title.'));
  });
});
