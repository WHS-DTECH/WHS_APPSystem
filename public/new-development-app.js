(() => {
  const form = document.getElementById('development-setup');
  if (!form) return;
  const button = form.querySelector('button');
  const status = document.getElementById('setup-status');
  const idleLabel = button.textContent;
  let running = false;
  async function refreshProgress() {
    const response = await fetch(form.action.replace(/\/step$/, ''), {
      credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Could not refresh recorded progress. Reload setup and inspect technical details before resuming.');
    const snapshot = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!snapshot.getElementById('development-setup')) throw new Error('Setup session could not be confirmed. Reload and sign in again before resuming.');
    for (const id of ['setup-resources', 'setup-links', 'setup-history']) {
      const current = document.getElementById(id);
      const updated = snapshot.getElementById(id);
      if (!current || !updated) throw new Error('The setup page changed. Reload it to see the latest recorded progress.');
      current.replaceWith(document.importNode(updated, true));
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (running) return;
    running = true;
    button.disabled = true;
    button.textContent = 'Setup running...';
    const deadline = Date.now() + 15 * 60 * 1000;
    status.textContent = 'Checking the recorded setup and continuing the next approved step...';
    try {
      await refreshProgress();
      while (Date.now() < deadline) {
        const response = await fetch(form.action, {
          method: 'POST', credentials: 'same-origin', redirect: 'error',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams(new FormData(form)), signal: AbortSignal.timeout(180000)
        });
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('The server could not confirm the step. Reload, check operation history and sign in again if required before resuming.');
        }
        const result = await response.json();
        await refreshProgress();
        if (!response.ok) throw new Error(result.error || 'Setup could not be confirmed. Inspect technical details before resuming.');
        const checkedAt = new Date().toLocaleTimeString();
        status.textContent = `${result.message} Last checked ${checkedAt}.`;
        if (result.state === 'ready') {
          window.location.reload();
          return;
        }
        if (!['progress', 'waiting'].includes(result.state)) throw new Error('Unexpected setup response. Inspect technical details before resuming.');
        button.textContent = result.state === 'waiting' ? 'Waiting for Render...' : 'Continuing setup...';
        if (result.state === 'waiting') status.textContent += ' Checking again in 10 seconds. Existing resources will not be recreated.';
        await new Promise(resolve => setTimeout(resolve, result.state === 'waiting' ? 10000 : 500));
      }
      status.textContent = 'Setup paused after 15 minutes. Reload to see recorded resources and resume checks; no duplicate resources are needed.';
    } catch (error) {
      status.textContent = 'Setup stopped. ' + (error.name === 'TimeoutError' || error.name === 'TypeError'
        ? 'The response could not be confirmed. Reload and inspect operation history before resuming; resources may already exist.'
        : error.message);
    } finally {
      running = false;
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });
})();
