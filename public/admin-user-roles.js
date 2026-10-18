(() => {
  'use strict';
  for (const type of ['staff', 'student']) {
    const search = document.getElementById('role-search-' + type);
    const results = document.getElementById('role-search-results-' + type);
    const status = document.getElementById('role-search-status-' + type);
    let timer, controller;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      controller?.abort();
      results.replaceChildren();
      const term = search.value.trim();
      if (term.length < 2) { status.textContent = 'Type at least two characters to search.'; return; }
      status.textContent = 'Searching current KAMAR ' + type + '...';
      controller = new AbortController();
      const signal = controller.signal;
      timer = setTimeout(async () => {
        try {
          const response = await fetch('/admin/users/directory?' + new URLSearchParams({ type, q: term }), {
            signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
          });
          if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('School sign-in may have expired. Sign in again, then retry your search.');
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Directory search failed. Please try again.');
          if (signal.aborted) return;
          for (const person of data.people) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = (person.display_name || person.email) + ' — ' + person.email +
              (person.reference ? ' (' + person.reference + ')' : '');
            button.addEventListener('click', () => {
              document.getElementById('role-user-type').value = type;
              document.getElementById('role-user-email').value = person.email;
              document.getElementById('role-selected-person').textContent = 'Selected: ' + (person.display_name || person.email);
              document.getElementById('role-to-add').focus();
            });
            item.append(button); results.append(item);
          }
          status.textContent = data.more ? 'Showing the first 20 matches. Refine your search for more.' :
            data.people.length ? data.people.length + ' matches. Select a user below.' : 'No matching current ' + type + ' with a school email.';
        } catch (error) {
          if (signal.aborted) return;
          console.error('Role directory search failed:', error);
          status.textContent = error.message;
        }
      }, 250);
    });
  }
})();
