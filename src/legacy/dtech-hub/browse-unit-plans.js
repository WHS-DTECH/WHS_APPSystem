const accessElement = document.querySelector("#unit-plan-access");
const statusElement = document.querySelector("#unit-plan-status");
const resultsElement = document.querySelector("#unit-plan-results");
const searchElement = document.querySelector("#unit-plan-search");
const topicPillsElement = document.querySelector("#topic-type-pills");
const resyncLessonsButton = document.querySelector("#resync-unit-lessons-button");

const BROWSE_UNIT_AUTH_KEY = "hub_google_auth_v1";

let rows = [];
let hasAccess = false;
let selectedTopicType = "All topics";
let selectedUnitPlanId = "";
let pendingDeleteId = "";
let authRefreshInFlight = false;

const SCHOOL_VALUE_KEYS = ["whanaungatanga", "rangatiratanga", "manaakitanga", "kaitiakitanga"];
const SCHOOL_VALUE_LABELS = {
    whanaungatanga: "Whanaungatanga",
    rangatiratanga: "Rangatiratanga",
    manaakitanga: "Manaakitanga",
    kaitiakitanga: "Kaitiakitanga"
};
const CONTEXT_KEYS = ["environment", "mentalEmotional", "culture", "social", "technology"];
const CONTEXT_LABELS = {
    environment: "Environment",
    mentalEmotional: "Mental-Emotional",
    culture: "Culture",
    social: "Social",
    technology: "Technology"
};
const SKILL_KEYS = ["generalSkills", "careerFutureSkills", "considerationsWithinElectronics", "literacy", "numeracy", "digitalTech", "practical"];
const SKILL_LABELS = {
    generalSkills: "Skills",
    careerFutureSkills: "Career & Future-Focused Skills",
    considerationsWithinElectronics: "Considerations within Electronics",
    literacy: "Literacy",
    numeracy: "Numeracy",
    digitalTech: "Digital Tech",
    practical: "Practical"
};

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function setStatus(message, isError = false) {
    if (!statusElement) return;
    const text = String(message || "");
    statusElement.textContent = text;
    statusElement.classList.remove("is-error", "is-success");
    statusElement.classList.add(isError ? "is-error" : "is-success");
    statusElement.hidden = !text;
}

function setAccess(message, isError = false) {
    if (!accessElement) return;
    accessElement.textContent = String(message || "");
    accessElement.classList.remove("is-missing", "is-error", "is-success");
    if (isError) {
        accessElement.classList.add("is-error");
    } else {
        accessElement.classList.add("is-success");
    }
}

function setResyncButtonState(isBusy, isAllowed = hasAccess) {
    if (!resyncLessonsButton) {
        return;
    }

    resyncLessonsButton.disabled = Boolean(isBusy) || !isAllowed;
    resyncLessonsButton.textContent = isBusy ? "Resyncing..." : "Resync Unit Lessons";
}

function readSignedInEmail() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(BROWSE_UNIT_AUTH_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(BROWSE_UNIT_AUTH_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    if (!localValue && sessionValue) {
        try {
            localStorage.setItem(BROWSE_UNIT_AUTH_KEY, sessionValue);
        } catch (_error) {
        }
    }

    const raw = localValue || sessionValue || "";
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        return normalizeEmail(parsed?.profile?.email || parsed?.email || "");
    } catch (_error) {
        return "";
    }
}

