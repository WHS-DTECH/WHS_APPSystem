
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Locale-aware date formatting using the browser's regional settings
const userLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shortDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
});
const longDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat(userLocale, { weekday: 'long' });
const WEEK_DAYS_COUNT = 7;
const bookingPageLabel = (window && window.bookingPageLabel) ? String(window.bookingPageLabel) : 'Load Booking';
const bookClassSharedStateKey = 'bookClassEmbedSharedState';
const bookClassSharedChannelName = 'bookClassEmbedSharedChannel';
const scheduleViewModeStorageKey = 'scheduleViewMode';
const plannerSyncTokenStorageKey = 'plannerSyncToken';
const schedulePageParams = new URLSearchParams(window.location.search);
const schedulePresetBookingId = parseInt(String(schedulePageParams.get('booking_id') || ''), 10);
const schedulePresetWeekStart = String(schedulePageParams.get('week_start') || '').trim();
const scheduleAutoPrintBooking = String(schedulePageParams.get('auto_print_booking') || '').trim() === '1';
const scheduleCalendarSourceId = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const scheduleCalendarSharedChannel = ('BroadcastChannel' in window)
  ? new BroadcastChannel(bookClassSharedChannelName)
  : null;
const scheduleCalendarFilters = (window && window.scheduleCalendarFilters && typeof window.scheduleCalendarFilters === 'object')
  ? window.scheduleCalendarFilters
  : {};
let lastCalendarRefreshSignalAt = 0;
let schedulePresetApplied = false;
let scheduleAutoPrintDone = false;
let scheduleViewMode = (() => {
  const saved = String(localStorage.getItem(scheduleViewModeStorageKey) || '').trim().toLowerCase();
  return saved === 'recipe' ? 'recipe' : 'class';
})();

function updatePrintButtonLabel() {
  const btn = document.getElementById('printScheduleBtn');
  if (!btn) return;
  btn.textContent = scheduleViewMode === 'recipe' ? 'Print by Recipe' : 'Print Schedule (A4)';
}

function getNzSchoolDateInfo(isoDate) {
  if (!window.NZSchoolCalendar || typeof window.NZSchoolCalendar.getDateInfo !== 'function') {
    return null;
  }
  return window.NZSchoolCalendar.getDateInfo(isoDate);
}

function formatTermLabelForBadge(termName) {
  return String(termName || '').replace(/\s+\d{4}$/, '');
}

function buildCalendarDateHeaderHtml(weekDate) {
  const base = escHtml(String(weekDate && weekDate.display ? weekDate.display : ''));
  const info = getNzSchoolDateInfo(weekDate && weekDate.iso ? weekDate.iso : '');
  if (!info) return base;

  const chips = [];
  if (info.termName && !info.isSchoolHoliday) {
    chips.push(`<span style='display:inline-block;padding:0.05rem 0.34rem;border-radius:999px;background:#e8f5e9;color:#166534;border:1px solid #bbf7d0;font-size:0.68rem;font-weight:700;'>${escHtml(formatTermLabelForBadge(info.termName))}</span>`);
  }
  if (info.schoolHolidayName) {
    chips.push(`<span style='display:inline-block;padding:0.05rem 0.34rem;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:0.68rem;font-weight:700;'>School holidays</span>`);
  }
  if (info.publicHolidayName) {
    chips.push(`<span style='display:inline-block;padding:0.05rem 0.34rem;border-radius:999px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:0.68rem;font-weight:700;'>${escHtml(info.publicHolidayName)}</span>`);
  }
  if (info.additionalSchoolClosedDayName) {
    chips.push(`<span style='display:inline-block;padding:0.05rem 0.34rem;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:0.68rem;font-weight:700;'>${escHtml(info.additionalSchoolClosedDayName)}</span>`);
  }

  if (!chips.length) return base;
  return `${base}<div style='display:flex;flex-direction:column;gap:0.12rem;align-items:center;margin-top:0.18rem;'>${chips.join('')}</div>`;
}

function getCellPrimaryText(booking) {
  if (scheduleViewMode === 'recipe') {
    const bookingRecipe = String((booking && booking.recipe) || '').trim();
    const bookingRecipeLower = bookingRecipe.toLowerCase();
    const recipeLabel = (bookingRecipeLower === 'no recipe allocated' || bookingRecipeLower === 'theory')
      ? bookingRecipe
      : String((booking && booking.linked_recipe_name) || bookingRecipe || '').trim();
    return recipeLabel ? `Recipe: ${recipeLabel}` : `Class: ${booking.class_name || ''}`;
  }
  return `Class: ${booking.class_name || ''}`;
}

// Curated teacher palette — all colours clearly distinct from the school planner
// colours (orange = Senior, green = Junior, blue = Middle) and from each other.
// Colours are assigned sequentially per visible teacher each week, so no two
// teachers shown at the same time ever share a colour.
const TEACHER_COLOUR_PALETTE = [
  { bg: '#fee2e2', border: '#fca5a5', teacherText: '#991b1b' },  // Crimson
  { bg: '#fef3c7', border: '#fcd34d', teacherText: '#78350f' },  // Amber/Gold
  { bg: '#d9f99d', border: '#84cc16', teacherText: '#365314' },  // Lime
  { bg: '#a5f3fc', border: '#06b6d4', teacherText: '#0e7490' },  // Cyan
  { bg: '#ede9fe', border: '#8b5cf6', teacherText: '#4c1d95' },  // Violet
  { bg: '#fdf4ff', border: '#d946ef', teacherText: '#701a75' },  // Fuchsia
  { bg: '#ffe4e6', border: '#fb7185', teacherText: '#881337' },  // Rose
  { bg: '#f1f5f9', border: '#94a3b8', teacherText: '#1e293b' },  // Slate
];

let _teacherColourMap = new Map();

function buildTeacherColourMap(bookings) {
  _teacherColourMap = new Map();
  let idx = 0;
  for (const b of (Array.isArray(bookings) ? bookings : [])) {
    const name = String((b && b.staff_name) || '').trim();
    if (!name || _teacherColourMap.has(name)) continue;
    _teacherColourMap.set(name, TEACHER_COLOUR_PALETTE[idx % TEACHER_COLOUR_PALETTE.length]);
    idx++;
  }
}

function teacherColorFromName(name) {
  const input = String(name || '').trim();
  if (!input) {
    return { bg: '#f3f4f6', border: '#d1d5db', text: '#1f2937', teacherText: '#374151' };
  }
  const entry = _teacherColourMap.get(input);
  if (entry) {
    return { bg: entry.bg, border: entry.border, text: '#1f2937', teacherText: entry.teacherText };
  }
  // Fallback for teachers not in the current week (e.g. legend called before map built):
  // use a stable palette index derived from the name hash.
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  const fallback = TEACHER_COLOUR_PALETTE[Math.abs(hash) % TEACHER_COLOUR_PALETTE.length];
  return { bg: fallback.bg, border: fallback.border, text: '#1f2937', teacherText: fallback.teacherText };
}

function getCalendarCellBaseStyle(booking) {
  if (isTheoryBooking(booking)) {
    return theoryBookingStyle();
  }
  if (scheduleViewMode === 'recipe') {
    const plannerStyle = plannerChipStyle(normalizePlannerStream(booking));
    return {
      bg: plannerStyle.bg,
      border: plannerStyle.border,
      text: plannerStyle.text,
      teacherText: plannerStyle.text
    };
  }
  if (scheduleViewMode !== 'class') {
    return { bg: '#e8f5e9', border: '#c8e6c9', text: '#1f2937', teacherText: '#2e7d32' };
  }
  return teacherColorFromName(booking && booking.staff_name ? booking.staff_name : '');
}

function publishBookingToBookClassForm(booking) {
  if (!booking) return;
  const plannerLike = isPlannerLikeBooking(booking);
  const sharedState = {
    sourceId: scheduleCalendarSourceId,
    updatedAt: Date.now(),
    staffId: String(booking.staff_id || ''),
    className: String(booking.class_name || ''),
    // Planner-like clicks only transfer recipe info — do not override the user's chosen date/period.
    bookingDate: plannerLike ? '' : String(booking.booking_date || ''),
    period: plannerLike ? '' : String(booking.period || ''),
    recipeId: booking.recipe_id != null ? String(booking.recipe_id) : '',
    recipeName: String(booking.recipe || ''),
    recipeSelectionInfo: String(booking.recipe_selection_info || ''),
    classSize: booking.class_size != null ? String(booking.class_size) : '',
    // Planner selections should prefill as a new booking, not edit the planner row.
    editBookingId: plannerLike ? '' : String(booking.id || '')
  };
  localStorage.setItem(bookClassSharedStateKey, JSON.stringify(sharedState));
  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.postMessage(sharedState);
  }
}

function showInfoToast(message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (window.QC && typeof window.QC.toast === 'function') {
    window.QC.toast(text, 'info');
    return;
  }
  alert(text);
}

function getStoredPlannerSyncToken() {
  return String(localStorage.getItem(plannerSyncTokenStorageKey) || '').trim();
}

function setStoredPlannerSyncToken(token) {
  const normalized = String(token || '').trim();
  if (normalized) {
    localStorage.setItem(plannerSyncTokenStorageKey, normalized);
  } else {
    localStorage.removeItem(plannerSyncTokenStorageKey);
  }
}

function promptForPlannerSyncToken() {
  const existing = getStoredPlannerSyncToken();
  const entered = window.prompt('Enter planner sync token (only needed if server token protection is enabled):', existing);
  if (entered == null) return null;
  const normalized = String(entered || '').trim();
  setStoredPlannerSyncToken(normalized);
  return normalized;
}

