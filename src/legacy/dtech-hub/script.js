const baseProjects = [
    {
        id: "python-debug-lab",
        title: "Python Debug Lab",
        className: "Year 11 Computer Lab",
        area: "Programming",
        activityCategory: "Activity",
        showThisWeek: false, // was true, now false to remove from current activities
        status: "active",
        term: "Term 2",
        updated: "2026-05-06",
        href: "ProjectPages/python-debug-lab.html",
        external: false,
        summary: "Track down logic bugs, run tests, and improve code quality with guided debugging missions.",
        keywords: ["python", "debugging", "logic", "troubleshooting", "code fixes"],
        visual: {
            icon: "PY",
            label: "Debug Mission",
            palette: "linear-gradient(135deg, #8d316f 0%, #b15186 56%, #c96e9c 100%)"
        }
    },
    {
        id: "web-ui-remix",
        title: "Web UI Remix",
        className: "Year 10 Computer Lab",
        area: "Web Design",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "active",
        term: "Term 2",
        updated: "2026-05-05",
        href: "ProjectPages/web-ui-remix.html",
        external: false,
        summary: "Re-style an existing page with stronger visual hierarchy, accessibility checks, and responsive layout improvements.",
        keywords: ["html", "css", "ui", "layout", "responsive"],
        visual: {
            icon: "UI",
            label: "Design Sprint",
            palette: "linear-gradient(135deg, #8c5a2a 0%, #b67a3c 52%, #d39552 100%)"
        }
    },
    {
        id: "robotics-control-board",
        title: "Robotics Control Board",
        className: "Year 12 Computer Lab",
        area: "Physical Computing",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "active",
        term: "Term 2",
        updated: "2026-05-04",
        href: "ProjectPages/robotics-control-board.html",
        external: false,
        summary: "Build and monitor microcontroller projects, capture test data, and document each hardware iteration.",
        keywords: ["robotics", "microcontroller", "hardware", "prototyping", "testing"],
        visual: {
            icon: "RB",
            label: "Control Build",
            palette: "linear-gradient(135deg, #236d8c 0%, #2f95b2 48%, #4ab5cc 100%)"
        }
    },
    {
        id: "data-visual-story",
        title: "Data Visual Story",
        className: "Year 12 Computer Lab",
        area: "Data Skills",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "planning",
        term: "Term 2",
        updated: "2026-05-03",
        href: "ProjectPages/data-visual-story.html",
        external: false,
        summary: "Convert class data into clear visual dashboards and short evidence-based stories for assessment.",
        keywords: ["data", "charts", "dashboard", "analysis", "storytelling"],
        visual: {
            icon: "DS",
            label: "Data Narrative",
            palette: "linear-gradient(135deg, #2e7a56 0%, #3f9e70 52%, #5fbf8a 100%)"
        }
    },
    {
        id: "cyber-safety-lab",
        title: "Cyber Safety Lab",
        className: "Year 9 Computer Lab",
        area: "Cyber Security",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "planning",
        term: "Term 2",
        updated: "2026-05-01",
        href: "ProjectPages/cyber-safety-lab.html",
        external: false,
        summary: "Learn password hygiene, phishing detection, and practical online safety routines through mini challenges.",
        keywords: ["cyber", "security", "phishing", "privacy", "safety"],
        visual: {
            icon: "CS",
            label: "Cyber Basics",
            palette: "linear-gradient(135deg, #5d267d 0%, #7f35a8 54%, #9a4bc0 100%)"
        }
    },
    {
        id: "digital-portfolio-studio",
        title: "Digital Portfolio Studio",
        className: "Year 11 Computer Lab",
        area: "Digital Learning",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "archive",
        term: "Term 1",
        updated: "2026-03-28",
        href: "ProjectPages/digital-portfolio-studio.html",
        external: false,
        summary: "An archive of published reflections, checkpoints, and final showcase evidence from prior units.",
        keywords: ["portfolio", "digital", "showcase", "reflection", "archive"],
        visual: {
            icon: "DP",
            label: "Portfolio Archive",
            palette: "linear-gradient(135deg, #4d3ba0 0%, #6a58b5 52%, #8a75c4 100%)"
        }
    },
    {
        id: "maker-lab-builds",
        title: "Maker Lab Builds",
        className: "Year 13 Computer Lab",
        area: "STEM Projects",
        activityCategory: "Activity",
        showThisWeek: false,
        status: "archive",
        term: "Term 1",
        updated: "2026-02-14",
        href: "ProjectPages/maker-lab-builds.html",
        external: false,
        summary: "Archived prototypes, sprint notes, and build logs from fabrication and automation challenges.",
        keywords: ["maker", "engineering", "builds", "prototypes", "stem"],
        visual: {
            icon: "ML",
            label: "Prototype Archive",
            palette: "linear-gradient(135deg, #4d4f67 0%, #676c86 50%, #8b90a8 100%)"
        }
    }
];

const baseLabProjects = [
    {
        id: "lab-project-maker-builds",
        title: "Maker Lab Builds",
        className: "Year 13 Computer Lab",
        projectPhase: "Build",
        status: "active",
        showThisWeek: false, // was true, now false to remove from current activities
        term: "Term 2",
        updated: "2026-05-09",
        href: "ProjectPages/maker-lab-builds.html",
        external: false,
        summary: "Teams are fabricating prototypes and logging workshop test cycles for automation concepts.",
        keywords: ["maker", "prototype", "build", "workshop"],
        visual: {
            icon: "ML",
            label: "Build Phase",
            palette: "linear-gradient(135deg, #4d4f67 0%, #676c86 50%, #8b90a8 100%)"
        }
    },
    {
        id: "lab-project-robotics-iterations",
        title: "Robotics Iterations",
        className: "Year 12 Computer Lab",
        projectPhase: "Testing",
        status: "active",
        showThisWeek: false,
        term: "Term 2",
        updated: "2026-05-08",
        href: "ProjectPages/robotics-control-board.html",
        external: false,
        summary: "Control boards are being tested and tuned using repeated sensor calibration loops.",
        keywords: ["robotics", "testing", "sensors", "microcontroller"],
        visual: {
            icon: "RB",
            label: "Testing Sprint",
            palette: "linear-gradient(135deg, #236d8c 0%, #2f95b2 48%, #4ab5cc 100%)"
        }
    },
    {
        id: "lab-project-digital-portfolio-showcase",
        title: "Portfolio Showcase Build",
        className: "Year 11 Computer Lab",
        projectPhase: "Showcase",
        status: "planning",
        showThisWeek: false,
        term: "Term 2",
        updated: "2026-05-07",
        href: "ProjectPages/digital-portfolio-studio.html",
        external: false,
        summary: "Students are curating evidence and preparing public-facing portfolio displays.",
        keywords: ["portfolio", "showcase", "presentation", "evidence"],
        visual: {
            icon: "DP",
            label: "Showcase Prep",
            palette: "linear-gradient(135deg, #4d3ba0 0%, #6a58b5 52%, #8a75c4 100%)"
        }
    },
    {
        id: "lab-project-ui-redesign-track",
        title: "UI Redesign Track",
        className: "Year 10 Computer Lab",
        projectPhase: "Prototype",
        status: "planning",
        showThisWeek: false,
        term: "Term 2",
        updated: "2026-05-05",
        href: "ProjectPages/web-ui-remix.html",
        external: false,
        summary: "Interface concepts are being prototyped and reviewed before final implementation.",
        keywords: ["ui", "prototype", "web", "design"],
        visual: {
            icon: "UI",
            label: "Prototype",
            palette: "linear-gradient(135deg, #8c5a2a 0%, #b67a3c 52%, #d39552 100%)"
        }
    },
    {
        id: "lab-project-cyber-challenge",
        title: "Cyber Challenge Series",
        className: "Year 9 Computer Lab",
        projectPhase: "Planning",
        status: "archive",
        showThisWeek: false,
        term: "Term 1",
        updated: "2026-04-28",
        href: "ProjectPages/cyber-safety-lab.html",
        external: false,
        summary: "Archived challenge banks and reflective writeups from prior cyber missions.",
        keywords: ["cyber", "challenge", "security", "archive"],
        visual: {
            icon: "CS",
            label: "Challenge Track",
            palette: "linear-gradient(135deg, #5d267d 0%, #7f35a8 54%, #9a4bc0 100%)"
        }
    }
];


let projects = [...baseProjects];
let labProjects = [...baseLabProjects];
let lessons = [];
let standardCards = [];
let homepageLibraryLoad = null;
let homepageLibraryEmail = null;
let homepageLibraryLoadingEmail = null;

// Dynamically load backend activities and refresh library
async function refreshActivitiesLibrary() {
    const email = getActiveHubEmail();
    if (homepageLibraryLoad) {
        return homepageLibraryLoadingEmail === email
            ? homepageLibraryLoad
            : homepageLibraryLoad.then(() => refreshActivitiesLibrary());
    }
    homepageLibraryLoadingEmail = email;
    homepageLibraryLoad = (async () => {
        const [sharedProjects, sharedLessons, sharedStandardCards] = await Promise.all([
            loadSharedProjects(),
            loadSharedLessons(),
            loadAssessmentStandardCardsForLibrary()
        ]);
        if (getActiveHubEmail() !== email) return;
        projects = mergeProjects(sharedProjects);
        lessons = sharedLessons;
        standardCards = sharedStandardCards;
        homepageLibraryEmail = email;
        renderCurrentWeek();
        renderLibrary();
    })().finally(() => { homepageLibraryLoad = null; });
    return homepageLibraryLoad;
}

window.addEventListener("hub-auth-state-changed", (event) => {
    if (!isHomepagePath()) return;

    if (event.detail?.signedIn) {
        if (homepageLibraryEmail !== getActiveHubEmail()) void refreshActivitiesLibrary();
        return;
    }

    homepageLibraryEmail = null;
    lessons = [];
    renderCurrentWeek();
    renderLibrary();
});

function colorToPalette(colorName) {
    const palettes = {
        rose: "linear-gradient(135deg, #8d316f 0%, #b15186 56%, #c96e9c 100%)",
        azure: "linear-gradient(135deg, #236d8c 0%, #2f95b2 48%, #4ab5cc 100%)",
        amber: "linear-gradient(135deg, #8c5a2a 0%, #b67a3c 52%, #d39552 100%)",
        violet: "linear-gradient(135deg, #5d267d 0%, #7f35a8 54%, #9a4bc0 100%)",
        teal: "linear-gradient(135deg, #2e7a56 0%, #3f9e70 52%, #5fbf8a 100%)",
        slate: "linear-gradient(135deg, #4d4f67 0%, #676c86 50%, #8b90a8 100%)"
    };

    return palettes[String(colorName || "").toLowerCase()] || palettes.rose;
}

