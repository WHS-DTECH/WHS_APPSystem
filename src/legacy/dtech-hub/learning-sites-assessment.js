"use strict";

const LEARNING_SITES_ID = "learning-sites-treasure-v1";
const DTECH_HOME = "https://sites.google.com/westlandhigh.school.nz/dtec";
const DIRECTORY_URL = "https://www.westlandhigh.school.nz/intranet/our-learning-sites/";
const destinations = [
    { id: "science", title: "Science Island", subject: "Science Department", url: "https://sites.google.com/westlandhigh.school.nz/whs-science/home", prompt: "Read the first paragraph on the Science home page. Science is built on respect for what?", answers: ["evidence"], hint: "Look near the end of the first paragraph: 'respect for ...'." },
    { id: "english", title: "English Cove", subject: "English - Mrs O'Malley", url: "https://sites.google.com/westlandhigh.school.nz/mrs-omalley/home", prompt: "On Mrs O'Malley's English home page, read 'About me'. In which place does she live on a dairy farm?", answers: ["kokatahi"], hint: "Look in the sentence about her family and dairy farm." },
    { id: "food", title: "Hospitality Harbour", subject: "Food Technology, Hospitality", url: "https://sites.google.com/westlandhigh.school.nz/food/", prompt: "Which year is displayed beneath the Food Technology and Hospitality home-page heading?", answers: ["2026"], hint: "Look just below the large home-page title." },
    { id: "pe", title: "PE Peninsula", subject: "Physical Education", url: "https://sites.google.com/westlandhigh.school.nz/physicaleducation/home", prompt: "What is the name of the PE home-page link for Year 7 and 8 students?", answers: ["junior pe", "junior physical education"], hint: "Find the link beside the Middle School option." },
    { id: "dtech", title: "DTECH Treasure Island", subject: "Digital technology", url: `${DTECH_HOME}/home`, prompt: "The DTECH home-page heading says 'Digital Tech with ...'. What is the teacher's surname?", answers: ["pringle", "miss pringle"], hint: "Look at the main heading on the DTECH home page, not the HUB." }
];

const yearCourses = [
    ...[7, 8].map((year) => ({
        id: `${year}DTECH`, year, program: "DTECH", label: `Year ${year} - JuniorDTECH`,
        url: `${DTECH_HOME}/courses/junior-school`,
        clues: [
            { id: "course-clue-1", prompt: "What is the name of the slideshow embedded on the Junior School course page?", answers: ["digital skills"], hint: "Read the title on the embedded slideshow's first slide." },
            { id: "course-clue-2", prompt: "The Junior DTECH programme has a two-year cycle. What is the Year 2 project called?", answers: ["steam project", "steam"], hint: "Read the two-item list beside the slideshow." }
        ]
    })),
    ...[9, 10].flatMap((year) => ["MDTECH", "MPROG", "DTECH"].map((program) => ({
        id: `${year}${program}`, year, program, label: `Year ${year} - ${program === "DTECH" ? "MiddleDTECH" : program}`,
        url: `${DTECH_HOME}/courses/middle-school`,
        clues: [
            { id: "course-clue-1", prompt: "What is the name of the slideshow embedded on the Middle School course page?", answers: ["office and adobe suite", "office & adobe suite"], hint: "Read the title on the embedded slideshow's first slide." },
            { id: "course-clue-2", prompt: program === "MPROG" ? "Under MPROG - S1, what is the coding topic that begins with 'Web'?" : "Under MDTECH - S2, what is the three-letter design topic?", answers: program === "MPROG" ? ["web coding"] : ["cad"], hint: `Read the topic links under ${program === "MPROG" ? "MPROG - S1" : "MDTECH - S2"}.` }
        ]
    }))),
    ...[11, 12, 13].flatMap((year) => ["DTECH", "COMP"].map((program) => ({
        id: `${year}${program}`, year, program, label: `Year ${year} - ${program === "DTECH" ? "Digital Tech (DTECH)" : "Computing (COMP)"}`,
        url: `${DTECH_HOME}/courses/senior-school/${program === "DTECH" ? "digital-tech-dtech" : "computing-comp"}`,
        clues: program === "DTECH" ? [
            { id: "course-clue-1", prompt: "In the Programming & Computer Science description, which programming language is named?", answers: ["python"], hint: "Read the Programming & Computer Science section." },
            { id: "course-clue-2", prompt: "In the Web Design description, which two languages are used to code web pages?", answers: ["html and css", "html & css", "html css", "html/css", "css and html", "css & html"], hint: "Read the Web Design section and name both languages." }
        ] : [
            { id: "course-clue-1", prompt: "The Computing page lists 'Infrastructure and ...'. What is the missing word?", answers: ["networking"], hint: "Read the Topics covered list." },
            { id: "course-clue-2", prompt: "In the Office Suite topic, which two-word activity appears between Spreadsheets and Database?", answers: ["word processing"], hint: "Read the words inside the brackets after Office Suite." }
        ]
    })))
];

