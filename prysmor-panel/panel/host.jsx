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
    var fileName = fileNameFromPath(filePath);
    var item = findProjectItemByName(app.project.rootItem, fileName);
    if (!item) return 'error: Clip imported but not found: ' + fileName;

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
    var fileName = fileNameFromPath(filePath);
    var item = findProjectItemByName(app.project.rootItem, fileName);
    if (!item) return 'error: Replacement clip not found: ' + fileName;

    var track2 = seq.videoTracks[selectedTrackIdx];
    track2.insertClip(item, startSec);

    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── startSidecar ─────────────────────────────────────────────────────────────
/**
 * Launches prysmor-sidecar.exe if found in known install locations.
 * Called by the CEP panel when localhost:7788/health is unreachable.
 * Returns 'started:<path>' or 'error:<reason>'.
 */
function startSidecar() {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';

    // Search locations in priority order
    var locations = [
      // System-wide install (admin installer)
      'C:\\Program Files\\Prysmor\\prysmor-sidecar.exe',
      // Per-user install fallback
      Folder.userData.fsName + '\\Prysmor\\prysmor-sidecar.exe',
      // Portable — same folder as the panel
      File($.fileName).parent.parent.fsName + '\\prysmor-sidecar.exe',
    ];

    for (var i = 0; i < locations.length; i++) {
      var f = new File(locations[i]);
      if (f.exists) {
        // callSystem() is fire-and-forget in ExtendScript (returns immediately)
        var escaped = locations[i].replace(/\\/g, '\\\\');
        app.system.callSystem('"' + escaped + '"');
        return 'started:' + locations[i];
      }
    }
    return 'error: prysmor-sidecar.exe not found in any known location.';
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
