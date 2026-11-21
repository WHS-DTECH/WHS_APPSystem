const pdfParse = require('pdf-parse/lib/pdf-parse');

class DepartmentPdfError extends Error {}

async function importDepartmentPdf(buffer) {
  const pages = [];
  const pdf = await pdfParse(buffer, {
    max: 20,
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
  if (!pdf.numpages || pdf.numpages > 20 || pages.length !== pdf.numpages) {
    throw new DepartmentPdfError('Export no more than 20 pages per PDF.');
  }
  return { pages };
}

module.exports = { DepartmentPdfError, importDepartmentPdf };