const courses = [
    ...yearCourses.filter((course) => course.year <= 8),
    {
        ...yearCourses.find((course) => course.id === "9DTECH"),
        id: "MIDDLEDTECH", years: [9, 10], programs: ["DTECH", "MDTECH", "MPROG"],
        aliases: ["9DTECH", "10DTECH"], label: "Year 9/10 - MiddleDTECH"
    },
    ...yearCourses.filter((course) => [9, 10].includes(course.year)).map((course) => ({
        ...course, hidden: course.program === "DTECH"
    })),
    {
        ...yearCourses.find((course) => course.id === "11DTECH"),
        id: "SENIORDTECH", years: [11, 12, 13], label: "Year 11/12/13 - SeniorDTECH"
    },
    ...yearCourses.filter((course) => course.year >= 11),
    {
        ...yearCourses.find((course) => course.id === "7DTECH"),
        id: "STAFF", year: null, program: "STAFF", label: "Staff"
    }
];

function withLearningSitesActivity(kitId, content) {
    if (kitId !== "kit-login" || !Array.isArray(content?.worksheets)) return content;
    const index = content.worksheets.findIndex((worksheet, i) =>
        content.activities?.[i]?.assessmentId === LEARNING_SITES_ID ||
        /^open dtech(?:-hub| learning site)?$/i.test(String(worksheet?.activity || "").trim())
    );
    if (index < 0) return content;
    const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
    activities[index] = { ...activities[index], assessmentId: LEARNING_SITES_ID };
    return { ...content, activities };
}

function getLearningSitesAssessment() {
    const publicClue = ({ answers, ...clue }) => clue;
    return {
        id: LEARNING_SITES_ID,
        title: "Learning Sites Treasure Hunt",
        reviewedOn: "2026-10-09",
        directoryUrl: DIRECTORY_URL,
        destinations: destinations.map(publicClue),
        courses: courses.filter((course) => !course.hidden).map((course) => ({ ...course, clues: course.clues.map(publicClue) }))
    };
}

const JUNIOR_DTECH_CLASS_CODES = /(?:^|[^A-Z])(?:JPI|JSR|JSD|JMM|JVE)(?![A-Z])/;

function getHuntProfile(student, { isStaff = false } = {}) {
    if (isStaff) {
        return {
            available: true, year: null, courseIds: courses.filter((course) => !course.hidden).map((course) => course.id),
            message: "Your staff access is confirmed. Choose Staff for the JuniorDTECH page, or any course to test that pathway and create its course folder."
        };
    }
    const rawPrograms = Array.isArray(student?.programs) ? student.programs.map((program) => String(program).trim().toUpperCase()) : [];
    const timetable = (student?.dtech_timetable || []).map((entry) => String(entry?.value || "").trim().toUpperCase());
    const classCodes = [student?.homeroom, student?.form_class, student?.timetable_class]
        .map((value) => String(value || "").trim().toUpperCase()).filter(Boolean);
    const profileCodes = [...rawPrograms, ...timetable, ...classCodes];
    const allTimetableValues = (Array.isArray(student?.timetable) ? student.timetable : [])
        .map((entry) => String(entry?.value || "").trim().toUpperCase());
    const yearText = String(student?.year_level || "").trim();
    const yearMatch = yearText.match(/(?:^|\D)(7|8|9|10|11|12|13)(?=\D|$)/)
        || profileCodes.map((code) => code.match(/(?:^|\D)(7|8|9|10|11|12|13)(?=[A-Z]|\b)/)).find(Boolean);
    const year = Number(yearMatch?.[1] || 0);
    const programs = [
        ...rawPrograms.map((program) => ["DTECH", "MDTECH", "MPROG"].includes(program) || !/DTECH$/.test(program) ? program : "DTECH"),
        ...[...timetable, ...classCodes].filter((code) => /DTECH/.test(code)).map(() => "DTECH"),
        // JuniorDTECH classes are listed by teacher code (JPI, JSR, JSD, JMM, JVE) rather than the word DTECH.
        ...([7, 8].includes(year) && [...profileCodes, ...allTimetableValues].some((code) => JUNIOR_DTECH_CLASS_CODES.test(code)) ? ["DTECH"] : [])
    ];
    let relevant;
    if ([7, 8].includes(year)) relevant = programs.some((program) => ["DTECH", "MDTECH", "MPROG"].includes(program)) ? ["DTECH"] : [];
    else if ([9, 10].includes(year)) {
        relevant = programs.filter((program) => ["MDTECH", "MPROG"].includes(program));
        if (!relevant.length && programs.includes("DTECH") && !programs.includes("COMP")) relevant = ["DTECH"];
    } else {
        const timetableText = timetable.join(" ");
        const explicit = [...timetableText.matchAll(/\b(?:\d{1,2})?(DTECH|COMP)\b/gi)].map((match) => match[1].toUpperCase());
        relevant = explicit.length ? explicit : programs.filter((program) => ["DTECH", "COMP"].includes(program));
        if (!explicit.length && relevant.length > 1) relevant = [];
    }
    const courseIds = courses.filter((course) =>
        (course.years ? course.years.includes(year) : course.year === year) &&
        (course.programs || [course.program]).some((program) => relevant.includes(program))
    ).map((course) => course.id);
    return {
        available: courseIds.length > 0,
        year,
        courseIds,
        message: courseIds.length ? "Your course choice will be checked against the timetable data used by User Profile." :
            "We could not match a supported DTECH year/course from your User Profile and timetable. You do not need to type the timetable code; ask your teacher to check that your timetable and year are linked to your profile. You can practise the hunt, but a completion tick cannot be awarded until it is linked."
    };
}