async function postPlannerDedupe(token) {
  const headers = { 'Content-Type': 'application/json' };
  const normalizedToken = String(token || '').trim();
  if (normalizedToken) {
    headers['x-planner-sync-token'] = normalizedToken;
  }
  const res = await fetch('/google/dedupe-planners', {
    method: 'POST',
    credentials: 'include',
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function fetchLinkedRecipesForBooking(bookingId) {
  const response = await fetch(`/api/recipe-matching/linked-recipes/${encodeURIComponent(String(bookingId))}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data && data.error ? data.error : 'Failed to load linked recipes.');
  }
  return Array.isArray(data.recipes) ? data.recipes : [];
}

// --- Recipe detail helpers for the version chooser modal ---
const _recipeDetailCache = new Map();

async function fetchRecipeDetailsForModal(recipeId) {
  const id = Number(recipeId);
  if (_recipeDetailCache.has(id)) return _recipeDetailCache.get(id);
  try {
    const r = await fetch(`/api/recipes/${encodeURIComponent(String(id))}`);
    if (!r.ok) return null;
    const data = await r.json();
    _recipeDetailCache.set(id, data);
    return data;
  } catch (_) {
    return null;
  }
}

function extractRecipeListItems(value) {
  if (Array.isArray(value)) return value.map(i => String(i || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  const liMatches = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRegex.exec(text)) !== null) {
    const cleaned = String(m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) liMatches.push(cleaned);
  }
  if (liMatches.length) return liMatches;
  return text.split(/\r?\n/).map(l => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function choosePlannerRecipeVersion(booking, linkedRecipes) {
  return new Promise((resolve) => {
    const list = Array.isArray(linkedRecipes) ? linkedRecipes : [];
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.52);display:flex;align-items:center;justify-content:center;z-index:10001;padding:1rem;box-sizing:border-box;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.28);width:min(95vw,980px);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;';

    const plannerName = escHtml(String((booking && booking.recipe) || 'Recipe'));

    const radioListHtml = list.length ? list.map((recipe, idx) => {
      const recipeId = recipe && recipe.recipe_id != null ? recipe.recipe_id : recipe.id;
      const safeId = escHtml(String(recipeId || ''));
      const safeName = escHtml(String((recipe && recipe.name) || `Recipe ${safeId}`));
      const url = String((recipe && recipe.url) || '').trim();
      return `
        <label data-recipe-id="${safeId}" style="display:flex;align-items:flex-start;gap:0.5rem;border:2px solid #e5e7eb;border-radius:8px;padding:0.6rem 0.7rem;margin:0 0 0.45rem 0;cursor:pointer;transition:border-color 0.15s;">
          <input type="radio" name="plannerRecipeChoice" value="${safeId}" ${idx === 0 ? 'checked' : ''} style="margin-top:0.22rem;flex-shrink:0;" />
          <div style="min-width:0;">
            <div style="font-weight:700;color:#1f2937;font-size:0.93rem;">${safeName}</div>
            <div style="font-size:0.76rem;color:#6b7280;">ID: ${safeId}</div>
            ${url ? `<div style="font-size:0.76rem;color:#1976d2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(url)}">${escHtml(url)}</div>` : '<div style="font-size:0.76rem;color:#9ca3af;">No source URL</div>'}
          </div>
        </label>
      `;
    }).join('') : '<div style="color:#9ca3af;font-size:0.88rem;padding:0.5rem 0;">No linked recipe versions found.</div>';

    modal.innerHTML = `
      <div style="padding:0.9rem 1.1rem 0.6rem;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
        <div style="font-size:1.05rem;font-weight:700;color:#1f2937;">Choose Recipe Version</div>
        <div style="font-size:0.85rem;color:#4b5563;margin-top:0.15rem;">Recipe: <strong>${plannerName}</strong> &mdash; select a version to see full details before choosing.</div>
      </div>
      <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
        <div id="rcv-list" style="width:270px;min-width:180px;flex-shrink:0;padding:0.7rem 0.8rem;border-right:1px solid #e5e7eb;overflow-y:auto;">
          <div style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.45rem;">Versions</div>
          ${radioListHtml}
        </div>
        <div id="rcv-detail" style="flex:1;min-width:0;padding:0.7rem 0.9rem;overflow-y:auto;background:#fafafa;">
          <div id="rcv-detail-content" style="color:#9ca3af;font-size:0.88rem;">Loading&hellip;</div>
        </div>
      </div>
      <div style="padding:0.65rem 1.1rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.5rem;flex-shrink:0;background:#fff;">
        <button type="button" id="plannerVersionCancelBtn" style="padding:0.4rem 0.8rem;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;cursor:pointer;">Cancel</button>
        <button type="button" id="plannerVersionAdjustBtn" style="padding:0.4rem 0.8rem;border:1px solid #059669;background:#ecfdf5;color:#065f46;border-radius:6px;cursor:pointer;${list.length ? '' : 'display:none;'}">Adjust Recipe</button>
        <button type="button" id="plannerVersionUseBtn" style="padding:0.4rem 0.85rem;border:none;background:#1976d2;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;${list.length ? '' : 'display:none;'}">Use This Version</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();

    function highlightSelected() {
      modal.querySelectorAll('label[data-recipe-id]').forEach(lbl => {
        const radio = lbl.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
          lbl.style.borderColor = '#1976d2';
          lbl.style.background = '#eff6ff';
        } else {
          lbl.style.borderColor = '#e5e7eb';
          lbl.style.background = '';
        }
      });
    }

    async function showDetail(recipeId) {
      const detailEl = modal.querySelector('#rcv-detail-content');
      if (!detailEl) return;
      detailEl.innerHTML = '<span style="color:#9ca3af;">Loading recipe details&hellip;</span>';
      const recipe = await fetchRecipeDetailsForModal(recipeId);
      if (!recipe) {
        detailEl.innerHTML = '<span style="color:#c62828;">Could not load details for this recipe.</span>';
        return;
      }
      const name = escHtml(String(recipe.name || ''));
      const serving = recipe.serving_size ? escHtml(String(recipe.serving_size)) : '';
      const url = String(recipe.url || '').trim();
      let domain = '';
      if (url) { try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {} }
      const ings = extractRecipeListItems(recipe.ingredients_display || recipe.ingredients || '');
      const steps = extractRecipeListItems(recipe.instructions_display || recipe.instructions_extracted || recipe.instructions || '');
      const MAX_I = 15, MAX_S = 6;
      const ingHtml = ings.length
        ? `<ol style="margin:0;padding-left:1.1rem;font-size:0.85rem;line-height:1.65;">${ings.slice(0, MAX_I).map(i => `<li>${escHtml(i)}</li>`).join('')}${ings.length > MAX_I ? `<li style="color:#9ca3af;font-style:italic;">&hellip; and ${ings.length - MAX_I} more</li>` : ''}</ol>`
        : '<div style="color:#9ca3af;font-size:0.83rem;">No ingredients listed.</div>';
      const stepHtml = steps.length
        ? `<ol style="margin:0;padding-left:1.1rem;font-size:0.85rem;line-height:1.65;">${steps.slice(0, MAX_S).map(s => `<li>${escHtml(s)}</li>`).join('')}${steps.length > MAX_S ? `<li style="color:#9ca3af;font-style:italic;">&hellip; and ${steps.length - MAX_S} more steps</li>` : ''}</ol>`
        : '<div style="color:#9ca3af;font-size:0.83rem;">No method listed.</div>';
      detailEl.innerHTML = `
        <div style="font-size:1rem;font-weight:700;color:#1f2937;margin-bottom:0.25rem;">${name}</div>
        <div style="font-size:0.8rem;color:#4b5563;margin-bottom:0.7rem;display:flex;flex-wrap:wrap;gap:0.7rem;">
          ${serving ? `<span>&#127869; Serves <strong>${serving}</strong></span>` : ''}
          ${url ? `<span>&#128279; <a href="${escHtml(url)}" target="_blank" rel="noopener" style="color:#1976d2;">${escHtml(domain || url)}</a></span>` : '<span style="color:#9ca3af;">No source URL</span>'}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.35rem;">Ingredients</div>
            ${ingHtml}
          </div>
          <div>
            <div style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.35rem;">Method</div>
            ${stepHtml}
          </div>
        </div>
      `;
    }

    // Wire up radio change events
    modal.querySelectorAll('input[name="plannerRecipeChoice"]').forEach(radio => {
      radio.addEventListener('change', () => {
        highlightSelected();
        showDetail(radio.value);
      });
    });

    // Load first item immediately
    highlightSelected();
    if (list.length) {
      const firstId = String(list[0].recipe_id != null ? list[0].recipe_id : list[0].id);
      showDetail(firstId);
    }

    const cancelBtn = modal.querySelector('#plannerVersionCancelBtn');
    const useBtn = modal.querySelector('#plannerVersionUseBtn');
    const adjustBtn = modal.querySelector('#plannerVersionAdjustBtn');

    if (cancelBtn) cancelBtn.onclick = () => { cleanup(); resolve(null); };

    if (adjustBtn) {
      adjustBtn.onclick = () => {
        const selected = modal.querySelector('input[name="plannerRecipeChoice"]:checked');
        if (!selected) { resolve(null); cleanup(); return; }
        const selectedId = String(selected.value || '').trim();
        const selectedRecipe = list.find((item) => String(item.recipe_id != null ? item.recipe_id : item.id) === selectedId) || null;
        cleanup();
        resolve({ action: 'adjust', recipe: selectedRecipe });
      };
    }

    if (useBtn) {
      useBtn.onclick = () => {
        const selected = modal.querySelector('input[name="plannerRecipeChoice"]:checked');
        if (!selected) { resolve(null); cleanup(); return; }
        const selectedId = String(selected.value || '').trim();
        const selectedRecipe = list.find((item) => String(item.recipe_id != null ? item.recipe_id : item.id) === selectedId) || null;
        cleanup();
        resolve(selectedRecipe);
      };
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) { cleanup(); resolve(null); }
    });
  });
}

// Parse a plain-text ingredients list into [{qty, unit, name}] rows
function parseIngredientLines(text) {
  if (!text) return [];
  return String(text).split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    // Match: optional qty (number or fraction), optional unit word, rest as name
    const m = trimmed.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.\-\s]+(?:\/\d+)?)\s*([a-zA-Z]+(?:\.))?\s+(.+)$/) ||
              trimmed.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.]+)\s+(.+)$/);
    if (m && m.length >= 4) return { qty: m[1].trim(), unit: m[2] ? m[2].trim() : '', name: m[3].trim() };
    if (m && m.length === 3) return { qty: m[1].trim(), unit: '', name: m[2].trim() };
    return { qty: '', unit: '', name: trimmed };
  }).filter(Boolean);
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text || '');
  return textarea.value;
}

function htmlListToIngredientText(html) {
  const value = String(html || '').trim();
  if (!value) return '';

  const liMatches = Array.from(value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
  if (liMatches.length) {
    return liMatches
      .map((m) => decodeHtmlEntities(String(m[1] || '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).trim())
      .filter(Boolean)
      .join('\n');
  }

  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function getAdjustableIngredientsText(recipe) {
  const directIngredients = String((recipe && recipe.ingredients) || '').trim();
  if (directIngredients) return directIngredients;

  const displayIngredients = htmlListToIngredientText(recipe && recipe.ingredients_display);
  if (displayIngredients) return displayIngredients;

  const extractedRaw = String((recipe && recipe.extracted_ingredients) || '').trim();
  if (!extractedRaw) return '';

  if (extractedRaw.startsWith('[') && extractedRaw.endsWith(']')) {
    try {
      const parsed = JSON.parse(extractedRaw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item.text === 'string') return item.text.trim();
            return String(item || '').trim();
          })
          .filter(Boolean)
          .join('\n');
      }
    } catch (_) {
      // fall back to plain text handling below
    }
  }

  return extractedRaw;
}

// Show the Adjust Recipe modal — lets user rename + edit ingredients before saving as new recipe
async function showAdjustRecipeModal(baseRecipeRef, plannerBooking) {
  return new Promise(async (resolve) => {
    // Fetch full recipe details from server
    const baseId = baseRecipeRef && (baseRecipeRef.recipe_id != null ? baseRecipeRef.recipe_id : baseRecipeRef.id);
    let fullRecipe = baseRecipeRef;
    try {
      const r = await fetch(`/api/recipes/${encodeURIComponent(String(baseId))}`);
      if (r.ok) fullRecipe = await r.json();
    } catch (_) { /* use what we have */ }

    // Get current user name for default recipe name
    let userName = '';
    try {
      const me = await fetch('/api/auth/me');
      if (me.ok) {
        const meData = await me.json();
        if (meData.user && meData.user.name) userName = meData.user.name.split(' ').slice(-1)[0]; // last name
      }
    } catch (_) { /* ignore */ }

    const baseName = String((fullRecipe && fullRecipe.name) || (plannerBooking && plannerBooking.recipe) || 'Recipe').trim();
    const defaultName = userName ? `${baseName} - ${userName}` : baseName;
    const ingredientLines = parseIngredientLines(getAdjustableIngredientsText(fullRecipe));
    const servingSize = (fullRecipe && fullRecipe.serving_size) || '';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.52);display:flex;align-items:center;justify-content:center;z-index:10002;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.28);padding:1.1rem 1.2rem;max-width:680px;width:min(95vw,680px);max-height:90vh;overflow:auto;';

    const ingredientRowsHtml = ingredientLines.length
      ? ingredientLines.map((ing, i) => `
        <tr data-row="${i}">
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" value="${escHtml(ing.qty)}" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td>
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" value="${escHtml(ing.unit)}" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td>
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" value="${escHtml(ing.name)}" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td>
          <td style="padding:0.2rem 0.3rem;"><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;" title="Remove">✕</button></td>
        </tr>`).join('')
      : `<tr data-row="0"><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td><td><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;" title="Remove">✕</button></td></tr>`;

    modal.innerHTML = `
      <div style="font-size:1.12rem;font-weight:700;color:#1f2937;margin-bottom:0.2rem;">Adjust Recipe</div>
      <div style="font-size:0.85rem;color:#6b7280;margin-bottom:0.8rem;">Based on: <strong>${escHtml(baseName)}</strong> (ID ${escHtml(String(baseId || ''))}). Changes are saved as your own copy.</div>
      <div style="margin-bottom:0.6rem;">
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:0.2rem;">Recipe Name</label>
        <input id="adjRecipeName" type="text" value="${escHtml(defaultName)}" style="width:100%;padding:0.38rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:0.6rem;">
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:0.2rem;">Serves (class size)</label>
        <input id="adjServingSize" type="number" value="${escHtml(String(servingSize))}" min="1" style="width:90px;padding:0.38rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;" />
      </div>
      <div style="margin-bottom:0.4rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
          <label style="font-size:0.82rem;font-weight:600;color:#374151;">Ingredients</label>
          <button type="button" id="adjAddRow" style="font-size:0.8rem;padding:0.2rem 0.55rem;border:1px solid #059669;background:#ecfdf5;color:#065f46;border-radius:5px;cursor:pointer;">+ Add Ingredient</button>
        </div>
        <div style="overflow-x:auto;">
          <table id="adjIngredientsTable" style="width:100%;border-collapse:collapse;">
            <thead><tr style="font-size:0.78rem;color:#6b7280;text-align:left;">
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Qty</th>
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Unit</th>
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Ingredient</th>
              <th></th>
            </tr></thead>
            <tbody id="adjIngredientRows">${ingredientRowsHtml}</tbody>
          </table>
        </div>
      </div>
      <div id="adjError" style="color:#dc2626;font-size:0.82rem;margin-top:0.4rem;display:none;"></div>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.9rem;border-top:1px solid #e5e7eb;padding-top:0.75rem;">
        <button type="button" id="adjCancelBtn" style="padding:0.42rem 0.82rem;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;cursor:pointer;">Cancel</button>
        <button type="button" id="adjSaveBtn" style="padding:0.42rem 0.9rem;border:none;background:#059669;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Save My Version</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => { overlay.remove(); };

    // Remove row buttons
    modal.querySelector('#adjIngredientRows').addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('adj-remove-row')) {
        const row = e.target.closest('tr');
        if (row) row.remove();
      }
    });

    // Add row button
    modal.querySelector('#adjAddRow').addEventListener('click', () => {
      const tbody = modal.querySelector('#adjIngredientRows');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td>
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td>
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td>
        <td style="padding:0.2rem 0.3rem;"><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;" title="Remove">✕</button></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector('.adj-name').focus();
    });

    modal.querySelector('#adjCancelBtn').addEventListener('click', () => { cleanup(); resolve(null); });

    modal.querySelector('#adjSaveBtn').addEventListener('click', async () => {
      const name = modal.querySelector('#adjRecipeName').value.trim();
      if (!name) {
        const err = modal.querySelector('#adjError');
        err.textContent = 'Recipe name is required.';
        err.style.display = '';
        return;
      }
      // Collect ingredient rows → plain text
      const rows = Array.from(modal.querySelectorAll('#adjIngredientRows tr'));
      const ingredientsText = rows.map((row) => {
        const qty = (row.querySelector('.adj-qty') || {}).value || '';
        const unit = (row.querySelector('.adj-unit') || {}).value || '';
        const ingName = (row.querySelector('.adj-name') || {}).value || '';
        return [qty, unit, ingName].filter(Boolean).join(' ').trim();
      }).filter(Boolean).join('\n');

      const servingSize = modal.querySelector('#adjServingSize').value;
      const saveBtn = modal.querySelector('#adjSaveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(String(baseId))}/adjust`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ingredients: ingredientsText, serving_size: servingSize || null })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to save adjusted recipe.');
        cleanup();
        resolve({ recipeId: data.recipeId, name });
      } catch (err) {
        const errEl = modal.querySelector('#adjError');
        errEl.textContent = err.message || 'Could not save recipe.';
        errEl.style.display = '';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save My Version';
      }
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
  });
}

