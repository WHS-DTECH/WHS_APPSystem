// Shared worksheet renderer used by both the student kit page and the admin live preview,
// so the two can never drift out of sync (window.KitWorksheetRender.renderWorksheet).
(function () {
    "use strict";

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderInstructions(instructions) {
        const text = String(instructions || "");
        const allMarkers = Array.from(text.matchAll(/\b(\d+)\.\s+/g));
        const firstListMarkerIndex = allMarkers.findIndex((marker, index) =>
            marker[1] === "1" && allMarkers[index + 1]?.[1] === "2");
        if (firstListMarkerIndex < 0) return `<p>${escapeHtml(text)}</p>`;
        const markers = allMarkers.slice(firstListMarkerIndex);
        let sequentialCount = 1;
        while (sequentialCount < markers.length &&
            Number(markers[sequentialCount][1]) === sequentialCount + 1) {
            sequentialCount += 1;
        }
        if (sequentialCount < 2) return `<p>${escapeHtml(text)}</p>`;
        markers.length = sequentialCount;

        const firstMarker = markers[0].index;
        const prefix = text.slice(0, firstMarker).trim();
        const items = markers.map((marker, index) => {
            const start = marker.index + marker[0].length;
            const end = markers[index + 1]?.index ?? text.length;
            return text.slice(start, end).trim();
        });
        const finalItemParts = items[items.length - 1].split(/(?<=[.!?])\s+(?=[A-Z])/, 2);
        items[items.length - 1] = finalItemParts[0];
        const suffix = finalItemParts[1] || "";

        return `
            ${prefix ? `<p>${escapeHtml(prefix)}</p>` : ""}
            <ol class="worksheet-instructions-list">
                ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ol>
            ${suffix ? `<p>${escapeHtml(suffix)}</p>` : ""}
        `;
    }

    function safeExternalUrl(value) {
        try {
            const url = new URL(String(value || ""));
            return url.protocol === "https:" ? url.href : "";
        } catch (_error) {
            return "";
        }
    }

    function renderImageCredit(image) {
        if (!image?.attribution) return "";
        const sourceUrl = safeExternalUrl(image.sourceUrl);
        const licenseUrl = safeExternalUrl(image.licenseUrl);
        return `
            <figcaption class="worksheet-image-credit">
                Photo: ${escapeHtml(image.attribution)}
                ${sourceUrl ? ` · <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}
                ${image?.license ? ` · ${licenseUrl ? `<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(image.license)}</a>` : escapeHtml(image.license)}` : ""}
            </figcaption>
        `;
    }

    function renderWorksheetImage(image, className = "worksheet-image") {
        return `
            <figure class="${className}">
                <img src="${escapeHtml(image?.url || "")}" alt="${escapeHtml(image?.alt || "")}" loading="lazy">
                ${image?.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
                ${renderImageCredit(image)}
            </figure>
        `;
    }

    function renderQuestionBody(question, responses, readOnly) {
        const type = String(question?.type || "short-answer");
        const responseValue = responses?.[question.id];
        const hasTimeline = Boolean(question.imageTimeline) && Array.isArray(question.images) &&
            question.images.length > 1 && question.images.every((image) => image?.timelineYear);
        const images = Array.isArray(question.images) && question.images.length
            ? `<div class="worksheet-question-images${question.images.length === 1 ? " has-single-image" : question.images.length === 2 ? " has-two-images" : ""}${hasTimeline ? " has-timeline" : ""}"${hasTimeline ? ` style="--timeline-count: ${question.images.length}"` : ""}>
                ${question.images.map((image) => renderWorksheetImage(image, "worksheet-question-image")).join("")}
            </div>
            ${hasTimeline ? `<ol class="worksheet-image-timeline" style="--timeline-count: ${question.images.length}" aria-label="Timeline">
                ${question.images.map((image) => `<li><span class="worksheet-image-timeline-dot" aria-hidden="true"></span><strong>${escapeHtml(image.timelineYear)}</strong>${image.timelineLabel ? `<span>${escapeHtml(image.timelineLabel)}</span>` : ""}</li>`).join("")}
            </ol>` : ""}`
            : "";

        if (type === "checklist") {
            const checkedSet = new Set(Array.isArray(responseValue) ? responseValue : []);
            return `
                ${images}
                <div class="worksheet-checklist">
                    ${(Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => {
                        const checked = checkedSet.has(option);
                        return `
                            <label class="worksheet-checklist-item">
                                <input type="checkbox" data-question-id="${escapeHtml(question.id)}" data-option-value="${escapeHtml(option)}" data-option-index="${optionIndex}" ${checked ? "checked" : ""} ${readOnly ? "disabled" : ""}>
                                <span>${escapeHtml(option)}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
            `;
        }

        if (type === "multiple-choice") {
            const selected = String(responseValue || "");
            return `
                ${images}
                ${question.searchResults ? `
                    <section class="worksheet-search-results" aria-label="${escapeHtml(question.searchResults.title || "Simulated (Fake website) search results")}">
                        <h4 class="worksheet-search-results-heading"><span aria-hidden="true">🔎</span> ${escapeHtml(question.searchResults.title || "Simulated (Fake website) search results")}</h4>
                        <div class="worksheet-search-result-list">
                            ${(Array.isArray(question.searchResults.results) ? question.searchResults.results : []).map((result) => `
                                <button type="button" class="worksheet-search-result ${selected === result.title ? "is-selected" : ""}" data-question-id="${escapeHtml(question.id)}" data-option-value="${escapeHtml(result.title)}" aria-pressed="${selected === result.title}" ${readOnly ? "disabled" : ""}>
                                    <span class="worksheet-search-result-domain">${escapeHtml(result.domain)}</span>
                                    <strong>${escapeHtml(result.title)}</strong>
                                    <span>${escapeHtml(result.description)}</span>
                                </button>
                            `).join("")}
                        </div>
                        ${question.searchResults.note ? `<p class="worksheet-search-results-note">${escapeHtml(question.searchResults.note)}</p>` : ""}
                    </section>
                ` : `
                    <div class="worksheet-choices">
                        ${(Array.isArray(question.options) ? question.options : []).map((option) => `
                            <button type="button" class="worksheet-choice-bubble ${selected === option ? "is-selected" : ""}" data-question-id="${escapeHtml(question.id)}" data-option-value="${escapeHtml(option)}" ${readOnly ? "disabled" : ""}>
                                ${escapeHtml(option)}
                            </button>
                        `).join("")}
                    </div>
                `}
            `;
        }

        return `
            ${images}
            <textarea class="worksheet-answer-input" data-question-id="${escapeHtml(question.id)}" rows="${Math.max(1, Number(question.lines) || 1)}" ${readOnly ? "disabled" : ""} placeholder="Write your answer\u2026">${escapeHtml(responseValue || "")}</textarea>
            ${question.hint ? `
                <button type="button" class="worksheet-hint-toggle" data-hint-toggle="${escapeHtml(question.id)}" aria-expanded="false" aria-controls="question-hint-${escapeHtml(question.id)}" ${readOnly ? "disabled" : ""}>HINT</button>
                <p class="worksheet-question-hint" id="question-hint-${escapeHtml(question.id)}" data-question-hint="${escapeHtml(question.id)}" hidden>Hint: ${escapeHtml(question.hint)}</p>
            ` : ""}
        `;
    }

    function renderAssessment(assessment, answers, readOnly) {
        if (assessment.id === "learning-sites-treasure-v1") return renderLearningSites(assessment, answers, readOnly);
        if (assessment.id === "apps-wordsearch-v1") return renderAppsAssessment(assessment, answers, readOnly);
        return `
            <section class="worksheet-assessment" aria-labelledby="assessment-title">
                <div class="worksheet-assessment-intro">
                    <h2 id="assessment-title">${escapeHtml(assessment.title)}</h2>
                    <p>${escapeHtml(assessment.introduction)}</p>
                    ${assessment.id === "password-problems-v1" ? renderPasswordReminder() : ""}
                    <p class="worksheet-safety-note">${escapeHtml(assessment.safety)}</p>
                    <h3>Your detective toolkit</h3>
                    <ul>${assessment.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>
                </div>
                <form class="worksheet-assessment-form">
                    <fieldset class="worksheet-assessment-inputs" ${readOnly ? "disabled" : ""}>
                        <legend class="worksheet-assessment-heading">Round 1: Match the problem to the safe fix</legend>
                        <p>Choose a fix for each problem. Each fix is used once. You can use the keyboard or tap the menus.</p>
                        ${assessment.matches.map((question, index) => `
                            <div class="worksheet-assessment-question">
                                <label for="assessment-${escapeHtml(question.id)}"><strong>${index + 1}.</strong> ${escapeHtml(question.prompt)}</label>
                                <select id="assessment-${escapeHtml(question.id)}" name="${escapeHtml(question.id)}" data-assessment-id="${escapeHtml(question.id)}" aria-describedby="feedback-${escapeHtml(question.id)}">
                                    <option value="">Choose a safe fix...</option>
                                    ${assessment.matchOptions.map((option) => `<option value="${escapeHtml(option.id)}" ${answers[question.id] === option.id ? "selected" : ""}>${escapeHtml(option.text)}</option>`).join("")}
                                </select>
                                <p id="feedback-${escapeHtml(question.id)}" class="worksheet-assessment-feedback" data-feedback-id="${escapeHtml(question.id)}" hidden></p>
                            </div>
                        `).join("")}
                        <h3 class="worksheet-assessment-heading">Round 2: Solve the mini mysteries</h3>
                        ${assessment.quiz.map((question, index) => `
                            <fieldset class="worksheet-assessment-question" aria-describedby="feedback-${escapeHtml(question.id)}">
                                <legend><strong>${index + 1}.</strong> ${escapeHtml(question.prompt)}</legend>
                                ${question.options.map((option) => `
                                    <label class="worksheet-assessment-choice">
                                        <input type="radio" name="${escapeHtml(question.id)}" data-assessment-id="${escapeHtml(question.id)}" value="${escapeHtml(option.id)}" ${answers[question.id] === option.id ? "checked" : ""}>
                                        <span>${escapeHtml(option.text)}</span>
                                    </label>
                                `).join("")}
                                <p id="feedback-${escapeHtml(question.id)}" class="worksheet-assessment-feedback" data-feedback-id="${escapeHtml(question.id)}" hidden></p>
                            </fieldset>
                        `).join("")}
                    </fieldset>
                    <button type="submit" class="worksheet-btn worksheet-btn-primary" ${readOnly ? "disabled" : ""}>Check my answers</button>
                    <p class="worksheet-assessment-result" role="status" aria-live="polite">Complete both rounds, then check your answers. You can try again as many times as you need.</p>
                </form>
            </section>
        `;
    }

    function renderLearningSites(assessment, answers, readOnly) {
        const clueInput = (clue) => `
            <label for="hunt-${escapeHtml(clue.id)}">${escapeHtml(clue.prompt)}</label>
            <input id="hunt-${escapeHtml(clue.id)}" data-hunt-answer="${escapeHtml(clue.id)}" maxlength="200" value="${escapeHtml(answers[clue.id] || "")}" autocomplete="off" aria-describedby="hunt-feedback-${escapeHtml(clue.id)}">
            <p id="hunt-feedback-${escapeHtml(clue.id)}" data-hunt-feedback="${escapeHtml(clue.id)}" class="worksheet-assessment-feedback" hidden></p>
        `;
        return `
            <section class="worksheet-treasure-map" aria-labelledby="hunt-title">
                <div class="treasure-map-heading">
                    <span class="treasure-map-compass" aria-hidden="true">&#9875;</span>
                    <h2 id="hunt-title">${escapeHtml(assessment.title)}</h2>
                    <p>Ahoy, explorer! Visit five learning sites, collect the clues and find your own DTECH course treasure. All eight answers earn your saved completion tick.</p>
                </div>
                <div class="treasure-map-start">
                    <h3>Set sail: follow the school pathway</h3>
                    <ol class="treasure-map-pathway" aria-label="Pathway to Learning Sites">
                        <li><span class="treasure-map-step" aria-hidden="true">1</span><a href="https://www.westlandhigh.school.nz/" target="_blank" rel="noopener noreferrer">Westland High Website</a></li>
                        <li><span class="treasure-map-step" aria-hidden="true">2</span><strong>Intranet</strong></li>
                        <li><span class="treasure-map-step" aria-hidden="true">3</span><strong>Learning Sites</strong></li>
                    </ol>
                    <p>Use the subject names below to find the right sites in the directory. English has several entries: use <strong>Mrs O'Malley</strong>. Sign in to school Google if a page asks. Keep this map open and visit sites in another tab.</p>
                    <a class="worksheet-btn worksheet-btn-secondary" href="${escapeHtml(assessment.directoryUrl)}" target="_blank" rel="noopener noreferrer">Open Learning Sites directory</a>
                    <p>Need a course check? <a href="../user-profile.html" target="_blank" rel="noopener noreferrer">Open your User Profile</a>.</p>
                    <p data-hunt-profile role="status">Loading your course profile...</p>
                </div>
                <form class="worksheet-hunt-form">
                    <fieldset class="worksheet-assessment-inputs" ${readOnly ? "disabled" : ""}>
                        <legend class="treasure-map-legend">Five islands. Follow the trail. X marks the spot!</legend>
                        ${assessment.destinations.map((destination, index) => `
                            <article class="treasure-map-island" data-hunt-island="${escapeHtml(destination.id)}">
                                <span class="treasure-map-x" aria-hidden="true">X</span>
                                <div class="treasure-map-island-body">
                                    <h3>${index + 1}. ${escapeHtml(destination.title)}</h3>
                                    <p>Directory entry: <strong>${escapeHtml(destination.subject)}</strong></p>
                                    <a class="treasure-map-rescue" href="${escapeHtml(destination.url)}" target="_blank" rel="noopener noreferrer">Stuck finding the site? Open ${escapeHtml(destination.subject)}</a>
                                    ${destination.id === "dtech" ? `
                                        <aside class="treasure-map-search" aria-label="Google shortcut to DTECH">
                                            <h4>Take a shortcut to DTECH!</h4>
                                            <p>You can bypass the school pathway and Google the DTECH learning site instead. Search using these keywords:</p>
                                            <p class="treasure-map-search-keywords">Pringle DTECH</p>
                                            <p>Choose the <strong>DTECH - Miss Pringle</strong> result on the Westland High School Google Sites website.</p>
                                            <a class="worksheet-btn worksheet-btn-secondary" href="https://www.google.com/search?q=Pringle+DTECH" target="_blank" rel="noopener noreferrer">Google Pringle DTECH</a>
                                        </aside>
                                    ` : ""}
                                    ${clueInput(destination)}
                                    ${destination.id === "dtech" ? `
                                        <label for="hunt-course">Which DTECH course are you doing? Choose your year and course, as shown in User Profile. When you pass, your course folder is made in WHS-DTECH. School staff can choose Staff, or any course to test it.</label>
                                        <select id="hunt-course" data-hunt-answer="course" aria-describedby="hunt-feedback-course">
                                            <option value="">Choose your course...</option>
                                            ${assessment.courses.map((course) => `<option value="${escapeHtml(course.id)}" ${answers.course === course.id || course.aliases?.includes(answers.course) ? "selected" : ""}>${escapeHtml(course.label)}</option>`).join("")}
                                        </select>
                                        <p id="hunt-feedback-course" data-hunt-feedback="course" class="worksheet-assessment-feedback" hidden></p>
                                        <div data-hunt-course-clues></div>
                                    ` : ""}
                                </div>
                            </article>
                        `).join("")}
                    </fieldset>
                    <button type="submit" class="worksheet-btn worksheet-btn-primary" ${readOnly ? "disabled" : ""}>Check course &amp; treasure answers</button>
                    <p class="worksheet-assessment-result" role="status" aria-live="polite">Collect the five island clues, choose your course and solve its two clues.</p>
                    <p class="treasure-map-folder" data-hunt-folder role="status" hidden></p>
                    <p class="treasure-map-update">Clues reviewed ${escapeHtml(assessment.reviewedOn)}. If a learning page changes or a link fails, tell your teacher; do not share passwords.</p>
                </form>
            </section>
        `;
    }

    function wireLearningSites(host, assessment, options) {
        const form = host.querySelector(".worksheet-hunt-form");
        const result = form.querySelector(".worksheet-assessment-result");
        const button = form.querySelector("button[type=submit]");
        const inputs = form.querySelector("fieldset");
        const courseSelect = form.querySelector("#hunt-course");
        const clueHost = form.querySelector("[data-hunt-course-clues]");
        const draft = { ...options.assessmentAnswers };
        host.querySelector("[data-hunt-profile]").textContent = options.readOnly
            ? "Sign in with your school account to save progress and check your course."
            : options.huntProfile?.message || "Your course profile is loading; you can explore the islands now.";
        if (!options.readOnly && draft.reopenedForYear) {
            host.querySelector("[data-hunt-profile]").insertAdjacentHTML("beforebegin", `<p class="treasure-map-checkin" role="status"><strong>New year, new course check-in!</strong> You're now in Year ${escapeHtml(draft.reopenedForYear)}. Learning sites change, so sail the islands again, choose your new course and earn your tick. Your new course folder will be made in WHS-DTECH. Your old folders and work stay safe.</p>`);
        }
        const renderCourse = () => {
            const course = assessment.courses.find((entry) => entry.id === courseSelect.value);
            clueHost.innerHTML = course ? `
                <p><strong>Now find your course page from the DTECH home page's Course Information.</strong></p>
                <a class="treasure-map-rescue" href="${escapeHtml(course.url)}" target="_blank" rel="noopener noreferrer">Need a shortcut? Open ${escapeHtml(course.label)} course page</a>
                ${course.clues.map((clue) => `
                    <label for="hunt-${escapeHtml(clue.id)}">${escapeHtml(clue.prompt)}</label>
                    <input id="hunt-${escapeHtml(clue.id)}" data-hunt-answer="${escapeHtml(clue.id)}" maxlength="200" autocomplete="off" value="${escapeHtml(draft[clue.id] || "")}" aria-describedby="hunt-feedback-${escapeHtml(clue.id)}">
                    <p id="hunt-feedback-${escapeHtml(clue.id)}" data-hunt-feedback="${escapeHtml(clue.id)}" class="worksheet-assessment-feedback" hidden></p>
                `).join("")}
            ` : "<p>Choose a course to reveal its two treasure clues.</p>";
        };
        renderCourse();
        const answers = () => {
            const values = {};
            form.querySelectorAll("[data-hunt-answer]").forEach((input) => {
                values[input.getAttribute("data-hunt-answer")] = input.value;
            });
            return values;
        };
        form.addEventListener("input", (event) => {
            const id = event.target.getAttribute("data-hunt-answer");
            if (!id) return;
            if (id === "course") {
                delete draft["course-clue-1"];
                delete draft["course-clue-2"];
                renderCourse();
            } else draft[id] = event.target.value;
            form.querySelectorAll("[data-hunt-feedback]").forEach((feedback) => { feedback.hidden = true; });
            form.querySelectorAll("[data-hunt-island]").forEach((island) => {
                if (island.getAttribute("data-hunt-island") === (id.startsWith("course") ? "dtech" : id)) {
                    island.classList.remove("is-complete");
                }
            });
            if (id === "course" && courseSelect.value) {
                const feedback = form.querySelector('[data-hunt-feedback="course"]');
                const correct = Boolean(options.huntProfile?.available && options.huntProfile.courseIds.includes(courseSelect.value));
                feedback.hidden = false;
                feedback.classList.toggle("is-correct", correct);
                feedback.classList.toggle("is-error", !correct);
                feedback.textContent = correct ? courseSelect.value === "STAFF" ? "Staff access confirmed. Now hunt for the two JuniorDTECH clues!" : options.huntProfile.courseIds.includes("STAFF") ? "Staff test pathway confirmed. Now hunt for this course's two clues!" : "This course matches your User Profile. Now hunt for its two clues!" :
                    options.huntProfile?.available ? "This course/year does not match your User Profile. Check your profile and choose again." :
                        options.huntProfile?.message || "Your course profile is unavailable. Ask your teacher to check it.";
            }
            options.onAssessmentChange?.(answers());
            result.classList.remove("is-error", "is-correct");
            result.textContent = "Keep exploring! Check your course and answers when you are ready.";
        });
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (button.disabled) return;
            button.disabled = true;
            inputs.disabled = true;
            result.classList.remove("is-error", "is-correct");
            result.textContent = "Checking your course, clues and saved progress...";
            try {
                if (!options.onAssessmentCheck) throw new Error("Open the student activity to check your treasure answers.");
                const grade = await options.onAssessmentCheck(answers());
                form.querySelectorAll("[data-hunt-feedback]").forEach((feedback) => {
                    const marked = grade.results.find((entry) => entry.id === feedback.getAttribute("data-hunt-feedback"));
                    if (!marked) return;
                    feedback.hidden = false;
                    feedback.textContent = marked.explanation;
                    feedback.classList.toggle("is-correct", marked.correct);
                    feedback.classList.toggle("is-error", !marked.correct);
                });
                form.querySelectorAll("[data-hunt-island]").forEach((island) => {
                    const id = island.getAttribute("data-hunt-island");
                    const ids = id === "dtech" ? ["dtech", "course", "course-clue-1", "course-clue-2"] : [id];
                    island.classList.toggle("is-complete", ids.every((key) => grade.results.find((entry) => entry.id === key)?.correct));
                });
                result.classList.toggle("is-correct", grade.passed);
                result.textContent = grade.passed ? "Treasure unlocked! 8 / 8 correct. Ka pai! Your completion tick is saved." :
                    `${grade.score} / ${grade.total} treasures found. Your answers are saved. Follow the hints and try again!`;
                const folderNote = form.querySelector("[data-hunt-folder]");
                if (folderNote && grade.passed && (grade.courseFolder || grade.courseFolderError)) {
                    folderNote.hidden = false;
                    folderNote.innerHTML = grade.courseFolder
                        ? `Your <strong>${escapeHtml(grade.courseFolder.name)}</strong> course folder (with a <strong>KITS</strong> folder inside) is ready in WHS-DTECH. <a href="${escapeHtml(grade.courseFolder.url)}" target="_blank" rel="noopener noreferrer">Open my course folder</a>`
                        : escapeHtml(grade.courseFolderError);
                }
            } catch (error) {
                result.classList.add("is-error");
                result.textContent = error.message || "Could not check or save your treasure hunt. Please try again.";
            } finally {
                button.disabled = false;
                inputs.disabled = false;
            }
        });
    }

    function renderPasswordReminder() {
        return `
            <aside class="worksheet-password-reminder" aria-labelledby="password-reminder-title">
                <span class="password-reminder-tag">WHS LOGIN CHECK</span>
                <h3 id="password-reminder-title">One school username. You may have TWO passwords!</h3>
                <p>Your school username is used for KAMAR, Google and Microsoft logins. Use your full school email address when Google or Microsoft asks for it.</p>
                <div class="password-reminder-groups">
                    <section class="password-reminder-group">
                        <div class="password-reminder-brands">
                            <span class="password-brand password-brand-kamar">KAMAR</span>
                            <span class="password-brand">
                                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                </svg>
                                Google
                            </span>
                        </div>
                        <h4>Password group 1</h4>
                        <p><strong>KAMAR + Google</strong><br>Use the same password for these school accounts.</p>
                    </section>
                    <section class="password-reminder-group">
                        <div class="password-reminder-brands">
                            <span class="password-brand">
                                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M13 1h10v10H13z"/>
                                    <path fill="#00a4ef" d="M1 13h10v10H1z"/><path fill="#ffb900" d="M13 13h10v10H13z"/>
                                </svg>
                                Microsoft
                            </span>
                            <span class="password-brand">
                                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path fill="#0078d4" d="M1 1h10v10H1zM13 1h10v10H13zM1 13h10v10H1zM13 13h10v10H13z"/>
                                </svg>
                                Windows
                            </span>
                        </div>
                        <h4>Password group 2</h4>
                        <p><strong>Microsoft + Computer Room Windows PCs</strong><br>Use your Microsoft password for OneDrive, Microsoft apps and signing in to the Computer Room Windows computers.</p>
                    </section>
                </div>
                <p class="password-reminder-warning"><strong>Changing your KAMAR/Google password does NOT change your Microsoft password.</strong> You may end up with two different passwords: one for KAMAR and Google, and another for Microsoft and the Computer Room Windows computers.</p>
                <p class="password-reminder-help">If one login works but another does not, check which password group you need. Ask your teacher or school IT for help resetting the right account. Never share either password.</p>
            </aside>
        `;
    }

    function renderAppsAssessment(assessment, answers, readOnly) {
        return `
            <section class="worksheet-assessment worksheet-apps-explorer" aria-labelledby="assessment-title">
                <div class="worksheet-assessment-intro">
                    <h2 id="assessment-title">${escapeHtml(assessment.title)}</h2>
                    <p>${escapeHtml(assessment.introduction)}</p>
                    <h3>1. Sign in and get your drives ready</h3>
                    <p>Use your school email for Google and Microsoft. Google Drive and Microsoft OneDrive store files online; they are not the same drive.</p>
                    <div class="worksheet-actions">
                        <button type="button" class="worksheet-btn worksheet-btn-primary" data-login-drive-setup ${readOnly ? "disabled" : ""}>Set up Google Drive (Drive Ready)</button>
                        <a class="worksheet-btn worksheet-btn-secondary" href="https://westlandhigh-my.sharepoint.com/" target="_blank" rel="noopener noreferrer">Open school Microsoft OneDrive</a>
                    </div>
                    <p>Microsoft: this link opens Westland High School's OneDrive directly. Sign in with your own school Microsoft account if asked. If the wrong account appears, switch to your school account. If Microsoft shows a sign-in error or OneDrive is missing, ask your teacher or school IT for help; do not tick the confirmation until you can see your files.</p>
                    <p>Click <strong>Set up Google Drive</strong> and choose your school Google account in the sign-in window. Allow Drive access when prompted. The setup creates or reuses just one folder: <strong>WHS-DTECH</strong> in My Drive. We will add class folders later.</p>
                    <p class="worksheet-safety-note">WHS-DTECH will be shared with anyone with the link as Editor, so DTECH-HUB can work with your files. Only store class work here, not private information. Do not share the link publicly. Never enter a password into this activity.</p>
                    <p class="worksheet-assessment-result" data-login-drive-status role="status" aria-live="polite"></p>
                    <a class="worksheet-btn worksheet-btn-secondary" data-login-drive-link target="_blank" rel="noopener noreferrer" hidden>Open your WHS-DTECH folder</a>
                </div>
                <form class="worksheet-apps-form">
                    <fieldset class="worksheet-assessment-inputs" ${readOnly ? "disabled" : ""}>
                        <legend class="worksheet-assessment-heading">2. Explore Google and Microsoft apps</legend>
                        <label class="worksheet-assessment-choice">
                            <input type="checkbox" data-microsoft-ready ${answers.microsoftReady ? "checked" : ""}>
                            <span>I signed in to Microsoft OneDrive with my school account and can see my files. (This is your confirmation, not an automatic Microsoft check.)</span>
                        </label>
                        <ul class="worksheet-app-word-list">${assessment.words.map((app) => `
                            <li data-app-word="${escapeHtml(app.word)}"><strong>${escapeHtml(app.word)}</strong> - ${escapeHtml(app.provider)}: ${escapeHtml(app.use)}</li>
                        `).join("")}</ul>
                        <p id="wordsearch-instructions">Find all eight names. Click or tap the first letter, then the last letter. Words run across or down, and can be selected in either direction. With a keyboard, Tab to a letter and press Enter or Space.</p>
                        <div class="worksheet-wordsearch" role="group" aria-label="Apps word search" aria-describedby="wordsearch-instructions">
                            ${assessment.grid.map((row, r) => Array.from(row).map((letter, c) => `
                                <button type="button" data-word-cell="${r},${c}" aria-label="Row ${r + 1}, column ${c + 1}, ${letter}" aria-pressed="false">${letter}</button>
                            `).join("")).join("")}
                        </div>
                        <p data-wordsearch-status role="status" aria-live="polite"></p>
                        <button type="button" class="worksheet-btn worksheet-btn-secondary" data-wordsearch-reset>Clear found words</button>
                    </fieldset>
                    <button type="submit" class="worksheet-btn worksheet-btn-primary" ${readOnly ? "disabled" : ""}>Check my answers</button>
                    <p class="worksheet-assessment-result" role="status" aria-live="polite">Get both drives ready and find all eight apps, then check your answers.</p>
                </form>
            </section>
        `;
    }

    function wireAppsAssessment(host, assessment, options) {
        const form = host.querySelector(".worksheet-apps-form");
        const result = form.querySelector(".worksheet-assessment-result");
        const inputs = form.querySelector("fieldset");
        const checkButton = form.querySelector("button[type=submit]");
        const microsoft = form.querySelector("[data-microsoft-ready]");
        const status = form.querySelector("[data-wordsearch-status]");
        const paths = {};
        let start = null;
        const readWord = (path) => path.map(([r, c]) => assessment.grid[r]?.[c] || "").join("");
        const findWordPath = (word) => {
            for (let r = 0; r < assessment.grid.length; r += 1) {
                for (let c = 0; c < assessment.grid[r].length; c += 1) {
                    for (const [dr, dc] of [[0, 1], [1, 0]]) {
                        const candidate = Array.from(word, (_, i) => [r + dr * i, c + dc * i]);
                        if ([word, Array.from(word).reverse().join("")].includes(readWord(candidate))) return candidate;
                    }
                }
            }
            return null;
        };
        for (const app of assessment.words) {
            let path = options.assessmentAnswers?.paths?.[app.word];
            if (app.legacyPaths?.some((legacy) => JSON.stringify(legacy) === JSON.stringify(path))) {
                path = findWordPath(app.word);
            }
            if (Array.isArray(path) && path.length === app.word.length && path.every((cell) =>
                Array.isArray(cell) && cell.length === 2 && cell.every((value) => Number.isInteger(value) && value >= 0 && value < 12)
            ) && [app.word, Array.from(app.word).reverse().join("")].includes(readWord(path))) paths[app.word] = path;
        }
        const answers = () => ({ paths: { ...paths }, microsoftReady: microsoft.checked });
        const update = (message = "") => {
            const found = new Set(Object.values(paths).flat().map((cell) => cell.join(",")));
            form.querySelectorAll("[data-word-cell]").forEach((cell) => {
                const id = cell.getAttribute("data-word-cell");
                cell.classList.toggle("is-found", found.has(id));
                cell.setAttribute("aria-pressed", String(found.has(id) || id === start?.join(",")));
            });
            form.querySelectorAll("[data-app-word]").forEach((word) => {
                word.classList.toggle("is-found", Boolean(paths[word.getAttribute("data-app-word")]));
            });
            status.textContent = `${Object.keys(paths).length} / 8 words found. ${message}`;
        };
        const changed = () => {
            options.onAssessmentChange?.(answers());
            result.classList.remove("is-correct", "is-error");
            result.textContent = "Changes saved when you pause. Check your answers when you are ready.";
        };
        form.querySelectorAll("[data-word-cell]").forEach((cell) => cell.addEventListener("click", () => {
            const end = cell.getAttribute("data-word-cell").split(",").map(Number);
            if (!start) {
                start = end;
                update("Now select the last letter.");
                return;
            }
            const dr = end[0] - start[0];
            const dc = end[1] - start[1];
            const length = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
            const path = Array.from({ length }, (_, i) => [start[0] + Math.sign(dr) * i, start[1] + Math.sign(dc) * i]);
            start = null;
            const word = readWord(path);
            const match = (dr === 0 || dc === 0) && assessment.words.find((app) =>
                app.word === word || app.word === Array.from(word).reverse().join("")
            );
            if (!match) { update("Not an app name yet. Try another first and last letter!"); return; }
            paths[match.word] = path;
            changed();
            update(`Ka pai! You found ${match.word}.`);
        }));
        form.querySelector("[data-wordsearch-reset]").addEventListener("click", () => {
            Object.keys(paths).forEach((word) => delete paths[word]);
            start = null;
            changed();
            update();
        });
        microsoft.addEventListener("change", changed);
        update();
        const driveButton = host.querySelector("[data-login-drive-setup]");
        const driveStatus = host.querySelector("[data-login-drive-status]");
        const driveLink = host.querySelector("[data-login-drive-link]");
        const updateDrive = (setup) => {
            driveStatus.textContent = setup?.ready ? "Drive Ready! Your WHS-DTECH folder and Editor sharing are set up." : "Use the Google Drive setup button above to get ready.";
            driveLink.hidden = !setup?.ready;
            if (setup?.ready) driveLink.href = setup.folderUrl;
        };
        updateDrive(options.driveSetup);
        driveButton.addEventListener("click", async () => {
            driveButton.disabled = true;
            driveStatus.classList.remove("is-error");
            driveStatus.textContent = "Choose your school Google account in the sign-in window and allow Drive access. We will create or open WHS-DTECH when setup is complete.";
            try {
                if (!options.onDriveSetup) throw new Error("Open the student activity to set up Google Drive.");
                const setup = await options.onDriveSetup();
                if (!setup?.ready || !setup.folderUrl) throw new Error("Google Drive setup did not confirm your folder. Please try again.");
                updateDrive(setup);
            } catch (error) {
                driveStatus.classList.add("is-error");
                driveStatus.textContent = error.message || "Could not set up Google Drive. Please try again.";
            } finally {
                driveButton.disabled = false;
            }
        });
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (checkButton.disabled) return;
            checkButton.disabled = true;
            inputs.disabled = true;
            result.classList.remove("is-error", "is-correct");
            result.textContent = "Checking and saving your answers...";
            try {
                if (!options.onAssessmentCheck) throw new Error("Open the student activity to check your answers.");
                const grade = await options.onAssessmentCheck(answers());
                result.classList.toggle("is-correct", grade.passed);
                result.textContent = grade.passed
                    ? "Ka pai! All eight apps found, both drives ready. Your completion tick is saved."
                    : `${grade.score} / ${grade.total} tasks complete. ${grade.results.filter((entry) => !entry.correct).map((entry) => entry.explanation).join(" ")}`;
            } catch (error) {
                result.classList.add("is-error");
                result.textContent = error.message || "Could not check or save your answers. Please try again.";
            } finally {
                checkButton.disabled = false;
                inputs.disabled = false;
            }
        });
    }

    function wireAssessment(host, options) {
        const form = host.querySelector(".worksheet-assessment-form");
        if (!form) return;
        const result = form.querySelector(".worksheet-assessment-result");
        const button = form.querySelector("button[type=submit]");
        const inputs = form.querySelector(".worksheet-assessment-inputs");
        form.addEventListener("change", (event) => {
            const id = event.target.getAttribute("data-assessment-id");
            if (!id) return;
            form.querySelectorAll("[data-feedback-id]").forEach((feedback) => {
                if (feedback.getAttribute("data-feedback-id") === id) feedback.hidden = true;
            });
            result.classList.remove("is-error", "is-correct");
            result.textContent = "Answers changed. Check again when you are ready.";
        });
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (button.disabled) return;
            const answers = {};
            form.querySelectorAll("[data-assessment-id]").forEach((input) => {
                if (input.tagName === "SELECT" || input.checked) {
                    answers[input.getAttribute("data-assessment-id")] = input.value;
                }
            });
            button.disabled = true;
            inputs.disabled = true;
            result.classList.remove("is-error", "is-correct");
            result.textContent = "Checking and saving your answers...";
            try {
                if (!options.onAssessmentCheck) throw new Error("Answer checking is unavailable here. Open the student activity to try it.");
                const grade = await options.onAssessmentCheck(answers);
                form.querySelectorAll("[data-feedback-id]").forEach((feedback) => {
                    const marked = grade.results.find((entry) => entry.id === feedback.getAttribute("data-feedback-id"));
                    if (!marked) return;
                    feedback.hidden = false;
                    feedback.classList.toggle("is-correct", marked.correct);
                    feedback.classList.toggle("is-error", !marked.correct);
                    feedback.textContent = `${marked.correct ? "Correct!" : "Try again."} ${marked.explanation}`;
                });
                result.classList.toggle("is-correct", grade.passed);
                result.textContent = grade.passed
                    ? `${grade.score} / ${grade.total} correct! Brilliant detective work. Your completion tick is saved.`
                    : `${grade.score} / ${grade.total} correct. Your answers are saved. Read the tips beside each answer and try again. Get all ${grade.total} right to earn your tick.`;
            } catch (error) {
                result.classList.add("is-error");
                result.textContent = error?.message || "Could not check and save your answers. Please try again.";
            } finally {
                button.disabled = false;
                inputs.disabled = false;
            }
        });
    }

    function visibleLoginSites(sites, profile) {
        const junior = [7, 8].includes(profile?.year);
        const level = profile?.courseIds?.includes("STAFF") ? "staff" : junior ? "junior"
            : [9, 10].includes(profile?.year) ? "middle" : [11, 12, 13].includes(profile?.year) ? "senior" : null;
        return (sites || []).filter((site) => !site.hidden &&
            (site.levels ? site.levels.length && (!level || site.levels.includes(level)) : !junior || site.group === "JuniorDTECH"));
    }

    function wireResearchReport(host, options) {
        const section = host.querySelector("[data-research-report]");
        if (!section) return;
        const openButton = section.querySelector("[data-research-report-open]");
        const checkButton = section.querySelector("[data-research-report-check]");
        const status = section.querySelector("[data-research-report-status]");
        const setStatus = (message, kind = "") => {
            status.textContent = message;
            status.classList.toggle("is-error", kind === "error");
            status.classList.toggle("is-correct", kind === "correct");
        };
        const showReport = (report) => {
            const exists = Boolean(report?.exists && report.documentUrl);
            openButton.textContent = exists ? "Open My Research Report" : "Create My Research Report";
            checkButton.hidden = !exists;
        };
        let templateMissing = false;
        const busy = (value) => { openButton.disabled = value || templateMissing; checkButton.disabled = value; };

        if (options.onResearchReportStatus) {
            options.onResearchReportStatus().then((report) => {
                showReport(report);
                templateMissing = !report?.exists && report?.configured === false;
                busy(false);
                setStatus(report?.exists
                    ? "Your research report is ready. Open it to keep working, then click Check My Report."
                    : report?.configured === false
                        ? "Your teacher is still setting up the research report template."
                        : "Click Create My Research Report to make your own copy in Google Docs.");
            }).catch((error) => setStatus(error?.message || "Could not load your research report.", "error"));
        }

        openButton.addEventListener("click", async () => {
            if (templateMissing) {
                setStatus("Your teacher is still setting up the research report template.");
                return;
            }
            // Reserve the tab during the click so Google permission does not trigger popup blocking.
            const reportTab = window.open("about:blank", "_blank");
            if (reportTab) reportTab.opener = null;
            busy(true);
            setStatus("Getting your research report ready...");
            try {
                if (!options.onResearchReportOpen) throw new Error("Open the student activity to create your report.");
                const report = await options.onResearchReportOpen();
                if (!report?.documentUrl) throw new Error("Your research report could not be opened. Please try again.");
                showReport(report);
                if (reportTab && !reportTab.closed) reportTab.location.replace(report.documentUrl);
                else window.open(report.documentUrl, "_blank", "noopener");
                setStatus(report.created
                    ? "Your research report has been created in your KITS folder. Add your research, then click Check My Report."
                    : "Your research report is open in a new tab. Add your research, then click Check My Report.");
            } catch (error) {
                if (reportTab && !reportTab.closed) reportTab.close();
                setStatus(error?.message || "Could not create your research report. Please try again.", "error");
            } finally {
                busy(false);
            }
        });

        checkButton.addEventListener("click", async () => {
            busy(true);
            setStatus("Checking your research report...");
            try {
                if (!options.onResearchReportCheck) throw new Error("Open the student activity to check your report.");
                const grade = await options.onResearchReportCheck();
                setStatus(grade.feedback, grade.passed ? "correct" : "");
            } catch (error) {
                setStatus(error?.message || "Could not check your research report. Please try again.", "error");
            } finally {
                busy(false);
            }
        });
    }

    function renderWorksheet(host, content, options = {}) {
        if (!host) return;

        const responses = options.responses || {};
        const readOnly = Boolean(options.readOnly);
        const theme = content?.theme || {};
        const questions = content?.loginSites ? [] : Array.isArray(content?.questions) ? content.questions : [];
        const images = Array.isArray(content?.images) ? content.images : [];
        const imageInformationLayout = Boolean(content?.information && images.length);
        const juniorLoginSites = [7, 8].includes(options.huntProfile?.year);
        const siteLevel = options.huntProfile?.courseIds?.includes("STAFF") ? "staff" : juniorLoginSites ? "junior"
            : [9, 10].includes(options.huntProfile?.year) ? "middle" : [11, 12, 13].includes(options.huntProfile?.year) ? "senior" : null;
        const loginSites = visibleLoginSites(content?.loginSites, options.huntProfile);
        const hasSiteQuestions = loginSites.some((site) => site.readinessQuestion);

        host.style.setProperty("--worksheet-theme-color", theme.color || "#2f8f61");
        host.style.setProperty("--worksheet-accent-color", theme.accent || "#ffd166");

        host.innerHTML = `
            ${options.backHref ? `<a class="worksheet-activity-back" href="${escapeHtml(options.backHref)}">&larr; All activities</a>` : ""}
            <div class="worksheet-banner">
                <span class="worksheet-banner-icon" aria-hidden="true">${escapeHtml(theme.icon || "\ud83d\udcdd")}</span>
                <div class="worksheet-banner-copy">
                    ${options.eyebrow ? `<span class="worksheet-banner-eyebrow">${escapeHtml(options.eyebrow)}</span>` : ""}
                    <h1>${escapeHtml(content?.bannerTitle || "Untitled Kit")}</h1>
                    ${content?.bannerSubtitle ? `<p>${escapeHtml(content.bannerSubtitle)}</p>` : ""}
                </div>
            </div>
            ${content?.instructions ? `
                <div class="worksheet-instructions">
                    <span class="worksheet-instructions-icon" aria-hidden="true">\u270f\ufe0f</span>
                   <div class="worksheet-instructions-copy">${renderInstructions(content.instructions)}</div>
                </div>
            ` : ""}
            ${imageInformationLayout ? `<div class="worksheet-image-information-layout">` : ""}
            ${images.length ? `
                <div class="worksheet-image-panel">
                    ${images.map((image) => renderWorksheetImage(image)).join("")}
                </div>
            ` : ""}
            ${content?.information ? `
                <section class="worksheet-assessment-intro worksheet-identity-guide" aria-labelledby="identity-guide-title">
                    <h2 id="identity-guide-title">${escapeHtml(content.information.title)}</h2>
                    ${(content.information.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
                </section>
            ` : ""}
            ${imageInformationLayout ? `</div>` : ""}
            ${content?.researchReport ? `
                <section class="worksheet-assessment-intro worksheet-research-report" aria-labelledby="research-report-title" data-research-report>
                    <h2 id="research-report-title">📝 My Research Report</h2>
                    <p>Record what you discover about the West Coast in your own Google Doc. It is saved in your <strong>WHS-DTECH</strong> folder, inside your DTECH folder and <strong>KITS</strong>.</p>
                    <p>When you have added your research, click <strong>Check My Report</strong> to earn your activity tick.</p>
                    <div class="worksheet-research-report-actions">
                        <button type="button" class="worksheet-btn worksheet-btn-primary" data-research-report-open ${readOnly ? "disabled" : ""}>Create My Research Report</button>
                        <button type="button" class="worksheet-btn worksheet-btn-secondary" data-research-report-check ${readOnly ? "disabled" : ""} hidden>Check My Report</button>
                    </div>
                    <p class="worksheet-assessment-result" data-research-report-status role="status" aria-live="polite">${readOnly ? "Sign in with your school Google account to create your research report." : "Loading your research report..."}</p>
                </section>
            ` : ""}
            ${content?.assessment ? renderAssessment(content.assessment, options.assessmentAnswers || {}, readOnly) : ""}
            ${content?.loginSites ? `
                <section class="worksheet-login-staircase" aria-labelledby="login-staircase-title">
                    <h2 id="login-staircase-title">Step into your learning websites</h2>
                    <p>Each step introduces a website used in DTECH. Click its logo to open it in a new tab, keeping this activity open.</p>
                    <p>Use the website or class links below. Follow your teacher's sign-in instructions; never share your password.</p>
                    ${siteLevel ? "<p>Showing the websites your teacher has enabled for your profile.</p>" : "<p>No year profile is linked yet. Showing generally available sites; ask your teacher to check your profile.</p>"}
                    ${!loginSites.length ? "<p>No websites are currently enabled for your level. Ask your teacher for guidance.</p>" : ""}
                    <ol class="login-staircase-list">
                        ${loginSites.map((site) => `
                            <li class="login-staircase-step">
                                <div class="login-staircase-description"><h3>${escapeHtml(site.name)}</h3><p>${escapeHtml(site.description)}</p></div>
                                <div class="login-staircase-years"><strong>${escapeHtml(site.group)}</strong><span>${escapeHtml(site.years)}</span></div>
                                <a class="login-staircase-logo" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(site.name)} in a new tab">
                                    <img src="${escapeHtml(site.logo)}" alt="${escapeHtml(site.name)} logo" referrerpolicy="no-referrer">
                                    <span>Open ${escapeHtml(site.name)} &nearr;</span>
                                </a>
                                ${site.readinessQuestion ? `
                                    <form class="login-site-check" data-site-check="${escapeHtml(site.readinessQuestion.id)}">
                                        ${site.readinessQuestion.tools ? `<h4>${escapeHtml(site.readinessQuestion.prompt)}</h4>` : `<label for="login-site-${escapeHtml(site.readinessQuestion.id)}">${escapeHtml(site.readinessQuestion.prompt)}</label>`}
                                        <p>${escapeHtml(site.readinessQuestion.hint)}</p>
                                        ${site.readinessQuestion.tools ? site.readinessQuestion.tools.map((tool) => `
                                            <div class="login-site-tool">
                                                <img src="${escapeHtml(tool.image)}" alt="${escapeHtml(site.name)} ${escapeHtml(tool.label)} icon">
                                                <div>
                                                    <label for="login-site-${escapeHtml(tool.id)}">${escapeHtml(tool.label)} name</label>
                                                    <input id="login-site-${escapeHtml(tool.id)}" name="${escapeHtml(tool.id)}" maxlength="200" autocomplete="off" value="${escapeHtml(options.assessmentAnswers?.[tool.id] || "")}" aria-describedby="feedback-${escapeHtml(tool.id)}" ${readOnly ? "disabled" : ""}>
                                                    <p id="feedback-${escapeHtml(tool.id)}" data-tool-feedback="${escapeHtml(tool.id)}" hidden></p>
                                                </div>
                                            </div>
                                        `).join("") : `<input id="login-site-${escapeHtml(site.readinessQuestion.id)}" name="${escapeHtml(site.readinessQuestion.id)}" maxlength="200" value="${escapeHtml(options.assessmentAnswers?.[site.readinessQuestion.id] || "")}" ${readOnly ? "disabled" : ""}>`}
                                        <button class="worksheet-btn worksheet-btn-primary" type="submit" ${readOnly ? "disabled" : ""}>Check ${escapeHtml(site.name)} answer</button>
                                        <p class="login-site-result" role="status" aria-live="polite">${options.assessmentAnswers?.[`${site.readinessQuestion.id}Ready`] ? `&#10003; ${escapeHtml(site.name)} readiness check saved.` : `Sign in to ${escapeHtml(site.name)}, then answer from a quick glance at your home page.`}</p>
                                    </form>
                                ` : ""}
                            </li>
                        `).join("")}
                    </ol>
                    ${hasSiteQuestions ? "<p>Answer all the questions on the websites visible to you correctly, then check your answers to save your activity completion tick automatically. Hidden websites and websites without questions do not count.</p>"
                        : "<p>No website questions are enabled for you. When you have explored the visible websites, use <strong>Mark Activity Complete</strong> below to save your tick.</p>"}
                    <p>Site checks save your answers as readiness evidence, not direct verification of another website's login.</p>
                </section>
            ` : ""}
            <div class="worksheet-question-list">
                ${questions.length ? questions.map((question, index) => `
                    <article class="worksheet-question ${question?.presentation === "real-search" ? "worksheet-question--real-search" : ""}">
                        <span class="worksheet-question-number" aria-hidden="true">${index + 1}</span>
                        <div class="worksheet-question-body">
                            ${question?.presentation === "real-search" ? `<span class="worksheet-question-context"><span aria-hidden="true">🌿</span> Real-world search</span>` : ""}
                            ${question?.heading ? `<h3 class="worksheet-question-heading">${escapeHtml(question.heading)}</h3>` : ""}
                            <p class="worksheet-question-prompt">${escapeHtml(question?.prompt || "")}</p>
                            ${renderQuestionBody(question, responses, readOnly)}
                            ${["search-results-detective-v1", "search-and-find-v1"].includes(content?.questionAutoMarkAssessmentId)
                                ? `<p class="worksheet-choice-feedback" data-question-feedback="${escapeHtml(question.id)}" role="status" aria-live="polite" aria-atomic="true" hidden></p>`
                                : ""}
                            ${content?.identityLessonVersion ? `<p class="worksheet-assessment-feedback" data-identity-feedback="${escapeHtml(question.id)}" role="status" aria-live="polite">Type your answer. We will check it against your school Google account.</p>` : ""}
                        </div>
                    </article>
                `).join("") : content?.assessment || content?.loginSites || content?.researchReport ? "" : `<p class="worksheet-empty-note">This kit does not have any questions yet.</p>`}
            </div>
            ${content?.identityLessonVersion ? `<p class="worksheet-assessment-result" id="identity-result" role="status" aria-live="polite">${options.identityVerified ? "Google sign-in is ready. Click Check your answers to mark all four answers." : "Complete questions 1-4, verify your school email in step 5, then click Check your answers."}</p><button type="button" class="worksheet-btn worksheet-btn-primary" id="identity-retry" ${readOnly ? "disabled" : ""}>Check your answers</button>` : ""}
        `;

        if (content?.assessment?.id === "learning-sites-treasure-v1") {
            wireLearningSites(host, content.assessment, { ...options, readOnly });
            if (readOnly) return;
        } else if (readOnly) return;

        if (content?.researchReport) wireResearchReport(host, options);

        if (content?.loginSites) host.querySelectorAll("[data-site-check]").forEach((form) => {
            const inputs = form.querySelectorAll("input");
            const button = form.querySelector("button");
            const result = form.querySelector(".login-site-result");
            inputs.forEach((input) => input.addEventListener("input", () => {
                result.textContent = "Answer changed. Check again to save your readiness evidence.";
                form.querySelectorAll("[data-tool-feedback]").forEach((feedback) => { feedback.hidden = true; });
            }));
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (button.disabled) return;
                button.disabled = true;
                inputs.forEach((input) => { input.disabled = true; });
                result.textContent = "Checking and saving...";
                try {
                    const answers = { ...options.assessmentAnswers };
                    host.querySelectorAll("[data-site-check] input").forEach((field) => { answers[field.name] = field.value; });
                    const grade = await options.onAssessmentCheck(answers);
                    const marked = grade.results.find((entry) => entry.id === form.getAttribute("data-site-check"));
                    if (!marked) throw new Error("Your teacher has changed this website's settings. Reload the activity before checking again.");
                    host.querySelectorAll("[data-site-check]").forEach((siteForm) => {
                        const siteResult = grade.results.find((entry) => entry.id === siteForm.getAttribute("data-site-check"));
                        siteForm.querySelector(".login-site-result").textContent = siteResult
                            ? `${siteResult.correct ? "\u2713 " : ""}${siteResult.explanation}`
                            : "Your teacher has changed this website's settings. Reload the activity.";
                    });
                    form.querySelectorAll("[data-tool-feedback]").forEach((feedback) => {
                        const tool = grade.toolResults.find((entry) => entry.id === feedback.getAttribute("data-tool-feedback"));
                        if (!tool) throw new Error("Your teacher has changed the tool questions. Reload the activity before checking again.");
                        feedback.hidden = false;
                        feedback.textContent = tool.explanation;
                        feedback.classList.toggle("is-correct", tool.correct);
                        feedback.classList.toggle("is-error", !tool.correct);
                    });
                } catch (error) {
                    result.textContent = error?.message || "Could not save your site check. Try again.";
                } finally {
                    inputs.forEach((input) => { input.disabled = false; });
                    button.disabled = false;
                }
            });
        });

        if (content?.assessment?.id === "apps-wordsearch-v1") wireAppsAssessment(host, content.assessment, options);
        else if (content?.assessment && content.assessment.id !== "learning-sites-treasure-v1") wireAssessment(host, options);

        if (content?.identityLessonVersion) {
            let timer;
            let revision = 0;
            const result = host.querySelector("#identity-result");
            const check = async () => {
                const currentRevision = revision;
                const answers = {};
                host.querySelectorAll(".worksheet-answer-input").forEach((input) => {
                    answers[input.getAttribute("data-question-id")] = input.value;
                });
                result.textContent = "Checking and saving your answers...";
                result.classList.remove("is-error", "is-correct");
                try {
                    const grade = await options.onIdentityCheck(answers);
                    if (currentRevision !== revision) return;
                    host.querySelectorAll("[data-identity-feedback]").forEach((feedback) => {
                        const marked = grade.results.find((entry) => entry.id === feedback.getAttribute("data-identity-feedback"));
                        feedback.textContent = marked.explanation;
                        feedback.classList.toggle("is-correct", marked.correct);
                        feedback.classList.toggle("is-error", !marked.correct);
                    });
                    result.classList.toggle("is-correct", grade.passed);
                    result.textContent = grade.passed
                        ? "4 / 4 correct! Ka pai! Your completion tick is saved."
                        : `${grade.score} / 4 correct. Your answers are saved. Keep going - use the hints and try again!`;
                } catch (error) {
                    if (currentRevision !== revision) return;
                    result.classList.add("is-error");
                    result.textContent = error?.message || "Could not check or save your answers. Please try again.";
                }
            };
            host.querySelectorAll(".worksheet-answer-input").forEach((input) => {
                input.addEventListener("input", () => {
                    revision += 1;
                    window.clearTimeout(timer);
                    const feedback = Array.from(host.querySelectorAll("[data-identity-feedback]")).find((node) =>
                        node.getAttribute("data-identity-feedback") === input.getAttribute("data-question-id")
                    );
                    feedback.classList.remove("is-correct", "is-error");
                    feedback.textContent = options.identityVerified === false
                        ? "Keep going! Verify your email in step 5, then check your answers."
                        : "Keep going! We will check when you pause typing.";
                    if (options.identityVerified !== false) timer = window.setTimeout(check, 650);
                });
            });
            host.querySelector("#identity-retry").addEventListener("click", () => {
                window.clearTimeout(timer);
                void check();
            });
            return;
        }

        host.querySelectorAll(".worksheet-answer-input").forEach((textarea) => {
            textarea.addEventListener("change", () => {
                const questionId = textarea.getAttribute("data-question-id");
                options.onResponseChange?.(questionId, textarea.value);
            });
        });

        host.querySelectorAll("[data-hint-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                const expanded = button.getAttribute("aria-expanded") !== "true";
                const questionId = button.getAttribute("data-hint-toggle");
                const hint = Array.from(host.querySelectorAll("[data-question-hint]")).find((node) =>
                    node.getAttribute("data-question-hint") === questionId);
                if (!hint) return;
                button.setAttribute("aria-expanded", String(expanded));
                hint.hidden = !expanded;
            });
        });

        host.querySelectorAll(".worksheet-checklist-item input[type=checkbox]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const questionId = checkbox.getAttribute("data-question-id");
                const optionValue = checkbox.getAttribute("data-option-value");
                const current = Array.isArray(responses[questionId]) ? responses[questionId].slice() : [];
                const next = checkbox.checked
                    ? Array.from(new Set([...current, optionValue]))
                    : current.filter((value) => value !== optionValue);
                responses[questionId] = next;
                options.onResponseChange?.(questionId, next);
            });
        });

        host.querySelectorAll(".worksheet-choice-bubble, .worksheet-search-result").forEach((button) => {
            button.addEventListener("click", () => {
                const questionId = button.getAttribute("data-question-id");
                const optionValue = button.getAttribute("data-option-value");
                responses[questionId] = optionValue;
                host.querySelectorAll(".worksheet-choice-bubble, .worksheet-search-result")
                    .forEach((sibling) => {
                        if (sibling.getAttribute("data-question-id") !== questionId) return;
                        const selected = sibling === button;
                        sibling.classList.toggle("is-selected", selected);
                        if (sibling.classList.contains("worksheet-search-result")) {
                            sibling.setAttribute("aria-pressed", String(selected));
                        }
                    });
                options.onResponseChange?.(questionId, optionValue);
            });
        });
    }

    function renderKitOverview(host, content, options = {}) {
        if (!host) return;

        const theme = content?.theme || {};
        const worksheets = Array.isArray(content?.worksheets) ? content.worksheets : [];
        const activities = Array.isArray(content?.activities) ? content.activities : [];
        const completedActivities = options.completedActivities || {};
        const visibleWorksheets = worksheets.map((worksheet, index) => ({ worksheet, index }))
            .filter(({ worksheet }) => worksheet.mergedInto === undefined && !worksheet.hidden && !worksheet.libraryOnly);
        const completedCount = visibleWorksheets.filter(({ index }) => Boolean(completedActivities[index])).length;

        host.style.setProperty("--worksheet-theme-color", theme.color || "#2f8f61");
        host.style.setProperty("--worksheet-accent-color", theme.accent || "#ffd166");
        host.innerHTML = `
            <div class="worksheet-banner">
                <span class="worksheet-banner-icon" aria-hidden="true">${escapeHtml(theme.icon || "\ud83d\udcdd")}</span>
                <div class="worksheet-banner-copy">
                    <h1>${escapeHtml(content?.bannerTitle || "Untitled Kit")}</h1>
                    ${content?.bannerSubtitle ? `<p>${escapeHtml(content.bannerSubtitle)}</p>` : ""}
                </div>
            </div>
            ${content?.instructions ? `
                <div class="worksheet-instructions">
                    <span class="worksheet-instructions-icon" aria-hidden="true">\u270f\ufe0f</span>
                    <div class="worksheet-instructions-copy">${renderInstructions(content.instructions)}</div>
                </div>
            ` : ""}
            ${options.minecraftExports ? `
                <section class="worksheet-assessment-intro worksheet-minecraft-exports" aria-labelledby="minecraft-exports-title" data-minecraft-exports>
                    <h2 id="minecraft-exports-title">\ud83d\udcc1 Set up your Minecraft Exports folder</h2>
                    <p>Before you start building, make a safe place in Google Drive to keep your exported worlds, screenshots, Portfolio and videos.</p>
                    <ol>
                        <li>Click <strong>Create &amp; Open My Minecraft Exports Folder</strong>. Your folder opens in a new tab: <strong>WHS-DTECH \u2192 your course \u2192 KITS \u2192 Minecraft Exports</strong>.</li>
                        <li>In Minecraft Education, go to <strong>Play \u2192 View My Worlds</strong>, click the pencil \u270f\ufe0f next to your world, then <strong>Export World</strong>.</li>
                        <li>Check where the <strong>.mcworld</strong> file saves. If you're not sure, look in your <strong>Downloads</strong> folder.</li>
                        <li>Drag the <strong>.mcworld</strong> file into your Minecraft Exports tab. Do this at the end of every lesson so your work is safe.</li>
                    </ol>
                    <div class="worksheet-research-report-actions">
                        <button type="button" class="worksheet-btn worksheet-btn-primary" data-minecraft-exports-open ${options.readOnly ? "disabled" : ""}>Create &amp; Open My Minecraft Exports Folder</button>
                    </div>
                    <p class="worksheet-assessment-result" data-minecraft-exports-status role="status" aria-live="polite">${options.readOnly ? "Sign in with your school Google account to create your Minecraft Exports folder." : ""}</p>
                </section>
            ` : ""}
            <section class="worksheet-activities" aria-labelledby="worksheet-activities-title">
                <h2 id="worksheet-activities-title">Activities</h2>
                <p class="worksheet-activity-progress">${completedCount} / ${visibleWorksheets.length} activities completed</p>
                ${visibleWorksheets.length ? `
                    <ol class="worksheet-activity-list">
                        ${visibleWorksheets.map(({ worksheet, index }) => {
                            const activity = activities[index] || {};
                            const title = activity.title || worksheet.activity || `Activity ${index + 1}`;
                            const establishes = activity.establishes || worksheet.establishes || "";
                            const href = `./kit-worksheet.html?kit=${encodeURIComponent(options.kitId || "")}&activity=${index}`;
                            const completed = Boolean(completedActivities[index]);
                            return `
                                <li class="worksheet-activity-card ${completed ? "is-complete" : ""}">
                                    <span class="worksheet-activity-number ${completed ? "is-complete" : ""}" role="img" aria-label="${completed ? "Completed" : "Not completed"}">${completed ? "&#10003;" : ""}</span>
                                    <div class="worksheet-activity-copy">
                                        <h3>${escapeHtml(title)}</h3>
                                        ${establishes ? `<p>${escapeHtml(establishes)}</p>` : ""}
                                    </div>
                                    <a class="worksheet-activity-link" href="${escapeHtml(href)}">Open Activity</a>
                                </li>
                            `;
                        }).join("")}
                    </ol>
                ` : `<p class="worksheet-empty-note">No activities have been added to this kit yet.</p>`}
            </section>
        `;
        wireMinecraftExports(host, options);
    }

    function wireMinecraftExports(host, options) {
        const section = host.querySelector?.("[data-minecraft-exports]");
        if (!section) return;
        const button = section.querySelector("[data-minecraft-exports-open]");
        const status = section.querySelector("[data-minecraft-exports-status]");
        const setStatus = (message, error = false) => {
            status.textContent = message;
            status.classList.toggle("is-error", error);
            status.classList.toggle("is-correct", !error && Boolean(message));
        };
        button.addEventListener("click", async () => {
            // Reserve the tab during the click so Google permission does not trigger popup blocking.
            const folderTab = window.open("about:blank", "_blank");
            if (folderTab) folderTab.opener = null;
            button.disabled = true;
            setStatus("");
            status.textContent = "Getting your Minecraft Exports folder ready...";
            try {
                if (!options.onMinecraftExportsOpen) throw new Error("Sign in with your school Google account first.");
                const folder = await options.onMinecraftExportsOpen();
                if (!folder?.folderUrl) throw new Error("Your Minecraft Exports folder could not be opened. Please try again.");
                if (folderTab && !folderTab.closed) folderTab.location.replace(folder.folderUrl);
                else window.open(folder.folderUrl, "_blank", "noopener");
                setStatus(`Your folder is open in a new tab: ${(folder.path || []).join(" \u2192 ")}. Drag your exported .mcworld files into it.`);
            } catch (error) {
                if (folderTab && !folderTab.closed) folderTab.close();
                setStatus(error?.message || "Could not open your Minecraft Exports folder. Please try again.", true);
            } finally {
                button.disabled = false;
            }
        });
    }

    window.KitWorksheetRender = { renderWorksheet, renderKitOverview, visibleLoginSites };
})();