function gradeLearningSites(answers, profile) {
    const normalize = (value) => String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase().replace(/[.!?]+$/, "");
    const course = courses.find((entry) => entry.id === answers?.course);
    const courseCorrect = Boolean(profile?.available && profile.courseIds.includes(course?.id));
    const cleanAnswers = {};
    const results = destinations.map((clue) => {
        const value = typeof answers?.[clue.id] === "string" ? answers[clue.id].slice(0, 200) : "";
        cleanAnswers[clue.id] = value;
        const correct = clue.answers.includes(normalize(value));
        return { id: clue.id, correct, explanation: correct ? `X marks ${clue.title}! Correct - ka pai!` : clue.hint };
    });
    cleanAnswers.course = course?.id || "";
    cleanAnswers.year = Number(profile?.year) || null;
    const staff = Boolean(profile?.courseIds?.includes("STAFF"));
    results.push({
        id: "course", correct: courseCorrect,
        explanation: courseCorrect ? course.id === "STAFF" ? "Staff access confirmed! Now explore the JuniorDTECH course page." : staff ? "Staff test pathway confirmed! Now explore this course page." : "Correct course! It matches your User Profile timetable." :
            profile?.available ? "That course/year does not match your User Profile. Check your profile and try again. If the profile is wrong, ask your teacher to correct it." : profile?.message || "Your course profile is unavailable. Ask your teacher for help."
    });
    for (const id of ["course-clue-1", "course-clue-2"]) {
        const clue = course?.clues.find((entry) => entry.id === id);
        const value = typeof answers?.[id] === "string" ? answers[id].slice(0, 200) : "";
        cleanAnswers[id] = value;
        const correct = Boolean(courseCorrect && clue?.answers.includes(normalize(value)));
        results.push({ id, correct, explanation: correct ? "Treasure found! Correct - ka pai!" : courseCorrect ? clue.hint : "Choose the course that matches your profile before checking these clues." });
    }
    const score = results.filter((result) => result.correct).length;
    return { assessmentId: LEARNING_SITES_ID, answers: cleanAnswers, results, score, total: 8, passed: score === 8 };
}

function findCourse(courseId) {
    return courses.find((course) => course.id === courseId || course.aliases?.includes(courseId)) || null;
}

// Staff -> JuniorDTECH; Year 7/8 -> JuniorDTECH; Year 9/10 -> MiddleDTECH; Year 11-13 -> SeniorDTECH.
function getCourseProgrammeFolder(courseId) {
    const course = findCourse(courseId);
    if (!course) return "";
    if (course.id === "STAFF") return "JuniorDTECH";
    const year = Math.min(...(course.years || [course.year]).map(Number));
    if (year === 7 || year === 8) return "JuniorDTECH";
    if (year === 9 || year === 10) return "MiddleDTECH";
    if (year >= 11 && year <= 13) return "SeniorDTECH";
    return "";
}

// True when a student's directory year level differs from the year they last checked in with. Staff never need a check-in.
function needsCourseCheckIn(savedAnswers, profile) {
    const year = Number(profile?.year);
    if (!profile?.available || !year || profile.courseIds?.includes("STAFF")) return false;
    const savedYear = Number(savedAnswers?.year);
    if (savedYear) return savedYear !== year;
    const course = findCourse(savedAnswers?.course);
    const years = course ? (course.years || [course.year]).map(Number).filter(Boolean) : [];
    return years.length > 0 && !years.includes(year);
}

module.exports = {
    LEARNING_SITES_ID, withLearningSitesActivity, getLearningSitesAssessment, getHuntProfile, gradeLearningSites,
    getCourseProgrammeFolder, needsCourseCheckIn
};