function getDefaultCardColorForCategory(categoryValue, sourceType = "") {
    const category = String(categoryValue || "").trim().toLowerCase();
    const source = String(sourceType || "").trim().toLowerCase();

    if (category.includes("task topic")) return "Azure";
    if (category.includes("standard")) return "Teal";
    if (category.includes("lesson") || source === "lesson") return "Rose";
    if (category.includes("assessment") || source === "assessment") return "Slate";
    if (category.includes("project") || source === "project") return "Violet";
    if (category.includes("activity") || category.includes("practice") || source === "activity") return "Amber";

    return "Amber";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function textToIcon(text) {
    return String(text || "CL")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("") || "CL";
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function splitTaskTopicSegments(value) {
    const text = String(value || "").trim();
    if (!text) return [];

    const bulletSplitRegex = /[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/;
    if (!bulletSplitRegex.test(text)) {
        return [text];
    }

    const parts = text
        .split(bulletSplitRegex)
        .map((segment) => String(segment || "").trim())
        .filter(Boolean);

    if (!parts.length) {
        return [];
    }

    const startsWithBullet = /^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/.test(text);
    return startsWithBullet ? parts : parts.slice(1);
}

function normalizeTaskTopicRows(value) {
    const rows = Array.isArray(value)
        ? value
        : String(value || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

    const expanded = rows
        .flatMap((row) => splitTaskTopicSegments(row))
        .map((row) => String(row || "").trim())
        .map((row) => row.replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "").trim())
        .map((row) => row.replace(/^[\-*]\s*/, "").trim())
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

function collectTaskTopicsFromActivityRecord(record) {
    const taskListRows = normalizeTaskTopicRows(record?.tasks_list);
    const grouped = taskListRows.length
        ? taskListRows
        : [
            ...normalizeTaskTopicRows(record?.achieved),
            ...normalizeTaskTopicRows(record?.merit),
            ...normalizeTaskTopicRows(record?.excellence)
        ];

    const seen = new Set();
    const unique = [];
    grouped.forEach((row) => {
        const key = String(row || "").toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push(String(row || "").trim());
    });

    return unique;
}

function normalizeStandardDetailsRows(value) {
    const rows = Array.isArray(value)
        ? value
        : String(value || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

    return rows
        .map((row) => String(row || "").trim())
        .filter(Boolean);
}

function extractPrimaryStandardNumber(standardDetails) {
    const rows = normalizeStandardDetailsRows(standardDetails);
    for (const row of rows) {
        const match = String(row).match(/\b\d{4,6}\b/);
        if (match && match[0]) {
            return match[0];
        }
    }
    return "";
}

function generateTaskShortName(taskText) {
    const raw = String(taskText || "").trim();
    if (!raw) {
        return "";
    }

    const normalized = raw.toLowerCase();
    const phraseMap = [
        { pattern: /project\s+management/, label: "Project Management" },
        { pattern: /relevant\s+implications/, label: "Relevant Implications" },
        { pattern: /version\s+control/, label: "Version Control" },
        { pattern: /digital\s+technologies\s+outcome/, label: "Digital Outcome" },
        { pattern: /decompos/, label: "Decomposition" },
        { pattern: /triall?ing\s+multiple\s+components/, label: "Component Trialling" },
        { pattern: /triall?ing\s+the\s+components/, label: "Component Trialling" },
        { pattern: /testing\s+that/, label: "Functional Testing" },
        { pattern: /using\s+information\s+appropriately/, label: "Testing Insights" },
        { pattern: /discussing\s+how/, label: "Planning Insights" }
    ];

    for (const entry of phraseMap) {
        if (entry.pattern.test(normalized)) {
            return entry.label;
        }
    }

    const stopwords = new Set([
        "the", "and", "for", "with", "from", "that", "this", "into", "using", "use", "how",
        "which", "are", "was", "were", "have", "has", "had", "its", "their", "these", "those",
        "plan", "development", "digital", "technologies", "outcome", "components"
    ]);

    const keywords = normalized
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !stopwords.has(word));

    if (!keywords.length) {
        return raw;
    }

    const shortWords = keywords.slice(0, 2).map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    return shortWords.join(" ");
}

const TASK_TOPIC_MERGE_PREFS_KEY = "dtechHub:taskTopicMergePrefs:v1";
const TASK_TOPIC_SHORT_NAME_OVERRIDES_KEY = "dtechHub:taskTopicShortNameOverrides:v1";

function normalizeTaskTopicLookupKey(topicText) {
    return String(topicText || "").trim().toLowerCase();
}

function readTaskTopicShortNameOverrides() {
    try {
        const raw = localStorage.getItem(TASK_TOPIC_SHORT_NAME_OVERRIDES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeTaskTopicShortNameOverrides(value) {
    try {
        localStorage.setItem(TASK_TOPIC_SHORT_NAME_OVERRIDES_KEY, JSON.stringify(value));
    } catch (_error) {
        // Ignore storage errors.
    }
}

function getStoredTaskTopicShortName(projectId, topicText) {
    const safeProjectId = String(projectId || "").trim();
    const topicKey = normalizeTaskTopicLookupKey(topicText);
    if (!safeProjectId || !topicKey) {
        return "";
    }

    const all = readTaskTopicShortNameOverrides();
    const projectMap = all[safeProjectId] && typeof all[safeProjectId] === "object" ? all[safeProjectId] : {};
    return String(projectMap[topicKey] || "").trim();
}

function setStoredTaskTopicShortName(projectId, topicText, shortName) {
    const safeProjectId = String(projectId || "").trim();
    const topicKey = normalizeTaskTopicLookupKey(topicText);
    if (!safeProjectId || !topicKey) {
        return;
    }

    const all = readTaskTopicShortNameOverrides();
    const projectMap = all[safeProjectId] && typeof all[safeProjectId] === "object" ? all[safeProjectId] : {};
    const nextShortName = String(shortName || "").trim();

    if (nextShortName) {
        projectMap[topicKey] = nextShortName;
        all[safeProjectId] = projectMap;
    } else {
        delete projectMap[topicKey];
        if (Object.keys(projectMap).length) {
            all[safeProjectId] = projectMap;
        } else {
            delete all[safeProjectId];
        }
    }

    writeTaskTopicShortNameOverrides(all);
}

if (typeof window !== "undefined") {
    window.hubGetTaskTopicShortNameOverride = getStoredTaskTopicShortName;
    window.hubSetTaskTopicShortNameOverride = setStoredTaskTopicShortName;
}

function readTaskTopicMergePrefs() {
    try {
        const raw = localStorage.getItem(TASK_TOPIC_MERGE_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeTaskTopicMergePrefs(value) {
    try {
        localStorage.setItem(TASK_TOPIC_MERGE_PREFS_KEY, JSON.stringify(value));
    } catch (_error) {
        // Ignore storage errors.
    }
}

function getTaskTopicMergeSignature(topics) {
    return (Array.isArray(topics) ? topics : [])
        .map((topic) => String(topic || "").trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join("||");
}

function normalizeTaskTopicList(topics) {
    const seen = new Set();
    const output = [];

    (Array.isArray(topics) ? topics : []).forEach((topic) => {
        const safeTopic = String(topic || "").trim();
        if (!safeTopic) {
            return;
        }

        const key = safeTopic.toLowerCase();
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        output.push(safeTopic);
    });

    return output;
}

function setTaskTopicMergePreference(projectId, topics, shouldMerge) {
    const safeProjectId = String(projectId || "").trim();
    const safeTopics = normalizeTaskTopicList(topics);
    const signature = getTaskTopicMergeSignature(safeTopics);
    if (!safeProjectId || !signature) {
        return;
    }

    const allPrefs = readTaskTopicMergePrefs();
    const projectPrefs = allPrefs[safeProjectId] && typeof allPrefs[safeProjectId] === "object" ? allPrefs[safeProjectId] : {};
    projectPrefs[signature] = {
        merge: Boolean(shouldMerge),
        updatedAt: new Date().toISOString()
    };
    allPrefs[safeProjectId] = projectPrefs;
    writeTaskTopicMergePrefs(allPrefs);
}

function clearTaskTopicMergePreference(projectId, topics) {
    const safeProjectId = String(projectId || "").trim();
    const safeTopics = normalizeTaskTopicList(topics);
    if (!safeProjectId || !safeTopics.length) {
        return;
    }

    const selectedTopicKeys = new Set(safeTopics.map((topic) => topic.toLowerCase()));
    const allPrefs = readTaskTopicMergePrefs();
    const projectPrefs = allPrefs[safeProjectId] && typeof allPrefs[safeProjectId] === "object" ? allPrefs[safeProjectId] : {};
    let changed = false;

    Object.keys(projectPrefs).forEach((signature) => {
        const signatureTopics = String(signature || "")
            .split("||")
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean);
        if (!signatureTopics.length) {
            return;
        }

        const containsAllSelected = Array.from(selectedTopicKeys.values()).every((key) => signatureTopics.includes(key));
        if (containsAllSelected) {
            delete projectPrefs[signature];
            changed = true;
        }
    });

    if (!changed) {
        return;
    }

    if (Object.keys(projectPrefs).length) {
        allPrefs[safeProjectId] = projectPrefs;
    } else {
        delete allPrefs[safeProjectId];
    }

    writeTaskTopicMergePrefs(allPrefs);
}

function extractTaskTopicQualifier(topicText) {
    const words = String(topicText || "")
        .trim()
        .split(/\s+/)
        .map((word) => String(word || "").trim())
        .filter(Boolean);

    if (!words.length) {
        return "";
    }

    const firstWord = words[0].replace(/[^a-z]/gi, "");
    if (!firstWord) {
        return "";
    }

    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

function resolveTaskTopicMergeDecision(project, shortName, topics) {
    const canPromptForMerge = hasAllowedSignedInHubAccount() && hubAccessState.canAdmin;
    if (!canPromptForMerge) {
        return false;
    }

    const projectId = String(project?.id || "").trim();
    const signature = getTaskTopicMergeSignature(topics);
    if (!projectId || !signature) {
        return false;
    }

    const allPrefs = readTaskTopicMergePrefs();
    const projectPrefs = allPrefs[projectId] && typeof allPrefs[projectId] === "object" ? allPrefs[projectId] : {};
    const existing = projectPrefs[signature];

    if (existing && typeof existing.merge === "boolean") {
        return existing.merge;
    }

    if (typeof window === "undefined" || typeof window.confirm !== "function") {
        return false;
    }

    const promptMessage = [
        `Possible duplicate Task Topics found for \"${project?.title || "this assessment"}\".`,
        "",
        ...topics.map((topic) => `- ${topic}`),
        "",
        `Merge into one topic called \"${shortName}\"?`,
        "",
        "OK = Merge",
        "Cancel = Keep separate"
    ].join("\n");

    const shouldMerge = window.confirm(promptMessage);
    projectPrefs[signature] = {
        merge: shouldMerge,
        updatedAt: new Date().toISOString()
    };
    allPrefs[projectId] = projectPrefs;
    writeTaskTopicMergePrefs(allPrefs);

    return shouldMerge;
}

function shouldHideStudentAssessmentTask(standard, text) {
    const safeStandard = String(standard || "").trim();
    const normalizedText = String(text || "")
        .trim()
        .replace(/^(?:Achieved|Merit|Excellence)\s*:\s*/i, "")
        .replace(/\s+/g, " ")
        .replace(/[.]+$/, "")
        .toLowerCase();

    return safeStandard === "91897"
        && normalizedText === "list the key features or requirements the outcome must include";
}

if (typeof window !== "undefined") {
    window.hubShouldHideStudentAssessmentTask = shouldHideStudentAssessmentTask;
}

function inferSourceTypeFromRecord(record) {
    const explicitType = String(record?.sourceType || "").toLowerCase();
    if (explicitType === "capsule" || explicitType === "project" || explicitType === "activity" || explicitType === "assessment" || explicitType === "standard" || explicitType === "lesson" || explicitType === "relief-lesson" || explicitType === "task-topic") {
        return explicitType;
    }

    const title = String(record?.title || record?.name || "").trim().toLowerCase();
    if (title.includes("tinkercad")) {
        return "activity";
    }

    const category = String(record?.activityCategory || record?.activity_category || record?.category || "").toLowerCase();
    if (category.includes("assessment")) {
        return "assessment";
    }
    if (category.includes("standard")) {
        return "standard";
    }
    if (category.includes("lesson")) {
        return category.includes("relief") ? "relief-lesson" : "lesson";
    }
    if (category.includes("task topic")) {
        return "task-topic";
    }
    if (category.includes("project")) {
        return "project";
    }

    const hasLessonFields = Boolean(
        record?.lesson_title ||
        record?.lesson_type ||
        record?.lesson_focus ||
        record?.lesson_year_level ||
        record?.activity_name
    );

    if (hasLessonFields) {
        return "lesson";
    }

    const hasMeaningfulValue = (value) => {
        if (Array.isArray(value)) {
            return value.map((item) => String(item || "").trim()).filter(Boolean).length > 0;
        }

        const text = String(value || "").trim();
        if (!text) return false;
        if (text === "[]" || text === "{}") return false;

        const lowered = text.toLowerCase();
        if (lowered === "null" || lowered === "undefined" || lowered === "none" || lowered === "n/a") return false;

        return true;
    };

    const hasProjectFields = [
        record?.start_date,
        record?.startDate,
        record?.contact_name,
        record?.contactName,
        record?.contact_email,
        record?.contactEmail,
        record?.company,
        record?.address,
        record?.overview,
        record?.services,
        record?.costs,
        record?.outcomes
    ].some((value) => hasMeaningfulValue(value));

    const hasExplicitActivityCategory = category === "activity" || category.includes("skill activity") || category.includes("practice");
    if (hasExplicitActivityCategory) {
        return hasProjectFields ? "project" : "activity";
    }

    const assessmentSchemaKeys = [
        "assessment_focus",
        "standard_details",
        "tasks_list",
        "achieved",
        "merit",
        "excellence",
        "submission_requirements",
        "relevant_implications",
        "progress_logging",
        "feedback_trialling"
    ];

    const hasAssessmentContent = assessmentSchemaKeys.some((key) => hasMeaningfulValue(record?.[key]));
    if (hasAssessmentContent) {
        return "assessment";
    }

    const assessmentText = [
        record?.title,
        record?.name,
        record?.summary,
        record?.description
    ]
        .map((value) => String(value || "").trim().toLowerCase())
        .join(" ");

    if (/\bassessment\b/.test(assessmentText)) {
        return "assessment";
    }

    return hasProjectFields ? "project" : "activity";
}

function isGeneratedUploadedActivityImageUrl(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) {
        return false;
    }

    return raw.includes("placehold.co/900x560/3f89cf/ffffff")
        && raw.includes("uploaded+activity");
}

async function loadSharedProjects() {
    try {
        const response = await fetch("/api/activities");
        if (!response.ok) return [];

        const parsed = await response.json();
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => {
                const rawTitle = String(item.name || "").trim();
                const isTrainingCapsule = rawTitle === "Commenting and Debugging Training";
                const isClientProjectsAssessment = String(item.id || "").trim() === "49"
                    || /^client\s+projects$/i.test(rawTitle);
                const title = isClientProjectsAssessment ? "Process Assessment" : rawTitle;
                if (!title) return null;

                const id = String(item.id || slugify(title) || `activity-${Date.now()}`);
                const yearLevel = String(item.year_level || "Year 9").trim();
                const type = String(item.type || "Digital Learning").trim();
                const category = isTrainingCapsule ? "Capsule" : String(item.activity_category || item.category || "Activity").trim();
                const summary = String(item.description || "").trim();
                const created = String(item.created_at || new Date().toISOString()).slice(0, 10);
                const rawImageUrl = String(item.outcome_image_url || item.image_url || "").trim();
                const imageUrl = isGeneratedUploadedActivityImageUrl(rawImageUrl) ? "" : rawImageUrl;
                const showInThisWeek = isClientProjectsAssessment
                    || Boolean(item.show_in_this_week ?? item.show_this_week ?? item.is_pinned ?? item.is_this_week);
                const sourceType = isTrainingCapsule ? "capsule" : inferSourceTypeFromRecord(item);
                const defaultCardColor = getDefaultCardColorForCategory(category, sourceType);
                const resolvedCardColor = sourceType === "project"
                    ? "Violet"
                    : String(item.card_color || item.card_colour || item.color || defaultCardColor);
                const taskTopics = collectTaskTopicsFromActivityRecord(item);
                const standardDetails = normalizeStandardDetailsRows(item.standard_details);

                return {
                    id,
                    title,
                    className: `${yearLevel} Computer Lab`,
                    area: type,
                    activityCategory: category,
                    showThisWeek: showInThisWeek,
                    status: showInThisWeek ? "active" : "planning",
                    term: String(item.term || "Term 2"),
                    updated: created,
                    href: isTrainingCapsule ? "/dtech-hub/class-training/capsules/programming-documentation"
                        : String(item.card_url || "").startsWith("/dtech-hub/class-training/")
                        ? item.card_url
                        : `ProjectPages/custom-activity.html?id=${encodeURIComponent(id)}`,
                    external: false,
                    summary,
                    keywords: [type, category, String(item.difficulty || ""), "teacher upload"].filter(Boolean),
                    sourceType,
                    imageUrl: isTrainingCapsule ? null : imageUrl || null,
                    taskTopics,
                    standardDetails,
                    visual: {
                        icon: textToIcon(type),
                        label: "Teacher Upload",
                        palette: isTrainingCapsule
                            ? "linear-gradient(135deg, #5c0e2a 0%, #862346 55%, #b44a70 100%)"
                            : colorToPalette(resolvedCardColor)
                    }
                };
            })
            .filter(Boolean);
    } catch (_error) {
        return [];
    }
}

function mapProjectTaskTopicsToLibraryItems(project) {
    const taskTopics = Array.isArray(project?.taskTopics) ? project.taskTopics : [];
    if (!taskTopics.length) {
        return [];
    }

    const buildTaskTopicHref = (baseHref, topicText, topicNumber, taskShortName) => {
        const safeBase = String(baseHref || "").trim() || "ProjectPages/custom-activity.html";
        const joiner = safeBase.includes("?") ? "&" : "?";
        const shortName = String(taskShortName || "").trim() || generateTaskShortName(topicText);
        return `${safeBase}${joiner}taskTopic=${encodeURIComponent(String(topicText || "").trim())}&taskTopicIndex=${encodeURIComponent(String(topicNumber))}&taskShortName=${encodeURIComponent(shortName)}`;
    };

    const groupedByShortName = new Map();
    taskTopics.forEach((topic) => {
        const topicText = String(topic || "").trim();
        if (!topicText) {
            return;
        }

        const shortName = getStoredTaskTopicShortName(project?.id, topicText) || generateTaskShortName(topicText) || "Task Topic";
        const bucket = groupedByShortName.get(shortName) || [];
        if (!bucket.some((existing) => existing.toLowerCase() === topicText.toLowerCase())) {
            bucket.push(topicText);
        }
        groupedByShortName.set(shortName, bucket);
    });

    const outputTopics = [];
    groupedByShortName.forEach((topics, shortName) => {
        if (topics.length <= 1) {
            outputTopics.push({
                topicText: topics[0],
                title: shortName,
                merged: false
            });
            return;
        }

        const shouldMerge = resolveTaskTopicMergeDecision(project, shortName, topics);
        if (shouldMerge) {
            outputTopics.push({
                topicText: topics[0],
                title: shortName,
                merged: true
            });
            return;
        }

        topics.forEach((topicText) => {
            const qualifier = extractTaskTopicQualifier(topicText);
            outputTopics.push({
                topicText,
                title: qualifier ? `${shortName} (${qualifier})` : shortName,
                merged: false
            });
        });
    });

    return outputTopics.map((entry, index) => {
        const topicText = String(entry.topicText || "").trim();
        const topicNumber = index + 1;
        const standardNumber = extractPrimaryStandardNumber(project?.standardDetails);
        const shortTaskName = String(entry.title || "").trim() || `Task ${topicNumber}`;

        return {
            id: `task-topic-${String(project.id || "item")}-${topicNumber}`,
            title: shortTaskName,
            className: project.className,
            area: project.area,
            sourceType: "task-topic",
            parentAssessmentId: String(project.id || ""),
            taskTopicText: topicText,
            taskTopicIndex: topicNumber,
            standardNumber,
            activityCategory: "Task Topic",
            showThisWeek: Boolean(project.showThisWeek),
            status: project.status,
            term: project.term,
            updated: project.updated,
            href: buildTaskTopicHref(project.href, topicText, topicNumber, shortTaskName),
            external: project.external,
            summary: topicText,
            keywords: [
                ...(Array.isArray(project.keywords) ? project.keywords : []),
                "task topic",
                shortTaskName,
                String(project.title || "")
            ].filter(Boolean),
            imageUrl: project.imageUrl || null,
            visual: {
                icon: textToIcon(project.area || "Task"),
                label: "Task Topic",
                palette: colorToPalette("azure")
            }
        };
    });
}

function dedupeTaskTopicLibraryItems(items) {
    const seen = new Set();
    return items.filter((item) => {
        const standardNumber = String(item?.standardNumber || "").trim();
        const topicText = String(item?.taskTopicText || "").trim().replace(/\s+/g, " ").toLowerCase();
        if (!standardNumber || !topicText) {
            return true;
        }

        const key = `${standardNumber}\u0000${topicText}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function loadSharedLessons() {
    try {
        const email = getActiveHubEmail();
        if (!email) return [];

        const response = await fetch("/api/relief-plan/events", {
            headers: withHubAuthHeaders({}, email)
        });
        if (!response.ok) return [];

        const payload = await response.json().catch(() => ({}));
        const rawEvents = Array.isArray(payload?.events) ? payload.events : [];

        // The Relief Plan feed can list the same annual observance twice (e.g. a 2026 and
        // 2027 copy of the same date), so drop repeats sharing a title and month/day.
        const seenObservances = new Set();
        const events = rawEvents.filter((event) => {
            const subjectKey = String(event?.subject || "").trim().toLowerCase();
            const date = parseReliefEventDate(event?.startDate);
            if (!subjectKey || !date) return true;
            const key = `${subjectKey}|${date.getMonth()}-${date.getDate()}`;
            if (seenObservances.has(key)) return false;
            seenObservances.add(key);
            return true;
        });

        return events
            .map((event, index) => {
                const lessonTitle = String(event?.subject || "").trim();
                if (!lessonTitle) return null;

                const startDate = String(event?.startDate || "").trim();
                const endDate = String(event?.endDate || startDate).trim();
                const id = `relief-event-${index}-${slugify(lessonTitle)}`;
                const eventHref = `browse-lessons.html?event=${encodeURIComponent(lessonTitle)}&date=${encodeURIComponent(startDate)}`;
                const summary = String(event?.aboutTheEvent || event?.description || "Relief Plan event details available.").trim();

                return {
                    id,
                    title: lessonTitle,
                    className: "All Computer Lab",
                    area: "Relief Plan",
                    activityCategory: "Relief Lesson",
                    showThisWeek: isReliefEventToday(startDate, endDate),
                    status: "active",
                    term: "Relief Plan",
                    updated: startDate,
                    href: eventHref,
                    external: false,
                    summary,
                    keywords: ["relief lesson", "relief plan", startDate, endDate, String(event?.location || "")].filter(Boolean),
                    sourceType: "relief-lesson",
                    imageUrl: null,
                    visual: {
                        icon: "RP",
                        label: "Relief Plan",
                        palette: colorToPalette("rose")
                    }
                };
            })
            .filter(Boolean);
    } catch (_error) {
        return [];
    }
}

function parseReliefEventDate(value) {
    const raw = String(value || "").trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }

    const csvMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!csvMatch) return null;
    return new Date(Number(csvMatch[3]), Number(csvMatch[1]) - 1, Number(csvMatch[2]));
}

function isReliefEventToday(startValue, endValue) {
    const start = parseReliefEventDate(startValue);
    const end = parseReliefEventDate(endValue || startValue);
    if (!start || !end) return false;

    const today = new Date();
    const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() <= todayKey
        && new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() >= todayKey;
}

async function loadAssessmentStandardCardsForLibrary() {
    const email = getActiveHubEmail();
    if (!email) {
        return [];
    }

    try {
        const response = await fetch("/api/assessment-standard-cards", {
            headers: withHubAuthHeaders({}, email)
        });
        if (!response.ok) return [];

        const payload = await response.json().catch(() => ({}));
        const cards = Array.isArray(payload?.cards) ? payload.cards : [];
        const normalizedCards = cards
            .map((card) => {
                const id = String(card?.id || "").trim();
                const standardCodes = Array.isArray(card?.standard_codes)
                    ? card.standard_codes.map((value) => String(value || "").trim()).filter(Boolean)
                    : [];
                const courseName = String(card?.course_name || "").trim();
                const sourceForNumber = [courseName, ...standardCodes].join(" ");
                const codeMatch = sourceForNumber.match(/\b(\d{5})\b/);
                const standardNumber = codeMatch ? codeMatch[1] : "";
                const standardName = standardCodes.find((value) => !/\b\d{5}\b/.test(String(value || ""))) || "";
                const title = standardNumber
                    ? `AS ${standardNumber}${standardName ? ` ${standardName}` : ""}`
                    : String(standardName || courseName || standardCodes[0] || "").trim();

                if (!id || !title) {
                    return null;
                }

                const updated = String(card?.updated_at || card?.created_at || new Date().toISOString()).slice(0, 10);
                const criteriaRows = [
                    String(card?.achieved_text || "").trim(),
                    String(card?.merit_text || "").trim(),
                    String(card?.excellence_text || "").trim()
                ].filter(Boolean);

                return {
                    id: `standard-card-${id}`,
                    title: standardNumber ? `AS ${standardNumber}` : title,
                    className: `${String(card?.year_level || "Other").trim() || "Other"} Computer Lab`,
                    area: "Assessment Standard",
                    activityCategory: "Standard",
                    showThisWeek: false,
                    status: "active",
                    term: "Assessment",
                    updated,
                    href: `/assessment-standard-card.html?card=${encodeURIComponent(id)}`,
                    external: false,
                    summary: String(card?.excellence_text || card?.merit_text || card?.achieved_text || "Assessment standard card").trim(),
                    keywords: [
                        "standard",
                        "assessment standard",
                        String(card?.course_name || ""),
                        String(card?.year_level || ""),
                        ...standardCodes
                    ].map((value) => String(value || "").trim()).filter(Boolean),
                    sourceType: "standard",
                    standardNumber,
                    standardDetails: [
                        courseName,
                        ...standardCodes,
                        ...criteriaRows
                    ],
                    imageUrl: null,
                    visual: {
                        icon: standardNumber ? `AS${standardNumber.slice(-2)}` : "AS",
                        label: "Standard",
                        palette: colorToPalette("teal")
                    }
                };
            })
            .filter(Boolean);

        const uniqueCards = new Map();
        normalizedCards.forEach((card) => {
            const standardNumber = String(card.standardNumber || "").trim();
            const key = standardNumber || card.id;
            if (!uniqueCards.has(key)) {
                uniqueCards.set(key, card);
            }
        });

        return Array.from(uniqueCards.values());
    } catch (_error) {
        return [];
    }
}

function mergeProjects(sharedProjects) {
    const byId = new Map();
    const byTitle = new Map();
    
    [...baseProjects, ...sharedProjects].forEach((project) => {
        // First dedup by title - if we've already seen this title, skip it
        const titleKey = project.title.toLowerCase().trim();
        if (byTitle.has(titleKey)) {
            return; // Skip this duplicate title
        }
        byTitle.set(titleKey, true);
        
        // Then add/update by ID
        byId.set(project.id, project);
    });

    return Array.from(byId.values());
}

function mapLabProjectToLibraryItem(project) {
    return {
        id: `lab-${project.id}`,
        title: project.title,
        className: project.className,
        area: "Lab Project",
        sourceType: "activity",
        activityCategory: "Activity",
        showThisWeek: Boolean(project.showThisWeek),
        status: project.status,
        term: project.term,
        updated: project.updated,
        href: project.href,
        external: project.external,
        summary: project.summary,
        keywords: [...(Array.isArray(project.keywords) ? project.keywords : []), "activity", "lab project"],
        visual: project.visual,
        linkLabel: "Open activity"
    };
}

function getUnifiedLibraryItems() {
    const projectItems = projects.map((project) => ({
        ...project,
        sourceType: inferSourceTypeFromRecord(project)
    }));

    const taskTopicItems = projectItems
        .filter((project) => project.sourceType === "assessment")
        .flatMap((project) => mapProjectTaskTopicsToLibraryItems(project));
    const uniqueTaskTopicItems = dedupeTaskTopicLibraryItems(taskTopicItems);

    return [
        ...projectItems,
        ...lessons.map((lesson) => ({
            ...lesson,
            sourceType: "relief-lesson"
        })),
        ...standardCards.map((card) => ({
            ...card,
            sourceType: "standard"
        })),
        ...uniqueTaskTopicItems,
        ...labProjects.map(mapLabProjectToLibraryItem)
    ];
}

const DEFAULT_NEW_EVENT_WINDOW_DAYS = 14;
const NEW_EVENT_WINDOW_STORAGE_KEY = "dtechHub:newEventWindowDays:v1";
const NEW_EVENT_WINDOW_OPTIONS = new Set([7, 14, 30]);

function getConfiguredNewEventWindowDays() {
    try {
        const stored = Number.parseInt(String(localStorage.getItem(NEW_EVENT_WINDOW_STORAGE_KEY) || ""), 10);
        if (NEW_EVENT_WINDOW_OPTIONS.has(stored)) {
            return stored;
        }
    } catch (_error) {
    }

    return DEFAULT_NEW_EVENT_WINDOW_DAYS;
}

function setConfiguredNewEventWindowDays(days) {
    const normalized = Number.parseInt(String(days || ""), 10);
    if (!NEW_EVENT_WINDOW_OPTIONS.has(normalized)) {
        return false;
    }

    try {
        localStorage.setItem(NEW_EVENT_WINDOW_STORAGE_KEY, String(normalized));
        return true;
    } catch (_error) {
        return false;
    }
}

function parseDateSafe(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isAssessmentOrProjectEvent(project) {
    const sourceType = inferSourceTypeFromRecord(project);
    if (sourceType === "project") return true;

    if (sourceType !== "assessment") return false;

    const category = String(project?.activityCategory || project?.activity_category || project?.category || "").trim().toLowerCase();
    return category.includes("assessment");
}

function isRecentEvent(project, maxAgeDays = getConfiguredNewEventWindowDays()) {
    if (!isAssessmentOrProjectEvent(project)) return false;

    const createdAt = parseDateSafe(project?.created_at || project?.createdAt || project?.updated);
    if (!createdAt) return false;

    const ageMs = Date.now() - createdAt.getTime();
    const maxAgeMs = Math.max(1, Number(maxAgeDays) || DEFAULT_NEW_EVENT_WINDOW_DAYS) * 24 * 60 * 60 * 1000;
    return ageMs >= 0 && ageMs <= maxAgeMs;
}

const HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
const HUB_UNIFIED_OAUTH_SCOPES = "openid email profile https://www.googleapis.com/auth/drive";
const SENIOR_EXTERNAL_EXAM_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScQwfyEI_K0e9AUzSakLx2TivFVj0XwrS_WlL1PkBDjJvgPWw/viewform?usp=sharing&ouid=106667548820420028390";

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

    // One-time migration from older session storage key usage.
    if (!localValue && sessionValue) {
        try {
            localStorage.setItem(HUB_AUTH_STORAGE_KEY, sessionValue);
        } catch (_error) {
        }
    }

    return localValue || sessionValue;
}

function setHubStoredAuthRaw(value) {
    try {
        localStorage.setItem(HUB_AUTH_STORAGE_KEY, value);
    } catch (_error) {
        try {
            sessionStorage.setItem(HUB_AUTH_STORAGE_KEY, value);
        } catch (_innerError) {
        }
    }
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

const hubGoogleClientId =
    document.querySelector('meta[name="hub-google-client-id"]')?.content.trim() ||
    window.HUB_GOOGLE_CLIENT_ID ||
    "";

function enforceCanonicalHubOrigin() {
    if (typeof window === "undefined") {
        return;
    }
}

enforceCanonicalHubOrigin();

function renderGlobalNavbar() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.dataset.globalNavbar === "true") {
        return;
    }

    const browseMenu = `
        <details class="nav-dropdown" id="hub-browse-menu" data-nav-dropdown hidden>
            <summary>Browse</summary>
            <div class="nav-drawer" role="menu">
                <a id="hub-browse-practicals-link" data-auth-browse role="menuitem" href="/browse-practicals.html" hidden>Practicals</a>
                <a id="hub-browse-unit-plans-link" data-auth-unit-plans role="menuitem" href="/browse-unit-plans.html" hidden>Unit Plans</a>
                <a id="hub-browse-course-outlines-link" data-auth-course-outlines role="menuitem" href="/browse-course-outlines.html" hidden>Course Outlines</a>
                <a role="menuitem" href="/learning-pathways/">Learning Pathways</a>
                <a id="hub-browse-relief-lessons-link" data-auth-browse role="menuitem" href="/browse-lessons.html" hidden>Relief Lessons Library</a>
                <a id="hub-browse-template-library-link" data-auth-browse role="menuitem" href="/ProjectPages/slideshow-template-library.html" hidden>Template Library</a>
            </div>
        </details>
    `;
    const taskListLink = `<a id="hub-senior-task-list-link" class="hub-senior-task-list-link" href="/task-list.html" hidden><span class="hub-task-list-course" data-task-list-course hidden></span><span class="hub-task-list-label">Task List</span></a>`;
    const pathwaysLink = `<a id="hub-pathways-link" class="hub-pathways-link" href="/learning-pathways/" hidden>Pathways</a>`;

    const uploadMenu = `
        <details class="nav-dropdown" id="hub-upload-menu" data-nav-dropdown hidden>
            <summary>Upload</summary>
            <div class="nav-drawer" role="menu">
                <a role="menuitem" href="/upload-project.html">Upload Project</a>
                <a role="menuitem" href="/upload-jobs.html">Upload Jobs</a>
                <a role="menuitem" href="/upload-activity.html">Upload Activity</a>
                <a role="menuitem" href="/upload-assessment.html">Upload Assessment Task</a>
                <a role="menuitem" href="/upload-course-outline.html">Upload Course Outline</a>
                <a role="menuitem" href="/upload-lesson.html">Upload Relief Lesson</a>
                <a role="menuitem" href="/upload-unit.html">Upload Unit Plan</a>
            </div>
        </details>
    `;
    const practicalSkillsMenu = `
        <details class="nav-dropdown nav-dropdown-practical-skills" id="hub-practical-skills-menu" data-nav-dropdown hidden>
            <summary id="hub-practical-skills-summary">Licence</summary>
            <div class="nav-drawer" role="menu">
                <a id="hub-practical-skills-link" role="menuitem" href="/practical-skills/checklist.html">My Licence</a>
                <a role="menuitem" href="/practical-skills/">Licence Library</a>
                <a id="hub-upload-kits-link" role="menuitem" href="/practical-skills/admin-kits.html" hidden>Upload Kits</a>
            </div>
        </details>
    `;
    const studentWorkMenu = `
        <details class="nav-dropdown" id="hub-student-work-menu" data-nav-dropdown hidden>
            <summary>Student Work</summary>
            <div class="nav-drawer" role="menu">
                <a role="menuitem" href="/teacher-student-work.html">Student Work Tracker</a>
                <a role="menuitem" href="/learning-pathways/progression-pathway.html">Progression Pathway</a>
                <a role="menuitem" href="/learning-pathways/unit-progression.html">Unit Progression</a>
                <a role="menuitem" href="/user-profile.html#trello-integration-card">Trello</a>
            </div>
        </details>
    `;
    const settingsLink = `<a id="hub-settings-link" href="/settings.html" hidden>Settings</a>`;
    const topbarMenu = `${browseMenu}${uploadMenu}${practicalSkillsMenu}${pathwaysLink}${taskListLink}${studentWorkMenu}${settingsLink}`;

    topbar.dataset.globalNavbar = "true";
    topbar.setAttribute("aria-label", "Primary");
    topbar.innerHTML = `
        <a class="brand" href="/index.html">Computer Lab</a>
        <div class="topbar-right">
            <div class="topbar-links">
                ${topbarMenu}
            </div>
            <div class="utility-actions" aria-label="Utility actions">
                <a id="hub-staff-link" href="/teacher-view.html" hidden>Teacher View</a>
                <a id="hub-admin-link" href="/admin-menu.html" hidden>Admin Menu</a>
                <span id="hub-access-badge" class="hub-access-badge" hidden aria-live="polite"></span>
                <button id="hub-drive-sync" class="google-drive-sync-button drive-state-unknown" type="button" hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="google-drive-icon" aria-hidden="true">
                        <path d="M9.6 3h4.9l6.2 10.8h-4.9L9.6 3z" fill="#0F9D58"/>
                        <path d="M3.3 13.8 5.8 9.5h12.4l-2.5 4.3H3.3z" fill="#4285F4"/>
                        <path d="m6.2 18.7-2.9-4.9L9.6 3l2.5 4.3-5.9 11.4z" fill="#F4B400"/>
                    </svg>
                    <span>Google Drive Sync</span>
                </button>
                <button id="hub-google-signin" class="google-signin-button" type="button">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="google-logo">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign in with Google</span>
                </button>
                <button id="hub-google-signout" type="button" hidden>Sign out</button>
                <button id="hub-user-badge" class="user-badge" type="button" hidden aria-label="Open profile" aria-haspopup="true" aria-expanded="false"></button>
            </div>
        </div>
    `;

    const dropdowns = Array.from(topbar.querySelectorAll("[data-nav-dropdown]"));
    dropdowns.forEach((dropdown) => {
        dropdown.addEventListener("toggle", () => {
            if (!dropdown.open) return;
            dropdowns.forEach((other) => {
                if (other !== dropdown) {
                    other.open = false;
                }
            });
        });
    });

    document.addEventListener("click", (event) => {
        if (!topbar.contains(event.target)) {
            dropdowns.forEach((dropdown) => {
                dropdown.open = false;
            });
        }
    });
}

renderGlobalNavbar();

const hubAllowedDomain =
    (document.querySelector('meta[name="hub-google-allowed-domain"]')?.content || "")
        .trim()
        .toLowerCase();

const hubAuthState = {
    idToken: null,
    accessToken: null,
    grantedScopes: "",
    expiresAt: 0,
    profile: null,
    tokenClient: null,
    idClientReady: false,
    autoPromptInFlight: false,
    pendingTokenResolvers: []
};

const hubDriveSetupState = {
    checked: false,
    checking: false,
    configured: false,
    driveReady: false,
    confirmed: false,
    inferredFromDrive: false,
    haparaFolderId: "",
    processAssessmentFolderId: "",
    processAssessmentFolderUrl: ""
};

const hubAccessState = {
    resolved: false,
    isStaff: false,
    isStudent: false,
    canTeacherView: false,
    canAdmin: false,
    defaultView: "student",
    additionalRole: ""
};

const state = {
    search: "",
    sort: "name-asc",
    year: "All",
    type: "All",
    category: "All",
    content: "All"
};

const taskTopicMergeSelection = new Set();
let hubToastHideTimer = null;

const labProjectState = {
    search: "",
    sort: "name-asc"
};

const projectAssignmentCounts = new Map();
let projectAssignmentsAttemptedForEmail = "";
let projectAssignmentsLoading = false;

const statusOrder = {
    active: 0,
    planning: 1,
    archive: 2
};

const currentProjectGrid = document.querySelector("#current-project-grid");
const currentWeekGrid = document.querySelector("#current-week-grid");
const libraryGrid = document.querySelector("#project-library-grid");
const currentLabProjectGrid = document.querySelector("#current-lab-project-grid");
const labProjectLibraryGrid = document.querySelector("#lab-project-library-grid");
const searchInput = document.querySelector("#project-search");
const sortSelect = document.querySelector("#sort-order");
const labProjectSearchInput = document.querySelector("#lab-project-search");
const labProjectSortSelect = document.querySelector("#lab-project-sort");
const yearSelect = document.querySelector("#year-filter");
const typeSelect = document.querySelector("#type-filter");
const categorySelect = document.querySelector("#category-filter");
const libraryResultsMeta = document.querySelector("#library-results-meta");
const labProjectResultsMeta = document.querySelector("#lab-project-results-meta");
const newWeekCount = document.querySelector("#new-week-count");
const newWeekWindow = document.querySelector("#new-week-window");
const newWeekList = document.querySelector("#new-this-week-list");
const newWeekEmpty = document.querySelector("#new-this-week-empty");
const hubStaffLink = document.querySelector("#hub-staff-link");
const hubAdminLink = document.querySelector("#hub-admin-link");
const hubSettingsLink = document.querySelector("#hub-settings-link");
const hubAccessBadge = document.querySelector("#hub-access-badge");
const hubTeacherDashboardLink = document.querySelector("#hub-teacher-dashboard-link");
const hubDriveSyncButton = document.querySelector("#hub-drive-sync");
const hubSignInButton = document.querySelector("#hub-google-signin");
const hubSignOutButton = document.querySelector("#hub-google-signout");
const hubStartupSignInBanner = document.querySelector("#hub-startup-signin-banner");
const hubStartupSignInCta = document.querySelector("#hub-startup-signin-cta");
const hubUserBadge = document.querySelector("#hub-user-badge");
const hubProfilePanel = document.querySelector("#hub-user-profile");
const hubProfileAvatar = document.querySelector("#hub-profile-avatar");
const hubProfileName = document.querySelector("#hub-profile-name");
const hubProfileEmail = document.querySelector("#hub-profile-email");
const hubProfileDisplayName = document.querySelector("#hub-profile-display-name");
const hubProfileDisplayEmail = document.querySelector("#hub-profile-display-email");
const hubProfileDomain = document.querySelector("#hub-profile-domain");
const hubProfileClose = document.querySelector("#hub-profile-close");
const hubBrowseMenu = document.querySelector("#hub-browse-menu");
const hubUploadMenu = document.querySelector("#hub-upload-menu");
const hubPracticalSkillsMenu = document.querySelector("#hub-practical-skills-menu");
const hubUploadKitsLink = document.querySelector("#hub-upload-kits-link");
const hubSeniorTaskListLink = document.querySelector("#hub-senior-task-list-link");
const hubStudentWorkMenu = document.querySelector("#hub-student-work-menu");
const hubTemplateLibraryLink = document.querySelector("#hub-browse-template-library-link");
const hubBrowseButtons = Array.from(document.querySelectorAll("[data-auth-browse]"));
const hubUnitPlansButtons = Array.from(document.querySelectorAll("[data-auth-unit-plans]"));
const hubCourseOutlinesButtons = Array.from(document.querySelectorAll("[data-auth-course-outlines]"));
const HUB_VIEW_MODE_STORAGE_KEY = "hub_view_mode_v1";
const HUB_GLOBAL_SIDEBAR_SESSION_KEY = "hub_global_sidebar_seen_v1";
const HUB_AUTO_LOGIN_PROMPT_SESSION_KEY = "hub_auto_login_prompted_v1";

let hubGlobalSidebarNodes = null;
let hubStudentAllocatedStandards = [];
let hubStudentExternalStandards = [];
let hubStudentExternalExamIntention = "";
let hubStudentDigitalMediaType = "";

function readStoredHubViewMode() {
    try {
        const value = localStorage.getItem(HUB_VIEW_MODE_STORAGE_KEY);
        return value === "teacher" || value === "student" ? value : "";
    } catch (_error) {
        return "";
    }
}

function writeStoredHubViewMode(mode) {
    try {
        const normalized = mode === "teacher" ? "teacher" : "student";
        localStorage.setItem(HUB_VIEW_MODE_STORAGE_KEY, normalized);
    } catch (_error) {
        // Ignore storage errors in private or restricted browsing modes.
    }
}

function getEffectiveHubViewMode() {
    if (window.whsDtech) return window.whsDtech.viewMode;
    if (isTeacherWorkspacePath()) {
        return "teacher";
    }

    const storedMode = readStoredHubViewMode();
    if (storedMode) {
        return storedMode;
    }

    return hubAccessState.defaultView === "teacher" ? "teacher" : "student";
}

function isHomepagePath() {
    const path = String(window.location.pathname || "").toLowerCase().replace(/^\/dtech-hub(?=\/|$)/, "");
    return path === "/" || path === "/index.html";
}

function isTeacherWorkspacePath() {
    const path = String(window.location.pathname || "").toLowerCase();
    return path.endsWith("/teacher-view.html") || path.endsWith("/upload-activity.html") || path.endsWith("/upload-project.html") || path.endsWith("/upload-menu.html") || path.endsWith("/teacher-project-allocation.html") || path.endsWith("/teacher-assessment-allocation.html") || path.endsWith("/teacher-student-work.html") || path.endsWith("/teacher-student-work-task.html") || path.endsWith("/class-management.html");
}

function setPublicHomepageUiState(signedIn) {
    if (!document.body || !isHomepagePath()) {
        return;
    }

    document.body.classList.toggle("public-home-access", !signedIn);
}


// Ensure public-home-access and refresh library on page load
document.addEventListener("DOMContentLoaded", function() {
    // Keep homepage state aligned with the same valid-token rule used by protected routes.
    var signedIn = hasAllowedSignedInHubAccount();
    setPublicHomepageUiState(!!signedIn);

    // If on homepage and library grid exists, refresh activities from backend
    if (isHomepagePath() && document.querySelector("#project-library-grid")) {
        refreshActivitiesLibrary();
    }
});

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function getHubStoredSignedInEmail() {
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

function getActiveHubEmail() {
    return normalizeEmail(hubAuthState.profile?.email || getHubStoredSignedInEmail());
}

function getActiveHubBearerToken() {
    const fromState = String(hubAuthState.idToken || hubAuthState.accessToken || "").trim();
    if (fromState && Number(hubAuthState.expiresAt || 0) > Date.now()) {
        return fromState;
    }

    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return "";
    }

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

function getActiveHubAccessToken() {
    const fromState = String(hubAuthState.accessToken || "").trim();
    if (fromState && Number(hubAuthState.expiresAt || 0) > Date.now()) {
        return fromState;
    }

    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return "";
        }
        return String(parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function getActiveHubGrantedScopes() {
    const fromState = String(hubAuthState.grantedScopes || "").trim();
    if (fromState) {
        return fromState;
    }

    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        return String(parsed?.grantedScopes || parsed?.scope || "").trim();
    } catch (_error) {
        return "";
    }
}

function hasHubDriveScopes() {
    const grantedScopes = getActiveHubGrantedScopes().toLowerCase();
    return grantedScopes.includes("https://www.googleapis.com/auth/drive");
}

function getActiveHubDriveAccessToken() {
    const accessToken = getActiveHubAccessToken();
    if (!accessToken || !hasHubDriveScopes()) {
        return "";
    }
    return accessToken;
}

function resetHubDriveSetupState() {
    hubDriveSetupState.checked = false;
    hubDriveSetupState.checking = false;
    hubDriveSetupState.configured = false;
    hubDriveSetupState.driveReady = false;
    hubDriveSetupState.confirmed = false;
    hubDriveSetupState.inferredFromDrive = false;
    hubDriveSetupState.haparaFolderId = "";
    hubDriveSetupState.processAssessmentFolderId = "";
    hubDriveSetupState.processAssessmentFolderUrl = "";
}

function isHubDriveSetupReady() {
    return Boolean(hubDriveSetupState.confirmed && hubDriveSetupState.processAssessmentFolderId);
}

function applyHubDriveSetupState(setup) {
    hubDriveSetupState.checked = true;
    hubDriveSetupState.configured = Boolean(setup?.configured);
    hubDriveSetupState.driveReady = Boolean(setup?.driveReady);
    hubDriveSetupState.confirmed = Boolean(setup?.confirmed);
    hubDriveSetupState.inferredFromDrive = Boolean(setup?.inferredFromDrive);
    hubDriveSetupState.haparaFolderId = String(setup?.haparaFolderId || "").trim();
    hubDriveSetupState.processAssessmentFolderId = String(setup?.processAssessmentFolderId || "").trim();
    hubDriveSetupState.processAssessmentFolderUrl = String(
        setup?.processAssessmentFolderUrl
        || (setup?.processAssessmentFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(String(setup.processAssessmentFolderId).trim())}` : "")
    ).trim();
}

function renderHubDriveSyncButton() {
    if (!hubDriveSyncButton) {
        return;
    }

    const signedIn = hasAllowedSignedInHubAccount();
    hubDriveSyncButton.hidden = !signedIn;
    if (!signedIn) {
        hubDriveSyncButton.disabled = false;
        hubDriveSyncButton.className = "google-drive-sync-button drive-state-unknown";
        const signedOutLabel = hubDriveSyncButton.querySelector("span");
        if (signedOutLabel) signedOutLabel.textContent = "Google Drive Sync";
        return;
    }

    const label = hubDriveSyncButton.querySelector("span");
    let nextLabel = "Google Drive Sync";
    let nextClass = "google-drive-sync-button drive-state-unknown";
    let title = "Check that your SeniorDTECH/Process Assessment folder is ready.";

    if (hubDriveSetupState.checking) {
        nextLabel = "Checking Drive...";
        nextClass = "google-drive-sync-button drive-state-checking";
        title = "Checking your Google Drive folder setup.";
    } else if (isHubDriveSetupReady()) {
        nextLabel = "Drive Ready";
        nextClass = "google-drive-sync-button drive-state-ready";
        title = hubDriveSetupState.inferredFromDrive
            ? "Process Assessment was found in Google Drive and linked automatically."
            : "Your Process Assessment folder is ready.";
    } else if (hubDriveSetupState.checked) {
        nextLabel = "Set Up Drive";
        nextClass = "google-drive-sync-button drive-state-action";
        title = "Create or confirm your SeniorDTECH/Process Assessment folder before using Template Library.";
    }

    hubDriveSyncButton.className = nextClass;
    hubDriveSyncButton.title = title;
    if (label) {
        label.textContent = nextLabel;
    }
}

function refreshTemplateLibraryAccessUi(signedIn = hasAllowedSignedInHubAccount()) {
    if (!hubTemplateLibraryLink) {
        return;
    }

    const locked = Boolean(signedIn && !isHubDriveSetupReady());
    hubTemplateLibraryLink.classList.toggle("nav-link-locked", locked);
    if (locked) {
        hubTemplateLibraryLink.setAttribute("aria-disabled", "true");
        hubTemplateLibraryLink.title = "Set up Google Drive Sync before opening Template Library.";
    } else {
        hubTemplateLibraryLink.removeAttribute("aria-disabled");
        hubTemplateLibraryLink.removeAttribute("title");
    }
}

function requestHubDriveAccessToken(options = {}) {
    const forceConsent = Boolean(options?.forceConsent);
    const existingToken = getActiveHubDriveAccessToken();
    if (existingToken) {
        return Promise.resolve({ access_token: existingToken, scope: getActiveHubGrantedScopes() });
    }

    if (!hubAuthState.tokenClient) {
        return Promise.resolve({ error: "Google Drive sign-in is not ready yet." });
    }

    return new Promise((resolve) => {
        let timeoutId = 0;
        const finish = (response) => {
            if (timeoutId) window.clearTimeout(timeoutId);
            resolve(response);
        };
        hubAuthState.pendingTokenResolvers.push(finish);
        timeoutId = window.setTimeout(() => {
            const index = hubAuthState.pendingTokenResolvers.indexOf(finish);
            if (index >= 0) hubAuthState.pendingTokenResolvers.splice(index, 1);
            finish({ error: "Google sign-in did not open. Allow pop-ups for this site, then try again." });
        }, 60000);
        try {
            hubAuthState.tokenClient.requestAccessToken({ prompt: forceConsent ? "select_account consent" : "" });
        } catch (error) {
            const index = hubAuthState.pendingTokenResolvers.indexOf(finish);
            if (index >= 0) hubAuthState.pendingTokenResolvers.splice(index, 1);
            finish({ error: error?.message || "Google Drive sign-in could not start." });
        }
    });
}

async function fetchHubDriveSetup(options = {}) {
    const email = getActiveHubEmail();
    if (!email) {
        resetHubDriveSetupState();
        renderHubDriveSyncButton();
        refreshTemplateLibraryAccessUi(false);
        return null;
    }

    const requireDriveToken = Boolean(options?.requireDriveToken);
    let driveAccessToken = getActiveHubDriveAccessToken();

    hubDriveSetupState.checking = true;
    renderHubDriveSyncButton();

    if (requireDriveToken && !driveAccessToken) {
        const tokenResponse = await requestHubDriveAccessToken({ forceConsent: Boolean(options?.forceConsent) });
        if (!tokenResponse?.error) {
            driveAccessToken = String(tokenResponse?.access_token || "").trim();
        }
    }

    try {
        const response = driveAccessToken
            ? await fetch("/api/student/drive-setup/status", {
                method: "POST",
                headers: withHubAuthHeaders({ "Content-Type": "application/json" }, email),
                body: JSON.stringify({ driveAccessToken })
            })
            : await fetch("/api/student/drive-setup", {
                headers: withHubAuthHeaders({}, email)
            });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || "Could not load Google Drive setup.");
        }

        applyHubDriveSetupState(payload || {});
        return payload;
    } catch (error) {
        if (!hubDriveSetupState.checked) {
            resetHubDriveSetupState();
        }
        console.warn("Could not load Google Drive setup.", error);
        return null;
    } finally {
        hubDriveSetupState.checking = false;
        renderHubDriveSyncButton();
        refreshTemplateLibraryAccessUi();
    }
}

async function confirmHubDriveSetup(driveAccessToken) {
    const email = getActiveHubEmail();
    const response = await fetch("/api/student/drive-setup/confirm", {
        method: "POST",
        headers: withHubAuthHeaders({ "Content-Type": "application/json" }, email),
        body: JSON.stringify({ driveAccessToken })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || "Could not confirm Google Drive setup.");
    }

    applyHubDriveSetupState({
        configured: true,
        driveReady: true,
        confirmed: true,
        processAssessmentFolderId: payload?.processAssessmentFolderId,
        processAssessmentFolderUrl: payload?.processAssessmentFolderUrl,
        haparaFolderId: hubDriveSetupState.haparaFolderId,
        inferredFromDrive: false
    });
    renderHubDriveSyncButton();
    refreshTemplateLibraryAccessUi();
    return payload;
}

async function handleHubDriveSyncClick(options = {}) {
    if (!hasAllowedSignedInHubAccount()) {
        alert("Sign in with your Westland High Google account before checking Google Drive Sync.");
        return false;
    }

    if (hubDriveSetupState.checking) {
        return false;
    }

    try {
        const currentSetup = await fetchHubDriveSetup({ requireDriveToken: true });
        if (currentSetup?.confirmed && currentSetup?.processAssessmentFolderId) {
            if (options.openFolder !== false && currentSetup.processAssessmentFolderUrl) {
                window.open(currentSetup.processAssessmentFolderUrl, "_blank", "noopener");
            }
            return true;
        }

        const shouldCreateFolder = window.confirm("Template Library is locked until your SeniorDTECH/Process Assessment folder is ready in Google Drive. Create or confirm it now?");
        if (!shouldCreateFolder) {
            return false;
        }

        const tokenResponse = await requestHubDriveAccessToken({ forceConsent: true });
        if (tokenResponse?.error || !tokenResponse?.access_token) {
            alert("Google Drive permission is required before DTECH Hub can create your Process Assessment folder.");
            return false;
        }

        const payload = await confirmHubDriveSetup(tokenResponse.access_token);
        if (options.openFolder !== false && payload?.processAssessmentFolderUrl) {
            window.open(payload.processAssessmentFolderUrl, "_blank", "noopener");
        }
        return true;
    } catch (error) {
        alert(error?.message || "Could not complete Google Drive Sync.");
        return false;
    } finally {
        hubDriveSetupState.checking = false;
        renderHubDriveSyncButton();
    }
}

function withHubAuthHeaders(headers = {}, email = getActiveHubEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const bearerToken = getActiveHubBearerToken();
    if (bearerToken && bearerToken.startsWith("eyJ") && bearerToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${bearerToken}`;
    }

    return nextHeaders;
}

function rerenderAssignmentIndicators() {
    if (!libraryGrid) {
        return;
    }

    renderCurrentWeek();
    renderCurrentProjects();
    renderLibrary();
    applyCompactCardLayout();
}

function clearProjectAssignmentSummaries() {
    const hadData = projectAssignmentCounts.size > 0;
    projectAssignmentCounts.clear();
    projectAssignmentsAttemptedForEmail = "";
    projectAssignmentsLoading = false;

    if (hadData) {
        rerenderAssignmentIndicators();
    }
}

async function loadProjectAssignmentSummaries(force = false) {
    const email = getActiveHubEmail();
    const canViewAssignments = hubAccessState.canTeacherView || hubAccessState.canAdmin;

    if (!email || !canViewAssignments || !isHomepagePath() || !libraryGrid) {
        return;
    }

    if (!force && (projectAssignmentsAttemptedForEmail === email || projectAssignmentsLoading)) {
        return;
    }

    projectAssignmentsLoading = true;
    projectAssignmentsAttemptedForEmail = email;

    try {
        const response = await fetch("/api/project-interests", {
            headers: withHubAuthHeaders({}, email)
        });

        if (!response.ok) {
            throw new Error("Could not load project assignment summaries.");
        }

        const rows = await response.json();
        projectAssignmentCounts.clear();

        if (Array.isArray(rows)) {
            rows.forEach((row) => {
                const projectId = String(row?.project_id || "").trim();
                const assignedCount = Number(row?.confirmed_count ?? row?.interest_count ?? 0);
                if (!projectId || assignedCount <= 0) {
                    return;
                }
                projectAssignmentCounts.set(projectId, assignedCount);
            });
        }

        rerenderAssignmentIndicators();
    } catch (_error) {
        projectAssignmentCounts.clear();
        rerenderAssignmentIndicators();
    } finally {
        projectAssignmentsLoading = false;
    }
}

function getAssignedStudentCount(project, sourceType) {
    if (sourceType !== "project" && sourceType !== "assessment") {
        return 0;
    }

    const projectId = String(project?.id || "").trim();
    if (!projectId) {
        return 0;
    }

    return Number(projectAssignmentCounts.get(projectId) || 0);
}

function getHubDisplayName(profile) {
    if (!profile) return "";
    return String(profile.name || profile.given_name || profile.email || "").trim();
}

function hasAllowedSignedInHubAccount() {
    if (window.whsDtech) return Boolean(window.whsDtech.profile?.email);
    const email = normalizeEmail(hubAuthState.profile?.email || "");
    const activeBearerToken = getActiveHubBearerToken();
    if (!email || !activeBearerToken) {
        return false;
    }

    if (!hubAllowedDomain) {
        return true;
    }

    return email.endsWith(`@${hubAllowedDomain}`);
}

function enforceDetailAccess(event) {
    if (hasAllowedSignedInHubAccount()) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    if (hubAuthState.idClientReady && window.google?.accounts?.id) {
        alert("Please sign in with your Westland High account to open details.");
        window.google.accounts.id.prompt();
    } else if (hubAuthState.tokenClient) {
        alert("Please sign in with your Westland High account to open details.");
        hubAuthState.tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
        alert("Please sign in with your Westland High account to open details.");
    }

    return true;
}

function getHubUserInitials(profile) {
    const name = getHubDisplayName(profile);
    if (!name) return "--";

    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    }

    return String(name.slice(0, 2)).toUpperCase();
}

function populateHubProfilePanel() {
    if (!hubAuthState.profile) {
        return;
    }

    const displayName = getHubDisplayName(hubAuthState.profile);
    const email = hubAuthState.profile.email || "-";
    const domain = email.includes("@") ? email.split("@")[1] : "-";
    const initials = getHubUserInitials(hubAuthState.profile);

    if (hubProfileAvatar) hubProfileAvatar.textContent = initials;
    if (hubProfileName) hubProfileName.textContent = displayName || "Staff User";
    if (hubProfileEmail) hubProfileEmail.textContent = email;
    if (hubProfileDisplayName) hubProfileDisplayName.textContent = displayName || "-";
    if (hubProfileDisplayEmail) hubProfileDisplayEmail.textContent = email;
    if (hubProfileDomain) hubProfileDomain.textContent = domain;
}

function setHubProfileOpen(isOpen) {
    if (!hubProfilePanel || !hubUserBadge) {
        return;
    }

    const canOpen = Boolean(hubAuthState.profile?.email);
    hubProfilePanel.hidden = !isOpen || !canOpen;
    hubUserBadge.setAttribute("aria-expanded", String(isOpen && canOpen));
}

function readGlobalSidebarSeenThisSession() {
    try {
        return sessionStorage.getItem(HUB_GLOBAL_SIDEBAR_SESSION_KEY) === "1";
    } catch (_error) {
        return false;
    }
}

function markGlobalSidebarSeenThisSession() {
    try {
        sessionStorage.setItem(HUB_GLOBAL_SIDEBAR_SESSION_KEY, "1");
    } catch (_error) {
    }
}

function ensureGlobalHubSidebar() {
    if (hubGlobalSidebarNodes) {
        return hubGlobalSidebarNodes;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "hub-global-sidebar-toggle";
    toggle.className = "hub-global-sidebar-toggle";
    toggle.textContent = "Sidebar";
    toggle.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.id = "hub-global-sidebar-backdrop";
    backdrop.className = "hub-global-sidebar-backdrop";

    const panel = document.createElement("aside");
    panel.id = "hub-global-sidebar";
    panel.className = "hub-global-sidebar";
    panel.setAttribute("aria-label", "DTECH sidebar");
    panel.innerHTML = `
        <header class="hub-global-sidebar-header">
            <h2>DTECH Sidebar</h2>
            <button type="button" class="hub-global-sidebar-close" id="hub-global-sidebar-close">Close</button>
        </header>
        <div class="hub-sidebar-profile-card" id="hub-sidebar-profile-card" hidden>
            <div class="hub-sidebar-profile-avatar" id="hub-sidebar-profile-avatar">--</div>
            <div class="hub-sidebar-profile-info">
                <p class="hub-sidebar-profile-name" id="hub-sidebar-profile-name">-</p>
                <p class="hub-sidebar-profile-meta" id="hub-sidebar-profile-course" aria-live="polite" hidden></p>
                <p class="hub-sidebar-profile-meta" id="hub-sidebar-profile-year" hidden></p>
                <p class="hub-sidebar-profile-meta" id="hub-sidebar-profile-class" hidden></p>
                <span class="hub-sidebar-profile-strand" id="hub-sidebar-profile-strand" hidden></span>
            </div>
        </div>
        <p class="hub-global-sidebar-copy" id="hub-global-sidebar-copy">Quick access while signed in.</p>
        <nav class="hub-global-sidebar-links" aria-label="Sidebar links" id="hub-global-sidebar-nav">
            <a href="/teacher-view.html" id="hub-global-sidebar-teacher-link" hidden>Teacher View</a>
            <a href="/admin-menu.html" id="hub-global-sidebar-admin-link" hidden>Admin Menu</a>
            <button type="button" id="hub-global-sidebar-tasklist-link" hidden>Open Task List</button>
            <a href="${escapeHtml(SENIOR_EXTERNAL_EXAM_FORM_URL)}" id="hub-global-sidebar-external-exam-form" target="_blank" rel="noopener noreferrer" hidden>SeniorDTECH External Exam Confirmation Form</a>
        </nav>
        <div id="hub-global-sidebar-allocations" hidden>
            <section class="hub-sidebar-alloc-section" id="hub-sidebar-assessment-section" hidden>
                <h3 class="hub-sidebar-alloc-heading">My Assessment Tasks</h3>
                <ul class="hub-sidebar-alloc-list" id="hub-sidebar-assessment-list"></ul>
            </section>
            <section class="hub-sidebar-alloc-section" id="hub-sidebar-projects-section" hidden>
                <h3 class="hub-sidebar-alloc-heading">My Projects</h3>
                <ul class="hub-sidebar-alloc-list" id="hub-sidebar-projects-list"></ul>
            </section>
            <p class="hub-sidebar-alloc-empty" id="hub-sidebar-alloc-empty" hidden>No tasks or projects allocated yet.</p>
        </div>
        <div class="hub-sidebar-summary-cards" id="hub-sidebar-summary-cards" hidden>
            <div class="hub-sidebar-summary-card hub-sidebar-internal-card" id="hub-sidebar-internal-card" hidden>
                <div class="hub-sidebar-summary-title">Internal Assessment Summary</div>
                <div class="hub-sidebar-summary-list" id="hub-sidebar-internal-list"></div>
            </div>
            <div class="hub-sidebar-summary-card hub-sidebar-external-card" id="hub-sidebar-external-card" hidden>
                <div class="hub-sidebar-summary-title">External Assessment Summary</div>
                <div class="hub-sidebar-summary-list" id="hub-sidebar-external-list"></div>
            </div>
        </div>
        <div class="hub-sidebar-bottom">
            <section class="hub-sidebar-kit-card" aria-labelledby="hub-sidebar-kit-heading">
                <h3 id="hub-sidebar-kit-heading">Current Learning Kit</h3>
                <p class="hub-sidebar-kit-title" id="hub-sidebar-kit-title">Loading your kit...</p>
                <p id="hub-sidebar-kit-description" aria-live="polite">Checking your Licence progress.</p>
                <a class="hub-sidebar-kit-action" id="hub-sidebar-kit-open" hidden>Open Kit &#8594;</a>
                <button class="hub-sidebar-kit-action" id="hub-sidebar-kit-retry" type="button" hidden>Retry loading kit</button>
            </section>
            <section class="hub-sidebar-licence-card" aria-labelledby="hub-sidebar-licence-heading">
                <h3 id="hub-sidebar-licence-heading">My Licence</h3>
                <a href="/practical-skills/checklist.html">View My Licence &#8594;</a>
            </section>
        <aside class="hub-sidebar-learning-sites" aria-label="Learning sites">
            <h3>Quick Links</h3>
            <div class="hub-sidebar-learning-links">
                <a href="https://sites.google.com/westlandhigh.school.nz/dtec/home" target="_blank" rel="noopener noreferrer">
                    <span>DTECH Learning Site</span>
                    <span aria-hidden="true">&#8599;</span>
                </a>
                <a href="https://tech-learningsites.onrender.com/" target="_blank" rel="noopener noreferrer">
                    <span>TECH Learning Sites</span>
                    <span aria-hidden="true">&#8599;</span>
                </a>
            </div>
        </aside>
        </div>
    `;

    const setOpen = (isOpen) => {
        panel.classList.toggle("is-open", Boolean(isOpen));
        backdrop.classList.toggle("is-open", Boolean(isOpen));
    };

    toggle.addEventListener("click", () => setOpen(true));
    backdrop.addEventListener("click", () => setOpen(false));
    panel.querySelector("#hub-global-sidebar-close")?.addEventListener("click", () => setOpen(false));
    panel.querySelector("#hub-sidebar-kit-retry")?.addEventListener("click", () => {
        void loadAndRenderSidebarKit(panel);
    });

    const taskListButton = panel.querySelector("#hub-global-sidebar-tasklist-link");
    taskListButton?.addEventListener("click", () => {
        window.location.href = getTaskListPageUrl();
        setOpen(false);
    });

    const teacherLink = panel.querySelector("#hub-global-sidebar-teacher-link");
    teacherLink?.addEventListener("click", (event) => {
        const signedIn = hasAllowedSignedInHubAccount();
        const canToggleView = signedIn && (hubAccessState.canTeacherView || hubAccessState.canAdmin);
        if (!canToggleView) return;

        const currentMode = getEffectiveHubViewMode();
        const nextMode = currentMode === "teacher" ? "student" : "teacher";
        writeStoredHubViewMode(nextMode);

        if (nextMode === "teacher") {
            event.preventDefault();
            setOpen(false);
            window.location.href = "/teacher-view.html";
            return;
        }

        if (nextMode === "student") {
            event.preventDefault();
            setOpen(false);
            if (isTeacherWorkspacePath()) {
                window.location.href = "/index.html";
            } else {
                renderHubAuthUi();
                if (typeof renderLibrary === "function") renderLibrary();
            }
        }
    });

    document.body.append(toggle, backdrop, panel);
    hubGlobalSidebarNodes = { toggle, backdrop, panel, setOpen };
    return hubGlobalSidebarNodes;
}

function getTaskListPageUrl() {
    return document.querySelector("#hub-senior-task-list-link")?.getAttribute("href") || "/task-list.html";
}

function renderGlobalHubSidebar({ signedIn, canTeacherView, canAdmin }) {
    if (document.body.classList.contains("kit-worksheet-page")) {
        return;
    }

    const { toggle, panel, setOpen } = ensureGlobalHubSidebar();

    if (!signedIn) {
        const kitTitle = panel.querySelector("#hub-sidebar-kit-title");
        if (kitTitle) kitTitle.dataset.requestId = String(Number(kitTitle.dataset.requestId || 0) + 1);
        toggle.hidden = true;
        setOpen(false);
        return;
    }

    toggle.hidden = false;
    renderHubSidebarProfileCard(panel);
    void loadAndRenderSidebarCourse(panel);
    void loadAndRenderSidebarKit(panel);

    const teacherLink = panel.querySelector("#hub-global-sidebar-teacher-link");
    const adminLink = panel.querySelector("#hub-global-sidebar-admin-link");
    const taskListButton = panel.querySelector("#hub-global-sidebar-tasklist-link");
    const nav = panel.querySelector("#hub-global-sidebar-nav");
    const allocationsHost = panel.querySelector("#hub-global-sidebar-allocations");
    const copy = panel.querySelector("#hub-global-sidebar-copy");

    const isStudentView = getEffectiveHubViewMode() !== "teacher";
    const canToggleView = Boolean(canTeacherView || canAdmin);

    if (nav) nav.hidden = false;
    if (teacherLink) {
        teacherLink.hidden = !canToggleView;
        if (canToggleView) {
            const inTeacherMode = !isStudentView;
            teacherLink.textContent = inTeacherMode ? "Switch to Student View" : "Switch to Teacher View";
            teacherLink.href = inTeacherMode ? "/index.html" : "/teacher-view.html";
        }
    }
    if (adminLink) adminLink.hidden = !canAdmin || isStudentView;
    if (taskListButton) {
        taskListButton.hidden = !["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(panel.dataset.course);
    }

    if (copy) {
        const displayName = getHubDisplayName(hubAuthState.profile);
        copy.textContent = displayName
            ? `Welcome ${displayName}. Quick access is available on every page.`
            : "Quick access is available on every page.";
    }

    // Load and render student allocations
    if (allocationsHost) {
        void loadAndRenderSidebarAllocations(panel);
    }

    if (!readGlobalSidebarSeenThisSession()) {
        markGlobalSidebarSeenThisSession();
        setTimeout(() => setOpen(true), 180);
    }
}

async function loadAndRenderSidebarKit(panel) {
    const title = panel.querySelector("#hub-sidebar-kit-title");
    const description = panel.querySelector("#hub-sidebar-kit-description");
    const open = panel.querySelector("#hub-sidebar-kit-open");
    const retry = panel.querySelector("#hub-sidebar-kit-retry");
    if (!title || !description || !open || !retry) return;
    const email = normalizeEmail(hubAuthState.profile?.email || "");
    const requestId = String(Number(title.dataset.requestId || 0) + 1);
    title.dataset.requestId = requestId;
    title.textContent = "Loading your kit...";
    description.textContent = "Checking your Licence progress.";
    open.hidden = true;
    open.removeAttribute("href");
    retry.hidden = true;
    if (!email) return;
    const current = () => title.dataset.requestId === requestId
        && normalizeEmail(hubAuthState.profile?.email || "") === email;
    try {
        const response = await fetch("/api/practical-skills/my-progress", {
            headers: withHubAuthHeaders({}, email), cache: "no-store"
        });
        const snapshot = await response.json();
        if (!response.ok) throw new Error(snapshot.error || `HTTP ${response.status}`);
        if (!Array.isArray(snapshot.kits) || snapshot.kits.some((kit) =>
            typeof kit.id !== "string" || typeof kit.isComplete !== "boolean")) {
            throw new Error("Licence progress response is invalid.");
        }
        if (!current()) return;
        const next = snapshot.kits.find((kit) => !kit.isComplete);
        if (!next) {
            title.textContent = "All kits completed";
            description.textContent = "View your Licence to see your stamps and certificates.";
            return;
        }
        const contentResponse = await fetch(`/api/practical-skills/kit-content/${encodeURIComponent(next.id)}`, { cache: "no-store" });
        const content = await contentResponse.json();
        if (!contentResponse.ok) throw new Error(content.error || `HTTP ${contentResponse.status}`);
        const name = String(content.content?.identity?.name || content.content?.bannerTitle || "").trim();
        if (!name) throw new Error("The kit title could not be loaded.");
        if (!current()) return;
        title.textContent = name;
        description.textContent = "Continue your activities";
        open.href = `/practical-skills/kit-worksheet.html?kit=${encodeURIComponent(next.id)}`;
        open.hidden = false;
    } catch (error) {
        console.error("Could not load sidebar learning kit", error);
        if (!current()) return;
        title.textContent = "Kit could not be loaded";
        description.textContent = "Please retry or open My Licence below.";
        retry.hidden = false;
    }
}

function routeHubCourseHomepage(course) {
    const signedIn = hasAllowedSignedInHubAccount();
    const juniorOrMiddle = ["JuniorDTECH", "MiddleDTECH"].includes(course);
    const destination = juniorOrMiddle ? "/learning-pathways/" : "/index.html";
    const brand = document.querySelector(".topbar .brand");
    if (brand) brand.href = signedIn && juniorOrMiddle ? destination : "/index.html";
    if (!signedIn || !hubAccessState.resolved
        || !["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(course)) return;
    const pathname = window.location.pathname.toLowerCase();
    const labHome = pathname === "/" || pathname === "/index.html";
    const pathwaysHome = pathname === "/learning-pathways/" || pathname === "/learning-pathways/index.html";
    if ((labHome && juniorOrMiddle) || (pathwaysHome && course === "SeniorDTECH")) {
        window.location.replace(destination);
    }
}

function getTaskListCourseFromAllocations(items) {
    const rows = Array.isArray(items) ? items : [];
    if (rows.some((item) => {
        const year = Number.parseInt(String(item?.year_group || "").replace(/[^0-9]/g, ""), 10);
        const course = String(item?.course_type || "").trim().toUpperCase();
        return [11, 12, 13].includes(year) && course === "DTECH";
    })) {
        return "SeniorDTECH";
    }
    return rows.some((item) => {
        const year = Number.parseInt(String(item?.year_group || "").replace(/[^0-9]/g, ""), 10);
        const course = String(item?.course_type || "").trim().toUpperCase();
        return [9, 10].includes(year) && ["DTECH", "MDTECH"].includes(course);
    }) ? "MiddleDTECH" : "";
}

function getShortTaskListCourseName(course) {
    return {
        JuniorDTECH: "JnrDTECH",
        MiddleDTECH: "MidDTECH",
        SeniorDTECH: "SnrDTECH"
    }[String(course || "").trim()] || "";
}

function updateSidebarCourseSections(panel, course = panel.dataset.course || "", status = "ready") {
    panel.dataset.course = course;
    panel.dataset.courseStatus = status;
    const taskListCourse = course || panel.dataset.allocationCourse || "";
    const pathwaysLink = document.querySelector("#hub-pathways-link");
    if (pathwaysLink) {
        pathwaysLink.hidden = !hubAuthState.profile?.email || !["JuniorDTECH", "MiddleDTECH"].includes(course);
    }
    const taskListLink = document.querySelector("#hub-senior-task-list-link");
    if (taskListLink) {
        taskListLink.href = course === "JuniorDTECH" ? "/learning-pathways/task-list.html" : "/task-list.html";
        taskListLink.hidden = !hubAuthState.profile?.email || !["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(taskListCourse);
        const courseBadge = taskListLink.querySelector?.("[data-task-list-course]");
        if (courseBadge) {
            const shortCourse = getShortTaskListCourseName(taskListCourse);
            courseBadge.textContent = shortCourse;
            courseBadge.hidden = !shortCourse;
        }
    }
    const taskListButton = panel.querySelector("#hub-global-sidebar-tasklist-link");
    if (taskListButton) {
        taskListButton.hidden = !hubAuthState.profile?.email || !["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(taskListCourse);
    }
    const isSenior = taskListCourse === "SeniorDTECH";
    const allocations = panel.querySelector("#hub-global-sidebar-allocations");
    const summaries = panel.querySelector("#hub-sidebar-summary-cards");
    if (allocations) allocations.hidden = !isSenior;
    if (summaries) summaries.hidden = !isSenior || summaries.dataset.available !== "true";
    window.dispatchEvent(new CustomEvent("hub-course-resolved", {
        detail: { course, status }
    }));
}

window.addEventListener("hub-course-changed", () => {
    const panel = document.querySelector("#hub-global-sidebar");
    if (panel) void loadAndRenderSidebarCourse(panel);
});

async function loadAndRenderSidebarCourse(panel) {
    updateSidebarCourseSections(panel, "", "pending");
    const courseEl = panel.querySelector("#hub-sidebar-profile-course");
    if (!courseEl) return;
    const email = normalizeEmail(hubAuthState.profile?.email || "");
    courseEl.textContent = "";
    courseEl.hidden = true;
    if (!email) return;
    const requestId = String(Number(courseEl.dataset.requestId || 0) + 1);
    courseEl.dataset.requestId = requestId;
    try {
        const response = await fetch("/api/practical-skills/my-course", {
            headers: withHubAuthHeaders({}, email), cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (typeof data.course !== "string") throw new Error("Course response is invalid.");
        if (normalizeEmail(hubAuthState.profile?.email || "") !== email || courseEl.dataset.requestId !== requestId) return;
        courseEl.textContent = data.course ? `Course: ${data.course}` : "Course: Not confirmed yet";
        courseEl.hidden = false;
        updateSidebarCourseSections(panel, data.course);
        routeHubCourseHomepage(data.course);
    } catch (error) {
        console.error("Could not load sidebar course", error);
        if (normalizeEmail(hubAuthState.profile?.email || "") !== email || courseEl.dataset.requestId !== requestId) return;
        updateSidebarCourseSections(panel, "", "error");
        courseEl.textContent = "Course: Could not load";
        courseEl.hidden = false;
    }
}

async function loadAndRenderSidebarAllocations(panel) {
    const assessmentSection = panel.querySelector("#hub-sidebar-assessment-section");
    const assessmentList = panel.querySelector("#hub-sidebar-assessment-list");
    const projectsSection = panel.querySelector("#hub-sidebar-projects-section");
    const projectsList = panel.querySelector("#hub-sidebar-projects-list");
    const emptyNote = panel.querySelector("#hub-sidebar-alloc-empty");

    if (!assessmentSection || !projectsSection) return;

    const email = normalizeEmail(hubAuthState.profile?.email || "");
    if (!email) return;

    try {
        const resp = await fetch("/api/my-allocations", {
            // Use header identity for this lightweight read endpoint to avoid token-verification false negatives.
            headers: { "x-user-email": email }
        });
        if (!resp.ok) return;

        const data = await resp.json();
        const assessments = Array.isArray(data.assessment_tasks) ? data.assessment_tasks : [];
        const projects = Array.isArray(data.projects) ? data.projects : [];
        const hasExternalExamAllocation = Boolean(data.has_external_exam_allocation);
        const externalExamIntention = String(data.external_exam_intention || "").trim().toLowerCase();
        const externalExamFormLink = panel.querySelector("#hub-global-sidebar-external-exam-form");
        if (externalExamFormLink) {
            externalExamFormLink.hidden = !hasExternalExamAllocation || externalExamIntention === "no";
            externalExamFormLink.href = SENIOR_EXTERNAL_EXAM_FORM_URL;
        }
        if (hasExternalExamAllocation && !externalExamIntention) {
            showExternalExamIntentionReminder(email);
        }

        const profileDetails = computeHubSidebarProfileDetails([...assessments, ...projects]);
        panel.dataset.allocationCourse = getTaskListCourseFromAllocations([...assessments, ...projects]);
        updateSidebarCourseSections(panel);
        hubStudentAllocatedStandards = Array.isArray(data.allocated_standards) ? data.allocated_standards : [];
        hubStudentExternalStandards = Array.isArray(data.external_standards) ? data.external_standards : [];
        hubStudentExternalExamIntention = externalExamIntention;
        const digitalMediaAllocation = [...assessments, ...projects].find((item) =>
            ["91893", "91903"].includes(String(item?.standard_1 || "").trim())
            || ["91893", "91903"].includes(String(item?.standard_2 || "").trim())
        );
        hubStudentDigitalMediaType = String(
            digitalMediaAllocation?.digital_media_type || profileDetails.digitalMediaStrand || ""
        ).trim();
        renderHubSidebarProfileCard(panel, profileDetails);
        renderHubSidebarStandardsCard(panel, profileDetails.yearGroup, hubStudentAllocatedStandards, hubStudentExternalStandards, externalExamIntention);
        renderCurrentWeek();
        renderHubPracticalSkillsMenu(profileDetails.yearGroup);
        renderStats();

        if (assessmentList) {
            assessmentList.innerHTML = assessments.map((item) =>
                `<li class="hub-sidebar-alloc-item"><a href="/ProjectPages/custom-activity.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a></li>`
            ).join("");
        }
        if (projectsList) {
            projectsList.innerHTML = projects.map((item) =>
                `<li class="hub-sidebar-alloc-item"><a href="/ProjectPages/custom-activity.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a></li>`
            ).join("");
        }

        const taskListButton = panel.querySelector("#hub-global-sidebar-tasklist-link");
        if (taskListButton) {
            taskListButton.hidden = !["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(panel.dataset.course);
        }

        if (assessmentSection) assessmentSection.hidden = assessments.length === 0;
        if (projectsSection) projectsSection.hidden = projects.length === 0;
        if (emptyNote) emptyNote.hidden = assessments.length > 0 || projects.length > 0;
    } catch (_err) {
        // Silent fail — sidebar is non-critical
    }
}

function showExternalExamIntentionReminder(email) {
    const safeEmail = normalizeEmail(email);
    if (!safeEmail || typeof document.createElement !== "function") return;
    const reminderKey = `hub_external_exam_reminder_dismissed_v1:${safeEmail}`;
    try {
        if (sessionStorage.getItem(reminderKey)) return;
        sessionStorage.setItem(reminderKey, "1");
    } catch (_error) {
    }

    const dialog = document.createElement("dialog");
    dialog.className = "hub-external-exam-reminder";
    dialog.setAttribute("aria-labelledby", "hub-external-exam-reminder-title");
    dialog.innerHTML = `
        <div class="hub-external-exam-reminder-content">
            <p class="hub-external-exam-reminder-kicker">SeniorDTECH External Exam</p>
            <h2 id="hub-external-exam-reminder-title">Please confirm your November exam plans</h2>
            <p>Our records show that you are allocated to an external exam, but we have not received your confirmation yet. Please complete the short form, even if you do not plan to sit the exam.</p>
            <div class="hub-external-exam-reminder-actions">
                <a href="${escapeHtml(SENIOR_EXTERNAL_EXAM_FORM_URL)}" target="_blank" rel="noopener noreferrer">Open confirmation form</a>
                <button type="button" data-external-exam-reminder-dismiss>Remind me later</button>
            </div>
        </div>
    `;
    dialog.querySelector("[data-external-exam-reminder-dismiss]")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

function renderHubPracticalSkillsMenu(yearGroup) {
    const summary = document.querySelector("#hub-practical-skills-summary");

    if (summary) summary.textContent = "Licence";
}

function renderHubSidebarStandardsCard(panel, yearGroup, internalStandards, externalStandards, externalExamIntention = "") {
    const summaryCardsContainer = panel.querySelector("#hub-sidebar-summary-cards");
    const internalCard = panel.querySelector("#hub-sidebar-internal-card");
    const internalList = panel.querySelector("#hub-sidebar-internal-list");
    const externalCard = panel.querySelector("#hub-sidebar-external-card");
    const externalList = panel.querySelector("#hub-sidebar-external-list");

    if (!summaryCardsContainer || !internalCard || !internalList || !externalCard || !externalList) return;

    const normalizedYear = String(yearGroup || "").trim().replace(/^year\s*/i, "");
    const isSenior = ["11", "12", "13"].includes(normalizedYear);

    const internalRows = (Array.isArray(internalStandards) ? internalStandards : [])
        .filter((item) => String(item?.standard_number || "").trim())
        .sort((left, right) => String(left.standard_number).localeCompare(String(right.standard_number), undefined, { numeric: true }));

    const externalRows = (Array.isArray(externalStandards) ? externalStandards : [])
        .filter((item) => String(item?.standard_number || "").trim())
        .sort((left, right) => String(left.standard_number).localeCompare(String(right.standard_number), undefined, { numeric: true }));

    const showSummarySection = isSenior || internalRows.length > 0 || externalRows.length > 0;

    if (!showSummarySection) {
        summaryCardsContainer.dataset.available = "false";
        summaryCardsContainer.hidden = true;
        internalCard.hidden = true;
        externalCard.hidden = true;
        internalList.innerHTML = "";
        externalList.innerHTML = "";
        return;
    }

    const internalLabels = {
        "91897": "Process & Outcome",
        "91907": "Process & Outcome",
        "91893": "Digital Media",
        "91903": "Digital Media"
    };

    const externalLabels = {
        "92006": "Computer Science",
        "92007": "Digital Outcome",
        "91898": "Computer Science",
        "91899": "Digital Outcome",
        "91908": "Computer Science",
        "91909": "Digital Outcome"
    };

    if (internalRows.length > 0) {
        internalList.innerHTML = internalRows.map((item) => {
            const standardNumber = String(item.standard_number || "").trim();
            const credits = Number.parseInt(item.credits, 10);
            const creditText = Number.isInteger(credits) ? `${credits} credits` : "Credits not set";
            const label = internalLabels[standardNumber] || "Internal Assessment";
            const standardHref = `/assessment-standard-card.html?standard=${encodeURIComponent(standardNumber)}`;
            return `
                <a class="hub-sidebar-summary-row hub-sidebar-internal-row" href="${escapeHtml(standardHref)}" aria-label="Open standard ${escapeHtml(standardNumber)}">
                    <span class="hub-sidebar-summary-left">
                        <strong>${escapeHtml(standardNumber)}</strong>
                        <small>${escapeHtml(label)}</small>
                    </span>
                    <span class="hub-sidebar-summary-credits">${escapeHtml(creditText)}</span>
                </a>
            `;
        }).join("");
        internalCard.hidden = false;
    } else {
        internalCard.hidden = true;
        internalList.innerHTML = "";
    }

    if (externalRows.length > 0) {
        externalList.innerHTML = externalRows.map((item) => {
            const standardNumber = String(item.standard_number || "").trim();
            const credits = Number.parseInt(item.credits, 10);
            const creditText = Number.isInteger(credits) ? `${credits} credits` : "Credits not set";
            const label = externalLabels[standardNumber] || item.standard_name || "External Assessment";
            const standardHref = `/assessment-standard-card.html?standard=${encodeURIComponent(standardNumber)}`;
            return `
                <a class="hub-sidebar-summary-row hub-sidebar-external-row" href="${escapeHtml(standardHref)}" aria-label="Open standard ${escapeHtml(standardNumber)}">
                    <span class="hub-sidebar-summary-left">
                        <strong>${escapeHtml(standardNumber)}</strong>
                        <small>${escapeHtml(label)}</small>
                    </span>
                    <span class="hub-sidebar-summary-credits">${escapeHtml(creditText)}</span>
                </a>
            `;
        }).join("");
        externalCard.hidden = false;
    } else {
        const externalEmptyMessage = String(externalExamIntention || "").trim().toLowerCase() === "no"
            ? "You have CHOSEN not to continue with the Exam."
            : "You are not currently enrolled in an External DTECH exam.";
        externalList.innerHTML = `<div class="hub-sidebar-summary-empty hub-sidebar-external-empty">${escapeHtml(externalEmptyMessage)}</div>`;
        externalCard.hidden = false;
    }

    summaryCardsContainer.dataset.available = "true";
    updateSidebarCourseSections(panel);
}

function getHubSummaryStandardNumbers() {
    return new Set(
        [...hubStudentAllocatedStandards, ...hubStudentExternalStandards]
            .map((standard) => String(standard?.standard_number || standard?.standardNumber || "").trim())
            .filter(Boolean)
    );
}

// Reads year group/class/digital-media strand from the student's own allocation rows (each already
// carries year_group/course_type resolved server-side from the class-management timetable data).
function computeHubSidebarProfileDetails(items) {
    const rows = Array.isArray(items) ? items : [];
    let yearGroup = "";
    let classLabel = "";
    let digitalMediaStrand = "";

    rows.forEach((item) => {
        const itemYear = String(item?.year_group || "").trim().replace(/^year\s*/i, "");
        const itemCourse = String(item?.course_type || "").trim().toUpperCase();

        if (!yearGroup && itemYear) yearGroup = itemYear;
        if (!classLabel && itemCourse) classLabel = itemYear ? `${itemYear}${itemCourse}` : itemCourse;

        if (!digitalMediaStrand) {
            const standard1 = String(item?.standard_1 || "").trim();
            const standard2 = String(item?.standard_2 || "").trim();
            const isDigitalMediaStandard = ["91893", "91903"].includes(standard1) || ["91893", "91903"].includes(standard2);
            const isSeniorDtechOrComp = itemCourse === "DTECH" || itemCourse === "COMP";
            const mediaType = String(item?.digital_media_type || "").trim();
            if (isDigitalMediaStandard && isSeniorDtechOrComp && mediaType) {
                digitalMediaStrand = mediaType;
            }
        }
    });

    return { yearGroup, classLabel, digitalMediaStrand };
}

function renderHubSidebarProfileCard(panel, details = {}) {
    const card = panel.querySelector("#hub-sidebar-profile-card");
    if (!card) return;

    const avatarEl = panel.querySelector("#hub-sidebar-profile-avatar");
    const nameEl = panel.querySelector("#hub-sidebar-profile-name");
    const yearEl = panel.querySelector("#hub-sidebar-profile-year");
    const classEl = panel.querySelector("#hub-sidebar-profile-class");
    const strandEl = panel.querySelector("#hub-sidebar-profile-strand");

    if (avatarEl) avatarEl.textContent = getHubUserInitials(hubAuthState.profile);
    if (nameEl) nameEl.textContent = getHubDisplayName(hubAuthState.profile) || "Student";

    const yearText = String(details?.yearGroup || "").trim();
    if (yearEl) {
        yearEl.textContent = yearText ? `Year ${yearText}` : "";
        yearEl.hidden = !yearText;
    }

    const classText = String(details?.classLabel || "").trim();
    if (classEl) {
        classEl.textContent = classText ? `Class: ${classText}` : "";
        classEl.hidden = !classText;
    }

    const strandText = String(details?.digitalMediaStrand || "").trim();
    if (strandEl) {
        strandEl.textContent = strandText ? `Digital Media: ${strandText}` : "";
        strandEl.hidden = !strandText;
    }

    card.hidden = false;
}

function saveHubAuthState() {
    const bearerToken = String(hubAuthState.idToken || hubAuthState.accessToken || "").trim();
    if (!bearerToken || !hubAuthState.profile) {
        clearHubStoredAuthRaw();
        return;
    }

    const payload = {
        idToken: hubAuthState.idToken,
        accessToken: hubAuthState.accessToken,
        grantedScopes: hubAuthState.grantedScopes,
        expiresAt: hubAuthState.expiresAt,
        profile: hubAuthState.profile
    };
    setHubStoredAuthRaw(JSON.stringify(payload));
}

function clearHubAuthState() {
    hubAuthState.idToken = null;
    hubAuthState.accessToken = null;
    hubAuthState.grantedScopes = "";
    hubAuthState.expiresAt = 0;
    hubAuthState.profile = null;
    hubAuthState.autoPromptInFlight = false;
    hubAuthState.pendingTokenResolvers = [];
    hubAccessState.resolved = false;
    hubAccessState.isStaff = false;
    hubAccessState.isStudent = false;
    hubAccessState.canTeacherView = false;
    hubAccessState.canAdmin = false;
    hubAccessState.defaultView = "student";
    hubAccessState.additionalRole = "";
    hubStudentAllocatedStandards = [];
    hubStudentExternalStandards = [];
    hubStudentExternalExamIntention = "";
    resetHubDriveSetupState();
    clearHubStoredAuthRaw();
    setHubProfileOpen(false);
}

async function resolveHubAccessState() {
    const email = normalizeEmail(hubAuthState.profile?.email || "");
    if (!email) {
        hubAccessState.resolved = false;
        hubAccessState.isStaff = false;
        hubAccessState.isStudent = false;
        hubAccessState.canTeacherView = false;
        hubAccessState.canAdmin = false;
        hubAccessState.defaultView = "student";
        hubAccessState.additionalRole = "";
        return;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
        if (!response.ok) {
            throw new Error("Could not resolve user access.");
        }

        const data = await response.json();
        hubAccessState.resolved = true;
        hubAccessState.isStaff = Boolean(data.is_staff);
        hubAccessState.isStudent = Boolean(data.is_student);
        hubAccessState.canTeacherView = Boolean(data.can_teacher_view);
        hubAccessState.canAdmin = Boolean(data.can_admin);
        hubAccessState.defaultView = String(data.default_view || "student").toLowerCase() === "teacher" ? "teacher" : "student";
        hubAccessState.additionalRole = String(data.additional_role || "").trim();
    } catch (_error) {
        // Safe fallback: do not expose teacher/admin links when access cannot be resolved.
        hubAccessState.resolved = false;
        hubAccessState.isStaff = false;
        hubAccessState.isStudent = false;
        hubAccessState.canTeacherView = false;
        hubAccessState.canAdmin = false;
        hubAccessState.defaultView = "student";
        hubAccessState.additionalRole = "";
    }
}

function loadHubAuthState() {
    if (window.whsDtech) {
        hubAuthState.profile = window.whsDtech.profile;
        return;
    }
    const raw = getHubStoredAuthRaw();
    if (!raw) {
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        const parsedBearer = String(parsed?.idToken || parsed?.accessToken || "").trim();
        const hasProfile = Boolean(parsed.profile?.email);
        const tokenIsValid = Boolean(parsedBearer && parsed.expiresAt && parsed.expiresAt > Date.now());

        if (tokenIsValid) {
            hubAuthState.idToken = parsedBearer;
            hubAuthState.accessToken = parsed.accessToken || null;
            hubAuthState.grantedScopes = String(parsed?.grantedScopes || "").trim();
            hubAuthState.expiresAt = parsed.expiresAt;
            hubAuthState.profile = parsed.profile || null;
            return;
        }

        if (hasProfile) {
            // Keep profile state across pages even when the Google token has expired.
            hubAuthState.idToken = null;
            hubAuthState.accessToken = null;
            hubAuthState.grantedScopes = String(parsed?.grantedScopes || "").trim();
            hubAuthState.expiresAt = 0;
            hubAuthState.profile = parsed.profile;
            // Do NOT clear storage, just update it to reflect token expiry.
            saveHubAuthState();
            return;
        }

        // Only clear storage if there is no valid profile.
        clearHubStoredAuthRaw();
    } catch (_error) {
        clearHubStoredAuthRaw();
    }
}

function isAllowedHubAccount(profile) {
    if (window.whsDtech && normalizeEmail(profile?.email) !== normalizeEmail(window.whsDtech.profile.email)) return false;
    if (!profile?.email || !profile?.email_verified) {
        return false;
    }

    if (!hubAllowedDomain) {
        return true;
    }

    return profile.email.toLowerCase().endsWith(`@${hubAllowedDomain}`);
}

function renderHubAuthUi() {
    const signedIn = hasAllowedSignedInHubAccount();
    const canTeacherView = signedIn && hubAccessState.canTeacherView;
    const canAdmin = signedIn && hubAccessState.canAdmin;
    const normalizedRole = String(hubAccessState.additionalRole || "").trim().toLowerCase().replace(/\s+/g, " ");
    const canBrowseUnitPlans = signedIn && (canAdmin || normalizedRole === "teacher" || normalizedRole === "lead teacher");
    const canBrowseCourseOutlines = signedIn && (canAdmin || normalizedRole === "teacher" || normalizedRole === "lead teacher");
    const canToggleView = canTeacherView || canAdmin;

    if (canToggleView && isTeacherWorkspacePath()) {
        writeStoredHubViewMode("teacher");
    }

    const inTeacherMode = canToggleView && getEffectiveHubViewMode() === "teacher";

    let badgeLabel = "";
    let badgeClass = "";
    if (signedIn) {
        if (canTeacherView && inTeacherMode && !canAdmin) {
            badgeLabel = "Staff";
            badgeClass = "badge-staff";
        } else if (!canAdmin || !inTeacherMode) {
            badgeLabel = "Student";
            badgeClass = "badge-student";
        }
    }

    if (hubSignInButton) {
        hubSignInButton.hidden = signedIn;
    }
    if (hubStartupSignInBanner) {
        const showStartupBanner = !signedIn
            && isHomepagePath()
            && isHubAutoLoginRequestedByUrl();
        hubStartupSignInBanner.hidden = !showStartupBanner;
    }
    if (hubSignOutButton) {
        hubSignOutButton.hidden = window.whsDtech ? true : !signedIn;
    }
    if (hubUserBadge) {
        hubUserBadge.hidden = !signedIn;
        const initials = signedIn ? getHubUserInitials(hubAuthState.profile) : "";
        const roleSuffix = signedIn
            ? (canToggleView ? (inTeacherMode ? "Teacher" : (hubAccessState.resolved ? "Student" : "")) : (canTeacherView ? "Teacher" : "Student"))
            : "";
        hubUserBadge.textContent = roleSuffix ? `${initials} - ${roleSuffix}` : initials;
        hubUserBadge.title = signedIn ? getHubDisplayName(hubAuthState.profile) : "";
    }
    if (hubStaffLink) {
        hubStaffLink.hidden = !canToggleView;
        if (canToggleView) {
            hubStaffLink.textContent = inTeacherMode ? "Switch to Student View" : "Switch to Teacher View";
            hubStaffLink.href = inTeacherMode ? "/index.html" : "/teacher-view.html";
        }
    }
    if (hubTeacherDashboardLink) {
        hubTeacherDashboardLink.hidden = !canAdmin;
    }
    if (hubAdminLink) {
        hubAdminLink.hidden = !canAdmin;
    }
    if (hubUploadKitsLink) {
        hubUploadKitsLink.hidden = !canAdmin;
    }
    if (hubSettingsLink) {
        hubSettingsLink.hidden = !canAdmin;
    }
    if (hubUploadMenu) {
        hubUploadMenu.hidden = !(canAdmin || (canTeacherView && inTeacherMode));
        if (hubUploadMenu.hidden) {
            hubUploadMenu.open = false;
        }
    }
    if (hubStudentWorkMenu) {
        hubStudentWorkMenu.hidden = !(canToggleView && inTeacherMode);
        if (hubStudentWorkMenu.hidden) {
            hubStudentWorkMenu.open = false;
        }
    }
    if (hubPracticalSkillsMenu) {
        hubPracticalSkillsMenu.hidden = !signedIn;
        if (!signedIn) {
            hubPracticalSkillsMenu.open = false;
        }
    }
    const pathwaysLink = document.querySelector("#hub-pathways-link");
    if (pathwaysLink) pathwaysLink.hidden = true;
    routeHubCourseHomepage("");
    if (hubSeniorTaskListLink) {
        hubSeniorTaskListLink.hidden = true;
    }
    if (hubAccessBadge) {
        hubAccessBadge.hidden = !signedIn || canAdmin || !badgeLabel;
        hubAccessBadge.textContent = badgeLabel;
        hubAccessBadge.className = badgeClass ? `hub-access-badge ${badgeClass}` : "hub-access-badge";
    }
    renderHubDriveSyncButton();
    if (hubBrowseMenu) {
        hubBrowseMenu.hidden = !signedIn;
        if (!signedIn) {
            hubBrowseMenu.open = false;
        }
    }
    if (hubBrowseButtons.length) {
        hubBrowseButtons.forEach((element) => {
            element.hidden = !signedIn;
        });
    }
    if (hubUnitPlansButtons.length) {
        hubUnitPlansButtons.forEach((element) => {
            element.hidden = !canBrowseUnitPlans;
        });
    }
    if (hubCourseOutlinesButtons.length) {
        hubCourseOutlinesButtons.forEach((element) => {
            element.hidden = !canBrowseCourseOutlines;
        });
    }
    refreshTemplateLibraryAccessUi(signedIn);

    renderGlobalHubSidebar({ signedIn, canTeacherView, canAdmin });

    setPublicHomepageUiState(signedIn);

    window.dispatchEvent(new CustomEvent("hub-auth-state-changed", {
        detail: { signedIn, canTeacherView, canAdmin }
    }));

    if (isHomepagePath() && libraryGrid) {
        if (signedIn && inTeacherMode) {
            loadProjectAssignmentSummaries();
        } else {
            clearProjectAssignmentSummaries();
        }
    }

    if (!signedIn) {
        setHubProfileOpen(false);
        renderCurrentWeek();
        return;
    }

    populateHubProfilePanel();
}

async function fetchGoogleUserProfile(accessToken) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error("Could not fetch Google profile.");
    }
    return response.json();
}

function decodeBase64UrlValue(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
}

function parseJwtPayload(token) {
    const raw = String(token || "").trim();
    if (!raw || raw.split(".").length !== 3) {
        throw new Error("Invalid ID token format.");
    }

    const payloadSegment = raw.split(".")[1];
    const payloadText = decodeBase64UrlValue(payloadSegment);
    return JSON.parse(payloadText);
}

function buildHubProfileFromIdTokenPayload(payload) {
    return {
        email: String(payload?.email || "").trim().toLowerCase(),
        email_verified: payload?.email_verified !== false,
        name: String(payload?.name || payload?.given_name || payload?.email || "").trim(),
        given_name: String(payload?.given_name || "").trim(),
        family_name: String(payload?.family_name || "").trim(),
        picture: String(payload?.picture || "").trim()
    };
}

async function handleHubGoogleCredential(credentialResponse) {
    const idToken = String(credentialResponse?.credential || "").trim();
    if (!idToken) {
        throw new Error("Google sign-in did not return an ID token.");
    }

    const payload = parseJwtPayload(idToken);
    const profile = buildHubProfileFromIdTokenPayload(payload);
    if (!isAllowedHubAccount(profile)) {
        throw new Error("This Google account is not allowed for this hub.");
    }

    const expSeconds = Number(payload?.exp || 0);
    hubAuthState.idToken = idToken;
    hubAuthState.accessToken = null;
    hubAuthState.grantedScopes = "";
    hubAuthState.expiresAt = expSeconds > 0 ? expSeconds * 1000 : Date.now() + 60 * 60 * 1000;
    hubAuthState.profile = profile;
    saveHubAuthState();
    await resolveHubAccessState();
    renderHubAuthUi();
    void fetchHubDriveSetup();
}

async function handleHubGoogleToken(tokenResponse) {
    if (!tokenResponse?.access_token) {
        throw new Error("Google sign-in did not return an access token.");
    }

    const profile = await fetchGoogleUserProfile(tokenResponse.access_token);
    if (!isAllowedHubAccount(profile)) {
        throw new Error("This Google account is not allowed for this hub.");
    }

    hubAuthState.accessToken = tokenResponse.access_token;
    hubAuthState.grantedScopes = String(tokenResponse.scope || hubAuthState.grantedScopes || "").trim();
    hubAuthState.expiresAt = Date.now() + (Number(tokenResponse.expires_in) || 3600) * 1000;
    hubAuthState.profile = profile;
    saveHubAuthState();
    await resolveHubAccessState();
    renderHubAuthUi();
    void fetchHubDriveSetup({ requireDriveToken: true });
}

function signOutHubGoogle() {
    if (window.google?.accounts?.oauth2 && hubAuthState.accessToken) {
        window.google.accounts.oauth2.revoke(hubAuthState.accessToken, () => {
            clearHubAuthState();
            renderHubAuthUi();
        });
        return;
    }

    clearHubAuthState();
    if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
    }
    renderHubAuthUi();
}

function bindHubAuthControls() {
    if (hubSignInButton) {
        hubSignInButton.addEventListener("click", () => {
            // For explicit user clicks always prefer the OAuth popup — One Tap is
            // suppressed by Google in app-mode/standalone windows and is not
            // suitable as a manually triggered action.
            if (hubAuthState.tokenClient) {
                hubAuthState.tokenClient.requestAccessToken({ prompt: "select_account" });
                return;
            }

            // Fallback: try One Tap prompt if no token client yet.
            if (hubAuthState.idClientReady && window.google?.accounts?.id) {
                window.google.accounts.id.prompt();
                return;
            }

            alert("Google sign-in is not ready yet. Please wait a moment and try again.");
        });
    }

    if (hubSignOutButton) {
        hubSignOutButton.addEventListener("click", signOutHubGoogle);
    }

    if (hubDriveSyncButton) {
        hubDriveSyncButton.addEventListener("click", () => {
            void handleHubDriveSyncClick();
        });
    }

    if (hubStartupSignInCta && hubSignInButton) {
        hubStartupSignInCta.addEventListener("click", () => {
            hubSignInButton.click();
        });
    }

    if (hubStaffLink) {
        hubStaffLink.addEventListener("click", (event) => {
            const signedIn = hasAllowedSignedInHubAccount();
            const canToggleView = signedIn && (hubAccessState.canTeacherView || hubAccessState.canAdmin);
            if (!canToggleView) {
                return;
            }

            const currentMode = getEffectiveHubViewMode();
            const nextMode = currentMode === "teacher" ? "student" : "teacher";
            writeStoredHubViewMode(nextMode);

            if (nextMode === "teacher") {
                event.preventDefault();
                window.location.href = "/teacher-view.html";
                return;
            }

            if (nextMode === "student") {
                event.preventDefault();
                if (isTeacherWorkspacePath()) {
                    window.location.href = "/index.html";
                } else {
                    renderHubAuthUi();
                    if (typeof renderLibrary === "function") renderLibrary();
                }
            }
        });
    }

    if (hubUserBadge) {
        hubUserBadge.addEventListener("click", () => {
            window.location.href = "/user-profile.html";
        });
    }

    if (hubTemplateLibraryLink) {
        hubTemplateLibraryLink.addEventListener("click", async (event) => {
            if (!hasAllowedSignedInHubAccount() || isHubDriveSetupReady()) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const unlocked = await handleHubDriveSyncClick({ openFolder: false });
            if (unlocked) {
                window.location.href = hubTemplateLibraryLink.href;
            }
        });
    }

    if (hubProfileClose) {
        hubProfileClose.addEventListener("click", () => setHubProfileOpen(false));
    }
}

function isHubAppModeWindow() {
    try {
        if (window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
        if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (_error) {
    }

    return Boolean(window.navigator?.standalone);
}

function isHubAutoLoginRequestedByUrl() {
    try {
        const params = new URLSearchParams(window.location.search || "");
        const value = String(params.get("autologin") || "").trim().toLowerCase();
        return value === "1" || value === "true" || value === "yes";
    } catch (_error) {
        return false;
    }
}

function hasAutoPromptedHubSignInThisSession() {
    try {
        return sessionStorage.getItem(HUB_AUTO_LOGIN_PROMPT_SESSION_KEY) === "1";
    } catch (_error) {
        return false;
    }
}

function markAutoPromptedHubSignInThisSession() {
    try {
        sessionStorage.setItem(HUB_AUTO_LOGIN_PROMPT_SESSION_KEY, "1");
    } catch (_error) {
    }
}

function maybeAutoPromptHubSignIn() {
    if (!hubAuthState.idClientReady || !window.google?.accounts?.id) {
        return;
    }

    if (hasAllowedSignedInHubAccount()) {
        return;
    }

    // Keep auto-prompt targeted to startup contexts on the homepage.
    if (!isHomepagePath()) {
        return;
    }

    // Some Edge app-mode windows do not expose display-mode reliably.
    // Allow explicit startup URL flag as a deterministic trigger.
    if (!isHubAppModeWindow() && !isHubAutoLoginRequestedByUrl()) {
        return;
    }

    if (hasAutoPromptedHubSignInThisSession()) {
        return;
    }

    // Prefer silent OAuth token refresh first. This can succeed without
    // requiring a popup/user gesture when the browser already has session state.
    if (hubAuthState.tokenClient) {
        markAutoPromptedHubSignInThisSession();
        hubAuthState.autoPromptInFlight = true;
        hubAuthState.tokenClient.requestAccessToken({ prompt: "" });
        return;
    }

    markAutoPromptedHubSignInThisSession();
    window.google.accounts.id.prompt((notification) => {
        const notDisplayed = typeof notification?.isNotDisplayed === "function" && notification.isNotDisplayed();
        const skippedMoment = typeof notification?.isSkippedMoment === "function" && notification.isSkippedMoment();

        // Fallback if One Tap cannot render.
        if ((notDisplayed || skippedMoment) && hubAuthState.tokenClient) {
            hubAuthState.autoPromptInFlight = true;
            hubAuthState.tokenClient.requestAccessToken({ prompt: "" });
        }
    });
}

function initHubGoogleAuth() {
    loadHubAuthState();
    renderHubAuthUi();
    bindHubAuthControls();

    if (hubAuthState.profile?.email) {
        resolveHubAccessState()
            .finally(() => {
                renderHubAuthUi();
                void fetchHubDriveSetup();
            });
    }

    if (!hubGoogleClientId) {
        return;
    }

    const waitForGoogleLibrary = (attemptsLeft = 30) => {
        if (window.google?.accounts?.id && !hubAuthState.idClientReady) {
            window.google.accounts.id.initialize({
                client_id: hubGoogleClientId,
                callback: async (credentialResponse) => {
                    try {
                        await handleHubGoogleCredential(credentialResponse);
                    } catch (error) {
                        clearHubAuthState();
                        renderHubAuthUi();
                        alert(error.message || "Google sign-in failed.");
                    }
                }
            });
            hubAuthState.idClientReady = true;
            const verifyButton = document.querySelector("#hub-google-verify-button");
            if (verifyButton) {
                window.google.accounts.id.renderButton(verifyButton, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    text: "signin_with",
                    width: 260
                });
                const verifyStatus = document.querySelector("#hub-google-verify-status");
                if (verifyStatus) verifyStatus.textContent = "Use Sign in with Google to verify or refresh your school account.";
            }
            maybeAutoPromptHubSignIn();
        }

        if (window.google?.accounts?.oauth2 && !hubAuthState.tokenClient) {
            hubAuthState.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: hubGoogleClientId,
                scope: HUB_UNIFIED_OAUTH_SCOPES,
                include_granted_scopes: true,
                error_callback: (error) => {
                    const messages = {
                        popup_failed_to_open: "Google sign-in popup was blocked. Allow pop-ups for this site, then try again.",
                        popup_closed: "Google sign-in was closed before Drive access was allowed. Try again and keep the Google window open."
                    };
                    hubAuthState.autoPromptInFlight = false;
                    const pendingResolvers = Array.isArray(hubAuthState.pendingTokenResolvers)
                        ? hubAuthState.pendingTokenResolvers.splice(0)
                        : [];
                    pendingResolvers.forEach((resolve) => resolve({
                        error: messages[error?.type] || "Google Drive sign-in could not start. Please try again."
                    }));
                },
                callback: async (tokenResponse) => {
                    const pendingResolvers = Array.isArray(hubAuthState.pendingTokenResolvers)
                        ? hubAuthState.pendingTokenResolvers.splice(0)
                        : [];

                    if (tokenResponse?.error) {
                        // Silent auto-login can legitimately fail with
                        // interaction_required/popup-related outcomes.
                        // Keep UI stable and rely on explicit sign-in click.
                        hubAuthState.autoPromptInFlight = false;
                        pendingResolvers.forEach((resolve) => resolve(tokenResponse));
                        return;
                    }

                    try {
                        await handleHubGoogleToken(tokenResponse);
                    } catch (error) {
                        hubAuthState.autoPromptInFlight = false;
                        clearHubAuthState();
                        renderHubAuthUi();
                        pendingResolvers.forEach((resolve) => resolve({ error: error?.message || "Google sign-in failed." }));
                        alert(error.message || "Google sign-in failed.");
                        return;
                    }

                    hubAuthState.autoPromptInFlight = false;
                    pendingResolvers.forEach((resolve) => resolve(tokenResponse));
                }
            });
        }

        if (hubAuthState.idClientReady || hubAuthState.tokenClient) {
            maybeAutoPromptHubSignIn();
            return;
        }

        if (attemptsLeft <= 0) {
            const verifyStatus = document.querySelector("#hub-google-verify-status");
            if (verifyStatus) verifyStatus.textContent = "Google sign-in could not load. Check your connection or browser blocking settings, then refresh this page.";
            return;
        }
        setTimeout(() => waitForGoogleLibrary(attemptsLeft - 1), 200);
    };

    waitForGoogleLibrary();
}

function getYearLevels() {
    return [...new Set(getUnifiedLibraryItems().map((project) => {
        const match = project.className.match(/Year\s+\d+/i);
        return match ? match[0] : "Other";
    }))].sort((left, right) => {
        const leftYear = Number.parseInt(left.replace(/\D+/g, ""), 10);
        const rightYear = Number.parseInt(right.replace(/\D+/g, ""), 10);

        if (Number.isNaN(leftYear) || Number.isNaN(rightYear)) {
            return left.localeCompare(right);
        }

        return leftYear - rightYear;
    });
}

const YEAR_LEVEL_GROUPS = {
    "Junior School": new Set(["Year 9", "Year 10"]),
    "Middle School": new Set(["Year 11"]),
    "Senior School": new Set(["Year 12", "Year 13"])
};

function getYearFilterOptions() {
    const explicitYears = getYearLevels().filter((year) => year !== "Other");
    return [
        "All",
        "Junior School",
        "Middle School",
        "Senior School",
        ...explicitYears
    ];
}

function getTypes() {
    return ["All", "active", "planning", "archive"];
}

function getContentTypes() {
    return ["All", "Activities", "Capsules", "Projects", "Assessments", "Standards", "Lessons", "Relief Lessons", "Task Topics"];
}

function hasStandardReference(project) {
    const standardNumber = String(project?.standardNumber || "").trim();
    if (standardNumber) {
        return true;
    }

    const standardRows = Array.isArray(project?.standardDetails) ? project.standardDetails : [];
    return standardRows.some((row) => String(row || "").trim().length > 0);
}

function getCategories() {
    return ["All", ...new Set(getUnifiedLibraryItems().map((project) => project.activityCategory)).values()];
}

function buildSelectOptions(selectElement, options, allLabel, formatter = (value) => value) {
    if (!selectElement) return;

    selectElement.innerHTML = "";
    options.forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue === "All" ? allLabel : formatter(optionValue);
        selectElement.appendChild(option);
    });
}

function sortProjects(items) {
    const sorted = [...items];

    switch (state.sort) {
        case "name-desc":
            sorted.sort((left, right) => right.title.localeCompare(left.title));
            break;
        case "status":
            sorted.sort((left, right) => {
                const statusDelta = statusOrder[left.status] - statusOrder[right.status];
                return statusDelta || left.title.localeCompare(right.title);
            });
            break;
        case "recent":
            sorted.sort((left, right) => new Date(right.updated) - new Date(left.updated));
            break;
        case "name-asc":
        default:
            sorted.sort((left, right) => left.title.localeCompare(right.title));
            break;
    }

    return sorted;
}

function filterProjects(items) {
    const query = state.search.trim().toLowerCase();

    return items.filter((project) => {
        const yearMatch = project.className.match(/Year\s+\d+/i);
        const projectYear = yearMatch ? yearMatch[0] : "Other";
        const selectedYearGroup = YEAR_LEVEL_GROUPS[state.year];
        const matchesYear = state.year === "All"
            || (selectedYearGroup ? selectedYearGroup.has(projectYear) : projectYear === state.year);
        const matchesType = state.type === "All" || project.status === state.type;
        const matchesCategory = state.category === "All" || project.activityCategory === state.category;
        const matchesContent =
            state.content === "All" ||
            (state.content === "Activities" && project.sourceType === "activity") ||
            (state.content === "Capsules" && project.sourceType === "capsule") ||
            (state.content === "Projects" && project.sourceType === "project") ||
            (state.content === "Assessments" && project.sourceType === "assessment") ||
            (state.content === "Standards" && (project.sourceType === "standard" || project.activityCategory === "Standard")) ||
            (state.content === "Lessons" && project.sourceType === "lesson") ||
            (state.content === "Relief Lessons" && project.sourceType === "relief-lesson") ||
            (state.content === "Task Topics" && project.sourceType === "task-topic");
        const haystack = [
            project.title,
            project.className,
            project.area,
            project.activityCategory,
            project.summary,
            String(project?.standardNumber || ""),
            ...(Array.isArray(project?.standardDetails) ? project.standardDetails : []),
            ...project.keywords
        ]
            .join(" ")
            .toLowerCase();
        const matchesSearch = !query || haystack.includes(query);

        return matchesYear && matchesType && matchesCategory && matchesContent && matchesSearch;
    });
}

function isTaskTopicMergeModeEnabled() {
    return state.content === "Task Topics";
}

function clearTaskTopicMergeSelection() {
    taskTopicMergeSelection.clear();
}

function showHubToast(message, tone = "success") {
    if (typeof document === "undefined") {
        return;
    }

    const safeMessage = String(message || "").trim();
    if (!safeMessage) {
        return;
    }

    let toast = document.querySelector("#hub-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "hub-toast";
        toast.className = "hub-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }

    toast.textContent = safeMessage;
    toast.className = `hub-toast is-visible tone-${tone === "warning" ? "warning" : "success"}`;

    if (hubToastHideTimer) {
        clearTimeout(hubToastHideTimer);
    }

    hubToastHideTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2200);
}

function getVisibleTaskTopicItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => {
        return inferSourceTypeFromRecord(item) === "task-topic"
            && String(item?.parentAssessmentId || "").trim()
            && String(item?.taskTopicText || "").trim();
    });
}

