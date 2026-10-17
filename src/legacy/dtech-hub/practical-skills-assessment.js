"use strict";
const { LEARNING_SITES_ID, withLearningSitesActivity, getLearningSitesAssessment } = require("./learning-sites-assessment");
const { gradeConfiguredLoginSites, validateLoginSites } = require("./login-sites-config");

const PASSWORD_PROBLEMS_ID = "password-problems-v1";
const APPS_WORDSEARCH_ID = "apps-wordsearch-v1";
const LOGIN_SITES_ID = "login-sites-readiness-v1";
const loginSites = [
  { name: "Tinkercad", description: "Design 3D models, explore electronic circuits and try coding in your browser.", group: "JuniorDTECH", years: "Years 7/8", url: "https://www.tinkercad.com/joinclass/XTY22KANL", logo: "https://www.tinkercad.com/img/tinkercad-logo.png", readinessQuestion: { id: "tinkercad", prompt: "What three things can you make in Tinkercad?", hint: "Glance at the names of the design areas on your Tinkercad home page. Name all three; you do not need to create anything." } },
  { name: "Code Avengers", description: "Learn programming, web development and digital skills through guided lessons.", group: "MiddleDTECH", years: "Years 9/10", url: "https://www.codeavengers.com/", logo: "https://www.codeavengers.com/dist/assets/images/favicon/android-chrome-192x192.png", readinessQuestion: { id: "codeavengers", prompt: "Under Pro, find the Python courses. What is the topic name for Python 1?", hint: "Switch to Pro, choose Python in the course filter and read the Python 1 card. You do not need to start the course." } },
  { name: "SketchUp Education", description: "Build 3D models of buildings, rooms and other designs using SketchUp for Schools.", group: "JuniorDTECH", years: "Years 7/8", url: "https://edu.sketchup.com/", logo: "https://edu.sketchup.com/favicon.ico", readinessQuestion: {
    id: "sketchup", prompt: "What are the names of these SketchUp tools?",
    hint: "Sign in with your school account. Hover over the matching toolbar icons to read their names. You do not need to draw or change anything.",
    tools: [1, 2, 3, 4].map((number) => ({ id: `sketchup-tool-${number}`, image: `../images/Activites/sketchup-tool-${number}.png`, label: `Tool ${number}` }))
  } },
  { name: "Gamefroot", description: "Create games, animations and interactive stories using visual coding.", group: "JuniorDTECH", years: "Years 7/8", url: "https://gamefroot.com/", logo: "https://make.gamefroot.com/favicon.png" },
  { name: "CodeCombat", description: "Learn programming by writing code to guide a hero through game challenges.", group: "MiddleDTECH", years: "Years 9/10", url: "https://codecombat.com/students?_cc=ShortDrawFast", logo: "https://codecombat.com/images/pages/base/logo_square_250.png", readinessQuestion: { id: "codecombat", prompt: "What is the programming language that you will use?", hint: "Sign in and look under Current Classes. Read the language in brackets beside WHS-DTECH. You do not need to press Start or play a level." } }
];

const configuredLoginSites = loginSites.map((site) => {
  const id = site.readinessQuestion?.id || "gamefroot";
  const question = site.readinessQuestion ? structuredClone(site.readinessQuestion) : null;
  if (question?.tools) {
    const names = ["Rectangle", "Move", "Push/Pull", "Line"];
    question.tools.forEach((tool, index) => {
      tool.match = "exact";
      tool.answers = index === 2 ? ["Push/Pull", "pushpull"] : [names[index]];
    });
  } else if (question) {
    question.match = ["tinkercad", "codeavengers"].includes(id) ? "all-terms" : "exact";
    question.answers = id === "tinkercad" ? ["Circuits", "3D Designs", "Codeblocks"]
      : id === "codeavengers" ? ["Variable", "If Statements", "Loops"] : ["Python"];
  }
  return { ...site, id, hidden: false, levels: site.group === "JuniorDTECH" ? ["junior", "middle", "senior", "staff"] : ["middle", "senior", "staff"], ...(question ? { readinessQuestion: question } : {}) };
});

function gradeLoginSites(answers, sites = configuredLoginSites) {
  return gradeConfiguredLoginSites(answers, sites);
}

