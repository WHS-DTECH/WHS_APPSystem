const WORK_AUTH_KEY = "hub_google_auth_v1";
const trackerViewParams = new URLSearchParams(window.location.search || "");
if (trackerViewParams.get("embed") === "process") {
    document.body.classList.add("process-tracker-embed");
} else if (trackerViewParams.get("embed") === "digital-media") {
    document.body.classList.add("digital-media-tracker-embed");
} else if (trackerViewParams.get("embed") === "external") {
    document.body.classList.add("external-tracker-embed");
}
const DIGITAL_OUTCOME_DESCRIPTION_TASKS = [
    "Description - Google Slides: Describe the Digital Outcome: What is it, who is it for, and what should it do?",
    "Identify the target audience or end user for this outcome.",
    "Explain how the outcome will be developed.",
    "State how success will be measured or evaluated.",
    "What Tools and Techniques will be used?"
];
const PROCESS_ASSESSMENT_ACTIVITY_ID = "49";
const DIGITAL_MEDIA_TRACKER_CRITERIA = {
    "91893": [
        "Achieved: Using appropriate tools and techniques for the purpose and end users.",
        "Achieved: Applying appropriate data integrity and testing procedures.",
        "Achieved: Using relevant conventions for the media type.",
        "Achieved: Explaining relevant implications.",
        "Merit: Using information from testing procedures to improve the quality of the outcome.",
        "Merit: Applying relevant conventions to improve the quality of the outcome.",
        "Merit: Addressing relevant implications.",
        "Excellence: Iterative improvement throughout the design, development and testing process to produce a high-quality outcome.",
        "Excellence: Using efficient tools and techniques in the outcome's production."
    ],
    "91903": [
        "Achieved: Applying appropriate tools and techniques to meet the purpose and end-user requirements.",
        "Achieved: Applying appropriate data integrity and testing procedures.",
        "Achieved: Applying user experience principles relevant to the purpose of the outcome.",
        "Achieved: Addressing relevant implications.",
        "Merit: Using information from testing procedures to improve the quality of the digital media outcome.",
        "Merit: Applying user experience principles to improve the quality of the digital media outcome.",
        "Excellence: Iterative improvement throughout the design, development and testing process to produce a high-quality outcome.",
        "Excellence: Using efficient tools and techniques in the outcome's production."
    ]
};

const workState = {
    email: "",
    activitiesById: new Map(),
    interestRows: [],
    studentNameByEmail: new Map(),
    records: [],
    selectedTask: "",
    studentSearch: "",
    standardSearch: "",
    expandedSummaryStudent: "",
    expandedSummaryGroup: "",
    digitalMediaStudentSearch: "",
    digitalMediaStandardSearch: "",
    commentStudentSearch: "",
    studentTrackerEmailStatus: new Map(),
    externalAssessmentAllocations: new Map(),
    externalAssessmentStudents: [],
    externalAssignedOnly: true,
    externalStandardFilter: "",
    expandedDigitalMediaStudent: "",
    expandedDigitalMediaGroup: "",
    studentTrackerComments: new Map()
};

const statusHost = document.querySelector("#work-status");
const taskLinkGrid = document.querySelector("#task-link-grid");
const trackerTitle = document.querySelector("#tracker-title");
const trackerSummary = document.querySelector("#tracker-summary");
const tableHost = document.querySelector("#work-table-host");
const studentSearchInput = document.querySelector("#student-search-input");
const standardSearchInput = document.querySelector("#standard-search-input");
const generateIndividualSummaryButton = document.querySelector("#generate-individual-summary-button");
const generateStandardSummariesButton = document.querySelector("#generate-standard-summaries-button");
const digitalMediaStudentSearchInput = document.querySelector("#digital-media-student-search-input");
const digitalMediaStandardSearchInput = document.querySelector("#digital-media-standard-search-input");
const generateDigitalMediaIndividualButton = document.querySelector("#generate-digital-media-individual-button");
const generateDigitalMediaStandardButton = document.querySelector("#generate-digital-media-standard-button");
const externalAssessmentGrid = document.querySelector("#external-assessment-grid");
const externalAssessmentStatus = document.querySelector("#external-assessment-status");
const externalAssignedOnlyFilter = document.querySelector("#external-assigned-only-filter");
const externalStandardFilter = document.querySelector("#external-standard-filter");
const taskPageNav = document.querySelector("#task-page-nav");
const taskPrevButton = document.querySelector("#task-prev-button");
const taskNextButton = document.querySelector("#task-next-button");
const taskCurrentLabel = document.querySelector("#task-current-label");
const studentTrackerCommentsGrid = document.querySelector("#student-tracker-comments-grid");
const printStudentCommentsButton = document.querySelector("#print-student-comments-button");
const exportStudentCommentsButton = document.querySelector("#export-student-comments-button");
const commentStudentSearchInput = document.querySelector("#comment-student-search-input");

function isTaskDetailPage() {
    const path = String(window.location.pathname || "").toLowerCase();
    return path.endsWith("/teacher-student-work-task.html");
}

function setStatus(message, isError = false) {
    if (!statusHost) return;
    statusHost.textContent = String(message || "");
    statusHost.classList.toggle("is-error", Boolean(isError));
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function compactLabel(value, maxLength = 24) {
    const text = String(value || "").trim();
    const limit = Number.isFinite(Number(maxLength)) ? Math.max(8, Math.round(Number(maxLength))) : 24;
    if (!text) return "";
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(1, limit - 1)).trim()}...`;
}

function buildChipLink(url, label) {
    const safeUrl = String(url || "").trim();
    const fullLabel = String(label || "Link").trim() || "Link";
    const shortLabel = compactLabel(fullLabel);
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(fullLabel)}">${escapeHtml(shortLabel)}</a>`;
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function formatNameFromEmail(email) {
    const localPart = String(email || "").trim().toLowerCase().split("@")[0] || "";
    const parts = localPart
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        return String(email || "").trim();
    }

    return parts
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function buildStudentNameMap(students) {
    const map = new Map();
    const rows = Array.isArray(students) ? students : [];

    rows.forEach((student) => {
        const studentName = String(student?.student_name || student?.full_name || student?.name || "").trim();
        const linkedEmails = Array.isArray(student?.linked_emails) ? student.linked_emails : [];

        linkedEmails
            .map((email) => normalizeEmail(email))
            .filter(Boolean)
            .forEach((email) => {
                if (studentName) {
                    map.set(email, studentName);
                    return;
                }
                if (!map.has(email)) {
                    map.set(email, formatNameFromEmail(email));
                }
            });
    });

    return map;
}

function readStoredAuthRaw() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(WORK_AUTH_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(WORK_AUTH_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    return localValue || sessionValue;
}

function readStoredEmail() {
    const raw = readStoredAuthRaw();
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        return normalizeEmail(parsed?.profile?.email || "");
    } catch (_error) {
        return "";
    }
}

function readStoredAccessToken() {
    const raw = readStoredAuthRaw();
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

function withAuthHeaders(headers = {}) {
    if (!workState.email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": workState.email };
    const accessToken = readStoredAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    const raw = String(value || "").trim();
    if (!raw) return [];

    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("\"") && raw.endsWith("\""))) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item || "").trim()).filter(Boolean);
            }
        } catch (_error) {
        }
    }

    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeTaskTopicRows(value) {
    const rows = toArray(value);
    const bulletSplitRegex = /[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/;
    const expanded = rows
        .flatMap((line) => {
            const text = String(line || "").trim();
            if (!text) return [];

            if (!bulletSplitRegex.test(text)) {
                return [text];
            }

            const parts = text
                .split(bulletSplitRegex)
                .map((segment) => String(segment || "").trim())
                .filter(Boolean);

            if (!parts.length) return [];
            const startsWithBullet = /^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/.test(text);
            return startsWithBullet ? parts : parts.slice(1);
        })
        .map((row) => row.replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "").replace(/^[\-*]\s*/, "").trim())
        .filter(Boolean);

    const seen = new Set();
    const unique = [];
    expanded.forEach((row) => {
        const key = row.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(row);
    });

    return unique;
}

function extractPrimaryStandardNumber(activity) {
    const rows = toArray(activity?.standard_details || activity?.standardDetails || activity?.assessment_focus || activity?.assessmentFocus);
    for (const row of rows) {
        const match = String(row || "").match(/\b\d{4,6}\b/);
        if (match?.[0]) {
            return match[0];
        }
    }
    return "task-topic";
}

function extractStandardNumbers(activity) {
    const rows = toArray(activity?.standard_details || activity?.standardDetails || activity?.assessment_focus || activity?.assessmentFocus);
    const seen = new Set();
    const output = [];

    rows.forEach((row) => {
        const matches = String(row || "").match(/\b\d{4,6}\b/g) || [];
        matches.forEach((match) => {
            const key = String(match || "").trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            output.push(key);
        });
    });

    const primary = extractPrimaryStandardNumber(activity);
    if (primary && !seen.has(primary)) {
        output.unshift(primary);
    }

    return output;
}

function normalizeTrackerStandardValue(value) {
    const match = String(value || "").match(/\b\d{4,6}\b/);
    return match?.[0] || "";
}

function mergeTrackerStandardNumbers(...sources) {
    const seen = new Set();
    const output = [];
    sources.flat().forEach((value) => {
        const standard = normalizeTrackerStandardValue(value);
        if (!standard || seen.has(standard)) return;
        seen.add(standard);
        output.push(standard);
    });
    return output;
}