function readSignedInAccessToken() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(BROWSE_UNIT_AUTH_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(BROWSE_UNIT_AUTH_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    const raw = localValue || sessionValue || "";
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

function withBrowseUnitAuthHeaders(headers = {}, email = readSignedInEmail()) {
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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getUnitPlanTopicType(row) {
    return String(row?.topic || "").trim() || "Unspecified";
}

function getUnitPlanDomId(row) {
    return `unit-plan-${slugify(row?.id || row?.title || "plan")}`;
}

function getTopicTypes() {
    const topicTypes = Array.from(new Set(rows.map((row) => getUnitPlanTopicType(row)))).filter(Boolean);
    topicTypes.sort((left, right) => left.localeCompare(right));
    return ["All topics", ...topicTypes];
}

function renderTopicTabs() {
    if (!topicPillsElement) return;

    const topicTypes = getTopicTypes();
    topicPillsElement.innerHTML = "";

    topicTypes.forEach((topicType) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = `filter-chip ${selectedTopicType === topicType ? "active" : ""}`;
        pill.textContent = topicType;
        pill.setAttribute("aria-pressed", String(selectedTopicType === topicType));
        pill.addEventListener("click", () => {
            selectedTopicType = topicType;
            selectedUnitPlanId = "";
            renderTopicTabs();
            renderRows();
        });
        topicPillsElement.appendChild(pill);
    });
}

function renderLineBlock(value, placeholder = "-") {
    if (Array.isArray(value)) {
        const lines = value.map((item) => String(item || "").trim()).filter(Boolean);
        return escapeHtml(lines.length ? lines.join("\n") : placeholder);
    }

    const text = String(value || "").trim();
    return escapeHtml(text || placeholder);
}

function toNormalizedLines(value) {
    if (Array.isArray(value)) {
        return value.map((line) => String(line || "").trim()).filter(Boolean);
    }

    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function parseUnitValuesToResponses(unitValues) {
    const responseMap = {
        whanaungatanga: "",
        rangatiratanga: "",
        manaakitanga: "",
        kaitiakitanga: ""
    };

    const lines = toNormalizedLines(unitValues);
    let currentKey = "";

    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const matchedKey = SCHOOL_VALUE_KEYS.find((key) => lower.startsWith(SCHOOL_VALUE_LABELS[key].toLowerCase()));

        if (matchedKey) {
            currentKey = matchedKey;
            const remainder = line.replace(new RegExp(`^${SCHOOL_VALUE_LABELS[matchedKey]}\\s*:?\\s*`, "i"), "").trim();
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

function parseContextsToResponses(contexts) {
    const responseMap = {
        environment: "",
        mentalEmotional: "",
        culture: "",
        social: "",
        technology: ""
    };

    const lines = toNormalizedLines(contexts);
    let currentKey = "";

    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const matchedKey = CONTEXT_KEYS.find((key) => lower.startsWith(CONTEXT_LABELS[key].toLowerCase()));

        if (matchedKey) {
            currentKey = matchedKey;
            const remainder = line.replace(new RegExp(`^${CONTEXT_LABELS[matchedKey]}\\s*:?\\s*`, "i"), "").trim();
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

    const lines = toNormalizedLines(curriculumLinks);
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

    return responseMap;
}

function renderLessons(lessons) {
    if (!Array.isArray(lessons) || !lessons.length) {
        return "<p class='help-text'>No lessons saved for this unit plan yet.</p>";
    }

    return lessons
        .map((lesson, index) => {
            const publishText = lesson.publish_activity || lesson.publishActivity ? "Yes" : "No";
            const calendarText = lesson.add_to_calendar || lesson.addToCalendar ? "Yes" : "No";
            return `
                <article class="lesson-row" style="margin-top: 8px;">
                    <div class="lesson-row-header">
                        <div>
                            <p class="help-text" style="margin:0; text-transform:uppercase; font-weight:700;">Lesson ${index + 1}</p>
                            <h3 style="margin:2px 0 0;">${escapeHtml(lesson.lessonTitle || lesson.title || "Lesson")}</h3>
                        </div>
                    </div>
                    <div class="lesson-row-grid">
                        <div class="field"><label>Lesson Year Level</label><input type="text" value="${escapeHtml(lesson.lessonYearLevel || lesson.year_level || "-")}" disabled></div>
                        <div class="field"><label>Lesson Link</label><input type="text" value="${escapeHtml(lesson.lessonLinkUrl || lesson.link_url || "-")}" disabled></div>
                        <div class="field"><label>Week / Session</label><input type="text" value="${escapeHtml(lesson.lessonWeek || lesson.week_label || lesson.week || "-")}" disabled></div>
                        <div class="field"><label>Duration Minutes</label><input type="text" value="${escapeHtml(lesson.lessonDurationMinutes || lesson.duration_minutes || "-")}" disabled></div>
                        <div class="field"><label>Calendar Date</label><input type="text" value="${escapeHtml(lesson.lessonDate || lesson.calendar_date || "-")}" disabled></div>
                        <div class="field"><label>Card Colour</label><input type="text" value="${escapeHtml(lesson.lessonCardColor || lesson.card_color || "Rose")}" disabled></div>
                        <div class="field field-wide"><label>Activity Name</label><input type="text" value="${escapeHtml(lesson.activityName || lesson.activity_name || "-")}" disabled></div>
                        <div class="field field-wide"><label>Lesson Focus</label><textarea rows="3" disabled>${escapeHtml(lesson.lessonFocus || lesson.focus || "-")}</textarea></div>
                        <div class="field field-wide"><label>Lesson Notes</label><textarea rows="3" disabled>${escapeHtml(lesson.lessonNotes || lesson.notes || "-")}</textarea></div>
                        <div class="field"><label>Publish to Activity Library</label><input type="text" value="${publishText}" disabled></div>
                        <div class="field"><label>Add to Calendar</label><input type="text" value="${calendarText}" disabled></div>
                    </div>
                </article>
            `;
        })
        .join("");
}

function filterRows(sourceRows) {
    const term = getSearchTerm();
    if (!term) return sourceRows;

    return sourceRows.filter((row) => {
        const lessonBlob = Array.isArray(row.lessons)
            ? row.lessons
                .map((lesson) => [
                    lesson.lessonTitle,
                    lesson.lessonYearLevel,
                    lesson.year_level,
                    lesson.lessonLinkUrl,
                    lesson.link_url,
                    lesson.lessonWeek,
                    lesson.lessonDate,
                    lesson.lessonType,
                    lesson.activityName,
                    lesson.lessonFocus,
                    lesson.lessonNotes
                ].map((item) => String(item || "").toLowerCase()).join(" | "))
                .join(" || ")
            : "";
        const blob = [
            row.title,
            row.topic,
            getUnitPlanTopicType(row),
            row.strand,
            row.year_level,
            row.subject_stream,
            row.overview,
            row.unit_aims,
            row.unit_values,
            row.contexts,
            row.curriculum_links,
            row.assessment_link,
            row.notes,
            lessonBlob
        ]
            .map((item) => String(item || "").toLowerCase())
            .join(" | ");
        return blob.includes(term);
    });
}

function filterBySelectedTopicType(sourceRows) {
    if (selectedTopicType === "All topics") {
        return sourceRows;
    }

    return sourceRows.filter((row) => getUnitPlanTopicType(row) === selectedTopicType);
}

function looksLikeYearLevelLabel(value) {
    const text = String(value || "").trim().toLowerCase();
    return /^(juniors?|middle(?:\/seniors?)?|seniors?|year\s*\d+)/i.test(text);
}

function parseUnitTopicLabel(value) {
    const source = String(value || "").trim();
    if (!source) {
        return { yearLevel: "", topicName: "" };
    }

    const parts = source.split("|").map((part) => String(part || "").trim()).filter(Boolean);
    if (parts.length >= 2) {
        const first = parts[0];
        const remainder = parts.slice(1).join(" | ");
        if (looksLikeYearLevelLabel(first)) {
            return { yearLevel: first, topicName: remainder };
        }
    }

    return { yearLevel: "", topicName: source };
}

function isLikelyNoiseUnitTopicLabel(value) {
    const text = String(value || "").trim();
    if (!text) {
        return true;
    }

    const lower = text.toLowerCase();
    if (/^(school\s*values?|technology\s*strand|level\s*\d+|year\s*\d+)$/i.test(lower)) {
        return true;
    }

    if (/\b(term\s*=|semester\s*=|periods|hours)\b/i.test(lower) && /^(juniors?|middle(?:\s*school)?|seniors?|year\s*\d+)/i.test(lower)) {
        return true;
    }

    return false;
}

function getUnitTopicsForTree(row) {
    const fromUnitTopics = Array.isArray(row?.unit_topics)
        ? row.unit_topics
        : toNormalizedLines(row?.unit_topics);
    const fromLessons = Array.isArray(row?.lessons)
        ? row.lessons
            .map((lesson) => String(lesson?.unit_topic || lesson?.unitTopic || "").trim())
            .filter(Boolean)
        : [];

    const source = fromUnitTopics.length ? fromUnitTopics : fromLessons;

    const seen = new Set();
    const normalized = [];

    source.forEach((entry) => {
        const label = String(entry || "").trim();
        if (!label) {
            return;
        }
        if (isLikelyNoiseUnitTopicLabel(label)) {
            return;
        }
        const key = label.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        normalized.push(label);
    });

    return normalized;
}

function normalizeYearLevelForTree(value) {
    const text = String(value || "").trim();
    const lower = text.toLowerCase();
    if (!lower) {
        return "";
    }

    if (/\bjunior/.test(lower)) return "Juniors";
    if (/\bmiddle/.test(lower)) return "Middle";
    if (/\bsenior/.test(lower)) return "Senior";

    const yearMatch = lower.match(/year\s*(\d{1,2})/);
    if (yearMatch?.[1]) {
        return `Year ${yearMatch[1]}`;
    }

    return "";
}

function getTreePlanLabel(row) {
    const topicType = getUnitPlanTopicType(row);
    const rawTitle = String(row?.title || "").trim();
    const looksLikeSentence = rawTitle.length > 90 || /[.!?]/.test(rawTitle);
    const baseLabel = !rawTitle || looksLikeSentence ? topicType : rawTitle;
    const yearLabel = normalizeYearLevelForTree(row?.year_level);

    if (!yearLabel) {
        return baseLabel;
    }

    if (baseLabel.toLowerCase().includes(yearLabel.toLowerCase())) {
        return baseLabel;
    }

    return `${baseLabel} (${yearLabel})`;
}

function renderAllTopicsTree(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length) {
        return "<p class='help-text'>No unit plans match your search.</p>";
    }

    const grouped = new Map();

    sourceRows.forEach((row) => {
        const mainUnit = getUnitPlanTopicType(row);
        if (!grouped.has(mainUnit)) {
            grouped.set(mainUnit, []);
        }
        grouped.get(mainUnit).push(row);
    });

    const groups = Array.from(grouped.entries()).sort((left, right) => left[0].localeCompare(right[0]));
    const treeHtml = groups
        .map(([mainUnit, unitPlans]) => {
            const sortedPlans = [...unitPlans].sort((left, right) => String(left.title || "").localeCompare(String(right.title || "")));
            const plansHtml = sortedPlans
                .map((row) => {
                    const planId = String(row?.id || "");
                    const planTitle = getTreePlanLabel(row);
                    const topics = getUnitTopicsForTree(row);

                    const byYear = new Map();
                    const uncategorized = [];

                    topics.forEach((topicLabel) => {
                        const parsed = parseUnitTopicLabel(topicLabel);
                        if (parsed.yearLevel) {
                            if (!byYear.has(parsed.yearLevel)) {
                                byYear.set(parsed.yearLevel, []);
                            }
                            byYear.get(parsed.yearLevel).push(parsed.topicName || parsed.yearLevel);
                        } else {
                            uncategorized.push(parsed.topicName || topicLabel);
                        }
                    });

                    const yearBranches = Array.from(byYear.entries())
                        .map(([year, yearTopics]) => {
                            const topicLeaves = yearTopics
                                .map((topicName) => `<li class="tree-node is-leaf"><span class="tree-label">${escapeHtml(topicName)}</span></li>`)
                                .join("");
                            return `
                                <li class="tree-node is-branch">
                                    <details class="tree-details" open>
                                        <summary class="tree-summary"><span class="tree-label">${escapeHtml(year)}</span></summary>
                                        <ul class="tree-children">${topicLeaves}</ul>
                                    </details>
                                </li>
                            `;
                        })
                        .join("");

                    const uncategorizedBranches = uncategorized
                        .map((topicName) => `<li class="tree-node is-leaf"><span class="tree-label">${escapeHtml(topicName)}</span></li>`)
                        .join("");

                    const topicTree = yearBranches || uncategorizedBranches
                        ? `<ul class="tree-children">${yearBranches}${uncategorizedBranches}</ul>`
                        : `<p class="help-text" style="margin:4px 0 0;">No sub-unit topics saved yet.</p>`;

                    const planLink = `upload-unit.html?edit=${encodeURIComponent(planId)}`;

                    return `
                        <li class="tree-node is-branch">
                            <details class="tree-details" open>
                                <summary class="tree-summary">
                                    <div class="tree-plan-row">
                                        <a class="tree-label tree-plan-link" href="${planLink}">${escapeHtml(planTitle)}</a>
                                    </div>
                                </summary>
                                ${topicTree}
                            </details>
                        </li>
                    `;
                })
                .join("");

            return `
                <section class="upload-panel unit-plan-tree-group" style="margin-top: 1rem;">
                    <details class="tree-details" open>
                        <summary class="tree-summary"><h2 style="margin:0;">${escapeHtml(mainUnit)}</h2></summary>
                        <ul class="unit-plan-tree">${plansHtml}</ul>
                    </details>
                </section>
            `;
        })
        .join("");

    return `
        <section class="upload-panel" style="margin-top: 1rem;">
            <h2 style="margin:0 0 8px;">All Topics Pathway</h2>
            <p class="help-text" style="margin:0 0 10px;">Main Unit Plans are grouped by Topic Type, with sub-unit coverage listed beneath each plan.</p>
            ${treeHtml}
        </section>
    `;
}

function openUnitPlan(rowId) {
    const unitPlanId = String(rowId || "").trim();
    if (!unitPlanId) {
        return;
    }

    window.location.href = `upload-unit.html?edit=${encodeURIComponent(unitPlanId)}`;
}

function renderUnitPlanCard(row) {
    const lessonCount = Array.isArray(row.lessons) ? row.lessons.length : 0;
    const topicType = getUnitPlanTopicType(row);
    const isSelected = String(row.id || "") === selectedUnitPlanId;
    const cardId = getUnitPlanDomId(row);
    const schoolValues = parseUnitValuesToResponses(row.unit_values);
    const contexts = parseContextsToResponses(row.contexts);
    const curriculum = parseCurriculumLinksToResponses(row.curriculum_links);

    return `
        <article id="${cardId}" class="upload-panel unit-plan-card ${isSelected ? "is-selected" : ""}" data-unit-plan-id="${escapeHtml(String(row.id || ""))}" style="margin-top: 1rem;">
            <div class="unit-plan-card-header">
                <div>
                    <p class="help-text" style="margin:0; text-transform:uppercase; font-weight:700;">Topic Type</p>
                    <h2 style="margin:2px 0 0;">${escapeHtml(row.title || "Untitled Unit Plan")}</h2>
                </div>
                <div class="unit-plan-card-actions">
                    <a href="upload-unit.html?edit=${encodeURIComponent(String(row.id || ""))}" class="button-save unit-plan-open-link" data-open-unit-plan="${escapeHtml(String(row.id || ""))}">Open in Upload Unit Plan</a>
                    <button type="button" class="button-save" data-edit-unit-plan="${escapeHtml(String(row.id || ""))}">Edit</button>
                    <button type="button" class="button button-danger" data-delete-unit-plan="${escapeHtml(String(row.id || ""))}">Delete</button>
                </div>
            </div>
            <fieldset class="form-section">
                <legend>Manual Unit Planner</legend>
                <div class="form-grid">
                    <div class="field"><label>Unit Title</label><input type="text" value="${escapeHtml(row.title || "Untitled Unit Plan")}" disabled></div>
                    <div class="field"><label>Topic Type</label><input type="text" value="${escapeHtml(topicType)}" disabled></div>
                    <div class="field"><label>Strand</label><input type="text" value="${escapeHtml(row.strand || "-")}" disabled></div>
                    <div class="field"><label>Year Level</label><input type="text" value="${escapeHtml(row.year_level || "-")}" disabled></div>
                    <div class="field"><label>Subject Stream</label><input type="text" value="${escapeHtml(row.subject_stream || "-")}" disabled></div>
                    <div class="field"><label>Lesson Count</label><input type="text" value="${escapeHtml(lessonCount)}" disabled></div>
                    <div class="field field-wide"><label>Unit Overview</label><textarea rows="3" disabled>${renderLineBlock(row.overview)}</textarea></div>
                    <div class="field field-wide"><label>Aims</label><textarea rows="10" disabled>${renderLineBlock(row.unit_aims)}</textarea></div>

                    <div class="field field-wide school-values-field">
                        <label>School Values</label>
                        <div class="school-values-grid">
                            <article class="school-value-card">
                                <h4>Whanaungatanga</h4>
                                <textarea rows="3" disabled>${renderLineBlock(schoolValues.whanaungatanga)}</textarea>
                            </article>
                            <article class="school-value-card">
                                <h4>Rangatiratanga</h4>
                                <textarea rows="3" disabled>${renderLineBlock(schoolValues.rangatiratanga)}</textarea>
                            </article>
                            <article class="school-value-card">
                                <h4>Manaakitanga</h4>
                                <textarea rows="3" disabled>${renderLineBlock(schoolValues.manaakitanga)}</textarea>
                            </article>
                            <article class="school-value-card">
                                <h4>Kaitiakitanga</h4>
                                <textarea rows="3" disabled>${renderLineBlock(schoolValues.kaitiakitanga)}</textarea>
                            </article>
                        </div>
                    </div>

                    <div class="field field-wide context-field">
                        <label>Contexts of Learning</label>
                        <div class="contexts-table-shell">
                            <a class="contexts-symbol-link" href="https://theelearningcoach.com/elearning_design/context-in-learning-design/" target="_blank" rel="noreferrer" aria-label="Open pedagogical explanation for contexts of learning">
                                <span class="contexts-symbol-title">Contexts of Learning</span>
                                <svg class="contexts-symbol" viewBox="0 0 120 120" role="img" aria-label="Contexts symbol">
                                    <circle cx="60" cy="60" r="56" fill="#ffffff" stroke="#90b5dd" stroke-width="4"></circle>
                                    <path d="M60 60 L60 8 A52 52 0 0 1 105 37 Z" fill="#9fd0ff"></path>
                                    <path d="M60 60 L105 37 A52 52 0 0 1 96 92 Z" fill="#ffd38d"></path>
                                    <path d="M60 60 L96 92 A52 52 0 0 1 38 108 Z" fill="#a8ddb5"></path>
                                    <path d="M60 60 L38 108 A52 52 0 0 1 14 55 Z" fill="#f3b0b0"></path>
                                    <path d="M60 60 L14 55 A52 52 0 0 1 60 8 Z" fill="#cab8ff"></path>
                                    <circle cx="60" cy="60" r="10" fill="#17395d"></circle>
                                </svg>
                                <span class="contexts-link-copy">Read pedagogy guide</span>
                            </a>
                            <div class="contexts-table">
                                <div class="contexts-row">
                                    <div class="contexts-heading">Environment</div>
                                    <textarea rows="3" disabled>${renderLineBlock(contexts.environment)}</textarea>
                                </div>
                                <div class="contexts-row">
                                    <div class="contexts-heading">Mental-Emotional</div>
                                    <textarea rows="3" disabled>${renderLineBlock(contexts.mentalEmotional)}</textarea>
                                </div>
                                <div class="contexts-row">
                                    <div class="contexts-heading">Culture</div>
                                    <textarea rows="3" disabled>${renderLineBlock(contexts.culture)}</textarea>
                                </div>
                                <div class="contexts-row">
                                    <div class="contexts-heading">Social</div>
                                    <textarea rows="3" disabled>${renderLineBlock(contexts.social)}</textarea>
                                </div>
                                <div class="contexts-row">
                                    <div class="contexts-heading">Technology</div>
                                    <textarea rows="3" disabled>${renderLineBlock(contexts.technology)}</textarea>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="field field-wide local-curriculum-field">
                        <label>Local Curriculum and Matauranga Maori</label>
                        <div class="local-curriculum-shell">
                            <div class="local-curriculum-table">
                                <div class="local-curriculum-header">Local Curriculum Links</div>
                                <div class="local-curriculum-header">Matauranga Maori</div>
                                <textarea rows="4" disabled>${renderLineBlock(curriculum.localCurriculumLinks)}</textarea>
                                <textarea rows="4" disabled>${renderLineBlock(curriculum.mataurangaMaori)}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="field field-wide skills-field">
                        <label>Skills</label>
                        <div class="skills-table-shell">
                            <div class="skills-table-title">Skills</div>
                            <div class="skills-table">
                                <div class="skills-row">
                                    <div class="skills-heading">Skills</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.generalSkills)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Career &amp; Future-Focused Skills</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.careerFutureSkills)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Considerations within Electronics</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.considerationsWithinElectronics)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Literacy</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.literacy)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Numeracy</div>
                                    <textarea rows="3" disabled>${renderLineBlock(curriculum.skills.numeracy)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Digital Tech</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.digitalTech)}</textarea>
                                </div>
                                <div class="skills-row">
                                    <div class="skills-heading">Practical</div>
                                    <textarea rows="4" disabled>${renderLineBlock(curriculum.skills.practical)}</textarea>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="field field-wide">
                        <label>Health &amp; Safety</label>
                        <textarea rows="10" disabled>${renderLineBlock(curriculum.healthSafety)}</textarea>
                    </div>
                    <div class="field field-wide"><label>Assessment / End Point</label><textarea rows="3" disabled>${renderLineBlock(row.assessment_link)}</textarea></div>
                    <div class="field field-wide"><label>Planning Notes</label><textarea rows="3" disabled>${renderLineBlock(row.notes)}</textarea></div>
                    <div class="field field-wide"><label>Last Updated</label><input type="text" value="${escapeHtml(formatDateTime(row.updated_at || row.created_at))}" disabled></div>
                </div>
            </fieldset>
            <fieldset class="form-section" style="margin-top: 10px;">
                <legend>Lesson Planner</legend>
                ${renderLessons(row.lessons)}
            </fieldset>
        </article>
    `;
}

function renderRows() {
    if (!resultsElement) return;

    if (!hasAccess) {
        resultsElement.innerHTML = "";
        return;
    }

    const baseFiltered = filterRows(rows);

    if (selectedTopicType === "All topics") {
        resultsElement.innerHTML = renderAllTopicsTree(baseFiltered);
        return;
    }

    const filtered = filterBySelectedTopicType(baseFiltered);
    if (!filtered.length) {
        resultsElement.innerHTML = "<p class='help-text'>No unit plans match your search.</p>";
        return;
    }

    const selectedFirst = [...filtered].sort((left, right) => {
        const leftSelected = String(left.id || "") === selectedUnitPlanId ? 0 : 1;
        const rightSelected = String(right.id || "") === selectedUnitPlanId ? 0 : 1;
        return leftSelected - rightSelected || String(left.title || "").localeCompare(String(right.title || ""));
    });

    const cards = selectedFirst.map((row) => renderUnitPlanCard(row)).join("");

    resultsElement.innerHTML = cards;

    resultsElement.querySelectorAll("[data-open-unit-plan]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            openUnitPlan(link.getAttribute("data-open-unit-plan"));
        });
    });

    resultsElement.querySelectorAll("[data-edit-unit-plan]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            const unitPlanId = button.getAttribute("data-edit-unit-plan");
            window.location.href = `upload-unit.html?edit=${encodeURIComponent(unitPlanId)}`;
        });
    });

    resultsElement.querySelectorAll("[data-delete-unit-plan]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            const unitPlanId = button.getAttribute("data-delete-unit-plan");
            const unitPlan = rows.find((row) => String(row.id) === unitPlanId);
            const unitTitle = unitPlan ? unitPlan.title : "Unit Plan";
            showDeleteConfirmation(unitPlanId, unitTitle);
        });
    });
}

