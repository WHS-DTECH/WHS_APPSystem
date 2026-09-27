
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Populate Staff Dropdown ---

const userLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shortWeekdayFormatter = new Intl.DateTimeFormat(userLocale, { weekday: 'short' });
const localDateFormatter = new Intl.DateTimeFormat(userLocale, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const bookClassPageParams = new URLSearchParams(window.location.search);
const isTeacherEmbedView = bookClassPageParams.get('view') === 'teacher_embed';
const isFormOnlyView = bookClassPageParams.get('form_only') === '1';
const isStudentListOnlyView = bookClassPageParams.get('student_list_only') === '1';
const isTimetableOnlyView = bookClassPageParams.get('hide_booking_form') === '1' && bookClassPageParams.get('hide_student_panel') === '1';
const forcedPlannerStream = String(bookClassPageParams.get('planner_stream') || '').trim();
const isFoodTruckStudentMode = forcedPlannerStream.toLowerCase() === 'food truck';
const canPublishSharedEmbedState = !isTeacherEmbedView || isFormOnlyView;
const bookClassSharedStateKey = 'bookClassEmbedSharedState';
const bookClassActionChannelName = 'bookClassActionChannel';
const bookClassSharedChannelName = 'bookClassEmbedSharedChannel';
const bookClassEmbedSourceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const bookClassSharedChannel = isTeacherEmbedView && 'BroadcastChannel' in window
  ? new BroadcastChannel(bookClassSharedChannelName)
  : null;
const bookClassActionChannel = isTeacherEmbedView && 'BroadcastChannel' in window
  ? new BroadcastChannel(bookClassActionChannelName)
  : null;
let isApplyingSharedState = false;
let lastSharedStateAppliedAt = 0;
let pendingSharedRecipeId = '';
let pendingSharedRecipeName = '';

function applyRecipeSelection(targetRecipeId = '', targetRecipeName = '') {
  const select = document.getElementById('recipeSelect');
  if (!select) return false;

  const idToUse = String(targetRecipeId || '').trim();
  const nameToUse = String(targetRecipeName || '').trim().toLowerCase();

  if (idToUse && Array.from(select.options).some((opt) => String(opt.value) === idToUse)) {
    select.value = idToUse;
    select.dispatchEvent(new Event('change'));
    return true;
  }

  if (nameToUse) {
    const byName = Array.from(select.options).find((opt) =>
      String(opt.getAttribute('data-recipe-name') || '').trim().toLowerCase() === nameToUse
    );
    if (byName) {
      select.value = byName.value;
      select.dispatchEvent(new Event('change'));
      return true;
    }
  }

  return false;
}

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseBookingDate(value) {
  const local = parseLocalIsoDate(value);
  if (local) return local;
  // Avoid UTC-offset date shift: try to extract YYYY-MM-DD before falling back to Date()
  const datePart = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePart) {
    const fromPart = parseLocalIsoDate(datePart[1]);
    if (fromPart) return fromPart;
  }
  return new Date(value);
}

function getTopSelections(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

function setTopSelection(key, value) {
  let arr = getTopSelections(key);
  arr = arr.filter(v => v !== value);
  arr.unshift(value);
  if (arr.length > 5) arr = arr.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(arr));
}

function getStaffUsageCounts() {
  try {
    const raw = JSON.parse(localStorage.getItem('staffUsageCounts') || '{}');
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  } catch {
    return {};
  }
}

function incrementStaffUsageCount(staffId) {
  const id = String(staffId || '').trim();
  if (!id) return;
  const counts = getStaffUsageCounts();
  const current = Number(counts[id] || 0);
  counts[id] = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem('staffUsageCounts', JSON.stringify(counts));
}

function getStaffDisplayLabel(staff) {
  if (!staff) return '';
  return staff.code
    ? `${staff.last_name}, ${staff.first_name} (${staff.code})`
    : `${staff.last_name}, ${staff.first_name}`;
}

function populateStaffDropdown(staffList = null) {
  const loadStaff = Array.isArray(staffList)
    ? Promise.resolve({ staff: staffList })
    : fetch('/api/staff_upload/dropdown').then(res => res.json());

  return loadStaff.then(data => {
    const select = document.getElementById('staffSelect');
    if (!select) return;
    const currentValue = String(select.value || '').trim();
    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose Staff member';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);
    const staffArr = (data.staff || []).slice().sort((a, b) => {
      return getStaffDisplayLabel(a).localeCompare(getStaffDisplayLabel(b), undefined, { sensitivity: 'base' });
    });

    const usageCounts = getStaffUsageCounts();
    const recentStaffIds = getTopSelections('topStaff').slice(0, 5);
    const mostUsedId = staffArr
      .map((s) => ({ id: String(s.id || ''), count: Number(usageCounts[String(s.id || '')] || 0) }))
      .sort((a, b) => b.count - a.count)[0];
    const mostUsedStaffId = mostUsedId && mostUsedId.count > 0 ? mostUsedId.id : '';

    const featuredIds = [];
    if (mostUsedStaffId) featuredIds.push(mostUsedStaffId);
    recentStaffIds.forEach((id) => {
      const sid = String(id || '');
      if (sid && !featuredIds.includes(sid)) featuredIds.push(sid);
    });

    const featuredList = featuredIds
      .map((id) => staffArr.find((s) => String(s.id) === String(id)))
      .filter(Boolean);

    // Featured block: most used first, then recent 5. Kept duplicated in full alphabetical list below.
    featuredList.forEach((staff) => {
      const opt = document.createElement('option');
      opt.value = staff.id;
      opt.textContent = getStaffDisplayLabel(staff);
      select.appendChild(opt);
    });

    if (featuredList.length > 0) {
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────────';
      select.appendChild(sep);
    }

    // Full alphabetical list (includes featured users in their natural place as requested).
    staffArr.forEach((staff) => {
      const opt = document.createElement('option');
      opt.value = staff.id;
      opt.textContent = getStaffDisplayLabel(staff);
      select.appendChild(opt);
    });

    if (currentValue && Array.from(select.options).some((opt) => String(opt.value || '') === currentValue)) {
      select.value = currentValue;
    }
  });
}

// --- Populate Class Dropdown ---

function getStaffCodeById(staffId, staffArr) {
  const staff = staffArr.find(s => String(s.id) === String(staffId));
  return staff && staff.code ? staff.code : '';
}

let _staffArrCache = [];
let _currentTeacherTimetablePeriods = [];
let _preferredStaffId = '';
let _studentsFetchRequestSeq = 0;
let _currentClassStudents = [];
let _foodTruckStudentIdentity = { id: '', name: '', email: '' };
let _pendingPartnerStudentId = '';

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function readCurrentStaffUser() {
  try {
    const raw = sessionStorage.getItem('currentStaffUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function deriveCandidateFromAuthUser(user) {
  if (!user) return null;
  const name = String(user.name || '').trim();
  const parts = name ? name.split(/\s+/).filter(Boolean) : [];
  const email = String(user.email || '').trim();
  const emailLocal = email ? email.split('@')[0] : '';
  const emailParts = emailLocal.split(/[._-]+/).filter(Boolean);

  const firstFromName = parts.length ? parts[0] : '';
  const lastFromName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const firstFromEmail = emailParts.length ? emailParts[0] : '';
  const lastFromEmail = emailParts.length > 1 ? emailParts[emailParts.length - 1] : '';

  return {
    id: user.id || '',
    code: user.code || '',
    first_name: firstFromName || firstFromEmail,
    last_name: lastFromName || lastFromEmail,
    email_school: email || ''
  };
}

async function readCurrentStaffUserWithAuthFallback() {
  const fromStorage = readCurrentStaffUser();
  if (fromStorage) return fromStorage;

  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || !data.authenticated || !data.user) return null;
    const candidate = deriveCandidateFromAuthUser(data.user);
    if (candidate) {
      try {
        sessionStorage.setItem('currentStaffUser', JSON.stringify(candidate));
      } catch {
        // Ignore storage write issues.
      }
    }
    return candidate;
  } catch {
    return null;
  }
}

