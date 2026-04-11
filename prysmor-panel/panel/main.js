'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────

const SITE_URL  = 'https://prysmor.io';
// API_BASE: localhost for dev, production domain when deployed.
// Change this single line before shipping a new panel build.
const API_BASE  = 'https://prysmor-io.vercel.app';
const POLL_MS         = 2000;
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

// ─── Generation Progress State ────────────────────────────────────────────────
var _genStartTime    = null;   // Date.now() when Generate was clicked
var _elapsedTimer    = null;   // setInterval ID for the elapsed clock
var _displayPct      = 0;      // last rendered % — never decrements
var _progressHistory = [];     // [{t, pct}] ring-buffer for ETA estimation

// ─── Auto-Select State ────────────────────────────────────────────────────────
// Polls Premiere every 500 ms and reloads the clip when the selection changes.

var _autoSelectTimer    = null;
var _lastAutoSelectKey  = null;

/**
 * Builds a stable key from clip info.
 * Rounds mediaInSec to the nearest 0.5 s so minor timeline nudges
 * don't trigger a full re-capture of reference frames.
 */
function getClipKey(info) {
  if (!info || info.error) return null;
  var t = Math.round((info.mediaInSec  || 0) * 2) / 2;
  var d = parseFloat((info.durationSec || 0).toFixed(1));
  return (info.sourcePath || '') + '@' + t.toFixed(1) + ':' + d;
}

function startClipAutoSelect() {
  stopClipAutoSelect();
  _autoSelectTimer = setInterval(function () {
    cs.evalScript('getSelectionInfo()', function (raw) {
      var parsed = null;
      try { parsed = JSON.parse(raw || '{}'); } catch (_) {}

      var key = getClipKey(parsed);

      if (key === null) {
        // Nothing selected
        if (_lastAutoSelectKey !== null) {
          _lastAutoSelectKey    = null;
          state.mf.selInfo      = null;
          storedReferenceFrame  = null;
          storedReferenceFrames = [];
          storedVideoInfo       = null;
          showClipEmpty();
          updateCostPreview();
        }
        return;
      }

      if (key === _lastAutoSelectKey) return; // same clip — nothing to do
      _lastAutoSelectKey = key;

      state.mf.selInfo = parsed;
      showClipInfo(parsed);
      updateCostPreview();
      captureClipReferenceFrame(parsed.sourcePath);
    });
  }, 500);
}

function stopClipAutoSelect() {
  if (_autoSelectTimer) { clearInterval(_autoSelectTimer); _autoSelectTimer = null; }
  _lastAutoSelectKey = null;
}

// ─── Reference Frame Store ────────────────────────────────────────────────────
// Up to 3 frames captured at different timecodes when a clip is loaded.
// storedReferenceFrame is always storedReferenceFrames[0] for backward compat.
var storedReferenceFrames = [];   // primary — array of base64 JPEG strings
var storedReferenceFrame  = null; // alias → storedReferenceFrames[0] || null
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
    state._extRoot = raw
      .replace(/^file:[\/\\]+/, '')   // strip file:/// or file:\ prefix
      .replace(/\\/g, '/')            // normalise to forward slashes
      .replace(/\/$/, '');            // strip trailing slash
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

  // Start 500 ms auto-detect polling — no Refresh button needed
  startClipAutoSelect();
}




