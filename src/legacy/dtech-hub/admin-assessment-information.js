const STANDARDS_AUTH_KEY = "hub_google_auth_v1";

const streamInput = document.getElementById("nzqa-stream");
const levelInput = document.getElementById("nzqa-level");
const standardSearchInput = document.getElementById("nzqa-standard-search");
const refreshButton = document.getElementById("nzqa-refresh");
const statusElement = document.getElementById("standards-status");
const metaElement = document.getElementById("standards-results-meta");
const tableBody = document.getElementById("standards-table-body");
const standardDetailTitle = document.getElementById("standard-detail-title");
const standardDetailMeta = document.getElementById("standard-detail-meta");
const standardDetailMatch = document.getElementById("standard-detail-match");
const standardDetailLinks = document.getElementById("standard-detail-links");
const standardDetailText = document.getElementById("standard-detail-text");
const standardDetailForceRefreshButton = document.getElementById("standard-detail-force-refresh");
const standardCardForm = document.getElementById("standard-card-form");
const standardCardIdInput = document.getElementById("standard-card-id");
const standardCardResetButton = document.getElementById("standard-card-reset");
const standardCardStatus = document.getElementById("standard-card-status");
const standardCardTableBody = document.getElementById("standard-card-table-body");
let loadedStandardCards = [];
let loadedStandards = [];
let selectedStandardForDetails = "";

function standardsGetStoredEmail() {
    const raw = localStorage.getItem(STANDARDS_AUTH_KEY) || sessionStorage.getItem(STANDARDS_AUTH_KEY);
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function standardsGetStoredAuthState() {
    const raw = localStorage.getItem(STANDARDS_AUTH_KEY) || sessionStorage.getItem(STANDARDS_AUTH_KEY);
    if (!raw) {
        return { email: "", accessToken: "" };
    }

    try {
        const parsed = JSON.parse(raw);
        const expiresAt = Number(parsed?.expiresAt || 0);
        if (expiresAt <= Date.now()) {
            return { email: "", accessToken: "" };
        }
        return {
            email: String(parsed?.profile?.email || "").trim().toLowerCase(),
            accessToken: String(parsed?.idToken || parsed?.accessToken || "").trim()
        };
    } catch (_error) {
        return { email: "", accessToken: "" };
    }
}

function withStandardsAuthHeaders(headers = {}) {
    const { email, accessToken } = standardsGetStoredAuthState();
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

async function enforceAdminAccess() {
    const email = standardsGetStoredEmail();
    if (!email) {
        setStatus("Sign in with Google (top-right) to open Assessment Standards Manager.", true);
        return "";
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
            headers: withStandardsAuthHeaders({})
        });
        if (!response.ok) {
            setStatus("Could not verify admin access right now. Please sign out and sign in again.", true);
            return "";
        }

        const access = await response.json();
        if (!access?.can_admin) {
            setStatus("Your account does not currently have admin access for this page.", true);
            return "";
        }

        return email;
    } catch (_error) {
        setStatus("Could not verify admin access. Check your connection and try again.", true);
        return "";
    }
}

