const practicalsGrid = document.querySelector("#practicals-grid");
const monthLabel = document.querySelector("#month-label");
const monthPrev = document.querySelector("#month-prev");
const monthNext = document.querySelector("#month-next");
const practicalsList = document.querySelector("#practicals-list");
const practicalsStatus = document.querySelector("#practicals-status");
const practicalsForm = document.querySelector("#practicals-form");
const practicalsFormStatus = document.querySelector("#practicals-form-status");
const practicalsManage = document.querySelector("#practicals-manage");
const icsUrlCopy = document.querySelector("#ics-url-copy");
const studentManager = document.querySelector("#practicals-student-manager");
const studentPracticalBody = document.querySelector("#student-practical-body");
const studentPracticalStatus = document.querySelector("#student-practical-status");
const studentPracticalMeta = document.querySelector("#student-practical-meta");
const studentPracticalSearch = document.querySelector("#student-practical-search");
const studentPracticalStrand = document.querySelector("#student-practical-strand");
const studentPracticalAllocation = document.querySelector("#student-practical-allocation");

const BROWSE_PRACTICALS_AUTH_KEY = "hub_google_auth_v1";

let practicalEvents = [];
let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let signedInEmail = "";
let canManage = false;
let studentPracticalRows = [];
let studentPracticalCatalog = [];
let studentPracticalCatalogById = new Map();

