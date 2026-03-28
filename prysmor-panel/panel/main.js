'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────

const SITE_URL  = 'https://prysmor.io';
// API_BASE: localhost for dev, production domain when deployed.
// Change this single line before shipping a new panel build.
const API_BASE  = 'https://prysmor-io.vercel.app';
const POLL_MS   = 3500;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 min for job polling

// Auth polling
const AUTH_POLL_MS  = 2500;  // how often to check if browser auth completed
const AUTH_MAX_MS   = 5 * 60 * 1000; // 5 min before code expires

// LocalStorage keys
const LS_TOKEN     = 'prysmor_token';
const LS_USER_ID   = 'prysmor_user_id';
const LS_PLAN      = 'prysmor_plan';
const LS_PLAN_LABEL = 'prysmor_plan_label';
const LS_TOKEN_EXP = 'prysmor_token_exp';

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
  // Try to restore saved session
  if (restoreSession()) {
    enterPanel();
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

  // Start heartbeat — keeps device "Online" in dashboard
  startHeartbeat();

  // Fetch real credit balance from server
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
  clearSession();
  state.mf = {
    jobId: null, selInfo: null, replaceMode: false,
    pollTimer: null, pollStart: 0, outputUrl: null, rawOutputUrl: null,
    outputPath: null, tempDir: '', generating: false,
  };
  // Reset login button
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
      showClipEmpty();
      if (!silent) {
        showToast(parsed ? parsed.error : 'Could not read Premiere selection', 'error');
      }
      return;
    }

    state.mf.selInfo = parsed;
    showClipInfo(parsed);
    updateCostPreview();
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
  var preview = el('gen-cost-preview');
  if (!preview) return;

  if (!state.mf.selInfo) {
    preview.style.display = 'none';
    return;
  }

  var dur  = Math.min(state.mf.selInfo.durationSec || 0, 8);
  var cost = calcCostPreview(dur);
  var bal  = state.usage.credits || 0;
  var secs = dur.toFixed(1);
  var canAfford = bal >= cost;

  preview.style.display = '';
  preview.className = 'gen-cost-preview' + (canAfford ? '' : ' insufficient');

  if (canAfford) {
    preview.innerHTML = 'Will cost <b>' + cost + ' credits</b> · ' + secs + 's clip · ' + bal + ' remaining';
  } else {
    preview.innerHTML = 'Need <b>' + cost + ' credits</b> · only ' + bal + ' available — <b>upgrade plan</b>';
  }
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

      var res = await fetch(API_BASE + '/api/v1/motionforge/jobs/' + state.mf.jobId + '/enhance-prompt', {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({ intent: intent }),
      });
      var json = await res.json().catch(function () { return {}; });

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

    if (!res2.ok || !json2.compiledPrompt) {
      throw new Error(json2.error || 'Compile failed');
    }

    textarea.value = json2.compiledPrompt;
    el('mf-char-count').textContent = json2.compiledPrompt.length;
    showToast('Prompt enhanced', 'success');
    textarea.focus();

  } catch (err) {
    showToast('Failed to enhance prompt', 'error');
  } finally {
    btn.disabled    = false;
    lbl.textContent = 'AI Enhance';
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

  state.mf.replaceMode = replaceMode;
  hideNoCreditsMessage();
  var costPrev = el('gen-cost-preview');
  if (costPrev) costPrev.style.display = 'none';
  setGenerating(true);
  setStatus('Creating job…', 8);

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

  // ── Step 2: Read clip from disk ───────────────────────────────────────────
  setStatus('Reading clip from disk…', 18);
  let fileBase64;
  try {
    fileBase64 = await readFileBase64(state.mf.selInfo.sourcePath);
  } catch (err) {
    return fail('Cannot read clip: ' + err.message);
  }

  // ── Step 3: Upload raw binary to backend (ffmpeg trims on server) ───────
  setStatus('Uploading to server…', 32);
  try {
    const blob       = base64ToBlob(fileBase64, 'video/mp4');
    const mediaInSec = (state.mf.selInfo.mediaInSec || 0).toFixed(6);
    const clipDurSec = (state.mf.selInfo.durationSec || 8).toFixed(6);

    const res = await fetch(
      API_BASE + '/api/v1/motionforge/jobs/' + jobId + '/upload',
      {
        method: 'POST',
        headers: apiHeaders({
          'Content-Type':    'video/mp4',
          'X-Media-In':      mediaInSec,
          'X-Clip-Duration': clipDurSec,
        }),
        body: blob,
      }
    );
    const json = await res.json().catch(function () { return { error: 'Invalid response' }; });
    if (!res.ok) throw new Error(json.error || 'Upload failed HTTP ' + res.status);
  } catch (err) {
    return fail('Upload failed: ' + err.message);
  }

  // ── Step 4: Start AI generation ──────────────────────────────────────────
  setStatus('Starting AI generation…', 50);
  try {
    await apiFetch('/api/v1/motionforge/jobs/' + jobId + '/generate', {
      method:  'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ prompt }),
    });
  } catch (err) {
    return fail('Generation failed to start: ' + err.message);
  }

  // ── Step 5: Poll until done ───────────────────────────────────────────────
  setStatus('Generating your effect…', 55);
  state.mf.pollStart = Date.now();
  startPolling(jobId);
}

