(() => {
  const module = document.getElementById('fault-app');
  const page = document.getElementById('fault-url');
  const help = document.getElementById('fault-url-help');
  const type = document.getElementById('fault-type');
  const descriptionLabel = document.getElementById('fault-description-label');
  const descriptionHelp = document.getElementById('fault-description-help');
  const submit = document.querySelector('#fault-app').form.querySelector('button[type="submit"]');
  const groups = Array.from(page.querySelectorAll('optgroup'));
  function updateType() {
    const feature = type.value === 'feature';
    descriptionLabel.textContent = feature ? 'What would you like to be able to do?' : 'What went wrong?';
    descriptionHelp.textContent = feature ?
      'Describe the improvement you need and how it would help. Do not include passwords, student records or other sensitive information.' :
      'Include what you clicked, what you expected, what happened instead, any error message, and roughly when it happened.';
    submit.textContent = feature ? 'Submit feature request' : 'Submit fault report';
  }
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
  type.addEventListener('change', updateType);
  updatePages(true);
  updateType();
})();
