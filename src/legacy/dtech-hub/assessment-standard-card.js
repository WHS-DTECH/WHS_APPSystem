const authStorageKey = "hub_google_auth_v1";

function getAuthRaw() {
    try {
        return localStorage.getItem(authStorageKey) || sessionStorage.getItem(authStorageKey);
    } catch (_error) {
        return null;
    }
}

function getSignedInEmail() {
    const raw = getAuthRaw();
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function getSignedInAccessToken() {
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

function withSignedInAuthHeaders(headers = {}, email = getSignedInEmail()) {
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

function getUrlParam(name) {
    const value = new URLSearchParams(window.location.search).get(name);
    return String(value || "").trim();
}

function safeText(value) {
    return String(value || "").trim();
}

function standardCodeFromCard(card) {
    const courseName = safeText(card?.course_name);
    const codes = Array.isArray(card?.standard_codes)
        ? card.standard_codes.map((value) => safeText(value)).filter(Boolean)
        : [];
    const source = [courseName, ...codes].join(" ");
    const match = source.match(/\b(\d{5})\b/);
    return match ? match[1] : "";
}

function setStatus(message, isError = false) {
    const node = document.getElementById("sc-status");
    if (!node) return;
    node.textContent = safeText(message);
    node.classList.toggle("is-error", Boolean(isError));
}

function setText(id, value, fallback = "-") {
    const node = document.getElementById(id);
    if (!node) return;
    const text = safeText(value);
    node.textContent = text || fallback;
}

function setChecklist(id, value) {
    const node = document.getElementById(id);
    if (!node) return;

    const rows = Array.isArray(value)
        ? value.map((item) => safeText(item)).filter(Boolean)
        : [];

    if (!rows.length) {
        node.innerHTML = "<li>-</li>";
        return;
    }

    node.innerHTML = rows.map((line) => `<li>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`).join("");
}

function findCard(cards, cardId, standardCode) {
    const rows = Array.isArray(cards) ? cards : [];
    if (cardId) {
        const byId = rows.find((card) => safeText(card?.id) === cardId);
        if (byId) return byId;
    }

    if (standardCode) {
        const code = standardCode.toLowerCase();
        const byCode = rows.find((card) => {
            const cardCode = standardCodeFromCard(card).toLowerCase();
            return cardCode === code;
        });
        if (byCode) return byCode;
    }

    return null;
}

function getLearningSiteUrlForStandard(standardNumber, yearLevel) {
    const num = String(standardNumber || "").trim();
    const levelStr = String(yearLevel || "").trim();

    let level = "";
    if (levelStr.includes("3") || ["91903", "91907", "91906", "91902", "91904", "91905", "91908", "91909"].includes(num)) {
        level = "13";
    } else if (levelStr.includes("2") || ["91893", "91897", "91896", "91892", "91894", "91895", "91898", "91899"].includes(num)) {
        level = "12";
    } else {
        level = "11";
    }

    const isComp = ["91896", "91898", "91906", "91908"].includes(num);
    const domain = isComp ? "COMP" : "DTECH";
    const courseCode = `${level}${domain}`;

    return `https://tech-learningsites.onrender.com/${domain}/${courseCode}/#${num}`;
}

function escapeStandardGuideHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getStudentLearningSiteUrl(standardNumber, yearLevel) {
    const standard = String(standardNumber || "").trim();
    const studentLearningUrls = {
        "91893": "https://sites.google.com/westlandhigh.school.nz/dtec/unit-information/dtech-achievement-stds/digital-media-web",
        "91903": "https://sites.google.com/westlandhigh.school.nz/dtec/unit-information/dtech-achievement-stds/digital-media-web"
    };
    return studentLearningUrls[standard] || getLearningSiteUrlForStandard(standard, yearLevel);
}

function renderStudentStandardGuide({ standardNumber, standardName, yearLevel, credits, achievedText, meritText, excellenceText, achievedChecklist, meritChecklist, excellenceChecklist }) {
    const guide = document.getElementById("sc-student-guide");
    const teacherShell = document.querySelector(".standard-card-shell");
    const title = document.getElementById("ssg-title");
    const purpose = document.getElementById("ssg-purpose");
    const meta = document.getElementById("ssg-meta");
    const criteria = document.getElementById("ssg-criteria");
    const learningLink = document.getElementById("ssg-learning-link");
    if (!guide || !title || !purpose || !meta || !criteria || !learningLink) return;

    if (teacherShell) teacherShell.hidden = true;
    title.textContent = `AS ${standardNumber}: ${standardName || "Assessment Standard"}`;
    purpose.textContent = achievedText || "Use this guide to understand what you need to demonstrate in your assessment.";
    meta.innerHTML = [yearLevel, credits ? `${credits} credits` : ""].filter(Boolean)
        .map((item) => `<span>${escapeStandardGuideHtml(item)}</span>`).join("");
    learningLink.href = getStudentLearningSiteUrl(standardNumber, yearLevel);

    const levels = [
        { key: "achieved", label: "Achieved", text: achievedText, checklist: achievedChecklist },
        { key: "merit", label: "Merit", text: meritText, checklist: meritChecklist },
        { key: "excellence", label: "Excellence", text: excellenceText, checklist: excellenceChecklist }
    ];
    criteria.innerHTML = levels.map((level) => {
        const rows = Array.isArray(level.checklist)
            ? level.checklist.filter(Boolean).filter((row) => !window.hubShouldHideStudentAssessmentTask?.(standardNumber, row))
            : [];
        return `
            <section class="student-standard-level ${level.key}">
                <h2>${level.label}</h2>
                <p class="student-standard-level-copy">${escapeStandardGuideHtml(level.text || "Read the assessment information with your teacher.")}</p>
                <ul class="student-standard-checklist">${rows.map((row) => `<li>${escapeStandardGuideHtml(row)}</li>`).join("")}</ul>
            </section>
        `;
    }).join("");
    guide.hidden = false;
}

async function renderAssessmentTracker(standardNumber, email, isTeacher) {
    const trackerSection = document.getElementById("sc-process-tracker");
    if (!isTeacher) {
        if (trackerSection) trackerSection.hidden = true;
        return;
    }

    if (!/^(91897|91907|91893|91903|92006|91898|91908|92007|91899|91909)$/.test(standardNumber)) return;

    try {
        const trackerFrame = document.getElementById("sc-process-tracker-frame");
        const trackerLink = document.getElementById("sc-process-tracker-link");
        const trackerTitle = document.getElementById("sc-process-tracker-title");
        const isDigitalMedia = /^(91893|91903)$/.test(standardNumber);
        const isExternal = /^(92006|91898|91908|92007|91899|91909)$/.test(standardNumber);
        const assessmentLabel = isExternal
            ? "External Assessment"
            : isDigitalMedia ? "Digital Media Assessment" : "Process Assessment";
        const embedMode = isExternal ? "external" : isDigitalMedia ? "digital-media" : "process";
        const trackerUrl = `/teacher-student-work.html?standard=${encodeURIComponent(standardNumber)}&embed=${embedMode}`;

        if (trackerTitle) trackerTitle.textContent = `${standardNumber} ${assessmentLabel} Student Tracker`;
        if (trackerLink) trackerLink.href = `/teacher-student-work.html?standard=${encodeURIComponent(standardNumber)}`;
        if (trackerFrame) {
            trackerFrame.title = `${standardNumber} ${assessmentLabel} student tracker`;
            trackerFrame.src = trackerUrl;
        }
        if (trackerSection) {
            trackerSection.setAttribute("aria-label", `${assessmentLabel} student tracker`);
            trackerSection.hidden = false;
        }
    } catch (_error) {
    }
}

const DEFAULT_STANDARD_CRITERIA = {
    "91897": {
        achievedText: "Use advanced processes to develop a digital technologies outcome.",
        meritText: "Use advanced processes to develop a refined digital technologies outcome.",
        excellenceText: "Use advanced processes to develop a quality digital technologies outcome.",
        achievedChecklist: [
            "Use appropriate project management tools and techniques to plan the development of a digital technologies outcome.",
            "Decompose the outcome into smaller components.",
            "List the key features or requirements the outcome must include.",
            "Trial the components of the digital technologies outcome.",
            "Test that the digital technologies outcome functions as intended.",
            "Explain relevant implications."
        ],
        meritChecklist: [
            "Effectively use project management and version control tools and techniques to manage development of a digital technologies outcome.",
            "Trial multiple components and/or techniques and select those that are most suitable.",
            "Use information from testing and trialling to improve the functionality of the digital technologies outcome.",
            "Address relevant implications."
        ],
        excellenceChecklist: [
            "Discuss how planning, testing, and trialling information assisted the development of a high-quality outcome."
        ]
    },
    "91907": {
        achievedText: "Use complex processes to develop a digital technologies outcome.",
        meritText: "Use complex processes to develop a refined digital technologies outcome.",
        excellenceText: "Use complex processes to develop a quality digital technologies outcome.",
        achievedChecklist: [
            "Use recognised and appropriate project management techniques to plan the development of a digital technologies outcome.",
            "Decompose the digital technologies outcome into smaller components.",
            "Trial components of the outcome.",
            "Test that the digital technologies outcome functions as intended.",
            "Address relevant implications."
        ],
        meritChecklist: [
            "Effectively use project management techniques to manage development, feedback and/or collaborative processes.",
            "Effectively trial multiple components and/or techniques.",
            "Effectively use information from testing and trialling to improve the functionality of the digital technologies outcome."
        ],
        excellenceChecklist: [
            "Synthesise information gained from the planning, testing and trialling of components.",
            "Discuss how this information led to the development of a high-quality digital technologies outcome."
        ]
    },
    "91893": {
        achievedText: "Use advanced techniques to develop a digital media outcome.",
        meritText: "Use advanced techniques to develop a refined digital media outcome.",
        excellenceText: "Use advanced techniques to develop a quality digital media outcome.",
        achievedChecklist: [
            "Use appropriate tools and techniques for the purpose and end users.",
            "Apply appropriate data integrity and testing procedures.",
            "Use relevant conventions for the media type.",
            "Explain relevant implications."
        ],
        meritChecklist: [
            "Use information from testing procedures to improve the quality of the outcome.",
            "Apply relevant conventions to improve the quality of the outcome.",
            "Address relevant implications."
        ],
        excellenceChecklist: [
            "Iteratively improve the outcome throughout the design, development and testing process.",
            "Use efficient tools and techniques in the outcome's production."
        ]
    },
    "91903": {
        achievedText: "Use complex techniques to develop a digital media outcome.",
        meritText: "Use complex techniques to develop a refined digital media outcome.",
        excellenceText: "Use complex techniques to develop a quality digital media outcome.",
        achievedChecklist: [
            "Apply appropriate tools and techniques to meet the purpose and end-user requirements.",
            "Apply appropriate data integrity and testing procedures.",
            "Apply user experience principles relevant to the purpose of the outcome.",
            "Address relevant implications."
        ],
        meritChecklist: [
            "Use information from testing procedures to improve the quality of the digital media outcome.",
            "Apply user experience principles to improve the quality of the digital media outcome."
        ],
        excellenceChecklist: [
            "Iteratively improve the outcome throughout the design, development and testing process.",
            "Use efficient tools and techniques in the outcome's production."
        ]
    },
    "92006": {
        achievedText: "Demonstrate understanding of usability in human-computer interfaces.",
        meritText: "Demonstrate in-depth understanding of usability in human-computer interfaces.",
        excellenceText: "Demonstrate comprehensive understanding of usability in human-computer interfaces.",
        achievedChecklist: [
            "Describe usability principles relevant to human-computer interfaces (e.g. accessibility, navigation, visual clarity).",
            "Identify how usability principles are applied or violated in given interfaces.",
            "Explain how usability impacts user experience."
        ],
        meritChecklist: [
            "Explain in detail how usability principles improve human-computer interface design.",
            "Suggest specific improvements to interface designs based on usability principles."
        ],
        excellenceChecklist: [
            "Evaluate interface designs against usability principles and user needs.",
            "Justify design improvements with clear reasoning referencing usability heuristics."
        ]
    },
    "92007": {
        achievedText: "Design a digital technologies outcome.",
        meritText: "Develop an in-depth design for a digital technologies outcome.",
        excellenceText: "Develop a refined design for a digital technologies outcome.",
        achievedChecklist: [
            "Describe the purpose and end-user requirements of the proposed digital outcome.",
            "Generate design ideas and select a suitable design.",
            "Describe key features and components of the design.",
            "Explain relevant implications for the design."
        ],
        meritChecklist: [
            "Explain in detail how user feedback, trialling, and testing informed design refinements.",
            "Explain how relevant implications influenced design choices."
        ],
        excellenceChecklist: [
            "Justify design choices through synthesis of user needs, trialling, and testing.",
            "Evaluate how the final design addresses relevant implications and user requirements."
        ]
    },
    "91898": {
        achievedText: "Demonstrate understanding of a computer science concept.",
        meritText: "Demonstrate in-depth understanding of a computer science concept.",
        excellenceText: "Demonstrate comprehensive understanding of a computer science concept.",
        achievedChecklist: [
            "Describe key aspects of a computer science concept.",
            "Explain how the computer science concept is implemented in software, algorithms, or hardware.",
            "Provide examples showing how the concept is applied."
        ],
        meritChecklist: [
            "Explain in detail how a computer science concept operates and why it is used.",
            "Provide detailed examples showing clear understanding of technical mechanisms and trade-offs."
        ],
        excellenceChecklist: [
            "Evaluate key algorithms, mechanisms, or trade-offs associated with the computer science concept.",
            "Discuss implications, limitations, or future developments related to the concept."
        ]
    },
    "91899": {
        achievedText: "Present a summary of developing a digital outcome.",
        meritText: "Present an in-depth summary of developing a digital outcome.",
        excellenceText: "Present a comprehensive summary of developing a digital outcome.",
        achievedChecklist: [
            "Describe the digital outcome developed and its intended purpose and end users.",
            "Describe key decisions made during design, development, and testing.",
            "Explain how testing and trialling influenced the outcome.",
            "Explain how relevant implications were addressed during development."
        ],
        meritChecklist: [
            "Explain in detail how key decisions, testing, and feedback improved the digital outcome.",
            "Explain how relevant implications influenced design and development choices."
        ],
        excellenceChecklist: [
            "Discuss how synthesis of planning, testing, trialling, and feedback led to a high-quality outcome.",
            "Evaluate the overall success of the outcome against user requirements and relevant implications."
        ]
    },
    "91908": {
        achievedText: "Analyse an area of computer science.",
        meritText: "Analyse, in depth, an area of computer science.",
        excellenceText: "Critically analyse an area of computer science.",
        achievedChecklist: [
            "Explain key aspects of the computer science area.",
            "Explain relevant algorithms or mechanisms behind the area.",
            "Explain how the area is used, implemented, or occurs, giving examples.",
            "Explain key problems or issues related to the area and how these may be addressed."
        ],
        meritChecklist: [
            "Provide a detailed explanation of how technical capabilities and limitations relate to humans, giving examples.",
            "Compare and contrast different perspectives on the area."
        ],
        excellenceChecklist: [
            "Draw insightful conclusions about the computer science area.",
            "Evaluate innovative connections, less obvious implications, or future developments."
        ]
    },
    "91909": {
        achievedText: "Present a reflective analysis of developing a digital outcome.",
        meritText: "Present an in-depth reflective analysis of developing a digital outcome.",
        excellenceText: "Present a critical reflective analysis of developing a digital outcome.",
        achievedChecklist: [
            "Describe the digital outcome, its purpose, and end-user requirements.",
            "Explain key design and development decisions made throughout the project.",
            "Explain how testing, trialling, and feedback informed development.",
            "Explain how relevant implications were addressed."
        ],
        meritChecklist: [
            "Analyze in detail how key decisions, testing, trialling, and feedback influenced outcome quality.",
            "Analyze how relevant implications shaped the final digital outcome."
        ],
        excellenceChecklist: [
            "Critically evaluate how synthesis of planning, testing, trialling, and feedback contributed to a high-quality outcome.",
            "Reflect insightfully on trade-offs, limitations, and future developments for the outcome."
        ]
    }
};

async function loadStandardCard() {
    const email = getSignedInEmail();
    if (!email) {
        setStatus("Sign in with your school account to view this standard card.", true);
        return;
    }

    const cardId = getUrlParam("card");
    const standardCode = getUrlParam("standard");
    if (!cardId && !standardCode) {
        setStatus("No standard card was specified in the link.", true);
        return;
    }

    try {
        const response = await fetch("/api/assessment-standard-cards", {
            headers: withSignedInAuthHeaders({}, email)
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload?.error || "Could not load standard cards.");
        }

        const card = findCard(payload?.cards, cardId, standardCode);
        if (!card) {
            setStatus("This standard card could not be found.", true);
            return;
        }

        const number = standardCodeFromCard(card);
        const fallback = DEFAULT_STANDARD_CRITERIA[number] || {};
        const nameCandidates = Array.isArray(card?.standard_codes)
            ? card.standard_codes.map((value) => safeText(value)).filter(Boolean)
            : [];
        const standardName = nameCandidates.find((value) => !/\b\d{5}\b/.test(value)) || safeText(card?.course_name);

        setText("sc-standard-number", number);
        setText("sc-standard-level", safeText(card?.year_level));
        setText("sc-standard-version", Number.isInteger(Number.parseInt(card?.year_version, 10)) ? String(Number.parseInt(card.year_version, 10)) : "");
        setText("sc-credits", Number.isInteger(Number.parseInt(card?.credits, 10)) ? String(Number.parseInt(card.credits, 10)) : "");
        setText("sc-standard-name", standardName);

        const achievedText = safeText(card?.achieved_text) || fallback.achievedText || standardName;
        const meritText = safeText(card?.merit_text) || fallback.meritText || "-";
        const excellenceText = safeText(card?.excellence_text) || fallback.excellenceText || "-";

        const achievedChecklist = (Array.isArray(card?.achieved_checklist) && card.achieved_checklist.length)
            ? card.achieved_checklist
            : (fallback.achievedChecklist || []);
        const meritChecklist = (Array.isArray(card?.merit_checklist) && card.merit_checklist.length)
            ? card.merit_checklist
            : (fallback.meritChecklist || []);
        const excellenceChecklist = (Array.isArray(card?.excellence_checklist) && card.excellence_checklist.length)
            ? card.excellence_checklist
            : (fallback.excellenceChecklist || []);

        setText("sc-achieved-text", achievedText);
        setText("sc-merit-text", meritText);
        setText("sc-excellence-text", excellenceText);
        setChecklist("sc-achieved-checklist", achievedChecklist);
        setChecklist("sc-merit-checklist", meritChecklist);
        setChecklist("sc-excellence-checklist", excellenceChecklist);

        let isTeacher = false;
        try {
            const accessResp = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
                headers: withSignedInAuthHeaders({}, email)
            });
            if (accessResp.ok) {
                const access = await accessResp.json().catch(() => ({}));
                const canTeacherView = Boolean(access?.can_teacher_view || access?.can_admin);
                const inTeacherMode = typeof window.getEffectiveHubViewMode === "function"
                    ? window.getEffectiveHubViewMode() === "teacher"
                    : (localStorage.getItem("hub_view_mode_v1") !== "student");
                isTeacher = canTeacherView && inTeacherMode;
            }
        } catch (_err) {
        }

        const actionLink = document.getElementById("sc-action-link");
        if (actionLink) {
            if (isTeacher) {
                actionLink.textContent = "Open Standards Manager";
                actionLink.href = "admin-assessment-information.html";
                actionLink.target = "_self";
                actionLink.removeAttribute("rel");
            } else {
                actionLink.textContent = "Open DTECH Learning Site";
                actionLink.href = getLearningSiteUrlForStandard(number, card?.year_level);
                actionLink.target = "_blank";
                actionLink.rel = "noopener noreferrer";
            }
        }

        const content = document.getElementById("sc-content");
        if (content) content.hidden = !isTeacher;

        if (!isTeacher) {
            renderStudentStandardGuide({
                standardNumber: number,
                standardName,
                yearLevel: safeText(card?.year_level),
                credits: Number.isInteger(Number.parseInt(card?.credits, 10)) ? String(Number.parseInt(card.credits, 10)) : "",
                achievedText,
                meritText,
                excellenceText,
                achievedChecklist,
                meritChecklist,
                excellenceChecklist
            });
        }

        void renderAssessmentTracker(number, email, isTeacher);

        setStatus(`Loaded saved Assessment Standard Card for ${number || "this standard"}.`);
    } catch (error) {
        setStatus(String(error?.message || "Could not load this standard card."), true);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadStandardCard);
} else {
    void loadStandardCard();
}