function normalizeTaskTopicText(value) {
    return String(value || "")
        .replace(/[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripTaskTopicLevel(value) {
    return normalizeTaskTopicText(value).replace(/^(Achieved|Merit|Excellence):\s*/i, "").trim();
}

function findAcknowledgedChecklistStep(evidenceRows, taskTopic, standardNumbers) {
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    const topicKey = stripTaskTopicLevel(taskTopic).toLowerCase();
    if (!topicKey) return null;

    const candidateStandards = ["digital-outcome", ...(Array.isArray(standardNumbers) ? standardNumbers : [])]
        .map((standard) => String(standard || "").trim())
        .filter(Boolean);

    for (const standard of candidateStandards) {
        const row = rows.find((item) => String(item?.standard || "").trim() === standard);
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        const step = steps.find((item) => stripTaskTopicLevel(item?.text).toLowerCase() === topicKey);
        if (step) {
            return { done: Boolean(step.done), standardKey: standard };
        }
    }

    return null;
}

function getTaskTopicGroup(topic) {
    const text = normalizeTaskTopicText(topic).toLowerCase();

    if (!text) return "other";

    if (text.startsWith("achieved:")) return "achieved";
    if (text.startsWith("merit:")) return "merit";
    if (text.startsWith("excellence:")) return "excellence";

    if (
        /describe\s+the\s+digital\s+outcome|description\s*-\s*google\s+slides|target\s+audience|success\s+will\s+be\s+measured|outcome\s+will\s+be\s+developed|what\s+tools\s+and\s+techniques\s+will\s+be\s+used/.test(text)
    ) {
        return "digital_outcome";
    }

    if (
        /effectively\s+using\s+project\s+management|trialling\s+multiple\s+components|using\s+information\s+appropriately\s+from\s+testing|addressing\s+relevant\s+implications/.test(text)
    ) {
        return "merit";
    }

    if (/discussing\s+how\s+the\s+information\s+from\s+planning|high-\s*quality\s+outcome/.test(text)) {
        return "excellence";
    }

    if (
        /using\s+appropriate\s+project\s+management|decompos|key\s+features\s+or\s+requirements|trialling\s+the\s+components|testing\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions|explaining\s+relevant\s+implications/.test(text)
    ) {
        return "achieved";
    }

    return "other";
}

function getTaskTopicSubRank(topic, group) {
    const text = normalizeTaskTopicText(topic).toLowerCase();

    const orderMaps = {
        digital_outcome: [
            /description\s*-\s*google\s+slides|describe\s+the\s+digital\s+outcome/,
            /identify\s+the\s+target\s+audience/,
            /explain\s+how\s+the\s+outcome\s+will\s+be\s+developed/,
            /state\s+how\s+success\s+will\s+be\s+measured/,
            /what\s+tools\s+and\s+techniques\s+will\s+be\s+used/
        ],
        achieved: [
            /using\s+appropriate\s+project\s+management/,
            /decompos/,
            /key\s+features\s+or\s+requirements/,
            /trialling\s+the\s+components/,
            /testing\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/,
            /explaining\s+relevant\s+implications/
        ],
        merit: [
            /effectively\s+using\s+project\s+management/,
            /trialling\s+multiple\s+components/,
            /using\s+information\s+appropriately\s+from\s+testing/,
            /addressing\s+relevant\s+implications/
        ],
        excellence: [
            /discussing\s+how\s+the\s+information\s+from\s+planning/
        ]
    };

    const patterns = orderMaps[group] || [];
    const index = patterns.findIndex((pattern) => pattern.test(text));
    return index >= 0 ? index + 1 : 999;
}

function compareTaskTopics(leftTopic, rightTopic) {
    const groupOrder = {
        digital_outcome: 1,
        achieved: 2,
        merit: 3,
        excellence: 4,
        other: 5
    };

    const leftGroup = getTaskTopicGroup(leftTopic);
    const rightGroup = getTaskTopicGroup(rightTopic);
    const leftGroupRank = groupOrder[leftGroup] || 99;
    const rightGroupRank = groupOrder[rightGroup] || 99;

    if (leftGroupRank !== rightGroupRank) {
        return leftGroupRank - rightGroupRank;
    }

    const leftSub = getTaskTopicSubRank(leftTopic, leftGroup);
    const rightSub = getTaskTopicSubRank(rightTopic, rightGroup);
    if (leftSub !== rightSub) {
        return leftSub - rightSub;
    }

    return String(leftTopic || "").localeCompare(String(rightTopic || ""));
}

function buildTaskTopicSubmissionStandardKey(taskTopicTitle, standardNumber = "") {
    const topicSlug = normalizeTaskTopicText(taskTopicTitle)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const standardSlug = String(standardNumber || "task-topic")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return `task-topic:${standardSlug || "task-topic"}:${topicSlug || "topic"}`;
}

function toSafeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
        const parsed = new URL(raw);
        return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : "";
    } catch (_error) {
        return "";
    }
}

function parseTaskTopicEvidence(evidenceRows, standardKey) {
    const sourceRows = Array.isArray(evidenceRows) ? evidenceRows : [];
    const row = sourceRows.find((item) => String(item?.standard || "").trim() === standardKey);
    const result = {
        googleSlidesUrl: "",
        submittedAt: "",
        submitted: false,
        links: []
    };

    if (!row || !Array.isArray(row.steps)) {
        return result;
    }

    const pushLink = (label, url) => {
        const safe = toSafeExternalUrl(url);
        if (!safe) return;
        if (result.links.some((item) => item.url === safe)) return;
        result.links.push({ label, url: safe });
    };

    row.steps.forEach((step) => {
        const text = String(step?.text || "").trim();
        if (!text) return;

        if (text.startsWith("GOOGLE_SLIDES_URL|")) {
            const slidesUrl = toSafeExternalUrl(text.slice("GOOGLE_SLIDES_URL|".length).trim());
            if (slidesUrl) {
                result.googleSlidesUrl = slidesUrl;
                pushLink("Google Slides", slidesUrl);
            }
            return;
        }

        if (text.startsWith("LINK|")) {
            const link = toSafeExternalUrl(text.slice("LINK|".length).trim());
            if (/docs\.google\.com\/presentation/i.test(link) && !result.googleSlidesUrl) {
                result.googleSlidesUrl = link;
            }
            if (link) {
                if (/trello\.com/i.test(link)) {
                    pushLink("Trello", link);
                } else if (/(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(link)) {
                    pushLink("OneDrive", link);
                } else if (/drive\.google\.com/i.test(link)) {
                    pushLink("Google Drive", link);
                } else {
                    pushLink("Evidence Link", link);
                }
            }
            return;
        }

        if (text.startsWith("TRELLO_CARD_URL|")) {
            pushLink("Trello", text.slice("TRELLO_CARD_URL|".length).trim());
            return;
        }

        if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
            pushLink("OneDrive", text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
            pushLink("Google Drive", text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
            pushLink("Asset Folder", text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("HAPARA_SUBMITTED_AT|")) {
            result.submittedAt = text.slice("HAPARA_SUBMITTED_AT|".length).trim();
            result.submitted = Boolean(result.submittedAt);
            return;
        }

        if (text.startsWith("SUBMITTED_AT|")) {
            if (!result.submittedAt) {
                result.submittedAt = text.slice("SUBMITTED_AT|".length).trim();
            }
            if (result.submittedAt) {
                result.submitted = true;
            }
            return;
        }

        if (text.startsWith("HAPARA_ACK|")) {
            const value = text.slice("HAPARA_ACK|".length).trim().toLowerCase();
            if (value === "true" || value === "1" || value === "yes") {
                result.submitted = true;
            }
        }
    });

    return result;
}

function inferGlobalWorkLinksFromEvidenceRows(evidenceRows) {
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    const links = [];
    const seen = new Set();

    const pushLink = (label, url) => {
        const safeUrl = toSafeExternalUrl(url);
        if (!safeUrl || seen.has(safeUrl)) return;
        seen.add(safeUrl);
        links.push({ label, url: safeUrl });
    };

    rows.forEach((row) => {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        steps.forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) return;

            if (text.startsWith("TRELLO_CARD_URL|")) {
                pushLink("Trello", text.slice("TRELLO_CARD_URL|".length).trim());
                return;
            }

            if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
                pushLink("OneDrive", text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim());
                return;
            }

            if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
                pushLink("Google Drive", text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim());
                return;
            }

            if (text.startsWith("GITHUB_REPO_URL|")) {
                pushLink("GitHub", text.slice("GITHUB_REPO_URL|".length).trim());
                return;
            }

            if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
                pushLink("Asset Folder", text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim());
                return;
            }

            if (text.startsWith("LINK|")) {
                const rawLink = text.slice("LINK|".length).trim();
                if (/trello\.com/i.test(rawLink)) {
                    pushLink("Trello", rawLink);
                    return;
                }
                if (/(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(rawLink)) {
                    pushLink("OneDrive", rawLink);
                    return;
                }
                if (/drive\.google\.com/i.test(rawLink)) {
                    pushLink("Google Drive", rawLink);
                    return;
                }
                if (/(github\.com|gist\.github\.com|raw\.githubusercontent\.com)/i.test(rawLink)) {
                    pushLink("GitHub", rawLink);
                    return;
                }
            }

            if (/trello\.com/i.test(text)) {
                const match = text.match(/https?:\/\/[^\s)]+/i);
                if (match?.[0]) {
                    pushLink("Trello", match[0]);
                    return;
                }
            }

            if (/(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(text)) {
                const match = text.match(/https?:\/\/[^\s)]+/i);
                if (match?.[0]) {
                    pushLink("OneDrive", match[0]);
                }
                return;
            }

            if (/drive\.google\.com/i.test(text)) {
                const match = text.match(/https?:\/\/[^\s)]+/i);
                if (match?.[0]) {
                    pushLink("Google Drive", match[0]);
                }
                return;
            }

            if (/(github\.com|gist\.github\.com|raw\.githubusercontent\.com)/i.test(text)) {
                const match = text.match(/https?:\/\/[^\s)]+/i);
                if (match?.[0]) {
                    pushLink("GitHub", match[0]);
                }
            }
        });
    });

    return links;
}

function hasProjectManagementEvidenceCompletion(evidenceRows) {
    const links = inferGlobalWorkLinksFromEvidenceRows(evidenceRows);
    const systems = new Set(links.map((link) => String(link?.label || "").trim().toLowerCase()));
    const hasTrello = systems.has("trello");
    const hasOtherSystem = systems.has("github") || systems.has("onedrive") || systems.has("google drive");
    return hasTrello && hasOtherSystem;
}

function hasEvidenceStepMatching(evidenceRows, pattern) {
    return (Array.isArray(evidenceRows) ? evidenceRows : []).some((row) =>
        (Array.isArray(row?.steps) ? row.steps : []).some((step) => pattern.test(String(step?.text || "")))
    );
}

function hasPersistedDigiMedState(evidenceRows, stateKinds) {
    const kinds = Array.isArray(stateKinds) ? stateKinds : [stateKinds];
    const kindPattern = kinds.map((kind) => String(kind || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean).join("|");
    return Boolean(kindPattern) && hasEvidenceStepMatching(evidenceRows, new RegExp(`^DIGIMED_STATE\\|(?:${kindPattern})\\|.+\\|true$`, "i"));
}

function hasDigitalMediaCriterionEvidence(taskTopic, evidenceRows) {
    const text = stripTaskTopicLevel(taskTopic).toLowerCase();
    if (/tools and techniques/.test(text) && !/efficient/.test(text)) {
        return getDigiMedToolsTechniquesEvidenceCount(evidenceRows) > 0;
    }
    if (/conventions/.test(text)) {
        return hasEvidenceStepMatching(evidenceRows, /^CONVENTION_ACK\|.+\|true$/i)
            || hasPersistedDigiMedState(evidenceRows, ["conventions", "image-conventions", "video-conventions"]);
    }
    if (/user experience principles/.test(text)) {
        return hasEvidenceStepMatching(evidenceRows, /^UX_PRINCIPLE_ACK\|.+\|true$/i)
            || hasPersistedDigiMedState(evidenceRows, ["ux-principles", "video-ux"]);
    }
    if (/data integrity and testing/.test(text)) return hasPersistedDigiMedState(evidenceRows, ["image-integrity", "video-integrity"]);
    if (/using information from testing procedures/.test(text)) {
        return hasEvidenceStepMatching(evidenceRows, /^TESTING_FUNCTIONS_COUNT\|(?:[1-9]\d*)\|\d+$/)
            || hasEvidenceStepMatching(evidenceRows, /^TESTING_FUNCTIONS_COUNT\|\d+\|(?:[1-9]\d*)$/);
    }
    return false;
}

function getDigiMedToolsTechniquesEvidenceCount(evidenceRows) {
    const labels = new Set();
    (Array.isArray(evidenceRows) ? evidenceRows : []).forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const match = String(step?.text || "").match(/^DIGIMED_TOOLS_TECHNIQUES_ACK\|(.+)\|true$/i);
            if (match?.[1]) labels.add(match[1].trim());
        });
    });
    return labels.size;
}

function getFirstGoogleDriveFolderUrlFromEvidenceRows(evidenceRows) {
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    for (const row of rows) {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        for (const step of steps) {
            const text = String(step?.text || "").trim();
            if (!text) continue;

            let candidate = "";
            if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
                candidate = text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim();
            } else if (text.startsWith("LINK|") && /drive\.google\.com/i.test(text)) {
                candidate = text.slice("LINK|".length).trim();
            }

            const safeUrl = toSafeExternalUrl(candidate);
            if (safeUrl && /drive\.google\.com/i.test(safeUrl)) {
                return safeUrl;
            }
        }
    }

    return "";
}

function getProcessFolderUrlFromTemplateCopies(templateCopies) {
    const copies = Array.isArray(templateCopies) ? templateCopies : [];
    for (const copy of copies) {
        const candidate = toSafeExternalUrl(copy?.processAssessmentFolderUrl || copy?.process_assessment_folder_url || "")
            || toSafeExternalUrl(copy?.destinationFolderUrl || copy?.destination_folder_url || "");
        if (candidate && /drive\.google\.com/i.test(candidate)) {
            return candidate;
        }
    }
    return "";
}

function getDigitalOutcomeTemplateId(taskTopic) {
    const text = normalizeTaskTopicText(taskTopic).toLowerCase();
    if (/description\s*-\s*google\s*slides|describe\s+the\s+digital\s+outcome/.test(text)) return "digital-outcome-description";
    if (/identify\s+the\s+target\s+audience|target\s+audience|end\s+user/.test(text)) return "target-audience";
    if (/explain\s+how\s+the\s+outcome\s+will\s+be\s+developed|development\s+steps/.test(text)) return "development-steps";
    if (/success\s+criteria|success\s+will\s+be\s+measured|success\s+will\s+be\s+evaluated/.test(text)) return "project-success-criteria";
    if (/what\s+tools\s+and\s+techniques\s+will\s+be\s+used/.test(text)) return "tools-and-techniques";
    return "";
}

function hasTemplateCopyForDigitalOutcomeTask(templateCopies, taskTopic) {
    const templateId = getDigitalOutcomeTemplateId(taskTopic);
    if (!templateId) return false;
    return (Array.isArray(templateCopies) ? templateCopies : [])
        .some((copy) => String(copy?.templateId || copy?.template_id || "").trim().toLowerCase() === templateId);
}

function hasTaskTopicEvidence(result) {
    if (!result || typeof result !== "object") return false;
    return Boolean(
        result.googleSlidesUrl ||
        result.submitted ||
        result.submittedAt ||
        (Array.isArray(result.links) && result.links.length)
    );
}

function parseTaskTopicEvidenceForActivity(evidenceRows, taskTopic, standardNumbers) {
    const standards = Array.isArray(standardNumbers) ? standardNumbers : [];
    const candidateKeys = [];

    standards.forEach((standardNumber) => {
        const key = buildTaskTopicSubmissionStandardKey(taskTopic, standardNumber);
        if (key && !candidateKeys.includes(key)) {
            candidateKeys.push(key);
        }
    });

    const fallbackKey = buildTaskTopicSubmissionStandardKey(taskTopic, "");
    if (fallbackKey && !candidateKeys.includes(fallbackKey)) {
        candidateKeys.push(fallbackKey);
    }

    for (const standardKey of candidateKeys) {
        const parsed = parseTaskTopicEvidence(evidenceRows, standardKey);
        if (hasTaskTopicEvidence(parsed)) {
            return { evidence: parsed, matchedStandardKey: standardKey };
        }
    }

    const topicSlug = normalizeTaskTopicText(taskTopic)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    const wildcardRow = rows.find((row) => {
        const standard = String(row?.standard || "").trim().toLowerCase();
        return standard.startsWith("task-topic:") && standard.endsWith(`:${topicSlug}`);
    });

    if (wildcardRow) {
        const wildcardKey = String(wildcardRow.standard || "").trim();
        const parsed = parseTaskTopicEvidence(evidenceRows, wildcardKey);
        return { evidence: parsed, matchedStandardKey: wildcardKey };
    }

    return {
        evidence: parseTaskTopicEvidence(evidenceRows, candidateKeys[0] || fallbackKey || ""),
        matchedStandardKey: candidateKeys[0] || fallbackKey || ""
    };
}

