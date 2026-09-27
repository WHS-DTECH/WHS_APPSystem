(function () {
  function htmlUnescape(str) {
    const temp = document.createElement('textarea');
    temp.innerHTML = String(str || '');
    return temp.value;
  }

  function normalizeResult(result) {
    if (Array.isArray(result)) return result.join('\n').trim();
    if (result && typeof result === 'object') return JSON.stringify(result, null, 2).trim();
    return String(result || '').trim();
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

  function extractTitleFromUrlSlug(url) {
    if (!url) return '';
    let slug = '';
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      slug = parts.length ? parts[parts.length - 1] : '';
    } catch (_) {
      const parts = String(url).split('/').filter(Boolean);
      slug = parts.length ? parts[parts.length - 1] : '';
    }

    if (!slug) return '';

    return cleanTitleFromSlug(slug);
  }

  function runServingSizeAuto(raw) {
    const source = String(raw || '');
    const strategies = [
      { name: 'Find common yield phrases', fn: t => (t.match(/\b(?:serves?|servings?|makes?|yield)\b\s*[:\-]?\s*(\d{1,3})\b/i) || [])[1] || '' },
      { name: 'Find servings label', fn: t => (t.match(/<label class="field-label">Servings:<\/label>[^\d]*(\d+)/i) || [])[1] || '' },
      { name: 'Find serving number in text', fn: t => {
          const lines = t.split(/\n|<br\s*\/?\s*>/i);
          for (const line of lines) {
            if (/(?:serving|serves|yield|makes)/i.test(line)) {
              const m = line.match(/(\d+)/);
              if (m) return m[1];
            }
          }
          return '';
        }
      },
      { name: 'Fallback first numeric line', fn: t => {
          const lines = t.split(/\n|<br\s*\/?\s*>/i).slice(0, 40);
          for (const line of lines) {
            const trimmed = String(line || '').trim();
            if (!trimmed || /^\d+\./.test(trimmed)) continue;
            const m = trimmed.match(/(\d+)/);
            if (m) return m[1];
          }
          return '';
        }
      }
    ];

    for (const s of strategies) {
      const val = normalizeResult(s.fn(source));
      if (val) return { solution: val, strategyName: s.name };
    }
    return { solution: '', strategyName: '' };
  }

  function runInstructionsAutoCore(raw) {
    const source = String(raw || '');

    const coreStrategies = [
      {
        name: 'Look for ordered list',
        fn: t => {
          const u = htmlUnescape(t).replace(/<img[^>]*>/gi, '');
          const match = u.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
          return match ? match[1].replace(/<li[^>]*>/g, '').replace(/<\/li>/g, '\n').trim() : '';
        }
      },
      {
        name: 'Look for numbered steps',
        fn: t => {
          const u = htmlUnescape(t).replace(/<img[^>]*>/gi, '');
          const lines = u.split(/\n|<br\s*\/?\s*>/i);
          const methodHeadingIndex = lines.findIndex(line => /^method\b/i.test(String(line || '').trim()));
          const startIndex = methodHeadingIndex >= 0 ? methodHeadingIndex : 0;
          const instructionVerbRegex = /\b(preheat|heat|melt|add|mix|stir|cook|pour|bake|serve|beat|whisk|simmer|combine|fold|place|sift|grease|bring|cool|refrigerate|remove|cut|chop|drizzle|garnish|top|divide)\b/i;
          const pageNoiseRegex = /\b(heartfoundation\.org\.nz|vegetables\.co\.nz)\b|\|\s*\d{4}\b/i;
          const steps = [];
          let expectedStepNumber = 1;
          for (let i = startIndex; i < lines.length; i++) {
            const line = String(lines[i] || '').trim();
            if (!line) continue;
            const numberedInline = line.match(/^(\d+)\.\s+(\S.*)$/);
            if (numberedInline) {
              const stepNumber = Number(numberedInline[1]);
              const stepText = String(numberedInline[2] || '').trim();
              if (!stepText || pageNoiseRegex.test(stepText)) continue;
              if (!instructionVerbRegex.test(stepText) && stepText.split(/\s+/).length < 4) continue;
              if (!steps.length && stepNumber !== 1) continue;
              if (steps.length && stepNumber !== expectedStepNumber) break;
              steps.push(`${stepNumber}. ${stepText}`);
              expectedStepNumber = stepNumber + 1;
              continue;
            }
            // Supports formats where the step number is on its own line.
            if (/^\d+[.)]?$/.test(line)) {
              const stepNumber = Number(line.replace(/[.)]$/, ''));
              if (!steps.length && stepNumber !== 1) continue;
              if (steps.length && stepNumber !== expectedStepNumber) break;
              let next = '';
              for (let j = i + 1; j < lines.length; j++) {
                next = String(lines[j] || '').trim();
                if (next) break;
              }
              if (
                next &&
                !/^\d+[.)]?$/.test(next) &&
                !/^(ingredients?|method|instructions?)\b/i.test(next) &&
                !pageNoiseRegex.test(next) &&
                (instructionVerbRegex.test(next) || next.split(/\s+/).length >= 4)
              ) {
                steps.push(`${stepNumber}. ${next}`);
                expectedStepNumber = stepNumber + 1;
              }
            }
          }
          return steps.length ? steps.join('\n') : '';
        }
      },
      {
        name: "Find 'method' and nearest list",
        fn: t => {
          const u = htmlUnescape(t).replace(/<img[^>]*>/gi, '');
          const methodIndex = u.toLowerCase().indexOf('method');
          if (methodIndex === -1) return '';
          const after = u.substring(methodIndex);
          let listMatch = after.match(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i);
          if (!listMatch) {
            const wysiwygBlocks = [...u.matchAll(/<div[^>]*class=["'][^"']*wysiwyg[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
            for (const block of wysiwygBlocks) {
              const list = block[1].match(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i);
              if (list) { listMatch = list; break; }
            }
          }
          if (listMatch) {
            const items = [...listMatch[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
              .map(m => m[1].replace(/<[^>]+>/g, '').trim())
              .filter(Boolean);
            return items.length ? items.join('\n') : '';
          }
          return '';
        }
      },
      {
        name: "Find 'Method' text in visible blocks",
        fn: t => {
          const unescapedData = htmlUnescape(t).replace(/<img[^>]*>/gi, '');
          const lower = unescapedData.toLowerCase();
          const visibleTextIndex = lower.indexOf('visible page text:');
          const scopedLower = visibleTextIndex >= 0 ? lower.slice(visibleTextIndex) : lower;
          const scopedOffset = visibleTextIndex >= 0 ? visibleTextIndex : 0;
          const methodMatches = [...scopedLower.matchAll(/\bmethod\b/g)].map(m => ({ index: m.index + scopedOffset }));
          if (!methodMatches.length) return '';

          const isInstructionLike = s => /\b(preheat|heat|melt|add|mix|stir|cook|pour|bake|serve|beat|whisk|simmer|combine|fold|place|sift|grease|bring|cool|refrigerate|remove|cut|chop)\b/i.test(s);
          const isIngredientLike = s => /^\s*(\d+(?:[/.]\d+)?|\d+\s+\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(cups?|cup|tbsp|tsp|g|kg|ml|l|oz|lb|pinch|salt|sugar|butter|milk)\b/i.test(s);
          const navNoise = /\b(recipes|products|contact|home recipes|school visits|comments|review|favourites|join|newsletter|cookie|privacy|terms)\b/i;
          const promoStopRegex = /\b(?:chelsea\s+products\s+in\s+recipe|you\s+may\s+like\s+these|load\s+more|watch\s+video|rate\s+recipe|what\s+did\s+you\s+think\s+of\s+this\s+recipe|reviews?|details)\b/i;
          const stopMarkers = [
            'page text:', 'login to', 'favourites', 'join our newsletter', 'cookies',
            'privacy statement', 'terms and conditions', 'comments', 'review',
            'products', 'contact us', 'home recipes', 'school visits',
            'chelsea products in recipe', 'you may like these', 'load more'
          ];

          const candidates = [];
          for (const match of methodMatches) {
            const methodIndex = match.index;
            const lookBehind = lower.slice(Math.max(0, methodIndex - 24), methodIndex);
            if (lookBehind.includes('ingredients')) continue;

            let chunk = unescapedData.slice(methodIndex, methodIndex + 4000);
            for (const marker of stopMarkers) {
              const stopAt = chunk.toLowerCase().indexOf(marker);
              if (stopAt > 0) {
                chunk = chunk.slice(0, stopAt);
                break;
              }
            }
            const promoMatch = chunk.match(promoStopRegex);
            if (promoMatch && promoMatch.index > 0) {
              chunk = chunk.slice(0, promoMatch.index);
            }

            chunk = chunk.replace(/^method\s*[:\-]?\s*/i, '').replace(/\s+/g, ' ').trim();
            if (!chunk) continue;

            const sentenceParts = chunk.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
            const firstFew = sentenceParts.slice(0, 8);
            const ingredientCount = firstFew.filter(isIngredientLike).length;
            const instructionCount = firstFew.filter(isInstructionLike).length;
            if (ingredientCount >= 3 && instructionCount === 0) continue;
            const instructionLines = sentenceParts.filter(s => isInstructionLike(s) && !navNoise.test(s));
            if (instructionLines.length) candidates.push(instructionLines);
          }

          if (!candidates.length) return '';
          return candidates.sort((a, b) => b.length - a.length)[0].join('\n');
        }
      },
      {
        name: 'Extract instruction tail from Visible List Items',
        fn: t => {
          const u = htmlUnescape(t).replace(/<img[^>]*>/gi, '');
          const blockMatch = u.match(/Visible List Items:\s*([\s\S]*?)(?:\n\s*Page Text:|\n\s*Visible Page Text:|$)/i);
          if (!blockMatch) return '';

          const lines = blockMatch[1].split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
          const instructionLine = line => /\b(preheat|heat|melt|add|mix|stir|cook|pour|bake|serve|beat|whisk|simmer|combine|fold|place|sift|grease|bring|cool|refrigerate|remove|cut|chop)\b/i.test(line);
          const navNoise = /\b(recipes|products|contact|home recipes|school visits|comments|review|favourites|join|newsletter|cookie|privacy|terms)\b/i;
          const methodIndex = lines.findIndex(line => /^method\s*[:\-]?\s*$/i.test(line));
          const startIndex = methodIndex >= 0 ? methodIndex : lines.findIndex(instructionLine);
          if (startIndex < 0) return '';

          const tail = lines.slice(startIndex).map(line => line.replace(/^method\s*[:\-]?\s*/i, '').trim());
          const cutoffIndex = tail.findIndex((line, idx) => idx > 0 && navNoise.test(line));
          const relevantTail = cutoffIndex >= 0 ? tail.slice(0, cutoffIndex) : tail;
          const extracted = [];
          for (const line of relevantTail) {
            if (navNoise.test(line) && extracted.length) break;
            if (instructionLine(line) && !navNoise.test(line)) extracted.push(line);
            else if (extracted.length) break;
          }
          return extracted.length ? extracted.join('\n') : '';
        }
      },
      {
        name: 'Extract recipeInstructions array from JSON',
        fn: t => {
          const match = t.match(/"recipeInstructions"\s*:\s*(\[[\s\S]*?\])/);
          return match ? match[1] : '';
        }
      }
    ];

    for (const strategy of coreStrategies) {
      const out = normalizeResult(strategy.fn(source));
      if (out && out !== 'N/A') {
        return { solution: out, strategyName: strategy.name };
      }
    }
    return { solution: '', strategyName: '' };
  }

  function parseIngredientLinesFromRaw(fileText) {
    const source = String(fileText || '')
      // Normalize common mojibake seen in imported recipe text so fraction quantities
      // still match ingredient quantity regexes.
      .replace(/Â/g, ' ')
      .replace(/Â¼/g, '¼')
      .replace(/Â½/g, '½')
      .replace(/Â¾/g, '¾')
      .replace(/â…“/g, '⅓')
      .replace(/â…”/g, '⅔')
      .replace(/â…›/g, '⅛')
      .replace(/â…œ/g, '⅜')
      .replace(/â…�/g, '⅝')
      .replace(/â€“/g, '-')
      .replace(/â€”/g, '-');
    const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Merge OCR/PDF split fractions such as "1" + "/2 cup milk" into "1/2 cup milk".
    const normalizedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const current = String(lines[i] || '').trim();
      const next = String(lines[i + 1] || '').trim();
      if (/^\d+$/.test(current) && /^\/\d+\b/.test(next)) {
        normalizedLines.push(`${current}${next}`);
        i++;
        continue;
      }
      normalizedLines.push(current);
    }

    const workingLines = normalizedLines;
    const qtyRegex = /^((\d+(?:[/.]\d+)?(?:\s*-\s*\d+(?:[/.]\d+)?)?|\d+\s+\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]))\s*([a-zA-Z]+)?/i;
    const unitRegex = /\b(cups?|cup|tbsp|tsp|g|kg|mg|ml|l|oz|lb|pinch|cloves?|slices?|eggs?)\b/i;
    const trailingQtyRegex = /^[a-z][a-z0-9'()&\s,\/.\-]*\s-\s*(?:\d+(?:[/.]\d+)?(?:\s*-\s*\d+(?:[/.]\d+)?)?|\d+\s+\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s*(?:cups?|cup|tbsp|tsp|g|kg|mg|ml|l|oz|lb|pinch(?:es)?|cloves?|slices?|eggs?|bunch(?:es)?))?\s*$/i;
    const seasoningRegex = /\bto\s+taste\b/i;
    const standaloneMeasurementRegex = /^(?:teaspoons?|tablespoons?|tbsp|tsp|cups?|cup|g|kg|mg|ml|l|oz|lb|pinch(?:es)?|cloves?|slices?|eggs?)$/i;
    const instructionVerbRegex = /\b(place|bring|reduce|cover|remove|transfer|stir|use|slice|serve|rinse|preheat|bake|cook|mix|whisk)\b/i;
    const methodStartRegex = /^(?:heat|add|cook|simmer|serve|bring|once|if|place|stir|mix|reduce|cover|remove)\b/i;
    const stopRegex = /^(videos?|method\b|instructions?\b|can you|try one of these recipes|products|home recipes|comments|review|favourites|join|newsletter|contact|privacy|terms|school visits|tour|cafe|related recipes|you may like these|chelsea products in recipe)/i;
    const splitPacked = (line) => String(line || '')
      .split(/\s*,\s*(?=(?:\d+(?:[/.]\d+)?(?:\s*-\s*\d+(?:[/.]\d+)?)?|\d+\s+\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]))/)
      .map(part => part.trim())
      .filter(Boolean);
    const equipmentLineRegex = /\b(baking paper|baking tray|roasting dish|cutting board|kitchen scales?|measuring cups?|measuring spoons?|\btongs?\b|\bspoons?\b|equipment)\b/i;

    const isIngredientNameLike = (line) => {
      const text = String(line || '').trim();
      if (!text) return false;
      if (stopRegex.test(text)) return false;
      if (isBareStepNumber(text)) return false;
      if (qtyRegex.test(text)) return false;
      if (instructionVerbRegex.test(text)) return false;
      if (methodStartRegex.test(text)) return false;
      if (/^(weight|ingredient|measurement|tags|serving sizes|see all weight requirements)$/i.test(text)) return false;
      if (/^(year\s*\d|or)$/i.test(text)) return false;
      return /[a-z]/i.test(text);
    };

    const isBareStepNumber = (line) => /^\d+[.)]?$/.test(String(line || '').trim());

    const isIngredientLike = (line) => {
      if (!line) return false;
      if (stopRegex.test(line)) return false;
      if (isBareStepNumber(line)) return false;
      // Reject numbered method steps such as "1. Place rice ..." unless the line clearly looks like a quantity ingredient.
      if (/^\d+\.\s+/.test(line)) {
        if (instructionVerbRegex.test(line)) return false;
        if (!unitRegex.test(line)) return false;
      }
      if (trailingQtyRegex.test(line)) return true;
      if (seasoningRegex.test(line) && /\b(salt|pepper|seasoning|herbs?)\b/i.test(line)) return true;
      if (qtyRegex.test(line)) return true;
      return unitRegex.test(line) && (/^\d/.test(line) || /^[¼½¾⅓⅔⅛⅜⅝⅞]/.test(line));
    };

    function collectIngredientBlock(startIndex, endIndexExclusive) {
      const maxEnd = Math.min(workingLines.length, Math.max(startIndex, endIndexExclusive));
      const out = [];
      let started = false;
      let nonIngredientAfterStart = 0;

      for (let i = startIndex; i < maxEnd; i++) {
        const rawLine = workingLines[i];
        if (!rawLine) continue;
        if (stopRegex.test(rawLine) && started) break;

        const parts = splitPacked(rawLine);
        let addedThisLine = false;

        for (const part of parts) {
          if (stopRegex.test(part) && started) return out;
          if (isIngredientLike(part)) {
            let combinedPart = part;
            if (/^\d/.test(part) && i + 1 < maxEnd) {
              const nextLine = String(workingLines[i + 1] || '').trim();
              const nextNextLine = String(workingLines[i + 2] || '').trim();
              const looksLikeSplitTableRow = isIngredientNameLike(nextLine)
                && (
                  !nextNextLine
                  || isIngredientLike(nextNextLine)
                  || stopRegex.test(nextNextLine)
                  || standaloneMeasurementRegex.test(nextNextLine)
                  // Handle the final table ingredient where the next line starts method text,
                  // e.g. "1.4kg" + "Water" + "Heat cooking oil...".
                  || instructionVerbRegex.test(nextNextLine)
                  || methodStartRegex.test(nextNextLine)
                  || /^(home|contact|privacy|copyright|feedback)\b/i.test(nextNextLine)
                );
              if (looksLikeSplitTableRow) {
                combinedPart = `${part} ${nextLine}`;
                if (standaloneMeasurementRegex.test(nextNextLine) && i + 3 < maxEnd) {
                  const afterMeasurement = String(workingLines[i + 3] || '').trim();
                  if (!afterMeasurement || isIngredientLike(afterMeasurement) || stopRegex.test(afterMeasurement)) {
                    i += 2;
                  } else {
                    i += 1;
                  }
                } else {
                  i += 1;
                }
              }
            }

            out.push(combinedPart);
            started = true;
            addedThisLine = true;
          }
        }

        if (started && !addedThisLine) {
          const isSectionHeading = /^[A-Z][A-Z\s()\/-]{2,30}$/.test(rawLine)
            && !stopRegex.test(rawLine)
            && !instructionVerbRegex.test(rawLine);
          if (isSectionHeading && out.length) {
            out.push(rawLine);
            nonIngredientAfterStart = 0;
            continue;
          }

          // A short, lowercase-starting line is a preparation descriptor (e.g. "sliced", "chopped",
          // "sliced into strips"). Append it to the last collected ingredient rather than stopping.
          const isSkippableMetaLine = /^(equipment|preparation and cooking skills|nutrition|tips)\b/i.test(rawLine)
            || /^\([^)]*\)$/.test(rawLine);
          if (isSkippableMetaLine) {
            continue;
          }

          const isDescriptor = rawLine.length < 60
            && /^[a-z]/.test(rawLine)
            && !stopRegex.test(rawLine)
            && !isBareStepNumber(rawLine);
          if (isDescriptor && out.length) {
            out[out.length - 1] = out[out.length - 1] + ', ' + rawLine;
          } else {
            nonIngredientAfterStart++;
            // Allow brief non-ingredient runs so "Ingredients -> Equipment -> Ingredients" layouts still parse.
            if (out.length >= 2 && nonIngredientAfterStart >= 6) break;
          }
        } else if (addedThisLine) {
          nonIngredientAfterStart = 0;
        }
      }

      return out;
    }

    const ingredientHeadingIndices = [];
    for (let i = 0; i < workingLines.length; i++) {
      if (/^ingredients?\b/i.test(workingLines[i])) ingredientHeadingIndices.push(i);
    }

    const methodHeadingIndices = [];
    const instructionHeadingIndices = [];
    for (let i = 0; i < workingLines.length; i++) {
      if (/^method\b/i.test(workingLines[i])) methodHeadingIndices.push(i);
      if (/^instructions?\b/i.test(workingLines[i])) instructionHeadingIndices.push(i);
    }

    let bestCandidates = [];
    let bestScore = Number.NEGATIVE_INFINITY;

    function scoreCandidate(linesForCandidate, sourceType) {
      const count = Array.isArray(linesForCandidate) ? linesForCandidate.length : 0;
      if (!count) return Number.NEGATIVE_INFINITY;

      let score = 0;
      // Prefer explicit Ingredients -> Method ranges over looser after-Method fallback.
      if (sourceType === 'between') score += 100;

      // Typical ingredient blocks are modest in size; heavily penalize giant spillover blocks.
      if (count >= 4 && count <= 24) score += 40;
      if (count > 40) score -= (count - 40) * 2;

      // Slight preference for blocks close to ~12 lines (common recipe ingredient size).
      score += Math.max(0, 20 - Math.abs(count - 12));

      return score;
    }

    for (const ingredientsIdx of ingredientHeadingIndices) {
      const nextHeadingCandidates = [...methodHeadingIndices, ...instructionHeadingIndices]
        .filter(idx => idx > ingredientsIdx);
      const nextHeading = nextHeadingCandidates.length ? Math.min(...nextHeadingCandidates) : (ingredientsIdx + 120);

      const between = collectIngredientBlock(ingredientsIdx + 1, nextHeading);

      // Some pages present Ingredients then Method then ingredient lines; test that shape too.
      let afterMethod = [];
      const firstMethodAfter = methodHeadingIndices.find(idx => idx > ingredientsIdx);
      if (firstMethodAfter !== undefined) {
        afterMethod = collectIngredientBlock(firstMethodAfter + 1, firstMethodAfter + 120);
      }

      const betweenScore = scoreCandidate(between, 'between');
      if (betweenScore > bestScore) {
        bestScore = betweenScore;
        bestCandidates = between;
      }

      const afterMethodScore = scoreCandidate(afterMethod, 'afterMethod');
      if (afterMethodScore > bestScore) {
        bestScore = afterMethodScore;
        bestCandidates = afterMethod;
      }
    }

    if (!bestCandidates.length) {
      bestCandidates = collectIngredientBlock(0, Math.min(workingLines.length, 200));
    }

    const deduped = [];
    const seen = new Set();
    for (const line of bestCandidates) {
      if (equipmentLineRegex.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(line);
    }
    return deduped;
  }

  function runIngredientsAutoCore(raw) {
    const lines = parseIngredientLinesFromRaw(raw);
    return {
      solution: lines.join('\n'),
      strategyName: lines.length ? 'Extract ingredient lines from raw text' : ''
    };
  }

  window.ExtractorAutoCore = {
    runServingSizeAuto,
    extractTitleFromUrlSlug,
    runInstructionsAutoCore,
    runIngredientsAutoCore,
    parseIngredientLinesFromRaw
  };
})();
