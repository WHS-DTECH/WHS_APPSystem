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
    .then(function (data) {
      if (data.viewOnly) viewOnly();
      return auth.signInWithCustomToken(data.token);
    });

  // Testers explore the Lead Teacher page without being able to save anything.
  function viewOnly() {
    var proto = firebase.database.Reference.prototype;
    var lastNotice = 0;
    function blocked() {
      if (Date.now() - lastNotice > 3000) {
        lastNotice = Date.now();
        alert('View only: testers cannot save changes to routes.');
      }
      return Promise.reject(new Error('View only'));
    }
    ['set', 'update', 'remove', 'setWithPriority', 'setPriority', 'transaction'].forEach(function (name) {
      proto[name] = blocked;
    });
    var push = proto.push;
    proto.push = function (value) {
      return value === undefined ? push.call(this) : blocked();
    };
    var banner = document.createElement('div');
    banner.textContent = 'View only (tester): changes are not saved';
    banner.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:10000;background:#222;color:#fff;padding:6px 14px;border-radius:16px;font:600 13px sans-serif;pointer-events:none';
    document.body.appendChild(banner);
  }

  var watch = auth.onAuthStateChanged.bind(auth);
  auth.onAuthStateChanged = function (callback) {
    signIn.then(function () { watch(callback); }, function () { location.replace('staff?problem=1'); });
  };
})();
