const roleForm = document.querySelector("#add-role-form");
const roleStatus = document.querySelector("#user-role-status");
const roleTableBody = document.querySelector("#user-role-table tbody");
const staffList = document.querySelector("#staff-list");
const staffSearch = document.querySelector("#staff-search");
const studentList = document.querySelector("#student-list");
const studentSearch = document.querySelector("#student-search");
const hubAuthSummary = document.querySelector("#hub-auth-summary");
const hubRoleAuthNote = document.querySelector("#hub-role-auth-note");
// hubSignOutButton, hubUserBadge, HUB_AUTH_STORAGE_KEY and hubAllowedDomain are already declared
// as globals by script.js (loaded before this file) - redeclaring them here throws a SyntaxError
// that silently stops this entire script from running.

function getHubStoredAuthRaw() {
  let localValue = null;
  let sessionValue = null;

  try {
    localValue = localStorage.getItem(HUB_AUTH_STORAGE_KEY);
  } catch (_error) {
    localValue = null;
  }

  try {
    sessionValue = sessionStorage.getItem(HUB_AUTH_STORAGE_KEY);
  } catch (_error) {
    sessionValue = null;
  }

  if (!localValue && sessionValue) {
    try {
      localStorage.setItem(HUB_AUTH_STORAGE_KEY, sessionValue);
    } catch (_error) {
    }
  }

  return localValue || sessionValue;
}

function clearHubStoredAuthRaw() {
  try {
    localStorage.removeItem(HUB_AUTH_STORAGE_KEY);
  } catch (_error) {
  }

  try {
    sessionStorage.removeItem(HUB_AUTH_STORAGE_KEY);
  } catch (_error) {
  }
}

let cachedStaffRows = [];
let cachedStudentRows = [];
let selectedStaffEmail = "";
let selectedStudentKey = "";
let activeHubProfile = null;

function getHubDisplayName(profile) {
  if (!profile) return "";
  return String(profile.name || profile.given_name || profile.email || "").trim();
}

function getHubUserInitials(profile) {
  const name = getHubDisplayName(profile);
  if (!name) return "--";

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function normalizeHubAuthProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== "object") {
    return null;
  }

  const email = String(rawProfile.email || "").trim().toLowerCase();
  if (!email) {
    return null;
  }

  if (hubAllowedDomain && !email.endsWith(`@${hubAllowedDomain}`)) {
    return null;
  }

  return {
    email,
    name: getHubDisplayName(rawProfile),
    given_name: String(rawProfile.given_name || "").trim(),
    family_name: String(rawProfile.family_name || "").trim()
  };
}

function loadHubProfile() {
  const raw = getHubStoredAuthRaw();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const profile = normalizeHubAuthProfile(parsed?.profile);

    if (profile) {
      if (!(parsed?.idToken || parsed?.accessToken) || !parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
        try {
          localStorage.setItem(HUB_AUTH_STORAGE_KEY, JSON.stringify({
            accessToken: null,
            expiresAt: 0,
            profile: parsed.profile
          }));
        } catch (_error) {
        }
      }

      return profile;
    }

    clearHubStoredAuthRaw();
    return null;
  } catch (_error) {
    clearHubStoredAuthRaw();
    return null;
  }
}

function renderHubAuthState() {
  activeHubProfile = loadHubProfile();
  const isSignedIn = Boolean(activeHubProfile?.email);
  const displayName = getHubDisplayName(activeHubProfile);

  if (hubAuthSummary) {
    hubAuthSummary.textContent = isSignedIn
      ? `Signed in as ${displayName || activeHubProfile.email}`
      : "Not signed in";
  }

  if (hubRoleAuthNote) {
    hubRoleAuthNote.textContent = isSignedIn
      ? `Google account loaded: ${activeHubProfile.email}. You can use it directly in the form or staff picker.`
      : "Sign in with Google to load your account into this admin tool.";
  }

  if (hubSignOutButton) {
    hubSignOutButton.hidden = !isSignedIn;
  }

  if (hubUserBadge) {
    hubUserBadge.hidden = !isSignedIn;
    hubUserBadge.textContent = isSignedIn ? getHubUserInitials(activeHubProfile) : "";
    hubUserBadge.title = isSignedIn ? (displayName || activeHubProfile.email) : "";
  }
}

function buildSignedInStaffRow() {
  if (!activeHubProfile?.email) {
    return null;
  }

  return {
    first_name: activeHubProfile.given_name,
    last_name: activeHubProfile.family_name,
    display_name: activeHubProfile.name,
    email_school: activeHubProfile.email,
    primary_role: "Staff",
    source: "google-session"
  };
}

