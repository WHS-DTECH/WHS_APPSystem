(() => {
    "use strict";
    const endpoint = "/api/admin/learning-pathways/library";
    const form = document.querySelector("#pathways-form");
    const fields = document.querySelector("#pathways-fields");
    const message = document.querySelector("#pathways-message");
    const list = document.querySelector("#pathways-cards");
    const search = document.querySelector("#pathways-search");
    const retry = document.querySelector("#pathways-retry");
    const field = (name) => document.querySelector(`#pathways-${name}`);
    let cards = [];
    let dirty = false;
    let ready = false;
    let busy = false;
    let requestId = 0;
    let loadedEmail = "";

    function setMessage(text, error = false) {
        message.textContent = text;
        message.classList.toggle("is-error", error);
        message.classList.toggle("is-success", !error);
    }

    function resetForm() {
        form.reset();
        field("id").value = "";
    }

    function render() {
        list.replaceChildren();
        const query = search.value.trim().toLowerCase();
        const matching = cards.filter((card) => `${card.title} ${card.yearLevel} ${card.area}`.toLowerCase().includes(query));
        if (!matching.length) {
            const empty = document.createElement("li");
            empty.textContent = cards.length ? "No cards match your search." : "No pathway cards yet. Add your first card above.";
            list.appendChild(empty);
        }
        matching.forEach((card) => {
            const row = document.createElement("li");
            const title = document.createElement("h3");
            title.textContent = card.title;
            const details = document.createElement("p");
            details.textContent = `${card.cardType === "unit" ? "Unit" : card.cardType === "lesson" ? "Lesson" : card.cardType === "activity" ? "Lesson Activity" : card.cardType === "job" ? "Jobs" : "Curriculum Strand"} | ${card.yearLevel} | ${card.area} | ${card.status}`;
            const summary = document.createElement("p");
            summary.textContent = card.summary;
            row.append(title, details, summary);
            const button = (text, action) => {
                const element = document.createElement("button");
                element.type = "button";
                element.className = "button button-secondary";
                element.textContent = text;
                element.disabled = !ready || busy;
                element.addEventListener("click", action);
                row.appendChild(element);
            };
            button("Edit", () => {
                const values = { id: card.id, title: card.title, summary: card.summary, year: card.yearLevel,
                    area: card.area, href: card.href, image: card.imageUrl, status: card.status, icon: card.visual?.icon || "LP",
                    type: card.cardType || "strand" };
                Object.entries(values).forEach(([key, value]) => { field(key).value = value || ""; });
                field("title").focus();
                setMessage(`Editing ${card.title}.`);
            });
            button("Delete", () => {
                if (!window.confirm(`Remove "${card.title}" from Learning Pathways? Publish Library to save the deletion.`)) return;
                cards = cards.filter((item) => item.id !== card.id);
                if (field("id").value === card.id) resetForm();
                dirty = true;
                render();
                setMessage("Card removed from draft. Click Publish Library to save changes.");
            });
            list.appendChild(row);
        });
    }

    async function request(options = {}) {
        const response = await fetch(endpoint, { ...options, cache: "no-store",
            headers: withHubAuthHeaders({ "Content-Type": "application/json" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!Array.isArray(data.cards)) throw new Error("The server returned an invalid library.");
        return data.cards;
    }

    async function loadCards() {
        if (busy) return;
        if (dirty && !window.confirm("Reload and discard your unpublished card changes?")) return;
        const id = ++requestId;
        const email = getActiveHubEmail();
        ready = false;
        fields.disabled = true;
        setMessage("Loading library and checking admin access...");
        render();
        try {
            const loaded = await request();
            if (id !== requestId || email !== getActiveHubEmail()) return;
            cards = loaded;
            dirty = false;
            ready = true;
            loadedEmail = email;
            resetForm();
            setMessage(`Loaded ${cards.length} pathway card${cards.length === 1 ? "" : "s"}.`);
        } catch (error) {
            if (id !== requestId) return;
            setMessage(`Could not load library: ${error.message}. Sign in as an admin, then click Reload Library.`, true);
        } finally {
            if (id === requestId) {
                fields.disabled = !ready;
                render();
            }
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!ready || busy) return;
        const text = (key) => field(key).value.trim();
        const title = text("title");
        const id = text("id") || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!id) { setMessage("Use a title containing letters or numbers.", true); return; }
        if (!text("id") && cards.some((card) => card.id === id)) {
            setMessage("That title already exists. Edit its card or choose a different title.", true);
            return;
        }
        const card = { id, title, summary: text("summary"), href: text("href"), imageUrl: text("image"),
            yearLevel: text("year") || "All Years", area: text("area") || "Learning Pathways",
            status: text("status"), cardType: text("type") || "strand", visual: { icon: text("icon") || "LP" } };
        const index = cards.findIndex((item) => item.id === id);
        if (card.cardType === "job") {
            card.client = index >= 0 && cards[index].client
                ? cards[index].client
                : { enabled: false, name: "", email: "", onsite: true };
        }
        if (card.cardType === "unit" && index >= 0 && cards[index].strand) card.strand = cards[index].strand;
        if (card.cardType === "lesson" && index >= 0) {
            if (cards[index].unit) card.unit = cards[index].unit;
            if (cards[index].sequence) card.sequence = cards[index].sequence;
        }
        if (card.cardType === "activity" && index >= 0) {
            if (cards[index].lesson) card.lesson = cards[index].lesson;
            if (cards[index].sequence) card.sequence = cards[index].sequence;
        }
        if (index < 0) cards.push(card);
        else cards[index] = card;
        dirty = true;
        resetForm();
        render();
        setMessage("Card saved to draft. Click Publish Library to save changes.");
    });

    field("publish").addEventListener("click", async () => {
        if (!ready || busy) return;
        const id = requestId;
        busy = true;
        fields.disabled = true;
        retry.disabled = true;
        render();
        setMessage("Publishing Learning Pathways...");
        try {
            const saved = await request({ method: "PUT", body: JSON.stringify({ cards }) });
            if (id !== requestId) return;
            cards = saved;
            dirty = false;
            setMessage(`Published ${cards.length} pathway card${cards.length === 1 ? "" : "s"}.`);
        } catch (error) {
            if (id === requestId) setMessage(`Publish failed: ${error.message}`, true);
        } finally {
            busy = false;
            fields.disabled = !ready;
            retry.disabled = false;
            render();
        }
    });
    field("clear").addEventListener("click", resetForm);
    retry.addEventListener("click", loadCards);
    search.addEventListener("input", render);
    window.addEventListener("beforeunload", (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("hub-auth-state-changed", () => {
        if (getActiveHubEmail() === loadedEmail && ready) return;
        ++requestId;
        ready = false;
        fields.disabled = true;
        cards = [];
        dirty = false;
        resetForm();
        render();
        if (!busy) void loadCards();
        else setMessage("Your sign-in changed. Click Reload Library before editing.", true);
    });
    void loadCards();
})();
