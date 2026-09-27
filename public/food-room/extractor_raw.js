document.addEventListener('DOMContentLoaded', function () {
    const recipeSelect = document.getElementById('uploadSelect');
    const extractBtn = document.getElementById('extractDataBtn');
    const extractRenderedBtn = document.getElementById('extractRenderedBtn');
    const extractVisibleTextBtn = document.getElementById('extractVisibleTextBtn');
    const smartExtractBtn = document.getElementById('smartExtractBtn');
    const rawDataInput = document.getElementById('rawDataInput');
    const saveBtn = document.getElementById('saveRawDataBtn');

    const buttonProgressEls = {
        extractDataBtn: {
            bar: document.getElementById('extractDataBtnProgressBar'),
            fill: document.getElementById('extractDataBtnProgressFill')
        },
        extractRenderedBtn: {
            bar: document.getElementById('extractRenderedBtnProgressBar'),
            fill: document.getElementById('extractRenderedBtnProgressFill')
        },
        extractVisibleTextBtn: {
            bar: document.getElementById('extractVisibleTextBtnProgressBar'),
            fill: document.getElementById('extractVisibleTextBtnProgressFill')
        },
        smartExtractBtn: {
            bar: document.getElementById('smartExtractBtnProgressBar'),
            fill: document.getElementById('smartExtractBtnProgressFill')
        },
        saveRawDataBtn: {
            bar: document.getElementById('saveRawDataBtnProgressBar'),
            fill: document.getElementById('saveRawDataBtnProgressFill')
        }
    };

    let recipesCache = [];

    function setButtonProgress(buttonId, percent) {
        const parts = buttonProgressEls[buttonId];
        if (!parts || !parts.bar || !parts.fill) return;
        const safePercent = Math.max(0, Math.min(100, percent));
        parts.bar.style.display = safePercent > 0 ? 'block' : 'none';
        parts.fill.style.width = `${safePercent}%`;
    }

    function setBusy(btn, busy, busyText, idleText) {
        if (!btn) return;
        btn.disabled = !!busy;
        btn.textContent = busy ? busyText : idleText;
        if (busy) {
            setButtonProgress(btn.id, 25);
        } else {
            setButtonProgress(btn.id, 100);
            setTimeout(() => setButtonProgress(btn.id, 0), 650);
        }
    }

    async function getRecipes(forceRefresh = false) {
        if (recipesCache.length && !forceRefresh) return recipesCache;
        const res = await fetch('/api/recipes');
        const recipes = await res.json();
        recipesCache = Array.isArray(recipes) ? recipes : [];
        return recipesCache;
    }

    async function getRecipeById(recipeId) {
        let recipes = await getRecipes();
        let recipe = recipes.find(r => String(r.id) === String(recipeId));
        if (recipe) return recipe;

        // If a new recipe was inserted after initial page load, refresh cache once.
        recipes = await getRecipes(true);
        recipe = recipes.find(r => String(r.id) === String(recipeId));
        return recipe;
    }

    async function loadRawDataFromFile(recipeId) {
        // Try DB first (survives Render deploys)
        const recipe = await getRecipeById(recipeId);
        if (recipe && recipe.upload_raw_data) {
            return recipe.upload_raw_data;
        }
        // Fall back to static file
        const res = await fetch(`/RawDataTXT/${recipeId}.txt`);
        if (!res.ok) {
            throw new Error('Raw data not found in database or file');
        }
        return res.text();
    }

    async function extractRenderedHtmlByRecipeId(recipeId) {
        const recipe = await getRecipeById(recipeId);
        const url = recipe && recipe.url ? recipe.url : '';
        if (!url) throw new Error('No URL found for this recipe');

        const res = await fetch(`/api/extract-rendered-html?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Failed to fetch rendered HTML');
        return res.text();
    }

    async function extractVisibleTextByRecipeId(recipeId) {
        const recipe = await getRecipeById(recipeId);
        const url = recipe && recipe.url ? recipe.url : '';
        if (!url) throw new Error('No URL found for this recipe');

        const res = await fetch(`/api/extract-visible-text?url=${encodeURIComponent(url)}`);
        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (!res.ok || !data || data.success === false) {
            const details = data && data.error ? `: ${data.error}` : '';
            throw new Error(`Failed to fetch visible text${details}`);
        }

        const sections = [];
        if (Array.isArray(data.jsonLdInstructions) && data.jsonLdInstructions.length) {
            sections.push('JSON-LD Recipe Instructions:\n' + data.jsonLdInstructions.join('\n'));
        }
        if (Array.isArray(data.headingCandidates) && data.headingCandidates.length) {
            sections.push('Heading Candidates:\n' + data.headingCandidates.join('\n\n'));
        }
        if (Array.isArray(data.listItems) && data.listItems.length) {
            sections.push('Visible List Items:\n' + data.listItems.join('\n'));
        }
        if (data.visibleText) {
            sections.push('Visible Page Text:\n' + String(data.visibleText));
        }

        const output = sections.join('\n\n').trim();
        return output || '';
    }

    async function saveRawData(recipeId, rawData) {
        const res = await fetch(`/api/recipes/${recipeId}/raw`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawData })
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (!res.ok || !data || !data.success) {
            const details = data && data.error ? `: ${data.error}` : '';
            throw new Error(`Failed to save raw data${details}`);
        }
        // Refresh cache so subsequent loads pick up the newly saved DB value
        await getRecipes(true);
        return data;
    }

    async function extractWithFallback(recipeId, autoSave) {
        try {
            const fromFile = await loadRawDataFromFile(recipeId);
            rawDataInput.value = fromFile;
            return 'file';
        } catch (_) {
            // Try rendered HTML (Puppeteer)
            let rendered = null;
            try {
                rendered = await extractRenderedHtmlByRecipeId(recipeId);
            } catch (_renderedErr) {
                // fall through to visible text
            }

            if (!rendered) {
                // Try visible text (direct fetch fallback)
                try {
                    rendered = await extractVisibleTextByRecipeId(recipeId);
                } catch (_visibleErr) {
                    // fall through to error
                }
            }

            if (!rendered) {
                throw new Error(
                    'This site blocks automated extraction (e.g. Cloudflare protection). ' +
                    'To add raw data manually: open the recipe URL in your browser, ' +
                    'select all text (Ctrl+A), copy (Ctrl+C), paste it into the text area below, then click Save Raw Data.'
                );
            }

            rawDataInput.value = rendered;
            if (autoSave) {
                await saveRawData(recipeId, rendered);
            }
            return 'rendered';
        }
    }

    function downloadRawData(recipeId, rawData) {
        const blob = new Blob([rawData], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${recipeId}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 100);
    }

    getRecipes()
        .then(recipes => {
            recipeSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select a recipe...';
            recipeSelect.appendChild(defaultOption);

            recipes.forEach(recipe => {
                const label = `[${recipe.id}] ${recipe.url || recipe.name || 'No URL'}`;
                const option = document.createElement('option');
                option.value = recipe.id;
                option.textContent = label;
                recipeSelect.appendChild(option);
            });
        })
        .catch(() => {
            alert('Failed to load recipes.');
        });

    if (extractBtn) {
        extractBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            if (!recipeId) {
                alert('Please select a recipe to extract data from.');
                return;
            }

            setBusy(extractBtn, true, 'Extracting...', 'Extract Data');
            try {
                await extractWithFallback(recipeId, true);
            } catch (err) {
                rawDataInput.value = '';
                alert(err && err.message ? err.message : 'Failed to extract raw data for this recipe.');
            } finally {
                setBusy(extractBtn, false, 'Extracting...', 'Extract Data');
            }
        });
    }

    if (extractRenderedBtn) {
        extractRenderedBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            if (!recipeId) {
                alert('Please select a recipe to extract data from.');
                return;
            }

            setBusy(extractRenderedBtn, true, 'Extracting...', 'Extract Rendered HTML (Puppeteer)');
            try {
                const htmlData = await extractRenderedHtmlByRecipeId(recipeId);
                rawDataInput.value = htmlData;
                await saveRawData(recipeId, htmlData);
            } catch (err) {
                if (rawDataInput.value && rawDataInput.value.trim()) {
                    alert(`Rendered HTML extracted, but save failed. ${err && err.message ? err.message : ''}`.trim());
                } else {
                    alert(err && err.message ? err.message : 'Failed to extract rendered HTML.');
                }
            } finally {
                setBusy(extractRenderedBtn, false, 'Extracting...', 'Extract Rendered HTML (Puppeteer)');
            }
        });
    }

    if (extractVisibleTextBtn) {
        extractVisibleTextBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            if (!recipeId) {
                alert('Please select a recipe to extract data from.');
                return;
            }

            setBusy(extractVisibleTextBtn, true, 'Extracting...', 'Extract Visible Text (Browser View)');
            try {
                const visibleTextData = await extractVisibleTextByRecipeId(recipeId);
                rawDataInput.value = visibleTextData;
            } catch (err) {
                alert(err && err.message ? err.message : 'Failed to extract visible text.');
            } finally {
                setBusy(extractVisibleTextBtn, false, 'Extracting...', 'Extract Visible Text (Browser View)');
            }
        });
    }

    if (smartExtractBtn) {
        smartExtractBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            if (!recipeId) {
                alert('Please select a recipe to extract data from.');
                return;
            }

            setBusy(smartExtractBtn, true, 'Extracting...', 'Smart Extract');
            try {
                await extractWithFallback(recipeId, true);
            } catch (err) {
                if (rawDataInput.value && rawDataInput.value.trim()) {
                    alert(`Raw data extracted, but save failed. ${err && err.message ? err.message : ''}`.trim());
                } else {
                    alert(err && err.message ? err.message : 'Failed to extract raw data and rendered HTML.');
                }
            } finally {
                setBusy(smartExtractBtn, false, 'Extracting...', 'Smart Extract');
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            if (!recipeId) {
                alert('Please select a recipe to save data for.');
                return;
            }

            const rawData = rawDataInput.value || '';
            setBusy(saveBtn, true, 'Saving...', 'Save Raw Data');
            try {
                await saveRawData(recipeId, rawData);
                downloadRawData(recipeId, rawData);
                alert(`Raw data saved successfully. File: ${recipeId}.txt`);
            } catch (err) {
                alert(err && err.message ? err.message : 'Failed to save raw data.');
            } finally {
                setBusy(saveBtn, false, 'Saving...', 'Save Raw Data');
            }
        });
    }
});