function mergeSignedInStaffRow(rows) {
  const normalizedRows = Array.isArray(rows) ? [...rows] : [];
  const signedInRow = buildSignedInStaffRow();

  if (!signedInRow) {
    return normalizedRows;
  }

  const existingIndex = normalizedRows.findIndex((row) => getStaffEmail(row) === signedInRow.email_school);
  if (existingIndex >= 0) {
    normalizedRows[existingIndex] = {
      ...signedInRow,
      ...normalizedRows[existingIndex]
    };
    return normalizedRows;
  }

  return [signedInRow, ...normalizedRows];
}

function getStaffDisplayName(row) {
  const firstName = String(row.first_name || row.firstname || row.first || "").trim();
  const lastName = String(row.last_name || row.lastname || row.surname || "").trim();
  const displayName = String(row.display_name || row.name || "").trim();

  if (displayName) return displayName;
  return [firstName, lastName].filter(Boolean).join(" ") || String(row.email || row.email_school || row.user_email || "").split("@")[0];
}

function getStaffEmail(row) {
  return String(row.email_school || row.email || row.user_email || row.staff_email || "").trim().toLowerCase();
}

function getStaffCode(row) {
  return String(row.code || row.staff_code || row.employee_code || "").trim();
}

function getStaffType(row) {
  const rawType = String(row.primary_role || row.user_type || row.staff_type || row.title || "Staff").trim();
  const normalizedType = rawType.toLowerCase();

  if (!normalizedType) {
    return "Staff";
  }

  if (normalizedType.includes("student")) {
    return "Student";
  }

  if (normalizedType.includes("admin")) {
    return "Admin";
  }

  if (normalizedType.includes("technician") || normalizedType.includes("tech")) {
    return "Technician";
  }

  if (normalizedType.includes("lead")) {
    return "Lead Teacher";
  }

  if (normalizedType.includes("teacher")) {
    return "Teacher";
  }

  if (normalizedType.includes("principal") || normalizedType === "vp") {
    return "Staff";
  }

  return "Staff";
}

function getStudentDisplayName(row) {
  return String(row.student_name || row.name || row.display_name || "").trim();
}

function getStudentIdNumber(row) {
  return String(row.id_number || row.student_id || row.idnumber || "").trim();
}

function getStudentFormClass(row) {
  return String(row.form_class || row.formclass || "").trim();
}

function normalizeEmailValue(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeLocalPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");
}

function getStudentDomain() {
  return hubAllowedDomain || "westlandhigh.school.nz";
}

function splitStudentName(row) {
  const raw = getStudentDisplayName(row);
  if (!raw) {
    return { firstName: "", lastName: "" };
  }

  if (raw.includes(",")) {
    const [last, first] = raw.split(",", 2).map((part) => String(part || "").trim());
    return { firstName: first || "", lastName: last || "" };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts[parts.length - 1] : ""
  };
}

function getStudentEmailInfo(row) {
  const directCandidates = [
    row.email_school,
    row.student_email,
    row.email,
    row.user_email,
    row.email_address,
    row.school_email,
    row.google_email,
    row.student_google_email,
    row.student_mail,
    row.mail
  ];

  for (const candidate of directCandidates) {
    const value = normalizeEmailValue(candidate);
    if (value && value.includes("@")) {
      return { email: value, source: "exact" };
    }
  }

  const usernameCandidates = [
    row.username,
    row.user_name,
    row.student_username,
    row.login,
    row.student_login,
    row.upn
  ];

  for (const candidate of usernameCandidates) {
    const value = normalizeEmailValue(candidate);
    if (!value) continue;
    if (value.includes("@")) {
      return { email: value, source: "exact" };
    }
    const localPart = sanitizeLocalPart(value);
    if (localPart) {
      return { email: `${localPart}@${getStudentDomain()}`, source: "guess" };
    }
  }

  const { firstName, lastName } = splitStudentName(row);
  const localPart = sanitizeLocalPart([firstName, lastName].filter(Boolean).join("."));
  if (localPart) {
    return { email: `${localPart}@${getStudentDomain()}`, source: "guess" };
  }

  return { email: "", source: "none" };
}

function getStudentEmail(row) {
  return getStudentEmailInfo(row).email;
}

function getStudentKey(row) {
  return getStudentEmail(row) || getStudentIdNumber(row) || getStudentDisplayName(row);
}

