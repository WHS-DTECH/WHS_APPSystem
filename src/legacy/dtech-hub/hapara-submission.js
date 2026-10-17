(function () {
    const HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
    const HAPARA_WORKSPACE_PUBLIC_URL = "https://bit.ly/4uO74lI";
    const HAPARA_CLASS_DRIVE_URL = "https://app.hapara.com/dashboard/drive/4-1-12comp-vp-2026@westlandhigh.school.nz/all";

    const checklistHost = document.querySelector("#hapara-checklist");
    const summaryHost = document.querySelector("#hapara-summary");
    const statusHost = document.querySelector("#hapara-page-status");
    const submitAllButton = document.querySelector("#hapara-submit-all-ready");

    const model = {
        email: "",
        activities: [],
        items: []
    };

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

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
            return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : "";
        } catch (_error) {
            return "";
        }
    }

    function setStatus(message, isError = false) {
        if (!statusHost) return;
        statusHost.textContent = String(message || "");
        statusHost.classList.toggle("is-error", Boolean(isError));
    }

    function readStoredAuth() {
        const raw = localStorage.getItem(HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(HUB_AUTH_STORAGE_KEY);
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function readStoredHubEmail() {
        const auth = readStoredAuth();
        return normalizeEmail(auth?.profile?.email || "");
    }

    function readStoredHubAccessToken() {
        const auth = readStoredAuth();
        if (!auth?.expiresAt || Number(auth.expiresAt) <= Date.now()) {
            return "";
        }
        return String(auth?.idToken || auth?.accessToken || "").trim();
    }

    function buildAuthHeaders(headers = {}) {
        const nextHeaders = { ...headers };
        if (model.email) {
            nextHeaders["x-user-email"] = model.email;
        }

        const accessToken = readStoredHubAccessToken();
        if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
            nextHeaders.Authorization = `Bearer ${accessToken}`;
        }

        return nextHeaders;
    }

    function buildWriteHeaders() {
        return buildAuthHeaders({ "Content-Type": "application/json" });
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error || `Request failed (${response.status})`);
        }
        return response.json().catch(() => ({}));
    }

    function normalizeEvidenceSteps(rows) {
        if (!Array.isArray(rows)) return [];
        return rows
            .map((row) => ({
                standard: String(row?.standard || "").trim(),
                steps: Array.isArray(row?.steps)
                    ? row.steps
                        .map((step) => ({
                            text: String(step?.text || "").trim(),
                            done: step?.done !== false
                        }))
                        .filter((step) => step.text)
                    : []
            }))
            .filter((row) => row.standard && row.steps.length);
    }

    function normalizeTaskTopicRows(value) {
        const rows = Array.isArray(value)
            ? value
            : String(value || "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);

        const seen = new Set();
        const clean = [];
        rows.forEach((row) => {
            const next = String(row || "")
                .replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "")
                .replace(/^[\-*]\s*/, "")
                .trim();
            const key = next.toLowerCase();
            if (!next || seen.has(key)) return;
            seen.add(key);
            clean.push(next);
        });

        return clean;
    }

    function extractPrimaryStandardNumber(activity) {
        const rows = normalizeTaskTopicRows(activity?.standard_details || activity?.standardDetails || []);
        for (const row of rows) {
            const match = String(row).match(/\b\d{4,6}\b/);
            if (match && match[0]) {
                return match[0];
            }
        }
        return "task-topic";
    }

    function buildTaskTopicSubmissionStandardKey(taskTopicTitle, standardNumber = "") {
        const topicSlug = String(taskTopicTitle || "")
            .trim()
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

    function parseSubmissionFromEvidenceRow(row) {
        const result = {
            acknowledged: false,
            submittedAt: "",
            docRef: "",
            googleSlidesUrl: "",
            trelloCardUrl: "",
            oneDriveProjectFolderUrl: "",
            mediaAssetFolderUrl: "",
            mediaReviewUrl: "",
            genericLink: ""
        };

        const steps = Array.isArray(row?.steps) ? row.steps : [];
        steps.forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) return;

            if (text.startsWith("HAPARA_ACK|")) {
                const value = text.slice("HAPARA_ACK|".length).trim().toLowerCase();
                result.acknowledged = value === "true" || value === "1" || value === "yes";
                return;
            }
            if (text.startsWith("HAPARA_SUBMITTED_AT|")) {
                result.submittedAt = text.slice("HAPARA_SUBMITTED_AT|".length).trim();
                return;
            }
            if (text.startsWith("SUBMITTED_AT|")) {
                if (!result.submittedAt) {
                    result.submittedAt = text.slice("SUBMITTED_AT|".length).trim();
                }
                if (result.submittedAt) {
                    result.acknowledged = true;
                }
                return;
            }
            if (text.startsWith("HAPARA_DOC_REF|")) {
                result.docRef = text.slice("HAPARA_DOC_REF|".length).trim();
                return;
            }
            if (text.startsWith("GOOGLE_SLIDES_URL|")) {
                result.googleSlidesUrl = toSafeExternalUrl(text.slice("GOOGLE_SLIDES_URL|".length).trim());
                return;
            }
            if (text.startsWith("TRELLO_CARD_URL|")) {
                result.trelloCardUrl = toSafeExternalUrl(text.slice("TRELLO_CARD_URL|".length).trim());
                return;
            }
            if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
                result.oneDriveProjectFolderUrl = toSafeExternalUrl(text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim());
                return;
            }
            if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
                result.mediaAssetFolderUrl = toSafeExternalUrl(text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim());
                return;
            }
            if (text.startsWith("MEDIA_REVIEW_URL|")) {
                result.mediaReviewUrl = toSafeExternalUrl(text.slice("MEDIA_REVIEW_URL|".length).trim());
                return;
            }
            if (text.startsWith("LINK|")) {
                const value = toSafeExternalUrl(text.slice("LINK|".length).trim());
                if (value && !result.genericLink) {
                    result.genericLink = value;
                }
            }
        });

        return result;
    }

    function formatSubmissionTimestamp(value) {
        const raw = String(value || "").trim();
        if (!raw) return "Not submitted yet";
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return parsed.toLocaleString();
    }

    function getEvidenceLinks(submission) {
        const links = [];
        const pushLink = (label, value) => {
            const safe = toSafeExternalUrl(value);
            if (!safe) return;
            if (links.some((item) => item.url === safe)) return;
            links.push({ label, url: safe });
        };

        pushLink("Google Slides", submission.googleSlidesUrl);
        pushLink("Trello", submission.trelloCardUrl);
        pushLink("OneDrive Folder", submission.oneDriveProjectFolderUrl || submission.mediaAssetFolderUrl);
        pushLink("Review Link", submission.mediaReviewUrl);
        pushLink("Evidence Link", submission.genericLink);

        return links;
    }

    function findEvidenceRowByStandard(rows, standardKey) {
        return normalizeEvidenceSteps(rows).find((row) => String(row?.standard || "").trim() === standardKey) || null;
    }

    function upsertStepByPrefix(steps, prefix, value, done = true) {
        const list = Array.isArray(steps) ? [...steps] : [];
        const marker = String(prefix || "").trim();
        if (!marker) return list;

        const index = list.findIndex((step) => String(step?.text || "").startsWith(marker));
        if (value === null || value === undefined || value === "") {
            if (index >= 0) list.splice(index, 1);
            return list;
        }

        const next = { text: `${marker}${value}`, done: done !== false };
        if (index >= 0) {
            list[index] = next;
        } else {
            list.push(next);
        }

        return list;
    }

    function upsertHaparaSubmissionForStandard(rows, standardKey, submittedAt, docRef) {
        const normalized = Array.isArray(rows) ? rows.map((row) => ({
            standard: String(row?.standard || "").trim(),
            steps: Array.isArray(row?.steps)
                ? row.steps.map((step) => ({ text: String(step?.text || "").trim(), done: step?.done !== false })).filter((step) => step.text)
                : []
        })) : [];

        let row = normalized.find((item) => item.standard === standardKey);
        if (!row) {
            row = { standard: standardKey, steps: [] };
            normalized.push(row);
        }

        let nextSteps = row.steps;
        nextSteps = upsertStepByPrefix(nextSteps, "HAPARA_ACK|", "true", true);
        nextSteps = upsertStepByPrefix(nextSteps, "HAPARA_SUBMITTED_AT|", submittedAt, true);
        nextSteps = upsertStepByPrefix(nextSteps, "SUBMITTED_AT|", submittedAt, true);
        nextSteps = upsertStepByPrefix(nextSteps, "HAPARA_LOCATION|", "Hapara Workspace Evidence", true);
        nextSteps = upsertStepByPrefix(nextSteps, "HAPARA_CLASS_DRIVE|", HAPARA_CLASS_DRIVE_URL, true);
        if (docRef) {
            nextSteps = upsertStepByPrefix(nextSteps, "HAPARA_DOC_REF|", docRef, true);
        }

        row.steps = nextSteps;
        return normalized;
    }

    function buildTaskTopicItems(activity, evidenceRows) {
        const standardNumber = extractPrimaryStandardNumber(activity);
        const topics = normalizeTaskTopicRows(activity?.tasks_list || activity?.tasksList || []);
        const rows = normalizeEvidenceSteps(evidenceRows);
        const usedStandards = new Set();
        const items = [];

        topics.forEach((topic) => {
            const standardKey = buildTaskTopicSubmissionStandardKey(topic, standardNumber);
            usedStandards.add(standardKey);
            const evidenceRow = findEvidenceRowByStandard(rows, standardKey);
            const submission = parseSubmissionFromEvidenceRow(evidenceRow);
            const links = getEvidenceLinks(submission);

            items.push({
                activityId: String(activity.id || ""),
                activityName: String(activity.name || "Assessment Task"),
                standardKey,
                taskTopic: topic,
                links,
                hasLink: links.length > 0,
                acknowledged: Boolean(submission.acknowledged),
                submittedAt: String(submission.submittedAt || "").trim(),
                docRef: String(submission.docRef || "").trim(),
                evidenceRows: rows
            });
        });

        rows
            .filter((row) => String(row.standard || "").startsWith("task-topic:") && !usedStandards.has(row.standard))
            .forEach((row) => {
                const submission = parseSubmissionFromEvidenceRow(row);
                const links = getEvidenceLinks(submission);
                const topicFromKey = String(row.standard || "").split(":").slice(2).join(" ").replace(/-/g, " ").trim() || "Task Topic";

                items.push({
                    activityId: String(activity.id || ""),
                    activityName: String(activity.name || "Assessment Task"),
                    standardKey: row.standard,
                    taskTopic: topicFromKey.replace(/\b\w/g, (char) => char.toUpperCase()),
                    links,
                    hasLink: links.length > 0,
                    acknowledged: Boolean(submission.acknowledged),
                    submittedAt: String(submission.submittedAt || "").trim(),
                    docRef: String(submission.docRef || "").trim(),
                    evidenceRows: rows
                });
            });

        return items;
    }

    function buildSummary(items) {
        const submitted = items.filter((item) => item.acknowledged).length;
        const ready = items.filter((item) => item.hasLink && !item.acknowledged).length;
        const missing = items.filter((item) => !item.hasLink).length;
        return {
            total: items.length,
            submitted,
            ready,
            missing
        };
    }

    function renderSummary(items) {
        if (!summaryHost) return;
        const summary = buildSummary(items);
        summaryHost.innerHTML = `
            <div class="hapara-summary-item">
                <span class="hapara-summary-label">Total Items</span>
                <span class="hapara-summary-value">${summary.total}</span>
            </div>
            <div class="hapara-summary-item">
                <span class="hapara-summary-label">Submitted To Hapara</span>
                <span class="hapara-summary-value">${summary.submitted}</span>
            </div>
            <div class="hapara-summary-item">
                <span class="hapara-summary-label">Ready To Submit</span>
                <span class="hapara-summary-value">${summary.ready}</span>
            </div>
            <div class="hapara-summary-item">
                <span class="hapara-summary-label">Missing Evidence Link</span>
                <span class="hapara-summary-value">${summary.missing}</span>
            </div>
        `;
    }

    function renderChecklist(items) {
        if (!checklistHost) return;

        if (!items.length) {
            checklistHost.innerHTML = `<div class="hapara-empty">No task-topic evidence items found yet. Add evidence links from your assessment task pages first.</div>`;
            return;
        }

        const byActivity = new Map();
        items.forEach((item) => {
            const key = item.activityId || item.activityName;
            const list = byActivity.get(key) || [];
            list.push(item);
            byActivity.set(key, list);
        });

        checklistHost.innerHTML = Array.from(byActivity.values()).map((group) => {
            const first = group[0] || {};
            const submittedCount = group.filter((item) => item.acknowledged).length;
            return `
                <article class="hapara-assessment-card">
                    <header class="hapara-assessment-head">
                        <h2 class="hapara-assessment-title">${escapeHtml(first.activityName || "Assessment Task")}</h2>
                        <p class="hapara-assessment-subtitle">${submittedCount} of ${group.length} item(s) submitted to Hapara</p>
                    </header>
                    <div class="hapara-item-list">
                        ${group.map((item, index) => {
                            const statusClass = item.acknowledged
                                ? "is-submitted"
                                : item.hasLink
                                    ? "is-ready"
                                    : "is-missing";
                            const statusLabel = item.acknowledged
                                ? "Submitted"
                                : item.hasLink
                                    ? "Ready"
                                    : "Missing Link";

                            return `
                                <div class="hapara-item" data-activity-id="${escapeHtml(item.activityId)}" data-standard-key="${escapeHtml(item.standardKey)}" data-index="${index}">
                                    <div class="hapara-item-top">
                                        <h3 class="hapara-item-title">${escapeHtml(item.taskTopic || "Task Topic")}</h3>
                                        <span class="hapara-pill ${statusClass}">${statusLabel}</span>
                                    </div>
                                    <div class="hapara-links">
                                        ${item.links.length
                                            ? item.links.map((link) => `<a class="hapara-link-chip" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join("")
                                            : `<span class="hapara-link-chip">No evidence link added yet</span>`
                                        }
                                    </div>
                                    <p class="hapara-item-meta">Submitted at: ${escapeHtml(formatSubmissionTimestamp(item.submittedAt))}</p>
                                    ${item.docRef ? `<p class="hapara-item-meta">Evidence note: ${escapeHtml(item.docRef)}</p>` : ""}
                                    <div class="hapara-item-actions">
                                        <a class="detail-action detail-action-secondary" href="ProjectPages/custom-activity.html?id=${encodeURIComponent(item.activityId)}&taskTopic=${encodeURIComponent(item.taskTopic || "")}" target="_blank" rel="noreferrer">Open Task Item</a>
                                        <button type="button" class="detail-action" data-action="submit-hapara" ${item.hasLink ? "" : "disabled"}>Submit to Hapara</button>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </article>
            `;
        }).join("");
    }

    function refreshPageView() {
        renderSummary(model.items);
        renderChecklist(model.items);
    }

    async function loadChecklist() {
        if (!model.email) {
            checklistHost.innerHTML = `<div class="hapara-empty">Sign in with your school account first to view your Hapara submission checklist.</div>`;
            setStatus("Sign in required.", true);
            return;
        }

        setStatus("Loading your assessment evidence links...");
        const allocations = await fetchJson("/api/my-allocations", { headers: buildAuthHeaders() });
        const assessmentTasks = Array.isArray(allocations?.assessment_tasks) ? allocations.assessment_tasks : [];

        if (!assessmentTasks.length) {
            model.items = [];
            refreshPageView();
            setStatus("No assessment allocations found yet.");
            return;
        }

        const itemGroups = await Promise.all(assessmentTasks.map(async (task) => {
            const taskId = String(task?.id || "").trim();
            if (!taskId) return [];

            const [activity, evidencePayload] = await Promise.all([
                fetchJson(`/api/activities/${encodeURIComponent(taskId)}`, { headers: buildAuthHeaders() }),
                fetchJson(`/api/activities/${encodeURIComponent(taskId)}/interests/${encodeURIComponent(model.email)}/evidence`, { headers: buildAuthHeaders() })
            ]);

            const evidenceRows = normalizeEvidenceSteps(evidencePayload?.evidence_steps);
            return buildTaskTopicItems({ ...activity, id: taskId }, evidenceRows);
        }));

        model.items = itemGroups.flat();
        refreshPageView();
        setStatus("Checklist ready. Submit each completed item to Hapara when you are ready.");
    }

    async function submitItemToHapara(activityId, standardKey) {
        const target = model.items.find((item) => item.activityId === activityId && item.standardKey === standardKey);
        if (!target) {
            throw new Error("Submission item not found.");
        }
        if (!target.hasLink) {
            throw new Error("Add an evidence link first, then submit to Hapara.");
        }

        const submittedAt = new Date().toISOString();
        const nextRows = upsertHaparaSubmissionForStandard(target.evidenceRows, standardKey, submittedAt, target.docRef);

        await fetchJson(`/api/activities/${encodeURIComponent(activityId)}/interests/${encodeURIComponent(model.email)}/evidence`, {
            method: "PATCH",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ evidence_steps: nextRows })
        });

        model.items = model.items.map((item) => {
            if (item.activityId === activityId) {
                return {
                    ...item,
                    evidenceRows: nextRows,
                    acknowledged: item.standardKey === standardKey ? true : item.acknowledged,
                    submittedAt: item.standardKey === standardKey ? submittedAt : item.submittedAt
                };
            }
            return item;
        });

        refreshPageView();
        window.open(HAPARA_CLASS_DRIVE_URL, "_blank", "noopener");
    }

    async function submitAllReadyItems() {
        const readyItems = model.items.filter((item) => item.hasLink && !item.acknowledged);
        if (!readyItems.length) {
            setStatus("No ready items found. Add evidence links first.", true);
            return;
        }

        submitAllButton.disabled = true;
        let success = 0;
        let failed = 0;

        for (const item of readyItems) {
            try {
                await submitItemToHapara(item.activityId, item.standardKey);
                success += 1;
            } catch (_error) {
                failed += 1;
            }
        }

        submitAllButton.disabled = false;
        if (failed) {
            setStatus(`Submitted ${success} item(s). ${failed} item(s) could not be submitted.`, true);
            return;
        }

        setStatus(`Submitted ${success} item(s) to Hapara.`);
    }

    function wireActions() {
        checklistHost?.addEventListener("click", async (event) => {
            const button = event.target.closest("button[data-action='submit-hapara']");
            if (!button) return;

            const row = button.closest(".hapara-item");
            const activityId = String(row?.dataset?.activityId || "").trim();
            const standardKey = String(row?.dataset?.standardKey || "").trim();
            if (!activityId || !standardKey) return;

            button.disabled = true;
            setStatus("Submitting item to Hapara...");

            try {
                await submitItemToHapara(activityId, standardKey);
                setStatus("Item submitted. Hapara opened in a new tab.");
            } catch (error) {
                setStatus(error?.message || "Could not submit this item right now.", true);
            } finally {
                button.disabled = false;
            }
        });

        submitAllButton?.addEventListener("click", () => {
            setStatus("Submitting all ready items...");
            submitAllReadyItems().catch((error) => {
                setStatus(error?.message || "Could not complete bulk submission.", true);
            });
        });
    }

    async function init() {
        model.email = readStoredHubEmail();
        wireActions();

        try {
            await loadChecklist();
        } catch (error) {
            setStatus(error?.message || "Could not load your Hapara submission checklist.", true);
        }
    }

    init();
})();