function pruneTaskTopicMergeSelection(visibleTaskTopics) {
    const visibleIds = new Set(
        getVisibleTaskTopicItems(visibleTaskTopics)
            .map((item) => String(item?.id || "").trim())
            .filter(Boolean)
    );

    Array.from(taskTopicMergeSelection.values()).forEach((selectedId) => {
        if (!visibleIds.has(selectedId)) {
            taskTopicMergeSelection.delete(selectedId);
        }
    });
}

function mergeSelectedTaskTopicCards(visibleTaskTopics) {
    const topics = getVisibleTaskTopicItems(visibleTaskTopics);
    const selectedItems = topics.filter((item) => taskTopicMergeSelection.has(String(item.id || "")));

    if (selectedItems.length < 2) {
        window.alert("Select at least two Task Topic cards to merge.");
        return;
    }

    const assessmentIds = new Set(selectedItems.map((item) => String(item.parentAssessmentId || "").trim()).filter(Boolean));
    if (assessmentIds.size !== 1) {
        window.alert("Please select Task Topic cards from the same Assessment Task.");
        return;
    }

    const parentAssessmentId = Array.from(assessmentIds.values())[0];
    const uniqueTopics = normalizeTaskTopicList(selectedItems.map((item) => item.taskTopicText));
    if (uniqueTopics.length < 2) {
        window.alert("Please select two different Task Topic cards to merge.");
        return;
    }

    const defaultName = String(selectedItems[0]?.title || "").trim() || generateTaskShortName(uniqueTopics[0]) || "Merged Task Topic";
    const promptMessage = "Merged Task Card Name:";
    const requestedName = typeof window.prompt === "function"
        ? window.prompt(promptMessage, defaultName)
        : defaultName;

    if (requestedName === null) {
        return;
    }

    const mergedName = String(requestedName || "").trim();
    if (!mergedName) {
        window.alert("Please enter a valid merged card name.");
        return;
    }

    uniqueTopics.forEach((topicText) => {
        setStoredTaskTopicShortName(parentAssessmentId, topicText, mergedName);
    });

    setTaskTopicMergePreference(parentAssessmentId, uniqueTopics, true);
    clearTaskTopicMergeSelection();
    renderLibrary();
    applyCompactCardLayout();
    showHubToast(`Merged ${uniqueTopics.length} Task Topic${uniqueTopics.length === 1 ? "" : "s"}.`);
}

