(() => {
    "use strict";

    const AUTH_STORAGE_KEY = "hub_google_auth_v1";

    // Built-in fallback; the dropdown is refreshed from /api/admin/practical-skills/kits, which also lists created kits.
    let KIT_CATALOG = [
        { id: "kit-login", title: "Login" },
        { id: "kit-google-search", title: "Search Kit" },
        { id: "kit-minecraft", title: "Minecraft" }
    ];
    const NEW_KIT_ID = "";
    const NEW_KIT_LABEL = "+ New Kit (blank)";

    const KIT_COLOUR_SCHEMES = {
        "Skill Kits": { color: "#2f8f61", accent: "#ffd166" },
        "Application Kits": { color: "#2b87b6", accent: "#66fff5" }
    };

    function normaliseSkillArea(value) {
        return /^\s*application/i.test(String(value || "")) ? "Application Kits" : "Skill Kits";
    }

    const state = {
        isAdmin: false,
        kitId: NEW_KIT_ID,
        content: null,
        previewTimerId: 0
    };

    const kitSelect = document.querySelector("#kit-select");
    const statusHost = document.querySelector("#kit-builder-status");
    const nameInput = document.querySelector("#kit-name");
    const skillAreaInput = document.querySelector("#kit-skill-area");
    const kitStatusInput = document.querySelector("#kit-status");
    const yearLevelInput = document.querySelector("#kit-year-level");
    const bannerSubtitleInput = document.querySelector("#kit-banner-subtitle");
    const instructionsInput = document.querySelector("#kit-instructions");
    const teacherNotesInput = document.querySelector("#kit-teacher-notes");
    const whatStudentsWillLearnInput = document.querySelector("#kit-what-students-learn");
    const whyThisMattersInput = document.querySelector("#kit-why-this-matters");
    const keyVocabularyInput = document.querySelector("#kit-key-vocabulary");
    const evidenceRequiredInput = document.querySelector("#kit-evidence-required");
    const successCriteriaInput = document.querySelector("#kit-success-criteria");
    const extensionChallengeInput = document.querySelector("#kit-extension-challenge");
    const worksheetListHost = document.querySelector("#kit-worksheet-list");
    const iconInput = document.querySelector("#kit-icon");
    const themeColorInput = document.querySelector("#kit-theme-color");
    const accentColorInput = document.querySelector("#kit-accent-color");
    const addWorksheetBtn = document.querySelector("#kit-add-worksheet");
    const saveBtn = document.querySelector("#kit-save-content");
    const reloadBtn = document.querySelector("#kit-reload-content");
    const previewHost = document.querySelector("#kit-preview-host");

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

    function getActiveHubEmail() {
        const raw = getStoredAuthRaw();
        if (!raw) return "";
        try {
            const parsed = JSON.parse(raw);
            return normalizeEmail(parsed?.profile?.email || "");
        } catch (_error) {
            return "";
        }
    }

    function getSignedInAccessToken() {
        const raw = getStoredAuthRaw();
        if (!raw) return "";
        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) return "";
            return String(parsed?.idToken || parsed?.accessToken || "").trim();
        } catch (_error) {
            return "";
        }
    }

    function withAdminAuthHeaders(headers = {}) {
        const email = getActiveHubEmail();
        if (!email) return headers;
        const nextHeaders = { ...headers, "x-user-email": email };
        const accessToken = getSignedInAccessToken();
        if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
            nextHeaders.Authorization = `Bearer ${accessToken}`;
        }
        return nextHeaders;
    }

    function setStatus(message, isError = false) {
        if (!statusHost) return;
        if (!message) {
            statusHost.hidden = true;
            statusHost.textContent = "";
            return;
        }
        statusHost.hidden = false;
        statusHost.textContent = message;
        statusHost.classList.toggle("is-error", isError);
        statusHost.classList.toggle("is-success", !isError);
    }

    async function verifyAdminAccess() {
        const email = getActiveHubEmail();
        if (!email) {
            setStatus("Sign in with your school account first.", true);
            return false;
        }

        try {
            const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`, {
                headers: withAdminAuthHeaders()
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.can_admin) {
                setStatus("Admin access is required for this page.", true);
                return false;
            }
            return true;
        } catch (_error) {
            setStatus("Could not verify admin access.", true);
            return false;
        }
    }

    async function loadJson(url, options = {}) {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || `Request failed (${response.status})`);
        }
        return payload;
    }

    function createDefaultWorksheet(number) {
        return { number, activity: "", establishes: "", interactiveElement: "" };
    }

    function createBlankKitContent() {
        return {
            identity: { name: "", skillArea: "Skill Kits", status: "active", yearLevel: "All Years" },
            theme: { ...KIT_COLOUR_SCHEMES["Skill Kits"], icon: "" },
            bannerTitle: "",
            bannerSubtitle: "",
            instructions: "",
            teacherNotes: "",
            learning: {},
            completion: {},
            worksheets: [],
            activities: [],
            questions: [],
            images: []
        };
    }

    function renderWorksheetList() {
        worksheetListHost.innerHTML = "";
        (state.content?.worksheets || []).forEach((worksheet, index) => {
            if (worksheet.hidden) return;
            const row = document.createElement("tr");
            row.dataset.index = String(index);
            row.innerHTML = `
                <td data-label="Number"><input type="number" class="kit-worksheet-number" data-index="${index}" min="1" value="${Number(worksheet.number) || index + 1}"></td>
                <td data-label="Activity"><input type="text" class="kit-worksheet-activity" data-index="${index}" value="${worksheet.activity || ""}">${worksheet.mergedInto !== undefined ? `<p>Combined into activity ${worksheet.mergedInto + 1} in the student menu; retained for saved progress.</p>` : ""}</td>
                <td data-label="What it establishes"><input type="text" class="kit-worksheet-establishes" data-index="${index}" value="${worksheet.establishes || ""}"></td>
                <td data-label="Interactive element"><input type="text" class="kit-worksheet-interactive-element" data-index="${index}"></td>
                <td data-label="Details">${state.kitId === NEW_KIT_ID
                    ? `<span class="kit-activity-details-pending">Save the kit first</span>`
                    : `<a class="button button-primary" href="/practical-skills/admin-kit-activity.html?kit=${encodeURIComponent(state.kitId)}&activity=${index}">Activity Details</a>`}</td>
                <td data-label="Remove"><button type="button" class="button button-secondary kit-remove-worksheet" data-index="${index}">Remove</button></td>
            `;
            row.querySelector(".kit-worksheet-interactive-element").value = worksheet.interactiveElement || "";
            row.querySelector(".kit-remove-worksheet").setAttribute("aria-label", `Remove ${worksheet.activity || `Activity ${index + 1}`}`);
            worksheetListHost.appendChild(row);
        });

        const hiddenWorksheets = (state.content?.worksheets || [])
            .map((worksheet, index) => ({ worksheet, index }))
            .filter(({ worksheet }) => worksheet.hidden);
        const hiddenHost = document.querySelector("#kit-hidden-worksheets-list");
        const hiddenSection = document.querySelector("#kit-hidden-worksheets");
        const hiddenCount = document.querySelector("#kit-hidden-worksheets-count");
        hiddenHost.innerHTML = "";
        hiddenSection.hidden = hiddenWorksheets.length === 0;
        hiddenCount.textContent = String(hiddenWorksheets.length);
        hiddenWorksheets.forEach(({ worksheet, index }) => {
            const item = document.createElement("li");
            const label = document.createElement("span");
            label.textContent = worksheet.activity || `Activity ${index + 1}`;
            const restoreButton = document.createElement("button");
            restoreButton.type = "button";
            restoreButton.className = "button button-secondary kit-restore-worksheet";
            restoreButton.dataset.index = String(index);
            restoreButton.setAttribute("aria-label", `Restore ${worksheet.activity || `Activity ${index + 1}`}`);
            restoreButton.textContent = "Restore";
            item.append(label, restoreButton);
            hiddenHost.appendChild(item);
        });
    }

    function readFormIntoContent() {
        const worksheets = Array.isArray(state.content?.worksheets)
            ? state.content.worksheets.map((worksheet) => ({ ...worksheet }))
            : [];
        Array.from(worksheetListHost.querySelectorAll("tr")).forEach((row) => {
            const index = Number(row.dataset.index);
            if (!Number.isInteger(index) || !worksheets[index]) return;
            worksheets[index] = {
                ...worksheets[index],
                number: Math.max(1, Number.parseInt(row.querySelector(".kit-worksheet-number")?.value, 10) || index + 1),
                activity: row.querySelector(".kit-worksheet-activity")?.value || "",
                establishes: row.querySelector(".kit-worksheet-establishes")?.value || "",
                interactiveElement: row.querySelector(".kit-worksheet-interactive-element")?.value || ""
            };
        });

        return {
            ...(state.content || {}),
            kitId: state.kitId,
            identity: {
                name: nameInput.value,
                skillArea: skillAreaInput.value,
                status: kitStatusInput.value,
                yearLevel: yearLevelInput.value
            },
            theme: {
                color: themeColorInput.value,
                accent: accentColorInput.value,
                icon: iconInput.value
            },
            bannerTitle: nameInput.value,
            bannerSubtitle: bannerSubtitleInput.value,
            instructions: instructionsInput.value,
            teacherNotes: teacherNotesInput.value,
            learning: {
                whatStudentsWillLearn: whatStudentsWillLearnInput.value,
                whyThisMatters: whyThisMattersInput.value,
                keyVocabulary: keyVocabularyInput.value
            },
            worksheets,
            activities: state.content?.activities || [],
            questions: state.content?.questions || [],
            images: state.content?.images || [],
            completion: {
                evidenceRequired: evidenceRequiredInput.value,
                successCriteria: successCriteriaInput.value,
                extensionChallenge: extensionChallengeInput.value
            }
        };
    }

    function renderForm() {
        const content = state.content || {};
        nameInput.value = content.identity?.name || content.bannerTitle || "";
        updateKitOptionTitle(state.kitId, nameInput.value);
        skillAreaInput.value = normaliseSkillArea(content.identity?.skillArea);
        kitStatusInput.value = content.identity?.status || "active";
        setYearLevelSelection(content.identity?.yearLevel);
        bannerSubtitleInput.value = content.bannerSubtitle || "";
        instructionsInput.value = content.instructions || "";
        teacherNotesInput.value = content.teacherNotes || "";
        whatStudentsWillLearnInput.value = content.learning?.whatStudentsWillLearn || "";
        whyThisMattersInput.value = content.learning?.whyThisMatters || "";
        keyVocabularyInput.value = content.learning?.keyVocabulary || "";
        evidenceRequiredInput.value = content.completion?.evidenceRequired || "";
        successCriteriaInput.value = content.completion?.successCriteria || "";
        extensionChallengeInput.value = content.completion?.extensionChallenge || "";
        iconInput.value = content.theme?.icon || "";
        themeColorInput.value = content.theme?.color || "#2f8f61";
        accentColorInput.value = content.theme?.accent || "#ffd166";
        renderWorksheetList();
        queuePreviewUpdate();
    }

    function updateKitOptionTitle(kitId, title) {
        if (!kitId) return;
        const option = Array.from(kitSelect.options).find((item) => item.value === kitId);
        if (!option) return;
        const fallbackTitle = KIT_CATALOG.find((kit) => kit.id === kitId)?.title || kitId;
        option.textContent = String(title || "").trim() || fallbackTitle;
    }

    function setYearLevelSelection(value) {
        const yearLevel = String(value || "").trim() || "All Years";
        const existingOption = Array.from(yearLevelInput.options).find((option) => option.value === yearLevel);
        if (!existingOption) {
            const legacyOption = document.createElement("option");
            legacyOption.value = yearLevel;
            legacyOption.textContent = `Current value: ${yearLevel}`;
            yearLevelInput.appendChild(legacyOption);
        }
        yearLevelInput.value = yearLevel;
    }

    function queuePreviewUpdate() {
        window.clearTimeout(state.previewTimerId);
        state.previewTimerId = window.setTimeout(() => {
            const draft = readFormIntoContent();
            window.KitWorksheetRender?.renderWorksheet(previewHost, draft, { readOnly: true });
        }, 200);
    }

    async function loadKitContent(kitId) {
        if (kitId === NEW_KIT_ID) {
            state.content = createBlankKitContent();
            renderForm();
            setStatus("New blank kit. Fill in the details, then Save Kit Content to create it.");
            nameInput.focus();
            return;
        }
        setStatus("Loading kit content\u2026");
        try {
            const payload = await loadJson(`/api/admin/practical-skills/kit-content/${encodeURIComponent(kitId)}`, {
                headers: withAdminAuthHeaders()
            });
            state.content = payload?.content || { questions: [], images: [], theme: {} };
            renderForm();
            setStatus("");
        } catch (error) {
            setStatus(error?.message || "Could not load kit content.", true);
        }
    }

    async function createKit(draft) {
        if (!String(draft.identity?.name || "").trim()) {
            setStatus("Give the new kit a Kit Name before saving.", true);
            nameInput.focus();
            return;
        }
        saveBtn.disabled = true;
        setStatus("Creating kit\u2026");
        try {
            const payload = await loadJson("/api/admin/practical-skills/kits", {
                method: "POST",
                headers: withAdminAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ content: draft })
            });
            state.kitId = payload.kitId;
            state.content = payload.content || draft;
            await refreshKitCatalog();
            renderForm();
            setStatus("New kit created and added to the Licence Library. Use Activity Details to build each activity.");
        } catch (error) {
            setStatus(error?.message || "Could not create kit.", true);
        } finally {
            saveBtn.disabled = false;
        }
    }

    async function saveKitContent() {
        const draft = readFormIntoContent();
        if (state.kitId === NEW_KIT_ID) {
            await createKit(draft);
            return;
        }
        saveBtn.disabled = true;
        setStatus("Saving\u2026");
        try {
            const payload = await loadJson(`/api/admin/practical-skills/kit-content/${encodeURIComponent(state.kitId)}`, {
                method: "PUT",
                headers: withAdminAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ content: draft })
            });
            state.content = payload?.content || draft;
            renderForm();
            setStatus(payload?.libraryCard
                ? "Kit content saved and its Licence Library card updated."
                : "Kit content saved.");
        } catch (error) {
            setStatus(error?.message || "Could not save kit content.", true);
        } finally {
            saveBtn.disabled = false;
        }
    }

    function wireFormEvents() {
        [nameInput, skillAreaInput, kitStatusInput, yearLevelInput, bannerSubtitleInput, instructionsInput, teacherNotesInput, whatStudentsWillLearnInput, whyThisMattersInput, keyVocabularyInput, evidenceRequiredInput, successCriteriaInput, extensionChallengeInput, iconInput, themeColorInput, accentColorInput].forEach((input) => {
            input.addEventListener("input", queuePreviewUpdate);
        });
        yearLevelInput.addEventListener("change", queuePreviewUpdate);
        skillAreaInput.addEventListener("change", () => {
            const scheme = KIT_COLOUR_SCHEMES[skillAreaInput.value];
            if (!scheme) return;
            themeColorInput.value = scheme.color;
            accentColorInput.value = scheme.accent;
            queuePreviewUpdate();
        });

        worksheetListHost.addEventListener("click", (event) => {
            const button = event.target.closest(".kit-remove-worksheet");
            if (!button) return;
            state.content = readFormIntoContent();
            const index = Number(button.getAttribute("data-index"));
            const worksheet = state.content.worksheets[index];
            if (!worksheet) return;
            worksheet.hidden = true;
            renderWorksheetList();
            queuePreviewUpdate();
            setStatus("Worksheet hidden from students. Save Kit Content to keep this change.");
        });

        document.querySelector("#kit-hidden-worksheets-list").addEventListener("click", (event) => {
            const button = event.target.closest(".kit-restore-worksheet");
            if (!button) return;
            state.content = readFormIntoContent();
            const index = Number(button.getAttribute("data-index"));
            const worksheet = state.content.worksheets[index];
            if (!worksheet) return;
            delete worksheet.hidden;
            renderWorksheetList();
            queuePreviewUpdate();
            setStatus("Worksheet restored for students. Save Kit Content to keep this change.");
        });

        addWorksheetBtn.addEventListener("click", () => {
            state.content = state.content || {};
            state.content.worksheets = readFormIntoContent().worksheets;
            state.content.worksheets.push(createDefaultWorksheet(state.content.worksheets.length + 1));
            renderWorksheetList();
            queuePreviewUpdate();
            setStatus("Worksheet added. Save Kit Content to keep this change.");
        });

        saveBtn.addEventListener("click", () => {
            void saveKitContent();
        });

        reloadBtn.addEventListener("click", () => {
            void loadKitContent(state.kitId);
        });

        kitSelect.addEventListener("change", () => {
            state.kitId = kitSelect.value;
            void loadKitContent(state.kitId);
        });
    }

    function populateKitSelect() {
        const option = (value, label) => {
            const item = document.createElement("option");
            item.value = value;
            item.textContent = label;
            return item;
        };
        kitSelect.replaceChildren(option(NEW_KIT_ID, NEW_KIT_LABEL), ...KIT_CATALOG.map((kit) => option(kit.id, kit.title)));
        kitSelect.value = state.kitId;
    }

    async function refreshKitCatalog() {
        try {
            const payload = await loadJson("/api/admin/practical-skills/kits", { headers: withAdminAuthHeaders() });
            if (Array.isArray(payload?.kits) && payload.kits.length) {
                KIT_CATALOG = payload.kits.map((kit) => ({ id: String(kit.id), title: String(kit.title || kit.id) }));
            }
        } catch (_error) {
            // Keep the built-in list if the catalog cannot be loaded.
        }
        if (state.kitId !== NEW_KIT_ID && !KIT_CATALOG.some((kit) => kit.id === state.kitId)) state.kitId = NEW_KIT_ID;
        populateKitSelect();
    }

    async function init() {
        const allowed = await verifyAdminAccess();
        if (!allowed) return;

        state.kitId = new URLSearchParams(window.location.search).get("kit") || NEW_KIT_ID;
        await refreshKitCatalog();
        wireFormEvents();
        await loadKitContent(state.kitId);
    }

    void init();
})();
