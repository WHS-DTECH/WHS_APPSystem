const WINDOW_OPTIONS = new Set([7, 14, 30]);

const form = document.querySelector("#new-event-window-form");
const statusElement = document.querySelector("#settings-status");
const currentWindowElement = document.querySelector("#settings-current-window");

function setStatus(message, isError = false) {
    if (!statusElement) return;
    if (!message) {
        statusElement.hidden = true;
        statusElement.textContent = "";
        statusElement.classList.remove("is-success", "is-error");
        return;
    }

    statusElement.hidden = false;
    statusElement.textContent = message;
    statusElement.classList.remove("is-success", "is-error");
    statusElement.classList.add(isError ? "is-error" : "is-success");
}

function getStoredWindowDays() {
    if (typeof window.getConfiguredNewEventWindowDays === "function") {
        const configured = Number.parseInt(String(window.getConfiguredNewEventWindowDays() || ""), 10);
        if (WINDOW_OPTIONS.has(configured)) {
            return configured;
        }
    }

    try {
        const raw = Number.parseInt(String(localStorage.getItem("dtechHub:newEventWindowDays:v1") || ""), 10);
        if (WINDOW_OPTIONS.has(raw)) {
            return raw;
        }
    } catch (_error) {
    }
    return 14;
}

function applyWindowToForm(days) {
    const selected = WINDOW_OPTIONS.has(Number(days)) ? Number(days) : 14;
    const input = document.querySelector(`input[name="newEventWindow"][value="${selected}"]`);
    if (input) {
        input.checked = true;
    }

    if (currentWindowElement) {
        currentWindowElement.textContent = String(selected);
    }
}

function saveWindowDays(days) {
    const normalized = Number.parseInt(String(days || ""), 10);
    if (!WINDOW_OPTIONS.has(normalized)) {
        return false;
    }

    if (typeof window.setConfiguredNewEventWindowDays === "function") {
        return window.setConfiguredNewEventWindowDays(normalized);
    }

    try {
        localStorage.setItem(NEW_EVENT_WINDOW_STORAGE_KEY, String(normalized));
        return true;
    } catch (_error) {
        return false;
    }
}

function initSettingsPage() {
    const saved = getStoredWindowDays();
    applyWindowToForm(saved);

    if (!form) {
        return;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const selected = Number.parseInt(String(new FormData(form).get("newEventWindow") || ""), 10);

        if (!WINDOW_OPTIONS.has(selected)) {
            setStatus("Please choose 7, 14, or 30 days.", true);
            return;
        }

        const ok = saveWindowDays(selected);
        if (!ok) {
            setStatus("Could not save settings in this browser session.", true);
            return;
        }

        applyWindowToForm(selected);
        setStatus("Settings saved. Homepage indicators now use this new window.");
    });
}

initSettingsPage();