const appWords = [
  { word: "DOCS", provider: "Google", use: "Write documents and stories.", row: 0, column: 0, dr: 0, dc: 1 },
  { word: "WORD", provider: "Microsoft", use: "Write documents and stories.", row: 2, column: 1, dr: 0, dc: 1 },
  { word: "SHEETS", provider: "Google", use: "Organise data, calculate and make charts.", row: 4, column: 0, dr: 0, dc: 1 },
  { word: "EXCEL", provider: "Microsoft", use: "Organise data, calculate and make charts.", row: 6, column: 1, dr: 0, dc: 1 },
  { word: "SLIDES", provider: "Google", use: "Create presentations.", row: 8, column: 0, dr: 0, dc: 1 },
  { word: "POWERPOINT", provider: "Microsoft", use: "Create presentations.", row: 10, column: 0, dr: 0, dc: 1 },
  { word: "DRIVE", provider: "Google", use: "Store, organise and share your files online.", row: 1, column: 0, dr: 0, dc: 1 },
  { word: "ONEDRIVE", provider: "Microsoft", use: "Store, organise and share your files online.", row: 3, column: 10, dr: 1, dc: 0 }
];
const wordsearchGrid = Array.from({ length: 12 }, (_, row) =>
  Array.from({ length: 12 }, (_, column) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(row * 17 + column * 7 + 3) % 26])
);
for (const app of appWords) {
  Array.from(app.word).forEach((letter, index) => {
    wordsearchGrid[app.row + index * app.dr][app.column + index * app.dc] = letter;
  });
}

function withShortLoginKit(kitId, content) {
  if (kitId !== "kit-login" || !Array.isArray(content?.worksheets)) return content;
  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  let loginIndex = content.worksheets.findIndex((worksheet) =>
    /^(?:open kamar(?:\s*&\s*hapara)?|using your login details)$/i.test(String(worksheet?.activity || "").trim())
  );
  if (loginIndex < 0) {
    loginIndex = content.worksheets.findIndex((worksheet) => /^open google classroom$/i.test(String(worksheet?.activity || "").trim()));
  }
  const worksheets = content.worksheets.map((worksheet, index) => {
    const visible = index === loginIndex || Boolean(activities[index]?.identityLessonVersion) ||
      [APPS_WORDSEARCH_ID, PASSWORD_PROBLEMS_ID, LEARNING_SITES_ID].includes(activities[index]?.assessmentId);
    if (index === loginIndex) {
      const existingSites = activities[index]?.loginSites;
      const sites = activities[index]?.loginSitesVersion === 1 ? validateLoginSites(existingSites) : structuredClone(configuredLoginSites);
      activities[index] = { ...activities[index], title: "Using your login details", loginSites: sites, loginSitesVersion: 1 };
      return { ...worksheet, activity: "Using your login details", hidden: true, libraryOnly: true };
    }
    return { ...worksheet, hidden: !visible };
  });
  return { ...content, worksheets, activities };
}

function withLoginAppsActivity(kitId, content) {
  if (kitId !== "kit-login" || !Array.isArray(content?.worksheets)) return content;
  const index = content.worksheets.findIndex((worksheet, i) =>
    content.activities?.[i]?.appsLessonVersion === 1 || /^sign[ -]?in\b/i.test(String(worksheet?.activity || "").trim())
  );
  if (index < 0) return content;
  const worksheets = content.worksheets.slice();
  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  if (activities[index]?.appsLessonVersion !== 1) {
    worksheets[index] = { ...worksheets[index], activity: "Sign In - Google, Microsoft & Your Drives", establishes: "Use your school accounts, set up WHS-DTECH and recognise everyday apps" };
    activities[index] = {
      ...activities[index],
      title: worksheets[index].activity,
      establishes: worksheets[index].establishes,
      appsLessonVersion: 1,
      assessmentId: APPS_WORDSEARCH_ID
    };
  }
  const driveIndex = worksheets.findIndex((worksheet) => /^open google drive\b/i.test(String(worksheet?.activity || "").trim()));
  if (driveIndex >= 0 && driveIndex !== index) {
    worksheets[driveIndex] = { ...worksheets[driveIndex], mergedInto: index };
  }
  return { ...content, worksheets, activities };
}

