const DEFAULT_TEMPLATE_LIBRARY = [
    {
        id: "digital-outcome-description",
        title: "Digital Outcome Description",
        standardCodes: ["91897", "91907"],
        criteriaText: "Describe what the digital outcome is, who it is for, and what it must do.",
        summary: "Uses a two-column prompt-and-response slide structure for clear assessment evidence.",
        imageUrl: "https://drive.google.com/thumbnail?id=1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo&sz=w1000",
        templateUrl: "https://docs.google.com/presentation/d/1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo/edit?usp=sharing",
        status: "live"
    },
    {
        id: "tools-and-techniques",
        title: "Tools & Techniques",
        standardCodes: ["91897", "91907"],
        criteriaText: "List the tools you use and describe the techniques you implement with each one.",
        summary: "Two-column slide for listing tools and the techniques applied during development.",
        imageUrl: "https://drive.google.com/thumbnail?id=1F3F10KG2JCFQ-x41q6TEK15YjoxblmjRCGUZ6d254wg&sz=w1000",
        templateUrl: "https://docs.google.com/presentation/d/1F3F10KG2JCFQ-x41q6TEK15YjoxblmjRCGUZ6d254wg/edit?usp=sharing",
        status: "live"
    },
    {
        id: "speaker-notes-criteria-mapping",
        title: "Speaker Notes Criteria Mapping",
        standardCodes: ["91897"],
        criteriaText: "Map each presented slide to assessment criteria in Speaker Notes.",
        summary: "Template slot reserved. Add the final template URL when this slide is complete.",
        imageUrl: "https://placehold.co/540x760/d8e6d9/1f3a56?text=Coming+Soon+Template",
        templateUrl: "",
        status: "coming-soon"
    }
];

let templateLibraryData = Array.isArray(DEFAULT_TEMPLATE_LIBRARY)
    ? DEFAULT_TEMPLATE_LIBRARY.map((entry) => ({ ...entry }))
    : [];
let templateSearchQuery = "";
let libraryAccess = { can_teacher_view: false, can_admin: false };
let libraryHandlersBound = false;
const SYNC_FOLDER_NAME = "Process Slide Templates";
const LIB_HUB_VIEW_MODE_STORAGE_KEY = "hub_view_mode_v1";
const LIB_TEMPLATE_COPY_MAP_STORAGE_PREFIX = "hub_template_copy_map_v1";
const LIB_TEMPLATE_COPY_MAP_GLOBAL_STORAGE_KEY = "hub_template_copy_map_global_v1";
const LIB_TEMPLATE_RESET_STORAGE_PREFIX = "hub_template_reset_v1";
const LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX = "hub_task_topic_slide_sync_v1";
const TEMPLATE_PREVIEW_FALLBACK_URL = "../images/template-preview-placeholder.svg";

const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/presentations";
const LIB_AUTH_KEY = "hub_google_auth_v1";

const driveState = {
    accessToken: null,
    tokenExpiry: 0,
    tokenClient: null,
    pendingResolve: null,
    setupState: null,
    setupResolved: false,
    copyMap: {},          // templateId → { fileUrl, fileName }
    resetTemplateIds: {}, // templateId → true after a student resets use
    processAssessmentFiles: []  // Real-time list of files in Process Assessment folder
};

const templateUsageContext = (() => {
    try {
        const params = new URLSearchParams(window.location.search || "");
        return {
            activityId: String(params.get("activityId") || "").trim(),
            taskTopic: String(params.get("taskTopic") || "").trim(),
            taskShortName: String(params.get("taskShortName") || "").trim(),
            templateId: String(params.get("templateId") || "").trim(),
            preFilterTopic: String(params.get("preFilterTopic") || "").trim()
        };
    } catch (_error) {
        return { activityId: "", taskTopic: "", taskShortName: "", templateId: "", preFilterTopic: "" };
    }
})();

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function toSafeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
    } catch (_error) {}
    return "";
}

function extractSlidesIdFromValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const direct = raw.match(/^[A-Za-z0-9_-]{20,}$/);
    if (direct?.[0]) return direct[0];
    const pathMatch = raw.match(/\/presentation\/d\/([A-Za-z0-9_-]{20,})/i);
    if (pathMatch?.[1]) return pathMatch[1];
    const queryIdMatch = raw.match(/[?&]id=([A-Za-z0-9_-]{20,})/i);
    if (queryIdMatch?.[1]) return queryIdMatch[1];
    return "";
}