const SENIOR_MIN_YEAR = 11;
const SENIOR_TARGET_STRANDS = new Set(["DTECH", "COMP", "DTONLINE"]);

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setStatus(target, message, isError = false) {
    if (!target) return;
    target.textContent = message;
    target.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function yearIsSenior(yearLevel) {
    const year = Number.parseInt(String(yearLevel || "").replace(/\D+/g, ""), 10);
    return Number.isInteger(year) && year >= SENIOR_MIN_YEAR;
}

function getStudentStrands(student) {
    const programs = Array.isArray(student?.programs) ? student.programs : [];
    return programs
        .map((value) => String(value || "").trim().toUpperCase())
        .filter((value) => SENIOR_TARGET_STRANDS.has(value));
}

function formatStrandLabel(value) {
    return value === "DTONLINE" ? "DT ONLINE" : value;
}

function inferPracticalType(record) {
    const category = String(record?.activity_category || record?.activityCategory || "").trim().toLowerCase();
    if (category.includes("lesson")) return "Lesson";
    if (category.includes("assessment")) return "Assessment Task";
    if (category.includes("project")) return "Project";
    return "Practical";
}

function buildPracticalCatalog(activities) {
    const map = new Map();

    (Array.isArray(activities) ? activities : []).forEach((record) => {
        const id = String(record?.id || "").trim();
        if (!id) return;

        map.set(id, {
            id,
            title: String(record?.name || record?.title || id).trim() || id,
            type: inferPracticalType(record)
        });
    });

    studentPracticalCatalogById = map;
    studentPracticalCatalog = Array.from(map.values())
        .filter((item) => item.type !== "Lesson")
        .sort((left, right) => {
            if (left.type !== right.type) return left.type.localeCompare(right.type);
            return left.title.localeCompare(right.title);
        });
}

function buildPracticalMap(activities, projectInterests) {
    buildPracticalCatalog(activities);
    const activityMeta = studentPracticalCatalogById;

    const byStudentEmail = new Map();
    (Array.isArray(projectInterests) ? projectInterests : []).forEach((entry) => {
        const projectId = String(entry?.project_id || "").trim();
        const students = Array.isArray(entry?.students) ? entry.students : [];
        const projectName = String(entry?.project_name || "").trim();
        const meta = activityMeta.get(projectId) || {
            title: projectName || projectId,
            type: "Practical"
        };

        students.forEach((student) => {
            const email = normalizeEmail(student?.student_email || student?.email);
            if (!email) return;

            if (!byStudentEmail.has(email)) {
                byStudentEmail.set(email, []);
            }

            byStudentEmail.get(email).push({
                id: projectId,
                title: meta.title,
                type: meta.type,
                confirmed: Boolean(student?.confirmed)
            });
        });
    });

    return byStudentEmail;
}

function sortStudentsByLastName(left, right) {
    const leftName = String(left?.student_name || "").trim();
    const rightName = String(right?.student_name || "").trim();

    const getLast = (value) => {
        if (!value) return "";
        if (value.includes(",")) return value.split(",")[0].trim().toLowerCase();
        const parts = value.split(/\s+/).filter(Boolean);
        return (parts[parts.length - 1] || "").toLowerCase();
    };

    const byLast = getLast(leftName).localeCompare(getLast(rightName), undefined, { numeric: true });
    if (byLast) return byLast;
    return leftName.localeCompare(rightName, undefined, { numeric: true });
}

function buildStudentPracticalRows(students, byStudentEmail) {
    return (Array.isArray(students) ? students : [])
        .filter((student) => String(student?.status || "").toLowerCase() !== "not current")
        .filter((student) => yearIsSenior(student?.year_level))
        .map((student) => {
            const strands = getStudentStrands(student);
            const linkedEmails = Array.isArray(student?.linked_emails)
                ? student.linked_emails.map((value) => normalizeEmail(value)).filter(Boolean)
                : [];
            const primaryEmail = linkedEmails[0] || "";

            const practicalsById = new Map();
            linkedEmails.forEach((email) => {
                const matches = byStudentEmail.get(email) || [];
                matches.forEach((item) => {
                    const key = `${item.id}::${item.title}`;
                    if (!practicalsById.has(key)) {
                        practicalsById.set(key, item);
                    }
                });
            });

            return {
                student_name: String(student?.student_name || "Unnamed student").trim() || "Unnamed student",
                year_level: String(student?.year_level || "").trim(),
                form_class: String(student?.form_class || "").trim(),
                linked_emails: linkedEmails,
                primary_email: primaryEmail,
                strands,
                practicals: Array.from(practicalsById.values()).sort((a, b) => a.title.localeCompare(b.title))
            };
        })
        .filter((row) => row.strands.length)
        .sort(sortStudentsByLastName);
}

function renderStudentPracticalTable() {
    if (!studentPracticalBody) return;

    const searchQuery = String(studentPracticalSearch?.value || "").trim().toLowerCase();
    const strandFilter = String(studentPracticalStrand?.value || "all").trim().toUpperCase();
    const allocationFilter = String(studentPracticalAllocation?.value || "all").trim().toLowerCase();

    const baseRows = studentPracticalRows.filter((row) => {
        if (strandFilter !== "ALL" && !row.strands.includes(strandFilter)) {
            return false;
        }

        if (!searchQuery) {
            return true;
        }

        const haystack = [
            row.student_name,
            row.year_level,
            row.form_class,
            ...row.strands,
            ...row.practicals.map((item) => item.title),
            ...row.practicals.map((item) => item.type)
        ]
            .join(" ")
            .toLowerCase();

        return haystack.includes(searchQuery);
    });

    if (studentPracticalAllocation) {
        const withCount = baseRows.filter((row) => Array.isArray(row.practicals) && row.practicals.length > 0).length;
        const withoutCount = Math.max(0, baseRows.length - withCount);
        const allOption = studentPracticalAllocation.querySelector('option[value="all"]');
        const withOption = studentPracticalAllocation.querySelector('option[value="with"]');
        const withoutOption = studentPracticalAllocation.querySelector('option[value="without"]');

        if (allOption) allOption.textContent = `All students (${baseRows.length})`;
        if (withOption) withOption.textContent = `With allocation (${withCount})`;
        if (withoutOption) withoutOption.textContent = `Without allocation (${withoutCount})`;
    }

    const visibleRows = baseRows.filter((row) => {
        const hasAnyAllocation = Array.isArray(row.practicals) && row.practicals.length > 0;

        if (allocationFilter === "with" && !hasAnyAllocation) {
            return false;
        }

        if (allocationFilter === "without" && hasAnyAllocation) {
            return false;
        }
        return true;
    });

    if (studentPracticalMeta) {
        studentPracticalMeta.textContent = `Showing ${visibleRows.length} of ${studentPracticalRows.length} senior students in DTECH, COMP, or DT ONLINE.`;
    }

    if (!visibleRows.length) {
        studentPracticalBody.innerHTML = `<tr><td colspan="4" class="empty-note">No students matched your current filter.</td></tr>`;
        return;
    }

    studentPracticalBody.innerHTML = visibleRows.map((row) => {
        const yearForm = [row.year_level && `Year ${row.year_level}`, row.form_class].filter(Boolean).join(" | ") || "Not specified";
        const strandPills = row.strands.map((strand) => `<span class="strand-pill">${escapeHtml(formatStrandLabel(strand))}</span>`).join("");
        const assignedIds = new Set(row.practicals.map((item) => item.id));

        const assignOptions = studentPracticalCatalog
            .filter((item) => !assignedIds.has(item.id))
            .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} (${escapeHtml(item.type)})</option>`)
            .join("");

        const practicalPills = row.practicals.length
            ? row.practicals.map((item) => {
                const typeClass = item.type === "Assessment Task" ? "is-assessment" : (item.type === "Project" ? "is-project" : "");
                const confirmedClass = item.confirmed ? "" : " is-unconfirmed";
                const manageButtons = row.primary_email
                    ? `
                        <button type="button" class="practical-pill-btn" data-action="toggle-confirm" data-project-id="${escapeHtml(item.id)}" data-confirmed="${item.confirmed ? "true" : "false"}">${item.confirmed ? "Unconfirm" : "Confirm"}</button>
                        <button type="button" class="practical-pill-btn practical-pill-btn-remove" data-action="remove-assignment" data-project-id="${escapeHtml(item.id)}">Remove</button>
                    `
                    : "";
                return `<span class="practical-pill ${typeClass}${confirmedClass}"><span class="practical-pill-label">${escapeHtml(item.title)} (${escapeHtml(item.type)})</span>${manageButtons}</span>`;
            }).join("")
            : `<span class="empty-note">No practical allocations yet.</span>`;

        const inlineManage = row.primary_email
            ? `
                <div class="practical-inline-manage">
                    <select data-assign-select>
                        <option value="">Assign practical...</option>
                        ${assignOptions}
                    </select>
                    <button type="button" class="button button-secondary practical-inline-assign" data-action="assign-practical">Assign</button>
                </div>
            `
            : `<div class="empty-note">Cannot manage allocations until this student has a linked email key in Class Management.</div>`;

        return `
            <tr data-student-email="${escapeHtml(row.primary_email)}">
                <td>
                    <div class="student-practical-name">${escapeHtml(row.student_name)}</div>
                    <div class="student-practical-subline">${row.linked_emails.length ? escapeHtml(row.linked_emails.join(", ")) : "No linked email keys"}</div>
                </td>
                <td>${escapeHtml(yearForm)}</td>
                <td><div class="strand-pill-row">${strandPills}</div></td>
                <td>
                    <div class="practical-pill-row">${practicalPills}</div>
                    ${inlineManage}
                </td>
            </tr>
        `;
    }).join("");
}

async function handleStudentPracticalAction(button) {
    if (!canManage || !signedInEmail || !button) return;

    const action = String(button.getAttribute("data-action") || "").trim();
    const row = button.closest("tr[data-student-email]");
    const studentEmail = normalizeEmail(row?.getAttribute("data-student-email"));

    if (!studentEmail) {
        setStatus(studentPracticalStatus, "This student is missing a linked email key, so allocations cannot be managed.", true);
        return;
    }

    let requestUrl = "";
    let requestMethod = "POST";
    let requestBody = null;

    if (action === "assign-practical") {
        const select = row.querySelector("select[data-assign-select]");
        const projectId = String(select?.value || "").trim();
        if (!projectId) {
            setStatus(studentPracticalStatus, "Select a practical or assessment task first.", true);
            return;
        }
        requestUrl = `/api/activities/${encodeURIComponent(projectId)}/interests`;
        requestMethod = "POST";
        requestBody = { student_email: studentEmail };
    }

    if (action === "toggle-confirm") {
        const projectId = String(button.getAttribute("data-project-id") || "").trim();
        if (!projectId) return;
        const currentlyConfirmed = String(button.getAttribute("data-confirmed") || "false") === "true";
        requestUrl = `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/confirm`;
        requestMethod = "PATCH";
        requestBody = { confirmed: !currentlyConfirmed };
    }

    if (action === "remove-assignment") {
        const projectId = String(button.getAttribute("data-project-id") || "").trim();
        if (!projectId) return;
        requestUrl = `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}`;
        requestMethod = "DELETE";
        requestBody = null;
    }

    if (!requestUrl) return;

    try {
        button.disabled = true;
        setStatus(studentPracticalStatus, "Saving student allocation changes...");

        const response = await fetch(requestUrl, {
            method: requestMethod,
            headers: withPracticalAuthHeaders({ "Content-Type": "application/json" }),
            body: requestBody ? JSON.stringify(requestBody) : undefined
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Could not update student allocation.");
        }

        setStatus(studentPracticalStatus, "Student allocations updated.");
        await loadStudentPracticalTracker();
    } catch (error) {
        setStatus(studentPracticalStatus, error.message || "Could not update student allocation.", true);
    } finally {
        if (button && button.isConnected) {
            button.disabled = false;
        }
    }
}

async function loadStudentPracticalTracker() {
    if (!canManage || !signedInEmail || !studentManager) return;

    try {
        setStatus(studentPracticalStatus, "Loading student practical tracker...");
        const [studentsResponse, activitiesResponse, interestsResponse] = await Promise.all([
            fetch("/api/class-management/students?current_only=true&dtech_only=false", {
                headers: withPracticalAuthHeaders({})
            }),
            fetch("/api/activities"),
            fetch("/api/project-interests", {
                headers: withPracticalAuthHeaders({})
            })
        ]);

        if (!studentsResponse.ok) {
            throw new Error("Could not load students from Class Management.");
        }
        if (!activitiesResponse.ok) {
            throw new Error("Could not load practical records.");
        }
        if (!interestsResponse.ok) {
            throw new Error("Could not load practical allocations.");
        }

        const studentsPayload = await studentsResponse.json().catch(() => ({}));
        const activities = await activitiesResponse.json().catch(() => []);
        const projectInterests = await interestsResponse.json().catch(() => []);
        const studentRows = Array.isArray(studentsPayload?.students) ? studentsPayload.students : [];

        const byStudentEmail = buildPracticalMap(activities, projectInterests);
        studentPracticalRows = buildStudentPracticalRows(studentRows, byStudentEmail);

        renderStudentPracticalTable();
        setStatus(studentPracticalStatus, `Loaded ${studentPracticalRows.length} students into the practical tracker.`);
    } catch (error) {
        if (studentPracticalBody) {
            studentPracticalBody.innerHTML = `<tr><td colspan="4" class="empty-note">Could not load student practical tracker.</td></tr>`;
        }
        setStatus(studentPracticalStatus, error.message || "Could not load student practical tracker.", true);
    }
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function readSignedInEmail() {
    const raw = localStorage.getItem(BROWSE_PRACTICALS_AUTH_KEY) || sessionStorage.getItem(BROWSE_PRACTICALS_AUTH_KEY);
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return "";
        }
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function readSignedInAccessToken() {
    const raw = localStorage.getItem(BROWSE_PRACTICALS_AUTH_KEY) || sessionStorage.getItem(BROWSE_PRACTICALS_AUTH_KEY);
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return "";
        }
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function withPracticalAuthHeaders(headers = {}, email = signedInEmail || readSignedInEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const accessToken = readSignedInAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function parseIsoDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function eventRangeIncludes(event, dayDate) {
    const start = parseIsoDate(event.start_date);
    const end = parseIsoDate(event.end_date || event.start_date);
    if (!start || !end) return false;

    const current = parseIsoDate(toIsoDate(dayDate));
    return current >= start && current <= end;
}

function toGoogleCalendarLink(event) {
    const start = String(event.start_date || "").replace(/-/g, "");
    const endSource = String(event.end_date || event.start_date || "");
    const endDate = parseIsoDate(endSource);
    if (endDate) {
        endDate.setDate(endDate.getDate() + 1);
    }
    const end = endDate ? toIsoDate(endDate).replace(/-/g, "") : start;

    const text = encodeURIComponent(`${event.event_type}: ${event.title}`);
    const details = encodeURIComponent(event.notes || "Scheduled via Browse Practicals");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

function renderMonthGrid() {
    if (!practicalsGrid || !monthLabel) return;

    practicalsGrid.innerHTML = "";

    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    monthLabel.textContent = visibleMonth.toLocaleString("en-NZ", { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1);
    const firstWeekdayMondayBased = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - firstWeekdayMondayBased);

    for (let i = 0; i < 42; i += 1) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);

        const cell = document.createElement("article");
        cell.className = "practicals-day";

        if (day.getMonth() !== month) {
            cell.classList.add("is-other-month");
        }

        const dayHeader = document.createElement("div");
        dayHeader.className = "practicals-day-number";
        dayHeader.textContent = String(day.getDate());
        cell.appendChild(dayHeader);

        const items = practicalEvents.filter((event) => eventRangeIncludes(event, day));
        if (items.length) {
            const list = document.createElement("ul");
            list.className = "practicals-day-list";
            items.slice(0, 3).forEach((event) => {
                const item = document.createElement("li");
                item.className = event.event_type === "Project" ? "is-project" : "is-activity";
                item.textContent = event.title;
                list.appendChild(item);
            });

            if (items.length > 3) {
                const more = document.createElement("li");
                more.textContent = `+${items.length - 3} more`;
                list.appendChild(more);
            }

            cell.appendChild(list);
        }

        practicalsGrid.appendChild(cell);
    }
}

function renderTimeline() {
    if (!practicalsList) return;
    practicalsList.innerHTML = "";

    if (!practicalEvents.length) {
        practicalsList.innerHTML = "<p class='section-copy'>No practical events scheduled yet.</p>";
        return;
    }

    practicalEvents.forEach((event) => {
        const card = document.createElement("article");
        card.className = "practical-item";

        const title = document.createElement("h3");
        title.textContent = `${event.event_type}: ${event.title}`;

        const date = document.createElement("p");
        date.className = "practical-date";
        date.textContent = event.start_date === event.end_date
            ? event.start_date
            : `${event.start_date} to ${event.end_date}`;

        const notes = document.createElement("p");
        notes.className = "practical-notes";
        notes.textContent = event.notes || "No notes";

        const actions = document.createElement("div");
        actions.className = "practical-actions";

        const googleLink = document.createElement("a");
        googleLink.href = toGoogleCalendarLink(event);
        googleLink.target = "_blank";
        googleLink.rel = "noreferrer";
        googleLink.className = "button button-secondary";
        googleLink.textContent = "Add to Google Calendar";
        actions.appendChild(googleLink);

        if (event.linked_url) {
            const linked = document.createElement("a");
            linked.href = event.linked_url;
            linked.target = "_blank";
            linked.rel = "noreferrer";
            linked.className = "button button-secondary";
            linked.textContent = "Open Link";
            actions.appendChild(linked);
        }

        if (canManage) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "button button-secondary";
            remove.textContent = "Delete";
            remove.addEventListener("click", async () => {
                try {
                    const response = await fetch(`/api/practicals/events/${event.id}?user_email=${encodeURIComponent(signedInEmail)}`, {
                        method: "DELETE"
                    });
                    if (!response.ok) {
                        throw new Error("Could not delete event");
                    }
                    await loadEvents();
                } catch (error) {
                    setStatus(practicalsStatus, error.message || "Could not delete event", true);
                }
            });
            actions.appendChild(remove);
        }

        card.appendChild(title);
        card.appendChild(date);
        card.appendChild(notes);
        card.appendChild(actions);
        practicalsList.appendChild(card);
    });
}

async function loadEvents() {
    try {
        setStatus(practicalsStatus, "Loading practical events...");
        const response = await fetch("/api/practicals/events");
        if (!response.ok) {
            throw new Error("Could not load practical events");
        }

        const rows = await response.json();
        practicalEvents = Array.isArray(rows) ? rows : [];
        practicalEvents.sort((left, right) => {
            if (left.start_date !== right.start_date) {
                return String(left.start_date).localeCompare(String(right.start_date));
            }
            return String(left.title || "").localeCompare(String(right.title || ""));
        });

        renderMonthGrid();
        renderTimeline();
        setStatus(practicalsStatus, `Loaded ${practicalEvents.length} scheduled practical event${practicalEvents.length === 1 ? "" : "s"}.`);
    } catch (error) {
        setStatus(practicalsStatus, error.message || "Could not load practical events.", true);
    }
}

async function resolveManageAccess() {
    signedInEmail = readSignedInEmail();
    canManage = false;

    if (!signedInEmail) {
        if (practicalsManage) practicalsManage.hidden = true;
        if (studentManager) studentManager.hidden = true;
        return;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(signedInEmail)}`, {
            headers: withPracticalAuthHeaders({}, signedInEmail)
        });
        if (!response.ok) {
            if (practicalsManage) practicalsManage.hidden = true;
            return;
        }
        const access = await response.json();
        canManage = Boolean(access?.can_teacher_view || access?.can_admin);
        if (practicalsManage) {
            practicalsManage.hidden = !canManage;
        }
        if (studentManager) {
            studentManager.hidden = !canManage;
        }
    } catch (_error) {
        if (practicalsManage) practicalsManage.hidden = true;
        if (studentManager) studentManager.hidden = true;
    }
}

