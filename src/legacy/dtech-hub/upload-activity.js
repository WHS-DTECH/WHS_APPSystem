// Prefill form fields if editing an existing activity
function normalizeCardCategory(value, fallback = "Activity") {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return fallback;

    if (raw === "project") return "Project";
    if (raw === "lesson") return "Lesson";
    if (raw === "assessment task" || raw === "assessment activity" || raw === "assessment") return "Assessment Task";
    if (raw === "activity" || raw === "skill activity" || raw === "practice" || raw === "practice activity") return "Activity";

    return fallback;
}

async function prefillFormIfEditing() {
    const id = getEditingActivityId();
    if (!id || !form) return;

    try {
        const response = await fetch(`/api/activities/${encodeURIComponent(id)}`);
        if (!response.ok) return;
        const data = await response.json();
        // Prefill each field if present in data
        if (data.name) form.activityName.value = data.name;
        if (data.year_level) form.yearLevel.value = data.year_level;
        if (data.type) form.type.value = data.type;
        form.activityCategory.value = normalizeCardCategory(data.activity_category, "Activity");
        const normalizedMinutes = normalizeMinutesFromRecord(data);
        if (normalizedMinutes !== "") form.durationMinutes.value = normalizedMinutes;
        if (data.difficulty) form.difficulty.value = data.difficulty;
        if (data.card_color || data.card_colour || data.color) form.cardColor.value = data.card_color || data.card_colour || data.color;
        if (form.subjectStream) {
            form.subjectStream.value =
                normalizeSubjectStream(data.subject_stream) || extractSubjectStreamFromClassPreparation(data.class_preparation);
        }
        if (data.card_url || data.activity_url || data.url) form.cardUrl.value = data.card_url || data.activity_url || data.url;
        currentEditingImageUrl = String(data.outcome_image_url || data.image_url || "").trim();
        if (currentEditingImageUrl) form.outcomeImageUrl.value = currentEditingImageUrl;
        if (data.description) form.shortDescription.value = data.description;
        form.resources.value = normalizeTextareaLines(data.resources).join("\n");
        if (form.equipment) {
            form.equipment.value = normalizeTextareaLines(data.equipment).join("\n");
        }
        syncCommonResourceOptionsFromTextarea();
        form.instructions.value = normalizeTextareaLines(data.instructions).join("\n");
        form.classManagementNotes.value = normalizeTextareaLines(data.class_management_notes).join("\n");
        form.classPreparation.value = stripSubjectStreamMarkers(normalizeTextareaLines(data.class_preparation)).join("\n");
        if (classPreparationNoneCheckbox) {
            const hasPreparation = form.classPreparation.value.trim().length > 0;
            classPreparationNoneCheckbox.checked = !hasPreparation || isNoneClassPreparation(form.classPreparation.value);
            syncClassPreparationNoneState();
        }
        form.assessmentFocus.value = normalizeTextareaLines(data.assessment_focus).join("\n");
        const showInThisWeek = data.show_in_this_week ?? data.show_this_week ?? data.is_pinned ?? data.is_this_week;
        if (typeof showInThisWeek !== "undefined") form.showThisWeek.checked = !!showInThisWeek;
    } catch (e) {
        // Ignore errors, just don't prefill
    }
}

window.addEventListener("DOMContentLoaded", prefillFormIfEditing);

const form = document.querySelector("#upload-activity-form");
const fileInput = document.querySelector("#outcome-image-file");
const imageUrlInput = document.querySelector("#outcome-image-url");
const uploadStatus = document.querySelector("#upload-status");
const cancelButton = document.querySelector("#cancel-upload");
const authStatusElement = document.querySelector("#activity-auth-status");
const classPreparationInput = document.querySelector("#class-preparation");
const classPreparationNoneCheckbox = document.querySelector("#class-preparation-none");
const resourcesInput = document.querySelector("#resources");
const equipmentInput = document.querySelector("#equipment");
const commonResourceOptions = Array.from(document.querySelectorAll(".common-resource-option"));
let currentEditingImageUrl = "";

const UPLOAD_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
const SUBJECT_STREAM_PREFIX = "subject_stream:";

function getEditingActivityId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("id") || "").trim();
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

