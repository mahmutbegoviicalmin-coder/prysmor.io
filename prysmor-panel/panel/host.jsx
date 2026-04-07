/**
 * Prysmor Panel — ExtendScript Host
 * Runs inside Adobe Premiere Pro's ExtendScript engine (ES3).
 * Called from the CEP panel via CSInterface.evalScript().
 */

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function findProjectItemByName(parent, name) {
  if (!parent || !parent.children) return null;
  for (var i = 0; i < parent.children.numItems; i++) {
    var child = parent.children[i];
    if (child.name === name) return child;
    var found = findProjectItemByName(child, name);
    if (found) return found;
  }
  return null;
}

// Normalise a file path for cross-platform comparison.
// On macOS, /var/folders/... is a symlink for /private/var/folders/...
// Premiere Pro stores the /private/... canonical form, so we strip it here.
function normalisePath(p) {
  if (!p) return '';
  var s = p.replace(/\\/g, '/');
  if (s.indexOf('/private/') === 0) s = s.slice(8); // /private/var → /var
  return s;
}

// Finds a project item by its media file path (more reliable than name alone).
// Falls back to name search if path matching fails.
function findProjectItemByPath(parent, targetPath) {
  if (!parent || !parent.children) return null;
  var normalized = normalisePath(targetPath);
  for (var i = 0; i < parent.children.numItems; i++) {
    var child = parent.children[i];
    var childPath = '';
    try {
      if (child.getMediaPath) childPath = normalisePath(child.getMediaPath());
    } catch (_) {}
    if (childPath && childPath === normalized) return child;
    var found = findProjectItemByPath(child, targetPath);
    if (found) return found;
  }
  return null;
}

function fileNameFromPath(filePath) {
  var normalized = filePath.replace(/\\/g, '/');
  var parts = normalized.split('/');
  return parts[parts.length - 1];
}

// ─── importFile ───────────────────────────────────────────────────────────────

function importFile(filePath) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    app.project.importFiles([filePath], true, app.project.rootItem, false);
    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── insertToTimeline (V1, playhead) ─────────────────────────────────────────

function insertToTimeline(filePath) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var seq = app.project.activeSequence;
    if (!seq) return 'error: No active sequence.';
    if (seq.videoTracks.numTracks === 0) return 'error: No video tracks in sequence.';

    app.project.importFiles([filePath], true, app.project.rootItem, false);
    var fileName = fileNameFromPath(filePath);
    var item = findProjectItemByName(app.project.rootItem, fileName);
    if (!item) return 'error: Clip imported but not found: ' + fileName;

    var track = seq.videoTracks[0];
    var insertTime = seq.getPlayerPosition();
    track.insertClip(item, insertTime.seconds);
    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── getSelectionInfo ─────────────────────────────────────────────────────────
/**
 * Returns JSON describing the first selected video clip on any track.
 * Fields: startTimeSec, durationSec (capped at 8), sourcePath
 * On error: returns JSON { error: "..." }
 */
