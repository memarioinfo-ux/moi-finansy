/* Android back navigation for the single-page app, v18. */
(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const shown = id => !!get(id)?.classList.contains('show');
  let editCameFromAccounts = false;
  let addCameFromAccounts = false;
  let mbankCameFromImport = false;
  document.addEventListener('click', function (event) {
    const btn = event.target && event.target.closest && event.target.closest('button, [id]');
    if (!btn) return;
    if (btn.matches('.account-menu-edit')) editCameFromAccounts = shown('accountsSheet');
    if (btn.id === 'addAccountOption') addCameFromAccounts = shown('accountsSheet');
    if (btn.id === 'openMbankFromImportBtn') mbankCameFromImport = shown('importSheet');
  }, true);
  function closeTopSheet() {
    if (typeof hideAllSheets === 'function') hideAllSheets();
    else {
      document.querySelectorAll('.sheet.show').forEach(sheet=>sheet.classList.remove('show'));
      get('overlay')?.classList.remove('show');
    }
  }
  window.handleAndroidBack = function () {
    if (shown('analyticsAccountPicker')) {
      if (typeof closeAnalyticsAccountPicker === 'function') closeAnalyticsAccountPicker();
      else get('analyticsAccountPicker').classList.remove('show');
      return true;
    }
    const sheet = document.querySelector('.sheet.show');
    if (sheet) {
      switch (sheet.id) {
        case 'categoryEditSheet':
          get('categoryEditBackBtn')?.click(); return true;
        case 'categoryManagerSheet':
          get('categoryManagerBackBtn')?.click(); return true;
        case 'accountHistorySheet':
          get('historyBackBtn')?.click(); return true;
        case 'smsSheet':
          if (get('smsParsedBlock')?.style.display === 'block') get('smsBackBtn')?.click();
          else if (typeof openMbankConnectSheet === 'function') openMbankConnectSheet();
          else closeTopSheet();
          return true;
        case 'editSheet':
          if (editCameFromAccounts && typeof openAccountsSheet === 'function') openAccountsSheet();
          else closeTopSheet();
          editCameFromAccounts = false;
          return true;
        case 'addSheet':
          if (addCameFromAccounts && typeof openAccountsSheet === 'function') openAccountsSheet();
          else closeTopSheet();
          addCameFromAccounts = false;
          return true;
        case 'mbankConnectSheet':
          if (mbankCameFromImport && typeof openImportSheet === 'function') openImportSheet();
          else closeTopSheet();
          mbankCameFromImport = false;
          return true;
        default: closeTopSheet(); return true;
      }
    }
    if (shown('analyticsScreen')) {
      if (typeof closeAnalytics === 'function') closeAnalytics();
      else get('analyticsScreen').classList.remove('show');
      return true;
    }
    return false;
  };
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (window.handleAndroidBack()) event.preventDefault();
  });
})();