async function loadUnitPlans() {
    if (!hasAccess) return;

    try {
        setStatus("Loading unit plans...");
        const response = await fetch("/api/unit-plans");
        if (!response.ok) {
            throw new Error(`Could not load unit plans (HTTP ${response.status})`);
        }

        const data = await response.json();
        rows = Array.isArray(data) ? data : [];
        rows.sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")));
        if (!getTopicTypes().includes(selectedTopicType)) {
            selectedTopicType = "All topics";
        }
        renderTopicTabs();
        renderRows();
        setStatus(`Loaded ${rows.length} unit plan${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
        setStatus(error.message || "Could not load unit plans.", true);
    }
}

async function resyncAllUnitPlanLessons() {
    if (!hasAccess) {
        setStatus("Teacher/Admin access is required.", true);
        return;
    }

    const email = readSignedInEmail();
    if (!email) {
        setStatus("Sign in with your school account first.", true);
        return;
    }

    try {
        setResyncButtonState(true, true);
        setStatus("Resyncing all unit lessons to the Activity Library...");

        const response = await fetch("/api/unit-plans/resync-lessons", {
            method: "POST",
            headers: withBrowseUnitAuthHeaders({ "Content-Type": "application/json" }, email),
            body: JSON.stringify({ user_email: email })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Could not resync lessons (HTTP ${response.status})`);
        }

        const processed = Number(data.unit_plans_processed || 0);
        const synced = Number(data.lesson_cards_synced || 0);
        setStatus(`Resync complete. Processed ${processed} unit plan${processed === 1 ? "" : "s"}; synced ${synced} lesson card${synced === 1 ? "" : "s"}.`);
    } catch (error) {
        setStatus(`Resync failed: ${error.message}`, true);
    } finally {
        setResyncButtonState(false, hasAccess);
    }
}

