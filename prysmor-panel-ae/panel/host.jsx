/**
 * Prysmor Panel AE — ExtendScript Host
 * Runs inside Adobe After Effects (ES3).
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

function normalisePath(p) {
  if (!p) return '';
  var s = p.replace(/\\/g, '/');
  if (s.indexOf('/private/') === 0) s = s.slice(8);
  return s;
}

function findProjectItemByPath(parent, targetPath) {
  if (!parent || !parent.children) return null;
  var normalized = normalisePath(targetPath);
  for (var i = 0; i < parent.children.numItems; i++) {
    var child = parent.children[i];
    var childPath = '';
    try {
      if (child.getMediaPath) childPath = normalisePath(child.getMediaPath());
      else if (child.file) childPath = normalisePath(child.file.fsName);
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

function getActiveComp() {
  if (typeof app === 'undefined' || !app.project) return null;
  var item = app.project.activeItem;
  if (item && item instanceof CompItem) return item;
  return null;
}

function getPrimarySelectedLayer(comp) {
  if (!comp || !comp.selectedLayers || comp.selectedLayers.length === 0) return null;
  for (var i = 0; i < comp.selectedLayers.length; i++) {
    if (comp.selectedLayers[i] instanceof AVLayer) {
      return comp.selectedLayers[i];
    }
  }
  return comp.selectedLayers[0];
}

function importFootageItem(filePath) {
  app.project.importFiles([filePath], true, app.project.rootItem, false);
  var item = findProjectItemByPath(app.project.rootItem, filePath);
  if (!item) {
    item = findProjectItemByName(app.project.rootItem, fileNameFromPath(filePath));
  }
  return item;
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

// ─── insertToTimeline (playhead) ─────────────────────────────────────────────

function insertToTimeline(filePath) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var comp = getActiveComp();
    if (!comp) return 'error: No active composition.';

    var item = importFootageItem(filePath);
    if (!item) return 'error: Footage imported but not found: ' + fileNameFromPath(filePath);

    var newLayer = comp.layers.add(item);
    newLayer.startTime = comp.time;
    newLayer.moveToBeginning();
    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── getSelectionInfo ─────────────────────────────────────────────────────────

function getSelectionInfo() {
  try {
    if (typeof app === 'undefined') {
      return JSON.stringify({ error: 'Adobe scripting engine not available.' });
    }
    if (!app.project) {
      return JSON.stringify({ error: 'No project open — create or open an After Effects project first.' });
    }

    var comp = getActiveComp();
    if (!comp) {
      return JSON.stringify({ error: 'No active composition — open a comp in the Timeline.' });
    }

    var layer = getPrimarySelectedLayer(comp);
    if (!layer) {
      return JSON.stringify({ error: 'No layer selected — select a footage layer in the comp first.' });
    }

    var MAX_SEC = 8;
    var inPt = layer.inPoint;
    var outPt = layer.outPoint;
    var visibleDur = outPt - inPt;
    if (visibleDur <= 0) {
      return JSON.stringify({ error: 'Selected layer has zero duration.' });
    }
    var durSec = visibleDur > MAX_SEC ? MAX_SEC : visibleDur;
    var startSec = layer.startTime;

    var mediaInSec = 0;
    var _debugTimes = {};
    try {
      mediaInSec = layer.sourceTime(layer.inPoint);
      _debugTimes['sourceTime'] = mediaInSec;
    } catch (_) {
      try {
        mediaInSec = layer.inPoint - layer.startTime;
        _debugTimes['inMinusStart'] = mediaInSec;
      } catch (_) {}
    }
    try { _debugTimes['inPoint'] = layer.inPoint; } catch (_) {}
    try { _debugTimes['outPoint'] = layer.outPoint; } catch (_) {}
    try { _debugTimes['startTime'] = layer.startTime; } catch (_) {}

    var sourcePath = '';
    try {
      var src = layer.source;
      if (src instanceof FootageItem && src.file) {
        sourcePath = src.file.fsName;
      } else if (src && src.mainSource && src.mainSource.file) {
        sourcePath = src.mainSource.file.fsName;
      }
    } catch (_) {}

    if (!sourcePath) {
      return JSON.stringify({ error: 'Selected layer has no file path — use a footage layer, not a solid or text layer.' });
    }

    var clipW = 0;
    var clipH = 0;
    try { clipW = layer.width || 0; } catch (_) {}
    try { clipH = layer.height || 0; } catch (_) {}
    if (!clipW || !clipH) {
      try { clipW = layer.source.width || 0; } catch (_) {}
      try { clipH = layer.source.height || 0; } catch (_) {}
    }

    var compW = comp.width || 0;
    var compH = comp.height || 0;

    return JSON.stringify({
      startTimeSec: startSec,
      durationSec:  durSec,
      mediaInSec:   mediaInSec,
      debugTimes:   _debugTimes,
      sourcePath:   sourcePath,
      clipName:     layer.name || fileNameFromPath(sourcePath),
      clipWidth:    clipW,
      clipHeight:   clipH,
      seqWidth:     compW,
      seqHeight:    compH,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// ─── getTempDir ───────────────────────────────────────────────────────────────

function getTempDir() {
  try {
    return Folder.temp.fsName.replace(/\\/g, '/');
  } catch (_) {
    return '/tmp';
  }
}

// ─── insertClipOnV2 (layer above selection) ───────────────────────────────────

function insertClipOnV2(filePath, startTimeSec) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var comp = getActiveComp();
    if (!comp) return 'error: No active composition.';

    var item = importFootageItem(filePath);
    if (!item) return 'error: Footage imported but not found: ' + fileNameFromPath(filePath);

    var newLayer = comp.layers.add(item);
    newLayer.startTime = startTimeSec;

    var refLayer = getPrimarySelectedLayer(comp);
    if (refLayer) {
      newLayer.moveBefore(refLayer);
    } else {
      newLayer.moveToBeginning();
    }

    return 'success';
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── replaceSelection (overlay above selected layer) ──────────────────────────

function replaceSelection(filePath) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var comp = getActiveComp();
    if (!comp) return 'error: No active composition.';

    var refLayer = getPrimarySelectedLayer(comp);
    if (!refLayer) return 'error: No layer selected.';

    var startSec = refLayer.startTime;
    return insertClipOnV2(filePath, startSec);
  } catch (e) {
    return 'error: ' + e.message;
  }
}

// ─── getAppInfo ───────────────────────────────────────────────────────────────

function getAppInfo() {
  try {
    var comp = getActiveComp();
    var info = {
      appName:      app.name    || 'After Effects',
      appVersion:   app.version || 'unknown',
      hasProject:   !!(app.project),
      hasSequence:  !!comp,
      sequenceName: comp ? comp.name : '',
    };
    return JSON.stringify(info);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
