// upload-course-outline.js — handles the Upload Course Outline form.

const coForm = document.querySelector("#upload-course-outline-form");
const coUploadStatus = document.querySelector("#co-upload-status");
const coCancelButton = document.querySelector("#co-cancel");
const coClearDraftButton = document.querySelector("#clear-course-outline-draft");
const coAuthStatus = document.querySelector("#course-outline-auth-status");
const coStandardsList = document.querySelector("#co-standards-list");
const coStandardsEmpty = document.querySelector("#co-standards-empty");
const coStandardPicker = document.querySelector("#co-standard-picker");
const coAddStandardBtn = document.querySelector("#co-add-standard-btn");
const coAddAchieved = document.querySelector("#co-add-achieved");
const coAddMerit = document.querySelector("#co-add-merit");
const coAddExcellence = document.querySelector("#co-add-excellence");
const coAutofillNote = document.querySelector("#co-autofill-note");
const coPdfFileInput = document.querySelector("#co-pdf-file");
const coImportPdfButton = document.querySelector("#co-import-pdf");
const coImportStatus = document.querySelector("#co-import-status");

const COURSE_OUTLINE_DRAFT_KEY = "dtechHub:uploadCourseOutlineDraft:v1";
const CO_AUTH_KEY = "hub_google_auth_v1";

// In-memory list of standard entries for this outline.
let coStandardEntries = []; // [{standardLabel, achieved, merit, excellence}]
const coTemplatesByCode = new Map();

// ─── Auth helpers ────────────────────────────────────────────────────────────

function coGetAuthRaw() {
    try { return localStorage.getItem(CO_AUTH_KEY) || sessionStorage.getItem(CO_AUTH_KEY); } catch (_) { return null; }
}

function coGetUserEmail() {
    const raw = coGetAuthRaw();
    if (!raw) return "";
    try {
        const data = JSON.parse(raw);
        return String(data?.profile?.email || "").trim().toLowerCase();
    } catch (_) { return ""; }
}

function coGetAccessToken() {
    const raw = coGetAuthRaw();
    if (!raw) return "";
    try {
        const data = JSON.parse(raw);
        const expiresAt = Number(data?.expiresAt || 0);
        if (expiresAt <= Date.now()) return "";
        return String(data?.idToken || data?.accessToken || "").trim();
    } catch (_) {
        return "";
    }
}

function coWithEmailHeader(headers) {
    const email = coGetUserEmail();
    if (!email) return headers;

    const nextHeaders = { ...headers, "x-user-email": email };
    const accessToken = coGetAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function coIsAuthenticated() {
    if (window.whsDtech) return Boolean(window.whsDtech.profile?.email);
    const raw = coGetAuthRaw();
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        return Boolean(data?.idToken || data?.accessToken) && Number(data?.expiresAt) > Date.now();
    } catch (_) { return false; }
}

// ─── Status helper ───────────────────────────────────────────────────────────

function coSetStatus(message, isError = false) {
    if (!coUploadStatus) return;
    if (!message) {
        coUploadStatus.hidden = true;
        coUploadStatus.textContent = "";
        coUploadStatus.classList.remove("is-success", "is-error");
        return;
    }
    coUploadStatus.textContent = message;
    coUploadStatus.hidden = false;
    coUploadStatus.classList.remove("is-success", "is-error");
    coUploadStatus.classList.add(isError ? "is-error" : "is-success");
}

function coSetImportStatus(message, isError = false) {
    if (!coImportStatus) return;
    coImportStatus.textContent = String(message || "").trim();
    coImportStatus.classList.toggle("is-error", Boolean(isError));
}

// ─── Draft persistence ───────────────────────────────────────────────────────

function coSaveDraft() {
    if (!coForm) return;
    const draft = {};
    const fd = new FormData(coForm);
    fd.forEach((v, k) => { draft[k] = String(v || ""); });
    draft.__standards = coStandardEntries;
    try { localStorage.setItem(COURSE_OUTLINE_DRAFT_KEY, JSON.stringify(draft)); } catch (_) {}
}

function coRestoreDraft() {
    if (!coForm) return;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(COURSE_OUTLINE_DRAFT_KEY) || "null"); } catch (_) {}
    if (!draft || typeof draft !== "object") return;

    Object.keys(draft).forEach((key) => {
        if (key === "__standards") return;
        const field = coForm.elements.namedItem(key);
        if (!field || field instanceof RadioNodeList) return;
        if (field.type !== "hidden") field.value = String(draft[key] || "");
    });

    if (Array.isArray(draft.__standards)) {
        coStandardEntries = draft.__standards.filter((s) => s && s.standardLabel);
        coRenderStandardsList();
    }
}