function resolveTemplatePreviewUrl(item) {
    const rawImageUrl = toSafeExternalUrl(item?.imageUrl || "");
    const templateId = extractSlidesIdFromValue(item?.templateUrl || "");

    if (templateId) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(templateId)}&sz=w1400`;
    }

    if (rawImageUrl) {
        return rawImageUrl;
    }

    return TEMPLATE_PREVIEW_FALLBACK_URL;
}

function normalizeStorageSlug(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

function getTemplateCopyMapStorageKey(activityId, email) {
    const safeActivityId = String(activityId || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();
    return `${LIB_TEMPLATE_COPY_MAP_STORAGE_PREFIX}:${safeActivityId}:${safeEmail}`;
}

function readStoredTemplateCopyMap(activityId, email) {
    const key = getTemplateCopyMapStorageKey(activityId, email);
    try {
        const parseMap = (raw) => {
            const parsed = JSON.parse(raw || "{}");
            const next = {};
            Object.entries(parsed || {}).forEach(([templateId, entry]) => {
            const fileUrl = toSafeExternalUrl(entry?.fileUrl || "");
            const fileName = String(entry?.fileName || "").trim();
            if (fileUrl) {
                next[String(templateId || "").trim()] = { fileUrl, fileName };
            }
        });
            return next;
        };

        const scopedRaw = localStorage.getItem(key) || "{}";
        const globalRaw = localStorage.getItem(LIB_TEMPLATE_COPY_MAP_GLOBAL_STORAGE_KEY) || "{}";
        return {
            ...parseMap(globalRaw),
            ...parseMap(scopedRaw)
        };
    } catch (_error) {
        return {};
    }
}

function writeStoredTemplateCopyMap(activityId, email, value) {
    const key = getTemplateCopyMapStorageKey(activityId, email);
    try {
        localStorage.setItem(key, JSON.stringify(value || {}));
    } catch (_error) {
    }
}

function getTemplateResetStorageKey(email) {
    return `${LIB_TEMPLATE_RESET_STORAGE_PREFIX}:${String(email || "").trim().toLowerCase()}`;
}

function readStoredTemplateResetIds(email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getTemplateResetStorageKey(email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeStoredTemplateResetIds(email, value) {
    try {
        localStorage.setItem(getTemplateResetStorageKey(email), JSON.stringify(value || {}));
    } catch (_error) {
    }
}

function clearTemplateResetMarker(templateId) {
    const id = String(templateId || "").trim();
    if (!id) return;
    delete driveState.resetTemplateIds[id];
    writeStoredTemplateResetIds(getLibraryEmail(), driveState.resetTemplateIds);
}

function clearStoredTemplateUse(templateId) {
    const targetId = String(templateId || "").trim().toLowerCase();
    if (!targetId) return;
    delete driveState.copyMap[templateId];
    persistCurrentTemplateCopyMap();
    driveState.resetTemplateIds[targetId] = true;
    writeStoredTemplateResetIds(getLibraryEmail(), driveState.resetTemplateIds);

    const activityId = String(templateUsageContext.activityId || "").trim();
    const email = getLibraryEmail();
    const prefix = `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${activityId}:${email}:`;
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = String(localStorage.key(index) || "");
            if (!key.startsWith(LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || "{}");
            const keyBelongsToEmail = activityId
                ? key.startsWith(prefix)
                : key.split(":")[2] === email;
            if (keyBelongsToEmail && String(parsed?.templateId || "").trim().toLowerCase() === targetId) {
                localStorage.removeItem(key);
            }
        }
    } catch (_error) {
    }
}

async function resetStudentTemplateUse(templateId) {
    const activityId = String(templateUsageContext.activityId || "").trim();
    const resetActivityId = activityId || "all";
    const response = await fetch(`/api/activities/${encodeURIComponent(resetActivityId)}/reset-template-use`, {
        method: "POST",
        headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ templateId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Could not reset template use.");
    clearStoredTemplateUse(templateId);
}

function persistCurrentTemplateCopyMap() {
    const email = getLibraryEmail();
    const activityId = String(templateUsageContext.activityId || "").trim();
    const copyMap = driveState.copyMap || {};

    try {
        localStorage.setItem(LIB_TEMPLATE_COPY_MAP_GLOBAL_STORAGE_KEY, JSON.stringify(copyMap));
    } catch (_error) {
    }

    if (email && activityId) {
        writeStoredTemplateCopyMap(activityId, email, copyMap);
    }
}

function getTaskTopicSlideSyncStorageKey(activityId, email, taskTopic, taskShortName = "") {
    const safeActivityId = String(activityId || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();
    const topicSlug = normalizeStorageSlug(taskTopic);
    const shortSlug = normalizeStorageSlug(taskShortName);
    return `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${safeActivityId}:${safeEmail}:${topicSlug}:${shortSlug}`;
}

function persistTaskTopicSlideSyncLink(fileUrl, metadata = {}) {
    const safeUrl = toSafeExternalUrl(fileUrl);
    const email = getLibraryEmail();
    const activityId = String(templateUsageContext.activityId || "").trim();
    const taskTopic = String(templateUsageContext.taskTopic || "").trim();
    const taskShortName = String(templateUsageContext.taskShortName || "").trim();
    if (!safeUrl || !email || !activityId || !taskTopic) return;

    const key = getTaskTopicSlideSyncStorageKey(activityId, email, taskTopic, taskShortName);
    try {
        localStorage.setItem(key, JSON.stringify({
            url: safeUrl,
            savedAt: new Date().toISOString(),
            // Prefer the actual item templateId over the URL-context templateId so cross-topic usage is not misclassified
            templateId: String(metadata.templateId || templateUsageContext.templateId || "").trim(),
            syncSource: "template-use",
            thumbnailUrl: String(metadata.thumbnailUrl || "").trim(),
            templateTitle: String(metadata.templateTitle || "").trim()
        }));
    } catch (_error) {
    }
}

function readStoredDigitalOutcomeDescriptionSlideId() {
    const activityId = String(templateUsageContext.activityId || "").trim();
    const email = getLibraryEmail();
    if (!activityId || !email) return "";

    const topicSlug = normalizeStorageSlug("Digital Outcome Description");
    const shortSlug = normalizeStorageSlug("Digital Outcome Description");
    try {
        const exactKey = `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${activityId}:${email}:${topicSlug}:${shortSlug}`;
        const exact = JSON.parse(localStorage.getItem(exactKey) || "{}");
        const exactId = extractSlidesFileId(exact?.url || "");
        if (exactId) return exactId;

        const prefix = `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${activityId}:${email}:`;
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index) || "";
            if (!key.startsWith(prefix)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || "{}");
            if (String(parsed?.templateId || "").trim().toLowerCase() !== "digital-outcome-description"
                && !/digital-outcome-description|digital-outcome/i.test(key)) continue;
            const slideId = extractSlidesFileId(parsed?.url || "");
            if (slideId) return slideId;
        }
        return "";
    } catch (_error) {
        return "";
    }
}

function readStoredTemplateSlideIdByTemplateId(templateId) {
    const activityId = String(templateUsageContext.activityId || "").trim();
    const email = getLibraryEmail();
    const targetId = String(templateId || "").trim().toLowerCase();
    if (!activityId || !email || !targetId) return "";
    const prefix = `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${activityId}:${email}:`;
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = String(localStorage.key(index) || "");
            if (!key.startsWith(prefix)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || "{}");
            if (String(parsed?.templateId || "").trim().toLowerCase() !== targetId) continue;
            const slideId = extractSlidesFileId(parsed?.url || "");
            if (slideId) return slideId;
        }
    } catch (_error) {
        return "";
    }
    return "";
}

async function findStudentTemplateSlideId(taskTopic, accessToken) {
    try {
        const response = await fetch("/api/student/drive-setup/find-slide", {
            method: "POST",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ driveAccessToken: accessToken, taskTopic })
        });
        if (!response.ok) return "";
        const payload = await response.json().catch(() => ({}));
        return extractSlidesFileId(payload?.fileUrl || payload?.fileId || "");
    } catch (_error) {
        return "";
    }
}

function readStoredRelevantImplicationNames() {
    const activityId = String(templateUsageContext.activityId || "").trim();
    const email = getLibraryEmail();
    if (!activityId || !email) return [];
    const prefix = `${LIB_TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${activityId}:${email}:`;
    const names = [];
    const displayName = (value) => String(value || "")
        .replace(/^relevant\s+implications?\s*-\s*/i, "")
        .replace(/\s*-\s*[a-z][a-z0-9._-]*$/i, "")
        .trim();
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index) || "";
            if (!key.startsWith(prefix)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || "{}");
            if (!/^relevant-implications(?:-|$)/i.test(String(parsed?.templateId || "").trim())) continue;
            const name = displayName(parsed?.templateTitle || "");
            if (name && !names.includes(name)) names.push(name);
        }
    } catch (_error) {
        return [];
    }
    return names;
}

function extractSlidesFileId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (!parsed.hostname.includes("google.com")) return "";
        const match = parsed.pathname.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/i);
        return match?.[1] || "";
    } catch (_error) {
        return "";
    }
}

function getLibraryEmail() {
    try {
        const raw = localStorage.getItem(LIB_AUTH_KEY) || sessionStorage.getItem(LIB_AUTH_KEY);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        const profileEmail = String(parsed?.profile?.email || "").trim().toLowerCase();
        if (profileEmail) return profileEmail;
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function getLibraryBearerToken() {
    try {
        const raw = localStorage.getItem(LIB_AUTH_KEY) || sessionStorage.getItem(LIB_AUTH_KEY);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function readLibraryAuthPayload() {
    try {
        const raw = localStorage.getItem(LIB_AUTH_KEY) || sessionStorage.getItem(LIB_AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_error) {
        return null;
    }
}

function authPayloadHasDriveScopes(payload) {
    const scopeText = String(payload?.grantedScopes || payload?.scope || "").toLowerCase();
    if (!scopeText) return false;
    return scopeText.includes("https://www.googleapis.com/auth/drive.file")
        || scopeText.includes("https://www.googleapis.com/auth/drive.readonly");
}

function getLibraryStoredDriveAccessToken() {
    const payload = readLibraryAuthPayload();
    if (!payload) return "";

    const expiresAt = Number(payload?.expiresAt || 0);
    if (!expiresAt || expiresAt <= Date.now() + 60000) {
        return "";
    }

    const token = String(payload?.accessToken || "").trim();
    if (!token) {
        return "";
    }

    if (!authPayloadHasDriveScopes(payload)) {
        return "";
    }

    return token;
}

function withLibraryAuthHeaders(headers = {}) {
    const email = getLibraryEmail();
    const token = getLibraryBearerToken();
    const next = { ...headers };
    if (email) next["x-user-email"] = email;
    if (token && token.startsWith("eyJ") && token.split(".").length === 3) next.Authorization = `Bearer ${token}`;
    return next;
}

function normalizeEvidenceRows(rows) {
    const source = Array.isArray(rows) ? rows : [];
    return source
        .map((row) => {
            const standard = String(row?.standard || "").trim();
            if (!standard) return null;

            const steps = Array.isArray(row?.steps)
                ? row.steps
                    .map((step) => ({
                        text: String(step?.text || "").trim(),
                        done: Boolean(step?.done)
                    }))
                    .filter((step) => step.text)
                : [];

            return { standard, steps };
        })
        .filter(Boolean);
}

async function fetchActivityEvidenceRows(activityId, studentEmail) {
    const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}/interests/${encodeURIComponent(studentEmail)}/evidence`, {
        headers: withLibraryAuthHeaders({})
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not load evidence steps.");
        error.status = Number(response.status || 0);
        throw error;
    }

    const payload = await response.json().catch(() => ({}));
    return normalizeEvidenceRows(payload?.evidence_steps);
}

async function saveActivityEvidenceRows(activityId, studentEmail, rows) {
    const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}/interests/${encodeURIComponent(studentEmail)}/evidence`, {
        method: "PATCH",
        headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ evidence_steps: normalizeEvidenceRows(rows) })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not save evidence steps.");
    }
}

async function ensureStudentAllocationForActivity(activityId) {
    const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}/interest`, {
        method: "POST",
        headers: withLibraryAuthHeaders({})
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not prepare student allocation.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!Boolean(payload?.interested)) {
        const second = await fetch(`/api/activities/${encodeURIComponent(activityId)}/interest`, {
            method: "POST",
            headers: withLibraryAuthHeaders({})
        });
        if (!second.ok) {
            const secondPayload = await second.json().catch(() => ({}));
            throw new Error(secondPayload?.error || "Could not prepare student allocation.");
        }
    }
}