function startPolling(jobId) {
  stopMfPolling();
  state.mf.pollTimer = setInterval(async function () {

    if (Date.now() - state.mf.pollStart > MAX_POLL_MS) {
      stopMfPolling();
      return fail('Generation timed out (10 min)');
    }

    let job;
    try { job = await apiFetch('/api/v1/motionforge/jobs/' + jobId); }
    catch (_) { return; }

    if (job.status === 'generating') {
      const pct = 55 + Math.round((job.progress || 0) * 0.4);
      setStatus('Generating… ' + (job.progress || 0) + '%', pct);
      return;
    }

    if (job.status === 'compositing') {
      setStatus('Preserving face identity…', 96);
      return;
    }

    if (job.status === 'failed') {
      stopMfPolling();
      return fail(job.error || 'Generation failed');
    }

    if (job.status === 'completed' && job.outputUrl) {
      stopMfPolling();
      state.mf.outputUrl    = job.outputUrl;
      state.mf.rawOutputUrl = job.rawOutputUrl || null;
      setStatus('Downloading result…', 95);

      try {
        await downloadAndInsert(job.outputUrl, state.mf.selInfo.startTimeSec, state.mf.replaceMode);
      } catch (err) {
        showToast('Insert failed: ' + err.message + ' — open manually', 'error');
        // Fallback: fetch video and create a blob URL so the <video> tag can play it
        // (server URL requires auth header which <video> cannot send)
        try {
          var fbRes = await fetch(job.outputUrl, { headers: apiHeaders() });
          if (fbRes.ok) {
            var fbBlob = await fbRes.blob();
            showResult(URL.createObjectURL(fbBlob));
          } else {
            showResult(job.outputUrl);
          }
        } catch (_) {
          showResult(job.outputUrl);
        }
      }

      // Refresh credit balance from server after successful generation
      fetchCredits(); // also calls updateCostPreview()
      setGenerating(false);
    }

  }, POLL_MS);
}

function stopMfPolling() {
  if (state.mf.pollTimer) { clearInterval(state.mf.pollTimer); state.mf.pollTimer = null; }
}

// ─── Download & Insert into Premiere ─────────────────────────────────────────