function unmergeSelectedTaskTopicCards(visibleTaskTopics) {
    const topics = getVisibleTaskTopicItems(visibleTaskTopics);
    const selectedItems = topics.filter((item) => taskTopicMergeSelection.has(String(item.id || "")));

    if (!selectedItems.length) {
        window.alert("Select at least one Task Topic card to unmerge.");
        return;
    }

    const assessmentIds = new Set(selectedItems.map((item) => String(item.parentAssessmentId || "").trim()).filter(Boolean));
    if (assessmentIds.size !== 1) {
        window.alert("Please select Task Topic cards from the same Assessment Task.");
        return;
    }

    const parentAssessmentId = Array.from(assessmentIds.values())[0];
    const uniqueTopics = normalizeTaskTopicList(selectedItems.map((item) => item.taskTopicText));
    if (!uniqueTopics.length) {
        return;
    }

    const confirmed = typeof window.confirm === "function"
        ? window.confirm(`Unmerge ${uniqueTopics.length} selected Task Topic card${uniqueTopics.length === 1 ? "" : "s"}?`)
        : true;
    if (!confirmed) {
        return;
    }

    uniqueTopics.forEach((topicText) => {
        setStoredTaskTopicShortName(parentAssessmentId, topicText, "");
    });

    clearTaskTopicMergePreference(parentAssessmentId, uniqueTopics);
    clearTaskTopicMergeSelection();
    renderLibrary();
    applyCompactCardLayout();
    showHubToast(`Unmerged ${uniqueTopics.length} Task Topic${uniqueTopics.length === 1 ? "" : "s"}.`);
}