async function readCurrentFoodTruckStudentIdentity() {
  try {
    const authRes = await fetch('/api/auth/me', { credentials: 'include' });
    const authData = await authRes.json().catch(() => ({}));
    if (!authRes.ok || !authData || !authData.authenticated || !authData.user) {
      return { id: '', name: '', email: '' };
    }

    const authUser = authData.user || {};
    const email = String(authUser.email || '').trim().toLowerCase();
    const role = String(authUser.role || '').trim().toLowerCase();
    let name = String(authUser.name || '').trim();
    let studentId = '';

    if (role === 'student' && email) {
      const profileRes = await fetch('/api/user_roles/profile?userType=student&identifier=' + encodeURIComponent(email), { credentials: 'include' });
      const profileData = await profileRes.json().catch(() => ({}));
      if (profileRes.ok && profileData && profileData.success && profileData.isStudent && profileData.student) {
        name = String(profileData.student.student_name || name).trim();
        studentId = String(profileData.student.id_number || '').trim();
      }
    }

    if (!name && email) {
      name = email.split('@')[0].split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

    return {
      id: studentId || email,
      studentId: studentId || '',
      name: name || 'Student',
      email
    };
  } catch {
    return { id: '', studentId: '', name: '', email: '' };
  }
}

function normalizeStudentName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function setPartnerFieldVisibility() {
  if (!isFoodTruckStudentMode) return;
  const cookModeSelect = document.getElementById('cookModeSelect');
  const partnerField = document.getElementById('partnerStudentField');
  if (!cookModeSelect || !partnerField) return;
  partnerField.style.display = cookModeSelect.value === 'pair' ? '' : 'none';
}

function populatePartnerStudentOptions(students = _currentClassStudents) {
  if (!isFoodTruckStudentMode) return;
  const select = document.getElementById('partnerStudentSelect');
  if (!select) return;

  const currentStudentName = normalizeStudentName(_foodTruckStudentIdentity.name);
  const currentStudentId = String(_foodTruckStudentIdentity.id || '').trim().toLowerCase();
  const options = [];

  for (const student of (Array.isArray(students) ? students : [])) {
    const id = String(student && student.id_number || '').trim();
    const name = String(student && student.student_name || '').trim();
    if (!name) continue;
    const normalizedName = normalizeStudentName(name);
    const normalizedId = id.toLowerCase();
    if ((currentStudentId && normalizedId && normalizedId === currentStudentId) || (currentStudentName && normalizedName === currentStudentName)) {
      continue;
    }
    options.push({ id, name });
  }

  const previous = String(select.value || '');
  select.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = options.length ? 'Select partner student' : 'No partner students available for this class';
  defaultOption.disabled = options.length === 0;
  defaultOption.selected = true;
  select.appendChild(defaultOption);

  options.forEach((student) => {
    const opt = document.createElement('option');
    opt.value = student.id || student.name;
    opt.textContent = student.id ? `${student.name} (${student.id})` : student.name;
    opt.setAttribute('data-student-name', student.name);
    opt.setAttribute('data-student-id', student.id || '');
    select.appendChild(opt);
  });

  const desired = _pendingPartnerStudentId || previous;
  if (desired && Array.from(select.options).some((opt) => String(opt.value) === String(desired))) {
    select.value = desired;
  }
  _pendingPartnerStudentId = '';
  setPartnerFieldVisibility();
}

function applyFoodTruckStudentModeToForm() {
  if (!isFoodTruckStudentMode) return;
  const staffLabel = document.getElementById('staffSelectLabel');
  const staffSelect = document.getElementById('staffSelect');
  const cookModeField = document.getElementById('cookModeField');
  const classSizeField = document.getElementById('classSizeField');
  const groupsField = document.getElementById('groupsField');
  const groupsInput = document.getElementById('groupsInput');

  if (staffLabel) {
    staffLabel.textContent = 'Student';
  }

  if (staffSelect) {
    const studentValue = String(_foodTruckStudentIdentity.id || _foodTruckStudentIdentity.email || 'student').trim();
    const studentLabel = String(_foodTruckStudentIdentity.name || 'Student').trim();
    staffSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = studentValue;
    option.textContent = studentLabel;
    staffSelect.appendChild(option);
    staffSelect.value = studentValue;
    staffSelect.disabled = true;
  }

  if (cookModeField) {
    cookModeField.style.display = '';
  }

  if (classSizeField) {
    classSizeField.style.display = 'none';
  }

  if (groupsField) {
    groupsField.style.display = 'none';
  }

  if (groupsInput) {
    groupsInput.value = '1';
  }

  setPartnerFieldVisibility();
  populatePartnerStudentOptions(_currentClassStudents);
}

function resolveLoggedInStaffId(staffRows = [], currentUser = null) {
  if (!currentUser || !Array.isArray(staffRows) || !staffRows.length) return '';

  const targetId = String(currentUser.id || '').trim();
  const targetCode = normalizeToken(currentUser.code);
  const targetEmail = normalizeEmail(currentUser.email_school || currentUser.email || '');
  const targetFirst = normalizeToken(currentUser.first_name);
  const targetLast = normalizeToken(currentUser.last_name);
    if (targetEmail) {
      const byEmail = staffRows.find(s => normalizeEmail(s.email_school) === targetEmail);
      if (byEmail) return String(byEmail.id || '');
    }

  const combinedOne = normalizeToken(`${currentUser.first_name || ''}${currentUser.last_name || ''}`);
  const combinedTwo = normalizeToken(`${currentUser.last_name || ''}${currentUser.first_name || ''}`);

  if (targetId) {
    const byId = staffRows.find(s => String(s.id || '') === targetId);
    if (byId) return String(byId.id || '');
  }

  if (targetCode) {
    const byCode = staffRows.find(s => normalizeToken(s.code) === targetCode);
    if (byCode) return String(byCode.id || '');
  }

  const byName = staffRows.find((s) => {
    const first = normalizeToken(s.first_name);
    const last = normalizeToken(s.last_name);
    const joinedOne = normalizeToken(`${s.first_name || ''}${s.last_name || ''}`);
    const joinedTwo = normalizeToken(`${s.last_name || ''}${s.first_name || ''}`);
    return (
      (targetFirst && targetLast && first === targetFirst && last === targetLast) ||
      (combinedOne && joinedOne === combinedOne) ||
      (combinedTwo && joinedTwo === combinedTwo)
    );
  });

  return byName ? String(byName.id || '') : '';
}

function ensureStaffSelected(preferredStaffId = '') {
  const staffSelect = document.getElementById('staffSelect');
  if (!staffSelect) return '';

  if (preferredStaffId) {
    staffSelect.value = String(preferredStaffId);
  }

  if (staffSelect.value) return String(staffSelect.value);

  const firstRealOption = Array.from(staffSelect.options || []).find(opt => !opt.disabled && String(opt.value || '').trim() !== '');
  if (firstRealOption) {
    staffSelect.value = firstRealOption.value;
  }
  return String(staffSelect.value || '');
}

function readSharedEmbedState() {
  if (!isTeacherEmbedView) return null;
  try {
    return JSON.parse(localStorage.getItem(bookClassSharedStateKey) || 'null');
  } catch {
    return null;
  }
}

function writeSharedEmbedState(partialState = {}, options = {}) {
  const forcePublish = !!options.force;
  if (!isTeacherEmbedView || (!canPublishSharedEmbedState && !forcePublish) || isApplyingSharedState) return;
  const nextState = {
    ...(readSharedEmbedState() || {}),
    ...partialState,
    sourceId: bookClassEmbedSourceId,
    updatedAt: Date.now()
  };
  lastSharedStateAppliedAt = nextState.updatedAt;
  localStorage.setItem(bookClassSharedStateKey, JSON.stringify(nextState));
  if (bookClassSharedChannel) {
    bookClassSharedChannel.postMessage(nextState);
  }
}

function ensureClassOption(select, className) {
  if (!select || !className) return;
  const hasOption = Array.from(select.options).some(opt => String(opt.value) === String(className));
  if (hasOption) return;
  const option = document.createElement('option');
  option.value = className;
  option.textContent = className;
  option.setAttribute('data-shared-option', '1');
  select.appendChild(option);
}

function setRecipeSelectionInfo(message) {
  const el = document.getElementById('recipeSelectionInfo');
  if (!el) return;
  const text = String(message || '').trim();
  if (!text) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.textContent = text;
  el.style.display = '';
}

function getCurrentEmbedState() {
  const saveBtn = document.getElementById('saveBookingBtn');
  const partnerSelect = document.getElementById('partnerStudentSelect');
  return {
    staffId: document.getElementById('staffSelect')?.value || '',
    className: document.getElementById('classSelect')?.value || '',
    bookingDate: document.getElementById('dateInput')?.value || '',
    period: document.getElementById('periodSelect')?.value || '',
    recipeId: document.getElementById('recipeSelect')?.value || '',
    recipeSelectionInfo: document.getElementById('recipeSelectionInfo')?.textContent || '',
    classSize: document.getElementById('classSizeInput')?.value || '',
    groups: document.getElementById('groupsInput')?.value || '',
    cookMode: document.getElementById('cookModeSelect')?.value || 'single',
    partnerStudentId: partnerSelect?.value || '',
    partnerStudentName: partnerSelect && partnerSelect.selectedIndex > 0
      ? (partnerSelect.options[partnerSelect.selectedIndex].getAttribute('data-student-name') || '')
      : '',
    editBookingId: saveBtn && saveBtn.dataset ? (saveBtn.dataset.editId || '') : ''
  };
}

function clearFormEditMode() {
  const saveBtn = document.getElementById('saveBookingBtn');
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  const deleteBtn = document.getElementById('deleteBookingBtn');
  if (saveBtn) {
    saveBtn.textContent = 'Save booking';
    delete saveBtn.dataset.editId;
  }
  if (masterSaveBtn) {
    masterSaveBtn.textContent = 'SAVE';
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
    delete deleteBtn.dataset.bookingId;
  }
}

function setFormEditMode(bookingId) {
  const normalizedId = String(bookingId || '').trim();
  const saveBtn = document.getElementById('saveBookingBtn');
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  const deleteBtn = document.getElementById('deleteBookingBtn');
  if (!saveBtn || !normalizedId) return;

  saveBtn.dataset.editId = normalizedId;
  saveBtn.textContent = 'Update booking';
  if (masterSaveBtn) {
    masterSaveBtn.textContent = 'UPDATE';
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'inline-block';
    deleteBtn.dataset.bookingId = normalizedId;
  }
}

function applySharedEmbedState(state = {}) {
  if (!isTeacherEmbedView || !state) return Promise.resolve();
  if (state.sourceId && state.sourceId === bookClassEmbedSourceId) {
    return Promise.resolve();
  }
  if (state.updatedAt && state.updatedAt <= lastSharedStateAppliedAt) {
    return Promise.resolve();
  }

  const staffSelect = document.getElementById('staffSelect');
  const classSelect = document.getElementById('classSelect');
  const dateInput = document.getElementById('dateInput');
  const periodSelect = document.getElementById('periodSelect');
  const recipeSelect = document.getElementById('recipeSelect');
  const classSizeInput = document.getElementById('classSizeInput');
  const groupsInput = document.getElementById('groupsInput');
  const cookModeSelect = document.getElementById('cookModeSelect');
  const partnerStudentSelect = document.getElementById('partnerStudentSelect');
  const targetStaffId = state.staffId || '';
  const targetClassName = state.className || '';
  const targetDate = state.bookingDate || '';
  const targetPeriod = state.period || '';
  const targetRecipeId = state.recipeId || '';
  const targetRecipeName = state.recipeName || '';
  const targetRecipeSelectionInfo = state.recipeSelectionInfo || '';
  const targetClassSize = state.classSize || '';
  const targetGroups = state.groups || '';
  const targetCookMode = state.cookMode || 'single';
  const targetPartnerStudentId = state.partnerStudentId || '';
  const targetEditBookingId = state.editBookingId || '';
  lastSharedStateAppliedAt = state.updatedAt || Date.now();

  isApplyingSharedState = true;

  if (dateInput && targetDate) {
    dateInput.value = targetDate;
    updateBookingDateDayLabel();
  }
  if (periodSelect && targetPeriod) {
    periodSelect.value = targetPeriod;
  }
  if (targetRecipeId || targetRecipeName) {
    const selected = applyRecipeSelection(targetRecipeId, targetRecipeName);
    if (!selected) {
      pendingSharedRecipeId = String(targetRecipeId || '').trim();
      pendingSharedRecipeName = String(targetRecipeName || '').trim();
      populateRecipeDropdown();
    }
  }
  setRecipeSelectionInfo(targetRecipeSelectionInfo);
  if (classSizeInput && targetClassSize) {
    classSizeInput.value = targetClassSize;
  }
  if (groupsInput && targetGroups) {
    groupsInput.value = targetGroups;
  }
  if (cookModeSelect) {
    cookModeSelect.value = targetCookMode;
  }
  if (partnerStudentSelect && targetPartnerStudentId) {
    _pendingPartnerStudentId = String(targetPartnerStudentId);
  }
  setPartnerFieldVisibility();

  const finalize = () => {
    if (classSelect) {
      if (targetClassName) {
        ensureClassOption(classSelect, targetClassName);
        classSelect.value = targetClassName;
      }
      fetchStudentsForClass(classSelect.value || '');
    }
    fetchTeacherTimetableForSelectedDate();
    if (targetEditBookingId) {
      setFormEditMode(targetEditBookingId);
    } else {
      clearFormEditMode();
    }
    isApplyingSharedState = false;
  };

  if (staffSelect && targetStaffId) {
    staffSelect.value = targetStaffId;
    const staffCode = getStaffCodeById(targetStaffId, _staffArrCache);
    return populateClassDropdown(staffCode).then(() => finalize());
  }

  finalize();
  return Promise.resolve();
}

function normalizeClassToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function expandTimetableClassTokens(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .flatMap(v => String(v || '').split(/[;|]/g))
    .map(v => v.trim())
    .filter(v => {
      if (!v) return false;
      if (seen.has(v.toUpperCase())) return false;
      seen.add(v.toUpperCase());
      return true;
    });
}

function deriveClassCodeFromTimetableToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  const trimmed = raw.replace(/^-+|-+$/g, '');
  if (!trimmed) return '';

  const parts = trimmed.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d{1,3}[A-Z]?$/i.test(parts[0])) {
    return parts[1].toUpperCase();
  }
  if (parts.length >= 3 && /^\d{1,3}[A-Z]?$/i.test(parts[0])) {
    return parts[1].toUpperCase();
  }
  if (parts.length > 1) {
    const best = parts.find(p => /[A-Za-z]/.test(p) && p.length >= 4);
    if (best) return best.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function syncClassDropdownFromTimetable(periods) {
  const classSelect = document.getElementById('classSelect');
  if (!classSelect) return;
  const previousValue = String(classSelect.value || '').trim();

  // Use the full raw timetable tokens (e.g. 3-13HOSP-F) so the dropdown
  // has precise options for each room/group rather than just the stripped subject code.
  const rawTokens = (Array.isArray(periods) ? periods : [])
    .flatMap(p => expandTimetableClassTokens(p && p.classes))
    .filter(Boolean);

  if (!rawTokens.length) return;

  const uniqueTokens = [...new Set(rawTokens)];

  // Replace the dropdown entirely with only timetable-sourced classes.
  classSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Choose Class';
  defaultOpt.disabled = true;
  defaultOpt.selected = true;
  classSelect.appendChild(defaultOpt);

  uniqueTokens.forEach(token => {
    const opt = document.createElement('option');
    opt.value = token;
    opt.textContent = token;
    opt.setAttribute('data-timetable-fallback', '1');
    classSelect.appendChild(opt);
  });

  if (previousValue && uniqueTokens.some(token => String(token) === previousValue)) {
    classSelect.value = previousValue;
  }
}

function autoSelectClassFromSelectedPeriod() {
  const periodSelect = document.getElementById('periodSelect');
  const classSelect = document.getElementById('classSelect');
  if (!periodSelect || !classSelect) return;

  const selectedPeriod = `P${periodSelect.value}`;
  const periodEntry = (_currentTeacherTimetablePeriods || []).find(p => p && p.period === selectedPeriod);
  if (!periodEntry || !Array.isArray(periodEntry.classes) || !periodEntry.classes.length) return;

  const timetableTokens = periodEntry.classes
    .flatMap(item => String(item || '').split(/[;,|]/g))
    .map(token => token.trim())
    .filter(Boolean);

  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length || !timetableTokens.length) return;

  const normalizedTokens = timetableTokens.map(normalizeClassToken);
  let matchedOption = null;

  for (const opt of options) {
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);
    if (normalizedTokens.some(tok => tok === valueNorm || tok === textNorm || tok.includes(valueNorm) || textNorm.includes(tok))) {
      matchedOption = opt;
      break;
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    fetchStudentsForClass(classSelect.value);
  }
}

