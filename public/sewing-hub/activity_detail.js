const mount = document.getElementById('detail-wrap');

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function combineUniqueLines(...lists) {
  const out = [];
  const seen = new Set();

  lists.forEach((items) => {
    items.forEach((item) => {
      const key = String(item || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(String(item).trim());
    });
  });

  return out;
}

function makeList(items, ordered) {
  if (!items.length) {
    return '<p class="small">Not provided yet.</p>';
  }

  const tag = ordered ? 'ol' : 'ul';
  const klass = ordered ? 'detail-steps' : 'detail-list';
  return `<${tag} class="${klass}">${items.map((x) => `<li>${escHtml(x)}</li>`).join('')}</${tag}>`;
}

function instructionsMarkup(activity) {
  if (activity.canViewInstructions) {
    return makeList(toLines(activity.instructions), true);
  }

  return `
    <div class="detail-lock-note">
      Instructions are available to signed-in users only.
      <a href="/auth/google">Sign in with Google</a> to view the full step-by-step method.
    </div>
  `;
}

function editUrlForActivity(activity) {
  const category = String(activity?.activity_category || '').toLowerCase();
  if (category === 'assessment') {
    return `/admin_upload_assessment_task.html?id=${Number(activity.id)}`;
  }
  if (category === 'url idea') {
    return `/admin_upload_url_idea.html?id=${Number(activity.id)}`;
  }
  return `/admin_upload_activity.html?id=${Number(activity.id)}`;
}

function teacherToolbarMarkup(activity) {
  if (!activity.canViewTeacherCard) return '';
  return `
    <div class="teacher-toolbar" id="teacher-toolbar">
      <span class="teacher-toolbar-label">Teacher View</span>
      <a class="teacher-edit-link" href="${escHtml(editUrlForActivity(activity))}">Edit Activity</a>
      <button class="teacher-toggle-btn" id="student-view-toggle" type="button">Preview as Student</button>
    </div>
  `;
}

function teacherPanelMarkup(activity) {
  if (!activity.canViewTeacherCard) return '';

  const classMgmt = toLines(activity.class_management_notes);
  const prep = toLines(activity.class_preparation);
  const assess = toLines(activity.assessment_focus);
  const hasContent = classMgmt.length || prep.length || assess.length;
  const hrs = Number(activity.duration_hours);
  const durationLabel = hrs === 1 ? '1 hr' : `${hrs} hrs`;

  return `
    <article class="detail-card teacher-only">
      <h2>Teacher Card</h2>
      <p class="small">Class management information (teacher view only).</p>
      <div class="detail-meta" style="margin-bottom:0.75rem;">
        <span class="detail-chip">${escHtml(durationLabel)}</span>
        <span class="detail-chip">${escHtml(activity.difficulty)}</span>
      </div>
      ${classMgmt.length ? `<h3 style="font-size:0.86rem;color:#2e5378;margin:0.45rem 0 0.2rem;">Class Management</h3>${makeList(classMgmt, false)}` : ''}
      ${prep.length ? `<h3 style="font-size:0.86rem;color:#2e5378;margin:0.45rem 0 0.2rem;">Preparation</h3>${makeList(prep, false)}` : ''}
      ${assess.length ? `<h3 style="font-size:0.86rem;color:#2e5378;margin:0.45rem 0 0.2rem;">Assessment Focus</h3>${makeList(assess, false)}` : ''}
      ${!hasContent ? '<p class="small" style="color:#666;">No teacher notes yet.</p>' : ''}
    </article>
  `;
}

function defaultImage(name) {
  const label = encodeURIComponent(name || 'Sewing Activity');
  return `https://placehold.co/900x560/e8eef4/23496f?text=${label}`;
}

function normalizeHttpUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value;
}

function extractSupportingImageUrls(descriptionText) {
  const raw = String(descriptionText || '');
  if (!raw) return [];

  const match = raw.match(/Supporting Images:\n([\s\S]*)/i);
  if (!match || !match[1]) return [];

  return match[1]
    .split(/\r?\n/)
    .map((line) => normalizeHttpUrl(line))
    .filter(Boolean);
}