function renderTaskTopicMergeToolbar(visibleProjects) {
    if (!libraryGrid) {
        return;
    }

    const visibleTaskTopics = getVisibleTaskTopicItems(visibleProjects);
    if (!isTaskTopicMergeModeEnabled() || !visibleTaskTopics.length) {
        clearTaskTopicMergeSelection();
        return;
    }

    pruneTaskTopicMergeSelection(visibleTaskTopics);
    const selectedCount = visibleTaskTopics.filter((item) => taskTopicMergeSelection.has(String(item.id || ""))).length;

    const toolbar = document.createElement("div");
    toolbar.className = "task-topic-merge-toolbar";
    toolbar.innerHTML = `
        <div class="task-topic-merge-toolbar-copy">
            <strong>Merge Task Topics</strong>
            <span>Tick card corners, then merge into one card name.</span>
        </div>
        <div class="task-topic-merge-toolbar-actions">
            <span class="task-topic-merge-count">${selectedCount} selected</span>
            <button type="button" class="task-topic-merge-btn" ${selectedCount < 2 ? "disabled" : ""}>Merge Selected</button>
            <button type="button" class="task-topic-unmerge-btn" ${selectedCount < 1 ? "disabled" : ""}>Unmerge Selected</button>
            <button type="button" class="task-topic-merge-clear">Clear</button>
        </div>
    `;

    toolbar.querySelector(".task-topic-merge-btn")?.addEventListener("click", () => {
        mergeSelectedTaskTopicCards(visibleTaskTopics);
    });

    toolbar.querySelector(".task-topic-unmerge-btn")?.addEventListener("click", () => {
        unmergeSelectedTaskTopicCards(visibleTaskTopics);
    });

    toolbar.querySelector(".task-topic-merge-clear")?.addEventListener("click", () => {
        clearTaskTopicMergeSelection();
        renderLibrary();
        applyCompactCardLayout();
    });

    libraryGrid.appendChild(toolbar);
}