function setStatus(message, isError = false) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.className = isError ? "standards-status is-error" : "standards-status";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function linesToArray(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function parseCodesFromInput(value) {
    const unique = new Set();
    String(value || "")
        .split(/[\r\n,;]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((code) => unique.add(code));
    return Array.from(unique);
}

function setCardStatus(message, isError = false) {
    if (!standardCardStatus) return;
    standardCardStatus.textContent = String(message || "");
    standardCardStatus.className = isError ? "template-status is-error" : "template-status";
}

function findSavedCardForStandard(selected) {
    const standardNumber = String(selected?.standard_number || "").trim().toLowerCase();
    const standardName = String(selected?.standard_name || "").trim().toLowerCase();

    if (!standardNumber && !standardName) {
        return null;
    }

    return loadedStandardCards.find((card) => {
        const courseName = String(card?.course_name || "").trim().toLowerCase();
        const codes = Array.isArray(card?.standard_codes)
            ? card.standard_codes.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
            : [];

        const matchesNumber = Boolean(standardNumber)
            && (courseName === standardNumber || codes.includes(standardNumber));
        const matchesName = Boolean(standardName)
            && (courseName === standardName || codes.includes(standardName));

        return matchesNumber || matchesName;
    }) || null;
}

function autoResizeTextarea(field) {
    if (!(field instanceof HTMLTextAreaElement)) {
        return;
    }
    field.style.height = "auto";
    field.style.height = `${Math.max(field.scrollHeight, 84)}px`;
}

function resizeCardTextareas() {
    if (!standardCardForm) {
        return;
    }
    const textareas = Array.from(standardCardForm.querySelectorAll("textarea"));
    textareas.forEach((field) => autoResizeTextarea(field));
}

function setupCardTextareaAutosize() {
    if (!standardCardForm) {
        return;
    }
    const textareas = Array.from(standardCardForm.querySelectorAll("textarea"));
    textareas.forEach((field) => {
        autoResizeTextarea(field);
        field.addEventListener("input", () => autoResizeTextarea(field));
    });
}

function renderRows(rows) {
    if (!tableBody) return;

    if (!Array.isArray(rows) || !rows.length) {
        tableBody.innerHTML = `<tr><td colspan="8" class="standards-empty">No standards found for this filter.</td></tr>`;
        return;
    }

    tableBody.innerHTML = rows.map((row) => {
        const standardNumber = String(row.standard_number || "").trim();
        const standardName = String(row.standard_name || "").trim() || "Unnamed standard";
        const version = String(row.version || "").trim() || "-";
        const level = String(row.level || "").trim() || "-";
        const credits = Number.isFinite(Number(row.credits)) ? String(row.credits) : "-";
        const pdfUrl = String(row.pdf_url || "").trim();
        const docUrl = String(row.docx_url || "").trim();
        const detailsUrl = String(row.details_url || "").trim();

        return `
            <tr>
            <td><button type="button" class="standards-select-button" data-standard-select="${escapeHtml(standardNumber)}">${escapeHtml(standardNumber)}</button></td>
                <td>${escapeHtml(standardName)}</td>
                <td>${escapeHtml(version)}</td>
                <td><span class="standards-pill">L${escapeHtml(level)}</span></td>
                <td>${escapeHtml(credits)}</td>
                <td>${pdfUrl ? `<a class="standards-link" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noreferrer">PDF</a>` : `<span class="standards-empty">-</span>`}</td>
                <td>${docUrl ? `<a class="standards-link" href="${escapeHtml(docUrl)}" target="_blank" rel="noreferrer">DOC/DOCX</a>` : `<span class="standards-empty">-</span>`}</td>
                <td>${detailsUrl ? `<a class="standards-link" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noreferrer">View</a>` : `<span class="standards-empty">-</span>`}</td>
            </tr>
        `;
    }).join("");
}

function renderDetailLinks(details) {
    if (!standardDetailLinks) return;

    const pdfUrl = String(details?.pdf_url || "").trim();
    const docxUrl = String(details?.docx_url || "").trim();
    const detailsUrl = String(details?.details_url || "").trim();

    const links = [];
    if (pdfUrl) {
        links.push(`<a class="standards-link" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noreferrer">Open PDF</a>`);
    }
    if (docxUrl) {
        links.push(`<a class="standards-link" href="${escapeHtml(docxUrl)}" target="_blank" rel="noreferrer">Open DOC/DOCX</a>`);
    }
    if (detailsUrl) {
        links.push(`<a class="standards-link" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noreferrer">Open NZQA Page</a>`);
    }

    standardDetailLinks.innerHTML = links.length
        ? links.join(" ")
        : `<span class="standards-empty">No source links found for this standard.</span>`;
}

function setStandardDetailState({ title, meta, match, text, details = null }) {
    if (standardDetailTitle) {
        standardDetailTitle.textContent = title || "Standard details";
    }
    if (standardDetailMeta) {
        standardDetailMeta.textContent = meta || "";
    }
    if (standardDetailMatch) {
        standardDetailMatch.textContent = match || "";
    }
    if (standardDetailText) {
        standardDetailText.textContent = text || "";
    }
    renderDetailLinks(details);
}

function autoFillCardFormFromStandardSelection(selected, details) {
    if (!standardCardForm) {
        return;
    }

    const savedCard = findSavedCardForStandard(selected);
    if (savedCard) {
        fillCardForm(savedCard);
        setCardStatus(`Loaded saved Assessment Standard Card for ${String(selected?.standard_number || "this standard").trim()}.`);
        return;
    }

    const standardNumber = String(selected?.standard_number || details?.standard_number || "").trim();
    const standardLevelRaw = Number.parseInt(selected?.level, 10);
    const standardVersionRaw = Number.parseInt(selected?.version, 10);
    const creditsRaw = Number.parseInt(selected?.credits, 10);
    const criteria = details?.criteria && typeof details.criteria === "object" ? details.criteria : {};

    if (standardNumber) {
        standardCardForm.courseName.value = standardNumber;
        standardCardForm.standardCodes.value = standardNumber;
    }

    if (Number.isInteger(standardLevelRaw)) {
        standardCardForm.yearLevel.value = `Level ${standardLevelRaw}`;
    }

    if (Number.isInteger(standardVersionRaw)) {
        standardCardForm.yearVersion.value = String(standardVersionRaw);
    }

    if (Number.isInteger(creditsRaw) && creditsRaw >= 0) {
        standardCardForm.credits.value = String(creditsRaw);
    }

    const achievedText = String(criteria?.achieved_text || "").trim();
    const meritText = String(criteria?.merit_text || "").trim();
    const excellenceText = String(criteria?.excellence_text || "").trim();

    if (achievedText) {
        standardCardForm.achievedText.value = achievedText;
    }
    if (meritText) {
        standardCardForm.meritText.value = meritText;
    }
    if (excellenceText) {
        standardCardForm.excellenceText.value = excellenceText;
    }

    const filledCount = [achievedText, meritText, excellenceText].filter(Boolean).length;
    if (filledCount > 0) {
        setCardStatus(`Loaded ${filledCount}/3 criteria section(s) from ${String(details?.source_type || "document").toUpperCase()} source.`);
    } else {
        setCardStatus("Standard selected. Could not detect explicit Achieved/Merit/Excellence sections in this source. You can still enter criteria manually.");
    }

    resizeCardTextareas();
}

async function loadStandardDetail(standardNumber, { force = false } = {}) {
    const email = standardsGetStoredEmail();
    if (!email) {
        setStandardDetailState({
            title: "Standard details",
            meta: "Sign in as admin to load standard details.",
            match: "",
            text: ""
        });
        return;
    }

    const selected = loadedStandards.find((row) => String(row?.standard_number || "").trim() === String(standardNumber || "").trim());
    const titleBits = [
        String(selected?.standard_number || standardNumber || "").trim(),
        String(selected?.standard_name || "").trim()
    ].filter(Boolean);

    const normalizedStandardNumber = String(standardNumber || "").trim();
    selectedStandardForDetails = normalizedStandardNumber;
    if (standardDetailForceRefreshButton) {
        standardDetailForceRefreshButton.disabled = true;
    }

    setStandardDetailState({
        title: titleBits.join(" - ") || "Standard details",
        meta: "Loading details from NZQA document sources...",
        match: "",
        text: "Please wait...",
        details: selected || null
    });

    try {
        const params = new URLSearchParams();
        params.set("standard", normalizedStandardNumber);
        if (force) {
            params.set("force", "true");
        }

        const response = await fetch(`/api/admin/nzqa-standards/details?${params.toString()}`, {
            headers: withStandardsAuthHeaders({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Could not load standard details.");
        }

        const details = payload?.details || {};
        const sourceType = String(details?.source_type || "unknown").toUpperCase();
        const fetchedAt = String(details?.fetched_at || "").trim();
        const meta = fetchedAt
            ? `Source: ${sourceType} | Fetched: ${new Date(fetchedAt).toLocaleString()}`
            : `Source: ${sourceType}`;
        const normalizedNumber = String(standardNumber || "").trim();
        const sourceUrl = sourceType === "PDF"
            ? String(details?.pdf_url || "").trim()
            : sourceType === "DOCX"
                ? String(details?.docx_url || "").trim()
                : "";
        const sourceHasNumber = normalizedNumber && sourceUrl
            ? sourceUrl.toLowerCase().includes(normalizedNumber.toLowerCase())
            : false;
        const matchLabel = sourceUrl
            ? `Matched source URL for ${normalizedNumber}: ${sourceHasNumber ? "Yes" : "Partial"} (${sourceUrl})`
            : `Matched source URL for ${normalizedNumber}: Not available (DOCX/PDF only mode)`;

        setStandardDetailState({
            title: titleBits.join(" - ") || "Standard details",
            meta,
            match: matchLabel,
            text: String(details?.extracted_text || "No details text available."),
            details
        });

        autoFillCardFormFromStandardSelection(selected, details);
    } catch (error) {
        setStandardDetailState({
            title: titleBits.join(" - ") || "Standard details",
            meta: String(error?.message || "Could not load standard details."),
            match: "",
            text: "",
            details: selected || null
        });
    } finally {
        if (standardDetailForceRefreshButton) {
            standardDetailForceRefreshButton.disabled = !selectedStandardForDetails;
        }
    }
}

function formatCardUpdatedAt(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
}

function renderStandardCards(rows) {
    if (!standardCardTableBody) return;

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        standardCardTableBody.innerHTML = `<tr><td colspan="8" class="standards-empty">No Assessment Standard Cards yet.</td></tr>`;
        return;
    }

    standardCardTableBody.innerHTML = list.map((row) => {
        const id = String(row?.id || "").trim();
        const codes = Array.isArray(row?.standard_codes) ? row.standard_codes : [];
        return `
            <tr>
                <td>${escapeHtml(row?.course_name || "")}</td>
                <td>${escapeHtml(row?.year_level || "")}</td>
                <td>${escapeHtml(row?.year_version || "")}</td>
                <td>${Number.isFinite(Number(row?.credits)) ? escapeHtml(String(Number(row.credits))) : "-"}</td>
                <td>${escapeHtml(codes.join(", ") || "-")}</td>
                <td><span class="template-card-color-pill">${escapeHtml(row?.card_color || "Teal")}</span></td>
                <td>${escapeHtml(formatCardUpdatedAt(row?.updated_at))}</td>
                <td>
                    <div class="template-row-actions">
                        <button type="button" class="template-row-button" data-card-edit="${escapeHtml(id)}">Edit</button>
                        <button type="button" class="template-row-button" data-card-delete="${escapeHtml(id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function resetCardForm() {
    if (!standardCardForm) return;
    standardCardForm.reset();
    if (standardCardIdInput) {
        standardCardIdInput.value = "";
    }
    resizeCardTextareas();
    setCardStatus("");
}

function fillCardForm(card) {
    if (!standardCardForm || !card) return;

    if (standardCardIdInput) {
        standardCardIdInput.value = String(card.id || "").trim();
    }

    standardCardForm.courseName.value = String(card.course_name || "").trim();
    standardCardForm.yearLevel.value = String(card.year_level || "").trim();
    standardCardForm.yearVersion.value = String(card.year_version || "").trim();
    standardCardForm.credits.value = Number.isFinite(Number(card.credits)) ? String(Number(card.credits)) : "";
    standardCardForm.standardCodes.value = Array.isArray(card.standard_codes) ? card.standard_codes.join(", ") : "";
    standardCardForm.achievedText.value = String(card.achieved_text || "").trim();
    standardCardForm.meritText.value = String(card.merit_text || "").trim();
    standardCardForm.excellenceText.value = String(card.excellence_text || "").trim();
    standardCardForm.achievedChecklist.value = Array.isArray(card.achieved_checklist) ? card.achieved_checklist.join("\n") : "";
    standardCardForm.meritChecklist.value = Array.isArray(card.merit_checklist) ? card.merit_checklist.join("\n") : "";
    standardCardForm.excellenceChecklist.value = Array.isArray(card.excellence_checklist) ? card.excellence_checklist.join("\n") : "";

    resizeCardTextareas();
    setCardStatus("Card loaded. You can now edit and save.");
}

async function loadAssessmentStandardCards() {
    const email = standardsGetStoredEmail();
    if (!email) return;

    if (standardCardTableBody) {
        standardCardTableBody.innerHTML = `<tr><td colspan="7" class="standards-empty">Loading Assessment Standard Cards...</td></tr>`;
    }

    try {
        const response = await fetch("/api/admin/assessment-standard-cards", {
            headers: withStandardsAuthHeaders({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Could not load Assessment Standard Cards.");
        }

        loadedStandardCards = Array.isArray(payload?.cards) ? payload.cards : [];
        renderStandardCards(loadedStandardCards);
    } catch (error) {
        loadedStandardCards = [];
        renderStandardCards([]);
        setCardStatus(String(error?.message || "Could not load Assessment Standard Cards."), true);
    }
}

async function saveAssessmentStandardCard(event) {
    event.preventDefault();
    if (!standardCardForm) return;

    const email = standardsGetStoredEmail();
    if (!email) {
        setCardStatus("Sign in as admin to save Assessment Standard Cards.", true);
        return;
    }

    const yearVersion = Number.parseInt(standardCardForm.yearVersion.value, 10);
    const creditsRaw = String(standardCardForm.credits?.value || "").trim();
    const credits = creditsRaw ? Number.parseInt(creditsRaw, 10) : null;
    const standardCodes = parseCodesFromInput(standardCardForm.standardCodes.value);
    const courseName = String(standardCardForm.courseName.value || "").trim();
    const yearLevel = String(standardCardForm.yearLevel.value || "").trim();

    if (!courseName) {
        setCardStatus("Course name is required.", true);
        return;
    }
    if (!yearLevel) {
        setCardStatus("Year level is required.", true);
        return;
    }
    if (!Number.isInteger(yearVersion)) {
        setCardStatus("Year (version) must be a whole number.", true);
        return;
    }
    if (creditsRaw && (!Number.isInteger(credits) || credits < 0)) {
        setCardStatus("Credits must be a whole number 0 or higher.", true);
        return;
    }
    if (!standardCodes.length) {
        setCardStatus("At least one standard code is required.", true);
        return;
    }

    const payload = {
        id: String(standardCardIdInput?.value || "").trim(),
        course_name: courseName,
        year_level: yearLevel,
        year_version: yearVersion,
        credits,
        standard_codes: standardCodes,
        achieved_text: String(standardCardForm.achievedText.value || "").trim(),
        merit_text: String(standardCardForm.meritText.value || "").trim(),
        excellence_text: String(standardCardForm.excellenceText.value || "").trim(),
        achieved_checklist: linesToArray(standardCardForm.achievedChecklist.value),
        merit_checklist: linesToArray(standardCardForm.meritChecklist.value),
        excellence_checklist: linesToArray(standardCardForm.excellenceChecklist.value),
        is_active: true
    };

    setCardStatus("Saving Assessment Standard Card...");
    try {
        const response = await fetch("/api/admin/assessment-standard-cards", {
            method: "POST",
            headers: withStandardsAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Could not save Assessment Standard Card.");
        }

        setCardStatus("Assessment Standard Card saved.");
        await loadAssessmentStandardCards();
        if (result?.card) {
            fillCardForm(result.card);
        }
    } catch (error) {
        setCardStatus(String(error?.message || "Could not save Assessment Standard Card."), true);
    }
}

async function deleteAssessmentStandardCard(id) {
    const email = standardsGetStoredEmail();
    if (!email) {
        setCardStatus("Sign in as admin to delete cards.", true);
        return;
    }

    const confirmed = window.confirm("Delete this Assessment Standard Card?");
    if (!confirmed) return;

    setCardStatus("Deleting Assessment Standard Card...");
    try {
        const response = await fetch(`/api/admin/assessment-standard-cards/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: withStandardsAuthHeaders({})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Could not delete Assessment Standard Card.");
        }

        setCardStatus("Assessment Standard Card deleted.");
        await loadAssessmentStandardCards();
        if (String(standardCardIdInput?.value || "").trim() === String(id || "").trim()) {
            resetCardForm();
        }
    } catch (error) {
        setCardStatus(String(error?.message || "Could not delete Assessment Standard Card."), true);
    }
}

function buildQuery() {
    const params = new URLSearchParams();
    params.set("stream", String(streamInput?.value || "digital").trim().toLowerCase());
    params.set("level", String(levelInput?.value || "all").trim().toLowerCase());
    params.set("include_docs", "true");

    const standardQuery = String(standardSearchInput?.value || "").trim();
    if (standardQuery) {
        params.set("standard", standardQuery);
    }

    return params;
}

async function loadStandards({ force = false } = {}) {
    const email = standardsGetStoredEmail();
    if (!email) return;

    const params = buildQuery();
    if (force) {
        params.set("_", String(Date.now()));
    }

    setStatus("Loading NZQA standards...");
    if (refreshButton) {
        refreshButton.disabled = true;
    }

    try {
        const response = await fetch(`/api/admin/nzqa-standards?${params.toString()}`, {
            headers: withStandardsAuthHeaders({})
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || "Could not load NZQA standards.");
        }

        const standards = Array.isArray(payload?.standards) ? payload.standards : [];
        loadedStandards = standards;
        renderRows(standards);

        const stream = payload?.filters?.stream || params.get("stream") || "digital";
        const streamLabel = stream === "both"
            ? "Digital + Generic"
            : (stream === "computing" ? "Generic Computing" : "Digital Technologies");

        if (metaElement) {
            metaElement.textContent = `${standards.length} standard${standards.length === 1 ? "" : "s"} loaded - ${streamLabel}`;
        }

        setStatus("NZQA standards loaded.");
    } catch (error) {
        loadedStandards = [];
        renderRows([]);
        if (metaElement) {
            metaElement.textContent = "";
        }
        setStatus(String(error?.message || "Could not load NZQA standards."), true);
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
        }
    }
}

function bindEvents() {
    if (streamInput) {
        streamInput.addEventListener("change", () => loadStandards());
    }

    if (levelInput) {
        levelInput.addEventListener("change", () => loadStandards());
    }

    if (standardSearchInput) {
        let timer = null;
        standardSearchInput.addEventListener("input", () => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => loadStandards(), 250);
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", () => loadStandards({ force: true }));
    }

    if (tableBody) {
        tableBody.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-standard-select]");
            if (!button) {
                return;
            }
            const standardNumber = String(button.getAttribute("data-standard-select") || "").trim();
            if (!standardNumber) {
                return;
            }
            void loadStandardDetail(standardNumber);
        });
    }

    if (standardDetailForceRefreshButton) {
        standardDetailForceRefreshButton.addEventListener("click", () => {
            const standardNumber = String(selectedStandardForDetails || "").trim();
            if (!standardNumber) {
                return;
            }
            void loadStandardDetail(standardNumber, { force: true });
        });
    }

    if (standardCardForm) {
        standardCardForm.addEventListener("submit", saveAssessmentStandardCard);
    }

    if (standardCardResetButton) {
        standardCardResetButton.addEventListener("click", resetCardForm);
    }

    if (standardCardTableBody) {
        standardCardTableBody.addEventListener("click", async (event) => {
            const editButton = event.target.closest("button[data-card-edit]");
            if (editButton) {
                const id = String(editButton.getAttribute("data-card-edit") || "").trim();
                const found = loadedStandardCards.find((row) => String(row?.id || "").trim() === id);
                if (found) {
                    fillCardForm(found);
                }
                return;
            }

            const deleteButton = event.target.closest("button[data-card-delete]");
            if (deleteButton) {
                const id = String(deleteButton.getAttribute("data-card-delete") || "").trim();
                if (id) {
                    await deleteAssessmentStandardCard(id);
                }
            }
        });
    }
}

async function initAssessmentStandardsPage() {
    setupCardTextareaAutosize();

    const email = await enforceAdminAccess();
    if (!email) return;

    bindEvents();
    await Promise.all([
        loadStandards(),
        loadAssessmentStandardCards()
    ]);
}

// Backwards-compatibility hook for any legacy onclick handlers.
window.fetchNzqaStandards = function fetchNzqaStandards(force = false) {
    return loadStandards({ force: Boolean(force) });
};

initAssessmentStandardsPage();
