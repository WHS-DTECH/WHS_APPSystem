(() => {
    "use strict";
    const form = document.getElementById("sites-form");
    const list = document.getElementById("sites-list");
    const status = document.getElementById("sites-status");
    let sites = [];
    let authRevision = 0;
    let dirty = false;
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    function headers() {
        const raw = localStorage.getItem("hub_google_auth_v1") || sessionStorage.getItem("hub_google_auth_v1");
        const auth = raw ? JSON.parse(raw) : null;
        const result = { "Content-Type": "application/json" };
        if (auth?.profile?.email) result["x-user-email"] = auth.profile.email;
        const token = auth?.idToken || auth?.accessToken || "";
        if (token.startsWith("eyJ") && token.split(".").length === 3) result.Authorization = `Bearer ${token}`;
        return result;
    }
    async function request(options = {}) {
        const response = await fetch("/api/practical-skills/login-sites/settings", { ...options, headers: headers() });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        return payload;
    }
    function message(text, error = false) {
        status.textContent = text;
        status.classList.toggle("is-error", error);
    }
    function field(key, label, value, multiline = false) {
        return `<label class="sites-field">${escapeHtml(label)}${multiline
            ? `<textarea data-field="${key}" rows="3">${escapeHtml(value)}</textarea>`
            : `<input data-field="${key}" value="${escapeHtml(value)}">`}</label>`;
    }
    function marking(question) {
        return `<label class="sites-field">Marking rule<select data-field="match"><option value="exact" ${question.match === "exact" ? "selected" : ""}>Exact answer (any accepted answer)</option><option value="all-terms" ${question.match === "all-terms" ? "selected" : ""}>All required terms</option></select></label>
            ${field("answers", "Accepted answers / required terms (one per line)", question.answers.join("\n"), true)}`;
    }
    function render() {
        list.innerHTML = sites.map((site, index) => `
            <section class="sites-card" data-site="${index}">
                <h2>${escapeHtml(site.name)}</h2>
                <div class="sites-fields">
                    ${field("name", "Site name", site.name)}
                    ${field("url", "Website / class link (HTTPS)", site.url)}
                    ${field("description", "Description", site.description, true)}
                    ${field("logo", "Logo image URL (HTTPS or ../images/...)", site.logo)}
                    ${field("group", "Course group label", site.group)}
                    ${field("years", "Year group label", site.years)}
                </div>
                <div class="sites-visibility">
                    <label><input type="checkbox" data-hidden ${site.hidden ? "checked" : ""}> Hide from everyone</label>
                    ${["junior", "middle", "senior", "staff"].map((level) => `<label><input type="checkbox" data-level="${level}" ${site.levels.includes(level) ? "checked" : ""}> ${level === "junior" ? "Junior (7/8)" : level === "middle" ? "Middle (9/10)" : level === "senior" ? "Senior (11-13)" : "Staff"}</label>`).join("")}
                </div>
                <label><input type="checkbox" data-question-enabled ${site.readinessQuestion ? "checked" : ""}> Enable readiness question</label>
                <div class="sites-question" ${site.readinessQuestion ? "" : "hidden"}>
                    ${field("prompt", "Question", site.readinessQuestion?.prompt || "", true)}
                    ${field("hint", "Hint / instructions", site.readinessQuestion?.hint || "", true)}
                    ${site.readinessQuestion?.tools ? site.readinessQuestion.tools.map((tool, i) => `
                        <div class="sites-tool" data-tool="${i}">
                            <img src="${escapeHtml(tool.image)}" alt="${escapeHtml(tool.label)}">
                            <div>${field("label", "Tool label", tool.label)}${field("image", "Tool picture URL", tool.image)}${marking(tool)}</div>
                        </div>`).join("") : marking(site.readinessQuestion || { match: "exact", answers: [] })}
                </div>
            </section>`).join("");
    }
    function read() {
        return Array.from(list.children).map((card, index) => {
            const original = sites[index];
            const get = (key, root = card) => root.querySelector(`[data-field="${key}"]`).value.trim();
            const answerRule = (root) => ({ match: get("match", root), answers: get("answers", root).split("\n").map((answer) => answer.trim()).filter(Boolean) });
            const { readinessQuestion, ...site } = original;
            const next = { ...site };
            for (const key of ["name", "url", "description", "logo", "group", "years"]) next[key] = get(key);
            next.hidden = card.querySelector("[data-hidden]").checked;
            next.levels = Array.from(card.querySelectorAll("[data-level]:checked")).map((input) => input.dataset.level);
            if (card.querySelector("[data-question-enabled]").checked) {
                next.readinessQuestion = { id: readinessQuestion?.id || original.id, prompt: get("prompt"), hint: get("hint") };
                if (readinessQuestion?.tools) next.readinessQuestion.tools = Array.from(card.querySelectorAll("[data-tool]")).map((root, i) => ({
                    id: readinessQuestion.tools[i].id, label: get("label", root), image: get("image", root), ...answerRule(root)
                }));
                else Object.assign(next.readinessQuestion, answerRule(card.querySelector(".sites-question")));
            }
            return next;
        });
    }
    form.addEventListener("input", () => { dirty = true; message("Unsaved changes."); });
    form.addEventListener("change", (event) => {
        if (event.target.matches("[data-question-enabled]")) event.target.closest(".sites-card").querySelector(".sites-question").hidden = !event.target.checked;
    });
    document.getElementById("sites-add").addEventListener("click", () => {
        sites = read();
        if (sites.length >= 30) return message("A maximum of 30 sites is supported.", true);
        sites.push({ id: `site-${Date.now()}`, name: "New website", description: "", url: "", logo: "", group: "JuniorDTECH", years: "Years 7/8", hidden: true, levels: ["junior", "middle", "senior", "staff"] });
        dirty = true;
        render();
        message("New website added, hidden until you enable it. Fill in its details and save.");
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const revision = authRevision;
        const controls = form.querySelectorAll("input, textarea, select, button");
        controls.forEach((control) => { control.disabled = true; });
        try {
            const payload = await request({ method: "PUT", body: JSON.stringify({ sites: read() }) });
            if (revision !== authRevision) return;
            sites = payload.sites;
            dirty = false;
            render();
            message("Website settings saved. Students will see changes after reloading.");
        } catch (error) {
            if (revision === authRevision) message(error.message || "Could not save website settings.", true);
        } finally {
            controls.forEach((control) => { control.disabled = false; });
        }
    });
    async function load() {
        const revision = ++authRevision;
        form.hidden = true;
        list.innerHTML = "";
        sites = [];
        dirty = false;
        message("Loading staff settings...");
        try {
            const payload = await request();
            if (revision !== authRevision) return;
            sites = payload.sites;
            dirty = false;
            render();
            form.hidden = false;
            message("Staff access confirmed. Edit the websites below.");
        } catch (error) {
            if (revision === authRevision) message(error.message || "Could not load settings. Sign into DTECH-HUB with your staff account.", true);
        }
    }
    window.addEventListener("hub-auth-state-changed", () => { void load(); });
    window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
    void load();
})();
