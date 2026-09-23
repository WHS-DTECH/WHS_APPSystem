const updatedElement = document.querySelector("[data-last-updated]");

if (updatedElement) {
  const hasLastModified = typeof document.lastModified === "string" && document.lastModified.trim().length > 0;
  const parsed = hasLastModified ? new Date(document.lastModified) : new Date();
  const timestamp = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const formatted = new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Pacific/Auckland"
  }).format(timestamp);

  updatedElement.textContent = `Last updated: ${formatted} NZT`;
}