function createProjectCard(project, options = {}) {
    const card = document.createElement("a");
    card.className = "project-card";
    card.href = project.href;
    card.target = project.external ? "_blank" : "_self";
    card.rel = project.external ? "noreferrer" : "";
    card.setAttribute("aria-label", `Open ${project.title}`);

    card.addEventListener("click", (event) => {
        enforceDetailAccess(event);
    });

    const sourceType = inferSourceTypeFromRecord(project);
    const visualPalette = sourceType === "activity" ? colorToPalette("amber") : project.visual.palette;

    // Extract year level from className
    const yearMatch = project.className.match(/Year\s+\d+|Junior|Middle|Senior/i);
    const yearLevel = yearMatch ? yearMatch[0] : project.className.split(" ")[0];

    // Use image if available, otherwise use gradient background
    const hasImage = project.imageUrl && project.imageUrl.trim().length > 0;
    const visualStyle = hasImage ? "" : `style="background: ${visualPalette};"`;
    const visualContent = hasImage
        ? `<img src="${escapeHtml(project.imageUrl)}" alt="${escapeHtml(project.title)}" class="project-image" loading="lazy">`
        : `<span class="visual-mark">${project.visual.icon}</span>`;

    const statusBadge = project.status
        ? `<span class="project-tag status-tag status-${project.status}">${formatStatus(project.status)}</span>`
        : '';
    const showTaskTopicMergeToggle = options.context === "library"
        && sourceType === "task-topic"
        && isTaskTopicMergeModeEnabled()
        && String(project?.parentAssessmentId || "").trim()
        && String(project?.taskTopicText || "").trim();
    const contentTypeLabel = sourceType === "capsule"
        ? "CAPSULE"
        : sourceType === "project"
        ? "PROJECT"
        : sourceType === "standard"
            ? "STANDARD"
        : sourceType === "assessment" && String(project?.activityCategory || "").toLowerCase().includes("standard")
            ? "STANDARD"
            : sourceType === "assessment"
            ? "ASSESSMENT TASK"
                : sourceType === "relief-lesson"
                ? "Relief Lesson"
                : sourceType === "lesson"
                ? "LESSON"
                : sourceType === "task-topic"
                    ? "TASK TOPIC"
                    : "ACTIVITY";
    const assignedStudentCount = getAssignedStudentCount(project, sourceType);
    const assignmentBadge = assignedStudentCount > 0
        ? `<span class="project-meta project-meta-assigned" title="Assigned to ${assignedStudentCount} student${assignedStudentCount === 1 ? "" : "s"}">Assigned (${assignedStudentCount})</span>`
        : "";
    const activeWindowDays = getConfiguredNewEventWindowDays();
    const newEventBadge = isRecentEvent(project)
        ? `<span class="project-meta project-meta-new" title="Added in the last ${activeWindowDays} days">NEW EVENT</span>`
        : "";
    const standardPill = (sourceType === "task-topic" || String(project?.activityCategory || "").toLowerCase().includes("standard")) && String(project?.standardNumber || "").trim()
        ? `<span class="project-tag">${escapeHtml(String(project.standardNumber))}</span>`
        : "";

    card.innerHTML = `
        <div class="project-visual" ${visualStyle}>
            ${visualContent}
        </div>
        <div class="project-body">
            <div class="project-header">
                <h3>${escapeHtml(project.title)}</h3>
            </div>
            <p class="project-description">${escapeHtml(project.summary)}</p>
            <div class="project-tags">
                ${statusBadge}
                <span class="project-tag">${escapeHtml(yearLevel)}</span>
                <span class="project-tag">${escapeHtml(project.area)}</span>
                ${standardPill}
            </div>
            <div class="project-footer">
                <span class="project-meta">${escapeHtml(contentTypeLabel)}</span>
                ${newEventBadge}
                ${assignmentBadge}
            </div>
        </div>
    `;

    if (showTaskTopicMergeToggle) {
        const projectId = String(project.id || "").trim();
        const isSelected = taskTopicMergeSelection.has(projectId);
        card.classList.toggle("is-task-topic-selected", isSelected);

        const mergeToggle = document.createElement("button");
        mergeToggle.type = "button";
        mergeToggle.className = `task-topic-merge-toggle${isSelected ? " is-selected" : ""}`;
        mergeToggle.setAttribute("aria-label", isSelected ? "Unselect Task Topic" : "Select Task Topic for merge");
        mergeToggle.textContent = isSelected ? "✓" : "□";
        mergeToggle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (taskTopicMergeSelection.has(projectId)) {
                taskTopicMergeSelection.delete(projectId);
            } else {
                taskTopicMergeSelection.add(projectId);
            }

            renderLibrary();
            applyCompactCardLayout();
        });

        card.appendChild(mergeToggle);
    }

    if (hasImage) {
        const imageElement = card.querySelector(".project-image");
        const visualElement = card.querySelector(".project-visual");

        if (imageElement && visualElement) {
            imageElement.addEventListener("error", () => {
                visualElement.style.background = visualPalette;
                visualElement.innerHTML = `<span class="visual-mark">${escapeHtml(project.visual.icon)}</span>`;
            }, { once: true });
        }
    }

    return card;
}

