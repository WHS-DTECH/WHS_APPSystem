const ASSET_MANAGER_AUTH_KEY = "hub_google_auth_v1";
let assetManagerAllocation = {};
const assetManagerPageContext = { activityId: "", studentEmail: "", canEditTools: false };
const assetManagerVideoToolsState = { tools: [], updatedAt: "" };
const assetManagerDetectedVideoTools = new Set();
const assetManagerDetectedWebTools = new Set();
const assetManagerDetectedImageTools = new Set();
const assetManagerFcpxmlInfo = { file: "", labels: [], files: [] };
const assetManagerPsdInfo = { file: "", labels: [], files: [] };

const ASSET_MANAGER_WEB_TOOLS_TECHNIQUES = [
    "Management of assets",
    "Using stylesheets",
    "Master pages or student developed templates",
    "Commenting",
    "Character formatting controls",
    "Reusing objects, styles and/or frames",
    "HTML/CSS validation procedures",
    "Optimisation of media assets"
];

const ASSET_MANAGER_IMAGE_TOOLS_TECHNIQUES = [
    "Management of assets",
    "Using layers effectively",
    "Using non-destructive editing techniques",
    "Reusing styles, objects and/or presets",
    "Using templates, guides and/or grids",
    "Using efficient selection and masking techniques",
    "Using appropriate colour and typography controls",
    "Optimisation and efficient export of image assets"
];

const ASSET_MANAGER_VIDEO_TOOLS_TECHNIQUES = [
    "Management of media assets",
    "Appropriate folder/bin organisation",
    "Appropriate file naming",
    "Storyboards / shot lists / run-sheets",
    "Reusing titles, presets, effects or templates",
    "Adjustment layers / nested sequences where appropriate",
    "Proxy media / optimised editing workflow",
    "Non-destructive editing",
    "Appropriate sequence/project settings",
    "Optimisation/compression of media assets",
    "Appropriate export settings",
    "Version control / project backups"
];