function coClearDraft() {
    try { localStorage.removeItem(COURSE_OUTLINE_DRAFT_KEY); } catch (_) {}
    if (coForm) coForm.reset();
    if (coPdfFileInput) {
        coPdfFileInput.value = "";
    }
    coSetImportStatus("");
    coStandardEntries = [];
    coRenderStandardsList();
    coSetStatus("");
}

// ─── Render standards list ───────────────────────────────────────────────────

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function coRenderStandardsList() {
    if (!coStandardsList) return;

    if (!coStandardEntries.length) {
        coStandardsList.innerHTML = `<p class="course-outline-empty-note" id="co-standards-empty">No standards added yet. Use the area below to add standards.</p>`;
        return;
    }

    coStandardsList.innerHTML = coStandardEntries.map((entry, index) => `
        <div class="course-outline-standard-entry" data-entry-index="${index}">
            <div class="course-outline-standard-entry-header">
                <span class="course-outline-standard-entry-label">${escapeHtml(entry.standardLabel)}</span>
                <button type="button" class="course-outline-standard-remove" data-remove-index="${index}">Remove</button>
            </div>
            <div class="course-outline-ame-grid">
                <div>
                    <p class="course-outline-ame-label achieved">Achieved</p>
                    <p class="course-outline-ame-text">${escapeHtml(entry.achieved) || '<em style="color:#aaa">Not specified</em>'}</p>
                </div>
                <div>
                    <p class="course-outline-ame-label merit">Merit</p>
                    <p class="course-outline-ame-text">${escapeHtml(entry.merit) || '<em style="color:#aaa">Not specified</em>'}</p>
                </div>
                <div>
                    <p class="course-outline-ame-label excellence">Excellence</p>
                    <p class="course-outline-ame-text">${escapeHtml(entry.excellence) || '<em style="color:#aaa">Not specified</em>'}</p>
                </div>
            </div>
        </div>
    `).join("");

    // Bind remove buttons.
    coStandardsList.querySelectorAll("button[data-remove-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = Number.parseInt(btn.getAttribute("data-remove-index"), 10);
            if (Number.isInteger(idx) && idx >= 0 && idx < coStandardEntries.length) {
                coStandardEntries.splice(idx, 1);
                coRenderStandardsList();
                coSaveDraft();
            }
        });
    });
}

// ─── Standards picker ────────────────────────────────────────────────────────

function coFormatStandardOption(row) {
    const num = String(row?.standard_number || "").trim();
    const name = String(row?.standard_name || "").trim();
    const level = Number.parseInt(row?.level, 10);
    const credits = Number.isFinite(Number(row?.credits)) ? Number(row.credits) : null;
    return [
        num || "Unknown",
        name || "Unnamed standard",
        Number.isInteger(level) ? `L${level}` : "",
        Number.isFinite(credits) ? `${credits} credits` : ""
    ].filter(Boolean).join(" | ");
}