async function downloadAndInsert(outputUrl, startTimeSec, replaceMode) {
  // Download video with auth header
  const res = await fetch(outputUrl, { headers: apiHeaders() });
  if (!res.ok) throw new Error('Download HTTP ' + res.status);

  const arrayBuf = await res.arrayBuffer();
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

  // Use string literal 'Base64' — avoids crashes when cep.encoding is undefined
  // in some CEP 12 / Premiere 2025 builds
  var base64enc = 'Base64';
  try { if (window.cep.encoding && window.cep.encoding.Base64) base64enc = window.cep.encoding.Base64; } catch (_) {}

  const base64 = uint8ToBase64(buffer);
  const wr     = window.cep.fs.writeFile(outPath, base64, base64enc);

  if (wr.err !== 0) {
    // Write failed — still show preview from blob
    showResult(blobUrl || outputUrl);
    throw new Error('Could not save to disk (err ' + wr.err + '). Preview shown — use Insert button to retry.');
  }

  state.mf.outputPath = outPath;
  const esc = outPath.replace(/\\/g, '/').replace(/"/g, '\\"');

  setStatus(replaceMode ? 'Replacing original…' : 'Inserting on V2…', 98);

  await new Promise(function (resolve) {
    const fn = replaceMode
      ? 'replaceSelection("' + esc + '")'
      : 'insertClipOnV2("' + esc + '", ' + startTimeSec + ')';

    cs.evalScript(fn, function (r) {
      if (r && r.indexOf('error') === 0) {
        showToast(r.replace('error: ', ''), 'error');
      } else {
        showToast(replaceMode
          ? 'Original replaced with AI result!'
          : 'AI clip inserted on V2 — aligned to selection!', 'success');
      }
      resolve();
    });
  });

  setStatus('Done!', 100);
  // Use blob URL for preview — file:// URLs are sometimes blocked in newer CEP builds
  showResult(blobUrl || ('file:///' + outPath.replace(/\\/g, '/').replace(/^\//, '')));
}

// ─── UI State Helpers ─────────────────────────────────────────────────────────

function setGenerating(active) {
  state.mf.generating = active;
  const btn = el('mf-btn-generate');
  if (btn) { btn.disabled = active; btn.style.display = active ? 'none' : ''; }
  const gs = el('mf-gen-state');
  if (gs) gs.classList.toggle('hidden', !active);
  const rs = el('mf-section-result');
  if (rs && active) rs.classList.add('hidden');
  if (active) {
    const bar = el('mf-gen-bar');
    if (bar) { bar.style.width = '0%'; }
  }
}

function setStatus(text, pct) {
  const t = el('mf-status-text'); if (t) t.textContent = text;
  const b = el('mf-gen-bar');    if (b && pct != null) b.style.width = Math.min(pct, 100) + '%';
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
    const r = window.cep.fs.readFile(absPath, window.cep.encoding.Base64);
    if (r.err !== 0) return reject(new Error('Read error ' + r.err + ' for: ' + absPath));
    resolve(r.data);
  });
}

function base64ToBlob(b64, mime) {
  const bin  = atob(b64);
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
  fetch(API_BASE + '/api/v1/motionforge/jobs', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId: 'diag-ping' }),
    signal: AbortSignal.timeout(4000),
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

function renderUsage() {
  var credits = state.usage.credits      || 0;
  var total   = state.usage.creditsTotal || 1000;
  var pct     = total > 0 ? Math.min(Math.round((credits / total) * 100), 100) : 0;
  var seconds = Math.floor(credits / 4);
  var isLow   = pct < 20;

  var usedEl = el('usage-used');
  var limEl  = el('usage-limit');
  var barEl  = el('progress-fill');

  if (usedEl) usedEl.textContent = credits.toLocaleString();
  if (limEl)  limEl.textContent  = total.toLocaleString();
  if (barEl) {
    barEl.style.width      = pct + '%';
    barEl.style.background = isLow ? '#fb923c' : '#A3FF12';
  }

  // Seconds remaining label
  var secEl = el('usage-seconds');
  if (secEl) secEl.textContent = '≈ ' + seconds + 's of AI VFX remaining';

  // Topbar credits badge
  var badge    = el('topbar-credits');
  var badgeVal = el('topbar-credits-val');
  if (badge && badgeVal) {
    badge.style.display = '';
    badgeVal.textContent = credits.toLocaleString() + ' cr';
    badge.classList.toggle('low', isLow);
  }
}

function showNoCreditsMessage() {
  var credits = state.usage.credits || 0;
  var planLabel = (state.auth && state.auth.planLabel) || 'Starter';
  // Show a toast with upgrade link
  showToast('No credits left (' + credits + ' remaining). Upgrade your plan to continue.', 'error');
  // Also show inline banner below the generate button if element exists
  var banner = el('no-credits-banner');
  if (banner) {
    banner.classList.remove('hidden');
  }
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
      btnV2.classList.toggle('out-opt-active', !replace);
      btnReplace.classList.toggle('out-opt-active', replace);
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
