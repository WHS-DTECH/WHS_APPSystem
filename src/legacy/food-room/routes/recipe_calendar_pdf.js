const express = require('express');
const router = express.Router();
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');

// Months for date parsing (NZ date formats)
const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parseMonthDay(monthStr, dayStr, year) {
  const m = MONTH_MAP[String(monthStr || '').toLowerCase().trim()];
  if (m === undefined) return null;
  const d = parseInt(dayStr, 10);
  if (isNaN(d)) return null;
  const date = new Date(year, m, d);
  // Snap to Monday: Sunday (+1), Saturday (+2)
  const dow = date.getDay();
  if (dow === 0) date.setDate(date.getDate() + 1);
  else if (dow === 6) date.setDate(date.getDate() + 2);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

  const PRACTICAL_HEADER_PATTERN = /Practical(?:\s*(?:Lessons?|&\s*Assessment|and\s*Assessment))?/i;

function parseStartDateFromWeekCell(cellText, year) {
  const text = String(cellText || '').replace(/\s+/g, ' ').trim();

  let m = text.match(/([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d{1,2})/i);
  if (m) return parseMonthDay(m[1], m[2], year);

  m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)/i);
  if (m) return parseMonthDay(m[2], m[1], year);

  return '';
}

async function parseDocxCalendar(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('DOCX is missing word/document.xml');
  }

  const relsEntry = zip.file('word/_rels/document.xml.rels');
  const docXml = await docEntry.async('string');
  const relsXml = relsEntry ? await relsEntry.async('string') : '';

  const relMap = new Map();
  const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
  let relMatch;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    const id = relMatch[1];
    const target = decodeXmlEntities(relMatch[2]);
    if (/^https?:\/\//i.test(target)) relMap.set(id, target);
  }

  const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
  const textRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  const linkRegex = /<w:hyperlink\b[^>]*r:id="([^"]+)"[^>]*>/g;

  const rows = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(docXml)) !== null) {
    const rowXml = rowMatch[0];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const cellXml = cellMatch[0];
      const parts = [];
      let textMatch;
      while ((textMatch = textRegex.exec(cellXml)) !== null) {
        parts.push(decodeXmlEntities(textMatch[1]));
      }

      let url = '';
      let linkMatch;
      while ((linkMatch = linkRegex.exec(cellXml)) !== null) {
        const resolved = relMap.get(linkMatch[1]);
        if (resolved) {
          url = resolved;
          break;
        }
      }

      cells.push({
        text: parts.join(' ').replace(/\s+/g, ' ').trim(),
        url
      });
    }
    if (cells.length) rows.push(cells);
  }

  const fullText = rows.map((r) => r.map((c) => c.text).join(' ')).join('\n');
  const yearMatch = fullText.match(/\b(202\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const weekRowIndexes = [];
  for (let i = 0; i < rows.length; i++) {
    const weekCount = rows[i].filter((c) => /Week\s+\d+/i.test(c.text)).length;
    if (weekCount >= 3) weekRowIndexes.push(i);
  }

  const results = [];
  for (const wrIdx of weekRowIndexes) {
    const weekRow = rows[wrIdx];

    let practicalRow = null;
    for (let j = wrIdx + 1; j < Math.min(rows.length, wrIdx + 12); j++) {
      const rowText = rows[j].map((c) => c.text).join(' ');
      if (PRACTICAL_HEADER_PATTERN.test(rowText)) {
        practicalRow = rows[j];
        break;
      }
    }
    if (!practicalRow) continue;

    let term = 1;
    const nearbyText = [
      weekRow.map((c) => c.text).join(' '),
      ...rows.slice(Math.max(0, wrIdx - 5), wrIdx).map((r) => r.map((c) => c.text).join(' '))
    ].join(' ');
    const termMatch = nearbyText.match(/TERM\s*(\d+)/i);
    if (termMatch) term = Number(termMatch[1]);

    for (let col = 0; col < weekRow.length; col++) {
      const weekCell = weekRow[col];
      const m = weekCell.text.match(/Week\s+(\d+)/i);
      if (!m) continue;

      const weekNum = Number(m[1]);
      const startDate = parseStartDateFromWeekCell(weekCell.text, year);
      const recipeCell = practicalRow[col] || { text: '', url: '' };
      const recipe = normalizeRecipeFragment(recipeCell.text || '');
      const url = recipeCell.url || '';

      if (!recipe && !startDate) continue;
      results.push({
        term,
        weekNum,
        dateRange: '',
        startDate,
        recipe,
        url,
        confidence: recipe ? 'auto' : 'missing'
      });
    }
  }

  results.sort((a, b) => (a.term - b.term) || (a.weekNum - b.weekNum));

  // Fill missing Week 1 date from Week 2 for each term.
  const terms = [...new Set(results.map((r) => r.term))];
  for (const t of terms) {
    const termRows = results.filter((r) => r.term === t);
    const week1 = termRows.find((r) => r.weekNum === 1);
    const week2 = termRows.find((r) => r.weekNum === 2 && r.startDate);
    if (week1 && !week1.startDate && week2) {
      const d = new Date(week2.startDate);
      d.setDate(d.getDate() - 7);
      week1.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  // Also parse by full text and merge in any term/week entries not found in table extraction.
  // This handles mixed DOCX layouts where some terms aren't represented as a strict table.
  const parsedFromText = parseCalendarText(fullText, []);
  const textWeeks = Array.isArray(parsedFromText)
    ? parsedFromText
    : ((parsedFromText && parsedFromText.weeks) || []);

  if (!results.length) {
    return {
      weeks: textWeeks,
      rawText: fullText.slice(0, 3000)
    };
  }

  if (textWeeks.length) {
    const byTermWeek = new Map();
    for (const row of results) {
      byTermWeek.set(`${row.term}|${row.weekNum}`, row);
    }

    for (const row of textWeeks) {
      const key = `${row.term}|${row.weekNum}`;
      const existing = byTermWeek.get(key);
      if (!existing) {
        results.push(row);
        byTermWeek.set(key, row);
        continue;
      }

      // Keep table row as primary, but fill obvious blanks from text parse.
      if (!existing.startDate && row.startDate) existing.startDate = row.startDate;
      if (!existing.recipe && row.recipe) existing.recipe = row.recipe;
      if (!existing.url && row.url) existing.url = row.url;
      if (!existing.dateRange && row.dateRange) existing.dateRange = row.dateRange;
    }
    results.sort((a, b) => (a.term - b.term) || (a.weekNum - b.weekNum));
  }

  return {
    weeks: results,
    rawText: fullText.slice(0, 3000)
  };
}

function extractWeeksWithPositions(text, year) {
  const matches = [];

  // Pattern A: Week 2 Feb 1 - Feb 5
  const patternMonthDay = /Week\s+(\d+)\s+([A-Za-z]+)\s+(\d+)\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d+)/gi;
  let m;
  while ((m = patternMonthDay.exec(text)) !== null) {
    const weekNum = parseInt(m[1], 10);
    const startMonth = m[2];
    const startDay = m[3];
    const endMonth = m[4] || startMonth;
    const endDay = m[5];
    const startDate = parseMonthDay(startMonth, startDay, year);
    const endDate = parseMonthDay(endMonth, endDay, year);
    const dateRange = startDate && endDate
      ? `${startMonth} ${startDay} - ${endMonth ? endMonth + ' ' : ''}${endDay}`
      : '';
    matches.push({ weekNum, startDate, dateRange, index: m.index });
  }

  // Pattern B: Week 2 1 Feb - 5 Feb
  const patternDayMonth = /Week\s+(\d+)\s+(\d{1,2})\s+([A-Za-z]+)\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)/gi;
  while ((m = patternDayMonth.exec(text)) !== null) {
    const weekNum = parseInt(m[1], 10);
    const startDay = m[2];
    const startMonth = m[3];
    const endDay = m[4];
    const endMonth = m[5];
    const startDate = parseMonthDay(startMonth, startDay, year);
    const endDate = parseMonthDay(endMonth, endDay, year);
    const dateRange = startDate && endDate
      ? `${startDay} ${startMonth} - ${endDay} ${endMonth}`
      : '';
    matches.push({ weekNum, startDate, dateRange, index: m.index });
  }

  // Deduplicate same week/date starts captured by both patterns, preserving first seen order.
  matches.sort((a, b) => a.index - b.index);
  const deduped = [];
  const seen = new Set();
  for (const item of matches) {
    const key = `${item.index}:${item.weekNum}:${item.startDate || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function normalizeRecipeFragment(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-z]{2,})\s+([A-Za-z])\b/g, '$1$2')
    .trim();
}

function extractUrlFromRecipe(recipe) {
  // Try to extract a URL from recipe text (URLs are often embedded)
  const urlMatch = recipe.match(/https?:\/\/[^\s)]+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    // Remove the URL from the recipe text
    let recipeText = recipe.replace(url, '').trim();
    
    // Try to extract recipe name from URL (more reliable than OCR text)
    let recipeFromUrl = '';
    
    // Pattern 1: /recipes/recipe-name or /recipe/recipe-name or /r/recipe-name
    const pathMatch = url.match(/\/(?:recipe|recipes|r)\/([^/?#]+)/i);
    if (pathMatch) {
      recipeFromUrl = decodeURIComponent(pathMatch[1]).replace(/[-_]/g, ' ').trim();
    }
    
    // Pattern 2: ?recipe=Recipe%20Name or &recipe=Recipe%20Name
    if (!recipeFromUrl) {
      const queryMatch = url.match(/[\?&]recipe=([^&]+)/i);
      if (queryMatch) {
        recipeFromUrl = decodeURIComponent(queryMatch[1]).trim();
      }
    }
    
    // Use URL-derived name if available and more substantial than OCR text, otherwise keep OCR text
    if (recipeFromUrl && recipeFromUrl.length > 2) {
      recipeText = recipeFromUrl;
    }
    
    return { recipe: recipeText, url };
  }
  return { recipe, url: '' };
}

function mergeScore(left, right) {
  const a = normalizeRecipeFragment(left);
  const b = normalizeRecipeFragment(right);
  if (!a || !b) return 999;

  let score = 0;

  // Strong continuation signals.
  if (/^\(/.test(b)) score -= 8;
  if (/^[a-z]/.test(b)) score -= 7;
  if (/^[)\]}]/.test(b)) score -= 7;
  if (/\($/.test(a)) score -= 7;
  // A trailing colon often marks a complete cell label in planner exports.
  if (/:$/.test(a)) score += 10;
  if (/[;,]$/.test(a)) score -= 2;
  if (/[:;,]$/.test(b)) score -= 3;
  // Strong penalty: if both are single capitalized words (likely separate recipes), don't merge
  if (a.split(' ').length === 1 && b.split(' ').length === 1 && /^[A-Z]/.test(a) && /^[A-Z]/.test(b)) score += 25;
  if (a.split(' ').length === 1 && /^[A-Z]/.test(a) && /^[A-Z][a-z]/.test(b)) score -= 6;
  if (/\b(and|with|of|the|a|an|to|for|in|on|at)\b$/i.test(a)) score -= 5;
  if (/\b(and|with|of|the|a|an|to|for|in|on|at)\b/i.test(b)) score -= 4;
  if (a.split(' ').length === 1) score -= 3;
  if (b.split(' ').length === 1) score -= 2;

  // Likely boundary signals.
  if (/[.!?)]$/.test(a)) score += 4;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(b)) score += 1;
  if (/^(Week|TERM|Content|Assessment|ATL)$/i.test(b)) score += 12;

  return score;
}

function condenseRecipeFragments(fragments, targetCount) {
  let entries = (Array.isArray(fragments) ? fragments : [])
    .map(normalizeRecipeFragment)
    .filter(Boolean);

  if (!Number.isInteger(targetCount) || targetCount <= 0) return entries;
  if (entries.length <= targetCount) return entries;

  let guard = 0;
  while (entries.length > targetCount && guard < 2000) {
    let bestIndex = 0;
    let bestScore = Infinity;

    for (let i = 0; i < entries.length - 1; i++) {
      const score = mergeScore(entries[i], entries[i + 1]);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const merged = normalizeRecipeFragment(`${entries[bestIndex]} ${entries[bestIndex + 1]}`);
    entries.splice(bestIndex, 2, merged);
    guard += 1;
  }

  return entries;
}

function isNonRecipeToken(token) {
  const value = String(token || '').trim();
  if (!value) return true;
  if (/^(TERM\s+\d+|Week\s+\d+)$/i.test(value)) return true;
  if (/^(Content|Assessment|ATL|Theory|Resources?|Notes?)$/i.test(value)) return true;
  if (/^[A-Za-z]+\s+\d{1,2}\s*[-–]\s*(?:[A-Za-z]+\s*)?\d{1,2}$/i.test(value)) return true;
  if (/^\d{1,2}\s+[A-Za-z]+\s*[-–]\s*\d{1,2}\s+[A-Za-z]+$/i.test(value)) return true;
  if (/^(Monday|Tuesday|Wednesday|Thursday|Friday)$/i.test(value)) return true;
  return false;
}

function mergeObviousRecipeFragments(fragments) {
  let entries = (Array.isArray(fragments) ? fragments : []).map(normalizeRecipeFragment).filter(Boolean);
  if (entries.length < 2) return entries;

  let changed = true;
  let guard = 0;
  while (changed && guard < 2000) {
    changed = false;
    for (let i = 0; i < entries.length - 1; i++) {
      const score = mergeScore(entries[i], entries[i + 1]);
      // Very strong continuation pair; merge even if counts already line up.
      if (score <= -8) {
        const merged = normalizeRecipeFragment(`${entries[i]} ${entries[i + 1]}`);
        entries.splice(i, 2, merged);
        changed = true;
        break;
      }
    }
    guard += 1;
  }
  return entries;
}

function extractPracticalSections(termBlocks, fullText, getTermForIndex) {
  const sections = [];
  let m;

  // Primary matcher: explicit "Practical Lessons" text within each term block.
  for (const block of termBlocks) {
    const practicalPattern = /Practical(?:\s*(?:Lessons?|&\s*Assessment|and\s*Assessment))?\s*([\s\S]*?)(?=(?:\n\s*(?:Content|Assessment|ATL|Theory|Resources?)\b|TERM\s+\d|$))/gi;
    while ((m = practicalPattern.exec(block.text)) !== null) {
      const section = String(m[1] || '').trim();
      if (section) sections.push({ term: block.term, section });
    }
  }

  if (sections.length) return sections;

  // Fallback matcher: tolerate OCR/text-fragmented variants like
  // "Practica l Lesso n s" by matching loosened character spacing.
  const looseHeaderPattern = /P\s*r\s*a\s*c\s*t\s*i\s*c\s*a\s*l\s*L\s*e\s*s\s*s\s*o\s*n\s*s?/gi;
  while ((m = looseHeaderPattern.exec(fullText)) !== null) {
    const headerEnd = m.index + m[0].length;
    const tail = fullText.slice(headerEnd);
    const boundaryMatch = /(?:\n\s*(?:Content|Assessment|ATL|Theory|Resources?)\b|TERM\s+\d)/i.exec(tail);
    const sectionEnd = boundaryMatch ? headerEnd + boundaryMatch.index : fullText.length;
    const section = String(fullText.slice(headerEnd, sectionEnd) || '').trim();
    if (!section) continue;
    sections.push({ term: getTermForIndex(m.index), section });
  }

  return sections;
}

/**
 * Parse the raw PDF text extracted from the year planner PDF.
 * Strategy: scan for TERM markers, then Week N + date range patterns,
 * then extract recipes from the "Practical Lessons" section.
 * Returns an array of { term, weekNum, dateRange, startDate, recipe, url, notes }
 */
function parseCalendarText(text, pdfUrls = []) {
  const results = [];

  // Detect the year from "Calendar - YYYY" or similar
  let year = new Date().getFullYear();
  const yearMatch = text.match(/\b(202\d)\b/);
  if (yearMatch) year = Number(yearMatch[1]);

  // Parse week-level info from common planner date formats.
  const weekEntries = extractWeeksWithPositions(text, year);

  // Determine term boundaries by finding "TERM N" markers in the text.
  // We'll track which TERM each week belongs to by position in text.
  const termPositions = [];
  const termPattern = /TERM\s+(\d)/gi;
  let m;
  while ((m = termPattern.exec(text)) !== null) {
    termPositions.push({ term: parseInt(m[1], 10), index: m.index });
  }

  function getTermForIndex(idx) {
    let term = 1;
    for (const tp of termPositions) {
      if (tp.index <= idx) term = tp.term;
    }
    return term;
  }

  // Extract recipes from "Practical Lessons" rows in each term block.
  // This keeps recipes aligned with week groups in that same term.
  const sortedTermPositions = termPositions.slice().sort((a, b) => a.index - b.index);
  const termBlocks = [];
  if (sortedTermPositions.length) {
    for (let i = 0; i < sortedTermPositions.length; i++) {
      const start = sortedTermPositions[i].index;
      const end = i + 1 < sortedTermPositions.length ? sortedTermPositions[i + 1].index : text.length;
      termBlocks.push({ term: sortedTermPositions[i].term, text: text.slice(start, end) });
    }
  } else {
    termBlocks.push({ term: 1, text });
  }

  const practicalSections = extractPracticalSections(termBlocks, text, getTermForIndex);

  // For each practical section, split into individual recipe names.
  // They're usually separated by newlines or large spaces. Ignore non-recipe tokens.
  const noiseWords = new Set(['N/A', 'n/a', 'Assessment', 'ATL', 'Content', 'Week', 'TERM', 'Practical', 'Lessons', '', '-']);
  const allRecipes = [];
  const sectionRecipeListsByTerm = new Map();
  for (const entry of practicalSections) {
    const parts = entry.section.split(/\n+/)
      .map(s => s.trim())
      .filter(s => s && !noiseWords.has(s) && !isNonRecipeToken(s));
    const sectionRecipes = [];
    for (const p of parts) {
      // Split by common separators that pdf-parse might insert between cells
      const subParts = p.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
      for (const sp of subParts) {
        if (!noiseWords.has(sp) && sp.length > 1 && !isNonRecipeToken(sp)) {
          allRecipes.push(sp);
          sectionRecipes.push(sp);
        }
      }
    }
    if (sectionRecipes.length) {
      const mergedStrong = mergeObviousRecipeFragments(sectionRecipes);
      if (!sectionRecipeListsByTerm.has(entry.term)) sectionRecipeListsByTerm.set(entry.term, []);
      sectionRecipeListsByTerm.get(entry.term).push(...mergedStrong);
    }
  }

  // Match weekly entries to recipes. We have weekEntries sorted by weekNum per term.
  // Group again but with term info.
  const termWeekMap = new Map(); // termNum -> sorted list of weekEntry
  for (const we of weekEntries) {
    const term = getTermForIndex(we.index);
    const key = term;
    if (!termWeekMap.has(key)) termWeekMap.set(key, []);
    termWeekMap.get(key).push({ ...we, term });
  }

  // If a term's earliest week number is > 1, the PDF has no date header for the
  // leading week(s) (e.g. orientation/powhiri week). Inject ALL missing weeks 1 through minWeek-1
  // so the week count is complete and condensing doesn't over-merge recipes.
  for (const [term, entries] of termWeekMap) {
    const sorted = entries.sort((a, b) => a.weekNum - b.weekNum);
    const minWeek = sorted[0].weekNum;
    if (minWeek > 1) {
      // Inject all missing weeks from 1 to minWeek-1
      for (let w = 1; w < minWeek; w++) {
        // Calculate date as 7*(minWeek - w) days before the first known week's date
        let syntheticDate = '';
        if (sorted[0].startDate) {
          const d = new Date(sorted[0].startDate);
          d.setDate(d.getDate() - 7 * (minWeek - w));
          syntheticDate = d.toISOString().slice(0, 10);
        }
        entries.unshift({ weekNum: w, startDate: syntheticDate, dateRange: '', index: sorted[0].index, term });
      }
    }
  }

  // Flatten weeks in term order
  const sortedTerms = Array.from(termWeekMap.keys()).sort((a, b) => a - b);
  const allWeeks = [];
  for (const term of sortedTerms) {
    const weeks = termWeekMap.get(term).sort((a, b) => a.weekNum - b.weekNum);
    for (const w of weeks) allWeeks.push({ ...w, term });
  }

  // PDFs often split one recipe cell across several lines (for example,
  // "Food Truck foods:" becoming "Food", "Truck", "foods:").
  // Only condense if fragments significantly exceed weeks; otherwise keep all fragments.
  let condensedRecipes = [];
  if (sortedTerms.length > 0) {
    for (const term of sortedTerms) {
      const termWeeks = (termWeekMap.get(term) || []).length;
      const sectionRecipes = sectionRecipeListsByTerm.get(term) || [];
      const strongMerged = mergeObviousRecipeFragments(sectionRecipes);
      // Only condense if we have significantly more fragments than weeks (more than 1.3x)
      // Otherwise, use the fragments as-is to avoid merging separate recipes
      let termCondensed;
      if (strongMerged.length > termWeeks * 1.3) {
        termCondensed = condenseRecipeFragments(strongMerged, termWeeks);
      } else {
        termCondensed = strongMerged;
      }
      if (termCondensed.length) condensedRecipes.push(...termCondensed);
    }
  }

  if (!condensedRecipes.length) {
    condensedRecipes = condenseRecipeFragments(mergeObviousRecipeFragments(allRecipes), allWeeks.length);
  }

  // If we have more recipes than weeks, keep only the first allWeeks.length recipes.
  // This is safer than forced merging that corrupts recipe names.
  if (condensedRecipes.length > allWeeks.length) {
    condensedRecipes = condensedRecipes.slice(0, allWeeks.length);
  }

  // Zip weeks and recipes, using URLs from PDF or extracted from text
  // pdfUrls contains hyperlinks in order as they appear in the PDF
  let pdfUrlIndex = 0;
  for (let i = 0; i < allWeeks.length; i++) {
    const w = allWeeks[i];
    const recipeRaw = condensedRecipes[i] || '';
    const { recipe, url: textUrl } = extractUrlFromRecipe(recipeRaw);
    
    // Prefer URL from text extraction, fall back to sequential PDF URLs
    let finalUrl = textUrl;
    if (!finalUrl && pdfUrlIndex < pdfUrls.length) {
      finalUrl = pdfUrls[pdfUrlIndex];
      pdfUrlIndex++;
    }
    
    results.push({
      term: w.term,
      weekNum: w.weekNum,
      dateRange: w.dateRange || '',
      startDate: w.startDate || '',
      recipe: recipe,
      url: finalUrl,
      confidence: recipeRaw ? 'auto' : 'missing'
    });
  }

  return results;
}

/**
 * Parse a Junior-school spreadsheet (.xlsx) planner.
 * Columns: A = "Week N" label, B = recipe link (hyperlinked), C = recipe name.
 * Returns: { weeks: [{weekNum, term, startDate, recipe, url, confidence}], xlsxMode: true }
 */
async function parseXlsxCalendar(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Shared strings
  const ssEntry = zip.file('xl/sharedStrings.xml');
  const strings = [];
  if (ssEntry) {
    const ssXml = await ssEntry.async('string');
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(ssXml)) !== null) {
      strings.push(decodeXmlEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
    }
  }

  // Hyperlink rels: rId → URL
  const relsEntry = zip.file('xl/worksheets/_rels/sheet1.xml.rels');
  const urlMap = new Map();
  if (relsEntry) {
    const relsXml = await relsEntry.async('string');
    const relRe = /<Relationship\b[^>]*/g;
    let rm;
    while ((rm = relRe.exec(relsXml)) !== null) {
      const tag = rm[0];
      if (!/\/hyperlink/.test(tag)) continue;
      const idM = tag.match(/\bId="([^"]+)"/);
      const tgtM = tag.match(/\bTarget="([^"]+)"/);
      if (idM && tgtM) urlMap.set(idM[1], decodeXmlEntities(tgtM[1]));
    }
  }

  // Sheet data
  const sheetEntry = zip.file('xl/worksheets/sheet1.xml');
  if (!sheetEntry) return { weeks: [], xlsxMode: true };
  const sheetXml = await sheetEntry.async('string');

  // Map cell ref → rId from <hyperlink> elements
  const cellHlMap = new Map();
  const hlRe = /<hyperlink\b([^>]*)\/?>/g;
  let hlm;
  while ((hlm = hlRe.exec(sheetXml)) !== null) {
    const attrs = hlm[1];
    const refM = attrs.match(/\bref="([^"]+)"/);
    const ridM = attrs.match(/\br:id="([^"]+)"/);
    if (refM && ridM) cellHlMap.set(refM[1], ridM[1]);
  }

  // Parse rows
  const weeks = [];
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowM;
  while ((rowM = rowRe.exec(sheetXml)) !== null) {
    const rowXml = rowM[2];
    const cellData = {};
    const cellRe = /<c\b[^>]*\br="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(rowXml)) !== null) {
      const col = cm[1], rowNum = cm[2], attrs = cm[3], inner = cm[4];
      const ref = col + rowNum;
      let value = '';
      if (/t="s"/.test(attrs)) {
        const vM = inner.match(/<v>(\d+)<\/v>/);
        if (vM) value = strings[parseInt(vM[1])] || '';
      } else {
        const isM = inner.match(/<is>([\s\S]*?)<\/is>/);
        if (isM) value = decodeXmlEntities(isM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        else { const vM = inner.match(/<v>([^<]*)<\/v>/); if (vM) value = vM[1]; }
      }
      const rId = cellHlMap.get(ref);
      const url = rId ? (urlMap.get(rId) || '') : '';
      cellData[col] = { value, url };
    }

    const colA = cellData['A'];
    if (!colA) continue;
    const weekMatch = colA.value.match(/week\s*(\d+)/i);
    if (!weekMatch) continue;

    const weekNum = parseInt(weekMatch[1]);
    const recipe = (cellData['C'] && cellData['C'].value) || (cellData['B'] && cellData['B'].value) || '';
    const url = (cellData['B'] && cellData['B'].url)
      || (cellData['C'] && cellData['C'].url)
      || (cellData['D'] && cellData['D'].url)
      || '';
    if (!recipe) continue;

    weeks.push({ weekNum, term: 0, startDate: '', recipe, url, confidence: 'auto' });
  }

  return { weeks, xlsxMode: true };
}

/**
 * POST /api/recipe_calendar_pdf/parse
 * Body: { fileDataUrl: 'data:application/pdf;base64,...' }
 * Returns: { weeks: [...] }
 */
router.post('/parse', async (req, res) => {
  const rawDataUrl = String(req.body && (req.body.fileDataUrl || req.body.pdfDataUrl)
    ? (req.body.fileDataUrl || req.body.pdfDataUrl)
    : '');
  if (!rawDataUrl) {
    return res.status(400).json({ error: 'fileDataUrl is required.' });
  }

  // Accept PDF, DOCX, or XLSX data URLs (plus legacy bare base64 PDF).
  let fileBuffer;
  let fileType = 'pdf';
  const pdfDataUrlMatch = /^data:application\/pdf(?:;[^,]*)?;base64,(.+)$/i.exec(rawDataUrl);
  const docxDataUrlMatch = /^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document(?:;[^,]*)?;base64,(.+)$/i.exec(rawDataUrl);
  const xlsxDataUrlMatch = /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet(?:;[^,]*)?;base64,(.+)$/i.exec(rawDataUrl);
  if (pdfDataUrlMatch) {
    fileBuffer = Buffer.from(pdfDataUrlMatch[1], 'base64');
    fileType = 'pdf';
  } else if (docxDataUrlMatch) {
    fileBuffer = Buffer.from(docxDataUrlMatch[1], 'base64');
    fileType = 'docx';
  } else if (xlsxDataUrlMatch) {
    fileBuffer = Buffer.from(xlsxDataUrlMatch[1], 'base64');
    fileType = 'xlsx';
  } else if (/^[A-Za-z0-9+/]+=*$/.test(rawDataUrl.replace(/\s/g, ''))) {
    fileBuffer = Buffer.from(rawDataUrl.replace(/\s/g, ''), 'base64');
    fileType = 'pdf';
  } else {
    return res.status(400).json({ error: 'fileDataUrl must be a base64-encoded PDF/DOCX/XLSX data URL.' });
  }

  if (fileBuffer.length > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'File too large (max 20 MB).' });
  }

  try {
    if (fileType === 'xlsx') {
      const xlsxParsed = await parseXlsxCalendar(fileBuffer);
      if (!xlsxParsed.weeks.length) {
        return res.status(400).json({ error: 'No week entries found in spreadsheet. Ensure column A has "Week N" labels and column C has recipe names.' });
      }
      return res.json(xlsxParsed);
    }

    if (fileType === 'docx') {
      const docxParsed = await parseDocxCalendar(fileBuffer);
      if (!docxParsed.weeks.length) {
        return res.status(400).json({ error: 'No week entries found in DOCX. Ensure it has week headers and a Practical Lessons row.' });
      }
      return res.json(docxParsed);
    }

    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
    const pdfDoc = await pdfjsLib.getDocument(new Uint8Array(fileBuffer)).promise;

    // Extract links from PDF annotations in reading order.
    const pdfUrls = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const annotations = await page.getAnnotations();
      for (const annot of annotations || []) {
        if (annot.subtype === 'Link' && annot.url) {
          pdfUrls.push(annot.url);
        }
      }
    }

    const parsed = await pdfParse(fileBuffer);
    const rawText = parsed.text || '';
    const weeks = parseCalendarText(rawText, pdfUrls);
    res.json({ weeks, rawText: rawText.slice(0, 3000) }); // rawText preview for debugging
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse file: ' + (err.message || String(err)) });
  }
});

module.exports = router;
module.exports.parseDocxCalendar = parseDocxCalendar;