async function coLoadStandardsOptions() {
    if (!coStandardPicker) return;
    coStandardPicker.innerHTML = `<option value="">Loading standards...</option>`;
    coStandardPicker.disabled = true;
    if (coAddStandardBtn) coAddStandardBtn.disabled = true;

    coTemplatesByCode.clear();

    try {
        const [cardsResponse, standardsResponse] = await Promise.all([
            fetch("/api/assessment-standard-cards", {
                headers: coWithEmailHeader({})
            }),
            fetch("/api/assessment-standards/options?stream=both&level=all", {
                headers: coWithEmailHeader({})
            })
        ]);

        const cardsPayload = await cardsResponse.json().catch(() => ({}));
        const standardsPayload = await standardsResponse.json().catch(() => ({}));

        const cards = cardsResponse.ok && Array.isArray(cardsPayload?.cards) ? cardsPayload.cards : [];
        const standards = standardsResponse.ok && Array.isArray(standardsPayload?.options) ? standardsPayload.options : [];

        const cardRows = cards
            .map((card) => {
                const courseName = String(card?.course_name || "").trim();
                const standardCodes = Array.isArray(card?.standard_codes)
                    ? card.standard_codes.map((value) => String(value || "").trim()).filter(Boolean)
                    : [];
                const textSource = [courseName, ...standardCodes].join(" ");
                const codeMatch = textSource.match(/\b(\d{5})\b/);
                const code = codeMatch ? codeMatch[1] : "";
                if (!code) return null;

                const title = standardCodes.find((value) => !/\b\d{5}\b/.test(value)) || "Saved Assessment Standard Card";
                const level = String(card?.year_level || "").trim();
                const version = Number.parseInt(card?.year_version, 10);
                const credits = Number.parseInt(card?.credits, 10);
                const label = [
                    code,
                    title,
                    level ? `${level}` : "",
                    Number.isInteger(version) ? `Version ${version}` : "",
                    Number.isInteger(credits) ? `${credits} credits` : "",
                    "Template"
                ].filter(Boolean).join(" | ");

                coTemplatesByCode.set(code, card);
                return { code, label };
            })
            .filter(Boolean);

        const seenCodes = new Set(cardRows.map((row) => row.code));
        const standardsRows = standards
            .map((row) => {
                const text = coFormatStandardOption(row);
                const code = coExtractStandardCode(text);
                if (code && seenCodes.has(code)) {
                    return null;
                }
                return { code, label: text };
            })
            .filter(Boolean);

        const mergedRows = [...cardRows, ...standardsRows];
        if (!mergedRows.length) {
            coStandardPicker.innerHTML = `<option value="">No standards available</option>`;
            return;
        }

        coStandardPicker.innerHTML = [
            `<option value="">Select a standard...</option>`,
            ...mergedRows.map((row) => {
                return `<option value="${escapeHtml(row.label)}">${escapeHtml(row.label)}</option>`;
            })
        ].join("");
    } catch (_) {
        coStandardPicker.innerHTML = `<option value="">Could not load standards</option>`;
    } finally {
        coStandardPicker.disabled = false;
        if (coAddStandardBtn) coAddStandardBtn.disabled = false;
    }
}

function coPickLines(text, checklist) {
    const list = Array.isArray(checklist)
        ? checklist.map((l) => String(l || "").trim()).filter(Boolean)
        : [];
    if (list.length) return list.join("\n");
    return String(text || "").trim();
}

function coApplyTemplateToInputs(card, message) {
    if (!card) return;

    if (coAddAchieved) coAddAchieved.value = coPickLines(card.achieved_text, card.achieved_checklist);
    if (coAddMerit) coAddMerit.value = coPickLines(card.merit_text, card.merit_checklist);
    if (coAddExcellence) coAddExcellence.value = coPickLines(card.excellence_text, card.excellence_checklist);

    if (coAutofillNote) {
        coAutofillNote.textContent = message;
        coAutofillNote.hidden = false;
    }
}

function coGetTemplateByCode(code) {
    const normalized = String(code || "").trim();
    if (!normalized) return null;
    return coTemplatesByCode.get(normalized) || null;
}

// ─── Auto-populate A/M/E from Assessment Standard Card ──────────────────────

function coExtractStandardCode(label) {
    const match = String(label || "").match(/\b(\d{5})\b/);
    return match ? match[1] : "";
}

