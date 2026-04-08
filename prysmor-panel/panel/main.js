'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────

const SITE_URL  = 'https://prysmor.io';
// API_BASE: localhost for dev, production domain when deployed.
// Change this single line before shipping a new panel build.
const API_BASE  = 'https://prysmor-io.vercel.app';
const POLL_MS         = 3500;
const POLL_MS_SLOW    = 10000;              // slower after 10 min
const MAX_POLL_MS     = 40 * 60 * 1000;    // 40 min hard timeout
const SOFT_TIMEOUT_MS = 10 * 60 * 1000;    // at 10 min switch to slow polling

// Auth polling
const AUTH_POLL_MS  = 2500;  // how often to check if browser auth completed
const AUTH_MAX_MS   = 5 * 60 * 1000; // 5 min before code expires

// Generation status labels by elapsed time (no vendor names)
const GEN_STATUS_LABELS = [
  { after:   0, text: 'Starting generation…'                  },
  { after:  10, text: 'Preparing your clip…'                  },
  { after:  30, text: 'Queued for processing…'                },
  { after:  90, text: 'Effect generation in progress…'        },
  { after: 180, text: 'Still working — complex effects take time…' },
  { after: 300, text: 'Almost there, processing your effect…'      },
];


// LocalStorage keys
const LS_TOKEN          = 'prysmor_token';
const LS_USER_ID        = 'prysmor_user_id';
const LS_PLAN           = 'prysmor_plan';
const LS_PLAN_LABEL     = 'prysmor_plan_label';
const LS_TOKEN_EXP      = 'prysmor_token_exp';

// ─── Reference Frame Store ────────────────────────────────────────────────────
// Captured once when a clip is loaded; reused by Enhance and Generate.
var storedReferenceFrame = null;
// { width: number, height: number } — from the same video element, used for
// aspect ratio validation before the S3 upload starts.
var storedVideoInfo = null;

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  usage:        { credits: 0, creditsTotal: 1000 },
  settingsOpen: false,
  _extRoot:     '',
  auth: {
    token:         null,
    userId:        null,
    plan:          null,
    planLabel:     null,
    authPollTimer: null,
    authPollStart: 0,
    deviceCode:    null,
    heartbeatTimer: null,
  },
  mf: {
    jobId:          null,
    selInfo:        null,   // {startTimeSec, durationSec, sourcePath, clipName}
    replaceMode:    false,
    pollTimer:      null,
    pollStart:      0,
    outputUrl:      null,
    rawOutputUrl:   null,   // raw Runway output (pre-identity-lock)
    outputPath:     null,
    tempDir:        '',
    generating:     false,
  }
};

// ─── CEP Interface ────────────────────────────────────────────────────────────

let cs;

function initCS() {
  try {
    cs = new CSInterface();
  } catch (_) {
    cs = {
      evalScript:              function (s, cb)  { if (cb) cb('error: not in CEP'); },
      openURLInDefaultBrowser: function (url)    { window.open(url, '_blank'); },
      getHostEnvironment:      function ()       { return { appName: 'PPRO', appVersion: '0.0' }; },
      getSystemPath:           function ()       { return ''; }
    };
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', function () {
  initCS();
  try {
    const raw = cs.getSystemPath(SystemPath.EXTENSION) || '';
    state._extRoot = raw.replace(/\\/g, '/').replace(/\/$/, '');
  } catch (_) {}
  bindEvents();
  // Try to restore saved session — validate against server before showing main view
  if (restoreSession()) {
    validateSessionThenEnter();
  } else {
    showView('login');
  }
});

// ─── Session persistence ─────────────────────────────────────────────────────

function restoreSession() {
  try {
    const token   = localStorage.getItem(LS_TOKEN);
    const exp     = parseInt(localStorage.getItem(LS_TOKEN_EXP) || '0', 10);
    const userId  = localStorage.getItem(LS_USER_ID);
    const plan    = localStorage.getItem(LS_PLAN);
    const planLabel = localStorage.getItem(LS_PLAN_LABEL);
    if (!token || !userId || Date.now() > exp) return false;
    state.auth.token     = token;
    state.auth.userId    = userId;
    state.auth.plan      = plan;
    state.auth.planLabel = planLabel;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Validates the locally-restored session against the server before entering the panel.
 * If the token has expired on the server, the user is sent back to the login view
 * immediately rather than seeing the panel briefly and then being kicked out.
 */
async function validateSessionThenEnter() {
  try {
    var res = await fetch(API_BASE + '/api/v1/motionforge/credits', {
      headers: apiHeaders(),
    });
    if (res.status === 401) {
      clearSession();
      showView('login');
      setLoginStatus('Your session expired — please sign in again.', true);
      return;
    }
    var data = res.ok ? await res.json().catch(function () { return {}; }) : {};
    if (res.ok && typeof data.credits === 'number') {
      state.usage.credits      = data.credits;
      state.usage.creditsTotal = data.creditsTotal || 1000;
    }
  } catch (_) {
    // Network error — allow panel to load anyway, fetchCredits will retry
  }
  enterPanel();
}

function saveSession(token, userId, plan, planLabel) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  try {
    localStorage.setItem(LS_TOKEN,      token);
    localStorage.setItem(LS_USER_ID,    userId);
    localStorage.setItem(LS_PLAN,       plan);
    localStorage.setItem(LS_PLAN_LABEL, planLabel);
    localStorage.setItem(LS_TOKEN_EXP,  String(exp));
  } catch (_) {}
  state.auth.token     = token;
  state.auth.userId    = userId;
  state.auth.plan      = plan;
  state.auth.planLabel = planLabel;
}

function clearSession() {
  try {
    [LS_TOKEN, LS_USER_ID, LS_PLAN, LS_PLAN_LABEL, LS_TOKEN_EXP]
      .forEach(function (k) { localStorage.removeItem(k); });
  } catch (_) {}
  state.auth.token     = null;
  state.auth.userId    = null;
  state.auth.plan      = null;
  state.auth.planLabel = null;
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

/**
 * Starts the browser-based OAuth-style auth flow:
 * 1. Gets a deviceCode from the server
 * 2. Opens /panel-auth?code=XXX in the browser
 * 3. Polls until the user completes auth in the browser
 */
async function startLogin() {
  var btn = el('btn-continue');
  btn.disabled = true;
  btn.textContent = 'Opening browser…';
  setLoginStatus('Opening browser for sign in…', false);

  try {
    // Collect device diagnostics to send with the auth request
    var hostEnv = {};
    try { hostEnv = cs.getHostEnvironment() || {}; } catch (_) {}

    var cepVer = '—';
    try {
      if (typeof __adobe_cep__ !== 'undefined' && __adobe_cep__.getCurrentApiVersion) {
        var v = __adobe_cep__.getCurrentApiVersion();
        if (v) cepVer = (v.major || '') + (v.minor !== undefined ? '.' + v.minor : '');
      }
    } catch (_) {}

    var osName = navigator.platform || 'Unknown';
    if (osName.toLowerCase().indexOf('win') !== -1)  osName = 'Windows';
    else if (osName.toLowerCase().indexOf('mac') !== -1) osName = 'macOS';

    var appName    = hostEnv.appName    || 'Adobe Premiere Pro';
    var appVersion = hostEnv.appVersion || '—';
    var deviceLabel = appName + ' ' + appVersion + ' · ' + osName;

    var res = await fetch(API_BASE + '/api/panel/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform:       osName,
        hostApp:        appName,
        hostAppVersion: appVersion,
        cepVersion:     cepVer,
        deviceName:     deviceLabel,
      }),
    });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || 'Server error (HTTP ' + res.status + ')');

    state.auth.deviceCode = data.deviceCode;
    // Open pairing URL — try multiple methods for CEP compatibility
    var opened = false;
    try { cs.openURLInDefaultBrowser(data.pairingUrl); opened = true; } catch (_) {}
    if (!opened) {
      // CEP 12 fallback: ExtendScript app.openURLInBrowser
      var escapedUrl = data.pairingUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      cs.evalScript('app.openURLInBrowser("' + escapedUrl + '")', function() {});
    }
    setLoginStatus('Complete sign in in your browser, then come back.', false);
    btn.textContent = 'Waiting for browser…';
    startAuthPolling(data.deviceCode);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Sign In';
    setLoginStatus('Error: ' + (err.message || 'Could not connect to server.'), true);
  }
}

