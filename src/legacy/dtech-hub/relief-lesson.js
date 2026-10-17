const lessonStatus = document.querySelector("#relief-lesson-status");
const lessonContent = document.querySelector("#relief-lesson-content");
const lessonPrintButton = document.querySelector("#relief-lesson-print");
const attachedResourcesBox = document.querySelector("#relief-lesson-attached-resources");
const attachedResourcesList = document.querySelector("#relief-lesson-attached-resources-list");
const exemplarBox = document.querySelector("#relief-lesson-exemplar");
const exemplarDescription = document.querySelector("#relief-lesson-exemplar-description");
const exemplarLink = document.querySelector("#relief-lesson-exemplar-link");
const exemplarFrame = document.querySelector("#relief-lesson-exemplar-frame");

lessonPrintButton?.addEventListener("click", () => {
    setReliefLessonDocumentTitle();
    window.print();
});

function getReliefLessonTopicName(title) {
    const value = String(title || "").trim();
    if (/ozone/i.test(value)) return "Ozone";
    return value.replace(/^international day for the preservation of the /i, "").trim() || "Lesson";
}

function setReliefLessonDocumentTitle() {
    const title = document.querySelector("#relief-lesson-title")?.textContent || "Relief Lesson";
    const course = document.querySelector("#relief-lesson-course")?.textContent || "Class";
    document.title = `Relief lesson - ${getReliefLessonTopicName(title)} - ${String(course).trim()}`;
}