function assetManagerReadAuth() {
    try {
        const raw = localStorage.getItem(ASSET_MANAGER_AUTH_KEY) || sessionStorage.getItem(ASSET_MANAGER_AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

function assetManagerGetEmail() {
    return String(assetManagerReadAuth()?.profile?.email || "").trim().toLowerCase();
}

function assetManagerHeaders(headers = {}) {
    const email = assetManagerGetEmail();
    return { ...headers, ...(email ? { "x-user-email": email } : {}) };
}

function escapeAssetManagerHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setAssetManagerStatus(message, isError = false) {
    const el = document.querySelector("#asset-manager-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", Boolean(isError));
}

async function assetManagerLoadJson(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status}).`);
    }
    return payload;
}

function findGithubRepoUrlFromEvidenceSteps(evidenceRows) {
    for (const row of (Array.isArray(evidenceRows) ? evidenceRows : [])) {
        for (const step of (Array.isArray(row?.steps) ? row.steps : [])) {
            const text = String(step?.text || "").trim();
            if (text.startsWith("GITHUB_REPO_URL|")) {
                const url = text.slice("GITHUB_REPO_URL|".length).trim();
                if (url) return url;
            }
        }
    }
    return "";
}

function formatAssetManagerBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "0 KB";
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(value / 1024)} KB`;
}

function renderAssetManagerStudentDetails(allocation) {
    const title = document.querySelector("#asset-manager-title");
    if (!title) return;
    document.querySelector("#asset-manager-student-details")?.remove();

    const processStandard = String(allocation?.standard_1 || "").trim() || "Not set";
    const projectTaskStandard = String(allocation?.standard_2 || "").trim() || "Not set";
    const strand = String(allocation?.strand || "").trim() || "Not set";
    const digitalMediaType = String(allocation?.digital_media_type || "").trim();
    const detail = document.createElement("div");
    detail.id = "asset-manager-student-details";
    detail.className = "asset-manager-student-details";
    detail.innerHTML = `
        <span><strong>Process Std:</strong> ${escapeAssetManagerHtml(processStandard)}</span>
        <span><strong>Project/Task Std:</strong> ${escapeAssetManagerHtml(projectTaskStandard)}</span>
        <span><strong>Strand:</strong> ${escapeAssetManagerHtml(strand)}</span>
        ${digitalMediaType ? `<span><strong>Digital Media:</strong> ${escapeAssetManagerHtml(digitalMediaType)}</span>` : ""}
    `;
    title.insertAdjacentElement("afterend", detail);
}

function renderCssDetails(details) {
    const values = details || {};
    return `
        <div class="asset-manager-detail-panel">
            <h3>CSS Details</h3>
            <dl class="asset-manager-detail-list">
                <div><dt>Stylesheets</dt><dd>${Number(values.stylesheets || 0)}</dd></div>
                <div><dt>CSS rules</dt><dd>${Number(values.rules || 0)}</dd></div>
                <div><dt>CSS variables</dt><dd>${Number(values.variables || 0)}</dd></div>
                <div><dt>Repeated colour values</dt><dd>${Number(values.repeated_colour_values || 0)}</dd></div>
                <div><dt>Inline styles</dt><dd>${Number(values.inline_styles || 0)}</dd></div>
                <div><dt>!important uses</dt><dd>${Number(values.important_uses || 0)}</dd></div>
                <div><dt>Media queries</dt><dd>${Number(values.media_queries || 0)}</dd></div>
            </dl>
        </div>
    `;
}

function renderHtmlDetails(details) {
    const values = details || {};
    const semanticElements = Array.isArray(values.semantic_elements) && values.semantic_elements.length
        ? values.semantic_elements.join(" / ")
        : "None detected";
    return `
        <div class="asset-manager-detail-panel">
            <h3>HTML Details</h3>
            <dl class="asset-manager-detail-list">
                <div><dt>Total HTML pages</dt><dd>${Number(values.total_pages || 0)}</dd></div>
                <div><dt>HTML pages scanned</dt><dd>${Number(values.pages || 0)}</dd></div>
                <div><dt>Common stylesheet</dt><dd>${values.common_stylesheet ? "Yes" : "No"}</dd></div>
                <div><dt>Common JavaScript</dt><dd>${values.common_javascript ? "Yes" : "No"}</dd></div>
                <div><dt>Repeated navigation detected</dt><dd>${Number(values.repeated_navigation_pages || 0)} pages</dd></div>
                <div><dt>Semantic elements used</dt><dd>${escapeAssetManagerHtml(semanticElements)}</dd></div>
                <div><dt>Inline CSS</dt><dd>${Number(values.inline_styles || 0)}</dd></div>
            </dl>
        </div>
    `;
}

function renderJavascriptDetails(details) {
    const values = details || {};
    return `
        <div class="asset-manager-detail-panel">
            <h3>JavaScript Details</h3>
            <dl class="asset-manager-detail-list">
                <div><dt>Total JS files</dt><dd>${Number(values.total_files || 0)}</dd></div>
                <div><dt>JS files scanned</dt><dd>${Number(values.files || 0)}</dd></div>
                <div><dt>Functions</dt><dd>${Number(values.functions || 0)}</dd></div>
                <div><dt>Event listeners</dt><dd>${Number(values.event_listeners || 0)}</dd></div>
                <div><dt>DOM access</dt><dd>${Number(values.dom_accesses || 0)}</dd></div>
                <div><dt>Fetch/API calls</dt><dd>${Number(values.fetch_api_calls || 0)}</dd></div>
                <div><dt>Local/session storage</dt><dd>${values.storage_detected ? "Detected" : "Not detected"}</dd></div>
                <div><dt>Imported libraries</dt><dd>${Number(values.imported_libraries || 0)}</dd></div>
                <div><dt>Repeated code blocks</dt><dd>${values.repeated_code_blocks ? "Potential duplication" : "None detected"}</dd></div>
            </dl>
        </div>
    `;
}

function formatAssetManagerFormats(values) {
    return Array.isArray(values) && values.length ? values.join(" / ") : "None found";
}

function renderVideoDetails(payload) {
    const details = payload?.video_details || {};
    return `
        <details class="asset-manager-result-section" open>
            <summary class="asset-manager-result-summary">Media Inventory</summary>
            <div class="asset-manager-result-body">${renderAssetManagerDetailList([
                ["Total repository files", Number(details.total_files || 0)],
                ["Total media assets", Number(details.total_media_files || 0)],
                ["Video clips", Number(details.video_clips || 0)],
                ["Audio files", Number(details.audio_files || 0)],
                ["Images", Number(details.images || 0)],
                ["Graphics", Number(details.graphics || 0)],
                ["Editor/timeline project files", Number(details.project_files || 0)],
                ["Total source media", formatAssetManagerBytes(details.total_source_media_bytes)]
            ])}</div>
        </details>
        <details class="asset-manager-result-section">
            <summary class="asset-manager-result-summary">Video Technical Health</summary>
            <div class="asset-manager-result-body">${renderAssetManagerDetailList([
                ["Resolution(s)", "Not available from GitHub file metadata"],
                ["Frame rates", "Not available from GitHub file metadata"],
                ["Audio", formatAssetManagerFormats(details.audio_formats)],
                ["Images", formatAssetManagerFormats(details.image_formats)],
                ["Video formats", formatAssetManagerFormats(details.video_formats)],
                ["Missing/offline media", Number(details.missing_offline_media || 0)],
                ["Duplicate assets", Number(details.duplicate_assets || 0)],
                ["Oversized assets", Number(details.oversized_assets || 0)]
            ])}</div>
        </details>
    `;
}

function renderImageDetails(payload) {
    const details = payload?.image_details || {};
    const oversizedCount = Number(payload?.oversized_image_count || 0);
    return `
        <details class="asset-manager-result-section" open>
            <summary class="asset-manager-result-summary">Image Inventory</summary>
            <div class="asset-manager-result-body">${renderAssetManagerDetailList([
                ["Total repository files", Number(details.total_files || 0)],
                ["Total image assets", Number(details.total_image_assets || 0)],
                ["Raster images", Number(details.raster_images || 0)],
                ["Vector graphics", Number(details.vector_graphics || 0)],
                ["Layered source files (PSD/AI/etc.)", Number(details.layered_source_files || 0)],
                ["Total source size", formatAssetManagerBytes(details.total_source_bytes)]
            ])}</div>
        </details>
        <details class="asset-manager-result-section">
            <summary class="asset-manager-result-summary">Image Technical Health</summary>
            <div class="asset-manager-result-body">${renderAssetManagerDetailList([
                ["Raster formats", formatAssetManagerFormats(details.image_formats)],
                ["Vector formats", formatAssetManagerFormats(details.vector_formats)],
                ["Source file formats", formatAssetManagerFormats(details.source_file_formats)],
                ["Oversized raster images (>500 KB)", oversizedCount]
            ])}</div>
        </details>
    `;
}

function renderAssetManagerDetailList(items) {
    return `<div class="asset-manager-detail-panel"><dl class="asset-manager-detail-list">${items.map(([label, value]) => `<div><dt>${escapeAssetManagerHtml(label)}</dt><dd>${escapeAssetManagerHtml(value)}</dd></div>`).join("")}</dl></div>`;
}

function isAssetManagerVideoProject() {
    return String(assetManagerAllocation?.digital_media_type || "").trim().toLowerCase() === "video";
}

function isAssetManagerImageProject() {
    const type = String(assetManagerAllocation?.digital_media_type || "").trim().toLowerCase();
    return type === "image" || type === "graphics" || type === "vector";
}

function renderAssetManagerVideoToolsPanel() {
    const tickedSet = new Set(assetManagerVideoToolsState.tools.map((tool) => String(tool || "").trim().toLowerCase()));
    const readOnly = !assetManagerPageContext.canEditTools;
    let fcpxmlSummaryLines = "";
    if (assetManagerFcpxmlInfo.files && assetManagerFcpxmlInfo.files.length) {
        fcpxmlSummaryLines = assetManagerFcpxmlInfo.files.map((item) => {
            const fileStr = escapeAssetManagerHtml(item.file);
            const labelsStr = Array.isArray(item.labels) && item.labels.length
                ? ` \u2014 detected: ${escapeAssetManagerHtml(item.labels.join(", "))}`
                : " \u2014 no timeline practices detected in this export.";
            return `<p class="task-list-achieved-note"><strong>Timeline parsed: ${fileStr}</strong>${labelsStr}</p>`;
        }).join("");
    } else if (assetManagerFcpxmlInfo.file) {
        const fileStr = escapeAssetManagerHtml(assetManagerFcpxmlInfo.file);
        const labelsStr = assetManagerFcpxmlInfo.labels.length
            ? ` \u2014 detected: ${escapeAssetManagerHtml(assetManagerFcpxmlInfo.labels.join(", "))}`
            : " \u2014 no timeline practices detected in this export.";
        fcpxmlSummaryLines = `<p class="task-list-achieved-note"><strong>Timeline parsed: ${fileStr}</strong>${labelsStr}</p>`;
    }

    return `
        <details class="asset-manager-result-section" open>
            <summary class="asset-manager-result-summary">Video Assessment Tools &amp; Techniques</summary>
            <div class="asset-manager-result-body">
                <p class="task-list-achieved-note">Tick the media-production practices you have used and can demonstrate in your project evidence. Some are auto-detected from your GitHub repo.</p>
                <div class="task-list-decomposition-subtask-list">
                    ${ASSET_MANAGER_VIDEO_TOOLS_TECHNIQUES.map((tool) => {
                        const isTicked = tickedSet.has(tool.toLowerCase());
                        const isDetected = assetManagerDetectedVideoTools.has(tool.toLowerCase());
                        return `
                            <label class="task-list-decomposition-subtask ${isTicked ? "is-complete" : ""}">
                                <input type="checkbox" data-asset-manager-video-tool="${escapeAssetManagerHtml(tool)}" ${isTicked ? "checked" : ""} ${readOnly ? "disabled" : ""}>
                                <span>${escapeAssetManagerHtml(tool)}${isDetected ? " \u2713 auto" : ""}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
                <p class="task-list-achieved-note">${readOnly ? "Read-only: the student manages these from their Asset Manager or Task List." : "Saved to the hub database \u2014 shared with your Task List."}</p>
                ${fcpxmlSummaryLines}
            </div>
        </details>
    `;
}

function renderAssetManagerWebToolsPanel() {
    const tickedSet = new Set(assetManagerVideoToolsState.tools.map((tool) => String(tool || "").trim().toLowerCase()));
    const readOnly = !assetManagerPageContext.canEditTools;
    return `
        <details class="asset-manager-result-section" open>
            <summary class="asset-manager-result-summary">Web Assessment Tools &amp; Techniques</summary>
            <div class="asset-manager-result-body">
                <p class="task-list-achieved-note">Tick the web-production practices you have used and can demonstrate in your project evidence. Some are auto-detected from your GitHub repo.</p>
                <div class="task-list-decomposition-subtask-list">
                    ${ASSET_MANAGER_WEB_TOOLS_TECHNIQUES.map((tool) => {
                        const isTicked = tickedSet.has(tool.toLowerCase());
                        const isDetected = assetManagerDetectedWebTools.has(tool.toLowerCase());
                        return `
                            <label class="task-list-decomposition-subtask ${isTicked ? "is-complete" : ""}">
                                <input type="checkbox" data-asset-manager-web-tool="${escapeAssetManagerHtml(tool)}" ${isTicked ? "checked" : ""} ${readOnly ? "disabled" : ""}>
                                <span>${escapeAssetManagerHtml(tool)}${isDetected ? " \u2713 auto" : ""}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
                <p class="task-list-achieved-note">${readOnly ? "Read-only: the student manages these from their Asset Manager or Task List." : "Saved to the hub database \u2014 shared with your Task List."}</p>
            </div>
        </details>
    `;
}

function renderAssetManagerImageToolsPanel() {
    const tickedSet = new Set(assetManagerVideoToolsState.tools.map((tool) => String(tool || "").trim().toLowerCase()));
    const readOnly = !assetManagerPageContext.canEditTools;
    const psdSummaryLines = assetManagerPsdInfo.files && assetManagerPsdInfo.files.length
        ? assetManagerPsdInfo.files.map((item) => {
            const fileStr = escapeAssetManagerHtml(item.file);
            const layerCount = Number(item.layer_count || 0);
            const labelsStr = Array.isArray(item.labels) && item.labels.length
                ? ` \u2014 detected: ${escapeAssetManagerHtml(item.labels.join(", "))}`
                : " \u2014 no additional practices detected in this file.";
            return `<p class="task-list-achieved-note"><strong>Layers parsed: ${fileStr}</strong> (${layerCount} layer${layerCount === 1 ? "" : "s"})${labelsStr}</p>`;
        }).join("")
        : "";
    return `
        <details class="asset-manager-result-section" open>
            <summary class="asset-manager-result-summary">Image Assessment Tools &amp; Techniques</summary>
            <div class="asset-manager-result-body">
                <p class="task-list-achieved-note">Tick the image-production practices you have used and can demonstrate in your project evidence. Some are auto-detected from your GitHub repo.</p>
                <div class="task-list-decomposition-subtask-list">
                    ${ASSET_MANAGER_IMAGE_TOOLS_TECHNIQUES.map((tool) => {
                        const isTicked = tickedSet.has(tool.toLowerCase());
                        const isDetected = assetManagerDetectedImageTools.has(tool.toLowerCase());
                        return `
                            <label class="task-list-decomposition-subtask ${isTicked ? "is-complete" : ""}">
                                <input type="checkbox" data-asset-manager-image-tool="${escapeAssetManagerHtml(tool)}" ${isTicked ? "checked" : ""} ${readOnly ? "disabled" : ""}>
                                <span>${escapeAssetManagerHtml(tool)}${isDetected ? " \u2713 auto" : ""}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
                <p class="task-list-achieved-note">${readOnly ? "Read-only: the student manages these from their Asset Manager or Task List." : "Saved to the hub database \u2014 shared with your Task List."}</p>
                ${psdSummaryLines}
            </div>
        </details>
    `;
}

async function loadAssetManagerVideoTools() {
    if (!assetManagerPageContext.activityId || !assetManagerPageContext.studentEmail) return;
    try {
        const payload = await assetManagerLoadJson(
            `/api/students/digimed-efficient-tools?activity_id=${encodeURIComponent(assetManagerPageContext.activityId)}&student_email=${encodeURIComponent(assetManagerPageContext.studentEmail)}`,
            { headers: assetManagerHeaders({}) }
        );
        assetManagerVideoToolsState.tools = Array.isArray(payload?.tools) ? payload.tools : [];
        assetManagerVideoToolsState.updatedAt = String(payload?.updated_at || "").trim();
    } catch (_error) {
        assetManagerVideoToolsState.tools = [];
        assetManagerVideoToolsState.updatedAt = "";
    }
}

async function saveAssetManagerVideoTool(tool, isTicked) {
    const safeTool = String(tool || "").trim();
    if (!safeTool || !assetManagerPageContext.canEditTools) return;
    const next = new Set(assetManagerVideoToolsState.tools.map((value) => String(value || "").trim()).filter(Boolean));
    if (isTicked) {
        next.add(safeTool);
    } else {
        next.delete(safeTool);
    }
    assetManagerVideoToolsState.tools = Array.from(next);
    try {
        const payload = await assetManagerLoadJson("/api/students/digimed-efficient-tools", {
            method: "POST",
            headers: assetManagerHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ activity_id: assetManagerPageContext.activityId, tools: assetManagerVideoToolsState.tools })
        });
        assetManagerVideoToolsState.tools = Array.isArray(payload?.tools) ? payload.tools : assetManagerVideoToolsState.tools;
        assetManagerVideoToolsState.updatedAt = String(payload?.updated_at || "").trim();
    } catch (error) {
        setAssetManagerStatus(error?.message || "Could not save tools and techniques.", true);
    }
}

function renderAssetManagerContent(payload) {
    const host = document.querySelector("#asset-manager-content");
    if (!host) return;

    const counts = payload?.counts || {};
    const oversizedCount = Number(payload?.oversized_image_count || 0);
    const unusedCount = Number(payload?.unused_image_count || 0);
    const brokenCount = Number(payload?.broken_reference_count || 0);
    const isVideo = isAssetManagerVideoProject();
    const isImage = isAssetManagerImageProject();

    host.innerHTML = `
        <details class="asset-manager-web-details" open>
            <summary class="asset-manager-web-details-summary">${isVideo ? "VIDEO Details" : isImage ? "IMAGE Details" : "WEB Details"}</summary>
            <div class="asset-manager-web-details-body">
            ${isVideo ? renderVideoDetails(payload) : isImage ? renderImageDetails(payload) : `
        <div class="asset-manager-counts-grid">
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">HTML</span><span class="asset-manager-count-value">${Number(counts.html || 0)}</span></div>
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">CSS</span><span class="asset-manager-count-value">${Number(counts.css || 0)}</span></div>
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">JavaScript</span><span class="asset-manager-count-value">${Number(counts.javascript || 0)}</span></div>
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">Images</span><span class="asset-manager-count-value">${Number(counts.images || 0)}</span></div>
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">Media</span><span class="asset-manager-count-value">${Number(counts.media || 0)}</span></div>
            <div class="asset-manager-count-card"><span class="asset-manager-count-label">Total</span><span class="asset-manager-count-value">${escapeAssetManagerHtml(formatAssetManagerBytes(payload?.total_size_bytes))}</span></div>
        </div>
        <details class="asset-manager-result-section ${oversizedCount > 0 ? "is-warning" : "is-ok"}">
            <summary class="asset-manager-result-summary">${oversizedCount > 0 ? `Image Size: ${oversizedCount} image${oversizedCount === 1 ? "" : "s"} &gt;500 KB` : "Image Size: No oversized images"}</summary>
        </details>
        <details class="asset-manager-result-section ${unusedCount > 0 ? "is-warning" : "is-ok"}">
            <summary class="asset-manager-result-summary">${unusedCount > 0 ? `Unused images: ${unusedCount}` : "Unused images: None"}</summary>
            ${unusedCount > 0 ? `<div class="asset-manager-result-body"><ul class="asset-manager-check-list">${(payload?.unused_images || []).map((path) => `<li>${escapeAssetManagerHtml(path)}</li>`).join("")}</ul></div>` : ""}
        </details>
        <details class="asset-manager-result-section ${brokenCount > 0 ? "is-warning" : "is-ok"}">
            <summary class="asset-manager-result-summary">${brokenCount > 0 ? `Broken Asset References: ${brokenCount}` : "No broken asset references"}</summary>
            ${brokenCount > 0 ? `<div class="asset-manager-result-body"><ul class="asset-manager-check-list">${(payload?.broken_references || []).map((row) => `<li>${escapeAssetManagerHtml(row.from)} &rarr; ${escapeAssetManagerHtml(row.reference)}</li>`).join("")}</ul></div>` : ""}
        </details>
        <details class="asset-manager-result-section"><summary class="asset-manager-result-summary">HTML Details</summary><div class="asset-manager-result-body">${renderHtmlDetails({ ...payload?.html_details, total_pages: counts.html })}</div></details>
        <details class="asset-manager-result-section"><summary class="asset-manager-result-summary">CSS Details</summary><div class="asset-manager-result-body">${renderCssDetails({ ...payload?.css_details, stylesheets: counts.css })}</div></details>
        <details class="asset-manager-result-section"><summary class="asset-manager-result-summary">JavaScript Details</summary><div class="asset-manager-result-body">${renderJavascriptDetails({ ...payload?.javascript_details, total_files: counts.javascript })}</div></details>
            `}
            ${isVideo ? renderAssetManagerVideoToolsPanel() : isImage ? renderAssetManagerImageToolsPanel() : renderAssetManagerWebToolsPanel()}
            </div>
        </details>
    `;
}

async function runAssetManagerSync(repoUrl) {
    setAssetManagerStatus("Checking asset health from GitHub\u2026");
    const payload = await assetManagerLoadJson(
        `/api/integrations/github/asset-health?repo_url=${encodeURIComponent(repoUrl)}`,
        { headers: assetManagerHeaders({}) }
    );
    await applyDetectedVideoToolsFromAssetHealth(payload);
    renderAssetManagerContent(payload);
    setAssetManagerStatus(`Checked ${Number(payload?.scanned_file_count || 0)} file(s) for references.`);
    return payload;
}

// Merge the reliably auto-detected practices into the DB record so the panel
// and the shared Task List reflect them without the student ticking manually.
async function applyDetectedVideoToolsFromAssetHealth(payload) {
    assetManagerDetectedVideoTools.clear();
    assetManagerDetectedWebTools.clear();
    assetManagerDetectedImageTools.clear();
    assetManagerFcpxmlInfo.file = String(payload?.fcpxml_detected?.file || "").trim();
    assetManagerFcpxmlInfo.labels = Array.isArray(payload?.fcpxml_detected?.labels) ? payload.fcpxml_detected.labels : [];
    assetManagerFcpxmlInfo.files = Array.isArray(payload?.fcpxml_detected?.files) ? payload.fcpxml_detected.files : [];
    assetManagerPsdInfo.file = String(payload?.psd_detected?.file || "").trim();
    assetManagerPsdInfo.labels = Array.isArray(payload?.psd_detected?.labels) ? payload.psd_detected.labels : [];
    assetManagerPsdInfo.files = Array.isArray(payload?.psd_detected?.files) ? payload.psd_detected.files : [];

    const isVideo = isAssetManagerVideoProject();
    const isImage = isAssetManagerImageProject();
    const categoriesSource = isVideo
        ? (Array.isArray(payload?.video_tools_categories) ? payload.video_tools_categories : [])
        : isImage
            ? (Array.isArray(payload?.image_tools_categories) ? payload.image_tools_categories : [])
            : (Array.isArray(payload?.web_tools_categories) ? payload.web_tools_categories : (Array.isArray(payload?.categories) ? payload.categories : []));
    const toolsList = isVideo
        ? ASSET_MANAGER_VIDEO_TOOLS_TECHNIQUES
        : isImage
            ? ASSET_MANAGER_IMAGE_TOOLS_TECHNIQUES
            : ASSET_MANAGER_WEB_TOOLS_TECHNIQUES;
    const targetDetectedSet = isVideo
        ? assetManagerDetectedVideoTools
        : isImage
            ? assetManagerDetectedImageTools
            : assetManagerDetectedWebTools;

    const detected = categoriesSource
        .filter((category) => category?.done)
        .map((category) => String(category?.label || "").trim())
        .filter(Boolean);
    if (!detected.length) return;
    detected.forEach((label) => targetDetectedSet.add(label.toLowerCase()));

    const merged = new Set(assetManagerVideoToolsState.tools.map((value) => String(value || "").trim()).filter(Boolean));
    let added = false;
    detected.forEach((label) => {
        const canonical = toolsList.find((tool) => tool.toLowerCase() === label.toLowerCase()) || label;
        if (!Array.from(merged).some((existing) => existing.toLowerCase() === canonical.toLowerCase())) {
            merged.add(canonical);
            added = true;
        }
    });
    assetManagerVideoToolsState.tools = Array.from(merged);
    if (added && assetManagerPageContext.canEditTools) {
        try {
            const saved = await assetManagerLoadJson("/api/students/digimed-efficient-tools", {
                method: "POST",
                headers: assetManagerHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ activity_id: assetManagerPageContext.activityId, tools: assetManagerVideoToolsState.tools })
            });
            assetManagerVideoToolsState.tools = Array.isArray(saved?.tools) ? saved.tools : assetManagerVideoToolsState.tools;
        } catch (_error) {
        }
    }
}

async function initAssetManagerPage() {
    const email = assetManagerGetEmail();
    if (!email) {
        setAssetManagerStatus("Sign in with your school account to view Asset Manager.", true);
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const activityId = String(params.get("id") || "").trim();
    const studentEmail = String(params.get("studentEmail") || "").trim().toLowerCase() || email;
    assetManagerPageContext.activityId = activityId;
    assetManagerPageContext.studentEmail = studentEmail;
    assetManagerPageContext.canEditTools = studentEmail === email;

    if (!activityId) {
        setAssetManagerStatus("No task was specified. Open Asset Manager from a Task List or Student Work page.", true);
        return;
    }

    const repoNote = document.querySelector("#asset-manager-repo-note");
    if (studentEmail !== email && repoNote) {
        repoNote.textContent = `Viewing asset health for ${studentEmail}.`;
    }

    setAssetManagerStatus("Loading linked GitHub repository\u2026");

    let repoUrl = "";
    try {
        const evidencePayload = await assetManagerLoadJson(
            `/api/activities/${encodeURIComponent(activityId)}/interests/${encodeURIComponent(studentEmail)}/evidence`,
            { headers: assetManagerHeaders({}) }
        );
        assetManagerAllocation = evidencePayload || {};
        renderAssetManagerStudentDetails(evidencePayload);
        repoUrl = findGithubRepoUrlFromEvidenceSteps(evidencePayload?.evidence_steps);
        await loadAssetManagerVideoTools();
    } catch (error) {
        setAssetManagerStatus(error?.message || "Could not load this student's evidence.", true);
        return;
    }

    if (!repoUrl) {
        setAssetManagerStatus("No public GitHub repository has been linked yet. Save one on the Version Control: GitHub page first.", true);
        return;
    }

    if (repoNote) {
        repoNote.textContent = `${repoNote.textContent ? `${repoNote.textContent} ` : ""}Repository: ${repoUrl}`.trim();
    }

    try {
        await runAssetManagerSync(repoUrl);
    } catch (error) {
        setAssetManagerStatus(error?.message || "Could not check asset health from GitHub.", true);
    }

    document.querySelector("#asset-manager-sync-btn")?.addEventListener("click", async () => {
        const btn = document.querySelector("#asset-manager-sync-btn");
        if (btn) { btn.disabled = true; btn.textContent = "Syncing\u2026"; }
        try {
            await runAssetManagerSync(repoUrl);
        } catch (error) {
            setAssetManagerStatus(error?.message || "Could not check asset health from GitHub.", true);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "\u21bb Sync from GitHub"; }
        }
    });

    document.addEventListener("change", (event) => {
        const checkbox = event.target?.closest?.("[data-asset-manager-video-tool], [data-asset-manager-web-tool], [data-asset-manager-image-tool]");
        if (!checkbox) return;
        const tool = String(checkbox.getAttribute("data-asset-manager-video-tool") || checkbox.getAttribute("data-asset-manager-web-tool") || checkbox.getAttribute("data-asset-manager-image-tool") || "").trim();
        if (!tool || !assetManagerPageContext.canEditTools) return;
        checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
        void saveAssetManagerVideoTool(tool, Boolean(checkbox.checked));
    });
}

document.addEventListener("DOMContentLoaded", () => {
    void initAssetManagerPage();
});