function populateRoleFormFromStaff(row) {
  if (!roleForm) return;

  const userEmailField = roleForm.querySelector('[name="userEmail"]');
  const userTypeField = roleForm.querySelector('[name="userType"]');
  const displayName = getStaffDisplayName(row);
  const email = getStaffEmail(row);
  const code = getStaffCode(row);

  if (userEmailField) userEmailField.value = email || "";
  if (userTypeField) userTypeField.value = getStaffType(row);

  selectedStaffEmail = email;
  selectedStudentKey = "";
  if (staffList) {
    staffList.querySelectorAll(".staff-chip").forEach((chip) => {
      chip.classList.toggle("is-selected", chip.dataset.email === selectedStaffEmail);
    });
  }
  if (studentList) {
    studentList.querySelectorAll(".staff-chip").forEach((chip) => chip.classList.remove("is-selected"));
  }

  setStatus(`Selected ${displayName}${code ? ` (${code})` : ""}. Choose an additional role to add.`);
}

function populateRoleFormFromStudent(row) {
  if (!roleForm) return;

  const userEmailField = roleForm.querySelector('[name="userEmail"]');
  const userTypeField = roleForm.querySelector('[name="userType"]');
  const displayName = getStudentDisplayName(row);
  const idNumber = getStudentIdNumber(row);
  const formClass = getStudentFormClass(row);
  const emailInfo = getStudentEmailInfo(row);
  const email = emailInfo.email;

  if (userEmailField) userEmailField.value = email || "";
  if (userTypeField) userTypeField.value = "Student";

  selectedStudentKey = getStudentKey(row);
  selectedStaffEmail = "";

  if (studentList) {
    studentList.querySelectorAll(".staff-chip").forEach((chip) => {
      chip.classList.toggle("is-selected", chip.dataset.studentKey === selectedStudentKey);
    });
  }
  if (staffList) {
    staffList.querySelectorAll(".staff-chip").forEach((chip) => chip.classList.remove("is-selected"));
  }

  if (emailInfo.source === "exact") {
    setStatus(`Selected ${displayName}${idNumber ? ` (${idNumber})` : ""}. Choose an additional role to add.`);
    return;
  }

  if (emailInfo.source === "guess") {
    setStatus(
      `Selected ${displayName}${idNumber ? ` (${idNumber})` : ""}. Suggested email loaded; please confirm it before adding a role.`
    );
    return;
  }

  setStatus(
    `Selected ${displayName}${idNumber ? ` (${idNumber})` : ""}${formClass ? ` from ${formClass}` : ""}. Enter the student's Google email, then choose an additional role to add.`
  );
}

function renderStaffList(rows) {
  if (!staffList) return;

  const query = String(staffSearch?.value || "").trim().toLowerCase();
  const hasQuery = Boolean(query);
  const filtered = rows.filter((row) => {
    const name = getStaffDisplayName(row).toLowerCase();
    const email = getStaffEmail(row);
    return hasQuery && (name.includes(query) || email.includes(query));
  });

  staffList.innerHTML = "";

  if (!hasQuery) {
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    empty.textContent = "Start typing to search staff.";
    staffList.appendChild(empty);
    return;
  }

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    empty.textContent = rows.length ? "No staff matched your search." : "No staff records are available from this site yet.";
    staffList.appendChild(empty);
    return;
  }

  filtered.forEach((row) => {
    const name = getStaffDisplayName(row);
    const email = getStaffEmail(row);
    const code = getStaffCode(row);
    const isSignedInUser = Boolean(activeHubProfile?.email) && email === activeHubProfile.email;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "staff-chip";
    chip.dataset.email = email;
    chip.innerHTML = `
      <strong>${name}</strong>
      <span>${email}</span>
      ${code ? `<small>${code}</small>` : isSignedInUser ? `<small>Signed-in account</small>` : ""}
    `;
    chip.addEventListener("click", () => populateRoleFormFromStaff(row));
    staffList.appendChild(chip);
  });
}

function renderStudentList(rows) {
  if (!studentList) return;

  const query = String(studentSearch?.value || "").trim().toLowerCase();
  const hasQuery = Boolean(query);
  const filtered = rows.filter((row) => {
    const name = getStudentDisplayName(row).toLowerCase();
    const idNumber = getStudentIdNumber(row).toLowerCase();
    const formClass = getStudentFormClass(row).toLowerCase();
    return hasQuery && (name.includes(query) || idNumber.includes(query) || formClass.includes(query));
  });

  studentList.innerHTML = "";

  if (!hasQuery) {
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    empty.textContent = "Start typing to search students.";
    studentList.appendChild(empty);
    return;
  }

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty-state";
    empty.textContent = rows.length ? "No students matched your search." : "No students are available from this site yet.";
    studentList.appendChild(empty);
    return;
  }

  filtered.forEach((row) => {
    const name = getStudentDisplayName(row);
    const idNumber = getStudentIdNumber(row);
    const formClass = getStudentFormClass(row);
    const email = getStudentEmail(row);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "staff-chip";
    chip.dataset.studentKey = getStudentKey(row);
    chip.innerHTML = `
      <strong>${name}</strong>
      <span>${formClass || "Student"}</span>
      <small>${email || idNumber || "Enter email manually"}</small>
    `;
    chip.addEventListener("click", () => populateRoleFormFromStudent(row));
    studentList.appendChild(chip);
  });
}

