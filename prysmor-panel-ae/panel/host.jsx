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

  // Footage selected in Project panel — activeItem is not the comp (Adobe community #61517)
  var i;
  for (i = 1; i <= app.project.numItems; i++) {
    var openComp = app.project.item(i);
    if (openComp instanceof CompItem && openComp.openInViewer) return openComp;
  }
  for (i = 1; i <= app.project.numItems; i++) {
    var withSel = app.project.item(i);
    if (withSel instanceof CompItem && withSel.selectedLayers && withSel.selectedLayers.length > 0) {
      return withSel;
    }
  }
  return null;
}

function getSelectedAVLayers(comp) {
  var layers = [];
  if (!comp || !comp.selectedLayers) return layers;
  try {
    var sel = comp.selectedLayers;
    if (typeof sel.length === 'number' && sel.length > 0) {
      for (var i = 0; i < sel.length; i++) {
        if (sel[i] instanceof AVLayer) layers.push(sel[i]);
      }
      if (layers.length > 0) return layers;
    }
    for (var j = 0; sel[j] !== undefined && j < 256; j++) {
      if (sel[j] instanceof AVLayer) layers.push(sel[j]);
    }
  } catch (_) {}
  return layers;
}

function getPrimarySelectedLayer(comp) {
  var layers = getSelectedAVLayers(comp);
  return layers.length > 0 ? layers[0] : null;
}

function isFootageAVLayer(layer) {
  if (!layer || !(layer instanceof AVLayer)) return false;
  try {
    var src = layer.source;
    if (src instanceof FootageItem && src.file) return true;
    if (src && src.mainSource && src.mainSource.file) return true;
  } catch (_) {}
  return false;
}

function getLayerSourcePath(layer) {
  try {
    var src = layer.source;
    if (src instanceof FootageItem && src.file) return src.file.fsName;
    if (src && src.mainSource && src.mainSource.file) return src.mainSource.file.fsName;
  } catch (_) {}
  return '';
}

// Topmost footage layer visible at the current comp time (playhead).
function findLayerAtCompTime(comp) {
  if (!comp) return null;
  var t = comp.time;
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (!isFootageAVLayer(layer)) continue;
    try { if (layer.enabled === false) continue; } catch (_) {}
    try {
      if (t >= layer.inPoint && t < layer.outPoint) return layer;
    } catch (_) {}
  }
  return null;
}

// Returns { layer, method } where method is selection | time.
function findActiveLayer(comp) {
  if (!comp) return null;

  var selected = getPrimarySelectedLayer(comp);
  if (selected) return { layer: selected, method: 'selection' };

  var atTime = findLayerAtCompTime(comp);
  if (atTime) return { layer: atTime, method: 'time' };

  return null;
}

function computeLayerTiming(layer, comp, method, maxSec) {
  var startSec = 0;
  var durSec = 0;
  var mediaInSec = 0;
  var _debugTimes = { selectionMethod: method };

  if (method === 'time' && comp) {
    var compTime = comp.time;
    startSec = compTime;
    var remain = layer.outPoint - compTime;
    if (remain <= 0) remain = layer.outPoint - layer.inPoint;
    durSec = remain > maxSec ? maxSec : remain;
    try { mediaInSec = layer.sourceTime(compTime); _debugTimes['sourceTime'] = mediaInSec; } catch (_) {
      try {
        mediaInSec = compTime - layer.startTime;
        _debugTimes['timeMinusStart'] = mediaInSec;
      } catch (_) {}
    }
  } else {
    var visibleDur = layer.outPoint - layer.inPoint;
    if (visibleDur <= 0) return null;
    durSec = visibleDur > maxSec ? maxSec : visibleDur;
    startSec = layer.inPoint;
    try {
      mediaInSec = layer.sourceTime(layer.inPoint);
      _debugTimes['sourceTime'] = mediaInSec;
    } catch (_) {
      try {
        mediaInSec = layer.inPoint - layer.startTime;
        _debugTimes['inMinusStart'] = mediaInSec;
      } catch (_) {}
    }
  }

  try { _debugTimes['inPoint'] = layer.inPoint; } catch (_) {}
  try { _debugTimes['outPoint'] = layer.outPoint; } catch (_) {}
  try { _debugTimes['startTime'] = layer.startTime; } catch (_) {}
  if (comp) try { _debugTimes['compTime'] = comp.time; } catch (_) {}

  return { startSec: startSec, durSec: durSec, mediaInSec: mediaInSec, debugTimes: _debugTimes };
}

