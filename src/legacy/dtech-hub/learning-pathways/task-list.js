"use strict";

const pathwayTaskList = document.querySelector("#pathway-task-list");
const pathwayTaskStatus = document.querySelector("#pathway-task-status");
const pathwayTaskRetry = document.querySelector("#pathway-task-retry");
let pathwayTaskRequest = 0;

async function renderPathwayTaskList() {
    const request = ++pathwayTaskRequest;
    pathwayTaskList.replaceChildren();
    pathwayTaskList.hidden = true;
    pathwayTaskRetry.hidden = true;
    if (!hasAllowedSignedInHubAccount()) {
        pathwayTaskStatus.textContent = "Sign in with your school account to see your Task List.";
        return;
    }
    const panel = document.querySelector("#hub-global-sidebar");
    const course = panel?.dataset.course || "";
    if (panel?.dataset.courseStatus === "error") {
        pathwayTaskStatus.textContent = "Your course could not be loaded. Please retry.";
        pathwayTaskRetry.hidden = false;
        return;
    }
    if (!course) {
        pathwayTaskStatus.textContent = panel?.dataset.courseStatus === "ready"
            ? "Your course is not confirmed yet. Complete your course check-in first."
            : "Checking your course...";
        return;
    }
    if (course !== "JuniorDTECH") {
        pathwayTaskStatus.textContent = course === "SeniorDTECH"
            ? "Your SeniorDTECH Task List is available using the green Task List button above."
            : "This Task List is for JuniorDTECH. The MiddleDTECH Task List has not been set up yet.";
        return;
    }
    pathwayTaskStatus.textContent = "Loading your learning pathways...";
    const progressRequest = fetch("/api/learning-pathways/activity-progress", {
        cache: "no-store", headers: withHubAuthHeaders()
    }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.tracked) || typeof data.progress !== "object" || data.progress === null) {
            throw new Error("Activity progress is invalid.");
        }
        return data;
    });
    progressRequest.catch(() => {});
    try {
        const response = await fetch("/learning-pathways/library.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cards = await response.json();
        if (!Array.isArray(cards) || cards.some((card) => !card || typeof card.title !== "string"
            || !card.title.trim() || typeof card.yearLevel !== "string")) {
            throw new Error("Learning Pathways library is invalid.");
        }
        let progress = null;
        try {
            progress = await progressRequest;
        } catch (error) {
            console.error("Could not load activity progress", error);
        }
        if (request !== pathwayTaskRequest) return;
        const juniorCards = cards.filter((card) => card.yearLevel === "Junior DTECH" && !["unit", "lesson", "activity"].includes(card.cardType))
            .sort((left, right) => left.title.localeCompare(right.title));
        let activityCount = 0;
        for (const card of juniorCards) {
            const item = document.createElement("li");
            item.className = "pathway-task-strand";
            const head = document.createElement("div");
            head.className = "pathway-task-strand-head";
            const heading = document.createElement("h3");
            heading.textContent = card.title;
            head.append(heading);
            item.append(head);
            const activities = (progress?.tracked || []).filter((activity) => activity && activity.strand === card.id
                && typeof activity.title === "string" && typeof activity.href === "string" && activity.href.startsWith("/"));
            if (activities.length) {
                const body = document.createElement("div");
                body.className = "pathway-task-strand-body";
                body.id = `pathway-task-body-${String(card.id || activityCount).replace(/[^a-z0-9-]/gi, "")}`;
                const groups = new Map();
                for (const activity of activities) {
                    const unitTitle = typeof activity.unitTitle === "string" ? activity.unitTitle : "";
                    const lessonLabel = typeof activity.lessonLabel === "string" ? activity.lessonLabel : "";
                    const key = `${unitTitle}\n${lessonLabel}`;
                    if (!groups.has(key)) groups.set(key, { unitTitle, lessonLabel, activities: [] });
                    groups.get(key).activities.push(activity);
                }
                let doneCount = 0;
                for (const group of groups.values()) {
                    const unit = document.createElement("div");
                    unit.className = "pathway-task-unit";
                    if (group.unitTitle || group.lessonLabel) {
                        const unitHead = document.createElement("div");
                        unitHead.className = "pathway-task-unit-head";
                        const unitTitle = document.createElement("h4");
                        unitTitle.textContent = group.unitTitle;
                        unitHead.append(unitTitle);
                        if (group.lessonLabel) {
                            const lesson = document.createElement("span");
                            lesson.className = "pathway-task-lesson";
                            lesson.textContent = group.lessonLabel;
                            unitHead.append(lesson);
                        }
                        unit.append(unitHead);
                    }
                    const activityList = document.createElement("ul");
                    activityList.className = "pathway-task-activities";
                    for (const activity of group.activities) {
                        const saved = progress.progress[activity.id];
                        const done = saved?.completed === true;
                        const started = Boolean(saved) && !done;
                        if (done) doneCount++;
                        const row = document.createElement("li");
                        row.className = done ? "pathway-task-activity is-complete" : "pathway-task-activity";
                        const main = document.createElement("div");
                        main.className = "pathway-task-card-main";
                        const icon = document.createElement("span");
                        icon.className = "pathway-task-icon";
                        icon.setAttribute("aria-hidden", "true");
                        icon.textContent = done ? "\u2713" : "";
                        const text = document.createElement("div");
                        text.className = "pathway-task-card-text";
                        const title = document.createElement("span");
                        title.className = "pathway-task-title";
                        title.textContent = activity.title;
                        const required = document.createElement("span");
                        required.className = "pathway-task-required";
                        required.textContent = activity.required === false ? "Optional activity" : "Required activity";
                        text.append(title, required);
                        const state = document.createElement("span");
                        state.className = "pathway-task-state";
                        state.textContent = done ? "Completed" : started ? "In progress" : "To do";
                        main.append(icon, text, state);
                        const foot = document.createElement("div");
                        foot.className = "pathway-task-card-foot";
                        const note = document.createElement("span");
                        note.className = "pathway-task-saved";
                        note.textContent = done ? "Student answers saved" : started ? "Answers saved \u2013 keep going" : "Not started yet";
                        const link = document.createElement("a");
                        link.className = "pathway-task-open";
                        link.href = activity.href;
                        link.textContent = done ? "View work" : started ? "Continue activity" : "Start activity";
                        link.setAttribute("aria-label", `${link.textContent}: ${activity.title}`);
                        foot.append(note, link);
                        row.append(main, foot);
                        activityList.append(row);
                        activityCount++;
                    }
                    unit.append(activityList);
                    body.append(unit);
                }
                const count = document.createElement("span");
                count.className = doneCount === activities.length ? "pathway-task-count is-all-done" : "pathway-task-count";
                count.textContent = `${doneCount} of ${activities.length} complete`;
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "pathway-task-toggle";
                toggle.setAttribute("aria-expanded", "true");
                toggle.setAttribute("aria-controls", body.id);
                toggle.setAttribute("aria-label", `Hide ${card.title} activities`);
                toggle.addEventListener("click", () => {
                    body.hidden = !body.hidden;
                    toggle.setAttribute("aria-expanded", String(!body.hidden));
                    toggle.setAttribute("aria-label", `${body.hidden ? "Show" : "Hide"} ${card.title} activities`);
                });
                head.append(count, toggle);
                item.append(body);
            }
            pathwayTaskList.append(item);
        }
        pathwayTaskList.hidden = juniorCards.length === 0;
        if (juniorCards.length && !progress) {
            pathwayTaskStatus.textContent = "Your learning pathways are listed below. Your activity progress could not be loaded. Please retry.";
            pathwayTaskRetry.hidden = false;
        } else {
            pathwayTaskStatus.textContent = !juniorCards.length
                ? "No JuniorDTECH learning pathways have been added yet."
                : activityCount
                    ? "Complete the activities listed under each learning pathway."
                    : "Your learning pathways are listed below. Tasks will be added later.";
        }
    } catch (error) {
        console.error("Could not load pathway Task List", error);
        if (request !== pathwayTaskRequest) return;
        pathwayTaskStatus.textContent = "Your learning pathways could not be loaded. Please retry.";
        pathwayTaskRetry.hidden = false;
    }
}

pathwayTaskRetry.addEventListener("click", () => {
    const panel = document.querySelector("#hub-global-sidebar");
    if (panel?.dataset.courseStatus === "error") {
        void loadAndRenderSidebarCourse(panel);
    } else {
        void renderPathwayTaskList();
    }
});
window.addEventListener("hub-course-resolved", () => { void renderPathwayTaskList(); });
window.addEventListener("hub-auth-state-changed", () => { void renderPathwayTaskList(); });
document.addEventListener("DOMContentLoaded", () => { void renderPathwayTaskList(); });
