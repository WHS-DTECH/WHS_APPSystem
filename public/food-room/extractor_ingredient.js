// (Removed stray object literal that caused syntax error)
// JS for Ingredients Extractor, modeled after Instructions Extractor

document.addEventListener('DOMContentLoaded', function () {
  // Fix: Declare stepIndex and recipeSelect at the top for global access
  let stepIndex = 0;
  const recipeSelect = document.getElementById('recipeSelect');
  const startStepBtn = document.getElementById('startStepBtn');
  const smartBtn = document.getElementById('smartBtn');
  // Populate recipe dropdown
  fetch('/api/recipes')
    .then(res => res.json())
    .then(recipes => {
      console.log('[DEBUG][Dropdown] Recipes loaded:', recipes);
      recipes.forEach(recipe => {
        const opt = document.createElement('option');
        opt.value = recipe.id;
        opt.setAttribute('data-recipeid', recipe.id);
        // Show both URL and RecipeID in the dropdown
        opt.textContent = `${recipe.url || recipe.name} [ID: ${recipe.id}]`;
        recipeSelect.appendChild(opt);
      });
      console.log('[DEBUG][Dropdown] Options:', Array.from(recipeSelect.options).map(o => ({value: o.value, text: o.textContent, dataRecipeId: o.getAttribute('data-recipeid')})));
    });
  console.log('[DEBUG][GLOBAL] extractor_ingredient.js script loaded and DOMContentLoaded fired');

  // --- Show Extraction Strategies List under Title ---
  const strategiesList = [
    'Hard-coded: Step 1',
    'Find <li> tags',
    'Find <ul> tags (all in file)',
    'Find "ingredients" (LIKE/wildcard) near HTML ul or ol list',
    'Extract recipeIngredient array from JSON',
    'Find line with "recipeIngredient" (LIKE/wildcard)',
    'Find "ingredients" (LIKE/wildcard) near comma-separated list',
    'Look for label',
    'Extract it from ingredient-list--content-wysiwyg',
    'Fallback Any line',
    'If none, returns "N/A"'
  ];
  const titleHeading = document.querySelector('h2');
  if (titleHeading) {
    const ul = document.createElement('ul');
    ul.style.marginTop = '8px';
    ul.style.marginBottom = '16px';
    strategiesList.forEach(str => {
      const li = document.createElement('li');
      li.textContent = str;
      ul.appendChild(li);
    });
    titleHeading.parentElement.insertBefore(ul, titleHeading.nextSibling);
  }
  let rawData = '';
  const rawDataBox = document.getElementById('rawDataBox');
  let currentRecipeId = null;
  // Use static buttons from HTML
  const loadRawBtn = document.getElementById('loadRawBtn');
  const stepControls = document.getElementById('stepControls');
  const strategyTable = document.getElementById('strategyTable');
  const currentStrategyName = document.getElementById('currentStrategyName');
  const currentStrategyResult = document.getElementById('currentStrategyResult');
  const acceptResultBtn = document.getElementById('acceptResultBtn');
  const continueBtn = document.getElementById('continueBtn');
  const solutionBox = document.getElementById('solutionBox');
  const sendSolutionBtn = document.getElementById('sendSolutionBtn');
  // Disable Start Step-by-Step until raw data is loaded
  if (startStepBtn) startStepBtn.disabled = true;

  function hasIngredientSignal(text) {
    const raw = String(text || '');
    return /recipeIngredient|ingredients|<li|<ul|\bcups?\b|\btsp\b|\btbsp\b|\bg\b|\bml\b/i.test(raw);
  }

  function parseIngredientLinesFromRaw(fileText) {
    if (window.ExtractorAutoCore && typeof window.ExtractorAutoCore.parseIngredientLinesFromRaw === 'function') {
      return window.ExtractorAutoCore.parseIngredientLinesFromRaw(fileText);
    }
    console.warn('[Ingredients Extractor] Shared auto core is unavailable; returning no parsed lines.');
    return [];
  }

  function normalizeIngredientWhitespace(value) {
    return String(value || '')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  function looksLikeIngredientStart(fragment) {
    return /^(?:\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b/i.test(String(fragment || '').trim());
  }

  function splitCommaJoinedIngredientLine(line) {
    const text = normalizeIngredientWhitespace(line);
    if (!text) return [];

    const segments = [];
    let startIndex = 0;

    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== ',') continue;
      const nextPart = text.slice(index + 1).trim();
      if (!looksLikeIngredientStart(nextPart)) continue;
      segments.push(text.slice(startIndex, index).trim());
      startIndex = index + 1;
    }

    segments.push(text.slice(startIndex).trim());
    return segments.filter(Boolean);
  }

  function cleanupIngredientLines(result) {
    const rawItems = Array.isArray(result)
      ? result
      : String(result || '').split(/\r?\n/);

    const cleaned = [];
    rawItems.forEach((item) => {
      const normalized = normalizeIngredientWhitespace(item)
        .replace(/^\s*[-•*]+\s*/g, '')
        .replace(/\bhttps?:\/\/\S+/gi, '')
        .replace(/\bheartfoundation\.org\.nz\b/gi, '')
        .replace(/\|\s*\d{4}\b/g, '')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,+/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      splitCommaJoinedIngredientLine(normalized).forEach((segment) => {
        const finalLine = segment
          .replace(/\s+,/g, ',')
          .replace(/,\s*,+/g, ', ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (finalLine) cleaned.push(finalLine);
      });
    });

    return cleaned;
  }

  function formatIngredientResultForDisplay(result) {
    return cleanupIngredientLines(result).join('\n');
  }

  // Load Raw Data button event handler
  if (loadRawBtn) {
    loadRawBtn.addEventListener('click', async function () {
      const selectedOption = recipeSelect.options[recipeSelect.selectedIndex];
      const recipeId = selectedOption && (selectedOption.getAttribute('data-recipeid') || selectedOption.value);
      console.log('[DEBUG][LoadRawData] Clicked. Selected option:', selectedOption ? selectedOption.textContent : '(none)', 'RecipeID:', recipeId);
      if (!recipeId) {
        alert('Please select a recipe.');
        return;
      }
      const fetchUrl = `/RawDataTXT/${recipeId}.txt`;
      console.log('[DEBUG][LoadRawData] Fetching URL:', fetchUrl);
      try {
        const res = await fetch(fetchUrl);
        console.log('[DEBUG][LoadRawData] Response status:', res.status);
        if (!res.ok) {
          const text = await res.text();
          console.log('[DEBUG][LoadRawData] Response not OK. Status:', res.status, 'Body:', text);
          throw new Error('Failed to fetch raw data');
        }
        rawData = await res.text();
        console.log('[DEBUG][LoadRawData] Raw data loaded:', rawData.slice(0, 200));
        if (rawDataBox) rawDataBox.value = rawData;
        if (startStepBtn) startStepBtn.disabled = false;
      } catch (e) {
        console.error('[DEBUG][LoadRawData] Error:', e);
        alert('Failed to load raw data.');
        if (startStepBtn) startStepBtn.disabled = true;
      }
    });
  }

    // Check if loadRawDataForRecipe is defined before calling it
    if (smartBtn) {
      smartBtn.addEventListener('click', function () {
        const selectedId = recipeSelect.value;
        if (!selectedId) {
          alert('Please select a recipe.');
          return;
        }
        smartBtn.disabled = true;
        if (typeof loadRawDataForRecipe === 'function') {
          loadRawDataForRecipe(selectedId, function(success) {
            if (success) {
              if (startStepBtn) startStepBtn.disabled = false;
              startStepBtn.click();
            } else {
              alert('Failed to load raw data.');
            }
            smartBtn.disabled = false;
          });
        } else {
          console.error('loadRawDataForRecipe is not defined. Please define the function or check the function name.');
          alert('Error: loadRawDataForRecipe is not defined. Please contact the developer.');
          smartBtn.disabled = false;
        }
      });
    }
  // Refactor loadRawDataForRecipe to accept callback
  function loadRawDataForRecipe(recipeId, callback) {
    if (!recipeId) { if (callback) callback(false); return; }
    const rawDataBox = document.getElementById('rawDataBox');
    const url = `/RawDataTXT/${recipeId}.txt`;
    if (startStepBtn) startStepBtn.disabled = true;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch raw data');
        return res.text();
      })
      .then(data => {
        rawData = data;
        if (rawDataBox) rawDataBox.value = rawData;
        if (startStepBtn) startStepBtn.disabled = false;
        console.log('[DEBUG][AutoLoadRawData] Raw data loaded for recipeId:', recipeId);
        if (callback) callback(true);
      })
      .catch(err => {
        if (rawDataBox) rawDataBox.value = '[Error loading raw data]';
        rawData = '';
        if (startStepBtn) startStepBtn.disabled = true;
        console.error('[AutoLoadRawData] Error loading raw data:', err);
        if (callback) callback(false);
      });
  }

    // Start Step-by-Step button handler
    startStepBtn.addEventListener('click', function () {
      currentRecipeId = recipeSelect.value;
      if (!currentRecipeId) {
        alert('Please select a recipe.');
        return;
      }
      stepIndex = 0;
      // Show step controls and render table
      if (stepControls) stepControls.style.display = 'block';
      if (strategyTable) strategyTable.style.display = '';
      renderStepTable();
      showCurrentStep();
    });

    const stepStrategies = [
      { name: 'Hard-coded: Step 1', applied: false, result: '["Cupcakes", "150g butter, softened (or Olivani Spread)", "1 ½ cups Chelsea Caster Sugar (338g)", "2 eggs ", "2 ½ cups Edmonds Self Raising Flour (375g)", "1 ¼ cups Meadow Fresh Milk (310ml)", "2 tsp vanilla extract ", "Buttercream Icing", "150g butter, softened (or Olivani Spread)", "2 ¼ cups Chelsea Icing Sugar (338g)", "2 Tbsp Meadow Fresh Milk ", "1 ½ tsp vanilla extract", "Raspberries, sugar flowers or sprinkles to decorate"]', solved: false },
      {
        name: 'Find li tags',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const matches = [...fileText.matchAll(/<li[^>]*>(.*?)<\/li>/gi)];
          this.result = matches.map(m => m[1].trim()).filter(Boolean);
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find ul tags (all in file)',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const matches = [...fileText.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)];
          this.result = matches.map(m => m[1].trim()).filter(Boolean);
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find "ingredients" (LIKE/wildcard) near HTML ul or ol list',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredients') ? ['Found ingredients'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract recipeIngredient array from JSON',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const match = fileText.match(/"recipeIngredient"\s*:\s*(\[[\s\S]*?\])/);
          this.result = match ? [match[1]] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find line with "recipeIngredient" (LIKE/wildcard)',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const lines = fileText.split('\n');
          this.result = lines.filter(line => line.includes('recipeIngredient'));
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find "ingredients" (LIKE/wildcard) near comma-separated list',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredients') ? ['Found comma-separated ingredients'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Look for label',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('label') ? ['Found label'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract it from ingredient-list--content-wysiwyg',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredient-list--content-wysiwyg') ? ['Found wysiwyg'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract lines between Ingredients and Method',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const parsed = parseIngredientLinesFromRaw(rawData);
          this.result = parsed;
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract ingredient-like quantity lines and clean punctuation',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          this.result = cleanupIngredientLines(parseIngredientLinesFromRaw(rawData));
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Fallback Any line',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const lines = fileText.split('\n');
          this.result = lines;
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'If none, returns "N/A"',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          this.result = ['N/A'];
          this.applied = true;
          this.solved = true;
          return this.result;
        }
      }
    ];

  console.log('[DEBUG][GLOBAL] stepStrategies defined:', stepStrategies.map(s => s.name));
  function renderStepTable() {
    console.log('[DEBUG] renderStepTable called');
    strategyTable.innerHTML = '';
    stepStrategies.forEach((s, i) => {
      const renderedResult = Array.isArray(s.result)
        ? formatIngredientResultForDisplay(s.result)
        : String(s.result || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.applied ? '✓' : '—'}</td>
        <td>${renderedResult ? `<span style='font-size:0.95em;white-space:pre-wrap;'>${renderedResult}</span>` : '<span style="color:#aaa;">(no result)</span>'}</td>
        <td>${s.solved ? '✓' : '✗'}</td>
      `;
      strategyTable.appendChild(tr);
    });
  }
  function showStepControls() {
    console.log('[DEBUG] showStepControls called');
    stepControls.style.display = 'block';
    showCurrentStep();
  }
  async function showCurrentStep() {
    console.log('[DEBUG][showCurrentStep] called, stepIndex:', stepIndex);
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) return;
    const step = stepStrategies[stepIndex];
    console.log('[DEBUG][showCurrentStep] current step object:', step);
    currentStrategyName.textContent = step.name;
    // Always execute and await the run method if present, for every strategy
    if (typeof step.run === 'function') {
      currentStrategyResult.textContent = 'Loading...';
      try {
        step.result = await step.run(currentRecipeId);
      } catch (e) {
        step.result = '';
        console.error('[DEBUG] Error running strategy', step.name, e);
      }
      renderStepTable();
    }
    currentStrategyResult.textContent = formatIngredientResultForDisplay(step.result) || '(no result)';
    acceptResultBtn.style.display = '';
    continueBtn.style.display = stepIndex < stepStrategies.length - 1 ? '' : 'none';
  }


  // Only one set of event listeners for stepper buttons
  acceptResultBtn.addEventListener('click', function () {
    console.log('[DEBUG] Accept Result button clicked, stepIndex:', stepIndex);
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) return;
    stepStrategies[stepIndex].applied = true;
    stepStrategies[stepIndex].solved = true;
    if (stepStrategies[stepIndex].result) {
      solutionBox.value = formatIngredientResultForDisplay(stepStrategies[stepIndex].result);
    }
    renderStepTable();
    showCurrentStep();
  });
  continueBtn.addEventListener('click', function () {
    console.log('[DEBUG] Continue button clicked, stepIndex:', stepIndex);
    if (stepIndex < stepStrategies.length - 1) {
      stepIndex++;
      showCurrentStep();
    }
  });

    sendSolutionBtn.addEventListener('click', function () {
      // Debugging: Log currentRecipeId and recipeSelect
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
      let solution = formatIngredientResultForDisplay(solutionBox.value).trim();
      console.log('[SEND SOLUTION] recipeIdToSend:', recipeIdToSend, 'solution:', solution);
      // Clean up: remove bullet points, text boxes, and borders
      // Remove common bullet characters and leading whitespace
      solution = solution.replace(/^\s*[-•*\u2022\u25CF\u25A0]+\s*/gm, '');
      // Remove any input boxes (if HTML remains)
      solution = solution.replace(/<input[^>]*>/gi, '');
      // Remove visible box drawing characters (rare, but for safety)
      solution = solution.replace(/[\u2500-\u257F]/g, '');
      // Remove extra borders (if any left as text)
      solution = solution.replace(/border(:|=)[^;\n]+[;\n]?/gi, '');
      // Remove any remaining empty lines
      solution = solution.replace(/^\s*\n/gm, '');
      if (!solution) {
        alert('Please enter a solution.');
        return;
      }
      fetch('/api/ingredients-extractor/solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipeIdToSend, solution })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert('✅ Solution sent and record amended!');
          } else {
            alert('❌ Failed to send solution.');
          }
        })
        .catch((err) => {
          alert('❌ Failed to send solution.');
          console.error('[SendSolution] Error:', err);
        });
    });

  const autoExtractBtn = document.getElementById('autoExtractBtn');
  const autoExtractResultBox = document.getElementById('autoExtractResultBox');
  const autoExtractResultText = document.getElementById('autoExtractResultText');
  const autoAcceptSendBtn = document.getElementById('autoAcceptSendBtn');
  const autoDeclineBtn = document.getElementById('autoDeclineBtn');
  let autoExtractSolution = '';

  if (autoExtractBtn) {
    autoExtractBtn.addEventListener('click', function() {
      const recipeId = recipeSelect ? recipeSelect.value : '';
      if (!recipeId) {
        alert('Please select a recipe first.');
        return;
      }
      if (rawData) {
        runAutoExtract();
        return;
      }
      autoExtractBtn.disabled = true;
      autoExtractBtn.textContent = 'Loading...';
      loadRawDataForRecipe(recipeId, function(success) {
        autoExtractBtn.disabled = false;
        autoExtractBtn.textContent = 'Ingredients Auto Extract';
        if (!success) {
          alert('Failed to load raw data for this recipe.');
          return;
        }
        runAutoExtract();
      });
    });
  }

  function runAutoExtract() {
    let result = [];
    let strategyUsed = '';
    result = parseIngredientLinesFromRaw(rawData);
    if (result.length) strategyUsed = 'Extract ingredient lines from raw text';

    autoExtractSolution = formatIngredientResultForDisplay(result);
    if (autoExtractResultText) {
      autoExtractResultText.textContent = autoExtractSolution
        ? `Ingredients found (${strategyUsed || 'Auto Extract'}):\n${autoExtractSolution}`
        : 'No ingredients found between "Ingredients" and "Method" headings.';
    }
    if (autoExtractResultBox) autoExtractResultBox.style.display = '';
  }

  if (autoAcceptSendBtn) {
    autoAcceptSendBtn.addEventListener('click', function() {
      const recipeId = recipeSelect ? recipeSelect.value : '';
      if (!recipeId) {
        alert('Please select a recipe first.');
        return;
      }
      if (!autoExtractSolution) {
        alert('No auto extract solution available to send.');
        return;
      }
      solutionBox.value = autoExtractSolution;
      fetch('/api/ingredients-extractor/solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, solution: autoExtractSolution })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert('✅ Ingredients solution sent!');
          } else {
            alert('❌ Failed to send solution.');
          }
        })
        .catch(() => {
          alert('❌ Error sending solution.');
        });
    });
  }

  if (autoDeclineBtn) {
    autoDeclineBtn.addEventListener('click', function() {
      window.location.href = 'extractor_ingredient.html';
    });
  }
  });