function startAuthPolling(deviceCode) {
  stopAuthPolling();
  state.auth.authPollStart = Date.now();

  state.auth.authPollTimer = setInterval(async function () {
    // Expire after AUTH_MAX_MS
    if (Date.now() - state.auth.authPollStart > AUTH_MAX_MS) {
      stopAuthPolling();
      var btn = el('btn-continue');
      btn.disabled = false;
      btn.textContent = 'Sign In';
      setLoginStatus('Authorization timed out. Please try again.', true);
      return;
    }

    try {
      var res = await fetch(API_BASE + '/api/panel/auth/poll?code=' + deviceCode);
      var data = null;
      try { data = await res.json(); } catch (_) {}
      if (!data) return; // network hiccup

      if (data.status === 'authorized') {
        stopAuthPolling();
        saveSession(data.token, data.userId, data.plan, data.planLabel);
        setLoginStatus('', false);
        enterPanel();
      } else if (data.status === 'expired') {
        stopAuthPolling();
        var btn = el('btn-continue');
        btn.disabled = false;
        btn.textContent = 'Sign In';
        setLoginStatus('Code expired. Please try again.', true);
      }
      // status === 'pending' → keep polling
    } catch (_) {
      // network hiccup — keep polling
    }
  }, AUTH_POLL_MS);
}

function stopAuthPolling() {
  if (state.auth.authPollTimer) {
    clearInterval(state.auth.authPollTimer);
    state.auth.authPollTimer = null;
  }
}

function setLoginStatus(msg, isError) {
  var el2 = el('login-status');
  if (!el2) return;
  el2.textContent = msg;
  el2.style.display = msg ? '' : 'none';
  el2.style.color = isError ? '#F87171' : '#A3FF12';
}

function sendHeartbeat() {
  if (!state.auth.token) return;
  fetch(API_BASE + '/api/panel/heartbeat', {
    method: 'POST',
    headers: apiHeaders(),
  }).catch(function () {}); // fire-and-forget
}

function startHeartbeat() {
  stopHeartbeat();
  sendHeartbeat(); // immediate ping
  // Repeat every 4 minutes so the 30-min window always stays fresh
  state.auth.heartbeatTimer = setInterval(sendHeartbeat, 4 * 60 * 1000);
}

function stopHeartbeat() {
  if (state.auth.heartbeatTimer) {
    clearInterval(state.auth.heartbeatTimer);
    state.auth.heartbeatTimer = null;
  }
}

function enterPanel() {
  // Update plan label in topbar if element exists
  var planEl = el('topbar-plan');
  if (planEl && state.auth.planLabel) {
    planEl.textContent = state.auth.planLabel;
    planEl.style.display = '';
  }

  showView('main');

  // Render credits immediately if pre-loaded by validateSessionThenEnter()
  if (state.usage.credits > 0 || state.usage.creditsTotal !== 1000) {
    renderUsage();
    updateCostPreview();
  }

  // Start heartbeat — keeps device "Online" in dashboard
  startHeartbeat();

  // Fetch credit balance to keep it fresh
  fetchCredits();

  // Resolve system temp dir
  cs.evalScript('getTempDir()', function (res) {
    if (res && res.indexOf('error') !== 0) {
      state.mf.tempDir = res.replace(/\\/g, '/').replace(/\/$/, '');
    }
  });
  // Try to auto-load whatever is selected in Premiere right now
  refreshClip(true);

}




function logout() {
  stopMfPolling();
  stopAuthPolling();
  stopHeartbeat();

  // Revoke device + session on server so re-login never hits device_limit_reached.
  // Fire-and-forget — clear local state regardless of response.
  var tok = state.auth.token;
  if (tok) {
    fetch(API_BASE + '/api/panel/auth/logout', {
      method:  'POST',
      headers: apiHeaders(),
    }).catch(function () {});
  }

  clearSession();
  storedReferenceFrame = null;
  storedVideoInfo = null;
  state.mf = {
    jobId: null, selInfo: null, replaceMode: false,
    pollTimer: null, pollStart: 0, outputUrl: null, rawOutputUrl: null,
    outputPath: null, tempDir: '', generating: false,
  };
  var btn = el('btn-continue');
  if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  setLoginStatus('', false);
  resetUI();
  showView('login');
}

// ─── Clip Selection ───────────────────────────────────────────────────────────

/**
 * Calls ExtendScript getSelectionInfo(), updates the clip card.
 * @param {boolean} silent  — if true, don't show toast when nothing is selected
 */
function refreshClip(silent) {
  el('btn-refresh-clip').disabled = true;
  el('btn-refresh-clip').classList.add('spinning');

  cs.evalScript('getSelectionInfo()', function (raw) {
    el('btn-refresh-clip').disabled = false;
    el('btn-refresh-clip').classList.remove('spinning');

    let parsed = null;
    try { parsed = JSON.parse(raw || '{}'); } catch (_) {}

    if (!parsed || parsed.error) {
      state.mf.selInfo = null;
      storedReferenceFrame = null;
      storedVideoInfo = null;
      showClipEmpty();
      if (!silent) {
        showToast(parsed ? parsed.error : 'Could not read Premiere selection', 'error');
      }
      return;
    }

    state.mf.selInfo = parsed;
    showClipInfo(parsed);
    updateCostPreview();
    // Silently capture a reference frame in background so Enhance has it ready.
    captureClipReferenceFrame(parsed.sourcePath);
    if (!silent) {
      var dbg = parsed.debugTimes ? JSON.stringify(parsed.debugTimes) : 'n/a';
      showToast('Clip: ' + (parsed.clipName || 'clip') + ' | mediaIn=' + (parsed.mediaInSec || 0).toFixed(2) + 's | times=' + dbg, 'success');
    }
  });
}