async function loadStaffRows() {
  const response = await fetch("/api/staff_upload/all");
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.staff)) {
    return data.staff;
  }
  return [];
}

async function loadStudentRows() {
  const response = await fetch("/api/student_timetable/all");
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.students)) {
    return data.students;
  }
  return [];
}

function setStatus(message, isError = false) {
  if (!roleStatus) return;
  roleStatus.textContent = message;
  roleStatus.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

async function loadUserRoles() {
  const response = await fetch("/api/admin/user-roles");
  if (!response.ok) {
    return [];
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function renderRows(rows) {
  if (!roleTableBody) return;
  roleTableBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">No additional roles assigned yet.</td>`;
    roleTableBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="project-tag">${row.user_type || ""}</span></td>
      <td>
        <strong>${row.user_email || ""}</strong>
        <div>${row.display_name || "-"}</div>
      </td>
      <td><span class="status-tag status-planning">${row.additional_role || "None"}</span></td>
      <td><button type="button" class="button button-danger" data-remove="${row.user_email}">Remove</button></td>
    `;

    const removeButton = tr.querySelector("[data-remove]");
    if (removeButton) {
      removeButton.addEventListener("click", async () => {
        try {
          const response = await fetch(`/api/admin/user-roles/${encodeURIComponent(row.user_email)}`, {
            method: "DELETE"
          });
          if (!response.ok) throw new Error("Could not remove role");
          setStatus(`Removed additional role for ${row.user_email}.`);
          await refresh();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    }

    roleTableBody.appendChild(tr);
  });
}

async function refresh() {
  const rows = await loadUserRoles();
  renderRows(rows);
}

async function refreshStaff() {
  cachedStaffRows = mergeSignedInStaffRow(await loadStaffRows());
  renderStaffList(cachedStaffRows);
}

async function refreshStudents() {
  cachedStudentRows = await loadStudentRows();
  renderStudentList(cachedStudentRows);
}

function attachAuthActions() {
  if (hubUserBadge) {
    hubUserBadge.addEventListener("click", () => {
      window.location.href = "/user-profile.html";
    });
  }

  if (!hubSignOutButton) {
    return;
  }

  hubSignOutButton.addEventListener("click", () => {
    clearHubStoredAuthRaw();
    activeHubProfile = null;
    selectedStaffEmail = "";
    cachedStaffRows = [];
    renderHubAuthState();
    renderStaffList(cachedStaffRows);
  });
}

function bootAdminData() {
  renderHubAuthState();
  attachAuthActions();
  Promise.allSettled([refresh(), refreshStaff(), refreshStudents()]);
}

if (roleForm) {
  roleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(roleForm);

    const payload = {
      user_type: String(formData.get("userType") || "").trim(),
      user_email: String(formData.get("userEmail") || "").trim().toLowerCase(),
      additional_role: String(formData.get("roleToAdd") || "").trim(),
      display_name: ""
    };

    if (!payload.display_name && payload.user_email.includes("@")) {
      const localPart = payload.user_email.split("@")[0] || "";
      payload.display_name = localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    if (!payload.user_type || !payload.user_email || !payload.additional_role) {
      setStatus("User type, email, and role are required.", true);
      return;
    }

    try {
      const response = await fetch("/api/admin/user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Could not add role");
      }

      setStatus(`Saved role ${payload.additional_role} for ${payload.user_email}.`);
      roleForm.reset();
      selectedStaffEmail = "";
      selectedStudentKey = "";
      if (staffList) {
        staffList.querySelectorAll(".staff-chip").forEach((chip) => chip.classList.remove("is-selected"));
      }
      if (studentList) {
        studentList.querySelectorAll(".staff-chip").forEach((chip) => chip.classList.remove("is-selected"));
      }
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (staffSearch) {
  staffSearch.addEventListener("input", () => renderStaffList(cachedStaffRows));
}

if (studentSearch) {
  studentSearch.addEventListener("input", () => renderStudentList(cachedStudentRows));
}

bootAdminData();
