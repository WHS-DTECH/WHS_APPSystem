/**
 * Recipe Match Engine
 * Handles automatic and manual matching of planner recipes to stored recipes
 */

/**
 * Simple Levenshtein distance for fuzzy matching
 * Returns distance between two strings (lower = more similar)
 */
function levenshteinDistance(str1, str2) {
  const s1 = String(str1 || '').toLowerCase().trim();
  const s2 = String(str2 || '').toLowerCase().trim();
  
  const len1 = s1.length;
  const len2 = s2.length;
  const d = Array(len1 + 1).fill(0).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) d[i][0] = i;
  for (let j = 0; j <= len2; j++) d[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[len1][len2];
}

/**
 * Normalize recipe name for comparison
 * Removes common articles, prepositions, and normalizes whitespace
 */
function normalizeRecipeName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/^copy\s+of\s+/i, '')
    // Remove common articles/prepositions
    .replace(/\b(the|a|an|and|with|in|on|at)\b/gi, '')
    // Normalize whitespace and special chars
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function tokenizeRecipeName(name) {
  const normalized = normalizeRecipeName(name);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function wordOverlapScore(nameA, nameB) {
  const tokensA = new Set(tokenizeRecipeName(nameA));
  const tokensB = new Set(tokenizeRecipeName(nameB));
  if (!tokensA.size || !tokensB.size) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }

  const smallerSize = Math.min(tokensA.size, tokensB.size);
  return smallerSize > 0 ? overlap / smallerSize : 0;
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '').split('.')[0];
  } catch {
    return null;
  }
}

function suggestionRank(matchType) {
  if (matchType === 'exact') return 4;
  if (matchType === 'url+name') return 3;
  if (matchType === 'name-partial') return 2;
  if (matchType === 'name-overlap') return 1;
  return 0;
}

function dedupeSuggestions(suggestions, limit = 5) {
  const byKey = new Map();

  for (const suggestion of suggestions || []) {
    if (!suggestion) continue;

    const id = Number(suggestion.id || 0);
    const score = Number(suggestion.matchScore || 0);
    const type = String(suggestion.matchType || 'name');
    const nameKey = normalizeRecipeName(suggestion.name || '');
    const key = nameKey || (id > 0 ? `id:${id}` : `anon:${Math.random()}`);

    const candidate = {
      ...suggestion,
      matchScore: score,
      matchType: type,
      _rank: suggestionRank(type)
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }

    const isBetter =
      candidate._rank > existing._rank
      || (candidate._rank === existing._rank && candidate.matchScore > existing.matchScore)
      || (candidate._rank === existing._rank
        && candidate.matchScore === existing.matchScore
        && Number(candidate.id || Number.MAX_SAFE_INTEGER) < Number(existing.id || Number.MAX_SAFE_INTEGER));

    if (isBetter) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => {
      if (b._rank !== a._rank) return b._rank - a._rank;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return Number(a.id || Number.MAX_SAFE_INTEGER) - Number(b.id || Number.MAX_SAFE_INTEGER);
    })
    .slice(0, limit)
    .map(({ _rank, ...rest }) => rest);
}

function buildSuggestionList(matches, limit = 5) {
  const combined = [];
  if (matches && matches.exactMatch) {
    combined.push({ ...matches.exactMatch, matchType: 'exact', matchScore: 1 });
  }
  if (matches && matches.urlMatch) {
    combined.push(matches.urlMatch);
  }
  if (matches && Array.isArray(matches.fuzzyMatches)) {
    combined.push(...matches.fuzzyMatches);
  }
  return dedupeSuggestions(combined, limit);
}

/**
 * Find best matches for a planner recipe
 * Returns: { exactMatch, fuzzyMatches, urlMatch }
 */
