const form = document.getElementById('assessment-task-form');
const statusEl = document.getElementById('assessment-task-status');
const standardsStatusEl = document.getElementById('assessment-standards-status');
const standardSelectEl = document.getElementById('assessment-standard-select');
const standardDetailsEl = document.getElementById('assessment-standard-details');
const pageTitle = document.getElementById('assessment-page-title');
const pageSubtitle = document.getElementById('assessment-page-subtitle');
const formHeading = document.getElementById('assessment-form-heading');
const submitBtn = document.getElementById('assessment-submit-btn');
const imageInputs = Array.from(document.querySelectorAll('.assessment-image-input'));
const uploadedImageUrls = new Array(5).fill(null);
let assessmentStandards = [];
let currentOutcomeImageUrl = '';
const params = new URLSearchParams(window.location.search);
const editId = Number(params.get('id'));
const isEditMode = Number.isInteger(editId) && editId > 0;

function setStatus(message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b63a3a' : '#37618a';
}

function value(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function checked(id) {
  return !!document.getElementById(id)?.checked;
}

function setValue(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = v == null ? '' : String(v);
}

function setChecked(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!v;
}

function normalizeHttpUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value;
}

function parseSupportingImagesFromDescription(text) {
  const raw = String(text || '');
  if (!raw) return [];

  const match = raw.match(/Supporting Images:\n([\s\S]*)/i);
  if (!match || !match[1]) return [];

  return match[1]
    .split(/\r?\n/)
    .map((line) => normalizeHttpUrl(line))
    .filter(Boolean);
}