function formatSubmissionTimestamp(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Request failed (${response.status})`);
    }

    return response.json().catch(() => ({}));
}

async function enforceAccess() {
    workState.email = readStoredEmail();
    if (!workState.email) {
        window.location.replace("teacher-view.html");
        return false;
    }

    const access = await fetchJson(`/api/auth/user-access?email=${encodeURIComponent(workState.email)}`, {
        headers: withAuthHeaders()
    });

    if (!access?.can_teacher_view) {
        window.location.replace("teacher-view.html");
        return false;
    }

    return true;
}

function buildAllRecords() {
    const records = [];
    workState.interestRows.forEach((interest) => {
        const activityId = String(interest?.project_id || "").trim();
        const activity = workState.activitiesById.get(activityId);
        if (!activity) return;

        const category = String(activity?.activity_category || "").toLowerCase();
        if (!category.includes("assessment")) return;

        const taskTopics = DIGITAL_OUTCOME_DESCRIPTION_TASKS
            .concat(
                normalizeTaskTopicRows(activity?.tasks_list || activity?.tasksList)
            )
            .concat(
                normalizeTaskTopicRows(activity?.achieved || []),
                normalizeTaskTopicRows(activity?.merit || []),
                normalizeTaskTopicRows(activity?.excellence || [])
            );

        const uniqueTopicKeys = new Set();
        const uniqueTopics = [];
        taskTopics.forEach((topic) => {
            const key = normalizeTaskTopicText(topic).toLowerCase();
            if (!key || uniqueTopicKeys.has(key)) return;
            uniqueTopicKeys.add(key);
            uniqueTopics.push(topic);
        });

        if (!uniqueTopics.length) return;

        const activityStandardNumbers = extractStandardNumbers(activity);
        const isProcessAssessmentActivity = /process\s+assessment/i.test(String(activity?.name || ""));
        const students = Array.isArray(interest?.students) ? interest.students : [];

        students.forEach((student) => {
            const studentEmail = normalizeEmail(student?.email || student?.student_email || "");
            if (!studentEmail) return;

            const processStandard = normalizeTrackerStandardValue(student?.standard_1);
            const projectTaskStandard = normalizeTrackerStandardValue(student?.standard_2);
            const digitalMediaType = String(student?.digital_media_type || student?.digitalMediaType || "").trim();
            const standardNumbers = mergeTrackerStandardNumbers(processStandard, projectTaskStandard, activityStandardNumbers);
            const standardCriteria = !isProcessAssessmentActivity && Array.isArray(DIGITAL_MEDIA_TRACKER_CRITERIA[projectTaskStandard])
                ? DIGITAL_MEDIA_TRACKER_CRITERIA[projectTaskStandard]
                : [];
            const studentTaskTopics = Array.from(new Map(
                [...uniqueTopics, ...standardCriteria]
                    .map((topic) => [stripTaskTopicLevel(topic).toLowerCase(), topic])
            ).values());

            const evidenceRows = Array.isArray(student?.evidence_steps) ? student.evidence_steps : [];
            const processFolderUrl = toSafeExternalUrl(student?.process_assessment_folder_url || student?.processAssessmentFolderUrl || "")
                || getProcessFolderUrlFromTemplateCopies(student?.template_copies || student?.templateCopies)
                || getFirstGoogleDriveFolderUrlFromEvidenceRows(evidenceRows);
            studentTaskTopics.forEach((taskTopic) => {
                const topicKey = normalizeTaskTopicText(taskTopic).toLowerCase();
                const resolved = parseTaskTopicEvidenceForActivity(evidenceRows, taskTopic, standardNumbers);
                const evidence = resolved.evidence;
                const checklistStep = findAcknowledgedChecklistStep(evidenceRows, taskTopic, standardNumbers);
                const isProjectManagementTopic = topicKey.includes("project management");
                const isVersionControlTopic = topicKey.includes("version control") || topicKey.includes("asset management");
                const projectManagementComplete = isProjectManagementTopic && hasProjectManagementEvidenceCompletion(evidenceRows);
                const digitalOutcomeTemplateComplete = getTaskTopicGroup(taskTopic) === "digital_outcome"
                    && hasTemplateCopyForDigitalOutcomeTask(student?.template_copies || student?.templateCopies, taskTopic);
                const digitalMediaEvidenceLinked = hasDigitalMediaCriterionEvidence(taskTopic, evidenceRows);
                const advancedToolsCount = getDigiMedToolsTechniquesEvidenceCount(evidenceRows);
                const efficientTools = Array.isArray(student?.efficient_tools) ? student.efficient_tools : [];
                const isAdvancedToolsCriterion = /(?:using|applying) appropriate tools and techniques/.test(stripTaskTopicLevel(taskTopic).toLowerCase());
                const isEfficientToolsCriterion = /using efficient tools and techniques/.test(stripTaskTopicLevel(taskTopic).toLowerCase());
                const digitalMediaSubtaskComplete = (isAdvancedToolsCriterion && advancedToolsCount >= 3)
                    || (isEfficientToolsCriterion && efficientTools.length >= 3);

                const mergedLinks = [];
                const seenMergedLink = new Set();
                const addMergedLink = (link) => {
                    const url = toSafeExternalUrl(link?.url);
                    const label = String(link?.label || "Link").trim() || "Link";
                    if (!url || seenMergedLink.has(url)) return;
                    seenMergedLink.add(url);
                    mergedLinks.push({ label, url });
                };

                (Array.isArray(evidence.links) ? evidence.links : []).forEach(addMergedLink);
                if (isProjectManagementTopic || isVersionControlTopic) {
                    inferGlobalWorkLinksFromEvidenceRows(evidenceRows).forEach(addMergedLink);
                }

                records.push({
                    taskTopic,
                    topicKey,
                    activityId,
                    activityName: String(activity?.name || "Assessment Task").trim(),
                    studentEmail,
                    studentName: String(workState.studentNameByEmail.get(studentEmail) || formatNameFromEmail(studentEmail) || studentEmail).trim(),
                    standardKey: String(checklistStep?.standardKey || resolved.matchedStandardKey || "").trim(),
                    processStandard,
                    projectTaskStandard,
                    digitalMediaType,
                    processFolderUrl,
                    googleSlidesUrl: evidence.googleSlidesUrl,
                    links: mergedLinks,
                    evidenceLinked: Boolean(evidence.googleSlidesUrl || mergedLinks.length || digitalMediaEvidenceLinked || (isEfficientToolsCriterion && efficientTools.length)),
                    submitted: Boolean(evidence.submitted),
                    // Task List is the completion authority. Other evidence remains visible to teachers,
                    // but must not independently increase the Student Work Tracker completion totals.
                    acknowledged: Boolean(checklistStep?.done),
                    submittedAt: evidence.submittedAt,
                    taskUrl: new URL(`ProjectPages/custom-activity.html?id=${encodeURIComponent(activityId)}&taskTopic=${encodeURIComponent(taskTopic)}`, window.location.href).toString()
                });
            });
        });
    });

    return records;
}

function getOrderedTaskTopics() {
    const seen = new Set();
    const topics = [];

    workState.records.forEach((record) => {
        const key = String(record?.topicKey || "").trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        topics.push(String(record?.taskTopic || "").trim());
    });

    return topics.sort((a, b) => compareTaskTopics(a, b));
}

const STUDENT_SUMMARY_GROUPS = [
    { key: "overall", label: "Overall" },
    { key: "digital_outcome", label: "Digital Outcome" },
    { key: "achieved", label: "Achieved" },
    { key: "merit", label: "Merit" },
    { key: "excellence", label: "Excellence" }
];

function getStudentSummaryStandardNumber(record) {
    const allocatedStandard = normalizeTrackerStandardValue(record?.processStandard);
    if (allocatedStandard) return allocatedStandard;

    const directStandard = String(record?.standardKey || "").trim();
    if (/^\d{4,6}$/.test(directStandard)) return directStandard;
    if (directStandard === "digital-outcome") return "Digital Outcome";

    const keyMatch = String(record?.standardKey || "").match(/task-topic:(\d{4,6})/i);
    if (keyMatch?.[1]) return keyMatch[1];

    const activity = workState.activitiesById.get(String(record?.activityId || "").trim());
    const primary = extractPrimaryStandardNumber(activity || {});
    return /^\d{4,6}$/.test(primary) ? primary : "Digital Outcome";
}

function getStudentSummarySectionLabel(record) {
    const standard = getStudentSummaryStandardNumber(record);
    const group = getTaskTopicGroup(record?.taskTopic);
    const topic = normalizeTaskTopicText(record?.taskTopic).toLowerCase();

    if (group === "digital_outcome") return "Digital Outcome Topic";

    if (standard === "91897" || standard === "91907") {
        if (group === "achieved") {
            if (/project\s+management|decompos|key\s+features|requirements/.test(topic)) {
                return "Section 1: Project Management & Decomposition";
            }
            if (/trial|test/.test(topic)) {
                return "Section 2: Testing & Trialing";
            }
            if (/relevant\s+implications/.test(topic)) {
                return "Section 3: Relevant Implications";
            }
        }
        if (group === "merit") return "Merit";
        if (group === "excellence") return "Excellence";
    }

    if (standard === "91893" || standard === "91903") {
        if (group === "achieved") return "Section 1: Digital Media";
        if (group === "merit") return "Merit";
        if (group === "excellence") return "Excellence";
    }

    return STUDENT_SUMMARY_GROUPS.find((item) => item.key === group)?.label || "Other";
}

function createStudentSummaryBucket() {
    return { total: 0, evidenceCount: 0, submittedCount: 0, firstTaskTopic: "", records: [] };
}

function getStudentProcessStandards(student) {
    const standards = new Set();
    student?.groups?.forEach?.((bucket) => {
        (Array.isArray(bucket?.records) ? bucket.records : []).forEach((record) => {
            const standard = normalizeTrackerStandardValue(record?.processStandard);
            if (standard) standards.add(standard);
        });
    });
    return Array.from(standards).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getAuthoritativeStudentProcessStandard(student) {
    const standards = getStudentProcessStandards(student);
    return standards.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] || "";
}

function getStudentProcessFolderUrl(student) {
    let url = "";
    student?.groups?.forEach?.((bucket) => {
        if (url) return;
        const record = (Array.isArray(bucket?.records) ? bucket.records : []).find((item) => String(item?.processFolderUrl || "").trim());
        if (record?.processFolderUrl) {
            url = String(record.processFolderUrl).trim();
        }
    });
    return url;
}

function getStudentDigitalMediaType(student) {
    const types = new Set();
    student?.groups?.forEach?.((bucket) => {
        (Array.isArray(bucket?.records) ? bucket.records : []).forEach((record) => {
            const type = String(record?.digitalMediaType || "").trim();
            if (type) types.add(type);
        });
    });
    return Array.from(types).join(", ");
}

function studentMatchesStandardSearch(student, searchText) {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return true;
    return getStudentProcessStandards(student).some((standard) => standard.toLowerCase().includes(query));
}

function hasStudentSummaryEvidence(record) {
    return Boolean(record?.evidenceLinked || record?.googleSlidesUrl || (Array.isArray(record?.links) && record.links.length));
}

function getTrackerTaskDisplayLabel(taskTopic) {
    return stripTaskTopicLevel(taskTopic);
}

function getStudentSummaryRecordIdentity(record) {
    const standard = getStudentSummaryStandardNumber(record);
    const section = getStudentSummarySectionLabel(record);
    const topic = stripTaskTopicLevel(record?.taskTopic).toLowerCase();
    return `${standard}||${section}||${topic}`;
}

function mergeStudentSummaryRecords(existing, incoming) {
    if (!existing) return incoming;

    const links = [];
    const seenUrls = new Set();
    [...(Array.isArray(existing.links) ? existing.links : []), ...(Array.isArray(incoming.links) ? incoming.links : [])].forEach((link) => {
        const url = toSafeExternalUrl(link?.url);
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        links.push({ label: String(link?.label || "Link").trim() || "Link", url });
    });

    return {
        ...existing,
        ...incoming,
        googleSlidesUrl: existing.googleSlidesUrl || incoming.googleSlidesUrl,
        links,
        submitted: Boolean(existing.submitted || incoming.submitted),
        acknowledged: Boolean(existing.acknowledged || incoming.acknowledged),
        submittedAt: existing.submittedAt || incoming.submittedAt,
        taskUrl: existing.taskUrl || incoming.taskUrl
    };
}

function finalizeStudentSummaryBucket(bucket) {
    const byIdentity = new Map();
    (Array.isArray(bucket?.records) ? bucket.records : []).forEach((record) => {
        const key = getStudentSummaryRecordIdentity(record);
        if (!key) return;
        byIdentity.set(key, mergeStudentSummaryRecords(byIdentity.get(key), record));
    });

    bucket.records = Array.from(byIdentity.values());
    bucket.total = bucket.records.length;
    bucket.evidenceCount = bucket.records.filter(hasStudentSummaryEvidence).length;
    bucket.submittedCount = bucket.records.filter((record) => record.acknowledged).length;
    bucket.firstTaskTopic = bucket.records[0]?.taskTopic || "";
}

// One row per student, one column per criteria group, sourced entirely from the records already built for the task cards.
function buildStudentSummaryRows(sourceRecords = workState.records) {
    const byStudent = new Map();

    (Array.isArray(sourceRecords) ? sourceRecords : []).forEach((record) => {
        const email = record.studentEmail;
        if (!email) return;
        if (!byStudent.has(email)) {
            byStudent.set(email, {
                studentEmail: email,
                studentName: record.studentName,
                groups: new Map()
            });
        }

        const student = byStudent.get(email);
        const group = getTaskTopicGroup(record.taskTopic);
        ["overall", group].forEach((bucketKey) => {
            if (!student.groups.has(bucketKey)) {
                student.groups.set(bucketKey, createStudentSummaryBucket());
            }

            const bucket = student.groups.get(bucketKey);
            if (!bucket.firstTaskTopic) bucket.firstTaskTopic = record.taskTopic;
            bucket.records.push(record);
            bucket.total += 1;
            if (record.googleSlidesUrl || (Array.isArray(record.links) && record.links.length)) {
                bucket.evidenceCount += 1;
            }
            if (record.acknowledged) {
                bucket.submittedCount += 1;
            }
        });
    });

    byStudent.forEach((student) => {
        const authoritativeStandard = getAuthoritativeStudentProcessStandard(student);
        student.authoritativeProcessStandard = authoritativeStandard;
        student.groups.forEach((bucket) => {
            if (authoritativeStandard) {
                bucket.records = bucket.records.filter((record) => {
                    const recordStandard = normalizeTrackerStandardValue(record?.processStandard);
                    return !recordStandard || recordStandard === authoritativeStandard;
                });
            }
            finalizeStudentSummaryBucket(bucket);
        });
        student.processStandards = getStudentProcessStandards(student);
        student.processFolderUrl = getStudentProcessFolderUrl(student);
        student.digitalMediaType = getStudentDigitalMediaType(student);
    });

    return Array.from(byStudent.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function getStudentSummaryChipClass(bucket) {
    if (!bucket || !bucket.total) return "is-none";
    if (bucket.submittedCount >= bucket.total) return "is-all";
    if (bucket.evidenceCount > 0 || bucket.submittedCount > 0) return "is-partial";
    return "is-none";
}

function buildStudentSummaryDetailGroups(records) {
    const groups = new Map();
    (Array.isArray(records) ? records : []).forEach((record) => {
        const standard = getStudentSummaryStandardNumber(record);
        const section = getStudentSummarySectionLabel(record);
        const key = `${standard}||${section}`;
        if (!groups.has(key)) {
            groups.set(key, { standard, section, records: [] });
        }
        groups.get(key).records.push(record);
    });

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            records: group.records.sort((a, b) => compareTaskTopics(a.taskTopic, b.taskTopic))
        }))
        .sort((a, b) => String(a.section).localeCompare(String(b.section)));
}

const STUDENT_SUMMARY_GRADE_CATEGORY_ORDER = ["digital_outcome", "achieved", "merit", "excellence"];
const STUDENT_SUMMARY_GRADE_CATEGORY_LABELS = {
    digital_outcome: "Digital Outcome Topic",
    achieved: "ACHIEVED",
    merit: "MERIT",
    excellence: "EXCELLENCE"
};

function buildStudentSummaryGradeCategories(records) {
    const sourceRecords = Array.isArray(records) ? records : [];
    return STUDENT_SUMMARY_GRADE_CATEGORY_ORDER.map((category) => {
        const categoryRecords = sourceRecords.filter((record) => getTaskTopicGroup(record?.taskTopic) === category);
        return {
            category,
            label: STUDENT_SUMMARY_GRADE_CATEGORY_LABELS[category],
            groups: buildStudentSummaryDetailGroups(categoryRecords),
            acknowledgedCount: categoryRecords.filter((record) => record.acknowledged).length,
            total: categoryRecords.length
        };
    }).filter((category) => category.total > 0);
}

function renderStudentSummaryDetailPanel(student, group, bucket) {
    const gradeCategories = buildStudentSummaryGradeCategories(bucket?.records || []);
    if (!gradeCategories.length) return "";

    return `
        <div class="student-summary-detail-panel">
            <div class="student-summary-detail-heading">
                <strong>${escapeHtml(student.studentName)}</strong>
                <span>${escapeHtml(group.label)}: ${bucket.submittedCount}/${bucket.total} complete</span>
            </div>
            ${gradeCategories.map((category) => `
                <section class="student-summary-grade-category">
                    <h3>${escapeHtml(category.label)} <span>${category.acknowledgedCount}/${category.total} complete</span></h3>
                    ${category.groups.map((sectionGroup) => `
                        <div class="student-summary-detail-group">
                            <h4>${escapeHtml(sectionGroup.standard)} &middot; ${escapeHtml(sectionGroup.section)} &middot; ${sectionGroup.records.filter((record) => record.acknowledged).length}/${sectionGroup.records.length}</h4>
                            <ul>
                                ${sectionGroup.records.map((record) => {
                                    const complete = Boolean(record.acknowledged);
                                    const hasEvidence = hasStudentSummaryEvidence(record);
                                    const href = String(record.taskUrl || "").trim() || new URL(`teacher-student-work-task.html?task=${encodeURIComponent(record.taskTopic || "")}`, window.location.href).toString();
                                    const status = complete ? "Complete" : (hasEvidence ? "Evidence linked" : "Evidence required");
                                    return `
                                        <li class="${complete ? "is-complete" : (hasEvidence ? "is-partial" : "is-missing")}">
                                            <span class="student-summary-detail-status">${complete ? "&#10003;" : (hasEvidence ? "~" : "-")}</span>
                                            <a href="${escapeHtml(href)}">${escapeHtml(getTrackerTaskDisplayLabel(record.taskTopic))}</a>
                                            <span>${escapeHtml(status)}</span>
                                        </li>
                                    `;
                                }).join("")}
                            </ul>
                        </div>
                    `).join("")}
                </section>
            `).join("")}
        </div>
    `;
}

function renderStudentSummaryCell(student, group, bucket, summaryKind = "process") {
    if (!bucket) {
        return `<td><span class="student-summary-chip is-none">-</span></td>`;
    }

    const chipClass = getStudentSummaryChipClass(bucket);
    const title = `${student.studentName} - ${group.label}`;
    const isDigitalMedia = summaryKind === "digital-media";
    const isExpanded = (isDigitalMedia ? workState.expandedDigitalMediaStudent : workState.expandedSummaryStudent) === student.studentEmail
        && (isDigitalMedia ? workState.expandedDigitalMediaGroup : workState.expandedSummaryGroup) === group.key;
    return `
        <td>
            <button class="student-summary-chip ${chipClass} ${isExpanded ? "is-expanded" : ""}" type="button" data-student-summary-email="${escapeHtml(student.studentEmail)}" data-student-summary-group="${escapeHtml(group.key)}" data-student-summary-kind="${summaryKind}" title="${escapeHtml(title)}" aria-expanded="${isExpanded ? "true" : "false"}">${bucket.submittedCount}/${bucket.total}</button>
        </td>
    `;
}

function renderStudentSummaryDetailRow(student, summaryKind = "process") {
    const isDigitalMedia = summaryKind === "digital-media";
    const expandedGroup = isDigitalMedia ? workState.expandedDigitalMediaGroup : workState.expandedSummaryGroup;
    const expandedStudent = isDigitalMedia ? workState.expandedDigitalMediaStudent : workState.expandedSummaryStudent;
    const group = STUDENT_SUMMARY_GROUPS.find((item) => item.key === expandedGroup);
    if (!group || expandedStudent !== student.studentEmail) return "";

    const bucket = student.groups.get(group.key);
    if (!bucket) return "";

    return `
        <tr class="student-summary-expanded-row">
            <td colspan="${STUDENT_SUMMARY_GROUPS.length + 3}">
                ${renderStudentSummaryDetailPanel(student, group, bucket)}
            </td>
        </tr>
    `;
}

function isProcessAssessmentRecord(record) {
    if (String(record?.activityId || "").trim() === PROCESS_ASSESSMENT_ACTIVITY_ID) return true;
    const activity = workState.activitiesById.get(String(record?.activityId || "").trim());
    const activityName = String(activity?.name || record?.activityName || "").trim();
    return /process\s+assessment/i.test(activityName);
}

function isProcessAssessmentTopic(taskTopic) {
    const text = stripTaskTopicLevel(taskTopic).toLowerCase();
    if (getTaskTopicGroup(taskTopic) === "digital_outcome") return true;
    return /project management|decompos|key features or requirements|trial(?:ling)? (?:the )?components|test(?:ing)? that the digital technologies outcome functions|relevant implications|using information appropriately from testing and trialling|effectively using project management and version control|trialling multiple components and\/or techniques|discussing how the information from planning, testing and trialling/.test(text);
}

function buildProcessSummaryRows() {
    return buildStudentSummaryRows(workState.records.filter((record) =>
        isProcessAssessmentRecord(record) && isProcessAssessmentTopic(record?.taskTopic)
    ));
}

function isDigitalMediaAssessmentTopic(taskTopic) {
    const text = stripTaskTopicLevel(taskTopic).toLowerCase();
    if (getTaskTopicGroup(taskTopic) === "digital_outcome") return true;

    return /using appropriate tools and techniques for the purpose and end users|applying appropriate tools and techniques to meet the purpose and end-user requirements|applying appropriate data integrity and testing procedures|using relevant conventions for the media type|applying user experience principles relevant to the purpose of the outcome|explaining relevant implications|using information from testing procedures to improve the quality of the (?:digital media )?outcome|applying relevant conventions to improve the quality of the outcome|applying user experience principles to improve the quality of the digital media outcome|addressing relevant implications|iterative improvement throughout the design, development and testing process|using efficient tools and techniques in the outcome.?s production/i.test(text);
}

function buildDigitalMediaSummaryRows() {
    const mediaRecords = workState.records
        .filter((record) => {
            const activity = workState.activitiesById.get(String(record?.activityId || "").trim());
            const activityName = String(activity?.name || record?.activityName || "").trim();
            const isProcessAssessmentActivity = /process\s+assessment/i.test(activityName);
            return !isProcessAssessmentActivity || getTaskTopicGroup(record?.taskTopic) === "digital_outcome";
        })
        .filter((record) => /^(91893|91903)$/.test(normalizeTrackerStandardValue(record?.projectTaskStandard)))
        .filter((record) => isDigitalMediaAssessmentTopic(record?.taskTopic))
        .map((record) => ({ ...record, processStandard: record.projectTaskStandard }));
    return buildStudentSummaryRows(mediaRecords);
}

function renderDigitalMediaSummaryGrid() {
    const host = document.querySelector("#digital-media-summary-grid");
    if (!host) return;
    const rows = buildDigitalMediaSummaryRows();
    const nameQuery = String(workState.digitalMediaStudentSearch || "").trim().toLowerCase();
    const standardQuery = String(workState.digitalMediaStandardSearch || "").trim().toLowerCase();
    const filteredRows = rows.filter((student) => {
        const nameMatches = !nameQuery || `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(nameQuery);
        return nameMatches && studentMatchesStandardSearch(student, standardQuery);
    });
    if (!filteredRows.length) {
        host.innerHTML = `<div class="work-empty">No Digital Media students match that search.</div>`;
        return;
    }
    host.innerHTML = `
        <div class="work-table-wrap">
            <table class="student-summary-table">
                <thead><tr><th>Student</th><th>Digital Media Standard</th><th>Digital Media Type</th>${STUDENT_SUMMARY_GROUPS.map((group) => `<th>${escapeHtml(group.label)}</th>`).join("")}</tr></thead>
                <tbody>${filteredRows.map((student) => `
                    <tr>
                        <td>${escapeHtml(student.studentName)}</td>
                        <td>${student.processStandards.map((standard) => `<a class="student-standard-chip" href="teacher-assessment-allocation.html?standard=${encodeURIComponent(standard)}" title="Open assessment allocation data">${escapeHtml(standard)}</a>`).join(" ")}</td>
                        <td>${student.digitalMediaType ? `<span class="student-media-type-chip">${escapeHtml(student.digitalMediaType)}</span>` : `<span class="student-media-type-chip is-empty">-</span>`}</td>
                        ${STUDENT_SUMMARY_GROUPS.map((group) => renderStudentSummaryCell(student, group, student.groups.get(group.key), "digital-media")).join("")}
                    </tr>
                    ${renderStudentSummaryDetailRow(student, "digital-media")}
                `).join("")}</tbody>
            </table>
        </div>
    `;
}

