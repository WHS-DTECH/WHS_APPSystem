const accessElement = document.querySelector("#course-outline-access");
const statusElement = document.querySelector("#course-outline-status");
const resultsElement = document.querySelector("#course-outline-results");
const searchElement = document.querySelector("#course-outline-search");
const yearFilterElement = document.querySelector("#course-outline-year-filter");

const COURSE_OUTLINE_AUTH_KEY = "hub_google_auth_v1";

let outlines = [];
let hasAccess = false;

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getAuthRaw() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(COURSE_OUTLINE_AUTH_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(COURSE_OUTLINE_AUTH_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    if (!localValue && sessionValue) {
        try {
            localStorage.setItem(COURSE_OUTLINE_AUTH_KEY, sessionValue);
        } catch (_error) {
        }
    }

    return localValue || sessionValue || "";
}

function readSignedInEmail() {
    const raw = getAuthRaw();
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        return normalizeEmail(parsed?.profile?.email || parsed?.email || "");
    } catch (_error) {
        return "";
    }
}

function readSignedInToken() {
    const raw = getAuthRaw();
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

function withAuthHeaders(headers = {}, email = readSignedInEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const token = readSignedInToken();
    if (token && token.startsWith("eyJ") && token.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${token}`;
    }

    return nextHeaders;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setStatus(message, isError = false) {
    if (!statusElement) return;

    const text = String(message || "").trim();
    statusElement.textContent = text;
    statusElement.classList.remove("is-error", "is-success");
    statusElement.classList.add(isError ? "is-error" : "is-success");
    statusElement.hidden = !text;
}

function setAccess(message, isError = false) {
    if (!accessElement) return;

    accessElement.textContent = String(message || "");
    accessElement.classList.remove("is-missing", "is-error", "is-success");
    accessElement.classList.add(isError ? "is-error" : "is-success");
}

function formatDateTime(value) {
    const parsed = new Date(String(value || ""));
    if (Number.isNaN(parsed.getTime())) {
        return "-";
    }

    return parsed.toLocaleString("en-NZ", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getSearchTerm() {
    return String(searchElement?.value || "").trim().toLowerCase();
}

function getSelectedYearLevel() {
    return String(yearFilterElement?.value || "all").trim().toLowerCase();
}

function getYearLevels() {
    const set = new Set(
        outlines
            .map((outline) => String(outline?.year_level || "").trim())
            .filter(Boolean)
    );

    return Array.from(set).sort((left, right) => left.localeCompare(right));
}

function renderYearFilter() {
    if (!yearFilterElement) return;

    const selected = getSelectedYearLevel();
    const yearLevels = getYearLevels();

    yearFilterElement.innerHTML = [
        '<option value="all">All year levels</option>',
        ...yearLevels.map((yearLevel) => `<option value="${escapeHtml(yearLevel)}">${escapeHtml(yearLevel)}</option>`)
    ].join("");

    const matching = yearLevels.find((item) => item.toLowerCase() === selected);
    yearFilterElement.value = matching || "all";
}

function getFilteredRows() {
    const searchTerm = getSearchTerm();
    const selectedYear = getSelectedYearLevel();

    return outlines.filter((outline) => {
        const yearLevel = String(outline?.year_level || "").trim();
        if (selectedYear !== "all" && yearLevel.toLowerCase() !== selectedYear) {
            return false;
        }

        if (!searchTerm) {
            return true;
        }

        const standards = Array.isArray(outline?.standards)
            ? outline.standards.map((row) => String(row?.standardLabel || "").trim()).join(" ")
            : "";

        const haystack = [
            outline?.course_name,
            outline?.year_level,
            outline?.year_version,
            outline?.subject_stream,
            outline?.summary,
            standards
        ].map((value) => String(value || "")).join(" ").toLowerCase();

        return haystack.includes(searchTerm);
    });
}

function renderRows() {
    if (!resultsElement) return;

    if (!hasAccess) {
        resultsElement.innerHTML = `
            <article class="upload-panel">
                <p class="project-auth-status is-error">Sign in with a Teacher, Lead Teacher, or Admin account to view course outlines.</p>
            </article>
        `;
        return;
    }

    const filteredRows = getFilteredRows();
    if (!filteredRows.length) {
        resultsElement.innerHTML = `
            <article class="upload-panel">
                <p class="project-auth-status">No course outlines match your filters.</p>
            </article>
        `;
        return;
    }

    resultsElement.innerHTML = filteredRows.map((outline) => {
        const standards = Array.isArray(outline?.standards) ? outline.standards : [];
        const standardsCount = standards.length;
        const standardsList = standards.slice(0, 6).map((row) => `<li>${escapeHtml(row?.standardLabel || "Unnamed standard")}</li>`).join("");
        const hasMoreStandards = standardsCount > 6;

        return `
            <article class="course-outline-card">
                <h3>${escapeHtml(outline?.course_name || "Untitled course")}</h3>
                <p class="course-outline-meta">Year: ${escapeHtml(outline?.year_level || "-")} | Version: ${escapeHtml(outline?.year_version || "-")} | Stream: ${escapeHtml(outline?.subject_stream || "-")}</p>
                <p class="course-outline-meta">Updated: ${escapeHtml(formatDateTime(outline?.updated_at))}</p>
                <p class="course-outline-summary">${escapeHtml(outline?.summary || "No summary provided.")}</p>
                <div class="course-outline-tags">
                    <span class="course-outline-tag">${standardsCount} standard${standardsCount === 1 ? "" : "s"}</span>
                    <span class="course-outline-tag">ID: ${escapeHtml(outline?.id || "-")}</span>
                </div>
                <ul class="course-outline-standards">
                    ${standardsList || "<li>No standards listed.</li>"}
                    ${hasMoreStandards ? `<li>+ ${standardsCount - 6} more</li>` : ""}
                </ul>
            </article>
        `;
    }).join("");
}

async function resolveAccess() {
    const email = readSignedInEmail();
    if (!email) {
        hasAccess = false;
        setAccess("Sign in with your school account to browse course outlines.", true);
        setStatus("");
        renderRows();
        return;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
            headers: withAuthHeaders({}, email)
        });
        if (!response.ok) {
            throw new Error("Could not resolve your access.");
        }

        const data = await response.json();
        const role = normalizeRole(data?.additional_role);
        const roleAllowed = role === "teacher" || role === "lead teacher";
        hasAccess = Boolean(data?.can_admin) || roleAllowed;

        if (!hasAccess) {
            setAccess("Your account can sign in, but Course Outlines is limited to Teacher, Lead Teacher, and Admin.", true);
            setStatus("");
            renderRows();
            return;
        }

        setAccess(`Signed in as ${email}`);
    } catch (error) {
        hasAccess = false;
        setAccess(error.message || "Could not resolve access.", true);
        setStatus("");
        renderRows();
    }
}

async function loadCourseOutlines() {
    if (!hasAccess) return;

    const email = readSignedInEmail();
    if (!email) {
        setStatus("Sign in with your school account first.", true);
        return;
    }

    try {
        setStatus("Loading course outlines...");

        const response = await fetch("/api/course-outlines", {
            headers: withAuthHeaders({}, email)
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || `Could not load course outlines (HTTP ${response.status})`);
        }

        outlines = Array.isArray(payload?.outlines) ? payload.outlines : [];
        renderYearFilter();
        renderRows();
        setStatus(`Loaded ${outlines.length} course outline${outlines.length === 1 ? "" : "s"}.`);
    } catch (error) {
        outlines = [];
        renderYearFilter();
        renderRows();
        setStatus(error.message || "Could not load course outlines.", true);
    }
}

async function initBrowseCourseOutlines() {
    await resolveAccess();
    await loadCourseOutlines();
}

if (searchElement) {
    searchElement.addEventListener("input", () => {
        renderRows();
    });
}

if (yearFilterElement) {
    yearFilterElement.addEventListener("change", () => {
        renderRows();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        void initBrowseCourseOutlines();
    });
} else {
    void initBrowseCourseOutlines();
}
