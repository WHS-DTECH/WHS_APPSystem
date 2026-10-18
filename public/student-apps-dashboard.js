(function () {
  const collection = document.getElementById('apps-collection');
  const controls = document.querySelector('.apps-view-switch');
  if (!collection || !controls) return;
  controls.hidden = false;
  const buttons = controls.querySelectorAll('[data-apps-view]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      collection.dataset.view = button.dataset.appsView;
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    });
  });
})();