function renderAttachedResources(plan, courseCode, lessonTitle) {
    if (!attachedResourcesBox || !attachedResourcesList) return;

    const resourceText = String(plan?.resources || "").trim();
    const resources = resourceText
        .split(/[;\n•]+/)
        .map((value) => value.trim())
        .filter(Boolean);
    const links = [];
    const addLink = (label, href) => {
        if (!links.some((item) => item.href === href)) links.push({ label, href });
    };

    if (/UN Ozone Day|Montreal Protocol/i.test(resourceText)) {
        addLink("UN Ozone Day / Montreal Protocol information", "https://www.un.org/en/observances/ozone-day");
    }
    if (/NZ Ministry for the Environment/i.test(resourceText)) {
        addLink("NZ Ministry for the Environment information", "https://environment.govt.nz/");
    }

    const normalizedCourse = String(courseCode || "").trim().toUpperCase();
    const yearBand = normalizedCourse === "JDTECH" ? "Y7-8" : normalizedCourse === "SENIORDTECH" ? "Y11-13" : "Y9-10";
    const topic = /democracy/i.test(String(lessonTitle || "")) ? "Democracy_Day" : "Ozone_Day";
    const resourceFolder = topic === "Democracy_Day" ? "TeacherFiles/Lesson Plans/Democracy" : "TeacherFiles/Lesson Plans";
    const resourcePrefix = `${resourceFolder}/${topic}_${yearBand}`;
    const resourceFiles = topic === "Democracy_Day"
        ? [
            [`${resourcePrefix}_Student_Slides.pptx`, "Student Slides"],
            [`${resourcePrefix}_Student_Task_Sheet.docx`, "Student Task Sheet"],
            [`${resourcePrefix}_Student_Evidence_Brief.docx`, "Student Evidence Brief"]
        ]
        : yearBand === "Y7-8"
            ? [
                [`${resourcePrefix}_Student_Slides.pptx`, "Student Slides"],
                [`${resourcePrefix}_Student_Task_Sheet.docx`, "Student Task Sheet"]
            ]
            : yearBand === "Y9-10"
                ? [[`${resourcePrefix}_Student_Slides.pptx`, "Student Slides"]]
                : [];
    resourceFiles.forEach(([filePath, label]) => {
        const href = `/${filePath.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
        addLink(`${label} (${yearBand})`, href);
    });
    (Array.isArray(plan?.attachedResources) ? plan.attachedResources : []).forEach((resource) => {
        const label = String(resource?.label || "Attached resource").trim();
        const href = String(resource?.url || "").trim();
        if (label && href) addLink(label, href);
    });
    if (plan?.exemplar?.label && plan?.exemplar?.url) {
        addLink(`Exemplar: ${plan.exemplar.label}`, plan.exemplar.url);
    }

    attachedResourcesList.innerHTML = "";
    [...links, ...resources.filter((resource) => !/UN Ozone Day|Montreal Protocol|NZ Ministry for the Environment/i.test(resource)).map((label) => ({ label }))]
        .forEach((resource) => {
            const item = document.createElement("li");
            if (resource.href) {
                const link = document.createElement("a");
                link.href = resource.href;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = resource.label;
                item.appendChild(link);
            } else {
                item.textContent = resource.label;
            }
            attachedResourcesList.appendChild(item);
        });

    attachedResourcesBox.hidden = attachedResourcesList.children.length === 0;
}

function renderExemplar(courseCode, lessonTitle) {
    if (!exemplarBox || !exemplarDescription || !exemplarLink || !exemplarFrame) return;

    const normalizedCourse = String(courseCode || "").trim().toUpperCase();
    const yearBand = normalizedCourse === "JDTECH" ? "Y7-8" : normalizedCourse === "SENIORDTECH" ? "Y11-13" : "Y9-10";
    if (!/ozone/i.test(String(lessonTitle || ""))) {
        exemplarBox.hidden = true;
        return;
    }

    const filePath = `/TeacherFiles/Lesson%20Plans/Ozone_Exemplar_${yearBand}.pptx`;
    exemplarDescription.textContent = `Ozone Layer digital outcome exemplar for ${yearBand}.`;
    const absoluteFileUrl = `${window.location.origin}${filePath}`;
    exemplarLink.href = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(absoluteFileUrl)}`;
    exemplarFrame.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteFileUrl)}`;
    exemplarLink.textContent = "Open slideshow exemplar in new tab";
    exemplarLink.title = `Open ${yearBand} Ozone slideshow exemplar`;
    exemplarBox.hidden = false;
}

function reliefAuthHeaders() {
    try {
        const raw = localStorage.getItem("hub_google_auth_v1") || sessionStorage.getItem("hub_google_auth_v1");
        const auth = raw ? JSON.parse(raw) : {};
        const headers = { "x-user-email": String(auth?.profile?.email || "").trim().toLowerCase() };
        const token = String(auth?.idToken || "").trim();
        if (token.startsWith("eyJ") && token.split(".").length === 3) headers.Authorization = `Bearer ${token}`;
        return headers;
    } catch (_error) {
        return {};
    }
}

function setText(id, value) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = String(value || "Not provided");
}

function escapeLessonHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderRequiredResources(value, courseCode) {
    const resourceElement = document.querySelector("#relief-lesson-resources");
    if (!resourceElement) return;

    const normalizedCourse = String(courseCode || "").trim().toUpperCase();
    const yearBand = normalizedCourse === "JDTECH" ? "Y7-8" : normalizedCourse === "SENIORDTECH" ? "Y11-13" : "Y9-10";
    const fileName = normalizedCourse === "SENIORDTECH"
        ? `Ozone_Exemplar_${yearBand}.pptx`
        : `Ozone_Day_${yearBand}_Student_Slides.pptx`;
    const resourceHref = `/TeacherFiles/Lesson%20Plans/${encodeURIComponent(fileName)}`;
    let safeText = escapeLessonHtml(value);
    const googleResourceLabel = /Google Drawings/i.test(String(value || ""))
        ? "Google Slides or Google Drawings"
        : "Google Slides or Google Docs";
    safeText = safeText.replace(
        new RegExp(googleResourceLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `<a href="${resourceHref}" target="_blank" rel="noopener noreferrer">${googleResourceLabel}</a>`
    );
    resourceElement.innerHTML = safeText;
}

function renderLesson(lesson, courseCode) {
    const plan = lesson.lesson_plan && typeof lesson.lesson_plan === "object" ? lesson.lesson_plan : {};
    renderAttachedResources(plan, courseCode, lesson.lesson_title || lesson.activity_name);
    renderExemplar(courseCode, lesson.lesson_title || lesson.activity_name);
    setText("relief-lesson-title", lesson.lesson_title || lesson.activity_name);
    setText("relief-lesson-course", courseCode);
    setText("relief-lesson-unit", plan.unit || lesson.lesson_title);
    setText("relief-lesson-component", plan.component || lesson.lesson_type);
    setText("relief-lesson-theme", plan.theme);
    setText("relief-lesson-date", lesson.lesson_date);
    setText("relief-lesson-aim", plan.aim || lesson.lesson_focus);
    renderRequiredResources(plan.resources, courseCode);
    setText("relief-lesson-preparation", plan.preparation);
    setText("relief-lesson-safety", plan.healthSafety);
    setText("relief-lesson-starter", plan.starter);
    setText("relief-lesson-demonstration", plan.demonstration);
    setText("relief-lesson-practice", plan.practice);
    setText("relief-lesson-plenary", plan.plenary);
    setText("relief-lesson-homework", plan.homework);
    setText("relief-lesson-evaluation", plan.evaluation);
    setReliefLessonDocumentTitle();
    lessonContent.hidden = false;
}

function findMatchingReliefLesson(lessons, eventTitle, eventDate) {
    const list = Array.isArray(lessons) ? lessons : [];
    if (!list.length) return null;
    const normalizedTitle = String(eventTitle || "").trim().toLowerCase();
    const normalizedDate = String(eventDate || "").trim();
    if (!normalizedTitle && !normalizedDate) return list[0];

    const titleMatch = list.find((lesson) => String(lesson?.lesson_title || "").trim().toLowerCase() === normalizedTitle);
    if (titleMatch) return titleMatch;

    const dateMatch = list.find((lesson) => String(lesson?.lesson_date || "").trim() === normalizedDate);
    if (dateMatch) return dateMatch;

    const partialMatch = normalizedTitle
        ? list.find((lesson) => {
            const lessonTitle = String(lesson?.lesson_title || "").trim().toLowerCase();
            return lessonTitle && (lessonTitle.includes(normalizedTitle) || normalizedTitle.includes(lessonTitle));
        })
        : null;
    if (partialMatch) return partialMatch;

    return list[0];
}

async function loadReliefLesson() {

    const params = new URLSearchParams(window.location.search);
    const courseCode = String(params.get("course") || "JDTECH").trim().toUpperCase();
    const eventTitle = String(params.get("event") || "").trim();
    const eventDate = String(params.get("date") || "").trim();
    try {
        const response = await fetch(`/api/relief-lessons/${encodeURIComponent(courseCode)}`, { headers: reliefAuthHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load Relief Lessons.");
        const lesson = findMatchingReliefLesson(data.lessons, eventTitle, eventDate);
        if (!lesson) {
            renderLesson({
                lesson_title: eventTitle || `Relief Lesson - ${courseCode}`,
                lesson_year_level: courseCode,
                lesson_date: eventDate,
                lesson_type: "Technology",
                lesson_plan: {
                    unit: eventTitle || "Relief Lesson",
                    component: "Technology"
                }
            }, courseCode);
            lessonStatus.textContent = "Blank lesson plan ready for this class and event. Complete it through Upload Relief Lesson to save it to the database.";
            return;
        }
        renderLesson(lesson, courseCode);
        lessonStatus.hidden = true;
    } catch (error) {
        lessonStatus.textContent = error.message;
    }
}

loadReliefLesson();
