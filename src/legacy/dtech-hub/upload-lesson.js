function setStatus(message, isError = false) {
    const statusDiv = document.querySelector("#status-message");
    if (!statusDiv) {
        return;
    }

    statusDiv.textContent = message;
    statusDiv.className = `upload-status ${isError ? "is-error" : "is-success"}`;
    statusDiv.hidden = false;

    if (!isError) {
        setTimeout(() => {
            statusDiv.hidden = true;
        }, 4000);
    }
}

function getAuthState() {
    const authKey = localStorage.getItem("hub_google_auth_v1") || sessionStorage.getItem("hub_google_auth_v1");
    if (!authKey) {
        return { email: "", accessToken: "" };
    }

    try {
        const auth = JSON.parse(authKey);
        const email = String(auth?.profile?.email || auth?.email || "").trim().toLowerCase();
        const expiresAt = Number(auth?.expiresAt || 0);
        const accessToken = expiresAt > Date.now() ? String(auth?.idToken || auth?.accessToken || "").trim() : "";
        return { email, accessToken };
    } catch {
        return { email: "", accessToken: "" };
    }
}

function getAuthEmail() {
    const auth = getAuthState();
    return auth.email || null;
}

function withLessonAuthHeaders(headers = {}) {
    const { email, accessToken } = getAuthState();
    const nextHeaders = { ...headers };

    if (email) {
        nextHeaders["x-user-email"] = email;
    }

    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

const quickEventSelect = document.querySelector("#relief-event-select");
const quickClassSelect = document.querySelector("#relief-class-select");
const quickFilesInput = document.querySelector("#quick-relief-files");
const quickExemplarInput = document.querySelector("#quick-exemplar-file");
const quickExemplarPreview = document.querySelector("#quick-exemplar-preview");
const quickPreviewButton = document.querySelector("#preview-relief-lesson");
const quickStatus = document.querySelector("#quick-relief-status");
let reliefPlanEvents = [];

function setQuickStatus(message, isError = false) {
    if (!quickStatus) return;
    quickStatus.textContent = message;
    quickStatus.className = `upload-status ${isError ? "is-error" : "is-success"}`;
}

async function loadReliefPlanEventOptions() {
    if (!quickEventSelect) return;
    const email = getAuthEmail();
    if (!email) {
        quickEventSelect.innerHTML = '<option value="">Sign in to load Relief Plan events</option>';
        return;
    }

    try {
        const response = await fetch("/api/relief-plan/events", { headers: withLessonAuthHeaders({}, email) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || "Could not load Relief Plan events.");
        reliefPlanEvents = Array.isArray(data.events) ? data.events : [];
        quickEventSelect.innerHTML = '<option value="">Select a Relief Plan event</option>';
        reliefPlanEvents.forEach((event, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = `${event.subject} (${event.startDate})`;
            quickEventSelect.appendChild(option);
        });
    } catch (error) {
        quickEventSelect.innerHTML = `<option value="">${error.message}</option>`;
    }
}

function setFormField(name, value) {
    const field = document.querySelector(`[name="${name}"]`);
    if (field) field.value = String(value || "");
}

function populateLessonFields(lesson, event, classCode) {
    const plan = lesson?.lesson_plan || {};
    setFormField("lessonTitle", event.subject || lesson.lesson_title);
    setFormField("activityName", event.subject || lesson.activity_name);
    setFormField("lessonWeek", "Relief Plan");
    setFormField("lessonDate", String(event.startDate || "").replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2"));
    setFormField("lessonType", "Digital Media");
    setFormField("lessonCardColor", "Rose");
    setFormField("lessonYearLevel", classCode);
    setFormField("lessonFocus", lesson.lesson_focus || plan.aim);
    setFormField("reliefCourseCode", classCode);
    Object.entries({
        planUnit: plan.unit,
        planComponent: plan.component,
        planTheme: plan.theme || event.subject,
        planAim: plan.aim,
        planResources: plan.resources,
        planPreparation: plan.preparation,
        planHealthSafety: plan.healthSafety,
        planStarter: plan.starter,
        planDemonstration: plan.demonstration,
        planPractice: plan.practice,
        planPlenary: plan.plenary,
        planHomework: plan.homework,
        planEvaluation: plan.evaluation
    }).forEach(([name, value]) => setFormField(name, value));
}

async function previewReliefLesson() {
    const event = reliefPlanEvents[Number(quickEventSelect?.value)];
    const classCode = String(quickClassSelect?.value || "").trim();
    const files = Array.from(quickFilesInput?.files || []);
    const docxFile = files.find((file) => file.name.toLowerCase().endsWith(".docx"));
    if (!event || !classCode || !docxFile) {
        setQuickStatus("Choose a Relief Plan event, class, and lesson-plan DOCX first.", true);
        return;
    }

    const formData = new FormData();
    formData.append("resourceFiles", docxFile);
    try {
        setQuickStatus("Reading lesson plan...");
        const response = await fetch("/api/lessons/preview-relief-docx", {
            method: "POST",
            headers: withLessonAuthHeaders(),
            body: formData
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || "Could not read the DOCX lesson plan.");
        populateLessonFields(data.lesson, event, classCode);
        setQuickStatus("Lesson fields populated. Review below, then click Save Lesson.");
    } catch (error) {
        setQuickStatus(error.message, true);
    }
}

function previewSelectedExemplar() {
    const file = quickExemplarInput?.files?.[0];
    if (!quickExemplarPreview) return;
    quickExemplarPreview.innerHTML = "";
    if (!file) {
        quickExemplarPreview.hidden = true;
        return;
    }
    const url = URL.createObjectURL(file);
    const label = document.createElement("p");
    label.textContent = `Exemplar selected: ${file.name}`;
    quickExemplarPreview.appendChild(label);
    if (file.name.toLowerCase().endsWith(".pdf")) {
        const frame = document.createElement("iframe");
        frame.src = url;
        frame.title = "Exemplar PDF preview";
        quickExemplarPreview.appendChild(frame);
    } else {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open selected PowerPoint exemplar";
        quickExemplarPreview.appendChild(link);
    }
    quickExemplarPreview.hidden = false;
}

function collectLessonPayload() {
    const form = document.querySelector("#lesson-form");
    if (!form) {
        return null;
    }

    const lessonTitle = String(form.querySelector('[name="lessonTitle"]')?.value || "").trim();
    const lessonWeek = String(form.querySelector('[name="lessonWeek"]')?.value || "").trim();
    const lessonDate = String(form.querySelector('[name="lessonDate"]')?.value || "").trim();
    const lessonDurationMinutes = Number.parseInt(form.querySelector('[name="lessonDurationMinutes"]')?.value || "60", 10) || 60;
    const lessonType = String(form.querySelector('[name="lessonType"]')?.value || "").trim();
    const lessonCardColor = String(form.querySelector('[name="lessonCardColor"]')?.value || "Rose").trim();
    const activityName = String(form.querySelector('[name="activityName"]')?.value || "").trim();
    const lessonYearLevel = String(form.querySelector('[name="lessonYearLevel"]')?.value || "").trim();
    const lessonLinkUrl = String(form.querySelector('[name="lessonLinkUrl"]')?.value || "").trim();
    const lessonFocus = String(form.querySelector('[name="lessonFocus"]')?.value || "").trim();
    const lessonNotes = String(form.querySelector('[name="lessonNotes"]')?.value || "").trim();
    const publishActivity = form.querySelector('[name="publishActivity"]')
        ? Boolean(form.querySelector('[name="publishActivity"]')?.checked)
        : true;
    const addToCalendar = form.querySelector('[name="addToCalendar"]')
        ? Boolean(form.querySelector('[name="addToCalendar"]')?.checked)
        : false;
    const lessonPlan = Object.fromEntries([
        ["unit", "planUnit"], ["component", "planComponent"], ["theme", "planTheme"], ["aim", "planAim"],
        ["resources", "planResources"], ["preparation", "planPreparation"], ["healthSafety", "planHealthSafety"],
        ["starter", "planStarter"], ["demonstration", "planDemonstration"], ["practice", "planPractice"],
        ["plenary", "planPlenary"], ["homework", "planHomework"], ["evaluation", "planEvaluation"]
    ].map(([key, field]) => [key, String(form.querySelector(`[name="${field}"]`)?.value || "").trim()]));

    if (!lessonTitle || !lessonType || !activityName || !lessonYearLevel || !lessonFocus) {
        setStatus("Please fill in all required fields.", true);
        return null;
    }

    const lessonId = `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
        id: lessonId,
        lesson_title: lessonTitle,
        lesson_week: lessonWeek,
        lesson_date: lessonDate,
        lesson_duration_minutes: lessonDurationMinutes,
        lesson_type: lessonType,
        lesson_card_color: lessonCardColor,
        activity_name: activityName,
        lesson_year_level: lessonYearLevel,
        lesson_link_url: lessonLinkUrl,
        lesson_focus: lessonFocus,
        lesson_notes: lessonNotes,
        publish_activity: publishActivity,
        add_to_calendar: addToCalendar,
        relief_course_code: String(form.querySelector('[name="reliefCourseCode"]')?.value || "").trim().toUpperCase(),
        lesson_plan: lessonPlan,
        created_by_email: getAuthEmail() || "unknown@westlandhigh.school.nz",
        created_at: new Date().toISOString()
    };
}

async function saveLessonToServer(payload) {
    if (!payload) {
        return false;
    }

    try {
        const userEmail = getAuthEmail();
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
            formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value ?? ""));
        });
        const resourceFiles = document.querySelector('[name="resourceFiles"]')?.files || [];
        const quickFiles = quickFilesInput?.files || [];
        const exemplarFile = quickExemplarInput?.files?.[0];
        const allFiles = [...Array.from(resourceFiles), ...Array.from(quickFiles)];
        const uniqueFiles = allFiles.filter((file, index, files) => files.findIndex((item) => item.name === file.name && item.size === file.size) === index);
        uniqueFiles.forEach((file) => formData.append("resourceFiles", file));
        if (exemplarFile) formData.append("exemplarFile", exemplarFile);

        const response = await fetch("/api/lessons", {
            method: "POST",
            headers: withLessonAuthHeaders(),
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            setStatus(`Error saving lesson: ${errorText}`, true);
            return false;
        }

        const result = await response.json();
        setStatus(`Lesson "${payload.lesson_title}" saved successfully!`);
        return true;
    } catch (error) {
        setStatus(`Error saving lesson: ${String(error?.message || "Unknown error")}`, true);
        console.error("Lesson save error:", error);
        return false;
    }
}

function initializeLessonForm() {
    const form = document.querySelector("#lesson-form");
    const clearButton = document.querySelector("#clear-lesson");

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = collectLessonPayload();
            if (payload) {
                const success = await saveLessonToServer(payload);
                if (success) {
                    form.reset();
                }
            }
        });
    }

    if (clearButton) {
        clearButton.addEventListener("click", () => {
            form?.reset();
            setStatus("Form cleared.");
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initializeLessonForm();
    loadReliefPlanEventOptions();
    quickPreviewButton?.addEventListener("click", previewReliefLesson);
    quickExemplarInput?.addEventListener("change", previewSelectedExemplar);
});