function gradeAppsWordsearch(answers, driveReady) {
  const cleanAnswers = { paths: {}, microsoftReady: answers?.microsoftReady === true };
  const results = appWords.map((app) => {
    let path = answers?.paths?.[app.word];
    const isLegacyDrivePath = app.word === "DRIVE" && Array.isArray(path) &&
      JSON.stringify(path) === JSON.stringify([[0, 11], [1, 11], [2, 11], [3, 11], [4, 11]]);
    if (isLegacyDrivePath) path = Array.from(app.word, (_, index) => [app.row + index * app.dr, app.column + index * app.dc]);
    let correct = Array.isArray(path) && path.length === app.word.length && path.every((cell) =>
      Array.isArray(cell) && cell.length === 2 && cell.every((value) => Number.isInteger(value) && value >= 0 && value < 12)
    );
    if (correct) {
      const dr = path[1][0] - path[0][0];
      const dc = path[1][1] - path[0][1];
      const word = path.map(([r, c]) => wordsearchGrid[r][c]).join("");
      correct = Math.abs(dr) + Math.abs(dc) === 1 &&
        path.every(([r, c], i) => r === path[0][0] + dr * i && c === path[0][1] + dc * i) &&
        [app.word, Array.from(app.word).reverse().join("")].includes(word);
    }
    if (correct) cleanAnswers.paths[app.word] = path;
    return { id: app.word, correct, explanation: `${correct ? "" : `Find ${app.word} in the word search. `}${app.provider} ${app.word === "ONEDRIVE" ? "OneDrive" : app.word}: ${app.use}` };
  });
  results.push(
    { id: "google-drive", correct: Boolean(driveReady), explanation: driveReady ? "Your WHS-DTECH folder is ready with anyone-with-the-link Editor sharing." : "Use Set up Google Drive to create or confirm your WHS-DTECH folder and sharing first." },
    { id: "microsoft", correct: cleanAnswers.microsoftReady, explanation: "Open OneDrive with your school Microsoft account, then tick the confirmation. Ask your teacher if your account is not available." }
  );
  const score = results.filter((result) => result.correct).length;
  return { assessmentId: APPS_WORDSEARCH_ID, score, total: results.length, passed: score === results.length, results, answers: cleanAnswers };
}

const passwordProblems = {
  id: PASSWORD_PROBLEMS_ID,
  title: "Password detective",
  introduction: "Your school login is not working. Can you spot the problem and choose a safe fix? Match the problems, then solve five mini mysteries. Get all 10 right to earn your completion tick. You can check, learn from the feedback and try again.",
  safety: "Never type a real password into this activity, share it with a friend, or send it in a message. A teacher or school IT staff can help you reset it without you telling them your password.",
  tips: [
    "Check: Am I on the correct school sign-in page, using my school account?",
    "Look: Is Caps Lock on? Have I typed my username correctly?",
    "Pause: Do not keep guessing. Too many tries can lock an account.",
    "Ask: If you are stuck, tell your teacher the error message. Keep your password private."
  ],
  matchOptions: [
    { id: "teacher", text: "Stop guessing and ask a teacher or school IT staff for help." },
    { id: "account", text: "Choose your school account or sign out of the personal account." },
    { id: "connection", text: "Check the internet connection and tell your teacher if it is not working." },
    { id: "username", text: "Check your school username or email for a typing mistake." },
    { id: "caps", text: "Turn Caps Lock off and carefully type the password again." }
  ],
  matches: [
    { id: "caps-lock", prompt: "Every letter comes out as a capital, but your password uses small letters.", answer: "caps", explanation: "Passwords are case-sensitive: a capital A and a small a are different. Check Caps Lock before trying again." },
    { id: "wrong-account", prompt: "The screen shows your home Google account, not your school account.", answer: "account", explanation: "A home account and a school account are different. Choose your school account on the correct sign-in page." },
    { id: "unknown-user", prompt: "The sign-in page says it cannot find your account.", answer: "username", explanation: "Read your school username or email carefully. A missing letter or wrong school address can stop the site finding your account." },
    { id: "no-internet", prompt: "Several websites will not load and the device says it is offline.", answer: "connection", explanation: "This may be an internet problem, not a password problem. Check the connection and ask your teacher for help." },
    { id: "locked-out", prompt: "After several guesses, the screen says your account is locked.", answer: "teacher", explanation: "Stop trying passwords. Tell your teacher or school IT staff the error message so they can help you safely." }
  ],
  quiz: [
    {
      id: "forgotten",
      prompt: "You have forgotten your school password. What is the safest next step?",
      options: [
        { id: "borrow", text: "Borrow a friend's account." },
        { id: "reset", text: "Ask your teacher or school IT staff to help you reset it." },
        { id: "guess", text: "Keep guessing until it works." }
      ],
      answer: "reset",
      explanation: "Use your own account. Your teacher or school IT staff can guide you through the school's reset process. Do not keep guessing."
    },
    {
      id: "sharing",
      prompt: "A friend says, 'Tell me your password and I will fix your login.' What do you do?",
      options: [
        { id: "secret", text: "Tell them, but ask them to keep it secret." },
        { id: "message", text: "Send it in a private message." },
        { id: "private", text: "Keep it private and ask a teacher for help." }
      ],
      answer: "private",
      explanation: "Even a helpful friend should not know your password. Ask for help without sharing it."
    },
    {
      id: "new-password",
      prompt: "School IT has reset your password. The browser keeps filling in the old one. What should you do?",
      options: [
        { id: "replace", text: "Clear the old saved password and type the new one carefully." },
        { id: "old", text: "Keep trying the old password." },
        { id: "public", text: "Write the new password on the classroom wall." }
      ],
      answer: "replace",
      explanation: "A browser may remember an old password. Remove the old entry from the sign-in box, then use your new password. Keep it private."
    },
    {
      id: "help-message",
      prompt: "You need to tell your teacher about a login problem. Which message is most helpful and safe?",
      options: [
        { id: "vague", text: "'It is broken.'" },
        { id: "details", text: "'My school sign-in says account locked. I checked my username and Caps Lock.'" },
        { id: "password", text: "'Here is my password. Can you try it?'" }
      ],
      answer: "details",
      explanation: "Say which sign-in page you used, what the error says and what you checked. Do not include your password or a screenshot that shows it."
    },
    {
      id: "suspicious-link",
      prompt: "A message says, 'Your school account will close! Click this strange link and enter your password.' What should you do?",
      options: [
        { id: "click", text: "Click quickly before the account closes." },
        { id: "forward", text: "Forward the link to friends so they can try it." },
        { id: "report", text: "Do not enter your password. Show the message to a teacher and use the usual school sign-in page." }
      ],
      answer: "report",
      explanation: "A message that rushes you into sharing a password could be a trick called phishing. Pause and check with a trusted adult."
    }
  ]
};