async function handlePlannerChipClick(bookingId) {
  const normalizedId = Number(bookingId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;
  const bookings = Array.isArray(window.currentScheduleBookings) ? window.currentScheduleBookings : [];
  const plannerBooking = bookings.find((b) => Number(b.id) === normalizedId);
  if (!plannerBooking) {
    showInfoToast('Could not find that planner event in this week.');
    return;
  }

  try {
    const linkedRecipes = await fetchLinkedRecipesForBooking(normalizedId);
    if (!linkedRecipes.length) {
      showInfoToast('This planner event has no linked recipe versions yet. Link versions in Match Planner Recipes first.');
      return;
    }

    const result = await choosePlannerRecipeVersion(plannerBooking, linkedRecipes);
    if (!result) return;

    // Handle "Adjust Recipe" action
    if (result && result.action === 'adjust') {
      const adjustedRecipe = await showAdjustRecipeModal(result.recipe, plannerBooking);
      if (!adjustedRecipe) return;
      const baseId = result.recipe && (result.recipe.recipe_id != null ? result.recipe.recipe_id : result.recipe.id);
      const bookingForForm = {
        ...plannerBooking,
        recipe_id: adjustedRecipe.recipeId,
        recipe: adjustedRecipe.name,
        recipe_selection_info: `Adjusted from version ID ${baseId || '-'} (${result.recipe && result.recipe.name ? result.recipe.name : 'base recipe'})`
      };
      publishBookingToBookClassForm(bookingForForm);
      showInfoToast(`Adjusted recipe saved: ${adjustedRecipe.name}`);
      return;
    }

    const selectedRecipe = result;
    const selectedRecipeId = selectedRecipe.recipe_id != null ? selectedRecipe.recipe_id : selectedRecipe.id;
    const selectedRecipeName = String(selectedRecipe.name || plannerBooking.recipe || '').trim();
    const bookingForForm = {
      ...plannerBooking,
      recipe_id: selectedRecipeId,
      recipe: selectedRecipeName,
      recipe_selection_info: `Using linked version ID ${selectedRecipeId || '-'} (${selectedRecipeName})`
    };
    publishBookingToBookClassForm(bookingForForm);
    showInfoToast(`Selected recipe version: ${selectedRecipeName}`);
  } catch (err) {
    showInfoToast(err && err.message ? err.message : 'Unable to load linked recipes for this planner event.');
  }
}

async function handleBookedCellRecipeClick(bookingId) {
  const normalizedId = Number(bookingId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;
  const bookings = Array.isArray(window.currentScheduleBookings) ? window.currentScheduleBookings : [];
  const booking = bookings.find((b) => Number(b.id) === normalizedId);
  if (!booking) return;

  try {
    const linkedRecipes = await fetchLinkedRecipesForBooking(normalizedId);
    if (!linkedRecipes.length) {
      showInfoToast('No recipe versions linked to this booking yet. Use Match Planner Recipes to add versions.');
      return;
    }

    const result = await choosePlannerRecipeVersion(booking, linkedRecipes);
    if (!result) return;

    if (result && result.action === 'adjust') {
      const adjustedRecipe = await showAdjustRecipeModal(result.recipe, booking);
      if (!adjustedRecipe) return;
      const baseId = result.recipe && (result.recipe.recipe_id != null ? result.recipe.recipe_id : result.recipe.id);
      publishBookingToBookClassForm({
        ...booking,
        recipe_id: adjustedRecipe.recipeId,
        recipe: adjustedRecipe.name,
        recipe_selection_info: `Adjusted from version ID ${baseId || '-'} (${result.recipe && result.recipe.name ? result.recipe.name : 'base recipe'})`
      });
      showInfoToast(`Adjusted recipe: ${adjustedRecipe.name}. Click UPDATE to apply.`);
      return;
    }

    const selectedRecipeId = result.recipe_id != null ? result.recipe_id : result.id;
    const selectedRecipeName = String(result.name || booking.recipe || '').trim();
    publishBookingToBookClassForm({
      ...booking,
      recipe_id: selectedRecipeId,
      recipe: selectedRecipeName,
      recipe_selection_info: `Changed to version ID ${selectedRecipeId || '-'} (${selectedRecipeName})`
    });
    showInfoToast(`Recipe changed to: ${selectedRecipeName}. Click UPDATE to save.`);
  } catch (err) {
    showInfoToast(err && err.message ? err.message : 'Unable to load recipe versions for this booking.');
  }
}

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizePlannerStream(booking) {
  const explicit = String(booking && booking.planner_stream ? booking.planner_stream : '').trim().toLowerCase();
  if (explicit === 'junior') return 'Junior';
  if (explicit === 'senior') return 'Senior';
  if (explicit === 'middle') return 'Middle';

  const className = String(booking && booking.class_name ? booking.class_name : '').toLowerCase();
  if (/(^|\b)jfood(\b|$)|vefood|mmfood|sdfood|pifood|srfood|jtrfood|mtrfood|junior/.test(className)) return 'Junior';
  if (/(^|\b)hosp(\b|$)|senior|hp100/.test(className)) return 'Senior';
  return 'Middle';
}

// --- Planner mismatch helpers ---

function normalizeRecipeForCompare(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferPlannerClassCodeFromToken(classToken) {
  const canonical = String(classToken || '')
    .trim()
    .toUpperCase()
    .replace(/HSOP/g, 'HOSP')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!canonical) return '';

  const hospMatch = canonical.match(/(?:^|[-_])((?:\d{2,3})HOSP)(?:[-_]|$)/);
  if (hospMatch && hospMatch[1]) return hospMatch[1];
  if (canonical.includes('HOSPCOOK')) return 'HOSPCOOK';
  if (canonical.includes('HOSP')) return 'HOSP';
  if (canonical.includes('MFOOD')) return 'MFOOD';
  return '';
}

function buildSeniorNoRecipePlannerPlaceholders(dayIso, dayBookings, plannerEntries) {
  const requiredCodes = new Set(['13HOSP', 'HOSPCOOK']);
  const plannerCodes = new Set(
    (plannerEntries || [])
      .map((entry) => inferPlannerClassCodeFromToken(entry && entry.class_name ? entry.class_name : ''))
      .filter(Boolean)
  );

  const bookedSeniorCodes = new Set();
  for (const booking of (dayBookings || [])) {
    if (isPlannerLikeBooking(booking)) continue;
    const code = inferPlannerClassCodeFromToken(booking && booking.class_name ? booking.class_name : '');
    if (requiredCodes.has(code)) bookedSeniorCodes.add(code);
  }

  const placeholders = [];
  for (const code of bookedSeniorCodes) {
    if (plannerCodes.has(code)) continue;
    placeholders.push({
      id: `placeholder-${dayIso}-${code}`,
      class_name: code,
      recipe: 'No recipe allocated',
      planner_stream: 'Senior',
      isPlaceholder: true
    });
  }
  return placeholders;
}

function shouldOverrideBookingToNoRecipe(booking, dayIso, bookings) {
  if (!booking || isPlannerLikeBooking(booking)) return false;
  const classCode = inferPlannerClassCodeFromToken(booking.class_name || '');
  const requiredCodes = new Set(['13HOSP', 'HOSPCOOK']);
  if (!requiredCodes.has(classCode)) return false;

  const plannerEntriesForDay = (Array.isArray(bookings) ? bookings : []).filter((b) =>
    isPlannerLikeBooking(b) &&
    snapToNearestMonday(b.booking_date) === dayIso &&
    String(b.recipe || '').trim()
  );
  const plannerCodes = new Set(
    plannerEntriesForDay
      .map((entry) => inferPlannerClassCodeFromToken(entry && entry.class_name ? entry.class_name : ''))
      .filter(Boolean)
  );
  return !plannerCodes.has(classCode);
}

// Build a map of { "weekMonday|stream" => { recipes: string[], normalized: Set<string> } }
// from all planner entries in the bookings list.
function buildPlannerMap(bookings) {
  const map = new Map();
  for (const b of bookings) {
    if (String(b.period || '').trim().toLowerCase() !== 'planner') continue;
    const recipe = String(b.recipe || '').trim();
    if (!recipe) continue;
    const stream = normalizePlannerStream(b);
    const date = String(b.booking_date || '').slice(0, 10);
    const d = parseLocalIsoDate(date);
    if (!d) continue;
    const monday = toLocalIsoDate(getStartOfWeek(d));
    const key = `${monday}|${stream}`;

    if (!map.has(key)) {
      map.set(key, { recipes: [], normalized: new Set() });
    }

    const entry = map.get(key);
    const normalizedRecipe = normalizeRecipeForCompare(recipe);
    if (!normalizedRecipe) continue;
    if (!entry.normalized.has(normalizedRecipe)) {
      entry.normalized.add(normalizedRecipe);
      entry.recipes.push(recipe);
    }
  }
  return map;
}

// Return the planner recipe entry for a class booking, or null if none.
function getPlannerRecipeForBooking(booking, plannerMap) {
  const date = String(booking && booking.booking_date ? booking.booking_date : '').slice(0, 10);
  if (!date) return null;
  const d = parseLocalIsoDate(date);
  if (!d) return null;
  const monday = toLocalIsoDate(getStartOfWeek(d));
  const stream = normalizePlannerStream(booking);
  return plannerMap.get(`${monday}|${stream}`) || null;
}

// Return true if a class booking has a recipe that differs from the planner recipe.
function hasPlannerMismatch(booking, plannerMap) {
  if (isPlannerLikeBooking(booking)) return false;
  const bookingRecipe = String(booking && booking.recipe ? booking.recipe : '').trim();
  if (!bookingRecipe) return false;
  if (bookingRecipe.toLowerCase() === 'theory') return false;

  const plannerEntry = getPlannerRecipeForBooking(booking, plannerMap);
  if (!plannerEntry) return false;

  const bookingNorm = normalizeRecipeForCompare(bookingRecipe);
  if (!bookingNorm) return false;
  if (plannerEntry.normalized && plannerEntry.normalized.has(bookingNorm)) return false;
  return true;
}

function plannerChipStyle(stream) {
  if (stream === 'Junior') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (stream === 'Senior') return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' };
}

function isTheoryBooking(booking) {
  const recipe = String(booking && booking.recipe ? booking.recipe : '').trim().toLowerCase();
  return recipe === 'theory';
}

function theoryBookingStyle() {
  return {
    bg: '#f3e8ff',
    border: '#d8b4fe',
    text: '#6b21a8',
    teacherText: '#7c3aed'
  };
}

function isPlannerLikeBooking(booking) {
  const period = String(booking && booking.period ? booking.period : '').trim().toLowerCase();
  if (period === 'planner') return true;

  const hasTeacher = Boolean(String(booking && booking.staff_id ? booking.staff_id : '').trim() ||
    String(booking && booking.staff_name ? booking.staff_name : '').trim());
  if (hasTeacher) return false;

  const className = String(booking && booking.class_name ? booking.class_name : '').trim().toUpperCase();
  return className === 'MFOOD' || className === 'HOSP' ||
    ['JFOOD', 'VEFOOD', 'MMFOOD', 'SDFOOD', 'PIFOOD', 'SRFOOD', 'JTRFOOD', 'MTRFOOD'].includes(className);
}

  // Snap a Saturday (+2) or Sunday (+1) date string to the following Monday
  function snapToNearestMonday(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() + 1);
    else if (dow === 6) d.setDate(d.getDate() + 2);
    return toLocalIsoDate(d);
  }

function parseLocalIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getRegionalWeekStartDay() {
  try {
    const locale = new Intl.Locale(userLocale || 'en');
    const firstDay = locale.weekInfo && locale.weekInfo.firstDay;
    if (typeof firstDay === 'number') {
      return firstDay % 7;
    }
  } catch {
    // Ignore and fall back below.
  }
  return 1; // Monday fallback for older browsers.
}

function getStartOfWeek(referenceDate) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const firstDay = getRegionalWeekStartDay();
  const diff = (date.getDay() - firstDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

// Days and periods for the calendar grid
const periods = [1, 2, 3, 4, 5];
let showWeekends = false;

function getVisibleDayIndices(weekDates, includeWeekends = showWeekends) {
  const indices = [];
  for (let i = 0; i < weekDates.length; ++i) {
    if (includeWeekends || !weekDates[i].isWeekend) {
      indices.push(i);
    }
  }
  return indices;
}

function ensureWeekendToggleButton() {
  let toggleBtn = document.getElementById('toggleWeekendBtn');
  if (!toggleBtn) {
    const anchorBtn = document.getElementById('printScheduleBtn') || document.getElementById('nextWeekBtn');
    const parent = anchorBtn && anchorBtn.parentElement;
    if (!parent) return null;

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleWeekendBtn';
    toggleBtn.style.margin = '0 0.3em';
    toggleBtn.style.background = '#455a64';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '5px';
    toggleBtn.style.padding = '0.45rem 1rem';
    toggleBtn.onclick = () => {
      showWeekends = !showWeekends;
      renderScheduleCalendar();
    };

    if (anchorBtn && anchorBtn.nextSibling) {
      parent.insertBefore(toggleBtn, anchorBtn.nextSibling);
    } else {
      parent.appendChild(toggleBtn);
    }
  }

  toggleBtn.textContent = showWeekends ? 'Hide Weekend' : 'Show Weekend';
  return toggleBtn;
}

function getWeekDatesFromMonday(monday) {
  const weekDates = [];
  for (let i = 0; i < WEEK_DAYS_COUNT; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push({
      display: formatDateShort(d),
      iso: getISODate(d),
      weekday: weekdayFormatter.format(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    });
  }
  return weekDates;
}

function mondayToWeekInputValue(monday) {
  const refMonday = new Date(monday);
  refMonday.setHours(0, 0, 0, 0);
  const thursday = new Date(refMonday);
  thursday.setDate(refMonday.getDate() + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const diffDays = Math.round((refMonday - week1Monday) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

function weekInputValueToMonday(weekValue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue || '');
  if (!match) return null;
  const year = Number(match[1]);
  const weekNo = Number(match[2]);
  if (weekNo < 1 || weekNo > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + ((weekNo - 1) * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function askWeekToPrint(defaultMonday) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:1rem 1.1rem;min-width:320px;max-width:90vw;';
    const defaultWeek = mondayToWeekInputValue(defaultMonday);
    box.innerHTML = `
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.65rem;">Print ${bookingPageLabel} Schedule</div>
      <label for="weekToPrintInput" style="display:block;margin-bottom:0.35rem;">Which week do you want to print?</label>
      <input id="weekToPrintInput" type="week" value="${defaultWeek}" style="width:100%;padding:0.4rem;margin-bottom:0.8rem;" />
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <button id="weekPrintCancelBtn" style="padding:0.42rem 0.8rem;border:1px solid #bbb;background:#f2f2f2;border-radius:5px;">Cancel</button>
        <button id="weekPrintConfirmBtn" style="padding:0.42rem 0.8rem;border:0;background:#1976d2;color:#fff;border-radius:5px;">Print</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
    };

    box.querySelector('#weekPrintCancelBtn').onclick = () => {
      cleanup();
      resolve(null);
    };

    box.querySelector('#weekPrintConfirmBtn').onclick = () => {
      const weekValue = box.querySelector('#weekToPrintInput').value;
      const monday = weekInputValueToMonday(weekValue);
      cleanup();
      resolve(monday);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

function buildPrintGrid(bookings, weekDates) {
  const grid = Array.from({ length: periods.length }, () => Array(weekDates.length).fill(null).map(() => []));
  bookings.forEach(b => {
    if (isPlannerLikeBooking(b)) {
      return;
    }
    const dayIdx = weekDates.findIndex(wd => wd.iso === b.booking_date);
    const periodIdx = periods.indexOf(Number(b.period));
    if (dayIdx !== -1 && periodIdx !== -1) {
      grid[periodIdx][dayIdx].push(b);
    }
  });
  return grid;
}

function getPrintBookingTitle(cell, displayMode) {
  if (displayMode === 'recipe') {
    const recipe = String(cell.recipe || '').trim();
    return recipe ? `Recipe: ${recipe}` : `Class: ${cell.class_name || ''}`;
  }
  return `Class: ${cell.class_name || ''}`;
}

async function printScheduleForWeek(printMonday, includeWeekends = showWeekends, displayMode = 'class') {
  if (!printMonday) return;

  const weekDates = getWeekDatesFromMonday(printMonday);
  const bookings = await fetchBookingsForWeek(printMonday);
  const grid = buildPrintGrid(bookings, weekDates);
  const visibleDayIndices = getVisibleDayIndices(weekDates, includeWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);
  const weekStart = new Date(printMonday);
  const weekEnd = new Date(printMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  const printDate = new Date().toLocaleDateString();
  const logoUrl = new URL('images/whs logo circular reo .png', window.location.href).href;

  let tableHtml = '<table class="print-calendar-table"><thead>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th>${d.weekday}</th>`).join('');
  tableHtml += '</tr>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th class="date-head">${buildCalendarDateHeaderHtml(d)}</th>`).join('');
  tableHtml += '</tr></thead><tbody>';

  for (let p = 0; p < periods.length; ++p) {
    tableHtml += `<tr><td class="period-col">P${periods[p]}</td>`;
    for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const cell = grid[p][dayIdx];
      if (cell && cell.length > 0) {
        tableHtml += `<td>`;
        cell.forEach((booking) => {
          tableHtml += `<div class="booking-box"><div class="booking-title">${getPrintBookingTitle(booking, displayMode)}</div><div class="booking-teacher">Teacher: ${booking.staff_name || ''}</div></div>`;
        });
        tableHtml += `</td>`;
      } else {
        tableHtml += '<td></td>';
      }
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table>';

  const win = window.open('', '', 'width=1300,height=850');
  if (!win) {
    alert('Please allow pop-ups to print the schedule.');
    return;
  }

  win.document.write(`
    <html lang="${userLocale}">
      <head>
        <title>${bookingPageLabel} ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, sans-serif; color: #1d1d1d; margin: 0; }
          .print-page { width: 100%; }
          .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1976d2; padding-bottom: 8px; margin-bottom: 10px; }
          .print-brand { display: flex; align-items: center; gap: 10px; }
          .print-brand img { width: 56px; height: 56px; object-fit: contain; }
          .print-title { font-size: 22px; font-weight: 700; color: #1976d2; margin: 0; }
          .print-subtitle { margin: 2px 0 0 0; font-size: 13px; }
          .print-meta { font-size: 12px; text-align: right; }
          .print-calendar-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .print-calendar-table th, .print-calendar-table td { border: 1px solid #8f8f8f; padding: 4px; text-align: center; vertical-align: top; font-size: 11px; height: 64px; }
          .print-calendar-table th { background: #1976d2; color: #fff; font-weight: 700; }
          .print-calendar-table th.date-head { background: #eaf1ff; color: #222; font-weight: 600; }
          .period-col { width: 46px; background: #f1f1f1 !important; color: #222 !important; font-weight: 700; }
          .booking-box { background: #e8f5e9; border-radius: 6px; padding: 4px; min-height: 52px; }
          .booking-box:not(:last-child) { margin-bottom: 3px; }
          .booking-title { font-weight: 700; margin-bottom: 2px; }
          .booking-teacher { color: #2e7d32; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="print-page">
          <div class="print-header">
            <div class="print-brand">
              <img src="${logoUrl}" alt="School Logo" />
              <div>
                <h1 class="print-title">${bookingPageLabel}</h1>
                <p class="print-subtitle">Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</p>
              </div>
            </div>
            <div class="print-meta">
              <div><strong>Printed:</strong> ${printDate}</div>
              <div><strong>Total Bookings:</strong> ${bookings.length}</div>
            </div>
          </div>
          ${tableHtml}
        </div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 300);
}

// Helper to get ISO date string (yyyy-mm-dd) for a given date
function getISODate(date) {
  return toLocalIsoDate(date);
}

function readCurrentSharedStaffId() {
  try {
    const raw = localStorage.getItem(bookClassSharedStateKey);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed && parsed.staffId || '').trim();
  } catch {
    return '';
  }
}

// Fetch bookings for the current week
async function fetchBookingsForWeek(monday) {
  // Align filtering to the user's regional week start.
  const weekStartDate = getStartOfWeek(monday);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + WEEK_DAYS_COUNT - 1);
  const start = toLocalIsoDate(weekStartDate);
  const end = toLocalIsoDate(weekEndDate);
  const params = new URLSearchParams({ start, end });

  const plannerStream = String(scheduleCalendarFilters.plannerStream || '').trim();
  if (plannerStream) {
    params.set('planner_stream', plannerStream);
  }

  if (scheduleCalendarFilters.selectedStaffOnly === true) {
    const selectedStaffId = readCurrentSharedStaffId();
    if (!selectedStaffId) {
      return [];
    }
    params.set('staff_id', selectedStaffId);
  }

  try {
    params.set('fields', 'calendar');
    const res = await fetch(`/api/bookings/all?${params.toString()}`);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.bookings) ? data.bookings : [];
  } catch (err) {
    return [];
  }
}

function buildMissingRecipeRowsForWeek(bookings) {
  const rows = (Array.isArray(bookings) ? bookings : []).filter((booking) => {
    if (isPlannerLikeBooking(booking)) return false;
    const recipe = String((booking && booking.linked_recipe_name) || (booking && booking.recipe) || '').trim();
    return !recipe;
  });

  rows.sort((a, b) => {
    const dateCompare = String(a.booking_date || '').localeCompare(String(b.booking_date || ''));
    if (dateCompare !== 0) return dateCompare;
    const periodCompare = Number(a.period || 0) - Number(b.period || 0);
    if (periodCompare !== 0) return periodCompare;
    return String(a.class_name || '').localeCompare(String(b.class_name || ''));
  });

  return rows.map((booking) => {
    const rawDate = String(booking.booking_date || '').slice(0, 10);
    let dayLabel = rawDate;
    try {
      const parsed = new Date(rawDate + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) {
        dayLabel = parsed.toLocaleDateString(userLocale || undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
      }
    } catch {
      // Keep fallback label.
    }

    return {
      id: Number(booking.id || 0),
      bookingDate: rawDate,
      period: String(booking.period || ''),
      className: String(booking.class_name || '').trim(),
      teacherName: String(booking.staff_name || '').trim(),
      dayLabel
    };
  });
}

function publishBrowsePracticalsWeekContext(monday, bookings) {
  if (bookingPageLabel !== 'Browse Practicals') return;

  const weekStart = getStartOfWeek(monday);
  const detail = {
    weekMondayIso: toLocalIsoDate(weekStart),
    missingRecipes: buildMissingRecipeRowsForWeek(bookings)
  };

  window.dispatchEvent(new CustomEvent('browse-practicals-week-context', { detail }));
}

function formatDateShort(date) {
  return shortDateFormatter.format(date);
}

function formatDateLong(date) {
  return longDateFormatter.format(date);
}

function formatCalendarWeekHeading(weekStart, weekEnd) {
  const startLabel = formatDateLong(weekStart);
  const endLabel = formatDateLong(weekEnd);
  const isoStart = toLocalIsoDate(weekStart);
  const info = getNzSchoolDateInfo(isoStart);
  if (!info || !info.termName || !window.NZSchoolCalendar || !Array.isArray(window.NZSchoolCalendar.terms)) {
    return `Week of ${startLabel} to ${endLabel}`;
  }

  const matchingTerm = window.NZSchoolCalendar.terms.find((term) => String(term.name || '') === String(info.termName || ''));
  if (!matchingTerm || !matchingTerm.start) {
    return `Week of ${startLabel} to ${endLabel}`;
  }

  const termStart = new Date(`${matchingTerm.start}T00:00:00`);
  const mondayStart = getStartOfWeek(new Date(weekStart));
  const diffDays = Math.floor((mondayStart.getTime() - termStart.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
  return `Week ${weekNumber}: ${startLabel} to ${endLabel}`;
}

function canViewRecentPlannerSidebar(roleName) {
  const normalized = String(roleName || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'lead_teacher';
}

function formatPlannerUploadDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(userLocale || undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ensureRecentPlannerSidebarStyles() {
  if (document.getElementById('recentPlannerSidebarStyles')) return;
  const style = document.createElement('style');
  style.id = 'recentPlannerSidebarStyles';
  style.textContent = `
    .planner-quick-open-btn {
      border: 1px solid #1d4ed8;
      background: #eff6ff;
      color: #1e3a8a;
      border-radius: 8px;
      padding: 0.42rem 0.72rem;
      font-weight: 700;
      cursor: pointer;
      font-size: 0.88rem;
    }
    .planner-quick-open-btn:hover { background: #dbeafe; }
    .planner-recent-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.35);
      z-index: 10050;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .planner-recent-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }
    .planner-recent-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: min(92vw, 390px);
      height: 100vh;
      background: #fff;
      box-shadow: -10px 0 28px rgba(15, 23, 42, 0.2);
      z-index: 10051;
      transform: translateX(102%);
      transition: transform 0.2s ease;
      display: flex;
      flex-direction: column;
    }
    .planner-recent-sidebar.open {
      transform: translateX(0);
    }
    .planner-recent-header {
      padding: 0.85rem 0.95rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
    }
    .planner-recent-title {
      font-size: 1rem;
      font-weight: 800;
      color: #1e3a8a;
    }
    .planner-recent-close {
      border: 1px solid #d1d5db;
      background: #f8fafc;
      color: #374151;
      border-radius: 6px;
      cursor: pointer;
      padding: 0.22rem 0.45rem;
      font-size: 0.85rem;
    }
    .planner-recent-body {
      padding: 0.85rem 0.95rem 1rem;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .planner-recent-section {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 0.7rem;
      background: #fff;
    }
    .planner-recent-section h3 {
      margin: 0 0 0.45rem;
      font-size: 0.86rem;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .planner-recent-item {
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      padding: 0.5rem 0.55rem;
      margin-bottom: 0.45rem;
      background: #f8fafc;
    }
    .planner-recent-item:last-child { margin-bottom: 0; }
    .planner-recent-file {
      font-size: 0.84rem;
      font-weight: 700;
      color: #111827;
      word-break: break-word;
      margin-bottom: 0.18rem;
    }
    .planner-recent-meta {
      font-size: 0.76rem;
      color: #6b7280;
      margin-bottom: 0.35rem;
    }
    .planner-recent-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .planner-recent-open {
      border: 1px solid #1d4ed8;
      background: #1d4ed8;
      color: #fff;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.17rem 0.62rem;
      cursor: pointer;
    }
    .planner-recent-clear {
      border: 1px solid #9ca3af;
      background: #fff;
      color: #374151;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.17rem 0.62rem;
      cursor: pointer;
    }
    .planner-recent-status {
      font-size: 0.8rem;
      color: #64748b;
    }
  `;
  document.head.appendChild(style);
}

function normalizeUploadStream(value) {
  const v = String(value || '').trim();
  if (!v) return 'Middle';
  if (/^junior$/i.test(v)) return 'Junior';
  if (/^senior$/i.test(v)) return 'Senior';
  if (/^middle$/i.test(v)) return 'Middle';
  return v;
}

function setPlannerStreamFilter(stream) {
  const normalized = normalizeUploadStream(stream);
  if (!normalized || /^all$/i.test(normalized)) {
    delete scheduleCalendarFilters.plannerStream;
    showInfoToast('Showing all planner streams.');
  } else {
    scheduleCalendarFilters.plannerStream = normalized;
    showInfoToast(`Showing ${normalized} planner stream.`);
  }
  renderScheduleCalendar();
}

async function initRecentPlannerSidebar() {
  if (bookingPageLabel !== 'Browse Practicals') return;

  let authData = null;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    authData = await res.json().catch(() => null);
    if (!res.ok || !authData || !authData.authenticated || !authData.user) return;
  } catch (_) {
    return;
  }

  if (!canViewRecentPlannerSidebar(authData.user.role)) return;

  ensureRecentPlannerSidebarStyles();
  const toolbar = document.querySelector('.browse-practicals-toolbar');
  if (!toolbar) return;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'planner-quick-open-btn';
  openBtn.textContent = '\u2630 Recent Planners';
  toolbar.appendChild(openBtn);

  const backdrop = document.createElement('div');
  backdrop.className = 'planner-recent-backdrop';
  const sidebar = document.createElement('aside');
  sidebar.className = 'planner-recent-sidebar';
  sidebar.innerHTML = `
    <div class="planner-recent-header">
      <div class="planner-recent-title">Recent Planner Uploads</div>
      <button type="button" class="planner-recent-close" id="plannerRecentCloseBtn">Close</button>
    </div>
    <div class="planner-recent-body" id="plannerRecentBody">
      <div class="planner-recent-status">Loading recent planner uploads...</div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(sidebar);

  const closeBtn = sidebar.querySelector('#plannerRecentCloseBtn');
  const body = sidebar.querySelector('#plannerRecentBody');

  function openSidebar() {
    backdrop.classList.add('open');
    sidebar.classList.add('open');
  }

  function closeSidebar() {
    backdrop.classList.remove('open');
    sidebar.classList.remove('open');
  }

  async function loadRecentUploads() {
    body.innerHTML = '<div class="planner-recent-status">Loading recent planner uploads...</div>';
    try {
      const res = await fetch('/api/bookings/planner-upload-history?limit=120', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || !Array.isArray(data.uploads)) {
        body.innerHTML = '<div class="planner-recent-status">Could not load planner uploads.</div>';
        return;
      }

      const uploads = data.uploads;
      if (!uploads.length) {
        body.innerHTML = '<div class="planner-recent-status">No planner uploads found yet.</div>';
        return;
      }

      const latestByStream = new Map();
      uploads.forEach((item) => {
        const stream = normalizeUploadStream(item && item.planner_stream);
        if (!latestByStream.has(stream)) latestByStream.set(stream, item);
      });

      const quickItems = [...latestByStream.entries()].map(([stream, item]) => {
        const fileName = escHtml(String(item && item.file_name ? item.file_name : 'Uploaded planner'));
        const uploadedAt = escHtml(formatPlannerUploadDate(item && item.uploaded_at));
        return `
          <div class="planner-recent-item">
            <div class="planner-recent-file">${stream}: ${fileName}</div>
            <div class="planner-recent-meta">Latest upload: ${uploadedAt}</div>
            <div class="planner-recent-actions">
              <button type="button" class="planner-recent-open" data-stream="${escHtml(stream)}">Open ${stream}</button>
            </div>
          </div>
        `;
      }).join('');

      const recentItems = uploads.slice(0, 14).map((item) => {
        const stream = normalizeUploadStream(item && item.planner_stream);
        const fileName = escHtml(String(item && item.file_name ? item.file_name : 'Uploaded planner'));
        const uploadedAt = escHtml(formatPlannerUploadDate(item && item.uploaded_at));
        const savedRows = Number(item && item.bookings_saved || 0);
        return `
          <div class="planner-recent-item">
            <div class="planner-recent-file">${fileName}</div>
            <div class="planner-recent-meta">${stream} • ${uploadedAt} • ${savedRows} row${savedRows === 1 ? '' : 's'}</div>
            <div class="planner-recent-actions">
              <button type="button" class="planner-recent-open" data-stream="${escHtml(stream)}">Open ${stream}</button>
            </div>
          </div>
        `;
      }).join('');

      body.innerHTML = `
        <section class="planner-recent-section">
          <h3>Quick Open By Stream</h3>
          ${quickItems}
          <div class="planner-recent-actions" style="margin-top:0.45rem;">
            <button type="button" class="planner-recent-clear" data-stream="All">Show All Streams</button>
            <a href="recipe_calendar_upload.html" class="planner-recent-clear" style="text-decoration:none;display:inline-flex;align-items:center;">Open Upload Planners</a>
          </div>
        </section>
        <section class="planner-recent-section">
          <h3>Most Recent Uploads</h3>
          ${recentItems}
        </section>
      `;

      body.querySelectorAll('[data-stream]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const stream = btn.getAttribute('data-stream') || '';
          setPlannerStreamFilter(stream);
          closeSidebar();
        });
      });
    } catch (_) {
      body.innerHTML = '<div class="planner-recent-status">Could not load planner uploads.</div>';
    }
  }

  openBtn.addEventListener('click', () => {
    openSidebar();
    loadRecentUploads();
  });
  closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);
}

// Track the current week start (Monday)
let currentMonday = (() => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(schedulePresetWeekStart)) {
    const preset = parseLocalIsoDate(schedulePresetWeekStart);
    if (preset && !Number.isNaN(preset.getTime())) {
      return getStartOfWeek(preset);
    }
  }
  return getStartOfWeek(new Date());
})();


async function renderScheduleCalendar() {
  const table = document.getElementById('scheduleCalendarTable');
  const weekDates = getWeekDatesFromMonday(currentMonday);
  const visibleDayIndices = getVisibleDayIndices(weekDates, showWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);

  // Fetch bookings for this week
  const bookings = await fetchBookingsForWeek(currentMonday);
  window.currentScheduleBookings = bookings;
  buildTeacherColourMap(bookings);
  publishBrowsePracticalsWeekContext(currentMonday, bookings);
  const plannerMap = buildPlannerMap(bookings);

  const grid = buildPrintGrid(bookings, weekDates);

  // Header rows
    let html = `<thead><tr style='background:#1976d2;color:#fff;'>
      <th style='width:48px;background:#1976d2;'></th>` + visibleWeekDates.map((d) => `<th style='padding:0.35rem 0.1rem;font-size:0.98em;background:#1976d2;color:#fff;'>${d.weekday}</th>`).join('') + '</tr>';
    html += `<tr style='background:#e3eafc;color:#222;'>
      <th style='width:48px;'></th>` + visibleWeekDates.map(date => `<th style='padding:0.15rem 0.1rem;font-size:0.92em;'>${buildCalendarDateHeaderHtml(date)}</th>`).join('') + '</tr></thead>';

  // Planner row — year planner entries, each shown individually with a delete button
  html += `<tr><td style='background:#e8eaf6;font-weight:bold;text-align:center;font-size:0.85em;color:#283593;padding:0.3rem 0.1rem;'>Planner</td>`;
  for (let d = 0; d < visibleDayIndices.length; ++d) {
    const dayIdx = visibleDayIndices[d];
    const dayIso = weekDates[dayIdx].iso;
    const plannerEntries = bookings.filter(b =>
      isPlannerLikeBooking(b) &&
        snapToNearestMonday(b.booking_date) === dayIso &&
        String(b.recipe || '').trim()
    );
    const dayBookings = bookings.filter((b) => String(b.booking_date || '').slice(0, 10) === dayIso);
    const plannerDisplayEntries = plannerEntries.concat(buildSeniorNoRecipePlannerPlaceholders(dayIso, dayBookings, plannerEntries));
    if (plannerDisplayEntries.length) {
      html += `<td style='vertical-align:top;text-align:center;padding:0.2rem 0.1rem;'>` +
        plannerDisplayEntries.map(entry => {
          const style = plannerChipStyle(normalizePlannerStream(entry));
          const classCode = String(entry.class_name || '').trim().toUpperCase();
          const label = `${classCode ? `${classCode}: ` : ''}${String(entry.recipe || '').trim()}`;
          const safeRecipe = escHtml(label);
          if (entry.isPlaceholder) {
            return `<div class='planner-chip' style='background:${style.bg};border:1px dashed ${style.border};border-radius:5px;padding:0.12rem 0.2rem;font-size:0.82em;color:${style.text};font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;'>${safeRecipe}</div>`;
          }
          return `<div class='planner-chip' data-booking-id='${entry.id}' title='Click to choose a linked recipe version' style='background:${style.bg};border:1px solid ${style.border};border-radius:5px;padding:0.12rem 0.2rem;font-size:0.82em;color:${style.text};font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:3px;justify-content:space-between;cursor:pointer;'><span style='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:normal;'>${safeRecipe}</span><div style='display:flex;align-items:center;gap:2px;flex-shrink:0;'><button class='planner-action-btn' onclick='event.stopPropagation();handlePlannerChipClick(${Number(entry.id)})' style='padding:0.08rem 0.34rem;border-radius:999px;border:1px solid #065f46;background:#ecfdf5;color:#065f46;font-size:0.72rem;cursor:pointer;font-weight:700;'>Recipes</button><button class='planner-action-btn' onclick='event.stopPropagation();printBookingInfoSheet(${Number(entry.id)})' title='Print planner recipe sheet' style='padding:0.08rem 0.34rem;border-radius:999px;border:1px solid #7c3aed;background:#f5f3ff;color:#5b21b6;font-size:0.72rem;cursor:pointer;font-weight:700;'>&#128438; Print</button><button class='planner-delete-btn' data-booking-id='${entry.id}' data-recipe='${safeRecipe}' title='Delete this entry' style='background:none;border:none;cursor:pointer;color:${style.text};font-size:1em;opacity:0.7;padding:0 2px;line-height:1;flex-shrink:0;' aria-label='Delete ${safeRecipe}'>&#x2715;</button></div></div>`;
        }).join('') +
        `</td>`;
    } else {
      html += '<td></td>';
    }
  }
  html += '</tr>';

  // Periods and cells (make bookings clickable)
  for (let p = 0; p < periods.length; ++p) {
    html += `<tr><td style='background:#f5f5f5;font-weight:bold;text-align:center;'>P${periods[p]}</td>`;
      for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const dayIso = weekDates[dayIdx].iso;
      const cell = grid[p][dayIdx];
        if (cell && cell.length > 0) {
          html += `<td style='vertical-align:top;text-align:center;padding:0.25rem 0.1rem;'>`;
          cell.forEach((booking, idx) => {
            const cellStyle = getCalendarCellBaseStyle(booking);
            const bookingId = `booking-${booking.id}`;
            const noRecipeOverride = shouldOverrideBookingToNoRecipe(booking, dayIso, bookings);
            const primaryText = (scheduleViewMode === 'recipe' && noRecipeOverride)
              ? 'Recipe: No recipe'
              : getCellPrimaryText(booking);
            const cellLabel = `${escHtml(primaryText)}, Teacher: ${escHtml(booking.staff_name)}`;
            const slotHref = `teacher_booking_slots.html?booking_id=${encodeURIComponent(String(booking.id || ''))}&source=${encodeURIComponent(window.location.pathname.split('/').pop() || 'add_booking.html')}`;
            const mismatch = noRecipeOverride ? false : hasPlannerMismatch(booking, plannerMap);
            const mismatchEntry = mismatch ? getPlannerRecipeForBooking(booking, plannerMap) : null;
            const plannerMismatchTitle = mismatch && mismatchEntry && Array.isArray(mismatchEntry.recipes) && mismatchEntry.recipes.length
              ? `Planner recipe(s): ${mismatchEntry.recipes.join(' | ')}`
              : 'Planner recipe differs';
            html += `<div class="calendar-booking-cell" id="${bookingId}" data-booking-id="${booking.id}" tabindex="0" role="button" aria-label="${cellLabel}" style='background:${cellStyle.bg};border:1px solid ${cellStyle.border};border-radius:7px;padding:0.34rem 0.22rem;box-shadow:0 1px 2px #0001;cursor:pointer;transition:box-shadow 0.2s;${idx > 0 ? 'margin-top:0.24rem;' : ''}'>
              <div style='font-weight:bold;font-size:0.98em;color:${cellStyle.text};line-height:1.2;'>${escHtml(primaryText)}</div>
              <div style='font-weight:bold;color:${cellStyle.teacherText};font-size:0.95em;line-height:1.2;'>Teacher: ${escHtml(booking.staff_name)}</div>
              ${noRecipeOverride && scheduleViewMode === 'recipe' ? `<div style='display:inline-flex;align-items:center;gap:0.2rem;background:#fff7ed;border:1px dashed #fdba74;border-radius:4px;padding:0.08rem 0.3rem;font-size:0.68rem;color:#c2410c;margin-top:0.18rem;'>&#9432; Planner has no recipe allocated</div>` : ''}
              ${mismatch && mismatchEntry ? `<div title="${escHtml(plannerMismatchTitle)}" style='display:inline-flex;align-items:center;gap:0.2rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:0.08rem 0.3rem;font-size:0.68rem;color:#c2410c;margin-top:0.18rem;cursor:help;'>&#9888; Planner mismatch</div>` : ''}
              ${scheduleViewMode === 'class' && booking.class_size != null && booking.class_size !== '' ? `<div style='font-size:0.86em;color:${cellStyle.text};line-height:1.2;'>Class Size: ${escHtml(String(booking.class_size))}</div>` : ''}
              ${scheduleViewMode === 'recipe' && booking.groups != null && booking.groups !== '' ? `<div style='font-size:0.86em;color:${cellStyle.text};line-height:1.2;'>Groups: ${escHtml(String(booking.groups))}</div>` : ''}
              <div style='margin-top:0.2rem;display:flex;gap:0.18rem;justify-content:center;flex-wrap:wrap;'>${window.bookingPageLabel === 'Add Food Truck Booking' ? `<a href='${slotHref}' onclick='event.stopPropagation();' style='display:inline-block;padding:0.08rem 0.34rem;border-radius:999px;border:1px solid #1d4ed8;background:#eff6ff;color:#1e3a8a;font-size:0.74rem;text-decoration:none;font-weight:700;'>Slots</a>` : ''}${booking.recipe_id && !noRecipeOverride ? `<button onclick='event.stopPropagation();handleBookedCellRecipeClick(${Number(booking.id)})' style='padding:0.08rem 0.34rem;border-radius:999px;border:1px solid #065f46;background:#ecfdf5;color:#065f46;font-size:0.74rem;cursor:pointer;font-weight:700;'>Recipes</button>` : ''}<button onclick='event.stopPropagation();printBookingInfoSheet(${Number(booking.id)})' title='Print class info sheet' style='padding:0.08rem 0.34rem;border-radius:999px;border:1px solid #7c3aed;background:#f5f3ff;color:#5b21b6;font-size:0.74rem;cursor:pointer;font-weight:700;'>&#128438; Print</button></div>
            </div>`;
          });
          html += `</td>`;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }

  table.setAttribute('aria-label', `Schedule calendar, week of ${formatDateLong(new Date(currentMonday))}`);
  table.innerHTML = html;

  // Legend: inject above the table
  let legendEl = document.getElementById('planner-stream-legend');
  if (!legendEl) {
    legendEl = document.createElement('div');
    legendEl.id = 'planner-stream-legend';
    table.parentNode.insertBefore(legendEl, table);
  }
  const teacherLegend = (() => {
    if (scheduleViewMode !== 'class') return '';
    const names = [...new Set(bookings.map((b) => String(b.staff_name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (!names.length) return '';
    const chips = names.slice(0, 14).map((name) => {
      const style = teacherColorFromName(name);
      return `<span style="background:${style.bg};border:1px solid ${style.border};color:${style.teacherText};border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; ${escHtml(name)}</span>`;
    }).join('');
    const overflow = names.length > 14
      ? `<span style="font-size:0.75rem;color:#6b7280;">+${names.length - 14} more</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.45rem;">
      <span style="font-weight:600;color:#374151;">Teachers:</span>
      ${chips}
      ${overflow}
    </div>`;
  })();

  legendEl.innerHTML = `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.45rem;">
    <span style="font-weight:600;color:#374151;">Planner:</span>
    <span style="background:#dbeafe;border:1px solid #93c5fd;color:#1e40af;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Middle School</span>
    <span style="background:#dcfce7;border:1px solid #86efac;color:#166534;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Junior School</span>
    <span style="background:#ffedd5;border:1px solid #fdba74;color:#9a3412;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Senior (HOSP)</span>
    <span style="font-size:0.75rem;color:#6b7280;margin-left:0.25rem;">Click &#x2715; on a chip to delete it.</span>
  </div>${teacherLegend}`;
  // Add or update the Selected Bookings list below the calendar
  let selectedListDiv = document.getElementById('selected-bookings-list');
  if (!selectedListDiv) {
    selectedListDiv = document.createElement('div');
    selectedListDiv.id = 'selected-bookings-list';
    selectedListDiv.style.margin = '2em 0 0 0';
    selectedListDiv.style.fontSize = '1em';
    table.parentNode.appendChild(selectedListDiv);
  }
  function renderSelectedBookings() {
    const selectedIds = window.selectedBookingIds || [];
    if (!selectedIds.length) {
      selectedListDiv.innerHTML = '';
      return;
    }
    let html = '<div style="font-weight:bold;margin-bottom:0.5em;">Selected Bookings</div><ul style="margin:0 0 0 1.2em;padding:0;">';
    selectedIds.forEach(id => {
      const b = bookings.find(bk => bk.id === id);
      if (b) {
        const slotHref = `teacher_booking_slots.html?booking_id=${encodeURIComponent(String(id))}&source=${encodeURIComponent(window.location.pathname.split('/').pop() || 'add_booking.html')}`;
        html += `<li><a href="#" onclick="scrollToDesiredServingsRow(${escHtml(String(id))});return false;">${escHtml(b.booking_date)} | ${escHtml(b.staff_name)} | ${escHtml(b.class_name)} | ${escHtml(b.recipe)}</a> <a href="${slotHref}" style="margin-left:0.4rem;font-size:0.8rem;color:#1e40af;">[Slots]</a></li>`;
      }
    });
    html += '</ul>';
    // Desired Serving Ingredients Table for each selected booking
    html += '<div id="desired-ingredients-section" style="margin-top:1.5em;"></div>';
    selectedListDiv.innerHTML = html;

    // Fetch and render desired serving ingredients for each selected booking
    const section = document.getElementById('desired-ingredients-section');
    if (!section) return;
    section.innerHTML = '';
    selectedIds.forEach(async id => {
      // Debug output for Desired_Servings_Ingredients removed
    });
  }
  renderSelectedBookings();

  // Add click handlers to booking cells for selection
  window.selectedBookingIds = Array.isArray(window.selectedBookingIds)
    ? window.selectedBookingIds.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
    : [];

  function applySelectionStyles() {
    const selectedIds = new Set(window.selectedBookingIds || []);
    bookings.forEach(cell => {
      const bookingDiv = document.getElementById(`booking-${cell.id}`);
      if (!bookingDiv) return;
      if (selectedIds.has(parseInt(cell.id, 10))) {
        bookingDiv.style.boxShadow = '0 0 0 3px #1976d2, 0 1px 4px #0001';
        bookingDiv.style.background = '#bbdefb';
      } else {
        const baseStyle = getCalendarCellBaseStyle(cell);
        bookingDiv.style.boxShadow = '0 1px 4px #0001';
        bookingDiv.style.background = baseStyle.bg;
        bookingDiv.style.border = `1px solid ${baseStyle.border}`;
      }
    });
  }

  function setupTeacherQuickSelect() {
    const teacherSelect = document.getElementById('quickSelectTeacher');
    const selectBtn = document.getElementById('selectTeacherBookingsBtn');
    const clearBtn = document.getElementById('clearTeacherSelectionBtn');
    if (!teacherSelect) return;

    const teacherNames = [...new Set(
      bookings
        .map(b => String(b.staff_name || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    teacherSelect.innerHTML = '<option value="">-- Select teacher --</option>' +
      teacherNames.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join('');

    if (selectBtn) {
      selectBtn.onclick = function() {
        const teacher = String(teacherSelect.value || '').trim();
        if (!teacher) {
          if (window.QC) window.QC.toast('Choose a teacher first', 'warn');
          return;
        }
        window.selectedBookingIds = bookings
          .filter(b => String(b.staff_name || '').trim() === teacher)
          .map(b => parseInt(b.id, 10))
          .filter(id => Number.isInteger(id) && id > 0);
        applySelectionStyles();
        renderSelectedBookings();
        if (window.QC) window.QC.toast(`Selected all bookings for ${teacher}`, 'success');
      };
    }

    if (clearBtn) {
      clearBtn.onclick = function() {
        window.selectedBookingIds = [];
        applySelectionStyles();
        renderSelectedBookings();
      };
    }
  }

  bookings.forEach(cell => {
    const bookingDiv = document.getElementById(`booking-${cell.id}`);
    if (bookingDiv) {
      const toggleBooking = function() {
        const bookingId = parseInt(cell.id, 10);
        const idx = window.selectedBookingIds.indexOf(bookingId);
        if (idx === -1) {
          window.selectedBookingIds.push(bookingId);
          publishBookingToBookClassForm(cell);
        } else {
          window.selectedBookingIds.splice(idx, 1);
        }
        window.selectedBookingIds = [...new Set(window.selectedBookingIds)];
        applySelectionStyles();
        renderSelectedBookings();
      };

      if (!schedulePresetApplied && Number.isInteger(schedulePresetBookingId) && schedulePresetBookingId > 0) {
        const preset = bookings.find(b => parseInt(b.id, 10) === schedulePresetBookingId);
        if (preset) {
          window.selectedBookingIds = [schedulePresetBookingId];
          publishBookingToBookClassForm(preset);
          schedulePresetApplied = true;
        }
      }
      bookingDiv.onclick = toggleBooking;
      bookingDiv.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleBooking();
        }
      };
    }
  });

  applySelectionStyles();
  setupTeacherQuickSelect();

  if (scheduleAutoPrintBooking && !scheduleAutoPrintDone && Number.isInteger(schedulePresetBookingId) && schedulePresetBookingId > 0) {
    const exists = bookings.some((b) => Number(b.id) === schedulePresetBookingId);
    if (exists) {
      scheduleAutoPrintDone = true;
      // Defer one tick so popup blockers treat it as part of navigation flow.
      setTimeout(() => { printBookingInfoSheet(schedulePresetBookingId); }, 0);
    }
  }

  // Update week label
  const weekStart = new Date(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  document.getElementById('calendarWeekLabel').textContent = formatCalendarWeekHeading(weekStart, weekEnd);
  ensureWeekendToggleButton();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement) {
    document.documentElement.lang = String(userLocale || 'en');
    // One-time delete handler for planner chips (event delegation on document)
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.planner-delete-btn');
      if (!btn) return;
      // Only handle clicks inside the schedule calendar table
      if (!btn.closest('#scheduleCalendarTable')) return;
      const id = btn.dataset.bookingId;
      if (!id) return;
      // aria-label is "Delete <recipe>" and the browser decodes HTML entities for us
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const recipeName = ariaLabel.startsWith('Delete ') ? ariaLabel.slice(7) : (btn.dataset.recipe || '');
      if (!confirm(`Delete planner entry "${recipeName}"?`)) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
        if (!res.ok) { alert('Failed to delete entry.'); btn.disabled = false; return; }
        await renderScheduleCalendar();
      } catch { alert('Error deleting entry.'); btn.disabled = false; }
    });

    document.addEventListener('click', async (e) => {
      const chip = e.target.closest('.planner-chip');
      if (!chip) return;
      if (!chip.closest('#scheduleCalendarTable')) return;
      if (e.target.closest('.planner-delete-btn')) return;
      if (e.target.closest('.planner-action-btn')) return;
      const bookingId = chip.getAttribute('data-booking-id');
      if (!bookingId) return;
      await handlePlannerChipClick(bookingId);
    });
  }
  renderScheduleCalendar();
  initRecentPlannerSidebar();
  // Group confirmation is now handled via the task sidebar + group_confirmation.html
  // Add click handler for compare button
  const compareBtn = document.getElementById('compareStripFoodItemBtn');
  if (compareBtn) {
    compareBtn.onclick = function() {
      const selected = window.selectedBookingIds && window.selectedBookingIds[0];
      if (selected) {
        window.renderStripFoodItemComparisonTable(selected);
      } else {
        alert('Please select a booking first.');
      }
    };
  }
  document.getElementById('prevWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderScheduleCalendar();
  };
  document.getElementById('todayBtn').onclick = () => {
    // Reset to this week's regional start day
    currentMonday = getStartOfWeek(new Date());
    renderScheduleCalendar();
  };
  document.getElementById('nextWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderScheduleCalendar();
  };

  const scheduleViewModeSelect = document.getElementById('scheduleViewModeSelect');
  if (scheduleViewModeSelect) {
    scheduleViewModeSelect.value = scheduleViewMode;
    updatePrintButtonLabel();
    scheduleViewModeSelect.onchange = () => {
      const nextMode = String(scheduleViewModeSelect.value || '').trim().toLowerCase();
      scheduleViewMode = nextMode === 'recipe' ? 'recipe' : 'class';
      localStorage.setItem(scheduleViewModeStorageKey, scheduleViewMode);
      updatePrintButtonLabel();
      renderScheduleCalendar();
    };
  }

  const printScheduleBtn = document.getElementById('printScheduleBtn');
  if (printScheduleBtn) {
    printScheduleBtn.onclick = async () => {
      const chosenMonday = await askWeekToPrint(currentMonday);
      if (!chosenMonday) return;
      await printScheduleForWeek(chosenMonday, showWeekends, scheduleViewMode);
    };
  }

  const syncFromPlannerBtn = document.getElementById('syncFromPlannerBtn');
  if (syncFromPlannerBtn) {
    syncFromPlannerBtn.onclick = async () => {
      syncFromPlannerBtn.disabled = true;
      syncFromPlannerBtn.textContent = 'Syncing\u2026';
      try {
        // Find the earliest planner entry date so we sync all weeks, not just current
        let startDate = toLocalIsoDate(currentMonday);
        try {
          const rangeRes = await fetch('/api/bookings/planner-range', { credentials: 'include' });
          if (rangeRes.ok) {
            const rangeData = await rangeRes.json();
            if (rangeData.minDate) startDate = rangeData.minDate.slice(0, 10);
          }
        } catch { /* use current week as fallback */ }

        const endDate = `${new Date().getFullYear()}-12-31`;
        const res = await fetch('/api/bookings/prefill-from-planner', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate, force_update_recipe: true })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showInfoToast((data && data.error) || 'Sync failed');
          return;
        }
        const s = data.summary || {};
        showInfoToast(
          `Sync complete: ${s.inserted || 0} new bookings, ${s.recipesUpdated || 0} recipes updated, ${s.skippedExisting || 0} unchanged`
        );
        await renderScheduleCalendar();
      } catch (err) {
        showInfoToast('Sync error: ' + (err && err.message ? err.message : 'Unknown error'));
      } finally {
        syncFromPlannerBtn.disabled = false;
        syncFromPlannerBtn.textContent = '\u21ba Sync from Planner';
      }
    };
  }

  const dedupePlannerEntriesBtn = document.getElementById('dedupePlannerEntriesBtn');
  if (dedupePlannerEntriesBtn) {
    dedupePlannerEntriesBtn.onclick = async () => {
      dedupePlannerEntriesBtn.disabled = true;
      dedupePlannerEntriesBtn.textContent = 'Deduping...';
      try {
        let token = getStoredPlannerSyncToken();
        let attempt = await postPlannerDedupe(token);

        if (attempt.res.status === 403) {
          token = promptForPlannerSyncToken();
          if (token == null) {
            showInfoToast('Planner dedupe cancelled.');
            return;
          }
          attempt = await postPlannerDedupe(token);
        }

        if (!attempt.res.ok || !attempt.data || attempt.data.success !== true) {
          const errMsg = (attempt.data && attempt.data.error)
            ? String(attempt.data.error)
            : 'Planner dedupe failed.';
          showInfoToast(errMsg);
          return;
        }

        const deduped = Number(attempt.data.deduped || 0);
        showInfoToast(`Planner dedupe complete. Removed ${deduped} duplicate row${deduped === 1 ? '' : 's'}.`);
        await renderScheduleCalendar();
      } catch (err) {
        showInfoToast('Planner dedupe error: ' + (err && err.message ? err.message : 'Unknown error'));
      } finally {
        dedupePlannerEntriesBtn.disabled = false;
        dedupePlannerEntriesBtn.textContent = 'Dedupe Planner Entries';
      }
    };
  }

  const refreshWeekRecipesBtn = document.getElementById('refreshWeekRecipesBtn');
  if (refreshWeekRecipesBtn) {
    refreshWeekRecipesBtn.onclick = async () => {
      const bookings = Array.isArray(window.currentScheduleBookings) ? window.currentScheduleBookings : [];
      const recipeIds = [...new Set(
        bookings
          .filter((booking) => !isPlannerLikeBooking(booking))
          .map((booking) => Number(booking && booking.recipe_id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      if (!recipeIds.length) {
        showInfoToast('No recipe-linked bookings found in this week.');
        return;
      }

      refreshWeekRecipesBtn.disabled = true;
      refreshWeekRecipesBtn.textContent = 'Refreshing...';

      let okCount = 0;
      let failCount = 0;
      let firstError = '';
      try {
        for (const recipeId of recipeIds) {
          try {
            const resp = await fetch(`/api/recipes/${encodeURIComponent(String(recipeId))}/refresh`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            });
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok || !payload.success) {
              failCount++;
              if (!firstError) firstError = String(payload.error || payload.message || '').trim();
              continue;
            }
            _recipeDetailCache.delete(recipeId);
            okCount++;
          } catch (_) {
            failCount++;
            if (!firstError) firstError = 'Network request failed.';
          }
        }

        if (okCount > 0 && failCount === 0) {
          showInfoToast(`Refreshed ${okCount} recipe${okCount === 1 ? '' : 's'} for this week.`);
        } else if (okCount > 0 && failCount > 0) {
          showInfoToast(`Refreshed ${okCount} recipe${okCount === 1 ? '' : 's'}, ${failCount} failed.`);
        } else {
          showInfoToast(firstError ? `Recipe refresh failed: ${firstError}` : 'Recipe refresh failed. Check admin access and try again.');
        }

        await renderScheduleCalendar();
      } finally {
        refreshWeekRecipesBtn.disabled = false;
        refreshWeekRecipesBtn.textContent = '↻ Refresh Recipes';
      }
    };
  }

  updatePrintButtonLabel();
  ensureWeekendToggleButton();

  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.addEventListener('message', (event) => {
      const state = event && event.data ? event.data : null;
      if (!state) return;
      const refreshAt = Number(state.refreshCalendarAt || 0);
      if (Number.isFinite(refreshAt) && refreshAt > lastCalendarRefreshSignalAt) {
        lastCalendarRefreshSignalAt = refreshAt;
      }
      renderScheduleCalendar();
    });
  }
});