function showClipEmpty() {
  el('clip-empty').classList.remove('hidden');
  el('clip-info').classList.add('hidden');
}

function calcCostPreview(durationSec) {
  var dur  = Math.min(durationSec || 0, 8); // Runway caps at 8s
  return Math.ceil(Math.max(dur, 1)) * 4;   // 4 credits per second
}

function updateCostPreview() {
  var costBadge    = el('gen-btn-cost');
  var costBadgeVal = el('gen-btn-cost-val');

  if (!state.mf.selInfo) {
    if (costBadge) costBadge.style.display = 'none';
    return;
  }

  var dur  = Math.min(state.mf.selInfo.durationSec || 0, 8);
  var cost = calcCostPreview(dur);
  var bal  = state.usage.credits || 0;
  var canAfford = bal >= cost;

  // Show cost on the Generate button
  if (costBadge && costBadgeVal) {
    costBadge.style.display = '';
    costBadgeVal.textContent = cost;
  }

  // Disable generate button if can't afford
  var genBtn = el('mf-btn-generate');
  if (genBtn && !state.mf.generating) {
    genBtn.disabled = !canAfford;
  }

  // Legacy hidden element (kept for compat)
  var preview = el('gen-cost-preview');
  if (preview) preview.style.display = 'none';
}

function showClipInfo(info) {
  el('clip-empty').classList.add('hidden');
  el('clip-info').classList.remove('hidden');

  const dur        = info.durationSec || 0;
  const start      = info.startTimeSec || 0;
  const willTrim   = dur > 8;
  const effectiveDur = Math.min(dur, 8);

  el('clip-name').textContent        = info.clipName || info.sourcePath.split('/').pop() || 'clip';
  el('clip-dur-badge').textContent   = dur.toFixed(1) + 's';
  el('clip-start-badge').textContent = 'starts at ' + start.toFixed(2) + 's';

  const trimBadge = el('clip-trim-badge');
  trimBadge.style.display = willTrim ? '' : 'none';

  // Show warning when clip is longer than 8s — Runway can only process 8s max
  var warnEl = el('clip-trim-warning');
  if (warnEl) {
    if (willTrim) {
      warnEl.textContent = '⚠ Clip is ' + dur.toFixed(1) + 's — only first ' + effectiveDur.toFixed(0) + 's will be processed (Runway limit). Trim your selection to max 8s for best results.';
      warnEl.style.display = '';
    } else {
      warnEl.style.display = 'none';
    }
  }
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

function apiHeaders(extra) {
  var headers = {};
  if (state.auth.token) {
    headers['Authorization'] = 'Bearer ' + state.auth.token;
  }
  return Object.assign(headers, extra || {});
}

async function apiFetch(path, options) {
  var res = await fetch(API_BASE + path,
    Object.assign({ headers: apiHeaders() }, options || {}));
  var json = await res.json().catch(function () { return { error: 'Invalid JSON' }; });
  // Session expired — force re-login
  if (res.status === 401) {
    clearSession();
    logout();
    throw new Error('Session expired — please sign in again.');
  }
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

// ─── Compile Prompt ───────────────────────────────────────────────────────────

async function compilePrompt() {
  var textarea = el('mf-prompt');
  var raw      = textarea.value.trim();
  var btn      = el('btn-compile-prompt');
  var lbl      = el('compile-label');

  // If a job exists (video uploaded), use scene-aware enhance
  if (state.mf.jobId) {
    btn.disabled    = true;
    lbl.textContent = 'Analysing…';

    try {
      // Use whatever the user typed as intent, or ask for one if empty
      var intent = raw || 'make it cinematic and dramatic';

      var enhanceBody = { intent: intent };
      if (storedReferenceFrame) enhanceBody.frameBase64 = storedReferenceFrame;
      var res = await fetch(API_BASE + '/api/v1/motionforge/jobs/' + state.mf.jobId + '/enhance-prompt', {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify(enhanceBody),
      });
      var json = await res.json().catch(function () { return {}; });

      if (res.status === 401) {
        logout();
        showToast('Session expired — please sign in again', 'error');
        return;
      }
      if (!res.ok || !json.prompt) {
        throw new Error(json.error || 'Scene analysis failed');
      }

      textarea.value = json.prompt;
      el('mf-char-count').textContent = json.prompt.length;

      var methodMsg = json.method === 'vision'
        ? '✦ Scene analysed — prompt tailored to your clip'
        : '✦ Prompt enhanced';
      showToast(methodMsg, 'success');
      textarea.focus();

    } catch (err) {
      showToast('Scene enhance failed: ' + (err.message || 'unknown error'), 'error');
    } finally {
      btn.disabled    = false;
      lbl.textContent = 'AI Enhance';
    }
    return;
  }

  // No job yet — fall back to basic text-only compile
  if (!raw) {
    showToast('Select a clip or enter a prompt first', 'error');
    textarea.focus();
    return;
  }

  btn.disabled    = true;
  lbl.textContent = 'Enhancing…';

  try {
    var res2 = await fetch(API_BASE + '/api/v1/motionforge/compile-prompt', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ prompt: raw }),
    });
    var json2 = await res2.json().catch(function () { return {}; });

    if (res2.status === 401) {
      logout();
      showToast('Session expired — please sign in again', 'error');
      return;
    }
    if (!res2.ok || !json2.compiledPrompt) {
      throw new Error(json2.error || 'Compile failed');
    }

    textarea.value = json2.compiledPrompt;
    el('mf-char-count').textContent = json2.compiledPrompt.length;
    showToast('Prompt enhanced', 'success');
    textarea.focus();

  } catch (err) {
    showToast(err.message || 'Failed to enhance prompt', 'error');
  } finally {
    btn.disabled    = false;
    lbl.textContent = 'AI Enhance';
  }
}

// ─── Reference Frame Extraction ──────────────────────────────────────────────
// Captures the middle frame of a base64-encoded MP4 as a small JPEG.
// Uses the CEP browser's native <video> + <canvas> APIs — no ffmpeg needed.
// Returns null silently on any error so generation always proceeds.

// Returns { frameBase64: string|null, width: number, height: number }
// so callers can both get the JPEG frame AND know the video dimensions
// without a second decode pass.
function captureReferenceFrame(videoBase64) {
  return new Promise(function (resolve) {
    var empty = { frameBase64: null, width: 0, height: 0 };
    try {
      var blob  = base64ToBlob(videoBase64, 'video/mp4');
      var url   = URL.createObjectURL(blob);
      var video = document.createElement('video');
      video.muted   = true;
      video.preload = 'metadata';

      video.onloadedmetadata = function () {
        // Seek to the midpoint for a representative identity frame
        video.currentTime = Math.max(0, Math.min(video.duration / 2, video.duration - 0.1));
      };

      video.onseeked = function () {
        try {
          var vw = video.videoWidth  || 0;
          var vh = video.videoHeight || 0;
          var W  = 320;
          var H  = Math.round(W * vh / Math.max(vw, 1));
          var canvas = document.createElement('canvas');
          canvas.width  = W;
          canvas.height = H || W; // fallback square if height is 0
          canvas.getContext('2d').drawImage(video, 0, 0, W, canvas.height);
          URL.revokeObjectURL(url);
          // Strip the data URI prefix — backend expects raw base64
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          var frameBase64 = dataUrl.indexOf(',') !== -1 ? dataUrl.split(',')[1] : null;
          resolve({ frameBase64: frameBase64, width: vw, height: vh });
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(empty);
        }
      };

      video.onerror = function () { URL.revokeObjectURL(url); resolve(empty); };

      // Timeout safety — if video never loads, don't stall the pipeline
      setTimeout(function () { URL.revokeObjectURL(url); resolve(empty); }, 8000);

      video.src = url;
    } catch (e) {
      resolve(empty);
    }
  });
}

