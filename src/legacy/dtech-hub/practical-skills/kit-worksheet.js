(() => {
    "use strict";

    const AUTH_STORAGE_KEY = "hub_google_auth_v1";
    const RESPONSE_SAVE_DEBOUNCE_MS = 800;

    const state = {
        email: "",
        kitId: "",
        content: null,
        responses: {},
        completedActivities: {},
        progressLoaded: false,
        progressWritePromise: Promise.resolve(),
        actionsWired: false,
        signInWatcherId: 0,
        saveTimerId: 0,
        searchAutoMarkTimerId: 0,
        searchChoiceCheckTimers: {},
        searchChoiceCheckRevisions: {},
        driveSetup: null,
        huntProfile: null,
        certificate: null,
        driveSetupInProgress: false
    };

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getKitIdFromUrl() {
        const params = new URLSearchParams(window.location.search || "");
        return String(params.get("kit") || "kit-login").trim();
    }

    function getActivityIndexFromUrl() {
        const value = new URLSearchParams(window.location.search || "").get("activity");
        if (value === null || !/^\d+$/.test(value)) return null;
        const index = Number.parseInt(value, 10);
        const mergedInto = state.content?.worksheets?.[index]?.mergedInto;
        const resolvedIndex = Number.isInteger(mergedInto) ? mergedInto : index;
        const worksheet = state.content?.worksheets?.[resolvedIndex];
        return worksheet?.hidden && !worksheet.libraryOnly ? null : resolvedIndex;
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

    function getSignedInEmail() {
        const raw = getStoredAuthRaw();
        if (!raw) return "";
        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
                return "";
            }
            return normalizeEmail(parsed?.profile?.email || "");
        } catch (_error) {
            return "";
        }
    }

    function withAuthHeaders(headers = {}) {
        const next = state.email ? { ...headers, "x-user-email": state.email } : { ...headers };
        const raw = getStoredAuthRaw();
        if (raw) {
            const auth = JSON.parse(raw);
            if (auth.idToken) next.Authorization = `Bearer ${auth.idToken}`;
        }
        return next;
    }

    function showStatusMessage(message, isError = false) {
        const node = document.getElementById("worksheet-status-message");
        if (!node) return;
        if (!message) {
            node.hidden = true;
            node.textContent = "";
            node.classList.remove("is-error");
            return;
        }
        node.hidden = false;
        node.textContent = message;
        node.classList.toggle("is-error", Boolean(isError));
    }

    async function loadJson(url, options = {}) {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || `Request failed (${response.status})`);
        }
        return payload;
    }

    function fetchKitContent(kitId) {
        return loadJson(`/api/practical-skills/kit-content/${encodeURIComponent(kitId)}`);
    }

    function fetchKitProgress(kitId) {
        return loadJson(`/api/practical-skills/progress/${encodeURIComponent(kitId)}`, { headers: withAuthHeaders() });
    }

    function completeKit(kitId) {
        return loadJson(`/api/practical-skills/progress/${encodeURIComponent(kitId)}/complete`, {
            method: "POST",
            headers: withAuthHeaders()
        });
    }

    function resetKit(kitId) {
        return loadJson(`/api/practical-skills/progress/${encodeURIComponent(kitId)}/reset`, {
            method: "POST",
            headers: withAuthHeaders()
        });
    }

    function saveResponses(kitId, responses) {
        return loadJson(`/api/practical-skills/progress/${encodeURIComponent(kitId)}/responses`, {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ responses })
        });
    }

    function queueProgressWrite(write) {
        state.progressWritePromise = state.progressWritePromise.then(write, write);
        return state.progressWritePromise;
    }

    function getCurrentActivityIndex() {
        const index = getActivityIndexFromUrl();
        return index !== null && state.content?.worksheets?.[index] ? index : null;
    }

    function updateActivityCompleteBar() {
        const bar = document.getElementById("worksheet-activity-complete-bar");
        const pill = document.getElementById("worksheet-activity-status-pill");
        const button = document.getElementById("worksheet-activity-complete-btn");
        const index = getCurrentActivityIndex();
        bar.hidden = !state.email || index === null;
        const completed = Boolean(state.completedActivities[index]);
        const activity = state.content?.activities?.[index];
        const siteQuestions = window.KitWorksheetRender.visibleLoginSites(activity?.loginSites, state.huntProfile).some((site) => site.readinessQuestion);
        const selfMarking = Boolean(activity?.assessment || activity?.identityLessonVersion ||
            activity?.questionAutoMarkAssessmentId || activity?.researchReport || siteQuestions);
        pill.textContent = completed ? "Completed" : "Not Completed";
        pill.classList.toggle("is-complete", completed);
        if (completed) {
            pill.setAttribute("href", `./kit-worksheet.html?kit=${encodeURIComponent(state.kitId)}`);
            pill.setAttribute("aria-label", "Completed - return to kit activity menu");
            pill.setAttribute("title", "Return to kit activity menu");
        } else {
            pill.removeAttribute("href");
            pill.removeAttribute("aria-label");
            pill.removeAttribute("title");
        }
        button.textContent = completed ? "Undo Completion" : siteQuestions ? "Check Activity Completion" : "Mark Activity Complete";
        button.disabled = !state.progressLoaded;
        button.hidden = selfMarking && !siteQuestions && !completed;
    }

    async function checkLoginSiteCompletion(index, answers) {
        return queueProgressWrite(async () => {
            const payload = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${index}/check`, {
                method: "POST",
                headers: withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ answers })
            });
            const key = `${index}-login-sites-readiness-v1`;
            state.responses[key] = { ...state.responses[key], ...payload.answers };
            state.completedActivities = payload.completedActivities;
            updateActivityCompleteBar();
            return payload;
        });
    }

    function showLoginSiteCompletionResult(grade) {
        if (grade.passed) {
            showStatusMessage("Activity complete! Your activity tick has been saved.");
            return;
        }
        const sites = state.content.activities[getCurrentActivityIndex()].loginSites;
        const remaining = grade.results.filter((result) => !result.correct).map((result) =>
            sites.find((site) => site.readinessQuestion?.id === result.id)?.name || result.id);
        showStatusMessage(remaining.length ? `Not completed yet. Check these app answers: ${remaining.join(", ")}.` : "No app questions are enabled. Use Mark Activity Complete after exploring the websites.");
    }

    function queueResponseSave() {
        if (!state.email) return;
        window.clearTimeout(state.saveTimerId);
        state.saveTimerId = window.setTimeout(() => {
            queueProgressWrite(() => saveResponses(state.kitId, state.responses)).catch(() => {
                showStatusMessage("Could not save your answers. Check your connection and try again.", true);
            });
        }, RESPONSE_SAVE_DEBOUNCE_MS);
    }

    function setSearchChoiceFeedback(questionId, message, status) {
        const feedback = Array.from(document.querySelectorAll("[data-question-feedback]")).find((node) =>
            node.getAttribute("data-question-feedback") === questionId);
        if (!feedback) return;
        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.remove("is-correct", "is-retry", "is-pending", "is-error");
        feedback.classList.add(status);
    }

    const SEARCH_AND_FIND_FEEDBACK = {
        "search-find-giant-tree": "You found it! The kahikatea is New Zealand's tallest native tree. Great searching!",
        "search-find-gold-rush-town": "You found it! Ross is the historic gold-mining town south of Hokitika. Great searching!",
        "search-find-mountain-bird": "You found it! Roroa is the Māori name for the great spotted kiwi. Great searching!",
        "search-find-pancake-rocks": "You found it! The Pancake Rocks are made of limestone. Great searching!",
        "search-find-glacier-mystery": "You found it! Kā Roimata o Hine Hukatere is the Māori name for Franz Josef Glacier. Great searching!"
    };

    function searchAndFindFeedback(questionId, correct) {
        const baseId = Object.keys(SEARCH_AND_FIND_FEEDBACK).find((id) => questionId.endsWith(id));
        return correct
            ? SEARCH_AND_FIND_FEEDBACK[baseId] || "You found it! Great searching!"
            : "Good try! That's not quite it yet. Tap HINT or try different search words, then update your answer.";
    }

    function scheduleSearchChoiceCheck(activityIndex, assessmentId, questionId) {
        if (!["search-results-detective-v1", "search-and-find-v1"].includes(assessmentId)) return;
        const isTypedAnswer = assessmentId === "search-and-find-v1";
        if (isTypedAnswer && !String(state.responses[questionId] || "").trim()) {
            window.clearTimeout(state.searchChoiceCheckTimers[questionId]);
            state.searchChoiceCheckRevisions[questionId] = (state.searchChoiceCheckRevisions[questionId] || 0) + 1;
            const feedback = Array.from(document.querySelectorAll("[data-question-feedback]")).find((node) =>
                node.getAttribute("data-question-feedback") === questionId);
            if (feedback) feedback.hidden = true;
            return;
        }
        const itemLabel = isTypedAnswer ? "answer" : "choice";
        if (!state.email) {
            setSearchChoiceFeedback(questionId, `Sign in with your school account to check and save this ${itemLabel}. You can try again any time.`, "is-pending");
            return;
        }
        if (!state.progressLoaded) {
            setSearchChoiceFeedback(questionId, `Your ${itemLabel} is ready. We will check it as soon as your progress has loaded.`, "is-pending");
            return;
        }

        const revision = (state.searchChoiceCheckRevisions[questionId] || 0) + 1;
        state.searchChoiceCheckRevisions[questionId] = revision;
        window.clearTimeout(state.searchChoiceCheckTimers[questionId]);
        if (!isTypedAnswer) setSearchChoiceFeedback(questionId, "Checking your choice...", "is-pending");
        state.searchChoiceCheckTimers[questionId] = window.setTimeout(() => {
            if (isTypedAnswer) setSearchChoiceFeedback(questionId, "Checking your answer...", "is-pending");
            const answers = { ...state.responses };
            queueProgressWrite(async () => {
                await saveResponses(state.kitId, answers);
                const grade = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${activityIndex}/check`, {
                    method: "POST",
                    headers: withAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ answers })
                });
                state.completedActivities = grade.completedActivities;
                updateActivityCompleteBar();
                if (state.searchChoiceCheckRevisions[questionId] !== revision) return;
                const result = grade.results.find((entry) => entry.id === questionId);
                if (!result) throw new Error("This answer could not be checked. Refresh the activity and try again.");
                setSearchChoiceFeedback(questionId, isTypedAnswer
                    ? searchAndFindFeedback(questionId, result.correct)
                    : result.correct
                    ? questionId.endsWith("-search-result-doc-track")
                        ? "You found it! The Hokitika River flows through Hokitika Gorge. Great searching!"
                        : "Nice investigating! This result matches what you are looking for."
                    : "Good try! This result may not be the best match. Look for a result with the information in the question, then try again.",
                result.correct ? "is-correct" : "is-retry");
            }).catch(() => {
                if (state.searchChoiceCheckRevisions[questionId] !== revision) return;
                setSearchChoiceFeedback(questionId, `We could not check this ${itemLabel} just now. Your ${itemLabel} is still here—please try again in a moment.`, "is-error");
            });
        }, isTypedAnswer ? 900 : 250);
    }

    function showSavedSearchAndFindFeedback(activityIndex, questions) {
        if (!state.email || !state.progressLoaded) return;
        const answeredIds = questions.map((question) => question.id)
            .filter((id) => SEARCH_AND_FIND_FEEDBACK[id.replace(/^\d+-/, "")] && String(state.responses[id] || "").trim());
        if (!answeredIds.length) return;
        const revisions = Object.fromEntries(answeredIds.map((id) => [id, state.searchChoiceCheckRevisions[id] || 0]));
        queueProgressWrite(() => loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${activityIndex}/check`, {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ answers: { ...state.responses } })
        })).then((grade) => {
            state.completedActivities = grade.completedActivities;
            updateActivityCompleteBar();
            answeredIds.forEach((id) => {
                if ((state.searchChoiceCheckRevisions[id] || 0) !== revisions[id]) return;
                const result = grade.results.find((entry) => entry.id === id);
                if (result) setSearchChoiceFeedback(id, searchAndFindFeedback(id, result.correct), result.correct ? "is-correct" : "is-retry");
            });
        }).catch(() => {});
    }

    function scheduleSearchActivityAutoMark(activityIndex, assessmentId) {
        if (!state.email || !state.progressLoaded || state.completedActivities[activityIndex]) return;
        const baseQuestionIds = assessmentId === "search-keyword-challenge-v1"
            ? [
                "keyword-pounamu-treasure",
                "keyword-too-many-results",
                "keyword-glowworm-mystery",
                "keyword-fix-the-search",
                "keyword-hokitika-founded"
            ]
            : assessmentId === "search-and-find-v1"
                ? [
                    "search-find-giant-tree",
                    "search-find-gold-rush-town",
                    "search-find-mountain-bird",
                    "search-find-pancake-rocks",
                    "search-find-glacier-mystery"
                ]
            : assessmentId === "search-results-detective-v1"
                ? [
                    "search-result-clock-tower",
                    "search-result-pool-hours",
                    "search-result-wrong-place",
                    "search-result-glowworm-time",
                    "search-result-doc-track"
                ]
            : [
                "search-penguin-name",
                "search-korora-food-search",
                "search-tallest-mountain",
                "search-penguin-location",
                "search-penguin-safety"
            ];
        const questionIds = baseQuestionIds.map((id) => activityIndex === 0 ? id : `${activityIndex}-${id}`);
        if (questionIds.some((id) => !String(state.responses[id] || "").trim())) return;

        window.clearTimeout(state.searchAutoMarkTimerId);
        state.searchAutoMarkTimerId = window.setTimeout(() => {
            window.clearTimeout(state.saveTimerId);
            const answers = Object.fromEntries(questionIds.map((id) => [id, state.responses[id]]));
            queueProgressWrite(async () => {
                await saveResponses(state.kitId, state.responses);
                const grade = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${activityIndex}/check`, {
                    method: "POST",
                    headers: withAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ answers })
                });
                state.completedActivities = grade.completedActivities;
                updateActivityCompleteBar();
                showStatusMessage(assessmentId === "search-and-find-v1"
                    ? grade.passed
                        ? "Ka pai! You solved all five West Coast mysteries. Your activity tick is saved."
                        : "Keep investigating! Use the feedback under each mission to update your answers."
                    : grade.passed
                    ? "Ka pai! You found a useful result for every mission. Your activity tick is saved."
                    : "Keep investigating! Use the feedback beside each choice to try a different result.");
            }).catch((error) => {
                showStatusMessage(error?.message || "Could not check and save your answers. Please try again.", true);
            });
        }, 400);
    }

    function updateCompleteBar(kitSnapshot) {
        const bar = document.getElementById("worksheet-complete-bar");
        const pill = document.getElementById("worksheet-status-pill");
        const completeBtn = document.getElementById("worksheet-complete-btn");
        const resetBtn = document.getElementById("worksheet-reset-btn");
        if (!bar || !pill || !completeBtn || !resetBtn) return;

        if (!state.email) {
            bar.hidden = true;
            updateCertificate();
            return;
        }

        bar.hidden = getCurrentActivityIndex() !== null;
        const isComplete = Boolean(kitSnapshot?.isComplete);
        pill.textContent = isComplete ? "Completed" : "Not Started";
        pill.classList.toggle("is-complete", isComplete);
        completeBtn.disabled = isComplete;
        completeBtn.hidden = Boolean(state.content?.worksheets?.some((worksheet) => worksheet && !worksheet.hidden && !worksheet.libraryOnly && worksheet.mergedInto === undefined));
        updateCertificate();
    }

    function updateCertificate() {
        const host = document.getElementById("worksheet-certificate");
        if (!host) return;
        const certificate = state.certificate;
        host.hidden = !state.email || !certificate || getCurrentActivityIndex() !== null;
        if (host.hidden) return;
        const fields = {
            "certificate-student-name": certificate.studentName,
            "certificate-kit-title": certificate.kitTitle,
            "certificate-completion-details": `${certificate.activityCount} activities completed | ${certificate.completedDate}`,
            "certificate-issuer": certificate.issuer
        };
        for (const [id, value] of Object.entries(fields)) document.getElementById(id).textContent = value;
    }

    function certificateStatus(message, error = false) {
        const host = document.getElementById("certificate-status");
        host.textContent = message;
        host.classList.toggle("is-error", error);
    }

    function researchReportPath(activityIndex) {
        return `/api/practical-skills/research-report/${encodeURIComponent(state.kitId)}/${activityIndex}`;
    }

    async function getResearchReportDriveToken() {
        if (!window.requestHubDriveAccessToken) throw new Error("Google sign-in is still loading. Wait a moment and try again.");
        const email = state.email;
        const token = await window.requestHubDriveAccessToken();
        if (token?.error || !token?.access_token) {
            const message = String(token?.error || "");
            throw new Error(message.startsWith("Google ") ? message : "Google Drive permission was not granted. Try again, or ask your teacher for help.");
        }
        if (getSignedInEmail() !== email) throw new Error("Your signed-in account changed. Reopen this activity with your school account.");
        return token.access_token;
    }

    function renderPage() {
        const host = document.getElementById("worksheet-host");
        if (!host || !state.content) return;

        const activityIndex = getActivityIndexFromUrl();
        const worksheets = Array.isArray(state.content.worksheets) ? state.content.worksheets : [];
        const sitesSettings = document.getElementById("worksheet-sites-settings");
        if (sitesSettings) sitesSettings.hidden = !state.content.activities?.[activityIndex]?.loginSites || !state.huntProfile?.courseIds?.includes("STAFF");
        const backLink = document.getElementById("worksheet-back-link");
        const showingActivity = activityIndex !== null && Boolean(worksheets[activityIndex]);
        if (backLink) {
            backLink.href = showingActivity
                ? `./kit-worksheet.html?kit=${encodeURIComponent(state.kitId)}`
                : "/practical-skills/checklist.html";
            backLink.textContent = showingActivity ? "\u2190 Back to Kit Activity List" : "\u2190 Back to My Licence";
        }
        const verification = document.getElementById("worksheet-google-verification");
        if (verification) {
            host.after(verification);
            verification.hidden = !state.content.activities?.[activityIndex]?.identityLessonVersion;
        }
        if (worksheets.length && (activityIndex === null || !worksheets[activityIndex])) {
            window.KitWorksheetRender.renderKitOverview(host, state.content, {
                kitId: state.kitId,
                completedActivities: state.completedActivities,
                readOnly: !state.email,
                minecraftExports: state.kitId === "kit-minecraft",
                onMinecraftExportsOpen: async () => loadJson("/api/practical-skills/minecraft-exports-folder", {
                    method: "POST",
                    headers: withAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ driveAccessToken: await getResearchReportDriveToken() })
                })
            });
        } else {
            const worksheet = activityIndex === null ? null : worksheets[activityIndex];
            const activity = activityIndex === null ? null : state.content.activities?.[activityIndex];
            const isActivity = Boolean(worksheet);
            const questions = isActivity
                ? (Array.isArray(activity?.questions)
                    ? activity.questions.map((question) => activityIndex === 0
                        ? question
                        : { ...question, id: `${activityIndex}-${question.id}` })
                    : activityIndex === 0 ? state.content.questions || [] : [])
                : state.content.questions || [];
            const images = isActivity
                ? activity?.images || (activityIndex === 0 ? state.content.images || [] : [])
                : state.content.images || [];
            const activityContent = isActivity ? {
                ...state.content,
                bannerTitle: worksheet.activity || activity?.title || `Activity ${activityIndex + 1}`,
                bannerSubtitle: worksheet.establishes || activity?.establishes || "",
                questions,
                images,
                questionAutoMarkAssessmentId: activity?.questionAutoMarkAssessmentId,
                information: activity?.information,
                loginSites: activity?.loginSites,
                identityLessonVersion: activity?.identityLessonVersion,
                researchReport: activity?.researchReport,
                assessment: activity?.assessment
            } : state.content;
            const assessmentKey = `${activityIndex}-${activity?.assessment?.id || "login-sites-readiness-v1"}`;

            window.KitWorksheetRender.renderWorksheet(host, activityContent, {
                responses: state.responses,
                readOnly: !state.email,
                eyebrow: isActivity ? state.content.bannerTitle : "",
                identityVerified: Boolean(JSON.parse(getStoredAuthRaw() || "{}").idToken),
                driveSetup: state.driveSetup,
                huntProfile: state.huntProfile,
                onResearchReportStatus: () => loadJson(researchReportPath(activityIndex), { headers: withAuthHeaders() }),
                onResearchReportOpen: async () => loadJson(researchReportPath(activityIndex), {
                    method: "POST",
                    headers: withAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ driveAccessToken: await getResearchReportDriveToken() })
                }),
                onResearchReportCheck: async () => {
                    if (!state.progressLoaded) throw new Error("Your progress has not loaded. Refresh the page and try again.");
                    const driveAccessToken = await getResearchReportDriveToken();
                    return queueProgressWrite(async () => {
                        const payload = await loadJson(`${researchReportPath(activityIndex)}/check`, {
                            method: "POST",
                            headers: withAuthHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({ driveAccessToken })
                        });
                        state.responses[`${activityIndex}-${activity.researchReport.id}`] = payload.answers;
                        state.completedActivities = payload.completedActivities;
                        updateActivityCompleteBar();
                        return payload;
                    });
                },
                onDriveSetup: async () => {
                    if (!state.progressLoaded) throw new Error("Your progress has not loaded. Refresh the page and try again.");
                    if (!window.requestHubDriveAccessToken) throw new Error("Google sign-in is still loading. Wait a moment and try again.");
                    const email = state.email;
                    state.driveSetupInProgress = true;
                    try {
                        const token = await window.requestHubDriveAccessToken({ forceConsent: true });
                        if (token?.error || !token?.access_token) {
                            const message = String(token?.error || "");
                            throw new Error(message.startsWith("Google ") ? message : "Google Drive permission was not granted. Try again, or ask your teacher for help.");
                        }
                        if (getSignedInEmail() !== email) throw new Error("Your signed-in account changed. Reopen this activity with your school account.");
                        const setup = await loadJson("/api/student/login-drive-setup", {
                            method: "POST",
                            headers: withAuthHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({ driveAccessToken: token.access_token })
                        });
                        state.driveSetup = setup;
                        return setup;
                    } finally {
                        state.driveSetupInProgress = false;
                    }
                },
                onAssessmentChange: (answers) => {
                    state.responses[`${activityIndex}-${activity.assessment.id}`] = answers;
                    queueResponseSave();
                },
                onIdentityCheck: async (answers) => {
                    if (!state.progressLoaded) throw new Error("Your progress has not loaded. Refresh the page and try again.");
                    return queueProgressWrite(async () => {
                        const payload = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${activityIndex}/check`, {
                            method: "POST",
                            headers: withAuthHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({ answers })
                        });
                        Object.assign(state.responses, payload.answers);
                        state.completedActivities = payload.completedActivities;
                        updateActivityCompleteBar();
                        return payload;
                    });
                },
                assessmentAnswers: activity?.assessment || activity?.loginSites
                    ? state.responses[assessmentKey] || {}
                    : {},
                onAssessmentCheck: async (answers) => {
                    if (!state.progressLoaded) throw new Error("Your progress has not loaded. Refresh the page and try again.");
                    window.clearTimeout(state.saveTimerId);
                    if (activity?.loginSites) {
                        const payload = await checkLoginSiteCompletion(activityIndex, answers);
                        showLoginSiteCompletionResult(payload);
                        return payload;
                    }
                    // Course folder creation needs Drive permission; ask only once every answer is filled in, and never block the tick.
                    let driveAccessToken = "";
                    if (activity?.assessment?.id === "learning-sites-treasure-v1" &&
                        ["science", "english", "food", "pe", "dtech", "course", "course-clue-1", "course-clue-2"].every((id) => String(answers?.[id] || "").trim())) {
                        driveAccessToken = await getResearchReportDriveToken().catch(() => "");
                    }
                    return queueProgressWrite(async () => {
                        await saveResponses(state.kitId, state.responses);
                        const payload = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${activityIndex}/check`, {
                            method: "POST",
                            headers: withAuthHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify(driveAccessToken ? { answers, driveAccessToken } : { answers })
                        });
                        state.responses[assessmentKey] = payload.answers;
                        state.completedActivities = payload.completedActivities;
                        updateActivityCompleteBar();
                        if (payload.passed) showStatusMessage("Activity complete! Your activity tick has been saved.");
                        return payload;
                    });
                },
                onResponseChange: (questionId, value) => {
                    state.responses[questionId] = value;
                    queueResponseSave();
                    scheduleSearchChoiceCheck(activityIndex, activity?.questionAutoMarkAssessmentId, questionId);
                    if (["search-penguin-missions-v1", "search-keyword-challenge-v1", "search-results-detective-v1", "search-and-find-v1"].includes(activity?.questionAutoMarkAssessmentId)) {
                        scheduleSearchActivityAutoMark(activityIndex, activity.questionAutoMarkAssessmentId);
                    }
                }
            });
            if (["search-penguin-missions-v1", "search-keyword-challenge-v1", "search-results-detective-v1", "search-and-find-v1"].includes(activity?.questionAutoMarkAssessmentId)) {
                scheduleSearchActivityAutoMark(activityIndex, activity.questionAutoMarkAssessmentId);
            }
            if (activity?.questionAutoMarkAssessmentId === "search-and-find-v1") {
                showSavedSearchAndFindFeedback(activityIndex, questions);
            }
            if (verification && activityContent.identityLessonVersion) {
                host.querySelector("#identity-result").before(verification);
            }
        }

        updateActivityCompleteBar();
        showStatusMessage(
            state.email ? "" : "Sign in with your school Google account (top right) to save your answers and mark this kit complete."
        );
    }

    // Sign-in happens asynchronously via Google Identity Services after this script runs, so
    // poll briefly for a session rather than requiring a manual page refresh.
    function startSignInWatcher() {
        if (state.signInWatcherId || state.email) return;
        let attemptsLeft = 30;
        state.signInWatcherId = window.setInterval(() => {
            attemptsLeft -= 1;
            const email = getSignedInEmail();
            if (email) {
                window.clearInterval(state.signInWatcherId);
                state.signInWatcherId = 0;
                void init();
                return;
            }
            if (attemptsLeft <= 0) {
                window.clearInterval(state.signInWatcherId);
                state.signInWatcherId = 0;
            }
        }, 1000);
    }

    function wireActionButtons() {
        if (state.actionsWired) return;
        state.actionsWired = true;
        const completeBtn = document.getElementById("worksheet-complete-btn");
        const resetBtn = document.getElementById("worksheet-reset-btn");
        const activityCompleteBtn = document.getElementById("worksheet-activity-complete-btn");

        activityCompleteBtn.addEventListener("click", async () => {
            const index = getCurrentActivityIndex();
            if (index === null || !state.progressLoaded) return;
            const completed = !state.completedActivities[index];
            activityCompleteBtn.disabled = true;
            try {
                window.clearTimeout(state.saveTimerId);
                const sites = state.content?.activities?.[index]?.loginSites;
                if (completed && window.KitWorksheetRender.visibleLoginSites(sites, state.huntProfile).some((site) => site.readinessQuestion)) {
                    const answers = { ...state.responses[`${index}-login-sites-readiness-v1`] };
                    document.getElementById("worksheet-host").querySelectorAll("[data-site-check] input").forEach((field) => { answers[field.name] = field.value; });
                    const grade = await checkLoginSiteCompletion(index, answers);
                    renderPage();
                    showLoginSiteCompletionResult(grade);
                    return;
                }
                await queueProgressWrite(async () => {
                    await saveResponses(state.kitId, state.responses);
                    const payload = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/activities/${index}`, {
                        method: "PUT",
                        headers: withAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ completed })
                    });
                    state.completedActivities = payload.completedActivities;
                });
                showStatusMessage(completed ? "Activity completed! Your tick is saved. Return to the Kit Activity List to see your progress." : "Activity completion removed.");
            } catch (error) {
                showStatusMessage(error?.message || "Could not save activity completion.", true);
            } finally {
                updateActivityCompleteBar();
            }
        });

        document.getElementById("certificate-print")?.addEventListener("click", () => {
            if (!state.certificate) return;
            document.body.classList.add("printing-certificate");
            try { window.print(); }
            finally { document.body.classList.remove("printing-certificate"); }
        });
        document.getElementById("certificate-download")?.addEventListener("click", async () => {
            const button = document.getElementById("certificate-download");
            const email = state.email;
            button.disabled = true;
            certificateStatus("Preparing your PDF...");
            try {
                const response = await fetch(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/certificate.pdf`, { headers: withAuthHeaders() });
                if (!response.ok) {
                    const payload = await response.json();
                    throw new Error(payload.error || `Download failed (${response.status})`);
                }
                if (email !== getSignedInEmail()) return;
                const url = URL.createObjectURL(await response.blob());
                const link = document.createElement("a");
                link.href = url;
                link.download = `${state.kitId}-certificate.pdf`;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                certificateStatus("Your landscape PDF has been downloaded.");
            } catch (error) {
                if (email === getSignedInEmail()) certificateStatus(error.message || "Could not download your certificate.", true);
            } finally { button.disabled = false; }
        });
        document.getElementById("certificate-email")?.addEventListener("click", async () => {
            const button = document.getElementById("certificate-email");
            const email = state.email;
            button.disabled = true;
            certificateStatus("Sending your certificate...");
            try {
                const payload = await loadJson(`/api/practical-skills/progress/${encodeURIComponent(state.kitId)}/certificate/email`, { method: "POST", headers: withAuthHeaders() });
                if (email === getSignedInEmail()) certificateStatus(`Certificate sent to ${payload.recipient}. You can forward the email to share it.`);
            } catch (error) {
                if (email === getSignedInEmail()) certificateStatus(error.message || "Could not email your certificate.", true);
            } finally { button.disabled = false; }
        });

        completeBtn?.addEventListener("click", async () => {
            completeBtn.disabled = true;
            try {
                const snapshot = await completeKit(state.kitId);
                const kitEntry = (snapshot.kits || []).find((entry) => entry.id === state.kitId) || null;
                updateCompleteBar(kitEntry);
                showStatusMessage("Kit marked complete. Great work!");
            } catch (error) {
                completeBtn.disabled = false;
                showStatusMessage(error?.message || "Could not mark this kit complete.", true);
            }
        });

        resetBtn?.addEventListener("click", async () => {
            resetBtn.disabled = true;
            try {
                const snapshot = await resetKit(state.kitId);
                state.completedActivities = {};
                state.certificate = null;
                renderPage();
                const kitEntry = (snapshot.kits || []).find((entry) => entry.id === state.kitId) || null;
                updateCompleteBar(kitEntry);
                showStatusMessage("Kit progress reset.");
            } catch (error) {
                showStatusMessage(error?.message || "Could not reset this kit.", true);
            } finally {
                resetBtn.disabled = false;
            }
        });
    }

    async function init(identityDraft = {}) {
        state.kitId = getKitIdFromUrl();
        state.email = getSignedInEmail();

        try {
            const contentPayload = await fetchKitContent(state.kitId);
            state.content = contentPayload?.content || null;
        } catch (error) {
            showStatusMessage(error?.message || "Could not load this kit.", true);
            return;
        }

        if (!state.email) {
            renderPage();
            updateCompleteBar(null);
            startSignInWatcher();
            return;
        }

        try {
            const progressPayload = await fetchKitProgress(state.kitId);
            state.responses = { ...progressPayload?.responses, ...identityDraft };
            state.completedActivities = progressPayload?.completedActivities || {};
            state.certificate = progressPayload?.certificate || null;
            state.progressLoaded = true;
            const currentActivity = state.content?.activities?.[getCurrentActivityIndex()];
            if (currentActivity?.assessment?.id === "learning-sites-treasure-v1" || currentActivity?.loginSites) {
                state.huntProfile = await loadJson("/api/practical-skills/learning-sites/profile", { headers: withAuthHeaders() });
            }
            let siteGrade;
            const index = getCurrentActivityIndex();
            const savedSiteAnswers = state.responses[`${index}-login-sites-readiness-v1`];
            if (currentActivity?.loginSites && !state.completedActivities[index] && savedSiteAnswers &&
                window.KitWorksheetRender.visibleLoginSites(currentActivity.loginSites, state.huntProfile).some((site) => site.readinessQuestion)) {
                siteGrade = await checkLoginSiteCompletion(index, savedSiteAnswers);
            }
            renderPage();
            updateCompleteBar(progressPayload?.kit);
            if (progressPayload?.certificateEmailed && state.certificate) {
                certificateStatus(`Ka pai! A copy of your certificate has been emailed to ${state.email}.`);
            }
            if (siteGrade) showLoginSiteCompletionResult(siteGrade);
            if (state.content?.activities?.[getCurrentActivityIndex()]?.assessment?.id === "apps-wordsearch-v1") {
                const email = state.email;
                try {
                    const setup = await loadJson("/api/student/login-drive-setup", { headers: withAuthHeaders() });
                    if (state.email === email) {
                        state.driveSetup = setup;
                        const status = document.querySelector("[data-login-drive-status]");
                        const link = document.querySelector("[data-login-drive-link]");
                        if (status && setup.ready) status.textContent = "Drive Ready! Your WHS-DTECH folder and Editor sharing are set up.";
                        if (link && setup.ready) { link.href = setup.folderUrl; link.hidden = false; }
                    }
                } catch (error) {
                    if (state.email === email) showStatusMessage(error.message || "Could not load your WHS-DTECH setup. Use the setup button to retry.", true);
                }
            }
        } catch (error) {
            renderPage();
            showStatusMessage(error?.message || "Could not load your saved progress.", true);
        }

        wireActionButtons();
    }

    if (document.getElementById("hub-google-verify-button") && window.addEventListener) {
        let previousAuth = getStoredAuthRaw();
        window.addEventListener("hub-auth-state-changed", () => {
            const nextAuth = getStoredAuthRaw();
            if (nextAuth === previousAuth) return;
            previousAuth = nextAuth;
            if (state.driveSetupInProgress && getSignedInEmail() === state.email) return;
            const identityDraft = {};
            if (getSignedInEmail() === state.email && state.content?.activities?.[getCurrentActivityIndex()]?.identityLessonVersion) {
                document.querySelectorAll("#worksheet-host .worksheet-answer-input").forEach((input) => {
                    identityDraft[input.getAttribute("data-question-id")] = input.value;
                });
            }
            window.clearTimeout(state.saveTimerId);
            state.progressLoaded = false;
            state.responses = {};
            state.completedActivities = {};
            state.driveSetup = null;
            state.huntProfile = null;
            state.certificate = null;
            updateCertificate();
            void init(identityDraft);
        });
    }

    init();
})();