function getSelectionInfo() {
  try {
    if (typeof app === 'undefined') {
      return JSON.stringify({ error: 'Adobe scripting engine not available.' });
    }
    if (!app.project) {
      return JSON.stringify({ error: 'No project open — create or open a Premiere project first.' });
    }
    var seq = app.project.activeSequence;
    if (!seq) {
      return JSON.stringify({ error: 'No active sequence — open a sequence in the Timeline.' });
    }

    var MAX_SEC = 8;
    var selectedClip = null;

    // Search all video tracks for the first selected clip
    var videoTracks = seq.videoTracks;
    for (var t = 0; t < videoTracks.numTracks; t++) {
      var track = videoTracks[t];
      var clips = track.clips;
      for (var c = 0; c < clips.numItems; c++) {
        var clip = clips[c];
        // Premiere Pro: TrackItem.isSelected() or .selected property
        var selected = false;
        try { selected = clip.isSelected(); } catch (_) {}
        if (!selected) { try { selected = !!clip.selected; } catch (_) {} }
        if (selected) {
          selectedClip = clip;
          break;
        }
      }
      if (selectedClip) break;
    }

    if (!selectedClip) {
      return JSON.stringify({ error: 'No clip selected — click a clip in the Premiere timeline first.' });
    }

    var startSec   = selectedClip.start.seconds;
    var clipDurSec = selectedClip.duration.seconds;
    var durSec     = (clipDurSec > MAX_SEC) ? MAX_SEC : clipDurSec;

    // mediaIn = offset (seconds) into the SOURCE FILE where this clip's content starts.
    // clip.inPoint = source in-point; clip.start = sequence position.
    // For a clip placed at timeline-0 and left-trimmed to second 33:
    //   clip.start = 33, clip.inPoint = 33  → we must NOT skip equal values.
    var mediaInSec = 0;
    var _debugTimes = {};
    try {
      var ip = selectedClip.inPoint;
      if (ip && typeof ip.seconds === 'number') {
        mediaInSec = ip.seconds;
        _debugTimes['inPoint'] = ip.seconds;
      }
    } catch (_) {}
    try { _debugTimes['start']    = selectedClip.start.seconds;    } catch (_) {}
    try { _debugTimes['duration'] = selectedClip.duration.seconds; } catch (_) {}
    try { _debugTimes['outPoint'] = selectedClip.outPoint.seconds; } catch (_) {}

    // Resolve source file path
    var sourcePath = '';
    try {
      var pi = selectedClip.projectItem;
      if (pi && pi.getMediaPath) {
        sourcePath = pi.getMediaPath();
      } else if (pi && pi.treePath) {
        sourcePath = pi.treePath;
      }
    } catch (_) {}

    return JSON.stringify({
      startTimeSec: startSec,
      durationSec:  durSec,
      mediaInSec:   mediaInSec,
      debugTimes:   _debugTimes,
      sourcePath:   sourcePath,
      clipName:     selectedClip.name || fileNameFromPath(sourcePath)
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// ─── getTempDir ───────────────────────────────────────────────────────────────
/**
 * Returns the system temp directory path (cross-platform).
 */
function getTempDir() {
  try {
    var tmp = Folder.temp.fsName.replace(/\\/g, '/');
    return tmp;
  } catch (_) {
    return '/tmp';
  }
}

// ─── insertClipOnV2 ───────────────────────────────────────────────────────────
/**
 * Imports filePath and inserts it on VIDEO TRACK V2 at startTimeSec.
 * Creates V2 if it doesn't exist.
 * Returns 'success' or 'error: ...'
 */
function insertClipOnV2(filePath, startTimeSec) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var seq = app.project.activeSequence;
    if (!seq) return 'error: No active sequence.';

    app.project.importFiles([filePath], true, app.project.rootItem, false);

    // Try path-based lookup first (exact match, immune to naming conflicts).
    // Falls back to name search for older Premiere versions.
    var item = findProjectItemByPath(app.project.rootItem, filePath);
    if (!item) {
      var fileName = fileNameFromPath(filePath);
      item = findProjectItemByName(app.project.rootItem, fileName);
    }
    if (!item) return 'error: Clip imported but not found: ' + fileNameFromPath(filePath);

    // Ensure V2 exists (index 1)
    while (seq.videoTracks.numTracks < 2) {
      seq.videoTracks.addTrack();
    }
    var v2 = seq.videoTracks[1];

    // overwriteClip places the clip at an exact timeline position WITHOUT
    // pushing existing content — this is what we want (same position as original).
    // insertClip shifts everything after startTimeSec which causes misalignment.
    var time = new Time();
    time.seconds = startTimeSec;

    // Try overwriteClip first (Premiere 2019+), fall back to insertClip
    if (v2.overwriteClip) {
      v2.overwriteClip(item, time.seconds);
    } else {
      v2.insertClip(item, time.seconds);
    }
    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── replaceSelection (beta) ──────────────────────────────────────────────────
/**
 * Replaces the currently selected clip on V1 with filePath,
 * preserving position and trimming to the same duration.
 * Returns 'success' or 'error: ...'
 */
function replaceSelection(filePath) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var seq = app.project.activeSequence;
    if (!seq) return 'error: No active sequence.';

    var selectedClip = null;
    var selectedTrackIdx = -1;
    var selectedClipIdx  = -1;

    var videoTracks = seq.videoTracks;
    for (var t = 0; t < videoTracks.numTracks; t++) {
      var track = videoTracks[t];
      var clips = track.clips;
      for (var c = 0; c < clips.numItems; c++) {
        var clip = clips[c];
        var selected = false;
        try { selected = clip.isSelected(); } catch (_) {}
        if (!selected) { try { selected = !!clip.selected; } catch (_) {} }
        if (selected) {
          selectedClip = clip;
          selectedTrackIdx = t;
          selectedClipIdx  = c;
          break;
        }
      }
      if (selectedClip) break;
    }

    if (!selectedClip) return 'error: No clip selected.';

    var startSec = selectedClip.start.seconds;
    var durSec   = selectedClip.duration.seconds;

    // Remove the original clip
    selectedClip.remove(false, false);

    // Import and insert replacement
    app.project.importFiles([filePath], true, app.project.rootItem, false);
    var item = findProjectItemByPath(app.project.rootItem, filePath);
    if (!item) {
      var fileName = fileNameFromPath(filePath);
      item = findProjectItemByName(app.project.rootItem, fileName);
    }
    if (!item) return 'error: Replacement clip not found: ' + fileNameFromPath(filePath);

    var track2 = seq.videoTracks[selectedTrackIdx];
    track2.insertClip(item, startSec);

    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── startSidecar ─────────────────────────────────────────────────────────────
/**
 * Launches the Prysmor Identity Lock sidecar process silently (background).
 * Cross-platform: detects Windows vs macOS and uses appropriate paths/commands.
 * Called by the CEP panel when localhost:7788/health is unreachable.
 * Returns 'started:<path>' or 'error:<reason>'.
 */
function startSidecar() {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';

    var isMac = ($.os && $.os.toLowerCase().indexOf('mac') !== -1);

    if (isMac) {
      var homeDir = Folder.userData.fsName;
      homeDir = homeDir.replace(/\/Library\/Application Support$/, '');

      var pyScript = homeDir + '/Library/Prysmor/face_embedding_server.py';
      var pyFile   = new File(pyScript);

      if (pyFile.exists) {
        var cmd = 'nohup python3 "' + pyScript + '" >> /tmp/prysmor-sidecar.log 2>&1 &';
        app.system.callSystem(cmd);
        return 'started:' + pyScript;
      }

      var macBinLocations = [
        '/Applications/Prysmor/prysmor-sidecar',
        homeDir + '/Library/Prysmor/prysmor-sidecar',
      ];
      for (var m = 0; m < macBinLocations.length; m++) {
        var mf = new File(macBinLocations[m]);
        if (mf.exists) {
          app.system.callSystem('nohup "' + macBinLocations[m] + '" >> /tmp/prysmor-sidecar.log 2>&1 &');
          return 'started:' + macBinLocations[m];
        }
      }
      return 'error: face_embedding_server.py not found at ' + pyScript + ' — run the macOS installer first.';

    } else {
      var winLocations = [
        'C:\\Program Files\\Prysmor\\prysmor-sidecar.exe',
        Folder.userData.fsName + '\\Prysmor\\prysmor-sidecar.exe',
        File($.fileName).parent.parent.fsName + '\\prysmor-sidecar.exe',
      ];

      for (var w = 0; w < winLocations.length; w++) {
        var wf = new File(winLocations[w]);
        if (wf.exists) {
          var escaped = winLocations[w].replace(/\\/g, '\\\\');
          app.system.callSystem('"' + escaped + '"');
          return 'started:' + winLocations[w];
        }
      }
      return 'error: prysmor-sidecar.exe not found in any known location.';
    }

  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── startSidecarVisible ──────────────────────────────────────────────────────
/**
 * Launches the Identity Lock sidecar in a VISIBLE terminal window.
 * macOS  → Terminal.app   Windows → new CMD window "Prysmor Identity Lock"
 * Uses $.getenv() for reliable env-var resolution (avoids Folder.userData issues).
 * Writes a temp .bat on Windows to eliminate all command-quoting problems.
 * Returns 'ok:<path>' or 'error:<reason>'.
 */
function startSidecarVisible() {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';

    var isMac = ($.os && $.os.indexOf('Mac') >= 0);

    if (isMac) {
      // ── macOS ────────────────────────────────────────────────────────────────
      var home = $.getenv('HOME');
      if (!home) return 'error: HOME environment variable not set.';
      var macPy = home + '/Library/Prysmor/face_embedding_server.py';
      if (!new File(macPy).exists) return 'error: not found: ' + macPy;
      app.system.callSystem(
        'osascript -e \'tell application "Terminal" to do script "python3 \\"' + macPy + '\\""\'');
      return 'ok:' + macPy;

    } else {
      // ── Windows ──────────────────────────────────────────────────────────────
      var appdata = $.getenv('APPDATA');
      if (!appdata) return 'error: APPDATA environment variable not set.';
      var winPy = appdata + '\\Prysmor\\face_embedding_server.py';
      if (!new File(winPy).exists) return 'error: not found: ' + winPy;

      // Resolve temp dir via env vars (most reliable)
      var tmp = $.getenv('TEMP') || $.getenv('TMP') || (appdata + '\\..\\Local\\Temp');
      var batPath = tmp + '\\prysmor-launch.bat';

      // Write batch file using write() + explicit \r\n to avoid writeln issues
      var bat = new File(batPath);
      if (!bat.open('w')) return 'error: cannot write to ' + batPath;
      bat.write('@echo off\r\ntitle Prysmor Identity Lock\r\necho Starting Prysmor Face Identity...\r\npython "' + winPy + '"\r\necho.\r\necho Stopped. Press any key to close.\r\npause > nul\r\n');
      bat.close();

      app.system.callSystem('cmd.exe /c start "Prysmor Identity Lock" "' + batPath + '"');
      return 'ok:' + winPy;
    }

  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── stopSidecar ──────────────────────────────────────────────────────────────
/**
 * Kills the running sidecar process.
 * macOS  → pkill -f face_embedding_server.py
 * Windows → taskkill /F /IM prysmor-sidecar.exe (also kills python running the .py)
 * Returns 'stopped' or 'error:<reason>'.
 */
function stopSidecar() {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';

    var isMac = ($.os && $.os.toLowerCase().indexOf('mac') !== -1);

    if (isMac) {
      app.system.callSystem('pkill -f face_embedding_server.py 2>/dev/null; pkill -f prysmor-sidecar 2>/dev/null');
    } else {
      app.system.callSystem('taskkill /F /IM prysmor-sidecar.exe /T 2>nul & taskkill /F /FI "WINDOWTITLE eq Prysmor Identity Lock" /T 2>nul');
    }
    return 'stopped';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── getAppInfo ───────────────────────────────────────────────────────────────

function getAppInfo() {
  try {
    var info = {
      appName:     app.name    || 'Adobe Premiere Pro',
      appVersion:  app.version || 'unknown',
      hasProject:  !!(app.project),
      hasSequence: !!(app.project && app.project.activeSequence),
      sequenceName: ''
    };
    if (info.hasSequence) info.sequenceName = app.project.activeSequence.name;
    return JSON.stringify(info);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
