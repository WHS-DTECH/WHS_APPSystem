const ALLOC_AUTH_KEY = "hub_google_auth_v1";
const STRAND_CODES = ["DTECH", "COMP", "TEXT", "DTONLINE"];
const COURSE_STANDARDS_GUIDANCE = {
    "11DTECH": ["29777", "92004", "91893", "91897", "92006", "92005"]
};
const CLIENT_PROJECT_STANDARD_GUIDANCE = {
    "11DTECH": "91897",
    "12DTECH": "91897",
    "13DTECH": "91907"
};
let allocStandardsOptions = [];

function allocGetStoredEmail() {
    const raw = localStorage.getItem(ALLOC_AUTH_KEY) || sessionStorage.getItem(ALLOC_AUTH_KEY);
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_e) {
        return "";
    }
}

function allocGetStoredAccessToken() {
    const raw = localStorage.getItem(ALLOC_AUTH_KEY) || sessionStorage.getItem(ALLOC_AUTH_KEY);
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_e) {
        return "";
    }
}

function allocWithAuthHeaders(headers = {}, email = allocGetStoredEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const accessToken = allocGetStoredAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

async function allocEnforceAccess() {
    const email = allocGetStoredEmail();
    if (!email) {
        window.location.replace("teacher-view.html");
        return false;
    }
    try {
        const resp = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
        if (!resp.ok) {
            window.location.replace("teacher-view.html");
            return false;
        }
        const access = await resp.json();
        if (!access?.can_teacher_view) {
            window.location.replace("teacher-view.html");
            return false;
        }
        return true;
    } catch (_e) {
        window.location.replace("teacher-view.html");
        return false;
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
    if (!isoString) return "";
    try {
        return new Date(isoString).toLocaleDateString("en-NZ", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    } catch (_e) {
        return isoString;
    }
}

function buildLowerKeyMap(row) {
    const map = new Map();
    Object.keys(row || {}).forEach((key) => map.set(String(key).toLowerCase(), row[key]));
    return map;
}

function extractStudentEmail(row) {
    const lower = buildLowerKeyMap(row);
    const keys = ["student_email", "email_school", "email", "user_email", "studentemail", "emailschool"];
    for (const key of keys) {
        const value = lower.get(key);
        if (String(value || "").trim()) {
            return String(value || "").trim().toLowerCase();
        }
    }
    return "";
}

function extractStudentYearGroup(row) {
    const lower = buildLowerKeyMap(row);
    const keys = ["year_level", "yearlevel", "year", "class_year", "year_group", "yeargroup"];
    for (const key of keys) {
        const value = lower.get(key);
        if (String(value || "").trim()) {
            return String(value || "").trim();
        }
    }
    return "";
}

function resolveStudentCourseGuidance(row) {
    const year = extractStudentYearGroup(row).replace(/^year\s*/i, "").trim();
    const programValues = Array.isArray(row?.programs) ? row.programs : row?.subject_strands;
    const programs = Array.isArray(programValues)
        ? programValues.map((value) => String(value || "").trim().toUpperCase())
        : [];
    const course = programs.find((value) => value === "DTECH" || value === "COMP") || "";
    const courseKey = year && course ? `${year}${course}` : "";
    return {
        courseKey,
        standards: Array.isArray(COURSE_STANDARDS_GUIDANCE[courseKey]) ? COURSE_STANDARDS_GUIDANCE[courseKey] : []
    };
}

function resolveClientProjectStandard(projectName, student) {
    if (!/client projects/i.test(String(projectName || ""))) {
        return "";
    }
    const guidance = resolveStudentCourseGuidance(student);
    return CLIENT_PROJECT_STANDARD_GUIDANCE[guidance.courseKey] || "";
}

function isProcessAssessmentProjectName(projectName) {
    return /^client projects$/i.test(String(projectName || "").trim());
}

function normalizeStandardValue(value) {
    return String(value || "").trim().slice(0, 120);
}

function extractStandardNumber(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/\b(\d{4,6})\b/);
    return match ? match[1] : raw;
}

function buildStandardOptionLabel(option) {
    const number = String(option?.standard_number || "").trim();
    const shortName = String(option?.short_name || option?.standard_name || "").trim();
    const level = String(option?.level || "").trim();
    if (number && shortName && level) return `${number} - ${shortName} (L${level})`;
    if (number && shortName) return `${number} - ${shortName}`;
    return number || shortName || "Unknown standard";
}

function renderStandardSelect(slot, currentValue, allowedStandards = []) {
    const selectedValue = extractStandardNumber(currentValue);
    const allowed = new Set(Array.isArray(allowedStandards) ? allowedStandards.map((value) => String(value || "").trim()) : []);
    const allOptions = Array.isArray(allocStandardsOptions) ? allocStandardsOptions : [];
    const options = allowed.size
        ? allOptions.filter((option) => allowed.has(String(option?.standard_number || "").trim()))
        : allOptions;
    const hasSelectedValue = selectedValue && options.some((option) => String(option.standard_number) === selectedValue);

    const customOption = (!hasSelectedValue && String(currentValue || "").trim())
        ? `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(String(currentValue).trim())} (custom)</option>`
        : "";

    const standardOptions = options
        .map((option) => {
            const value = String(option.standard_number || "").trim();
            if (!value) return "";
            const label = buildStandardOptionLabel(option);
            const selected = value === selectedValue ? " selected" : "";
            return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
        })
        .join("");

    return `
        <select class="alloc-standard-select" data-standard-slot="${escapeHtml(slot)}" aria-label="Standard ${escapeHtml(slot)}">
            <option value="">Select standard</option>
            ${customOption}
            ${standardOptions}
        </select>
    `;
}

function renderDigitalMediaTypeSelect(currentValue) {
    const selectedValue = String(currentValue || "").trim();
    const types = ["Image", "Video", "Audio", "Web", "Mixed"];
    return `
        <select class="alloc-standard-select" data-digital-media-type aria-label="Digital Media type">
            <option value="">Digital Media type</option>
            ${types.map((type) => `<option value="${escapeHtml(type)}"${type === selectedValue ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}
        </select>
    `;
}

function parseStudentName(studentName) {
    const raw = String(studentName || "").trim();
    if (!raw) {
        return { firstName: "", lastName: "" };
    }

    if (raw.includes(",")) {
        const [last, first] = raw.split(",");
        return {
            firstName: String(first || "").trim().split(/\s+/)[0] || "",
            lastName: String(last || "").trim().split(/\s+/)[0] || ""
        };
    }

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
        return { firstName: parts[0] || "", lastName: "" };
    }

    return {
        firstName: parts[0],
        lastName: parts[parts.length - 1]
    };
}

function normalizeNameToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function buildStudentEmailAliases(student) {
    const aliases = new Set();
    const { firstName, lastName } = parseStudentName(student?.student_name);
    const first = normalizeNameToken(firstName);
    const last = normalizeNameToken(lastName);

    if (first && last) {
        aliases.add(`${first.charAt(0)}_${last}`);
        aliases.add(`${first.charAt(0)}.${last}`);
        aliases.add(`${first}${last}`);
        aliases.add(`${last}${first.charAt(0)}`);
    }

    return Array.from(aliases).filter(Boolean);
}

function getEmailLocalPart(value) {
    const email = String(value || "").trim().toLowerCase();
    if (!email) return "";
    const at = email.indexOf("@");
    if (at <= 0) return "";
    return email.slice(0, at);
}

function extractStudentStrands(row) {
    const programs = Array.isArray(row?.programs)
        ? row.programs.map((program) => String(program || "").trim().toUpperCase()).filter(Boolean)
        : [];

    const matched = STRAND_CODES.filter((code) => programs.includes(code));
    return matched;
}

function formatStudentStrand(strands) {
    if (!Array.isArray(strands) || !strands.length) {
        return "Unspecified";
    }
    return strands.join(", ");
}

function setAllocStatus(message, isError = false) {
    const el = document.getElementById("alloc-status");
    if (!el) return;
    el.textContent = message;
    el.className = isError ? "alloc-status is-error" : "alloc-status";
}

function isAssessmentTaskRecord(record) {
    const category = String(record?.activity_category || record?.activityCategory || "").trim().toLowerCase();
    return category.includes("assessment");
}

function isAllocationRecord(record) {
    const category = String(record?.activity_category || record?.activityCategory || "").trim().toLowerCase();
    return category.includes("assessment") || category.includes("project");
}

function normalizeAssessmentRecord(record) {
    return {
        project_id: String(record?.id || "").trim(),
        project_name: String(record?.name || record?.title || "Untitled Assessment").trim(),
        client_name: String(record?.company || record?.contact_name || "").trim(),
        start_date: String(record?.start_date || record?.startDate || "").trim(),
        detail_url: `ProjectPages/custom-activity.html?id=${encodeURIComponent(String(record?.id || "").trim())}`
    };
}

function buildStudentRows(project) {
    if (!project.students.length) {
        return `
            <tr>
                <td class="alloc-empty-row" colspan="7">No students are interested yet.</td>
            </tr>
        `;
    }

    return project.students.map((student) => buildStudentRow(student, project.project_name)).join("");
}

function buildProjectBlock(project, email) {
    const block = document.createElement("details");
    block.className = "alloc-project-block";
    block.dataset.projectId = project.project_id;
    block.dataset.projectName = project.project_name;

    const confirmedCount = project.confirmed_count || 0;
    const totalCount = project.interest_count || 0;
    const clientName = project.client_name || "Not specified";
    const startDate = project.start_date ? formatDate(project.start_date) : "Not specified";
    // "Client Projects" is the underlying task name used for standard-guidance matching; only the heading is renamed.
    const displayName = /^client projects$/i.test(String(project.project_name || "").trim())
        ? "Process Assessment"
        : project.project_name;

    block.innerHTML = `
        <summary class="alloc-project-header">
            <div>
                <h2 class="alloc-project-title">${escapeHtml(displayName)}</h2>
                <a class="alloc-project-link" href="${escapeHtml(project.detail_url)}">View Task &rarr;</a>
                <div class="alloc-project-details">
                    <span><strong>Client:</strong> ${escapeHtml(clientName)}</span>
                    <span><strong>EST Start Date:</strong> ${escapeHtml(startDate)}</span>
                </div>
            </div>
            <div class="alloc-meta">
                <span><strong>${totalCount}</strong> interested</span>
                <span><strong>${confirmedCount}</strong> confirmed</span>
            </div>
        </summary>
        <div class="alloc-table-wrap">
            <table class="alloc-table">
                <thead>
                    <tr>
                        <th>Student Email</th>
                        <th>Year Group</th>
                        <th>Subject Strand</th>
                        <th>Registered</th>
                        <th>
                            <div class="alloc-standard-headings">
                                <span>Process std</span>
                                <span>Project/Task std</span>
                                <span>Digital Media</span>
                            </div>
                        </th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${buildStudentRows(project)}
                </tbody>
            </table>
        </div>
    `;

    block.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => handleAllocationAction(btn, project.project_id, email));
    });

    return block;
}

function buildStudentRow(student, projectName = "") {
    const isConfirmed = Boolean(student.confirmed);
    const dateStr = formatDate(student.created_at);
    const statusBadge = isConfirmed
        ? `<span class="alloc-status-badge badge-confirmed">Confirmed</span>`
        : `<span class="alloc-status-badge badge-pending">Pending</span>`;
    const confirmBtnClass = isConfirmed ? "alloc-btn alloc-btn-unconfirm" : "alloc-btn alloc-btn-confirm";
    const confirmBtnText = isConfirmed ? "Unconfirm" : "Confirm";
    const yearGroup = String(student.year_group || "").trim() || "Unspecified";
    const subjectStrand = formatStudentStrand(student.subject_strands);
    const standard1 = normalizeStandardValue(student.standard_1) || resolveClientProjectStandard(projectName, student);
    const standard2 = normalizeStandardValue(student.standard_2);
    const digitalMediaType = String(student.digital_media_type || "").trim();
    const courseGuidance = resolveStudentCourseGuidance(student);

    return `
        <tr data-student="${escapeHtml(student.email)}">
            <td>${escapeHtml(student.email)}</td>
            <td>${escapeHtml(yearGroup)}</td>
            <td>${escapeHtml(subjectStrand)}</td>
            <td class="alloc-date">${escapeHtml(dateStr)}</td>
            <td>
                <div class="alloc-standards-cell">
                    ${renderStandardSelect("1", standard1, courseGuidance.standards)}
                    ${renderStandardSelect("2", standard2, courseGuidance.standards)}
                    ${renderDigitalMediaTypeSelect(digitalMediaType)}
                    <button type="button" class="alloc-btn alloc-btn-unconfirm" data-action="save-standards">Save</button>
                </div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div class="alloc-btn-group">
                    <button type="button" class="${confirmBtnClass}" data-action="confirm" data-confirmed="${isConfirmed}">${escapeHtml(confirmBtnText)}</button>
                    <button type="button" class="alloc-btn alloc-btn-remove" data-action="remove">Remove</button>
                </div>
            </td>
        </tr>
    `;
}

// Fills the empty Process std cell for the same student in every other project block once
// it has been set in the Process Assessment table; existing values are left untouched.
async function propagateProcessStandardToOtherProjects(studentEmail, processStandard, sourceProjectId, email) {
    if (!studentEmail || !processStandard) return;

    const headers = allocWithAuthHeaders({ "Content-Type": "application/json" }, email);
    const blocks = document.querySelectorAll(".alloc-project-block");
    for (const block of blocks) {
        const targetProjectId = block.dataset.projectId;
        if (!targetProjectId || targetProjectId === sourceProjectId) continue;

        const targetRow = block.querySelector(`tr[data-student="${CSS.escape(studentEmail)}"]`);
        if (!targetRow) continue;

        const select = targetRow.querySelector('[data-standard-slot="1"]');
        if (!select || normalizeStandardValue(select.value)) continue;

        if (![...select.options].some((option) => option.value === processStandard)) {
            const option = document.createElement("option");
            option.value = processStandard;
            option.textContent = `${processStandard} (custom)`;
            select.appendChild(option);
        }
        select.value = processStandard;

        try {
            await fetch(
                `/api/activities/${encodeURIComponent(targetProjectId)}/interests/${encodeURIComponent(studentEmail)}/standards`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        standard_1: processStandard,
                        standard_2: normalizeStandardValue(targetRow.querySelector('[data-standard-slot="2"]')?.value || ""),
                        digital_media_type: String(targetRow.querySelector("[data-digital-media-type]")?.value || "").trim()
                    })
                }
            );
        } catch (_error) {
            // Best-effort; will be retried on next page load.
        }
    }
}

// Fills the empty Project/Task std cell for the same student in the Process Assessment table
// once it has been set in any other project block; an existing value is left untouched.
async function propagateProjectTaskStandardToProcessAssessment(studentEmail, projectTaskStandard, sourceProjectId, email) {
    if (!studentEmail || !projectTaskStandard) return;

    const headers = allocWithAuthHeaders({ "Content-Type": "application/json" }, email);
    const blocks = document.querySelectorAll(".alloc-project-block");
    for (const block of blocks) {
        const targetProjectId = block.dataset.projectId;
        if (!targetProjectId || targetProjectId === sourceProjectId || !isProcessAssessmentProjectName(block.dataset.projectName)) continue;

        const targetRow = block.querySelector(`tr[data-student="${CSS.escape(studentEmail)}"]`);
        if (!targetRow) continue;

        const select = targetRow.querySelector('[data-standard-slot="2"]');
        if (!select || normalizeStandardValue(select.value)) continue;

        if (![...select.options].some((option) => option.value === projectTaskStandard)) {
            const option = document.createElement("option");
            option.value = projectTaskStandard;
            option.textContent = `${projectTaskStandard} (custom)`;
            select.appendChild(option);
        }
        select.value = projectTaskStandard;

        try {
            await fetch(
                `/api/activities/${encodeURIComponent(targetProjectId)}/interests/${encodeURIComponent(studentEmail)}/standards`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        standard_1: normalizeStandardValue(targetRow.querySelector('[data-standard-slot="1"]')?.value || ""),
                        standard_2: projectTaskStandard,
                        digital_media_type: String(targetRow.querySelector("[data-digital-media-type]")?.value || "").trim()
                    })
                }
            );
        } catch (_error) {
            // Best-effort; will be retried on next page load.
        }
    }
}

async function handleAllocationAction(btn, projectId, email) {
    const row = btn.closest("tr[data-student]");
    if (!row) return;
    const studentEmail = row.getAttribute("data-student");
    const action = btn.getAttribute("data-action");

    btn.disabled = true;
    const headers = allocWithAuthHeaders({ "Content-Type": "application/json" }, email);

    try {
        if (action === "confirm") {
            const currentlyConfirmed = btn.getAttribute("data-confirmed") === "true";
            const newConfirmed = !currentlyConfirmed;
            const resp = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/confirm`,
                { method: "PATCH", headers, body: JSON.stringify({ confirmed: newConfirmed }) }
            );
            if (resp.ok) {
                btn.setAttribute("data-confirmed", String(newConfirmed));
                btn.textContent = newConfirmed ? "Unconfirm" : "Confirm";
                btn.className = newConfirmed ? "alloc-btn alloc-btn-unconfirm" : "alloc-btn alloc-btn-confirm";
                const statusCell = row.querySelector(".alloc-status-badge");
                if (statusCell) {
                    statusCell.textContent = newConfirmed ? "Confirmed" : "Pending";
                    statusCell.className = newConfirmed ? "alloc-status-badge badge-confirmed" : "alloc-status-badge badge-pending";
                }
                updateProjectBlockCounts(btn.closest(".alloc-project-block"));
            }
        } else if (action === "save-standards") {
            const standard1 = normalizeStandardValue(row.querySelector('[data-standard-slot="1"]')?.value || "");
            const standard2 = normalizeStandardValue(row.querySelector('[data-standard-slot="2"]')?.value || "");
            const digitalMediaType = String(row.querySelector("[data-digital-media-type]")?.value || "").trim();

            const resp = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/standards`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ standard_1: standard1, standard_2: standard2, digital_media_type: digitalMediaType })
                }
            );

            if (resp.ok) {
                setAllocStatus(`Saved standards for ${studentEmail}.`);
                const projectBlock = btn.closest(".alloc-project-block");
                const isProcessAssessmentBlock = isProcessAssessmentProjectName(projectBlock?.dataset.projectName);
                if (standard1 && isProcessAssessmentBlock) {
                    await propagateProcessStandardToOtherProjects(studentEmail, standard1, projectId, email);
                }
                if (standard2 && !isProcessAssessmentBlock) {
                    await propagateProjectTaskStandardToProcessAssessment(studentEmail, standard2, projectId, email);
                }
            } else {
                setAllocStatus(`Could not save standards for ${studentEmail}.`, true);
            }
        } else if (action === "remove") {
            if (!window.confirm(`Remove ${studentEmail} from this task's interest list?`)) {
                btn.disabled = false;
                return;
            }
            const resp = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}`,
                { method: "DELETE", headers }
            );
            if (resp.ok) {
                row.remove();
                updateProjectBlockCounts(btn.closest(".alloc-project-block"));
            }
        }
    } catch (_err) {
        setAllocStatus("An error occurred. Please try again.", true);
    }

    if (btn.isConnected) btn.disabled = false;
}

function updateProjectBlockCounts(block) {
    if (!block) return;
    const rows = block.querySelectorAll("tbody tr[data-student]");
    const confirmedRows = block.querySelectorAll("tbody tr[data-student] .badge-confirmed");
    const metaEl = block.querySelector(".alloc-meta");
    if (metaEl) {
        metaEl.innerHTML = `
            <span><strong>${rows.length}</strong> interested</span>
            <span><strong>${confirmedRows.length}</strong> confirmed</span>
        `;
    }
}

function getAllocationRowYear(row) {
    return Number.parseInt(String(row.cells[1]?.textContent || ""), 10) || 0;
}

function applyAllocationTableControls() {
    const query = String(document.querySelector("#alloc-email-search")?.value || "").trim().toLowerCase();
    const sortValue = String(document.querySelector("#alloc-row-sort")?.value || "email-asc");
    const [sortField, sortDirection] = sortValue.split("-");
    const direction = sortDirection === "desc" ? -1 : 1;

    document.querySelectorAll(".alloc-project-block tbody").forEach((body) => {
        const rows = Array.from(body.querySelectorAll("tr[data-student]"));
        rows.sort((left, right) => {
            if (sortField === "year") {
                const yearDifference = getAllocationRowYear(left) - getAllocationRowYear(right);
                if (yearDifference) return yearDifference * direction;
            }
            return String(left.dataset.student || "").localeCompare(String(right.dataset.student || "")) * direction;
        });
        rows.forEach((row) => {
            row.hidden = query !== "" && !String(row.dataset.student || "").toLowerCase().includes(query);
            body.appendChild(row);
        });
    });
}

async function fetchStudentsForAllocation(email) {
    const headers = allocWithAuthHeaders({}, email);

    try {
        const classResponse = await fetch("/api/class-management/students?current_only=false&dtech_only=false", { headers });
        if (classResponse.ok) {
            const payload = await classResponse.json().catch(() => ({}));
            const students = Array.isArray(payload?.students) ? payload.students : [];
            if (students.length) {
                return students;
            }
        }
    } catch (_error) {
    }

    const timetableResponse = await fetch("/api/student_timetable/all");
    const payload = await timetableResponse.json().catch(() => ({}));
    return Array.isArray(payload?.students) ? payload.students : [];
}

async function fetchStandardsOptionsForAllocation(email) {
    const headers = allocWithAuthHeaders({}, email);

    try {
        const response = await fetch("/api/assessment-standards/options?stream=both&level=all", { headers });
        if (!response.ok) {
            return [];
        }

        const payload = await response.json().catch(() => ({}));
        const options = Array.isArray(payload?.options) ? payload.options : [];
        return options;
    } catch (_error) {
        return [];
    }
}

async function loadAllocations() {
    const email = allocGetStoredEmail();
    const content = document.getElementById("alloc-content");
    if (!content) return;

    setAllocStatus("Loading...");
    content.innerHTML = `<p class="alloc-empty">Loading assessment task allocations&hellip;</p>`;

    try {
        const [activitiesResponse, interestsResponse] = await Promise.all([
            fetch("/api/activities"),
            fetch("/api/project-interests", { headers: allocWithAuthHeaders({}, email) })
        ]);

        if (!activitiesResponse.ok) {
            throw new Error("Could not load activities");
        }

        if (!interestsResponse.ok) {
            throw new Error("Could not load assessment task interests");
        }

        const activities = await activitiesResponse.json();
        const interestProjects = await interestsResponse.json();
        const [students, standardsOptions] = await Promise.all([
            fetchStudentsForAllocation(email),
            fetchStandardsOptionsForAllocation(email)
        ]);
        allocStandardsOptions = standardsOptions;
        const studentYearByEmail = new Map();
        const studentYearByLocal = new Map();
        const studentStrandsByEmail = new Map();
        const studentStrandsByLocal = new Map();
        students.forEach((student) => {
            const yearGroup = extractStudentYearGroup(student);
            const strands = extractStudentStrands(student);

            const directEmail = extractStudentEmail(student);
            if (directEmail) {
                if (yearGroup) {
                    studentYearByEmail.set(directEmail, yearGroup);
                    const local = getEmailLocalPart(directEmail);
                    if (local) {
                        studentYearByLocal.set(local, yearGroup);
                    }
                }
                if (strands.length) {
                    studentStrandsByEmail.set(directEmail, strands);
                    const local = getEmailLocalPart(directEmail);
                    if (local) {
                        studentStrandsByLocal.set(local, strands);
                    }
                }
            }

            if (Array.isArray(student?.linked_emails)) {
                student.linked_emails
                    .map((value) => String(value || "").trim().toLowerCase())
                    .filter(Boolean)
                    .forEach((linkedEmail) => {
                        if (yearGroup) {
                            studentYearByEmail.set(linkedEmail, yearGroup);
                            const local = getEmailLocalPart(linkedEmail);
                            if (local) {
                                studentYearByLocal.set(local, yearGroup);
                            }
                        }
                        if (strands.length) {
                            studentStrandsByEmail.set(linkedEmail, strands);
                            const local = getEmailLocalPart(linkedEmail);
                            if (local) {
                                studentStrandsByLocal.set(local, strands);
                            }
                        }
                    });
            }

            const aliases = buildStudentEmailAliases(student);
            aliases.forEach((alias) => {
                if (yearGroup) {
                    studentYearByLocal.set(alias, yearGroup);
                }
                if (strands.length) {
                    studentStrandsByLocal.set(alias, strands);
                }
            });
        });
        const interestByProjectId = new Map(
            (Array.isArray(interestProjects) ? interestProjects : []).map((project) => [String(project.project_id || "").trim(), project])
        );

        const projects = (Array.isArray(activities) ? activities : [])
            .filter((record) => isAllocationRecord(record))
            .map((record) => {
                const normalized = normalizeAssessmentRecord(record);
                const interest = interestByProjectId.get(normalized.project_id) || {};
                return {
                    ...normalized,
                    interest_count: Number(interest.interest_count || 0),
                    confirmed_count: Number(interest.confirmed_count || 0),
                    students: Array.isArray(interest.students)
                        ? interest.students.map((student) => ({
                            email: String(student.email || student.student_email || "").trim(),
                            confirmed: Boolean(student.confirmed),
                            created_at: student.created_at || "",
                            standard_1: normalizeStandardValue(student.standard_1),
                            standard_2: normalizeStandardValue(student.standard_2),
                            digital_media_type: String(student.digital_media_type || "").trim(),
                            year_group: (() => {
                                const studentEmail = String(student.email || student.student_email || "").trim().toLowerCase();
                                const local = getEmailLocalPart(studentEmail);
                                return studentYearByEmail.get(studentEmail) || studentYearByLocal.get(local) || "";
                            })(),
                            subject_strands: (() => {
                                const studentEmail = String(student.email || student.student_email || "").trim().toLowerCase();
                                const local = getEmailLocalPart(studentEmail);
                                return studentStrandsByEmail.get(studentEmail) || studentStrandsByLocal.get(local) || [];
                            })(),
                            programs: (() => {
                                const studentEmail = String(student.email || student.student_email || "").trim().toLowerCase();
                                const local = getEmailLocalPart(studentEmail);
                                return studentStrandsByEmail.get(studentEmail) || studentStrandsByLocal.get(local) || [];
                            })()
                        })).filter((student) => student.email)
                        : []
                };
            })
            .sort((left, right) => {
                const leftIsClientProjects = /^client projects$/i.test(String(left.project_name || "").trim());
                const rightIsClientProjects = /^client projects$/i.test(String(right.project_name || "").trim());
                if (leftIsClientProjects !== rightIsClientProjects) {
                    return leftIsClientProjects ? -1 : 1;
                }
                const leftDate = left.start_date || "9999-12-31";
                const rightDate = right.start_date || "9999-12-31";
                if (leftDate !== rightDate) {
                    return leftDate.localeCompare(rightDate);
                }
                return left.project_name.localeCompare(right.project_name);
            });

        await Promise.all(projects.flatMap((project) => project.students.map(async (student) => {
            const guidedStandard = resolveClientProjectStandard(project.project_name, student);
            if (!guidedStandard || normalizeStandardValue(student.standard_1)) {
                return;
            }

            const response = await fetch(
                `/api/activities/${encodeURIComponent(project.project_id)}/interests/${encodeURIComponent(student.email)}/standards`,
                {
                    method: "PATCH",
                    headers: allocWithAuthHeaders({ "Content-Type": "application/json" }, email),
                    body: JSON.stringify({ standard_1: guidedStandard, standard_2: normalizeStandardValue(student.standard_2), digital_media_type: String(student.digital_media_type || "").trim() })
                }
            );
            if (response.ok) {
                student.standard_1 = guidedStandard;
            }
        })));

        const processAssessmentProject = projects.find((project) => isProcessAssessmentProjectName(project.project_name));
        if (processAssessmentProject) {
            const processStandardByEmail = new Map();
            processAssessmentProject.students.forEach((student) => {
                const value = normalizeStandardValue(student.standard_1);
                if (value) processStandardByEmail.set(String(student.email || "").trim().toLowerCase(), value);
            });

            if (processStandardByEmail.size) {
                await Promise.all(projects
                    .filter((project) => project !== processAssessmentProject)
                    .flatMap((project) => project.students.map(async (student) => {
                        const processStandard = processStandardByEmail.get(String(student.email || "").trim().toLowerCase());
                        if (!processStandard || normalizeStandardValue(student.standard_1)) {
                            return;
                        }

                        const response = await fetch(
                            `/api/activities/${encodeURIComponent(project.project_id)}/interests/${encodeURIComponent(student.email)}/standards`,
                            {
                                method: "PATCH",
                                headers: allocWithAuthHeaders({ "Content-Type": "application/json" }, email),
                                body: JSON.stringify({ standard_1: processStandard, standard_2: normalizeStandardValue(student.standard_2), digital_media_type: String(student.digital_media_type || "").trim() })
                            }
                        );
                        if (response.ok) {
                            student.standard_1 = processStandard;
                        }
                    })));
            }

            // Reverse direction: pull the first identified Project/Task std for each student
            // from the other project blocks into the Process Assessment table when it is empty.
            const projectTaskStandardByEmail = new Map();
            projects
                .filter((project) => project !== processAssessmentProject)
                .forEach((project) => {
                    project.students.forEach((student) => {
                        const emailKey = String(student.email || "").trim().toLowerCase();
                        const value = normalizeStandardValue(student.standard_2);
                        if (value && !projectTaskStandardByEmail.has(emailKey)) {
                            projectTaskStandardByEmail.set(emailKey, value);
                        }
                    });
                });

            if (projectTaskStandardByEmail.size) {
                await Promise.all(processAssessmentProject.students.map(async (student) => {
                    const projectTaskStandard = projectTaskStandardByEmail.get(String(student.email || "").trim().toLowerCase());
                    if (!projectTaskStandard || normalizeStandardValue(student.standard_2)) {
                        return;
                    }

                    const response = await fetch(
                        `/api/activities/${encodeURIComponent(processAssessmentProject.project_id)}/interests/${encodeURIComponent(student.email)}/standards`,
                        {
                            method: "PATCH",
                            headers: allocWithAuthHeaders({ "Content-Type": "application/json" }, email),
                            body: JSON.stringify({ standard_1: normalizeStandardValue(student.standard_1), standard_2: projectTaskStandard, digital_media_type: String(student.digital_media_type || "").trim() })
                        }
                    );
                    if (response.ok) {
                        student.standard_2 = projectTaskStandard;
                    }
                }));
            }
        }

        setAllocStatus("");

        if (!Array.isArray(projects) || projects.length === 0) {
            content.innerHTML = `<p class="alloc-empty">No assessment task or project records were found.</p>`;
            return;
        }

        content.innerHTML = "";
        for (const project of projects) {
            content.appendChild(buildProjectBlock(project, email));
        }
        applyAllocationTableControls();
    } catch (error) {
        setAllocStatus(error.message || "Could not load allocations.", true);
        content.innerHTML = `<p class="alloc-empty">Could not load assessment task allocations. Please refresh.</p>`;
    }
}

async function saveAllAllocations() {
    const button = document.querySelector("#alloc-save-all");
    const email = allocGetStoredEmail();
    const rows = Array.from(document.querySelectorAll(".alloc-project-block tr[data-student]"));
    if (!email || !rows.length) return;

    button.disabled = true;
    button.textContent = "Saving...";
    setAllocStatus(`Saving ${rows.length} allocation${rows.length === 1 ? "" : "s"}...`);

    const headers = allocWithAuthHeaders({ "Content-Type": "application/json" }, email);
    const results = await Promise.all(rows.map(async (row) => {
        const projectId = String(row.closest(".alloc-project-block")?.dataset.projectId || "").trim();
        const studentEmail = String(row.getAttribute("data-student") || "").trim();
        if (!projectId || !studentEmail) return false;

        try {
            const response = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/standards`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        standard_1: normalizeStandardValue(row.querySelector('[data-standard-slot="1"]')?.value || ""),
                        standard_2: normalizeStandardValue(row.querySelector('[data-standard-slot="2"]')?.value || ""),
                        digital_media_type: String(row.querySelector("[data-digital-media-type]")?.value || "").trim()
                    })
                }
            );
            return response.ok;
        } catch (_error) {
            return false;
        }
    }));

    const savedCount = results.filter(Boolean).length;
    if (savedCount === rows.length) {
        setAllocStatus(`Saved all ${savedCount} allocations.`);
        await loadAllocations();
    } else {
        setAllocStatus(`Saved ${savedCount} of ${rows.length} allocations. Please try Save All again for the remaining rows.`, true);
    }

    button.disabled = false;
    button.textContent = "Save All";
}

async function init() {
    const allowed = await allocEnforceAccess();
    if (!allowed) return;
    await loadAllocations();
    document.querySelector("#alloc-save-all")?.addEventListener("click", () => {
        void saveAllAllocations();
    });
    document.querySelector("#alloc-email-search")?.addEventListener("input", applyAllocationTableControls);
    document.querySelector("#alloc-row-sort")?.addEventListener("change", applyAllocationTableControls);
}

init();
