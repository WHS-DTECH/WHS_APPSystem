(function () {
    "use strict";

    const config = document.querySelector("[data-library-path]")?.dataset || {};
    const dataPath = config.libraryPath || "/practical-skills/library.json";
    const libraryName = config.libraryName || "practical skills";
    const isPathways = Boolean(config.libraryPath);
    const featuredChecklistId = "practical-skills-checklist";
    const grid = document.getElementById("practical-skills-grid");
    const meta = document.getElementById("practical-skills-results-meta");
    const searchInput = document.getElementById("practical-skills-search");
    const yearPillsContainer = document.getElementById("practical-skills-year-pills");
    const statusPillsContainer = document.getElementById("practical-skills-status-pills");
    const categoryPillsContainer = document.getElementById("practical-skills-category-pills");
    const typePillsContainer = document.getElementById("practical-skills-type-pills");
    const sortSelect = document.getElementById("practical-skills-sort");
    const cardTypeNames = { strand: config.libraryCardLabel || "Curriculum Strands", unit: config.libraryUnitLabel || "Units", lesson: config.libraryLessonLabel || "Lessons", activity: config.libraryActivityLabel || "Lesson Activities", job: config.libraryJobLabel || "Jobs" };
    const cardType = (item) => (isPathways && ["unit", "lesson", "activity", "job"].includes(String(item?.cardType || "")) ? String(item.cardType) : "strand");
    const pageLocation = typeof location === "undefined" ? null : location;
    const requestedParams = new URLSearchParams(pageLocation?.search || "");
    const requestedType = isPathways ? requestedParams.get("type") : null;
    const requestedYear = isPathways ? requestedParams.get("year") : null;
    const requestedCategory = isPathways ? requestedParams.get("category") : null;
    const requestedCardId = isPathways ? decodeURIComponent(String(pageLocation?.hash || "").replace(/^#card-/, "")) : "";
    let requestedCardShown = false;

    let library = [];
    const state = {
        search: "",
        year: requestedYear || "All",
        status: "All",
        type: Object.prototype.hasOwnProperty.call(cardTypeNames, requestedType || "") ? cardTypeNames[requestedType] : "All",
        category: requestedCategory || "All",
        sort: "name-asc"
    };

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatStatus(status) {
        const raw = String(status || "").trim();
        if (!raw) return "Active";
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    function getUniqueValues(field) {
        const values = new Set();
        library.forEach((item) => {
            const value = String(item[field] || "").trim();
            if (value) values.add(value);
        });
        return ["All", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
    }

    function updatePillsActiveState(container, activeValue) {
        if (!container) return;
        const pills = container.querySelectorAll(".filter-chip");
        pills.forEach((pill) => {
            pill.classList.toggle("active", pill.dataset.value === activeValue);
        });
    }

    function renderPillGroup(container, values, activeValue, onSelect) {
        if (!container) return;
        container.innerHTML = "";
        values.forEach((value) => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = `filter-chip ${value === activeValue ? "active" : ""}`;
            pill.dataset.value = value;
            pill.textContent = value;
            pill.addEventListener("click", () => {
                onSelect(value);
                updatePillsActiveState(container, value);
                renderCards();
            });
            container.appendChild(pill);
        });
    }

    function populateFilters() {
        renderPillGroup(yearPillsContainer, getUniqueValues("yearLevel"), state.year, (value) => {
            state.year = value;
        });
        renderPillGroup(statusPillsContainer, getUniqueValues("status"), state.status, (value) => {
            state.status = value;
        });
        const categories = getUniqueValues("area");
        if (!isPathways && library.some((item) => item.cardLabel === "LICENCE KIT")) {
            categories.push("Licence Kit");
        }
        renderPillGroup(categoryPillsContainer, categories, state.category, (value) => {
            state.category = value;
        });
        const types = new Set(library.map((item) => cardTypeNames[cardType(item)]));
        renderPillGroup(typePillsContainer, ["All", ...Object.values(cardTypeNames).filter((name) => types.has(name))], state.type, (value) => {
            state.type = value;
        });
    }

    function filterLibrary(items) {
        const query = state.search.trim().toLowerCase();

        return items.filter((item) => {
            if (state.year !== "All" && String(item.yearLevel || "") !== state.year) return false;
            if (state.status !== "All" && String(item.status || "") !== state.status) return false;
            if (state.category === "Licence Kit" && item.cardLabel !== "LICENCE KIT") return false;
            if (state.category !== "All" && state.category !== "Licence Kit" && String(item.area || "") !== state.category) return false;
            if (state.type !== "All" && cardTypeNames[cardType(item)] !== state.type) return false;

            if (query) {
                const haystack = [item.title, item.summary, item.yearLevel, item.area]
                    .map((value) => String(value || "").toLowerCase())
                    .join(" ");
                if (!haystack.includes(query)) return false;
            }

            return true;
        });
    }

    function sortLibrary(items) {
        const sorted = [...items];
        switch (state.sort) {
            case "name-desc":
                sorted.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
                break;
            case "status":
                sorted.sort((a, b) => String(a.status || "").localeCompare(String(b.status || "")));
                break;
            case "name-asc":
            default:
                sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
                break;
        }
        if (isPathways) {
            const order = { strand: 0, job: 1, unit: 2, lesson: 3, activity: 4 };
            const parentKey = { lesson: "unit", activity: "lesson" };
            const lessonOrder = (a, b) => (parentKey[cardType(a)] && cardType(a) === cardType(b) && state.sort === "name-asc"
                ? String(a[parentKey[cardType(a)]] || "").localeCompare(String(b[parentKey[cardType(b)]] || "")) || (Number(a.sequence) || 999) - (Number(b.sequence) || 999) : 0);
            return sorted.map((item, index) => ({ item, index }))
                .sort((a, b) => order[cardType(a.item)] - order[cardType(b.item)] || lessonOrder(a.item, b.item) || a.index - b.index)
                .map(({ item }) => item);
        }
        return sorted;
    }

    function createPracticalSkillCard(item) {
        const displayOnly = isPathways && !String(item.href || "").trim();
        const card = document.createElement(displayOnly ? "article" : "a");
        card.className = "project-card";
        if (displayOnly) {
            card.classList.add("pathway-display-card");
            card.setAttribute("aria-label", String(item.title || "Learning pathway"));
        } else {
            card.href = String(item.href || "#");
            card.target = "_self";
            card.rel = "";
            card.setAttribute("aria-label", `Open ${String(item.title || "Practical Skill")}`);
        }

        const isUnit = cardType(item) === "unit";
        const isLesson = cardType(item) === "lesson";
        if (isUnit) card.classList.add("pathway-unit-card");
        if (isLesson) card.classList.add("pathway-lesson-card");
        const isActivity = cardType(item) === "activity";
        if (isActivity) card.classList.add("pathway-activity-card");
        const isJob = cardType(item) === "job";
        if (isJob) card.classList.add("pathway-job-card");
        if (isPathways && item.id) card.id = `card-${String(item.id)}`;
        const icon = String(item?.visual?.icon || config.libraryIcon || "PS").trim() || "PS";
        const palette = String(item?.visual?.palette || (isJob && config.libraryJobPalette) || (isUnit && config.libraryUnitPalette) || (isLesson && config.libraryLessonPalette) || (isActivity && config.libraryActivityPalette) || config.libraryPalette || "linear-gradient(135deg, #2f8f61 0%, #3ca873 54%, #65c494 100%)");
        const imageUrl = String(item.imageUrl || "").trim();
        const hasImage = imageUrl.length > 0;
        const visualStyle = hasImage ? "" : `style=\"background: ${escapeHtml(palette)};\"`;
        const visualContent = hasImage
            ? `<img src=\"${escapeHtml(imageUrl)}\" alt=\"${escapeHtml(item.title)}\" class=\"project-image\" loading=\"lazy\">`
            : `<span class=\"visual-mark\">${escapeHtml(icon)}</span>`;

        const clientDetails = isJob && item.client?.enabled
            ? `<div class=\"project-client-details\"><strong>Client:</strong> ${escapeHtml(item.client.name)}<br><a href=\"mailto:${escapeHtml(item.client.email)}\">${escapeHtml(item.client.email)}</a><span>${item.client.onsite ? "Onsite client" : "Offsite client"}</span></div>`
            : "";

        card.innerHTML = `
            <div class="project-visual" ${visualStyle}>
                ${visualContent}
            </div>
            <div class="project-body">
                <div class="project-header">
                    <h3>${escapeHtml(item.title)}</h3>
                </div>
                <p class="project-description">${escapeHtml(item.summary)}</p>
                    ${clientDetails}
                <div class="project-tags">
                    <span class="project-tag status-tag status-${escapeHtml(String(item.status || "active").toLowerCase())}">${escapeHtml(formatStatus(item.status))}</span>
                    <span class="project-tag">${escapeHtml(item.yearLevel || "All Years")}</span>
                    <span class="project-tag">${escapeHtml(item.area || "Licence")}</span>
                </div>
                <div class="project-footer">
                    <span class="project-meta">${escapeHtml(isPathways ? cardTypeNames[cardType(item)] : item.cardLabel || config.libraryCardLabel || "PRACTICAL SKILL")}</span>
                </div>
            </div>
        `;

        return card;
    }

    function renderCards() {
        if (!grid) return;

        const list = sortLibrary(filterLibrary(library));

        grid.innerHTML = "";

        if (meta) {
            meta.textContent = `${list.length} item${list.length === 1 ? "" : "s"} shown`;
        }

        if (!list.length) {
            const emptyState = document.createElement("div");
            emptyState.className = "about-card";
            emptyState.innerHTML = `
                <p class="section-kicker">No Results</p>
                <h2>${isPathways && !library.length ? "Learning pathways are coming soon." : `No ${escapeHtml(libraryName)} matched that search.`}</h2>
                <p>${isPathways && !library.length ? "Pathway cards will appear here when they are published." : "Try a different keyword or reset the filters back to All."}</p>
            `;
            grid.appendChild(emptyState);
            grid.style.display = "";
            return;
        }

        list.forEach((item) => {
            grid.appendChild(createPracticalSkillCard(item));
        });

        grid.style.display = "flex";
        grid.style.flexWrap = "wrap";
        grid.style.gap = "12px";
        grid.style.marginTop = "10px";
        grid.style.minWidth = "0";
        showRequestedCard();
    }

    // Curriculum pages link to /learning-pathways/?type=unit#card-<id> to open a specific card.
    function showRequestedCard() {
        if (!requestedCardId || requestedCardShown) return;
        const target = grid.children ? Array.from(grid.children).find((child) => child.id === `card-${requestedCardId}`) : null;
        if (!target) return;
        requestedCardShown = true;
        target.classList.add("pathway-card-highlight");
        if (target.tagName.toLowerCase() === "article") target.setAttribute("tabindex", "-1");
        if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof target.focus === "function") target.focus({ preventScroll: true });
    }

    function bindControls() {
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                state.search = searchInput.value;
                renderCards();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                state.sort = sortSelect.value;
                renderCards();
            });
        }
    }

    async function loadPracticalSkillsLibrary() {
        try {
            const response = await fetch(dataPath, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Could not load ${libraryName} library.`);
            }

            const payload = await response.json();
            if (!Array.isArray(payload)) throw new Error("The library response must be a card list.");
            library = payload.filter((item) => isPathways || String(item?.id || "") !== featuredChecklistId);
        } catch (error) {
            console.error(`Could not load ${libraryName}`, error);
            if (meta) meta.textContent = "Library could not be loaded.";
            if (grid) {
                grid.replaceChildren();
                const notice = document.createElement("div");
                notice.className = "about-card";
                const text = document.createElement("p");
                text.textContent = `Could not load ${libraryName}. Please try again.`;
                const retry = document.createElement("button");
                retry.type = "button";
                retry.className = "button button-secondary";
                retry.textContent = "Retry loading library";
                retry.addEventListener("click", loadPracticalSkillsLibrary);
                notice.append(text, retry);
                grid.appendChild(notice);
            }
            return;
        }

        populateFilters();
        bindControls();
        renderCards();
    }

    loadPracticalSkillsLibrary();
})();