function renderExternalAssessmentGrid() {
    if (!externalAssessmentGrid) return;

    const studentsByEmail = new Map();
    const addStudent = (email, nameFallback = "") => {
        const normalized = normalizeEmail(email);
        if (!normalized || studentsByEmail.has(normalized)) return;
        const name = String(nameFallback || workState.studentNameByEmail.get(normalized) || formatNameFromEmail(normalized)).trim();
        studentsByEmail.set(normalized, {
            studentEmail: normalized,
            studentName: name
        });
    };

    if (workState.email) {
        addStudent(workState.email);
    }
    buildProcessSummaryRows().forEach((s) => addStudent(s.studentEmail, s.studentName));
    buildDigitalMediaSummaryRows().forEach((s) => addStudent(s.studentEmail, s.studentName));
    (workState.externalAssessmentStudents || []).forEach((s) => addStudent(s.studentEmail, s.studentName));

    for (const email of workState.externalAssessmentAllocations.keys()) {
        addStudent(email);
    }

    const allStudents = Array.from(studentsByEmail.values())
        .sort((left, right) => String(left.studentName || "").localeCompare(String(right.studentName || "")));
    let students = workState.externalAssignedOnly
        ? allStudents.filter((student) => {
            const allocation = workState.externalAssessmentAllocations.get(normalizeEmail(student.studentEmail)) || {};
            return Boolean(String(allocation.project_exam_standard || "").trim() || String(allocation.computer_science_exam_standard || "").trim());
        })
        : allStudents;
    if (workState.externalStandardFilter) {
        students = students.filter((student) => {
            const allocation = workState.externalAssessmentAllocations.get(normalizeEmail(student.studentEmail)) || {};
            return [allocation.project_exam_standard, allocation.computer_science_exam_standard]
                .map((standard) => String(standard || "").trim())
                .includes(workState.externalStandardFilter);
        });
    }
    if (!students.length) {
        externalAssessmentGrid.innerHTML = `<div class="work-empty">${workState.externalStandardFilter ? `No students are currently assigned to ${escapeHtml(workState.externalStandardFilter)}.` : workState.externalAssignedOnly ? "No students are currently assigned to an external exam. Clear the filter to make allocations." : "No eligible students are available for external assessment allocation."}</div>`;
        return;
    }

    const renderOptions = (options, selectedValue) => [
        `<option value="">Not allocated</option>`,
        ...options.map((standard) => `<option value="${standard}"${selectedValue === standard ? " selected" : ""}>${standard}</option>`)
    ].join("");

    externalAssessmentGrid.innerHTML = `
        <div class="work-table-wrap">
            <table class="student-summary-table">
                <thead><tr><th>Student Name (Lastname, First name)</th><th>Project Exam</th><th>Computer Science Exam</th></tr></thead>
                <tbody>${students.map((student) => {
                    const allocation = workState.externalAssessmentAllocations.get(normalizeEmail(student.studentEmail)) || {};
                    const projectStandard = String(allocation.project_exam_standard || "").trim();
                    const computerScienceStandard = String(allocation.computer_science_exam_standard || "").trim();
                    return `
                        <tr data-external-student-email="${escapeHtml(student.studentEmail)}">
                            <td>${escapeHtml(student.studentName)}</td>
                            <td><select class="external-assessment-select" data-external-field="project_exam_standard" aria-label="Project Exam standard for ${escapeHtml(student.studentName)}">${renderOptions(["92007", "91899", "91909"], projectStandard)}</select></td>
                            <td><select class="external-assessment-select" data-external-field="computer_science_exam_standard" aria-label="Computer Science Exam standard for ${escapeHtml(student.studentName)}">${renderOptions(["92006", "91898", "91908"], computerScienceStandard)}</select></td>
                        </tr>
                    `;
                }).join("")}</tbody>
            </table>
        </div>
    `;
}

