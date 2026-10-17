(() => {
    const AUTH_KEY = "hub_google_auth_v1";

    const addInput = document.getElementById("ttk-add-input");
    const addButton = document.getElementById("ttk-add-button");
    const addStatus = document.getElementById("ttk-add-status");
    const listStatus = document.getElementById("ttk-list-status");
    const countLabel = document.getElementById("ttk-count");
    const tableBody = document.getElementById("ttk-table-body");

    function getStoredAuthState() {
        const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
        if (!raw) return { email: "", accessToken: "" };
        try {
            const parsed = JSON.parse(raw);
            const expiresAt = Number(parsed?.expiresAt || 0);
            if (expiresAt <= Date.now()) return { email: "", accessToken: "" };
            return {
                email: String(parsed?.profile?.email || "").trim().toLowerCase(),
                accessToken: String(parsed?.idToken || parsed?.accessToken || "").trim()
            };
        } catch (_error) {
            return { email: "", accessToken: "" };
        }
    }

    function buildHeaders(extra = {}) {
        const { email, accessToken } = getStoredAuthState();
        const headers = { ...extra };
        if (email) headers["x-user-email"] = email;
        if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
            headers.Authorization = `Bearer ${accessToken}`;
        }
        return headers;
    }

    function setStatus(node, message, isError = false) {
        if (!node) return;
        node.textContent = String(message || "");
        node.classList.toggle("is-error", Boolean(isError));
        node.classList.toggle("is-success", !isError && Boolean(message));
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDate(value) {
        const parsed = new Date(String(value || ""));
        if (Number.isNaN(parsed.getTime())) return "-";
        return parsed.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function renderRows(rows) {
        if (!tableBody) return;
        if (!rows.length) {
            tableBody.innerHTML = `<tr><td class="ttk-empty" colspan="6">No keywords in the index yet.</td></tr>`;
            if (countLabel) countLabel.textContent = "";
            return;
        }

        if (countLabel) countLabel.textContent = `(${rows.length})`;
        tableBody.innerHTML = rows.map((row) => `
            <tr data-keyword-id="${escapeHtml(row.id)}">
                <td>${escapeHtml(row.keyword)}</td>
                <td><span class="ttk-source-pill ${row.source === "manual" ? "manual" : "auto"}">${escapeHtml(row.source || "auto")}</span></td>
                <td>${escapeHtml(row.added_by_email || "-")}</td>
                <td>${Number(row.use_count || 0)}</td>
                <td>${formatDate(row.created_at)}</td>
                <td><button type="button" class="ttk-delete" data-delete-id="${escapeHtml(row.id)}">Delete</button></td>
            </tr>
        `).join("");
    }

    async function loadKeywords() {
        setStatus(listStatus, "Loading keyword index...");
        try {
            const response = await fetch("/api/tools-techniques-keywords", { headers: buildHeaders() });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Could not load the keyword index.");
            }
            const rows = Array.isArray(payload?.keywords) ? payload.keywords : [];
            rows.sort((a, b) => Number(b.use_count || 0) - Number(a.use_count || 0));
            renderRows(rows);
            setStatus(listStatus, "");
        } catch (error) {
            setStatus(listStatus, error?.message || "Could not load the keyword index.", true);
        }
    }

    addButton?.addEventListener("click", async () => {
        const keyword = String(addInput?.value || "").trim();
        if (!keyword) {
            setStatus(addStatus, "Enter a keyword first.", true);
            return;
        }

        addButton.disabled = true;
        setStatus(addStatus, "Adding keyword...");
        try {
            const response = await fetch("/api/tools-techniques-keywords", {
                method: "POST",
                headers: buildHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ keywords: [keyword], source: "manual" })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Could not add that keyword.");
            }
            if (addInput) addInput.value = "";
            setStatus(addStatus, `"${keyword}" added to the index.`);
            await loadKeywords();
        } catch (error) {
            setStatus(addStatus, error?.message || "Could not add that keyword.", true);
        } finally {
            addButton.disabled = false;
        }
    });

    addInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addButton?.click();
        }
    });

    tableBody?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-delete-id]");
        if (!button) return;

        const id = button.getAttribute("data-delete-id");
        const row = button.closest("tr");
        const keywordText = row?.querySelector("td")?.textContent || "this keyword";
        if (!window.confirm(`Remove "${keywordText}" from the Tools & Techniques index?`)) return;

        button.disabled = true;
        try {
            const response = await fetch(`/api/tools-techniques-keywords/${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: buildHeaders()
            });
            if (!response.ok && response.status !== 204) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || "Could not remove that keyword.");
            }
            row?.remove();
        } catch (error) {
            setStatus(listStatus, error?.message || "Could not remove that keyword.", true);
            button.disabled = false;
        }
    });

    void loadKeywords();
})();