function createLabProjectCard(project) {
    const card = document.createElement("a");
    card.className = "project-card";
    card.href = project.href;
    card.target = project.external ? "_blank" : "_self";
    card.rel = project.external ? "noreferrer" : "";
    card.setAttribute("aria-label", `Open ${project.title}`);

    card.addEventListener("click", (event) => {
        enforceDetailAccess(event);
    });

    card.innerHTML = `
        <div class="project-visual" style="background: ${project.visual.palette};">
            <span class="visual-mark">${project.visual.icon}</span>
        </div>
        <div class="project-body">
            <div class="project-header">
                <h3>${escapeHtml(project.title)}</h3>
            </div>
            <p class="project-description">${escapeHtml(project.summary)}</p>
            <div class="project-tags">
                <span class="status-tag status-${project.status}">${formatStatus(project.status)}</span>
                <span class="project-tag">${escapeHtml(project.projectPhase)}</span>
                <span class="project-tag">${escapeHtml(project.term)}</span>
            </div>
            <div class="project-footer">
                <span class="project-meta">Activity</span>
            </div>
        </div>
    `;

    return card;
}

function formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function populateFilters() {
    const contentPills = document.getElementById("content-filter-pills");
    if (contentPills) {
        contentPills.innerHTML = "";
        getContentTypes().forEach((contentType) => {
            const pill = document.createElement("button");
            pill.className = `filter-chip ${state.content === contentType ? 'active' : ''}`;
            pill.type = "button";
            pill.textContent = contentType === "All" ? "All items" : contentType;
            pill.addEventListener("click", () => {
                state.content = contentType;
                updateFilterPills("content-filter-pills", contentType);
                renderLibrary();
                applyCompactCardLayout();
            });
            contentPills.appendChild(pill);
        });
    }

    // Create filter pills for year levels
    const yearLevelPills = document.getElementById("year-filter-pills");
    if (yearLevelPills) {
        yearLevelPills.innerHTML = "";
        const years = getYearFilterOptions();
        years.forEach(year => {
            const pill = document.createElement("button");
            pill.className = `filter-chip ${state.year === year ? 'active' : ''}`;
            pill.type = "button";
            pill.textContent = year === "All" ? "All levels" : year;
            pill.addEventListener("click", () => {
                state.year = year;
                updateFilterPills("year-filter-pills", year);
                renderLibrary();
                applyCompactCardLayout();
            });
            yearLevelPills.appendChild(pill);
        });
    }

    // Create filter pills for type
    const typePills = document.getElementById("type-filter-pills");
    if (typePills) {
        typePills.innerHTML = "";
        const types = getTypes();
        types.forEach(type => {
            const pill = document.createElement("button");
            pill.className = `filter-chip ${state.type === type ? 'active' : ''}`;
            pill.type = "button";
            pill.textContent = type === "All" ? "All types" : formatStatus(type);
            pill.addEventListener("click", () => {
                state.type = type;
                updateFilterPills("type-filter-pills", type);
                renderLibrary();
                applyCompactCardLayout();
            });
            typePills.appendChild(pill);
        });
    }

    // Create filter pills for category
    const categoryPills = document.getElementById("category-filter-pills");
    if (categoryPills) {
        categoryPills.innerHTML = "";
        const categories = getCategories();
        categories.forEach(cat => {
            const pill = document.createElement("button");
            pill.className = `filter-chip ${state.category === cat ? 'active' : ''}`;
            pill.type = "button";
            pill.textContent = cat === "All" ? "All categories" : cat;
            pill.addEventListener("click", () => {
                state.category = cat;
                updateFilterPills("category-filter-pills", cat);
                renderLibrary();
                applyCompactCardLayout();
            });
            categoryPills.appendChild(pill);
        });
    }
}

function updateFilterPills(containerId, activeValue) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const pills = container.querySelectorAll(".filter-chip");
    pills.forEach(pill => {
        if (pill.textContent.toLowerCase() === activeValue.toLowerCase() ||
            (activeValue === "All" && pill.textContent.toLowerCase().includes("all"))) {
            pill.classList.add("active");
        } else {
            pill.classList.remove("active");
        }
    });
}

function renderCurrentProjects() {
    if (!currentProjectGrid) {
        return;
    }

    currentProjectGrid.innerHTML = "";
    const activeProjects = sortProjects(projects.filter((project) => project.showThisWeek));

    if (!activeProjects.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "about-card";
        emptyState.innerHTML = `
            <p class="section-kicker">No Activities Scheduled</p>
            <h2>This week has no pinned activities yet.</h2>
            <p>Use Teacher View to add or update activities and tick Show in This Week when ready.</p>
        `;
        currentProjectGrid.appendChild(emptyState);
        return;
    }

    activeProjects.forEach((project) => {
        currentProjectGrid.appendChild(createProjectCard(project));
    });
}

