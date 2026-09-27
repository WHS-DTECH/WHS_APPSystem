// display_recipe_book.js
// Fetches and displays the Recipe Book from recipe_display table instead of recipes

document.addEventListener('DOMContentLoaded', function() {
  let canOpenRecipeDetails = false;
  let inlineLoginBooted = false;
  let inlineLoginReady = false;
  let inlineLoginFallbackTimer = null;
  let pendingRecipeDetailUrl = '';
  const ROLE_STORAGE_KEY = 'navbar_user_role';

  function clearInlineLoginFallbackTimer() {
    if (!inlineLoginFallbackTimer) return;
    clearTimeout(inlineLoginFallbackTimer);
    inlineLoginFallbackTimer = null;
  }

  function isLikelyInAppBrowser() {
    const ua = String((navigator && navigator.userAgent) || '').toLowerCase();
    return /\bwv\b|fban|fbav|instagram|line\//i.test(ua);
  }

  function getDedicatedLoginUrl() {
    const next = pendingRecipeDetailUrl || `${window.location.pathname}${window.location.search}`;
    return `google_login.html?next=${encodeURIComponent(next)}`;
  }

  function redirectToDedicatedLogin() {
    window.location.href = getDedicatedLoginUrl();
  }

  function rememberRole(user) {
    try {
      const role = String((user && user.role) || '').trim().toLowerCase();
      if (role) sessionStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch (_) {
      // Ignore session storage failures.
    }
  }

  function setInlineLoginStatus(message, type) {
    const statusEl = document.getElementById('heroLoginStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'hero-login-status' + (type ? ` ${type}` : '');
  }

  function setInlineLoginVisible(visible) {
    const panel = document.getElementById('inlineLoginPanel');
    if (!panel) return;
    panel.hidden = !visible;
  }

  function setInlineSuggestVisible(visible) {
    const panel = document.getElementById('inlineSuggestPanel');
    if (!panel) return;
    panel.hidden = !visible;
  }

  function broadcastAuthSession(user) {
    document.dispatchEvent(new CustomEvent('auth-session-changed', {
      detail: { user: user || null }
    }));
  }

  function verifySession() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
      .then((result) => {
        const isAuthenticated = Boolean(
          result &&
          result.ok &&
          result.data &&
          result.data.authenticated &&
          result.data.user &&
          result.data.user.email
        );

        if (!isAuthenticated) {
          throw new Error('Login did not persist. Please allow cookies for this site and try again.');
        }

        return result.data.user;
      });
  }

  function loadGoogleScript(onLoad, onError) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      onLoad();
      return;
    }

    const existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-identity', '1');
    script.addEventListener('load', onLoad, { once: true });
    if (onError) {
      script.addEventListener('error', onError, { once: true });
    }
    document.head.appendChild(script);
  }

  function handleInlineCredentialResponse(response) {
    if (!response || !response.credential) {
      setInlineLoginStatus('Google login failed. Please try again.', 'error');
      return;
    }

    setInlineLoginStatus('Signing you in...', '');

    fetch('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken: response.credential })
    })
      .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
      .then((result) => {
        if (!result.ok || !result.data || !result.data.success) {
          throw new Error((result.data && result.data.error) || 'Sign-in failed.');
        }
        return verifySession();
      })
      .then((user) => {
        canOpenRecipeDetails = true;
        rememberRole(user);
        broadcastAuthSession(user);
        setInlineLoginStatus('Signed in successfully.', 'success');
        setInlineLoginVisible(false);
        if (pendingRecipeDetailUrl) {
          const destination = pendingRecipeDetailUrl;
          pendingRecipeDetailUrl = '';
          window.location.href = destination;
        }
      })
      .catch((err) => {
        setInlineLoginStatus((err && err.message) || 'Sign-in failed.', 'error');
      });
  }

  function startInlineGoogleSignin(clientId) {
    const mount = document.getElementById('heroGoogleSigninMount');
    if (!mount) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleInlineCredentialResponse,
      ux_mode: 'popup'
    });

    mount.innerHTML = '';
    window.google.accounts.id.renderButton(mount, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      shape: 'pill',
      text: 'signin_with',
      width: 280
    });
    inlineLoginReady = true;
    clearInlineLoginFallbackTimer();
  }

  function bootInlineLogin() {
    const panel = document.getElementById('inlineLoginPanel');
    if (!panel) return;

    if (canOpenRecipeDetails) {
      setInlineLoginVisible(false);
      return;
    }

    if (inlineLoginBooted) return;
    inlineLoginBooted = true;
    inlineLoginReady = false;

    fetch('/api/auth/google/config', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
      .then((result) => {
        if (!result.ok || !result.data || !result.data.clientId) {
          throw new Error((result.data && result.data.error) || 'Google sign-in is not configured yet.');
        }

        loadGoogleScript(() => {
          startInlineGoogleSignin(result.data.clientId);
        }, () => {
          setInlineLoginStatus('Google sign-in could not be loaded here. Redirecting to full login page...', 'error');
          setTimeout(redirectToDedicatedLogin, 450);
        });
      })
      .catch((err) => {
        setInlineLoginStatus((err && err.message) || 'Unable to load Google sign-in.', 'error');
        setTimeout(redirectToDedicatedLogin, 450);
      });
  }

  function toggleInlineLoginFromNavbar(event) {
    const link = event.target && event.target.closest ? event.target.closest('#navbarUsername') : null;
    if (!link) return;
    if (canOpenRecipeDetails) return;

    const href = String(link.getAttribute('href') || '').trim().toLowerCase();
    if (href !== 'google_login.html') return;

    event.preventDefault();

    const panel = document.getElementById('inlineLoginPanel');
    if (!panel) return;

    const willShow = panel.hidden;
    if (willShow) {
      openInlineLoginPanel('');
    } else {
      setInlineLoginVisible(false);
    }
  }

  function toggleInlineSuggestPanel() {
    const panel = document.getElementById('inlineSuggestPanel');
    if (!panel) return;

    const willShow = panel.hidden;
    setInlineSuggestVisible(willShow);
    if (willShow && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openInlineLoginPanel(message) {
    if (isLikelyInAppBrowser()) {
      redirectToDedicatedLogin();
      return;
    }

    const panel = document.getElementById('inlineLoginPanel');

    setInlineSuggestVisible(false);
    setInlineLoginStatus(message || '', '');
    setInlineLoginVisible(true);
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    clearInlineLoginFallbackTimer();
    inlineLoginFallbackTimer = setTimeout(() => {
      if (canOpenRecipeDetails || inlineLoginReady) return;
      setInlineLoginStatus('Inline login is unavailable. Redirecting to full login page...', 'error');
      redirectToDedicatedLogin();
    }, 4200);
    bootInlineLogin();
  }

  function refreshAuthState() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        canOpenRecipeDetails = Boolean(data && data.authenticated && data.user && data.user.email);
        if (canOpenRecipeDetails) {
          rememberRole(data.user);
          broadcastAuthSession(data.user);
          setInlineLoginVisible(false);
        }
      })
      .catch(() => {
        canOpenRecipeDetails = false;
      });
  }
  const SOURCE_BRAND_MAP = [
    { match: /chelsea/i, label: 'Chelsea', monogram: 'CH' },
    { match: /edmonds/i, label: 'Edmonds', monogram: 'ED' },
    { match: /heartfoundation/i, label: 'Heart Foundation', monogram: 'HF' },
    { match: /healthyfood|healthyfood\.com/i, label: 'Healthy Food', monogram: 'HF' },
    { match: /foodinaminute/i, label: 'Food In A Minute', monogram: 'FM' },
    { match: /annabel[-\s]?langbein/i, label: 'Annabel Langbein', monogram: 'AL' },
    { match: /recipetineats/i, label: 'RecipeTin Eats', monogram: 'RT' },
    { match: /bbcgoodfood/i, label: 'BBC Good Food', monogram: 'BG' }
  ];

  const STOCK_IMAGES = {
    'Baking': [
      'https://images.pexels.com/photos/3026808/pexels-photo-3026808.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1055272/pexels-photo-1055272.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/132694/pexels-photo-132694.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Fresh and Veg': [
      'https://images.pexels.com/photos/1211887/pexels-photo-1211887.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1300972/pexels-photo-1300972.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Main Meals': [
      'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1527603/pexels-photo-1527603.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Breakfast': [
      'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/793765/pexels-photo-793765.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Student Favourites': [
      'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1435904/pexels-photo-1435904.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ]
  };

  function stableIndex(seed, length) {
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }

  function optimizeExternalImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    if (!/^https?:\/\//i.test(raw)) return raw;

    try {
      const parsed = new URL(raw);
      if (/images\.pexels\.com$/i.test(parsed.hostname)) {
        const width = Number(parsed.searchParams.get('w') || '0');
        if (!width || width > 700) {
          parsed.searchParams.set('w', '640');
        }
      }
      return parsed.toString();
    } catch (_) {
      return raw;
    }
  }

  function getDishImage(name, rowId, category, index) {
    const lower = String(name || '').toLowerCase();
    const seed = `${rowId || ''}-${name || ''}`;

    if (/(cupcake|cake|cookie|brownie|muffin|pavlova|dessert|slice)/.test(lower)) {
      const list = STOCK_IMAGES.Baking;
      return optimizeExternalImageUrl(list[stableIndex(seed, list.length)]);
    }
    if (/(salad|vegetable|veggie|beetroot|kumara|pumpkin)/.test(lower)) {
      const list = STOCK_IMAGES['Fresh and Veg'];
      return optimizeExternalImageUrl(list[stableIndex(seed, list.length)]);
    }
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) {
      const list = STOCK_IMAGES.Breakfast;
      return optimizeExternalImageUrl(list[stableIndex(seed, list.length)]);
    }

    const categoryImages = STOCK_IMAGES[category] || STOCK_IMAGES['Student Favourites'];
    return optimizeExternalImageUrl(categoryImages[stableIndex(seed, categoryImages.length)]);
  }

  function getDishCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(cake|cupcake|cookie|brownie|muffin|pavlova|dessert|slice|fritter)/.test(lower)) return 'Baking';
    if (/(salad|vegetable|veggie|bean|lentil|pumpkin|kumara)/.test(lower)) return 'Fresh and Veg';
    if (/(pasta|macaroni|noodle|rice|stir fry|pie|brisket|pork|beef|chicken|lamb)/.test(lower)) return 'Main Meals';
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) return 'Breakfast';
    return 'Student Favourites';
  }

  function buildCardSubtitle(name) {
    const lower = String(name || '').toLowerCase();
    if (/(chelsea sugar)/.test(lower)) return 'Baking skills and sweetness balance';
    if (/(healthy food guide)/.test(lower)) return 'Healthy cooking and nutrition focus';
    if (/(edmonds)/.test(lower)) return 'Classic NZ kitchen staple recipe';
    return 'Practical kitchen confidence and food literacy';
  }

  function safeRecipeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalizedSlashes = raw.replace(/\\/g, '/');

    // Repair malformed values such as https:///SavedPDFs/file.pdf.
    const malformedSavedPdf = normalizedSlashes.match(/^https?:\/\/+(.+)$/i);
    if (malformedSavedPdf) {
      const remainder = String(malformedSavedPdf[1] || '').replace(/^\/+/, '');
      if (/^SavedPDFs\//i.test(remainder)) {
        return new URL('/' + remainder, window.location.origin).toString();
      }
    }

    // Local files should resolve against this app's domain.
    if (/^\/?SavedPDFs\//i.test(normalizedSlashes)) {
      const path = '/' + normalizedSlashes.replace(/^\/+/, '');
      return new URL(path, window.location.origin).toString();
    }

    if (/^https?:\/\//i.test(normalizedSlashes)) return normalizedSlashes;

    if (normalizedSlashes.startsWith('/')) {
      return new URL(normalizedSlashes, window.location.origin).toString();
    }

    return `https://${normalizedSlashes}`;
  }

  function isLikelyImagePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (/^https?:\/\//i.test(raw)) return true;
    if (/^data:image\//i.test(raw)) return true;
    if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(raw)) return true;
    return false;
  }

  function normalizeRecipeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!isLikelyImagePath(raw)) return '';

    // Data URLs are already complete — return as-is.
    if (/^data:image\//i.test(raw)) return raw;

    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    if (raw.startsWith('/')) {
      return raw;
    }

    if (/^images\//i.test(raw)) {
      return `/${raw}`;
    }

    // Legacy stored filenames are expected in the uploads folder.
    return `/images/recipe_user_uploads/${raw}`;
  }

  function getFtPrimaryImage(recipe) {
    try {
      const images = JSON.parse(String(recipe && recipe.ft_images || 'null')) || [];
      const primarySlot = Number(recipe && recipe.ft_primary_slot);
      if (Number.isInteger(primarySlot) && primarySlot >= 1 && primarySlot <= images.length) {
        const starred = normalizeRecipeImageUrl(images[primarySlot - 1]);
        if (starred) return starred;
      }
      for (const image of images) {
        const value = normalizeRecipeImageUrl(image);
        if (value) return value;
      }
    } catch (_) {
      return '';
    }
    return '';
  }

  function hostFromUrl(value) {
    try {
      const host = new URL(value).hostname.replace(/^www\./i, '');
      return host;
    } catch (_) {
      return '';
    }
  }

  function titleCase(text) {
    return String(text || '')
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  function sourceInfo(recipeUrl, recipeName) {
    const href = safeRecipeUrl(recipeUrl);
    if (!href) {
      return {
        href: '',
        label: 'Source',
        monogram: 'SR'
      };
    }

    try {
      const parsed = new URL(href);
      if (/\/SavedPDFs\//i.test(parsed.pathname)) {
        return {
          href,
          label: 'SavedPDFs',
          monogram: 'SA'
        };
      }
    } catch (_) {
      // Fall through to generic host handling.
    }

    const host = hostFromUrl(href);
    const sourceSeed = `${host} ${recipeName || ''}`;
    const known = SOURCE_BRAND_MAP.find(item => item.match.test(sourceSeed));
    if (known) {
      return {
        href,
        label: known.label,
        monogram: known.monogram
      };
    }

    const hostCore = host.split('.')[0] || host;
    const label = titleCase(hostCore) || 'Source';
    const letters = label.replace(/[^A-Za-z]/g, '').toUpperCase();
    const monogram = (letters.slice(0, 2) || 'SR');
    return {
      href,
      label,
      monogram
    };
  }

  function parseLocalIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function parseBookingDate(value) {
    const local = parseLocalIsoDate(value);
    if (local) return local;
    // Avoid UTC offset shifts: extract YYYY-MM-DD when present.
    const datePart = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (datePart) {
      const fromPart = parseLocalIsoDate(datePart[1]);
      if (fromPart) return fromPart;
    }
    return new Date(value);
  }

  function getWeekStart(date) {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    base.setHours(0, 0, 0, 0);
    // School week starts on Monday.
    const mondayOffset = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - mondayOffset);
    return base;
  }

  function getWeekEnd(startDate) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  function formatWeekRangeLabel(startDate, endDate) {
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const startMonth = startDate.toLocaleString('en-NZ', { month: 'long' });
    const endMonth = endDate.toLocaleString('en-NZ', { month: 'long' });

    if (startMonth === endMonth) {
      return `${startDay} - ${endDay} ${startMonth}`;
    }

    return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
  }

  function rowRecipeKey(row) {
    return String(row.recipeid || row.recipe_id || row.id || '');
  }

  function normalizeBookingRecipeName(value) {
    return String(value || '')
      .replace(/^\s*Recipe\s*:\s*/i, '')
      .trim();
  }

  function normalizeRecipeLookupName(value) {
    return String(value || '')
      .replace(/^\s*Recipe\s*:\s*/i, '')
      .replace(/\bassessment\b[\s\-:]*\d*$/i, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
  }

  function isNonRecipePlannerLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    return normalized === 'theory'
      || normalized.startsWith('theory ')
      || normalized === 'no recipe allocated'
      || normalized === 'no recipe';
  }

  function createRecipeCard(row, index, recipeById) {
    const name = row.name || '(No Name)';
    const recipeNumber = row.recipeid || row.recipe_id || row.id || 'Planner';
    const category = getDishCategory(name);
    const ftPrimaryImage = getFtPrimaryImage(row);
    const normalizedImageUrl = normalizeRecipeImageUrl(row.image_url);
    const imageUrl = optimizeExternalImageUrl(ftPrimaryImage || normalizedImageUrl || getDishImage(name, row.id, category, index));
    const linkedRecipe = recipeById.get(String(recipeNumber)) || recipeById.get(String(row.id)) || null;
    const recipeUrl = row.url || (linkedRecipe && linkedRecipe.url) || '';
    const imageLoading = index < 4 ? 'eager' : 'lazy';
    const imagePriority = index === 0 ? 'high' : 'auto';
    const categoryChipHtml = category === 'Student Favourites'
      ? ''
      : `<span class="recipe-chip">${category}</span>`;
    const src = sourceInfo(recipeUrl, name);
    const sourceLink = src.href
      ? `<a class="recipe-source-link" href="${src.href}" target="_blank" rel="noopener noreferrer" title="Open source recipe on ${src.label}">
           <span class="recipe-source-logo" aria-hidden="true">${src.monogram}</span>
           <span class="recipe-source-name">${src.label}</span>
           <span class="recipe-source-cta" aria-hidden="true">Open ↗</span>
         </a>`
      : `<span class="recipe-source-link recipe-source-link-disabled" title="No source URL">
           <span class="recipe-source-logo" aria-hidden="true">${src.monogram}</span>
           <span class="recipe-source-name">${src.label}</span>
         </span>`;

    const card = document.createElement('div');
    card.className = 'recipe-card';
    const hasDetailId = String(row.id || '').trim() !== '';
    card.style.cursor = hasDetailId ? 'pointer' : 'default';
    card.innerHTML = `
      <img class="recipe-thumb" src="${imageUrl}" alt="${String(name).replace(/"/g, '&quot;')}" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}">
      <div class="recipe-card-body">
        <div class="recipe-card-top">
          <div class="recipe-card-top-left">
            <div class="recipe-card-id">#${recipeNumber}</div>
            ${sourceLink}
          </div>
          ${categoryChipHtml}
        </div>
        <div class="recipe-card-title">${name}</div>
        <div class="recipe-card-sub">${buildCardSubtitle(name)}</div>
      </div>
    `;

    const img = card.querySelector('.recipe-thumb');
    if (img) {
      img.onerror = function() {
        this.src = 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=640';
      };
    }

    card.querySelectorAll('.recipe-source-link').forEach((linkEl) => {
      linkEl.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    });

    if (hasDetailId) {
      card.onclick = () => {
        const detailUrl = `recipe_display.html?id=${row.id}`;
        if (!canOpenRecipeDetails) {
          pendingRecipeDetailUrl = detailUrl;
          openInlineLoginPanel('Sign in with Google to open this recipe.');
          return;
        }
        window.location.href = detailUrl;
      };
    }

    return card;
  }

  function renderRecipeCards(container, rows, recipeById, startIndex) {
    if (!container) return;
    container.innerHTML = '';
    rows.forEach((row, index) => {
      const card = createRecipeCard(row, startIndex + index, recipeById);
      container.appendChild(card);
    });
  }

  function recipeSearchText(row) {
    return [
      row && row.name,
      row && row.url,
      row && row.ingredients,
      row && row.instructions,
      getDishCategory(row && row.name)
    ]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');
  }

  function applyRecipeFilters(options) {
    const cardList = options.cardList;
    const emptyEl = options.emptyEl;
    const orderedRows = Array.isArray(options.orderedRows) ? options.orderedRows : [];
    const recipeById = options.recipeById;
    const sortMode = String(options.sortMode || 'az');
    const searchTerm = String(options.searchTerm || '').trim().toLowerCase();

    let filtered = orderedRows.filter((row) => {
      if (!searchTerm) return true;
      return recipeSearchText(row).includes(searchTerm);
    });

    if (sortMode === 'za') {
      filtered = filtered.slice().sort((a, b) =>
        String(b && b.name || '').localeCompare(String(a && a.name || ''), undefined, { sensitivity: 'base' })
      );
    } else {
      filtered = filtered.slice().sort((a, b) =>
        String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { sensitivity: 'base' })
      );
    }

    renderRecipeCards(cardList, filtered, recipeById, 0);
    if (emptyEl) {
      emptyEl.style.display = filtered.length ? 'none' : '';
    }
  }

  function buildBookingsRangeQuery() {
    const start = new Date();
    const end = new Date();
    start.setDate(start.getDate() - 30);
    end.setDate(end.getDate() + 60);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      fields: 'summary',
      limit: 300
    };
  }

  function loadRecipeGallery() {
    const cardList = document.getElementById('recipeCardList');
    if (!cardList) return;

    const recipeFetch = fetch('/api/recipes/display-table?fields=summary', { cache: 'no-store' })
      .then((res) => res.json())
      .catch(() => []);

    const weeklyBox = document.getElementById('weeklyRecipeBox');
    const bookingRange = buildBookingsRangeQuery();
    const bookingsFetch = weeklyBox
      ? fetch(`/api/bookings/all?start=${bookingRange.start}&end=${bookingRange.end}&fields=${bookingRange.fields}&limit=${bookingRange.limit}`, { cache: 'no-store' })
          .then((res) => res.json())
          .catch(() => ({ bookings: [] }))
      : Promise.resolve({ bookings: [] });

    Promise.all([
      refreshAuthState(),
      recipeFetch,
      bookingsFetch
    ])
      .then(([, displayRows, bookingsPayload]) => {
        const rows = (Array.isArray(displayRows) ? displayRows : [])
          .filter((row) => !isNonRecipePlannerLabel(row && row.name));
        if (rows.length === 0) return;
        const badge = document.getElementById('recipeCountBadge');
        const chips = document.getElementById('recipeCategoryChips');
        const recipeIndexSearch = document.getElementById('recipeIndexSearch');
        const recipeIndexSort = document.getElementById('recipeIndexSort');
        const recipeFilterEmpty = document.getElementById('recipeFilterEmpty');
        const weeklyDateLabel = document.getElementById('weeklyRecipeDateLabel');
        const weeklyList = document.getElementById('weeklyRecipeList');
        const weeklyEmpty = document.getElementById('weeklyRecipeEmpty');

        const recipeById = new Map();
        rows.forEach((row) => {
          const keys = [rowRecipeKey(row), String(row.id || '').trim()].filter(Boolean);
          keys.forEach((key) => recipeById.set(key, row));
        });
        const displayByRecipeId = new Map(rows.map(row => [rowRecipeKey(row), row]));
        const displayByName = new Map(rows.map(row => [String(row.name || '').trim().toLowerCase(), row]));
        const displayByNormalizedName = new Map(rows.map(row => [normalizeRecipeLookupName(row.name || ''), row]));
        const bookings = Array.isArray(bookingsPayload && bookingsPayload.bookings) ? bookingsPayload.bookings : [];

      const now = new Date();
      const weekStart = getWeekStart(now);
      const weekEnd = getWeekEnd(weekStart);

      if (weeklyDateLabel) {
        weeklyDateLabel.textContent = formatWeekRangeLabel(weekStart, weekEnd);
      }

      const featuredRows = [];
      const featuredKeys = new Set();

      bookings.forEach((booking) => {
        const bookingDate = parseBookingDate(booking && booking.booking_date);
        if (!(bookingDate instanceof Date) || Number.isNaN(bookingDate.getTime())) return;
        if (bookingDate < weekStart || bookingDate > weekEnd) return;

        const bookingRecipeName = normalizeBookingRecipeName(booking && booking.recipe);
        if (isNonRecipePlannerLabel(bookingRecipeName)) return;
        const normalizedBookingName = normalizeRecipeLookupName(bookingRecipeName);
        const byId = displayByRecipeId.get(String(booking.recipe_id || '').trim());
        const byName = displayByName.get(bookingRecipeName.toLowerCase());
        const byNormalizedName = displayByNormalizedName.get(normalizedBookingName);

        let byFuzzyName = null;
        if (!byId && !byName && !byNormalizedName && normalizedBookingName) {
          byFuzzyName = rows.find((candidate) => {
            const candidateName = normalizeRecipeLookupName(candidate && candidate.name || '');
            if (!candidateName) return false;
            return candidateName.includes(normalizedBookingName) || normalizedBookingName.includes(candidateName);
          }) || null;
        }

        const row = byId || byName || byNormalizedName || byFuzzyName;

        let featuredRow = row;
        if (!featuredRow && bookingRecipeName) {
          // Show planner-booked recipes even when they are not yet in display-table.
          featuredRow = {
            id: String(booking.recipe_id || '').trim() || '',
            recipe_id: String(booking.recipe_id || '').trim() || '',
            recipeid: String(booking.recipe_id || '').trim() || '',
            name: bookingRecipeName,
            url: String(booking.recipe_url || '').trim() || '',
            image_url: '',
            isBookingOnly: true
          };
        }
        if (!featuredRow) return;

        const key = rowRecipeKey(featuredRow) || bookingRecipeName.toLowerCase();
        if (!key || featuredKeys.has(key)) return;
        featuredKeys.add(key);
        featuredRows.push(featuredRow);
      });

      if (weeklyBox && weeklyList && weeklyEmpty) {
        if (featuredRows.length > 0) {
          weeklyBox.style.display = '';
          weeklyEmpty.style.display = 'none';
          renderRecipeCards(weeklyList, featuredRows, recipeById, 0);
        } else {
          weeklyBox.style.display = '';
          weeklyList.innerHTML = '';
          weeklyEmpty.style.display = '';
        }
      }

      const orderedRows = featuredRows.length > 0
        ? [...featuredRows, ...rows.filter(row => !featuredKeys.has(rowRecipeKey(row)))]
        : rows;

      if (badge) {
        badge.textContent = `${rows.length} recipes in the student showcase`;
      }

      if (chips) {
        const counts = rows.reduce((acc, row) => {
          const key = getDishCategory(row.name || '');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

        chips.innerHTML = Object.entries(counts)
          .filter(([name]) => name !== 'Student Favourites')
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => `<span class="recipe-chip">${name}: ${count}</span>`)
          .join('');
      }

      const refreshGallery = () => {
        applyRecipeFilters({
          cardList,
          emptyEl: recipeFilterEmpty,
          orderedRows,
          recipeById,
          sortMode: recipeIndexSort ? recipeIndexSort.value : 'az',
          searchTerm: recipeIndexSearch ? recipeIndexSearch.value : ''
        });
      };

      if (recipeIndexSearch) {
        recipeIndexSearch.addEventListener('input', refreshGallery);
      }

      if (recipeIndexSort) {
        recipeIndexSort.addEventListener('change', refreshGallery);
      }

      refreshGallery();
    })
    .catch((error) => {
      console.error('[Recipe Book] Failed to initialise gallery data:', error);
    });
  }

  function startLazyGalleryLoad() {
    const cardList = document.getElementById('recipeCardList');
    if (!cardList) return;

    const runLoad = () => {
      if (document.visibilityState === 'hidden') {
        setTimeout(runLoad, 1500);
        return;
      }
      loadRecipeGallery();
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runLoad, { timeout: 4000 });
    } else {
      setTimeout(runLoad, 600);
    }
  }

  startLazyGalleryLoad();

  document.addEventListener('click', toggleInlineLoginFromNavbar);

  ['heroSuggestRecipeButton', 'heroSuggestRecipeButtonHero'].forEach(function(id) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', toggleInlineSuggestPanel);
  });
});
