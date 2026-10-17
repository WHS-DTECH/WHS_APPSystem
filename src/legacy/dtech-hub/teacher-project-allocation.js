const ALLOC_AUTH_KEY = "hub_google_auth_v1";

function allocGetStoredEmail() {
    const raw = localStorage.getItem(ALLOC_AUTH_KEY) || sessionStorage.getItem(ALLOC_AUTH_KEY);
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_e) {
        return "";
    }
}

function allocGetStoredAccessToken() {
    const raw = localStorage.getItem(ALLOC_AUTH_KEY) || sessionStorage.getItem(ALLOC_AUTH_KEY);
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_e) {
        return "";
    }
}

function allocWithAuthHeaders(headers = {}, email = allocGetStoredEmail()) {
    if (!email) {
        return headers;
    }

    const nextHeaders = { ...headers, "x-user-email": email };
    const accessToken = allocGetStoredAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

async function allocEnforceAccess() {
    const email = allocGetStoredEmail();
    if (!email) {
        window.location.replace("teacher-view.html");
        return false;
    }
    try {
        const resp = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
        if (!resp.ok) {
            window.location.replace("teacher-view.html");
            return false;
        }
        const access = await resp.json();
        if (!access?.can_teacher_view) {
            window.location.replace("teacher-view.html");
            return false;
        }
        return true;
    } catch (_e) {
        window.location.replace("teacher-view.html");
        return false;
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
    if (!isoString) return "";
    try {
        return new Date(isoString).toLocaleDateString("en-NZ", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    } catch (_e) {
        return isoString;
    }
}

function setAllocStatus(message, isError = false) {
    const el = document.getElementById("alloc-status");
    if (!el) return;
    el.textContent = message;
    el.className = isError ? "alloc-status is-error" : "alloc-status";
}

function isProjectRecord(record) {
    const title = String(record?.name || record?.title || "").trim().toLowerCase();
    if (title.includes("tinkercad")) {
        return false;
    }

    const category = String(record?.activity_category || record?.activityCategory || "").trim().toLowerCase();
    if (category.includes("assessment")) {
        return false;
    }

    const hasProposalFields = Boolean(
        record?.start_date ||
        record?.startDate ||
        record?.contact_name ||
        record?.contactName ||
        record?.company ||
        record?.address ||
        record?.overview ||
        record?.services ||
        record?.costs ||
        record?.outcomes ||
        record?.client_id ||
        record?.clientId
    );

    return hasProposalFields || category.includes("project");
}

function normalizeProjectRecord(record) {
    return {
        project_id: String(record?.id || "").trim(),
        project_name: String(record?.name || record?.title || "Untitled Project").trim(),
        client_name: String(record?.company || record?.contact_name || "").trim(),
        start_date: String(record?.start_date || record?.startDate || "").trim(),
        detail_url: `ProjectPages/custom-activity.html?id=${encodeURIComponent(String(record?.id || "").trim())}`
    };
}

function buildStudentRows(project) {
    if (!project.students.length) {
        return `
            <tr>
                <td class="alloc-empty-row" colspan="4">No students are interested yet.</td>
            </tr>
        `;
    }

    return project.students.map((student) => buildStudentRow(student)).join("");
}

function buildProjectBlock(project, email) {
    const block = document.createElement("div");
    block.className = "alloc-project-block";
    block.dataset.projectId = project.project_id;

    const confirmedCount = project.confirmed_count || 0;
    const totalCount = project.interest_count || 0;
    const clientName = project.client_name || "Not specified";
    const startDate = project.start_date ? formatDate(project.start_date) : "Not specified";

    block.innerHTML = `
        <header class="alloc-project-header">
            <div>
                <h2 class="alloc-project-title">${escapeHtml(project.project_name)}</h2>
                <a class="alloc-project-link" href="${escapeHtml(project.detail_url)}">View Project &rarr;</a>
                <div class="alloc-project-details">
                    <span><strong>Client:</strong> ${escapeHtml(clientName)}</span>
                    <span><strong>EST Start Date:</strong> ${escapeHtml(startDate)}</span>
                </div>
            </div>
            <div class="alloc-meta">
                <span><strong>${totalCount}</strong> interested</span>
                <span><strong>${confirmedCount}</strong> confirmed</span>
            </div>
        </header>
        <div class="alloc-table-wrap">
            <table class="alloc-table">
                <thead>
                    <tr>
                        <th>Student Email</th>
                        <th>Registered</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${buildStudentRows(project)}
                </tbody>
            </table>
        </div>
    `;

    // Attach action button handlers
    block.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => handleAllocationAction(btn, project.project_id, email));
    });

    return block;
}

function buildStudentRow(student) {
    const isConfirmed = Boolean(student.confirmed);
    const dateStr = formatDate(student.created_at);
    const statusBadge = isConfirmed
        ? `<span class="alloc-status-badge badge-confirmed">Confirmed</span>`
        : `<span class="alloc-status-badge badge-pending">Pending</span>`;
    const confirmBtnClass = isConfirmed ? "alloc-btn alloc-btn-unconfirm" : "alloc-btn alloc-btn-confirm";
    const confirmBtnText = isConfirmed ? "Unconfirm" : "Confirm";

    return `
        <tr data-student="${escapeHtml(student.email)}">
            <td>${escapeHtml(student.email)}</td>
            <td class="alloc-date">${escapeHtml(dateStr)}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="alloc-btn-group">
                    <button type="button" class="${confirmBtnClass}" data-action="confirm" data-confirmed="${isConfirmed}">${escapeHtml(confirmBtnText)}</button>
                    <button type="button" class="alloc-btn alloc-btn-remove" data-action="remove">Remove</button>
                </div>
            </td>
        </tr>
    `;
}