function renderCurrentWeek() {
    if (!currentWeekGrid) {
        return;
    }

    currentWeekGrid.innerHTML = "";

    const activeActivities = sortProjects(projects.filter((project) => project.showThisWeek
        && String(project?.id || "").trim() !== "49"));
    const activeReliefLessons = sortProjects(lessons.filter((lesson) => lesson.showThisWeek));
    const activeLabProjects = sortLabProjects(labProjects.filter((project) => project.showThisWeek));
    const summaryStandardNumbers = getHubSummaryStandardNumbers();
    const activeStandards = sortProjects(standardCards.filter((standard) =>
        summaryStandardNumbers.has(String(standard?.standardNumber || "").trim())
    ));

    const allCards = [
        ...activeActivities.map((project) => ({
            title: String(project.title || "").toLowerCase(),
            element: createProjectCard(project),
            record: project
        })),
        ...activeReliefLessons.map((lesson) => ({
            title: String(lesson.title || "").toLowerCase(),
            element: createProjectCard(lesson),
            record: lesson
        })),
        ...activeLabProjects.map((project) => ({
            title: String(project.title || "").toLowerCase(),
            element: createLabProjectCard(project),
            record: project
        })),
        ...activeStandards.map((standard) => ({
            title: String(standard.title || "").toLowerCase(),
            element: createProjectCard(standard),
            record: standard
        }))
    ].sort((left, right) => left.title.localeCompare(right.title));

    if (!allCards.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "about-card";
        emptyState.innerHTML = `
            <p class="section-kicker">No Items Scheduled</p>
            <h2>Nothing is pinned for this week yet.</h2>
            <p>Use Teacher View to pin activities or projects that students should work on this week.</p>
        `;
        currentWeekGrid.appendChild(emptyState);
        return;
    }

    // Group cards by sourceType
    const grouped = {
        activity: [],
        capsule: [],
        "relief-lesson": [],
        assessment: [],
        standard: [],
        project: []
    };

    allCards.forEach((card) => {
        const sourceType = inferSourceTypeFromRecord(card.record);
        if (sourceType === "capsule") {
            grouped.capsule.push(card);
        } else if (sourceType === "assessment") {
            grouped.assessment.push(card);
        } else if (sourceType === "standard") {
            grouped.standard.push(card);
        } else if (sourceType === "project") {
            grouped.project.push(card);
        } else if (sourceType === "relief-lesson") {
            grouped["relief-lesson"].push(card);
        } else {
            grouped.activity.push(card);
        }
    });

    // Render each group with heading and count
    const sectionOrder = [
        { key: "activity", label: "Activities" },
        { key: "capsule", label: "Capsules" },
        { key: "relief-lesson", label: "Relief Lessons" },
        { key: "assessment", label: "Assessment Tasks" },
        { key: "standard", label: "Standards" },
        { key: "project", label: "Projects" }
    ];

    sectionOrder.forEach(({ key, label }) => {
        const cards = grouped[key];
        if (cards.length === 0) {
            return; // Skip empty sections
        }

        // Create section heading with count
        const sectionHeading = document.createElement("div");
        sectionHeading.className = "week-section-heading";
        sectionHeading.innerHTML = `
            <h3>${label} <span class="item-count">(${cards.length})</span></h3>
        `;
        currentWeekGrid.appendChild(sectionHeading);

        // Create sub-grid for this section
        const sectionGrid = document.createElement("div");
        sectionGrid.className = "week-section-grid project-grid";
        sectionGrid.style.display = "flex";
        sectionGrid.style.flexWrap = "wrap";
        sectionGrid.style.gap = "12px";
        sectionGrid.style.marginBottom = "30px";
        sectionGrid.style.minWidth = "0";

        cards.forEach((card) => {
            const cardElement = card.element;
            cardElement.style.width = "calc(25% - 9px)";
            cardElement.style.minWidth = "180px";
            cardElement.style.flexShrink = "0";
            sectionGrid.appendChild(cardElement);
        });

        currentWeekGrid.appendChild(sectionGrid);
    });
}

function renderLibrary() {
    libraryGrid.innerHTML = "";
    const visibleProjects = sortProjects(filterProjects(getUnifiedLibraryItems())
        .filter((item) => String(item?.id || "").trim() !== "49"));
    const activeWindowDays = getConfiguredNewEventWindowDays();

    const newEventCount = visibleProjects.reduce((count, item) => {
        return count + (isRecentEvent(item) ? 1 : 0);
    }, 0);

    libraryResultsMeta.textContent = `${visibleProjects.length} item${visibleProjects.length === 1 ? "" : "s"} shown${newEventCount > 0 ? ` • ${newEventCount} new event${newEventCount === 1 ? "" : "s"} (${activeWindowDays}d)` : ""}`;

    if (!visibleProjects.length) {
        clearTaskTopicMergeSelection();
        const emptyState = document.createElement("div");
        emptyState.className = "about-card";
        emptyState.innerHTML = `
            <p class="section-kicker">No Results</p>
            <h2>No items matched that search.</h2>
            <p>Try a different keyword or switch back to the All filter to widen the library.</p>
        `;
        libraryGrid.appendChild(emptyState);
        return;
    }

    renderTaskTopicMergeToolbar(visibleProjects);

    const standardProjects = visibleProjects.filter((project) => inferSourceTypeFromRecord(project) === "standard");
    const otherProjects = visibleProjects.filter((project) => inferSourceTypeFromRecord(project) !== "standard");
    const cardSets = standardProjects.length
        ? [
            { label: "Activities and Projects", projects: otherProjects },
            { label: "Assessment Standards", projects: standardProjects }
        ]
        : [{ label: "", projects: otherProjects }];

    cardSets.forEach((cardSet) => {
        if (!cardSet.projects.length) return;

        if (cardSet.label) {
            const heading = document.createElement("div");
            heading.className = "library-card-set-heading";
            heading.innerHTML = `<h3>${escapeHtml(cardSet.label)} <span>(${cardSet.projects.length})</span></h3>`;
            libraryGrid.appendChild(heading);
        }

        cardSet.projects.forEach((project) => {
            libraryGrid.appendChild(createProjectCard(project, { context: "library" }));
        });
    });
}

function sortLabProjects(items) {
    const phaseOrder = {
        planning: 0,
        prototype: 1,
        build: 2,
        testing: 3,
        showcase: 4
    };

    const sorted = [...items];
    switch (labProjectState.sort) {
        case "name-desc":
            sorted.sort((left, right) => right.title.localeCompare(left.title));
            break;
        case "recent":
            sorted.sort((left, right) => new Date(right.updated) - new Date(left.updated));
            break;
        case "phase":
            sorted.sort((left, right) => {
                const leftOrder = phaseOrder[String(left.projectPhase || "").toLowerCase()] ?? 99;
                const rightOrder = phaseOrder[String(right.projectPhase || "").toLowerCase()] ?? 99;
                return leftOrder - rightOrder || left.title.localeCompare(right.title);
            });
            break;
        case "name-asc":
        default:
            sorted.sort((left, right) => left.title.localeCompare(right.title));
            break;
    }

    return sorted;
}

function filterLabProjects(items) {
    const query = labProjectState.search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((project) => {
        const haystack = [project.title, project.className, project.projectPhase, project.summary, ...project.keywords]
            .join(" ")
            .toLowerCase();
        return haystack.includes(query);
    });
}

function renderCurrentLabProjects() {
    if (!currentLabProjectGrid) return;

    currentLabProjectGrid.innerHTML = "";
    const visible = sortLabProjects(labProjects.filter((project) => project.showThisWeek));

    if (!visible.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "about-card";
        emptyState.innerHTML = `
            <p class="section-kicker">No Live Projects</p>
            <h2>No lab projects are pinned for this week.</h2>
            <p>Use Teacher View to feature projects in the right column.</p>
        `;
        currentLabProjectGrid.appendChild(emptyState);
        return;
    }

    visible.forEach((project) => {
        currentLabProjectGrid.appendChild(createLabProjectCard(project));
    });
}

function renderLabProjectLibrary() {
    if (!labProjectLibraryGrid) return;

    labProjectLibraryGrid.innerHTML = "";
    const visible = sortLabProjects(filterLabProjects(labProjects));

    if (labProjectResultsMeta) {
        labProjectResultsMeta.textContent = `${visible.length} project${visible.length === 1 ? "" : "s"} shown`;
    }

    if (!visible.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "about-card";
        emptyState.innerHTML = `
            <p class="section-kicker">No Results</p>
            <h2>No projects matched that search.</h2>
            <p>Try another keyword or sort option.</p>
        `;
        labProjectLibraryGrid.appendChild(emptyState);
        return;
    }

    visible.forEach((project) => {
        labProjectLibraryGrid.appendChild(createLabProjectCard(project));
    });
}

function renderStats() {
    const recentItems = getUnifiedLibraryItems()
        .filter((item) => isRecentEvent(item))
        .sort((left, right) => {
            const leftDate = parseDateSafe(left?.created_at || left?.createdAt || left?.updated)?.getTime() || 0;
            const rightDate = parseDateSafe(right?.created_at || right?.createdAt || right?.updated)?.getTime() || 0;
            return rightDate - leftDate;
        })
        .slice(0, 6);
    const processAssessment = getUnifiedLibraryItems()
        .find((item) => String(item?.id || "").trim() === "49");
    const items = processAssessment && !recentItems.some((item) => String(item?.id || "").trim() === "49")
        ? [processAssessment, ...recentItems].slice(0, 6)
        : recentItems;

    const activeWindowDays = getConfiguredNewEventWindowDays();

    if (newWeekWindow) {
        newWeekWindow.textContent = `${activeWindowDays}-day window`;
    }

    if (newWeekCount) {
        newWeekCount.textContent = String(items.length);
    }

    if (!newWeekList) {
        return;
    }

    newWeekList.innerHTML = "";
    if (!items.length) {
        if (newWeekEmpty) {
            newWeekEmpty.hidden = false;
        }
        return;
    }

    if (newWeekEmpty) {
        newWeekEmpty.hidden = true;
    }

    items.forEach((item) => {
        const row = document.createElement("li");
        const isProcessAssessment = String(item?.id || "").trim() === "49";
        row.className = `new-week-item${isProcessAssessment ? " new-week-item-process-assessment" : ""}`;
        const typeLabel = inferSourceTypeFromRecord(item) === "project" ? "Project" : "Assessment";
        const href = String(item?.href || "").trim() || "#project-library";
        if (isProcessAssessment) {
            const standardLabels = {
                "91897": "Process & Outcome",
                "91907": "Process & Outcome",
                "91893": "Digital Media",
                "91903": "Digital Media"
            };
            const relevantStandards = hubStudentAllocatedStandards.filter((standard) =>
                Object.hasOwn(standardLabels, String(standard?.standard_number || "").trim())
            );
            const standardsHtml = relevantStandards.map((standard) => {
                const standardNumber = String(standard.standard_number || "").trim();
                const mediaTypeSuffix = ["91893", "91903"].includes(standardNumber) && hubStudentDigitalMediaType
                    ? ` (${hubStudentDigitalMediaType})`
                    : "";
                const credits = Number.parseInt(standard.credits, 10);
                const creditsText = Number.isInteger(credits) ? `${credits} credits` : "Credits not set";
                const standardCard = standardCards.find((card) => String(card?.standardNumber || "").trim() === standardNumber);
                const standardHref = String(standardCard?.href || `/assessment-standard-card.html?standard=${encodeURIComponent(standardNumber)}`);
                return `
                    <a class="new-week-process-standard" href="${escapeHtml(standardHref)}" aria-label="Open standard ${escapeHtml(standardNumber)}">
                        <span><strong>${escapeHtml(standardNumber)}</strong> ${escapeHtml(`${standardLabels[standardNumber]}${mediaTypeSuffix}`)}</span>
                        <small>${escapeHtml(creditsText)}</small>
                    </a>
                `;
            }).join("");
            const externalLabels = {
                "92006": "Computer Science",
                "92007": "Digital Outcome",
                "91898": "Computer Science",
                "91899": "Digital Outcome",
                "91908": "Computer Science",
                "91909": "Digital Outcome"
            };
            const externalStandardsHtml = hubStudentExternalStandards.map((standard) => {
                const standardNumber = String(standard?.standard_number || "").trim();
                const credits = Number.parseInt(standard?.credits, 10);
                const creditsText = Number.isInteger(credits) ? `${credits} credits` : "Credits not set";
                const standardCard = standardCards.find((card) => String(card?.standardNumber || "").trim() === standardNumber);
                const standardHref = String(standardCard?.href || `/assessment-standard-card.html?standard=${encodeURIComponent(standardNumber)}`);
                return `
                    <a class="new-week-process-standard new-week-external-standard" href="${escapeHtml(standardHref)}" aria-label="Open standard ${escapeHtml(standardNumber)}">
                        <span><strong>${escapeHtml(standardNumber)}</strong> ${escapeHtml(externalLabels[standardNumber] || standard.standard_name || "External")}</span>
                        <small>${escapeHtml(creditsText)}</small>
                    </a>
                `;
            }).join("");
            row.innerHTML = `
                <div class="new-week-process-card">
                    <a class="new-week-process-title" href="${escapeHtml(href)}">Internal Assessment Summary</a>
                    ${standardsHtml || `<span class="new-week-process-open">Open assessment</span>`}
                </div>
                <div class="new-week-process-card new-week-external-card">
                    <span class="new-week-process-title">External Assessment Summary</span>
                    ${externalStandardsHtml || `<span class="new-week-external-empty">${hubStudentExternalExamIntention === "no" ? "You have CHOSEN not to continue with the Exam." : "You are not currently enrolled in an External DTECH exam."}</span>`}
                </div>
            `;
        } else {
            row.innerHTML = `
                <span class="new-week-dot" aria-hidden="true"></span>
                <a class="new-week-link" href="${escapeHtml(href)}">${escapeHtml(String(item?.title || "Untitled").trim())}</a>
                <span class="new-week-pill">${escapeHtml(typeLabel)}</span>
            `;
        }
        newWeekList.appendChild(row);
    });
}

function createFeaturedCard(project) {
    const card = document.createElement("a");
    card.className = "featured-card";
    card.href = project.href;
    card.target = project.external ? "_blank" : "_self";
    card.rel = project.external ? "noreferrer" : "";
    card.setAttribute("aria-label", `Featured: ${project.title}`);

    card.addEventListener("click", (event) => {
        enforceDetailAccess(event);
    });

    const yearMatch = project.className.match(/Year\s+\d+|Junior|Middle|Senior/i);
    const yearLevel = yearMatch ? yearMatch[0] : project.className.split(" ")[0];

    card.innerHTML = `
        <div class="featured-visual" style="background: ${project.visual.palette};">
            <div class="featured-visual-text">${project.visual.icon}</div>
        </div>
        <div class="featured-content">
            <span class="featured-category">${escapeHtml(project.area)}</span>
            <h3 class="featured-title">${escapeHtml(project.title)}</h3>
            <p class="featured-description">${escapeHtml(project.summary)}</p>
            <div class="featured-meta">
                <span class="featured-meta-item">${escapeHtml(yearLevel)}</span>
                <span class="featured-meta-item">${escapeHtml(project.activityCategory)}</span>
            </div>
        </div>
    `;

    return card;
}

function renderFeaturedCarousel() {
    const carousel = document.getElementById("featured-carousel");
    const indicators = document.getElementById("carousel-indicators");
    
    if (!carousel) return;
    
    carousel.innerHTML = "";
    if (indicators) indicators.innerHTML = "";
    
    // Get diverse featured items - mix of activities
    const featured = getUnifiedLibraryItems()
        .filter(p => p.status === 'active')
        .sort(() => 0.5 - Math.random())
        .slice(0, 6);
    
    if (!featured.length) {
        const allProjects = getUnifiedLibraryItems().slice(0, 6);
        featured.push(...allProjects);
    }
    
    featured.slice(0, 6).forEach((project, index) => {
        carousel.appendChild(createFeaturedCard(project));
        
        if (indicators) {
            const indicator = document.createElement("button");
            indicator.className = `carousel-indicator ${index === 0 ? 'active' : ''}`;
            indicator.type = "button";
            indicator.setAttribute("role", "tab");
            indicator.setAttribute("aria-label", `Show slide ${index + 1}`);
            indicator.setAttribute("aria-selected", index === 0);
            indicator.addEventListener("click", () => {
                scrollCarouselToIndex(index);
                updateCarouselIndicators(index);
            });
            indicators.appendChild(indicator);
        }
    });
    
    setupCarouselNavigation();
}

function setupCarouselNavigation() {
    const carousel = document.getElementById("featured-carousel");
    const prevBtn = document.getElementById("carousel-prev");
    const nextBtn = document.getElementById("carousel-next");
    
    if (!carousel || !prevBtn || !nextBtn) return;
    
    let currentIndex = 0;
    const cards = carousel.querySelectorAll(".featured-card");
    const itemsPerView = getItemsPerView();
    const maxIndex = Math.max(0, cards.length - itemsPerView);
    
    prevBtn.addEventListener("click", () => {
        currentIndex = Math.max(0, currentIndex - 1);
        scrollCarouselToIndex(currentIndex);
        updateCarouselIndicators(currentIndex);
    });
    
    nextBtn.addEventListener("click", () => {
        currentIndex = Math.min(maxIndex, currentIndex + 1);
        scrollCarouselToIndex(currentIndex);
        updateCarouselIndicators(currentIndex);
    });
}

function getItemsPerView() {
    const width = window.innerWidth;
    if (width <= 768) return 1;
    if (width <= 1024) return 2;
    return 3;
}

function scrollCarouselToIndex(index) {
    const carousel = document.getElementById("featured-carousel");
    if (!carousel) return;
    
    const cards = carousel.querySelectorAll(".featured-card");
    if (cards[index]) {
        cards[index].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

function updateCarouselIndicators(activeIndex) {
    const indicators = document.getElementById("carousel-indicators");
    if (!indicators) return;
    
    const tabs = indicators.querySelectorAll(".carousel-indicator");
    tabs.forEach((tab, index) => {
        const isActive = index === activeIndex;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", isActive);
    });
}

function bindControls() {
    if (!searchInput || !sortSelect) return;

    searchInput.addEventListener("input", (event) => {
        state.search = event.target.value;
        renderLibrary();
        applyCompactCardLayout();
    });

    sortSelect.addEventListener("change", (event) => {
        state.sort = event.target.value;
        renderLibrary();
        renderCurrentProjects();
        applyCompactCardLayout();
    });
}

window.addEventListener("storage", (event) => {
    if (event.key !== NEW_EVENT_WINDOW_STORAGE_KEY) {
        return;
    }

    if (!isHomepagePath()) {
        return;
    }

    renderStats();
    renderLibrary();
});

function bindLabProjectControls() {
    if (!labProjectSearchInput || !labProjectSortSelect) return;

    labProjectSearchInput.addEventListener("input", (event) => {
        labProjectState.search = event.target.value;
        renderLabProjectLibrary();
    });

    labProjectSortSelect.addEventListener("change", (event) => {
        labProjectState.sort = event.target.value;
        renderCurrentLabProjects();
        renderLabProjectLibrary();
    });
}

function applyCompactCardLayout() {
    // Apply flex layout to all project grids for compact 4-column layout
    const grids = [
        document.getElementById('project-library-grid'),
        document.getElementById('current-week-grid'),
        document.getElementById('current-project-grid')
    ].filter(Boolean);
    
    grids.forEach(grid => {
        grid.style.display = 'flex';
        grid.style.flexWrap = 'wrap';
        grid.style.gap = '12px';
        grid.style.marginTop = '10px';
        grid.style.minWidth = '0';
        
        // Set card widths for 4-column layout
        const cards = grid.querySelectorAll('.project-card');
        cards.forEach(card => {
            card.style.width = 'calc(25% - 9px)';
            card.style.minWidth = '180px';
            card.style.flexShrink = '0';
        });
    });
}

async function init() {
    const hasDashboardLayout = Boolean(
        (currentWeekGrid || currentProjectGrid) &&
        libraryGrid &&
        searchInput &&
        sortSelect
    );

    if (!hasDashboardLayout) {
        initHubGoogleAuth();
        return;
    }

    loadHubAuthState();
    await refreshActivitiesLibrary();
    labProjects = [...baseLabProjects];
    renderStats();
    populateFilters();
    renderCurrentWeek();
    renderCurrentProjects();
    renderLibrary();
    bindControls();
    setTimeout(() => applyCompactCardLayout(), 100);
    initHubGoogleAuth();
}

init();