(() => {
  const form = document.getElementById('development-setup');
  if (!form) return;
  const button = form.querySelector('button');
  const status = document.getElementById('setup-status');
  let running = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (running) return;
    running = true;
    button.disabled = true;
    const deadline = Date.now() + 15 * 60 * 1000;
    status.textContent = 'Checking the recorded setup and continuing the next approved step...';
    try {
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
        if (!response.ok) throw new Error(result.error || 'Setup could not be confirmed. Inspect technical details before resuming.');
        status.textContent = result.message;
        if (result.state === 'ready') {
          window.location.reload();
          return;
        }
        if (!['progress', 'waiting'].includes(result.state)) throw new Error('Unexpected setup response. Inspect technical details before resuming.');
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
    }
  });
})();
