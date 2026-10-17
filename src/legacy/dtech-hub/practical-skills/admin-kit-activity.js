(() => {
    "use strict";

    const AUTH_STORAGE_KEY = "hub_google_auth_v1";
    const params = new URLSearchParams(window.location.search);
    const kitId = String(params.get("kit") || "").trim();
    const activityIndex = Math.max(0, Number.parseInt(params.get("activity"), 10) || 0);
    const titleInput = document.querySelector("#activity-title");
    const establishesInput = document.querySelector("#activity-establishes");
    const questionList = document.querySelector("#activity-question-list");
    const imageList = document.querySelector("#activity-image-list");
    const statusHost = document.querySelector("#activity-status");
    let content = null;

    function getAuthHeaders(headers = {}) {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
            const auth = raw ? JSON.parse(raw) : null;
            const email = String(auth?.profile?.email || "").trim().toLowerCase();
            const token = String(auth?.idToken || auth?.accessToken || "").trim();
            const next = email ? { ...headers, "x-user-email": email } : { ...headers };
            if (token.startsWith("eyJ") && token.split(".").length === 3) next.Authorization = `Bearer ${token}`;
            return next;
        } catch (_error) {
            return headers;
        }
    }

    function setStatus(message, isError = false) {
        statusHost.hidden = !message;
        statusHost.textContent = message || "";
        statusHost.classList.toggle("is-error", isError);
    }

    async function request(url, options = {}) {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        return payload;
    }

    function createQuestion() {
        return { id: `q${Date.now()}`, type: "short-answer", prompt: "", lines: 1, options: [] };
    }

    function createImage() {
        return { url: "", alt: "", caption: "", attribution: "", sourceUrl: "", license: "", licenseUrl: "" };
    }

    function renderQuestions(questions) {
        questionList.innerHTML = "";
        questions.forEach((question, index) => {
            const card = document.createElement("div");
            card.className = "activity-question-card";
            const options = Array.isArray(question.options) ? question.options.join("\n") : "";
            card.innerHTML = `<div class="activity-card-head"><span>Question ${index + 1}</span><button class="button button-secondary" type="button" data-remove-question="${index}">Remove</button></div>
              <div class="activity-editor-field"><label>Type</label><select data-question-type="${index}"><option value="short-answer">Short Answer</option><option value="checklist">Checklist</option><option value="multiple-choice">Multiple Choice</option></select></div>
              <div class="activity-editor-field"><label>Prompt</label><textarea data-question-prompt="${index}" rows="2">${question.prompt || ""}</textarea></div>
              <div class="activity-editor-field"><label data-question-options-label="${index}">${question.type === "short-answer" ? "Answer lines" : "Options (one per line)"}</label><textarea data-question-options="${index}" rows="${question.type === "short-answer" ? 1 : 3}">${question.type === "short-answer" ? Number(question.lines) || 1 : options}</textarea></div>`;
            card.querySelector(`[data-question-type="${index}"]`).value = question.type || "short-answer";
            questionList.appendChild(card);
        });
    }

    function renderImages(images) {
        imageList.innerHTML = "";
        images.forEach((image, index) => {
            const card = document.createElement("div");
            card.className = "activity-image-card";
            card.innerHTML = `<div class="activity-card-head"><span>Image ${index + 1}</span><button class="button button-secondary" type="button" data-remove-image="${index}">Remove</button></div>
              <div class="activity-editor-field"><label>Image URL</label><input data-image-url="${index}" type="text" value="${image.url || ""}"></div>
              <div class="activity-editor-field"><label>Alt text</label><input data-image-alt="${index}" type="text" value="${image.alt || ""}"></div>
              <div class="activity-editor-field"><label>Caption</label><input data-image-caption="${index}" type="text" value="${image.caption || ""}"></div>
              <div class="activity-editor-field"><label>Photo attribution</label><input data-image-attribution="${index}" type="text" value="${image.attribution || ""}"></div>
              <div class="activity-editor-field"><label>Source URL</label><input data-image-source-url="${index}" type="url" value="${image.sourceUrl || ""}"></div>
              <div class="activity-editor-field"><label>License</label><input data-image-license="${index}" type="text" value="${image.license || ""}"></div>
              <div class="activity-editor-field"><label>License URL</label><input data-image-license-url="${index}" type="url" value="${image.licenseUrl || ""}"></div>`;
            imageList.appendChild(card);
        });
    }

    function readActivity() {
        const questions = Array.from(questionList.children).map((card, index) => {
            const type = card.querySelector("select")?.value || "short-answer";
            const prompt = card.querySelector("textarea[data-question-prompt]")?.value || "";
            const values = card.querySelector("textarea[data-question-options]")?.value || "";
            const existing = content.activities?.[activityIndex]?.questions?.[index] || {};
            return type === "short-answer"
                ? { id: existing.id || `q${index + 1}`, type, prompt, lines: Math.max(1, Number.parseInt(values, 10) || 1) }
                : { id: existing.id || `q${index + 1}`, type, prompt, options: values.split("\n").map((value) => value.trim()).filter(Boolean) };
        });
        const images = Array.from(imageList.children).map((card, index) => ({
            ...(content.activities?.[activityIndex]?.images?.[index] || {}),
            url: card.querySelector("input[data-image-url]")?.value || "",
            alt: card.querySelector("input[data-image-alt]")?.value || "",
            caption: card.querySelector("input[data-image-caption]")?.value || "",
            attribution: card.querySelector("input[data-image-attribution]")?.value || "",
            sourceUrl: card.querySelector("input[data-image-source-url]")?.value || "",
            license: card.querySelector("input[data-image-license]")?.value || "",
            licenseUrl: card.querySelector("input[data-image-license-url]")?.value || ""
        }));
        const existing = content.activities?.[activityIndex];
        const researchReport = existing?.researchReport ? {
            ...existing.researchReport,
            templateId: document.querySelector("#activity-research-template").value.trim(),
            minimumWords: Math.max(1, Math.min(1000, Math.round(Number(document.querySelector("#activity-research-minimum").value) || existing.researchReport.minimumWords || 25)))
        } : undefined;
        return { ...existing, number: activityIndex + 1, title: titleInput.value, establishes: establishesInput.value, questions, images, ...(researchReport ? { researchReport } : {}) };
    }

    function render() {
        const worksheet = content.worksheets?.[activityIndex] || {};
        const activity = content.activities?.[activityIndex] || (activityIndex === 0 ? { questions: content.questions || [], images: content.images || [] } : {});
        titleInput.value = activity.title || worksheet.activity || `Activity ${activityIndex + 1}`;
        establishesInput.value = activity.establishes || worksheet.establishes || "";
        document.querySelector("#activity-page-title").textContent = `Activity Details: ${titleInput.value}`;
        document.querySelector("#activity-page-summary").textContent = establishesInput.value || "Configure the student tasks and supporting images for this worksheet.";
        const assessmentNote = document.querySelector("#activity-assessment-note");
        assessmentNote.hidden = activity.assessmentId !== "password-problems-v1";
        document.querySelector("#activity-apps-note").hidden = activity.assessmentId !== "apps-wordsearch-v1";
        document.querySelector("#activity-hunt-note").hidden = activity.assessmentId !== "learning-sites-treasure-v1";
        document.querySelector("#activity-merged-note").hidden = worksheet.mergedInto === undefined;
        document.querySelector("#activity-identity-note").hidden = !activity.identityLessonVersion;
        document.querySelector("#activity-sites-note").hidden = !activity.loginSites;
        document.querySelector("#activity-information").hidden = !activity.information;
        document.querySelector("#activity-information-title").textContent = activity.information?.title || "";
        const informationHost = document.querySelector("#activity-information-paragraphs");
        informationHost.replaceChildren();
        (activity.information?.paragraphs || []).forEach((text) => {
            const paragraph = document.createElement("p");
            paragraph.textContent = text;
            informationHost.appendChild(paragraph);
        });
        renderQuestions(activity.questions || []);
        renderImages(activity.images || []);
        document.querySelector("#activity-research-report").hidden = !activity.researchReport;
        document.querySelector("#activity-research-template").value = activity.researchReport?.templateId || "";
        document.querySelector("#activity-research-minimum").value = activity.researchReport?.minimumWords || 25;
    }

    async function save() {
        const activity = readActivity();
        const worksheets = Array.isArray(content.worksheets) ? content.worksheets.slice() : [];
        while (worksheets.length <= activityIndex) worksheets.push({ number: worksheets.length + 1, activity: "", establishes: "" });
        worksheets[activityIndex] = { ...worksheets[activityIndex], number: activity.number, activity: activity.title, establishes: activity.establishes };
        const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
        activities[activityIndex] = activity;
        content = { ...content, worksheets, activities };
        await request(`/api/admin/practical-skills/kit-content/${encodeURIComponent(kitId)}`, { method: "PUT", headers: getAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ content }) });
        setStatus("Activity details saved.");
        render();
    }

    questionList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-question]");
        if (!button) return;
        const activity = readActivity();
        activity.questions.splice(Number(button.dataset.removeQuestion), 1);
        content.activities = content.activities || [];
        content.activities[activityIndex] = activity;
        renderQuestions(activity.questions);
    });
    questionList.addEventListener("change", (event) => {
        if (!event.target.matches("select[data-question-type]")) return;
        const activity = readActivity();
        const index = Number(event.target.dataset.questionType);
        activity.questions[index].type = event.target.value;
        if (event.target.value === "short-answer") activity.questions[index].lines = 1;
        else activity.questions[index].options = [];
        content.activities = content.activities || [];
        content.activities[activityIndex] = activity;
        renderQuestions(activity.questions);
    });
    imageList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-image]");
        if (!button) return;
        const activity = readActivity();
        activity.images.splice(Number(button.dataset.removeImage), 1);
        content.activities = content.activities || [];
        content.activities[activityIndex] = activity;
        renderImages(activity.images);
    });
    document.querySelector("#activity-add-question").addEventListener("click", () => { const activity = readActivity(); activity.questions.push(createQuestion()); content.activities = content.activities || []; content.activities[activityIndex] = activity; renderQuestions(activity.questions); });
    document.querySelector("#activity-add-image").addEventListener("click", () => { const activity = readActivity(); activity.images.push(createImage()); content.activities = content.activities || []; content.activities[activityIndex] = activity; renderImages(activity.images); });
    document.querySelector("#activity-save").addEventListener("click", () => { void save().catch((error) => setStatus(error.message || "Could not save activity details.", true)); });

    async function init() {
        if (!kitId) { setStatus("A kit is required.", true); return; }
        document.querySelector("#activity-back-link").href = `/practical-skills/admin-kits.html?kit=${encodeURIComponent(kitId)}`;
        try {
            const payload = await request(`/api/admin/practical-skills/kit-content/${encodeURIComponent(kitId)}`, { headers: getAuthHeaders() });
            content = payload.content || {};
            render();
        } catch (error) { setStatus(error.message || "Could not load activity details.", true); }
    }

    void init();
})();