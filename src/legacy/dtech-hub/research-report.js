"use strict";

const SEARCH_RESEARCH_REPORT_ID = "search-research-report-v1";
const SEARCH_RESEARCH_REPORT_FILE_NAME = "Search Kit - My West Coast Discoveries";
const DEFAULT_RESEARCH_REPORT_MINIMUM_WORDS = 25;

// Accepts a Google Docs/Drive link or a bare file ID.
function parseGoogleDocId(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const fromPath = text.match(/\/(?:document|file)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/);
    if (fromPath) return fromPath[1];
    const fromQuery = text.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
    if (fromQuery) return fromQuery[1];
    return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : "";
}

function resolveResearchReportTemplateId(researchReport, fallback = "") {
    return parseGoogleDocId(researchReport?.templateId) || parseGoogleDocId(fallback);
}

// Year 7/8 -> JuniorDTECH, Year 9/10 -> MiddleDTECH, Year 11-13 -> SeniorDTECH.
// Staff use the pathway they chose in the Login Kit course check-in (JuniorDTECH if they have not chosen one).
function getResearchReportProgrammeFolder(profile, staffProgrammeFolder = "") {
    if (Array.isArray(profile?.courseIds) && profile.courseIds.includes("STAFF")) return staffProgrammeFolder || "JuniorDTECH";
    const year = Number(profile?.year);
    if (year === 7 || year === 8) return "JuniorDTECH";
    if (year === 9 || year === 10) return "MiddleDTECH";
    if (year >= 11 && year <= 13) return "SeniorDTECH";
    return "";
}

// Template placeholders the hub fills in when a student's copy is first made.
function buildResearchReportReplacements({ studentName, formClass } = {}) {
    return [
        ["[Type your name]", String(studentName || "").trim()],
        ["[Type your class]", String(formClass || "").trim()]
    ].filter(([, value]) => value).map(([placeholder, value]) => ({ placeholder, value }));
}

function applyResearchReportReplacements(text, replacements) {
    return (replacements || []).reduce((result, { placeholder, value }) => result.split(placeholder).join(value), String(text || ""));
}

function reportWords(text) {
    return String(text || "").normalize("NFKC").toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) || [];
}

// Counts words the student added beyond the template copy. Spelling, grammar and quality are not judged.
function gradeResearchReport(studentText, templateText, { minimumWords = DEFAULT_RESEARCH_REPORT_MINIMUM_WORDS } = {}) {
    const minimum = Number.isSafeInteger(Number(minimumWords)) && Number(minimumWords) > 0
        ? Number(minimumWords) : DEFAULT_RESEARCH_REPORT_MINIMUM_WORDS;
    const remaining = new Map();
    reportWords(templateText).forEach((word) => remaining.set(word, (remaining.get(word) || 0) + 1));
    let addedWords = 0;
    reportWords(studentText).forEach((word) => {
        const count = remaining.get(word) || 0;
        if (count > 0) remaining.set(word, count - 1);
        else addedWords += 1;
    });
    const passed = addedWords >= minimum;
    const feedback = passed
        ? "Ka pai! Your report has your own research in it. Your activity tick has been saved."
        : addedWords === 0
            ? "Your report still looks the same as the template. Add what you found out about the West Coast places you researched, then check again."
            : `Great start! You've added about ${addedWords} of your own words. Add a bit more about the places you researched (aim for at least ${minimum} of your own words), then check again.`;
    return {
        assessmentId: SEARCH_RESEARCH_REPORT_ID,
        passed,
        addedWords,
        minimumWords: minimum,
        feedback,
        answers: { addedWords, passed, checkedAt: new Date().toISOString() }
    };
}

module.exports = {
    SEARCH_RESEARCH_REPORT_ID,
    SEARCH_RESEARCH_REPORT_FILE_NAME,
    DEFAULT_RESEARCH_REPORT_MINIMUM_WORDS,
    parseGoogleDocId,
    resolveResearchReportTemplateId,
    getResearchReportProgrammeFolder,
    buildResearchReportReplacements,
    applyResearchReportReplacements,
    gradeResearchReport
};