async function resolveAccess() {
    const email = readSignedInEmail();
    if (!email) {
        hasAccess = false;
        setResyncButtonState(false, false);
        setAccess("Sign in with your school account to browse unit plans.", true);
        setStatus("", false);
        renderRows();
        return;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
            headers: withBrowseUnitAuthHeaders({}, email)
        });
        if (!response.ok) {
            throw new Error("Could not resolve your access.");
        }

        const data = await response.json();
        const role = normalizeRole(data.additional_role);
        const roleAllowed = role === "teacher" || role === "lead teacher";
        hasAccess = Boolean(data.can_admin) || roleAllowed;

        if (!hasAccess) {
            setResyncButtonState(false, false);
            setAccess("Your account can sign in, but Browse Unit Plans is limited to Teacher, Lead Teacher, and Admin.", true);
            setStatus("", false);
            renderRows();
            return;
        }

        setResyncButtonState(false, true);
        setAccess(`Signed in as ${email}`);
    } catch (error) {
        hasAccess = false;
        setResyncButtonState(false, false);
        setAccess(error.message || "Could not resolve access.", true);
        setStatus("", false);
        renderRows();
    }
}

if (searchElement) {
    searchElement.addEventListener("input", () => {
        renderRows();
    });
}

if (resyncLessonsButton) {
    resyncLessonsButton.addEventListener("click", () => {
        resyncAllUnitPlanLessons();
    });
}

