(() => {
const AUTH_KEY = "hub_google_auth_v1";

const inputField = document.getElementById("hapara-input");
const fileInput = document.getElementById("hapara-file");
const previewButton = document.getElementById("hapara-preview-button");
const uploadButton = document.getElementById("hapara-upload-button");
const reloadButton = document.getElementById("hapara-reload-button");
const statusElement = document.getElementById("hapara-status");
const previewMeta = document.getElementById("hapara-preview-meta");
const tableBody = document.getElementById("hapara-table-body");

let previewRows = [];

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
}

function getStoredAuthState() {
    const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
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
            email: normalizeEmail(parsed?.profile?.email || ""),
            accessToken: String(parsed?.idToken || parsed?.accessToken || "").trim()
        };
    } catch (_error) {
        return { email: "", accessToken: "" };
    }
}

function withAdminHeaders(headers = {}) {
    const { email, accessToken } = getStoredAuthState();
    if (!email) {
        return headers;
    }

    const next = {
        ...headers,
        "x-user-email": email
    };

    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        next.Authorization = `Bearer ${accessToken}`;
    }

    return next;
}

async function enforceAdminAccess() {
    const { email } = getStoredAuthState();
    if (!email) {
        setStatus("Sign in with Google (top-right) to use this page.", true);
        return false;
    }

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
            headers: withAdminHeaders({})
        });

        if (!response.ok) {
            setStatus("Could not verify admin access right now.", true);
            return false;
        }

        const access = await response.json();
        if (!access?.can_admin) {
            setStatus("Your account does not currently have admin access for this page.", true);
            return false;
        }

        return true;
    } catch (_error) {
        setStatus("Could not verify admin access. Check your connection and try again.", true);
        return false;
    }
}