function selectClassOptionFromToken(classToken, studentDisplayToken) {
  const classSelect = document.getElementById('classSelect');
  if (!classSelect || !classToken) return false;

  const rawToken = String(classToken || '').trim();
  const tokenNorm = normalizeClassToken(rawToken);
  const tokenParts = rawToken
    .split(/[^A-Za-z0-9]+/g)
    .map(p => normalizeClassToken(p))
    .filter(p => p.length >= 3);
  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length) return false;

  let matchedOption = null;

  // Pass 1: strict matching only (exact raw/exact normalized).
  for (const opt of options) {
    const rawValue = String(opt.value || '').trim();
    const rawText = String(opt.textContent || '').trim();
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);

    if (
      rawToken.toUpperCase() === rawValue.toUpperCase() ||
      rawToken.toUpperCase() === rawText.toUpperCase() ||
      tokenNorm === valueNorm ||
      tokenNorm === textNorm
    ) {
      matchedOption = opt;
      break;
    }
  }

  // Pass 2: conservative fuzzy matching (only for longer, meaningful tokens).
  if (!matchedOption) {
    for (const opt of options) {
      const valueNorm = normalizeClassToken(opt.value);
      const textNorm = normalizeClassToken(opt.textContent);

      const partExactMatch = tokenParts.some(part => part === valueNorm || part === textNorm);
      const safeContainMatch = tokenNorm.length >= 5 && valueNorm.length >= 5 &&
        (tokenNorm.includes(valueNorm) || valueNorm.includes(tokenNorm));

      if (partExactMatch || safeContainMatch) {
        matchedOption = opt;
        break;
      }
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    // Use the full timetable token (includes room, e.g. 82B-MFOOD-22) for the student
    // lookup so the LIKE query only returns students in that specific period group,
    // not all students across both room assignments for the same class.
    fetchStudentsForClass(studentDisplayToken || classSelect.value);
    return true;
  }

  // Fallback: add/select the clicked timetable class if no existing option matches.
  const tempOptId = '__timetableDynamicClassOption';
  const existingTemp = document.getElementById(tempOptId);
  if (existingTemp) existingTemp.remove();

  const fallbackOpt = document.createElement('option');
  fallbackOpt.id = tempOptId;
  fallbackOpt.value = rawToken;
  fallbackOpt.textContent = `${rawToken} (from timetable)`;
  classSelect.appendChild(fallbackOpt);
  classSelect.value = rawToken;
  fetchStudentsForClass(studentDisplayToken || classSelect.value);
  return true;
}

