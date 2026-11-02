(() => {
  const normalise = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  document.querySelectorAll('[data-tester-group]').forEach(group => {
    const search = group.querySelector('[data-tester-search]');
    const count = group.querySelector('[data-tester-count]');
    const empty = group.querySelector('[data-tester-empty]');
    const options = [...group.querySelectorAll('[data-tester-option]')].map(element => ({
      element, text: normalise(element.textContent), checkbox: element.querySelector('input')
    }));
    function update() {
      const terms = normalise(search.value).split(/\s+/).filter(Boolean);
      let shown = 0, selected = 0;
      options.forEach(option => {
        option.element.hidden = !terms.every(term => option.text.includes(term));
        if (!option.element.hidden) shown++;
        if (option.checkbox.checked) selected++;
      });
      count.textContent = `${shown} shown; ${selected} selected`;
      empty.hidden = shown !== 0;
    }
    search.addEventListener('input', update);
    group.addEventListener('change', update);
    update();
  });
})();
