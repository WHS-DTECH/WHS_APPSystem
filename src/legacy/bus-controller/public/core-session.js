// Global Control sign-in for Westland High staff pages.
// The page's own Firebase code waits until Global Control has signed it in with a short-lived token,
// so a stale Firebase session can never be used after access is removed in Global Control.
(function () {
  var page = location.pathname.split('/').pop().replace(/\.html$/, '');
  var signIn = auth.signOut()
    .then(function () {
      return fetch('api/firebase-token?page=' + encodeURIComponent(page), { credentials: 'same-origin', cache: 'no-store' });
    })
    .then(function (response) {
      if (!response.ok) throw new Error('denied');
      return response.json();
    })
    .then(function (data) { return auth.signInWithCustomToken(data.token); });

  var watch = auth.onAuthStateChanged.bind(auth);
  auth.onAuthStateChanged = function (callback) {
    signIn.then(function () { watch(callback); }, function () { location.replace('staff?problem=1'); });
  };
})();
