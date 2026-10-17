const uploadForm = document.querySelector("#upload-unit-form");
const uploadInput = document.querySelector("#unit-plan-file");
const uploadStatus = document.querySelector("#upload-status");
const authStatusElement = document.querySelector("#unit-auth-status");
const uploadButton = document.querySelector("#upload-unit-button");
const clearButton = document.querySelector("#clear-unit-file");
const importTemplateButton = document.querySelector("#import-template-button");
const previewFileButton = document.querySelector("#preview-file-button");
const previewTemplateButton = document.querySelector("#preview-template-button");
const previewPanel = document.querySelector("#unit-preview-panel");
const previewForm = document.querySelector("#unit-preview-form");
const previewSource = document.querySelector("#preview-source");
const savePreviewButton = document.querySelector("#save-preview-button");

const manualForm = document.querySelector("#manual-unit-form");
const saveManualUnitButton = document.querySelector("#save-manual-unit-button");
const manualSaveStatus = document.querySelector("#manual-save-status");
const cancelManualUploadButton = document.querySelector("#cancel-manual-upload");
const clearManualFormButton = document.querySelector("#clear-manual-form");
const lessonList = document.querySelector("#lesson-list");
const addLessonButton = document.querySelector("#add-lesson");
const manualUnitTopicInput = document.querySelector("#manual-unit-topic-input");
const manualAddUnitTopicButton = document.querySelector("#manual-add-unit-topic");
const manualUnitTopicsList = document.querySelector("#manual-unit-topics-list");
const manualUnitTopicsTable = document.querySelector("#manual-unit-topics-table");
const manualUnitTopicsHidden = document.querySelector("#manual-unit-topics");
const pageTitleElement = document.querySelector(".upload-page > h1");
const introTextElement = document.querySelector(".upload-page > .intro-text");

const previewFields = {
    title: document.querySelector("#preview-title"),
    topic: document.querySelector("#preview-topic"),
    yearLevel: document.querySelector("#preview-year-level"),
    subjectStream: document.querySelector("#preview-subject-stream"),
    overview: document.querySelector("#preview-overview"),
    unitAims: document.querySelector("#preview-aims"),
    unitValues: {
        whanaungatanga: document.querySelector("#preview-value-whanaungatanga"),
        rangatiratanga: document.querySelector("#preview-value-rangatiratanga"),
        manaakitanga: document.querySelector("#preview-value-manaakitanga"),
        kaitiakitanga: document.querySelector("#preview-value-kaitiakitanga")
    },
    contexts: {
        environment: document.querySelector("#preview-context-environment"),
        mentalEmotional: document.querySelector("#preview-context-mental-emotional"),
        culture: document.querySelector("#preview-context-culture"),
        social: document.querySelector("#preview-context-social"),
        technology: document.querySelector("#preview-context-technology")
    },
    curriculumLinks: {
        localCurriculumLinks: document.querySelector("#preview-local-curriculum-links"),
        mataurangaMaori: document.querySelector("#preview-matauranga-maori"),
        skills: {
            generalSkills: document.querySelector("#preview-skill-general"),
            careerFutureSkills: document.querySelector("#preview-skill-career-future"),
            considerationsWithinElectronics: document.querySelector("#preview-skill-electronics-considerations"),
            literacy: document.querySelector("#preview-skill-literacy"),
            numeracy: document.querySelector("#preview-skill-numeracy"),
            digitalTech: document.querySelector("#preview-skill-digital-tech"),
            practical: document.querySelector("#preview-skill-practical")
        },
        healthSafety: document.querySelector("#preview-health-safety")
    },
    assessmentLink: document.querySelector("#preview-assessment-link"),
    notes: document.querySelector("#preview-notes"),
    lessonsJson: document.querySelector("#preview-lessons-json")
};

const manualFields = {
    title: document.querySelector("#manual-title"),
    topic: document.querySelector("#manual-topic"),
    strand: document.querySelector("#manual-strand"),
    yearLevel: document.querySelector("#manual-year-level"),
    subjectStream: document.querySelector("#manual-subject-stream"),
    overview: document.querySelector("#manual-overview"),
    unitAims: document.querySelector("#manual-aims"),
    unitValues: {
        whanaungatanga: document.querySelector("#manual-value-whanaungatanga"),
        rangatiratanga: document.querySelector("#manual-value-rangatiratanga"),
        manaakitanga: document.querySelector("#manual-value-manaakitanga"),
        kaitiakitanga: document.querySelector("#manual-value-kaitiakitanga")
    },
    contexts: {
        environment: document.querySelector("#manual-context-environment"),
        mentalEmotional: document.querySelector("#manual-context-mental-emotional"),
        culture: document.querySelector("#manual-context-culture"),
        social: document.querySelector("#manual-context-social"),
        technology: document.querySelector("#manual-context-technology")
    },
    curriculumLinks: {
        localCurriculumLinks: document.querySelector("#manual-local-curriculum-links"),
        mataurangaMaori: document.querySelector("#manual-matauranga-maori"),
        skills: {
            generalSkills: document.querySelector("#manual-skill-general"),
            careerFutureSkills: document.querySelector("#manual-skill-career-future"),
            considerationsWithinElectronics: document.querySelector("#manual-skill-electronics-considerations"),
            literacy: document.querySelector("#manual-skill-literacy"),
            numeracy: document.querySelector("#manual-skill-numeracy"),
            digitalTech: document.querySelector("#manual-skill-digital-tech"),
            practical: document.querySelector("#manual-skill-practical")
        },
        healthSafety: document.querySelector("#manual-health-safety")
    },
    assessmentLink: document.querySelector("#manual-assessment-link"),
    notes: document.querySelector("#manual-notes")
};

const UPLOAD_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
let hasReadyFilePreview = false;
let editUnitPlanId = "";
let manualUnitTopics = [];

const YEAR_LEVEL_OPTIONS = ["Junior", "Year 7", "Year 8", "Middle", "Year 9", "Year 10", "Senior", "Year 11", "Year 12", "Year 13"];
const SCHOOL_VALUE_KEYS = ["whanaungatanga", "rangatiratanga", "manaakitanga", "kaitiakitanga"];
const CONTEXT_KEYS = ["environment", "mentalEmotional", "culture", "social", "technology"];
const LESSON_CARD_CATEGORY_OPTIONS = ["Activity", "Project", "Assessment Task", "Lesson"];
const SCHOOL_VALUE_LABELS = {
    whanaungatanga: "Whanaungatanga",
    rangatiratanga: "Rangatiratanga",
    manaakitanga: "Manaakitanga",
    kaitiakitanga: "Kaitiakitanga"
};
const CONTEXT_LABELS = {
    environment: "Environment",
    mentalEmotional: "Mental-Emotional",
    culture: "Culture",
    social: "Social",
    technology: "Technology"
};
const CURRICULUM_LINK_KEYS = ["localCurriculumLinks", "mataurangaMaori", "skills", "healthSafety"];
const SKILL_KEYS = ["generalSkills", "careerFutureSkills", "considerationsWithinElectronics", "literacy", "numeracy", "digitalTech", "practical"];
const CURRICULUM_LINK_LABELS = {
    localCurriculumLinks: "Local Curriculum Links",
    mataurangaMaori: "Matauranga Maori",
    skills: "Skills",
    healthSafety: "Health & Safety"
};
const SKILL_LABELS = {
    generalSkills: "Skills",
    careerFutureSkills: "Career & Future-Focused Skills",
    considerationsWithinElectronics: "Considerations within Electronics",
    literacy: "Literacy",
    numeracy: "Numeracy",
    digitalTech: "Digital Tech",
    practical: "Practical"
};
const HEALTH_SAFETY_ROW_LIMIT = 8;
const HEALTH_SAFETY_SKILLS_CARRYOVER_LABELS = [
    "skills",
    "career & future-focused skills",
    "career and future-focused skills",
    "career future-focused skills",
    "considerations within electronics"
];

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

    if (!localValue && sessionValue) {
        try {
            localStorage.setItem(UPLOAD_HUB_AUTH_STORAGE_KEY, sessionValue);
        } catch (_error) {
        }
    }

    return localValue || sessionValue || "";
}

function getSignedInEmailFromRaw(raw) {
    if (!raw) {
        return "";
    }

    try {
        const data = JSON.parse(raw);
        return normalizeEmail(data?.profile?.email || data?.email || "");
    } catch (_error) {
        return "";
    }
}