// Reads the clip file and captures a reference frame + video dimensions,
// storing them in storedReferenceFrame and storedVideoInfo.
// Uses sequence dimensions (from state.mf.selInfo) for aspect ratio checking
// when available — the sequence output resolution is what matters for Runway,
// not the raw source file resolution.
// Runs silently in the background — any error leaves both as null.
async function captureClipReferenceFrame(sourcePath) {
  storedReferenceFrame = null;
  storedVideoInfo = null;
  try {
    var fileBase64 = await readFileBase64(sourcePath);
    var result = await captureReferenceFrame(fileBase64);
    storedReferenceFrame = result.frameBase64;

    if (result.width && result.height) {
      // Start with source-file dimensions as the baseline
      storedVideoInfo = { width: result.width, height: result.height };
      console.log('[Prysmor:aspectRatio] source file dimensions: ' +
        result.width + 'x' + result.height +
        ' ratio=' + (result.width / result.height).toFixed(4));

      // Prefer sequence dimensions: the export always matches the sequence,
      // not the raw source. A 2.66:1 source clip in a 16:9 sequence is fine.
      var seqW = state.mf.selInfo && state.mf.selInfo.seqWidth;
      var seqH = state.mf.selInfo && state.mf.selInfo.seqHeight;
      if (seqW && seqH) {
        var seqRatio = seqW / seqH;
        console.log('[Prysmor:aspectRatio] sequence dimensions: ' +
          seqW + 'x' + seqH + ' ratio=' + seqRatio.toFixed(4));
        if (seqRatio <= 2.358) {
          storedVideoInfo = { width: seqW, height: seqH };
          console.log('[Prysmor:aspectRatio] using SEQUENCE dimensions for aspect ratio check');
        } else {
          console.warn('[Prysmor:aspectRatio] sequence ratio ' + seqRatio.toFixed(4) +
            ' also exceeds 2.358 — keeping source dimensions');
        }
      } else {
        console.log('[Prysmor:aspectRatio] no sequence dimensions available — using source file dimensions');
      }

      var finalRatio = storedVideoInfo.width / storedVideoInfo.height;
      console.log('[Prysmor:aspectRatio] final storedVideoInfo: ' +
        storedVideoInfo.width + 'x' + storedVideoInfo.height +
        ' ratio=' + finalRatio.toFixed(4) +
        ' exceeds2.358=' + (finalRatio > 2.358));
    } else {
      console.warn('[Prysmor:aspectRatio] captureReferenceFrame returned no dimensions — ' +
        'width=' + result.width + ' height=' + result.height);
    }
  } catch (err) {
    console.error('[Prysmor:aspectRatio] captureClipReferenceFrame threw:', err);
    storedReferenceFrame = null;
    storedVideoInfo = null;
  }
}

// ─── Main Generate Pipeline ───────────────────────────────────────────────────

async function mfGenerate() {
  const prompt      = el('mf-prompt').value.trim();
  const replaceMode = el('mf-replace-toggle').checked;

  // Guard: must have clip
  if (!state.mf.selInfo) {
    showToast('No clip selected — click a clip in the timeline and press Refresh', 'error');
    return;
  }

  // Guard: must have prompt
  if (!prompt) {
    showToast('Enter a prompt to describe the transformation', 'error');
    el('mf-prompt').focus();
    return;
  }

  // Guard: aspect ratio check — Runway Gen-4 rejects width/height > 2.358
  console.log('[Prysmor:aspectRatio] mfGenerate guard check — storedVideoInfo:', JSON.stringify(storedVideoInfo));
  if (!storedVideoInfo) {
    showToast('Please wait, clip is still loading…', 'error');
    return;
  }
  if (storedVideoInfo.width && storedVideoInfo.height) {
    var aspectRatio = storedVideoInfo.width / storedVideoInfo.height;
    console.log('[Prysmor:aspectRatio] ratio=' + aspectRatio.toFixed(4) + ' blocked=' + (aspectRatio > 2.358));
    if (aspectRatio > 2.358) {
      showToast(
        'Video is too wide (' + aspectRatio.toFixed(2) + ':1). ' +
        'Please crop to 16:9 in Premiere first.',
        'error'
      );
      return;
    }
  }

  state.mf.replaceMode = replaceMode;
  hideNoCreditsMessage();
  var costPrev = el('gen-cost-preview');
  if (costPrev) costPrev.style.display = 'none';
  setGenerating(true);
  setStatus('Starting…', 5);

  // ── Step 1: Create job (deducts credits atomically on server) ────────────
  let jobId;
  try {
    var clipDurSec = (state.mf.selInfo && state.mf.selInfo.durationSec) || 8;
    const created = await apiFetch('/api/v1/motionforge/jobs', {
      method:  'POST',
      headers: apiHeaders({
        'Content-Type':    'application/json',
        'X-Clip-Duration': clipDurSec.toFixed(6),
      }),
      body: JSON.stringify({ userId: state.auth.userId }),
    });
    jobId = created.jobId;
    state.mf.jobId = jobId;
    // Live-update credit balance from server response
    if (typeof created.creditsRemaining === 'number') {
      state.usage.credits = created.creditsRemaining;
      renderUsage();
    }
  } catch (err) {
    // Distinguish "out of credits" from generic errors
    if (err.message && err.message.toLowerCase().indexOf('insufficient') !== -1) {
      setGenerating(false);
      showNoCreditsMessage();
      return;
    }
    return fail('Failed to create job: ' + err.message);
  }

  var mediaInSec = parseFloat((state.mf.selInfo.mediaInSec || 0).toFixed(6));
  var clipDurSec = parseFloat((state.mf.selInfo.durationSec || 8).toFixed(6));
  var sourcePath = state.mf.selInfo.sourcePath;

  // ── Step 2: Get Runway pre-signed upload URL ──────────────────────────────
  setStatus('Preparing upload…', 12);
  var uploadSlot;
  try {
    uploadSlot = await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/upload-url');
  } catch (err) {
    return fail('Upload init failed: ' + err.message);
  }


    // Fallback: read full file in browser and upload to S3 directly
    setStatus('Reading clip…', 20);
    var fileBase64;
    try {
      fileBase64 = await readFileBase64(sourcePath);
    } catch (err) {
      return fail('Cannot read clip: ' + err.message);
    }

    // Extract a reference frame for identity conditioning while upload runs.
    // Runs concurrently with the S3 upload — failure is silent (returns null).
    // captureReferenceFrame now returns { frameBase64, width, height }.
    var referenceFramePromise = captureReferenceFrame(fileBase64);

    setStatus('Uploading clip…', 28);
    try {
      var blob = base64ToBlob(fileBase64, 'video/mp4');
      var formData = new FormData();
      var fields = uploadSlot.fields || {};
      Object.keys(fields).forEach(function (k) { formData.append(k, fields[k]); });
      formData.append('file', blob, 'clip.mp4');

      var s3Res = await fetch(uploadSlot.uploadUrl, { method: 'POST', body: formData });
      if (!s3Res.ok && s3Res.status !== 204) {
        var errText = await s3Res.text().catch(function () { return ''; });
        throw new Error('S3 upload HTTP ' + s3Res.status + (errText ? ': ' + errText.slice(0, 120) : ''));
      }
    } catch (err) {
      return fail('Upload failed: ' + err.message);
    }

  // ── Step 4: Notify server that upload is complete ─────────────────────────
  setStatus('Uploading clip…', 36);
  try {
    await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/upload-complete', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({
        runwayUri:  uploadSlot.runwayUri,
        mediaInSec: mediaInSec,
        clipDurSec: clipDurSec,
      }),
    });
  } catch (err) {
    return fail('Upload confirm failed: ' + err.message);
  }

  // ── Step 4: Start AI generation ──────────────────────────────────────────
  setStatus('Starting effect generation…', 38);
  // Await the reference frame (likely already done — started during S3 upload)
  var frameResult = await referenceFramePromise.catch(function () { return { frameBase64: null, width: 0, height: 0 }; });
  var referenceFrameBase64 = frameResult ? frameResult.frameBase64 : null;
  try {
    var genBody = { prompt: prompt };
    if (referenceFrameBase64) genBody.referenceFrameBase64 = referenceFrameBase64;
    // Send the effective dimensions used for aspect ratio checking (sequence dims
    // when available, source file dims otherwise) so the server can validate too.
    if (storedVideoInfo && storedVideoInfo.width && storedVideoInfo.height) {
      genBody.videoWidth  = storedVideoInfo.width;
      genBody.videoHeight = storedVideoInfo.height;
    }
    await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/generate', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify(genBody),
    });
  } catch (err) {
    return fail('Generation failed to start: ' + err.message);
  }

  // ── Step 5: Poll until done ───────────────────────────────────────────────
  setStatus('Effect generation started…', 40);
  state.mf.pollStart = Date.now();
  startPolling(jobId);
}