function updateBookingDateDayLabel() {
  const dateInput = document.getElementById('dateInput');
  const dayLabel = document.getElementById('dateDayOfWeek');
  if (!dateInput || !dayLabel) return;
  const value = dateInput.value;
  if (!value) {
    dayLabel.textContent = '';
    return;
  }
  const parsed = parseLocalIsoDate(value);
  if (!parsed || isNaN(parsed.getTime())) {
    dayLabel.textContent = '';
    return;
  }
  const info = (window.NZSchoolCalendar && typeof window.NZSchoolCalendar.getDateInfo === 'function')
    ? window.NZSchoolCalendar.getDateInfo(value)
    : null;

  const notes = [];
  if (info && info.termName && !info.isSchoolHoliday) {
    notes.push(String(info.termName).replace(/\s+\d{4}$/, ''));
  }
  if (info && info.schoolHolidayName) {
    notes.push('School holidays');
  }
  if (info && info.publicHolidayName) {
    notes.push(info.publicHolidayName);
  }
  if (info && info.additionalSchoolClosedDayName) {
    notes.push(info.additionalSchoolClosedDayName);
  }

  dayLabel.textContent = notes.length
    ? `(${shortWeekdayFormatter.format(parsed)} | ${notes.join(' | ')})`
    : `(${shortWeekdayFormatter.format(parsed)})`;

  dayLabel.style.color = (info && (info.isSchoolHoliday || info.isPublicHoliday || info.isAdditionalSchoolClosedDay))
    ? '#b45309'
    : '#666';
}

function getWeekMonday(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const weekday = d.getDay();
  const daysSinceMonday = (weekday + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function updateTeacherTimetableDaySelector() {
  const dayButtons = Array.from(document.querySelectorAll('#teacherTimetableDaySelector .teacher-day-btn'));
  if (!dayButtons.length) return;

  const dateInput = document.getElementById('dateInput');
  const parsed = parseLocalIsoDate(dateInput && dateInput.value ? dateInput.value : '') || new Date();
  const selectedWeekday = parsed.getDay();

  dayButtons.forEach((btn) => {
    const btnWeekday = Number(btn.getAttribute('data-weekday') || 0);
    const isActive = btnWeekday === selectedWeekday;
    btn.style.background = isActive ? '#1e40af' : '#e2e8f0';
    btn.style.color = isActive ? '#fff' : '#334155';
    btn.style.border = isActive ? '1px solid #1e40af' : '1px solid #cbd5e1';
    btn.style.borderRadius = '6px';
    btn.style.padding = '0.26rem 0.52rem';
    btn.style.fontSize = '0.82rem';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = isActive ? '700' : '600';
  });
}

function jumpTeacherTimetableToWeekday(weekdayMonToFri) {
  const dayIndex = Number(weekdayMonToFri);
  if (![1, 2, 3, 4, 5].includes(dayIndex)) return;

  const dateInput = document.getElementById('dateInput');
  if (!dateInput) return;

  const parsed = parseLocalIsoDate(dateInput.value || '') || new Date();
  const monday = getWeekMonday(parsed);
  monday.setDate(monday.getDate() + (dayIndex - 1));
  dateInput.value = toLocalIsoDate(monday);

  updateBookingDateDayLabel();
  updateTeacherTimetableDaySelector();
  fetchTeacherTimetableForSelectedDate();
  writeSharedEmbedState(getCurrentEmbedState(), { force: true });
}

function renderTeacherTimetable(periods, teacherCode, date, weekday) {
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!meta || !body) return;

  meta.textContent = `${teacherCode} timetable for ${date}${weekday ? ` (${weekday})` : ''}`;
  if (!periods || !periods.length) {
    body.innerHTML = '<div class="text-muted">No timetable classes found for this day.</div>';
    return;
  }

  const normalizedPeriods = (Array.isArray(periods) ? periods : []).map(p => ({
    ...p,
    classes: expandTimetableClassTokens(p && p.classes)
  }));

  // Kamar places Whanau entries inside P1; show them on a dedicated display row above P1.
  const p1Entry = normalizedPeriods.find(p => String(p && p.period).toUpperCase() === 'P1');
  const whanauTokens = p1Entry
    ? p1Entry.classes.filter(cls => /WHANAU/i.test(String(cls || '')))
    : [];

  const displayPeriods = normalizedPeriods.map(p => ({
    ...p,
    classes: (String(p && p.period).toUpperCase() === 'P1')
      ? (Array.isArray(p.classes) ? p.classes.filter(cls => !/WHANAU/i.test(String(cls || ''))) : [])
      : p.classes,
    displayPeriod: p.period
  }));

  if (whanauTokens.length) {
    const p1Index = displayPeriods.findIndex(p => String(p && p.period).toUpperCase() === 'P1');
    const whanauRow = {
      period: 'P1',
      displayPeriod: 'Whānau',
      classes: whanauTokens
    };
    if (p1Index >= 0) {
      displayPeriods.splice(p1Index, 0, whanauRow);
    } else {
      displayPeriods.unshift(whanauRow);
    }
  }

  const rows = displayPeriods.map(p => {
    const classTokens = Array.isArray(p.classes) ? p.classes : expandTimetableClassTokens(p.classes);
    const classText = classTokens.length
      ? classTokens.map(cls => `<button type="button" class="timetable-class-chip" data-period="${escHtml(p.period)}" data-class-token="${escHtml(String(cls || ''))}" style="margin:0 0.25rem 0.25rem 0;padding:0.2rem 0.45rem;border:1px solid #90caf9;border-radius:12px;background:#e3f2fd;color:#0d47a1;cursor:pointer;font-size:1rem;">${escHtml(cls)}</button>`).join('')
      : '<span style="color:#999;">No class</span>';
    return `<tr><td style="font-weight:bold;width:60px;">${escHtml(p.displayPeriod || p.period)}</td><td>${classText}</td></tr>`;
  }).join('');
  body.innerHTML = `
    <table class="bookings-table" style="margin-top:0.5rem;">
      <thead><tr><th>Period</th><th>Class(es)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  _currentTeacherTimetablePeriods = normalizedPeriods;

  syncClassDropdownFromTimetable(_currentTeacherTimetablePeriods);
  const classSelect = document.getElementById('classSelect');
  if (classSelect && !String(classSelect.value || '').trim()) {
    autoSelectClassFromSelectedPeriod();
  }

  body.querySelectorAll('.timetable-class-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const periodSelect = document.getElementById('periodSelect');
      const dateInput = document.getElementById('dateInput');
      if (dateInput && date) {
        dateInput.value = date;
        updateBookingDateDayLabel();
      }

      const periodValue = String(btn.getAttribute('data-period') || '').replace(/^P/i, '');
      if (periodSelect && periodValue) {
        periodSelect.value = periodValue;
      }

      const classToken = btn.getAttribute('data-class-token') || '';
      // Pass classToken as both the dropdown match token AND the student display token
      // so the student panel filters by the full room-specific code (e.g. 82B-MFOOD-22),
      // not just the broader class code (e.g. 82B-MFOOD) which would combine both room groups.
      const wasMatched = selectClassOptionFromToken(classToken, classToken);
      if (!wasMatched) {
        autoSelectClassFromSelectedPeriod();
      }
      writeSharedEmbedState(getCurrentEmbedState(), { force: true });
    });
  });
}

function fetchTeacherTimetableForSelectedDate() {
  const staffSelect = document.getElementById('staffSelect');
  const dateInput = document.getElementById('dateInput');
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!staffSelect || !dateInput || !meta || !body) return;

  const date = dateInput.value;
  if (!date) {
    meta.textContent = isFoodTruckStudentMode
      ? 'Select date to view student timetable.'
      : 'Select teacher and date to view timetable.';
    body.innerHTML = '';
    return;
  }

  if (isFoodTruckStudentMode) {
    const studentId = String(_foodTruckStudentIdentity.studentId || _foodTruckStudentIdentity.id || '').trim();
    if (!studentId || studentId.includes('@')) {
      meta.textContent = 'Student timetable unavailable: no student ID found for this account.';
      body.innerHTML = '';
      return;
    }

    meta.textContent = 'Loading timetable...';
    body.innerHTML = '';
    fetch(`/api/student_upload/student-day?idNumber=${encodeURIComponent(studentId)}&date=${encodeURIComponent(date)}`)
      .then(res => res.json())
      .then(data => {
        if (!data || data.success === false) {
          throw new Error(data && data.error ? data.error : 'Failed to load student timetable');
        }
        const displayLabel = String((data.student && data.student.student_name) || _foodTruckStudentIdentity.name || studentId).trim();
        const weekdayName = (new Date(date)).toLocaleDateString('en-NZ', { weekday: 'long' });
        renderTeacherTimetable(data.periods || [], displayLabel, data.date || date, weekdayName);
      })
      .catch(() => {
        _currentTeacherTimetablePeriods = [];
        meta.textContent = 'Failed to load timetable for selected date.';
        body.innerHTML = '';
      });
    return;
  }

  const staffCode = getStaffCodeById(staffSelect.value, _staffArrCache);
  if (!staffCode) {
    meta.textContent = 'Select teacher and date to view timetable.';
    body.innerHTML = '';
    return;
  }

  meta.textContent = 'Loading timetable...';
  body.innerHTML = '';
  fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`)
    .then(res => res.json())
    .then(data => {
      if (!data || data.success === false) {
        throw new Error(data && data.error ? data.error : 'Failed to load timetable');
      }
      renderTeacherTimetable(data.periods || [], data.teacherCode || staffCode, data.date || date, data.weekday || '');
    })
    .catch(() => {
      _currentTeacherTimetablePeriods = [];
      meta.textContent = 'Failed to load timetable for selected teacher/date.';
      body.innerHTML = '';
    });
}

