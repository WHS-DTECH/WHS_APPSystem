(function () {
    const HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
    const SCHOOL_DOMAIN = "westlandhigh.school.nz";
    const STUDENT_PERIOD_COLUMNS = [
        "mon_p1_1", "mon_p1_2", "mon_p2", "mon_i", "mon_p3", "mon_p4", "mon_l", "mon_p5",
        "tue_p1_1", "tue_p1_2", "tue_p2", "tue_i", "tue_p3", "tue_p4", "tue_l", "tue_p5",
        "wed_p1_1", "wed_p1_2", "wed_p2", "wed_i", "wed_p3", "wed_p4", "wed_l", "wed_p5",
        "thu_p1_1", "thu_p1_2", "thu_p2", "thu_i", "thu_p3", "thu_p4", "thu_l", "thu_p5",
        "fri_p1_1", "fri_p1_2", "fri_p2", "fri_i", "fri_p3", "fri_p4", "fri_l", "fri_p5"
    ];

    const avatarEl = document.querySelector("#profile-avatar");
    const nameEl = document.querySelector("#profile-name");
    const emailEl = document.querySelector("#profile-email");
    const domainEl = document.querySelector("#profile-domain");
    const roleEl = document.querySelector("#profile-role");
    const authStatusEl = document.querySelector("#profile-auth-status");
    const teacherViewEl = document.querySelector("#profile-teacher-view");
    const topStatusEl = document.querySelector("#profile-top-status");
    const readyPillEl = document.querySelector("#profile-ready-pill");
    const loginPillEl = document.querySelector("#profile-login-pill");
    const connectionEl = document.querySelector("#profile-connection");
    const timetableEl = document.querySelector("#profile-timetable");
    const timetableCardEl = timetableEl ? timetableEl.closest(".profile-card") : null;
    const overviewSubtextEl = document.querySelector("#profile-overview-subtext");
    const courseStandardsEl = document.querySelector("#profile-course-standards");
    const timetableSubtextEl = document.querySelector("#profile-timetable-subtext");
    const csvLinksEl = document.querySelector("#profile-csv-links");
    const uploadHistoryEl = document.querySelector("#profile-upload-history");
    const classesEl = document.querySelector("#profile-classes");
    const trelloConnectionEl = document.querySelector("#profile-trello-connection");
    const trelloBoardsEl = document.querySelector("#trello-boards");
    const trelloManualBox = document.querySelector("#trello-manual-box");
    const trelloConnectBtn = document.querySelector("#trello-connect-btn");
    const trelloDisconnectBtn = document.querySelector("#trello-disconnect-btn");
    const trelloRefreshBoardsBtn = document.querySelector("#trello-refresh-boards-btn");
    const trelloManualGenerateBtn = document.querySelector("#trello-manual-generate-btn");
    const trelloManualTokenInput = document.querySelector("#trello-manual-token");
    const trelloManualConnectBtn = document.querySelector("#trello-manual-connect-btn");
    const csvLinksCardEl = csvLinksEl ? csvLinksEl.closest(".profile-card") : null;
    const uploadHistoryCardEl = uploadHistoryEl ? uploadHistoryEl.closest(".profile-card") : null;
    const classesCardEl = classesEl ? classesEl.closest(".profile-card") : null;

    function getStoredAuth() {
        try {
            const localRaw = localStorage.getItem(HUB_AUTH_STORAGE_KEY);
            if (localRaw) {
                return JSON.parse(localRaw);
            }
        } catch (_error) {
        }

        try {
            const sessionRaw = sessionStorage.getItem(HUB_AUTH_STORAGE_KEY);
            if (sessionRaw) {
                return JSON.parse(sessionRaw);
            }
        } catch (_error) {
        }

        return null;
    }

    function getStoredAccessToken() {
        const auth = getStoredAuth();
        if (!auth?.expiresAt || Number(auth.expiresAt) <= Date.now()) {
            return "";
        }
        return String(auth?.idToken || auth?.accessToken || "").trim();
    }

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

    const COURSE_STANDARDS_GUIDANCE = {
        "11DTECH": ["29777", "92004", "91893", "91897", "92006", "92005"]
    };

    function resolveCourseGuidance(row) {
        const year = String(row?.year_level || row?.yearlevel || "").trim().replace(/^year\s*/i, "");
        const programs = Array.isArray(row?.programs) ? row.programs.map((value) => String(value || "").trim().toUpperCase()) : [];
        const courseToken = programs.find((value) => /^(?:DTECH|COMP)$/.test(value)) || "";
        const courseKey = year && courseToken ? `${year}${courseToken}` : "";
        return {
            year,
            course: courseToken,
            courseKey,
            standards: Array.isArray(COURSE_STANDARDS_GUIDANCE[courseKey]) ? COURSE_STANDARDS_GUIDANCE[courseKey] : [],
            url: courseKey
                ? `https://tech-learningsites.onrender.com/${courseToken}/${encodeURIComponent(courseKey)}/`
                : ""
        };
    }

    function renderCourseStandardsGuidance(row) {
        if (!courseStandardsEl) return;
        const guidance = resolveCourseGuidance(row);
        if (!guidance.year && !guidance.course) {
            setInfoStack(courseStandardsEl, [{ text: "No timetable year/course combination found yet.", variant: "warn" }]);
            return;
        }

        const courseLabel = guidance.courseKey || [guidance.year && `Year ${guidance.year}`, guidance.course].filter(Boolean).join(" ");
        const linkHtml = guidance.url
            ? `<a href="${guidance.url}" target="_blank" rel="noreferrer">Open ${courseLabel} Learning Site page</a>`
            : "Learning Site page unavailable for this course combination.";
        courseStandardsEl.innerHTML = `
            <div class="info-line"><strong>Course:</strong> ${courseLabel}</div>
            <div class="info-line"><strong>Learning Site:</strong> ${linkHtml}</div>
            <div class="info-line ${guidance.standards.length ? "" : "is-warn"}"><strong>Available standards:</strong> ${guidance.standards.length ? guidance.standards.join(", ") : "Not configured yet"}</div>
        `;
    }

    function normalizePersonName(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .replace(/\s+/g, " ");
    }

    function canonicalizeEmail(value) {
        const normalized = normalizeEmail(value);
        if (!normalized.includes("@")) {
            return "";
        }

        const [localPart, domain] = normalized.split("@");
        const canonicalLocalPart = String(localPart || "").replace(/[^a-z0-9]/g, "");
        if (!canonicalLocalPart || !domain) {
            return "";
        }

        return `${canonicalLocalPart}@${domain}`;
    }

    function buildEmailMatchKeys(value) {
        const keys = new Set();
        const normalized = normalizeEmail(value);
        if (!normalized.includes("@")) {
            return keys;
        }

        keys.add(normalized);
        const canonical = canonicalizeEmail(normalized);
        if (canonical) {
            keys.add(canonical);
        }

        return keys;
    }

    function pickFirstNonEmpty(values) {
        for (let i = 0; i < values.length; i += 1) {
            const value = String(values[i] || "").trim();
            if (value) {
                return value;
            }
        }
        return "";
    }

    function getRowDisplayName(row) {
        if (!row || typeof row !== "object") {
            return "";
        }

        const directName = pickFirstNonEmpty([
            row.display_name,
            row.name,
            row.student_name,
            row.Student_Name,
            row.full_name
        ]);

        if (directName) {
            return directName;
        }

        const firstName = pickFirstNonEmpty([row.first_name, row.firstname, row.first]);
        const lastName = pickFirstNonEmpty([row.last_name, row.lastname, row.surname]);
        const combined = `${firstName} ${lastName}`.trim();
        if (combined) {
            return combined;
        }

        const email = pickFirstNonEmpty([
            row.email_school,
            row.Email_School,
            row.email,
            row.Email,
            row.user_email,
            row.User_Email,
            row.staff_email,
            row.Staff_Email
        ]);
        return email.includes("@") ? email.split("@")[0] : "";
    }

    function getInitials(name, email) {
        const base = String(name || "").trim() || normalizeEmail(email).split("@")[0] || "UP";
        const parts = base.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
        }
        return String(base.slice(0, 2)).toUpperCase();
    }

    function setInfoStack(element, lines) {
        if (!element) return;
        element.innerHTML = "";

        if (!Array.isArray(lines) || !lines.length) {
            const empty = document.createElement("div");
            empty.className = "info-line";
            empty.textContent = "No linked records found yet.";
            element.appendChild(empty);
            return;
        }

        lines.forEach((line) => {
            const row = document.createElement("div");
            row.className = "info-line" + (line.variant ? ` is-${line.variant}` : "");
            row.textContent = line.text;
            element.appendChild(row);
        });
    }

    async function fetchJson(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
        }
        return response.json();
    }

    function collectCandidateEmails(row) {
        const values = [
            row && row.email_school,
            row && row.Email_School,
            row && row.email,
            row && row.Email,
            row && row.user_email,
            row && row.User_Email,
            row && row.staff_email,
            row && row.Staff_Email,
            row && row.google_email,
            row && row.Google_Email,
            row && row.student_email,
            row && row.Student_Email,
            row && row.email_address,
            row && row.Email_Address,
            row && row.school_email,
            row && row.School_Email,
            row && row.student_google_email,
            row && row.Student_Google_Email,
            row && row.student_mail,
            row && row.Student_Mail,
            row && row.mail,
            row && row.Mail,
            row && row.upn,
            row && row.UPN
        ];

        const usernames = [
            row && row.username,
            row && row.Username,
            row && row.user_name,
            row && row.User_Name,
            row && row.student_username,
            row && row.Student_Username,
            row && row.login,
            row && row.Login,
            row && row.student_login,
            row && row.Student_Login
        ];

        const normalized = new Set();
        values.forEach((value) => {
            const email = normalizeEmail(value);
            if (email.includes("@")) {
                normalized.add(email);
            }
        });

        usernames.forEach((username) => {
            const base = String(username || "").trim().toLowerCase();
            if (!base) return;
            if (base.includes("@")) {
                normalized.add(base);
                return;
            }
            normalized.add(`${base}@${SCHOOL_DOMAIN}`);
        });

        return normalized;
    }

    function collectCandidateEmailMatchKeys(row) {
        const keys = new Set();
        collectCandidateEmails(row).forEach((email) => {
            buildEmailMatchKeys(email).forEach((key) => keys.add(key));
        });
        return keys;
    }

    function hasMatchingEmailKey(row, email) {
        const targetKeys = buildEmailMatchKeys(email);
        if (!targetKeys.size) {
            return false;
        }

        const rowKeys = collectCandidateEmailMatchKeys(row);
        for (const key of targetKeys) {
            if (rowKeys.has(key)) {
                return true;
            }
        }

        return false;
    }

    function buildTimetableLabel(key) {
        return String(key || "")
            .replace(/_/g, " ")
            .replace(/\bmon\b/i, "Mon")
            .replace(/\btue\b/i, "Tue")
            .replace(/\bwed\b/i, "Wed")
            .replace(/\bthu\b/i, "Thu")
            .replace(/\bfri\b/i, "Fri")
            .replace(/\bp\b/gi, "P")
            .replace(/\bi\b/gi, "I")
            .replace(/\bl\b/gi, "L")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getTimetableEntries(row) {
        const lowerKeyMap = new Map(
            Object.keys(row || {}).map((key) => [String(key || "").toLowerCase(), key])
        );

        return STUDENT_PERIOD_COLUMNS
            .map((columnName) => {
                const matchedKey = lowerKeyMap.get(String(columnName).toLowerCase()) || columnName;
                return {
                    key: columnName,
                    label: buildTimetableLabel(columnName),
                    value: String(row && row[matchedKey] || "").trim()
                };
            })
            .filter((entry) => entry.value);
    }

    function collectStudentNameCandidates(values) {
        return Array.from(new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => normalizePersonName(value))
                .filter(Boolean)
        ));
    }

    function collectLinkedStudentRows(studentRows, email, candidateNames) {
        const nameSet = new Set(collectStudentNameCandidates(candidateNames));

        const normalizedNameTokens = Array.from(nameSet).map((name) =>
            new Set(name.split(" ").filter(Boolean))
        );

        return studentRows.filter((row) => {
            if (hasMatchingEmailKey(row, email)) {
                return true;
            }

            const rowName = normalizePersonName(getRowDisplayName(row) || row.student_name);
            if (!rowName) {
                return false;
            }

            if (nameSet.has(rowName)) {
                return true;
            }

            const rowTokens = new Set(rowName.split(" ").filter(Boolean));
            if (!rowTokens.size) {
                return false;
            }

            return normalizedNameTokens.some((candidateTokens) => {
                if (!candidateTokens.size) {
                    return false;
                }

                let overlap = 0;
                candidateTokens.forEach((token) => {
                    if (rowTokens.has(token)) {
                        overlap += 1;
                    }
                });

                return overlap >= 2;
            });
        });
    }

    function normalizeCode(value) {
        return String(value || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .trim();
    }

    function collectTeacherIdentifiers(email, candidateNames, staffRows) {
        const emailSet = new Set();
        const codeSet = new Set();
        const nameSet = new Set();

        const normalizedEmail = normalizeEmail(email);
        if (normalizedEmail) {
            emailSet.add(normalizedEmail);
            const localPart = normalizedEmail.split("@")[0] || "";
            const localCode = normalizeCode(localPart);
            if (localCode) {
                codeSet.add(localCode);
            }
        }

        collectStudentNameCandidates(candidateNames).forEach((name) => {
            nameSet.add(name);
        });

        (Array.isArray(staffRows) ? staffRows : []).forEach((row) => {
            collectCandidateEmails(row).forEach((linkedEmail) => {
                emailSet.add(linkedEmail);
                const localPart = String(linkedEmail).split("@")[0] || "";
                const localCode = normalizeCode(localPart);
                if (localCode) {
                    codeSet.add(localCode);
                }
            });

            [row && row.code, row && row.staff_code, row && row.staffid].forEach((value) => {
                const normalized = normalizeCode(value);
                if (normalized) {
                    codeSet.add(normalized);
                }
            });

            const displayName = normalizePersonName(getRowDisplayName(row));
            if (displayName) {
                nameSet.add(displayName);
            }
        });

        return { emailSet, codeSet, nameSet };
    }

    function collectLinkedTeacherTimetableRows(teacherRows, identifiers) {
        const safeRows = Array.isArray(teacherRows) ? teacherRows : [];
        const emailSet = identifiers && identifiers.emailSet ? identifiers.emailSet : new Set();
        const codeSet = identifiers && identifiers.codeSet ? identifiers.codeSet : new Set();
        const nameSet = identifiers && identifiers.nameSet ? identifiers.nameSet : new Set();

        const teacherCodeColumns = ["Teacher", "teacher", "teacher_code", "Teacher_Code", "staff_code", "code", "teacherid", "Teacher_ID"];
        const teacherNameColumns = ["Teacher_Name", "teacher_name", "teachername", "name", "display_name", "teacher"];
        const teacherEmailColumns = ["teacher_email", "Teacher_Email", "email", "email_school", "staff_email", "google_email", "user_email"];

        return safeRows.filter((row) => {
            const rowEmail = pickFirstNonEmpty(teacherEmailColumns.map((columnName) => row && row[columnName]));
            const normalizedEmail = normalizeEmail(rowEmail);
            if (normalizedEmail && emailSet.has(normalizedEmail)) {
                return true;
            }

            const rowCode = pickFirstNonEmpty(teacherCodeColumns.map((columnName) => row && row[columnName]));
            const normalizedCode = normalizeCode(rowCode);
            if (normalizedCode && codeSet.has(normalizedCode)) {
                return true;
            }

            const rowName = normalizePersonName(pickFirstNonEmpty(teacherNameColumns.map((columnName) => row && row[columnName])));
            if (!rowName || !nameSet.size) {
                return false;
            }

            if (nameSet.has(rowName)) {
                return true;
            }

            for (const candidate of nameSet) {
                if (rowName.includes(candidate) || candidate.includes(rowName)) {
                    return true;
                }
            }

            return false;
        });
    }

    function getTeacherTimetableEntries(row) {
        const skipColumns = new Set([
            "id", "teacher", "teacher_name", "teacher_code", "teacher_email", "email", "email_school", "staff_email",
            "upload_year", "upload_term", "upload_date", "updated_at", "created_at"
        ]);

        return Object.entries(row || {})
            .map(([key, value]) => ({ key: String(key || ""), value: String(value || "").trim() }))
            .filter((entry) => entry.value && !skipColumns.has(entry.key.toLowerCase()))
            .map((entry) => ({
                key: entry.key,
                label: buildTimetableLabel(entry.key),
                value: entry.value
            }));
    }

    function buildTeacherTimetableSummary(matching) {
        if (!matching.length) {
            return [{ text: "No teacher timetable row is linked to this profile yet.", variant: "warn" }];
        }

        const preferredRow = matching.find((row) => String(row.status || "").toLowerCase() !== "not current") || matching[0];
        const teacherCode = pickFirstNonEmpty([
            preferredRow && preferredRow.Teacher,
            preferredRow && preferredRow.teacher,
            preferredRow && preferredRow.teacher_code,
            preferredRow && preferredRow.staff_code,
            preferredRow && preferredRow.code
        ]);
        const teacherName = pickFirstNonEmpty([
            preferredRow && preferredRow.Teacher_Name,
            preferredRow && preferredRow.teacher_name,
            preferredRow && preferredRow.teachername,
            preferredRow && preferredRow.name
        ]);

        const rows = [{ text: `Linked teacher timetable rows: ${matching.length}` }];
        if (teacherCode) {
            rows.push({ text: `Teacher code: ${teacherCode}` });
        }
        if (teacherName) {
            rows.push({ text: `Teacher name: ${teacherName}` });
        }

        const entries = getTeacherTimetableEntries(preferredRow);
        if (!entries.length) {
            rows.push({ text: "No teacher timetable periods were included in the current upload.", variant: "warn" });
            return rows;
        }

        entries.slice(0, 50).forEach((entry) => {
            rows.push({ text: `${entry.label}: ${entry.value}` });
        });

        if (entries.length > 50) {
            rows.push({ text: `... plus ${entries.length - 50} more timetable fields`, variant: "warn" });
        }

        return rows;
    }

    function buildUploadHistory(staffRows, email) {
        const matching = staffRows.filter((row) => hasMatchingEmailKey(row, email));
        if (!matching.length) {
            return [{ text: "No matching staff upload rows for this account yet.", variant: "warn" }];
        }

        const labels = [];
        const seen = new Set();
        matching.forEach((row) => {
            const year = String(row.upload_year || "").trim();
            const term = String(row.upload_term || "").trim();
            const date = String(row.upload_date || "").trim();
            const code = String(row.code || row.staff_code || "").trim();
            const label = [year && `Year ${year}`, term && `Term ${term}`, code && `Code ${code}`, date && `Uploaded ${date}`].filter(Boolean).join(" | ") || "Staff upload row linked";
            if (!seen.has(label)) {
                seen.add(label);
                labels.push({ text: label });
            }
        });

        return labels.slice(0, 8);
    }

    function buildTimetableSummary(matching, candidateNames) {
        if (!matching.length) {
            return [{ text: "No timetable row is linked to this profile yet.", variant: "warn" }];
        }

        const preferredRow = matching.find((row) => String(row.status || "").toLowerCase() !== "not current") || matching[0];
        const classSet = new Set();
        const yearSet = new Set();
        const timetableEntries = getTimetableEntries(preferredRow);

        matching.forEach((row) => {
            const formClass = String(row.form_class || row.formclass || row.class_code || row.class || "").trim();
            const yearLevel = String(row.year_level || row.yearlevel || "").trim();
            if (formClass) classSet.add(formClass);
            if (yearLevel) yearSet.add(yearLevel);
        });

        const rows = [];
        rows.push({ text: `Linked timetable rows: ${matching.length}` });
        if (candidateNames && candidateNames.length) {
            rows.push({ text: `Matched profile names: ${collectStudentNameCandidates(candidateNames).join(" | ")}` });
        }
        rows.push({ text: `Form classes: ${classSet.size ? Array.from(classSet).join(", ") : "None listed"}` });
        rows.push({ text: `Year levels: ${yearSet.size ? Array.from(yearSet).join(", ") : "None listed"}` });

        if (!timetableEntries.length) {
            rows.push({ text: "No weekly timetable periods were included in the current upload.", variant: "warn" });
            return rows;
        }

        timetableEntries.forEach((entry) => {
            rows.push({ text: `${entry.label}: ${entry.value}` });
        });

        return rows;
    }

    function buildStudentTimetableMatrix(row) {
        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri"];
        const periodConfig = [
            { label: "P1", keySuffixes: ["p1_1", "p1_2"] },
            { label: "P2", keySuffixes: ["p2"] },
            { label: "P3", keySuffixes: ["p3"] },
            { label: "P4", keySuffixes: ["p4"] },
            { label: "P5", keySuffixes: ["p5"] }
        ];

        const lowerKeyMap = new Map(Object.keys(row || {}).map((key) => [String(key || "").toLowerCase(), key]));

        function getRowValue(columnKey) {
            const matchedKey = lowerKeyMap.get(String(columnKey || "").toLowerCase());
            return String(matchedKey ? row[matchedKey] : "").trim();
        }

        return {
            days: dayOrder,
            periods: periodConfig.map((period) => ({
                label: period.label,
                cells: dayOrder.map((day) => {
                    const dayPrefix = day.toLowerCase();
                    const values = period.keySuffixes
                        .map((suffix) => getRowValue(`${dayPrefix}_${suffix}`))
                        .filter(Boolean);
                    return Array.from(new Set(values)).join(" / ");
                })
            }))
        };
    }

    function renderStudentTimetableGrid(element, matchingRows) {
        if (!element) return;

        if (!matchingRows.length) {
            setInfoStack(element, [{ text: "No timetable row is linked to this profile yet.", variant: "warn" }]);
            return;
        }

        const preferredRow = matchingRows.find((row) => String(row.status || "").toLowerCase() !== "not current") || matchingRows[0];
        const classSet = new Set();
        const yearSet = new Set();

        matchingRows.forEach((row) => {
            const formClass = String(row.form_class || row.formclass || row.class_code || row.class || "").trim();
            const yearLevel = String(row.year_level || row.yearlevel || "").trim();
            if (formClass) classSet.add(formClass);
            if (yearLevel) yearSet.add(yearLevel);
        });

        const matrix = buildStudentTimetableMatrix(preferredRow);

        element.innerHTML = "";
        const meta = [
            { text: `Linked timetable rows: ${matchingRows.length}` },
            { text: `Form classes: ${classSet.size ? Array.from(classSet).join(", ") : "None listed"}` },
            { text: `Year levels: ${yearSet.size ? Array.from(yearSet).join(", ") : "None listed"}` }
        ];
        setInfoStack(element, meta);

        const wrapper = document.createElement("div");
        wrapper.className = "timetable-grid-wrapper";

        const table = document.createElement("table");
        table.className = "timetable-grid";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        const periodHead = document.createElement("th");
        periodHead.scope = "col";
        periodHead.textContent = "Period";
        headRow.appendChild(periodHead);

        matrix.days.forEach((day) => {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = day;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        matrix.periods.forEach((periodRow) => {
            const row = document.createElement("tr");
            const labelCell = document.createElement("th");
            labelCell.scope = "row";
            labelCell.textContent = periodRow.label;
            row.appendChild(labelCell);

            periodRow.cells.forEach((value) => {
                const td = document.createElement("td");
                if (value) {
                    td.textContent = value;
                } else {
                    td.textContent = "-";
                    td.className = "timetable-cell-empty";
                }
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);
        element.appendChild(wrapper);
    }

    function buildClassSummary(matching) {
        if (!matching.length) {
            return [{ text: "No classes currently linked to this profile.", variant: "warn" }];
        }

        const uniqueClasses = new Set();
        const uniqueYears = new Set();
        matching.forEach((row) => {
            const classCode = String(row.form_class || row.formclass || row.class_code || "").trim();
            const yearLevel = String(row.year_level || row.yearlevel || "").trim();
            if (classCode) uniqueClasses.add(classCode);
            if (yearLevel) uniqueYears.add(yearLevel);
        });

        return [
            { text: `Unique linked classes: ${uniqueClasses.size}` },
            { text: `Class list: ${uniqueClasses.size ? Array.from(uniqueClasses).join(", ") : "None listed"}` },
            { text: `Year levels: ${uniqueYears.size ? Array.from(uniqueYears).join(", ") : "None listed"}` },
            { text: `Linked student rows: ${matching.length}` }
        ];
    }

    function setConnectionMessage(title, description, variant) {
        if (!connectionEl) return;
        connectionEl.className = `connection-box${variant ? ` is-${variant}` : ""}`;
        connectionEl.innerHTML = `<strong>${title}</strong><p>${description}</p>`;
    }

    function setTrelloConnectionMessage(title, description, variant) {
        if (!trelloConnectionEl) return;
        trelloConnectionEl.className = `connection-box${variant ? ` is-${variant}` : ""}`;
        trelloConnectionEl.innerHTML = `<strong>${title}</strong><p>${description}</p>`;
    }

    function setTrelloBoards(lines) {
        if (!trelloBoardsEl) return;
        if (!Array.isArray(lines) || !lines.length) {
            trelloBoardsEl.hidden = true;
            trelloBoardsEl.innerHTML = "";
            return;
        }

        trelloBoardsEl.hidden = false;
        trelloBoardsEl.innerHTML = "";
        lines.forEach((line) => {
            const row = document.createElement("div");
            row.className = "info-line";

            if (line.href) {
                const anchor = document.createElement("a");
                anchor.href = line.href;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.textContent = line.text;
                row.appendChild(anchor);
            } else {
                row.textContent = line.text;
            }

            trelloBoardsEl.appendChild(row);
        });
    }

    async function fetchTrelloJson(path, options, email) {
        const headers = { "Content-Type": "application/json" };
        if (email) {
            headers["x-user-email"] = email;
        }

        const accessToken = getStoredAccessToken();
        if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch(path, {
            ...(options || {}),
            headers: {
                ...headers,
                ...((options && options.headers) || {})
            }
        });

        if (response.status === 204) {
            return null;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(String(payload?.error || `Request failed (${response.status})`));
        }

        return payload;
    }

    async function openTrelloConnectPopup() {
        const config = await fetchTrelloJson("/api/integrations/trello/config");
        if (!config?.enabled || !config?.api_key) {
            throw new Error("Trello integration is not configured on the server yet.");
        }

        const returnUrl = `${window.location.origin}/trello-callback.html`;
        const authorizeUrl = new URL("https://trello.com/1/authorize");
        authorizeUrl.searchParams.set("expiration", "never");
        authorizeUrl.searchParams.set("name", "DTECH-HUB");
        authorizeUrl.searchParams.set("scope", "read,write");
        authorizeUrl.searchParams.set("response_type", "token");
        authorizeUrl.searchParams.set("key", String(config.api_key));
        authorizeUrl.searchParams.set("return_url", returnUrl);

        return new Promise((resolve, reject) => {
            let finished = false;
            let popupRef = null;
            let timeoutHandle = null;
            let closePollHandle = null;

            const finish = (error, token) => {
                if (finished) {
                    return;
                }
                finished = true;
                window.removeEventListener("message", onMessage);
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                if (closePollHandle) {
                    clearInterval(closePollHandle);
                }

                if (error) {
                    reject(error);
                    return;
                }

                resolve(String(token || ""));
            };

            const onMessage = (event) => {
                if (event.origin !== window.location.origin) {
                    return;
                }

                const data = event.data || {};
                if (data.source !== "dtech-hub-trello" || !data.token) {
                    return;
                }

                finish(null, data.token);
            };

            window.addEventListener("message", onMessage);

            popupRef = window.open(authorizeUrl.toString(), "dtech_hub_trello_connect", "width=650,height=760");
            if (!popupRef) {
                finish(new Error("Popup blocked. Please allow popups and try again."));
                return;
            }

            timeoutHandle = setTimeout(() => {
                finish(new Error("Trello authorization timed out. Please try again."));
            }, 120000);

            closePollHandle = setInterval(() => {
                if (finished) {
                    return;
                }
                if (popupRef && popupRef.closed) {
                    finish(new Error("Trello authorization was cancelled."));
                }
            }, 350);
        });
    }

    async function loadTrelloBoards(email) {
        const boards = await fetchTrelloJson("/api/integrations/trello/boards", { method: "GET" }, email);
        const rows = (Array.isArray(boards) ? boards : []).slice(0, 6).map((board) => ({
            text: board.name || "Untitled Board",
            href: board.url || ""
        }));

        if (!rows.length) {
            setTrelloBoards([{ text: "No open Trello boards found for this account." }]);
            return;
        }

        setTrelloBoards(rows);
    }

    async function connectTrelloWithToken(email, token) {
        await fetchTrelloJson(
            "/api/integrations/trello/connect",
            {
                method: "POST",
                body: JSON.stringify({ token: String(token || "").trim() })
            },
            email
        );

        if (trelloManualTokenInput) {
            trelloManualTokenInput.value = "";
        }

        await refreshTrelloStatus(email);
    }

    async function refreshTrelloStatus(email) {
        if (!email) {
            setTrelloConnectionMessage("Sign in first", "Connect with your school account, then link Trello.", "warn");
            if (trelloConnectBtn) trelloConnectBtn.hidden = false;
            if (trelloDisconnectBtn) trelloDisconnectBtn.hidden = true;
            if (trelloRefreshBoardsBtn) trelloRefreshBoardsBtn.hidden = true;
            if (trelloManualBox) trelloManualBox.hidden = false;
            setTrelloBoards([]);
            return;
        }

        try {
            const status = await fetchTrelloJson("/api/integrations/trello/status", { method: "GET" }, email);
            if (!status?.connected) {
                setTrelloConnectionMessage(
                    "Trello not connected",
                    "Click Connect Trello to link your account and enable work-log sync.",
                    "warn"
                );
                if (trelloConnectBtn) trelloConnectBtn.hidden = false;
                if (trelloDisconnectBtn) trelloDisconnectBtn.hidden = true;
                if (trelloRefreshBoardsBtn) trelloRefreshBoardsBtn.hidden = true;
                if (trelloManualBox) trelloManualBox.hidden = false;
                setTrelloBoards([]);
                return;
            }

            const username = String(status?.trello?.username || "").trim();
            const fullName = String(status?.trello?.full_name || "").trim();
            setTrelloConnectionMessage(
                "Trello connected",
                `Linked as ${fullName || username || "Trello user"}. You can now send logs from task pages.`,
                ""
            );

            if (trelloConnectBtn) trelloConnectBtn.hidden = true;
            if (trelloDisconnectBtn) trelloDisconnectBtn.hidden = false;
            if (trelloRefreshBoardsBtn) trelloRefreshBoardsBtn.hidden = false;
            if (trelloManualBox) trelloManualBox.hidden = true;

            await loadTrelloBoards(email);
        } catch (error) {
            setTrelloConnectionMessage("Trello check failed", error.message || "Could not check Trello status.", "error");
            if (trelloConnectBtn) trelloConnectBtn.hidden = false;
            if (trelloDisconnectBtn) trelloDisconnectBtn.hidden = true;
            if (trelloRefreshBoardsBtn) trelloRefreshBoardsBtn.hidden = true;
            if (trelloManualBox) trelloManualBox.hidden = false;
            setTrelloBoards([]);
        }
    }

    function wireTrelloActions(email) {
        if (trelloConnectBtn) {
            trelloConnectBtn.onclick = async () => {
                trelloConnectBtn.disabled = true;
                try {
                    setTrelloConnectionMessage("Connecting Trello", "Authorize DTECH-HUB in the Trello popup window.", "");
                    const token = await openTrelloConnectPopup();
                    await connectTrelloWithToken(email, token);
                } catch (error) {
                    setTrelloConnectionMessage("Could not connect Trello", error.message || "Try again.", "error");
                } finally {
                    trelloConnectBtn.disabled = false;
                }
            };
        }

        if (trelloManualGenerateBtn) {
            trelloManualGenerateBtn.onclick = async () => {
                trelloManualGenerateBtn.disabled = true;
                try {
                    const config = await fetchTrelloJson("/api/integrations/trello/config");
                    if (!config?.enabled || !config?.api_key) {
                        throw new Error("Trello integration is not configured on the server yet.");
                    }

                    const authorizeUrl = new URL("https://trello.com/1/authorize");
                    authorizeUrl.searchParams.set("expiration", "never");
                    authorizeUrl.searchParams.set("name", "DTECH-HUB");
                    authorizeUrl.searchParams.set("scope", "read,write");
                    authorizeUrl.searchParams.set("response_type", "token");
                    authorizeUrl.searchParams.set("key", String(config.api_key));

                    window.open(authorizeUrl.toString(), "_blank", "noopener,noreferrer");
                    setTrelloConnectionMessage("Token page opened", "Approve access, copy token from Trello, then paste it here.", "");
                } catch (error) {
                    setTrelloConnectionMessage("Could not open token generator", error.message || "Try again.", "error");
                } finally {
                    trelloManualGenerateBtn.disabled = false;
                }
            };
        }

        if (trelloManualConnectBtn) {
            trelloManualConnectBtn.onclick = async () => {
                const token = String(trelloManualTokenInput?.value || "").trim();
                if (!token) {
                    setTrelloConnectionMessage("Token required", "Paste a Trello token first.", "warn");
                    return;
                }

                trelloManualConnectBtn.disabled = true;
                try {
                    setTrelloConnectionMessage("Connecting Trello", "Validating and saving Trello token...", "");
                    await connectTrelloWithToken(email, token);
                } catch (error) {
                    const message = String(error?.message || "Try again.");
                    const withHint = /401|unauthor|invalid token|token/i.test(message)
                        ? `${message} Use Generate DTECH Token so the token matches this app key.`
                        : message;
                    setTrelloConnectionMessage("Could not connect Trello", withHint, "error");
                } finally {
                    trelloManualConnectBtn.disabled = false;
                }
            };
        }

        if (trelloDisconnectBtn) {
            trelloDisconnectBtn.onclick = async () => {
                trelloDisconnectBtn.disabled = true;
                try {
                    await fetchTrelloJson(
                        "/api/integrations/trello/connect",
                        { method: "DELETE" },
                        email
                    );
                    await refreshTrelloStatus(email);
                } catch (error) {
                    setTrelloConnectionMessage("Could not disconnect Trello", error.message || "Try again.", "error");
                } finally {
                    trelloDisconnectBtn.disabled = false;
                }
            };
        }

        if (trelloRefreshBoardsBtn) {
            trelloRefreshBoardsBtn.onclick = async () => {
                trelloRefreshBoardsBtn.disabled = true;
                try {
                    await loadTrelloBoards(email);
                } catch (error) {
                    setTrelloConnectionMessage("Could not load boards", error.message || "Try again.", "error");
                } finally {
                    trelloRefreshBoardsBtn.disabled = false;
                }
            };
        }
    }

    async function loadProfile() {
        const auth = getStoredAuth();
        const profile = auth && auth.profile ? auth.profile : null;
        const loginName = String((profile && (profile.name || profile.given_name)) || "").trim();
        const email = normalizeEmail(profile && profile.email);
        const domain = email.includes("@") ? email.split("@")[1] : "-";

        if (nameEl) nameEl.textContent = loginName || "Not signed in";
        if (emailEl) emailEl.textContent = email || "Not signed in";
        if (domainEl) domainEl.textContent = domain || "-";

        if (!email) {
            if (roleEl) roleEl.textContent = "Not signed in";
            if (authStatusEl) authStatusEl.textContent = "Signed out";
            if (teacherViewEl) teacherViewEl.textContent = "Unavailable";
            if (topStatusEl) topStatusEl.textContent = "Sign in required";
            if (readyPillEl) readyPillEl.textContent = "Profile not ready";
            if (loginPillEl) loginPillEl.textContent = "Google Login required";
            setConnectionMessage(
                "No active Google sign-in",
                "Use Sign in with Google from the top bar to load your profile and links.",
                "warn"
            );
            setInfoStack(timetableEl, [{ text: "Sign in to view timetable links.", variant: "warn" }]);
            setInfoStack(csvLinksEl, [{ text: "Sign in to check linked staff CSV records.", variant: "warn" }]);
            setInfoStack(uploadHistoryEl, [{ text: "Sign in to view your staff upload history.", variant: "warn" }]);
            setInfoStack(classesEl, [{ text: "Sign in to view linked classes and students.", variant: "warn" }]);
            setInfoStack(courseStandardsEl, [{ text: "Sign in to view course standards guidance.", variant: "warn" }]);
            wireTrelloActions("");
            await refreshTrelloStatus("");
            return;
        }

        wireTrelloActions(email);
        await refreshTrelloStatus(email);

        let accessData = null;
        try {
            accessData = await fetchJson(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
            if (authStatusEl) authStatusEl.textContent = "Connected";
            if (teacherViewEl) teacherViewEl.textContent = accessData.can_teacher_view ? "Enabled" : "Disabled";
            if (topStatusEl) topStatusEl.textContent = "Profile ready";
            if (readyPillEl) readyPillEl.textContent = "Profile page ready";
            if (loginPillEl) loginPillEl.textContent = "Google Login preparation";

            setConnectionMessage(
                "Google session active",
                `Signed in as ${email}. Domain access is ${accessData.is_staff || accessData.is_student ? "linked" : "not yet linked"} to CSV records.`,
                ""
            );
        } catch (_error) {
            if (authStatusEl) authStatusEl.textContent = "Partial";
            if (teacherViewEl) teacherViewEl.textContent = "Unknown";
            setConnectionMessage(
                "Google sign-in detected",
                "Profile loaded, but access lookups are temporarily unavailable.",
                "warn"
            );
        }

        const [staffRows, studentRows, userRoleRows, teacherTimetableRows] = await Promise.all([
            fetchJson("/api/staff_upload/all").catch(() => []),
            fetchJson("/api/student_timetable/all").catch(() => []),
            fetchJson("/api/admin/user-roles").catch(() => []),
            fetchJson("/api/timetable/all").catch(() => [])
        ]);

        const safeStaffRows = Array.isArray(staffRows) ? staffRows : Array.isArray(staffRows.staff) ? staffRows.staff : [];
        const safeStudentRows = Array.isArray(studentRows) ? studentRows : Array.isArray(studentRows.students) ? studentRows.students : [];
        const safeRoleRows = Array.isArray(userRoleRows) ? userRoleRows : [];
        const safeTeacherTimetableRows = Array.isArray(teacherTimetableRows)
            ? teacherTimetableRows
            : Array.isArray(teacherTimetableRows.timetable)
                ? teacherTimetableRows.timetable
                : [];

        const roleFromRolePage = safeRoleRows.find((row) => normalizeEmail(row && row.user_email) === email);
        const matchedStaffRows = safeStaffRows.filter((row) => hasMatchingEmailKey(row, email));
        const matchedStudentRows = collectLinkedStudentRows(
            safeStudentRows,
            email,
            [loginName, roleFromRolePage && roleFromRolePage.display_name, profile && profile.name, profile && profile.given_name]
        );
        const teacherIdentifiers = collectTeacherIdentifiers(
            email,
            [loginName, roleFromRolePage && roleFromRolePage.display_name, profile && profile.name, profile && profile.given_name],
            matchedStaffRows
        );
        const matchedTeacherTimetableRows = collectLinkedTeacherTimetableRows(safeTeacherTimetableRows, teacherIdentifiers);

        const hasStaffSyncData = matchedStaffRows.length > 0;
        const hasStudentSyncData = matchedStudentRows.length > 0;
        const hasTeacherTimetableSyncData = matchedTeacherTimetableRows.length > 0;
        const hasAnyTimetableSyncData = hasStudentSyncData || hasTeacherTimetableSyncData;
        const hasAnySyncData = hasStaffSyncData || hasAnyTimetableSyncData;

        const resolvedName = pickFirstNonEmpty([
            getRowDisplayName(matchedStaffRows[0]),
            getRowDisplayName(matchedStudentRows[0]),
            loginName,
            email
        ]);

        if (nameEl) {
            nameEl.textContent = resolvedName || "Not signed in";
        }
        if (avatarEl) {
            avatarEl.textContent = getInitials(resolvedName, email || "user");
        }
        renderCourseStandardsGuidance(matchedStudentRows[0]);

        const resolvedRole = pickFirstNonEmpty([
            roleFromRolePage && roleFromRolePage.additional_role,
            accessData && accessData.additional_role,
            accessData && (accessData.can_admin ? "Admin" : accessData.can_teacher_view ? "Teacher/Staff" : "Student")
        ]) || "Student";

        const roleLooksStudentOnly = /^student\b/i.test(String(resolvedRole || "").trim());
        const isStudentOnly = Boolean(
            roleLooksStudentOnly || (
                accessData &&
                accessData.is_student &&
                !accessData.can_teacher_view &&
                !accessData.can_admin
            )
        );

        if (csvLinksCardEl) {
            csvLinksCardEl.hidden = isStudentOnly;
        }
        if (uploadHistoryCardEl) {
            uploadHistoryCardEl.hidden = isStudentOnly;
        }
        if (classesCardEl) {
            classesCardEl.hidden = isStudentOnly;
        }

        if (!isStudentOnly) {
            if (timetableCardEl) {
                timetableCardEl.hidden = !hasAnyTimetableSyncData;
            }
            if (csvLinksCardEl) {
                csvLinksCardEl.hidden = !hasAnySyncData;
            }
            if (uploadHistoryCardEl) {
                uploadHistoryCardEl.hidden = !hasStaffSyncData;
            }
            if (classesCardEl) {
                classesCardEl.hidden = !hasStudentSyncData;
            }
        }

        if (overviewSubtextEl) {
            overviewSubtextEl.textContent = isStudentOnly
                ? "Profile details are linked from your Google session and uploaded student timetable data."
                : "Profile details are linked from Google session identity and uploaded Staff/Department CSV data.";
        }

        if (timetableSubtextEl) {
            timetableSubtextEl.textContent = isStudentOnly
                ? "Pulled from timetable CSV upload for your student profile."
                : "Pulled from timetable CSV upload for your teacher code/profile.";
        }

        if (roleEl) {
            roleEl.textContent = resolvedRole;
        }

        const matchedStaffCount = matchedStaffRows.length;
        const matchedStudentCount = matchedStudentRows.length;
        const matchedTeacherTimetableCount = matchedTeacherTimetableRows.length;

        setInfoStack(csvLinksEl, [
            { text: `Staff CSV links: ${matchedStaffCount}` },
            { text: `Student timetable links: ${matchedStudentCount}` },
            { text: `Teacher timetable links: ${matchedTeacherTimetableCount}` },
            {
                text: matchedStaffCount || matchedStudentCount || matchedTeacherTimetableCount
                    ? "CSV links found for this account."
                    : "No direct email links found yet. Ask admin to include your school email in uploads.",
                variant: matchedStaffCount || matchedStudentCount || matchedTeacherTimetableCount ? "" : "warn"
            }
        ]);

        setInfoStack(uploadHistoryEl, buildUploadHistory(safeStaffRows, email));
        const roleLooksStudent = /^student\b/i.test(String(resolvedRole || "").trim());
        const showTeacherTimetable = Boolean(accessData && accessData.can_teacher_view) && !roleLooksStudent;
        const studentTimetableSummary = buildTimetableSummary(
            matchedStudentRows,
            [loginName, roleFromRolePage && roleFromRolePage.display_name, profile && profile.name]
        );

        if (showTeacherTimetable) {
            const teacherSummary = buildTeacherTimetableSummary(matchedTeacherTimetableRows);
            if (matchedTeacherTimetableRows.length) {
                setInfoStack(timetableEl, teacherSummary);
            } else {
                setInfoStack(timetableEl, [
                    ...teacherSummary,
                    { text: "Falling back to student timetable links where available.", variant: "warn" },
                    ...studentTimetableSummary
                ]);
            }
        } else {
            renderStudentTimetableGrid(timetableEl, matchedStudentRows);
        }

        setInfoStack(classesEl, buildClassSummary(matchedStudentRows));
    }

    document.addEventListener("DOMContentLoaded", () => {
        loadProfile().catch(() => {
            if (topStatusEl) topStatusEl.textContent = "Profile load failed";
            setConnectionMessage(
                "Could not load profile data",
                "Please refresh and try again. If this continues, check server API availability.",
                "error"
            );
        });
    });
})();