function showDeleteConfirmation(unitPlanId, unitTitle) {
    const modal = document.querySelector("#delete-confirmation-modal");
    const message = document.querySelector("#delete-confirmation-message");
    const deleteLessonsCheckbox = document.querySelector("#delete-lessons-checkbox");
    if (modal && message) {
        message.textContent = `Delete "${String(unitTitle || "Unit Plan")}". You can choose whether to delete its lesson cards too.`;
        pendingDeleteId = unitPlanId;
        if (deleteLessonsCheckbox) {
            deleteLessonsCheckbox.checked = true;
        }
        modal.showModal();
    }
}

async function deleteUnitPlan(unitPlanId, deleteLessons) {
    const email = readSignedInEmail();
    if (!email) {
        setStatus("Not signed in.", true);
        return;
    }

    try {
        setStatus(deleteLessons ? "Deleting unit plan and lesson cards..." : "Deleting unit plan and keeping lesson cards...");
        const query = new URLSearchParams({
            delete_lessons: deleteLessons ? "1" : "0"
        });
        const response = await fetch(`/api/unit-plans/${encodeURIComponent(unitPlanId)}?${query.toString()}`, {
            method: "DELETE",
            headers: withBrowseUnitAuthHeaders({}, email)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Could not delete unit plan (HTTP ${response.status})`);
        }

        rows = rows.filter((row) => String(row.id) !== unitPlanId);
        selectedUnitPlanId = "";
        renderTopicTabs();
        renderRows();

        const removedLessonCards = Number(data?.deleted_lesson_cards || 0);
        if (deleteLessons) {
            setStatus(`Unit plan deleted. Removed ${removedLessonCards} lesson card${removedLessonCards === 1 ? "" : "s"}.`);
        } else {
            setStatus("Unit plan deleted. Existing lesson cards were kept.");
        }
    } catch (error) {
        setStatus(`Delete failed: ${error.message}`, true);
    }
}

const deleteModal = document.querySelector("#delete-confirmation-modal");
const deleteConfirmButton = document.querySelector("#delete-confirm-button");
const deleteCancelButton = document.querySelector("#delete-cancel-button");
const deleteLessonsCheckbox = document.querySelector("#delete-lessons-checkbox");

if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener("click", () => {
        const shouldDeleteLessons = Boolean(deleteLessonsCheckbox?.checked);
        if (pendingDeleteId) {
            deleteUnitPlan(pendingDeleteId, shouldDeleteLessons);
        }
        pendingDeleteId = "";
        if (deleteModal) {
            deleteModal.close();
        }
    });
}

if (deleteCancelButton) {
    deleteCancelButton.addEventListener("click", () => {
        pendingDeleteId = "";
        if (deleteModal) {
            deleteModal.close();
        }
    });
}

async function init() {
    setResyncButtonState(false, false);
    await resolveAccess();
    await loadUnitPlans();
}

async function refreshAccessAndPlans() {
    if (authRefreshInFlight) {
        return;
    }

    authRefreshInFlight = true;
    try {
        await resolveAccess();
        await loadUnitPlans();
    } finally {
        authRefreshInFlight = false;
    }
}

window.addEventListener("storage", (event) => {
    if (!event.key || event.key === BROWSE_UNIT_AUTH_KEY) {
        refreshAccessAndPlans();
    }
});

window.addEventListener("focus", () => {
    refreshAccessAndPlans();
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        refreshAccessAndPlans();
    }
});

init();
