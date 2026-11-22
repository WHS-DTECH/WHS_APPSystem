(() => {
  function mount(host, { el, notes, year, term, request, expandNotes }) {
    const toggle = el('div', '', { class: 'term-notes-toggle planner-nav-buttons', role: 'group', 'aria-label': 'Term Notes or Trello',
      'data-planner-navigation': '' });
    const notesButton = el('button', 'Notes', { type: 'button', 'aria-pressed': 'true' });
    const trelloButton = el('button', 'Trello', { type: 'button', 'aria-pressed': 'false' });
    const panel = el('section', '', { class: 'term-trello-panel', 'aria-label': 'Term Trello overview', 'data-planner-navigation': '' });
    panel.hidden = true;
    const heading = el('h3', `TERM ${term} \u2014 ${year}`);
    const help = el('p', 'Umbrella responsibilities only. Trello is the source of truth. Review dates when planning another year; nothing is carried forward.');
    const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const cards = el('ul', '', { class: 'term-trello-cards' });
    const refresh = el('button', 'Refresh Trello', { type: 'button' });
    panel.append(heading, help, status, cards, refresh);
    toggle.append(notesButton, trelloButton);
    host.append(toggle, notes, panel);
    let generation = 0;
    async function load() {
      const current = ++generation;
      refresh.disabled = true;
      cards.replaceChildren();
      status.setAttribute('role', 'status');
      status.textContent = 'Loading the selected term overview from Trello...';
      try {
        const result = await request(`trello/${year}/${term}`);
        if (!panel.isConnected || current !== generation) return;
        if (result.year !== year || result.term !== Number(term) || !['ok', 'missing', 'empty'].includes(result.status) || !Array.isArray(result.cards)) {
          throw new Error('The Trello response does not match this year and term. Retry without changing your Notes.');
        }
        status.textContent = result.status === 'missing' ? 'No matching Trello list exists. Create and maintain the term overview separately in Trello; no list was created here.' :
          result.status === 'empty' ? 'The matching Trello list is empty. No umbrella cards have been added; no cards were created here.' :
            'Read-only overview. Refreshed ' + new Date(result.fetchedAt).toLocaleString('en-NZ');
        for (const card of result.cards) {
          if (!Array.isArray(card.labels)) throw new Error('Trello label metadata is unavailable. Refresh Trello; your Notes are unchanged.');
          const accent = card.labels.find(label => label.color);
          const item = el('li', '', accent ? { 'data-trello-colour': accent.color } : {});
          item.append(el('h4', card.title));
          if (card.labels.length) {
            const labels = el('div', '', { class: 'term-trello-labels', role: 'group', 'aria-label': 'Trello labels' });
            for (const label of card.labels) {
              const colourName = label.color ? label.color.replace(/_/g, ' ') : 'uncoloured';
              labels.append(el('span', label.name.trim() ? label.name : colourName + ' label', {
                class: 'term-trello-label', title: 'Trello colour: ' + colourName,
                ...(label.color ? { 'data-trello-colour': label.color } : {})
              }));
            }
            item.append(labels);
          }
          if (card.summary) item.append(el('p', card.summary));
          for (const [name, label] of [['start', 'Start'], ['due', 'Due']]) {
            if (card[name]) item.append(el('p', label + ': ' + new Date(card[name]).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })));
          }
          item.append(el('a', 'Open Trello card', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
          cards.append(item);
        }
      } catch (error) {
        console.error('Term Trello overview failed.');
        if (!panel.isConnected || current !== generation) return;
        status.setAttribute('role', 'alert');
        status.textContent = error.message;
      } finally {
        if (panel.isConnected && current === generation) refresh.disabled = false;
      }
    }
    notesButton.addEventListener('click', () => {
      panel.hidden = true; notes.hidden = false;
      notesButton.setAttribute('aria-pressed', 'true'); trelloButton.setAttribute('aria-pressed', 'false');
      expandNotes();
    });
    trelloButton.addEventListener('click', () => {
      notes.hidden = true; panel.hidden = false;
      notesButton.setAttribute('aria-pressed', 'false'); trelloButton.setAttribute('aria-pressed', 'true');
      load();
    });
    refresh.addEventListener('click', load);
  }
  globalThis.plannerTermTrello = { mount };
})();
