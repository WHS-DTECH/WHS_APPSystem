(() => {
  const status = document.getElementById('department-status');
  const directory = document.getElementById('department-directory');
  const refresh = document.getElementById('refresh-departments');
  async function load() {
    refresh.disabled = true; status.setAttribute('role', 'status'); status.textContent = 'Loading departments...';
    try {
      const response = await fetch('/api/feed/departments', { cache: 'no-store' });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('School sign-in required. Sign in again and retry.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The department directory could not be loaded.');
      directory.replaceChildren();
      for (const item of result.departments) {
        const section = document.createElement('section');
        const title = document.createElement('h2'); title.textContent = item.name;
        const chosen = document.createElement('p'); chosen.textContent = 'Default Teacher in Charge: ' + (item.teacher || 'Not automatically selected');
        const list = document.createElement('ul');
        for (const leader of item.leaders) {
          const li = document.createElement('li');
          li.textContent = leader.name + ' - ' + (leader.acting ? 'Acting ' : '') + leader.role +
            (leader.onLeave ? ' (on leave)' : '') + (leader.reviewedOn ? '; reviewed ' + leader.reviewedOn : '');
          list.append(li);
        }
        section.append(title, chosen, list); directory.append(section);
      }
      status.textContent = result.departments.length + ' departments loaded.';
    } catch (error) {
      console.error('Kamar department directory failed.');
      status.setAttribute('role', 'alert'); status.textContent = error.message;
    } finally { refresh.disabled = false; }
  }
  refresh.addEventListener('click', load); load();
})();
