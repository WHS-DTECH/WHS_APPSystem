window.OpsWorkspace = (() => {
  const cache = {};

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(url, fallbackValue) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (err) {
      if (fallbackValue !== undefined) return fallbackValue;
      throw err;
    }
  }

  function toArray(value, nestedKey) {
    if (Array.isArray(value)) return value;
    if (nestedKey && value && Array.isArray(value[nestedKey])) return value[nestedKey];
    return [];
  }

  function normalizeRecipe(recipe) {
    return {
      ...recipe,
      id: recipe && recipe.id !== undefined ? Number(recipe.id) : null,
      name: String(recipe?.name || '').trim(),
      url: String(recipe?.url || '').trim(),
      serving_size: String(recipe?.serving_size || '').trim(),
      ingredients_display: String(recipe?.ingredients_display || '').trim(),
      instructions_display: String(recipe?.instructions_display || '').trim(),
      extracted_ingredients: String(recipe?.extracted_ingredients || '').trim(),
      instructions_extracted: String(recipe?.instructions_extracted || '').trim(),
      extracted_instructions: String(recipe?.extracted_instructions || '').trim(),
      created_at: recipe?.created_at || '',
      updated_at: recipe?.updated_at || '',
      uploaded_recipe_id: recipe?.uploaded_recipe_id ?? ''
    };
  }

  async function getRecipes(force = false) {
    if (!force && cache.recipes) return cache.recipes;
    const data = await fetchJson('/api/recipes', []);
    cache.recipes = toArray(data).map(normalizeRecipe);
    return cache.recipes;
  }

  async function getPublishedRecipes(force = false) {
    if (!force && cache.displayTable) return cache.displayTable;
    const data = await fetchJson('/api/recipes/display-table', []);
    cache.displayTable = toArray(data).map((row) => ({
      ...row,
      recipeid: row?.recipeid !== undefined ? Number(row.recipeid) : null,
      id: row?.id !== undefined ? Number(row.id) : null,
      name: String(row?.name || '').trim(),
      ingredients_display: String(row?.ingredients_display || '').trim(),
      instructions_display: String(row?.instructions_display || '').trim()
    }));
    return cache.displayTable;
  }

  async function getUploads(force = false) {
    if (!force && cache.uploads) return cache.uploads;
    const data = await fetchJson('/api/uploads', []);
    cache.uploads = toArray(data).map((row) => ({
      ...row,
      id: row?.id !== undefined ? Number(row.id) : null,
      recipe_title: String(row?.recipe_title || '').trim(),
      upload_type: String(row?.upload_type || '').trim(),
      source_url: String(row?.source_url || '').trim(),
      uploaded_by: String(row?.uploaded_by || '').trim(),
      upload_date: row?.upload_date || ''
    }));
    return cache.uploads;
  }

  async function getInventory(force = false) {
    if (!force && cache.inventory) return cache.inventory;
    const data = await fetchJson('/api/ingredients/inventory/all', { success: true, data: [] });
    cache.inventory = toArray(data, 'data');
    return cache.inventory;
  }

  async function getBookings(force = false) {
    if (!force && cache.bookings) return cache.bookings;
    const data = await fetchJson('/api/bookings/all', []);
    cache.bookings = toArray(data, 'bookings');
    return cache.bookings;
  }

  async function getStaff(force = false) {
    if (!force && cache.staff) return cache.staff;
    const data = await fetchJson('/api/staff_upload/all', { staff: [] });
    cache.staff = toArray(data, 'staff');
    return cache.staff;
  }

  async function getClasses(force = false) {
    if (!force && cache.classes) return cache.classes;
    const data = await fetchJson('/api/classes/class_upload/all', { classes: [] });
    cache.classes = toArray(data, 'classes');
    return cache.classes;
  }

  async function getDepartments(force = false) {
    if (!force && cache.departments) return cache.departments;
    const data = await fetchJson('/api/department/all', { department: [] });
    cache.departments = toArray(data, 'department');
    return cache.departments;
  }

  async function getPermissions(force = false) {
    if (!force && cache.permissions) return cache.permissions;
    cache.permissions = await fetchJson('/api/permissions/all', { success: false, roles: [], routes: [] });
    return cache.permissions;
  }

  async function getUserRoleAssignments(force = false) {
    if (!force && cache.userRoles) return cache.userRoles;
    const data = await fetchJson('/api/user_roles/all', { success: false, users: [] });
    cache.userRoles = toArray(data, 'users');
    return cache.userRoles;
  }

  async function getStudents(force = false) {
    if (!force && cache.students) return cache.students;
    const data = await fetchJson('/api/student_upload/all', { students: [] });
    cache.students = toArray(data, 'students');
    return cache.students;
  }

  async function getStatus(force = false) {
    if (!force && cache.status) return cache.status;
    cache.status = await fetchJson('/api/status', { ok: false, status: 'unknown' });
    return cache.status;
  }

  function formatDateTime(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-NZ', {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDate(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-NZ', {
      year: 'numeric', month: 'short', day: '2-digit'
    });
  }

  function relativeTime(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.round(diffMs / 3600000);
    if (Math.abs(diffHours) < 24) return `${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d`;
  }

  function isRecipePublished(recipe, displayRows) {
    return displayRows.some((row) => Number(row.recipeid) === Number(recipe.id));
  }

  function recipeNeedsReview(recipe) {
    const missingServing = !recipe.serving_size;
    const missingIngredients = !recipe.extracted_ingredients && !recipe.ingredients_display;
    const missingInstructions = !recipe.instructions_extracted && !recipe.instructions_display;
    const missingName = !recipe.name;
    return missingServing || missingIngredients || missingInstructions || missingName;
  }

  function recipeReadyToPublish(recipe) {
    return !!(recipe.name && recipe.url && recipe.serving_size && recipe.extracted_ingredients && recipe.instructions_extracted);
  }

  function getRecipeLink(recipeId) {
    return `quick_add.html#recipe-${encodeURIComponent(String(recipeId || ''))}`;
  }

  function renderStats(containerId, stats) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div class="ops-stats">
        ${stats.map((item) => `
          <div class="ops-stat">
            <div class="ops-stat-label">${escapeHtml(item.label)}</div>
            <div class="ops-stat-value">${escapeHtml(item.value)}</div>
            <div class="ops-stat-copy">${escapeHtml(item.copy || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTable(containerId, columns, rows, emptyMessage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      el.innerHTML = `<div class="ops-empty">${escapeHtml(emptyMessage || 'No rows to display.')}<br><span style='color:#8a2d2d;font-size:0.98em;'>Tip: Try adjusting your filters, or check if data is available for your selection.</span></div>`;
      return;
    }

    // Filtering state (per table)
    let filter = '';
    const filterKey = `opsTableFilter_${containerId}`;
    try {
      const stored = sessionStorage.getItem(filterKey);
      if (stored) filter = stored;
    } catch (_) {}

    // Pagination state (per table)
    const PAGE_SIZE = 20;
    let page = 1;
    let filteredRows = rows;
    const pageKey = `opsTablePage_${containerId}`;
    function applyFilter() {
      if (!filter) return rows;
      const f = filter.toLowerCase();
      return rows.filter(row => Object.values(row).some(val => String(val).toLowerCase().includes(f)));
    }
    filteredRows = applyFilter();
    let totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    try {
      const stored = sessionStorage.getItem(pageKey);
      if (stored) page = Math.max(1, Math.min(totalPages, parseInt(stored, 10)));
    } catch (_) {}

    function renderPage() {
      filteredRows = applyFilter();
      totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const pageRows = filteredRows.slice(start, end);
      el.innerHTML = `
        <div class="ops-table-toolbar" style="margin-bottom:0.5em;display:flex;align-items:center;gap:0.7em;">
          <label for="${containerId}_filter" style="font-size:0.98em;">Filter:</label>
          <input id="${containerId}_filter" class="ops-input" type="search" value="${escapeHtml(filter)}" placeholder="Type to filter..." style="max-width:220px;" aria-label="Filter table" />
        </div>
        <div class="ops-table-wrap">
          <table class="ops-table" aria-label="Data table, page ${page} of ${totalPages}">
            <thead>
              <tr>${columns.map((column) => `<th title="${escapeHtml(column.copy || column.label)}">${escapeHtml(column.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${pageRows.map((row) => `
                <tr>
                  ${columns.map((column) => {
                    const raw = typeof column.render === 'function' ? column.render(row) : row[column.key];
                    const value = raw === null || raw === undefined ? '' : String(raw);
                    return `<td>${value}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <nav class="ops-pagination" aria-label="Table pagination" style="margin-top:0.7em;display:${totalPages>1?'flex':'none'};align-items:center;gap:0.5em;">
          <button class="ops-button" aria-label="Previous page" ${page===1?'disabled':''} tabindex="0">Prev</button>
          <span aria-live="polite" style="font-size:0.98em;">Page ${page} of ${totalPages} (${filteredRows.length} row${filteredRows.length!==1?'s':''})</span>
          <button class="ops-button" aria-label="Next page" ${page===totalPages?'disabled':''} tabindex="0">Next</button>
        </nav>
      `;
      // Add event listeners for pagination
      const [filterInput] = el.querySelectorAll(`#${containerId}_filter`);
      if (filterInput) {
        filterInput.oninput = (e) => {
          filter = e.target.value;
          try{sessionStorage.setItem(filterKey, filter);}catch(_){}
          page = 1;
          try{sessionStorage.setItem(pageKey, page);}catch(_){}
          renderPage();
        };
      }
      const [prevBtn, , nextBtn] = el.querySelectorAll('.ops-pagination button');
      if (prevBtn) prevBtn.onclick = () => { page = Math.max(1, page - 1); try{sessionStorage.setItem(pageKey, page);}catch(_){} renderPage(); };
      if (nextBtn) nextBtn.onclick = () => { page = Math.min(totalPages, page + 1); try{sessionStorage.setItem(pageKey, page);}catch(_){} renderPage(); };
    }
    renderPage();
  }

  function tag(text, tone = '') {
    const klass = tone ? `ops-chip ${tone}` : 'ops-chip';
    return `<span class="${klass}">${escapeHtml(text)}</span>`;
  }

  function shortText(value, max = 120) {
    const text = String(value || '').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trim()}…`;
  }

  function parseListItems(htmlOrText) {
    const raw = String(htmlOrText || '').trim();
    if (!raw) return [];
    const matches = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) =>
      String(match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    ).filter(Boolean);
    if (matches.length) return matches;
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  return {
    escapeHtml,
    fetchJson,
    getRecipes,
    getPublishedRecipes,
    getUploads,
    getInventory,
    getBookings,
    getStaff,
    getClasses,
    getDepartments,
    getPermissions,
    getUserRoleAssignments,
    getStudents,
    getStatus,
    formatDate,
    formatDateTime,
    relativeTime,
    isRecipePublished,
    recipeNeedsReview,
    recipeReadyToPublish,
    getRecipeLink,
    renderStats,
    renderTable,
    tag,
    shortText,
    parseListItems
  };
})();