function withPasswordProblemsActivity(kitId, content) {
  if (kitId !== "kit-login" || !Array.isArray(content?.worksheets)) return content;
  const index = content.worksheets.findIndex((worksheet) =>
    String(worksheet?.activity || "").trim().toLowerCase() === "password problems"
  );
  if (index < 0) return content;
  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  activities[index] = { ...activities[index], assessmentId: PASSWORD_PROBLEMS_ID };
  return { ...content, activities };
}

function withLoginIdentityActivity(kitId, content) {
  if (kitId !== "kit-login" || !content?.worksheets?.[0]) return content;
  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  const existing = activities[0] || {};
  if (existing.identityLessonVersion === 1) return content;
  const previousQuestions = existing.questions || content.questions || [];
  const usernameQuestion = previousQuestions.find((question) =>
    /username/i.test(String(question?.prompt || "")) && question.type === "short-answer"
  );
  activities[0] = {
    ...existing,
    identityLessonVersion: 1,
    information: {
      title: "How WHS usernames are made",
      paragraphs: [
        "Your first name is your given name. Your last name is your surname or family name. Your username is the short name you use to sign in to your school account.",
        "WHS student usernames usually use the first letter of your first name, an underscore (_) and your last name, written in lowercase. For example, Vanessa Pringle becomes v_pringle.",
        "If your last name has a hyphen (-), leave the hyphen out of the username. For example, Mia Smith-Jones becomes m_smithjones.",
        "Some students have a number at the end, such as v_pringle2. This may be because an administration error occurred when their details were entered, or because they were a previous student whose original account was deactivated. The number is part of their username.",
        "Your school email address is your assigned username followed by @westlandhigh.school.nz. For example, v_pringle becomes v_pringle@westlandhigh.school.nz, and v_pringle2 becomes v_pringle2@westlandhigh.school.nz.",
        "Use the username you have actually been given, even if it is different from the usual pattern. If you are unsure, ask your teacher or school IT staff to confirm it. Do not remove a number or create your own username.",
        "This activity checks your answers against the school Google account you are signed in with. Use the first name and family name on that account, and its actual username and email address. Capital letters and spaces at the start or end do not affect your mark."
      ]
    },
    questions: [
      { id: "identity-first-name", type: "short-answer", prompt: "What is your first name?", lines: 1 },
      { id: "identity-last-name", type: "short-answer", prompt: "What is your last name?", lines: 1 },
      { id: usernameQuestion?.id || "q1", type: "short-answer", prompt: "What is your username?", lines: 1 },
      { id: "identity-email", type: "short-answer", prompt: "What is your school email address?", lines: 1 }
    ]
  };
  return { ...content, activities };
}

