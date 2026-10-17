"use strict";

const path = require("node:path");
const PDFDocument = require("pdfkit");

function visibleActivityIndexes(content) {
  return (content?.worksheets || []).flatMap((worksheet, index) =>
    worksheet && !worksheet.hidden && worksheet.mergedInto === undefined ? [String(index)] : []);
}

function allActivitiesComplete(content, row) {
  const indexes = visibleActivityIndexes(content);
  return indexes.length > 0 && indexes.every((index) => Boolean(row?.completed_activities?.[index]));
}

function buildKitCertificate(content, row, studentName) {
  if (!row?.completed || !row.completed_at || !allActivitiesComplete(content, row)) return null;
  return {
    title: "Certificate of Completion",
    studentName: studentName || row.student_email,
    studentEmail: row.student_email,
    kitTitle: String(content.bannerTitle || "Practical Skills Kit"),
    completedAt: new Date(row.completed_at).toISOString(),
    completedDate: new Date(row.completed_at).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" }),
    activityCount: visibleActivityIndexes(content).length,
    issuer: "Westland High School | DTECH-HUB"
  };
}

function createKitCertificatePdf(certificate) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, info: { Title: `${certificate.kitTitle} - Certificate of Completion`, Author: certificate.issuer } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      const fontRoot = path.dirname(require.resolve("dejavu-fonts-ttf/package.json"));
      doc.registerFont("certificate", path.join(fontRoot, "ttf", "DejaVuSans.ttf"));
      doc.registerFont("certificate-bold", path.join(fontRoot, "ttf", "DejaVuSans-Bold.ttf"));
      const { width, height } = doc.page;
      doc.rect(0, 0, width, height).fill("#fffaf0");
      doc.lineWidth(4).rect(25, 25, width - 50, height - 50).stroke("#1f5b3a");
      doc.lineWidth(1).rect(36, 36, width - 72, height - 72).stroke("#c49a36");
      doc.image(path.join(__dirname, "images", "whs logo circular reo .png"), 65, 51, { fit: [68, 68] });
      const text = (value, y, size, font = "certificate", color = "#173858") => {
        doc.font(font).fontSize(size).fillColor(color).text(value, 65, y, { width: width - 130, align: "center", lineBreak: false });
      };
      const fittedText = (value, y, size, font = "certificate-bold") => {
        doc.font(font);
        while (size > 8 && doc.fontSize(size).widthOfString(value) > width - 130) size -= 1;
        text(value, y, size, font);
      };
      text("WESTLAND HIGH SCHOOL", 63, 16, "certificate-bold");
      text("DTECH-HUB Licence", 94, 12);
      text(certificate.title, 140, 32, "certificate-bold");
      text("This certificate is proudly presented to", 208, 14);
      fittedText(certificate.studentName, 247, 32);
      text("for successfully completing all activities in", 339, 14);
      fittedText(certificate.kitTitle, 372, 25);
      text(`${certificate.activityCount} activities completed | ${certificate.completedDate}`, 437, 13);
      text("Ka pai! Ready for the next step in your learning.", 477, 14, "certificate-bold", "#1f5b3a");
      text(certificate.issuer, 526, 10);
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}

module.exports = { visibleActivityIndexes, allActivitiesComplete, buildKitCertificate, createKitCertificatePdf };
