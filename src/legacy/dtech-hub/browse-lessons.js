const reliefPlanCalendar = document.querySelector("#relief-plan-calendar");
const reliefPlanDetails = document.querySelector("#relief-plan-details");
const reliefPlanDescription = document.querySelector("#relief-plan-description");
const reliefPlanStatus = document.querySelector("#relief-plan-status");
const reliefPlanMonthLabel = document.querySelector("#relief-plan-month-label");
const reliefPlanDate = document.querySelector("#relief-plan-date");
const reliefPlanPrevious = document.querySelector("#relief-plan-previous");
const reliefPlanToday = document.querySelector("#relief-plan-today");
const reliefPlanFirstEvent = document.querySelector("#relief-plan-first-event");
const reliefPlanNext = document.querySelector("#relief-plan-next");
const reliefPlanEventMonth = document.querySelector("#relief-plan-event-month");

let reliefPlanEvents = [];
let reliefPlanViewDate = new Date();
let reliefPlanLoaded = false;
let reliefPlanLoadInFlight = false;

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function parseReliefDate(value) {
    const rawValue = String(value || "").trim();
    const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }

    // The Learning Sites Relief Plan exports dates as MM/DD/YYYY.
    const csvMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!csvMatch) return null;
    return new Date(Number(csvMatch[3]), Number(csvMatch[1]) - 1, Number(csvMatch[2]));
}

function isoDate(date) {
    return date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-") : "";
}

function formatDate(value) {
    const date = parseReliefDate(value);
    return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : value;
}

