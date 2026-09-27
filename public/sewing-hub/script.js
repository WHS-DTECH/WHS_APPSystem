// ── Card renderer ────────────────────────────────────────
function buildCard(a) {
  const diffClass = {
    Beginner:     'tag-beginner',
    Intermediate: 'tag-intermediate',
    Advanced:     'tag-advanced',
  }[a.difficulty] || '';
  const isUrlIdea = String(a.activity_category || '').toLowerCase() === 'url idea';

  const hrs = Number(a.duration_hours);
  const durationLabel = hrs === 1 ? '1 hr' : `${hrs} hrs`;
  const fallbackImage = defaultImage(a.name);
  const teacherExtra = buildTeacherExtra(a);
  const ideaUrl = normalizeHttpUrl(a.idea_url);
  const uploadType = getUploadType(a);
  const footerMeta = getCardFooterMeta(a);
  const uploadTypeLabel = footerMeta.label;
  const footerClass = footerMeta.className;

  return `
    <a class="activity-card activity-card-link ${a.color}" href="activity_detail.html?id=${Number(a.id)}"
         data-name="${escHtml(a.name)}"
         data-year="${escHtml(a.year_level)}"
         data-type="${escHtml(a.type)}"
         data-duration="${hrs}">
      <div class="card-header">
        <div class="card-circles"><div class="cc cc1"></div><div class="cc cc2"></div></div>
        <div class="card-header-text">
          <h3>${escHtml(a.name)}</h3>
          <p>${isUrlIdea ? 'URL Idea' : 'Sewing Room Activity'}</p>
        </div>
      </div>
      ${a.outcome_image_url ? `<div class="card-outcome-image"><img src="${escHtml(a.outcome_image_url)}" alt="${escHtml(a.name)} outcome" loading="lazy" onerror="this.onerror=null;this.src='${escHtml(fallbackImage)}'" /></div>` : ''}
      <div class="card-body">
        <div class="tags">
          <span class="tag">${escHtml(a.year_level)}</span>
          <span class="tag">${escHtml(a.type)}</span>
          <span class="tag">${escHtml(a.activity_category || 'Practice')}</span>
          ${a.canViewTeacherCard ? '<span class="tag tag-teacher-view">Teacher View</span>' : ''}
          <span class="tag">${durationLabel}</span>
          <span class="tag ${diffClass}">${escHtml(a.difficulty)}</span>
        </div>
        <h4>${escHtml(a.name)}</h4>
        <p>${escHtml(a.description || '')}</p>
        ${ideaUrl ? '<p class="card-url-note">Open URL Idea on detail page</p>' : ''}
        ${teacherExtra}
      </div>
      <div class="${footerClass}">${uploadTypeLabel}</div>
    </a>`;
}

function getUploadType(a) {
  const isUrlIdea = String(a?.activity_category || '').toLowerCase() === 'url idea';
  return isUrlIdea ? 'url-idea' : 'activity';
}

function getCardFooterMeta(a) {
  const category = String(a?.activity_category || '').toLowerCase();
  if (category === 'url idea') {
    return {
      label: 'URL Idea',
      className: 'card-footer-upload card-footer-upload-url-idea',
    };
  }

  if (category === 'assessment') {
    return {
      label: 'Assessment Task',
      className: 'card-footer-upload card-footer-upload-assessment',
    };
  }

  return {
    label: 'Activity',
    className: 'card-footer-upload card-footer-upload-activity',
  };
}

function isRenderableActivity(a) {
  if (!a || typeof a !== 'object') return false;
  if (!String(a.name || '').trim()) return false;
  if (!String(a.year_level || '').trim()) return false;
  if (!String(a.type || '').trim()) return false;
  if (!String(a.difficulty || '').trim()) return false;
  const hrs = Number(a.duration_hours);
  return Number.isFinite(hrs) && hrs > 0;
}

function normalizeHttpUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value;
}

