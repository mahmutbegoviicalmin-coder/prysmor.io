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

function isVideoTrackItem(item) {
  if (!item) return false;
  try {
    var mt = item.mediaType;
    if (mt === 'Video') return true;
    if (mt === 'Audio') return false;
  } catch (_) {}
  return true;
}

// Normalise getSelection() across PP 2024–2026 (some builds omit .length).
function getTimelineSelectionItems(seq) {
  var items = [];
  if (!seq || !seq.getSelection) return items;
  try {
    var sel = seq.getSelection();
    if (!sel) return items;
    var i, item;
    if (typeof sel.length === 'number' && sel.length > 0) {
      for (i = 0; i < sel.length; i++) {
        item = sel[i];
        if (item) items.push(item);
      }
      if (items.length > 0) return items;
    }
    for (i = 0; i < 256; i++) {
      item = sel[i];
      if (!item) {
        if (i === 0) break;
        continue;
      }
      items.push(item);
    }
  } catch (_) {}
  return items;
}

function clipEndSec(clip) {
  try {
    if (clip.end && typeof clip.end.seconds === 'number') return clip.end.seconds;
  } catch (_) {}
  try {
    return clip.start.seconds + clip.duration.seconds;
  } catch (_) {}
  return -1;
}

// Reliable when timeline selection APIs return empty (common on PP 2026).
function findVideoClipAtPlayhead(seq) {
  if (!seq || !seq.getPlayerPosition) return null;
  var posSec = 0;
  try { posSec = seq.getPlayerPosition().seconds; } catch (_) { return null; }

  var videoTracks = seq.videoTracks;
  if (!videoTracks || !videoTracks.numTracks) return null;

  for (var t = videoTracks.numTracks - 1; t >= 0; t--) {
    var track = videoTracks[t];
    var clips = track.clips;
    for (var c = 0; c < clips.numItems; c++) {
      var clip = clips[c];
      if (!isVideoTrackItem(clip)) continue;
      var startSec = 0;
      try { startSec = clip.start.seconds; } catch (_) { continue; }
      var endSec = clipEndSec(clip);
      if (endSec <= startSec) continue;
      if (posSec >= startSec && posSec < endSec) return clip;
    }
  }
  return null;
}

function computeMediaInSec(clip, seq, method) {
  var mediaInSec = 0;
  try {
    var ip = clip.inPoint;
    if (ip && typeof ip.seconds === 'number') mediaInSec = ip.seconds;
  } catch (_) {}

  if (method === 'playhead' && seq && seq.getPlayerPosition) {
    try {
      var posSec = seq.getPlayerPosition().seconds;
      var startSec = clip.start.seconds;
      var offset = posSec - startSec;
      if (offset > 0) mediaInSec += offset;
    } catch (_) {}
  }
  return mediaInSec;
}

// Returns { clip, method } where method is selection | track | playhead.
function findActiveVideoClip(seq) {
  if (!seq) return null;

  var items = getTimelineSelectionItems(seq);
  var i;
  for (i = 0; i < items.length; i++) {
    if (isVideoTrackItem(items[i])) return { clip: items[i], method: 'selection' };
  }

  try {
    var videoTracks = seq.videoTracks;
    for (var t = 0; t < videoTracks.numTracks; t++) {
      var track = videoTracks[t];
      var clips = track.clips;
      for (var c = 0; c < clips.numItems; c++) {
        var clip = clips[c];
        var selected = false;
        try { selected = clip.isSelected(); } catch (_) {}
        if (!selected) { try { selected = !!clip.selected; } catch (_) {} }
        if (selected && isVideoTrackItem(clip)) return { clip: clip, method: 'track' };
      }
    }
  } catch (_) {}

  var playheadClip = findVideoClipAtPlayhead(seq);
  if (playheadClip) return { clip: playheadClip, method: 'playhead' };

  return null;
}

function findSelectedVideoClip(seq) {
  var found = findActiveVideoClip(seq);
  return found ? found.clip : null;
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
    var found = findActiveVideoClip(seq);

    if (!found) {
      return JSON.stringify({
        error: 'No clip found — place the playhead on a video clip, or select one on the timeline.'
      });
    }

    var selectedClip = found.clip;
    var selectionMethod = found.method;

    var startSec   = selectedClip.start.seconds;
    var clipDurSec = selectedClip.duration.seconds;
    var durSec     = (clipDurSec > MAX_SEC) ? MAX_SEC : clipDurSec;

    var mediaInSec = computeMediaInSec(selectedClip, seq, selectionMethod);
    var _debugTimes = { selectionMethod: selectionMethod };
    try { _debugTimes['inPoint']  = selectedClip.inPoint.seconds;  } catch (_) {}
    try { _debugTimes['start']    = selectedClip.start.seconds;    } catch (_) {}
    try { _debugTimes['duration'] = selectedClip.duration.seconds; } catch (_) {}

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

    // Clip source dimensions — actual media resolution, used for Runway ratio selection.
    // Try clip.source.width/height (TrackItem source), then projectItem.source,
    // then fall back to sequence dimensions if the clip API isn't available.
    var clipW = 0, clipH = 0;
    try { clipW = selectedClip.source.width  || 0; } catch (_) {}
    try { clipH = selectedClip.source.height || 0; } catch (_) {}
    if (!clipW || !clipH) {
      try { clipW = selectedClip.projectItem.source.width  || 0; } catch (_) {}
      try { clipH = selectedClip.projectItem.source.height || 0; } catch (_) {}
    }

    // Sequence dimensions — kept as fallback for the too-wide guard.
    var seqW = 0, seqH = 0;
    try { seqW = seq.frameSizeHorizontal || 0; } catch (_) {}
    try { seqH = seq.frameSizeVertical   || 0; } catch (_) {}

    try { _debugTimes['outPoint'] = selectedClip.outPoint.seconds; } catch (_) {}

    return JSON.stringify({
      startTimeSec: startSec,
      durationSec:  durSec,
      mediaInSec:   mediaInSec,
      debugTimes:   _debugTimes,
      sourcePath:   sourcePath,
      clipName:     selectedClip.name || fileNameFromPath(sourcePath),
      clipWidth:    clipW,
      clipHeight:   clipH,
      seqWidth:     seqW,
      seqHeight:    seqH,
      selectionMethod: selectionMethod,
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

    var selectedClip = findSelectedVideoClip(seq);
    if (!selectedClip) return 'error: No clip selected.';

    var startSec = selectedClip.start.seconds;

    // Import the generated clip without removing the original
    app.project.importFiles([filePath], true, app.project.rootItem, false);
    var item = findProjectItemByPath(app.project.rootItem, filePath);
    if (!item) {
      var fileName = fileNameFromPath(filePath);
      item = findProjectItemByName(app.project.rootItem, fileName);
    }
    if (!item) return 'error: Replacement clip not found: ' + fileNameFromPath(filePath);

    // Place generated clip on V2 above the original — original is preserved on V1
    var v2 = seq.videoTracks[1];
    if (!v2) return 'error: V2 track not found';
    var time = new Time();
    time.seconds = startSec;
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