function getEventMonths() {
    return [...new Set(reliefPlanEvents
        .map((event) => parseReliefDate(event.startDate))
        .filter(Boolean)
        .map((date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`))]
        .sort();
}

function renderEventMonthOptions() {
    const currentValue = reliefPlanEventMonth.value;
    reliefPlanEventMonth.innerHTML = '<option value="">Event month</option>';
    getEventMonths().forEach((monthKey) => {
        const [year, month] = monthKey.split("-").map(Number);
        const option = document.createElement("option");
        option.value = monthKey;
        option.textContent = new Date(year, month - 1, 1).toLocaleDateString(undefined, { year: "numeric", month: "long" });
        reliefPlanEventMonth.appendChild(option);
    });
    reliefPlanEventMonth.value = getEventMonths().includes(currentValue) ? currentValue : "";
}

function renderDetails(event) {
    const source = event.source
        ? `<p><strong>Source:</strong> <a href="${escapeHtml(event.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.source)}</a></p>`
        : "";
    const date = `<strong>${escapeHtml(formatDate(event.startDate))}</strong>${event.endDate && event.endDate !== event.startDate ? ` to <strong>${escapeHtml(formatDate(event.endDate))}</strong>` : ""}`;

    reliefPlanDetails.innerHTML = `
        <h2>${escapeHtml(event.subject)}</h2>
        <p class="relief-library-detail-date">${date}</p>
        ${event.location ? `<p><strong>Location:</strong> ${escapeHtml(event.location)}</p>` : ""}
        ${event.technologyContext ? `<p><strong>Technology context:</strong> ${escapeHtml(event.technologyContext)}</p>` : ""}
        ${source}
    `;

    const aboutText = event.aboutTheEvent || event.description || "No description available for this event.";
    reliefPlanDescription.innerHTML = `
        <h2>Event Description</h2>
        <p>${escapeHtml(aboutText).replace(/\n/g, "<br>")}</p>
    `;
    updateReliefLessonLinks(event);
}

function getReliefTopicShortName(subject) {
    const value = String(subject || "").trim();
    if (!value) return "";
    return value
        .replace(/^international day for the preservation of the /i, "")
        .replace(/^international day of /i, "")
        .replace(/^international /i, "")
        .replace(/^world /i, "")
        .trim() || value;
}

function updateReliefLessonLinks(event) {
    if (!event) return;
    const topic = getReliefTopicShortName(event.subject);
    document.querySelectorAll(".relief-library-lessons a[data-course-code]").forEach((link) => {
        const params = new URLSearchParams({
            course: link.dataset.courseCode,
            event: String(event.subject || ""),
            date: String(event.startDate || "")
        });
        link.href = `relief-lesson.html?${params.toString()}`;
        const baseLabel = link.dataset.baseLabel || link.textContent;
        link.textContent = topic ? `${baseLabel} - ${topic}` : baseLabel;
    });
}

function isEventToday(event) {
    const start = parseReliefDate(event?.startDate);
    const end = parseReliefDate(event?.endDate || event?.startDate);
    if (!start || !end) return false;

    const today = new Date();
    const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() <= todayTime
        && new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() >= todayTime;
}

function renderCalendar() {
    const year = reliefPlanViewDate.getFullYear();
    const month = reliefPlanViewDate.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const todayKey = isoDate(new Date());
    const byDate = new Map();

    reliefPlanEvents.forEach((event, index) => {
        const key = isoDate(parseReliefDate(event.startDate));
        if (!key) return;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push({ event, index });
    });

    const cells = [];
    for (let index = 0; index < offset; index += 1) cells.push('<div class="relief-library-day relief-library-day-empty"></div>');
    for (let day = 1; day <= days; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = isoDate(date);
        const events = byDate.get(dateKey) || [];
        const todayClass = dateKey === todayKey ? " relief-library-day-today" : "";
        const eventButtons = events.length
            ? events.map(({ event, index }) => `<button class="relief-library-event" type="button" data-event-index="${index}" title="${escapeHtml(event.subject)}">${escapeHtml(event.subject)}</button>`).join("")
            : '<span class="relief-library-no-event">No events</span>';
        cells.push(`<div class="relief-library-day${todayClass}"><time datetime="${dateKey}">${day}</time>${eventButtons}</div>`);
    }

    reliefPlanMonthLabel.textContent = first.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    const today = new Date();
    reliefPlanDate.value = year === today.getFullYear() && month === today.getMonth()
        ? isoDate(today)
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    reliefPlanCalendar.innerHTML = `
        <div class="relief-library-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        <div class="relief-library-days">${cells.join("")}</div>
    `;
    reliefPlanCalendar.querySelectorAll("[data-event-index]").forEach((button) => {
        button.addEventListener("click", () => renderDetails(reliefPlanEvents[Number(button.dataset.eventIndex)]));
    });
}

async function loadReliefPlan() {
    if (reliefPlanLoaded || reliefPlanLoadInFlight) return;

    const storedAuth = readStoredReliefPlanAuth();
    if (!storedAuth) {
        reliefPlanStatus.textContent = "School sign-in required to load calendar events.";
        return;
    }

    reliefPlanLoadInFlight = true;
    try {
        const requestHeaders = { "x-user-email": storedAuth.email };
        if (storedAuth.isIdToken) {
            requestHeaders.Authorization = `Bearer ${storedAuth.token}`;
        }
        const response = await fetch("/api/relief-plan/events", {
            credentials: "same-origin",
            headers: requestHeaders
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || "The Relief Plan is currently unavailable.");
        reliefPlanEvents = Array.isArray(data.events) ? data.events : [];
        reliefPlanLoaded = true;
        renderEventMonthOptions();
        reliefPlanStatus.textContent = `${reliefPlanEvents.length} events loaded for ${data.year || "the shared calendar"}.`;
        renderCalendar();
        openRequestedReliefPlanEvent();
    } catch (error) {
        reliefPlanStatus.textContent = error.message;
        if (!reliefPlanLoaded) {
            reliefPlanCalendar.innerHTML = '<p class="relief-library-empty">The shared Relief Plan calendar could not be loaded.</p>';
        }
    } finally {
        reliefPlanLoadInFlight = false;
    }
}

function openRequestedReliefPlanEvent() {
    const params = new URLSearchParams(window.location.search);
    const requestedSubject = String(params.get("event") || "").trim().toLowerCase();
    const requestedDate = String(params.get("date") || "").trim();
    const matchingEvent = requestedSubject
        ? reliefPlanEvents.find((event) =>
            String(event?.subject || "").trim().toLowerCase() === requestedSubject
            && (!requestedDate || String(event?.startDate || "").trim() === requestedDate)
        )
        : reliefPlanEvents.find((event) => isEventToday(event));
    if (!matchingEvent) return;

    const eventDate = parseReliefDate(matchingEvent.startDate);
    if (eventDate) {
        reliefPlanViewDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
        renderCalendar();
    }
    renderDetails(matchingEvent);
}

function readStoredReliefPlanAuth() {
    if (window.whsDtech) return { email: window.whsDtech.profile.email, token: "", isIdToken: false };
    try {
        const raw = localStorage.getItem("hub_google_auth_v1") || sessionStorage.getItem("hub_google_auth_v1");
        const parsed = raw ? JSON.parse(raw) : null;
        const idToken = String(parsed?.idToken || "").trim();
        const token = idToken || String(parsed?.accessToken || "").trim();
        const email = String(parsed?.profile?.email || "").trim().toLowerCase();
        const expiresAt = Number(parsed?.expiresAt || 0);
        return token && email && expiresAt > Date.now()
            ? { token, email, isIdToken: idToken.startsWith("eyJ") && idToken.split(".").length === 3 }
            : null;
    } catch (_error) {
        return null;
    }
}

reliefPlanPrevious.addEventListener("click", () => {
    reliefPlanViewDate = new Date(reliefPlanViewDate.getFullYear(), reliefPlanViewDate.getMonth() - 1, 1);
    renderCalendar();
});

reliefPlanNext.addEventListener("click", () => {
    reliefPlanViewDate = new Date(reliefPlanViewDate.getFullYear(), reliefPlanViewDate.getMonth() + 1, 1);
    renderCalendar();
});

reliefPlanToday.addEventListener("click", () => {
    reliefPlanViewDate = new Date();
    renderCalendar();
});

reliefPlanFirstEvent.addEventListener("click", () => {
    const firstEvent = reliefPlanEvents
        .map((event) => parseReliefDate(event.startDate))
        .filter(Boolean)
        .sort((left, right) => left - right)[0];
    if (!firstEvent) return;
    reliefPlanViewDate = new Date(firstEvent.getFullYear(), firstEvent.getMonth(), 1);
    renderCalendar();
});

reliefPlanEventMonth.addEventListener("change", () => {
    const [year, month] = String(reliefPlanEventMonth.value || "").split("-").map(Number);
    if (!year || !month) return;
    reliefPlanViewDate = new Date(year, month - 1, 1);
    renderCalendar();
});

reliefPlanDate.addEventListener("change", () => {
    if (!reliefPlanDate.value) return;
    const selected = new Date(`${reliefPlanDate.value}T00:00:00`);
    reliefPlanViewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderCalendar();
});

reliefPlanCalendar.innerHTML = '<p class="relief-library-empty">Loading the shared Relief Plan calendar...</p>';
window.addEventListener("hub-auth-state-changed", (event) => {
    if (event.detail?.signedIn) loadReliefPlan();
});
loadReliefPlan();
