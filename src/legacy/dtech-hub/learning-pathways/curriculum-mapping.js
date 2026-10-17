(() => {
    "use strict";
    const endpoint = "/api/admin/progression/mapping";
    const $ = (name) => document.querySelector(`#mapping-${name}`);
    const pathways = progressionMapping.pathwayIds;
    const strandLabels = { "digital-technology": "Digital Technology", "systems-and-control": "Systems and Control" };
    const state = { mapping: null, revision: 0, activities: [], dirty: false, busy: false, ready: false, request: 0, email: "" };

    function setMessage(text, error = false) {
        $("message").textContent = text;
        $("message").classList.toggle("is-error", error);
        $("message").classList.toggle("is-success", !error);
    }
    function year() { return Number($("year").value); }
    function changed(text) {
        state.dirty = true;
        $("publish").disabled = !state.ready || state.busy;
        setMessage(text || "Unpublished changes. Click Publish Mapping to save.");
    }
    function select(options, value, label) {
        const element = document.createElement("select");
        element.setAttribute("aria-label", label);
        for (const [optionValue, optionLabel] of options) element.append(new Option(optionLabel, optionValue));
        element.value = value;
        return element;
    }
    function statementLabel(statement) {
        const text = statement.text.length > 90 ? `${statement.text.slice(0, 87)}...` : statement.text;
        return `${progressionMapping.statementCode(statement.id)} - ${text}`;
    }
    function renderLinks() {
        const body = $("links");
        body.replaceChildren();
        const statements = progressionMapping.statementsForYear(year());
        for (const strand of Object.keys(strandLabels)) for (const kind of ["knowledge", "practices"]) {
            const rows = statements.filter((statement) => statement.strand === strand && statement.kind === kind);
            if (!rows.length) continue;
            const group = document.createElement("tr");
            group.className = "mapping-group";
            const cell = document.createElement("th");
            cell.colSpan = 2 + pathways.length; cell.scope = "colgroup";
            cell.textContent = `${strandLabels[strand]} - ${kind === "knowledge" ? "Knowledge" : "Practices"}`;
            group.append(cell); body.append(group);
            for (const statement of rows) {
                const row = document.createElement("tr");
                const code = document.createElement("td");
                code.className = "mapping-code"; code.textContent = progressionMapping.statementCode(statement.id);
                const text = document.createElement("td");
                if (statement.heading) {
                    const heading = document.createElement("span");
                    heading.className = "mapping-heading"; heading.textContent = statement.heading;
                    text.append(heading);
                }
                text.append(statement.text);
                row.append(code, text);
                for (const pathway of pathways) {
                    const links = state.mapping.links[statement.id] ||= [];
                    const current = links.find((link) => link.pathway === pathway);
                    const role = select([["", "-"], ...progressionMapping.roles], current?.role || "",
                        `${progressionMapping.statementCode(statement.id)} link to ${pathway}`);
                    const colour = () => { role.className = role.value ? `role-${role.value}` : ""; };
                    colour();
                    role.addEventListener("change", () => {
                        const others = links.filter((link) => link.pathway !== pathway);
                        state.mapping.links[statement.id] = role.value
                            ? pathways.flatMap((id) => id === pathway ? [{ pathway, role: role.value }] : others.filter((link) => link.pathway === id))
                            : others;
                        colour(); changed(); renderLinks();
                    });
                    const td = document.createElement("td"); td.append(role); row.append(td);
                }
                body.append(row);
            }
        }
    }
    function renderActivities() {
        const body = $("activities");
        body.replaceChildren();
        const statements = progressionMapping.statementsForYear(year());
        const ids = new Set(statements.map((statement) => statement.id));
        const links = state.mapping.activities.filter((link) => ids.has(link.statement));
        if (!links.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5; cell.textContent = `No activity links for Year ${year()} yet.`;
            row.append(cell); body.append(row);
        }
        for (const link of links) {
            const row = document.createElement("tr");
            const activity = select(state.activities.map((item) => [item.id, item.context ? `${item.title} (${item.context})` : item.title]), link.activity, "Activity");
            const statement = select(statements.map((item) => [item.id, statementLabel(item)]), link.statement, "Statement");
            const autoSet = select(progressionMapping.autoSetOptions, link.autoSet, "Auto-set Some Evidence");
            const colour = () => { autoSet.className = `auto-${autoSet.value}`; };
            colour();
            const note = document.createElement("input");
            note.maxLength = 500; note.value = link.note || ""; note.setAttribute("aria-label", "Evidence or mapping caution");
            const remove = document.createElement("button");
            remove.type = "button"; remove.className = "button button-secondary"; remove.textContent = "Remove";
            const duplicate = () => state.mapping.activities.some((other) => other !== link && other.activity === activity.value && other.statement === statement.value);
            activity.addEventListener("change", () => {
                if (duplicate()) { activity.value = link.activity; setMessage("That activity is already linked to this statement.", true); return; }
                link.activity = activity.value; changed();
            });
            statement.addEventListener("change", () => {
                if (duplicate()) { statement.value = link.statement; setMessage("That activity is already linked to this statement.", true); return; }
                link.statement = statement.value; changed();
            });
            autoSet.addEventListener("change", () => { link.autoSet = autoSet.value; colour(); changed(); });
            note.addEventListener("input", () => { link.note = note.value; changed(); });
            remove.addEventListener("click", () => {
                state.mapping.activities = state.mapping.activities.filter((item) => item !== link);
                changed(); renderActivities();
            });
            for (const element of [activity, statement, autoSet, note, remove]) { const td = document.createElement("td"); td.append(element); row.append(td); }
            body.append(row);
        }
        $("add-activity").disabled = !state.activities.length;
    }
    function render() {
        if (!state.mapping) { $("links").replaceChildren(); $("activities").replaceChildren(); return; }
        const verified = state.mapping.verifiedYears.includes(year());
        $("verified").checked = verified;
        $("unverified").hidden = verified;
        renderLinks();
        renderActivities();
    }
    function setReady(ready) {
        state.ready = ready;
        $("fields").disabled = !ready || state.busy;
        $("verified").disabled = !ready || state.busy;
        $("reset").disabled = !ready || state.busy;
        $("publish").disabled = !ready || state.busy || !state.dirty;
    }
    async function request(options = {}) {
        const response = await fetch(endpoint, { ...options, cache: "no-store",
            headers: withHubAuthHeaders({ "Content-Type": "application/json" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!data.mapping || !Array.isArray(data.activities)) throw new Error("The server returned an invalid mapping.");
        return data;
    }
    function accept(data) {
        state.mapping = data.mapping;
        state.revision = data.revision;
        state.activities = data.activities;
        state.dirty = false;
    }
    async function load() {
        if (state.busy) return;
        if (state.dirty && !window.confirm("Reload and discard your unpublished mapping changes?")) return;
        const id = ++state.request;
        const email = getActiveHubEmail();
        setReady(false);
        setMessage("Loading mapping and checking admin access...");
        try {
            const data = await request();
            if (id !== state.request || email !== getActiveHubEmail()) return;
            accept(data);
            state.email = email;
            setReady(true);
            setMessage(data.revision ? `Published mapping loaded (last saved ${new Date(data.updatedAt).toLocaleString()} by ${data.updatedBy}).`
                : "Showing the default mapping from the Year 7 mapping workbook. Publish to save it.");
        } catch (error) {
            if (id !== state.request) return;
            state.mapping = null;
            setMessage(`Could not load mapping: ${error.message}. Sign in as an admin, then click Reload.`, true);
        }
        render();
    }
    $("publish").addEventListener("click", async () => {
        if (!state.ready || state.busy) return;
        const id = state.request;
        state.busy = true; setReady(true);
        setMessage("Publishing mapping...");
        try {
            const data = await request({ method: "PUT", body: JSON.stringify({ mapping: state.mapping, revision: state.revision }) });
            if (id !== state.request) return;
            accept(data);
            setMessage(`Mapping published ${new Date(data.updatedAt).toLocaleString()}. The Progression Pathway report uses it immediately.`);
        } catch (error) {
            if (id === state.request) setMessage(`Publish failed: ${error.message}`, true);
        } finally {
            state.busy = false;
            setReady(state.ready);
            render();
        }
    });
    $("year").addEventListener("change", render);
    $("verified").addEventListener("change", () => {
        const years = new Set(state.mapping.verifiedYears);
        if ($("verified").checked) years.add(year()); else years.delete(year());
        state.mapping.verifiedYears = progressionMapping.years.filter((item) => years.has(item));
        $("unverified").hidden = $("verified").checked;
        changed();
    });
    $("reset").addEventListener("click", () => {
        if (!window.confirm(`Replace the Year ${year()} pathway and activity links with the workbook defaults?`)) return;
        const defaults = progressionMapping.defaultMapping();
        const ids = new Set(progressionMapping.statementsForYear(year()).map((statement) => statement.id));
        for (const id of ids) state.mapping.links[id] = defaults.links[id];
        state.mapping.activities = [...state.mapping.activities.filter((link) => !ids.has(link.statement)),
            ...defaults.activities.filter((link) => ids.has(link.statement))];
        changed(`Year ${year()} reset to defaults. Click Publish Mapping to save.`);
        render();
    });
    $("add-activity").addEventListener("click", () => {
        const statements = progressionMapping.statementsForYear(year());
        const activity = state.activities[0]?.id;
        const statement = statements.find((item) => !state.mapping.activities.some((link) => link.activity === activity && link.statement === item.id));
        if (!activity || !statement) { setMessage("Every statement is already linked to that activity.", true); return; }
        state.mapping.activities.push({ activity, statement: statement.id, autoSet: "review", note: "" });
        changed(); renderActivities();
    });
    $("reload").addEventListener("click", load);
    window.addEventListener("beforeunload", (event) => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("hub-auth-state-changed", () => {
        if (getActiveHubEmail() === state.email && state.ready) return;
        ++state.request;
        state.dirty = false;
        state.mapping = null;
        setReady(false);
        render();
        void load();
    });
    void load();
})();