async function coTryAutofill(standardLabel) {
    if (!coAutofillNote) return;
    coAutofillNote.hidden = true;

    const code = coExtractStandardCode(standardLabel);
    if (!code) return;

    const localTemplate = coGetTemplateByCode(code);
    if (localTemplate) {
        const templateLabel = String(localTemplate?.course_name || code).trim();
        coApplyTemplateToInputs(localTemplate, `Criteria pre-filled from saved Assessment Standard Card (${templateLabel}).`);
        return;
    }

    const params = new URLSearchParams();
    params.set("standard", code);
    const year = new Date().getFullYear();
    params.set("year", String(year));

    try {
        const response = await fetch(`/api/assessment-standard-cards/match?${params.toString()}`, {
            headers: coWithEmailHeader({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.matched || !payload?.card) return;

        const card = payload.card;
        const templateLabel = String(card?.course_name || code).trim();
        coApplyTemplateToInputs(card, `Criteria pre-filled from Assessment Standard Card${templateLabel ? ` (${templateLabel})` : ""}.`);
    } catch (_) {
        // Keep the flow resilient.
    }
}

async function coFetchTemplateForStandard(standardLabel, options = {}) {
    const code = coExtractStandardCode(standardLabel);
    if (!code) return null;

    const localTemplate = coGetTemplateByCode(code);
    if (localTemplate) {
        return localTemplate;
    }

    const params = new URLSearchParams();
    params.set("standard", code);

    const yearLevel = String(options.yearLevel || coForm?.yearLevel?.value || "").trim();
    if (yearLevel) {
        params.set("year_level", yearLevel);
    }

    const courseName = String(options.courseName || coForm?.courseName?.value || "").trim();
    if (courseName) {
        params.set("course_name", courseName);
    }

    const yearVersion = Number.parseInt(options.yearVersion || coForm?.yearVersion?.value || "", 10) || new Date().getFullYear();
    params.set("year", String(yearVersion));

    try {
        const response = await fetch(`/api/assessment-standard-cards/match?${params.toString()}`, {
            headers: coWithEmailHeader({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.matched || !payload?.card) {
            return null;
        }
        return payload.card;
    } catch (_error) {
        return null;
    }
}

function coGetTemplateLines(card, kind) {
    const checklistKey = `${kind}_checklist`;
    const textKey = `${kind}_text`;
    const checklist = Array.isArray(card?.[checklistKey])
        ? card[checklistKey].map((line) => String(line || "").trim()).filter(Boolean)
        : [];
    if (checklist.length) {
        return checklist.join("\n");
    }
    return String(card?.[textKey] || "").trim();
}

async function coEnrichImportedStandards(entries, options = {}) {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) return [];

    const enriched = [];
    for (const row of rows) {
        const standardLabel = String(row?.standardLabel || "").trim();
        if (!standardLabel) continue;

        const template = await coFetchTemplateForStandard(standardLabel, options);
        enriched.push({
            standardLabel,
            achieved: String(row?.achieved || "").trim() || (template ? coGetTemplateLines(template, "achieved") : ""),
            merit: String(row?.merit || "").trim() || (template ? coGetTemplateLines(template, "merit") : ""),
            excellence: String(row?.excellence || "").trim() || (template ? coGetTemplateLines(template, "excellence") : "")
        });
    }

    return enriched;
}

async function coImportFromPdf() {
    if (!coIsAuthenticated()) {
        coSetImportStatus("Sign in first to import a course outline PDF.", true);
        return;
    }

    const file = coPdfFileInput?.files?.[0];
    if (!file) {
        coSetImportStatus("Choose a PDF file first.", true);
        return;
    }

    if (!/\.pdf$/i.test(file.name) && String(file.type || "").toLowerCase() !== "application/pdf") {
        coSetImportStatus("Only PDF files are supported.", true);
        return;
    }

    coSetImportStatus("Importing PDF and mapping standards...");
    if (coImportPdfButton) coImportPdfButton.disabled = true;

    try {
        const formData = new FormData();
        formData.append("courseOutlineFile", file);

        const response = await fetch("/api/course-outlines/parse-pdf", {
            method: "POST",
            headers: coWithEmailHeader({}),
            body: formData
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            coSetImportStatus(payload?.error || "Could not parse this PDF.", true);
            return;
        }

        const parsed = payload?.parsed || {};
        const importedStandards = Array.isArray(parsed?.standards)
            ? parsed.standards.map((row) => ({
                standardLabel: String(row?.standardLabel || "").trim(),
                achieved: "",
                merit: "",
                excellence: ""
            })).filter((row) => row.standardLabel)
            : [];

        if (coForm?.courseName && parsed?.courseName) {
            coForm.courseName.value = String(parsed.courseName || "").trim();
        }
        if (coForm?.yearLevel && parsed?.yearLevel) {
            coForm.yearLevel.value = String(parsed.yearLevel || "").trim();
        }
        if (coForm?.yearVersion && parsed?.yearVersion) {
            coForm.yearVersion.value = String(parsed.yearVersion || "").trim();
        }
        if (coForm?.subjectStream && parsed?.subjectStream) {
            coForm.subjectStream.value = String(parsed.subjectStream || "").trim();
        }
        if (coForm?.summary && parsed?.summary) {
            coForm.summary.value = String(parsed.summary || "").trim();
        }

        const enrichedStandards = await coEnrichImportedStandards(importedStandards, {
            courseName: coForm?.courseName?.value,
            yearLevel: coForm?.yearLevel?.value,
            yearVersion: coForm?.yearVersion?.value
        });

        coStandardEntries = enrichedStandards;
        coRenderStandardsList();
        coSaveDraft();

        coSetImportStatus(`Imported ${coStandardEntries.length} standard(s) from ${file.name}.`);
        coSetStatus(`Imported course outline from PDF. Review A/M/E criteria and save when ready.`);
    } catch (_error) {
        coSetImportStatus("Import failed. Please try again.", true);
    } finally {
        if (coImportPdfButton) coImportPdfButton.disabled = false;
    }
}

// ─── Add standard to the outline ────────────────────────────────────────────

function coClearAddArea() {
    if (coStandardPicker) coStandardPicker.value = "";
    if (coAddAchieved) coAddAchieved.value = "";
    if (coAddMerit) coAddMerit.value = "";
    if (coAddExcellence) coAddExcellence.value = "";
    if (coAutofillNote) coAutofillNote.hidden = true;
}

function coAddStandard() {
    const standardLabel = String(coStandardPicker?.value || "").trim();
    if (!standardLabel) {
        coSetStatus("Select a standard from the list first.", true);
        return;
    }

    // Prevent duplicates.
    if (coStandardEntries.some((e) => e.standardLabel === standardLabel)) {
        coSetStatus("That standard is already in the outline.", true);
        return;
    }

    coStandardEntries.push({
        standardLabel,
        achieved: String(coAddAchieved?.value || "").trim(),
        merit: String(coAddMerit?.value || "").trim(),
        excellence: String(coAddExcellence?.value || "").trim()
    });

    coRenderStandardsList();
    coClearAddArea();
    coSaveDraft();
    coSetStatus(`Standard added. ${coStandardEntries.length} standard(s) in outline.`);
}

// ─── Form submission ─────────────────────────────────────────────────────────

async function coHandleSubmit(event) {
    event.preventDefault();

    if (!coIsAuthenticated()) {
        coSetStatus("You must be signed in to save a Course Outline.", true);
        return;
    }

    const fd = new FormData(coForm);
    const courseName = String(fd.get("courseName") || "").trim();
    const yearLevel = String(fd.get("yearLevel") || "").trim();
    const yearVersion = Number.parseInt(fd.get("yearVersion"), 10);
    const subjectStream = String(fd.get("subjectStream") || "").trim();
    const summary = String(fd.get("summary") || "").trim();

    if (!courseName) { coSetStatus("Course Name is required.", true); return; }
    if (!yearLevel) { coSetStatus("Year Level is required.", true); return; }
    if (!Number.isInteger(yearVersion)) { coSetStatus("Year (Version) must be a valid year number.", true); return; }

    coSetStatus("Saving...");
    if (coForm.querySelector("[type='submit']")) coForm.querySelector("[type='submit']").disabled = true;

    try {
        const response = await fetch("/api/course-outlines", {
            method: "POST",
            headers: coWithEmailHeader({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                courseName,
                yearLevel,
                yearVersion,
                subjectStream,
                summary,
                cardColor: "Teal",
                standards: coStandardEntries
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            coSetStatus(payload?.error || "Could not save Course Outline.", true);
            return;
        }
        coSetStatus(`Course Outline saved successfully (${coStandardEntries.length} standard(s)).`);
        coClearDraft();
    } catch (error) {
        coSetStatus("Network error. Please try again.", true);
    } finally {
        if (coForm.querySelector("[type='submit']")) coForm.querySelector("[type='submit']").disabled = false;
    }
}

// ─── Auth guard ──────────────────────────────────────────────────────────────

function coCheckAuth() {
    if (!coAuthStatus) return;
    if (!coIsAuthenticated()) {
        coAuthStatus.textContent = "You must be signed in with a @westlandhigh.school.nz account to use this page.";
        coAuthStatus.classList.add("is-error");
        if (coForm) coForm.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
        if (coImportPdfButton) coImportPdfButton.disabled = true;
        if (coPdfFileInput) coPdfFileInput.disabled = true;
    } else {
        coAuthStatus.textContent = "";
    }
}

// ─── Initialise ──────────────────────────────────────────────────────────────

function coInit() {
    coCheckAuth();
    coRestoreDraft();
    void coLoadStandardsOptions();

    // Auto-populate when standard is selected.
    coStandardPicker?.addEventListener("change", () => {
        const selected = String(coStandardPicker.value || "").trim();
        if (selected) {
            void coTryAutofill(selected);
        } else {
            coClearAddArea();
        }
    });

    coAddStandardBtn?.addEventListener("click", coAddStandard);
    coImportPdfButton?.addEventListener("click", () => {
        void coImportFromPdf();
    });

    coForm?.addEventListener("submit", coHandleSubmit);
    coForm?.addEventListener("input", coSaveDraft);
    coForm?.addEventListener("change", coSaveDraft);

    coClearDraftButton?.addEventListener("click", () => {
        if (confirm("Clear all draft data and start fresh?")) {
            coClearDraft();
        }
    });

    coCancelButton?.addEventListener("click", () => {
        window.location.href = "upload-menu.html";
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", coInit);
} else {
    coInit();
}
