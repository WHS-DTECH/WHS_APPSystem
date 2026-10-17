const form = document.querySelector("#upload-activity-form");
const costsInput = document.querySelector("#costs");
const commonCostOptions = Array.from(document.querySelectorAll(".common-cost-option"));
const uploadStatus = document.querySelector("#upload-status");
const cancelButton = document.querySelector("#cancel-upload");
const clearDraftButtons = Array.from(document.querySelectorAll("[data-clear-project-draft]"));
const authStatusElement = document.querySelector("#project-auth-status");
const PROJECT_DRAFT_STORAGE_KEY = "dtechHub:uploadProjectDraft:v1";
const UPLOAD_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
const SUBJECT_STREAM_PREFIX = "subject_stream:";

function getEditingProjectId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("id") || "").trim();
}

function normalizeCardCategory(value, fallback = "Project") {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return fallback;

    if (raw === "project") return "Project";
    if (raw === "lesson") return "Lesson";
    if (raw === "assessment task" || raw === "assessment activity" || raw === "assessment") return "Assessment Task";
    if (raw === "activity" || raw === "skill activity" || raw === "practice" || raw === "practice activity") return "Activity";

    return fallback;
}

function getTextareaLinesSet(textarea) {
    return new Set(
        String(textarea?.value || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
    );
}

function setTextareaLines(textarea, values) {
    if (!textarea) return;
    textarea.value = Array.from(values).join("\n");
}

function syncCommonCostOptionsFromTextarea() {
    if (!costsInput || !commonCostOptions.length) {
        return;
    }

    const normalizedLines = new Set(
        Array.from(getTextareaLinesSet(costsInput)).map((value) => value.toLowerCase())
    );

    commonCostOptions.forEach((option) => {
        const value = String(option.value || "").trim().toLowerCase();
        option.checked = normalizedLines.has(value);
    });
}

function toggleCommonCost(value, isChecked) {
    if (!costsInput) {
        return;
    }

    const line = String(value || "").trim();
    if (!line) {
        return;
    }

    const lines = getTextareaLinesSet(costsInput);
    if (isChecked) {
        lines.add(line);
    } else {
        const lowered = line.toLowerCase();
        for (const existing of Array.from(lines)) {
            if (existing.toLowerCase() === lowered) {
                lines.delete(existing);
            }
        }
    }

    setTextareaLines(costsInput, lines);
}
function parseMaybeArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    const raw = String(value || "").trim();
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [raw];
    } catch (_error) {
        return raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }
}

function normalizeSubjectStream(value) {
    const upper = String(value || "").trim().toUpperCase();
    if (["DTECH", "COMP", "TEXT", "DTONLINE"].includes(upper)) {
        return upper;
    }
    return "";
}

function extractSubjectStreamFromClassPreparation(value) {
    const lines = parseMaybeArray(value);
    for (const line of lines) {
        const lower = String(line || "").trim().toLowerCase();
        if (lower.startsWith(SUBJECT_STREAM_PREFIX)) {
            return normalizeSubjectStream(lower.slice(SUBJECT_STREAM_PREFIX.length));
        }
    }
    return "";
}

function mergeClassPreparationWithSubject(existingValue, subjectStream) {
    const lines = parseMaybeArray(existingValue).filter(
        (line) => !String(line || "").trim().toLowerCase().startsWith(SUBJECT_STREAM_PREFIX)
    );
    const normalized = normalizeSubjectStream(subjectStream);
    if (normalized) {
        lines.unshift(`${SUBJECT_STREAM_PREFIX}${normalized}`);
    }
    return lines;
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function getHubStoredAuthRaw() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(UPLOAD_HUB_AUTH_STORAGE_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(UPLOAD_HUB_AUTH_STORAGE_KEY);
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
        return normalizeEmail(parsed?.profile?.email || "");
    } catch (_error) {
        return "";
    }
}

function getHubStoredAuthState() {
    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return { email: "", accessToken: "" };
    }

    try {
        const parsed = JSON.parse(raw);
        const email = normalizeEmail(parsed?.profile?.email || "");
        const expiresAt = Number(parsed?.expiresAt || 0);
        const accessToken = expiresAt > Date.now() ? String(parsed?.idToken || parsed?.accessToken || "").trim() : "";
        return { email, accessToken };
    } catch (_error) {
        return { email: "", accessToken: "" };
    }
}

