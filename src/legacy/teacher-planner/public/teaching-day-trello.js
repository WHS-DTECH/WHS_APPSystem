(() => {
  function mount(host, context, { el, request }) {
    host.replaceChildren();
    const panel = el('section', '', { class: 'session-section teaching-day-trello', 'aria-label': 'Current Teaching Day' });
    panel.append(el('h3', 'Current Teaching Day'),
      el('p', 'Read-only Trello information for ' + context().date + '. Trello tasks are not confirmed classroom progress.'));
    const refresh = el('button', 'Refresh Trello information', { type: 'button' });
    const message = el('p', '', { role: 'status', 'aria-live': 'polite' }), cards = el('div'), warnings = el('div');
    panel.append(refresh, message, cards, warnings); host.append(panel);
    let cached, loading = false;
    function render() {
      if (!cached) return;
      cards.replaceChildren(); warnings.replaceChildren();
      const current = context();
      let matches = 0;
      for (const card of cached.cards) {
        const metadata = card.metadata;
        const matched = metadata.teaching_date === current.date && metadata.session_slot === current.slot &&
          metadata.class_key === current.classKey && metadata.session_type === current.sessionType;
        if (matched) matches++;
        const article = el('article', '', { class: 'teaching-day-card' + (matched ? ' teaching-day-card-current' : '') });
        if (matched) article.append(el('p', 'This session', { class: 'teaching-day-current-label' }));
        article.append(el('h4', metadata.display_name),
          el('p', metadata.start_time + '-' + metadata.end_time + ' NZ | ' + metadata.session_slot.toUpperCase()),
          el('p', metadata.lesson_title), el('p', 'Trello preparation status: ' + metadata.preparation_status));
        if (card.description) {
          const details = el('details'); details.append(el('summary', 'Preparation, activities and planning notes'),
            el('p', card.description, { class: 'session-preserved-text' })); article.append(details);
        }
        if (card.resources.length) {
          const resources = el('ul');
          for (const resource of card.resources) {
            const item = el('li');
            item.append(el('a', resource.name, { href: resource.url, target: '_blank', rel: 'noopener noreferrer' }));
            resources.append(item);
          }
          article.append(resources);
        }
        article.append(el('p', 'Trello updated ' + new Date(card.updatedAt).toLocaleString('en-NZ')),
          el('a', 'Open in Trello', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
        cards.append(article);
      }
      for (const issue of cached.issues) warnings.append(el('p',
        'Card ' + issue.cardId + ': ' + issue.message, { class: 'session-warning' }));
      message.setAttribute('role', cached.issues.length ? 'alert' : 'status');
      message.textContent = cached.status === 'not_configured' ? cached.message :
        !cached.cards.length ? 'No valid student-facing teaching cards are available for this date.' :
          matches === 1 ? 'The corresponding class/session card is highlighted.' :
            'No card matches this session reference. No card was guessed.';
    }
    async function load() {
      if (loading) return;
      loading = true; refresh.disabled = true;
      cards.replaceChildren(); warnings.replaceChildren(); cached = undefined;
      message.setAttribute('role', 'status'); message.textContent = 'Reading Current Teaching Day from Trello...';
      try {
        const result = await request(context().date);
        if (!panel.isConnected) return;
        cached = result; render();
      } catch (error) {
        if (!panel.isConnected) return;
        message.setAttribute('role', 'alert');
        message.textContent = error.message + ' Return to Notes to continue using the Planner.';
      } finally { loading = false; refresh.disabled = false; }
    }
    refresh.addEventListener('click', load); load();
    return { refreshContext: render };
  }
  globalThis.plannerTeachingDayTrello = { mount };
})();
