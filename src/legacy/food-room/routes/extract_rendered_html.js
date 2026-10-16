// Route: /api/extract-rendered-html?url=...
const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const path = require('path');
const pdfParse = require('pdf-parse');

function normalizeHttpUrl(rawUrl, req) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    const host = req && typeof req.get === 'function' ? req.get('host') : '';
    const protocol = req && req.protocol ? req.protocol : 'http';
    if (host) return `${protocol}://${host}${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function fetchHtmlDirect(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-NZ,en;q=0.9'
    },
    timeout: 30000
  });

  if (!response.ok) {
    throw new Error(`Direct fetch failed with status ${response.status}`);
  }

  return response.text();
}

function htmlToVisibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function cleanPdfText(rawText) {
  return String(rawText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function extractPdfVisibleText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-NZ,en;q=0.9'
    },
    timeout: 45000
  });

  if (!response.ok) {
    throw new Error(`PDF fetch failed with status ${response.status}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  const isPdfByHeader = /^%PDF/.test(buffer.slice(0, 4).toString());
  const isPdfByType = contentType.includes('application/pdf');
  const isPdfByUrl = /\.pdf(?:$|[?#])/i.test(url);

  if (!(isPdfByHeader || isPdfByType || isPdfByUrl)) {
    throw new Error('Response is not a PDF document.');
  }

  const parsed = await pdfParse(buffer);
  return {
    visibleText: cleanPdfText(parsed.text),
    listItems: [],
    headingCandidates: [],
    jsonLdInstructions: []
  };
}

function validateUrlOrRespond(rawUrl, req, res) {
  const url = normalizeHttpUrl(rawUrl, req);
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return null;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch (_) {
    res.status(400).json({ error: 'Invalid url parameter' });
    return null;
  }

  return url;
}

// GET /api/extract-rendered-html?url=...
router.get('/extract-rendered-html', async (req, res) => {
  const url = validateUrlOrRespond(req.query.url, req, res);
  if (!url) return;

  // Call the puppeteer script as a child process
  const scriptPath = path.join(require('../paths').publicDir, 'extractor_raw_puppeteer.js');
  execFile('node', [scriptPath, url], { timeout: 30000 }, (err, stdout, stderr) => {
    if (!err && stdout && stdout.trim()) {
      return res.type('text/html').send(stdout);
    }

    fetchHtmlDirect(url)
      .then((html) => {
        res.type('text/html').send(html);
      })
      .catch((fetchErr) => {
        res.status(500).json({
          error: 'Failed to extract HTML from website',
          details: {
            puppeteer: (stderr || (err && err.message) || 'Unknown puppeteer error').toString(),
            directFetch: fetchErr.message
          }
        });
      });
  });
});

// GET /api/extract-visible-text?url=...
router.get('/extract-visible-text', async (req, res) => {
  const url = validateUrlOrRespond(req.query.url, req, res);
  if (!url) return;

  // PDFs opened in-browser should still be extractable as visible text.
  if (/\.pdf(?:$|[?#])/i.test(url) || /\/SavedPDFs\//i.test(url)) {
    try {
      const pdfData = await extractPdfVisibleText(url);
      return res.json({
        success: true,
        source: 'pdf-parse-visible-text',
        ...pdfData
      });
    } catch (pdfErr) {
      // Fall through to Puppeteer/direct HTML flow in case URL isn't actually a PDF.
    }
  }

  const scriptPath = path.join(require('../paths').publicDir, 'extractor_visible_text_puppeteer.js');
  execFile('node', [scriptPath, url], { timeout: 45000 }, (err, stdout, stderr) => {
    if (!err && stdout && stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout);
        return res.json({
          success: true,
          source: 'puppeteer-visible-text',
          ...parsed
        });
      } catch (_) {
        // Fall through to direct fetch fallback below.
      }
    }

    fetchHtmlDirect(url)
      .then((html) => {
        const visibleText = htmlToVisibleText(html);
        res.json({
          success: true,
          source: 'direct-fetch-text',
          visibleText,
          listItems: [],
          headingCandidates: [],
          jsonLdInstructions: []
        });
      })
      .catch((fetchErr) => {
        res.status(500).json({
          success: false,
          error: 'Failed to extract visible text from website',
          details: {
            puppeteer: (stderr || (err && err.message) || 'Unknown puppeteer error').toString(),
            directFetch: fetchErr.message
          }
        });
      });
  });
});

module.exports = router;
