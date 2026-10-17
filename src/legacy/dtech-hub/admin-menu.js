(() => {
const REPAIR_BUTTON = document.querySelector("#admin-repair-activity-categories");
const REPAIR_STATUS = document.querySelector("#admin-repair-status");
const ADMIN_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function getStoredAuthRaw() {
    let localValue = null;
    let sessionValue = null;

    try {
        localValue = localStorage.getItem(ADMIN_HUB_AUTH_STORAGE_KEY);
    } catch (_error) {
        localValue = null;
    }

    try {
        sessionValue = sessionStorage.getItem(ADMIN_HUB_AUTH_STORAGE_KEY);
    } catch (_error) {
        sessionValue = null;
    }

    return localValue || sessionValue;
}

function getActiveHubEmail() {
    const raw = getStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        return normalizeEmail(parsed?.profile?.email || "");
    } catch (_error) {
        return "";
    }
}

function getActiveHubAccessToken() {
    const raw = getStoredAuthRaw();
    if (!raw) {
        return "";
    }

    try {
        const parsed = JSON.parse(raw);
        const expiresAt = Number(parsed?.expiresAt || 0);
        if (expiresAt <= Date.now()) {
            return "";
        }
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function withAdminAuthHeaders(headers = {}) {
    const email = getActiveHubEmail();
    if (!email) {
        return headers;
    }

    const nextHeaders = {
        ...headers,
        "x-user-email": email
    };

    const accessToken = getActiveHubAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function setRepairStatus(message, isError = false) {
    if (!REPAIR_STATUS) return;

    if (!message) {
        REPAIR_STATUS.hidden = true;
        REPAIR_STATUS.textContent = "";
        REPAIR_STATUS.classList.remove("is-success", "is-error");
        return;
    }

    REPAIR_STATUS.hidden = false;
    REPAIR_STATUS.textContent = message;
    REPAIR_STATUS.classList.remove("is-success", "is-error");
    REPAIR_STATUS.classList.add(isError ? "is-error" : "is-success");
}

async function runCategoryRepair() {
    const email = getActiveHubEmail();
    if (!email) {
        setRepairStatus("Sign in with your school account first.", true);
        return;
    }

    const confirmed = window.confirm(
        "Run one-time category repair now? This will rewrite legacy activity_category and card_color values in the database."
    );
    if (!confirmed) {
        return;
    }

    const secondConfirm = window.prompt("Type REPAIR_ACTIVITY_CATEGORIES to confirm:", "");
    if (secondConfirm !== "REPAIR_ACTIVITY_CATEGORIES") {
        setRepairStatus("Repair cancelled. Confirmation token did not match.", true);
        return;
    }

    if (REPAIR_BUTTON) {
        REPAIR_BUTTON.disabled = true;
    }
    setRepairStatus("Running repair...");

    try {
        const response = await fetch("/api/admin/maintenance/repair-activity-categories", {
            method: "POST",
            headers: withAdminAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                confirm: "REPAIR_ACTIVITY_CATEGORIES"
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.detail || result.error || result.message || `HTTP ${response.status}`);
        }

        const scanned = Number(result.scanned || 0);
        const repaired = Number(result.repaired || 0);
        const unchanged = Number(result.unchanged || 0);
        setRepairStatus(`Repair complete. Scanned: ${scanned}. Repaired: ${repaired}. Unchanged: ${unchanged}.`);
    } catch (error) {
        setRepairStatus(`Repair failed: ${error.message || "Unknown error"}`, true);
    } finally {
        if (REPAIR_BUTTON) {
            REPAIR_BUTTON.disabled = false;
        }
    }
}

if (REPAIR_BUTTON) {
    REPAIR_BUTTON.addEventListener("click", () => {
        void runCategoryRepair();
    });
}
})();
