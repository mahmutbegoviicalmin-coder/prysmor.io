'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────


const SITE_URL  = 'https://prysmor.io';
// API_BASE: localhost for dev, production domain when deployed.
// Change this single line before shipping a new panel build.
const API_BASE  = 'https://prysmor-io.vercel.app';
const POLL_MS         = 5000;
const PANEL_VERSION_DEFAULT = '5.5.6'; // keep in sync with panel/version.txt
const POLL_MS_SLOW    = 15000;              // slower after 10 min
const MAX_POLL_MS     = 40 * 60 * 1000;    // 40 min hard timeout
const SOFT_TIMEOUT_MS = 10 * 60 * 1000;    // at 10 min switch to slow polling

// Auth polling
const AUTH_POLL_MS  = 6000;  // how often to check if browser auth completed
const AUTH_MAX_MS   = 5 * 60 * 1000; // 5 min before code expires
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Generation status labels by elapsed time (no vendor names)
const GEN_STATUS_LABELS = [
  { after:   0, text: 'Starting generation…'                  },
  { after:  10, text: 'Preparing your clip…'                  },
  { after:  30, text: 'Queued for processing…'                },
  { after:  90, text: 'Effect generation in progress…'        },
  { after: 180, text: 'Still working. Complex effects take time…' },
  { after: 300, text: 'Almost there, processing your effect…'      },
];


// LocalStorage keys
const LS_TOKEN          = 'prysmor_token';
const LS_USER_ID        = 'prysmor_user_id';
const LS_PLAN           = 'prysmor_plan';
const LS_PLAN_LABEL     = 'prysmor_plan_label';
const LS_TOKEN_EXP      = 'prysmor_token_exp';
const LS_MACHINE_ID     = 'prysmor_machine_id';

// ─── Machine Fingerprint ──────────────────────────────────────────────────────

function getMachineFingerprint() {
  var stored = localStorage.getItem(LS_MACHINE_ID);
  // Return any existing stored ID unchanged — preserves device registration across OTA updates.
  if (stored) return stored;
  try {
    var os  = require('os');
    var raw = [
      os.hostname(),
      os.platform(),
      os.cpus()[0].model,
      os.totalmem(),
    ].join('|');
    var hash = 0;
    for (var i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    // No Date.now() — fingerprint must be stable across reinstalls and updates.
    var id = 'mfp-' + Math.abs(hash).toString(36);
    localStorage.setItem(LS_MACHINE_ID, id);
    return id;
  } catch (e) {
    var raw2 = [
      navigator.platform || 'unknown',
      navigator.hardwareConcurrency || '0',
      screen.width + 'x' + screen.height,
      navigator.language || 'unknown',
      new Date().getTimezoneOffset(),
    ].join('|');
    var hash2 = 0;
    for (var j = 0; j < raw2.length; j++) {
      hash2 = ((hash2 << 5) - hash2) + raw2.charCodeAt(j);
      hash2 |= 0;
    }
    // No Date.now() — stable fingerprint.
    var id2 = 'mfp-' + Math.abs(hash2).toString(36);
    localStorage.setItem(LS_MACHINE_ID, id2);
    return id2;
  }
}

// ─── Generation Progress State ────────────────────────────────────────────────
var _genStartTime    = null;   // Date.now() when Generate was clicked
var _elapsedTimer    = null;   // setInterval ID for the elapsed clock
var _displayPct      = 0;      // last rendered % — never decrements
var _progressHistory = [];     // [{t, pct}] ring-buffer for ETA estimation

// ─── ExtendScript JSON parsing ────────────────────────────────────────────────
/**
 * Parses JSON returned by host.jsx evalScript calls.
 * ExtendScript failures often arrive as plain text ("EvalScript error.") instead of JSON.
 */
function parseExtendScriptJson(raw) {
  if (raw == null || raw === '') {
    return { parsed: null, error: 'Could not read clip from timeline. Is Premiere Pro responding?' };
  }
  var s = String(raw).replace(/^\uFEFF/, '').trim();
  if (s.indexOf('EvalScript error') !== -1) {
    return {
      parsed: null,
      error: 'Premiere scripting failed. Quit Premiere fully (Cmd+Q), reopen it, then tap Sync clip. If this persists, reinstall from prysmor.io/dashboard.',
      evalFailed: true,
    };
  }
  if (s.indexOf('error:') === 0) {
    return { parsed: null, error: s.slice(6).trim() || 'ExtendScript error' };
  }
  try {
    return { parsed: JSON.parse(s) };
  } catch (_) {
    console.warn('[Prysmor:evalScript] Non-JSON response:', s.slice(0, 200));
    return { parsed: null, error: 'Could not read clip from timeline. Restart Premiere Pro and try Sync clip again.' };
  }
}

function clipInfoFromEval(raw) {
  var result = parseExtendScriptJson(raw);
  if (result.parsed) return result.parsed;
  return { error: result.error || 'Could not read clip from timeline' };
}

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
      var parsed = clipInfoFromEval(raw);
      if (parsed.error && parsed.evalFailed) {
        console.warn('[Prysmor:autoSelect] ExtendScript error:', raw);
      }

      var key = getClipKey(parsed);

      if (key === null) {
        // Nothing selected
        if (_lastAutoSelectKey !== null) {
          _lastAutoSelectKey    = null;
          state.mf.selInfo      = null;
          storedVideoInfo       = null;
          showClipEmpty();
          updateCostPreview();
        }
        return;
      }

      if (key === _lastAutoSelectKey) return; // same clip — nothing to do
      _lastAutoSelectKey = key;

      parsed.sourcePath = normalisePath(parsed.sourcePath);
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

// ─── Reference Image Store ────────────────────────────────────────────────────
var storedReferenceImage  = null; // user-uploaded reference image (base64 JPEG), BG mode only
var selectedMode = 'background';  // active generation mode: background | relight | vfx | omni
var OMNI_PLANS   = ['pro', 'exclusive', 'creator', 'creator-suite'];
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
    // Use normalisePath so macOS file:/// paths get a leading slash
    state._extRoot = normalisePath(raw)
      .replace(/\\/g, '/')   // normalise to forward slashes
      .replace(/\/$/, '');   // strip trailing slash
  } catch (_) {}
  bindEvents();
  refreshPanelVersionFromFile();
  // Set initial enhance chip label
  updateEnhanceLabel();
  // Check for OTA panel update in background — does not block login flow
  checkForUpdates();
  // Local UI preview — open http://localhost:5500/?preview=1 in a browser
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /(?:^|[?&])preview=1(?:&|$)/.test(location.search)) {
    state.auth.planLabel = 'EXCLUSIVE';
    state.auth.plan = 'exclusive';
    state.usage.credits = 1930;
    state.usage.creditsTotal = 4000;
    enterPanel();
    return;
  }
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
      setLoginStatus('Your session expired. Please sign in again.', true);
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

function saveSession(token, userId, plan, planLabel, serverExpiresAt) {
  const exp = Number(serverExpiresAt) || (Date.now() + SESSION_TTL_MS);
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
        platform:           osName,
        hostApp:            appName,
        hostAppVersion:     appVersion,
        cepVersion:         cepVer,
        deviceName:         deviceLabel,
        machineFingerprint: getMachineFingerprint(),
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
      try {
        var escapedUrl = data.pairingUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        cs.evalScript('app.openURLInBrowser("' + escapedUrl + '")', function() {});
        opened = true;
      } catch (_) {}
    }
    if (!opened) {
      // Last resort: show the URL so user can copy-paste it manually
      try { window.open(data.pairingUrl, '_blank'); } catch (_) {}
    }
    // Always show the URL in the status so user can open manually if needed
    setLoginStatus('Open this link to sign in: ' + data.pairingUrl, false);
    setLoginStatus('Complete sign in in your browser, then come back.', false);
    btn.textContent = 'Waiting for browser…';
    startAuthPolling(data.deviceCode);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Sign in';
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
      btn.textContent = 'Sign in';
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
        saveSession(data.token, data.userId, data.plan, data.planLabel, data.expiresAt);
        setLoginStatus('', false);
        enterPanel();
      } else if (data.status === 'expired') {
        stopAuthPolling();
        var btn = el('btn-continue');
        btn.disabled = false;
        btn.textContent = 'Sign in';
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
  el2.classList.toggle('hidden', !msg);
  el2.classList.toggle('is-error', !!isError);
}