function getGenStatusLabel(elapsedSec) {
  var label = GEN_STATUS_LABELS[0].text;
  for (var i = 0; i < GEN_STATUS_LABELS.length; i++) {
    if (elapsedSec >= GEN_STATUS_LABELS[i].after) label = GEN_STATUS_LABELS[i].text;
  }
  return label;
}

function startPolling(jobId) {
  stopMfPolling();
  var pollErrors = 0;
  state.mf.pollActive = true;

  async function doPoll() {
    if (!state.mf.pollActive) return;

    var elapsedMs  = Date.now() - state.mf.pollStart;
    var elapsedSec = Math.floor(elapsedMs / 1000);
    var mins = Math.floor(elapsedSec / 60);
    var secs = elapsedSec % 60;
    var elapsed = mins > 0 ? mins + 'm ' + String(secs).padStart(2,'0') + 's' : secs + 's';
    var nextInterval = elapsedMs > SOFT_TIMEOUT_MS ? POLL_MS_SLOW : POLL_MS;

    // Hard timeout: one final check then give up
    if (elapsedMs > MAX_POLL_MS) {
      setStatus('Checking if generation finished\u2026', 99, elapsed);
      try {
        var finalJob = await apiFetch('/api/v1/motionforge/jobs/' + jobId);
        if (finalJob.status === 'completed' && finalJob.outputUrl) {
          return handleJobComplete(finalJob, jobId);
        }
      } catch (_) {}
      return fail('Generation timed out after 40 min. Try again.');
    }

    // Fetch job status
    let job;
    try {
      job = await apiFetch('/api/v1/motionforge/jobs/' + jobId);
      pollErrors = 0;
      console.log('[Prysmor] poll result:', job.status, 'progress:', job.progress,
        job.outputUrl ? 'outputUrl:' + job.outputUrl.slice(0, 80) : '',
        job.error ? 'error:' + job.error : '');
    } catch (err) {
      pollErrors++;
      console.warn('[Prysmor] poll #' + pollErrors + ' threw:', err.message);
      var lastPct = state.mf.lastKnownPct || 42;
      setStatus(getGenStatusLabel(elapsedSec), lastPct, elapsed);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'generating') {
      var runwayPct = job.progress || 0;
      var pct, label;
      if (runwayPct > 0) {
        pct   = 40 + Math.round(runwayPct * 0.56);
        label = 'Generating\u2026 ' + runwayPct + '%';
      } else {
        pct   = 40 + Math.min(Math.round(elapsedSec * 0.08), 15);
        label = getGenStatusLabel(elapsedSec);
      }
      state.mf.lastKnownPct = pct;
      setStatus(label, pct, elapsed);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'compositing') {
      setStatus('Applying final touches\u2026', 97, elapsed);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'failed') {
      return fail(job.error || 'Generation failed.');
    }

    if (job.status === 'completed') {
      if (!job.outputUrl) {
        // Completed in Firestore but outputUrl missing — fail loudly
        console.error('[Prysmor] job COMPLETED but outputUrl is empty:', JSON.stringify(job));
        return fail('Generation finished but no output URL was returned. Please try again.');
      }
      return handleJobComplete(job, jobId);
    }

    // Any other status — keep polling but log it
    console.warn('[Prysmor] unexpected poll status "' + job.status + '" — continuing to poll');
    state.mf.pollTimer = setTimeout(doPoll, nextInterval);
  }

  async function handleJobComplete(job, jobId) {
    state.mf.outputUrl    = job.outputUrl;
    state.mf.rawOutputUrl = job.rawOutputUrl || null;
    console.log('[Prysmor] handleJobComplete — outputUrl:', job.outputUrl);

    var sel = state.mf.selInfo;

    // ── Fallback: download from URL and insert ────────────────────────────────
    setStatus('Downloading result\u2026', 98);
    try {
      console.log('[Prysmor] downloadAndInsert start:', job.outputUrl);
      await downloadAndInsert(job.outputUrl, sel ? sel.startTimeSec : 0, state.mf.replaceMode);
      console.log('[Prysmor] downloadAndInsert complete');
    } catch (err) {
      console.error('[Prysmor] downloadAndInsert threw:', err.message);
      showToast('Insert failed: ' + err.message + ' \u2014 open manually', 'error');
      try {
        var isOwnUrl = job.outputUrl.startsWith(API_BASE) || job.outputUrl.startsWith('/api/');
        var fbOpts   = isOwnUrl ? { headers: apiHeaders() } : {};
        var fbRes    = await fetch(job.outputUrl, fbOpts);
        if (fbRes.ok) {
          showResult(URL.createObjectURL(await fbRes.blob()));
        } else {
          showResult(job.outputUrl);
        }
      } catch (fbErr) {
        showResult(job.outputUrl);
      }
    }

    fetchCredits();
    setGenerating(false);
  }

  // setTimeout not setInterval: next poll fires only AFTER current one fully
  // completes, preventing concurrent overlapping Runway API calls.
  state.mf.pollTimer = setTimeout(doPoll, POLL_MS);
}