function setStatus(message, isError = false, isSuccess = false) {
    if (!statusElement) return;
    statusElement.textContent = String(message || "");
    statusElement.classList.remove("is-error", "is-success");
    if (isError) statusElement.classList.add("is-error");
    if (isSuccess) statusElement.classList.add("is-success");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function splitCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            const nextChar = line[index + 1];
            if (inQuotes && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function parseInputRows(rawText) {
    const lines = String(rawText || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        return [];
    }

    const firstColumns = splitCsvLine(lines[0]).map((value) => String(value || "").trim().toLowerCase());
    const hasHeader = firstColumns.includes("student_email") || firstColumns.includes("email");

    const indexes = {
        email: hasHeader ? firstColumns.findIndex((key) => ["student_email", "email", "studentemail", "student email - school", "student email", "school email"].includes(key)) : 0,
        folderUrl: hasHeader ? firstColumns.findIndex((key) => ["folder_url", "folderurl", "folder", "folder_id", "folderid"].includes(key)) : 1,
        primaryFolder: hasHeader ? firstColumns.findIndex((key) => ["primary hapara", "primary_hapara", "hapara primary", "primary folder"].includes(key)) : -1,
        secondaryFolder: hasHeader ? firstColumns.findIndex((key) => ["secondary hapara", "secondary_hapara", "hapara secondary", "secondary folder"].includes(key)) : -1,
        classLabel: hasHeader ? firstColumns.findIndex((key) => ["class_label", "classlabel", "class", "group", "timetable class", "timetable_class"].includes(key)) : 2,
        notes: hasHeader ? firstColumns.findIndex((key) => ["notes", "note", "last name", "first name"].includes(key)) : 3
    };

    const startIndex = hasHeader ? 1 : 0;
    const rows = [];

    for (let index = startIndex; index < lines.length; index += 1) {
        const columns = splitCsvLine(lines[index]);
        const email = normalizeEmail(indexes.email >= 0 ? columns[indexes.email] : "");
        const primaryFolderValue = String(indexes.primaryFolder >= 0 ? columns[indexes.primaryFolder] : "").trim();
        const secondaryFolderValue = String(indexes.secondaryFolder >= 0 ? columns[indexes.secondaryFolder] : "").trim();
        const folderValue = String(indexes.folderUrl >= 0 ? columns[indexes.folderUrl] : "").trim()
            || primaryFolderValue
            || secondaryFolderValue;
        const classLabel = String(indexes.classLabel >= 0 ? columns[indexes.classLabel] : "").trim();
        const notes = String(indexes.notes >= 0 ? columns[indexes.notes] : "").trim();

        if (!email && !folderValue) {
            continue;
        }

        rows.push({
            student_email: email,
            folder_url: folderValue,
            class_label: classLabel,
            notes
        });
    }

    return rows;
}

function renderRows(rows, mode = "saved") {
    if (!tableBody) return;

    const source = Array.isArray(rows) ? rows : [];
    if (!source.length) {
        tableBody.innerHTML = '<tr><td class="hapara-empty" colspan="6">No rows loaded yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = source.map((row) => {
        const email = String(row?.student_email || "").trim();
        const folderUrl = String(row?.folder_url || "").trim();
        const folderId = String(row?.folder_id || "").trim();
        const classLabel = String(row?.class_label || "").trim();
        const notes = String(row?.notes || "").trim();
        const folderCell = folderUrl
            ? (isHttpUrl(folderUrl)
                ? `<a class="hapara-link" href="${escapeHtml(folderUrl)}" target="_blank" rel="noreferrer">${escapeHtml(folderUrl)}</a>`
                : `<span>${escapeHtml(folderUrl)}</span>`)
            : '<span class="hapara-empty">Missing</span>';
        const deleteCell = mode === "saved" && email
            ? `<button type="button" class="hapara-delete" data-delete-email="${escapeHtml(email)}">Delete</button>`
            : '<span class="hapara-empty">-</span>';

        return `
            <tr>
                <td>${email ? escapeHtml(email) : '<span class="hapara-empty">Missing</span>'}</td>
                <td>${folderId ? escapeHtml(folderId) : '<span class="hapara-empty">Auto on save</span>'}</td>
                <td>${folderCell}</td>
                <td>${classLabel ? escapeHtml(classLabel) : '<span class="hapara-empty">-</span>'}</td>
                <td>${notes ? escapeHtml(notes) : '<span class="hapara-empty">-</span>'}</td>
                <td>${deleteCell}</td>
            </tr>
        `;
    }).join("");
}

function renderPreview(rows) {
    previewRows = Array.isArray(rows) ? rows : [];
    const validCount = previewRows.filter((row) => row.student_email && row.folder_url).length;
    const invalidCount = previewRows.length - validCount;
    previewMeta.textContent = `Preview: ${previewRows.length} row(s) parsed — ${validCount} ready to upload${invalidCount ? `, ${invalidCount} missing email or folder` : ""}. Saved mappings table will update after upload.`;
    renderRows(previewRows, "preview");
}

async function loadSavedMappings() {
    const accessOk = await enforceAdminAccess();
    if (!accessOk) return;

    try {
        const response = await fetch("/api/admin/hapara-folders", {
            headers: withAdminHeaders({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }

        const rows = Array.isArray(payload?.folders) ? payload.folders : [];
        previewMeta.textContent = `Saved mappings: ${rows.length}.`;
        renderRows(rows, "saved");
        setStatus("Loaded saved mappings.", false, true);
    } catch (error) {
        setStatus(`Could not load mappings: ${error.message || "Unknown error"}`, true);
    }
}

async function uploadMappings() {
    const accessOk = await enforceAdminAccess();
    if (!accessOk) return;

    const rows = Array.isArray(previewRows) && previewRows.length
        ? previewRows
        : parseInputRows(inputField?.value || "");

    if (!rows.length) {
        setStatus("Add rows first, then click Upload Mappings.", true);
        return;
    }

    uploadButton.disabled = true;
    setStatus("Uploading mappings...");

    try {
        const response = await fetch("/api/admin/hapara-folders/bulk", {
            method: "POST",
            headers: withAdminHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ rows })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }

        const upserted = Number(payload?.upserted || 0);
        const skipped = Number(payload?.skipped || 0);
        setStatus(`Upload complete. Upserted: ${upserted}. Skipped: ${skipped}.`, false, true);
        await loadSavedMappings();
    } catch (error) {
        setStatus(`Upload failed: ${error.message || "Unknown error"}`, true);
    } finally {
        uploadButton.disabled = false;
    }
}

async function deleteMapping(email) {
    const studentEmail = normalizeEmail(email);
    if (!studentEmail) return;

    const confirmed = window.confirm(`Delete mapping for ${studentEmail}?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/admin/hapara-folders/${encodeURIComponent(studentEmail)}`, {
            method: "DELETE",
            headers: withAdminHeaders({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }

        setStatus(`Deleted mapping for ${studentEmail}.`, false, true);
        await loadSavedMappings();
    } catch (error) {
        setStatus(`Delete failed: ${error.message || "Unknown error"}`, true);
    }
}

previewButton?.addEventListener("click", () => {
    const rows = parseInputRows(inputField?.value || "");
    if (!rows.length) {
        setStatus("No valid rows found to preview. Check your CSV format.", true);
        previewRows = [];
        previewMeta.textContent = "No rows parsed. Saved mappings table unchanged.";
        return;
    }

    renderPreview(rows);
    setStatus(`${rows.length} row(s) parsed and ready. Click Upload Mappings to save.`, false, true);
});

uploadButton?.addEventListener("click", () => {
    void uploadMappings();
});

reloadButton?.addEventListener("click", () => {
    void loadSavedMappings();
});

fileInput?.addEventListener("change", async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        if (inputField) {
            inputField.value = text;
        }
        const rows = parseInputRows(text);
        renderPreview(rows);
        setStatus(`Loaded ${rows.length} row(s) from ${file.name}.`, false, true);
    } catch (error) {
        setStatus(`Could not read file: ${error.message || "Unknown error"}`, true);
    }
});

tableBody?.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-delete-email]");
    if (!target) return;
    const email = target.getAttribute("data-delete-email") || "";
    void deleteMapping(email);
});

void loadSavedMappings();
})();