function getSignedInEmail() {
    const raw = getHubStoredAuthRaw();
    const emailFromStorage = getSignedInEmailFromRaw(raw);
    if (emailFromStorage) {
        return emailFromStorage;
    }

    try {
        if (typeof hubAuthState !== "undefined") {
            return normalizeEmail(hubAuthState?.profile?.email || "");
        }
        return "";
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
        const data = JSON.parse(raw);
        const expiresAt = Number(data?.expiresAt || 0);
        if (expiresAt <= Date.now()) {
            return "";
        }
        return String(data?.idToken || data?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function withUserEmailHeader(headers = {}) {
    const email = getSignedInEmail();
    if (!email) {
        return headers;
    }

    const nextHeaders = {
        ...headers,
        "x-user-email": email
    };

    const accessToken = getSignedInAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function setStatus(message, isError = false) {
    if (!uploadStatus) {
        return;
    }

    if (!message) {
        uploadStatus.hidden = true;
        uploadStatus.textContent = "";
        uploadStatus.classList.remove("is-success", "is-error");
        return;
    }

    uploadStatus.hidden = false;
    uploadStatus.textContent = message;
    uploadStatus.classList.remove("is-success", "is-error");
    uploadStatus.classList.add(isError ? "is-error" : "is-success");
}

function setManualSaveStatus(message, isError = false) {
    if (!manualSaveStatus) {
        return;
    }

    if (!message) {
        manualSaveStatus.hidden = true;
        manualSaveStatus.textContent = "";
        manualSaveStatus.classList.remove("is-success", "is-error");
        return;
    }

    manualSaveStatus.hidden = false;
    manualSaveStatus.textContent = message;
    manualSaveStatus.classList.remove("is-success", "is-error");
    manualSaveStatus.classList.add(isError ? "is-error" : "is-success");
}

function setActionButtonsDisabled(disabled) {
    const buttons = [
        uploadButton,
        importTemplateButton,
        previewFileButton,
        previewTemplateButton,
        savePreviewButton,
        saveManualUnitButton,
        addLessonButton,
        clearManualFormButton,
        cancelManualUploadButton
    ];

    buttons.forEach((button) => {
        if (button) {
            button.disabled = Boolean(disabled);
        }
    });

    if (!disabled && uploadButton) {
        uploadButton.disabled = !hasReadyFilePreview;
    }
}

function resetFilePreviewState() {
    hasReadyFilePreview = false;
    if (previewPanel) {
        previewPanel.hidden = true;
    }
    if (uploadButton) {
        uploadButton.disabled = true;
    }
}

function joinLines(value) {
    if (!Array.isArray(value)) {
        return "";
    }

    return value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n");
}

function getSelectValues(selectElement) {
    if (!selectElement) {
        return [];
    }

    return Array.from(selectElement.selectedOptions || [])
        .map((option) => String(option.value || option.textContent || "").trim())
        .filter(Boolean);
}

function setSelectValues(selectElement, values) {
    if (!selectElement) {
        return;
    }

    const selectedValues = Array.isArray(values)
        ? values.map((value) => String(value || "").trim()).filter(Boolean)
        : String(values || "").split(/\s*,\s*/).map((value) => value.trim()).filter(Boolean);

    Array.from(selectElement.options || []).forEach((option) => {
        const optionValue = String(option.value || option.textContent || "").trim();
        option.selected = selectedValues.includes(optionValue);
    });
}

function normalizeYearLevelText(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    }

    return String(value || "")
        .split(/\s*,\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", ");
}

function inferYearLevelSelections(value) {
    const text = Array.isArray(value)
        ? value.map((item) => String(item || "").trim()).filter(Boolean).join(" ")
        : String(value || "");
    const lower = text.toLowerCase();
    const selected = new Set();

    if (/\bjunior\b/.test(lower)) selected.add("Junior");
    if (/\bmiddle\b/.test(lower)) selected.add("Middle");
    if (/\bsenior\b/.test(lower)) selected.add("Senior");

    for (let year = 7; year <= 13; year += 1) {
        const yearPattern = new RegExp(`\\byear\\s*${year}\\b`);
        if (yearPattern.test(lower) || new RegExp(`\\b${year}\\b`).test(lower)) {
            selected.add(`Year ${year}`);
        }
    }

    if (/\b7\s*(?:and|&)\s*8\b/.test(lower) || /\byear\s*7\s*(?:and|&)\s*8\b/.test(lower)) {
        selected.add("Year 7");
        selected.add("Year 8");
    }

    if (/\b8\s*(?:and|&)\s*9\b/.test(lower) || /\byear\s*8\s*(?:and|&)\s*9\b/.test(lower)) {
        selected.add("Year 8");
        selected.add("Year 9");
    }

    if (/\b9\s*(?:and|&)\s*10\b/.test(lower) || /\byear\s*9\s*(?:and|&)\s*10\b/.test(lower)) {
        selected.add("Year 9");
        selected.add("Year 10");
    }

    if (/\b10\s*(?:and|&)\s*11\b/.test(lower) || /\byear\s*10\s*(?:and|&)\s*11\b/.test(lower)) {
        selected.add("Year 10");
        selected.add("Year 11");
    }

    if (/\b11\s*(?:and|&)\s*12\b/.test(lower) || /\byear\s*11\s*(?:and|&)\s*12\b/.test(lower)) {
        selected.add("Year 11");
        selected.add("Year 12");
    }

    if (/\b12\s*(?:and|&)\s*13\b/.test(lower) || /\byear\s*12\s*(?:and|&)\s*13\b/.test(lower)) {
        selected.add("Year 12");
        selected.add("Year 13");
    }

    if (/\b7\s*[-–]\s*8\b/.test(lower) || /\byear\s*7\s*[-–]\s*8\b/.test(lower)) {
        selected.add("Year 7");
        selected.add("Year 8");
    }

    if (/\b8\s*[-–]\s*9\b/.test(lower) || /\byear\s*8\s*[-–]\s*9\b/.test(lower)) {
        selected.add("Year 8");
        selected.add("Year 9");
    }

    if (/\b9\s*[-–]\s*10\b/.test(lower) || /\byear\s*9\s*[-–]\s*10\b/.test(lower)) {
        selected.add("Year 9");
        selected.add("Year 10");
    }

    if (/\b10\s*[-–]\s*11\b/.test(lower) || /\byear\s*10\s*[-–]\s*11\b/.test(lower)) {
        selected.add("Year 10");
        selected.add("Year 11");
    }

    if (/\b11\s*[-–]\s*12\b/.test(lower) || /\byear\s*11\s*[-–]\s*12\b/.test(lower)) {
        selected.add("Year 11");
        selected.add("Year 12");
    }

    if (/\b12\s*[-–]\s*13\b/.test(lower) || /\byear\s*12\s*[-–]\s*13\b/.test(lower)) {
        selected.add("Year 12");
        selected.add("Year 13");
    }

    return YEAR_LEVEL_OPTIONS.filter((option) => selected.has(option));
}

function normalizeLines(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function normalizeTopicText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function toTitleCase(value) {
    return String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function inferUnitTopicFromLessonLike(lesson) {
    const explicit = normalizeTopicText(lesson?.unit_topic ?? lesson?.unitTopic ?? lesson?.lessonUnitTopic ?? "");
    if (explicit) {
        return explicit;
    }

    const candidates = [
        lesson?.title,
        lesson?.lessonTitle,
        lesson?.activity_name,
        lesson?.activityName,
        lesson?.lessonType,
        lesson?.activity_type
    ]
        .map((value) => normalizeTopicText(value || ""))
        .filter(Boolean);

    for (const value of candidates) {
        const cleaned = normalizeTopicText(
            value
                .replace(/activities?\s*:?$/i, "")
                .replace(/:\s*$/, "")
                .replace(/^l\d+\s*[-:]\s*/i, "")
        );
        if (cleaned && cleaned.length <= 64) {
            return cleaned;
        }
    }

    return "";
}

function getExplicitUnitTopicFromLesson(lesson) {
    return normalizeTopicText(lesson?.unit_topic ?? lesson?.unitTopic ?? lesson?.lessonUnitTopic ?? "");
}

function normalizeUnitTopicList(values) {
    const source = Array.isArray(values)
        ? values
        : String(values || "").split(/\r?\n|\s*,\s*/);
    const seen = new Set();
    const result = [];

    source.forEach((value) => {
        const topic = normalizeUnitTopicDisplayLabel(value);
        if (isLikelyNoiseTopicLabel(topic)) {
            return;
        }
        const key = canonicalizeUnitTopicLabel(topic);
        if (!topic || seen.has(key)) {
            return;
        }
        seen.add(key);
        result.push(topic);
    });

    return result;
}

function getLessonRows() {
    if (!lessonList) {
        return [];
    }
    return Array.from(lessonList.querySelectorAll("[data-lesson-row]"));
}

function getLessonTopicSelections() {
    return getLessonRows()
    .map((row) => normalizeUnitTopicDisplayLabel(row.querySelector('[name="lessonUnitTopic"]')?.value || ""))
        .filter(Boolean);
}

function parseUnitTopicLabel(topicLabel) {
    const source = normalizeTopicText(topicLabel);
    if (!source) {
        return { yearLevel: "", topicName: "" };
    }

    const parts = source.split("|").map((part) => normalizeTopicText(part));
    if (parts.length >= 2) {
        return {
            yearLevel: parts[0],
            topicName: parts.slice(1).join(" | ")
        };
    }

    return {
        yearLevel: "",
        topicName: source
    };
}

function canonicalizeYearLevel(value) {
    const text = normalizeTopicText(value).toLowerCase();
    if (!text) {
        return "";
    }

    if (/\bjunior/.test(text)) return "juniors";
    if (/\bmiddle/.test(text)) return "middle";
    if (/\bsenior/.test(text)) return "senior";

    const yearMatch = text.match(/year\s*(\d{1,2})/);
    if (yearMatch?.[1]) {
        return `year${yearMatch[1]}`;
    }

    return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalizeTopicName(value) {
    const text = normalizeTopicText(value).toLowerCase();
    if (!text) {
        return "";
    }

    if (/\bpcb\b/.test(text) || /printed\s*circuit\s*boards?/.test(text)) {
        return "pcb";
    }
    if (/micro\s*:?\s*:?-?\s*bit/.test(text) || /microbit/.test(text)) {
        return "microbit";
    }
    if (/^ardunio$/.test(text) || /^arduino$/.test(text)) {
        return "arduino";
    }

    return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeYearLevelDisplay(value) {
    const canonical = canonicalizeYearLevel(value);
    if (canonical === "juniors") return "Juniors";
    if (canonical === "middle") return "Middle";
    if (canonical === "senior") return "Senior";

    if (/^year\d{1,2}$/.test(canonical)) {
        return `Year ${canonical.replace("year", "")}`;
    }

    const cleaned = String(value || "")
        .replace(/\(.*?\)/g, "")
        .replace(/-\s*.*$/g, "")
        .trim();
    return toTitleCase(cleaned);
}

function normalizeTopicNameDisplay(value) {
    const canonical = canonicalizeTopicName(value);
    if (canonical === "pcb") return "Printed Circuit Boards (PCB)";
    if (canonical === "microbit") return "Micro::bit";
    if (canonical === "arduino") return "Arduino";
    if (!canonical) return "";
    return toTitleCase(String(value || "").trim());
}

function normalizeUnitTopicDisplayLabel(topicLabel) {
    const parsed = parseUnitTopicLabel(topicLabel);
    const year = normalizeYearLevelDisplay(parsed.yearLevel);
    const topic = normalizeTopicNameDisplay(parsed.topicName || topicLabel);

    if (year && topic) {
        return `${year} | ${topic}`;
    }
    if (topic) {
        return topic;
    }
    return normalizeTopicText(topicLabel);
}

function isLikelyNoiseTopicLabel(topicLabel) {
    const parsed = parseUnitTopicLabel(topicLabel);
    const yearKey = canonicalizeYearLevel(parsed.yearLevel);
    const topicText = normalizeTopicText(parsed.topicName || topicLabel).toLowerCase();
    const schoolValueLabels = new Set([
        "whanaungatanga",
        "manaakitanga",
        "rangatiratanga",
        "kotahitanga",
        "kaitiakitanga"
    ]);

    if (!topicText) {
        return true;
    }

    if (/^school\s*values?$/.test(topicText)) {
        return true;
    }

    if (/^technology\s*strand$/.test(topicText)) {
        return true;
    }

    if (schoolValueLabels.has(topicText)) {
        return true;
    }

    if (/^level\s*\d+$/i.test(topicText)) {
        return true;
    }

    if (/^\d+(?:\s*\/\s*\d+)?$/.test(topicText)) {
        return true;
    }

    if (/^(?:year\s*\d+\s*\|\s*)?\d+(?:\s*\/\s*\d+)?$/.test(`${parsed.yearLevel ? `${parsed.yearLevel} | ` : ""}${parsed.topicName || topicText}`.toLowerCase())) {
        return true;
    }

    if (yearKey.startsWith("year") && /^level\s*\d+$/i.test(topicText)) {
        return true;
    }

    return false;
}

function canonicalizeUnitTopicLabel(topicLabel) {
    const parsed = parseUnitTopicLabel(normalizeUnitTopicDisplayLabel(topicLabel));
    const yearKey = canonicalizeYearLevel(parsed.yearLevel);
    const topicKey = canonicalizeTopicName(parsed.topicName || topicLabel);

    if (yearKey || topicKey) {
        return `${yearKey}|${topicKey}`;
    }

    return normalizeTopicText(topicLabel).toLowerCase();
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function collectLessonAssignmentsByTopic() {
    const assignments = new Map();

    getLessonRows().forEach((row) => {
        const topic = normalizeUnitTopicDisplayLabel(row.querySelector('[name="lessonUnitTopic"]')?.value || "");
        const title = normalizeTopicText(row.querySelector('[name="lessonTitle"]')?.value || "");
        if (!topic || !title) {
            return;
        }

        const topicKey = canonicalizeUnitTopicLabel(topic);
        const current = assignments.get(topicKey) || [];
        if (!current.includes(title)) {
            current.push(title);
            assignments.set(topicKey, current);
        }
    });

    return assignments;
}

function renderUnitTopicsPillTable() {
    if (!manualUnitTopicsTable) {
        return;
    }

    if (!manualUnitTopics.length) {
        manualUnitTopicsTable.hidden = true;
        manualUnitTopicsTable.innerHTML = "";
        return;
    }

    const assignments = collectLessonAssignmentsByTopic();
    const rowsHtml = manualUnitTopics
        .map((topicLabel) => {
            const parsed = parseUnitTopicLabel(topicLabel);
            const topicKey = canonicalizeUnitTopicLabel(topicLabel);
            const lessonPills = (assignments.get(topicKey) || [])
                .map((lesson) => `<span class="unit-topic-table-pill is-lesson">${escapeHtml(lesson)}</span>`)
                .join("");

            const yearCell = parsed.yearLevel
                ? `<span class="unit-topic-table-pill">${escapeHtml(parsed.yearLevel)}</span>`
                : `<span class="unit-topic-table-empty">-</span>`;
            const topicCell = parsed.topicName
                ? `<span class="unit-topic-table-pill">${escapeHtml(parsed.topicName)}</span>`
                : `<span class="unit-topic-table-empty">-</span>`;
            const lessonsCell = lessonPills || `<span class="unit-topic-table-empty">No lessons allocated yet.</span>`;

            return `
                <div class="unit-topics-pill-table-row">
                    <div class="unit-topics-pill-table-cell">${yearCell}</div>
                    <div class="unit-topics-pill-table-cell">${topicCell}</div>
                    <div class="unit-topics-pill-table-cell">${lessonsCell}</div>
                </div>
            `;
        })
        .join("");

    manualUnitTopicsTable.innerHTML = `
        <div class="unit-topics-pill-table-row is-header">
            <div class="unit-topics-pill-table-cell">Year Level</div>
            <div class="unit-topics-pill-table-cell">Unit Topic</div>
            <div class="unit-topics-pill-table-cell">Lessons</div>
        </div>
        ${rowsHtml}
    `;
    manualUnitTopicsTable.hidden = false;
}

function applyTopicOptionsToSelect(select, selectedValue = "") {
    if (!select) {
        return;
    }

    const normalizedSelected = normalizeUnitTopicDisplayLabel(selectedValue);
    const optionList = normalizeUnitTopicList([...manualUnitTopics, normalizedSelected]);
    select.innerHTML = `<option value="">Select unit topic</option>${optionList
        .map((topic) => `<option value="${topic}">${topic}</option>`)
        .join("")}`;

    if (normalizedSelected && optionList.includes(normalizedSelected)) {
        select.value = normalizedSelected;
    }
}

function updateLessonTopicOptions() {
    getLessonRows().forEach((row) => {
        const select = row.querySelector('[name="lessonUnitTopic"]');
        const selectedValue = normalizeUnitTopicDisplayLabel(select?.value || "");
        applyTopicOptionsToSelect(select, selectedValue);
    });

    const optionList = normalizeUnitTopicList([...manualUnitTopics]);

    if (manualUnitTopicsHidden) {
        manualUnitTopicsHidden.value = optionList.join("\n");
    }

    renderUnitTopicsPillTable();
}

function renderUnitTopicsList() {
    if (!manualUnitTopicsList) {
        return;
    }

    manualUnitTopicsList.innerHTML = "";
    if (!manualUnitTopics.length) {
        const empty = document.createElement("p");
        empty.className = "unit-topics-empty";
        empty.textContent = "No Unit Topics added yet.";
        manualUnitTopicsList.appendChild(empty);
        if (manualUnitTopicsHidden) {
            manualUnitTopicsHidden.value = "";
        }
        updateLessonTopicOptions();
        return;
    }

    manualUnitTopics.forEach((topic, index) => {
        const tag = document.createElement("div");
        tag.className = "unit-topics-item";
        tag.innerHTML = `<span>${topic}</span><button type="button" class="unit-topics-remove" data-remove-unit-topic="${index}" aria-label="Remove ${topic}">x</button>`;
        manualUnitTopicsList.appendChild(tag);
    });

    if (manualUnitTopicsHidden) {
        manualUnitTopicsHidden.value = manualUnitTopics.join("\n");
    }

    updateLessonTopicOptions();
}

function setManualUnitTopics(topics = []) {
    const providedTopics = Array.isArray(topics) ? topics : [];
    manualUnitTopics = normalizeUnitTopicList(providedTopics);
    renderUnitTopicsList();
}

function addManualUnitTopic(rawTopic) {
    const topic = normalizeUnitTopicDisplayLabel(rawTopic);
    if (!topic) {
        return;
    }
    manualUnitTopics = normalizeUnitTopicList([...manualUnitTopics, topic]);
    renderUnitTopicsList();
}

function removeManualUnitTopic(indexToRemove) {
    const index = Number.parseInt(indexToRemove, 10);
    if (!Number.isInteger(index) || index < 0 || index >= manualUnitTopics.length) {
        return;
    }

    const removedTopic = manualUnitTopics[index];
    manualUnitTopics = manualUnitTopics.filter((_topic, indexValue) => indexValue !== index);
    renderUnitTopicsList();

    getLessonRows().forEach((row) => {
        const select = row.querySelector('[name="lessonUnitTopic"]');
        if (select && normalizeTopicText(select.value) === removedTopic) {
            select.value = "";
        }
    });
}

function autoResizeTextarea(textarea) {
    if (!textarea) {
        return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function autoResizeOverviewAndAimsTextareas() {
    const coreTextareas = [
        manualFields?.overview,
        manualFields?.unitAims,
        previewFields?.overview,
        previewFields?.unitAims
    ].filter(Boolean);

    coreTextareas.forEach((textarea) => {
        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function autoResizeSchoolValueTextareas() {
    const schoolValueTextareas = document.querySelectorAll(".school-value-card textarea");
    schoolValueTextareas.forEach((textarea) => {
        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function autoResizeContextTextareas() {
    const contextTextareas = document.querySelectorAll(".contexts-row textarea");
    contextTextareas.forEach((textarea) => {
        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function autoResizeLocalCurriculumTextareas() {
    const localCurriculumTextareas = document.querySelectorAll(".local-curriculum-table textarea");
    localCurriculumTextareas.forEach((textarea) => {
        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function autoResizeSkillsTextareas() {
    const skillsTextareas = document.querySelectorAll(".skills-row textarea");
    skillsTextareas.forEach((textarea) => {
        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function autoResizeHealthSafetyTextarea() {
    const healthSafetyTextareas = document.querySelectorAll(".health-safety-grid textarea, #manual-health-safety, #preview-health-safety");
    healthSafetyTextareas.forEach((textarea) => {
        if (textarea.hidden) {
            return;
        }

        autoResizeTextarea(textarea);

        if (!textarea.dataset.autoResizeBound) {
            textarea.addEventListener("input", () => {
                autoResizeTextarea(textarea);
            });
            textarea.dataset.autoResizeBound = "true";
        }
    });
}

function inferHealthSafetyEditorKeyFromField(field) {
    const id = String(field?.id || "");
    if (id.startsWith("preview-")) {
        return "preview";
    }
    return "manual";
}

function getHealthSafetyEditor(editorKey) {
    const key = editorKey === "preview" ? "preview" : "manual";
    const hidden = document.querySelector(`#${key}-health-safety`);
    if (!hidden) {
        return null;
    }

    return {
        key,
        hidden,
        link: document.querySelector(`#${key}-health-safety-link`),
        room: document.querySelector(`#${key}-health-safety-room`),
        issueFields: Array.from(document.querySelectorAll(`[data-health-safety-group="${key}"][data-health-safety-role="issue"]`)),
        considerationFields: Array.from(document.querySelectorAll(`[data-health-safety-group="${key}"][data-health-safety-role="consideration"]`))
    };
}

function looksLikeHealthSafetyIssueHeading(line) {
    const cleaned = String(line || "").trim();
    if (!cleaned) {
        return false;
    }

    if (/^health\s*(?:&|and)\s*safety/i.test(cleaned) || /^safety\s*issues?/i.test(cleaned)) {
        return false;
    }

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount > 8) {
        return false;
    }

    if (/[.!?]$/.test(cleaned)) {
        return false;
    }

    return true;
}

function isSkillsCarryoverHealthSafetyLabel(line) {
    const normalized = String(line || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (!normalized) {
        return false;
    }

    return HEALTH_SAFETY_SKILLS_CARRYOVER_LABELS.includes(normalized);
}

function parseHealthSafetyTableContent(content) {
    const rawLines = String(content || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*\u2022\s]+/, "").trim())
        .filter(Boolean);

    const parsed = {
        link: "",
        room: "",
        rows: []
    };

    let currentRow = null;
    let suppressSkillsCarryoverBlock = false;

    const pushRow = (issue = "") => {
        if (parsed.rows.length >= HEALTH_SAFETY_ROW_LIMIT) {
            currentRow = parsed.rows[parsed.rows.length - 1] || null;
            return currentRow;
        }

        const row = { issue: String(issue || "").trim(), consideration: "" };
        parsed.rows.push(row);
        currentRow = row;
        return row;
    };

    rawLines.forEach((line) => {
        if (!line) {
            return;
        }

        if (!parsed.link && /^link\b/i.test(line) && line.length <= 64) {
            parsed.link = line;
            return;
        }

        if (!parsed.room && /(room|lab|laboratory|workshop|studio)/i.test(line) && line.length <= 72) {
            parsed.room = line;
            return;
        }

        if (isSkillsCarryoverHealthSafetyLabel(line)) {
            suppressSkillsCarryoverBlock = true;
            currentRow = null;
            return;
        }

        if (/^safety\s*issues?$/i.test(line) || /^health\s*(?:&|and)\s*safety\s*considerations?/i.test(line)) {
            return;
        }

        const explicitIssueMatch = line.match(/^safety\s*issues?\s*:\s*(.+)$/i);
        if (explicitIssueMatch && explicitIssueMatch[1]) {
            if (isSkillsCarryoverHealthSafetyLabel(explicitIssueMatch[1])) {
                suppressSkillsCarryoverBlock = true;
                currentRow = null;
                return;
            }
            suppressSkillsCarryoverBlock = false;
            pushRow(explicitIssueMatch[1]);
            return;
        }

        const explicitConsiderationMatch = line.match(/^health\s*(?:&|and)\s*safety\s*considerations?\s*:?\s*(.+)$/i);
        if (explicitConsiderationMatch && explicitConsiderationMatch[1]) {
            if (suppressSkillsCarryoverBlock) {
                return;
            }
            const row = currentRow || pushRow("");
            row.consideration = row.consideration
                ? `${row.consideration}\n${explicitConsiderationMatch[1].trim()}`
                : explicitConsiderationMatch[1].trim();
            return;
        }

        if (suppressSkillsCarryoverBlock) {
            if (looksLikeHealthSafetyIssueHeading(line) && !isSkillsCarryoverHealthSafetyLabel(line)) {
                suppressSkillsCarryoverBlock = false;
                pushRow(line);
            }
            return;
        }

        if (looksLikeHealthSafetyIssueHeading(line)) {
            pushRow(line);
            return;
        }

        const row = currentRow || pushRow("");
        row.consideration = row.consideration
            ? `${row.consideration}\n${line}`
            : line;
    });

    return parsed;
}

function serializeHealthSafetyEditor(editor) {
    if (!editor) {
        return "";
    }

    const lines = [];
    const link = String(editor.link?.value || "").trim();
    const room = String(editor.room?.value || "").trim();

    if (link) {
        lines.push(link);
    }
    if (room) {
        lines.push(room);
    }

    for (let index = 0; index < HEALTH_SAFETY_ROW_LIMIT; index += 1) {
        const issue = String(editor.issueFields?.[index]?.value || "").trim();
        const considerationLines = normalizeLines(editor.considerationFields?.[index]?.value || "");

        if (isSkillsCarryoverHealthSafetyLabel(issue)) {
            continue;
        }

        if (!issue && !considerationLines.length) {
            continue;
        }

        if (issue) {
            lines.push(issue);
        }
        if (considerationLines.length) {
            lines.push(...considerationLines);
        }
    }

    return sanitizeHealthSafetyContent(lines.join("\n"));
}

function applyHealthSafetyContentToEditor(editor, content) {
    if (!editor || !editor.hidden) {
        return;
    }

    const parsed = parseHealthSafetyTableContent(content);

    if (editor.link) {
        editor.link.value = parsed.link;
    }
    if (editor.room) {
        editor.room.value = parsed.room;
    }

    for (let index = 0; index < HEALTH_SAFETY_ROW_LIMIT; index += 1) {
        const row = parsed.rows[index] || { issue: "", consideration: "" };
        if (editor.issueFields?.[index]) {
            editor.issueFields[index].value = String(row.issue || "").trim();
        }
        if (editor.considerationFields?.[index]) {
            editor.considerationFields[index].value = String(row.consideration || "").trim();
            autoResizeTextarea(editor.considerationFields[index]);
        }
    }

    editor.hidden.value = serializeHealthSafetyEditor(editor);
}

function syncHealthSafetyEditorValue(editorKey) {
    const editor = getHealthSafetyEditor(editorKey);
    if (!editor?.hidden) {
        return;
    }
    editor.hidden.value = serializeHealthSafetyEditor(editor);
}

function initializeHealthSafetyEditors() {
    ["manual", "preview"].forEach((editorKey) => {
        const editor = getHealthSafetyEditor(editorKey);
        if (!editor?.hidden) {
            return;
        }

        if (!editor.hidden.dataset.healthSafetyBound) {
            const inputFields = [
                editor.link,
                editor.room,
                ...(editor.issueFields || []),
                ...(editor.considerationFields || [])
            ].filter(Boolean);

            inputFields.forEach((field) => {
                field.addEventListener("input", () => {
                    if (field.tagName === "TEXTAREA") {
                        autoResizeTextarea(field);
                    }
                    syncHealthSafetyEditorValue(editorKey);
                });
            });

            editor.hidden.dataset.healthSafetyBound = "true";
        }

        applyHealthSafetyContentToEditor(editor, editor.hidden.value);
    });
}

function getSchoolValueResponses(group) {
    const responses = {};
    SCHOOL_VALUE_KEYS.forEach((key) => {
        responses[key] = String(group?.[key]?.value || "").trim();
    });
    return responses;
}

function setSchoolValueResponses(group, responses = {}) {
    SCHOOL_VALUE_KEYS.forEach((key) => {
        if (group?.[key]) {
            group[key].value = String(responses[key] || "").trim();
            autoResizeTextarea(group[key]);
        }
    });
}

function schoolValueResponsesToUnitValues(responses) {
    return SCHOOL_VALUE_KEYS
        .map((key) => {
            const response = String(responses[key] || "").trim();
            if (!response) {
                return "";
            }
            return `${SCHOOL_VALUE_LABELS[key]}: ${response}`;
        })
        .filter(Boolean);
}

function parseUnitValuesToResponses(unitValues) {
    const responseMap = {
        whanaungatanga: "",
        rangatiratanga: "",
        manaakitanga: "",
        kaitiakitanga: ""
    };

    const lines = Array.isArray(unitValues)
        ? unitValues.map((line) => String(line || "").trim()).filter(Boolean)
        : String(unitValues || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    let currentKey = "";
    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const matchedKey = SCHOOL_VALUE_KEYS.find((key) => lower.startsWith(SCHOOL_VALUE_LABELS[key].toLowerCase()));

        if (matchedKey) {
            currentKey = matchedKey;
            const remainder = line.replace(new RegExp(`^${SCHOOL_VALUE_LABELS[matchedKey]}\s*:?\s*`, "i"), "").trim();
            if (remainder) {
                responseMap[matchedKey] = responseMap[matchedKey]
                    ? `${responseMap[matchedKey]}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (currentKey) {
            responseMap[currentKey] = responseMap[currentKey]
                ? `${responseMap[currentKey]}\n${line}`
                : line;
        }
    });

    return responseMap;
}

function getContextResponses(group) {
    const responses = {};
    CONTEXT_KEYS.forEach((key) => {
        responses[key] = String(group?.[key]?.value || "").trim();
    });
    return responses;
}

function setContextResponses(group, responses = {}) {
    CONTEXT_KEYS.forEach((key) => {
        if (group?.[key]) {
            group[key].value = String(responses[key] || "").trim();
            autoResizeTextarea(group[key]);
        }
    });
}

function contextResponsesToArray(responses) {
    return CONTEXT_KEYS
        .map((key) => {
            const response = String(responses[key] || "").trim();
            if (!response) {
                return "";
            }
            return `${CONTEXT_LABELS[key]}: ${response}`;
        })
        .filter(Boolean);
}

function parseContextsToResponses(contexts) {
    const responseMap = {
        environment: "",
        mentalEmotional: "",
        culture: "",
        social: "",
        technology: ""
    };

    const lines = Array.isArray(contexts)
        ? contexts.map((line) => String(line || "").trim()).filter(Boolean)
        : String(contexts || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    let currentKey = "";
    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const matchedKey = CONTEXT_KEYS.find((key) => lower.startsWith(CONTEXT_LABELS[key].toLowerCase()));

        if (matchedKey) {
            currentKey = matchedKey;
            const remainder = line.replace(new RegExp(`^${CONTEXT_LABELS[matchedKey]}\s*:?\s*`, "i"), "").trim();
            if (remainder) {
                responseMap[matchedKey] = responseMap[matchedKey]
                    ? `${responseMap[matchedKey]}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (currentKey) {
            responseMap[currentKey] = responseMap[currentKey]
                ? `${responseMap[currentKey]}\n${line}`
                : line;
        }
    });

    return responseMap;
}

function getCurriculumLinkResponses(group) {
    const responses = {};
    CURRICULUM_LINK_KEYS.forEach((key) => {
        if (key === "skills") {
            const skillResponses = {};
            SKILL_KEYS.forEach((skillKey) => {
                skillResponses[skillKey] = String(group?.skills?.[skillKey]?.value || "").trim();
            });
            responses.skills = skillResponses;
            return;
        }

        if (key === "healthSafety") {
            const editorKey = inferHealthSafetyEditorKeyFromField(group?.[key]);
            syncHealthSafetyEditorValue(editorKey);
        }

        responses[key] = String(group?.[key]?.value || "").trim();
    });
    return responses;
}

function setCurriculumLinkResponses(group, responses = {}) {
    CURRICULUM_LINK_KEYS.forEach((key) => {
        if (key === "skills") {
            const skillResponses = responses.skills && typeof responses.skills === "object"
                ? responses.skills
                : {};
            SKILL_KEYS.forEach((skillKey) => {
                if (group?.skills?.[skillKey]) {
                    group.skills[skillKey].value = String(skillResponses[skillKey] || "").trim();
                    autoResizeTextarea(group.skills[skillKey]);
                }
            });
            return;
        }

        if (group?.[key]) {
            group[key].value = String(responses[key] || "").trim();
            autoResizeTextarea(group[key]);

            if (key === "healthSafety") {
                const editorKey = inferHealthSafetyEditorKeyFromField(group[key]);
                const editor = getHealthSafetyEditor(editorKey);
                applyHealthSafetyContentToEditor(editor, group[key].value);
            }
        }
    });
}

function curriculumResponsesToLines(responses) {
    const lines = [];

    CURRICULUM_LINK_KEYS.forEach((key) => {
        if (key === "skills") {
            const skillResponses = responses.skills && typeof responses.skills === "object"
                ? responses.skills
                : {};
            const hasAnySkill = SKILL_KEYS.some((skillKey) => normalizeLines(skillResponses[skillKey] || "").length);
            if (!hasAnySkill) {
                return;
            }

            lines.push("Skills:");
            SKILL_KEYS.forEach((skillKey) => {
                const responseLines = normalizeLines(skillResponses[skillKey] || "");
                if (!responseLines.length) {
                    return;
                }
                lines.push(`${SKILL_LABELS[skillKey]}: ${responseLines[0]}`);
                responseLines.slice(1).forEach((line) => {
                    lines.push(line);
                });
            });
            return;
        }

        const responseLines = normalizeLines(responses[key] || "");
        if (!responseLines.length) {
            return;
        }

        lines.push(`${CURRICULUM_LINK_LABELS[key]}: ${responseLines[0]}`);
        responseLines.slice(1).forEach((line) => {
            lines.push(line);
        });
    });

    return lines;
}

function sanitizeHealthSafetyContent(content) {
    const text = String(content || "").trim();
    if (!text) {
        return "";
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const sectionStarts = /\b(slideshow|reporting|assessment|lesson|curriculum\s*achievement|new\s*zealand|level\s*\d|technological|learning\s*outcomes|LEVEL\s*\d)\b/i;
    const result = [];

    for (const line of lines) {
        if (!line) {
            continue;
        }

        const idx = line.search(sectionStarts);
        if (idx === 0) {
            break;
        }

        if (idx > 0) {
            const trimmed = line.slice(0, idx).trim();
            if (trimmed) {
                result.push(trimmed);
            }
            break;
        }

        result.push(line);
    }

    return result.join("\n").trim();
}

function parseCurriculumLinksToResponses(curriculumLinks) {
    const responseMap = {
        localCurriculumLinks: "",
        mataurangaMaori: "",
        skills: {
            generalSkills: "",
            careerFutureSkills: "",
            considerationsWithinElectronics: "",
            literacy: "",
            numeracy: "",
            digitalTech: "",
            practical: ""
        },
        healthSafety: ""
    };

    const lines = Array.isArray(curriculumLinks)
        ? curriculumLinks.map((line) => String(line || "").trim()).filter(Boolean)
        : String(curriculumLinks || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    let currentKey = "";
    let currentSkillKey = "";
    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const localPrefix = /^local\s*curriculum\s*links?/i;
        const mataurangaPrefix = /^(m[aā]tauranga\s*m[aā]ori|matauranga\s*maori)/i;
        const skillsPrefix = /^skills?\b/i;
        const generalSkillsPrefix = /^(general\s*skills|skills)\b/i;
        const careerFutureSkillsPrefix = /^career\s*(?:&|and)?\s*future(?:-focused)?\s*skills\b/i;
        const electronicsConsiderationsPrefix = /^considerations\s*within\s*electronics\b/i;
        const healthSafetyPrefix = /^(health\s*(?:&|and)\s*safety|safety\s*issues?)\b/i;
        const literacyPrefix = /^literacy\b/i;
        const numeracyPrefix = /^numeracy\b/i;
        const digitalTechPrefix = /^(digital\s*tech|digital\s*technology)\b/i;
        const practicalPrefix = /^practical\b/i;

        if (careerFutureSkillsPrefix.test(lower)) {
            currentKey = "skills";
            currentSkillKey = "careerFutureSkills";
            const remainder = line.replace(careerFutureSkillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.skills.careerFutureSkills = responseMap.skills.careerFutureSkills
                    ? `${responseMap.skills.careerFutureSkills}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (electronicsConsiderationsPrefix.test(lower)) {
            currentKey = "skills";
            currentSkillKey = "considerationsWithinElectronics";
            const remainder = line.replace(electronicsConsiderationsPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.skills.considerationsWithinElectronics = responseMap.skills.considerationsWithinElectronics
                    ? `${responseMap.skills.considerationsWithinElectronics}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (localPrefix.test(lower)) {
            currentKey = "localCurriculumLinks";
            currentSkillKey = "";
            const remainder = line.replace(localPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.localCurriculumLinks = responseMap.localCurriculumLinks
                    ? `${responseMap.localCurriculumLinks}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (mataurangaPrefix.test(lower)) {
            currentKey = "mataurangaMaori";
            currentSkillKey = "";
            const remainder = line.replace(mataurangaPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.mataurangaMaori = responseMap.mataurangaMaori
                    ? `${responseMap.mataurangaMaori}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (skillsPrefix.test(lower)) {
            currentKey = "skills";
            currentSkillKey = currentSkillKey || "generalSkills";
            const remainder = line.replace(skillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.skills[currentSkillKey] = responseMap.skills[currentSkillKey]
                    ? `${responseMap.skills[currentSkillKey]}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (healthSafetyPrefix.test(lower)) {
            currentKey = "healthSafety";
            currentSkillKey = "";
            const remainder = line.replace(healthSafetyPrefix, "").replace(/^\s*:?\s*/, "").trim();
            if (remainder) {
                responseMap.healthSafety = responseMap.healthSafety
                    ? `${responseMap.healthSafety}\n${remainder}`
                    : remainder;
            }
            return;
        }

        if (currentKey === "skills") {
            if (generalSkillsPrefix.test(lower)) {
                currentSkillKey = "generalSkills";
                const remainder = line.replace(generalSkillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.generalSkills = responseMap.skills.generalSkills
                        ? `${responseMap.skills.generalSkills}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (careerFutureSkillsPrefix.test(lower)) {
                currentSkillKey = "careerFutureSkills";
                const remainder = line.replace(careerFutureSkillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.careerFutureSkills = responseMap.skills.careerFutureSkills
                        ? `${responseMap.skills.careerFutureSkills}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (electronicsConsiderationsPrefix.test(lower)) {
                currentSkillKey = "considerationsWithinElectronics";
                const remainder = line.replace(electronicsConsiderationsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.considerationsWithinElectronics = responseMap.skills.considerationsWithinElectronics
                        ? `${responseMap.skills.considerationsWithinElectronics}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (literacyPrefix.test(lower)) {
                currentSkillKey = "literacy";
                const remainder = line.replace(literacyPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.literacy = responseMap.skills.literacy
                        ? `${responseMap.skills.literacy}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (numeracyPrefix.test(lower)) {
                currentSkillKey = "numeracy";
                const remainder = line.replace(numeracyPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.numeracy = responseMap.skills.numeracy
                        ? `${responseMap.skills.numeracy}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (digitalTechPrefix.test(lower)) {
                currentSkillKey = "digitalTech";
                const remainder = line.replace(digitalTechPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.digitalTech = responseMap.skills.digitalTech
                        ? `${responseMap.skills.digitalTech}\n${remainder}`
                        : remainder;
                }
                return;
            }

            if (practicalPrefix.test(lower)) {
                currentSkillKey = "practical";
                const remainder = line.replace(practicalPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.practical = responseMap.skills.practical
                        ? `${responseMap.skills.practical}\n${remainder}`
                        : remainder;
                }
                return;
            }
        }

        if (currentKey === "healthSafety") {
            if (generalSkillsPrefix.test(lower) || careerFutureSkillsPrefix.test(lower) || electronicsConsiderationsPrefix.test(lower)) {
                currentKey = "skills";
                if (careerFutureSkillsPrefix.test(lower)) {
                    currentSkillKey = "careerFutureSkills";
                    const remainder = line.replace(careerFutureSkillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                    if (remainder) {
                        responseMap.skills.careerFutureSkills = responseMap.skills.careerFutureSkills
                            ? `${responseMap.skills.careerFutureSkills}\n${remainder}`
                            : remainder;
                    }
                    return;
                }

                if (electronicsConsiderationsPrefix.test(lower)) {
                    currentSkillKey = "considerationsWithinElectronics";
                    const remainder = line.replace(electronicsConsiderationsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                    if (remainder) {
                        responseMap.skills.considerationsWithinElectronics = responseMap.skills.considerationsWithinElectronics
                            ? `${responseMap.skills.considerationsWithinElectronics}\n${remainder}`
                            : remainder;
                    }
                    return;
                }

                currentSkillKey = "generalSkills";
                const remainder = line.replace(generalSkillsPrefix, "").replace(/^\s*:?\s*/, "").trim();
                if (remainder) {
                    responseMap.skills.generalSkills = responseMap.skills.generalSkills
                        ? `${responseMap.skills.generalSkills}\n${remainder}`
                        : remainder;
                }
                return;
            }
        }

        if (!currentKey && !responseMap.localCurriculumLinks) {
            currentKey = "localCurriculumLinks";
        }

        if (currentKey) {
            if (currentKey === "skills") {
                currentSkillKey = currentSkillKey || "generalSkills";
                responseMap.skills[currentSkillKey] = responseMap.skills[currentSkillKey]
                    ? `${responseMap.skills[currentSkillKey]}\n${line}`
                    : line;
                return;
            }

            responseMap[currentKey] = responseMap[currentKey]
                ? `${responseMap[currentKey]}\n${line}`
                : line;
        }
    });

    responseMap.healthSafety = sanitizeHealthSafetyContent(responseMap.healthSafety);

    return responseMap;
}

function parseLessonsJson(value) {
    const source = String(value || "").trim();
    if (!source) {
        return [];
    }

    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) {
        throw new Error("Lessons JSON must be an array.");
    }

    return parsed;
}

function coerceToggleValue(rawValue, defaultValue = false) {
    if (typeof rawValue === "boolean") {
        return rawValue;
    }

    if (rawValue === null || rawValue === undefined) {
        return defaultValue;
    }

    const normalizedValue = String(rawValue).trim().toLowerCase();
    if (["true", "yes", "y", "1", "on"].includes(normalizedValue)) {
        return true;
    }

    if (["false", "no", "n", "0", "off", ""].includes(normalizedValue)) {
        return false;
    }

    return defaultValue;
}

function readToggleFieldValue(field, defaultValue = false) {
    if (!field) {
        return defaultValue;
    }

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
        return Boolean(field.checked);
    }

    return coerceToggleValue(field.value, defaultValue);
}

function createLessonRow(lesson = {}) {
    if (!lessonList) {
        return null;
    }

    const row = document.createElement("div");
    row.className = "lesson-row";
    row.dataset.lessonRow = "true";

    row.innerHTML = `
        <div class="lesson-row-header">
            <div>
                <p class="section-kicker">Lesson <span data-lesson-number></span></p>
                <h3>Lesson details</h3>
            </div>
            <button type="button" class="button button-secondary lesson-remove">Remove</button>
        </div>
        <div class="lesson-row-section">
            <p class="lesson-row-section-title">Card Basics</p>
            <div class="lesson-row-grid">
                <div class="field">
                    <label>Card Name</label>
                    <input name="lessonTitle" type="text" placeholder="Card title" required>
                </div>
                <div class="field">
                    <label>Year Level</label>
                    <input name="lessonYearLevel" type="text" placeholder="e.g. Junior, Middle, Year 9">
                </div>
                <div class="field">
                    <label>Card Category</label>
                    <select name="lessonType">
                        ${LESSON_CARD_CATEGORY_OPTIONS.map((option) => {
                            const selectedAttr = option === "Lesson" ? " selected" : "";
                            return `<option${selectedAttr}>${escapeHtml(option)}</option>`;
                        }).join("")}
                    </select>
                </div>
                <div class="field">
                    <label>Subject Stream</label>
                    <select name="lessonSubjectStream">
                        <option value="">Select subject</option>
                        <option value="DTECH">DTECH</option>
                        <option value="COMP">COMP</option>
                        <option value="TEXT">TEXT</option>
                        <option value="DTONLINE">DTONLINE</option>
                    </select>
                </div>
                <div class="field">
                    <label>Topic Type</label>
                    <select name="lessonTopicType">
                        <option value="">Select topic type</option>
                        <option>Office Suite</option>
                        <option>Programming</option>
                        <option>Electronics</option>
                        <option>Digital Media</option>
                        <option>Project Management</option>
                    </select>
                </div>
                <div class="field">
                    <label>Unit Topic</label>
                    <select name="lessonUnitTopic">
                        <option value="">Select unit topic</option>
                    </select>
                </div>
                <div class="field">
                    <label>Card URL</label>
                    <input name="lessonLinkUrl" type="url" placeholder="https://... (optional)">
                </div>
                <div class="field field-wide">
                    <label>Short Description</label>
                    <textarea name="lessonFocus" placeholder="Brief overview of this lesson card"></textarea>
                </div>
            </div>
        </div>
        <div class="lesson-row-section">
            <p class="lesson-row-section-title">Activity Details</p>
            <div class="lesson-row-grid">
                <div class="field">
                    <label>Duration Minutes</label>
                    <input name="lessonDurationMinutes" type="number" min="1" step="1" value="60">
                </div>
                <div class="field">
                    <label>Card Color</label>
                    <select name="lessonCardColor">
                        <option>Rose</option>
                        <option>Violet</option>
                        <option>Azure</option>
                        <option>Amber</option>
                        <option>Teal</option>
                        <option>Slate</option>
                    </select>
                </div>
                <label class="checkbox-field lesson-toggle field-wide"><input name="publishActivity" type="checkbox" checked> Show in This Week section</label>
            </div>
        </div>
        <div class="lesson-row-section">
            <p class="lesson-row-section-title">Planner Details</p>
            <div class="lesson-row-grid">
                <div class="field">
                    <label>Week / Session</label>
                    <input name="lessonWeek" type="text" placeholder="Week 1, Session 2">
                </div>
                <div class="field">
                    <label>Calendar Date</label>
                    <input name="lessonDate" type="date">
                </div>
                <div class="field field-wide">
                    <label>Activity Name</label>
                    <input name="activityName" type="text" placeholder="Activity Library card name (optional override)">
                </div>
                <div class="field field-wide">
                    <label>Lesson Notes</label>
                    <textarea name="lessonNotes" placeholder="Teacher notes, resources, or setup reminders"></textarea>
                </div>
                <label class="checkbox-field lesson-toggle field-wide"><input name="addToCalendar" type="checkbox"> Add to Calendar</label>
            </div>
        </div>
    `;

    const lessonTitle = row.querySelector('[name="lessonTitle"]');
    const lessonUnitTopic = row.querySelector('[name="lessonUnitTopic"]');
    const lessonWeek = row.querySelector('[name="lessonWeek"]');
    const lessonDate = row.querySelector('[name="lessonDate"]');
    const lessonDurationMinutes = row.querySelector('[name="lessonDurationMinutes"]');
    const lessonType = row.querySelector('[name="lessonType"]');
    const lessonSubjectStream = row.querySelector('[name="lessonSubjectStream"]');
    const lessonTopicType = row.querySelector('[name="lessonTopicType"]');
    const lessonCardColor = row.querySelector('[name="lessonCardColor"]');
    const activityName = row.querySelector('[name="activityName"]');
    const lessonYearLevel = row.querySelector('[name="lessonYearLevel"]');
    const lessonLinkUrl = row.querySelector('[name="lessonLinkUrl"]');
    const lessonFocus = row.querySelector('[name="lessonFocus"]');
    const lessonNotes = row.querySelector('[name="lessonNotes"]');
    const publishActivity = row.querySelector('[name="publishActivity"]');
    const addToCalendar = row.querySelector('[name="addToCalendar"]');

    const explicitUnitTopic = getExplicitUnitTopicFromLesson(lesson);
    const selectedUnitTopic = normalizeUnitTopicDisplayLabel(explicitUnitTopic || (manualUnitTopics.length ? "" : inferUnitTopicFromLessonLike(lesson)));
    applyTopicOptionsToSelect(lessonUnitTopic, selectedUnitTopic);

    lessonTitle.value = String(lesson.lessonTitle || lesson.title || "").trim();
    lessonWeek.value = String(lesson.lessonWeek || lesson.week_label || lesson.week || "").trim();
    lessonDate.value = String(lesson.lessonDate || lesson.calendar_date || "").trim();
    lessonDurationMinutes.value = String(lesson.lessonDurationMinutes || lesson.duration_minutes || 60).trim();
    lessonType.value = normalizeLessonCardCategory(lesson.lessonType || lesson.activity_type, "Lesson");
    lessonSubjectStream.value = String(lesson.lessonSubjectStream || lesson.subject_stream || manualFields?.subjectStream?.value || "").trim().toUpperCase();
    lessonTopicType.value = String(lesson.lessonTopicType || lesson.type || manualFields?.topic?.value || "").trim();
    lessonCardColor.value = String(lesson.lessonCardColor || lesson.card_color || "Rose").trim() || "Rose";
    activityName.value = String(lesson.activityName || lesson.activity_name || "").trim();
    lessonYearLevel.value = String(lesson.lessonYearLevel || lesson.year_level || "").trim();
    lessonLinkUrl.value = String(lesson.lessonLinkUrl || lesson.link_url || lesson.resource_link || "").trim();
    lessonFocus.value = String(lesson.lessonFocus || lesson.focus || "").trim();
    lessonNotes.value = String(lesson.lessonNotes || lesson.notes || "").trim();
    publishActivity.checked = coerceToggleValue(lesson.publishActivity ?? lesson.publish_activity, true);
    addToCalendar.checked = Boolean(lesson.addToCalendar ?? lesson.add_to_calendar);

    if (lessonUnitTopic) {
        lessonUnitTopic.addEventListener("change", () => {
            const selected = normalizeTopicText(lessonUnitTopic.value);
            if (selected) {
                addManualUnitTopic(selected);
            }
            updateLessonTopicOptions();
        });
    }

    row.querySelector(".lesson-remove").addEventListener("click", () => {
        row.remove();
        if (!lessonList.querySelector("[data-lesson-row]")) {
            lessonList.appendChild(createLessonRow());
        }
        renumberLessons();
        updateLessonTopicOptions();
    });

    return row;
}

function renumberLessons() {
    if (!lessonList) {
        return;
    }

    const rows = Array.from(lessonList.querySelectorAll("[data-lesson-row]"));
    rows.forEach((row, index) => {
        const number = row.querySelector("[data-lesson-number]");
        if (number) {
            number.textContent = String(index + 1);
        }
    });
}

function collectLessons() {
    if (!lessonList) {
        return [];
    }

    return Array.from(lessonList.querySelectorAll("[data-lesson-row]"))
        .map((row, index) => ({
            lesson_index: index + 1,
            lessonTitle: String(row.querySelector('[name="lessonTitle"]')?.value || "").trim(),
            unit_topic: normalizeTopicText(row.querySelector('[name="lessonUnitTopic"]')?.value || ""),
            lessonWeek: String(row.querySelector('[name="lessonWeek"]')?.value || "").trim(),
            lessonDate: String(row.querySelector('[name="lessonDate"]')?.value || "").trim(),
            lessonDurationMinutes: Number.parseInt(row.querySelector('[name="lessonDurationMinutes"]')?.value || "60", 10) || 60,
            lessonType: normalizeLessonCardCategory(row.querySelector('[name="lessonType"]')?.value || "", "Lesson"),
            type: String(row.querySelector('[name="lessonTopicType"]')?.value || "").trim(),
            subject_stream: String(row.querySelector('[name="lessonSubjectStream"]')?.value || "").trim().toUpperCase(),
            lessonCardColor: String(row.querySelector('[name="lessonCardColor"]')?.value || "Rose").trim() || "Rose",
            activityName: String(row.querySelector('[name="activityName"]')?.value || "").trim(),
            lessonYearLevel: String(row.querySelector('[name="lessonYearLevel"]')?.value || "").trim(),
            lessonLinkUrl: String(row.querySelector('[name="lessonLinkUrl"]')?.value || "").trim(),
            lessonFocus: String(row.querySelector('[name="lessonFocus"]')?.value || "").trim(),
            lessonNotes: String(row.querySelector('[name="lessonNotes"]')?.value || "").trim(),
            publishActivity: readToggleFieldValue(row.querySelector('[name="publishActivity"]'), true),
            addToCalendar: readToggleFieldValue(row.querySelector('[name="addToCalendar"]'), false)
        }))
        .filter((lesson) => Boolean(lesson.lessonTitle || lesson.activityName || lesson.lessonFocus || lesson.lessonWeek || lesson.lessonDate || lesson.lessonYearLevel || lesson.lessonLinkUrl));
}

function populateManualPlannerFromUnitPlan(unitPlan) {
    if (!manualForm || !unitPlan) {
        return;
    }

    if (manualFields.title) manualFields.title.value = String(unitPlan.title || "");
    if (manualFields.topic) manualFields.topic.value = String(unitPlan.topic || "");
    if (manualFields.strand) manualFields.strand.value = String(unitPlan.strand || unitPlan.subject_stream || "");
    setSelectValues(manualFields.yearLevel, inferYearLevelSelections(unitPlan.year_level));
    if (manualFields.subjectStream) manualFields.subjectStream.value = String(unitPlan.subject_stream || "");
    if (manualFields.overview) manualFields.overview.value = String(unitPlan.overview || "");
    if (manualFields.unitAims) manualFields.unitAims.value = joinLines(unitPlan.unit_aims);
    setSchoolValueResponses(manualFields.unitValues, parseUnitValuesToResponses(unitPlan.unit_values));
    setContextResponses(manualFields.contexts, parseContextsToResponses(unitPlan.contexts));
    setCurriculumLinkResponses(manualFields.curriculumLinks, parseCurriculumLinksToResponses(unitPlan.curriculum_links));
    if (manualFields.assessmentLink) manualFields.assessmentLink.value = String(unitPlan.assessment_link || "");
    if (manualFields.notes) manualFields.notes.value = String(unitPlan.notes || "");

    const topicFromLessons = Array.isArray(unitPlan.lessons)
        ? unitPlan.lessons.map((lesson) => getExplicitUnitTopicFromLesson(lesson))
        : [];
    const fallbackTopics = topicFromLessons.some(Boolean)
        ? topicFromLessons
        : (Array.isArray(unitPlan.lessons)
            ? unitPlan.lessons.map((lesson) => inferUnitTopicFromLessonLike(lesson))
            : []);
    setManualUnitTopics(unitPlan.unit_topics || fallbackTopics || []);

    if (lessonList) {
        lessonList.innerHTML = "";
        const lessons = Array.isArray(unitPlan.lessons) ? unitPlan.lessons : [];
        if (!lessons.length) {
            lessonList.appendChild(createLessonRow());
        } else {
            lessons.forEach((lesson) => {
                lessonList.appendChild(createLessonRow(lesson));
            });
        }
        renumberLessons();
    }
}

function resetManualLessons() {
    if (!lessonList) {
        return;
    }

    lessonList.innerHTML = "";
    lessonList.appendChild(createLessonRow());
    renumberLessons();
    updateLessonTopicOptions();
}

function showPreviewPanel(unitPlan, sourceLabel) {
    if (!previewPanel) {
        return;
    }

    const lessonCount = Array.isArray(unitPlan?.lessons) ? unitPlan.lessons.length : 0;
    if (previewSource) {
        previewSource.textContent = `Preview source: ${sourceLabel || "DOCX"} (${lessonCount} lesson${lessonCount === 1 ? "" : "s"} parsed)`;
    }

    if (previewFields.title) previewFields.title.value = String(unitPlan?.title || "");
    if (previewFields.topic) previewFields.topic.value = String(unitPlan?.topic || "");
    setSelectValues(previewFields.yearLevel, inferYearLevelSelections(unitPlan?.year_level));
    if (previewFields.subjectStream) previewFields.subjectStream.value = String(unitPlan?.subject_stream || "");
    if (previewFields.overview) previewFields.overview.value = String(unitPlan?.overview || "");
    
    if (previewFields.unitAims) {
        const aimsValue = joinLines(unitPlan?.unit_aims);
        previewFields.unitAims.value = aimsValue;
    }
    
    setSchoolValueResponses(previewFields.unitValues, parseUnitValuesToResponses(unitPlan?.unit_values));
    setContextResponses(previewFields.contexts, parseContextsToResponses(unitPlan?.contexts));
    setCurriculumLinkResponses(previewFields.curriculumLinks, parseCurriculumLinksToResponses(unitPlan?.curriculum_links));
    if (previewFields.assessmentLink) previewFields.assessmentLink.value = String(unitPlan?.assessment_link || "");
    if (previewFields.notes) previewFields.notes.value = String(unitPlan?.notes || "");
    if (previewFields.lessonsJson) previewFields.lessonsJson.value = JSON.stringify(Array.isArray(unitPlan?.lessons) ? unitPlan.lessons : [], null, 2);

    populateManualPlannerFromUnitPlan(unitPlan);
    previewPanel.hidden = false;
    autoResizeOverviewAndAimsTextareas();
    autoResizeSchoolValueTextareas();
    autoResizeContextTextareas();
    autoResizeLocalCurriculumTextareas();
    autoResizeSkillsTextareas();
    autoResizeHealthSafetyTextarea();
}

function collectPreviewPayload() {
    return {
        title: String(previewFields.title?.value || "").trim(),
        topic: String(previewFields.topic?.value || "").trim(),
        year_level: normalizeYearLevelText(getSelectValues(previewFields.yearLevel)),
        subject_stream: String(previewFields.subjectStream?.value || "").trim().toUpperCase(),
        overview: String(previewFields.overview?.value || "").trim(),
        unit_aims: normalizeLines(previewFields.unitAims?.value || ""),
        unit_values: schoolValueResponsesToUnitValues(getSchoolValueResponses(previewFields.unitValues)),
        contexts: contextResponsesToArray(getContextResponses(previewFields.contexts)),
        curriculum_links: curriculumResponsesToLines(getCurriculumLinkResponses(previewFields.curriculumLinks)),
        assessment_link: String(previewFields.assessmentLink?.value || "").trim(),
        notes: String(previewFields.notes?.value || "").trim(),
        lessons: parseLessonsJson(previewFields.lessonsJson?.value || "[]")
    };
}

function collectManualPayload() {
    const normalizedTopics = normalizeUnitTopicList([...manualUnitTopics, ...getLessonTopicSelections()]);
    return {
        title: String(manualFields.title?.value || "").trim(),
        topic: String(manualFields.topic?.value || "").trim(),
        strand: String(manualFields.strand?.value || "").trim(),
        year_level: normalizeYearLevelText(getSelectValues(manualFields.yearLevel)),
        subject_stream: String(manualFields.subjectStream?.value || "").trim().toUpperCase(),
        overview: String(manualFields.overview?.value || "").trim(),
        unit_aims: normalizeLines(manualFields.unitAims?.value || ""),
        unit_values: schoolValueResponsesToUnitValues(getSchoolValueResponses(manualFields.unitValues)),
        contexts: contextResponsesToArray(getContextResponses(manualFields.contexts)),
        curriculum_links: curriculumResponsesToLines(getCurriculumLinkResponses(manualFields.curriculumLinks)),
        unit_topics: normalizedTopics,
        assessment_link: String(manualFields.assessmentLink?.value || "").trim(),
        notes: String(manualFields.notes?.value || "").trim(),
        lessons: collectLessons(),
        created_by_email: getSignedInEmail(),
        created_at: new Date().toISOString()
    };
}

function getEditUnitPlanIdFromUrl() {
    try {
        const url = new URL(window.location.href);
        return String(url.searchParams.get("edit") || "").trim();
    } catch (_error) {
        return "";
    }
}

async function loadUnitPlanForEdit() {
    editUnitPlanId = getEditUnitPlanIdFromUrl();
    if (!editUnitPlanId) {
        return;
    }

    try {
        setStatus("Loading unit plan for editing...");
        setActionButtonsDisabled(true);

        const response = await fetch(`/api/unit-plans/${encodeURIComponent(editUnitPlanId)}`, {
            headers: withUserEmailHeader()
        });
        if (!response.ok) {
            throw new Error(`Could not load unit plan for edit (HTTP ${response.status})`);
        }

        const unitPlan = await response.json();
        populateManualPlannerFromUnitPlan(unitPlan || {});

        if (pageTitleElement) {
            pageTitleElement.textContent = "Edit Unit Plan";
        }
        if (introTextElement) {
            introTextElement.textContent = "Update the unit plan details and save your changes.";
        }
        if (saveManualUnitButton) {
            saveManualUnitButton.textContent = "Update Unit Plan";
        }

        setStatus(`Editing ${unitPlan?.title || "unit plan"}.`);
    } catch (error) {
        editUnitPlanId = "";
        setStatus(error.message || "Could not load unit plan for editing.", true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

function renderAuthStatus() {
    if (!authStatusElement) {
        return;
    }

    const email = getSignedInEmail();
    if (email) {
        authStatusElement.classList.remove("is-missing");
        authStatusElement.textContent = `Signed in as ${email}`;
        return;
    }

    authStatusElement.classList.add("is-missing");
    authStatusElement.textContent = "Not signed in. Sign in with your school Google account before importing a unit plan.";
}

let authStatusListenersBound = false;
function bindAuthStatusListeners() {
    if (authStatusListenersBound) {
        return;
    }

    window.addEventListener("storage", (event) => {
        if (!event.key || event.key === UPLOAD_HUB_AUTH_STORAGE_KEY) {
            renderAuthStatus();
        }
    });

    window.addEventListener("focus", () => {
        renderAuthStatus();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            renderAuthStatus();
        }
    });

    authStatusListenersBound = true;
}

async function previewFromFile() {
    if (!uploadInput?.files?.length) {
        setStatus("Choose a .docx file before previewing.", true);
        return;
    }

    const file = uploadInput.files[0];
    if (!file) {
        setStatus("Choose a .docx file before previewing.", true);
        return;
    }

    const payload = new FormData();
    payload.append("unitPlanFile", file);

    try {
        setActionButtonsDisabled(true);
        setStatus("Parsing DOCX for preview...");

        const response = await fetch("/api/unit-plans/preview-docx", {
            method: "POST",
            headers: withUserEmailHeader(),
            body: payload
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            hasReadyFilePreview = false;
            throw new Error(result.error || `Could not preview document (HTTP ${response.status})`);
        }

        hasReadyFilePreview = true;
        showPreviewPanel(result.unitPlan || {}, result.source || file.name);
        setStatus("Preview loaded. Review it, then click Save Unit Plan.");
    } catch (error) {
        hasReadyFilePreview = false;
        setStatus(`Preview failed: ${error.message}`, true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

async function previewFromTemplate() {
    try {
        setActionButtonsDisabled(true);
        setStatus("Parsing TeacherFiles template for preview...");

        const response = await fetch("/api/unit-plans/preview-docx-template", {
            method: "POST",
            headers: withUserEmailHeader({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({})
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || `Could not preview template (HTTP ${response.status})`);
        }

        showPreviewPanel(result.unitPlan || {}, result.source || "TeacherFiles template");
        setStatus("Template preview loaded. Review it, then click Import Unit Plan.");
    } catch (error) {
        setStatus(`Template preview failed: ${error.message}`, true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

async function importTeacherTemplateDocx() {
    try {
        setActionButtonsDisabled(true);
        setStatus("Importing unit plan from TeacherFiles template...");

        const response = await fetch("/api/unit-plans/import-docx-template", {
            method: "POST",
            headers: withUserEmailHeader({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({})
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || `Could not import template (HTTP ${response.status})`);
        }

        const lessonCount = Number(result.lessonCount || 0);
        const lessonCardCount = Number(result.createdLessonCards ?? result.createdActivities ?? 0);
        const calendarCount = Number(result.createdCalendarEvents || 0);

        setStatus(`Imported ${result.unitPlan?.title || "unit plan"} from ${result.source || "TeacherFiles template"}. Saved ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}, created ${lessonCardCount} lesson card${lessonCardCount === 1 ? "" : "s"}${calendarCount ? `, and ${calendarCount} calendar event${calendarCount === 1 ? "" : "s"}` : ""}.`);
        if (uploadInput) {
            uploadInput.value = "";
        }
    } catch (error) {
        setStatus(`Template import failed: ${error.message}`, true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

async function saveFromPreview(event) {
    event.preventDefault();

    let payload = null;
    try {
        payload = collectPreviewPayload();
    } catch (error) {
        setStatus(`Cannot save preview: ${error.message}`, true);
        return;
    }

    if (!payload.title || !payload.topic || !payload.year_level) {
        setStatus("Preview must include title, topic, and year level before saving.", true);
        return;
    }

    try {
        setActionButtonsDisabled(true);
        setStatus("Saving previewed unit plan...");

        const response = await fetch("/api/unit-plans", {
            method: "POST",
            headers: withUserEmailHeader({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || `Could not save unit plan (HTTP ${response.status})`);
        }

        const lessonCount = Array.isArray(result?.lessons) ? result.lessons.length : 0;
        setStatus(`Saved ${result.title || "unit plan"} from preview with ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}.`);
    } catch (error) {
        setStatus(`Save from preview failed: ${error.message}`, true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

async function saveManualUnitPlan(event) {
    event.preventDefault();

    const payload = collectManualPayload();
    if (!payload.title || !payload.topic || !payload.year_level) {
        setManualSaveStatus("Manual planner requires title, topic, and year level.", true);
        return;
    }

    try {
        setActionButtonsDisabled(true);
        setManualSaveStatus(editUnitPlanId ? "Updating unit plan..." : "Saving manual unit plan...");

        const requestPath = editUnitPlanId
            ? `/api/unit-plans/${encodeURIComponent(editUnitPlanId)}`
            : "/api/unit-plans";
        const requestMethod = editUnitPlanId ? "PUT" : "POST";

        const response = await fetch(requestPath, {
            method: requestMethod,
            headers: withUserEmailHeader({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || `Could not save manual unit plan (HTTP ${response.status})`);
        }

        const lessonCount = Array.isArray(result?.lessons) ? result.lessons.length : payload.lessons.length;
        const lessonCardCount = Number(result.lesson_cards_created || 0);
        const actionWord = editUnitPlanId ? "Updated" : "Saved";
        setManualSaveStatus(`${actionWord} unit plan ${result.title || payload.title} with ${lessonCount} lesson${lessonCount === 1 ? "" : "s"} and ${lessonCardCount} lesson card${lessonCardCount === 1 ? "" : "s"} in the Library.`);

        if (editUnitPlanId) {
            populateManualPlannerFromUnitPlan(result || payload);
        } else {
            manualForm?.reset();
            resetManualLessons();
        }
    } catch (error) {
        const actionNoun = editUnitPlanId ? "Update" : "Manual save";
        setManualSaveStatus(`${actionNoun} failed: ${error.message}`, true);
    } finally {
        setActionButtonsDisabled(false);
    }
}

if (clearButton) {
    clearButton.addEventListener("click", () => {
        if (uploadInput) {
            uploadInput.value = "";
        }
        resetFilePreviewState();
        manualForm?.reset();
        resetManualLessons();
        setStatus("File cleared.");
    });
}

if (uploadInput) {
    uploadInput.addEventListener("change", () => {
        resetFilePreviewState();
        if (uploadInput.files?.length) {
            previewFromFile();
        }
    });
}

if (addLessonButton) {
    addLessonButton.addEventListener("click", () => {
        if (!lessonList) {
            return;
        }
        lessonList.appendChild(createLessonRow());
        renumberLessons();
        updateLessonTopicOptions();
    });
}

if (manualAddUnitTopicButton) {
    manualAddUnitTopicButton.addEventListener("click", () => {
        addManualUnitTopic(manualUnitTopicInput?.value || "");
        if (manualUnitTopicInput) {
            manualUnitTopicInput.value = "";
            manualUnitTopicInput.focus();
        }
    });
}

if (manualUnitTopicInput) {
    manualUnitTopicInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addManualUnitTopic(manualUnitTopicInput.value);
            manualUnitTopicInput.value = "";
        }
    });
}

if (manualUnitTopicsList) {
    manualUnitTopicsList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const removeIndex = target.getAttribute("data-remove-unit-topic");
        if (removeIndex === null) {
            return;
        }
        removeManualUnitTopic(removeIndex);
    });
}

if (clearManualFormButton) {
    clearManualFormButton.addEventListener("click", () => {
        manualForm?.reset();
        setManualUnitTopics([]);
        initializeHealthSafetyEditors();
        autoResizeOverviewAndAimsTextareas();
        autoResizeSchoolValueTextareas();
        autoResizeContextTextareas();
        autoResizeLocalCurriculumTextareas();
        autoResizeSkillsTextareas();
        autoResizeHealthSafetyTextarea();
        resetManualLessons();
        setManualSaveStatus("");
        setStatus("Manual unit planner cleared.");
    });
}

if (cancelManualUploadButton) {
    cancelManualUploadButton.addEventListener("click", () => {
        window.location.href = "upload-menu.html";
    });
}

if (importTemplateButton) {
    importTemplateButton.addEventListener("click", () => {
        importTeacherTemplateDocx();
    });
}

if (previewFileButton) {
    previewFileButton.addEventListener("click", () => {
        previewFromFile();
    });
}

if (previewTemplateButton) {
    previewTemplateButton.addEventListener("click", () => {
        previewFromTemplate();
    });
}

if (previewForm) {
    previewForm.addEventListener("submit", saveFromPreview);
}

if (manualForm) {
    manualForm.addEventListener("submit", saveManualUnitPlan);
}

if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!hasReadyFilePreview) {
            setStatus("Preview the selected file first, then save.", true);
            return;
        }

        if (!uploadInput?.files?.length) {
            setStatus("Choose a .docx file before saving.", true);
            return;
        }

        const file = uploadInput.files[0];
        if (!file) {
            setStatus("Choose a .docx file before saving.", true);
            return;
        }

        const payload = new FormData();
        payload.append("unitPlanFile", file);

        try {
            setActionButtonsDisabled(true);
            setStatus("Saving unit plan from document...");

            const response = await fetch("/api/unit-plans/import-docx", {
                method: "POST",
                headers: withUserEmailHeader(),
                body: payload
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || `Could not import unit plan (HTTP ${response.status})`);
            }

            const lessonCount = Number(result.lessonCount || 0);
            const lessonCardCount = Number(result.createdLessonCards ?? result.createdActivities ?? 0);
            const calendarCount = Number(result.createdCalendarEvents || 0);

            setStatus(`Saved ${result.unitPlan?.title || "unit plan"}. Created ${lessonCardCount} lesson card${lessonCardCount === 1 ? "" : "s"}, saved ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}${calendarCount ? `, and created ${calendarCount} calendar event${calendarCount === 1 ? "" : "s"}` : ""}.`);
            uploadInput.value = "";
            resetFilePreviewState();
        } catch (error) {
            setStatus(`Save failed: ${error.message}`, true);
        } finally {
            setActionButtonsDisabled(false);
        }
    });
}

async function initUploadUnitPage() {
    bindAuthStatusListeners();
    renderAuthStatus();
    setManualUnitTopics([]);
    resetManualLessons();
    setManualSaveStatus("");
    initializeHealthSafetyEditors();
    autoResizeOverviewAndAimsTextareas();
    autoResizeSchoolValueTextareas();
    autoResizeContextTextareas();
    autoResizeLocalCurriculumTextareas();
    autoResizeSkillsTextareas();
    autoResizeHealthSafetyTextarea();
    await loadUnitPlanForEdit();
}

initUploadUnitPage();

// Achievement Objectives Data
const ACHIEVEMENT_OBJECTIVES = {
    4: [
        {
            title: "Planning for practice",
            content: "Undertake planning that includes reviewing the effectiveness of past actions and resourcing, exploring implications for future actions and resource allocation, and considering stakeholder feedback to enable the development of an outcome."
        },
        {
            title: "Outcome development and evaluation",
            content: "Investigate a context to develop ideas for feasible outcomes. Undertake functional modelling that takes account of stakeholder feedback to select and create the outcome that best addresses the key attributes. Incorporating stakeholder feedback, evaluate the outcome's fitness for purpose in terms of how well it addresses the need or opportunity."
        }
    ],
    5: [
        {
            title: "Planning for practice",
            content: "Analyse their own and others' planning practices to inform the selection and use of planning tools. Use these to support and justify planning decisions (including those related to resource management) that will lead to the development of an outcome through to completion."
        },
        {
            title: "Outcome development and evaluation",
            content: "Analyse their own and others' outcomes to inform the development of ideas for feasible outcomes. Undertake ongoing functional modelling and evaluation that takes account of key stakeholder feedback and trialling in the physical and social environments. Use the information gained to select and develop the outcome that best addresses the specifications."
        }
    ],
    6: [
        {
            title: "Planning for practice",
            content: "Critically analyse their own and other's past and current planning practices to make an informed selection and effective use of planning tools. Use these to support and justify ongoing planning that will lead to the development of an outcome through to its completion."
        },
        {
            title: "Outcome development and evaluation",
            content: "Critically analyse their own and others' outcomes to inform the development of ideas for feasible outcomes. Undertake ongoing experimentation and functional modelling, taking account of stakeholder feedback and trialling in the physical and social environments. Use the information gained to select, justify, and develop an outcome."
        }
    ],
    7: [
        {
            title: "Advanced technological practice",
            content: "Apply advanced technological knowledge and practices in complex contexts. Analyse design challenges and develop sophisticated solutions that demonstrate sustained engagement with technological systems and processes."
        },
        {
            title: "Strategic outcome development",
            content: "Develop strategic outcomes that integrate complex technological knowledge. Critically evaluate processes and solutions against sophisticated criteria, demonstrating sustained evidence-based decision making."
        }
    ],
    8: [
        {
            title: "Expert technological application",
            content: "Demonstrate expert-level technological knowledge and sophisticated design practices. Synthesise complex information and develop innovative solutions to multifaceted technological challenges within professional contexts."
        },
        {
            title: "Professional evaluation and innovation",
            content: "Develop outcomes of professional quality that demonstrate comprehensive technological understanding. Conduct rigorous evaluation using advanced criteria, contributing innovative solutions that advance the field."
        }
    ]
};

// Initialize achievement objectives sliders
function initializeAchievementSliders() {
    // Manual form slider
    const manualSlider = document.querySelector("#manual-achievement-slider");
    const manualDisplay = document.querySelector("#manual-achievement-level-display");
    const manualObjectives = document.querySelector("#manual-achievement-objectives");
    const manualLevelInput = document.querySelector("#manual-selected-achievement-level");

    if (manualSlider) {
        manualSlider.addEventListener("input", function() {
            const level = parseInt(this.value);
            manualDisplay.textContent = `Level ${level}`;
            manualLevelInput.value = level;
            renderAchievementObjectives(manualObjectives, level);
        });
        // Initialize display
        renderAchievementObjectives(manualObjectives, 4);
    }

    // Preview form slider
    const previewSlider = document.querySelector("#preview-achievement-slider");
    const previewDisplay = document.querySelector("#preview-achievement-level-display");
    const previewObjectives = document.querySelector("#preview-achievement-objectives");
    const previewLevelInput = document.querySelector("#preview-selected-achievement-level");

    if (previewSlider) {
        previewSlider.addEventListener("input", function() {
            const level = parseInt(this.value);
            previewDisplay.textContent = `Level ${level}`;
            previewLevelInput.value = level;
            renderAchievementObjectives(previewObjectives, level);
        });
        // Initialize display
        renderAchievementObjectives(previewObjectives, 4);
    }
}

function renderAchievementObjectives(container, level) {
    if (!container || !ACHIEVEMENT_OBJECTIVES[level]) {
        return;
    }

    container.innerHTML = "";
    const objectives = ACHIEVEMENT_OBJECTIVES[level];

    objectives.forEach((objective) => {
        const objectiveDiv = document.createElement("div");
        objectiveDiv.className = "achievement-objective";

        const titleP = document.createElement("p");
        titleP.className = "achievement-objective-title";
        titleP.textContent = objective.title;

        const contentP = document.createElement("p");
        contentP.className = "achievement-objective-content";
        contentP.textContent = objective.content;

        objectiveDiv.appendChild(titleP);
        objectiveDiv.appendChild(contentP);
        container.appendChild(objectiveDiv);
    });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAchievementSliders);
} else {
    initializeAchievementSliders();
}

function normalizeLessonCardCategory(value, fallback = "Lesson") {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return fallback;

    if (raw === "project") return "Project";
    if (raw === "lesson") return "Lesson";
    if (raw === "assessment task" || raw === "assessment activity" || raw === "assessment") return "Assessment Task";
    if (raw === "activity" || raw === "skill activity" || raw === "practice" || raw === "practice activity") return "Activity";

    return fallback;
}