function getTemplateStepMatchers(templateId) {
    const id = String(templateId || "").trim().toLowerCase();
    const contextText = `${templateUsageContext.taskTopic} ${templateUsageContext.taskShortName}`.toLowerCase();

    if (id === "digital-outcome-description") {
        return [/^description\s*-\s*google\s*slides\b/i];
    }

    if (id === "target-audience") {
        return [/target\s+audience/i, /end\s+user/i];
    }

    if (id === "trialling-components") {
        return [/triall?ing\s+(?:the\s+)?components/i, /trailing\s+components/i, /trial\s+multiple\s+components/i];
    }

    if (id === "testing-functions") {
        return [/testing\s+functions/i, /test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/i];
    }

    if (id === "tools-and-techniques") {
        return [/what\s+tools\s+and\s+techniques\s+will\s+be\s+used/i, /tools\/?technologies/i];
    }

    if (id === "use-of-tools-and-techniques") {
        return [/using\s+appropriate\s+tools\s+and\s+techniques/i, /applying\s+appropriate\s+tools\s+and\s+techniques/i, /using\s+tools\s*(?:&|and)\s*techniques/i];
    }

    if (id === "relevant-digimed-conventions") {
        return [/relevant\s+(?:digimed\s+)?conventions/i, /relevant\s+conventions\s+for\s+the\s+media\s+type/i];
    }

    if (id === "user-experience-principles") {
        return [/user\s+experience\s+(?:\(ux\)\s+)?principles/i, /ux\s+principles/i, /applying\s+user\s+experience\s+principles/i];
    }

    // For category-specific relevant implications templates, only match the specific category
    if (id.startsWith("relevant-implications-") && id !== "relevant-implications") {
        const categoryName = extractCategoryFromTemplateId(id);
        if (categoryName) {
            return [new RegExp(`^Achieved:\\s*Relevant implications category -\\s*${categoryName}\\s*$`, "i")];
        }
    }

    if (id === "development-steps") {
        return [
            /explain\s+how\s+the\s+outcome\s+will\s+be\s+developed/i,
            /development\s+steps/i,
            /outcome\s+developed/i
        ];
    }

    if (id === "relevant-implications") {
        return [/relevant\s+implications/i];
    }

    if (id === "project-success-criteria") {
        return [
            /state\s+how\s+success\s+will\s+be\s+measured/i,
            /success\s+will\s+be\s+evaluated/i,
            /success\s+criteria/i
        ];
    }

    if (id === "speaker-notes-criteria-mapping") {
        return [/speaker\s*notes/i, /criteria\s*mapping/i];
    }

    if (contextText.includes("target audience") || contextText.includes("end user")) {
        return [/target\s+audience/i, /end\s+user/i];
    }

    if (contextText.includes("tools") || contextText.includes("technologies")) {
        return [/what\s+tools\s+and\s+techniques\s+will\s+be\s+used/i, /tools\/?technologies/i];
    }

    if (contextText.includes("development")) {
        return [
            /explain\s+how\s+the\s+outcome\s+will\s+be\s+developed/i,
            /development\s+steps/i,
            /outcome\s+developed/i
        ];
    }

    if (contextText.includes("success") || contextText.includes("measured") || contextText.includes("evaluated")) {
        return [
            /state\s+how\s+success\s+will\s+be\s+measured/i,
            /success\s+will\s+be\s+evaluated/i,
            /success\s+criteria/i
        ];
    }

    if (contextText.includes("digital outcome")) {
        return [/^description\s*-\s*google\s*slides\b/i];
    }

    return [/google\s*slides/i];
}

function extractCategoryFromTemplateId(templateId) {
    // Extract category from templateId like "relevant-implications-functionality"
    const id = String(templateId || "").trim().toLowerCase();
    if (!id.startsWith("relevant-implications-")) return null;
    
    const categorySlug = id.replace(/^relevant-implications-/, "").trim();
    if (!categorySlug) return null;
    
    // Map slugs to category names
    const categoryMap = {
        "social": "Social",
        "cultural": "Cultural",
        "legal": "Legal",
        "ethical": "Ethical",
        "intellectual-property": "Intellectual Property",
        "intellectual_property": "Intellectual Property",
        "privacy": "Privacy",
        "accessibility": "Accessibility",
        "usability": "Usability",
        "functionality": "Functionality",
        "aesthetics": "Aesthetics",
        "sustainability-and-future-proofing": "Sustainability and Future Proofing",
        "sustainability_and_future_proofing": "Sustainability and Future Proofing",
        "end-user-considerations": "End-User Considerations",
        "end_user_considerations": "End-User Considerations",
        "health-and-safety": "Health and Safety",
        "health_and_safety": "Health and Safety"
    };
    
    return categoryMap[categorySlug] || null;
}

function extractCategoryFromTemplateTitle(templateTitle) {
    // Extract category from template title like "Relevant Implications - Functionality"
    const title = String(templateTitle || "").trim();
    if (!title.toLowerCase().includes("relevant implications")) return null;
    
    // Split by hyphen and get the last part as the category
    const parts = title.split("-").map((p) => p.trim());
    if (parts.length < 2) return null;
    
    // The category is typically the last part
    const potentialCategory = parts[parts.length - 1];
    
    // Verify it's a known category
    const KNOWN_CATEGORIES = [
        "Social", "Cultural", "Legal", "Ethical",
        "Intellectual Property", "Privacy", "Accessibility",
        "Usability", "Functionality", "Aesthetics",
        "Sustainability and Future Proofing", "End-User Considerations", "Health and Safety"
    ];
    
    if (KNOWN_CATEGORIES.some((cat) => cat.toLowerCase() === potentialCategory.toLowerCase())) {
        return potentialCategory;
    }
    
    return null;
}

