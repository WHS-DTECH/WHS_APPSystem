(function () {
  function setStatus(form, message, isError) {
    const output = form.querySelector('.kamar-upload-status');
    if (!output) return;
    output.textContent = message;
    output.classList.toggle('error', Boolean(isError));
  }

  document.querySelectorAll('.kamar-upload-card').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const file = form.querySelector('input[type="file"]').files[0];
      const button = form.querySelector('button');
      const type = form.dataset.uploadType;
      const academicYear = Number(form.querySelector('[name="academicYear"]').value);
      const term = form.querySelector('[name="term"]').value;

      if (!file) return;
      button.disabled = true;
      setStatus(form, 'Reading CSV...');

      Papa.parse(file, {
        skipEmptyLines: true,
        complete(result) {
          const rows = result.data || [];
          if (rows.length < 2) {
            setStatus(form, 'CSV is empty or has no data rows.', true);
            button.disabled = false;
            return;
          }

          const headers = rows[0];
          setStatus(form, `Uploading ${rows.length - 1} rows to PostgreSQL...`);
          fetch(`/admin/kamar-uploader/upload/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              academicYear,
              headers,
              rows: rows.slice(1),
              term
            })
          })
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}));
              if (!response.ok || !payload.success) throw new Error(payload.error || 'Upload failed.');
              return payload;
            })
            .then((payload) => {
              setStatus(form, `Completed: ${payload.processed} rows written to PostgreSQL.`);
              setTimeout(() => window.location.reload(), 900);
            })
            .catch((error) => {
              setStatus(form, error.message, true);
              button.disabled = false;
            });
        },
        error(error) {
          setStatus(form, error.message || 'Could not parse CSV.', true);
          button.disabled = false;
        }
      });
    });
  });
})();