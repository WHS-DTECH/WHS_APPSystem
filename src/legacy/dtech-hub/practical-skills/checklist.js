(() => {
    "use strict";

    const AUTH_STORAGE_KEY = "hub_google_auth_v1";
    const STATUS_ID = "ps-status";

    // Titles/descriptions only; points/timeframe scoring and badges are computed server-side from saved progress
    // (see PRACTICAL_SKILLS_KIT_DEFINITIONS in server.js) so completion can't be spoofed from this page.
    const kitDefinitions = [
        {
            id: "kit-login",
            title: "Login Kit",
            icon: "\ud83d\udd11",
            colour: "green",
            description: "Sign in correctly, open your workspace, and confirm you can access required learning tools.",
            timeframeHours: 24
        },
        {
            id: "kit-google-search",
            title: "Search Kit",
            icon: "\ud83d\udd0e",
            colour: "blue",
            description: "Use advanced search techniques to find reliable answers and cite one quality source.",
            timeframeHours: 24
        },
        {
            id: "kit-minecraft",
            title: "Minecraft",
            icon: "\ud83e\uddf1",
            colour: "orange",
            description: "Complete the Minecraft practical task and demonstrate the required build or design outcome.",
            timeframeHours: 24
        }
    ];

    const state = {
        email: "",
        snapshot: null,
        signInWatcherId: 0,
        revision: 0
    };

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getStoredAuthRaw() {
        let localValue = null;
        let sessionValue = null;
        try {
            localValue = localStorage.getItem(AUTH_STORAGE_KEY);
        } catch (_error) {
            localValue = null;
        }
        try {
            sessionValue = sessionStorage.getItem(AUTH_STORAGE_KEY);
        } catch (_error) {
            sessionValue = null;
        }
        return localValue || sessionValue;
    }

    function getSignedInEmail() {
        const raw = getStoredAuthRaw();
        if (!raw) return "";
        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
                return "";
            }
            return normalizeEmail(parsed?.profile?.email || "");
        } catch (_error) {
            return "";
        }
    }

    function withAuthHeaders(headers = {}) {
        const next = state.email ? { ...headers, "x-user-email": state.email } : { ...headers };
        const raw = getStoredAuthRaw();
        const auth = raw && getSignedInEmail() ? JSON.parse(raw) : {};
        if (auth.idToken) next.Authorization = `Bearer ${auth.idToken}`;
        return next;
    }

    function updateKit(kitId, action) {
        return loadJson(`/api/practical-skills/progress/${encodeURIComponent(kitId)}/${action}`, {
            method: "POST",
            headers: withAuthHeaders()
        });
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showStatus(message, isError = false) {
        const status = document.getElementById(STATUS_ID);
        if (!status) return;
        if (!message) {
            status.hidden = true;
            status.textContent = "";
            status.classList.remove("is-error", "is-success");
            return;
        }

        status.hidden = false;
        status.textContent = message;
        status.classList.remove("is-error", "is-success");
        status.classList.add(isError ? "is-error" : "is-success");
    }

    async function loadJson(url, options = {}) {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || `Request failed (${response.status})`);
        }
        return payload;
    }

    function fetchSnapshot() {
        return loadJson("/api/practical-skills/my-progress", { headers: withAuthHeaders() });
    }

    function renderBadges(badges) {
        const host = document.getElementById("ps-badge-list");
        if (!host) return;

        const rows = Array.isArray(badges) ? badges : [];
        if (!rows.length) {
            host.innerHTML = `<p class="ps-badge-empty">Your first achievement is waiting! Complete a kit to earn your first badge.</p>`;
            return;
        }

        host.innerHTML = rows.map((badge) => `
            <article class="ps-badge">
                <span class="ps-badge-icon" aria-hidden="true">${escapeHtml(badge.icon || "\u2b50")}</span>
                <div><span class="ps-badge-title">${escapeHtml(badge.title || "Badge")}</span><p>${escapeHtml(badge.description || "")}</p></div>
            </article>
        `).join("");
    }

    function render() {
        const list = document.getElementById("ps-kit-list");
        if (!list) return;
        const snapshot = state.snapshot;
        const loaded = Boolean(state.email && snapshot);
        const kitsById = new Map((snapshot?.kits || []).map((kit) => [kit.id, kit]));
        const completed = loaded ? Number(snapshot.completedCount || 0) : 0;
        const total = loaded ? Number(snapshot.totalKits || kitDefinitions.length) : kitDefinitions.length;
        document.getElementById("ps-student-name").textContent = loaded ? snapshot.student?.name || state.email : state.email ? "Loading your licence..." : "Your name belongs here";
        document.getElementById("ps-student-email").textContent = state.email || "Sign in with your school account to start collecting stamps.";
        document.getElementById("ps-total-points").textContent = loaded ? String(snapshot.totalPoints || 0) : "\u2014";
        document.getElementById("ps-completed-kits").textContent = loaded ? `${completed} / ${total}` : "\u2014";
        document.getElementById("ps-current-tier").textContent = loaded ? snapshot.tier || "Starter" : "\u2014";
        const progress = document.getElementById("ps-licence-progress");
        progress.max = total;
        progress.value = completed;
        document.getElementById("ps-licence-progress-count").textContent = loaded ? `${completed} / ${total} stamps` : state.email ? "Loading..." : "Sign in to view";
        document.getElementById("ps-stamp-list").innerHTML = kitDefinitions.map((kit) => {
            const earned = loaded && kitsById.get(kit.id)?.isComplete;
            const href = `./kit-worksheet.html?kit=${encodeURIComponent(kit.id)}`;
            const copy = `<span class="licence-stamp-icon" aria-hidden="true">${kit.icon}</span><strong>${escapeHtml(kit.title)}</strong><span>${earned ? "STAMP EARNED" : loaded ? "Stamp to collect" : "Waiting for you"}</span>`;
            return earned ? `<a class="licence-stamp is-earned" href="${href}" aria-label="${escapeHtml(kit.title)} stamp earned - view certificate">${copy}<span class="stamp-certificate">View certificate &rarr;</span></a>`
                : `<div class="licence-stamp">${copy}</div>`;
        }).join("");
        const next = loaded ? kitDefinitions.find((kit) => !kitsById.get(kit.id)?.isComplete) : null;
        const nextPanel = document.getElementById("ps-next-step");
        nextPanel.hidden = !loaded;
        if (loaded) {
            document.getElementById("ps-next-title").textContent = next ? `Collect your ${next.title} stamp` : "Every stamp collected. Ka pai!";
            document.getElementById("ps-next-description").textContent = next ? next.description : "Your licence collection is complete. Open an earned stamp to print or share your certificate.";
            const link = document.getElementById("ps-next-link");
            link.hidden = !next;
            if (next) link.href = `./kit-worksheet.html?kit=${encodeURIComponent(next.id)}`;
        }

        if (!state.email) {
            list.innerHTML = `<p class="ps-signin-note">Sign in with your school Google account (top right) to track kit progress and earn badges.</p>`;
            renderBadges([]);
            return;
        }

        if (!snapshot) {
            list.innerHTML = `<p class="ps-signin-note">Loading your progress\u2026</p>`;
            return;
        }

        list.innerHTML = "";

        kitDefinitions.forEach((kit) => {
            const progress = kitsById.get(kit.id) || { isComplete: false, onTime: false, score: 0 };

            const item = document.createElement("article");
            item.className = `ps-kit-item kit-${kit.colour}${progress.isComplete ? " is-complete" : ""}`;

            const statusLabel = progress.isComplete ? "Completed" : progress.startedAt ? "In Progress" : "Not Started";
            const timeLabel = progress.isComplete
                ? (progress.onTime ? "On-time bonus applied" : "Completed outside target window")
                : `Target window: ${kit.timeframeHours}h`;

            item.innerHTML = `
                <div class="ps-kit-heading"><span class="ps-kit-icon" aria-hidden="true">${kit.icon}</span><div><p class="kit-step-label">${progress.isComplete ? "Stamp collected" : next?.id === kit.id ? "Your next stamp" : "Another skill to explore"}</p><h3>${escapeHtml(kit.title)}</h3></div></div>
                <p>${escapeHtml(kit.description)}</p>
                <div class="ps-kit-meta">
                    <span class="ps-kit-pill">${statusLabel}</span>
                    <span class="ps-kit-pill">Points: ${Number(progress.score || 0)}</span>
                    <span class="ps-kit-pill">${timeLabel}</span>
                </div>
                <div class="ps-kit-actions">
                    <a class="button button-primary" href="./kit-worksheet.html?kit=${encodeURIComponent(kit.id)}">${progress.isComplete ? "View kit & certificate" : "Open kit"} &rarr;</a>
                    <details class="ps-kit-manage"><summary>Manage progress</summary>
                        <button type="button" class="button button-secondary" data-kit="${kit.id}" data-action="complete" ${progress.isComplete ? "disabled" : ""}>Mark Complete</button>
                        <button type="button" class="button button-secondary" data-kit="${kit.id}" data-action="reset">Reset</button>
                    </details>
                </div>
            `;
            list.appendChild(item);
        });

        renderBadges(snapshot.badges);

        list.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", async () => {
                const revision = state.revision;
                const action = button.getAttribute("data-action");
                button.disabled = true;
                try {
                    await updateKit(button.getAttribute("data-kit"), action);
                    if (revision !== state.revision) return;
                    const refreshed = await fetchSnapshot();
                    if (revision !== state.revision) return;
                    state.snapshot = refreshed;
                    render();
                    showStatus(action === "reset" ? "Kit progress reset." : "Kit marked complete.");
                } catch (error) {
                    if (revision === state.revision) showStatus(error?.message || "Could not save progress.", true);
                } finally {
                    button.disabled = false;
                }
            });
        });
    }

    // Sign-in happens asynchronously via Google Identity Services after this script runs, so
    // poll briefly for a session rather than requiring a manual page refresh.
    function startSignInWatcher() {
        if (state.signInWatcherId || state.email) return;
        let attemptsLeft = 30;
        state.signInWatcherId = window.setInterval(() => {
            attemptsLeft -= 1;
            const email = getSignedInEmail();
            if (email) {
                window.clearInterval(state.signInWatcherId);
                state.signInWatcherId = 0;
                void init();
                return;
            }
            if (attemptsLeft <= 0) {
                window.clearInterval(state.signInWatcherId);
                state.signInWatcherId = 0;
            }
        }, 1000);
    }

    async function init() {
        const revision = ++state.revision;
        state.email = getSignedInEmail();
        state.snapshot = null;
        renderBadges([]);
        showStatus("");
        if (!state.email) {
            render();
            startSignInWatcher();
            return;
        }

        render();
        try {
            const snapshot = await fetchSnapshot();
            if (revision !== state.revision) return;
            state.snapshot = snapshot;
            render();
        } catch (error) {
            if (revision !== state.revision) return;
            document.getElementById("ps-student-name").textContent = "Your licence is unavailable";
            document.getElementById("ps-kit-list").innerHTML = `<p class="ps-signin-note">Could not load your saved licence. Refresh to try again. Your progress has not been reset.</p>`;
            showStatus(error?.message || "Could not load Licence progress.", true);
        }
    }

    window.addEventListener("hub-auth-state-changed", () => { void init(); });
    void init();
})();