function importFootageItem(filePath) {
  var item = findProjectItemByPath(app.project.rootItem, filePath);
  if (!item) {
    var base = fileNameFromPath(filePath);
    // Prysmor temp files are unique per run — never reuse a different gen by filename
    if (base.indexOf('mf-processed-') !== 0 && base.indexOf('mf-output-') !== 0) {
      item = findProjectItemByName(app.project.rootItem, base);
    }
  }
  if (item) return item;

  var file = new File(filePath);
  if (!file.exists) file = new File(normalisePath(filePath));
  if (!file.exists) return null;

  var io = new ImportOptions(file);
  if (io.canImportAs === ImportAsType.FOOTAGE) {
    io.importAs = ImportAsType.FOOTAGE;
  } else if (io.canImportAs === ImportAsType.COMP) {
    io.importAs = ImportAsType.COMP;
  }
  item = app.project.importFile(io);
  if (item) return item;

  item = findProjectItemByPath(app.project.rootItem, filePath);
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
    var item = importFootageItem(filePath);
    if (!item) return 'error: Import failed: ' + fileNameFromPath(filePath);
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

    var found = findActiveLayer(comp);
    if (!found) {
      return JSON.stringify({
        error: 'No footage layer found — place the playhead on a layer, or select a footage layer in the comp.'
      });
    }

    var layer = found.layer;
    var selectionMethod = found.method;

    if (!isFootageAVLayer(layer)) {
      return JSON.stringify({ error: 'Selected layer has no file path — use a footage layer, not a solid or text layer.' });
    }

    var MAX_SEC = 8;
    var timing = computeLayerTiming(layer, comp, selectionMethod, MAX_SEC);
    if (!timing) {
      return JSON.stringify({ error: 'Selected layer has zero duration.' });
    }

    var startSec = timing.startSec;
    var durSec = timing.durSec;
    var mediaInSec = timing.mediaInSec;
    var _debugTimes = timing.debugTimes;

    var sourcePath = getLayerSourcePath(layer);
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
      selectionMethod: selectionMethod,
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

function alignNewLayerToRef(newLayer, refLayer, compTimeSec) {
  newLayer.startTime = compTimeSec;
  if (refLayer) {
    try {
      newLayer.inPoint  = refLayer.inPoint;
      newLayer.outPoint = refLayer.outPoint;
    } catch (_) {}
  } else {
    try {
      var dur = newLayer.source ? newLayer.source.duration : compTimeSec;
      if (dur && dur > 0) newLayer.outPoint = newLayer.inPoint + dur;
    } catch (_) {}
  }
}

function insertClipOnV2(filePath, startTimeSec) {
  try {
    if (typeof app === 'undefined') return 'error: Adobe scripting engine not available.';
    if (!app.project) return 'error: No project open.';
    var comp = getActiveComp();
    if (!comp) {
      return 'error: Open your composition in the Timeline, then try again (footage selected in Project is not enough).';
    }

    app.beginUndoGroup('Prysmor Add to Timeline');

    // Capture selection BEFORE add — AE auto-selects the new layer after add
    var refLayer = null;
    var found = findActiveLayer(comp);
    if (found) refLayer = found.layer;
    var refIndex = refLayer ? refLayer.index : -1;
    var placeSec = (typeof startTimeSec === 'number' && !isNaN(startTimeSec)) ? startTimeSec : 0;
    if (refLayer) {
      try { placeSec = refLayer.inPoint; } catch (_) {}
    }

    var item = importFootageItem(filePath);
    if (!item) {
      app.endUndoGroup();
      return 'error: Footage imported but not found: ' + fileNameFromPath(filePath);
    }

    var layersBefore = comp.numLayers;
    var newLayer = comp.layers.add(item);
    if (!newLayer || comp.numLayers <= layersBefore) {
      app.endUndoGroup();
      return 'error: Could not add layer to composition.';
    }

    alignNewLayerToRef(newLayer, refLayer, placeSec);

    if (refIndex > 0) {
      try {
        var target = comp.layer(refIndex + 1);
        if (target && target !== newLayer) {
          newLayer.moveBefore(target);
        }
      } catch (moveErr) {
        try { newLayer.moveToBeginning(); } catch (_) {}
      }
    } else {
      try { newLayer.moveToBeginning(); } catch (_) {}
    }

    try {
      newLayer.selected = true;
      comp.openInViewer();
    } catch (_) {}

    app.endUndoGroup();
    return 'success';
  } catch (e) {
    try { app.endUndoGroup(); } catch (_) {}
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

    var refLayer = null;
    var found = findActiveLayer(comp);
    if (found) refLayer = found.layer;
    if (!refLayer) return 'error: No footage layer found — place the playhead on a layer or select one.';

    var startSec = refLayer.inPoint;
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