async function loadActivity() {
  if (!mount) return;

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id'));

  if (!Number.isInteger(id) || id < 1) {
    mount.innerHTML = '<p style="color:#b63a3a;font-size:0.9rem;padding:1rem 0;">Invalid activity link.</p>';
    return;
  }

  try {
    const res = await fetch(`/api/activities/${id}`);
    if (!res.ok) throw new Error('Activity not found');
    const a = await res.json();

    const hrs = Number(a.duration_hours);
    const durationLabel = hrs === 1 ? '1 hr' : `${hrs} hrs`;
    const fallbackImage = defaultImage(a.name);
    const ideaUrl = normalizeHttpUrl(a.idea_url);
    const isUrlIdea = String(a.activity_category || '').toLowerCase() === 'url idea';
    const isAssessmentTask = String(a.activity_category || '').toLowerCase() === 'assessment';
    const supportingImageUrls = extractSupportingImageUrls(a.description);
    const primaryImageUrl = normalizeHttpUrl(a.outcome_image_url)
      || (isAssessmentTask ? supportingImageUrls[0] || '' : '');
    const assessmentDetails = isAssessmentTask ? toLines(a.resources) : [];
    const resourcesEquipment = isAssessmentTask
      ? toLines(a.equipment)
      : combineUniqueLines(toLines(a.resources), toLines(a.equipment));

    mount.innerHTML = `
      ${teacherToolbarMarkup(a)}
      <section class="detail-hero">
        <div class="detail-hero-content">
          <p class="detail-sub">${isUrlIdea ? 'URL IDEA' : (isAssessmentTask ? 'ASSESSMENT TASK' : 'STUDENT SEWING ACTIVITY')}</p>
          <h1>${escHtml(a.name)}</h1>
          <div class="detail-meta">
            <span class="detail-chip">${escHtml(a.year_level)}</span>
            <span class="detail-chip">${escHtml(a.type)}</span>
            <span class="detail-chip teacher-only">${escHtml(durationLabel)}</span>
            <span class="detail-chip teacher-only">${escHtml(a.difficulty)}</span>
          </div>
          <p class="detail-desc">${escHtml(a.description || 'Practical sewing task for students.')}</p>
          ${ideaUrl ? `<a class="detail-url-link" href="${escHtml(ideaUrl)}" target="_blank" rel="noopener noreferrer">Open URL Idea</a>` : ''}
          <a class="detail-back" href="/index.html">&#8592; Back to activity library</a>
        </div>
        <div class="detail-image">
          <img src="${escHtml(primaryImageUrl || fallbackImage)}" alt="${escHtml(a.name)} outcome" loading="lazy" onerror="this.onerror=null;this.src='${escHtml(fallbackImage)}'" />
        </div>
      </section>

      <section class="detail-grid">
        ${isAssessmentTask ? `
        <article class="detail-card">
          <h2>Assessment Details</h2>
          <p class="small">Standard and assessment information.</p>
          ${makeList(assessmentDetails, false)}
        </article>
        ` : ''}

        <article class="detail-card">
          <h2>Resources and Equipment</h2>
          <p class="small">Materials, tools, and machines used.</p>
          ${makeList(resourcesEquipment, false)}
        </article>

        <article class="detail-card">
          <h2>Instructions</h2>
          <p class="small">Step-by-step method.</p>
          ${instructionsMarkup(a)}
        </article>

        ${teacherPanelMarkup(a)}
      </section>
    `;

    const toggleBtn = document.getElementById('student-view-toggle');
    const toolbar = document.getElementById('teacher-toolbar');
    if (toggleBtn) {
      let studentView = false;
      toggleBtn.addEventListener('click', () => {
        studentView = !studentView;
        document.querySelectorAll('.teacher-only').forEach(el => {
          el.style.display = studentView ? 'none' : '';
        });
        if (toolbar) toolbar.classList.toggle('student-view-active', studentView);
        toggleBtn.textContent = studentView ? 'Back to Teacher View' : 'Preview as Student';
      });
    }
  } catch (_err) {
    mount.innerHTML = '<p style="color:#b63a3a;font-size:0.9rem;padding:1rem 0;">Could not load this activity.</p>';
  }
}

loadActivity();