function withUserEmailHeader(headers = {}) {
    const { email, accessToken } = getHubStoredAuthState();
    if (!email) {
        return headers;
    }

    const nextHeaders = {
        ...headers,
        "x-user-email": email
    };

    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function renderProjectAuthStatus() {
    if (!authStatusElement) return;

    const email = getSignedInEmail();
    if (email) {
        authStatusElement.classList.remove("is-missing");
        authStatusElement.textContent = `Signed in as ${email}`;
        return;
    }

    authStatusElement.classList.add("is-missing");
    authStatusElement.textContent = "Not signed in. Sign in with your school Google account before saving.";
}

async function prefillProjectIfEditing() {
    const id = getEditingProjectId();
    if (!id || !form) return;

    try {
        const response = await fetch(`/api/activities/${encodeURIComponent(id)}`);
        if (!response.ok) return;

        const data = await response.json();

        form.activityName.value = String(data.name || "");
        form.startDate.value = String(data.start_date || "");
        form.yearLevel.value = String(data.year_level || "");
        form.type.value = String(data.type || "");
        form.activityCategory.value = normalizeCardCategory(data.activity_category, "Project");
        form.difficulty.value = String(data.difficulty || "");
        if (data.time_sensitive !== undefined || data.timeSensitive !== undefined) {
            form.timeSensitive.checked = Boolean(data.time_sensitive ?? data.timeSensitive);
        } else if (form.timeSensitive) {
            form.timeSensitive.checked = false;
        }
        form.cardColor.value = String(data.card_color || data.card_colour || data.color || form.cardColor.value || "");
        form.cardUrl.value = String(data.card_url || data.activity_url || data.url || "");
        form.outcomeImageUrl.value = String(data.outcome_image_url || data.image_url || "");
        if (form.subjectStream) {
            form.subjectStream.value =
                normalizeSubjectStream(data.subject_stream) || extractSubjectStreamFromClassPreparation(data.class_preparation) || "";
        }
        if (data.show_in_this_week !== undefined || data.show_this_week !== undefined || data.is_this_week !== undefined) {
            form.showThisWeek.checked = Boolean(data.show_in_this_week ?? data.show_this_week ?? data.is_this_week);
        } else if (form.showThisWeek) {
            form.showThisWeek.checked = false;
        }

        form.contactName.value = String(data.contact_name || "");
        form.contactPhone.value = String(data.contact_phone || "");
        form.contactEmail.value = String(data.contact_email || "");
        form.company.value = String(data.company || "");
        form.address.value = String(data.address || "");
        form.shortDescription.value = String(data.description || "");
        form.overview.value = parseMaybeArray(data.overview).join("\n");
        form.services.value = parseMaybeArray(data.services).join("\n");
        form.costs.value = parseMaybeArray(data.costs).join("\n");
        syncCommonCostOptionsFromTextarea();
        saveProjectDraft();
    } catch (_error) {
        // Ignore prefill failures and allow the form to remain editable.
    }
}

window.addEventListener("DOMContentLoaded", prefillProjectIfEditing);
window.addEventListener("DOMContentLoaded", restoreProjectDraftIfAvailable);
window.addEventListener("DOMContentLoaded", bindProjectDraftAutosave);
window.addEventListener("DOMContentLoaded", renderProjectAuthStatus);
window.addEventListener("storage", (event) => {
    if (event.key === UPLOAD_HUB_AUTH_STORAGE_KEY) {
        renderProjectAuthStatus();
    }
});

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function linesToArray(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function saveProjectDraft() {
    if (!form) return;

    const draft = {};
    const formData = new FormData(form);
    formData.forEach((value, key) => {
        if (key === "outcomeImageFile") return;
        draft[key] = String(value || "");
    });

    draft.showThisWeek = form.showThisWeek?.checked ? "on" : "";
    draft.__editingId = getEditingProjectId();

    try {
        localStorage.setItem(PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (_error) {
        // Ignore storage write errors.
    }
}

function restoreProjectDraftIfAvailable() {
    if (!form) return;

    let draft = null;
    try {
        draft = JSON.parse(localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY) || "null");
    } catch (_error) {
        draft = null;
    }
    if (!draft || typeof draft !== "object") return;

    const editingId = getEditingProjectId();
    if (editingId) {
        if (!draft.__editingId || String(draft.__editingId) !== String(editingId)) {
            return;
        }
    }

    Object.keys(draft).forEach((key) => {
        if (key === "__editingId") return;

        const field = form.elements.namedItem(key);
        if (!field || field instanceof RadioNodeList) return;

        if (field.type === "checkbox") {
            field.checked = draft[key] === "on" || draft[key] === true;
            return;
        }

        if (key === "activityCategory") {
            field.value = normalizeCardCategory(draft[key], "Project");
            return;
        }

        field.value = String(draft[key] || "");
    });

    syncCommonCostOptionsFromTextarea();
}

function bindProjectDraftAutosave() {
    if (!form) return;
    const handler = () => saveProjectDraft();
    form.addEventListener("input", handler);
    form.addEventListener("change", handler);
}

function clearProjectDraftStorage() {
    try {
        localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
    } catch (_error) {
        // Ignore storage errors.
    }
}

function setStatus(message, isError = false) {
    if (!uploadStatus) return;
    if (!message) {
        uploadStatus.hidden = true;
        uploadStatus.textContent = "";
        uploadStatus.classList.remove("is-success", "is-error");
        return;
    }
    uploadStatus.textContent = message;
    uploadStatus.hidden = false;
    uploadStatus.classList.remove("is-success", "is-error");
    uploadStatus.classList.add(isError ? "is-error" : "is-success");
}

function createProjectPayload() {
    const formData = new FormData(form);
    const name = String(formData.get("activityName") || "").trim();
    const editingId = getEditingProjectId();
    const subjectStream = normalizeSubjectStream(formData.get("subjectStream")) || "DTECH";
    const lockedCategory = "Project";
    const selectedCardColor = String(formData.get("cardColor") || "").trim();
    const normalizedCardColor = selectedCardColor || "Violet";

    return {
        id: editingId || slugify(name),
        name,
        year_level: String(formData.get("yearLevel") || "").trim(),
        type: String(formData.get("type") || "Project").trim(),
        activity_category: lockedCategory,
        duration_minutes: 1,
        time_sensitive: Boolean(formData.get("timeSensitive")),
        difficulty: String(formData.get("difficulty") || "").trim(),
        subject_stream: subjectStream,
        card_color: normalizedCardColor,
            card_url: String(formData.get("cardUrl") || "").trim(),
            outcome_image_url: String(formData.get("outcomeImageUrl") || "").trim(),
        show_in_this_week: Boolean(formData.get("showThisWeek")),
        class_preparation: mergeClassPreparationWithSubject([], subjectStream),
        created_at: new Date().toISOString(),
        
        // Project Proposal Fields
        start_date: String(formData.get("startDate") || "").trim(),
            description: String(formData.get("shortDescription") || "").trim(),
        contact_name: String(formData.get("contactName") || "").trim(),
        contact_phone: String(formData.get("contactPhone") || "").trim(),
        contact_email: String(formData.get("contactEmail") || "").trim(),
        company: String(formData.get("company") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        overview: linesToArray(formData.get("overview")),
        services: linesToArray(formData.get("services")),
        costs: linesToArray(formData.get("costs")),
    };
}

async function saveProjectShared(payload) {
    const response = await fetch("/api/activities", {
        method: "POST",
        headers: withUserEmailHeader({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let result = {};

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch (_error) {
            result = { error: responseText };
        }
    }

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sign-in required. Please sign in with your school Google account and try again.");
        }
        throw new Error(result.error || result.message || `Could not save project (HTTP ${response.status})`);
    }

    return result;
}

if (cancelButton) {
    cancelButton.addEventListener("click", () => {
        window.location.href = "upload-menu.html";
    });
}

async function handleClearDraftClick() {
        clearProjectDraftStorage();
        setStatus("");
        if (!form) return;

        form.reset();
        syncCommonCostOptionsFromTextarea();

        if (getEditingProjectId()) {
            await prefillProjectIfEditing();
            setStatus("Draft cleared. Restored saved project values.");
            return;
        }

        setStatus("Draft cleared.");
}

if (clearDraftButtons.length) {
    clearDraftButtons.forEach((button) => {
        button.addEventListener("click", handleClearDraftClick);
    });
}

if (costsInput) {
    costsInput.addEventListener("input", () => {
        syncCommonCostOptionsFromTextarea();
    });
}

if (commonCostOptions.length) {
    commonCostOptions.forEach((option) => {
        option.addEventListener("change", () => {
            toggleCommonCost(option.value, option.checked);
        });
    });
}

syncCommonCostOptionsFromTextarea();

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            setStatus("Please complete all required fields before saving.", true);
            return;
        }

        const payload = createProjectPayload();
        if (!payload.name) {
            setStatus("Project name is required.", true);
            return;
        }

        if (String(payload.subject_stream || "").toUpperCase() === "TEXT") {
            setStatus("TEXT stream items are filtered from DTECH library. Choose DTECH, COMP, or DTONLINE for this hub.", true);
            return;
        }

        try {
            const saved = await saveProjectShared(payload);
            const savedCategory = normalizeCardCategory(saved?.activity_category || saved?.activityCategory, "");
            const savedStream = normalizeSubjectStream(saved?.subject_stream);

            if (savedCategory && savedCategory !== "Project") {
                setStatus(`Saved, but server returned category ${savedCategory}. Please run Admin > Maintenance repair and try again.`, true);
                return;
            }

            if (savedStream && String(savedStream).toUpperCase() === "TEXT") {
                setStatus("Saved, but server returned TEXT stream, which is hidden from DTECH library. Please change to DTECH/COMP/DTONLINE.", true);
                return;
            }

            localStorage.setItem("dtechHub:lastProjectDraft", JSON.stringify(payload));
            localStorage.setItem("dtechHub:lastSavedProjectId", String(saved.id || payload.id || ""));
            setStatus(`Project saved. Category: Project. Stream: ${savedStream || payload.subject_stream}.`);
            saveProjectDraft();
        } catch (error) {
            setStatus(`Save failed: ${error.message}`, true);
        }
    });
}