async function findRecipeMatches(plannerRecipe, storedRecipes) {
  const plannerName = plannerRecipe.recipe || '';
  const plannerUrl = plannerRecipe.recipe_url || '';
  
  const normalized = normalizeRecipeName(plannerName);

  let exactMatch = null;
  let urlMatch = null;
  const fuzzyMatches = [];

  for (const stored of storedRecipes) {
    const storedName = stored.name || '';
    const storedUrl = stored.url || '';

    // Exact name match
    if (storedName.toLowerCase().trim() === plannerName.toLowerCase().trim()) {
      exactMatch = stored;
      continue;
    }

    // URL match (if both have URLs)
    if (plannerUrl && storedUrl) {
      const plannerDomain = extractDomain(plannerUrl);
      const storedDomain = extractDomain(storedUrl);
      if (plannerDomain && storedDomain && plannerDomain === storedDomain) {
        // Same domain - good indicator
        const similarity = 1 - levenshteinDistance(normalized, normalizeRecipeName(storedName)) / Math.max(normalized.length, storedName.length);
        if (similarity > 0.6) {
          urlMatch = { ...stored, matchScore: similarity, matchType: 'url+name' };
        }
      }
    }

    // Fuzzy name match
    const normalizedStoredName = normalizeRecipeName(storedName);
    const distance = levenshteinDistance(normalized, normalizedStoredName);
    const maxLen = Math.max(normalized.length, normalizedStoredName.length);
    const levenshteinSimilarity = maxLen > 0 ? 1 - (distance / maxLen) : 0;

    // Catch partial-title matches (e.g., "burger" in "deconstructed burger beef mixture").
    const containsMatch = Boolean(
      normalized && normalizedStoredName && (
        (normalized.length >= 4 && normalizedStoredName.includes(normalized)) ||
        (normalizedStoredName.length >= 4 && normalized.includes(normalizedStoredName))
      )
    );
    const overlapSimilarity = wordOverlapScore(normalized, normalizedStoredName);
    const similarity = Math.max(
      levenshteinSimilarity,
      containsMatch ? 0.62 : 0,
      overlapSimilarity * 0.85
    );

    // Suggestions can be broader than auto-match so users see useful options.
    if (similarity >= 0.45) {
      fuzzyMatches.push({
        ...stored,
        matchScore: similarity,
        matchType: containsMatch ? 'name-partial' : (overlapSimilarity >= 0.6 ? 'name-overlap' : 'name')
      });
    }
  }

  // Sort fuzzy matches by score descending
  fuzzyMatches.sort((a, b) => b.matchScore - a.matchScore);

  return {
    exactMatch,
    urlMatch,
    fuzzyMatches: fuzzyMatches.slice(0, 5) // Top 5 matches
  };
}

/**
 * Auto-match a planner recipe to stored recipes
 * Returns recipe_id if confident match found, null otherwise
 * Confidence thresholds:
 * - Exact match: always match
 * - URL match with 85%+ name similarity: match
 * - Fuzzy match 90%+ similarity: match
 */
async function autoMatchRecipe(plannerRecipe, storedRecipes) {
  const matches = await findRecipeMatches(plannerRecipe, storedRecipes);

  // Highest priority: exact match
  if (matches.exactMatch) {
    return {
      recipeId: matches.exactMatch.id,
      confidence: 'exact',
      matchedRecipe: matches.exactMatch
    };
  }

  // Second priority: URL match with strong name similarity
  if (matches.urlMatch && matches.urlMatch.matchScore >= 0.85) {
    return {
      recipeId: matches.urlMatch.id,
      confidence: 'url-strong',
      matchedRecipe: matches.urlMatch
    };
  }

  // Third priority: very high fuzzy match (90%+)
  if (matches.fuzzyMatches.length > 0 && matches.fuzzyMatches[0].matchScore >= 0.90) {
    return {
      recipeId: matches.fuzzyMatches[0].id,
      confidence: 'fuzzy-high',
      matchedRecipe: matches.fuzzyMatches[0]
    };
  }

  // No confident match found
  return null;
}

/**
 * Process batch of planner bookings and match recipes
 * Returns: { matched: [], unmatched: [] }
 */
async function matchPlannerBookings(bookings, storedRecipes) {
  const matched = [];
  const unmatched = [];

  for (const booking of bookings) {
    // Skip if already has recipe_id
    if (booking.recipe_id) {
      matched.push({ ...booking, status: 'already_linked' });
      continue;
    }

    const result = await autoMatchRecipe(booking, storedRecipes);
    
    if (result) {
      matched.push({
        ...booking,
        recipe_id: result.recipeId,
        match_confidence: result.confidence,
        status: 'auto_matched'
      });
    } else {
      // Provide suggestions for manual review
      const matches = await findRecipeMatches(booking, storedRecipes);
      unmatched.push({
        ...booking,
        suggestions: buildSuggestionList(matches, 5),
        status: 'needs_review'
      });
    }
  }

  return { matched, unmatched };
}

module.exports = {
  levenshteinDistance,
  normalizeRecipeName,
  extractDomain,
  buildSuggestionList,
  findRecipeMatches,
  autoMatchRecipe,
  matchPlannerBookings
};
