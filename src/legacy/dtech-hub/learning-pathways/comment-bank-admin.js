(() => {
    "use strict";
    const endpoint = "/api/admin/progression/comment-bank";
    const cb = window.commentBank;
    const $ = (name) => document.querySelector(`#bank-${name}`);
    const state = { bank: null, revision: 0, dirty: false, busy: false, ready: false, request: 0, email: "" };

    function setMessage(text, error = false) {
        $("message").textContent = text;
        $("message").classList.toggle("is-error", error);
        $("message").classList.toggle("is-success", !error);
    }
    function changed(text) {
        state.dirty = true;
        $("publish").disabled = !state.ready || state.busy;
        setMessage(text || "Unpublished changes. Click Publish Comment Bank to save.");
    }
    function fill(select, options, keep = true) {
        const previous = select.value;
        select.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
        if (keep && options.some(([value]) => value === previous)) select.value = previous;
    }
    function button(text, title, onClick, disabled = false) {
        const element = document.createElement("button");
        element.type = "button"; element.className = "bank-icon-button";
        element.textContent = text; element.title = title; element.setAttribute("aria-label", title);
        element.disabled = disabled;
        element.addEventListener("click", onClick);
        return element;
    }
    const subOptions = (category) => (state.bank?.subcategories[category] || []).map((name) => [name, name]);
    const sameGroup = (a, b) => a.discipline === b.discipline && a.category === b.category && a.subcategory === b.subcategory && a.level === b.level;
    function nextOrder(comment) {
        return Math.max(0, ...state.bank.comments.filter((item) => item !== comment && sameGroup(item, comment)).map((item) => item.order)) + 10;
    }

    function renderSelects() {
        fill($("add-discipline"), cb.disciplines);
        fill($("add-category"), cb.categories.map(([id, name]) => [id, name]));
        fill($("add-subcategory"), subOptions($("add-category").value));
        fill($("add-level"), cb.levels);
        fill($("sub-category"), cb.categories.map(([id, name]) => [id, name]));
        fill($("filter-discipline"), [["", "All disciplines"], ...cb.disciplines]);
        fill($("filter-category"), [["", "All categories"], ...cb.categories.map(([id, name]) => [id, name])]);
        fill($("filter-subcategory"), [["", "All subcategories"], ...($("filter-category").value ? subOptions($("filter-category").value) : [])]);
        fill($("filter-level"), [["", "Every level"], ...cb.levels]);
        fill($("copy-discipline"), cb.disciplines);
    }
    function renderSubcategories() {
        const list = $("sub-list");
        list.replaceChildren();
        if (!state.bank) return;
        const category = $("sub-category").value;
        const names = state.bank.subcategories[category];
        names.forEach((name, index) => {
            const used = state.bank.comments.filter((comment) => comment.category === category && comment.subcategory === name).length;
            const item = document.createElement("li");
            const input = document.createElement("input");
            input.value = name; input.maxLength = cb.limits.subcategoryName;
            input.setAttribute("aria-label", `Rename subcategory ${name}`);
            input.addEventListener("change", () => {
                const clean = input.value.trim().replace(/\s+/g, " ");
                if (!clean || names.some((other, at) => at !== index && other.toLowerCase() === clean.toLowerCase())) {
                    input.value = name;
                    setMessage("Subcategory names must be unique and not blank.", true);
                    return;
                }
                for (const comment of state.bank.comments) if (comment.category === category && comment.subcategory === name) comment.subcategory = clean;
                names[index] = clean;
                changed(); render();
            });
            const count = document.createElement("span");
            count.className = "bank-sub-count"; count.textContent = `${used} comment${used === 1 ? "" : "s"}`;
            const move = (step) => () => {
                [names[index], names[index + step]] = [names[index + step], names[index]];
                changed(); render();
            };
            item.append(input, count,
                button("▲", `Move ${name} up`, move(-1), index === 0),
                button("▼", `Move ${name} down`, move(1), index === names.length - 1),
                button("✕", used ? `${name} still has comments - move or delete them first` : `Delete ${name}`, () => {
                    names.splice(index, 1); changed(); render();
                }, used > 0));
            list.append(item);
        });
    }
    function filtered() {
        const discipline = $("filter-discipline").value, category = $("filter-category").value;
        const subcategory = $("filter-subcategory").value, level = $("filter-level").value;
        const search = $("filter-search").value.trim().toLowerCase();
        const inactive = $("filter-inactive").checked;
        return cb.sortComments(state.bank, state.bank.comments.filter((comment) => (!discipline || comment.discipline === discipline)
            && (!category || comment.category === category) && (!subcategory || comment.subcategory === subcategory)
            && (!level || comment.level === level) && (inactive || comment.active)
            && (!search || comment.text.toLowerCase().includes(search))));
    }
    function heading(tag, text, count, className) {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        if (count !== undefined) {
            const badge = document.createElement("span");
            badge.className = "bank-badge"; badge.textContent = count;
            element.append(" ", badge);
        }
        return element;
    }
    function commentRow(comment) {
        const row = document.createElement("div");
        row.className = `bank-row${comment.active ? "" : " is-inactive"}`;
        const text = document.createElement("textarea");
        text.value = comment.text; text.rows = 2; text.maxLength = cb.limits.text;
        text.setAttribute("aria-label", "Comment text");
        text.addEventListener("input", () => { comment.text = text.value; changed(); });
        const level = document.createElement("select");
        level.setAttribute("aria-label", "Development level");
        fill(level, cb.levels, false); level.value = comment.level;
        level.addEventListener("change", () => { comment.level = level.value; comment.order = nextOrder(comment); changed(); render(); });
        const sub = document.createElement("select");
        sub.setAttribute("aria-label", "Subcategory");
        fill(sub, subOptions(comment.category), false); sub.value = comment.subcategory;
        sub.addEventListener("change", () => { comment.subcategory = sub.value; comment.order = nextOrder(comment); changed(); render(); });
        const activeLabel = document.createElement("label");
        activeLabel.className = "bank-check";
        const active = document.createElement("input");
        active.type = "checkbox"; active.checked = comment.active;
        active.addEventListener("change", () => { comment.active = active.checked; changed(); render(); });
        activeLabel.append(active, " Active");
        const group = cb.sortComments(state.bank, state.bank.comments.filter((item) => sameGroup(item, comment)));
        const position = group.indexOf(comment);
        const move = (step) => () => {
            cb.renumber(state.bank, comment);
            const other = group[position + step];
            [comment.order, other.order] = [other.order, comment.order];
            changed(); render();
        };
        const controls = document.createElement("div");
        controls.className = "bank-row-controls";
        controls.append(sub, level, activeLabel,
            button("▲", "Move up", move(-1), position === 0),
            button("▼", "Move down", move(1), position === group.length - 1),
            button("⧉", "Duplicate", () => {
                const copy = { ...comment, id: cb.newId(), order: comment.order + 5 };
                state.bank.comments.push(copy);
                cb.renumber(state.bank, copy);
                changed("Comment duplicated. Edit the copy, then click Publish Comment Bank.");
                render();
            }),
            button("✕", "Delete", () => {
                if (!window.confirm(`Delete this comment?\n\n${comment.text}`)) return;
                state.bank.comments = state.bank.comments.filter((item) => item !== comment);
                changed(); render();
            }));
        row.append(text, controls);
        return row;
    }
    function renderComments() {
        const list = $("list");
        list.replaceChildren();
        if (!state.bank) { $("count").textContent = ""; return; }
        const rows = filtered();
        const total = state.bank.comments.length;
        const activeCount = state.bank.comments.filter((comment) => comment.active).length;
        $("count").textContent = `Showing ${rows.length} of ${total} comments (${activeCount} active).`;
        if (!rows.length) { list.append(heading("p", "No comments match these filters.", undefined, "bank-empty")); return; }
        const countFor = (test) => rows.filter(test).length;
        let last = {};
        for (const comment of rows) {
            if (comment.discipline !== last.discipline || comment.category !== last.category) {
                list.append(heading("h3", `${cb.label(cb.disciplines, comment.discipline)} · ${cb.label(cb.categories, comment.category)}`,
                    countFor((item) => item.discipline === comment.discipline && item.category === comment.category), `bank-category bank-${comment.category}`));
                last = { discipline: comment.discipline, category: comment.category };
            }
            if (comment.subcategory !== last.subcategory) {
                list.append(heading("h4", comment.subcategory, countFor((item) => item.discipline === comment.discipline
                    && item.category === comment.category && item.subcategory === comment.subcategory), "bank-subcategory"));
                last.subcategory = comment.subcategory; last.level = null;
            }
            if (comment.level !== last.level) {
                list.append(heading("h5", cb.label(cb.levels, comment.level), countFor((item) => sameGroup(item, comment)), `bank-level level-${comment.level}`));
                last.level = comment.level;
            }
            list.append(commentRow(comment));
        }
    }
    function render() {
        renderSelects();
        renderSubcategories();
        renderComments();
    }
    function setReady(ready) {
        state.ready = ready;
        $("fields").disabled = !ready || state.busy;
        for (const name of ["export", "import", "reset"]) $(name).disabled = !ready || state.busy;
        $("publish").disabled = !ready || state.busy || !state.dirty;
    }
    async function request(options = {}) {
        const response = await fetch(endpoint, { ...options, cache: "no-store",
            headers: withHubAuthHeaders({ "Content-Type": "application/json" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!data.bank || !Array.isArray(data.bank.comments)) throw new Error("The server returned an invalid comment bank.");
        return data;
    }
    function accept(data) {
        state.bank = data.bank;
        state.revision = data.revision;
        state.dirty = false;
    }
    async function load() {
        if (state.busy) return;
        if (state.dirty && !window.confirm("Reload and discard your unpublished comment bank changes?")) return;
        const id = ++state.request;
        const email = getActiveHubEmail();
        setReady(false);
        setMessage("Loading comment bank and checking admin access...");
        try {
            const data = await request();
            if (id !== state.request || email !== getActiveHubEmail()) return;
            accept(data);
            state.email = email;
            setReady(true);
            setMessage(data.revision ? `Comment bank loaded (last saved ${new Date(data.updatedAt).toLocaleString()} by ${data.updatedBy}).`
                : "Showing the starter comment bank. Publish to save it.");
        } catch (error) {
            if (id !== state.request) return;
            state.bank = null;
            setMessage(`Could not load the comment bank: ${error.message}. Sign in as an admin, then click Reload.`, true);
        }
        render();
    }

    $("publish").addEventListener("click", async () => {
        if (!state.ready || state.busy) return;
        let bank;
        try { bank = cb.validateBank(state.bank); } catch (error) { setMessage(`Cannot publish: ${error.message}`, true); return; }
        const id = state.request;
        state.busy = true; setReady(true);
        setMessage("Publishing comment bank...");
        try {
            const data = await request({ method: "PUT", body: JSON.stringify({ bank, revision: state.revision }) });
            if (id !== state.request) return;
            accept(data);
            setMessage(`Comment bank published ${new Date(data.updatedAt).toLocaleString()}. Teachers see the changes next time they open the report.`);
        } catch (error) {
            if (id === state.request) setMessage(`Publish failed: ${error.message}`, true);
        } finally {
            state.busy = false;
            setReady(state.ready);
            render();
        }
    });
    $("reload").addEventListener("click", load);
    $("export").addEventListener("click", () => {
        const blob = new Blob([`\uFEFF${cb.toCsv({ ...state.bank, comments: cb.sortComments(state.bank) })}`], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `reporting-comment-bank-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    $("import").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async () => {
        const file = $("import-file").files[0];
        $("import-file").value = "";
        if (!file) return;
        try {
            const bank = cb.fromCsv(await file.text());
            if (!window.confirm(`Replace the whole bank (${state.bank.comments.length} comments) with ${bank.comments.length} comments from ${file.name}?`)) return;
            state.bank = bank;
            changed(`Imported ${bank.comments.length} comments from ${file.name}. Click Publish Comment Bank to save.`);
            render();
        } catch (error) { setMessage(`Import failed: ${error.message}`, true); }
    });
    $("reset").addEventListener("click", () => {
        if (!window.confirm("Replace the whole comment bank with the starter bank? Export first if you want a backup.")) return;
        state.bank = cb.defaultBank();
        changed("Starter bank restored. Click Publish Comment Bank to save.");
        render();
    });
    $("add-category").addEventListener("change", () => fill($("add-subcategory"), subOptions($("add-category").value)));
    $("add").addEventListener("click", () => {
        const text = $("add-text").value.trim().replace(/\s+/g, " ");
        if (!text) { setMessage("Type the comment text first.", true); return; }
        if (!$("add-subcategory").value) { setMessage("Add a subcategory for that category first.", true); return; }
        const comment = { id: cb.newId(), discipline: $("add-discipline").value, category: $("add-category").value,
            subcategory: $("add-subcategory").value, level: $("add-level").value, text, order: 0, active: true };
        comment.order = nextOrder(comment);
        state.bank.comments.push(comment);
        $("add-text").value = "";
        changed("Comment added. Click Publish Comment Bank to save.");
        render();
    });
    $("sub-category").addEventListener("change", renderSubcategories);
    $("sub-add").addEventListener("click", () => {
        const names = state.bank.subcategories[$("sub-category").value];
        const name = $("sub-name").value.trim().replace(/\s+/g, " ");
        if (!name || names.some((other) => other.toLowerCase() === name.toLowerCase())) { setMessage("Enter a new, unique subcategory name.", true); return; }
        if (names.length >= cb.limits.subcategories) { setMessage(`Each category can have up to ${cb.limits.subcategories} subcategories.`, true); return; }
        names.push(name);
        $("sub-name").value = "";
        changed(); render();
    });
    $("filter-category").addEventListener("change", () => { $("filter-subcategory").value = ""; render(); });
    for (const name of ["filter-discipline", "filter-subcategory", "filter-level", "filter-inactive"]) $(name).addEventListener("change", renderComments);
    $("filter-search").addEventListener("input", renderComments);
    $("copy").addEventListener("click", () => {
        const target = $("copy-discipline").value;
        const existing = new Set(state.bank.comments.filter((comment) => comment.discipline === target)
            .map((comment) => `${comment.category}|${comment.subcategory}|${comment.level}|${comment.text.toLowerCase()}`));
        const copies = filtered().filter((comment) => comment.discipline !== target
            && !existing.has(`${comment.category}|${comment.subcategory}|${comment.level}|${comment.text.toLowerCase()}`))
            .map((comment) => ({ ...comment, id: cb.newId() + Math.random().toString(36).slice(2, 4), discipline: target }));
        if (!copies.length) { setMessage(`No new comments to copy to ${cb.label(cb.disciplines, target)}.`, true); return; }
        if (state.bank.comments.length + copies.length > cb.limits.comments) { setMessage(`The bank can hold up to ${cb.limits.comments} comments.`, true); return; }
        state.bank.comments.push(...copies);
        changed(`Copied ${copies.length} comments to ${cb.label(cb.disciplines, target)}. Adapt them, then click Publish Comment Bank.`);
        render();
    });
    $("hint-toggle").addEventListener("click", () => {
        const open = $("hint").hidden;
        $("hint").hidden = !open;
        $("hint-toggle").setAttribute("aria-expanded", String(open));
    });
    window.addEventListener("beforeunload", (event) => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("hub-auth-state-changed", () => {
        if (getActiveHubEmail() === state.email && state.ready) return;
        ++state.request;
        state.dirty = false;
        state.bank = null;
        setReady(false);
        render();
        void load();
    });
    render();
    void load();
})();