function extractSection(text, heading) {
  const raw = String(text || '');
  if (!raw) return '';
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}:\\n([\\s\\S]*?)(?:\\n\\n[A-Za-z][^\\n]*:\\n|$)`, 'i');
  const match = raw.match(regex);
  return match && match[1] ? match[1].trim() : '';
}

function setStandardsStatus(message, isError) {
  if (!standardsStatusEl) return;
  standardsStatusEl.textContent = message;
  standardsStatusEl.style.color = isError ? '#b63a3a' : '#6282a3';
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStandardDetails(standard) {
  if (!standard) return '';

  return [
    `Standard Number: ${String(standard.standard_number || '').trim()}`,
    `Standard Name: ${String(standard.standard_name || '').trim()}`,
    `Subject Set: ${String(standard.subject_set || '').trim()}`,
    `Level: ${String(standard.level || '').trim()}`,
    `Credits: ${String(standard.credits || '').trim()}`,
    `Assessment Type: ${String(standard.assessment_type || '').trim()}`,
    `NZQA Source: ${String(standard.nzqa_search_url || '').trim()}`,
  ].join('\n');
}

function populateStandardSelect() {
  if (!standardSelectEl) return;

  const options = ['<option value="">Choose a standard from Assessment Management data</option>'];
  assessmentStandards.forEach((row) => {
    const number = String(row.standard_number || '').trim();
    const name = String(row.standard_name || '').trim();
    if (!number) return;
    const label = `${number} - ${name}`;
    options.push(`<option value="${escHtml(number)}">${escHtml(label)}</option>`);
  });

  standardSelectEl.innerHTML = options.join('');
}

async function loadAssessmentStandardsForForm() {
  setStandardsStatus('Loading standards from Assessment Management...', false);

  try {
    const res = await fetch('/api/admin/assessment-standards', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load standards');

    assessmentStandards = Array.isArray(data.standards) ? data.standards : [];
    populateStandardSelect();
    setStandardsStatus(`Loaded ${assessmentStandards.length} standards. Select one to auto-fill Standard Details.`, false);
  } catch (err) {
    assessmentStandards = [];
    populateStandardSelect();
    setStandardsStatus(err.message || 'Could not load standards', true);
  }
}

standardSelectEl?.addEventListener('change', () => {
  const selectedNumber = String(standardSelectEl.value || '').trim();
  if (!selectedNumber || !standardDetailsEl) return;
  const selected = assessmentStandards.find((row) => String(row.standard_number || '').trim() === selectedNumber);
  if (!selected) return;
  standardDetailsEl.value = buildStandardDetails(selected);
});

async function loadAssessmentForEdit() {
  if (!isEditMode) return;

  try {
    const res = await fetch(`/api/activities/${editId}`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load assessment task');

    setValue('assessment-name', data.name);
    setValue('assessment-year', data.year_level);
    setValue('assessment-type', data.type);
    setValue('assessment-category', data.activity_category || 'Assessment');
    setValue('assessment-difficulty', data.difficulty || 'Intermediate');
    setValue('assessment-duration', data.duration_hours);
    setValue('assessment-color', data.color || 'color-lavender');
    setChecked('assessment-week', data.is_this_week);

    const descriptionText = String(data.description || '');
    const subjectMatch = descriptionText.match(/Subject Stream:\s*(.+)/i);
    const existingSupportingImages = parseSupportingImagesFromDescription(descriptionText);
    currentOutcomeImageUrl = normalizeHttpUrl(data.outcome_image_url);

    uploadedImageUrls.fill(null);
    if (currentOutcomeImageUrl) {
      uploadedImageUrls[0] = currentOutcomeImageUrl;
    }
    existingSupportingImages.slice(0, 4).forEach((imgUrl, idx) => {
      uploadedImageUrls[idx + 1] = imgUrl;
    });

    const brief = descriptionText
      .replace(/\n\n?Subject Stream:[\s\S]*/i, '')
      .replace(/\n\n?Supporting Images:[\s\S]*/i, '')
      .trim();

    setValue('assessment-brief-description', brief);
    setValue('assessment-subject-stream', subjectMatch ? subjectMatch[1].trim() : '');
    setValue('assessment-task-list', data.instructions || '');
    setValue('assessment-standard-details', data.resources || '');
    setValue('assessment-submission', data.equipment || '');
    setValue('assessment-progress', data.class_management_notes || '');
    setValue('assessment-implications', data.class_preparation || '');

    const focus = String(data.assessment_focus || '');
    setValue('assessment-achiever', extractSection(focus, 'Achiever'));
    setValue('assessment-merit', extractSection(focus, 'Merit'));
    setValue('assessment-excellence', extractSection(focus, 'Excellence'));
    setValue('assessment-feedback', extractSection(focus, 'Feedback and Trialling'));
  } catch (err) {
    setStatus(err.message || 'Could not load assessment task for editing', true);
  }
}

async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch('/api/admin/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Image upload failed');
  }

  return data.imageUrl;
}

imageInputs.forEach((input) => {
  input.addEventListener('change', async () => {
    const index = Number(input.dataset.index);
    const file = input.files && input.files[0];
    if (!file || !Number.isInteger(index) || index < 0 || index >= uploadedImageUrls.length) return;

    setStatus(`Uploading image ${index + 1}...`, false);

    try {
      const imageUrl = await uploadImageFile(file);
      uploadedImageUrls[index] = imageUrl;
      setStatus(`Image ${index + 1} uploaded.`, false);
    } catch (err) {
      setStatus(err.message || `Could not upload image ${index + 1}.`, true);
    }
  });
});

loadAssessmentStandardsForForm();

if (isEditMode) {
  if (pageTitle) pageTitle.textContent = 'Edit Assessment Task';
  if (pageSubtitle) pageSubtitle.textContent = 'Update an existing assessment task and save your changes.';
  if (formHeading) formHeading.textContent = `Edit Assessment Task #${editId}`;
  if (submitBtn) submitBtn.textContent = 'Update Assessment Task';
  loadAssessmentForEdit();
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = value('assessment-name');
    const yearLevel = value('assessment-year');
    const type = value('assessment-type');
    const category = value('assessment-category') || 'Assessment';
    const difficulty = value('assessment-difficulty');
    const subjectStream = value('assessment-subject-stream');
    const briefDescription = value('assessment-brief-description');
    const taskList = value('assessment-task-list');
    const standardDetails = value('assessment-standard-details');
    const achiever = value('assessment-achiever');
    const merit = value('assessment-merit');
    const excellence = value('assessment-excellence');
    const submissionRequirements = value('assessment-submission');
    const relevantImplications = value('assessment-implications');
    const progressLogging = value('assessment-progress');
    const feedback = value('assessment-feedback');
    const durationHours = Number(value('assessment-duration'));
    const allowedYears = new Set(['Year 9', 'Year 10', 'Year 11', 'Year 12']);
    const allowedTypes = new Set([
      'Hand Sewing',
      'Machine Sewing',
      'Embroidery',
      'Pattern Making',
      'Construction',
      'Finishing',
    ]);

    if (!name || !yearLevel || !type || !difficulty || !Number.isFinite(durationHours) || durationHours <= 0) {
      setStatus('Please complete the required fields before saving.', true);
      return;
    }

    if (!allowedYears.has(yearLevel)) {
      setStatus('Please choose a valid year level (Year 9 to Year 12).', true);
      return;
    }

    if (!allowedTypes.has(type)) {
      setStatus('Please choose a valid Sewing Room type.', true);
      return;
    }

    if (durationHours > 24) {
      setStatus('Duration must be 24 hours or less.', true);
      return;
    }

    setStatus('Saving assessment task...', false);

    const imageUrls = uploadedImageUrls.filter(Boolean);
    const outcomeImageUrl = imageUrls.length ? imageUrls[0] : (currentOutcomeImageUrl || null);

    const assessmentFocus = [
      achiever ? `Achiever:\n${achiever}` : '',
      merit ? `Merit:\n${merit}` : '',
      excellence ? `Excellence:\n${excellence}` : '',
      feedback ? `Feedback and Trialling:\n${feedback}` : '',
    ].filter(Boolean).join('\n\n');

    const descriptionParts = [
      briefDescription,
      subjectStream ? `Subject Stream: ${subjectStream}` : '',
      imageUrls.length > 1 ? `Supporting Images:\n${imageUrls.slice(1).join('\n')}` : '',
    ].filter(Boolean);

    const payload = {
      name,
      year_level: yearLevel,
      type,
      activity_category: category,
      duration_hours: durationHours,
      difficulty,
      description: descriptionParts.join('\n\n') || null,
      color: value('assessment-color') || 'color-lavender',
      is_this_week: checked('assessment-week'),
      outcome_image_url: outcomeImageUrl,
      idea_url: null,
      resources: standardDetails || null,
      equipment: submissionRequirements || null,
      instructions: taskList || null,
      class_management_notes: progressLogging || null,
      class_preparation: relevantImplications || null,
      assessment_focus: assessmentFocus || null,
    };

    try {
      const saveUrl = isEditMode ? `/api/admin/activities/${editId}` : '/api/admin/activities';
      const saveMethod = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save assessment task');

      setStatus(isEditMode ? 'Assessment task updated. Opening preview...' : 'Assessment task saved. Opening preview...', false);
      window.location.href = `/activity_detail.html?id=${data.id}`;
    } catch (err) {
      setStatus(err.message || (isEditMode ? 'Could not update assessment task' : 'Could not save assessment task'), true);
    }
  });
}
