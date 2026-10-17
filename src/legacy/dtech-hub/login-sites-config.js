"use strict";

const LEVELS = ["junior", "middle", "senior", "staff"];

function validateLoginSites(sites) {
  if (!Array.isArray(sites) || sites.length > 30) throw new Error("Provide a list of at most 30 sites.");
  const ids = new Set();
  const questionIds = new Set();
  const text = (value, label, max, required = true) => {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label} is required and must be at most ${max} characters.`);
    return value.trim();
  };
  const url = (value, label, local = false) => {
    const result = text(value, label, 1000);
    if (local && /^\.\.\/images\/[a-zA-Z0-9 /_.-]+$/.test(result) && !result.slice(3).includes("..")) return result;
    let parsed;
    try { parsed = new URL(result); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`${label} must be a valid HTTPS URL.`);
    return result;
  };
  const id = (value, set, label) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,59}$/.test(value) || set.has(value)) throw new Error(`${label} must be unique and use lowercase letters, numbers or hyphens.`);
    set.add(value);
    return value;
  };
  const answers = (question) => {
    if (!["exact", "all-terms"].includes(question.match)) throw new Error("Choose an exact-answer or all-terms marking rule.");
    if (!Array.isArray(question.answers) || !question.answers.length || question.answers.length > 20) throw new Error("Each question needs 1-20 accepted answers or required terms.");
    return { match: question.match, answers: question.answers.map((answer) => text(answer, "Answer", 200)) };
  };
  return sites.map((site) => {
    if (!site || typeof site !== "object") throw new Error("Each site must be an object.");
    if (typeof site.hidden !== "boolean" || !Array.isArray(site.levels) || site.levels.some((level) => !LEVELS.includes(level))) throw new Error("Choose valid level visibility and a Hide from everyone setting.");
    const clean = {
      id: id(site.id, ids, "Site ID"), name: text(site.name, "Site name", 120),
      description: text(site.description, "Description", 600),
      group: text(site.group, "Course group", 120), years: text(site.years, "Year label", 120),
      url: url(site.url, "Website link"), logo: url(site.logo, "Logo link", true),
      hidden: site.hidden, levels: [...new Set(site.levels)]
    };
    if (site.readinessQuestion) {
      const question = site.readinessQuestion;
      clean.readinessQuestion = {
        id: id(question.id, questionIds, "Question ID"),
        prompt: text(question.prompt, "Question", 600), hint: text(question.hint, "Hint", 600, false)
      };
      if (question.tools) {
        if (!Array.isArray(question.tools) || !question.tools.length || question.tools.length > 12) throw new Error("Use 1-12 tool pictures.");
        clean.readinessQuestion.tools = question.tools.map((tool) => ({
          id: id(tool.id, questionIds, "Tool ID"), label: text(tool.label, "Tool label", 120),
          image: url(tool.image, "Tool image", true), ...answers(tool)
        }));
      } else Object.assign(clean.readinessQuestion, answers(question));
    }
    return clean;
  });
}

function publicLoginSites(sites) {
  const publicQuestion = ({ answers, match, ...question }) => ({
    ...question, ...(question.tools ? { tools: question.tools.map(publicQuestion) } : {})
  });
  return sites.filter((site) => !site.hidden && site.levels.length).map((site) => ({
    ...site, ...(site.readinessQuestion ? { readinessQuestion: publicQuestion(site.readinessQuestion) } : {})
  }));
}

function loginSiteLevel(profile) {
  if (profile?.courseIds?.includes("STAFF")) return "staff";
  if ([7, 8].includes(profile?.year)) return "junior";
  if ([9, 10].includes(profile?.year)) return "middle";
  if ([11, 12, 13].includes(profile?.year)) return "senior";
  return null;
}

function visibleLoginSites(sites, profile) {
  const level = loginSiteLevel(profile);
  return sites.filter((site) => !site.hidden && site.levels.length && (!level || site.levels.includes(level)));
}

function gradeConfiguredLoginSites(answers, sites) {
  const normalize = (value) => value.toLowerCase().trim().replace(/[.!?]+$/, "")
    .replace(/\s+tool$/, "").replace(/3\s*[- ]?\s*d/g, "3d").replace(/code[\s-]+blocks/g, "codeblocks")
    .replace(/\b(circuit|design|codeblock|variable|statement|loop)s\b/g, "$1").replace(/[\s/,&-]+/g, " ");
  const clean = {};
  const toolResults = [];
  const mark = (question) => {
    const value = typeof answers?.[question.id] === "string" ? answers[question.id].slice(0, 200) : "";
    clean[question.id] = value;
    const actual = normalize(value);
    const correct = question.match === "all-terms"
      ? question.answers.every((term) => ` ${actual} `.includes(` ${normalize(term)} `))
      : question.answers.some((answer) => normalize(answer) === actual);
    return { id: question.id, correct, explanation: correct ? "Correct - ka pai!" : "Look at the site again and try this answer once more." };
  };
  const results = sites.filter((site) => site.readinessQuestion).map((site) => {
    const question = site.readinessQuestion;
    const marked = question.tools ? question.tools.map(mark) : [mark(question)];
    if (question.tools) toolResults.push(...marked);
    const correct = marked.every((result) => result.correct);
    clean[`${question.id}Ready`] = correct;
    return { id: question.id, correct, explanation: correct
      ? `${site.name} readiness check saved! No need to create anything or start a lesson today.`
      : question.tools ? `${marked.filter((result) => result.correct).length} / ${marked.length} tool names correct. ${question.hint}`
        : `Try again: ${question.hint || "look at the site and read the answer."}` };
  });
  const score = results.filter((result) => result.correct).length;
  return { assessmentId: "login-sites-readiness-v1", passed: results.length > 0 && score === results.length, score, total: results.length, answers: clean, results, toolResults };
}

module.exports = { validateLoginSites, publicLoginSites, visibleLoginSites, gradeConfiguredLoginSites };