async function handleAllocationAction(btn, projectId, email) {
    const row = btn.closest("tr[data-student]");
    if (!row) return;
    const studentEmail = row.getAttribute("data-student");
    const action = btn.getAttribute("data-action");

    btn.disabled = true;
    const headers = allocWithAuthHeaders({ "Content-Type": "application/json" }, email);

    try {
        if (action === "confirm") {
            const currentlyConfirmed = btn.getAttribute("data-confirmed") === "true";
            const newConfirmed = !currentlyConfirmed;
            const resp = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/confirm`,
                { method: "PATCH", headers, body: JSON.stringify({ confirmed: newConfirmed }) }
            );
            if (resp.ok) {
                btn.setAttribute("data-confirmed", String(newConfirmed));
                btn.textContent = newConfirmed ? "Unconfirm" : "Confirm";
                btn.className = newConfirmed ? "alloc-btn alloc-btn-unconfirm" : "alloc-btn alloc-btn-confirm";
                const statusCell = row.querySelector(".alloc-status-badge");
                if (statusCell) {
                    statusCell.textContent = newConfirmed ? "Confirmed" : "Pending";
                    statusCell.className = newConfirmed ? "alloc-status-badge badge-confirmed" : "alloc-status-badge badge-pending";
                }
                // Update header counts
                updateProjectBlockCounts(btn.closest(".alloc-project-block"));
            }
        } else if (action === "remove") {
            if (!window.confirm(`Remove ${studentEmail} from this project's interest list?`)) {
                btn.disabled = false;
                return;
            }
            const resp = await fetch(
                `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}`,
                { method: "DELETE", headers }
            );
            if (resp.ok) {
                row.remove();
                updateProjectBlockCounts(btn.closest(".alloc-project-block"));
            }
        }
    } catch (_err) {
        setAllocStatus("An error occurred. Please try again.", true);
    }

    if (btn.isConnected) btn.disabled = false;
}

function updateProjectBlockCounts(block) {
    if (!block) return;
    const rows = block.querySelectorAll("tbody tr[data-student]");
    const confirmedRows = block.querySelectorAll("tbody tr[data-student] .badge-confirmed");
    const metaEl = block.querySelector(".alloc-meta");
    if (metaEl) {
        metaEl.innerHTML = `
            <span><strong>${rows.length}</strong> interested</span>
            <span><strong>${confirmedRows.length}</strong> confirmed</span>
        `;
    }
}

async function loadAllocations() {
    const email = allocGetStoredEmail();
    const content = document.getElementById("alloc-content");
    if (!content) return;

    setAllocStatus("Loading…");
    content.innerHTML = `<p class="alloc-empty">Loading project allocations&hellip;</p>`;

    try {
        const [activitiesResponse, interestsResponse] = await Promise.all([
            fetch("/api/activities"),
            fetch("/api/project-interests", { headers: allocWithAuthHeaders({}, email) })
        ]);

        if (!activitiesResponse.ok) {
            throw new Error("Could not load activities");
        }

        if (!interestsResponse.ok) {
            throw new Error("Could not load project interests");
        }

        const activities = await activitiesResponse.json();
        const interestProjects = await interestsResponse.json();
        const interestByProjectId = new Map(
            (Array.isArray(interestProjects) ? interestProjects : []).map((project) => [String(project.project_id || "").trim(), project])
        );

        const projects = (Array.isArray(activities) ? activities : [])
            .filter((record) => isProjectRecord(record))
            .map((record) => {
                const normalized = normalizeProjectRecord(record);
                const interest = interestByProjectId.get(normalized.project_id) || {};
                return {
                    ...normalized,
                    interest_count: Number(interest.interest_count || 0),
                    confirmed_count: Number(interest.confirmed_count || 0),
                    students: Array.isArray(interest.students)
                        ? interest.students.map((student) => ({
                            email: String(student.email || student.student_email || "").trim(),
                            confirmed: Boolean(student.confirmed),
                            created_at: student.created_at || ""
                        })).filter((student) => student.email)
                        : []
                };
            })
            .sort((left, right) => {
                const leftDate = left.start_date || "9999-12-31";
                const rightDate = right.start_date || "9999-12-31";
                if (leftDate !== rightDate) {
                    return leftDate.localeCompare(rightDate);
                }
                return left.project_name.localeCompare(right.project_name);
            });

        setAllocStatus("");

        if (!Array.isArray(projects) || projects.length === 0) {
            content.innerHTML = `<p class="alloc-empty">No project records were found.</p>`;
            return;
        }

        content.innerHTML = "";
        for (const project of projects) {
            content.appendChild(buildProjectBlock(project, email));
        }
    } catch (error) {
        setAllocStatus(error.message || "Could not load allocations.", true);
        content.innerHTML = `<p class="alloc-empty">Could not load project allocations. Please refresh.</p>`;
    }
}

async function init() {
    const allowed = await allocEnforceAccess();
    if (!allowed) return;
    await loadAllocations();
}

init();