function getFilteredProcessSummaryRows() {
    const rows = buildProcessSummaryRows();
    const nameQuery = String(workState.studentSearch || "").trim().toLowerCase();
    const standardQuery = String(workState.standardSearch || "").trim().toLowerCase();
    return rows.filter((student) => {
        const nameMatches = !nameQuery || `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(nameQuery);
        return nameMatches && studentMatchesStandardSearch(student, standardQuery);
    });
}

function getStudentTrackerCommentRows(filtered = true) {
    const digitalMediaByEmail = new Map(buildDigitalMediaSummaryRows().map((student) => [student.studentEmail, student]));
    const processRows = filtered ? getFilteredProcessSummaryRows() : buildProcessSummaryRows();
    return processRows.map((student) => {
        const digitalMedia = digitalMediaByEmail.get(student.studentEmail);
        return {
            ...student,
            digitalMediaStandards: digitalMedia?.processStandards || [],
            digitalMediaType: digitalMedia?.digitalMediaType || ""
        };
    }).filter((student) => {
        if (!filtered) return true;
        const nameQuery = String(workState.commentStudentSearch || "").trim().toLowerCase();
        return !nameQuery || `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(nameQuery);
    });
}

function getStudentTrackerCommentScopes(student) {
    const scopes = [];
    student.processStandards.forEach((standard) => scopes.push({ value: `process:${standard}`, label: `Process ${standard}` }));
    student.digitalMediaStandards.forEach((standard) => scopes.push({ value: `digital:${standard}`, label: `Digital Media ${standard}` }));
    if (scopes.length > 1) scopes.push({ value: "both", label: "Both" });
    return scopes;
}

function renderStudentTrackerComments() {
    if (!studentTrackerCommentsGrid) return;
    const rows = getStudentTrackerCommentRows();
    if (!rows.length) {
        studentTrackerCommentsGrid.innerHTML = `<div class="work-empty">No students match that search.</div>`;
        return;
    }

    studentTrackerCommentsGrid.innerHTML = `
        <div class="work-table-wrap">
            <table class="student-summary-table student-comments-table">
                <thead><tr><th>Student</th><th>Process Standard</th><th>Digital Media Standard</th><th>Digital Media Type</th><th>Comments</th></tr></thead>
                <tbody>${rows.map((student) => `
                    <tr data-student-comment-email="${escapeHtml(student.studentEmail)}">
                        <td>${escapeHtml(student.studentName)}</td>
                        <td>${student.processStandards.map((standard) => escapeHtml(standard)).join(", ") || "-"}</td>
                        <td>${student.digitalMediaStandards.map((standard) => escapeHtml(standard)).join(", ") || "-"}</td>
                        <td>${escapeHtml(student.digitalMediaType || "-")}</td>
                        <td>
                            <select class="student-tracker-comment-scope" aria-label="Standard for comment about ${escapeHtml(student.studentName)}">
                                ${getStudentTrackerCommentScopes(student).map((scope) => `<option value="${escapeHtml(scope.value)}">${escapeHtml(scope.label)}</option>`).join("")}
                            </select>
                            <textarea class="student-tracker-comment-input" rows="2" maxlength="10000" placeholder="Click to add a timestamped comment" aria-label="Comment for ${escapeHtml(student.studentName)}">${escapeHtml(workState.studentTrackerComments.get(student.studentEmail) || "")}</textarea>
                            <div class="student-tracker-email-controls">
                                <select class="student-tracker-email-scope" aria-label="Summary to email to ${escapeHtml(student.studentName)}">
                                    ${getStudentTrackerCommentScopes(student).map((scope) => `<option value="${escapeHtml(scope.value)}">Email ${escapeHtml(scope.label)} Summary</option>`).join("")}
                                </select>
                                <button type="button" class="student-summary-action student-tracker-email-button">Email Summary</button>
                                <span class="student-tracker-email-status${workState.studentTrackerEmailStatus.get(student.studentEmail)?.isError ? " is-error" : ""}" aria-live="polite">${escapeHtml(workState.studentTrackerEmailStatus.get(student.studentEmail)?.message || "")}</span>
                            </div>
                        </td>
                    </tr>
                `).join("")}</tbody>
            </table>
        </div>
    `;
}

async function loadStudentTrackerComments() {
    try {
        const payload = await fetchJson("/api/student-tracker/comments", { headers: withAuthHeaders() });
        workState.studentTrackerComments = new Map(
            (Array.isArray(payload?.comments) ? payload.comments : [])
                .map((row) => [normalizeEmail(row?.student_email), String(row?.comment || "")])
                .filter(([email, comment]) => email && comment)
        );
    } catch (_error) {
        setStatus("Student comments could not be loaded.", true);
    }
}

async function saveStudentTrackerComment(row, input) {
    const studentEmail = normalizeEmail(row?.getAttribute("data-student-comment-email") || "");
    if (!studentEmail || !input) return;
    const timestampLine = String(input.dataset.timestampLine || "").trim();
    const comment = String(input.value || "").trim() === timestampLine ? "" : String(input.value || "").trim();
    input.disabled = true;
    try {
        await fetchJson(`/api/student-tracker/comments/${encodeURIComponent(studentEmail)}`, {
            method: "PUT",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ comment })
        });
        if (comment) workState.studentTrackerComments.set(studentEmail, comment);
        else workState.studentTrackerComments.delete(studentEmail);
    } catch (error) {
        setStatus(error?.message || "Could not save student comment.", true);
    } finally {
        input.disabled = false;
        delete input.dataset.timestampLine;
    }
}

function getAllStudentTrackerCommentRows() {
    const studentsByEmail = new Map(getStudentTrackerCommentRows(false).map((student) => [student.studentEmail, student]));
    return Array.from(workState.studentTrackerComments.entries())
        .map(([email, comment]) => ({
            studentEmail: email,
            studentName: studentsByEmail.get(email)?.studentName || workState.studentNameByEmail.get(email) || formatNameFromEmail(email),
            processStandards: studentsByEmail.get(email)?.processStandards || [],
            digitalMediaStandards: studentsByEmail.get(email)?.digitalMediaStandards || [],
            digitalMediaType: studentsByEmail.get(email)?.digitalMediaType || "",
            comment
        }))
        .sort((left, right) => left.studentName.localeCompare(right.studentName));
}

function getCommentsForStandard(commentText, targetStandard) {
    const text = String(commentText || "").trim();
    if (!text) return "";
    const entryPattern = /^===\s*(Process|Digital Media|Both)(?:\s+(\d{4,6}))?\s*\|\s*([^=]+?)\s*===$/gim;
    const matches = Array.from(text.matchAll(entryPattern));
    if (!matches.length) return text;
    const target = normalizeTrackerStandardValue(targetStandard);
    const starts = matches.map((match) => match.index);
    const entries = matches.map((match, index) => ({
        header: match[0],
        scope: String(match[1] || "").toLowerCase(),
        standard: String(match[2] || "").trim(),
        body: text.slice(match.index + match[0].length, starts[index + 1] ?? text.length).trim()
    }));
    return entries
        .filter((entry) => entry.scope === "both" || !target || entry.standard === target)
        .map((entry) => `${entry.header}\n${entry.body}`.trim())
        .join("\n\n");
}

function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
}

function getStudentCommentsFileTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function exportStudentTrackerCommentsCsv() {
    const rows = getAllStudentTrackerCommentRows();
    const csv = [
        ["Student", "Email", "Process Standard", "Digital Media Standard", "Digital Media Type", "Comment"].map(csvCell).join(","),
        ...rows.map((row) => [row.studentName, row.studentEmail, row.processStandards.join(", "), row.digitalMediaStandards.join(", "), row.digitalMediaType, row.comment].map(csvCell).join(","))
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-comments-${getStudentCommentsFileTimestamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function printStudentTrackerComments() {
    const rows = getStudentTrackerCommentRows(false)
        .filter((student) => String(workState.studentTrackerComments.get(student.studentEmail) || "").trim());
    const fileTimestamp = getStudentCommentsFileTimestamp();
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
        setStatus("Allow pop-ups to print student comments.", true);
        return;
    }
    const tableRows = rows.map((student) => `<tr><td>${escapeHtml(student.studentName)}</td><td>${escapeHtml(student.processStandards.join(", ") || "-")}</td><td>${escapeHtml(student.digitalMediaStandards.join(", ") || "-")}</td><td>${escapeHtml(student.digitalMediaType || "-")}</td><td>${escapeHtml(workState.studentTrackerComments.get(student.studentEmail) || "")}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Student Comments - ${fileTimestamp}</title><style>body{font:12px Arial,sans-serif;color:#17314d;margin:24px}h1{font:20px Georgia,serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #b9cce3;padding:8px;text-align:left;vertical-align:top}th{background:#eaf3fa}</style></head><body><h1>Student Comments</h1><table><thead><tr><th>Student</th><th>Process Standard</th><th>Digital Media Standard</th><th>Digital Media Type</th><th>Comments</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
}

function getStudentSummaryForEmail(studentEmail, kind) {
    const rows = kind === "digital"
        ? buildDigitalMediaSummaryRows()
        : buildProcessSummaryRows();
    return rows.find((student) => student.studentEmail === studentEmail) || null;
}

async function emailStudentProgressSummary(row, button, scope) {
    const studentEmail = normalizeEmail(row?.getAttribute("data-student-comment-email") || "");
    const studentName = String(row?.querySelector("td")?.textContent || studentEmail).trim();
    const scopes = scope === "both" ? ["process", "digital"] : [String(scope || "").split(":")[0]];
    const summaries = scopes.map((kind) => {
        const student = getStudentSummaryForEmail(studentEmail, kind);
        const standard = kind === "digital"
            ? student?.processStandards?.[0]
            : getAuthoritativeStudentProcessStandard(student || {});
        if (!student || !/^\d{4,6}$/.test(String(standard || ""))) return null;
        return {
            standard,
            label: kind === "digital" ? "Digital Media Summary" : "Process Summary",
            html: buildProgressSummaryReportHtml(student, standard)
        };
    }).filter(Boolean);
    if (!summaries.length) {
        setStatus(`No summary standard is available for ${studentName}.`, true);
        return;
    }

    const statusHost = row?.querySelector?.(".student-tracker-email-status");
    const setEmailStatus = (message, isError = false) => {
        workState.studentTrackerEmailStatus.set(studentEmail, { message, isError });
        if (statusHost) {
            statusHost.textContent = message;
            statusHost.classList.toggle("is-error", isError);
        }
    };
    button.disabled = true;
    setEmailStatus("Sending...");
    try {
        const payload = await fetchJson("/api/student-tracker/email-summary", {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ student_email: studentEmail, summaries })
        });
        const savedComment = String(payload?.comment?.comment || "").trim();
        if (savedComment) workState.studentTrackerComments.set(studentEmail, savedComment);
        renderStudentTrackerComments();
        const renderedRow = studentTrackerCommentsGrid?.querySelector?.(`[data-student-comment-email="${CSS.escape(studentEmail)}"]`);
        const renderedStatus = renderedRow?.querySelector?.(".student-tracker-email-status");
        if (renderedStatus) {
            renderedStatus.textContent = `Sent ${new Date().toLocaleTimeString()}`;
            renderedStatus.classList.remove("is-error");
        }
        workState.studentTrackerEmailStatus.set(studentEmail, { message: `Sent ${new Date().toLocaleTimeString()}`, isError: false });
        setStatus(`Summary emailed to ${studentEmail}.`);
    } catch (error) {
        setEmailStatus(error?.message || "Email failed.", true);
        setStatus(error?.message || "Could not email progress summary.", true);
    } finally {
        button.disabled = false;
    }
}

function wireStudentTrackerComments() {
    const startTimestampedComment = (input, scope) => {
        if (!input) return;
        const previousTimestampLine = String(input.dataset.timestampLine || "").trim();
        const currentValue = String(input.value || "").trim();
        const priorEntryOnly = previousTimestampLine && (currentValue === previousTimestampLine || currentValue === `${previousTimestampLine}\n`);
        const baseValue = priorEntryOnly ? "" : currentValue;
        const timestampLine = `=== ${scope || "Both"} | ${new Date().toLocaleString()} ===`;
        input.value = baseValue ? `${timestampLine}\n${baseValue}` : `${timestampLine}\n`;
        input.dataset.timestampLine = timestampLine;
    };

    studentTrackerCommentsGrid?.addEventListener("focusin", (event) => {
        const input = event.target?.closest?.(".student-tracker-comment-input");
        if (!input || input.dataset.timestampLine) return;
        const row = input.closest?.("[data-student-comment-email]");
        const scope = row?.querySelector?.(".student-tracker-comment-scope")?.selectedOptions?.[0]?.textContent?.trim() || "Both";
        startTimestampedComment(input, scope);
    });
    studentTrackerCommentsGrid?.addEventListener("change", (event) => {
        const scopeSelect = event.target?.closest?.(".student-tracker-comment-scope");
        if (!scopeSelect) return;
        const input = scopeSelect.closest?.("td")?.querySelector?.(".student-tracker-comment-input");
        const scope = scopeSelect.selectedOptions?.[0]?.textContent?.trim() || "Both";
        startTimestampedComment(input, scope);
        input?.focus();
    });
    studentTrackerCommentsGrid?.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".student-tracker-email-button");
        const row = button?.closest?.("[data-student-comment-email]");
        const scope = row?.querySelector?.(".student-tracker-email-scope")?.value || "";
        if (row && button) void emailStudentProgressSummary(row, button, scope);
    });
    studentTrackerCommentsGrid?.addEventListener("change", (event) => {
        const input = event.target?.closest?.(".student-tracker-comment-input");
        const row = input?.closest?.("[data-student-comment-email]");
        if (row) void saveStudentTrackerComment(row, input);
    });
    printStudentCommentsButton?.addEventListener("click", printStudentTrackerComments);
    exportStudentCommentsButton?.addEventListener("click", exportStudentTrackerCommentsCsv);
    commentStudentSearchInput?.addEventListener("input", () => {
        syncStudentNameFilters(commentStudentSearchInput.value);
    });
}

function syncStudentNameFilters(value) {
    const nextValue = String(value || "");
    workState.studentSearch = nextValue;
    workState.digitalMediaStudentSearch = nextValue;
    workState.commentStudentSearch = nextValue;
    if (studentSearchInput && studentSearchInput.value !== nextValue) studentSearchInput.value = nextValue;
    if (digitalMediaStudentSearchInput && digitalMediaStudentSearchInput.value !== nextValue) digitalMediaStudentSearchInput.value = nextValue;
    if (commentStudentSearchInput && commentStudentSearchInput.value !== nextValue) commentStudentSearchInput.value = nextValue;
    renderStudentSummaryGrid();
    renderStudentTrackerComments();
    renderDigitalMediaSummaryGrid();
}

function setExternalAssessmentStatus(message, isError = false) {
    if (!externalAssessmentStatus) return;
    externalAssessmentStatus.textContent = String(message || "");
    externalAssessmentStatus.classList.toggle("is-error", Boolean(isError));
}

function buildExternalAssessmentStudents(students) {
    const ALLOWED_PROGRAMS = new Set(["DTECH", "COMP", "DTONLINE", "DT ONLINE", "MDTECH", "MPROG"]);
    return (Array.isArray(students) ? students : []).flatMap((student) => {
        const programs = Array.isArray(student?.programs)
            ? student.programs.map((program) => String(program || "").trim().toUpperCase())
            : [];
        const isEligible = Boolean(student?.has_dtech) || programs.some((program) => ALLOWED_PROGRAMS.has(program));
        if (!isEligible) return [];

        const email = (Array.isArray(student?.linked_emails) ? student.linked_emails : [])
            .map((value) => normalizeEmail(value))
            .find(Boolean);
        if (!email) return [];

        return [{
            studentEmail: email,
            studentName: String(student?.student_name || "").trim() || formatNameFromEmail(email)
        }];
    });
}

async function saveExternalAssessmentAllocation(row) {
    const studentEmail = normalizeEmail(row?.getAttribute("data-external-student-email") || "");
    if (!studentEmail) return;

    const selects = Array.from(row.querySelectorAll("[data-external-field]"));
    const payload = Object.fromEntries(selects.map((select) => [select.dataset.externalField, String(select.value || "").trim()]));
    selects.forEach((select) => { select.disabled = true; });
    setExternalAssessmentStatus(`Saving external assessment allocation for ${studentEmail}...`);

    try {
        const response = await fetchJson(`/api/external-assessment-allocations/${encodeURIComponent(studentEmail)}`, {
            method: "PUT",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload)
        });
        workState.externalAssessmentAllocations.set(studentEmail, response.allocation || { student_email: studentEmail, ...payload });
        setExternalAssessmentStatus(`Saved external assessment allocation for ${studentEmail}.`);
        renderExternalAssessmentGrid();
    } catch (error) {
        setExternalAssessmentStatus(error?.message || "Could not save external assessment allocation.", true);
        renderExternalAssessmentGrid();
    } finally {
        selects.forEach((select) => { select.disabled = false; });
    }
}

function wireExternalAssessmentEvents() {
    externalStandardFilter?.addEventListener("change", () => {
        workState.externalStandardFilter = String(externalStandardFilter.value || "").trim();
        renderExternalAssessmentGrid();
    });
    externalAssignedOnlyFilter?.addEventListener("change", () => {
        workState.externalAssignedOnly = Boolean(externalAssignedOnlyFilter.checked);
        renderExternalAssessmentGrid();
    });
    externalAssessmentGrid?.addEventListener("change", (event) => {
        const select = event.target?.closest?.("[data-external-field]");
        const row = select?.closest?.("[data-external-student-email]");
        if (row) void saveExternalAssessmentAllocation(row);
    });
}

function renderStudentSummaryGrid() {
    const host = document.querySelector("#student-summary-grid");
    if (!host) return;

    const rows = buildProcessSummaryRows();
    if (!rows.length) {
        host.innerHTML = `<div class="work-empty">No students found yet.</div>`;
        return;
    }

    const searchText = String(workState.studentSearch || "").trim().toLowerCase();
    const standardSearchText = String(workState.standardSearch || "").trim().toLowerCase();
    const visibleRows = searchText
        ? rows.filter((student) => `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(searchText))
        : rows;
    const filteredRows = visibleRows.filter((student) => studentMatchesStandardSearch(student, standardSearchText));

    if (!filteredRows.length) {
        host.innerHTML = `<div class="work-empty">No students match that search.</div>`;
        return;
    }

    host.innerHTML = `
        <div class="work-table-wrap">
            <table class="student-summary-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Process Standard</th>
                        <th>Process Folder</th>
                        ${STUDENT_SUMMARY_GROUPS.map((group) => `<th>${escapeHtml(group.label)}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${filteredRows.map((student) => `
                        <tr>
                            <td>${escapeHtml(student.studentName)}</td>
                            <td>${(Array.isArray(student.processStandards) && student.processStandards.length) ? student.processStandards.map((standard) => `<a class="student-standard-chip" href="teacher-assessment-allocation.html?standard=${encodeURIComponent(standard)}" title="Open assessment allocation data">${escapeHtml(standard)}</a>`).join(" ") : `<span class="student-standard-chip is-empty">-</span>`}</td>
                            <td>${student.processFolderUrl ? `<a class="student-drive-chip" href="${escapeHtml(student.processFolderUrl)}" target="_blank" rel="noreferrer" title="Open Process Assessment folder in Google Drive">Google Drive</a>` : `<span class="student-drive-chip is-empty">-</span>`}</td>
                            ${STUDENT_SUMMARY_GROUPS.map((group) => renderStudentSummaryCell(student, group, student.groups.get(group.key))).join("")}
                        </tr>
                        ${renderStudentSummaryDetailRow(student)}
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function getStudentSummaryRecordsForStandard(student, standard) {
    const targetStandard = normalizeTrackerStandardValue(standard);
    const overall = student?.groups?.get("overall");
    return (Array.isArray(overall?.records) ? overall.records : [])
        .filter((record) => !targetStandard || normalizeTrackerStandardValue(record?.processStandard) === targetStandard);
}

function buildProgressSummaryReportHtml(student, standard) {
    const targetStandard = normalizeTrackerStandardValue(standard) || getAuthoritativeStudentProcessStandard(student) || "Standard not specified";
    const assessmentLabel = /^(91893|91903)$/.test(targetStandard) ? "Digital Media Assessment" : "Process Assessment";
    const records = getStudentSummaryRecordsForStandard(student, targetStandard)
        .sort((a, b) => compareTaskTopics(a.taskTopic, b.taskTopic));
    const achievedRecords = records.filter((record) => getTaskTopicGroup(record.taskTopic) === "achieved");
    const achievedCompleteCount = achievedRecords.filter((record) => record.acknowledged).length;
    const generatedDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const schoolLogoUrl = `${window.location.origin}/images/${encodeURIComponent("whs logo circular reo .png")}`;
    const reportLevelOrder = ["digital_outcome", "achieved", "merit", "excellence"];
    const reportLevelLabels = {
        digital_outcome: "Digital Outcome",
        achieved: "Achieved",
        merit: "Merit",
        excellence: "Excellence"
    };
    const incompleteAchievedRecords = records.filter((record) => getTaskTopicGroup(record.taskTopic) === "achieved"
        && !record.acknowledged
        && !hasStudentSummaryEvidence(record));
    const nextStepGroups = buildStudentSummaryDetailGroups(incompleteAchievedRecords);
    const standardComments = getCommentsForStandard(workState.studentTrackerComments.get(student.studentEmail), targetStandard);
    const nextStepsHtml = nextStepGroups.length
        ? `
            <section class="report-next-steps">
                <h2>WHAT YOU NEED TO DO NEXT</h2>
                <p class="report-next-step-intro">1. Complete the following ACHIEVED requirements</p>
                ${nextStepGroups.map((group) => `
                    <div class="report-next-step-group">
                        <h3>${escapeHtml(group.section)}</h3>
                        ${group.records.map((record) => `
                            <div class="report-next-step-item">
                                <strong>○ ${escapeHtml(getTrackerTaskDisplayLabel(record.taskTopic))}</strong>
                                <span>Evidence required</span>
                                <a href="${escapeHtml(record.taskUrl)}" target="_blank" rel="noreferrer">Open task page to add evidence</a>
                            </div>
                        `).join("")}
                    </div>
                `).join("")}
            </section>
        `
        : `
            <section class="report-next-steps is-complete">
                <h2>WHAT YOU NEED TO DO NEXT</h2>
                <p>All ACHIEVED requirements have evidence linked or are complete.</p>
            </section>
        `;
    const renderReportRecord = (record) => {
                const acknowledged = Boolean(record.acknowledged);
                const evidence = [];
                if (record.googleSlidesUrl) evidence.push({ label: "Google Slides", url: record.googleSlidesUrl });
                (Array.isArray(record.links) ? record.links : []).forEach((link) => evidence.push(link));
                const uniqueEvidence = evidence.filter((link, index, links) => links.findIndex((item) => item.url === link.url) === index);
                const status = uniqueEvidence.length ? "Evidence linked" : (acknowledged ? "Complete" : "Evidence required");
                const statusClass = acknowledged ? "complete" : (uniqueEvidence.length ? "linked" : "required");
                return `
                    <article class="report-item ${statusClass}">
                        <div class="report-item-heading"><strong>${acknowledged ? "&#10003;" : "-"} ${escapeHtml(getTrackerTaskDisplayLabel(record.taskTopic))}</strong><span>${status}</span></div>
                        <div class="report-links">
                            ${uniqueEvidence.length
                                ? uniqueEvidence.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || "Evidence link")}</a>`).join("")
                                : `<a href="${escapeHtml(record.taskUrl)}" target="_blank" rel="noreferrer">Open task page to add evidence</a>`}
                        </div>
                    </article>
                `;
    };
    const reportRows = reportLevelOrder.map((level) => {
        const levelRecords = records.filter((record) => getTaskTopicGroup(record.taskTopic) === level);
        if (!levelRecords.length) return "";
        const detailGroups = buildStudentSummaryDetailGroups(levelRecords);
        const levelAcknowledged = levelRecords.filter((record) => record.acknowledged).length;
        return `
            <div class="report-level">
                <h2 class="report-level-heading">${escapeHtml(reportLevelLabels[level])} <span>${levelAcknowledged}/${levelRecords.length} complete</span></h2>
                ${detailGroups.map((group) => `
                    <section class="report-section">
                        <h3>${escapeHtml(group.section)} <span>${group.records.filter((record) => record.acknowledged).length}/${group.records.length} complete</span></h3>
                        ${group.records.map(renderReportRecord).join("")}
                    </section>
                `).join("")}
            </div>
        `;
    }).join("");

    return `
        <article class="progress-report">
            <header class="report-header">
                <p class="report-kicker">DTECH Hub · ${escapeHtml(assessmentLabel)} Summary</p>
                <h1>${escapeHtml(targetStandard)} - Progress Summary</h1>
                <dl>
                    <div><dt>Student</dt><dd>${escapeHtml(student.studentName)}</dd></div>
                    <div><dt>Standard</dt><dd>${escapeHtml(targetStandard)}</dd></div>
                    <div class="report-date-meta"><img src="${escapeHtml(schoolLogoUrl)}" alt="Westland High School logo" width="96" height="96" style="display:block;width:96px;height:96px;max-width:96px;object-fit:contain;margin-bottom:5px;"><dt>Report date</dt><dd>${escapeHtml(generatedDate)}</dd></div>
                </dl>
            </header>
            <section class="report-progress">
                <h2>ACHIEVED requirements</h2>
                <strong>${achievedCompleteCount}/${achievedRecords.length} complete</strong>
                <p>${achievedRecords.length - achievedCompleteCount} requirement${achievedRecords.length - achievedCompleteCount === 1 ? "" : "s"} still need evidence or completion.</p>
            </section>
            ${standardComments ? `<section class="report-comments"><h2>TEACHER COMMENTS</h2><p>${escapeHtml(standardComments).replace(/\r?\n/g, "<br>")}</p></section>` : ""}
            ${nextStepsHtml}
            <div class="report-criteria-start">
                ${reportRows || `<p class="report-empty">No criteria were found for this student and standard.</p>`}
            </div>
            <footer class="report-footer">Standard ${escapeHtml(targetStandard)} · Page 1 · Evidence remains in its original location. This report contains links only and does not embed evidence files.</footer>
        </article>
    `;
}

function openProgressSummaryPrintWindow(students, standard) {
    const reports = students.map((student) => buildProgressSummaryReportHtml(student, standard)).join("");
    const reportTitle = students.length === 1
        ? `${normalizeTrackerStandardValue(standard) || "Standard"} - Progress Summary - ${students[0].studentName}`
        : `${normalizeTrackerStandardValue(standard) || "Standard"} - Progress Summaries`;
    const reportWindow = window.open("", "_blank", "width=1000,height=800");
    if (!reportWindow) {
        setStatus("Allow pop-ups to generate the progress summary PDF.", true);
        return;
    }

    reportWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(reportTitle)}</title><style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #17314d; font: 11px Arial, sans-serif; background: #fff; }
        .progress-report { page-break-after: always; }
        .progress-report:last-child { page-break-after: auto; }
        .report-header { border-bottom: 3px solid #2f74b9; padding-bottom: 12px; }
        .report-kicker { margin: 0 0 5px; color: #315f87; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
        h1 { margin: 0 0 12px; color: #173f63; font: 700 24px Georgia, serif; }
        h2 { margin: 0; color: #173f63; font-size: 14px; }
        h3 { margin: 0; color: #173f63; font-size: 12px; }
        .report-header dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0; }
        .report-date-meta { display: flex; flex-direction: column; align-items: flex-start; }
        .report-date-meta img { width: 156px; height: 156px; object-fit: contain; margin-bottom: 5px; }
        dt { color: #5a7188; font-size: 9px; font-weight: 700; text-transform: uppercase; }
        dd { margin: 3px 0 0; font-weight: 700; }
        .report-progress { margin: 14px 0; padding: 10px 12px; border: 1px solid #c5d7e8; border-left: 4px solid #2f74b9; background: #f2f8fc; }
        .report-progress strong { display: block; margin-top: 5px; color: #1f663d; font-size: 17px; }
        .report-progress p { margin: 4px 0 0; }
        .report-comments { margin: 14px 0; padding: 10px 12px; border: 1px solid #b9cce3; border-left: 4px solid #315f87; background: #f4f8fc; page-break-inside: avoid; }
        .report-comments h2 { margin-bottom: 6px; font-size: 14px; letter-spacing: .06em; }
        .report-comments p { margin: 0; line-height: 1.45; white-space: normal; }
        .report-next-steps { margin: 14px 0; padding: 10px 12px; border: 1px solid #d7c18e; border-left: 4px solid #b38424; background: #fffaf0; page-break-inside: avoid; }
        .report-next-steps.is-complete { border-color: #b7dbc3; border-left-color: #2f8b57; background: #eef8f1; }
        .report-next-steps h2 { color: #6b5218; font-size: 14px; letter-spacing: .06em; }
        .report-next-steps.is-complete h2 { color: #1f663d; }
        .report-next-step-intro { margin: 8px 0; font-weight: 700; }
        .report-next-step-group { margin-top: 9px; }
        .report-next-step-group h3 { margin: 0 0 4px; color: #6b5218; font-size: 11px; }
        .report-next-step-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px; margin-top: 4px; padding: 6px 8px; }
        .report-next-step-item strong { grid-column: 1 / -1; }
        .report-next-step-item span { color: #6b5218; font-size: 10px; font-weight: 700; }
        .report-next-step-item a { grid-column: 1 / -1; color: #1f5688; font-size: 10px; font-weight: 700; }
        .report-level { margin: 14px 0; padding: 8px 10px 10px; border: 1px solid #c5d7e8; page-break-inside: avoid; }
        .report-level-heading { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid #a8c5dd; border-left: 4px solid #2f74b9; background: #eaf3fa; text-transform: uppercase; letter-spacing: .04em; }
        .report-level-heading span { font-size: 11px; text-transform: none; letter-spacing: 0; }
        .report-section { margin: 8px 0 0; page-break-inside: avoid; }
        .report-section h3 { display: flex; justify-content: space-between; gap: 10px; padding: 7px 9px; border: 1px solid #c5d7e8; background: #f4f8fc; }
        .report-section h3 span { font-size: 10px; }
        .report-item { margin-top: 5px; padding: 4px 9px; }
        .report-item.complete,
        .report-item.linked,
        .report-item.required { background: transparent; border-color: transparent; }
        .report-item-heading { display: flex; justify-content: space-between; gap: 10px; }
        .report-item-heading span { white-space: nowrap; font-size: 10px; font-weight: 700; }
        .report-links { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 5px; }
        .report-links a { color: #1f5688; font-weight: 700; }
        .report-criteria-start { page-break-before: always; }
        .report-footer { position: fixed; right: 0; bottom: 0; left: 0; margin: 0; padding-top: 5px; border-top: 1px solid #c5d7e8; color: #5a7188; font-size: 9px; text-align: center; background: #fff; }
        .report-empty { padding: 12px; border: 1px dashed #b9cce3; }
    </style></head><body>${reports}</body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 250);
}

function generateIndividualProgressSummary() {
    const rows = buildProcessSummaryRows();
    const searchText = String(workState.studentSearch || "").trim().toLowerCase();
    const standard = normalizeTrackerStandardValue(workState.standardSearch);
    const matches = rows.filter((student) => !searchText || `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(searchText));
    if (matches.length !== 1) {
        setStatus("Filter to exactly one student name before generating an individual summary.", true);
        return;
    }
    openProgressSummaryPrintWindow(matches, standard || getAuthoritativeStudentProcessStandard(matches[0]));
}

function generateStandardProgressSummaries() {
    const standard = normalizeTrackerStandardValue(workState.standardSearch);
    if (!standard) {
        setStatus("Enter a process standard number before generating all summaries for a standard.", true);
        return;
    }
    const students = buildProcessSummaryRows().filter((student) => studentMatchesStandardSearch(student, standard));
    if (!students.length) {
        setStatus(`No students are allocated to ${standard}.`, true);
        return;
    }
    openProgressSummaryPrintWindow(students, standard);
}

function findCanonicalTaskTopic(topic) {
    const selectedKey = normalizeTaskTopicText(topic).toLowerCase();
    if (!selectedKey) return "";

    const topics = getOrderedTaskTopics();
    const match = topics.find((item) => normalizeTaskTopicText(item).toLowerCase() === selectedKey);
    return match || "";
}

function updateTaskQueryParam(taskTopic) {
    const safeTask = String(taskTopic || "").trim();
    if (!safeTask) return;

    const url = new URL(window.location.href);
    url.searchParams.set("task", safeTask);
    window.history.replaceState({}, "", url.toString());
}

function navigateTaskByDelta(delta) {
    const offset = Number(delta || 0);
    if (!offset) return;

    const topics = getOrderedTaskTopics();
    if (!topics.length) return;

    const selectedKey = normalizeTaskTopicText(workState.selectedTask).toLowerCase();
    const index = topics.findIndex((topic) => normalizeTaskTopicText(topic).toLowerCase() === selectedKey);
    if (index < 0) return;

    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= topics.length) return;

    workState.selectedTask = topics[nextIndex];
    updateTaskQueryParam(workState.selectedTask);
    renderSelectedTaskPage();
}

function renderTaskPageNavigation() {
    if (!isTaskDetailPage() || !taskPageNav || !taskPrevButton || !taskNextButton || !taskCurrentLabel) {
        return;
    }

    const topics = getOrderedTaskTopics();
    if (!topics.length) {
        taskPageNav.hidden = true;
        return;
    }

    const selectedKey = normalizeTaskTopicText(workState.selectedTask).toLowerCase();
    const index = topics.findIndex((topic) => normalizeTaskTopicText(topic).toLowerCase() === selectedKey);

    if (index < 0) {
        taskPageNav.hidden = true;
        return;
    }

    taskPageNav.hidden = false;
    taskCurrentLabel.textContent = `#${index + 1}/${topics.length}`;
    taskPrevButton.disabled = index === 0;
    taskNextButton.disabled = index === topics.length - 1;
}

function renderTaskLinks() {
    if (!taskLinkGrid) return;

    const grouped = new Map();
    workState.records.forEach((record) => {
        const key = record.topicKey;
        if (!grouped.has(key)) {
            grouped.set(key, {
                taskTopic: record.taskTopic,
                total: 0,
                slidesLinked: 0,
                submitted: 0
            });
        }

        const bucket = grouped.get(key);
        bucket.total += 1;
        if (record.googleSlidesUrl) bucket.slidesLinked += 1;
        if (record.submitted) bucket.submitted += 1;
    });

    const entries = Array.from(grouped.values()).sort((a, b) => compareTaskTopics(a.taskTopic, b.taskTopic));
    if (!entries.length) {
        taskLinkGrid.innerHTML = `<div class="work-empty">No assessment task items found yet.</div>`;
        return;
    }

    const groupLabels = {
        digital_outcome: "Digital Outcome Description",
        achieved: "Achieved Tasks",
        merit: "Merit Tasks",
        excellence: "Excellence Tasks",
        other: "Other Tasks"
    };

    const groupedEntries = {
        digital_outcome: [],
        achieved: [],
        merit: [],
        excellence: [],
        other: []
    };

    entries.forEach((item) => {
        const group = getTaskTopicGroup(item.taskTopic);
        if (!groupedEntries[group]) {
            groupedEntries.other.push(item);
            return;
        }
        groupedEntries[group].push(item);
    });

    const orderedGroups = ["digital_outcome", "achieved", "merit", "excellence", "other"];
    taskLinkGrid.innerHTML = orderedGroups
        .filter((group) => groupedEntries[group].length > 0)
        .map((group) => {
            const cardsHtml = groupedEntries[group].map((item) => {
                const href = `teacher-student-work-task.html?task=${encodeURIComponent(item.taskTopic)}`;
                return `
                    <article class="task-link-card">
                        <h3>${escapeHtml(item.taskTopic)}</h3>
                        <div class="task-link-meta">
                            <span>${item.total} student record${item.total === 1 ? "" : "s"}</span>
                            <span>${item.slidesLinked} Google Slides linked</span>
                            <span>${item.submitted} submitted</span>
                        </div>
                        <a href="${escapeHtml(href)}">Open page</a>
                    </article>
                `;
            }).join("");

            return `
                <section class="task-link-group">
                    <h3>${escapeHtml(groupLabels[group] || "Task Group")}</h3>
                    <div class="task-link-grid-group">
                        ${cardsHtml}
                    </div>
                </section>
            `;
        })
        .join("");
}

function renderSelectedTaskPage() {
    if (!tableHost || !trackerTitle || !trackerSummary) return;

    const selectedKey = normalizeTaskTopicText(workState.selectedTask).toLowerCase();
    const isProjectManagementTask = selectedKey.includes("project management");
    if (!selectedKey) {
        trackerTitle.textContent = "Select a task item page";
        trackerSummary.innerHTML = "";
        tableHost.innerHTML = `<div class="work-empty">Choose a task item from the cards above to see student evidence in one place.</div>`;
        renderTaskPageNavigation();
        return;
    }

    const rows = workState.records
        .filter((record) => record.topicKey === selectedKey)
        .sort((left, right) => {
            if (left.activityName !== right.activityName) {
                return left.activityName.localeCompare(right.activityName);
            }
            return left.studentEmail.localeCompare(right.studentEmail);
        });

    trackerTitle.textContent = `${workState.selectedTask} - Student Evidence`;

    if (!rows.length) {
        trackerSummary.innerHTML = "";
        tableHost.innerHTML = `<div class="work-empty">No student rows found for this task item yet.</div>`;
        renderTaskPageNavigation();
        return;
    }

    const slidesLinked = rows.filter((row) => Boolean(row.googleSlidesUrl)).length;
    const trelloLinked = rows.filter((row) => (Array.isArray(row.links) ? row.links : []).some((link) => /trello\.com/i.test(String(link?.url || "")))).length;
    const oneDriveLinked = rows.filter((row) => (Array.isArray(row.links) ? row.links : []).some((link) => /(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(String(link?.url || "")))).length;
    const googleDriveLinked = rows.filter((row) => (Array.isArray(row.links) ? row.links : []).some((link) => /drive\.google\.com/i.test(String(link?.url || "")))).length;
    const submittedCount = rows.filter((row) => Boolean(row.submitted)).length;
    const studentGroups = new Map();
    rows.forEach((row) => {
        const key = row.studentEmail;
        if (!studentGroups.has(key)) {
            studentGroups.set(key, []);
        }
        studentGroups.get(key).push(row);
    });

    const students = Array.from(studentGroups.entries())
        .map(([studentEmail, entries]) => ({
            studentEmail,
            studentName: String(entries[0]?.studentName || workState.studentNameByEmail.get(studentEmail) || formatNameFromEmail(studentEmail) || studentEmail).trim(),
            entries: entries.slice().sort((left, right) => left.activityName.localeCompare(right.activityName))
        }))
        .sort((left, right) => left.studentName.localeCompare(right.studentName));

    trackerSummary.innerHTML = `
        <span title="Total students">👥 ${students.length}</span>
        <span title="Total records">🧾 ${rows.length}</span>
        <span title="Trello linked">🗂 ${trelloLinked}</span>
        <span title="OneDrive linked">☁ M ${oneDriveLinked}</span>
        <span title="Google Drive linked">☁ G ${googleDriveLinked}</span>
        <span title="Submitted">✓ ${submittedCount}</span>
    `;

    tableHost.innerHTML = `
        <div class="work-table-wrap">
            <table class="work-table ${isProjectManagementTask ? "is-project-management" : ""}">
                <thead>
                    <tr>
                        <th>Learner</th>
                        <th>Tasks</th>
                        <th title="Submitted">✓</th>
                        ${isProjectManagementTask
                            ? `<th>Trello</th><th>OneDrive</th><th>Google Drive</th>`
                            : `<th>🔗</th>`
                        }
                        <th>Open</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map((student) => {
                        const submittedEntries = student.entries.filter((entry) => Boolean(entry.submitted));

                        const submittedCell = submittedEntries.length
                            ? `<span class="submitted-pill is-yes" title="${submittedEntries.length} of ${student.entries.length} submitted">✓ ${submittedEntries.length}/${student.entries.length}</span>`
                            : `<span class="submitted-pill is-no" title="No submitted records">○</span>`;

                        const uniqueOtherLinks = [];
                        const seenOtherLink = new Set();
                        const trelloLinks = [];
                        const oneDriveLinks = [];
                        const googleDriveLinks = [];
                        const seenTrello = new Set();
                        const seenOneDrive = new Set();
                        const seenGoogleDrive = new Set();

                        const addCategorizedLink = (collection, seenSet, label, url) => {
                            const safeUrl = toSafeExternalUrl(url);
                            if (!safeUrl || seenSet.has(safeUrl)) return;
                            seenSet.add(safeUrl);
                            collection.push({ label, url: safeUrl });
                        };

                        student.entries.forEach((entry) => {
                            (Array.isArray(entry.links) ? entry.links : []).forEach((link) => {
                                const url = String(link?.url || "").trim();
                                if (!url || url === entry.googleSlidesUrl) return;

                                if (/trello\.com/i.test(url)) {
                                    addCategorizedLink(trelloLinks, seenTrello, "Trello", url);
                                    return;
                                }
                                if (/(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(url)) {
                                    addCategorizedLink(oneDriveLinks, seenOneDrive, "OneDrive", url);
                                    return;
                                }
                                if (/drive\.google\.com/i.test(url)) {
                                    addCategorizedLink(googleDriveLinks, seenGoogleDrive, "Google Drive", url);
                                    return;
                                }

                                const activityLabel = compactLabel(entry.activityName, 16);
                                const label = `${activityLabel} ${String(link?.label || "Link").trim()}`;
                                if (seenOtherLink.has(url)) return;
                                seenOtherLink.add(url);
                                uniqueOtherLinks.push({ label, url });
                            });
                        });

                        const linksCell = uniqueOtherLinks.length
                            ? `<div class="work-link-list">${uniqueOtherLinks.map((link) => buildChipLink(link.url, link.label)).join("")}</div>`
                            : "-";
                        const trelloCell = trelloLinks.length
                            ? `<div class="work-link-list">${trelloLinks.map((link) => buildChipLink(link.url, link.label)).join("")}</div>`
                            : "-";
                        const oneDriveCell = oneDriveLinks.length
                            ? `<div class="work-link-list">${oneDriveLinks.map((link) => buildChipLink(link.url, link.label)).join("")}</div>`
                            : "-";
                        const googleDriveCell = googleDriveLinks.length
                            ? `<div class="work-link-list">${googleDriveLinks.map((link) => buildChipLink(link.url, link.label)).join("")}</div>`
                            : "-";

                        const taskLinksCell = `<div class="work-link-list">${student.entries.map((entry) => buildChipLink(entry.taskUrl, entry.activityName)).join("")}</div>`;

                        const assessmentsCell = `<div class="work-link-list">${student.entries.map((entry) => `<span title="${escapeHtml(entry.activityName)}">${escapeHtml(compactLabel(entry.activityName))}</span>`).join("")}</div>`;

                        return `
                            <tr>
                                <td>${escapeHtml(student.studentName)}</td>
                                <td>${assessmentsCell}</td>
                                <td>${submittedCell}</td>
                                ${isProjectManagementTask
                                    ? `<td>${trelloCell}</td><td>${oneDriveCell}</td><td>${googleDriveCell}</td>`
                                    : `<td>${linksCell}</td>`
                                }
                                <td>${taskLinksCell}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;

    renderTaskPageNavigation();
}

function readSelectedTaskFromUrl() {
    const params = new URLSearchParams(window.location.search || "");
    workState.selectedTask = String(params.get("task") || "").trim();
}

function readTrackerViewFromUrl() {
    const standard = normalizeTrackerStandardValue(trackerViewParams.get("standard"));
    if (/^(91897|91907)$/.test(standard)) {
        workState.standardSearch = standard;
        if (standardSearchInput) standardSearchInput.value = standard;
    } else if (/^(91893|91903)$/.test(standard)) {
        workState.digitalMediaStandardSearch = standard;
        if (digitalMediaStandardSearchInput) digitalMediaStandardSearchInput.value = standard;
    } else if (/^(92006|91898|91908|92007|91899|91909)$/.test(standard)) {
        workState.externalStandardFilter = standard;
        if (externalStandardFilter) externalStandardFilter.value = standard;
    }
}

function wireTaskNavigationEvents() {
    if (!taskPrevButton || !taskNextButton) return;
    taskPrevButton.addEventListener("click", () => navigateTaskByDelta(-1));
    taskNextButton.addEventListener("click", () => navigateTaskByDelta(1));
}

function wireStudentSearchEvents() {
    if (studentSearchInput) {
        studentSearchInput.addEventListener("input", () => {
            syncStudentNameFilters(studentSearchInput.value);
        });
    }
    if (standardSearchInput) {
        standardSearchInput.addEventListener("input", () => {
            workState.standardSearch = String(standardSearchInput.value || "");
            renderStudentSummaryGrid();
            renderStudentTrackerComments();
        });
    }
    if (digitalMediaStudentSearchInput) {
        digitalMediaStudentSearchInput.addEventListener("input", () => {
            syncStudentNameFilters(digitalMediaStudentSearchInput.value);
        });
    }
    if (digitalMediaStandardSearchInput) {
        digitalMediaStandardSearchInput.addEventListener("input", () => {
            workState.digitalMediaStandardSearch = String(digitalMediaStandardSearchInput.value || "");
            renderDigitalMediaSummaryGrid();
        });
    }
}

function wireProgressSummaryEvents() {
    generateIndividualSummaryButton?.addEventListener("click", generateIndividualProgressSummary);
    generateStandardSummariesButton?.addEventListener("click", generateStandardProgressSummaries);
    generateDigitalMediaIndividualButton?.addEventListener("click", () => {
        const query = String(workState.digitalMediaStudentSearch || "").trim().toLowerCase();
        const standard = normalizeTrackerStandardValue(workState.digitalMediaStandardSearch);
        const matches = buildDigitalMediaSummaryRows().filter((student) => !query || `${student.studentName} ${student.studentEmail}`.toLowerCase().includes(query));
        if (matches.length !== 1) {
            setStatus("Filter to exactly one Digital Media student before generating an individual summary.", true);
            return;
        }
        openProgressSummaryPrintWindow(matches, standard || getAuthoritativeStudentProcessStandard(matches[0]));
    });
    generateDigitalMediaStandardButton?.addEventListener("click", () => {
        const standard = normalizeTrackerStandardValue(workState.digitalMediaStandardSearch);
        if (!/^(91893|91903)$/.test(standard)) {
            setStatus("Enter Digital Media standard 91893 or 91903 before generating all summaries.", true);
            return;
        }
        const matches = buildDigitalMediaSummaryRows().filter((student) => studentMatchesStandardSearch(student, standard));
        if (!matches.length) {
            setStatus(`No students are allocated to ${standard}.`, true);
            return;
        }
        openProgressSummaryPrintWindow(matches, standard);
    });
}

function wireStudentSummaryEvents() {
    if (window.__dtechStudentSummaryEventsBound) return;
    window.__dtechStudentSummaryEventsBound = true;
    document.addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-student-summary-email][data-student-summary-group]");
        if (!button) return;
        const email = String(button.getAttribute("data-student-summary-email") || "").trim().toLowerCase();
        const group = String(button.getAttribute("data-student-summary-group") || "").trim();
        const isDigitalMedia = button.getAttribute("data-student-summary-kind") === "digital-media";
        const alreadyOpen = (isDigitalMedia ? workState.expandedDigitalMediaStudent : workState.expandedSummaryStudent) === email
            && (isDigitalMedia ? workState.expandedDigitalMediaGroup : workState.expandedSummaryGroup) === group;
        if (isDigitalMedia) {
            workState.expandedDigitalMediaStudent = alreadyOpen ? "" : email;
            workState.expandedDigitalMediaGroup = alreadyOpen ? "" : group;
            renderDigitalMediaSummaryGrid();
        } else {
            workState.expandedSummaryStudent = alreadyOpen ? "" : email;
            workState.expandedSummaryGroup = alreadyOpen ? "" : group;
            renderStudentSummaryGrid();
        }
    });
}

async function init() {
    try {
        setStatus("Checking access...");
        const accessOk = await enforceAccess();
        if (!accessOk) return;

        setStatus("Loading assessment tasks and student evidence...");
        const activities = await fetchJson("/api/activities", { headers: withAuthHeaders() });
        const [classManagementPayload, externalAssessmentPayload] = await Promise.all([
            fetchJson("/api/class-management/students?current_only=false&dtech_only=false", { headers: withAuthHeaders() }).catch(() => ({})),
            fetchJson("/api/external-assessment-allocations", { headers: withAuthHeaders() }).catch(() => ({ allocations: [] }))
        ]);

        const activityRows = Array.isArray(activities) ? activities : [];
        workState.studentNameByEmail = buildStudentNameMap(classManagementPayload?.students);
        workState.externalAssessmentStudents = buildExternalAssessmentStudents(classManagementPayload?.students);
        const assessmentActivities = activityRows.filter((activity) => String(activity?.activity_category || activity?.category || "").toLowerCase().includes("assessment"));
        const interestRows = await Promise.all(
            assessmentActivities.map(async (activity) => {
                const projectId = String(activity?.id || "").trim();
                if (!projectId) return null;
                try {
                    const response = await fetchJson(`/api/activities/${encodeURIComponent(projectId)}/interests`, { headers: withAuthHeaders() });
                    return {
                        project_id: projectId,
                        students: Array.isArray(response?.students) ? response.students : []
                    };
                } catch (_error) {
                    return {
                        project_id: projectId,
                        students: []
                    };
                }
            })
        );
        workState.activitiesById = new Map(activityRows.map((row) => [String(row?.id || "").trim(), row]));
        workState.interestRows = interestRows.filter(Boolean);
        workState.records = buildAllRecords();
        workState.externalAssessmentAllocations = new Map(
            (Array.isArray(externalAssessmentPayload?.allocations) ? externalAssessmentPayload.allocations : [])
                .map((allocation) => [normalizeEmail(allocation?.student_email), allocation])
                .filter(([studentEmail]) => studentEmail)
        );
        readSelectedTaskFromUrl();
        readTrackerViewFromUrl();

        const canonicalSelectedTask = findCanonicalTaskTopic(workState.selectedTask);
        if (canonicalSelectedTask) {
            workState.selectedTask = canonicalSelectedTask;
            updateTaskQueryParam(workState.selectedTask);
        } else if (isTaskDetailPage()) {
            const topics = getOrderedTaskTopics();
            if (topics.length) {
                workState.selectedTask = topics[0];
                updateTaskQueryParam(workState.selectedTask);
            }
        }

        wireTaskNavigationEvents();
        wireStudentSearchEvents();
        wireStudentSummaryEvents();
        wireProgressSummaryEvents();
        wireStudentTrackerComments();
        wireExternalAssessmentEvents();

        await loadStudentTrackerComments();
        renderStudentSummaryGrid();
        renderStudentTrackerComments();
        renderDigitalMediaSummaryGrid();
        renderExternalAssessmentGrid();
        renderTaskLinks();
        renderSelectedTaskPage();
        setStatus("Student work task pages ready.");
    } catch (error) {
        setStatus(error?.message || "Could not load student work task pages.", true);
    }
}

init();
