const fs = require('node:fs');
const path = require('node:path');
const { fillDocument } = require('../moderationDocuments');
const files = {
  internal: 'Template Std no - internal-moderation-cover-sheet 2023.docx',
  schedule: 'template - Student A - 29785 - Marking Schedule.docx',
  feedback: 'Template - Student A - 29785 - Marking Confirmation & Feedback.docx',
  coversheet: 'Template - Student A - 29785 - WHS Coversheet.docx'
};
fs.mkdirSync(path.join(__dirname, '..', 'templates'), { recursive: true });
for (const [type, name] of Object.entries(files)) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Teacher Files', name));
  fs.writeFileSync(path.join(__dirname, '..', 'templates', type + '.docx'), fillDocument(source, type, {}, ''));
}
