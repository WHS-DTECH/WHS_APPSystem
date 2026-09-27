(function() {
  var statusEl = null;
  var plannerUploadInfoEl = null;
  var ROLE_STORAGE_KEY = 'navbar_user_role';

  function setStatus(message, type) {
    if (!statusEl) statusEl = document.getElementById('loginStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'login-status' + (type ? ' ' + type : '');
  }

  function setPlannerUploadInfo(html) {
    if (!plannerUploadInfoEl) plannerUploadInfoEl = document.getElementById('plannerUploadInfo');
    if (!plannerUploadInfoEl) return;

    if (!html) {
      plannerUploadInfoEl.hidden = true;
      plannerUploadInfoEl.innerHTML = '';
      return;
    }

    plannerUploadInfoEl.innerHTML = html;
    plannerUploadInfoEl.hidden = false;
  }

  function formatUploadDate(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadPlannerUploadInfo(user) {
    var email = String(user && user.email || '').trim().toLowerCase();
    if (!email) {
      setPlannerUploadInfo('');
      return Promise.resolve(0);
    }

    return fetchJson('/api/bookings/planner-upload-history?email=' + encodeURIComponent(email) + '&limit=5', {
      credentials: 'include'
    }).then(function(result) {
      if (!result.ok || !result.data || !Array.isArray(result.data.uploads)) {
        setPlannerUploadInfo('');
        return 0;
      }

      var uploads = result.data.uploads;
      if (!uploads.length) {
        setPlannerUploadInfo('');
        return 0;
      }

      var rows = uploads.map(function(item) {
        var name = escapeHtml(String(item.file_name || 'Planner upload'));
        var staffCode = escapeHtml(String(item.uploaded_by_staff_code || '-'));
        var when = escapeHtml(formatUploadDate(item.uploaded_at));
        return '<div class="login-upload-row">' +
          '<strong>' + name + '</strong><br>' +
          'Uploaded ' + when + ' | Staff Code: ' + staffCode +
          '</div>';
      }).join('');

      setPlannerUploadInfo(
        '<div class="login-upload-info-title">Your Recent Planner Uploads</div>' + rows
      );
      return uploads.length;
    }).catch(function() {
      setPlannerUploadInfo('');
      return 0;
    });
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function verifySession() {
    return fetchJson('/api/auth/me', { credentials: 'include' }).then(function(meResult) {
      var isAuthenticated = Boolean(
        meResult &&
        meResult.ok &&
        meResult.data &&
        meResult.data.authenticated &&
        meResult.data.user &&
        meResult.data.user.email
      );

      if (!isAuthenticated) {
        throw new Error('Login did not persist. Please allow cookies for this site and try again.');
      }

      return meResult.data.user;
    });
  }

  function rememberRole(user) {
    try {
      var role = String((user && user.role) || '').trim().toLowerCase();
      if (role) sessionStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch (_) {
      // Ignore session storage failures.
    }
  }

  function loadGoogleScript(onLoad) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      onLoad();
      return;
    }

    var existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-identity', '1');
    script.addEventListener('load', onLoad, { once: true });
    document.head.appendChild(script);
  }

  function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      setStatus('Google login failed. Please try again.', 'error');
      return;
    }

    setStatus('Signing you in...', '');

    fetchJson('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken: response.credential })
    }).then(function(result) {
      if (!result.ok || !result.data || !result.data.success) {
        throw new Error((result.data && result.data.error) || 'Sign-in failed.');
      }
      return verifySession();
    }).then(function(user) {
      rememberRole(user);
      return loadPlannerUploadInfo(user).then(function(uploadCount) {
        var extra = uploadCount > 0 ? (' You have uploaded ' + uploadCount + ' planner file' + (uploadCount === 1 ? '' : 's') + '.') : '';
        setStatus('Signed in successfully.' + extra + ' Redirecting...', 'success');
        setTimeout(function() {
          window.location.href = 'index.html';
        }, 2200);
      });
    }).catch(function(err) {
      setStatus(err.message || 'Sign-in failed.', 'error');
    });
  }

  function startGoogleSignin(clientId) {
    var mount = document.getElementById('googleSigninMount');
    if (!mount) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      ux_mode: 'popup'
    });

    window.google.accounts.id.renderButton(mount, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      shape: 'pill',
      text: 'signin_with',
      width: 280
    });
  }

  function boot() {
    fetchJson('/api/auth/me', { credentials: 'include' })
      .then(function(meResult) {
        if (meResult.ok && meResult.data && meResult.data.authenticated && meResult.data.user) {
          rememberRole(meResult.data.user);
          return loadPlannerUploadInfo(meResult.data.user).then(function(uploadCount) {
            var extra = uploadCount > 0 ? (' You have uploaded ' + uploadCount + ' planner file' + (uploadCount === 1 ? '' : 's') + '.') : '';
            setStatus('Already signed in.' + extra + ' Redirecting to Recipe Book...', 'success');
            setTimeout(function() {
              window.location.href = 'index.html';
            }, 2200);
            return null;
          });
        }

        return fetchJson('/api/auth/google/config', { credentials: 'include' });
      })
      .then(function(configResult) {
        if (!configResult) return;
        if (!configResult.ok || !configResult.data || !configResult.data.clientId) {
          throw new Error((configResult.data && configResult.data.error) || 'Google sign-in is not configured yet.');
        }

        loadGoogleScript(function() {
          startGoogleSignin(configResult.data.clientId);
        });
      })
      .catch(function(err) {
        setStatus(err.message || 'Unable to load Google sign-in.', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
