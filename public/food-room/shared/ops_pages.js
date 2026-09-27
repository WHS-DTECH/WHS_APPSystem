const OpsPages = (() => {
  const Ops = window.OpsWorkspace;
  const CURRENT_STAFF_USER_KEY = 'currentStaffUser';
  const SELECTED_RECIPE_KEY = 'selectedRecipeId';

  function byId(id) {
    return document.getElementById(id);
  }

  function escape(value) {
    return Ops.escapeHtml(value);
  }

  function queryParam(name) {
    return new URL(window.location.href).searchParams.get(name);
  }

  function setQueryParam(name, value) {
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
    window.history.replaceState({}, '', url);
  }

  // Add status indicator to chips
  function setHero({ title, subtitle, chips = [], status }) {
    byId('opsTitle').textContent = title;
    byId('opsSubtitle').textContent = subtitle;
    let statusChip = '';
    if (status) {
      let tone = status.ok === false ? 'warning' : (status.ok === true ? 'success' : 'danger');
      let text = status.ok === false ? 'Status unknown' : (status.ok === true ? 'API reachable' : 'API error');
      if (status.status && status.status !== 'unknown') text += ` (${status.status})`;
      statusChip = Ops.tag(text, tone);
    }
    byId('opsChipRow').innerHTML = [statusChip, ...chips.map((chip) => Ops.tag(chip.text, chip.tone))].join('');
  }

  function setSections(primaryHtml, secondaryHtml = '') {
    byId('opsPrimary').innerHTML = primaryHtml;
    byId('opsSecondary').innerHTML = secondaryHtml;
  }

  function anchor(href, label) {
    return `<a href="${href}">${escape(label)}</a>`;
  }

  function actionLink(href, label, recipeId = '') {
    const recipeAttr = recipeId ? ` data-recipe-id="${escape(recipeId)}"` : '';
    return `<a href="${href}" class="ops-action-link"${recipeAttr}>${escape(label)}</a>`;
  }

  function actionRow(actions) {
    return `<div class="ops-actions">${actions.join('')}</div>`;
  }

  function persistSelectedRecipe(recipeId) {
    if (!recipeId) return;
    try {
      sessionStorage.setItem(SELECTED_RECIPE_KEY, String(recipeId));
    } catch (_) {
      // Ignore storage errors and allow normal navigation to continue.
    }
  }

  function getPreferredRecipeId() {
    const queryRecipeId = queryParam('recipeId');
    const hashMatch = /^#recipe-(.+)$/.exec(window.location.hash || '');
    const hashRecipeId = hashMatch ? decodeURIComponent(hashMatch[1]) : '';
    const storedRecipeId = (() => {
      try {
        return sessionStorage.getItem(SELECTED_RECIPE_KEY) || '';
      } catch (_) {
        return '';
      }
    })();
    return String(queryRecipeId || hashRecipeId || storedRecipeId || '').trim();
  }

  function readStoredStaffContext() {
    try {
      return JSON.parse(sessionStorage.getItem(CURRENT_STAFF_USER_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function recipeAnchor(recipe) {
    return anchor(Ops.getRecipeLink(recipe.id), recipe.name || `Recipe ${recipe.id}`);
  }

  function recipeActions(recipe) {
    const recipeId = recipe && recipe.id ? String(recipe.id) : '';
    if (!recipeId) return '';
    return actionRow([
      actionLink(`quick_add.html?recipeId=${encodeURIComponent(recipeId)}`, 'Quick Add', recipeId),
      actionLink(`add_recipe.html?recipeId=${encodeURIComponent(recipeId)}`, 'Edit', recipeId),
      actionLink(`ops_recipe_compare.html?recipeId=${encodeURIComponent(recipeId)}`, 'Compare', recipeId)
    ]);
  }

  function formatMissing(recipe) {
    const missing = [];
    if (!recipe.name) missing.push('name');
    if (!recipe.url) missing.push('url');
    if (!recipe.serving_size) missing.push('serving size');
    if (!recipe.extracted_ingredients && !recipe.ingredients_display) missing.push('ingredients');
    if (!recipe.extracted_instructions && !recipe.instructions_display) missing.push('instructions');
    return missing;
  }

  function recentFirst(rows, dateKey) {
    return [...rows].sort((left, right) => {
      const leftValue = new Date(left?.[dateKey] || 0).getTime();
      const rightValue = new Date(right?.[dateKey] || 0).getTime();
      return rightValue - leftValue;
    });
  }

  function upcomingBookings(bookings, days = 30) {
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + days);
    return bookings.filter((booking) => {
      const date = new Date(booking.booking_date || '');
      return !Number.isNaN(date.getTime()) && date >= new Date(now.toDateString()) && date <= limit;
    }).sort((left, right) => new Date(left.booking_date) - new Date(right.booking_date));
  }

  function renderError(message) {
    setSections(`
      <div class="ops-error">
        <div style="font-weight:bold;">${escape(message)}</div>
        <div style="margin-top:0.5em;">If this is a database or API error, please check your connection or contact IT support.</div>
        <button class="ops-button" style="margin-top:1em;" onclick="window.location.reload()">Retry</button>
      </div>
    `, '');
    Ops.renderStats('opsSummary', []);
  }

  function bindQuickActionPersistence() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('.ops-action-link[data-recipe-id]');
      if (!link) return;
      persistSelectedRecipe(link.getAttribute('data-recipe-id'));
    });
  }

  function renderDashboardTables(recipes, displayRows, uploads, bookings) {
    const reviewRows = recentFirst(recipes.filter((recipe) => Ops.recipeNeedsReview(recipe)), 'updated_at').slice(0, 8);
    const upcoming = upcomingBookings(bookings, 21).slice(0, 8);
    const recentUploads = recentFirst(uploads, 'upload_date').slice(0, 8);

    Ops.renderTable(
      'dashboardReviewTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Missing', render: (recipe) => escape(formatMissing(recipe).join(', ') || 'None') },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      reviewRows,
      'No recipes are waiting for review.'
    );

    Ops.renderTable(
      'dashboardBookingTable',
      [
        { label: 'Date', render: (booking) => escape(Ops.formatDate(booking.booking_date)) },
        { label: 'Class', render: (booking) => escape(booking.class_name || 'Not set') },
        { label: 'Teacher', render: (booking) => escape(booking.staff_name || 'Not set') },
        { label: 'Recipe', render: (booking) => escape(booking.recipe || 'Not linked') },
        { label: 'Actions', render: (booking) => booking.recipe_id ? recipeActions({ id: booking.recipe_id, name: booking.recipe }) : '' }
      ],
      upcoming,
      'No upcoming class bookings in the next three weeks.'
    );

    Ops.renderTable(
      'dashboardUploadTable',
      [
        { label: 'Upload', render: (upload) => escape(upload.recipe_title || `Upload ${upload.id}`) },
        { label: 'Type', render: (upload) => escape(upload.upload_type || 'Unknown') },
        { label: 'By', render: (upload) => escape(upload.uploaded_by || 'Unknown') },
        { label: 'When', render: (upload) => escape(Ops.formatDateTime(upload.upload_date)) },
        { label: 'Actions', render: () => actionRow([actionLink('quick_add.html', 'Open Intake')]) }
      ],
      recentUploads,
      'No recent uploads found.'
    );
  }

  async function renderDashboard() {
    const [recipes, displayRows, uploads, bookings, status] = await Promise.all([
      Ops.getRecipes(),
      Ops.getPublishedRecipes(),
      Ops.getUploads(),
      Ops.getBookings(),
      Ops.getStatus()
    ]);

    const pendingReview = recipes.filter((recipe) => Ops.recipeNeedsReview(recipe)).length;
    const readyToPublish = recipes.filter((recipe) => !Ops.isRecipePublished(recipe, displayRows) && Ops.recipeReadyToPublish(recipe)).length;
    const nextBookings = upcomingBookings(bookings, 14).length;

    setHero({
      title: 'Workflow Dashboard',
      subtitle: 'Track recipe intake, review pressure, publishing readiness, and the next wave of classroom bookings from one screen.',
      chips: [
        { text: status.ok === false ? 'Status unknown' : 'API reachable', tone: status.ok === false ? 'warning' : 'success' },
        { text: `${recipes.length} recipes in system` },
        { text: `${uploads.length} uploads logged` }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Pending Review', value: String(pendingReview), copy: 'Recipes missing extraction or setup details.' },
      { label: 'Ready To Publish', value: String(readyToPublish), copy: 'Unpublished recipes with core extraction fields present.' },
      { label: 'Published Recipes', value: String(displayRows.length), copy: 'Recipes already in the display table.' },
      { label: 'Bookings Soon', value: String(nextBookings), copy: 'Bookings scheduled in the next 14 days.' }
    ]);

    setSections(
      `
        <div class="ops-grid">
          <section class="ops-card">
            <h2>Review Pressure</h2>
            <p class="ops-card-note">Recipes that still need cleanup or extraction acceptance.</p>
            <div id="dashboardReviewTable"></div>
          </section>
          <section class="ops-card">
            <h2>Upcoming Classes</h2>
            <p class="ops-card-note">Upcoming bookings that are likely to need recipe and shopping checks.</p>
            <div id="dashboardBookingTable"></div>
          </section>
        </div>
      `,
      `
        <section class="ops-card">
          <h2>Recent Uploads</h2>
          <p class="ops-card-note">Latest PDF and URL imports arriving into the workflow.</p>
          <div id="dashboardUploadTable"></div>
        </section>
        <section class="ops-card">
          <h2>Jump Points</h2>
          <ul class="ops-list">
            <li><a href="ops_review_queue.html">Open review queue</a></li>
            <li><a href="ops_publish_queue.html">Open publish queue</a></li>
            <li><a href="ops_import_history.html">Open import history</a></li>
            <li><a href="ops_shopping_readiness.html">Open shopping readiness</a></li>
          </ul>
        </section>
      `
    );

    renderDashboardTables(recipes, displayRows, uploads, bookings);
  }

  async function renderReviewQueue() {
    const recipes = recentFirst((await Ops.getRecipes()).filter((recipe) => Ops.recipeNeedsReview(recipe)), 'updated_at');
    const missingServing = recipes.filter((recipe) => !recipe.serving_size).length;
    const missingIngredients = recipes.filter((recipe) => !recipe.extracted_ingredients && !recipe.ingredients_display).length;
    const missingInstructions = recipes.filter((recipe) => !recipe.extracted_instructions && !recipe.instructions_display).length;

    setHero({
      title: 'Review Queue',
      subtitle: 'Focus the recipe cleanup workload by surfacing missing extraction fields and incomplete setup records.',
      chips: [
        { text: `${recipes.length} recipes need attention`, tone: recipes.length ? 'warning' : 'success' },
        { text: 'Teacher workflow safe' }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Queue Size', value: String(recipes.length), copy: 'Recipes currently blocked from a clean publish path.' },
      { label: 'Missing Serving Size', value: String(missingServing), copy: 'Recipes that still need serving extraction or correction.' },
      { label: 'Missing Ingredients', value: String(missingIngredients), copy: 'Recipes with no extracted or display ingredients.' },
      { label: 'Missing Instructions', value: String(missingInstructions), copy: 'Recipes with no extracted or display instructions.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Recipes Requiring Review</h2>
          <p class="ops-card-note">Use this to work top-down through incomplete recipes before publishing.</p>
          <div id="reviewQueueTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Review Rule</h2>
          <p class="ops-card-note">A recipe is flagged here if it is missing a name, source URL, serving size, ingredients, or instructions.</p>
        </section>
      `
    );

    Ops.renderTable(
      'reviewQueueTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Issues', render: (recipe) => escape(formatMissing(recipe).join(', ')) },
        { label: 'Serving', render: (recipe) => escape(recipe.serving_size || 'Missing') },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      recipes,
      'No recipes are currently waiting for review.'
    );
  }

  async function renderJobStatus() {
    const [status, recipes, uploads, displayRows] = await Promise.all([
      Ops.getStatus(),
      Ops.getRecipes(),
      Ops.getUploads(),
      Ops.getPublishedRecipes()
    ]);

    const recentRecipes = recentFirst(recipes, 'updated_at').slice(0, 10);
    const recentUploads = recentFirst(uploads, 'upload_date').slice(0, 10);
    const pendingPublish = recipes.filter((recipe) => !Ops.isRecipePublished(recipe, displayRows) && Ops.recipeReadyToPublish(recipe)).length;

    setHero({
      title: 'Job Status',
      subtitle: 'A lightweight operations view for service availability and the latest workflow movement across recipes and imports.',
      chips: [
        { text: status.ok === false ? 'Service status unknown' : 'Service responding', tone: status.ok === false ? 'warning' : 'success' },
        { text: `${pendingPublish} publish-ready recipes` }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'API Status', value: status.ok === false ? 'Check' : 'Healthy', copy: escape(status.status || 'Status endpoint responded.') },
      { label: 'Recent Recipe Updates', value: String(recentRecipes.length), copy: 'Latest recipe records touched in the system.' },
      { label: 'Recent Uploads', value: String(recentUploads.length), copy: 'Latest uploads entering the pipeline.' },
      { label: 'Pending Publish', value: String(pendingPublish), copy: 'Recipes that appear ready but not yet published.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Recent Recipe Activity</h2>
          <div id="jobRecipeTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Recent Import Activity</h2>
          <div id="jobUploadTable"></div>
        </section>
        <section class="ops-card">
          <h2>Operational Note</h2>
          <p class="ops-card-note">This page shows live signals from the existing APIs. If counts look stale after backend code changes, restart the Node server before assuming the fix failed.</p>
        </section>
      `
    );

    Ops.renderTable(
      'jobRecipeTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Review State', render: (recipe) => Ops.recipeNeedsReview(recipe) ? Ops.tag('Needs review', 'warning') : Ops.tag('Ready', 'success') },
        { label: 'Published', render: (recipe) => Ops.isRecipePublished(recipe, displayRows) ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      recentRecipes,
      'No recent recipe activity found.'
    );

    Ops.renderTable(
      'jobUploadTable',
      [
        { label: 'Upload', render: (upload) => escape(upload.recipe_title || `Upload ${upload.id}`) },
        { label: 'Type', render: (upload) => escape(upload.upload_type || 'Unknown') },
        { label: 'Source', render: (upload) => escape(Ops.shortText(upload.source_url || 'No source saved', 52)) },
        { label: 'When', render: (upload) => escape(Ops.formatDateTime(upload.upload_date)) }
      ],
      recentUploads,
      'No upload activity found.'
    );
  }

  async function renderImportHistory() {
    const uploads = recentFirst(await Ops.getUploads(), 'upload_date');
    const byType = uploads.reduce((acc, upload) => {
      const key = upload.upload_type || 'Unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    setHero({
      title: 'Import History',
      subtitle: 'Review every upload entering the system, including upload type, source trail, and operator details.',
      chips: [
        { text: `${uploads.length} total uploads` },
        { text: `${Object.keys(byType).length} import types` }
      ]
    });

    Ops.renderStats('opsSummary', Object.entries(byType).slice(0, 4).map(([label, value]) => ({
      label,
      value: String(value),
      copy: 'Uploads recorded for this import type.'
    })));

    setSections(
      `
        <section class="ops-card">
          <h2>Upload Log</h2>
          <div id="importHistoryTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Use This For</h2>
          <ul class="ops-list">
            <li>Tracing duplicate imports</li>
            <li>Checking who loaded a recipe</li>
            <li>Confirming whether a URL or PDF ever entered the system</li>
          </ul>
        </section>
      `
    );

    Ops.renderTable(
      'importHistoryTable',
      [
        { label: 'When', render: (upload) => escape(Ops.formatDateTime(upload.upload_date)) },
        { label: 'Recipe Title', render: (upload) => escape(upload.recipe_title || 'Untitled upload') },
        { label: 'Type', render: (upload) => escape(upload.upload_type || 'Unknown') },
        { label: 'Uploaded By', render: (upload) => escape(upload.uploaded_by || 'Unknown') },
        { label: 'Source', render: (upload) => escape(Ops.shortText(upload.source_url || 'No source saved', 70)) },
        { label: 'Actions', render: () => actionRow([actionLink('quick_add.html', 'Open Intake')]) }
      ],
      uploads,
      'No uploads found.'
    );
  }

  async function renderPublishQueue() {
    const [recipes, displayRows] = await Promise.all([Ops.getRecipes(), Ops.getPublishedRecipes()]);
    const unpublished = recipes.filter((recipe) => !Ops.isRecipePublished(recipe, displayRows));
    const ready = unpublished.filter((recipe) => Ops.recipeReadyToPublish(recipe));
    const blocked = unpublished.filter((recipe) => !Ops.recipeReadyToPublish(recipe));

    setHero({
      title: 'Publish Review Queue',
      subtitle: 'Separate the recipes that can be published now from the ones still blocked by missing extraction or setup work.',
      chips: [
        { text: `${ready.length} ready now`, tone: ready.length ? 'success' : '' },
        { text: `${blocked.length} blocked`, tone: blocked.length ? 'warning' : 'success' }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Ready To Publish', value: String(ready.length), copy: 'Unpublished recipes with name, url, serving size, ingredients, and instructions.' },
      { label: 'Blocked', value: String(blocked.length), copy: 'Unpublished recipes still missing a required field.' },
      { label: 'Already Published', value: String(displayRows.length), copy: 'Recipes already visible in the display table.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Ready Now</h2>
          <div id="publishReadyTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Blocked Before Publish</h2>
          <div id="publishBlockedTable"></div>
        </section>
      `
    );

    Ops.renderTable(
      'publishReadyTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Serving Size', render: (recipe) => escape(recipe.serving_size || 'Missing') },
        { label: 'Source', render: (recipe) => escape(Ops.shortText(recipe.url || 'No source URL', 56)) },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      recentFirst(ready, 'updated_at'),
      'No publish-ready recipes right now.'
    );

    Ops.renderTable(
      'publishBlockedTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Missing', render: (recipe) => escape(formatMissing(recipe).join(', ')) },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      recentFirst(blocked, 'updated_at'),
      'No blocked unpublished recipes found.'
    );
  }

  async function renderMyWork() {
    const [staff, bookings, uploads, classes] = await Promise.all([
      Ops.getStaff(),
      Ops.getBookings(),
      Ops.getUploads(),
      Ops.getClasses()
    ]);

    const requestedStaffId = queryParam('user');
    const storedStaff = readStoredStaffContext();
    const selectedStaff =
      staff.find((row) => String(row.id) === String(requestedStaffId)) ||
      staff.find((row) => String(row.id) === String(storedStaff?.id || '')) ||
      staff.find((row) => String(row.code || '').trim().toLowerCase() === String(storedStaff?.code || '').trim().toLowerCase()) ||
      staff.find((row) => String(row.email_school || '').trim().toLowerCase() === String(storedStaff?.email_school || '').trim().toLowerCase()) ||
      staff[0] ||
      null;
    const staffOptions = staff.map((row) => {
      const label = `${row.last_name || ''}, ${row.first_name || ''}`.replace(/^,\s*/, '').trim() || row.email_school || `Staff ${row.id}`;
      const selected = selectedStaff && String(row.id) === String(selectedStaff.id) ? ' selected' : '';
      return `<option value="${escape(row.id)}"${selected}>${escape(label)}</option>`;
    }).join('');

    const teacherName = selectedStaff ? `${selectedStaff.first_name || ''} ${selectedStaff.last_name || ''}`.trim() : '';
    const personalBookings = bookings.filter((booking) => String(booking.staff_id) === String(selectedStaff?.id) || String(booking.staff_name || '').trim().toLowerCase() === teacherName.toLowerCase());
    const personalUploads = uploads.filter((upload) => {
      const by = String(upload.uploaded_by || '').toLowerCase();
      return by.includes(String(selectedStaff?.email_school || '').toLowerCase()) || by.includes(teacherName.toLowerCase());
    });
    const teacherClasses = classes.filter((row) => String(row.teacher_in_charge || '').trim().toLowerCase() === String(selectedStaff?.code || '').trim().toLowerCase());

    setHero({
      title: 'My Recipes And Classes',
      subtitle: 'A staff-focused planning view for class bookings, class lists, and likely recipe activity while Google sign-in is still being prepared.',
      chips: [
        { text: selectedStaff ? `Viewing ${teacherName || selectedStaff.email_school || 'staff member'}` : 'No staff loaded' },
        { text: storedStaff ? 'Navbar user context detected' : 'Query-string ready for future login handoff' }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Bookings', value: String(personalBookings.length), copy: 'Bookings linked to the selected teacher.' },
      { label: 'Classes', value: String(teacherClasses.length), copy: 'Current class_upload rows tied to the teacher code.' },
      { label: 'Uploads', value: String(personalUploads.length), copy: 'Uploads that appear to belong to this teacher.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Teacher Filter</h2>
          <div class="ops-toolbar">
            <label for="opsStaffSelect">Staff member</label>
            <select id="opsStaffSelect" class="ops-select">${staffOptions}</select>
          </div>
        </section>
        <section class="ops-card">
          <h2>Booked Classes</h2>
          <div id="myWorkBookingsTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Current Classes</h2>
          <div id="myWorkClassesTable"></div>
        </section>
        <section class="ops-card">
          <h2>Likely Recipe Uploads</h2>
          <div id="myWorkUploadsTable"></div>
        </section>
      `
    );

    const selector = byId('opsStaffSelect');
    if (selector) {
      selector.addEventListener('change', () => {
        setQueryParam('user', selector.value);
        renderCurrentPage();
      });
    }

    Ops.renderTable(
      'myWorkBookingsTable',
      [
        { label: 'Date', render: (booking) => escape(Ops.formatDate(booking.booking_date)) },
        { label: 'Class', render: (booking) => escape(booking.class_name || 'Not set') },
        { label: 'Period', render: (booking) => escape(booking.period || 'Not set') },
        { label: 'Recipe', render: (booking) => escape(booking.recipe || 'Not linked') },
        { label: 'Actions', render: (booking) => booking.recipe_id ? recipeActions({ id: booking.recipe_id, name: booking.recipe }) : '' }
      ],
      recentFirst(personalBookings, 'booking_date'),
      'No bookings found for this staff member.'
    );

    Ops.renderTable(
      'myWorkClassesTable',
      [
        { label: 'Class', render: (row) => escape(row.name || 'Not set') },
        { label: 'Level', render: (row) => escape(row.level || 'Not set') },
        { label: 'Department', render: (row) => escape(row.department || 'Not set') },
        { label: 'Code', render: (row) => escape(row.ttcode || 'Not set') }
      ],
      teacherClasses,
      'No classes linked to this teacher code.'
    );

    Ops.renderTable(
      'myWorkUploadsTable',
      [
        { label: 'Upload', render: (upload) => escape(upload.recipe_title || `Upload ${upload.id}`) },
        { label: 'Type', render: (upload) => escape(upload.upload_type || 'Unknown') },
        { label: 'Date', render: (upload) => escape(Ops.formatDateTime(upload.upload_date)) },
        { label: 'Actions', render: () => actionRow([actionLink('quick_add.html', 'Open Intake')]) }
      ],
      personalUploads,
      'No likely uploads found for this staff member.'
    );
  }

  async function renderExceptions() {
    const [recipes, bookings, uploads] = await Promise.all([Ops.getRecipes(), Ops.getBookings(), Ops.getUploads()]);
    const recipeExceptions = recipes.filter((recipe) => formatMissing(recipe).length > 0);
    const bookingExceptions = bookings.filter((booking) => !booking.recipe || !booking.recipe_id || !booking.class_size);
    const uploadExceptions = uploads.filter((upload) => !upload.recipe_title || !upload.source_url);

    setHero({
      title: 'Quick Exceptions',
      subtitle: 'Surface records most likely to block a teacher workflow or create avoidable follow-up work later.',
      chips: [
        { text: `${recipeExceptions.length} recipe exceptions`, tone: recipeExceptions.length ? 'warning' : 'success' },
        { text: `${bookingExceptions.length} booking exceptions`, tone: bookingExceptions.length ? 'warning' : 'success' }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Recipe Exceptions', value: String(recipeExceptions.length), copy: 'Recipes missing required intake or extraction fields.' },
      { label: 'Booking Exceptions', value: String(bookingExceptions.length), copy: 'Bookings missing recipe links or class sizing.' },
      { label: 'Upload Exceptions', value: String(uploadExceptions.length), copy: 'Uploads missing a source trail or recipe title.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Recipe Exceptions</h2>
          <div id="exceptionsRecipeTable"></div>
        </section>
        <section class="ops-card">
          <h2>Booking Exceptions</h2>
          <div id="exceptionsBookingTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Upload Exceptions</h2>
          <div id="exceptionsUploadTable"></div>
        </section>
      `
    );

    Ops.renderTable(
      'exceptionsRecipeTable',
      [
        { label: 'Recipe', render: (recipe) => recipeAnchor(recipe) },
        { label: 'Missing', render: (recipe) => escape(formatMissing(recipe).join(', ')) },
        { label: 'Updated', render: (recipe) => escape(Ops.formatDateTime(recipe.updated_at)) },
        { label: 'Actions', render: (recipe) => recipeActions(recipe) }
      ],
      recentFirst(recipeExceptions, 'updated_at'),
      'No recipe exceptions found.'
    );

    Ops.renderTable(
      'exceptionsBookingTable',
      [
        { label: 'Date', render: (booking) => escape(Ops.formatDate(booking.booking_date)) },
        { label: 'Teacher', render: (booking) => escape(booking.staff_name || 'Not set') },
        { label: 'Class', render: (booking) => escape(booking.class_name || 'Not set') },
        { label: 'Missing', render: (booking) => escape([
          !booking.recipe ? 'recipe name' : '',
          !booking.recipe_id ? 'recipe id' : '',
          !booking.class_size ? 'class size' : ''
        ].filter(Boolean).join(', ')) },
        { label: 'Actions', render: (booking) => booking.recipe_id ? recipeActions({ id: booking.recipe_id, name: booking.recipe }) : actionRow([actionLink('book_a_class.html', 'Open Booking')]) }
      ],
      bookingExceptions,
      'No booking exceptions found.'
    );

    Ops.renderTable(
      'exceptionsUploadTable',
      [
        { label: 'Upload', render: (upload) => escape(upload.recipe_title || `Upload ${upload.id}`) },
        { label: 'Missing', render: (upload) => escape([
          !upload.recipe_title ? 'recipe title' : '',
          !upload.source_url ? 'source url' : ''
        ].filter(Boolean).join(', ')) },
        { label: 'When', render: (upload) => escape(Ops.formatDateTime(upload.upload_date)) }
      ],
      uploadExceptions,
      'No upload exceptions found.'
    );
  }

  async function renderRecipeCompare() {
    const [recipes, published] = await Promise.all([Ops.getRecipes(), Ops.getPublishedRecipes()]);
    const selectedId = queryParam('recipeId') || (recipes[0] && recipes[0].id);
    const recipe = recipes.find((row) => String(row.id) === String(selectedId)) || recipes[0] || null;
    const publishRow = published.find((row) => Number(row.recipeid) === Number(recipe?.id));
    const options = recipes.slice(0, 400).map((row) => {
      const selected = recipe && String(row.id) === String(recipe.id) ? ' selected' : '';
      return `<option value="${escape(row.id)}"${selected}>${escape(row.name || `Recipe ${row.id}`)}</option>`;
    }).join('');

    setHero({
      title: 'Recipe Compare',
      subtitle: 'Compare extracted fields, cleaned display fields, and published display-table values for a single recipe.',
      chips: recipe ? [
        { text: `Recipe ${recipe.id}` },
        { text: publishRow ? 'Published entry found' : 'Not in display table', tone: publishRow ? 'success' : 'warning' }
      ] : [{ text: 'No recipes available', tone: 'warning' }]
    });

    Ops.renderStats('opsSummary', recipe ? [
      { label: 'Extracted Ingredients', value: String(Ops.parseListItems(recipe.extracted_ingredients).length), copy: 'Rows found in extracted ingredients.' },
      { label: 'Display Ingredients', value: String(Ops.parseListItems(recipe.ingredients_display).length), copy: 'Rows found in cleaned ingredients display.' },
      { label: 'Display Instructions', value: String(Ops.parseListItems(recipe.instructions_display).length), copy: 'Rows found in cleaned instructions display.' }
    ] : []);

    setSections(
      `
        <section class="ops-card">
          <h2>Select Recipe</h2>
          <div class="ops-toolbar">
            <label for="opsRecipeSelect">Recipe</label>
            <select id="opsRecipeSelect" class="ops-select">${options}</select>
          </div>
        </section>
        <section class="ops-card">
          <h2>Ingredients</h2>
          <div class="ops-grid two-column">
            <div class="ops-card"><h3>Extracted</h3><div id="compareExtractedIngredients"></div></div>
            <div class="ops-card"><h3>Display</h3><div id="compareDisplayIngredients"></div></div>
          </div>
        </section>
      `,
      `
        <section class="ops-card"><h2>Instructions Display</h2><div id="compareDisplayInstructions"></div></section>
        <section class="ops-card"><h2>Published Snapshot</h2><div id="comparePublishedSnapshot"></div></section>
      `
    );

    const selector = byId('opsRecipeSelect');
    if (selector) {
      selector.addEventListener('change', () => {
        setQueryParam('recipeId', selector.value);
        renderCurrentPage();
      });
    }

    byId('compareExtractedIngredients').innerHTML = listMarkup(Ops.parseListItems(recipe?.extracted_ingredients));
    byId('compareDisplayIngredients').innerHTML = listMarkup(Ops.parseListItems(recipe?.ingredients_display));
    byId('compareDisplayInstructions').innerHTML = listMarkup(Ops.parseListItems(recipe?.instructions_display));
    byId('comparePublishedSnapshot').innerHTML = publishRow ? `
      <div class="ops-kv">
        <div class="ops-kv-label">Recipe ID</div><div>${escape(publishRow.recipeid)}</div>
        <div class="ops-kv-label">Name</div><div>${escape(publishRow.name || 'Not set')}</div>
        <div class="ops-kv-label">Ingredients Display</div><div>${listMarkup(Ops.parseListItems(publishRow.ingredients_display))}</div>
        <div class="ops-kv-label">Instructions Display</div><div>${listMarkup(Ops.parseListItems(publishRow.instructions_display))}</div>
      </div>
    ` : '<div class="ops-empty">No display-table row found for this recipe yet.</div>';
  }

  async function renderShoppingReadiness() {
    const [bookings, recipes, published, inventory] = await Promise.all([
      Ops.getBookings(),
      Ops.getRecipes(),
      Ops.getPublishedRecipes(),
      Ops.getInventory()
    ]);

    const recipeById = new Map(recipes.map((recipe) => [Number(recipe.id), recipe]));
    const soon = upcomingBookings(bookings, 30).map((booking) => {
      const recipe = recipeById.get(Number(booking.recipe_id));
      const isPublished = recipe ? Ops.isRecipePublished(recipe, published) : false;
      const hasDisplayIngredients = !!String(recipe?.ingredients_display || '').trim();
      return {
        ...booking,
        readiness: isPublished && hasDisplayIngredients ? 'Ready' : 'Check',
        recipe
      };
    });

    setHero({
      title: 'Shopping Readiness',
      subtitle: 'Review the next month of booked classes against recipe readiness and current ingredient inventory coverage.',
      chips: [
        { text: `${soon.length} bookings in 30 days` },
        { text: `${inventory.length} inventory rows loaded` }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Bookings Ready', value: String(soon.filter((row) => row.readiness === 'Ready').length), copy: 'Bookings with a published recipe and cleaned ingredient display.' },
      { label: 'Bookings To Check', value: String(soon.filter((row) => row.readiness !== 'Ready').length), copy: 'Bookings that still need recipe review before shopping.' },
      { label: 'Inventory Rows', value: String(inventory.length), copy: 'Rows currently present in ingredient inventory.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Upcoming Booking Readiness</h2>
          <div id="shoppingReadinessTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Readiness Rule</h2>
          <p class="ops-card-note">A booking is marked ready when its linked recipe exists, is published, and has a cleaned ingredients display ready for shopping calculations.</p>
        </section>
      `
    );

    Ops.renderTable(
      'shoppingReadinessTable',
      [
        { label: 'Date', render: (booking) => escape(Ops.formatDate(booking.booking_date)) },
        { label: 'Class', render: (booking) => escape(booking.class_name || 'Not set') },
        { label: 'Teacher', render: (booking) => escape(booking.staff_name || 'Not set') },
        { label: 'Recipe', render: (booking) => booking.recipe ? escape(booking.recipe) : Ops.tag('Missing recipe', 'danger') },
        { label: 'Readiness', render: (booking) => booking.readiness === 'Ready' ? Ops.tag('Ready', 'success') : Ops.tag('Check', 'warning') },
        { label: 'Actions', render: (booking) => booking.recipe_id ? recipeActions({ id: booking.recipe_id, name: booking.recipe }) : actionRow([actionLink('quick_add.html', 'Quick Add'), actionLink('book_a_class.html', 'Open Booking')]) }
      ],
      soon,
      'No upcoming bookings found in the next 30 days.'
    );
  }

  async function renderAccountSettings() {
    const [permissions, assignments, staff] = await Promise.all([
      Ops.getPermissions(),
      Ops.getUserRoleAssignments(),
      Ops.getStaff()
    ]);

    setHero({
      title: 'Auth And Account Settings',
      subtitle: 'Review role permissions, existing additional role assignments, and current staff footprint ahead of Google Login rollout.',
      chips: [
        { text: `${staff.length} staff records` },
        { text: `${assignments.length} users with extra roles` }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Role Types', value: String((permissions.roles || []).length), copy: 'Permission profiles currently defined in the database.' },
      { label: 'Assigned Users', value: String(assignments.length), copy: 'Users with explicit additional roles saved.' },
      { label: 'Staff Records', value: String(staff.length), copy: 'Potential user accounts available for future sign-in linking.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Role Permissions</h2>
          <div id="accountPermissionsTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Assigned Additional Roles</h2>
          <div id="accountAssignmentsTable"></div>
        </section>
        <section class="ops-card">
          <h2>Google Login Readiness</h2>
          <ul class="ops-list">
            <li>User profile page exists and can accept a staff-linked user query.</li>
            <li>Staff emails are already present and can become Google identity anchors.</li>
            <li>Role permissions and extra roles are already stored separately, which makes future auth mapping cleaner.</li>
          </ul>
        </section>
      `
    );

    Ops.renderTable(
      'accountPermissionsTable',
      [
        { label: 'Role', render: (role) => escape(role.role_name || 'Unknown') },
        { label: 'Recipes', render: (role) => role.recipes ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Add Recipes', render: (role) => role.add_recipes ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Inventory', render: (role) => role.inventory ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Shopping', render: (role) => role.shopping ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Booking', render: (role) => role.booking ? Ops.tag('Yes', 'success') : Ops.tag('No') },
        { label: 'Admin', render: (role) => role.admin ? Ops.tag('Yes', 'success') : Ops.tag('No') }
      ],
      permissions.roles || [],
      'No role permissions found.'
    );

    Ops.renderTable(
      'accountAssignmentsTable',
      [
        { label: 'User', render: (user) => {
            // Mask email/ID for privacy
            let label = user.user_label || user.user_identifier || 'Unknown';
            if (label && label.includes('@')) {
              const [name, domain] = label.split('@');
              label = name.slice(0,2) + '***@' + domain;
            } else if (/\d{4,}/.test(label)) {
              label = label.slice(0,2) + '***' + label.slice(-2);
            }
            return escape(label);
          }
        },
        { label: 'Type', render: (user) => escape(user.user_type || 'Unknown') },
        { label: 'Roles', render: (user) => escape((user.roles || []).join(', ') || 'None') }
      ],
      assignments,
      'No additional role assignments found.'
    );
  }

  async function renderDuplicateDetection() {
    const [recipes, uploads] = await Promise.all([Ops.getRecipes(), Ops.getUploads()]);

    function groupDuplicates(rows, keyFn) {
      const map = new Map();
      rows.forEach((row) => {
        const key = keyFn(row);
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
      });
      return Array.from(map.entries()).filter(([, matches]) => matches.length > 1).map(([key, matches]) => ({ key, matches }));
    }

    const nameDuplicates = groupDuplicates(recipes, (recipe) => String(recipe.name || '').trim().toLowerCase());
    const urlDuplicates = groupDuplicates(recipes, (recipe) => String(recipe.url || '').trim().toLowerCase());
    const uploadDuplicates = groupDuplicates(uploads, (upload) => String(upload.recipe_title || '').trim().toLowerCase());

    setHero({
      title: 'Duplicate Detection',
      subtitle: 'Find likely duplicate recipes and imports before they confuse publishing, shopping, or class planning.',
      chips: [
        { text: `${nameDuplicates.length} duplicate names`, tone: nameDuplicates.length ? 'warning' : 'success' },
        { text: `${urlDuplicates.length} duplicate urls`, tone: urlDuplicates.length ? 'warning' : 'success' }
      ]
    });

    Ops.renderStats('opsSummary', [
      { label: 'Recipe Name Duplicates', value: String(nameDuplicates.length), copy: 'Groups where multiple recipes share the same name.' },
      { label: 'Recipe URL Duplicates', value: String(urlDuplicates.length), copy: 'Groups where multiple recipes share the same source URL.' },
      { label: 'Upload Title Duplicates', value: String(uploadDuplicates.length), copy: 'Upload groups with the same recorded recipe title.' }
    ]);

    setSections(
      `
        <section class="ops-card">
          <h2>Duplicate Recipe Names</h2>
          <div id="duplicatesNameTable"></div>
        </section>
        <section class="ops-card">
          <h2>Duplicate Recipe URLs</h2>
          <div id="duplicatesUrlTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Duplicate Upload Titles</h2>
          <div id="duplicatesUploadTable"></div>
        </section>
      `
    );

    const duplicateColumns = [
      { label: 'Shared Key', render: (group) => escape(group.key || 'Unknown') },
      { label: 'Count', render: (group) => escape(group.matches.length) },
      { label: 'Matches', render: (group) => escape(group.matches.map((match) => match.name || match.recipe_title || `#${match.id}`).join(' | ')) }
    ];

    Ops.renderTable('duplicatesNameTable', duplicateColumns, nameDuplicates, 'No duplicate recipe names found.');
    Ops.renderTable('duplicatesUrlTable', duplicateColumns, urlDuplicates, 'No duplicate recipe URLs found.');
    Ops.renderTable('duplicatesUploadTable', duplicateColumns, uploadDuplicates, 'No duplicate upload titles found.');
  }

  async function renderDataHealth() {
    const [recipes, uploads, bookings, staff, students, departments] = await Promise.all([
      Ops.getRecipes(),
      Ops.getUploads(),
      Ops.getBookings(),
      Ops.getStaff(),
      Ops.getStudents(),
      Ops.getDepartments()
    ]);

    const datasetRows = [
      {
        area: 'Recipes',
        total: recipes.length,
        issueCount: recipes.filter((recipe) => formatMissing(recipe).length > 0).length,
        note: 'Missing intake or extraction fields.'
      },
      {
        area: 'Uploads',
        total: uploads.length,
        issueCount: uploads.filter((upload) => !upload.recipe_title || !upload.source_url).length,
        note: 'Missing recipe title or source trail.'
      },
      {
        area: 'Bookings',
        total: bookings.length,
        issueCount: bookings.filter((booking) => !booking.recipe_id || !booking.class_size).length,
        note: 'Missing recipe link or class size.'
      },
      {
        area: 'Staff',
        total: staff.length,
        issueCount: staff.filter((row) => !row.email_school).length,
        note: 'Missing school email for future login linking.'
      },
      {
        area: 'Students',
        total: students.length,
        issueCount: students.filter((row) => !row.id_number || !row.student_name).length,
        note: 'Missing student identity fields.'
      },
      {
        area: 'Departments',
        total: departments.length,
        issueCount: departments.filter((row) => !row.department).length,
        note: 'Missing department mapping.'
      }
    ];

    setHero({
      title: 'Data Health',
      subtitle: 'A cross-system health check for recipe, upload, booking, staff, student, and department datasets.',
      chips: [
        { text: `${datasetRows.reduce((sum, row) => sum + row.issueCount, 0)} total flagged rows`, tone: datasetRows.some((row) => row.issueCount > 0) ? 'warning' : 'success' }
      ]
    });

    Ops.renderStats('opsSummary', datasetRows.map((row) => ({
      label: row.area,
      value: String(row.issueCount),
      copy: row.note
    })));

    setSections(
      `
        <section class="ops-card">
          <h2>Dataset Summary</h2>
          <div id="dataHealthTable"></div>
        </section>
      `,
      `
        <section class="ops-card">
          <h2>Interpretation</h2>
          <p class="ops-card-note">This page is designed to show where operational data quality will hurt workflow speed first. It is not a replacement for deeper audits, but it gives you a high-signal starting point.</p>
        </section>
      `
    );

    Ops.renderTable(
      'dataHealthTable',
      [
        { label: 'Dataset', render: (row) => escape(row.area) },
        { label: 'Total Rows', render: (row) => escape(row.total) },
        { label: 'Flagged Rows', render: (row) => row.issueCount ? Ops.tag(String(row.issueCount), 'warning') : Ops.tag('0', 'success') },
        { label: 'Check', render: (row) => escape(row.note) }
      ],
      datasetRows,
      'No dataset summary available.'
    );
  }

  function listMarkup(items) {
    if (!items || items.length === 0) return '<div class="ops-empty">No data available.</div>';
    return `<ul class="ops-list">${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`;
  }

  const pages = {
    dashboard: renderDashboard,
    review_queue: renderReviewQueue,
    job_status: renderJobStatus,
    import_history: renderImportHistory,
    publish_queue: renderPublishQueue,
    my_work: renderMyWork,
    exceptions: renderExceptions,
    recipe_compare: renderRecipeCompare,
    shopping_readiness: renderShoppingReadiness,
    account_settings: renderAccountSettings,
    duplicate_detection: renderDuplicateDetection,
    data_health: renderDataHealth
  };

  async function renderCurrentPage() {
    const pageKey = document.body.dataset.opsPage;
    const render = pages[pageKey];
    if (!render) {
      renderError(`Unknown operations page: ${pageKey || 'missing key'}`);
      return;
    }

    byId('opsPrimary').innerHTML = '<div class="ops-banner"><strong>Loading page data.</strong> Pulling current data from the available APIs.</div>';
    byId('opsSecondary').innerHTML = '';

    // Fetch status and store for setHero
    let status = null;
    try {
      status = await Ops.getStatus();
    } catch (e) {
      status = { ok: null, status: 'error' };
    }
    // Patch setHero to always include status
    const origSetHero = setHero;
    window.setHero = (opts) => origSetHero({ ...opts, status });

    try {
      await render();
    } catch (err) {
      renderError(err && err.message ? err.message : 'Failed to load operations page data.');
    }
    // Restore setHero
    window.setHero = origSetHero;
  }

  return { renderCurrentPage };
})();

window.addEventListener('DOMContentLoaded', () => {
  OpsPages.renderCurrentPage && bindQuickActionsSafely();
  OpsPages.renderCurrentPage();
});

function bindQuickActionsSafely() {
  try {
    const eventFlag = '__opsQuickActionsBound';
    if (window[eventFlag]) return;
    window[eventFlag] = true;
    document.addEventListener('click', (event) => {
      const link = event.target.closest('.ops-action-link[data-recipe-id]');
      if (!link) return;
      try {
        sessionStorage.setItem('selectedRecipeId', String(link.getAttribute('data-recipe-id') || ''));
      } catch (_) {
        // Ignore storage errors.
      }
    });
  } catch (_) {
    // Ignore setup errors and allow page rendering to continue.
  }
}