function shortText(text, maxLen = 120) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}...`;
}

function editUrlForActivity(a) {
  const category = String(a?.activity_category || '').toLowerCase();
  if (category === 'assessment') {
    return `/admin_upload_assessment_task.html?id=${Number(a.id)}`;
  }
  if (category === 'url idea') {
    return `/admin_upload_url_idea.html?id=${Number(a.id)}`;
  }
  return `/admin_upload_activity.html?id=${Number(a.id)}`;
}

function buildTeacherExtra(a) {
  if (!a.canViewTeacherCard) return '';

  const classMgmt = shortText(a.class_management_notes, 110);
  const prep = shortText(a.class_preparation, 110);
  const assess = shortText(a.assessment_focus, 110);

  if (!classMgmt && !prep && !assess) return '';

  return `
    <div class="teacher-extra">
      <p class="teacher-extra-title">Teacher Card</p>
      ${classMgmt ? `<p><strong>Class Mgmt:</strong> ${escHtml(classMgmt)}</p>` : ''}
      ${prep ? `<p><strong>Preparation:</strong> ${escHtml(prep)}</p>` : ''}
      ${assess ? `<p><strong>Assessment:</strong> ${escHtml(assess)}</p>` : ''}
      <a class="teacher-edit-link" href="${escHtml(editUrlForActivity(a))}">Edit Activity</a>
    </div>
  `;
}

function defaultImage(name) {
  const label = encodeURIComponent(name || 'Sewing Activity');
  return `https://placehold.co/900x560/e8eef4/23496f?text=${label}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showGridError(grid, msg) {
  grid.innerHTML = `<p style="color:#c0392b;font-size:0.85rem;padding:0.5rem 0">${msg}</p>`;
}

// ── This Week section ─────────────────────────────────────
async function loadThisWeek() {
  const grid = document.getElementById('week-grid');
  if (!grid) return;
  try {
    const res  = await fetch('/api/activities?week=true');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const renderable = data.filter(isRenderableActivity);
    grid.innerHTML = renderable.length
      ? renderable.map(buildCard).join('')
      : '<p style="color:#666;font-size:0.85rem">No activities scheduled this week.</p>';
  } catch {
    showGridError(grid, 'Could not load this week\'s activities.');
  }
}

// ── Library section ───────────────────────────────────────
const searchInput = document.getElementById('search-input');
const filterYear  = document.getElementById('filter-year');
const filterType  = document.getElementById('filter-type');
const filterCategory = document.getElementById('filter-category');
const filterUploadType = document.getElementById('filter-upload-type');
const filterSort  = document.getElementById('filter-sort');
const libGrid     = document.getElementById('library-grid');
const countBadge  = document.querySelector('.library-count');

async function loadLibrary() {
  if (!libGrid) return;
  libGrid.innerHTML = '<p style="color:#888;font-size:0.85rem;padding:0.5rem 0">Loading…</p>';

  try {
    const params = new URLSearchParams();
    const year   = filterYear?.value;
    const type   = filterType?.value;
    const category = filterCategory?.value;
    const uploadType = filterUploadType?.value;
    const sort   = filterSort?.value || 'az';
    if (year) params.set('year', year);
    if (type) params.set('type', type);
    if (category) params.set('category', category);
    params.set('sort', sort);

    const res  = await fetch('/api/activities?' + params.toString());
    if (!res.ok) throw new Error(res.statusText);
    let data = await res.json();

    data = data.filter(isRenderableActivity);

    if (uploadType) {
      data = data.filter((a) => getUploadType(a) === uploadType);
    }

    // Client-side text search (fast, no extra round-trip)
    const q = searchInput?.value.trim().toLowerCase();
    if (q) {
      data = data.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        (a.activity_category || '').toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q)
      );
    }

    libGrid.innerHTML = data.length
      ? data.map(buildCard).join('')
      : '<p style="color:#666;font-size:0.85rem;padding:0.5rem 0">No activities match your filters.</p>';

    if (countBadge) countBadge.textContent = `${data.length} shown`;
  } catch {
    showGridError(libGrid, 'Could not load activities. Please refresh the page.');
  }
}

// ── Event listeners ───────────────────────────────────────
searchInput?.addEventListener('input',  loadLibrary);
filterYear?.addEventListener('change',  loadLibrary);
filterType?.addEventListener('change',  loadLibrary);
filterCategory?.addEventListener('change', loadLibrary);
filterUploadType?.addEventListener('change', loadLibrary);
filterSort?.addEventListener('change',  loadLibrary);

// ── URL Ideas section ─────────────────────────────────────
async function loadUrlIdeas() {
  const grid = document.getElementById('url-ideas-grid');
  if (!grid) return;
  try {
    const res = await fetch('/api/activities?category=url%20idea&sort=az');
    if (!res.ok) throw new Error(res.statusText);
    let data = await res.json();
    data = data.filter(isRenderableActivity);
    grid.innerHTML = data.length
      ? data.map(buildCard).join('')
      : '<p style="color:#666;font-size:0.85rem;padding:0.5rem 0">No URL Ideas available.</p>';
  } catch {
    showGridError(grid, 'Could not load URL Ideas.');
  }
}

// ── Init ──────────────────────────────────────────────────
loadThisWeek();
loadUrlIdeas();
loadLibrary();

