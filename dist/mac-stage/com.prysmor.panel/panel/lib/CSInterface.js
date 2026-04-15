/**
 * CSInterface — Adobe CEP (Common Extensibility Platform)
 * Minimal functional implementation for Prysmor Panel (Demo Mode).
 *
 * For production, replace with the full official version:
 * https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/CSInterface.js
 */

'use strict';

// ─── SystemPath constants (used by getSystemPath) ─────────────────────────────
var SystemPath = {
  USER_DATA:        'userData',
  COMMON_FILES:     'commonFiles',
  MY_DOCUMENTS:     'myDocuments',
  APPLICATION:      'application',
  EXTENSION:        'extension',      // ← root folder of THIS extension
  HOST_APPLICATION: 'hostApplication'
};

// ─── CEP File System guard ────────────────────────────────────────────────────
// In a live CEP panel, window.cep and window.cep.fs are injected automatically
// by the runtime. When running in a browser (for UI testing) they don't exist,
// so we create safe no-op stubs to prevent reference errors.
(function () {
  if (typeof window.cep === 'undefined') {
    window.cep = {
      fs:       null,
      encoding: { Base64: 'Base64', UTF8: 'UTF8' }
    };
  }
  if (typeof window.cep.encoding === 'undefined') {
    window.cep.encoding = { Base64: 'Base64', UTF8: 'UTF8' };
  }
  // If cep.fs exists but showSaveDialogEx doesn't, note it so main.js
  // can fall back gracefully.
})();

// ─── CSInterface ──────────────────────────────────────────────────────────────
function CSInterface() {
  this._isInCEP = (typeof __adobe_cep__ !== 'undefined');
}

CSInterface.prototype.getHostEnvironment = function () {
  if (this._isInCEP) {
    try { return JSON.parse(__adobe_cep__.getHostEnvironment()); } catch (e) {}
  }
  return { appName: 'PPRO', appVersion: '0.0', appLocale: 'en_US' };
};

CSInterface.prototype.evalScript = function (script, callback) {
  if (this._isInCEP) {
    __adobe_cep__.evalScript(script, callback || function () {});
  } else {
    console.warn('[Prysmor] evalScript called outside CEP:', script);
    if (callback) callback('error: not in CEP environment');
  }
};

CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  // CEP 9-11: __adobe_cep__.openURLInDefaultBrowser
  if (this._isInCEP && typeof __adobe_cep__.openURLInDefaultBrowser === 'function') {
    try { __adobe_cep__.openURLInDefaultBrowser(url); return; } catch (_) {}
  }
  // CEP 12 / Premiere 2025: use cep.util if available
  if (window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === 'function') {
    try { window.cep.util.openURLInDefaultBrowser(url); return; } catch (_) {}
  }
  // Fallback: window.open (works in most CEP contexts)
  window.open(url, '_blank');
};

/**
 * Returns an absolute local path for common system folders.
 * SystemPath.EXTENSION → root directory of this extension bundle.
 */
CSInterface.prototype.getSystemPath = function (pathType) {
  if (this._isInCEP) {
    return __adobe_cep__.getSystemPath(pathType);
  }
  return '';
};

CSInterface.prototype.getExtensionID = function () {
  if (this._isInCEP) {
    return __adobe_cep__.getExtensionId();
  }
  return 'com.prysmor.panel';
};

CSInterface.prototype.addEventListener = function (type, listener) {
  if (this._isInCEP) {
    __adobe_cep__.addEventListener(type, listener);
  }
};

CSInterface.prototype.dispatchEvent = function (event) {
  if (this._isInCEP) {
    __adobe_cep__.dispatchEvent(event);
  }
};