async function markConnectedTaskItemDone(templateId, templateTitle = "") {
    const activityId = String(templateUsageContext.activityId || "").trim();
    const studentEmail = getLibraryEmail();
    if (!activityId || !studentEmail) return;

    let evidenceRows = [];
    try {
        evidenceRows = await fetchActivityEvidenceRows(activityId, studentEmail);
    } catch (error) {
        if (Number(error?.status || 0) !== 404) {
            throw error;
        }
        await ensureStudentAllocationForActivity(activityId);
        evidenceRows = await fetchActivityEvidenceRows(activityId, studentEmail);
    }

    // Determine if this is a category-specific template by ID or title
    const categoryFromId = extractCategoryFromTemplateId(templateId);
    const categoryFromTitle = extractCategoryFromTemplateTitle(templateTitle);
    const specificCategory = categoryFromId || categoryFromTitle;

    let matchers;
    if (specificCategory) {
        // Only mark the single matching category step as done
        const categoryStepText = `Achieved: Relevant implications category - ${specificCategory}`;
        matchers = [new RegExp(`^${categoryStepText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")];
    } else {
        matchers = getTemplateStepMatchers(templateId);
    }

    let changed = false;
    const nextRows = evidenceRows.map((row) => {
        const nextSteps = Array.isArray(row?.steps)
            ? row.steps.map((step) => {
                const text = String(step?.text || "").trim();
                const alreadyDone = Boolean(step?.done);
                const isMatch = text && matchers.some((matcher) => matcher.test(text));
                if (!isMatch || alreadyDone) {
                    return { text, done: alreadyDone };
                }
                changed = true;
                return { text, done: true };
            })
            : [];
        return { standard: String(row?.standard || "").trim(), steps: nextSteps };
    });

    if (!changed) {
        return;
    }

    await saveActivityEvidenceRows(activityId, studentEmail, nextRows);
}

async function loadLibraryAccess() {
    const email = getLibraryEmail();
    if (!email) {
        return { can_teacher_view: false, can_admin: false };
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
            headers: withLibraryAuthHeaders({})
        });
        if (!response.ok) {
            return { can_teacher_view: false, can_admin: false };
        }
        const payload = await response.json().catch(() => ({}));
        return {
            can_teacher_view: Boolean(payload?.can_teacher_view),
            can_admin: Boolean(payload?.can_admin)
        };
    } catch (_error) {
        return { can_teacher_view: false, can_admin: false };
    }
}

function applyLibraryRoleVisibility(access) {
    const canManage = canManageTemplates();
    document.body.classList.toggle("template-staff-mode", canManage);
    const staffOnlyElements = document.querySelectorAll("[data-staff-only='true']");
    staffOnlyElements.forEach((element) => {
        element.hidden = !canManage;
    });
}

function initDriveTokenClient() {
    if (!window.google?.accounts?.oauth2) return null;
    const clientId = document.querySelector('meta[name="hub-google-client-id"]')?.content.trim() || "";
    if (!clientId) return null;

    return window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPES,
        include_granted_scopes: true,
        callback: (response) => {
            if (driveState.pendingResolve) {
                driveState.pendingResolve(response);
                driveState.pendingResolve = null;
            }
            if (!response.error && response.access_token) {
                driveState.accessToken = response.access_token;
                driveState.tokenExpiry = Date.now() + (Number(response.expires_in) || 3600) * 1000;
            }
        },
        error_callback: (error) => {
            if (driveState.pendingResolve) {
                driveState.pendingResolve({ error: error?.type || "access_denied" });
                driveState.pendingResolve = null;
            }
        }
    });
}

function requestDriveToken(options = {}) {
    const forceConsent = Boolean(options?.forceConsent);
    return new Promise((resolve) => {
        if (!forceConsent && driveState.accessToken && driveState.tokenExpiry > Date.now() + 60000) {
            resolve({ access_token: driveState.accessToken });
            return;
        }

        const storedToken = getLibraryStoredDriveAccessToken();
        if (storedToken && !forceConsent) {
            driveState.accessToken = storedToken;
            driveState.tokenExpiry = Date.now() + (55 * 60 * 1000);
            resolve({ access_token: storedToken });
            return;
        }

        if (!driveState.tokenClient) {
            driveState.tokenClient = initDriveTokenClient();
        }

        if (!driveState.tokenClient) {
            resolve({ error: "Drive sign-in is not available. Please ensure you are signed in." });
            return;
        }

        driveState.pendingResolve = resolve;
        driveState.tokenClient.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
    });
}

async function loadDriveSetup() {
    const email = getLibraryEmail();
    if (!email) {
        driveState.setupResolved = true;
        return null;
    }

    try {
        let taskListCourse = "";
        try {
            const courseResponse = await fetch("/api/practical-skills/my-course", {
                headers: withLibraryAuthHeaders({}),
                cache: "no-store"
            });
            const coursePayload = await courseResponse.json().catch(() => ({}));
            if (courseResponse.ok) taskListCourse = String(coursePayload?.course || "").trim();
        } catch (_error) {
            taskListCourse = "";
        }

        if (taskListCourse === "MiddleDTECH") {
            const response = await fetch("/api/student/mdtech-project-folder", {
                headers: withLibraryAuthHeaders({}),
                cache: "no-store"
            });
            const payload = await response.json().catch(() => ({}));
            driveState.setupResolved = true;
            if (!response.ok) {
                driveState.setupState = { taskListCourse, configured: false, confirmed: false };
                return driveState.setupState;
            }
            driveState.setupState = {
                ...payload,
                taskListCourse,
                configured: Boolean(payload?.ready),
                confirmed: Boolean(payload?.ready),
                mdtechProjectFolderId: String(payload?.folderId || "").trim(),
                mdtechProjectFolderUrl: String(payload?.folderUrl || "").trim()
            };
            return driveState.setupState;
        }

        const storedDriveAccessToken = getLibraryStoredDriveAccessToken();
        const response = storedDriveAccessToken
            ? await fetch("/api/student/drive-setup/status", {
                method: "POST",
                headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ driveAccessToken: storedDriveAccessToken })
            })
            : await fetch("/api/student/drive-setup", { headers: withLibraryAuthHeaders({}) });
        const payload = await response.json().catch(() => ({}));
        driveState.setupResolved = true;
        if (!response.ok) return null;
        driveState.setupState = { ...payload, taskListCourse };
        return driveState.setupState;
    } catch (_error) {
        driveState.setupResolved = true;
        return null;
    }
}

function getTemplateDestination(setup = driveState.setupState) {
    const isMiddleDtech = setup?.taskListCourse === "MiddleDTECH";
    const folderId = String(isMiddleDtech
        ? setup?.mdtechProjectFolderId || ""
        : setup?.processAssessmentFolderId || "").trim();
    const folderUrl = String(isMiddleDtech
        ? setup?.mdtechProjectFolderUrl || ""
        : setup?.processAssessmentFolderUrl || "").trim()
        || (folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : "");
    return {
        folderId,
        folderUrl,
        folderName: isMiddleDtech ? "MDTECH Project" : "Process Assessment",
        path: isMiddleDtech ? "WHS-DTECH / MiddleDTECH / MDTECH Project" : "SeniorDTECH / Process Assessment"
    };
}

function normalizeTemplateLibraryEntries(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((row, index) => {
            const id = String(row?.id || row?.templateId || "").trim();
            const title = String(row?.title || "").trim();
            const templateUrl = String(row?.templateUrl || "").trim();
            if (!id || !title || !templateUrl) return null;

            return {
                id,
                title,
                standardCodes: Array.isArray(row?.standardCodes) ? row.standardCodes.map((code) => String(code || "").trim()).filter(Boolean) : [],
                criteriaText: String(row?.criteriaText || "").trim(),
                summary: String(row?.summary || "").trim(),
                imageUrl: String(row?.imageUrl || "").trim(),
                templateUrl,
                status: String(row?.status || "live").trim().toLowerCase() === "coming-soon" ? "coming-soon" : "live",
                sortOrder: Number(row?.sortOrder ?? index + 1) || (index + 1),
                sectionName: String(row?.sectionName || "").trim()
            };
        })
        .filter(Boolean)
        .sort(compareTemplateEntries);
}

function compareTemplateEntries(left, right) {
    const leftTitle = String(left?.title || "").trim().toLowerCase();
    const rightTitle = String(right?.title || "").trim().toLowerCase();
    const isPrimaryProcessTemplateTitle = (value) => {
        const normalized = String(value || "").trim().toLowerCase();
        return normalized === "process slide templates"
            || normalized === "afull - digital outcome details template";
    };
    const leftPriority = isPrimaryProcessTemplateTitle(leftTitle) ? 0 : 1;
    const rightPriority = isPrimaryProcessTemplateTitle(rightTitle) ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftSort = Number(left?.sortOrder || 0);
    const rightSort = Number(right?.sortOrder || 0);
    if (leftSort !== rightSort) return leftSort - rightSort;
    return leftTitle.localeCompare(rightTitle);
}

async function loadTemplateLibraryEntries() {
    try {
        const response = await fetch("/api/template-library", { headers: withLibraryAuthHeaders({}) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;

        const fromApi = normalizeTemplateLibraryEntries(payload?.entries);
        templateLibraryData = fromApi;
    } catch (_error) {
        // Keep defaults when API is unavailable.
    }
}

function canManageTemplates() {
    const hasStaffRole = Boolean(libraryAccess?.can_teacher_view || libraryAccess?.can_admin);
    if (!hasStaffRole) return false;
    return isTeacherModeActiveOnPage();
}

function isTeacherModeActiveOnPage() {
    const staffLink = document.querySelector("#hub-staff-link");
    if (staffLink && !staffLink.hidden) {
        const href = String(staffLink.getAttribute("href") || "").toLowerCase();
        if (href.includes("/index.html") || href === "index.html") return true;
        if (href.includes("/teacher-view.html") || href === "teacher-view.html") return false;
    }
    return getHubViewMode() === "teacher";
}

function getHubViewMode() {
    if (typeof window.getEffectiveHubViewMode === "function") {
        try {
            const resolved = String(window.getEffectiveHubViewMode() || "").trim().toLowerCase();
            return resolved === "teacher" ? "teacher" : "student";
        } catch (_error) {
            // Fall through to storage-based fallback.
        }
    }

    try {
        const value = String(localStorage.getItem(LIB_HUB_VIEW_MODE_STORAGE_KEY) || "").trim().toLowerCase();
        return value === "teacher" ? "teacher" : "student";
    } catch (_error) {
        return "student";
    }
}

function refreshStaffOnlyUi() {
    applyLibraryRoleVisibility(libraryAccess);
    renderLibrary();
}

function setTemplateSyncStatus(message, isError = false) {
    const statusEl = document.querySelector("#template-sync-status");
    if (!statusEl) return;
    statusEl.textContent = String(message || "").trim();
    statusEl.style.color = isError ? "#ffd5d5" : "rgba(255, 255, 255, 0.92)";
}

async function handleSyncTemplateLibrary() {
    const syncButton = document.querySelector("#template-sync-button");
    if (!syncButton || !canManageTemplates()) return;

    syncButton.disabled = true;
    setTemplateSyncStatus("Requesting Google Drive access...");

    const tokenResponse = await requestDriveToken();
    if (tokenResponse.error) {
        syncButton.disabled = false;
        setTemplateSyncStatus("Drive access was not granted.", true);
        return;
    }

    setTemplateSyncStatus(`Syncing slides from ${SYNC_FOLDER_NAME}...`);
    try {
        const response = await fetch("/api/template-library/sync", {
            method: "POST",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                driveAccessToken: tokenResponse.access_token,
                folderName: SYNC_FOLDER_NAME
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);

        const fromApi = normalizeTemplateLibraryEntries(payload?.entries);
        templateLibraryData = fromApi;
        renderLibrary();
        const syncedCount = Number(payload?.syncedCount || fromApi.length || 0);
        setTemplateSyncStatus(`Synced ${syncedCount} template${syncedCount === 1 ? "" : "s"}.`);
    } catch (error) {
        setTemplateSyncStatus(`Sync failed: ${error.message || "Unknown error"}`, true);
    }

    syncButton.disabled = false;
}

function renderSetupBanner(setup) {
    const banner = document.querySelector("#template-setup-banner");
    if (!banner) return;

    const signedInEmail = getLibraryEmail();

    if (!signedInEmail) {
        banner.innerHTML = "";
        banner.hidden = true;
        return;
    }

    const destination = getTemplateDestination(setup);
    if (setup?.confirmed && destination.folderId) {
        banner.innerHTML = `
            <div class="template-setup-banner-inner template-setup-banner-ok">
                <p class="template-setup-banner-text">&#10003; Your <strong><a class="template-setup-banner-link" href="${escapeHtml(destination.folderUrl)}" target="_blank" rel="noreferrer">${escapeHtml(destination.folderName)}</a></strong> folder is ready. Templates copied will go directly there.</p>
            </div>`;
        banner.hidden = false;
        return;
    }

    if (setup?.taskListCourse === "MiddleDTECH") {
        banner.innerHTML = `
            <div class="template-setup-banner-inner template-setup-banner-action">
                <p class="template-setup-banner-text">Before using these templates, create or confirm <strong>${escapeHtml(destination.path)}</strong> in your Google Drive. Templates copied will be saved in <strong>MDTECH Project</strong>.</p>
                <button type="button" class="template-setup-confirm-button" id="template-setup-confirm">Set up MDTECH Project</button>
                <p class="template-setup-banner-status" id="template-setup-status" aria-live="polite"></p>
            </div>`;
        banner.hidden = false;
        document.querySelector("#template-setup-confirm")?.addEventListener("click", () => {
            void handleConfirmFolder();
        });
        return;
    }

    if (!setup || !setup.configured) {
        banner.innerHTML = `
            <div class="template-setup-banner-inner template-setup-banner-action">
                <p class="template-setup-banner-text">No Hapara mapping was found for your signed-in account.<br><strong>Signed-in account:</strong> ${escapeHtml(signedInEmail)}<br>That is okay. Click confirm and we will create or use your <strong>SeniorDTECH</strong> folder, then create your <strong>Process Assessment</strong> folder with <strong>Digital Outcome Details</strong> and <strong>Relevant Implications</strong> sub-folders automatically.</p>
                <button type="button" class="template-setup-confirm-button" id="template-setup-confirm">Confirm My Folder</button>
                <p class="template-setup-banner-status" id="template-setup-status" aria-live="polite"></p>
                <p class="template-setup-banner-text"><a class="template-setup-banner-link" href="../admin-hapara-folders.html" target="_blank" rel="noreferrer">Open Hapara Folder Upload page</a> only if your school wants to keep class mapping details.</p>
            </div>`;
        banner.hidden = false;
        document.querySelector("#template-setup-confirm")?.addEventListener("click", () => {
            void handleConfirmFolder();
        });
        return;
    }

    const hasDriveFolder = Boolean(String(setup.haparaFolderId || "").trim());
    const mappedValue = String(setup.haparaFolderUrl || "").trim();
    const mappedLabel = String(setup.classLabel || "").trim();

    if (!hasDriveFolder) {
        const mappedDescription = mappedLabel || mappedValue || "Mapped (non-Drive value)";
        banner.innerHTML = `
            <div class="template-setup-banner-inner template-setup-banner-action">
                <p class="template-setup-banner-text">Your account has a Hapara mapping by folder name.<br><strong>Signed-in account:</strong> ${escapeHtml(signedInEmail)}<br><strong>Mapped value:</strong> ${escapeHtml(mappedDescription)}<br>Click confirm and we will create or use your <strong>SeniorDTECH</strong> folder, then create your <strong>Process Assessment</strong> folder with <strong>Digital Outcome Details</strong> and <strong>Relevant Implications</strong> sub-folders automatically.</p>
                <button type="button" class="template-setup-confirm-button" id="template-setup-confirm">Confirm My Folder</button>
                <p class="template-setup-banner-status" id="template-setup-status" aria-live="polite"></p>
                <p class="template-setup-banner-text"><a class="template-setup-banner-link" href="../admin-hapara-folders.html" target="_blank" rel="noreferrer">Open Hapara Folder Upload page</a> to maintain class mapping details.</p>
            </div>`;
        banner.hidden = false;
        document.querySelector("#template-setup-confirm")?.addEventListener("click", () => {
            void handleConfirmFolder();
        });
        return;
    }

    const folderUrl = String(setup.haparaFolderUrl || "").trim();
    const classLabel = String(setup.classLabel || "your Hapara folder").trim();
    banner.innerHTML = `
        <div class="template-setup-banner-inner template-setup-banner-action">
            <p class="template-setup-banner-text">Your Hapara mapping is set: <strong>${escapeHtml(classLabel)}</strong>${folderUrl ? ` &mdash; <a class="template-setup-banner-link" href="${escapeHtml(folderUrl)}" target="_blank" rel="noreferrer">Open folder</a>` : ""}.<br>Confirm to create your <strong>Process Assessment</strong> folder inside <strong>SeniorDTECH</strong> with <strong>Digital Outcome Details</strong> and <strong>Relevant Implications</strong> sub-folders so templates save there automatically.</p>
            <button type="button" class="template-setup-confirm-button" id="template-setup-confirm">Confirm My Folder</button>
            <p class="template-setup-banner-status" id="template-setup-status" aria-live="polite"></p>
        </div>`;
    banner.hidden = false;

    document.querySelector("#template-setup-confirm")?.addEventListener("click", () => {
        void handleConfirmFolder();
    });
}

async function handleConfirmFolder() {
    const confirmButton = document.querySelector("#template-setup-confirm");
    const statusEl = document.querySelector("#template-setup-status");
    const isMiddleDtech = driveState.setupState?.taskListCourse === "MiddleDTECH";
    const setupUrl = isMiddleDtech ? "/api/student/mdtech-project-folder" : "/api/student/drive-setup/confirm";
    if (confirmButton) confirmButton.disabled = true;
    if (statusEl) statusEl.textContent = "Requesting Drive access\u2026";

    const tokenResponse = await requestDriveToken();
    if (tokenResponse.error) {
        if (statusEl) statusEl.textContent = "Drive access was not granted. Please try again.";
        if (confirmButton) confirmButton.disabled = false;
        return;
    }

    if (statusEl) statusEl.textContent = isMiddleDtech
        ? "Creating your MDTECH Project folder\u2026"
        : "Creating SeniorDTECH/Process Assessment folders and sub-folders\u2026";

    try {
        const response = await fetch(setupUrl, {
            method: "POST",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ driveAccessToken: tokenResponse.access_token })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);

        driveState.setupState = isMiddleDtech
            ? {
                ...driveState.setupState,
                ready: true,
                configured: true,
                confirmed: true,
                mdtechProjectFolderId: String(payload.folderId || "").trim(),
                mdtechProjectFolderUrl: String(payload.folderUrl || "").trim()
            }
            : { ...driveState.setupState, confirmed: true, processAssessmentFolderId: payload.processAssessmentFolderId };
        renderSetupBanner(driveState.setupState);
        
        // Clear the status element since the banner has been successfully updated
        if (statusEl) statusEl.textContent = "";
        
        const folderUrl = isMiddleDtech ? payload.folderUrl : payload.processAssessmentFolderUrl;
        if (folderUrl) {
            window.open(folderUrl, "_blank", "noopener");
        }
    } catch (error) {
        const message = String(error?.message || "");
        const needsConsentRetry = /has not granted the app|read access to the file|insufficient permissions|forbidden/i.test(message);
        if (!needsConsentRetry) {
            if (statusEl) statusEl.textContent = `Could not confirm folder: ${error.message || "Unknown error"}`;
            if (confirmButton) confirmButton.disabled = false;
            return;
        }

        driveState.accessToken = null;
        driveState.tokenExpiry = 0;
        const consentTokenResponse = await requestDriveToken({ forceConsent: true });
        if (consentTokenResponse.error) {
            if (statusEl) statusEl.textContent = isMiddleDtech
                ? "Google Drive permission is required to create your MDTECH Project folder."
                : "Google Drive permission is required to create your SeniorDTECH/Process Assessment folders.";
            if (confirmButton) confirmButton.disabled = false;
            return;
        }

        try {
            const retryResponse = await fetch(setupUrl, {
                method: "POST",
                headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ driveAccessToken: consentTokenResponse.access_token })
            });
            const retryPayload = await retryResponse.json().catch(() => ({}));
            if (!retryResponse.ok) throw new Error(retryPayload.error || `Error ${retryResponse.status}`);

            driveState.setupState = isMiddleDtech
                ? {
                    ...driveState.setupState,
                    ready: true,
                    configured: true,
                    confirmed: true,
                    mdtechProjectFolderId: String(retryPayload.folderId || "").trim(),
                    mdtechProjectFolderUrl: String(retryPayload.folderUrl || "").trim()
                }
                : { ...driveState.setupState, confirmed: true, processAssessmentFolderId: retryPayload.processAssessmentFolderId };
            renderSetupBanner(driveState.setupState);
            
            // Clear the status element since the banner has been successfully updated
            if (statusEl) statusEl.textContent = "";
            
            const folderUrl = isMiddleDtech ? retryPayload.folderUrl : retryPayload.processAssessmentFolderUrl;
            if (folderUrl) {
                window.open(folderUrl, "_blank", "noopener");
            }
        } catch (retryError) {
            if (statusEl) statusEl.textContent = `Could not confirm folder: ${retryError.message || "Unknown error"}`;
            if (confirmButton) confirmButton.disabled = false;
        }
    }
}

async function handleUseTemplate(templateId) {
    const item = templateLibraryData.find((entry) => entry.id === templateId);
    if (!item) return;

    const fileId = extractSlidesFileId(item.templateUrl);
    if (!fileId) {
        alert("This template does not have a valid Google Slides URL configured yet.");
        return;
    }

    // If already copied this session, open existing
    const rememberedCopyId = extractSlidesFileId(driveState.copyMap[templateId]?.fileUrl || "");
    if (rememberedCopyId && driveState.processAssessmentFilesLoaded
        && !driveState.processAssessmentFiles.some((file) => String(file?.id || "") === rememberedCopyId)) {
        // The remembered copy was deleted in Drive, so make a fresh one.
        delete driveState.copyMap[templateId];
        persistCurrentTemplateCopyMap();
    }
    const refreshSuccessCriteriaCopy = templateId === "project-success-criteria";
    if (driveState.copyMap[templateId] && !refreshSuccessCriteriaCopy) {
        clearTemplateResetMarker(templateId);
        persistTaskTopicSlideSyncLink(driveState.copyMap[templateId].fileUrl, {
            templateId: item.id,
            thumbnailUrl: item.imageUrl,
            templateTitle: item.title
        });
        persistCurrentTemplateCopyMap();
        void markConnectedTaskItemDone(templateId, item.title).catch((error) => {
            console.warn("Could not update Task List completion after template open.", error);
        });
        window.open(driveState.copyMap[templateId].fileUrl, "_blank", "noopener");
        return;
    }

    // Do not allow template use until the course-specific folder is confirmed.
    const setup = driveState.setupState;
    const destination = getTemplateDestination(setup);
    if (!setup?.confirmed || !destination.folderId) {
        alert(`Please set up your ${destination.folderName} folder first. Templates are available once it is ready.`);
        return;
    }

    const button = document.querySelector(`[data-use-template="${CSS.escape(templateId)}"]`);
    if (button) { button.disabled = true; button.textContent = "Copying\u2026"; }
    let sourcePresentationId = item.id === "project-success-criteria" || item.id === "testing-functions"
        ? readStoredDigitalOutcomeDescriptionSlideId()
        : (item.id === "trialling-components" ? readStoredTemplateSlideIdByTemplateId("development-steps") : "");

    const copyTemplateWithToken = async (accessToken) => {
        if (item.id === "trialling-components" && !sourcePresentationId) {
            sourcePresentationId = await findStudentTemplateSlideId("Development Steps", accessToken);
        }
        if (item.id === "testing-functions" && !sourcePresentationId) {
            sourcePresentationId = await findStudentTemplateSlideId("Digital Outcome Description", accessToken);
        }
        const response = await fetch("/api/student/drive-setup/copy-template", {
            method: "POST",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                driveAccessToken: accessToken,
                templateId: item.id,
                templateTitle: item.title,
                templateFileId: fileId,
                activityId: templateUsageContext.activityId,
                sourcePresentationId,
                sourceRelevantImplications: item.id === "project-success-criteria" ? readStoredRelevantImplicationNames() : []
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
        if (payload?.populationWarning) {
            console.warn("Success Criteria requirements were not populated:", payload.populationWarning);
        }
        return payload;
    };

    const tokenResponse = await requestDriveToken({ forceConsent: refreshSuccessCriteriaCopy });
    if (tokenResponse.error) {
        if (button) { button.disabled = false; button.textContent = "Use Template"; }
        alert("Drive access was not granted. Please sign in and try again.");
        return;
    }

    try {
        const payload = await copyTemplateWithToken(tokenResponse.access_token);

        clearTemplateResetMarker(templateId);
        driveState.copyMap[templateId] = { fileUrl: payload.fileUrl, fileName: payload.fileName };
        persistTaskTopicSlideSyncLink(payload.fileUrl, {
            templateId: item.id,
            thumbnailUrl: item.imageUrl,
            templateTitle: item.title
        });
        persistCurrentTemplateCopyMap();
        updateCardAfterCopy(templateId, payload);
        void markConnectedTaskItemDone(templateId, item.title).catch((error) => {
            console.warn("Could not update Task List completion after template copy.", error);
        });
        window.open(payload.fileUrl, "_blank", "noopener");
    } catch (error) {
        const message = String(error?.message || "");
        const needsConsentRetry = /has not granted the app|read access to the file|insufficient permissions|forbidden/i.test(message);
        if (!needsConsentRetry) {
            if (button) { button.disabled = false; button.textContent = "Use Template"; }
            alert(`Could not copy template: ${error.message || "Unknown error"}`);
            return;
        }

        driveState.accessToken = null;
        driveState.tokenExpiry = 0;
        const consentTokenResponse = await requestDriveToken({ forceConsent: true });
        if (consentTokenResponse.error) {
            if (button) { button.disabled = false; button.textContent = "Use Template"; }
            alert("Google Drive needs one-time permission to read templates before copying. Please allow access and try again.");
            return;
        }

        try {
            const retryPayload = await copyTemplateWithToken(consentTokenResponse.access_token);
            clearTemplateResetMarker(templateId);
            driveState.copyMap[templateId] = { fileUrl: retryPayload.fileUrl, fileName: retryPayload.fileName };
            persistTaskTopicSlideSyncLink(retryPayload.fileUrl, {
                templateId: item.id,
                thumbnailUrl: item.imageUrl,
                templateTitle: item.title
            });
            persistCurrentTemplateCopyMap();
            updateCardAfterCopy(templateId, retryPayload);
            void markConnectedTaskItemDone(templateId, item.title).catch((warnError) => {
                console.warn("Could not update Task List completion after template copy.", warnError);
            });
            window.open(retryPayload.fileUrl, "_blank", "noopener");
        } catch (retryError) {
            if (button) { button.disabled = false; button.textContent = "Use Template"; }
            alert(`Could not copy template: ${retryError.message || "Unknown error"}`);
        }
    }
}

function updateCardAfterCopy(templateId, copyResult) {
    const card = document.querySelector(`[data-template-id="${CSS.escape(templateId)}"]`);
    if (!card) return;

    const actionsArea = card.querySelector(".template-card-actions");
    if (!actionsArea) return;

    const destination = getTemplateDestination();
    const existingLabel = copyResult.alreadyExists ? "Opened your existing copy." : `Saved to ${destination.folderName}.`;
    const deleteButtonHtml = canManageTemplates()
        ? `<button type="button" class="template-card-delete" data-delete-template="${escapeHtml(templateId)}">Delete</button>`
        : "";

    actionsArea.innerHTML = `
        <a class="template-card-open template-card-open-existing" href="${escapeHtml(copyResult.fileUrl)}" target="_blank" rel="noreferrer">Open Your Copy</a>
        ${deleteButtonHtml}
        <p class="template-card-copy-note">${escapeHtml(existingLabel)}</p>
    `;
}

async function handleDeleteTemplate(templateId, clickedButton) {
    if (!canManageTemplates()) return;

    const id = String(templateId || "").trim();
    if (!id) return;
    const entry = templateLibraryData.find((item) => String(item?.id || "") === id);
    const title = String(entry?.title || "this template");
    const confirmed = window.confirm(`Delete ${title} from the library?`);
    if (!confirmed) return;

    if (clickedButton) clickedButton.disabled = true;
    try {
        const response = await fetch(`/api/template-library/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: withLibraryAuthHeaders({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);

        const fromApi = normalizeTemplateLibraryEntries(payload?.entries);
        templateLibraryData = fromApi;
        delete driveState.copyMap[id];
        renderLibrary();
    } catch (error) {
        if (clickedButton) clickedButton.disabled = false;
        alert(`Could not delete template: ${error.message || "Unknown error"}`);
    }
}

async function handleMoveTemplateSection(templateId, clickedButton) {
    if (!canManageTemplates()) return;

    const id = String(templateId || "").trim();
    if (!id) return;
    const entry = templateLibraryData.find((item) => String(item?.id || "") === id);
    const currentSection = extractTemplateSectionName(entry);
    const nextSection = window.prompt(`Move "${entry?.title || "this template"}" to which section?`, currentSection || "");
    if (nextSection === null) return;

    const sectionName = String(nextSection || "").trim();
    if (clickedButton) clickedButton.disabled = true;
    try {
        const response = await fetch(`/api/template-library/${encodeURIComponent(id)}/section`, {
            method: "PATCH",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ sectionName })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);

        templateLibraryData = normalizeTemplateLibraryEntries(payload?.entries);
        renderLibrary();
    } catch (error) {
        alert(`Could not move template: ${error.message || "Unknown error"}`);
    } finally {
        if (clickedButton?.isConnected) clickedButton.disabled = false;
    }
}

function matchesExistingTemplateCopyFile(templateId, templateTitle, fileName, email) {
    const normalizeForMatching = (text) => String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ");
    const normalizedTitle = normalizeForMatching(templateTitle);
    const normalizedFileName = normalizeForMatching(fileName);

    if (String(templateId || "").trim() !== "tools-and-techniques") {
        return normalizedFileName.includes(normalizedTitle);
    }

    const emailUsername = String(email || "").trim().toLowerCase().split("@")[0];
    const firstName = emailUsername.split(/[._]/)[0] || "";
    const formattedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    return Boolean(formattedFirstName)
        && normalizedFileName === normalizeForMatching(`${templateTitle} - ${formattedFirstName}`);
}

function renderTemplateCard(item) {
    const title = String(item?.title || "Untitled Template").trim();
    const criteriaText = String(item?.criteriaText || "").trim();
    const summary = String(item?.summary || "").trim();
    const imageUrl = resolveTemplatePreviewUrl(item);
    const fileId = extractSlidesFileId(item?.templateUrl || "");
    const standards = Array.isArray(item?.standardCodes)
        ? item.standardCodes.map((code) => String(code || "").trim()).filter(Boolean)
        : [];
    const status = String(item?.status || "coming-soon").trim().toLowerCase() === "live" ? "live" : "coming-soon";
    const statusLabel = status === "live" ? "Live" : "Coming Soon";
    const canUse = status === "live" && Boolean(fileId);
    const imageAlt = `${title} preview`;
    const standardsLabel = standards.length ? standards.join(", ") : "Not set";
    
    // Use real-time files from the current course folder (no cached fallback).
    const destination = getTemplateDestination();
    let existingCopy = null;
    const matchingFile = driveState.resetTemplateIds[item.id]
        ? null
        : driveState.processAssessmentFiles.find((file) => {
        const isMatch = matchesExistingTemplateCopyFile(item.id, title, file?.name || "", getLibraryEmail());
        if (!isMatch) {
            console.debug(`No match for "${title}" in student file "${file?.name}".`);
        }
        return isMatch;
        });
    
    if (matchingFile) {
        console.debug(`Matched "${title}" to file "${matchingFile.name}"`);
        existingCopy = {
            fileUrl: matchingFile.webViewLink || `https://docs.google.com/presentation/d/${matchingFile.id}/edit`,
            fileName: matchingFile.name,
            fileId: matchingFile.id
        };
    }
    
    const deleteButtonHtml = canManageTemplates()
        ? `<button type="button" class="template-card-delete" data-delete-template="${escapeHtml(item.id)}">Delete</button>`
        : "";
    const moveButtonHtml = canManageTemplates()
        ? `<button type="button" class="template-card-delete" data-move-template="${escapeHtml(item.id)}">Move to Section</button>`
        : "";
    const resetButtonHtml = item.id
        ? `<button type="button" class="template-card-delete" data-reset-template-use="${escapeHtml(item.id)}">Reset Use</button>`
        : "";

    const actionHtml = !canUse
        ? `<button class="template-card-open" aria-disabled="true" disabled>${status === "live" ? "Template Link Needed" : "Template Coming Soon"}</button>${moveButtonHtml}`
        : existingCopy
            ? `<a class="template-card-open template-card-open-existing" href="${escapeHtml(existingCopy.fileUrl)}" target="_blank" rel="noreferrer">Open Your Copy</a>${resetButtonHtml}${moveButtonHtml}${deleteButtonHtml}<p class="template-card-copy-note">Saved to ${escapeHtml(destination.folderName)}.</p>`
            : `<button class="template-card-open" type="button" data-use-template="${escapeHtml(item.id)}">Use Template</button>${resetButtonHtml}${moveButtonHtml}${deleteButtonHtml}`;

    const previewClickHtml = canUse && !existingCopy
        ? `<button class="template-card-preview template-card-preview-button" type="button" data-use-template="${escapeHtml(item.id)}" aria-label="Use template: ${escapeHtml(title)}">`
        : existingCopy
            ? `<a class="template-card-preview" href="${escapeHtml(existingCopy.fileUrl)}" target="_blank" rel="noreferrer">`
            : `<span class="template-card-preview">`;
    const previewCloseHtml = canUse && !existingCopy ? `</button>` : existingCopy ? `</a>` : `</span>`;

    return `
        <article class="template-card" data-template-status="${escapeHtml(status)}" data-template-id="${escapeHtml(item.id)}">
            ${previewClickHtml}
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(TEMPLATE_PREVIEW_FALLBACK_URL)}';">
            ${previewCloseHtml}
            <div class="template-card-body">
                <h2>${canUse && !existingCopy
                    ? `<button class="template-card-title-link" type="button" data-use-template="${escapeHtml(item.id)}">${escapeHtml(title)}</button>`
                    : existingCopy
                        ? `<a class="template-card-title-link" href="${escapeHtml(existingCopy.fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
                        : escapeHtml(title)
                }</h2>
                <div class="template-card-meta">
                    <span class="template-card-standard">${escapeHtml(standardsLabel)}</span>
                    <span class="template-card-badge">${escapeHtml(statusLabel)}</span>
                </div>
                ${criteriaText ? `<p><strong>Assessment Criteria:</strong> ${escapeHtml(criteriaText)}</p>` : ""}
                ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
                <div class="template-card-actions">${actionHtml}</div>
            </div>
        </article>
    `;
}

function extractTemplateSectionName(item) {
    const templateId = String(item?.id || "").trim().toLowerCase();
    // An explicit admin override always wins so a moved template stops showing under its old section.
    const sectionOverride = String(item?.sectionName || "").trim();
    if (sectionOverride) {
        return sectionOverride;
    }
    if (templateId === "decomposition-tasks") {
        return "Project Management";
    }
    if (templateId === "development-steps") {
        return "Digital Outcome Details";
    }
    if (templateId === "relevant-implications") {
        return "Relevant Implications";
    }

    const summary = String(item?.summary || "").trim();
    const subfolderMatch = summary.match(/Synced\s+from\s+[^/]+\/(.+?)\.?$/i);
    if (subfolderMatch?.[1]) {
        return String(subfolderMatch[1]).trim();
    }

    const title = String(item?.title || "").trim();
    if (/decomposition\s+tasks?|project\s+management/i.test(title)) {
        return "Project Management";
    }
    if (/relevant\s+implications|development\s+steps/i.test(title)) {
        return "Relevant Implications";
    }

    return "Digital Outcome Details";
}

function buildTemplateSections(items) {
    const preferredOrder = ["Digital Outcome Details", "Relevant Implications", "Project Management"];
    const buckets = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const sectionName = extractTemplateSectionName(item);
        if (!buckets.has(sectionName)) {
            buckets.set(sectionName, []);
        }
        buckets.get(sectionName).push(item);
    });

    return Array.from(buckets.entries())
        .sort((left, right) => {
            const leftName = String(left?.[0] || "").trim();
            const rightName = String(right?.[0] || "").trim();
            const leftRank = preferredOrder.indexOf(leftName);
            const rightRank = preferredOrder.indexOf(rightName);
            const leftScore = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
            const rightScore = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;
            if (leftScore !== rightScore) return leftScore - rightScore;
            return leftName.localeCompare(rightName);
        })
        .map(([name, rows]) => ({ name, rows }));
}

function focusRequestedTemplateCard() {
    const requestedId = String(templateUsageContext.templateId || "").trim();
    if (!requestedId) return;

    const cards = Array.from(document.querySelectorAll(".template-card"));
    cards.forEach((card) => card.classList.remove("is-requested"));

    const target = document.querySelector(`[data-template-id="${CSS.escape(requestedId)}"]`);
    if (!target) return;

    target.classList.add("is-requested");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function normalizeTemplateSearchText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s*\((?:web|video|image)\)\s*$/i, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function matchesTemplateSearch(item, searchText) {
    const query = normalizeTemplateSearchText(searchText);
    if (!query) return true;

    return normalizeTemplateSearchText(item?.title).includes(query)
        || normalizeTemplateSearchText(item?.criteriaText).includes(query);
}

async function loadProcessAssessmentFiles() {
    try {
        // Request Google Drive token to access Process Assessment folder
        const tokenResponse = await requestDriveToken();
        if (tokenResponse.error) {
            console.warn("Could not get Drive token for Process Assessment file listing");
            driveState.processAssessmentFiles = [];
            return;
        }

        const response = await fetch("/api/student/drive-setup/list-process-assessment-slides", {
            method: "POST",
            headers: withLibraryAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ driveAccessToken: tokenResponse.access_token })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn("Could not load Process Assessment files:", response.status, errorText);
            driveState.processAssessmentFiles = [];
            return;
        }

        const data = await response.json();
        if (data?.ok && Array.isArray(data.slides)) {
            driveState.processAssessmentFiles = data.slides;
            driveState.processAssessmentFilesLoaded = true;
            console.log(`Loaded ${data.slides.length} files from Process Assessment folder:`, data.slides.map(f => f.name));
        } else {
            console.warn("Unexpected response format:", data);
            driveState.processAssessmentFiles = [];
        }
    } catch (error) {
        console.warn("Error loading Process Assessment files:", error);
        driveState.processAssessmentFiles = [];
    }
}

function renderLibrary() {
    const host = document.querySelector("#template-list");
    const searchStatus = document.querySelector("#template-search-status");
    if (!host) return;

    const destination = getTemplateDestination();
    if (getLibraryEmail() && driveState.setupResolved && !Boolean(driveState.setupState?.confirmed && destination.folderId)) {
        if (searchStatus) {
            searchStatus.textContent = "";
        }
        host.innerHTML = `<p class="template-empty">Set up your ${escapeHtml(destination.folderName)} folder first. Confirm the folder below to unlock the template library.</p>`;
        return;
    }

    templateLibraryData = Array.isArray(templateLibraryData) ? [...templateLibraryData].sort(compareTemplateEntries) : [];
    const normalizedQuery = normalizeTemplateSearchText(templateSearchQuery);
    const filteredTemplates = normalizedQuery
        ? templateLibraryData.filter((item) => matchesTemplateSearch(item, templateSearchQuery))
        : templateLibraryData;

    if (!Array.isArray(templateLibraryData) || !templateLibraryData.length) {
        if (searchStatus) {
            searchStatus.textContent = "";
        }
        host.innerHTML = '<p class="template-empty">No templates are listed yet.</p>';
        return;
    }

    if (searchStatus) {
        if (!normalizedQuery) {
            searchStatus.textContent = `Showing ${templateLibraryData.length} template${templateLibraryData.length === 1 ? "" : "s"}.`;
        } else {
            searchStatus.textContent = `Showing ${filteredTemplates.length} result${filteredTemplates.length === 1 ? "" : "s"} for "${templateSearchQuery}".`;
        }
    }

    if (!filteredTemplates.length) {
        host.innerHTML = `<p class="template-empty">No templates match "${escapeHtml(templateSearchQuery)}".</p>`;
        return;
    }

    const templateSections = buildTemplateSections(filteredTemplates);
    host.innerHTML = templateSections.map((section, index) => {
        const sectionNumber = index + 1;
        const sectionTitle = `Section ${sectionNumber}: ${section.name}`;
        const itemCount = Array.isArray(section?.rows) ? section.rows.length : 0;
        return `
            <details class="template-section" open>
                <summary class="template-section-summary">
                    <span class="template-section-title">${escapeHtml(sectionTitle)}</span>
                    <span class="template-section-count">${escapeHtml(String(itemCount))} template${itemCount === 1 ? "" : "s"}</span>
                </summary>
                <div class="template-section-list">
                    ${section.rows.map((item) => renderTemplateCard(item)).join("")}
                </div>
            </details>
        `;
    }).join("");
    focusRequestedTemplateCard();

    if (!libraryHandlersBound) {
        libraryHandlersBound = true;
        host.addEventListener("click", (event) => {
            const useButton = event.target.closest("[data-use-template]");
            if (useButton) {
                const templateId = useButton.getAttribute("data-use-template") || "";
                if (templateId) {
                    void handleUseTemplate(templateId);
                    return;
                }
            }

            const deleteButton = event.target.closest("[data-delete-template]");
            if (deleteButton) {
                const templateId = deleteButton.getAttribute("data-delete-template") || "";
                if (templateId) void handleDeleteTemplate(templateId, deleteButton);
                return;
            }

            const moveButton = event.target.closest("[data-move-template]");
            if (moveButton) {
                const templateId = moveButton.getAttribute("data-move-template") || "";
                if (templateId) void handleMoveTemplateSection(templateId, moveButton);
                return;
            }

            const resetButton = event.target.closest("[data-reset-template-use]");
            if (!resetButton) return;
            const templateId = resetButton.getAttribute("data-reset-template-use") || "";
            if (!templateId) return;
            resetButton.disabled = true;
            void resetStudentTemplateUse(templateId)
                .then(() => renderLibrary())
                .catch((error) => {
                    resetButton.disabled = false;
                    alert(`Could not reset template use: ${error.message || "Unknown error"}`);
                });
        });
    }
}

async function initLibrary() {
    libraryAccess = await loadLibraryAccess();
    applyLibraryRoleVisibility(libraryAccess);

    const syncButton = document.querySelector("#template-sync-button");
    if (syncButton && canManageTemplates()) {
        syncButton.addEventListener("click", () => {
            void handleSyncTemplateLibrary();
        });
    }

    await loadTemplateLibraryEntries();

    const searchInput = document.querySelector("#template-search-input");
    if (searchInput) {
        // Pre-populate search with topic name if coming from a Digital Outcome page
        if (templateUsageContext.preFilterTopic) {
            searchInput.value = templateUsageContext.preFilterTopic;
            templateSearchQuery = templateUsageContext.preFilterTopic;
        }
        
        searchInput.addEventListener("input", (event) => {
            templateSearchQuery = String(event?.target?.value || "").trim();
            renderLibrary();
        });
        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                searchInput.value = "";
                templateSearchQuery = "";
                renderLibrary();
            }
        });
    }

    renderLibrary();

    // Load persisted copy state early so cards can show Open Your Copy even before auth hydration settles.
    driveState.copyMap = readStoredTemplateCopyMap(String(templateUsageContext.activityId || "").trim(), getLibraryEmail());
    driveState.resetTemplateIds = readStoredTemplateResetIds(getLibraryEmail());
    renderLibrary();

    // Keep staff-only controls aligned with global auth mode toggles.
    window.setTimeout(() => { refreshStaffOnlyUi(); }, 250);
    window.setTimeout(() => { refreshStaffOnlyUi(); }, 1200);
    window.addEventListener("storage", () => { refreshStaffOnlyUi(); });
    window.addEventListener("focus", () => { refreshStaffOnlyUi(); });

    const staffLink = document.querySelector("#hub-staff-link");
    if (staffLink && typeof MutationObserver !== "undefined") {
        const modeObserver = new MutationObserver(() => { refreshStaffOnlyUi(); });
        modeObserver.observe(staffLink, { attributes: true, attributeFilter: ["href", "hidden"], childList: true, subtree: true });
    }

    const banner = document.querySelector("#template-setup-banner");
    if (banner) banner.hidden = true;

    const hydrateSignedInLibraryState = async () => {
        const email = getLibraryEmail();
        driveState.resetTemplateIds = readStoredTemplateResetIds(email);
        if (!email) {
            driveState.copyMap = readStoredTemplateCopyMap(String(templateUsageContext.activityId || "").trim(), "");
            renderLibrary();
            renderSetupBanner(null);
            return false;
        }

        const activityId = String(templateUsageContext.activityId || "").trim();
        if (activityId) {
            driveState.copyMap = readStoredTemplateCopyMap(activityId, email);
        }

        // Re-resolve role access once an email is available so page controls match sign-in state.
        libraryAccess = await loadLibraryAccess();
        applyLibraryRoleVisibility(libraryAccess);

        const setup = await loadDriveSetup();
        renderSetupBanner(setup);
        return true;
    };

    let hydrated = await hydrateSignedInLibraryState();
    if (!hydrated) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            hydrated = await hydrateSignedInLibraryState();
            if (hydrated) {
                break;
            }
        }
    }

    if (!hydrated) return;

    // Load real-time list of files in Process Assessment folder for status checking
    await loadProcessAssessmentFiles();
    renderLibrary();

    // Pre-initialize drive token client silently
    const waitForGoogle = (tries = 20) => {
        if (window.google?.accounts?.oauth2) {
            driveState.tokenClient = initDriveTokenClient();
            return;
        }
        if (tries > 0) setTimeout(() => waitForGoogle(tries - 1), 300);
    };
    waitForGoogle();
}

void initLibrary();
