// ── EmailJS configuration ────────────────────────────────
// 1. Create a free account at https://www.emailjs.com
// 2. Add an Email Service (Gmail recommended) — note your Service ID
// 3. Create an Email Template, paste in the HTML from email_template.html,
//    then note your Template ID
// 4. Copy your Public Key from Account → API Keys
// Replace the three placeholder strings below with your own values:
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// ── DOM refs ─────────────────────────────────────────────
const form       = document.getElementById('suggest-form');
const statusBar  = document.getElementById('status-bar');
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('s-file');
const fileDisplay = document.getElementById('file-name-display');
const emailField = document.getElementById('s-email');

// ── Drag & drop styling ──────────────────────────────────
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
['dragleave', 'dragend', 'drop'].forEach(evt =>
  dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'))
);
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (file.type !== 'application/pdf') {
    setStatus('Please upload a PDF file only.', 'error');
    fileDisplay.textContent = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setStatus('File exceeds 10 MB limit.', 'error');
    fileDisplay.textContent = '';
    return;
  }
  fileDisplay.textContent = '📄 ' + file.name;
  setStatus('Ready to submit your suggestion.', '');
}

// ── Email validation ─────────────────────────────────────
emailField.addEventListener('blur', () => {
  const val = emailField.value.trim();
  if (val && !isValidSchoolEmail(val)) {
    emailField.classList.add('invalid');
    setStatus('Please use a valid school/work email (Google or Microsoft account).', 'error');
  } else {
    emailField.classList.remove('invalid');
    setStatus('Ready to submit your suggestion.', '');
  }
});

function isValidSchoolEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ── Form submit ──────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();

  const nameVal     = document.getElementById('s-name').value.trim();
  const emailVal    = emailField.value.trim();
  const activityVal = document.getElementById('s-activity-name').value.trim();
  const urlVal      = document.getElementById('s-url').value.trim();
  const reasonVal   = document.getElementById('s-reason').value.trim();

  // Validate required fields
  let valid = true;
  [emailField,
   document.getElementById('s-activity-name'),
   document.getElementById('s-reason')
  ].forEach(field => {
    if (!field.value.trim()) {
      field.classList.add('invalid');
      valid = false;
    } else {
      field.classList.remove('invalid');
    }
  });

  if (!valid) {
    setStatus('Please fill in all required fields.', 'error');
    return;
  }
  if (!isValidSchoolEmail(emailVal)) {
    emailField.classList.add('invalid');
    setStatus('Please use a valid school/work email (Google or Microsoft account).', 'error');
    return;
  }

  setStatus('Sending your suggestion…', '');

  const today = new Date().toISOString().split('T')[0];

  // ── Step 1: Save to database via our API ─────────────────
  let savedOk = false;
  try {
    const apiRes = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date:          today,
        activity_name: activityVal,
        suggested_by:  nameVal  || null,
        email:         emailVal,
        url:           urlVal   || null,
        reason:        reasonVal,
      }),
    });
    const apiData = await apiRes.json();
    if (!apiRes.ok) throw new Error(apiData.error || 'API error');
    savedOk = true;
  } catch (err) {
    console.error('API save error:', err);
    setStatus('Sorry, something went wrong saving your suggestion. Please try again.', 'error');
    return;
  }

  // ── Step 2: Send notification email via EmailJS ───────────
  // (runs in the background — DB record is already saved above)
  if (savedOk && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    const templateParams = {
      date:            today,
      activity_name:   activityVal,
      suggested_by:    nameVal  || 'Not provided',
      sender_email:    emailVal,
      activity_url:    urlVal   || 'N/A',
      reason:          reasonVal,
      suggestions_url: window.location.href,
    };
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
      .catch(err => console.warn('EmailJS notification skipped:', err));
  }

  setStatus(
    `Thanks${nameVal ? ', ' + nameVal : ''}! Your suggestion for "${activityVal}" has been saved.`,
    'success'
  );
  form.reset();
  fileDisplay.textContent = '';
});

function setStatus(msg, type) {
  statusBar.textContent = 'Status: ' + msg;
  statusBar.className = 'status-bar' + (type ? ' ' + type : '');
}