if (studentPracticalSearch) {
    studentPracticalSearch.addEventListener("input", () => renderStudentPracticalTable());
}

if (studentPracticalStrand) {
    studentPracticalStrand.addEventListener("change", () => renderStudentPracticalTable());
}

if (studentPracticalAllocation) {
    studentPracticalAllocation.addEventListener("change", () => renderStudentPracticalTable());
}

if (studentPracticalBody) {
    studentPracticalBody.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        handleStudentPracticalAction(button);
    });
}

if (monthPrev) {
    monthPrev.addEventListener("click", () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
        renderMonthGrid();
    });
}

if (monthNext) {
    monthNext.addEventListener("click", () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
        renderMonthGrid();
    });
}

if (practicalsForm) {
    practicalsForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!canManage || !signedInEmail) {
            setStatus(practicalsFormStatus, "Only Teacher/Admin users can add events.", true);
            return;
        }

        const formData = new FormData(practicalsForm);
        const payload = {
            title: String(formData.get("title") || "").trim(),
            event_type: String(formData.get("event_type") || "Activity").trim(),
            start_date: String(formData.get("start_date") || "").trim(),
            end_date: String(formData.get("end_date") || "").trim(),
            notes: String(formData.get("notes") || "").trim(),
            linked_url: String(formData.get("linked_url") || "").trim(),
            user_email: signedInEmail
        };

        if (!payload.title || !payload.start_date) {
            setStatus(practicalsFormStatus, "Title and start date are required.", true);
            return;
        }

        try {
            setStatus(practicalsFormStatus, "Saving event...");
            const response = await fetch("/api/practicals/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || "Could not save event");
            }

            practicalsForm.reset();
            setStatus(practicalsFormStatus, "Event added to Browse Practicals.");
            await loadEvents();
        } catch (error) {
            setStatus(practicalsFormStatus, error.message || "Could not save event.", true);
        }
    });
}

(function initPracticalsCalendar() {
    resolveManageAccess().then(() => {
        if (canManage) {
            loadStudentPracticalTracker();
        }
    });
})();