function normalizeMinutesFromRecord(record) {
    const minutes = Number.parseInt(record?.duration_minutes, 10);
    if (Number.isFinite(minutes) && minutes > 0) {
        return minutes;
    }

    const rawHours = Number(record?.duration_hours);
    if (Number.isFinite(rawHours) && rawHours > 0) {
        // Backward compatibility: older saves may have written minutes into duration_hours.
        if (rawHours > 12) {
            return Math.round(rawHours);
        }
        return Math.round(rawHours * 60);
    }

    const genericDuration = Number(record?.duration);
    if (Number.isFinite(genericDuration) && genericDuration > 0) {
        return Math.round(genericDuration);
    }

    return "";
}

function normalizeTextareaLines(value) {
    const firstPass = parseMaybeArray(value);
    if (firstPass.length !== 1) {
        return firstPass;
    }

    const inner = String(firstPass[0] || "").trim();
    if (!inner.startsWith("[") || !inner.endsWith("]")) {
        return firstPass;
    }

    try {
        const secondPass = JSON.parse(inner);
        return Array.isArray(secondPass)
            ? secondPass.map((item) => String(item || "").trim()).filter(Boolean)
            : firstPass;
    } catch (_error) {
        return firstPass;
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
    const lines = normalizeTextareaLines(value);
    for (const line of lines) {
        const lower = String(line || "").trim().toLowerCase();
        if (lower.startsWith(SUBJECT_STREAM_PREFIX)) {
            return normalizeSubjectStream(lower.slice(SUBJECT_STREAM_PREFIX.length));
        }
    }
    return "";
}

function stripSubjectStreamMarkers(lines) {
    return lines.filter((line) => !String(line || "").trim().toLowerCase().startsWith(SUBJECT_STREAM_PREFIX));
}

function mergeClassPreparationWithSubject(existingValue, subjectStream) {
    const existing = stripSubjectStreamMarkers(normalizeTextareaLines(existingValue));
    const normalized = normalizeSubjectStream(subjectStream);
    if (normalized) {
        existing.unshift(`${SUBJECT_STREAM_PREFIX}${normalized}`);
    }
    return existing;
}

function isNoneClassPreparation(value) {
    return String(value || "").trim().toUpperCase() === "NONE";
}

function syncClassPreparationNoneState(fromCheckbox = false) {
    if (!classPreparationInput || !classPreparationNoneCheckbox) {
        return;
    }

    if (classPreparationNoneCheckbox.checked) {
        if (fromCheckbox || !classPreparationInput.value.trim() || isNoneClassPreparation(classPreparationInput.value)) {
            classPreparationInput.value = "NONE";
        }
        classPreparationInput.readOnly = true;
        classPreparationInput.setAttribute("aria-disabled", "true");
        return;
    }

    if (isNoneClassPreparation(classPreparationInput.value)) {
        classPreparationInput.value = "";
    }

    classPreparationInput.readOnly = false;
    classPreparationInput.removeAttribute("aria-disabled");
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

function syncCommonResourceOptionsFromTextarea() {
    if (!resourcesInput || !commonResourceOptions.length) {
        return;
    }

    const normalizedLines = new Set(
        Array.from(getTextareaLinesSet(resourcesInput)).map((value) => value.toLowerCase())
    );

    commonResourceOptions.forEach((option) => {
        const value = String(option.value || "").trim().toLowerCase();
        option.checked = normalizedLines.has(value);
    });
}

function toggleCommonResource(value, isChecked) {
    if (!resourcesInput) {
        return;
    }

    const line = String(value || "").trim();
    if (!line) {
        return;
    }

    const lines = getTextareaLinesSet(resourcesInput);
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

    setTextareaLines(resourcesInput, lines);
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

function renderActivityAuthStatus() {
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

window.addEventListener("DOMContentLoaded", renderActivityAuthStatus);
window.addEventListener("storage", (event) => {
    if (event.key === UPLOAD_HUB_AUTH_STORAGE_KEY) {
        renderActivityAuthStatus();
    }
});

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

function parseSubjectStreamAndClassPreparation(formData) {
    const subjectStream = normalizeSubjectStream(formData.get("subjectStream"));
    let classPreparation = linesToArray(formData.get("classPreparation"));

    if (classPreparationNoneCheckbox?.checked) {
        classPreparation = ["NONE"];
    }

    return {
        subjectStream,
        classPreparation: mergeClassPreparationWithSubject(classPreparation, subjectStream)
    };
}

async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read image file."));
        reader.readAsDataURL(file);
    });
}

async function uploadActivityImage(file, activityName) {
    if (!file) return;
    if (!activityName) throw new Error("Activity name is required before uploading images.");

    const imageData = await fileToDataUrl(file);
    const activityId = getEditingActivityId() || slugify(activityName);

    setStatus("Uploading image...");

    const response = await fetch(`/api/activities/${activityId}/upload-image`, {
        method: "POST",
        headers: withUserEmailHeader({ "Content-Type": "application/json" }),
        body: JSON.stringify({ image_data: imageData, file_name: file.name })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.image_url) {
        throw new Error(payload.error || "Upload failed");
    }

    if (imageUrlInput) {
        imageUrlInput.value = payload.image_url;
    }
    currentEditingImageUrl = payload.image_url || currentEditingImageUrl;
    setStatus("Image uploaded successfully. URL has been filled in.");
}

function createActivityPayload() {
    const formData = new FormData(form);
    const name = String(formData.get("activityName") || "").trim();
    const resources = linesToArray(formData.get("resources"));
    const equipment = linesToArray(formData.get("equipment"));
    const subjectData = parseSubjectStreamAndClassPreparation(formData);
    const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") || "0"), 10) || 0;
    const editingId = getEditingActivityId();

    return {
        id: editingId || slugify(name),
        name,
        year_level: String(formData.get("yearLevel") || "").trim(),
        type: String(formData.get("type") || "").trim(),
        activity_category: normalizeCardCategory(formData.get("activityCategory"), "Activity"),
        duration_minutes: durationMinutes,
        difficulty: String(formData.get("difficulty") || "").trim(),
        subject_stream: subjectData.subjectStream,
        card_color: String(formData.get("cardColor") || "").trim(),
        card_url: String(formData.get("cardUrl") || "").trim(),
        outcome_image_url: String(formData.get("outcomeImageUrl") || "").trim() || currentEditingImageUrl,
        description: String(formData.get("shortDescription") || "").trim(),
        resources,
        equipment,
        instructions: linesToArray(formData.get("instructions")),
        class_management_notes: linesToArray(formData.get("classManagementNotes")),
        class_preparation: subjectData.classPreparation,
        assessment_focus: linesToArray(formData.get("assessmentFocus")),
        show_in_this_week: Boolean(formData.get("showThisWeek")),
        created_at: new Date().toISOString()
    };
}

async function saveActivityShared(payload) {
    const response = await fetch("/api/activities", {
        method: "POST",
        headers: withUserEmailHeader({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message =
            (data && (data.error || data.message)) ||
            `Could not save activity (HTTP ${response.status})`;
        throw new Error(message);
    }

    if (!data || (!data.id && !data.name)) {
        throw new Error("Save response was incomplete. Please try again.");
    }

    return data;
}

if (fileInput) {
    fileInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const activityName = String(form?.activityName?.value || "").trim();

        try {
            await uploadActivityImage(file, activityName);
        } catch (error) {
            setStatus(`Image upload failed: ${error.message}`, true);
        }
    });
}

if (cancelButton) {
    cancelButton.addEventListener("click", () => {
        window.location.href = "upload-menu.html";
    });
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = createActivityPayload();

        if (!payload.name) {
            setStatus("Activity name is required.", true);
            return;
        }

        if (!getSignedInEmail()) {
            setStatus("Please sign in with your staff/admin school account before saving.", true);
            return;
        }

        setStatus("Saving activity...", false);
        try {
            const saved = await saveActivityShared(payload);
            localStorage.setItem("dtechHub:lastActivityDraft", JSON.stringify(payload));
            localStorage.setItem("dtechHub:lastSavedActivityId", String(saved.id || payload.id || ""));
            setStatus(`Activity "${saved.name || payload.name}" saved. Redirecting to Activities Library...`, false);
            setTimeout(() => {
                window.location.href = "/index.html#project-library";
            }, 1000);
        } catch (error) {
            setStatus(`Save failed: ${error.message}`, true);
        }
    });
}

if (classPreparationNoneCheckbox) {
    classPreparationNoneCheckbox.addEventListener("change", () => {
        syncClassPreparationNoneState(true);
    });
}

if (resourcesInput) {
    resourcesInput.addEventListener("input", () => {
        syncCommonResourceOptionsFromTextarea();
    });
}

if (commonResourceOptions.length) {
    commonResourceOptions.forEach((option) => {
        option.addEventListener("change", () => {
            toggleCommonResource(option.value, option.checked);
        });
    });
}

syncClassPreparationNoneState();
syncCommonResourceOptionsFromTextarea();
