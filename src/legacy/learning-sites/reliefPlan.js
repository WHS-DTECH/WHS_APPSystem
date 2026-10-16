const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");

const DATA_DIR = path.join(__dirname, "relief-plan");
const RELIEF_PLAN_CSV_PATH = path.join(DATA_DIR, "2027_NZ_Technology_Reliever_Google_Calendar.csv");
const RELIEF_PLAN_XLSX_PATH = path.join(DATA_DIR, "2027_NZ_Technology_Reliever_Events_Expanded.xlsx");

function normalizeReliefPlanDate(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      return `${match[3]}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
    }
    return trimmed;
  }

  if (value instanceof Date) {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
  }

  return String(value).trim();
}

function buildReliefPlanEventKey(subject, startDate, endDate) {
  return `${String(subject || "").trim().toLowerCase()}|${normalizeReliefPlanDate(startDate)}|${normalizeReliefPlanDate(endDate)}`;
}

function readExpandedReliefPlanEvents() {
  if (!fs.existsSync(RELIEF_PLAN_XLSX_PATH)) {
    return { byKey: new Map(), bySubject: new Map() };
  }

  const workbook = XLSX.readFile(RELIEF_PLAN_XLSX_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const byKey = new Map();
  const bySubject = new Map();

  for (const row of rows) {
    const subject = String(row.Event || row.Subject || "").trim();
    const startDate = normalizeReliefPlanDate(row["Start Date"]);
    const endDate = normalizeReliefPlanDate(row["End Date"] || row["Start Date"]);
    if (!subject || !startDate) {
      continue;
    }

    const eventData = {
      aboutTheEvent: String(row["About the Event"] || row.Description || "").trim(),
      description: String(row.Description || "").trim(),
      source: String(row.Source || "").trim(),
      technologyContext: String(row["Technology Context"] || "").trim(),
      location: String(row.Location || "").trim()
    };

    byKey.set(buildReliefPlanEventKey(subject, startDate, endDate), eventData);
    bySubject.set(subject.toLowerCase(), eventData);
  }

  return { byKey, bySubject };
}

function readReliefPlanEvents() {
  const csvText = fs.readFileSync(RELIEF_PLAN_CSV_PATH, "utf8");
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  const expandedLookup = readExpandedReliefPlanEvents();
  const expandedByKey = expandedLookup.byKey;
  const expandedBySubject = expandedLookup.bySubject;

  const events = rows.map((row) => {
    const subject = row.Subject || "";
    const startDate = row["Start Date"] || "";
    const endDate = row["End Date"] || row["Start Date"] || "";
    const expanded = expandedByKey.get(buildReliefPlanEventKey(subject, startDate, endDate)) || {};

    return {
      subject,
      startDate,
      startTime: row["Start Time"] || "",
      endDate,
      endTime: row["End Time"] || "",
      allDay: String(row["All Day Event"]).toLowerCase() === "true",
      description: row.Description || expanded.description || "",
      aboutTheEvent: expanded.aboutTheEvent || row.Description || "",
      location: row.Location || expanded.location || "",
      source: expanded.source || "",
      technologyContext: expanded.technologyContext || ""
    };
  });

  const recurring2026Dates = {
    "Father's Day": ["09/06/2026", "09/06/2026"],
    "Labour Day": ["10/26/2026", "10/26/2026"],
    "Westland Anniversary Day": ["12/07/2026", "12/07/2026"]
  };

  const withSubjectDetails = (event, startDate, endDate) => {
    const subjectMatch = expandedBySubject.get(String(event.subject || "").trim().toLowerCase()) || {};
    return {
      ...event,
      startDate,
      endDate,
      description: subjectMatch.description || event.description.replace("2027", "2026"),
      aboutTheEvent: subjectMatch.aboutTheEvent || event.aboutTheEvent || event.description.replace("2027", "2026"),
      source: subjectMatch.source || event.source,
      technologyContext: subjectMatch.technologyContext || event.technologyContext,
      location: subjectMatch.location || event.location
    };
  };

  const recurring2026Events = events
    .filter((event) => {
      const startYear = event.startDate.slice(-4);
      const month = Number.parseInt(event.startDate.slice(0, 2), 10);
      return startYear === "2027" && month >= 9 && event.description.includes("Date status: Fixed.");
    })
    .map((event) => withSubjectDetails(
      event,
      event.startDate.replace(/\/2027$/, "/2026"),
      event.endDate.replace(/\/2027$/, "/2026")
    ));

  for (const event of events) {
    const dates = recurring2026Dates[event.subject];
    if (dates) {
      recurring2026Events.push(withSubjectDetails(event, dates[0], dates[1]));
    }
  }

  return [...events, ...recurring2026Events];
}

module.exports = { readReliefPlanEvents };
