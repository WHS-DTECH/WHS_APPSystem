(() => {
  const module = document.getElementById('fault-app');
  const page = document.getElementById('fault-url');
  const help = document.getElementById('fault-url-help');
  const groups = Array.from(page.querySelectorAll('optgroup'));
  function updatePages(retain = false) {
    const selected = retain ? page.value : '';
    const group = groups.find(item => item.dataset.module === module.value);
    page.replaceChildren(new Option('Not sure / whole module', ''));
    if (group) {
      for (const option of group.querySelectorAll('option')) page.append(option.cloneNode(true));
    }
    page.value = selected;
    if (page.selectedIndex < 0) page.value = '';
    page.disabled = !group;
    help.textContent = group ? 'Main pages for ' + module.selectedOptions[0].textContent +
      '. Choose Not sure / whole module if the exact page is not listed.' :
      'Choose a module to see its main pages and sections. No URL copying is needed.';
  }
  module.addEventListener('change', () => updatePages());
  updatePages(true);
})();