window.publishBookingToBookClassForm = publishBookingToBookClassForm;

// --- Class Info Sheet print function ---
async function printBookingInfoSheet(bookingId) {
  const normalizedId = Number(bookingId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;
  const bookings = Array.isArray(window.currentScheduleBookings) ? window.currentScheduleBookings : [];
  const booking = bookings.find((b) => Number(b.id) === normalizedId);
  if (!booking) { showInfoToast('Could not find that booking.'); return; }

  // Fetch recipe details if there is one linked.
  let recipe = null;
  if (booking.recipe_id) {
    try {
      recipe = await fetchRecipeDetailsForModal(booking.recipe_id);
    } catch (_) {
      recipe = null;
    }
  }

  // Determine stream colour scheme.
  const stream = normalizePlannerStream(booking);
  const streamScheme = isTheoryBooking(booking)
    ? { header: '#6b21a8', headerBg: '#f3e8ff', accent: '#7c3aed', chipBg: '#e9d5ff', chipText: '#581c87', panel: '#faf5ff', label: 'Theory' }
    : stream === 'Junior'
    ? { header: '#166534', headerBg: '#dcfce7', accent: '#15803d', chipBg: '#bbf7d0', chipText: '#14532d', panel: '#f0fdf4', label: 'Junior Food' }
    : stream === 'Senior'
    ? { header: '#9a3412', headerBg: '#ffedd5', accent: '#c2410c', chipBg: '#fed7aa', chipText: '#7c2d12', panel: '#fff7ed', label: 'Senior Food / Hospitality' }
    : { header: '#1e40af', headerBg: '#dbeafe', accent: '#1d4ed8', chipBg: '#bfdbfe', chipText: '#1e3a8a', panel: '#eff6ff', label: 'Middle Food' };

  const teacherColour = teacherColorFromName(booking.staff_name || '');
  const logoUrl = new URL('images/whs logo circular reo .png', window.location.href).href;

  function isLikelyImagePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (/^https?:\/\//i.test(raw)) return true;
    if (/^data:image\//i.test(raw)) return true;
    if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(raw)) return true;
    return false;
  }

  function normalizeRecipeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || !isLikelyImagePath(raw)) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return raw;
    if (/^images\//i.test(raw)) return `/${raw}`;
    return `/images/recipe_user_uploads/${raw}`;
  }

  function stableIndex(seed, length) {
    if (!length) return 0;
    const str = String(seed || 'seed');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }

  function getDishImage(name, rowId, category) {
    const lower = String(name || '').toLowerCase();
    const seed = `${rowId || ''}-${name || ''}`;
    const stockImages = {
      'Student Favourites': [
        'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1435904/pexels-photo-1435904.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200'
      ],
      'Fresh and Veg': [
        'https://images.pexels.com/photos/1211887/pexels-photo-1211887.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1300972/pexels-photo-1300972.jpeg?auto=compress&cs=tinysrgb&w=1200'
      ],
      'Breakfast': [
        'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1527603/pexels-photo-1527603.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=1200'
      ],
      'Baking': [
        'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=1200',
        'https://images.pexels.com/photos/793765/pexels-photo-793765.jpeg?auto=compress&cs=tinysrgb&w=1200'
      ]
    };

    if (/(cupcake|cake|cookie|brownie|muffin|pavlova|dessert|slice)/.test(lower)) {
      const list = stockImages.Baking;
      return list[stableIndex(seed, list.length)];
    }
    if (/(salad|vegetable|veggie|beetroot|kumara|pumpkin)/.test(lower)) {
      const list = stockImages['Fresh and Veg'];
      return list[stableIndex(seed, list.length)];
    }
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) {
      const list = stockImages.Breakfast;
      return list[stableIndex(seed, list.length)];
    }

    const list = stockImages[category] || stockImages['Student Favourites'];
    return list[stableIndex(seed, list.length)];
  }

  function getDishCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(cupcake|cake|cookie|brownie|muffin|pavlova|dessert|slice)/.test(lower)) return 'Baking';
    if (/(salad|vegetable|veggie|beetroot|kumara|pumpkin)/.test(lower)) return 'Fresh and Veg';
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) return 'Breakfast';
    return 'Student Favourites';
  }

  function pickRecipeImageUrl(recipeRow) {
    try {
      const images = JSON.parse(String(recipeRow && recipeRow.ft_images || 'null')) || [];
      const primarySlot = Number(recipeRow && recipeRow.ft_primary_slot);
      if (Number.isInteger(primarySlot) && primarySlot >= 1 && primarySlot <= images.length) {
        const starred = normalizeRecipeImageUrl(images[primarySlot - 1]);
        if (starred) return starred;
      }
      for (const image of images) {
        const value = normalizeRecipeImageUrl(image);
        if (value) return value;
      }
    } catch (_) {}

    const candidates = [
      recipeRow && recipeRow.image_url,
      recipeRow && recipeRow.imageUrl,
      recipeRow && recipeRow.image,
      recipeRow && recipeRow.photo,
      recipeRow && recipeRow.photo_url,
      recipeRow && recipeRow.thumbnail,
      recipeRow && recipeRow.thumbnail_url,
      recipeRow && recipeRow.hero_image
    ];
    for (const candidate of candidates) {
      const url = normalizeRecipeImageUrl(candidate);
      if (!url) continue;
      if (/^javascript:/i.test(url)) continue;
      return url;
    }
    return '';
  }

  async function fetchRecipeDisplayImageUrl(recipeId) {
    const id = Number(recipeId);
    if (!Number.isInteger(id) || id <= 0) return '';
    try {
      if (!Array.isArray(window._recipeDisplayImageRowsCache)) {
        const res = await fetch('/api/recipes/display-table');
        if (!res.ok) return '';
        const rows = await res.json();
        window._recipeDisplayImageRowsCache = Array.isArray(rows) ? rows : [];
      }
      const rows = window._recipeDisplayImageRowsCache;
      const match = rows.find((row) => Number(row && row.recipeid) === id || Number(row && row.id) === id);
      if (!match) return '';
      const explicitImage = pickRecipeImageUrl(match);
      if (explicitImage) return explicitImage;
      const recipeName = String(match.name || booking.recipe || '').trim();
      const recipeCategory = getDishCategory(recipeName);
      return getDishImage(recipeName, match.recipeid || match.id || id, recipeCategory);
    } catch (_) {
      return '';
    }
  }

  // Format date nicely.
  const rawDate = String(booking.booking_date || '').trim();
  const dateDisplay = rawDate
    ? (() => { const d = new Date(rawDate + 'T00:00:00'); return Number.isNaN(d.getTime()) ? rawDate : longDateFormatter.format(d); })()
    : '';

  let recipeImageUrl = pickRecipeImageUrl(recipe);
  if (!recipeImageUrl && booking.recipe_id) {
    recipeImageUrl = await fetchRecipeDisplayImageUrl(booking.recipe_id);
  }

  function buildUnorderedListHtml(rawValue) {
    const items = extractRecipeListItems(rawValue);
    if (!items.length) return '<p style="color:#6b7280;font-style:italic;">Not available.</p>';
    return `<ul class="info-list">` + items.map((i) => `<li>${escHtml(i)}</li>`).join('') + `</ul>`;
  }

  function buildOrderedStepsHtml(rawValue) {
    const steps = extractRecipeListItems(rawValue);
    if (!steps.length) return '<p style="color:#6b7280;font-style:italic;">Not available.</p>';
    return `<ol class="method-list">` + steps.map((step) => `<li>${escHtml(step)}</li>`).join('') + `</ol>`;
  }

  const ingredientsHtml = recipe
    ? buildUnorderedListHtml(recipe.ingredients_display || recipe.ingredients || '')
    : '<p style="color:#6b7280;font-style:italic;">No recipe linked to this booking.</p>';

  const methodHtml = recipe
    ? buildOrderedStepsHtml(recipe.instructions_display || recipe.instructions || '')
    : '';

  const servingSizeHtml = (recipe && recipe.serving_size)
    ? `<span class="meta-chip" style="background:${streamScheme.chipBg};color:${streamScheme.chipText};">Serves ${escHtml(String(recipe.serving_size))}</span>`
    : '';

  const recipeUrlHtml = (recipe && recipe.url)
    ? `<div class="recipe-source">Source: <span style="color:${streamScheme.accent};">${escHtml(recipe.url)}</span></div>`
    : '';

  const recipeImageHtml = recipeImageUrl
    ? `<div class="recipe-photo-wrap"><img class="recipe-photo" src="${escHtml(recipeImageUrl)}" alt="${escHtml((recipe && recipe.name) || booking.recipe || 'Recipe photo')}" /></div>`
    : '';

  const ingredientsSectionHtml = recipeImageHtml
    ? `<div class="section-card" style="background:${streamScheme.panel};border-color:${streamScheme.headerBg};">
        <div class="section-title" style="color:${streamScheme.header};">Ingredients</div>
        <div class="ingredients-grid has-image">
          <div class="ingredients-col">${ingredientsHtml}</div>
          <div class="ingredients-image-col">${recipeImageHtml}</div>
        </div>
      </div>`
    : `<div class="section-card" style="background:${streamScheme.panel};border-color:${streamScheme.headerBg};">
        <div class="section-title" style="color:${streamScheme.header};">Ingredients</div>
        <div class="ingredients-grid">
          <div class="ingredients-col">${ingredientsHtml}</div>
        </div>
      </div>`;

  const methodSection = methodHtml
    ? `<div class="section-card" style="background:${streamScheme.panel};border-color:${streamScheme.headerBg};">
        <div class="section-title" style="color:${streamScheme.header};">Method</div>
        ${methodHtml}
      </div>`
    : '';

  const studentNote = recipe
    ? 'Bring a pen and work safely. Tick off each step as you complete it.'
    : 'Ask your teacher which recipe will be used for this session.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Class Info Sheet — ${escHtml(booking.class_name || '')} ${dateDisplay ? '— ' + dateDisplay : ''}</title>
  <style>
    @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Trebuchet MS', 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .sheet {
      position: relative;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 1.1rem 1.1rem 1rem;
      background:
        radial-gradient(circle at 90% 8%, ${streamScheme.headerBg} 0, ${streamScheme.headerBg} 9%, transparent 10%),
        linear-gradient(180deg, #ffffff 0%, #ffffff 100%);
    }
    .top-banner {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 0.8rem;
      align-items: center;
      background: ${streamScheme.headerBg};
      border-left: 7px solid ${streamScheme.header};
      border-radius: 11px;
      padding: 0.7rem 0.9rem;
      margin-bottom: 0.9rem;
    }
    .logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      background: #fff;
      border-radius: 999px;
      padding: 0.18rem;
      border: 1px solid #d1d5db;
    }
    .kicker {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${streamScheme.header};
      margin-bottom: 0.2rem;
    }
    .main-title {
      margin: 0;
      font-size: 1.6rem;
      line-height: 1.1;
      color: ${streamScheme.header};
      font-weight: 900;
    }
    .subline {
      margin-top: 0.22rem;
      font-size: 0.92rem;
      color: ${streamScheme.accent};
      font-weight: 700;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.44rem;
      margin-bottom: 0.9rem;
    }
    .meta-chip {
      display: inline-block;
      border-radius: 999px;
      padding: 0.2rem 0.78rem;
      border: 1px solid #d1d5db;
      font-size: 0.82rem;
      font-weight: 700;
    }
    .student-box {
      border: 2px dashed ${streamScheme.chipBg};
      border-radius: 10px;
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.95rem;
      background: #fff;
    }
    .student-box-title {
      font-size: 0.86rem;
      font-weight: 800;
      color: ${streamScheme.header};
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.25rem;
    }
    .student-line {
      font-size: 0.9rem;
      color: #334155;
      margin-top: 0.22rem;
    }
    .recipe-name {
      font-size: 1.28rem;
      font-weight: 900;
      color: ${streamScheme.header};
      margin: 0;
      line-height: 1.2;
    }
    .recipe-source {
      margin-top: 0.35rem;
      font-size: 0.78rem;
      color: #6b7280;
      overflow-wrap: anywhere;
    }
    .recipe-photo-wrap {
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #d1d5db;
      background: #fff;
      max-height: 220px;
    }
    .recipe-photo {
      display: block;
      width: 100%;
      height: 100%;
      max-height: 220px;
      object-fit: cover;
    }
    .ingredients-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.8rem;
      align-items: start;
    }
    .ingredients-col {
      min-width: 0;
    }
    .ingredients-image-col {
      min-width: 0;
    }
    .section-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    .section-card {
      border: 1px solid #dbeafe;
      border-radius: 10px;
      padding: 0.72rem 0.8rem;
      background: #fff;
    }
    .section-title {
      font-size: 1.02rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 0.45rem;
      border-bottom: 2px solid rgba(0, 0, 0, 0.08);
      padding-bottom: 0.2rem;
    }
    .info-list {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.58;
    }
    .info-list li {
      margin-bottom: 0.2rem;
      break-inside: avoid;
    }
    .method-list {
      margin: 0;
      padding-left: 1.35rem;
      line-height: 1.62;
    }
    .method-list li {
      margin-bottom: 0.28rem;
      break-inside: avoid;
    }
    .footer {
      margin-top: 0.9rem;
      border-top: 1px solid #e5e7eb;
      padding-top: 0.6rem;
      font-size: 0.72rem;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .no-print { display: none !important; }
    @media screen {
      body { padding: 1.5rem; max-width: 820px; margin: 0 auto; }
      .no-print { display: block !important; }
    }
    @media print {
      .sheet { border: none; border-radius: 0; padding: 0; background: #fff; }
    }
    @media (min-width: 640px) {
      .ingredients-grid.has-image {
        grid-template-columns: 1.6fr 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:1.2rem;display:flex;gap:0.6rem;align-items:center;">
    <button onclick="window.print()" style="background:${streamScheme.header};color:#fff;border:none;border-radius:6px;padding:0.5rem 1.3rem;font-size:0.95rem;font-weight:700;cursor:pointer;">&#128438; Print / Save as PDF</button>
    <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;padding:0.5rem 1rem;font-size:0.95rem;cursor:pointer;">Close</button>
  </div>

  <div class="sheet">
    <div class="top-banner">
      <img class="logo" src="${logoUrl}" alt="Westland High School logo" />
      <div>
        <div class="kicker">Westland High School - ${escHtml(streamScheme.label)}</div>
        <h1 class="main-title">${escHtml(booking.class_name || 'Class')} Student Recipe Sheet</h1>
        ${dateDisplay ? `<div class="subline">${escHtml(dateDisplay)}${booking.period ? ' - Period ' + escHtml(String(booking.period)) : ''}</div>` : ''}
      </div>
    </div>

    <div class="chip-row">
      ${booking.staff_name ? `<span class="meta-chip" style="background:${teacherColour.bg};border-color:${teacherColour.border};color:${teacherColour.teacherText};">Teacher: ${escHtml(booking.staff_name)}</span>` : ''}
      ${booking.class_size ? `<span class="meta-chip" style="background:#f8fafc;color:#334155;">Class size: ${escHtml(String(booking.class_size))}</span>` : ''}
      ${booking.period ? `<span class="meta-chip" style="background:#fafafa;color:#374151;">Period ${escHtml(String(booking.period))}</span>` : ''}
      ${servingSizeHtml}
    </div>

    <div class="student-box">
      <div class="student-box-title">Student Focus</div>
      <div class="student-line">${escHtml(studentNote)}</div>
      <div class="student-line">Name: ____________________  Partner: ____________________</div>
    </div>

    <div class="section-card" style="background:${streamScheme.panel};border-color:${streamScheme.headerBg};">
      <div>
        <div style="display:flex;align-items:baseline;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem;">
          <h2 class="recipe-name">${recipe ? escHtml(recipe.name || booking.recipe || '') : escHtml(booking.recipe || 'No recipe linked')}</h2>
        </div>
        ${recipe && recipe.description ? `<div style="margin-top:0.2rem;font-size:0.9rem;color:#475569;font-style:italic;">${escHtml(recipe.description)}</div>` : ''}
        ${recipeUrlHtml}
      </div>
    </div>

    <div class="section-grid" style="margin-top:0.75rem;">
      ${ingredientsSectionHtml}
      ${methodSection}
    </div>

    <div class="footer">
      <span>Westland High School - Food Technology</span>
      <span>Printed ${new Date().toLocaleDateString()}</span>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => window.print());
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, '_blank');
  if (!tab) showInfoToast('Could not open print window — please allow pop-ups for this site.');
  // Revoke the object URL after a delay to free memory
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Groups Confirmation Popup ────────────────────────────────────────────────
// Shows on Browse Practicals when the week 2 weeks ahead has bookings missing groups.

async function checkAndShowGroupsPopup() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = getStartOfWeek(today);
  target.setDate(target.getDate() + 14);
  const targetEnd = new Date(target);
  targetEnd.setDate(target.getDate() + 6);
  const startStr = toLocalIsoDate(target);
  const endStr = toLocalIsoDate(targetEnd);

  const sessionKey = 'groups_popup_' + startStr;
  if (sessionStorage.getItem(sessionKey)) return;

  try {
    const [bookingsData, meData] = await Promise.all([
      fetch('/api/bookings/all?start=' + startStr + '&end=' + endStr + '&fields=calendar').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);

    const allBookings = Array.isArray(bookingsData.bookings) ? bookingsData.bookings : [];
    const unconfirmed = allBookings.filter(b =>
      !isPlannerLikeBooking(b) &&
      (b.groups == null || String(b.groups).trim() === '')
    );

    if (!unconfirmed.length) { sessionStorage.setItem(sessionKey, '1'); return; }

    const firstName = (meData && meData.user && meData.user.name)
      ? String(meData.user.name).split(' ')[0]
      : 'Teacher';

    await showGroupsConfirmationPopup(unconfirmed, firstName, startStr);
    sessionStorage.setItem(sessionKey, '1');
  } catch (_) { /* non-critical */ }
}

async function showGroupsConfirmationPopup(bookings, firstName, weekStart) {
  return new Promise((resolve) => {
    const selections = {};
    bookings.forEach(b => { selections[b.id] = null; });

    const weekLabel = (() => {
      try { return new Date(weekStart + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch (_) { return weekStart; }
    })();

    const btnBase = 'padding:0.22rem 0.55rem;border:1px solid #d1d5db;border-radius:999px;background:#f9fafb;font-size:0.8rem;cursor:pointer;white-space:nowrap;transition:background 0.15s,color 0.15s;';

    const rowsHtml = bookings.map(b => {
      const id = b.id;
      const cs = Number(b.class_size) || 0;
      const pairsN = cs ? Math.ceil(cs / 2) : '?';
      const threesN = cs ? Math.ceil(cs / 3) : '?';
      const indiN = cs || '?';
      const dateLabel = (() => {
        try { return new Date(String(b.booking_date || '').slice(0, 10) + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (_) { return String(b.booking_date || '').slice(0, 10); }
      })();
      return '<tr data-booking-id="' + id + '" class="grp-row" style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:0.55rem 0.6rem;font-size:0.88rem;font-weight:700;color:#1f2937;white-space:nowrap;">' + escHtml(String(b.class_name || '')) + '</td>' +
        '<td style="padding:0.55rem 0.4rem;font-size:0.82rem;color:#4b5563;">' + escHtml(String(b.staff_name || '')) + '</td>' +
        '<td style="padding:0.55rem 0.4rem;font-size:0.82rem;color:#4b5563;white-space:nowrap;">' + dateLabel + ' P' + escHtml(String(b.period || '')) + '</td>' +
        '<td style="padding:0.55rem 0.4rem;font-size:0.82rem;text-align:center;color:#374151;">' + (cs || '?') + '</td>' +
        '<td style="padding:0.4rem 0.4rem;"><div style="display:flex;flex-wrap:wrap;gap:0.3rem;align-items:center;">' +
          '<button type="button" class="grp-btn" data-id="' + id + '" data-count="' + pairsN + '" style="' + btnBase + '" title="Groups of 2">Pairs (' + pairsN + ')</button>' +
          '<button type="button" class="grp-btn" data-id="' + id + '" data-count="' + indiN + '" style="' + btnBase + '" title="Each student individually">Individuals (' + indiN + ')</button>' +
          '<button type="button" class="grp-btn" data-id="' + id + '" data-count="' + threesN + '" style="' + btnBase + '" title="Groups of 3">Threes (' + threesN + ')</button>' +
          '<span style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.8rem;color:#6b7280;">Custom: <input type="number" class="grp-custom" data-id="' + id + '" min="1" max="99" placeholder="#" style="width:48px;padding:0.18rem 0.3rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;" /></span>' +
        '</div></td>' +
        '<td style="padding:0.4rem 0.5rem;text-align:center;"><span class="grp-result" data-id="' + id + '" style="font-size:0.95rem;font-weight:700;color:#9ca3af;">--</span></td>' +
      '</tr>';
    }).join('');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:flex-start;justify-content:center;z-index:10100;padding:1.5rem 0.5rem;box-sizing:border-box;overflow-y:auto;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.28);width:min(98vw,820px);';
    modal.innerHTML =
      '<div style="background:linear-gradient(135deg,#1e40af 0%,#1976d2 100%);padding:1.1rem 1.3rem 0.9rem;color:#fff;border-radius:12px 12px 0 0;">' +
        '<div style="font-size:1.2rem;font-weight:800;margin-bottom:0.25rem;">Hi ' + escHtml(firstName) + '! Groups confirmation needed</div>' +
        '<div style="font-size:0.88rem;opacity:0.9;">You have <strong>' + bookings.length + '</strong> class' + (bookings.length !== 1 ? 'es' : '') + ' in the week of <strong>' + escHtml(weekLabel) + '</strong> without group sizes set. ' +
        'The Lead Teacher needs this to generate shopping lists. Please confirm the group type for each class.</div>' +
      '</div>' +
      '<div style="padding:0.75rem 1rem 0.25rem;overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;min-width:580px;">' +
          '<thead><tr style="background:#f8fafc;font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">' +
            '<th style="padding:0.4rem 0.6rem;text-align:left;">Class</th>' +
            '<th style="padding:0.4rem 0.4rem;text-align:left;">Teacher</th>' +
            '<th style="padding:0.4rem 0.4rem;text-align:left;">Date / Period</th>' +
            '<th style="padding:0.4rem 0.4rem;text-align:center;">Size</th>' +
            '<th style="padding:0.4rem 0.4rem;text-align:left;">Group Type</th>' +
            '<th style="padding:0.4rem 0.5rem;text-align:center;">No. of Groups</th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div id="grpStatus" style="min-height:1.1rem;padding:0.15rem 1.1rem;font-size:0.82rem;color:#dc2626;"></div>' +
      '<div style="padding:0.7rem 1.1rem 1rem;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">' +
        '<div style="font-size:0.78rem;color:#6b7280;">Rows left blank will be skipped. Reopen this page to confirm later.</div>' +
        '<div style="display:flex;gap:0.5rem;">' +
          '<button type="button" id="grpSkipBtn" style="padding:0.45rem 1rem;border:1px solid #d1d5db;background:#f8fafc;border-radius:6px;cursor:pointer;font-size:0.9rem;">Skip for Now</button>' +
          '<button type="button" id="grpSaveBtn" style="padding:0.45rem 1.15rem;border:none;background:#1976d2;color:#fff;border-radius:6px;cursor:pointer;font-size:0.9rem;font-weight:700;">Save Groups</button>' +
        '</div>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();

    function setSelection(bookingId, count, sourceBtn) {
      const n = Number(count);
      const valid = Number.isFinite(n) && n > 0;
      selections[bookingId] = valid ? n : null;
      const row = modal.querySelector('tr[data-booking-id="' + bookingId + '"]');
      if (!row) return;
      row.querySelectorAll('.grp-btn').forEach(b => {
        if (b === sourceBtn) { b.style.background = '#1976d2'; b.style.color = '#fff'; b.style.borderColor = '#1976d2'; }
        else { b.style.background = '#f9fafb'; b.style.color = ''; b.style.borderColor = '#d1d5db'; }
      });
      const el = row.querySelector('.grp-result[data-id="' + bookingId + '"]');
      if (el) { el.textContent = valid ? String(n) : '--'; el.style.color = valid ? '#059669' : '#9ca3af'; }
    }

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('.grp-btn');
      if (!btn) return;
      const bookingId = btn.dataset.id;
      const count = Number(btn.dataset.count);
      if (!bookingId || !Number.isFinite(count) || count <= 0) return;
      const row = modal.querySelector('tr[data-booking-id="' + bookingId + '"]');
      if (row) { const ci = row.querySelector('.grp-custom'); if (ci) ci.value = ''; }
      setSelection(bookingId, count, btn);
    });

    modal.addEventListener('input', (e) => {
      if (!e.target.classList.contains('grp-custom')) return;
      const bookingId = e.target.dataset.id;
      const val = parseInt(e.target.value, 10);
      const row = modal.querySelector('tr[data-booking-id="' + bookingId + '"]');
      if (row) row.querySelectorAll('.grp-btn').forEach(b => { b.style.background = '#f9fafb'; b.style.color = ''; b.style.borderColor = '#d1d5db'; });
      setSelection(bookingId, val, null);
    });

    modal.querySelector('#grpSkipBtn').onclick = () => { cleanup(); resolve(false); };

    modal.querySelector('#grpSaveBtn').onclick = async () => {
      const toSave = Object.entries(selections).filter(([, v]) => v != null && Number.isFinite(Number(v)) && Number(v) > 0);
      if (!toSave.length) {
        const s = modal.querySelector('#grpStatus');
        if (s) s.textContent = 'Select a group type for at least one class, or use Skip for Now.';
        return;
      }
      const saveBtn = modal.querySelector('#grpSaveBtn');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
      modal.querySelector('#grpStatus').textContent = '';

      let saved = 0, failed = 0;
      await Promise.all(toSave.map(async ([bookingId, groupCount]) => {
        try {
          const r = await fetch('/api/bookings/' + bookingId + '/groups', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups: groupCount })
          });
          if (r.ok) saved++; else failed++;
        } catch (_) { failed++; }
      }));

      cleanup();
      if (saved > 0) {
        showInfoToast('Groups saved for ' + saved + ' booking' + (saved !== 1 ? 's' : '') + '.');
        renderScheduleCalendar();
      }
      if (failed > 0) showInfoToast(failed + ' update(s) failed - try editing those bookings manually.');
      resolve(true);
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(false); } });
  });
}