function renderClassStudents(students = []) {
  const tbody = document.getElementById('classStudentsBody');
  const meta = document.getElementById('classStudentsMeta');
  const classSizeInput = document.getElementById('classSizeInput');
  if (!tbody || !meta) return;

  _currentClassStudents = Array.isArray(students) ? students.slice() : [];
  populatePartnerStudentOptions(_currentClassStudents);

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="4">No students found for this class.</td></tr>';
    meta.textContent = '0 students timetabled for selected class.';
    if (classSizeInput) classSizeInput.value = 0;
    return;
  }

  meta.textContent = `${students.length} students timetabled for selected class.`;
  if (classSizeInput) classSizeInput.value = students.length;
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${escHtml(s.id_number)}</td>
      <td>${escHtml(s.student_name)}</td>
      <td>${escHtml(s.form_class)}</td>
      <td>${escHtml(s.year_level)}</td>
    </tr>
  `).join('');
}

function fetchStudentsForClass(classCode) {
  const meta = document.getElementById('classStudentsMeta');
  const tbody = document.getElementById('classStudentsBody');
  if (!meta || !tbody) return;

  const requestSeq = ++_studentsFetchRequestSeq;

  if (!classCode) {
    _currentClassStudents = [];
    populatePartnerStudentOptions([]);
    meta.textContent = 'Choose a class to view students.';
    tbody.innerHTML = '<tr><td colspan="4">No class selected.</td></tr>';
    const classSizeInput = document.getElementById('classSizeInput');
    if (classSizeInput) classSizeInput.value = 1;
    return;
  }

  // Pass the current staff timetable code so the backend can triangulate the exact student token
  // e.g. teacher token 82B-MFOOD-F + staffCode RR → search for RR-MFOOD-F in student timetable
  // staffSelect.value is a DB id; look up the actual timetable code via _staffArrCache.
  const staffId = document.getElementById('staffSelect')?.value || '';
  const staffCode = getStaffCodeById(staffId, _staffArrCache);
  const url = staffCode
    ? `/api/student_upload/by-class/${encodeURIComponent(classCode)}?staffCode=${encodeURIComponent(staffCode)}`
    : `/api/student_upload/by-class/${encodeURIComponent(classCode)}`;

  meta.textContent = 'Loading students...';
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Ignore stale responses that arrive after a newer class selection.
      if (requestSeq !== _studentsFetchRequestSeq) return;
      renderClassStudents(data.students || []);
    })
    .catch(() => {
      if (requestSeq !== _studentsFetchRequestSeq) return;
      meta.textContent = 'Failed to load students for this class.';
      tbody.innerHTML = '<tr><td colspan="4">Could not load students.</td></tr>';
    });
}

function populateClassDropdown(staffCode) {
  let url = '/api/classes/dropdown';
  if (staffCode) url += '?staffCode=' + encodeURIComponent(staffCode);
  return fetch(url)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('classSelect');
      if (!select) return;
      select.innerHTML = '';
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Choose Class';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
      const classArr = (data.classes || []).filter(c => c && c.ttcode && c.name);
      const topClasses = getTopSelections('topClasses');
      // Sort: topClasses first, then rest
      const sorted = [
        ...topClasses.map(ttcode => classArr.find(c => c.ttcode === ttcode)).filter(Boolean),
        ...classArr.filter(c => !topClasses.includes(c.ttcode))
      ];
      if (sorted.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No classes available for this staff member';
        select.appendChild(opt);
        fetchStudentsForClass('');
        return;
      }
      sorted.forEach(cls => {
        if (!cls || !cls.ttcode || !cls.name) return;
        const opt = document.createElement('option');
        opt.value = cls.ttcode;
        // Only show TTCode and Name (and Level in brackets if present)
        if (cls.level) {
          opt.textContent = `${cls.ttcode} - ${cls.name} (${cls.level})`;
        } else {
          opt.textContent = `${cls.ttcode} - ${cls.name}`;
        }
        select.appendChild(opt);
      });
      fetchStudentsForClass('');
    });
}

// --- Populate Recipe Dropdown ---
function populateRecipeDropdown() {
  const dropdownUrl = '/api/recipes/display-dropdown' + (isFoodTruckStudentMode ? '?scope=food_truck' : '');
  fetch(dropdownUrl)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('recipeSelect');
      if (!select) return;
      select.innerHTML = '';
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Choose a recipe';
      defaultOption.disabled = true;
      defaultOption.selected = true;
      select.appendChild(defaultOption);
      (data.recipes || []).forEach(recipe => {
        const recipeId = recipe.recipeid != null ? recipe.recipeid : recipe.id;
        const recipeName = recipe.name || '';
        const opt = document.createElement('option');
        opt.value = String(recipeId);
        opt.textContent = `[ID: ${recipeId}] ${recipeName}`;
        opt.setAttribute('data-recipe-id', String(recipeId));
        opt.setAttribute('data-recipe-name', recipeName);
        select.appendChild(opt);
      });

      if (pendingSharedRecipeId || pendingSharedRecipeName) {
        const selected = applyRecipeSelection(pendingSharedRecipeId, pendingSharedRecipeName);
        if (selected) {
          pendingSharedRecipeId = '';
          pendingSharedRecipeName = '';
        }
      }
    });
}

function buildDesiredServingsIngredients(rows, desiredServings) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const baseQty = row.measure_qty;
    let calculatedQty = baseQty;

    if (baseQty && !isNaN(parseFloat(baseQty))) {
      calculatedQty = (parseFloat(baseQty) * desiredServings).toString();
    }

    return {
      ingredient_id: row.id,
      ingredient_name: row.ingredient_name,
      measure_qty: row.measure_qty,
      measure_unit: row.measure_unit,
      fooditem: row.fooditem,
      calculated_qty: calculatedQty,
      stripFoodItem: row.strip_fooditem || row.stripFoodItem || '',
      aisle_category_id: row.aisle_category_id || ''
    };
  });
}

function saveDesiredServingsInBackground(details = {}) {
  const recipeId = String(details.recipeId || '').trim();
  const classSize = parseInt(String(details.classSize || '').trim(), 10);
  const groups = parseInt(String(details.groups || '').trim(), 10);

  if (!recipeId) {
    return Promise.reject(new Error('Recipe is required for desired servings calculation.'));
  }
  if (isNaN(classSize) || classSize <= 0) {
    return Promise.reject(new Error('Class size is required for desired servings calculation.'));
  }
  if (isNaN(groups) || groups <= 0) {
    return Promise.reject(new Error('Groups is required for desired servings calculation.'));
  }

  const desiredServings = Math.ceil(classSize / groups);

  const syncPromise = fetch('/api/ingredients/inventory/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId, reseed: true })
  })
    .then(res => res.json().catch(() => ({})))
    .catch(() => ({}));

  return syncPromise.then(() => fetch('/api/ingredients/inventory/all'))
    .then(res => res.json())
    .then(data => {
      const ingredients = Array.isArray(data)
        ? data
        : (Array.isArray(data.data) ? data.data : (Array.isArray(data.ingredients) ? data.ingredients : []));
      const filteredIngredients = ingredients.filter(row => String(row.recipe_id) === recipeId);

      if (!filteredIngredients.length) {
        throw new Error('No recipe ingredients were found to calculate desired servings.');
      }

      return fetch('/api/ingredients/desired_servings_ingredients/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: details.bookingId || '',
          teacher: details.teacher || '',
          staff_id: details.staffId || '',
          class_name: details.className || '',
          class_date: details.bookingDate || '',
          class_size: classSize,
          groups,
          desired_servings: desiredServings,
          recipe_id: recipeId,
          ingredients: buildDesiredServingsIngredients(filteredIngredients, desiredServings)
        })
      });
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data && data.error ? data.error : 'Failed to save desired serving ingredients.');
      }
      return data;
    });
}

// --- Save Booking ---

function saveBooking(options = {}) {
  const shouldAutoCalculate = !!options.autoCalculate;
  const staffSelect = document.getElementById('staffSelect');
  const classSelect = document.getElementById('classSelect');
  const dateInput = document.getElementById('dateInput');
  const periodSelect = document.getElementById('periodSelect');
  const recipeSelect = document.getElementById('recipeSelect');
  const classSizeInput = document.getElementById('classSizeInput');
  const groupsInput = document.getElementById('groupsInput');
  const cookModeSelect = document.getElementById('cookModeSelect');
  const partnerStudentSelect = document.getElementById('partnerStudentSelect');
  const staffId = staffSelect.value;
  const staffName = isFoodTruckStudentMode
    ? String(_foodTruckStudentIdentity.name || (staffSelect.options[staffSelect.selectedIndex] && staffSelect.options[staffSelect.selectedIndex].textContent) || 'Student').trim()
    : String(staffSelect.options[staffSelect.selectedIndex] && staffSelect.options[staffSelect.selectedIndex].textContent || '').trim();
  const className = classSelect.value;
  const bookingDate = dateInput.value;
  const period = periodSelect.value;
  const classSize = classSizeInput.value;
  const parsedGroupsFromInput = parseInt(String((groupsInput && groupsInput.value) || '').trim(), 10);
  let groupsForBooking = !isNaN(parsedGroupsFromInput) && parsedGroupsFromInput > 0
    ? String(parsedGroupsFromInput)
    : '1';
  if (groupsInput) {
    groupsInput.value = groupsForBooking;
  }

  const cookMode = isFoodTruckStudentMode ? String(cookModeSelect && cookModeSelect.value || 'single').toLowerCase() : '';
  const partnerStudentId = isFoodTruckStudentMode ? String(partnerStudentSelect && partnerStudentSelect.value || '').trim() : '';
  const partnerStudentName = (isFoodTruckStudentMode && partnerStudentSelect && partnerStudentSelect.selectedIndex > 0)
    ? String(partnerStudentSelect.options[partnerStudentSelect.selectedIndex].getAttribute('data-student-name') || '').trim()
    : '';

  if (isFoodTruckStudentMode && cookMode === 'pair' && !partnerStudentName) {
    if (window.QC) window.QC.toast('Choose your partner student for pair cooking', 'warn');
    else alert('Choose your partner student for pair cooking.');
    return Promise.reject(new Error('Partner student is required for pair cooking.'));
  }

  if (isFoodTruckStudentMode && cookMode === 'single' && partnerStudentSelect) {
    partnerStudentSelect.value = '';
  }

  const dateInfo = (window.NZSchoolCalendar && typeof window.NZSchoolCalendar.getDateInfo === 'function')
    ? window.NZSchoolCalendar.getDateInfo(bookingDate)
    : null;
  if (dateInfo && dateInfo.valid && dateInfo.isSchoolClosed) {
    const reasons = [];
    if (dateInfo.isWeekend) reasons.push('weekend');
    if (dateInfo.isSchoolHoliday) reasons.push('school holidays');
    if (dateInfo.isPublicHoliday && dateInfo.publicHolidayName) reasons.push(dateInfo.publicHolidayName);
    if (dateInfo.isAdditionalSchoolClosedDay && dateInfo.additionalSchoolClosedDayName) reasons.push(dateInfo.additionalSchoolClosedDayName);
    const reasonText = reasons.length ? reasons.join(' / ') : 'school closure';
    const proceed = window.confirm(`Selected date ${bookingDate} is marked as ${reasonText}. Save booking anyway?`);
    if (!proceed) {
      return Promise.reject(new Error('Booking cancelled due to school closure date.'));
    }
  }

  // Get recipe_id from selected option (assume dropdown options have data-recipe-id)
  let recipeId = '';
  let recipeName = '';
  if (recipeSelect.selectedIndex > 0) {
    const selectedRecipeOption = recipeSelect.options[recipeSelect.selectedIndex];
    recipeId = selectedRecipeOption.getAttribute('data-recipe-id') || selectedRecipeOption.value || '';
    recipeName = selectedRecipeOption.getAttribute('data-recipe-name') || '';
  }

  // Track most selected
  setTopSelection('topStaff', staffId);
  incrementStaffUsageCount(staffId);
  setTopSelection('topClasses', className);
  const editId = document.getElementById('saveBookingBtn').dataset.editId;
  const method = editId ? 'PUT' : 'POST';
  const url = editId ? `/api/bookings/${editId}` : '/api/bookings';
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      staff_id: staffId,
      staff_name: staffName,
      class_name: className,
      booking_date: bookingDate,
      period,
      recipe: recipeName,
      recipe_id: recipeId,
      class_size: classSize,
      groups: groupsForBooking,
      planner_stream: isFoodTruckStudentMode ? 'Food Truck' : (forcedPlannerStream || undefined),
      cook_mode: isFoodTruckStudentMode ? cookMode : undefined,
      partner_student_name: isFoodTruckStudentMode && cookMode === 'pair' ? partnerStudentName : undefined,
      partner_student_id: isFoodTruckStudentMode && cookMode === 'pair' ? partnerStudentId : undefined
    })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        if (window.QC) window.QC.toast('Booking saved successfully', 'success');
        const savedBookingId = result.booking_id || editId || '';

        if (shouldAutoCalculate) {
          return saveDesiredServingsInBackground({
            bookingId: savedBookingId,
            teacher: staffName,
            staffId,
            className,
            bookingDate,
            classSize,
            groups: groupsForBooking,
            recipeId
          }).then(() => {
            if (window.QC) window.QC.toast('Desired serving ingredients saved', 'success');
            clearFormEditMode();
            document.getElementById('resetBtn').click();
            fetchAndRenderBookings();
            writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
            return result;
          }).catch(err => {
            if (window.QC) window.QC.toast('Booking saved, but desired servings failed', 'warn');
            else alert('Booking saved, but desired servings failed.');
            console.error('Desired servings background save failed:', err);
            fetchAndRenderBookings();
            writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
            return { ...result, desiredServingsSaved: false, desiredServingsError: err.message || String(err) };
          });
        }

        clearFormEditMode();
        document.getElementById('resetBtn').click();
        fetchAndRenderBookings();
        writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
        return result;
      } else {
        if (window.QC) window.QC.toast('Failed to save booking', 'error');
        else alert('Failed to save booking.');
        throw new Error('Failed to save booking.');
      }
    })
    .catch((err) => {
      if (window.QC) window.QC.toast('Failed to save booking', 'error');
      else alert('Failed to save booking.');
      throw err;
    });
}

// Helper to get staff id by name (for edit)
function getStaffIdByName(staffName) {
  const match = (_staffArrCache || []).find(s => `${s.last_name}, ${s.first_name}` === staffName || `${s.code} - ${s.last_name}, ${s.first_name}` === staffName);
  return match ? match.id : '';
}


// --- Fetch and Render Bookings ---
function fetchAndRenderBookings() {
  const scheduledSection = document.getElementById('adminScheduledBookingsSection');
  if (isTeacherEmbedView || !scheduledSection || scheduledSection.offsetParent === null) {
    return;
  }

  fetch('/api/bookings/all', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      renderBookings(data.bookings || []);
    });
}

function renderBookings(bookings = []) {
  const tbody = document.getElementById('scheduledBookings');
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No bookings found.</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => {
    // Format date using the browser locale.
    let formattedDate = '';
    if (b.booking_date) {
      try {
        const dateObj = parseBookingDate(b.booking_date);
        formattedDate = localDateFormatter.format(dateObj);
      } catch {
        formattedDate = b.booking_date;
      }
    }
    return `<tr data-booking-id="${escHtml(String(b.id || ''))}">
      <td>${escHtml(String(b.id || ''))}</td>
      <td>${escHtml(formattedDate)}</td>
      <td>${escHtml(String(b.period || ''))}</td>
      <td>${escHtml(b.staff_name)}</td>
      <td>${escHtml(b.class_name)}</td>
      <td>${escHtml(String(b.class_size || ''))}</td>
      <td>${b.recipe_id ? `[ID: ${escHtml(String(b.recipe_id))}] ` : ''}${escHtml(b.recipe)}</td>
      <td><button class='edit-btn'>Edit</button> <button class='delete-btn'>Delete</button></td>
    </tr>`;
  }).join('');
  // Attach event listeners for delete
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      if (confirm('Delete this booking?')) {
        fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              if (window.QC) window.QC.toast('Booking deleted', 'success');
              fetchAndRenderBookings();
            } else {
              if (window.QC) window.QC.toast('Failed to delete booking', 'error');
              else alert('Failed to delete booking.');
            }
          })
          .catch(() => {
            if (window.QC) window.QC.toast('Failed to delete booking', 'error');
            else alert('Failed to delete booking.');
          });
      }
    };
  });
  function loadBookingIntoForm(booking) {
    if (!booking) return;
    const staffSelect = document.getElementById('staffSelect');
    const classSelect = document.getElementById('classSelect');
    const dateInput = document.getElementById('dateInput');
    const periodSelect = document.getElementById('periodSelect');
    const recipeSelect = document.getElementById('recipeSelect');
    const classSizeInput = document.getElementById('classSizeInput');
    const groupsInput = document.getElementById('groupsInput');
    const cookModeSelect = document.getElementById('cookModeSelect');

    const bookingStaffId = String(booking.staff_id || getStaffIdByName(booking.staff_name) || '');
    if (staffSelect && bookingStaffId) {
      staffSelect.value = bookingStaffId;
    }
    const staffCode = getStaffCodeById(bookingStaffId, _staffArrCache);
    populateClassDropdown(staffCode).then(() => {
      if (classSelect) {
        classSelect.value = booking.class_name || '';
        fetchStudentsForClass(classSelect.value || '');
      }
    });

    if (dateInput) {
      dateInput.value = booking.booking_date || '';
      updateBookingDateDayLabel();
    }
    if (periodSelect) {
      periodSelect.value = String(booking.period || '');
    }
    if (recipeSelect) {
      const recipeIdValue = booking.recipe_id ? String(booking.recipe_id) : '';
      if (recipeIdValue) {
        recipeSelect.value = recipeIdValue;
      } else if (booking.recipe) {
        const optionByName = Array.from(recipeSelect.options).find(opt => (opt.getAttribute('data-recipe-name') || '').trim() === String(booking.recipe).trim());
        if (optionByName) recipeSelect.value = optionByName.value;
      }
    }
    if (classSizeInput) {
      classSizeInput.value = booking.class_size || '';
    }
    if (groupsInput) {
      groupsInput.value = booking.groups || groupsInput.value || '1';
    }
    if (cookModeSelect) {
      cookModeSelect.value = String(booking.cook_mode || 'single').toLowerCase() === 'pair' ? 'pair' : 'single';
    }
    _pendingPartnerStudentId = String(booking.partner_student_id || '');
    setPartnerFieldVisibility();
    populatePartnerStudentOptions(_currentClassStudents);
    if (_pendingPartnerStudentId && document.getElementById('partnerStudentSelect')) {
      const partnerSelect = document.getElementById('partnerStudentSelect');
      const partnerByName = Array.from(partnerSelect.options || []).find((opt) => {
        const candidateName = String(opt.getAttribute('data-student-name') || '').trim().toLowerCase();
        const expectedName = String(booking.partner_student_name || '').trim().toLowerCase();
        return expectedName && candidateName === expectedName;
      });
      if (partnerByName) {
        partnerSelect.value = partnerByName.value;
      }
    }
    setFormEditMode(booking.id);
    writeSharedEmbedState({
      ...getCurrentEmbedState(),
      staffId: bookingStaffId,
      className: booking.class_name || '',
      bookingDate: booking.booking_date || '',
      period: String(booking.period || ''),
      recipeId: booking.recipe_id ? String(booking.recipe_id) : '',
      classSize: String(booking.class_size || ''),
      groups: String(booking.groups || (groupsInput && groupsInput.value) || '1'),
      cookMode: String(booking.cook_mode || 'single').toLowerCase() === 'pair' ? 'pair' : 'single',
      partnerStudentId: String(booking.partner_student_id || ''),
      partnerStudentName: String(booking.partner_student_name || ''),
      editBookingId: String(booking.id || '')
    }, { force: true });
  }

  // Attach event listeners for edit
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      // Find booking data
      const booking = bookings.find(b => String(b.id) === String(bookingId));
      if (!booking) return;
      loadBookingIntoForm(booking);
    };
  });
}

// --- Event Listeners ---
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/staff_upload/dropdown')
    .then(res => res.json())
    .then(async (data) => {
      _staffArrCache = data.staff || [];
      const currentUser = isFoodTruckStudentMode
        ? null
        : await readCurrentStaffUserWithAuthFallback();
      _preferredStaffId = isFoodTruckStudentMode
        ? ''
        : resolveLoggedInStaffId(_staffArrCache, currentUser);
      if (_preferredStaffId) {
        setTopSelection('topStaff', _preferredStaffId);
      }
      if (isFoodTruckStudentMode) {
        _foodTruckStudentIdentity = await readCurrentFoodTruckStudentIdentity();
      }
      return populateStaffDropdown(_staffArrCache).then(() => {
        if (isFoodTruckStudentMode) {
          applyFoodTruckStudentModeToForm();
        }
        const sharedState = readSharedEmbedState();
        const firstStaffId = sharedState && sharedState.staffId
          ? sharedState.staffId
          : (isFoodTruckStudentMode
              ? String(_foodTruckStudentIdentity.id || _foodTruckStudentIdentity.email || '')
              : (_preferredStaffId || (_staffArrCache.length ? _staffArrCache[0].id : '')));
        const staffSelect = document.getElementById('staffSelect');
        if (staffSelect && firstStaffId) {
          staffSelect.value = firstStaffId;
        }
        const effectiveStaffId = ensureStaffSelected(firstStaffId);
        const staffCode = getStaffCodeById(effectiveStaffId, _staffArrCache);
          // Trigger timetable immediately — don't wait for class dropdown population
          fetchTeacherTimetableForSelectedDate();
          return populateClassDropdown(staffCode).then(() => applySharedEmbedState(sharedState || getCurrentEmbedState()));
      });
    });

  const dateInput = document.getElementById('dateInput');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const dow = today.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 6) today.setDate(today.getDate() + 2); // Sat → Mon
    else if (dow === 0) today.setDate(today.getDate() + 1); // Sun → Mon
    dateInput.value = toLocalIsoDate(today);
  }
  updateBookingDateDayLabel();
  updateTeacherTimetableDaySelector();

  populateRecipeDropdown();
  fetchAndRenderBookings();
  document.getElementById('saveBookingBtn').addEventListener('click', () => {
    saveBooking({ autoCalculate: false }).catch(() => {});
  });
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  if (masterSaveBtn) {
    masterSaveBtn.addEventListener('click', () => {
      saveBooking({ autoCalculate: true }).catch(() => {});
    });
  }
  const deleteBookingBtn = document.getElementById('deleteBookingBtn');
  if (deleteBookingBtn) {
    deleteBookingBtn.addEventListener('click', () => {
      const saveBtn = document.getElementById('saveBookingBtn');
      const bookingId = saveBtn && saveBtn.dataset ? String(saveBtn.dataset.editId || '').trim() : '';
      if (!bookingId) {
        if (window.QC) window.QC.toast('Select an existing booking first', 'warn');
        return;
      }
      if (!confirm('Delete this booking?')) return;
      fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(result => {
          if (!result || !result.success) {
            throw new Error((result && (result.error || result.message)) || 'Delete failed');
          }
          clearFormEditMode();
          document.getElementById('resetBtn').click();
          fetchAndRenderBookings();
          writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
          if (window.QC) window.QC.toast('Booking deleted', 'success');
        })
        .catch((err) => {
          console.error('[Book a Class] Delete failed', err);
          if (window.QC) window.QC.toast('Failed to delete booking', 'error');
          else alert('Failed to delete booking.');
        });
    });
  }
  document.getElementById('resetBtn').addEventListener('click', () => {
    clearFormEditMode();
    document.getElementById('classSizeInput').value = 1;
    document.getElementById('groupsInput').value = 1;
    const cookModeSelect = document.getElementById('cookModeSelect');
    const partnerStudentSelect = document.getElementById('partnerStudentSelect');
    if (cookModeSelect) cookModeSelect.value = 'single';
    if (partnerStudentSelect) partnerStudentSelect.value = '';
    setPartnerFieldVisibility();
    document.getElementById('recipeSelect').selectedIndex = 0;
    setRecipeSelectionInfo('');
    document.getElementById('periodSelect').selectedIndex = 0;
    document.getElementById('dateInput').value = toLocalIsoDate(new Date());
    updateBookingDateDayLabel();
    document.getElementById('classSelect').selectedIndex = 0;
    const staffSelect = document.getElementById('staffSelect');
    if (staffSelect) {
      if (isFoodTruckStudentMode) {
        staffSelect.value = String(_foodTruckStudentIdentity.id || _foodTruckStudentIdentity.email || staffSelect.value || '');
      } else if (_preferredStaffId) {
        staffSelect.value = _preferredStaffId;
      } else {
        staffSelect.selectedIndex = 0;
      }
    }
    // Reset class dropdown to first staff
    const staffId = document.getElementById('staffSelect').value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('staffSelect').addEventListener('change', function() {
    if (isFoodTruckStudentMode) {
      return;
    }
    const staffId = this.value;
    setTopSelection('topStaff', staffId);
    incrementStaffUsageCount(staffId);
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState({ ...getCurrentEmbedState(), staffId, className: '' });
  });
  document.getElementById('dateInput').addEventListener('change', function() {
    updateBookingDateDayLabel();
    updateTeacherTimetableDaySelector();
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState(getCurrentEmbedState());
  });

  document.querySelectorAll('#teacherTimetableDaySelector .teacher-day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      jumpTeacherTimetableToWeekday(btn.getAttribute('data-weekday'));
    });
  });
  document.getElementById('periodSelect').addEventListener('change', function() {
    autoSelectClassFromSelectedPeriod();
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('recipeSelect').addEventListener('change', function() {
    setRecipeSelectionInfo('');
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('classSelect').addEventListener('change', function() {
    fetchStudentsForClass(this.value);
    writeSharedEmbedState(getCurrentEmbedState());
  });
  const groupsInput = document.getElementById('groupsInput');
  if (groupsInput) {
    groupsInput.addEventListener('change', () => {
      writeSharedEmbedState(getCurrentEmbedState());
    });
  }
  const cookModeSelect = document.getElementById('cookModeSelect');
  if (cookModeSelect) {
    cookModeSelect.addEventListener('change', () => {
      setPartnerFieldVisibility();
      writeSharedEmbedState(getCurrentEmbedState());
    });
  }
  const partnerStudentSelect = document.getElementById('partnerStudentSelect');
  if (partnerStudentSelect) {
    partnerStudentSelect.addEventListener('change', () => {
      writeSharedEmbedState(getCurrentEmbedState());
    });
  }
  fetchStudentsForClass('');
  fetchTeacherTimetableForSelectedDate();

  // --- Timetable-panel action buttons (visible in timetable-only iframe) ---
  if (isTimetableOnlyView && bookClassActionChannel) {
    const timetableFormActions = document.getElementById('timetableFormActions');
    if (timetableFormActions) timetableFormActions.style.display = 'flex';

    document.getElementById('timetableSaveBtn').addEventListener('click', () => {
      bookClassActionChannel.postMessage({ action: 'save', ts: Date.now() });
    });
    document.getElementById('timetableResetBtn').addEventListener('click', () => {
      bookClassActionChannel.postMessage({ action: 'reset', ts: Date.now() });
    });
    const timetableDeleteBtn = document.getElementById('timetableDeleteBtn');
    // Mirror delete-button visibility from shared state label changes
    if (bookClassSharedChannel) {
      bookClassSharedChannel.addEventListener('message', event => {
        if (!event || !event.data) return;
        const editId = String(event.data.editBookingId || '').trim();
        if (timetableDeleteBtn) timetableDeleteBtn.style.display = editId ? '' : 'none';
        // Also mirror save/reset label
        const saveBtn = document.getElementById('timetableSaveBtn');
        if (saveBtn) saveBtn.textContent = editId ? 'UPDATE' : 'SAVE';
      });
    }
    if (timetableDeleteBtn) {
      timetableDeleteBtn.addEventListener('click', () => {
        bookClassActionChannel.postMessage({ action: 'delete', ts: Date.now() });
      });
    }
  }

  // --- Form iframe: listen for action commands from timetable panel ---
  if (isFormOnlyView && bookClassActionChannel) {
    bookClassActionChannel.addEventListener('message', event => {
      if (!event || !event.data || !event.data.action) return;
      if (event.data.action === 'save') {
        const btn = document.getElementById('masterSaveBtn');
        if (btn) btn.click();
      } else if (event.data.action === 'reset') {
        const btn = document.getElementById('resetBtn');
        if (btn) btn.click();
      } else if (event.data.action === 'delete') {
        const btn = document.getElementById('deleteBookingBtn');
        if (btn) btn.click();
      }
    });
  }

  if (isTeacherEmbedView) {
    if (bookClassSharedChannel) {
      bookClassSharedChannel.addEventListener('message', event => {
        if (!event || !event.data) return;
        applySharedEmbedState(event.data);
      });
    }

    if (canPublishSharedEmbedState) {
      window.setTimeout(() => {
        writeSharedEmbedState(getCurrentEmbedState());
      }, 250);
    }
  }

  if (window.QC) {
    window.QC.addSanityButton('Book a Class', [
      {
        name: 'Staff dropdown has options',
        run: async () => {
          const el = document.getElementById('staffSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Class dropdown present',
        run: async () => {
          const el = document.getElementById('classSelect');
          return !!el;
        }
      },
      {
        name: 'Recipe dropdown has options',
        run: async () => {
          const el = document.getElementById('recipeSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Timetable endpoint reachable',
        run: async () => {
          const staffCode = getStaffCodeById(document.getElementById('staffSelect')?.value, _staffArrCache);
          const date = document.getElementById('dateInput')?.value;
          if (!staffCode || !date) return true;
          const res = await fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`);
          return res.ok;
        }
      }
    ]);
  }
});
