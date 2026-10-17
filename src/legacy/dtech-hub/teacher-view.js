const exportButton = document.querySelector("#teacher-export");
const clearButton = document.querySelector("#teacher-clear");
const teacherStatus = document.querySelector("#teacher-status");
const standardsLinksHost = document.querySelector("#standards-links");
const standardsSummaryHost = document.querySelector("#standards-summary");
const standardsMeta = document.querySelector("#standards-results-meta");
const templateSyncButton = document.querySelector("#teacher-sync-template-library");
const templateSyncStatus = document.querySelector("#teacher-sync-status");
const templateSyncFolderInput = document.querySelector("#teacher-template-folder-name");
const TEACHER_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
const TEACHER_TEMPLATE_SYNC_SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const teacherDriveState = {
    tokenClient: null,
    accessToken: "",
    tokenExpiry: 0,
    pendingResolve: null
};

function getHubStoredAuthRaw() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(TEACHER_HUB_AUTH_STORAGE_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(TEACHER_HUB_AUTH_STORAGE_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    return localValue || sessionValue;
}

function getSignedInEmail() {
    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function getSignedInAccessToken() {
    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        const expiresAt = Number(parsed?.expiresAt || 0);
        if (expiresAt <= Date.now()) {
            return "";
        }
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function withTeacherAuthHeaders(headers = {}, email = getSignedInEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const accessToken = getSignedInAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

async function enforceTeacherViewAccess() {
    const signedInEmail = getSignedInEmail();
    if (!signedInEmail) {
        window.location.replace("index.html");
        return false;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(signedInEmail)}`, {
            headers: withTeacherAuthHeaders({}, signedInEmail)
        });
        if (!response.ok) {
            window.location.replace("index.html");
            return false;
        }

        const access = await response.json();
        if (!access?.can_teacher_view) {
            window.location.replace("index.html");
            return false;
        }

        return true;
    } catch (_error) {
        window.location.replace("index.html");
        return false;
    }
}

function setTeacherStatus(message, isError = false) {
    if (!teacherStatus) return;
    teacherStatus.textContent = message;
    teacherStatus.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

function setTemplateSyncStatus(message, isError = false) {
    if (!templateSyncStatus) return;
    templateSyncStatus.textContent = String(message || "").trim();
    templateSyncStatus.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

function initTeacherDriveTokenClient() {
    if (!window.google?.accounts?.oauth2) return null;
    const clientId = document.querySelector('meta[name="hub-google-client-id"]')?.content?.trim() || "";
    if (!clientId) return null;

    return window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: TEACHER_TEMPLATE_SYNC_SCOPES,
        callback: (response) => {
            if (teacherDriveState.pendingResolve) {
                teacherDriveState.pendingResolve(response || {});
                teacherDriveState.pendingResolve = null;
            }
            if (response?.access_token && !response?.error) {
                teacherDriveState.accessToken = response.access_token;
                teacherDriveState.tokenExpiry = Date.now() + (Number(response.expires_in) || 3600) * 1000;
            }
        },
        error_callback: (error) => {
            if (teacherDriveState.pendingResolve) {
                teacherDriveState.pendingResolve({ error: error?.type || "access_denied" });
                teacherDriveState.pendingResolve = null;
            }
        }
    });
}

function requestTeacherDriveToken(options = {}) {
    const forceConsent = Boolean(options?.forceConsent);
    return new Promise((resolve) => {
        if (teacherDriveState.accessToken && teacherDriveState.tokenExpiry > Date.now() + 60000) {
            resolve({ access_token: teacherDriveState.accessToken });
            return;
        }

        if (!teacherDriveState.tokenClient) {
            teacherDriveState.tokenClient = initTeacherDriveTokenClient();
        }

        if (!teacherDriveState.tokenClient) {
            resolve({ error: "Drive sign-in is not available." });
            return;
        }

        teacherDriveState.pendingResolve = resolve;
        teacherDriveState.tokenClient.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
    });
}

async function handleTemplateLibrarySync() {
    if (!templateSyncButton) return;
    templateSyncButton.disabled = true;
    setTemplateSyncStatus("Requesting Google Drive access...");

    const tokenResponse = await requestTeacherDriveToken();
    if (tokenResponse.error) {
        templateSyncButton.disabled = false;
        setTemplateSyncStatus("Drive access was not granted. Please try again.", true);
        return;
    }

    const folderName = String(templateSyncFolderInput?.value || "Process Slide Templates").trim() || "Process Slide Templates";
    setTemplateSyncStatus(`Syncing slides from ${folderName}...`);

    try {
        const response = await fetch("/api/template-library/sync", {
            method: "POST",
            headers: withTeacherAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                driveAccessToken: tokenResponse.access_token,
                folderName
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);

        const syncedCount = Number(payload?.syncedCount || 0);
        const folderUrl = String(payload?.folder?.url || "").trim();
        if (folderUrl) {
            setTemplateSyncStatus(`Synced ${syncedCount} template${syncedCount === 1 ? "" : "s"}.`);
        } else {
            setTemplateSyncStatus(`Synced ${syncedCount} template${syncedCount === 1 ? "" : "s"}.`);
        }
    } catch (error) {
        const message = String(error?.message || "Sync failed.");
        const needsConsentRetry = /insufficient|forbidden|has not granted the app|read access/i.test(message);
        if (!needsConsentRetry) {
            setTemplateSyncStatus(message, true);
            templateSyncButton.disabled = false;
            return;
        }

        teacherDriveState.accessToken = "";
        teacherDriveState.tokenExpiry = 0;
        const consentTokenResponse = await requestTeacherDriveToken({ forceConsent: true });
        if (consentTokenResponse.error) {
            setTemplateSyncStatus("Google Drive permission is required to sync templates.", true);
            templateSyncButton.disabled = false;
            return;
        }

        try {
            const response = await fetch("/api/template-library/sync", {
                method: "POST",
                headers: withTeacherAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    driveAccessToken: consentTokenResponse.access_token,
                    folderName
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
            const syncedCount = Number(payload?.syncedCount || 0);
            setTemplateSyncStatus(`Synced ${syncedCount} template${syncedCount === 1 ? "" : "s"}.`);
        } catch (retryError) {
            setTemplateSyncStatus(String(retryError?.message || "Sync failed."), true);
        }
    }

    templateSyncButton.disabled = false;
}

async function fetchSharedActivities() {
    const response = await fetch("/api/activities");
    if (!response.ok) {
        throw new Error("Could not load shared activities");
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    const raw = String(value || "").trim();
    if (!raw) {
        return [];
    }

    if (raw.startsWith("[") && raw.endsWith("]")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item || "").trim()).filter(Boolean);
            }
        } catch (_error) {
            // Fallback to newline parsing.
        }
    }

    return raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function detectSubject(activity) {
    const explicitSubject = String(activity?.subject_stream || activity?.subject || "").trim().toUpperCase();
    if (["DTECH", "COMP", "TEXT", "DTONLINE"].includes(explicitSubject)) {
        return explicitSubject;
    }

    const classPreparationLines = toArray(activity?.class_preparation);
    const subjectMarker = classPreparationLines.find((line) => String(line || "").toLowerCase().startsWith("subject_stream:"));
    if (subjectMarker) {
        const fromMarker = String(subjectMarker).slice("subject_stream:".length).trim().toUpperCase();
        if (["DTECH", "COMP", "TEXT", "DTONLINE"].includes(fromMarker)) {
            return fromMarker;
        }
    }

    const probe = [
        activity?.name,
        activity?.type,
        activity?.description,
        ...(toArray(activity?.standard_details)),
        ...(toArray(activity?.assessment_focus)),
        ...(toArray(activity?.tasks_list))
    ]
        .join(" ")
        .toLowerCase();

    if (/(textile|textiles|fabric|sewing|garment)/.test(probe)) return "TEXT";
    if (/(dtonline|online|remote learning|distance)/.test(probe)) return "DTONLINE";
    if (/(computer|computing|programming|python|software|coding|app dev)/.test(probe)) return "COMP";
    if (/(digital technolog|dtech)/.test(probe)) return "DTECH";
    return "DTECH";
}

function detectNceaLevel(activity) {
    const probe = [
        activity?.name,
        activity?.description,
        ...(toArray(activity?.standard_details)),
        ...(toArray(activity?.assessment_focus))
    ]
        .join(" ")
        .toLowerCase();

    if (/level\s*1|\bl1\b/.test(probe)) return "1";
    if (/level\s*2|\bl2\b/.test(probe)) return "2";
    if (/level\s*3|\bl3\b/.test(probe)) return "3";

    const yearText = String(activity?.year_level || "").toLowerCase();
    const yearMatch = yearText.match(/(11|12|13)/);
    if (yearMatch?.[1] === "11") return "1";
    if (yearMatch?.[1] === "12") return "2";
    if (yearMatch?.[1] === "13") return "3";
    return "?";
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

async function fetchProjectInterestSummary() {
    const email = getSignedInEmail();
    const headers = withTeacherAuthHeaders({}, email);
    const response = await fetch("/api/project-interests", { headers });
    if (!response.ok) {
        throw new Error("Could not load project interests");
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchStudentDirectory() {
    const response = await fetch("/api/student_timetable/all");
    if (!response.ok) {
        return [];
    }

    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.students) ? payload.students : [];
}

function renderStandardsLinks() {
    if (!standardsLinksHost) return;

    standardsLinksHost.className = "standards-link-grid";
    standardsLinksHost.innerHTML = `
        <article class="standards-link-card">
            <h3>Digital Technologies</h3>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Digital+Technologies&view=all&level=01" target="_blank" rel="noreferrer">Level 1</a>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Digital+Technologies&view=all&level=02" target="_blank" rel="noreferrer">Level 2</a>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Digital+Technologies&view=all&level=03" target="_blank" rel="noreferrer">Level 3</a>
        </article>
        <article class="standards-link-card">
            <h3>Generic Computing</h3>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Computing&view=all&level=01" target="_blank" rel="noreferrer">Level 1</a>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Computing&view=all&level=02" target="_blank" rel="noreferrer">Level 2</a>
            <a href="https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Computing&view=all&level=03" target="_blank" rel="noreferrer">Level 3</a>
        </article>
    `;
}

function renderStandardsSummary(assignments) {
    if (!standardsSummaryHost) return;

    if (!assignments.length) {
        standardsSummaryHost.innerHTML = `<article class="standards-group"><h3>No assessment allocations found</h3><p class="section-copy">Allocate students to assessment tasks to populate this snapshot.</p></article>`;
        if (standardsMeta) standardsMeta.textContent = "0 students tracked";
        return;
    }

    const groups = new Map();
    for (const row of assignments) {
        const key = `${row.subject} | ${row.yearGroup} | L${row.level}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    const groupEntries = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    standardsSummaryHost.innerHTML = groupEntries.map(([groupName, rows]) => {
        const lines = rows
            .sort((left, right) => left.studentEmail.localeCompare(right.studentEmail))
            .map((row) => {
                const standardText = row.standardSummary ? ` — ${row.standardSummary}` : "";
                return `<li><strong>${row.studentEmail}</strong><span class="standards-subject-chip">${row.subject}</span> · <a class="standards-task-link" href="ProjectPages/custom-activity.html?id=${encodeURIComponent(row.activityId)}">${row.activityName}</a>${standardText}</li>`;
            })
            .join("");

        return `
            <article class="standards-group">
                <h3>${groupName}</h3>
                <ol class="standards-list">${lines}</ol>
            </article>
        `;
    }).join("");

    if (standardsMeta) {
        const studentCount = new Set(assignments.map((row) => row.studentEmail)).size;
        standardsMeta.textContent = `${studentCount} student${studentCount === 1 ? "" : "s"} across ${groupEntries.length} stream${groupEntries.length === 1 ? "" : "s"}`;
    }
}

async function renderNzqaStandardsSnapshot() {
    renderStandardsLinks();

    if (!standardsSummaryHost) return;
    standardsSummaryHost.innerHTML = `<article class="standards-group"><h3>Loading standards snapshot...</h3></article>`;

    try {
        const [activities, interests, students] = await Promise.all([
            fetchSharedActivities(),
            fetchProjectInterestSummary(),
            fetchStudentDirectory()
        ]);

        const activityById = new Map((activities || []).map((activity) => [String(activity?.id || "").trim(), activity]));
        const studentYearByEmail = new Map();
        (students || []).forEach((row) => {
            const email = extractStudentEmail(row);
            const year = extractStudentYearGroup(row);
            if (email && year) {
                studentYearByEmail.set(email, year);
            }
        });

        const assignments = [];
        (interests || []).forEach((interestRow) => {
            const activityId = String(interestRow?.project_id || "").trim();
            const activity = activityById.get(activityId);
            if (!activity) return;

            const category = String(activity?.activity_category || "").toLowerCase();
            if (!category.includes("assessment")) return;

            const studentsInTask = Array.isArray(interestRow?.students) ? interestRow.students : [];
            const standardDetailLines = toArray(activity?.standard_details || activity?.assessment_focus);

            studentsInTask.forEach((student) => {
                const studentEmail = String(student?.email || student?.student_email || "").trim().toLowerCase();
                if (!studentEmail) return;

                const assignedStandards = [
                    String(student?.standard_1 || "").trim(),
                    String(student?.standard_2 || "").trim()
                ].filter(Boolean);
                const standardSummary = assignedStandards.length
                    ? assignedStandards.join("; ")
                    : (standardDetailLines.length ? standardDetailLines[0] : "");

                assignments.push({
                    activityId,
                    activityName: String(activity?.name || "Assessment Task").trim(),
                    studentEmail,
                    subject: detectSubject(activity),
                    level: detectNceaLevel(activity),
                    yearGroup: studentYearByEmail.get(studentEmail) || String(activity?.year_level || "Unspecified").trim() || "Unspecified",
                    standardSummary
                });
            });
        });

        renderStandardsSummary(assignments);
    } catch (error) {
        standardsSummaryHost.innerHTML = `<article class="standards-group"><h3>Could not load standards snapshot</h3><p class="section-copy">${String(error?.message || "Please refresh and try again.")}</p></article>`;
        if (standardsMeta) standardsMeta.textContent = "Error";
    }
}

function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
}

if (exportButton) {
    exportButton.addEventListener("click", async () => {
        try {
            const activities = await fetchSharedActivities();
            if (!activities.length) {
                setTeacherStatus("No shared uploaded activities to export yet.", true);
                return;
            }

            downloadJson("dtech-hub-shared-activities.json", activities);
            setTeacherStatus(`Exported ${activities.length} shared activit${activities.length === 1 ? "y" : "ies"}.`);
        } catch (error) {
            setTeacherStatus(error.message, true);
        }
    });
}

if (clearButton) {
    clearButton.addEventListener("click", async () => {
        try {
            const response = await fetch("/api/activities", { method: "DELETE" });
            if (!response.ok) {
                throw new Error("Could not clear shared activities");
            }

            setTeacherStatus("Shared uploaded activities cleared. Reloading view...");
            window.setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (error) {
            setTeacherStatus(error.message, true);
        }
    });
}

async function initTeacherView() {
    const allowed = await enforceTeacherViewAccess();
    if (!allowed) return;

    if (templateSyncButton) {
        templateSyncButton.addEventListener("click", () => {
            void handleTemplateLibrarySync();
        });
    }

    await renderNzqaStandardsSnapshot();
}

// Overview vs Library are just a visibility toggle; underlying grids/filters keep working unchanged.
function wireTeacherViewTabs() {
    const tabButtons = document.querySelectorAll("[data-teacher-view-tab]");
    if (!tabButtons.length) return;

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const targetTab = String(button.getAttribute("data-teacher-view-tab") || "").trim();
            if (!targetTab) return;

            tabButtons.forEach((btn) => {
                const isActive = btn === button;
                btn.classList.toggle("is-active", isActive);
                btn.setAttribute("aria-selected", isActive ? "true" : "false");
            });

            document.querySelectorAll(".teacher-view-tab-panel").forEach((panel) => {
                panel.hidden = panel.id !== `teacher-view-panel-${targetTab}`;
            });
        });
    });
}

wireTeacherViewTabs();
initTeacherView();