function logout() {
  stopMfPolling();
  stopAuthPolling();
  stopHeartbeat();
  stopClipAutoSelect();

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
  storedReferenceFrame  = null;
  storedReferenceFrames = [];
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
  // Clear immediately so Generate is blocked while the async refresh is in progress.
  storedReferenceFrame  = null;
  storedReferenceFrames = [];
  storedVideoInfo = null;

  el('btn-refresh-clip').disabled = true;
  el('btn-refresh-clip').classList.add('spinning');

  cs.evalScript('getSelectionInfo()', function (raw) {
    el('btn-refresh-clip').disabled = false;
    el('btn-refresh-clip').classList.remove('spinning');

    let parsed = null;
    try { parsed = JSON.parse(raw || '{}'); } catch (_) {}

    if (!parsed || parsed.error) {
      state.mf.selInfo      = null;
      storedReferenceFrame  = null;
      storedReferenceFrames = [];
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
  showClipThumbnail(null); // clear thumbnail
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
  var token = state.auth.token;
  console.log('[auth] token being sent:', token ? 'YES length=' + token.length : 'NO TOKEN');
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return Object.assign(headers, extra || {});
}

async function apiFetch(path, options) {
  var res = await fetch(API_BASE + path,
    Object.assign({ headers: apiHeaders() }, options || {}));
  // 401 or 403 = session expired / Vercel deployment invalidated session
  if (res.status === 401 || res.status === 403) {
    clearSession();
    logout();
    throw new Error('Session expired — please sign in again.');
  }
  var json = await res.json().catch(function () { return { error: 'HTTP ' + res.status }; });
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

// ─── Compile Prompt ───────────────────────────────────────────────────────────

async function compilePrompt() {
  console.log('[Prysmor:enhance] ENHANCE CLICKED - storedReferenceFrames:', storedReferenceFrames.length,
    'frames, primary:', storedReferenceFrame ? 'YES length=' + storedReferenceFrame.length : 'NO');
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

      console.log('[Prysmor:enhance] storedReferenceFrames:', storedReferenceFrames.length, 'frames available');
      var enhanceBody = { intent: intent };
      if (storedReferenceFrame)          enhanceBody.frameBase64 = storedReferenceFrame;
      if (storedReferenceFrames.length > 0) enhanceBody.frames = storedReferenceFrames;
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

      flashEnhanceSuccess();
      textarea.focus();

    } catch (err) {
      showToast('Scene enhance failed: ' + (err.message || 'unknown error'), 'error');
    } finally {
      btn.disabled    = false;
      lbl.textContent = 'AI Enhance';
    }
    return;
  }

  // No job yet — use the top-level enhance-prompt endpoint (no job ID required).
  // Sends the stored reference frame if available so Claude uses vision.
  if (!raw) {
    showToast('Enter a prompt first', 'error');
    textarea.focus();
    return;
  }

  btn.disabled    = true;
  lbl.textContent = 'Enhancing…';

  try {
    var enhanceBody2 = { prompt: raw };
    if (storedReferenceFrames.length > 0) enhanceBody2.frames = storedReferenceFrames;
    else if (storedReferenceFrame)        enhanceBody2.frames = [storedReferenceFrame];
    console.log('[Prysmor:enhance] no-job path — frames:', enhanceBody2.frames ? enhanceBody2.frames.length : 0);

    var res2 = await fetch(API_BASE + '/api/v1/motionforge/enhance-prompt', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify(enhanceBody2),
    });
    var json2 = await res2.json().catch(function () { return {}; });

    if (res2.status === 401) {
      logout();
      showToast('Session expired — please sign in again', 'error');
      return;
    }
    if (!res2.ok || (!json2.enhancedPrompt && !json2.enhanced)) {
      throw new Error(json2.error || 'Enhance failed');
    }

    var enhanced = json2.enhancedPrompt || json2.enhanced;
    textarea.value = enhanced;
    el('mf-char-count').textContent = enhanced.length;
    flashEnhanceSuccess();
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
        var vw = video.videoWidth  || 0;
        var vh = video.videoHeight || 0;

        // If the browser couldn't read video dimensions, skip canvas drawing
        // entirely (drawImage on a 0-width source throws a DOMException).
        // Return fallback 320x180 so captureClipReferenceFrame still enters
        // the dimension-checking path and sets storedVideoInfo correctly.
        if (!vw || !vh) {
          URL.revokeObjectURL(url);
          resolve({ frameBase64: null, width: 320, height: 180 });
          return;
        }

        try {
          var W  = 320;
          var H  = Math.round(W * vh / Math.max(vw, 1)) || 180;
          var canvas = document.createElement('canvas');
          canvas.width  = W;
          canvas.height = H;
          canvas.getContext('2d').drawImage(video, 0, 0, W, H);
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

// Wraps cs.evalScript in a Promise so async functions can await it.
function evalScriptAsync(script) {
  return new Promise(function (resolve) {
    try {
      cs.evalScript(script, function (result) { resolve(result || ''); });
    } catch (_) {
      resolve('');
    }
  });
}

/**
 * Extracts a single JPEG frame from a video via ffmpeg.
 * Much more reliable than canvas-based capture — works with any codec,
 * any resolution, and does not require the video element to decode.
 *
 * @param {string} sourcePath - full path to the source video file
 * @param {number} timeSec    - seek position in the source file (seconds)
 * @returns {Promise<string|null>} base64-encoded JPEG, or null on failure
 */
function captureFrameViaFFmpeg(sourcePath, timeSec) {
  return new Promise(function (resolve) {
    try {
      var cp;
      try { cp = require('child_process'); } catch (_) { return resolve(null); }

      var ffmpegBin = getFFmpegBin();
      var isWin     = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
      var tmpDir    = '';
      try { tmpDir = require('os').tmpdir(); } catch (_) {}
      if (!tmpDir) tmpDir = (state._extRoot || '') + (isWin ? '\\panel\\temp' : '/panel/temp');

      var outPath = tmpDir + (isWin ? '\\' : '/') + 'prysmor-frame-' + Date.now() + '.jpg';

      var args = [
        '-ss', String(parseFloat((timeSec || 0).toFixed(6))),
        '-i',  sourcePath,
        '-vframes', '1',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720',
        '-q:v', '2',
        '-y', outPath,
      ];

      var proc = cp.spawn(ffmpegBin, args, { windowsHide: true });
      proc.on('close', function (code) {
        try {
          var nfs = require('fs');
          if (code === 0 && nfs.existsSync(outPath)) {
            var data   = nfs.readFileSync(outPath);
            var b64    = data.toString('base64');
            try { nfs.unlinkSync(outPath); } catch (_) {}
            return resolve(b64);
          }
        } catch (_) {}
        resolve(null);
      });
      proc.on('error', function () { resolve(null); });
    } catch (_) { resolve(null); }
  });
}

/**
 * Captures 3 reference frames at different timecodes (start, middle, near-end)
 * from a video file using FFmpeg.  Gives Runway more angles of the subject.
 *
 * The extracted clip is centre-cropped to ≤2.358:1 at native resolution (no scale),
 * so timecodes are relative to the start of the extracted file (t=0 = clip in-point).
 *
 * @param {string} sourcePath  - full path to the video file
 * @param {number} mediaInSec  - in-point offset within the file (seconds)
 * @param {number} durationSec - clip duration (seconds)
 * @returns {Promise<string[]>} array of base64 JPEG strings (may be 1-3 items)
 */
async function captureMultipleFrames(sourcePath, mediaInSec, durationSec) {
  var t1 = mediaInSec;
  var t2 = mediaInSec + (durationSec * 0.5);
  var t3 = mediaInSec + (durationSec * 0.85);

  var results = await Promise.all([
    captureFrameViaFFmpeg(sourcePath, t1).catch(function () { return null; }),
    captureFrameViaFFmpeg(sourcePath, t2).catch(function () { return null; }),
    captureFrameViaFFmpeg(sourcePath, t3).catch(function () { return null; }),
  ]);

  var frames = results.filter(function (f) { return f !== null; });
  console.log('[Prysmor:multiframe] captured ' + frames.length + '/3 reference frames');
  return frames;
}

// Captures a reference frame + sequence dimensions when a clip is loaded.
// Uses ffmpeg (reliable) instead of canvas (fails on wide/unusual codecs).
// Runs silently in the background — errors leave storedReferenceFrame null.
async function captureClipReferenceFrame(sourcePath) {
  storedReferenceFrame  = null;
  storedReferenceFrames = [];
  storedVideoInfo = null;

  var mediaIn  = (state.mf.selInfo && state.mf.selInfo.mediaInSec)  || 0;
  var duration = (state.mf.selInfo && state.mf.selInfo.durationSec) || 8;

  // ── Multi-frame capture via ffmpeg ──────────────────────────────────────
  console.log('[Prysmor:frame] captureClipReferenceFrame: mediaInSec=' + mediaIn +
    ' durationSec=' + duration + ' sourcePath=' + sourcePath);
  console.log('[Prysmor:frame] selInfo startTimeSec:', (state.mf.selInfo && state.mf.selInfo.startTimeSec) || 'n/a');
  try {
    var frames = await captureMultipleFrames(sourcePath, mediaIn, duration);
    if (frames.length > 0) {
      storedReferenceFrames = frames;
      storedReferenceFrame  = frames[0];
      showClipThumbnail(frames[0]); // display first frame as thumbnail
      console.log('[Prysmor:frame] captureClipReferenceFrame: stored ' + frames.length +
        ' frames, primary length=' + frames[0].length);
    } else {
      console.warn('[Prysmor:frame] captureClipReferenceFrame: all ffmpeg frames returned null');
    }
  } catch (frameErr) {
    console.error('[Prysmor:frame] captureClipReferenceFrame threw:', frameErr.message);
  }

  // ── Sequence dimensions (for aspect ratio guard) ────────────────────────
  // mfGenerate always runs ffmpeg extract which crops/scales automatically,
  // so storedVideoInfo is mainly a safety net for the fallback path.
  var seqW = 0, seqH = 0;
  try {
    var freshRaw  = await evalScriptAsync('getSelectionInfo()');
    var freshInfo = null;
    try { freshInfo = JSON.parse(freshRaw || '{}'); } catch (_) {}
    if (freshInfo && !freshInfo.error) {
      seqW = Number(freshInfo.seqWidth)  || 0;
      seqH = Number(freshInfo.seqHeight) || 0;
      console.log('[Prysmor:aspectRatio] ExtendScript seqWidth=' + freshInfo.seqWidth +
        ' seqHeight=' + freshInfo.seqHeight + ' → seqW=' + seqW + ' seqH=' + seqH);
      if (state.mf.selInfo) {
        state.mf.selInfo.seqWidth  = seqW;
        state.mf.selInfo.seqHeight = seqH;
      }
    } else {
      console.warn('[Prysmor:aspectRatio] getSelectionInfo returned error or null:', freshRaw);
    }
  } catch (evalErr) {
    console.error('[Prysmor:aspectRatio] evalScriptAsync threw:', evalErr);
  }

  if (seqW > 0 && seqH > 0) {
    var seqRatio = seqW / seqH;
    // sourceTooWide: ffmpeg extract always crops, so this only matters if
    // ffmpeg fails and we fall back to uploading the raw file.
    storedVideoInfo = { width: seqW, height: seqH, sourceTooWide: seqRatio > 2.358 };
    console.log('[Prysmor:aspectRatio] storedVideoInfo: ' + seqW + 'x' + seqH +
      ' ratio=' + seqRatio.toFixed(4) + ' sourceTooWide=' + (seqRatio > 2.358));
  } else {
    storedVideoInfo = { width: 0, height: 0, sourceTooWide: false };
    console.log('[Prysmor:aspectRatio] sequence dims unavailable — treating as valid');
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

  // Guard: aspect ratio check — Runway Gen-4 rejects width/height > 2.358.
  // The panel uploads the raw source file, so even if the sequence is 16:9
  // the source file itself must be ≤ 2.358 or Runway will reject it.
  console.log('[Prysmor:aspectRatio] mfGenerate guard — storedVideoInfo:', JSON.stringify(storedVideoInfo));
  if (!storedVideoInfo) {
    showToast('Please wait, clip is still loading…', 'error');
    return;
  }
  // sourceTooWide: raw source file exceeds 2.358:1 but sequence may be fine.
  // We don't block here — extractAndPrepareClip() centre-crops before the upload.
  if (storedVideoInfo.width > 0 && storedVideoInfo.height > 0) {
    var aspectRatio = storedVideoInfo.width / storedVideoInfo.height;
    console.log('[Prysmor:aspectRatio] confirmed dims — ratio=' + aspectRatio.toFixed(4) + ' block=' + (aspectRatio > 2.358));
    if (aspectRatio > 2.358) {
      showToast(
        'Video is too wide (' + aspectRatio.toFixed(2) + ':1). ' +
        'Please crop to 16:9 in Premiere first.',
        'error'
      );
      return;
    }
  } else {
    console.log('[Prysmor:aspectRatio] dims unknown (0x0) — skipping ratio block, proceeding');
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

  console.log('[Prysmor:selInfo] mediaInSec  :', mediaInSec);
  console.log('[Prysmor:selInfo] clipDurSec  :', clipDurSec);
  console.log('[Prysmor:selInfo] startTimeSec:', state.mf.selInfo.startTimeSec);
  console.log('[Prysmor:selInfo] sourcePath  :', sourcePath);
  console.log('[Prysmor:selInfo] full        :', JSON.stringify(state.mf.selInfo));

  // ── Step 2: Get Runway pre-signed upload URL ──────────────────────────────
  setStatus('Preparing upload…', 12);
  var uploadSlot;
  try {
    uploadSlot = await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/upload-url');
  } catch (err) {
    return fail('Upload init failed: ' + err.message);
  }


    // ── Extract + prepare clip ─────────────────────────────────────────────
    // Always: extract just the selected segment (mediaInSec → +clipDurSec)
    // from the source file, centre-crop width to ≤2.358:1 at native resolution
    // (no scale/pad). This fixes the bug where the full source file
    // was being uploaded instead of only the selected clip.
    // On failure: if source is too wide we must abort; otherwise fall back to
    // reading the full source file so non-wide clips still work.
    setStatus('Extracting clip…', 14);
    var extractionSucceeded = false;
    var preparedTmpPath     = null;
    var preparedVideoWidth  = 0;
    var preparedVideoHeight = 0;
    var fileBase64;
    try {
      var extractResult = await extractAndPrepareClip(sourcePath, mediaInSec, clipDurSec);
      preparedTmpPath     = extractResult.path;
      preparedVideoWidth  = extractResult.width  || 0;
      preparedVideoHeight = extractResult.height || 0;
      console.log('[Prysmor] Extracted segment: mediaIn=' + mediaInSec + 's dur=' + clipDurSec + 's → ' + preparedTmpPath +
        '  dims=' + preparedVideoWidth + 'x' + preparedVideoHeight);
      setStatus('Reading clip…', 20);
      // Read file + capture 3 reference frames concurrently (file must exist for both)
      var multiFrameResults = await Promise.all([
        readFileBase64(preparedTmpPath),
        captureMultipleFrames(preparedTmpPath, 0, clipDurSec),
      ]);
      fileBase64 = multiFrameResults[0];
      var capturedFrames = multiFrameResults[1];
      extractionSucceeded = true;
      // Update stored frames with clean extracted-clip frames (cropped native res)
      if (capturedFrames && capturedFrames.length > 0) {
        storedReferenceFrames = capturedFrames;
        storedReferenceFrame  = capturedFrames[0];
        console.log('[Prysmor:frame] captured ' + capturedFrames.length + ' reference frames from extracted clip');
      } else {
        console.log('[Prysmor:frame] captureMultipleFrames returned 0 frames — using storedReferenceFrames from clip load');
      }
      try { require('fs').unlinkSync(preparedTmpPath); } catch (_) {
        try { window.cep.fs.deleteFile(preparedTmpPath); } catch (_) {}
      }
      preparedTmpPath = null;
    } catch (extractErr) {
      console.error('[Prysmor] Clip extraction failed:', extractErr.message);
      if (preparedTmpPath) {
        try { require('fs').unlinkSync(preparedTmpPath); } catch (_) {}
        preparedTmpPath = null;
      }
      if (storedVideoInfo && storedVideoInfo.sourceTooWide) {
        return fail(
          'Could not prepare video automatically (ffmpeg error). ' +
          'Please export your Premiere sequence as 1920×1080 H.264 and generate from that file.'
        );
      }
      console.warn('[Prysmor] Falling back to full source file');
      setStatus('Reading clip…', 20);
      try {
        fileBase64 = await readFileBase64(sourcePath);
      } catch (readErr) {
        return fail('Cannot read clip: ' + readErr.message);
      }
    }

    // Reference frames were already captured above via captureMultipleFrames.
    // (captureReferenceFrame / canvas-based capture is no longer needed here)

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
  console.log('[Prysmor:frame] sending ' + storedReferenceFrames.length + ' reference frame(s) to generate endpoint');
  try {
    var genBody = { prompt: prompt };
    // Send all captured reference frames (primary + extras for identity conditioning)
    if (storedReferenceFrames.length > 0) {
      genBody.referenceFrameBase64 = storedReferenceFrames[0];      // primary (backward compat)
      genBody.referenceFrames      = storedReferenceFrames;          // all frames
    }
    // If ffmpeg extraction ran, send probed dimensions of the cropped output file.
    // Otherwise send stored sequence dimensions as a best-effort hint.
    if (extractionSucceeded) {
      if (preparedVideoWidth > 0 && preparedVideoHeight > 0) {
        genBody.videoWidth  = preparedVideoWidth;
        genBody.videoHeight = preparedVideoHeight;
      } else if (storedVideoInfo && storedVideoInfo.width > 0 && storedVideoInfo.height > 0) {
        genBody.videoWidth  = storedVideoInfo.width;
        genBody.videoHeight = storedVideoInfo.height;
      }
    } else if (storedVideoInfo && storedVideoInfo.width > 0 && storedVideoInfo.height > 0) {
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

// ─── Elapsed timer helpers ────────────────────────────────────────────────────

function startElapsedTimer() {
  stopElapsedTimer();
  _genStartTime = Date.now();
  updateElapsedDisplay();
  _elapsedTimer = setInterval(updateElapsedDisplay, 1000);
}

function stopElapsedTimer() {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
}

function updateElapsedDisplay() {
  if (!_genStartTime) return;
  var sec = Math.floor((Date.now() - _genStartTime) / 1000);
  var m = Math.floor(sec / 60), s = sec % 60;
  var txt = m + ':' + String(s).padStart(2, '0');
  var elEl = el('gp-elapsed');
  if (elEl) elEl.textContent = txt;
}

// ─── ETA estimation ───────────────────────────────────────────────────────────

function updateETA(pct) {
  var estEl = el('gp-estimate');
  if (!estEl) return;
  if (!_genStartTime || pct < 5 || pct > 97) { estEl.textContent = ''; return; }

  var h = _progressHistory;
  if (h.length < 2) { estEl.textContent = ''; return; }

  var first = h[0], last = h[h.length - 1];
  var dtMs = last.t - first.t, dpct = last.pct - first.pct;
  if (dtMs < 3000 || dpct < 1) { estEl.textContent = ''; return; }

  var remSec = Math.round(((100 - pct) / (dpct / dtMs)) / 1000);
  if (remSec <= 5 || remSec > 900) { estEl.textContent = ''; return; }

  var rm = Math.floor(remSec / 60), rs = remSec % 60;
  var txt = rm > 0
    ? 'Estimated ' + rm + ':' + String(rs).padStart(2, '0') + ' remaining'
    : 'About ' + remSec + 's remaining';
  estEl.textContent = txt;
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
      setStatus('Checking if generation finished\u2026', 99);
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
      // Session expired mid-generation — stop polling and show login prompt
      if (err.message && err.message.indexOf('sign in') !== -1) {
        return fail('Session expired during generation. Please sign in again and retry.');
      }
      // Transient network error — retry up to 5 times
      if (pollErrors >= 5) {
        return fail('Lost connection to server after ' + pollErrors + ' retries. Please retry.');
      }
      var lastPct = state.mf.lastKnownPct || 42;
      setStatus(getGenStatusLabel(elapsedSec), lastPct);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'generating') {
      var runwayPct = job.progress || 0;
      var pct, label;
      if (runwayPct > 0) {
        pct   = 20 + Math.round(runwayPct * 0.6);
        label = 'Generating with AI\u2026';
      } else {
        pct   = 20 + Math.min(Math.round(elapsedSec * 0.06), 10);
        label = elapsedSec < 15 ? 'Generating with AI\u2026' : getGenStatusLabel(elapsedSec);
      }
      state.mf.lastKnownPct = pct;
      setStatus(label, pct);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'compositing') {
      setStatus('Applying final touches\u2026', 97);
      state.mf.pollTimer = setTimeout(doPoll, nextInterval);
      return;
    }

    if (job.status === 'upscaling') {
      setStatus('Enhancing video quality\u2026', job.progress || 85);
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

/**
 * Displays (or clears) the video thumbnail in the clip card.
 * @param {string|null} base64 - raw base64 JPEG string, or null to clear
 */
function showClipThumbnail(base64) {
  var img         = el('clip-thumbnail');
  var placeholder = el('clip-thumb-placeholder');
  if (!img) return;
  if (base64) {
    // CEP uses old Chromium where CSS transitions on img load are unreliable.
    // Drive opacity directly via JS instead of relying on the .loaded class.
    img.style.opacity  = '0';
    img.style.display  = 'block';
    img.style.transition = 'opacity 0.25s ease';
    img.src = 'data:image/jpeg;base64,' + base64;
    if (placeholder) placeholder.style.display = 'none';
    // Fade in — give the browser one tick to decode the data URL first
    setTimeout(function () { img.style.opacity = '1'; }, 40);
  } else {
    img.style.opacity  = '0';
    img.style.display  = 'none';
    img.src            = '';
    if (placeholder) placeholder.style.display = '';
  }
}

function setGenerating(active) {
  state.mf.generating = active;
  var btn = el('mf-btn-generate');
  if (btn) { btn.disabled = active; btn.style.display = active ? 'none' : ''; }
  var costBadge = el('gen-btn-cost');
  if (costBadge && active) costBadge.style.display = 'none';

  var gs = el('mf-gen-state');
  if (gs) gs.classList.toggle('hidden', !active);

  // Hide result and error when starting
  var rs = el('mf-section-result');
  if (rs && active) rs.classList.add('hidden');
  var failEl = el('mf-gen-failed');
  if (failEl && active) failEl.classList.add('hidden');

  if (active) {
    // Reset progress state
    _displayPct      = 0;
    _progressHistory = [];
    var fill = el('gp-fill'); if (fill) fill.style.width = '0%';
    var pct  = el('gp-pct');  if (pct)  pct.textContent  = '0%';
    var est  = el('gp-estimate'); if (est) est.textContent = '';
    var lbl  = el('gp-phase-label'); if (lbl) lbl.textContent = 'Starting\u2026';

    startElapsedTimer();

    // Compat shims: keep old hidden elements current
    setStage('upload');
  } else {
    stopElapsedTimer();
    _genStartTime = null;
    updateCostPreview();
  }
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

function setStatus(text, pct /*, elapsed — ignored, timer handles it */) {
  // Phase label
  var lbl = el('gp-phase-label');
  if (lbl) lbl.textContent = text;

  // Progress bar — never goes backwards
  if (pct != null) {
    var clamped = Math.min(Math.max(pct, 0), 100);
    if (clamped >= _displayPct) {
      _displayPct = clamped;
      var fill = el('gp-fill');
      if (fill) fill.style.width = clamped + '%';
      var pctLbl = el('gp-pct');
      if (pctLbl) pctLbl.textContent = Math.round(clamped) + '%';

      // Record progress sample for ETA estimation
      _progressHistory.push({ t: Date.now(), pct: clamped });
      if (_progressHistory.length > 8) _progressHistory.shift();
      updateETA(clamped);
    }
  }

  // Stage-based dot color: uploading→amber, generating→green, upscaling→blue
  var dot = document.querySelector('.gp-dot');
  if (dot && pct != null) {
    if (_displayPct < 40)       dot.style.background = '#FF9F0A';  // amber: uploading
    else if (_displayPct < 82)  dot.style.background = 'var(--accent)';  // green: generating
    else                        dot.style.background = '#0A84FF';  // blue: upscaling/finishing
  }

  // Compat shims: keep legacy hidden elements in sync
  if (pct != null) {
    var clamped2 = Math.min(Math.max(pct, 0), 100);
    var oldBar = el('mf-gen-bar'); if (oldBar) oldBar.style.width = clamped2 + '%';
    var oldPct = el('mf-gen-pct'); if (oldPct) oldPct.textContent = Math.round(clamped2) + '%';
    var oldTxt = el('mf-status-text'); if (oldTxt) oldTxt.textContent = text;
    if (clamped2 < 38)       setStage('upload');
    else if (clamped2 < 97)  setStage('generate');
    else                     setStage('done');
  }
}

function fail(msg) {
  stopMfPolling();
  stopElapsedTimer();
  _genStartTime = null;
  state.mf.generating = false;

  // Hide generate button (restored on retry)
  var btn = el('mf-btn-generate');
  if (btn) { btn.disabled = false; btn.style.display = 'none'; }
  // Hide progress bar
  var gs = el('mf-gen-state');
  if (gs) gs.classList.add('hidden');

  // Show inline error card
  var failEl  = el('mf-gen-failed');
  var failMsg = el('gen-fail-msg');
  if (failEl)  failEl.classList.remove('hidden');
  if (failMsg) failMsg.textContent = msg || 'Generation failed.';

  // Also surface as toast for immediate visibility
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

// ─── Video Preprocessing ──────────────────────────────────────────────────────
// Centre-crops width to ≤2.358:1 at native resolution (no scale/pad) using ffmpeg.
// Bundled binary: panel/ffmpeg/win/ffmpeg.exe  (Windows)
//                 panel/ffmpeg/mac/ffmpeg       (macOS)
// Falls back to system `ffmpeg` if bundled binary is not found.
/**
 * Resolves the ffmpeg binary path: bundled extension copy first,
 * then system PATH as fallback.
 */
function getFFmpegBin() {
  var nodeFs, nodePath;
  try { nodeFs   = require('fs');   } catch (_) { nodeFs   = null; }
  try { nodePath = require('path'); } catch (_) { nodePath = null; }

  function binExists(p) {
    if (nodeFs) try { return nodeFs.existsSync(p); } catch (_) {}
    return fileExistsSync(p) === true;
  }

  var isWin   = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
  var extRoot = state._extRoot || '';
  if (nodePath) extRoot = nodePath.normalize(extRoot);

  var bundledBin = extRoot + (isWin ? '\\panel\\ffmpeg\\win\\ffmpeg.exe'
                                    : '/panel/ffmpeg/mac/ffmpeg');
  console.log('[Prysmor:ffmpeg] extRoot    :', extRoot);
  console.log('[Prysmor:ffmpeg] bundledBin :', bundledBin, '→ exists:', binExists(bundledBin));

  if (binExists(bundledBin)) return bundledBin;
  console.log('[Prysmor:ffmpeg] bundled not found — falling back to system PATH "ffmpeg"');
  return 'ffmpeg';
}

/**
 * Reads width×height from ffmpeg stderr (`ffmpeg -i file` — exits non-zero but prints stream info).
 * @returns {Promise<{width:number,height:number}>}
 */
function probeVideoDimensionsFfmpeg(videoPath) {
  return new Promise(function (resolve) {
    try {
      var cp = require('child_process');
      var ffmpegBin = getFFmpegBin();
      var proc = cp.spawn(ffmpegBin, ['-hide_banner', '-i', videoPath], { windowsHide: true });
      var stderr = '';
      if (proc.stderr) proc.stderr.on('data', function (d) { stderr += d.toString(); });
      proc.on('close', function () {
        var m = stderr.match(/Stream\s+#\d+:\d+(?:\([^)]*\))?:\s*Video:[^\n]*?(\d{2,})x(\d+)/);
        if (!m) m = stderr.match(/Video:[^\n]*?,\s*(\d{2,})x(\d+)/);
        if (m) {
          return resolve({
            width:  parseInt(m[1], 10),
            height: parseInt(m[2], 10),
          });
        }
        resolve({ width: 0, height: 0 });
      });
      proc.on('error', function () { resolve({ width: 0, height: 0 }); });
    } catch (_) {
      resolve({ width: 0, height: 0 });
    }
  });
}

function cropAndScaleVideo(sourcePath) {
  return new Promise(function (resolve, reject) {
    var cp;
    try { cp = require('child_process'); }
    catch (e) { return reject(new Error('Node child_process unavailable — cannot run ffmpeg')); }

    var ffmpegBin = getFFmpegBin();
    var isWin     = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
    var tmpDir    = '';
    try { tmpDir = require('os').tmpdir(); } catch (_) {}
    if (!tmpDir) tmpDir = (state.mf.tempDir && state.mf.tempDir.length > 0)
      ? state.mf.tempDir
      : (state._extRoot || '') + (isWin ? '\\panel\\temp' : '/panel/temp');

    var outPath = tmpDir + (isWin ? '\\' : '/') + 'prysmor-crop-' + Date.now() + '.mp4';
    var filter  = 'crop=min(iw\\,ih*2.358):ih:(iw-min(iw\\,ih*2.358))/2:0';
    var args = ['-i', sourcePath, '-vf', filter,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-y', outPath];

    console.log('[Prysmor:crop] using:', ffmpegBin, '→', outPath);
    var proc   = cp.spawn(ffmpegBin, args, { windowsHide: true });
    var stderr = '';
    if (proc.stderr) proc.stderr.on('data', function (d) { stderr += d.toString(); });

    proc.on('close', function (code) {
      var nfs = null; try { nfs = require('fs'); } catch (_) {}
      var ok  = nfs ? nfs.existsSync(outPath) : fileExistsSync(outPath);
      if (code === 0 && ok) { resolve(outPath); }
      else {
        console.error('[Prysmor:crop] ffmpeg exited', code, stderr.slice(-400));
        reject(new Error('ffmpeg exited with code ' + code));
      }
    });
    proc.on('error', function (err) {
      console.error('[Prysmor:crop] spawn error:', err.message);
      reject(err);
    });
  });
}

/**
 * Extracts the selected clip segment from the source file and centre-crops width
 * to ≤2.358:1 at native resolution (no scale, no pad).
 *
 * @param {string} sourcePath  - full path to the source media file
 * @param {number} mediaInSec  - in-point in the source file (seconds)
 * @param {number} durationSec - segment duration to extract (seconds)
 * @returns {Promise<{path:string,width:number,height:number}>} prepared clip path + probed dims
 */
function extractAndPrepareClip(sourcePath, mediaInSec, durationSec) {
  return new Promise(function (resolve, reject) {
    var cp;
    try { cp = require('child_process'); }
    catch (e) { return reject(new Error('Node child_process unavailable — cannot run ffmpeg')); }

    var ffmpegBin = getFFmpegBin();
    var isWin     = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
    var tmpDir    = '';
    try { tmpDir = require('os').tmpdir(); } catch (_) {}
    if (!tmpDir) tmpDir = (state.mf.tempDir && state.mf.tempDir.length > 0)
      ? state.mf.tempDir
      : (state._extRoot || '') + (isWin ? '\\panel\\temp' : '/panel/temp');

    var outPath = tmpDir + (isWin ? '\\' : '/') + 'prysmor-clip-' + Date.now() + '.mp4';

    var filter = 'crop=min(iw\\,ih*2.358):ih:(iw-min(iw\\,ih*2.358))/2:0';

    // -ss before -i = fast seek (stream copy to target point then decode).
    var args = [
      '-ss', String(parseFloat(mediaInSec.toFixed(6))),
      '-i',  sourcePath,
      '-t',  String(parseFloat(durationSec.toFixed(6))),
      '-vf', filter,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-c:a', 'aac',
      '-y', outPath,
    ];

    console.log('[Prysmor:extract] mediaIn=' + mediaInSec + 's  dur=' + durationSec + 's');
    console.log('[Prysmor:extract] ffmpeg :', ffmpegBin);
    console.log('[Prysmor:extract] out    :', outPath);
    console.log('[Prysmor:extract] filter :', filter);

    // Log source dimensions before extraction so we can see if crop is needed
    probeVideoDimensionsFfmpeg(sourcePath).then(function (srcDims) {
      var videoWidth  = srcDims.width;
      var videoHeight = srcDims.height;
      console.log('[Prysmor:extract] source dimensions:', videoWidth, 'x', videoHeight);
      if (videoHeight > 0) {
        var ar = (videoWidth / videoHeight).toFixed(3);
        console.log('[Prysmor:extract] source aspect ratio:', ar, '(Runway max: 2.358)');
        if (videoWidth / videoHeight <= 2.358) {
          console.log('[Prysmor:extract] NOTE: source is already within 2.358:1 — crop filter is a no-op');
        } else {
          console.log('[Prysmor:extract] source is wider than 2.358:1 — crop will trim', videoWidth - Math.round(videoHeight * 2.358), 'px from width');
        }
      }
    }).catch(function () {});

    var proc   = cp.spawn(ffmpegBin, args, { windowsHide: true });
    var stderr = '';
    if (proc.stderr) proc.stderr.on('data', function (d) { stderr += d.toString(); });

    proc.on('close', function (code) {
      // Parse source dimensions from ffmpeg stderr (Input stream line)
      var srcMatch = stderr.match(/Input[^,]*,.*?(\d{2,})x(\d+)[^,]*(?:,|$)/);
      if (!srcMatch) srcMatch = stderr.match(/Stream.*?Video:[^\n]*?(\d{2,})x(\d+)/);
      if (srcMatch) {
        console.log('[Prysmor:extract] ffmpeg stderr source dimensions:', srcMatch[1], 'x', srcMatch[2]);
      }

      var nfs = null; try { nfs = require('fs'); } catch (_) {}
      var ok  = nfs ? nfs.existsSync(outPath) : fileExistsSync(outPath);
      if (code === 0 && ok) {
        console.log('[Prysmor:extract] done →', outPath);
        probeVideoDimensionsFfmpeg(outPath).then(function (dims) {
          console.log('[Prysmor:extract] probed output:', dims.width + 'x' + dims.height);
          resolve({ path: outPath, width: dims.width, height: dims.height });
        });
      } else {
        console.error('[Prysmor:extract] ffmpeg exited', code, stderr.slice(-600));
        reject(new Error('ffmpeg extract failed (code ' + code + ')'));
      }
    });
    proc.on('error', function (err) {
      console.error('[Prysmor:extract] spawn error:', err.message);
      reject(err);
    });
  });
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

  // Topbar credits (left side of header — shows clean number only)
  var badge    = el('topbar-credits');
  var badgeVal = el('topbar-credits-val');
  if (badge && badgeVal) {
    badge.style.display  = '';
    badgeVal.textContent = credits.toLocaleString();
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
/**
 * Brief green checkmark flash on the Enhance button.
 * Used instead of a toast banner for enhance success — minimal and non-intrusive.
 */
function flashEnhanceSuccess() {
  var btn  = el('btn-compile-prompt');
  var lbl  = el('compile-label');
  var icon = btn && btn.querySelector('.ai-btn-icon');
  if (!btn) return;

  var prevIcon = icon ? icon.innerHTML : '';
  var prevLbl  = lbl  ? lbl.textContent : 'Enhance';

  if (icon) icon.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  if (lbl) lbl.textContent = 'Done';
  btn.classList.add('ai-btn--done');

  setTimeout(function () {
    if (icon) icon.innerHTML = prevIcon;
    if (lbl)  lbl.textContent = prevLbl;
    btn.classList.remove('ai-btn--done');
  }, 1600);
}

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
  el('btn-refresh-clip').addEventListener('click', function () {
    // Clear stale state immediately so Generate stays blocked until the
    // full refresh + frame capture cycle completes.
    storedReferenceFrame  = null;
    storedReferenceFrames = [];
    storedVideoInfo = null;
    refreshClip(false);
  });

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

  // Retry after failure — hide error card and restore generate button
  var retryBtn = el('gen-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      var failEl = el('mf-gen-failed');
      if (failEl) failEl.classList.add('hidden');
      // Restore generate button
      var genBtn = el('mf-btn-generate');
      if (genBtn) { genBtn.disabled = false; genBtn.style.display = ''; }
      updateCostPreview();
    });
  }

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
    var overlay = el('section-settings');
    if (overlay) overlay.classList.add('settings-visible');
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
