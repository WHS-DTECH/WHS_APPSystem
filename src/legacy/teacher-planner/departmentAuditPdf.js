const pdfParse = require('pdf-parse/lib/pdf-parse');

class DepartmentPdfError extends Error {}

async function importDepartmentPdf(buffer, maxPages = 20) {
  const pages = [];
  const pdf = await pdfParse(buffer, {
    max: maxPages,
    pagerender: async page => {
      const { items } = await page.getTextContent({ normalizeWhitespace: true });
      if (!items.some(item => item.str.trim() === 'KAMAR')) {
        throw new DepartmentPdfError('Choose an original KAMAR PDF export, not a scan or criteria document.');
      }
      pages.push({ view: page.view, items: items.filter(item => item.str.trim()).map(item => ({
        text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width
      })) });
      return '';
    }
  });
  if (!pdf.numpages || pdf.numpages > maxPages || pages.length !== pdf.numpages) {
    throw new DepartmentPdfError('Export no more than ' + maxPages + ' pages per PDF.');
  }
  return { pages };
}

module.exports = { DepartmentPdfError, importDepartmentPdf };