function getStudentAssessment(assessmentId) {
  if (assessmentId === LEARNING_SITES_ID) return getLearningSitesAssessment();
  if (assessmentId === APPS_WORDSEARCH_ID) return {
    id: APPS_WORDSEARCH_ID,
    title: "School apps explorer",
    introduction: "Google and Microsoft have apps that do similar jobs. Sign in with your school accounts, get your drives ready, then find eight app names to earn your completion tick.",
    grid: wordsearchGrid.map((row) => row.join("")),
    words: appWords.map(({ word, provider, use }) => ({
      word, provider, use,
      ...(word === "DRIVE" ? { legacyPaths: [[[0, 11], [1, 11], [2, 11], [3, 11], [4, 11]]] } : {})
    }))
  };
  if (assessmentId !== PASSWORD_PROBLEMS_ID) return null;
  return {
    ...passwordProblems,
    matches: passwordProblems.matches.map(({ answer, explanation, ...question }) => question),
    quiz: passwordProblems.quiz.map(({ answer, explanation, ...question }) => question)
  };
}

function gradePasswordProblems(answers) {
  const safeAnswers = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const results = [...passwordProblems.matches, ...passwordProblems.quiz].map((question) => ({
    id: question.id,
    correct: safeAnswers[question.id] === question.answer,
    explanation: question.explanation
  }));
  const score = results.filter((result) => result.correct).length;
  const cleanAnswers = {};
  for (const question of [...passwordProblems.matches, ...passwordProblems.quiz]) {
    const options = question.options || passwordProblems.matchOptions;
    if (options.some((option) => option.id === safeAnswers[question.id])) {
      cleanAnswers[question.id] = safeAnswers[question.id];
    }
  }
  return { score, total: results.length, passed: score === results.length, results, answers: cleanAnswers };
}

function gradeLoginIdentity(answers, identity, questions) {
  const normalize = (value) => String(value || "").normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-NZ");
  const email = normalize(identity.email);
  const expected = [identity.givenName, identity.familyName, email.split("@")[0], email];
  if (expected.some((value) => !normalize(value)) || questions.length !== 4) {
    throw new Error("Your Google account is missing name details. Ask your teacher or school IT staff to check your Google profile, then sign in again.");
  }
  const hints = [
    "Use your first name as it appears on your school Google account. Check the spelling and try again.",
    "Use your family name as it appears on your school Google account, including any hyphen. Check the spelling and try again.",
    "Your username is the part of your signed-in school email before @. Keep any underscore or number. Your assigned account may differ from the usual WHS pattern.",
    "Use the full email address of your signed-in school Google account, including @westlandhigh.school.nz. Check for missing letters and try again."
  ];
  const cleanAnswers = {};
  const results = questions.map((question, index) => {
    const value = typeof answers?.[question.id] === "string" ? answers[question.id].slice(0, 254) : "";
    cleanAnswers[question.id] = value;
    const correct = normalize(value) === normalize(expected[index]);
    return { id: question.id, correct, explanation: correct ? "Correct! You know this part of your school account. Ka pai!" : value.trim() ? hints[index] : "Have a go! Type your answer here." };
  });
  const score = results.filter((result) => result.correct).length;
  return { score, total: 4, passed: score === 4, results, answers: cleanAnswers, identityLesson: true };
}

module.exports = { PASSWORD_PROBLEMS_ID, APPS_WORDSEARCH_ID, LOGIN_SITES_ID, gradeLoginSites, withShortLoginKit, withLoginAppsActivity, withLearningSitesActivity, withPasswordProblemsActivity, withLoginIdentityActivity, getStudentAssessment, gradePasswordProblems, gradeLoginIdentity, gradeAppsWordsearch };
