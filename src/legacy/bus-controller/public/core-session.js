// Global Control sign-in for Westland High staff.
// The page's own Firebase code waits until Global Control has signed it in with a short-lived token,
// so a stale Firebase session can never be used after access is removed in Global Control.
// westroad.html is also Westroad's own email/password page, so there a "no" from Global Control
// leaves the Westroad Firebase login untouched.
(function () {
  var page = location.pathname.split('/').pop().replace(/\.html$/, '');
  var optional = page === 'westroad';
  var watch = auth.onAuthStateChanged.bind(auth);

  var signIn = fetch('api/firebase-token?page=' + encodeURIComponent(page), { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('denied');
      return response.json();
    })
    .then(function (data) {
      return auth.signOut().then(function () {
        if (data.viewOnly) viewOnly();
        return auth.signInWithCustomToken(data.token);
      });
    });

  if (optional) {
    signIn = signIn.catch(function () {
      // Drop a leftover Global Control session; keep a Westroad email/password session.
      var stop;
      return new Promise(function (resolve) { stop = watch(resolve); }).then(function (user) {
        stop();
        return user && user.uid.indexOf('core-') === 0 ? auth.signOut() : null;
      });
    });
  } else {
    signIn = signIn.catch(function (error) {
      return auth.signOut().then(function () { throw error; });
    });
  }

  // Testers explore every staff page without being able to save anything.
  function viewOnly() {
    var proto = firebase.database.Reference.prototype;
    var lastNotice = 0;
    function blocked() {
      if (Date.now() - lastNotice > 3000) {
        lastNotice = Date.now();
        alert('View only: testers cannot save changes.');
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
    banner.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:10000;background:#222;color:#fff;padding:6px 14px;border-radius:16px;font:600 13px sans-serif;white-space:nowrap';
    banner.appendChild(document.createTextNode('View only (tester): '));
    [['principal', 'Routes'], ['westroad', 'Hazards'], ['admin', 'Users']].forEach(function (link) {
      var a = document.createElement('a');
      a.href = link[0] + '.html';
      a.textContent = link[1];
      a.style.cssText = 'color:' + (link[0] === page ? '#fff' : '#8ab4f8') + ';margin-left:10px;text-decoration:' + (link[0] === page ? 'none' : 'underline');
      banner.appendChild(a);
    });
    document.body.appendChild(banner);
  }

  auth.onAuthStateChanged = function (callback) {
    signIn.then(function () { watch(callback); }, function () { location.replace('staff?problem=1'); });
  };
})();