function sendHeartbeat() {
  if (!state.auth.token) return;
  fetch(API_BASE + '/api/panel/heartbeat', {
    method:  'POST',
    headers: apiHeaders(),
  }).then(function (res) {
    if (res.status === 401) {
      res.json().then(function (data) {
        if (data && data.code === 'machine_mismatch') {
          logout();
          showToast('Session invalid on this device. Please sign in again.', 'error');
        }
      }).catch(function () {});
      return;
    }
    if (res.ok) {
      res.json().then(function (data) {
        if (data && Number(data.expiresAt)) {
          localStorage.setItem(LS_TOKEN_EXP, String(data.expiresAt));
        }
      }).catch(function () {});
    }
  }).catch(function () {});
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

// ─── ExtendScript host loader ──────────────────────────────────────────────
// On the latest Premiere (especially CLEAN installs of 25.6+/26.x) the host
// script declared via the manifest <ScriptPath> sometimes fails to auto-load,
// so every evalScript() call returns "EvalScript error". Adobe confirmed the
// clean-install scripting-bridge regression; upgraded installs are unaffected
// (which is why it works on our dev machines but not on customers' fresh ones).
// We self-heal by explicitly loading host.jsx via $.evalFile at startup.
function hostScriptPath() {
  var root = (state._extRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
  var isWin = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
  if (!isWin && root && root.charAt(0) !== '/') root = '/' + root;
  return root + '/panel/host.jsx';
}

function hostIsLoadedAsync() {
  return evalScriptAsync('typeof getSelectionInfo === "function" ? "1" : "0"')
    .then(function (res) { return String(res).indexOf('1') !== -1; });
}

// Returns 'loaded' | 'evalfile' | 'dead'. 'dead' means the ExtendScript bridge
// itself is unresponsive (the Premiere clean-install bug) — user must update PP.
function ensureHostLoaded() {
  return hostIsLoadedAsync().then(function (ok) {
    if (ok) return 'loaded';
    var p = hostScriptPath().replace(/"/g, '\\"');
    console.warn('[Prysmor:host] host not auto-loaded — $.evalFile:', p);
    return evalScriptAsync('$.evalFile("' + p + '")').then(function () {
      return hostIsLoadedAsync().then(function (ok2) {
        if (ok2) {
          console.log('[Prysmor:host] host loaded via $.evalFile');
          return 'evalfile';
        }
        console.error('[Prysmor:host] $.evalFile did not define host functions — scripting bridge unresponsive');
        return 'dead';
      });
    });
  }).catch(function () { return 'dead'; });
}

function enterPanel() {
  // Update plan label in topbar if element exists
  var planEl = el('topbar-plan');
  if (planEl && state.auth.planLabel) {
    planEl.textContent = state.auth.planLabel;
    planEl.style.display = '';
  }

  showView('main');

  var hdrVer = el('hdr-panel-version');
  if (hdrVer) {
    try { hdrVer.textContent = 'v' + readLocalVersion(); } catch (_) {}
  }

  // Render credits immediately if pre-loaded by validateSessionThenEnter()
  if (state.usage.credits > 0 || state.usage.creditsTotal !== 1000) {
    renderUsage();
    updateCostPreview();
  }

  // Start heartbeat — keeps device "Online" in dashboard
  startHeartbeat();

  // Fetch credit balance to keep it fresh
  fetchCredits();

  // Ensure the ExtendScript host is loaded before touching the timeline.
  // Self-heals the "EvalScript error" seen on the latest Premiere / clean installs.
  ensureHostLoaded().then(function (hostState) {
    if (hostState === 'dead') {
      showToast('Premiere scripting is not responding. Update Premiere Pro to the latest version, then fully quit (Cmd+Q) and reopen.', 'error');
      // Still start polling — if the user updates/reloads, auto-detect recovers.
      startClipAutoSelect();
      return;
    }

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
  });
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
  storedReferenceImage  = null;
  storedVideoInfo = null;
  state.mf = {
    jobId: null, selInfo: null, replaceMode: false,
    pollTimer: null, pollStart: 0, outputUrl: null, rawOutputUrl: null,
    outputPath: null, startTimeSec: 0, resultAfterBase64: null,
    tempDir: '', generating: false,
  };
  var btn = el('btn-continue');
  if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
  setLoginStatus('', false);
  resetUI();
  showView('login');
}

// ─── Clip Selection ───────────────────────────────────────────────────────────

/**
 * Calls ExtendScript getSelectionInfo(), updates the clip card.
 * @param {boolean} silent  — if true, don't show toast when nothing is selected
 */
function setRefreshBusy(busy) {
  var btn = el('btn-refresh-clip');
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle('spinning', busy);
}

function applyClipInfo(parsed, silent) {
  if (!parsed || parsed.error) {
    state.mf.selInfo = null;
    storedVideoInfo = null;
    showClipEmpty();
    if (!silent) {
      showToast(parsed ? parsed.error : 'Could not read clip from timeline', 'error');
    }
    return false;
  }
  state.mf.selInfo = parsed;
  parsed.sourcePath = normalisePath(parsed.sourcePath);
  showClipInfo(parsed);
  updateCostPreview();
  captureClipReferenceFrame(parsed.sourcePath);
  if (!silent) {
    showToast('Clip ready: ' + (parsed.clipName || 'clip'), 'success');
  }
  return true;
}

function refreshClip(silent) {
  storedVideoInfo = null;
  setRefreshBusy(true);
  cs.evalScript('getSelectionInfo()', function (raw) {
    setRefreshBusy(false);
    applyClipInfo(clipInfoFromEval(raw), silent);
  });
}

function refreshClipAsync(silent) {
  return new Promise(function (resolve) {
    storedVideoInfo = null;
    setRefreshBusy(true);
    cs.evalScript('getSelectionInfo()', function (raw) {
      setRefreshBusy(false);
      resolve(applyClipInfo(clipInfoFromEval(raw), silent));
    });
  });
}

function showClipEmpty() {
  el('clip-empty').classList.remove('hidden');
  el('clip-info').classList.add('hidden');
  showClipThumbnail(null);
  var hint = el('clip-bar-hint');
  if (hint) hint.textContent = 'Place playhead inside a clip (not on a cut), then Sync clip';
}

function creditsPerSecond(mode) {
  return (mode || selectedMode) === 'vfx' ? 10 : 4;
}

function calcCostPreview(durationSec, mode) {
  mode = mode || selectedMode || 'background';
  var maxDur = mode === 'vfx' ? 30 : 8;
  var dur    = Math.min(durationSec || 0, maxDur);
  var billable = Math.max(Math.ceil(Math.max(dur, 0.5)), mode === 'vfx' ? 2 : 1);
  return billable * creditsPerSecond(mode);
}

function updateCostPreview() {
  var costBadge    = el('gen-btn-cost');
  var costBadgeVal = el('gen-btn-cost-val');

  if (!state.mf.selInfo) {
    if (costBadge) costBadge.style.display = 'none';
    return;
  }

  var maxDur = selectedMode === 'vfx' ? 30 : 8;
  var dur    = Math.min(state.mf.selInfo.durationSec || 0, maxDur);
  var cost   = calcCostPreview(dur, selectedMode);
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

  var hint = el('clip-bar-hint');
  if (hint) {
    var name = info.clipName || (info.sourcePath && info.sourcePath.split('/').pop()) || 'clip';
    hint.textContent = 'Ready: ' + name;
  }

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
      warnEl.textContent = '⚠ Clip is ' + dur.toFixed(1) + 's. Only the first ' + effectiveDur.toFixed(0) + 's will be processed. Trim your selection to max 8s for best results.';
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
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var machineId = getMachineFingerprint();
  if (machineId) headers['X-Machine-ID'] = machineId;
  return Object.assign(headers, extra || {});
}

async function apiFetch(path, options) {
  var res = await fetch(API_BASE + path,
    Object.assign({ headers: apiHeaders() }, options || {}));
  // 401 or 403 = session expired / Vercel deployment invalidated session
  if (res.status === 401 || res.status === 403) {
    clearSession();
    logout();
    throw new Error('Session expired. Please sign in again.');
  }
  var json = await res.json().catch(function () { return { error: 'HTTP ' + res.status }; });
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

// ─── Enhance chip label helpers ───────────────────────────────────────────────

var _enhanceSuggestMap = {
  background: 'Suggest BG',
  relight:    'Suggest lighting',
  vfx:        'Suggest effect',
  omni:       'Suggest effect',
};

/** Returns the correct chip label based on textarea content and current mode. */
function getEnhanceLabel() {
  var ta = el('mf-prompt');
  if (ta && ta.value.trim()) return 'Enhance';
  return _enhanceSuggestMap[selectedMode] || 'Suggest';
}

/** Updates the chip label to match textarea content + mode. */
function updateEnhanceLabel() {
  var lbl = el('compile-label');
  if (lbl) lbl.textContent = getEnhanceLabel();
}

// ─── Compile Prompt ───────────────────────────────────────────────────────────

async function compilePrompt() {
  console.log('[Prysmor:enhance] ENHANCE CLICKED');
  var textarea = el('mf-prompt');
  var raw      = textarea.value.trim();
  var btn      = el('btn-compile-prompt');
  var lbl      = el('compile-label');

  // If a job exists (video uploaded), use scene-aware enhance
  if (state.mf.jobId) {
    btn.disabled = true;
    btn.classList.add('enhancing');
    lbl.textContent = 'Checking…';

    try {
      // Use whatever the user typed as intent, or ask for one if empty
      var intent = raw || 'make it cinematic and dramatic';

      var enhanceBody = { intent: intent, mode: selectedMode };
      var res = await fetch(API_BASE + '/api/v1/motionforge/jobs/' + state.mf.jobId + '/enhance-prompt', {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify(enhanceBody),
      });
      var json = await res.json().catch(function () { return {}; });

      if (res.status === 401) {
        logout();
        showToast('Session expired. Please sign in again', 'error');
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
      lbl.textContent = getEnhanceLabel();
    } finally {
      btn.disabled = false;
      btn.classList.remove('enhancing');
    }
    return;
  }

  // No job yet — use the top-level enhance-prompt endpoint (no job ID required).
  if (!raw) {
    showToast('Enter a prompt first', 'error');
    textarea.focus();
    return;
  }

  btn.disabled = true;
  btn.classList.add('enhancing');
  lbl.textContent = 'Enhancing…';

  try {
    var enhanceBody2 = { prompt: raw, mode: selectedMode };
    console.log('[Prysmor:enhance] no-job path — mode:', selectedMode);

    var res2 = await fetch(API_BASE + '/api/v1/motionforge/enhance-prompt', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify(enhanceBody2),
    });
    var json2 = await res2.json().catch(function () { return {}; });

    if (res2.status === 401) {
      logout();
      showToast('Session expired. Please sign in again', 'error');
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
    lbl.textContent = getEnhanceLabel();
  } finally {
    btn.disabled = false;
    btn.classList.remove('enhancing');
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

      // Scale to 1920x1080 (fit inside, no crop) — consistent 1080p for Runway reference images.
      // force_original_aspect_ratio=decrease ensures content is never cropped;
      // pad fills any gap (only visible for non-16:9 clips) so output is always exactly 1920x1080.
      var args = [
        '-ss', String(parseFloat((timeSec || 0).toFixed(6))),
        '-i',  sourcePath,
        '-vframes', '1',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
        '-q:v', '2',
        '-y', outPath,
      ];

      var proc = cp.spawn(ffmpegBin, args, { windowsHide: true });
      proc.on('close', function (code) {
        try {
          var nfs = require('fs');
          if (code === 0 && nfs.existsSync(outPath)) {
            var data = nfs.readFileSync(outPath);
            var b64  = data.toString('base64');


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
 * Computes a sharpness score for a base64 JPEG using Canvas pixel variance.
 * Higher variance = more detail/edges = sharper frame.
 * Downsamples to 25% before analysis for speed.
 */
function computeFrameSharpness(base64Jpeg) {
  return new Promise(function (resolve) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var scale  = 0.25;
          var canvas = document.createElement('canvas');
          canvas.width  = Math.max(1, Math.round(img.width  * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          var sum = 0, sumSq = 0, n = 0;
          for (var i = 0; i < pixels.length; i += 4) {
            var gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            sum   += gray;
            sumSq += gray * gray;
            n++;
          }
          var mean     = sum / n;
          var variance = (sumSq / n) - (mean * mean);
          resolve(variance);
        } catch (_) { resolve(0); }
      };
      img.onerror = function () { resolve(0); };
      img.src = 'data:image/jpeg;base64,' + base64Jpeg;
    } catch (_) { resolve(0); }
  });
}

/**
 * Captures 10 frames evenly distributed across the middle 70% of a clip,
 * scores each for sharpness, and returns the 5 sharpest.
 *
 * - Skips first 15% and last 15% of clip (avoid fades/cuts)
 * - Uses Canvas pixel variance as sharpness proxy
 * - Captures in parallel for speed
 *
 * @param {string} sourcePath  - full path to the video file
 * @param {number} mediaInSec  - in-point offset within the file (seconds)
 * @param {number} durationSec - clip duration (seconds)
 * @returns {Promise<string[]>} up to 5 base64 JPEG strings, sharpest first
 */
async function captureMultipleFrames(sourcePath, mediaInSec, durationSec) {
  var SAMPLE_COUNT  = 5;
  var KEEP_COUNT    = 5;
  // For short clips reduce the skip margins so we don't waste too much of the clip.
  // Clips < 3s: no skip. Clips 3-6s: 5% each end. Longer: 10% each end.
  var SKIP_START = durationSec < 3 ? 0 : durationSec < 6 ? 0.05 : 0.10;
  var SKIP_END   = SKIP_START;

  // Build evenly spaced timestamps within the usable range of clip
  var usable    = durationSec * (1 - SKIP_START - SKIP_END);
  var startOff  = durationSec * SKIP_START;
  var timestamps = [];
  for (var i = 0; i < SAMPLE_COUNT; i++) {
    var frac = SAMPLE_COUNT > 1 ? i / (SAMPLE_COUNT - 1) : 0.5;
    timestamps.push(mediaInSec + startOff + frac * usable);
  }

  console.log('[Prysmor:multiframe] capturing ' + SAMPLE_COUNT + ' candidate frames across middle 70% of clip');

  // Capture all frames in parallel
  var captured = await Promise.all(
    timestamps.map(function (t, idx) {
      return captureFrameViaFFmpeg(sourcePath, t)
        .catch(function () { return null; })
        .then(function (b64) { return b64 ? { b64: b64, idx: idx, t: t } : null; });
    })
  );

  var valid = captured.filter(function (f) { return f !== null; });
  console.log('[Prysmor:multiframe] ' + valid.length + '/' + SAMPLE_COUNT + ' frames captured, scoring sharpness…');

  // Score sharpness for each frame
  var scored = await Promise.all(
    valid.map(function (f) {
      return computeFrameSharpness(f.b64).then(function (score) {
        console.log('[Prysmor:multiframe] frame idx=' + f.idx + ' t=' + f.t.toFixed(2) + 's sharpness=' + score.toFixed(1));
        return { b64: f.b64, score: score };
      });
    })
  );

  // Sort descending by sharpness, keep top N (or all if fewer available)
  scored.sort(function (a, b) { return b.score - a.score; });
  var top = scored.slice(0, KEEP_COUNT);

  console.log('[Prysmor:multiframe] top ' + top.length + '/' + scored.length +
    ' sharpest frames selected (scores: ' +
    top.map(function (f) { return f.score.toFixed(0); }).join(', ') + ')');

  return top.map(function (f) { return f.b64; });
}

// Captures a thumbnail for display and reads sequence dimensions when a clip is loaded.
// Frame capture for AI is removed — only used for UI thumbnail now.
async function captureClipReferenceFrame(sourcePath) {
  storedVideoInfo = null;

  // Normalise path early — handles macOS file:// URLs and %20 encoding
  sourcePath = normalisePath(sourcePath);

  var mediaIn  = (state.mf.selInfo && state.mf.selInfo.mediaInSec)  || 0;
  var duration = (state.mf.selInfo && state.mf.selInfo.durationSec) || 8;

  // ── Capture one frame just for the thumbnail ─────────────────────────────
  try {
    var frames = await captureMultipleFrames(sourcePath, mediaIn, duration);
    if (frames.length > 0) {
      showClipThumbnail(frames[0]);
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
    var freshInfo = clipInfoFromEval(freshRaw);
    if (freshInfo && !freshInfo.error) {
      // Prefer clip source dimensions (actual media res); fall back to sequence dims
      seqW = Number(freshInfo.clipWidth  || freshInfo.seqWidth)  || 0;
      seqH = Number(freshInfo.clipHeight || freshInfo.seqHeight) || 0;
      console.log('[Prysmor:aspectRatio] clipWidth=' + freshInfo.clipWidth +
        ' clipHeight=' + freshInfo.clipHeight +
        ' seqWidth=' + freshInfo.seqWidth + ' seqHeight=' + freshInfo.seqHeight +
        ' → using ' + seqW + 'x' + seqH);
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

  if (!state.mf.selInfo) {
    await refreshClipAsync(true);
  }
  if (!state.mf.selInfo) {
    showToast('Place playhead on a video clip, then tap Sync clip above.', 'error');
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
  // Any aspect ratio is allowed — extractAndPrepareClip letterboxes to 1920x1080, content never cropped.
  if (storedVideoInfo.width > 0 && storedVideoInfo.height > 0) {
    var aspectRatio = storedVideoInfo.width / storedVideoInfo.height;
    console.log('[Prysmor:aspectRatio] ratio=' + aspectRatio.toFixed(4) + ' — will be normalised to 16:9 by ffmpeg');
  }

  state.mf.replaceMode = replaceMode;
  hideNoCreditsMessage();
  var costPrev = el('gen-cost-preview');
  if (costPrev) costPrev.style.display = 'none';
  setGenerating(true);
  setStatus('Starting…', 5);

  // ── Step 1: Create job (deducts credits atomically on server) ────────────
  let jobId;
  var clipDurSec = (state.mf.selInfo && state.mf.selInfo.durationSec) || 8;
  try {
    const created = await apiFetch('/api/v1/motionforge/jobs', {
      method:  'POST',
      headers: apiHeaders({
        'Content-Type':    'application/json',
        'X-Clip-Duration': clipDurSec.toFixed(6),
        'X-Mode':          selectedMode,
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
  clipDurSec     = parseFloat((state.mf.selInfo.durationSec || 8).toFixed(6));
  var sourcePath = normalisePath(state.mf.selInfo.sourcePath);

  console.log('[Prysmor:selInfo] mediaInSec  :', mediaInSec);
  console.log('[Prysmor:selInfo] clipDurSec  :', clipDurSec);
  console.log('[Prysmor:selInfo] startTimeSec:', state.mf.selInfo.startTimeSec);
  console.log('[Prysmor:selInfo] sourcePath (raw) :', state.mf.selInfo.sourcePath);
  console.log('[Prysmor:selInfo] sourcePath (norm):', sourcePath);
  console.log('[Prysmor:selInfo] full        :', JSON.stringify(state.mf.selInfo));

  // ── Step 2: Get pre-signed upload URL (Beeble for bg/relight, Runway for vfx) ──
  setStatus('Preparing upload…', 12);
  var uploadSlot;
  try {
    uploadSlot = await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/upload-url?mode=' + encodeURIComponent(selectedMode));
  } catch (err) {
    return fail('Upload init failed: ' + err.message);
  }


    // ── Extract + prepare clip ─────────────────────────────────────────────
    // Extracts the selected segment, crops to 16:9 from centre, and scales
    // to 1920×1080 — any input aspect ratio is handled automatically.
    // On failure: falls back to reading the full source file unchanged.
    setStatus('Extracting clip…', 14);
    var extractionSucceeded = false;
    var preparedTmpPath     = null;
    var preparedVideoWidth  = 0;
    var preparedVideoHeight = 0;
    var fileBase64;
    try {
      var extractDurSec = selectedMode === 'vfx' ? runwayExtractDurationSec(clipDurSec) : clipDurSec;
      var extractResult = await extractAndPrepareClip(sourcePath, mediaInSec, extractDurSec);
      preparedTmpPath     = extractResult.path;
      preparedVideoWidth  = extractResult.width  || 0;
      preparedVideoHeight = extractResult.height || 0;
      if (extractResult.durationSec > 0) {
        clipDurSec = extractResult.durationSec;
      } else if (extractDurSec > clipDurSec) {
        clipDurSec = extractDurSec;
      }
      console.log('[Prysmor] Extracted segment: mediaIn=' + mediaInSec + 's dur=' + clipDurSec + 's → ' + preparedTmpPath +
        '  dims=' + preparedVideoWidth + 'x' + preparedVideoHeight);
      setStatus('Reading clip…', 20);
      fileBase64 = await readFileBase64(preparedTmpPath);
      extractionSucceeded = true;
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
      console.warn('[Prysmor] Falling back to full source file');
      setStatus('Reading clip…', 20);
      try {
        fileBase64 = await readFileBase64(sourcePath);
      } catch (readErr) {
        return fail('Cannot read clip: ' + readErr.message);
      }
    }

    setStatus('Uploading clip…', 28);
    try {
      var blob = base64ToBlob(fileBase64, 'video/mp4');
      var uploadRes;

      if (uploadSlot.uploadMethod === 'blob-direct') {
        // ── Vercel Blob direct upload (Omni mode) ─────────────────────────
        // Upload straight to Vercel Blob CDN — no 4.5 MB serverless limit.
        // Encode each path segment individually — don't encode the '/' separator
        var blobUrl = 'https://blob.vercel-storage.com/' +
          uploadSlot.blobPathname.split('/').map(encodeURIComponent).join('/');
        uploadRes = await fetch(blobUrl, {
          method:  'PUT',
          headers: {
            'Authorization': 'Bearer ' + uploadSlot.blobClientToken,
            'x-content-type': 'video/mp4',
            'Content-Type':   'video/mp4',
          },
          body: blob,
        });
        if (!uploadRes.ok) {
          var errText = await uploadRes.text().catch(function () { return ''; });
          throw new Error('Upload HTTP ' + uploadRes.status + (errText ? ': ' + errText.slice(0, 200) : ''));
        }
        // Vercel Blob returns JSON with the public URL
        var blobData = await uploadRes.json().catch(function () { return {}; });
        uploadSlot.kieAssetUrl = blobData.url || ('https://blob.vercel-storage.com/' + uploadSlot.blobPathname);

      } else if (uploadSlot.uploadMethod === 'put') {
        // For Beeble: PUT to external S3 (no auth headers — they invalidate presigned URLs)
        uploadRes = await fetch(uploadSlot.uploadUrl, {
          method:  'PUT',
          headers: { 'Content-Type': 'video/mp4' },
          body:    blob,
        });
        if (!uploadRes.ok && uploadRes.status !== 204) {
          var errText = await uploadRes.text().catch(function () { return ''; });
          throw new Error('Upload HTTP ' + uploadRes.status + (errText ? ': ' + errText.slice(0, 120) : ''));
        }

      } else {
        // Runway: multipart FormData POST to S3
        var formData = new FormData();
        var fields = uploadSlot.fields || {};
        Object.keys(fields).forEach(function (k) { formData.append(k, fields[k]); });
        formData.append('file', blob, 'clip.mp4');
        uploadRes = await fetch(uploadSlot.uploadUrl, { method: 'POST', body: formData });
        if (!uploadRes.ok && uploadRes.status !== 204) {
          var errText = await uploadRes.text().catch(function () { return ''; });
          throw new Error('Upload HTTP ' + uploadRes.status + (errText ? ': ' + errText.slice(0, 120) : ''));
        }
      }

    } catch (err) {
      return fail('Upload failed: ' + err.message);
    }

  // ── Step 4: Notify server that upload is complete ─────────────────────────
  setStatus('Uploading clip…', 36);
  try {
    var completeBody = { mediaInSec: mediaInSec, clipDurSec: clipDurSec };
    if (uploadSlot.beebleUri) {
      completeBody.beebleUri = uploadSlot.beebleUri;
    } else if (uploadSlot.kieAssetUrl) {
      completeBody.kieAssetUrl = uploadSlot.kieAssetUrl;
    } else {
      completeBody.runwayUri = uploadSlot.runwayUri;
    }
    await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/upload-complete', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify(completeBody),
    });
  } catch (err) {
    return fail('Upload confirm failed: ' + err.message);
  }

  // ── Step 4: Start AI generation ──────────────────────────────────────────
  setStatus('Starting effect generation…', 38);
  try {
    var genBody = { prompt: prompt, mode: selectedMode };
    genBody.clipDuration = clipDurSec;
    // Send user-uploaded reference image for background and relight modes
    if (storedReferenceImage && (selectedMode === 'background' || selectedMode === 'relight')) genBody.referenceImage = storedReferenceImage;
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
      await downloadAndInsert(job.outputUrl, sel ? sel.startTimeSec : 0, state.mf.replaceMode, (state.mf.selInfo && state.mf.selInfo.durationSec) || 0);
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

async function downloadAndInsert(outputUrl, startTimeSec, replaceMode, clipDurSec) {
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
    setStatus('Done. Preview ready', 100);
    showResult(blobUrl || outputUrl);
    showToast('Preview ready. cep.fs not available. Insert manually via Insert on V2 button.', 'info');
    return;
  }

  // Resolve temp directory — prefer extension's panel/temp folder, fall back to OS temp dir
  var tmpDir = state.mf.tempDir || '';
  if (!tmpDir) {
    // Try to use Node.js os.tmpdir() for a reliable writable path (works on both Win + Mac)
    try { tmpDir = require('os').tmpdir(); } catch (_) {}
  }
  if (!tmpDir) {
    tmpDir = state._extRoot + '/panel/temp';
  }
  // Ensure the temp directory exists before writing
  try {
    var _nfs = require('fs');
    if (!_nfs.existsSync(tmpDir)) {
      _nfs.mkdirSync(tmpDir, { recursive: true });
      console.log('[Prysmor] created tmpDir:', tmpDir);
    }
  } catch (_mkErr) {
    console.warn('[Prysmor] could not create tmpDir:', tmpDir, _mkErr.message);
  }

  const outPath = tmpDir + (tmpDir.endsWith('/') || tmpDir.endsWith('\\') ? '' : '/') + 'mf-output-' + Date.now() + '.mp4';
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
    throw new Error('Could not save to disk (cep.fs err=' + wr.err + ', path=' + outPath + '). Preview shown. Use Insert button to retry.');
  }

  // ── ffmpeg post-process: ensure output is 1920×1080 ──────────────────────────
  // We always upload 1920×1080 to Runway, so its output is always 16:9.
  // Target is ALWAYS 1920×1080 — never use storedVideoInfo dimensions here because
  // the original clip may be a different ratio (2.39:1, 4:3, vertical…) which would
  // stretch the 16:9 Runway output if we tried to scale it back to those dimensions.
  var finalPath = outPath;
  var TARGET_W = 1920;
  var TARGET_H = 1080;

  // Probe Runway output — decide whether we need scale and/or duration trim.
  var runwayDims = await probeVideoDimensionsFfmpeg(outPath).catch(function () { return null; });
  var needsScale = !(runwayDims && runwayDims.width === TARGET_W && runwayDims.height === TARGET_H);
  // Trim output to match original clip duration (Runway may generate 5 or 10s regardless of input)
  var trimSec = (typeof clipDurSec === 'number' && clipDurSec > 0) ? clipDurSec : 0;

  // Post-process: generate TWO files:
  //   1. video-only MP4  (-an)  → placed on V2
  //   2. silent AAC file        → placed on A1 separately, so overwriteClip on A1
  //      only puts audio there and never touches V1.
  // Using a single file with video+silent-audio caused Premiere to also overwrite V1
  // when we called audioTracks[0].overwriteClip(), deleting the original clip.
  {
    var ts = Date.now();
    var sep = (tmpDir.endsWith('/') || tmpDir.endsWith('\\')) ? '' : '/';
    var processedPath  = tmpDir + sep + 'mf-processed-' + ts + '.mp4';
    var silentAacPath  = tmpDir + sep + 'mf-silence-'   + ts + '.aac';
    var ffmpegBin = getFFmpegBin();

    setStatus('Processing video\u2026', 98);

    // ── Step 1: video-only ───────────────────────────────────────────────────
    var postDone = await new Promise(function (resolve) {
      try {
        var spawn = require('child_process').spawn;
        var args = ['-y', '-i', outPath];
        if (trimSec > 0) { args.push('-t', String(parseFloat(trimSec.toFixed(6)))); }
        if (needsScale) {
          console.log('[Prysmor:postprocess] scale to 1920x1080 + strip audio');
          args.push('-vf', 'scale=1920:1080', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-an');
        } else {
          console.log('[Prysmor:postprocess] stream copy + strip audio');
          args.push('-c:v', 'copy', '-an');
        }
        args.push(processedPath);
        console.log('[Prysmor:postprocess] video args:', args.join(' '));
        var proc = spawn(ffmpegBin, args);
        var stderr = '';
        proc.stderr.on('data', function (d) { stderr += d.toString(); });
        proc.on('close', function (code) {
          if (code === 0) {
            var nfs = require('fs');
            if (nfs.existsSync(processedPath)) {
              try { nfs.unlinkSync(outPath); } catch (_) {}
              resolve(processedPath);
            } else { resolve(null); }
          } else {
            console.warn('[Prysmor:postprocess] video ffmpeg exit', code, stderr.slice(-400));
            resolve(null);
          }
        });
        proc.on('error', function (err) { console.warn('[Prysmor:postprocess] video spawn error:', err.message); resolve(null); });
      } catch (e) { console.warn('[Prysmor:postprocess] video exception:', e.message); resolve(null); }
    });

    if (postDone) {
      finalPath = postDone;
      console.log('[Prysmor:postprocess] video-only ready:', finalPath);
    } else {
      console.warn('[Prysmor:postprocess] video ffmpeg failed — using raw output');
    }

    // ── Step 2: silent AAC (exact same duration) ─────────────────────────────
    // Duration: prefer trimSec, fall back to runwayDims probe (usually 5 or 10s).
    var silDur = trimSec > 0 ? trimSec : 10;
    var silenceDone = await new Promise(function (resolve) {
      try {
        var spawn2 = require('child_process').spawn;
        var sArgs = [
          '-y', '-f', 'lavfi', '-i', 'aevalsrc=0:c=stereo',
          '-t', String(parseFloat(silDur.toFixed(6))),
          '-c:a', 'aac', '-ar', '44100', '-ac', '2',
          silentAacPath
        ];
        console.log('[Prysmor:postprocess] silence args:', sArgs.join(' '));
        var sProc = spawn2(ffmpegBin, sArgs);
        sProc.on('close', function (code) {
          var nfs2 = require('fs');
          resolve(code === 0 && nfs2.existsSync(silentAacPath) ? silentAacPath : null);
        });
        sProc.on('error', function () { resolve(null); });
      } catch (e) { resolve(null); }
    });

    state.mf.silentAudioPath = silenceDone || null;
    console.log('[Prysmor:postprocess] silent audio:', state.mf.silentAudioPath);
  }

  state.mf.outputPath  = finalPath;
  state.mf.startTimeSec = startTimeSec; // store for "Add to Timeline" button

  // ── Extract first frame from output for Before/After slider ──────────────
  setStatus('Processing result\u2026', 98);
  try {
    var afterFramePath = tmpDir + (tmpDir.endsWith('/') || tmpDir.endsWith('\\') ? '' : '/') + 'mf-after-' + Date.now() + '.jpg';
    var ffmpegBinAf    = getFFmpegBin();
    await new Promise(function (resolveAf) {
      try {
        var spawnAf = require('child_process').spawn;
        var procAf  = spawnAf(ffmpegBinAf, ['-y', '-i', finalPath, '-vframes', '1', '-q:v', '2', afterFramePath]);
        procAf.on('close', resolveAf);
        procAf.on('error', resolveAf);
      } catch (_) { resolveAf(); }
    });
    var nfsAf = require('fs');
    if (nfsAf.existsSync(afterFramePath)) {
      state.mf.resultAfterBase64 = nfsAf.readFileSync(afterFramePath).toString('base64');
      console.log('[Prysmor] after-frame extracted:', afterFramePath);
      try { nfsAf.unlinkSync(afterFramePath); } catch (_) {}
    }
  } catch (afErr) {
    console.warn('[Prysmor] after-frame extract failed:', afErr.message);
  }

  setStatus('Done!', 100);
  console.log('[Prysmor] processing done, showing before/after result');
  showResult(null);

  // Do NOT delete finalPath immediately — Premiere needs time to import it.
  // OS temp cleanup handles stale files on next boot.
  // Only delete the intermediate outPath if ffmpeg produced a processed version.
  if (finalPath !== outPath) {
    setTimeout(function () {
      try {
        var nfs = require('fs');
        if (nfs.existsSync(outPath)) {
          nfs.unlinkSync(outPath);
          console.log('[Prysmor:postprocess] raw temp cleaned up:', outPath);
        }
      } catch (_) {}
    }, 30000); // wait 30s so Premiere has finished reading
  }
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
  var btn   = el('mf-btn-generate');
  var lbl   = el('gen-btn-label');
  var pline = el('v2-gen-pline');
  var lock  = el('mf-generation-lock');
  var mainView = el('view-main');

  if (lock) {
    lock.classList.toggle('active', active);
    lock.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) lock.focus();
  }
  if (mainView) mainView.setAttribute('aria-busy', active ? 'true' : 'false');
  if (active) {
    var settings = el('section-settings');
    var history = el('section-history');
    if (settings) settings.classList.remove('settings-visible');
    if (history) history.classList.remove('history-visible');
  }

  if (btn) {
    btn.disabled = active; // disabled while generating so double-clicks are blocked
    btn.classList.toggle('v2-generating', active);
  }

  if (active) {
    // Show generating state in button
    if (lbl)   lbl.textContent = 'Generating\u2026 0%';
    if (pline) pline.style.width = '0%';
    // Hide cost badge while generating
    var costBadge = el('gen-btn-cost');
    if (costBadge) costBadge.style.display = 'none';

    // Hide result and error when starting a new generation
    var rs = el('mf-section-result');
    if (rs) rs.classList.add('hidden');
    var failEl = el('mf-gen-failed');
    if (failEl) failEl.classList.add('hidden');

    // Reset legacy progress state (hidden compat elements)
    _displayPct      = 0;
    _progressHistory = [];
    var fill = el('gp-fill'); if (fill) fill.style.width = '0%';
    var pct  = el('gp-pct');  if (pct)  pct.textContent  = '0%';
    var est  = el('gp-estimate'); if (est) est.textContent = '';
    var plbl = el('gp-phase-label'); if (plbl) plbl.textContent = 'Starting\u2026';

    startElapsedTimer();
    setStage('upload'); // compat shim
  } else {
    // Restore button to normal state
    if (lbl)   lbl.textContent = '\u25b6 Generate Effect';
    if (pline) pline.style.width = '0%';
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
  var lockStatus = el('mf-generation-lock-status');
  var lockFill = el('mf-generation-lock-fill');
  var lockPercent = el('mf-generation-lock-percent');
  var lockPct = pct != null ? Math.round(Math.min(Math.max(pct, 0), 100)) : null;
  if (lockStatus) lockStatus.textContent = text;
  if (lockFill && lockPct != null) lockFill.style.width = lockPct + '%';
  if (lockPercent) lockPercent.textContent = lockPct != null ? lockPct + '%' : '';

  // ── Update the generate button inline during generation ──────────────────
  if (state.mf.generating) {
    var genLbl  = el('gen-btn-label');
    var genPline = el('v2-gen-pline');
    if (genLbl) {
      var pctNum = pct != null ? Math.round(Math.min(Math.max(pct, 0), 100)) : null;
      genLbl.textContent = text + (pctNum != null ? ' ' + pctNum + '%' : '');
    }
    if (genPline && pct != null) {
      var clampedP = Math.min(Math.max(pct, 0), 100);
      if (clampedP >= _displayPct) genPline.style.width = clampedP + '%';
    }
  }

  // ── Legacy hidden compat elements ────────────────────────────────────────
  var lbl = el('gp-phase-label');
  if (lbl) lbl.textContent = text;

  if (pct != null) {
    var clamped = Math.min(Math.max(pct, 0), 100);
    if (clamped >= _displayPct) {
      _displayPct = clamped;
      var fill = el('gp-fill');
      if (fill) fill.style.width = clamped + '%';
      var pctLbl = el('gp-pct');
      if (pctLbl) pctLbl.textContent = Math.round(clamped) + '%';

      _progressHistory.push({ t: Date.now(), pct: clamped });
      if (_progressHistory.length > 8) _progressHistory.shift();
      updateETA(clamped);
    }
    var clamped2 = Math.min(Math.max(pct, 0), 100);
    var oldBar = el('mf-gen-bar'); if (oldBar) oldBar.style.width = clamped2 + '%';
    var oldPct = el('mf-gen-pct'); if (oldPct) oldPct.textContent = Math.round(clamped2) + '%';
    var oldTxt = el('mf-status-text'); if (oldTxt) oldTxt.textContent = text;
    if (clamped2 < 38)       setStage('upload');
    else if (clamped2 < 97)  setStage('generate');
    else                     setStage('done');
  }
}

function sanitizePanelError(msg) {
  if (!msg) return 'Generation failed. Please try again.';
  var s = String(msg);
  s = s.replace(/^Generation failed to start:\s*/i, '');
  s = s.replace(/^Failed to create job:\s*/i, '');
  s = s.replace(/^Upload (init|confirm )?failed:\s*/i, '');
  s = s.replace(/\{[\s\S]*\}/g, ' ').replace(/https?:\/\/\S+/gi, ' ').trim();
  s = s.replace(/VFX generation failed\s*\(\d+\)\s*:?/gi, ' ').trim();
  s = s.replace(/\brunway(ml)?\b/gi, ' ').trim();
  s = s.replace(/\bAI provider\b/gi, 'safety filter');
  s = s.replace(/\s*[\u2014—]\s*/g, '. ');

  var r = s.toLowerCase();
  if (r.includes('not enough credits') && !r.includes('upgrade')) {
    return 'Effect engine is temporarily unavailable. Please try again later.';
  }
  if (r.includes('moderation') || r.includes('safety') || r.includes('content policy') || r.includes('blocked your footage')) {
    if (r.includes('footage') || r.includes('clip') || r.includes('media') || r.includes('frame')) {
      return 'Your clip was blocked by the safety filter. Try a different frame, avoid tight face close-ups, or use a wider shot.';
    }
    if (r.includes('prompt')) {
      return 'Your prompt was blocked by the safety filter. Use neutral wording without violence, weapons, nudity, names, or brands.';
    }
    return 'This request was blocked by the safety filter. Try a different clip and a neutral prompt.';
  }
  return s || 'Generation failed. Please try again.';
}

function fail(msg) {
  stopMfPolling();
  setGenerating(false);

  // Show inline error card
  var failEl  = el('mf-gen-failed');
  var failMsg = el('gen-fail-msg');
  if (failEl)  failEl.classList.remove('hidden');
  if (failMsg) failMsg.textContent = sanitizePanelError(msg);

  showToast(msg, 'error');
}

function showResult(videoUrl) {
  var sec = el('mf-section-result');
  if (!sec) return;
  sec.classList.remove('hidden');

  var previewImg   = el('result-preview-img');
  var previewVideo = el('result-preview-video');

  if (videoUrl && previewVideo) {
    // Show video playback
    previewVideo.src = videoUrl;
    previewVideo.classList.remove('hidden');
    if (previewImg) previewImg.classList.add('hidden');
  } else if (state.mf.resultAfterBase64 && previewImg) {
    // Show first-frame still image from AI output
    previewImg.src = 'data:image/jpeg;base64,' + state.mf.resultAfterBase64;
    previewImg.classList.remove('hidden');
    if (previewVideo) { previewVideo.classList.add('hidden'); previewVideo.src = ''; }
  } else {
    // Nothing available yet — hide both
    if (previewImg)  previewImg.classList.add('hidden');
    if (previewVideo) { previewVideo.classList.add('hidden'); previewVideo.src = ''; }
  }

  // Enable/disable Add to Timeline button based on whether local file exists
  var addBtn = el('btn-add-to-timeline');
  if (addBtn) addBtn.disabled = !state.mf.outputPath;

  sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setGenerating(false);
}

function resetUI() {
  setGenerating(false);
  setStatus('Ready', 0);
  showClipEmpty();
  const rs = el('mf-section-result'); if (rs) rs.classList.add('hidden');
  const p  = el('mf-prompt');         if (p) p.value = '';
  const cc = el('mf-char-count');     if (cc) cc.textContent = '0';
}

// ─── Add to Timeline ──────────────────────────────────────────────────────────

async function addToTimeline() {
  var finalPath    = state.mf.outputPath;
  var replaceMode  = state.mf.replaceMode;
  var startTimeSec = state.mf.startTimeSec || (state.mf.selInfo && state.mf.selInfo.startTimeSec) || 0;

  // History "Use" case: outputUrl is set but outputPath is not yet downloaded to disk
  if (!finalPath && state.mf.outputUrl) {
    showToast('Downloading clip\u2026', 'info');
    try {
      await downloadAndInsert(state.mf.outputUrl, startTimeSec, replaceMode, (state.mf.selInfo && state.mf.selInfo.durationSec) || 0);
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
    return;
  }

  if (!finalPath) {
    showToast('Generate a clip first', 'error');
    return;
  }

  var btn = el('btn-add-to-timeline');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding\u2026'; }

  const esc = finalPath.replace(/\\/g, '/').replace(/"/g, '\\"');
  console.log('[Prysmor] addToTimeline — path:', finalPath, 'replaceMode:', replaceMode, 'startTimeSec:', startTimeSec);

  await new Promise(function (resolve) {
    var fn;
    if (replaceMode) {
      // Replace mode: place on V2 via replaceSelection, then also silence A1
      // using the dedicated silent AAC file (different file from the video-only clip).
      var silPathR = (state.mf.silentAudioPath || '').replace(/\\/g, '/').replace(/"/g, '\\"');
      fn = '(function() {' +
        'try {' +
        'var result = replaceSelection("' + esc + '");' +
        (silPathR ? (
          'if (result === "success") {' +
          '  try {' +
          '    var seq2 = app.project.activeSequence;' +
          '    app.project.importFiles(["' + silPathR + '"], true, app.project.rootItem, false);' +
          '    var silR = findProjectItemByPath(app.project.rootItem, "' + silPathR + '");' +
          '    if (!silR) { var sn="' + silPathR + '".split("/").pop(); silR=findProjectItemByName(app.project.rootItem,sn); }' +
          '    if (silR && seq2 && seq2.audioTracks.numTracks > 0) {' +
          '      var a1r = seq2.audioTracks[0];' +
          '      if (a1r && a1r.overwriteClip) { a1r.overwriteClip(silR, ' + startTimeSec + '); }' +
          '    }' +
          '  } catch(_) {}' +
          '}') : '') +
        'return result;' +
        '} catch(e) { return "error: " + e.toString(); }' +
        '})()';

    } else {
      // Place VIDEO-ONLY clip on V2. Then separately place a SILENT AAC file on A1.
      // Using two distinct files prevents Premiere from also touching V1 when we
      // call overwriteClip on the audio track (which happened with a combined file).
      var silPath = (state.mf.silentAudioPath || '').replace(/\\/g, '/').replace(/"/g, '\\"');
      fn = '(function() {' +
        'try {' +
        'var seq = app.project.activeSequence;' +
        'if (!seq) return "error: no active sequence";' +
        // Untarget ALL audio tracks so inserting video-only clip on V2 never writes to any A track.
        'var i, n = seq.audioTracks.numTracks;' +
        'for (i = 0; i < n; i++) { try { seq.audioTracks[i].setTargeted(false, false); } catch(_) {} }' +
        'var result = insertClipOnV2("' + esc + '", ' + startTimeSec + ');' +
        'for (i = 0; i < n; i++) { try { seq.audioTracks[i].setTargeted(true,  false); } catch(_) {} }' +
        (silPath ? (
          // Now place the separate silent AAC on A1 only.
          'if (result === "success") {' +
          '  try {' +
          '    app.project.importFiles(["' + silPath + '"], true, app.project.rootItem, false);' +
          '    var silItem = findProjectItemByPath(app.project.rootItem, "' + silPath + '");' +
          '    if (!silItem) {' +
          '      var silName = "' + silPath + '".split("/").pop();' +
          '      silItem = findProjectItemByName(app.project.rootItem, silName);' +
          '    }' +
          '    if (silItem && seq.audioTracks.numTracks > 0) {' +
          '      var a1 = seq.audioTracks[0];' +
          '      if (a1 && a1.overwriteClip) { a1.overwriteClip(silItem, ' + startTimeSec + '); }' +
          '    }' +
          '  } catch(_sil) { /* non-fatal */ }' +
          '}') : '') +
        'return result;' +
        '} catch(e) { return "error: " + e.toString(); }' +
        '})()';
    }

    cs.evalScript(fn, function (r) {
      console.log('[Prysmor] addToTimeline evalScript result:', r);
      if (r && (r.indexOf('error') === 0 || r.indexOf('Error') === 0)) {
        showToast(r.replace(/^error:\s*/i, ''), 'error');
      } else {
        showToast('AI clip added to timeline!', 'success');
      }
      resolve();
    });
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg> Add to Timeline';
  }
}

// ─── File I/O Helpers ─────────────────────────────────────────────────────────

function readFileBase64(absPath) {
  return new Promise(function (resolve, reject) {
    if (!window.cep || !window.cep.fs) {
      return reject(new Error('cep.fs not available. Run inside Premiere'));
    }
    // Normalise path before passing to cep.fs (handles macOS file:// and %20)
    absPath = normalisePath(absPath);
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

// ─── Auto-Update ──────────────────────────────────────────────────────────────

var VERSION_API = 'https://prysmor.io/api/panel/version';

/**
 * Returns the extension root directory (absolute path, no trailing slash).
 * Handles the macOS case where _extRoot may be missing the leading `/`.
 */
function getUpdateRoot() {
  var root = state._extRoot || '';
  var isWin = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
  if (!isWin && root && root[0] !== '/') root = '/' + root;
  return root;
}

/**
 * Reads version.txt from the panel folder.
 * Falls back to PANEL_VERSION_DEFAULT when file cannot be read (e.g. old installs, browser preview).
 */
function readLocalVersion() {
  if (state._panelVersion) return state._panelVersion;
  try {
    var nodeFs   = require('fs');
    var nodePath = require('path');
    var root = getUpdateRoot();
    var candidates = [
      nodePath.join(root, 'panel', 'version.txt'),
      nodePath.join(root, 'version.txt'),
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (nodeFs.existsSync(candidates[i])) {
        return nodeFs.readFileSync(candidates[i], 'utf8').trim();
      }
    }
  } catch (_) {}
  return PANEL_VERSION_DEFAULT;
}

function renderPanelVersion(ver) {
  if (!ver) return;
  var label = 'v' + ver;
  var lv = el('lv-panel-version');
  var hdr = el('hdr-panel-version');
  if (lv) lv.textContent = label;
  if (hdr) hdr.textContent = label;
}

/** Loads version.txt via HTTP (works in browser preview and CEP panel UI). */
function refreshPanelVersionFromFile() {
  renderPanelVersion(readLocalVersion());
  fetch('version.txt?_=' + Date.now())
    .then(function (res) { return res.ok ? res.text() : ''; })
    .then(function (txt) {
      txt = (txt || '').trim();
      if (!txt) return;
      state._panelVersion = txt;
      renderPanelVersion(txt);
    })
    .catch(function () {});
}

/**
 * Compares two semver strings. Returns true if `remote` is strictly newer.
 */
function isNewerVersion(remote, local) {
  var r = (remote || '0.0.0').split('.').map(Number);
  var l = (local  || '0.0.0').split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    var rv = r[i] || 0, lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

/**
 * Downloads a URL using Node.js https module — bypasses browser CSP/CORS
 * and correctly follows HTTP redirects (GitHub raw always redirects).
 * Returns a Promise<string> with the response body as UTF-8 text.
 */
function nodeHttpGet(url, _redirects) {
  _redirects = _redirects || 0;
  return new Promise(function (resolve, reject) {
    if (_redirects > 10) return reject(new Error('Too many redirects: ' + url));
    try {
      var https = require('https');
      var http  = require('http');
      var mod   = url.startsWith('https://') ? https : http;
      var req   = mod.get(url, { headers: { 'User-Agent': 'Prysmor-Panel/2.4.1' } }, function (res) {
        // Follow redirects (301/302/307/308)
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
          console.log('[Prysmor:update] redirect', res.statusCode, '→', res.headers.location);
          res.resume(); // drain to free socket
          return nodeHttpGet(res.headers.location, _redirects + 1).then(resolve).catch(reject);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end',  function ()  { resolve(Buffer.concat(chunks).toString('utf8')); });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}

/**
 * Downloads new main.js + styles.css via Node.js https (not browser fetch)
 * and writes them to the panel folder, then shows a restart banner.
 */
function applyUpdate(data) {
  console.log('[Prysmor:update] Applying update', data.version, '…');
  var root     = getUpdateRoot();
  var nodeFs   = require('fs');
  var nodePath = require('path');

  console.log('[Prysmor:update] Panel root:', root);

  var jobs = [
    { url: data.main_js_url,    dest: nodePath.join(root, 'panel', 'main.js')    },
    { url: data.styles_css_url, dest: nodePath.join(root, 'panel', 'styles.css') },
    { url: data.index_html_url, dest: nodePath.join(root, 'panel', 'index.html') },
    { url: data.host_jsx_url,   dest: nodePath.join(root, 'panel', 'host.jsx')   },
  ].filter(function (j) { return !!j.url; });

  var pending = jobs.length;
  if (pending === 0) return;

  jobs.forEach(function (job) {
    console.log('[Prysmor:update] Downloading:', job.url, '→', job.dest);
    nodeHttpGet(job.url)
      .then(function (code) {
        nodeFs.writeFileSync(job.dest, code, 'utf8');
        console.log('[Prysmor:update] Written (' + code.length + ' chars):', job.dest);
        pending--;
        if (pending === 0) {
          try {
            var vf = nodePath.join(root, 'panel', 'version.txt');
            nodeFs.writeFileSync(vf, data.version, 'utf8');
            console.log('[Prysmor:update] version.txt updated to', data.version);
          } catch (_) {}
          // OTA updates don't preserve +x on macOS ffmpeg — restore it after panel file writes.
          try {
            var isWin = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
            if (!isWin) {
              var ff = nodePath.join(root, 'panel', 'ffmpeg', 'mac', 'ffmpeg');
              if (nodeFs.existsSync(ff)) {
                nodeFs.chmodSync(ff, 0o755);
                console.log('[Prysmor:update] ffmpeg chmod +x:', ff);
              }
            }
          } catch (e) {
            console.warn('[Prysmor:update] ffmpeg chmod failed:', e.message);
          }
          showUpdateBanner(data.version);
        }
      })
      .catch(function (e) {
        console.warn('[Prysmor:update] Download failed for', job.url, ':', e.message);
        pending--;
        if (pending === 0) {
          showToast('Panel update incomplete. Reinstall from prysmor.io/dashboard', 'error');
        }
      });
  });
}

/**
 * Displays a non-intrusive banner at the top of the panel asking the user
 * to restart Premiere Pro to apply the update.
 */
function showUpdateBanner(version) {
  try {
    var existing = document.getElementById('prysmor-update-banner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.id = 'prysmor-update-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:rgba(0,20,10,0.92)',
      'border-bottom:1px solid rgba(0,230,118,0.25)',
      'backdrop-filter:blur(12px)',
      'padding:9px 14px', 'display:flex', 'align-items:center',
      'justify-content:space-between', 'gap:10px',
    ].join(';');

    var dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#00e676;box-shadow:0 0 6px rgba(0,230,118,0.7);flex-shrink:0;';

    var msg = document.createElement('span');
    msg.style.cssText = 'flex:1;font-size:11.5px;color:rgba(0,230,118,0.9);font-weight:500;letter-spacing:-0.01em;';
    msg.textContent = 'Panel updated to v' + version + '. Restart Premiere to apply.';

    var close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = [
      'background:none', 'border:none', 'color:rgba(240,240,240,0.35)',
      'cursor:pointer', 'font-size:13px', 'padding:0 2px', 'line-height:1',
      'transition:color .15s',
    ].join(';');
    close.onmouseover = function () { close.style.color = 'rgba(240,240,240,0.75)'; };
    close.onmouseout  = function () { close.style.color = 'rgba(240,240,240,0.35)'; };
    close.onclick = function () { banner.style.opacity = '0'; setTimeout(function () { banner.remove(); }, 150); };
    banner.style.transition = 'opacity .15s';

    banner.appendChild(dot);
    banner.appendChild(msg);
    banner.appendChild(close);
    document.body.appendChild(banner);
  } catch (e) {
    console.log('[Prysmor:update] Updated to', version, '— please restart Premiere.');
  }
}

/**
 * Checks for a newer panel version using Node.js https (bypasses browser CSP)
 * and silently downloads + applies it. Called once on DOMContentLoaded.
 */
function checkForUpdates() {
  try { require('fs'); } catch (_) {
    return; // Node.js not available (mock env)
  }
  var localVersion = readLocalVersion();
  console.log('[Prysmor:update] Local version:', localVersion, '| root:', getUpdateRoot());

  nodeHttpGet(VERSION_API)
    .then(function (body) {
      var data;
      try { data = JSON.parse(body); } catch (e) {
        console.warn('[Prysmor:update] Bad JSON from version API:', body.slice(0, 100));
        return;
      }
      if (!data || !data.version) return;
      console.log('[Prysmor:update] Remote version:', data.version);
      if (isNewerVersion(data.version, localVersion)) {
        applyUpdate(data);
      } else {
        console.log('[Prysmor:update] Already up to date (', localVersion, ').');
      }
    })
    .catch(function (e) {
      console.log('[Prysmor:update] Version check failed (offline?):', e.message);
    });
}

/**
 * Manual update check triggered by user pressing "Check for Updates".
 * Shows a toast with the result so the user gets visible feedback.
 */
function manualCheckForUpdates() {
  var localVersion = readLocalVersion();
  showToast('Checking for updates…', 'info');

  nodeHttpGet(VERSION_API)
    .then(function (body) {
      var data;
      try { data = JSON.parse(body); } catch (e) {
        showToast('Could not reach update server. Check your connection.', 'error');
        return;
      }
      if (!data || !data.version) {
        showToast('Update check failed. Invalid response.', 'error');
        return;
      }
      if (isNewerVersion(data.version, localVersion)) {
        showToast('Update available. Downloading v' + data.version + '…', 'info');
        applyUpdate(data);
      } else {
        showToast('Panel is up to date (v' + localVersion + ')', 'success');
      }
    })
    .catch(function () {
      showToast('Update check failed. Check your connection.', 'error');
    });
}

// ─── Path normalisation ───────────────────────────────────────────────────────
/**
 * Normalises a file path returned by Premiere Pro / ExtendScript on any OS.
 *
 * Premiere on macOS can return paths as:
 *   file:///Volumes/...      → /Volumes/...
 *   file://localhost/...     → /...
 *   /path/with%20spaces/...  → /path/with spaces/...
 *
 * Windows paths are left unchanged except for stripping any accidental
 * file:// prefix.
 */
function normalisePath(p) {
  if (!p) return p;
  // 1. URL-decode percent-encoded characters (%20 etc.)
  try { p = decodeURIComponent(p); } catch (_) {}
  // 2. Strip file://localhost (macOS Premiere sometimes uses this)
  p = p.replace(/^file:\/\/localhost/i, '');
  // 3. Strip file:// or file:\ prefix (any number of slashes)
  p = p.replace(/^file:[\/\\]+/i, function (m) {
    // On macOS the result is /absolute/path, on Windows it's C:\...
    // Keep one leading slash for macOS absolute paths
    var isWin = (navigator.platform || '').toLowerCase().indexOf('win') !== -1;
    return isWin ? '' : '/';
  });
  // 4. Normalise path separators via Node.js path (when available)
  try {
    var nodePath = require('path');
    p = nodePath.normalize(p);
  } catch (_) {}
  return p;
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

  if (binExists(bundledBin)) {
    console.log('[Prysmor:ffmpeg] using bundled binary:', bundledBin);
    return bundledBin;
  }

  // On macOS, try `which ffmpeg` to locate system ffmpeg
  if (!isWin) {
    try {
      var cp = require('child_process');
      var which = cp.execSync('which ffmpeg 2>/dev/null', { timeout: 3000 }).toString().trim();
      if (which && nodeFs && nodeFs.existsSync(which)) {
        console.log('[Prysmor:ffmpeg] using system ffmpeg from which:', which);
        return which;
      }
      // Also check Homebrew locations
      var brewPaths = ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/opt/local/bin/ffmpeg'];
      for (var bi = 0; bi < brewPaths.length; bi++) {
        if (nodeFs && nodeFs.existsSync(brewPaths[bi])) {
          console.log('[Prysmor:ffmpeg] using Homebrew ffmpeg:', brewPaths[bi]);
          return brewPaths[bi];
        }
      }
    } catch (_) {}
  }

  console.log('[Prysmor:ffmpeg] bundled not found — falling back to system PATH "ffmpeg"');
  return 'ffmpeg';
}

function runwayExtractDurationSec(durationSec) {
  var d = parseFloat(durationSec) || 0;
  if (d <= 0) return d;
  if (d >= 1.75 && d < 2.1) return 2.1;
  return d;
}

function parseFfmpegDuration(stderr) {
  var m = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

/**
 * Reads width×height and duration from ffmpeg stderr (`ffmpeg -i file`).
 * @returns {Promise<{width:number,height:number,durationSec:number}>}
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
        var width = 0;
        var height = 0;
        var m = stderr.match(/Stream\s+#\d+:\d+(?:\([^)]*\))?:\s*Video:[^\n]*?(\d{2,})x(\d+)/);
        if (!m) m = stderr.match(/Video:[^\n]*?,\s*(\d{2,})x(\d+)/);
        if (m) {
          width = parseInt(m[1], 10);
          height = parseInt(m[2], 10);
        }
        resolve({
          width: width,
          height: height,
          durationSec: parseFfmpegDuration(stderr),
        });
      });
      proc.on('error', function () { resolve({ width: 0, height: 0, durationSec: 0 }); });
    } catch (_) {
      resolve({ width: 0, height: 0, durationSec: 0 });
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

    // Preserve original aspect ratio — NEVER crop content.
    // Runway's only hard limit is max 2.358:1 width:height ratio.
    // Strategy:
    //   1. If clip exceeds 2.358:1, crop the minimum width needed to satisfy Runway.
    //   2. Scale to fit inside 1920×1080 (force_original_aspect_ratio=decrease).
    //   3. Pad to exactly 1920×1080 so Runway always receives a standard frame.
    //      Black bars are added only where the original ratio requires them.
    // Result: 2.39:1 clip → slight width crop to 2.358:1 → 1920×816 → pad → 1920×1080 (132px bars top+bottom)
    //         16:9 clip  → no crop → 1920×1080 → no pad needed
    var filter = [
      "crop='min(iw,ih*2.358)':ih:'(iw-min(iw,ih*2.358))/2':0",
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    ].join(',');

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
          console.log('[Prysmor:extract] probed output:', dims.width + 'x' + dims.height, 'dur=' + (dims.durationSec || 0).toFixed(3) + 's');
          resolve({
            path: outPath,
            width: dims.width,
            height: dims.height,
            durationSec: dims.durationSec || durationSec,
          });
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
    bkEl.textContent = '✕ Offline. Run npm dev';
    bkEl.className   = 'diag-status err';
  });
}

function toggleDiagnostics() {
  var panel     = el('diag-panel');
  var label     = el('btn-diagnostics-label');
  if (!panel) return;
  var nowHidden = panel.classList.toggle('hidden');
  if (label) {
    if (nowHidden) { label.textContent = 'Diagnostics'; }
    else           { populateDiagnostics(); label.textContent = 'Hide Diagnostics'; }
  }
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
  var seconds = Math.floor(credits / creditsPerSecond(selectedMode));
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

  if (icon) icon.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 7L5.5 10.5L12 3.5"/>' +
    '</svg>';
  if (lbl) lbl.textContent = 'Done';
  btn.classList.add('ai-btn--done');

  setTimeout(function () {
    if (icon) icon.innerHTML = prevIcon;
    if (lbl)  lbl.textContent = getEnhanceLabel();
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

  // Clip sync
  el('btn-refresh-clip').addEventListener('click', function () {
    storedVideoInfo = null;
    refreshClip(false);
  });

  // Mark Omni tab based on plan
  (function () {
    var omniTab = el('omni-tab');
    if (!omniTab) return;
    var plan = state.auth.plan || '';
    if (OMNI_PLANS.indexOf(plan) !== -1) {
      omniTab.classList.add('plan-ok');
    } else {
      omniTab.classList.add('plan-locked');
    }
  }());

  // Mode selector pills
  document.querySelectorAll('.mode-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      var mode = this.getAttribute('data-mode');
      // Omni is coming soon — block entirely, don't change active tab
      if (mode === 'omni') {
        showToast('Gemini Omni is coming soon. Stay tuned!', 'info');
        // Keep active highlight on the previously selected tab
        document.querySelectorAll('.mode-pill').forEach(function (p) {
          p.classList.toggle('active', p.getAttribute('data-mode') === selectedMode);
        });
        return;
      }
      selectedMode = mode;
      document.querySelectorAll('.mode-pill').forEach(function (p) { p.classList.remove('active'); });
      this.classList.add('active');
      console.log('[Prysmor] Mode changed to:', selectedMode);
    });
  });

  // Prompt char count + enhance chip label sync
  el('mf-prompt').addEventListener('input', function () {
    el('mf-char-count').textContent = this.value.length;
    updateEnhanceLabel();
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
        : 'Result added on a new V2 track. Your original clip is untouched';
    }

    btnV2.addEventListener('click',      function () { setMode(false); });
    btnReplace.addEventListener('click', function () { setMode(true);  });
  })();

  // Generate
  el('mf-btn-generate').addEventListener('click', mfGenerate);

  // Retry after failure
  var retryBtn = el('gen-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      var failEl = el('mf-gen-failed');
      if (failEl) failEl.classList.add('hidden');
      var genBtn = el('mf-btn-generate');
      if (genBtn) { genBtn.disabled = false; genBtn.classList.remove('v2-generating'); }
      updateCostPreview();
    });
  }

  // Add to Timeline button
  var addBtn = el('btn-add-to-timeline');
  if (addBtn) {
    addBtn.addEventListener('click', function () { addToTimeline(); });
  }

  // Reference image upload
  var refInput   = el('ref-img-input');
  var refLabel   = el('ref-img-label');
  var refPreview = el('ref-img-preview');
  var refThumb   = el('ref-img-thumb');
  var refName    = el('ref-img-name');
  var refClear   = el('ref-img-clear');

  if (refInput) {
    refInput.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        // Strip the data URI prefix — backend expects raw base64
        var comma = dataUrl.indexOf(',');
        storedReferenceImage = comma !== -1 ? dataUrl.slice(comma + 1) : null;
        if (!storedReferenceImage) return;
        if (refThumb)   refThumb.src = dataUrl;
        if (refName)    refName.textContent = file.name;
        if (refLabel)   refLabel.classList.add('hidden');
        if (refPreview) refPreview.classList.remove('hidden');
        console.log('[Prysmor:refImg] Reference image stored, size:', storedReferenceImage.length);
      };
      reader.readAsDataURL(file);
      // Reset input so the same file can be re-selected after clearing
      this.value = '';
    });
  }

  if (refClear) {
    refClear.addEventListener('click', function () {
      storedReferenceImage = null;
      if (refThumb)   refThumb.src = '';
      if (refName)    refName.textContent = '';
      if (refPreview) refPreview.classList.add('hidden');
      if (refLabel)   refLabel.classList.remove('hidden');
      console.log('[Prysmor:refImg] Reference image cleared');
    });
  }

  // New Effect — clear prompt, hide result, keep clip + mode
  el('mf-btn-new-gen').addEventListener('click', function () {
    var rs = el('mf-section-result');
    if (rs) rs.classList.add('hidden');
    // Clear job + result state
    state.mf.jobId             = null;
    state.mf.outputUrl         = null;
    state.mf.rawOutputUrl      = null;
    state.mf.outputPath        = null;
    state.mf.resultAfterBase64 = null;
    // Clear prompt
    var promptEl = el('mf-prompt');
    if (promptEl) { promptEl.value = ''; promptEl.dispatchEvent(new Event('input')); }
    var cc = el('mf-char-count'); if (cc) cc.textContent = '0';
    setGenerating(false);
    if (promptEl) setTimeout(function () { promptEl.focus(); }, 150);
  });

  // Settings — open
  el('btn-scroll-settings').addEventListener('click', function () {
    var overlay = el('section-settings');
    if (overlay) overlay.classList.add('settings-visible');
  });
  // Settings — close (X button + backdrop tap)
  var settingsOverlay = el('section-settings');
  var settingsCloseBtn = el('settings-close-btn');
  if (settingsCloseBtn && settingsOverlay) {
    settingsCloseBtn.addEventListener('click', function () {
      settingsOverlay.classList.remove('settings-visible');
    });
    settingsOverlay.addEventListener('click', function (e) {
      if (e.target === settingsOverlay) settingsOverlay.classList.remove('settings-visible');
    });
  }
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
  // Check for Updates — runs version check and shows result as toast
  el('btn-updates').addEventListener('click', function () {
    manualCheckForUpdates();
  });
  el('link-docs').addEventListener('click', function (e) {
    e.preventDefault();
    cs.openURLInDefaultBrowser(SITE_URL + '/docs');
  });
  el('link-terms').addEventListener('click', function (e) {
    e.preventDefault();
    cs.openURLInDefaultBrowser(SITE_URL + '/terms');
  });

  // Clear auth tokens when the panel page unloads (Premiere closes or panel reloads).
  // Machine fingerprint is intentionally preserved so it is not regenerated each session.
  window.addEventListener('beforeunload', function () {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER_ID);
    localStorage.removeItem(LS_PLAN);
    localStorage.removeItem(LS_PLAN_LABEL);
    localStorage.removeItem(LS_TOKEN_EXP);
    // LS_MACHINE_ID is intentionally kept — no need to regenerate on every open.
  });

  // CEP application lifecycle note:
  // com.adobe.csxs.events.ApplicationDeactivate fires when the user switches *away*
  // from Premiere Pro (focus loss), not on app close — so it is not suitable for
  // clearing tokens. The beforeunload event above reliably fires on panel unload /
  // host-app shutdown and is the correct hook for session cleanup.
}


// ─── Utils ────────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

// ─── Generation History ───────────────────────────────────────────────────────

function loadHistory() {
  var token = localStorage.getItem(LS_TOKEN);
  if (!token) return;

  var loadingEl = el('history-loading');
  var emptyEl   = el('history-empty');
  var errorEl   = el('history-error');
  var errorMsg  = el('history-error-msg');
  var listEl    = el('history-list');

  // Reset state
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (emptyEl)   emptyEl.classList.add('hidden');
  if (errorEl)   errorEl.classList.add('hidden');

  // Remove old cards (keep loading/empty/error elements)
  var old = listEl ? listEl.querySelectorAll('.h-card') : [];
  old.forEach(function (n) { n.remove(); });

  fetch(API_BASE + '/api/v1/motionforge/jobs', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(function (res) { return res.json(); })
  .then(function (data) {
    if (loadingEl) loadingEl.classList.add('hidden');

    if (!data.jobs || data.jobs.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    data.jobs.forEach(function (job) {
      var card = renderHistoryCard(job);
      if (listEl) listEl.appendChild(card);
    });
  })
  .catch(function (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      if (errorMsg) errorMsg.textContent = 'Failed to load history.';
    }
    console.error('[Prysmor:history] fetch error:', err);
  });
}

function renderHistoryCard(job) {
    var modeLabel = { background: 'Background', relight: 'Relight', vfx: 'VFX', omni: 'Omni' }[job.mode] || job.mode || '—';
  var statusClass = { completed: 'h-status-done', failed: 'h-status-fail', generating: 'h-status-gen' }[job.status] || 'h-status-gen';
  var statusLabel = { completed: 'Done', failed: 'Failed', generating: 'Processing', uploading: 'Uploading', created: 'Queued' }[job.status] || job.status;

  // Format date
  var dateStr = '—';
  if (job.createdAt) {
    try {
      var d = new Date(job.createdAt._seconds ? job.createdAt._seconds * 1000 : job.createdAt);
      dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
                d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
  }

  var promptText = job.prompt ? (job.prompt.length > 72 ? job.prompt.slice(0, 70) + '…' : job.prompt) : '(no prompt)';

  var card = document.createElement('div');
  card.className = 'h-card';
  card.innerHTML =
    '<div class="h-card-top">' +
      '<span class="h-mode-badge">' + modeLabel + '</span>' +
      '<span class="h-status ' + statusClass + '">' + statusLabel + '</span>' +
    '</div>' +
    '<p class="h-prompt">' + escapeHtml(promptText) + '</p>' +
    '<div class="h-card-foot">' +
      '<span class="h-date">' + dateStr + '</span>' +
      (job.status === 'completed' && job.outputUrl
        ? '<button class="h-use-btn" data-url="' + escapeHtml(job.outputUrl) + '" data-mode="' + escapeHtml(job.mode) + '">↓ Use</button>'
        : '') +
    '</div>';

  var useBtn = card.querySelector('.h-use-btn');
  if (useBtn) {
    useBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var url  = this.getAttribute('data-url');
      var mode = this.getAttribute('data-mode');
      // Close history overlay
      var overlay = el('section-history');
      if (overlay) overlay.classList.remove('history-visible');
      // Set the output URL into the result section
      state.mf = state.mf || {};
      state.mf.outputUrl = url;
      state.mf.rawOutputUrl = url;
      // Apply mode and show result
      if (mode) prysmorSetMode(mode);
      var resultSection = el('mf-section-result');
      var resultVideo   = el('result-preview-video');
      var resultImg     = el('result-preview-img');
      if (resultVideo && url.match(/\.(mp4|webm|mov)/i)) {
        resultVideo.src = url;
        resultVideo.classList.remove('hidden');
        if (resultImg) resultImg.classList.add('hidden');
        resultVideo.play().catch(function(){});
      } else if (resultImg) {
        resultImg.src = url;
        resultImg.classList.remove('hidden');
        if (resultVideo) resultVideo.classList.add('hidden');
      }
      if (resultSection) resultSection.classList.remove('hidden');
    });
  }

  return card;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