function stopMfPolling() {
  state.mf.pollActive = false;
  if (state.mf.pollTimer) { clearTimeout(state.mf.pollTimer); state.mf.pollTimer = null; }
}

// ─── Download & Insert into Premiere ─────────────────────────────────────────

async function downloadAndInsert(outputUrl, startTimeSec, replaceMode) {
  console.log('[Prysmor] downloadAndInsert — url:', outputUrl);

  // Runway output URLs are public S3/CDN presigned URLs — do NOT send auth headers
  // (extra Authorization header invalidates S3 presigned signatures)
  const isOwnApi  = outputUrl.startsWith(API_BASE) || outputUrl.startsWith('/api/');
  var _dlCtrl  = new AbortController();
  var _dlTimer = setTimeout(function () { _dlCtrl.abort(); }, 120000);
  const fetchOpts = isOwnApi
    ? { headers: apiHeaders(), signal: _dlCtrl.signal }
    : { signal: _dlCtrl.signal };

  console.log('[Prysmor] fetch start (isOwnApi=' + isOwnApi + ')');
  const res = await fetch(outputUrl, fetchOpts).finally(function () { clearTimeout(_dlTimer); });
  console.log('[Prysmor] fetch response HTTP', res.status, res.ok ? 'OK' : 'FAIL');
  if (!res.ok) throw new Error('Download HTTP ' + res.status);

  const arrayBuf = await res.arrayBuffer();
  console.log('[Prysmor] downloaded', arrayBuf.byteLength, 'bytes');
  const buffer   = new Uint8Array(arrayBuf);

  // Always create a blob URL for in-panel preview — this works in all CEP versions
  // because blob:// is same-origin and needs no auth headers.
  var blobUrl = null;
  try {
    blobUrl = URL.createObjectURL(new Blob([arrayBuf], { type: 'video/mp4' }));
  } catch (_) {}

  // ── Try to write to disk and insert into Premiere ─────────────────────────
  var hasCepFs = !!(window.cep && window.cep.fs);

  if (!hasCepFs) {
    // cep.fs unavailable — show preview only, can't insert without disk access
    setStatus('Done — preview ready', 100);
    showResult(blobUrl || outputUrl);
    showToast('Preview ready. cep.fs not available — insert manually via Insert on V2 button.', 'info');
    return;
  }

  const tmpDir  = state.mf.tempDir || (state._extRoot + '/panel/temp');
  const outPath = tmpDir + '/mf-output-' + Date.now() + '.mp4';
  console.log('[Prysmor] writing to disk:', outPath);

  // Use string literal 'Base64' — avoids crashes when cep.encoding is undefined
  // in some CEP 12 / Premiere 2025 builds
  var base64enc = 'Base64';
  try { if (window.cep.encoding && window.cep.encoding.Base64) base64enc = window.cep.encoding.Base64; } catch (_) {}

  const base64 = uint8ToBase64(buffer);
  const wr     = window.cep.fs.writeFile(outPath, base64, base64enc);
  console.log('[Prysmor] writeFile err:', wr.err, '(0 = success)');

  if (wr.err !== 0) {
    showResult(blobUrl || outputUrl);
    throw new Error('Could not save to disk (cep.fs err=' + wr.err + ', path=' + outPath + '). Preview shown — use Insert button to retry.');
  }

  state.mf.outputPath = outPath;
  const esc = outPath.replace(/\\/g, '/').replace(/"/g, '\\"');

  setStatus(replaceMode ? 'Replacing original\u2026' : 'Inserting on V2\u2026', 98);
  console.log('[Prysmor] evalScript', replaceMode ? 'replaceSelection' : 'insertClipOnV2',
    'path:', outPath, 'startTimeSec:', startTimeSec);

  await new Promise(function (resolve) {
    const fn = replaceMode
      ? 'replaceSelection("' + esc + '")'
      : 'insertClipOnV2("' + esc + '", ' + startTimeSec + ')';

    cs.evalScript(fn, function (r) {
      console.log('[Prysmor] evalScript result:', r);
      if (r && r.indexOf('error') === 0) {
        showToast(r.replace('error: ', ''), 'error');
      } else {
        showToast(replaceMode
          ? 'Original replaced with AI result!'
          : 'AI clip inserted on V2 \u2014 aligned to selection!', 'success');
      }
      resolve();
    });
  });

  setStatus('Done!', 100);
  console.log('[Prysmor] insert done, showing result');
  showResult(blobUrl || ('file:///' + outPath.replace(/\\/g, '/').replace(/^\//, '')));
}


// ─── UI State Helpers ─────────────────────────────────────────────────────────

function setGenerating(active) {
  state.mf.generating = active;
  const btn = el('mf-btn-generate');
  if (btn) { btn.disabled = active; btn.style.display = active ? 'none' : ''; }
  var costBadge = el('gen-btn-cost');
  if (costBadge && active) costBadge.style.display = 'none';
  const gs = el('mf-gen-state');
  if (gs) gs.classList.toggle('hidden', !active);
  const rs = el('mf-section-result');
  if (rs && active) rs.classList.add('hidden');
  if (active) {
    const bar = el('mf-gen-bar');
    if (bar) bar.style.width = '0%';
    // Reset stage indicators
    setStage('upload');
    var pctLbl = el('mf-gen-pct'); if (pctLbl) pctLbl.textContent = '0%';
    var elapsed2 = el('mf-gen-elapsed'); if (elapsed2) elapsed2.classList.remove('visible');
  }
  if (!active) updateCostPreview();
}

function setStage(stage) {
  // stage: 'upload' | 'generate' | 'done'
  var stages = ['upload', 'generate', 'done'];
  var activeIdx = stages.indexOf(stage);
  stages.forEach(function(s, i) {
    var el2 = el('gs-' + s);
    if (!el2) return;
    el2.classList.remove('active', 'done');
    if (i < activeIdx)       el2.classList.add('done');
    else if (i === activeIdx) el2.classList.add('active');
  });
  // Lines
  var line1 = el('gs-line-1');
  var line2 = el('gs-line-2');
  if (line1) line1.classList.toggle('done', activeIdx > 0);
  if (line2) line2.classList.toggle('done', activeIdx > 1);
}

function setStatus(text, pct, elapsed) {
  const t = el('mf-status-text'); if (t) t.textContent = text;
  const b = el('mf-gen-bar');
  const clamped = pct != null ? Math.min(Math.max(pct, 0), 100) : null;
  if (b && clamped != null) b.style.width = clamped + '%';
  const pctLbl = el('mf-gen-pct');
  if (pctLbl && clamped != null) pctLbl.textContent = Math.round(clamped) + '%';
  const elapsedEl = el('mf-gen-elapsed');
  if (elapsedEl) {
    if (elapsed) { elapsedEl.textContent = elapsed; elapsedEl.classList.add('visible'); }
    else { elapsedEl.classList.remove('visible'); }
  }
  // Auto-update stage based on %
  if (clamped != null) {
    if (clamped < 38)      setStage('upload');
    else if (clamped < 97) setStage('generate');
    else                   setStage('done');
  }
}

function fail(msg) {
  stopMfPolling();
  setGenerating(false);
  showToast(msg, 'error');
}

function showResult(videoUrl) {
  var sec = el('mf-section-result');
  if (!sec) return;
  sec.classList.remove('hidden');
  var vid = el('mf-result-video');
  if (vid) { vid.src = videoUrl; vid.load(); vid.play && vid.play().catch(function () {}); }
  var chip = el('mf-insert-chip');
  if (chip) chip.textContent = state.mf.replaceMode ? 'Replaced original' : 'Inserted on V2';
  // Show/hide "View Raw Runway Output" button
  var rawBtn = el('mf-btn-raw-output');
  if (rawBtn) rawBtn.style.display = state.mf.rawOutputUrl ? '' : 'none';
  sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetUI() {
  setGenerating(false);
  setStatus('Ready', 0);
  showClipEmpty();
  const rs = el('mf-section-result'); if (rs) rs.classList.add('hidden');
  const p  = el('mf-prompt');         if (p) p.value = '';
  const cc = el('mf-char-count');     if (cc) cc.textContent = '0';
}

// ─── File I/O Helpers ─────────────────────────────────────────────────────────

function readFileBase64(absPath) {
  return new Promise(function (resolve, reject) {
    if (!window.cep || !window.cep.fs) {
      return reject(new Error('cep.fs not available — run inside Premiere'));
    }
    // window.cep.encoding.Base64 may be undefined on some CEP builds — fall back to string literal
    var enc = 'Base64';
    try { if (window.cep.encoding && window.cep.encoding.Base64) enc = window.cep.encoding.Base64; } catch (_) {}
    const r = window.cep.fs.readFile(absPath, enc);
    if (r.err !== 0) return reject(new Error('Read error ' + r.err + ' for: ' + absPath));
    resolve(r.data);
  });
}

function base64ToBlob(b64, mime) {
  // cep.fs.readFile may wrap base64 in \r\n every 76 chars (MIME style).
  // atob() in older Chromium (CEP) rejects any non-base64 character including whitespace.
  var cleanB64 = (b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const bin  = atob(cleanB64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function uint8ToBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.byteLength; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fileExistsSync(p) {
  if (!p || !window.cep || !window.cep.fs) return null;
  try { return window.cep.fs.stat(p).err === 0; } catch (_) { return null; }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

function buildDiagJson() {
  let hostEnv = {};
  try { hostEnv = cs.getHostEnvironment() || {}; } catch (_) {}
  return JSON.stringify({
    timestamp:  new Date().toISOString(),
    extRoot:    state._extRoot || null,
    host:       { appName: hostEnv.appName, appVersion: hostEnv.appVersion },
    runtime:    { inCEP: typeof __adobe_cep__ !== 'undefined', cepFs: !!(window.cep && window.cep.fs) },
    motionforge: { jobId: state.mf.jobId, selInfo: state.mf.selInfo, outputUrl: state.mf.outputUrl },
  }, null, 2);
}

function populateDiagnostics() {
  let hostEnv = {};
  try { hostEnv = cs.getHostEnvironment() || {}; } catch (_) {}

  el('diag-root').textContent = state._extRoot || '(not in CEP)';
  el('diag-host').textContent = (hostEnv.appName || '—') + ' ' + (hostEnv.appVersion || '');
  el('diag-jobid').textContent = state.mf.jobId || '—';

  const inCEP = typeof __adobe_cep__ !== 'undefined';
  const cepEl = el('diag-cep');
  cepEl.textContent = inCEP ? '✓ Active' : '✕ Not in CEP';
  cepEl.className   = 'diag-status ' + (inCEP ? 'ok' : 'err');

  const hasCFs  = !!(window.cep && window.cep.fs);
  const fsEl    = el('diag-cepfs');
  fsEl.textContent = hasCFs ? '✓ Available' : '✕ Unavailable';
  fsEl.className   = 'diag-status ' + (hasCFs ? 'ok' : 'err');

  // Ping backend
  const bkEl = el('diag-backend');
  bkEl.textContent = 'Checking…';
  bkEl.className   = 'diag-status';
  var _diagCtrl = new AbortController();
  setTimeout(function () { _diagCtrl.abort(); }, 4000);
  fetch(API_BASE + '/api/v1/motionforge/jobs', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId: 'diag-ping' }),
    signal: _diagCtrl.signal,
  }).then(function (r) {
    bkEl.textContent = r.ok || r.status === 201 ? '✓ Online' : '✕ HTTP ' + r.status;
    bkEl.className   = 'diag-status ' + (r.status === 201 ? 'ok' : 'err');
  }).catch(function () {
    bkEl.textContent = '✕ Offline — run npm dev';
    bkEl.className   = 'diag-status err';
  });
}

function toggleDiagnostics() {
  const panel     = el('diag-panel');
  const label     = el('btn-diagnostics-label');
  const nowHidden = panel.classList.toggle('hidden');
  if (nowHidden) { label.textContent = 'Diagnostics'; }
  else           { populateDiagnostics(); label.textContent = 'Hide Diagnostics'; }
}

function copyDiagnostics() {
  const j = buildDiagJson();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(j)
      .then(function () { showToast('Diagnostics copied!', 'success'); })
      .catch(function () { fallbackCopy(j); });
  } else { fallbackCopy(j); }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); showToast('Copied!', 'success'); }
  catch (_) { showToast('Copy failed', 'error'); }
  document.body.removeChild(ta);
}

// ─── Render ───────────────────────────────────────────────────────────────────

// ─── Credits ──────────────────────────────────────────────────────────────────

async function fetchCredits() {
  try {
    var data = await apiFetch('/api/v1/motionforge/credits');
    state.usage.credits      = data.credits      || 0;
    state.usage.creditsTotal = data.creditsTotal || 1000;
    renderUsage();
    updateCostPreview();
  } catch (e) {
    console.warn('[Prysmor] fetchCredits failed:', e);
  }
}

// Smoothly animates a number element from its current displayed value to target
function animateNumber(elId, toValue, duration) {
  var elem = el(elId);
  if (!elem) return;
  var from = parseInt(elem.textContent.replace(/[^0-9]/g, ''), 10) || 0;
  if (from === toValue) { elem.textContent = toValue.toLocaleString(); return; }
  var start = null;
  function step(ts) {
    if (!start) start = ts;
    var pct = Math.min((ts - start) / (duration || 500), 1);
    var ease = 1 - Math.pow(1 - pct, 3); // ease-out cubic
    var cur = Math.round(from + (toValue - from) * ease);
    elem.textContent = cur.toLocaleString();
    if (pct < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderUsage() {
  var credits = state.usage.credits      || 0;
  var total   = state.usage.creditsTotal || 1000;
  var pct     = total > 0 ? Math.min(Math.round((credits / total) * 100), 100) : 0;
  var seconds = Math.floor(credits / 4);
  var isLow   = pct < 20;

  // Animate the big number
  animateNumber('usage-used', credits, 600);

  var limEl = el('usage-limit');
  if (limEl) limEl.textContent = total.toLocaleString();

  var barEl = el('progress-fill');
  if (barEl) {
    barEl.style.width      = pct + '%';
    barEl.style.background = isLow
      ? 'linear-gradient(90deg,#fb923c,#fbbf24)'
      : 'linear-gradient(90deg,#A3FF12,#5DFF00)';
  }

  // Credits card low state
  var card = el('credits-card');
  if (card) card.classList.toggle('low', isLow);

  // Seconds remaining
  var secEl = el('usage-seconds');
  if (secEl) secEl.textContent = seconds > 0 ? '≈ ' + seconds + 's of AI VFX' : 'No time remaining';

  // Topbar badge
  var badge    = el('topbar-credits');
  var badgeVal = el('topbar-credits-val');
  if (badge && badgeVal) {
    badge.style.display  = '';
    badgeVal.textContent = credits.toLocaleString() + ' cr';
    badge.classList.toggle('low', isLow);
  }
}

function showNoCreditsMessage() {
  showToast('No credits left. Upgrade your plan to continue generating.', 'error');
  var banner = el('no-credits-banner');
  if (banner) banner.classList.remove('hidden');
}

function hideNoCreditsMessage() {
  var banner = el('no-credits-banner');
  if (banner) banner.classList.add('hidden');
}

function showView(name) {
  el('view-login').classList.toggle('hidden', name !== 'login');
  el('view-main').classList.toggle('hidden',  name !== 'main');
}

function toggleSettings(force) {
  const menu    = el('settings-menu');
  const chevron = el('settings-chevron');
  const open    = (force !== undefined) ? force : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  chevron.classList.toggle('open', open);
  state.settingsOpen = open;
}

let _toastTimer;
function showToast(msg, type) {
  try {
    const toast = el('toast');
    if (!toast) { console.warn('[Prysmor]', msg); return; }
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const iconEl = el('toast-icon');
    if (iconEl) iconEl.textContent = icons[type] || 'ℹ';
    const textEl = el('toast-text');
    if (textEl) textEl.textContent = msg;
    toast.className = 'toast toast-visible ' + (type || 'info');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { toast.className = 'toast hidden'; }, 5000);
  } catch (e) {
    console.error('[Prysmor toast error]', e, msg);
  }
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  el('btn-continue').addEventListener('click', startLogin);

  // Clip
  el('btn-refresh-clip').addEventListener('click', function () { refreshClip(false); });

  // Prompt char count
  el('mf-prompt').addEventListener('input', function () {
    el('mf-char-count').textContent = this.value.length;
  });

  // Compile prompt
  el('btn-compile-prompt').addEventListener('click', compilePrompt);

  // Output mode segment control (New track / Replace)
  (function () {
    var btnV2      = el('out-btn-v2');
    var btnReplace = el('out-btn-replace');
    var checkbox   = el('mf-replace-toggle');
    var hint       = el('output-hint');
    if (!btnV2 || !btnReplace) return;

    function setMode(replace) {
      checkbox.checked = replace;
      btnV2.classList.toggle('seg-active', !replace);
      btnReplace.classList.toggle('seg-active', replace);
      hint.textContent = replace
        ? 'Result overwrites your original clip in the timeline'
        : 'Result added on a new V2 track — your original clip is untouched';
    }

    btnV2.addEventListener('click',      function () { setMode(false); });
    btnReplace.addEventListener('click', function () { setMode(true);  });
  })();

  // Generate
  el('mf-btn-generate').addEventListener('click', mfGenerate);

  // New generation
  el('mf-btn-new-gen').addEventListener('click', function () {
    el('mf-section-result').classList.add('hidden');
    state.mf.jobId       = null;
    state.mf.outputUrl   = null;
    state.mf.rawOutputUrl = null;
    el('mf-prompt').focus();
  });

  // Insert on V2 (manual re-insert from result)
  el('mf-btn-insert-v2').addEventListener('click', function () {
    if (!state.mf.outputPath && !state.mf.outputUrl) return;
    if (state.mf.outputPath) {
      const esc = state.mf.outputPath.replace(/"/g, '\\"');
      cs.evalScript(
        'insertClipOnV2("' + esc + '", ' + (state.mf.selInfo ? state.mf.selInfo.startTimeSec : 0) + ')',
        function (r) {
          showToast(r && r.indexOf('error') === 0 ? r.replace('error: ', '') : 'Inserted on V2!', r && r.indexOf('error') === 0 ? 'error' : 'success');
        }
      );
    } else {
      cs.openURLInDefaultBrowser(state.mf.outputUrl);
    }
  });

  // Open in browser
  el('mf-btn-open-output').addEventListener('click', function () {
    var url = state.mf.outputUrl || '';
    if (url) cs.openURLInDefaultBrowser(url);
  });

  // View raw Runway output (before Identity Lock compositing)
  el('mf-btn-raw-output').addEventListener('click', function () {
    var rawUrl = state.mf.rawOutputUrl || '';
    if (rawUrl) {
      cs.openURLInDefaultBrowser(rawUrl);
    } else {
      showToast('Raw output not available for this generation', 'info');
    }
  });

  // Settings
  el('btn-scroll-settings').addEventListener('click', function () {
    el('section-settings').scrollIntoView({ behavior: 'smooth' });
    toggleSettings(true);
  });
  el('settings-trigger').addEventListener('click', function () { toggleSettings(); });
  el('btn-diagnostics').addEventListener('click', toggleDiagnostics);
  el('btn-copy-diag').addEventListener('click', copyDiagnostics);
  el('btn-logout').addEventListener('click', logout);


  el('btn-dashboard').addEventListener('click', function () {
    cs.openURLInDefaultBrowser(SITE_URL + '/dashboard');
  });

  // No-credits upgrade link
  var upgradeLink = el('no-credits-upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', function (e) {
      e.preventDefault();
      cs.openURLInDefaultBrowser(SITE_URL + '/dashboard/billing');
    });
  }
  el('btn-updates').addEventListener('click', function () {
    cs.openURLInDefaultBrowser(SITE_URL + '/downloads');
  });
  el('link-docs').addEventListener('click', function (e) {
    e.preventDefault();
    cs.openURLInDefaultBrowser(SITE_URL + '/docs');
  });
  el('link-terms').addEventListener('click', function (e) {
    e.preventDefault();
    cs.openURLInDefaultBrowser(SITE_URL + '/terms');
  });
}


// ─── Utils ────────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }
