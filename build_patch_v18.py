#!/usr/bin/env python3
"""Patch v17 at build time without replacing user's existing PWA or finance storage."""
from pathlib import Path

html_file=Path('app/src/main/assets/app.html')
java_file=Path('app/src/main/java/com/alina/budget/MainActivity.java')
manifest_file=Path('app/src/main/AndroidManifest.xml')
html=html_file.read_text(encoding='utf-8')

old="    newTx.merchant=oldTx.merchant || '';\n\n    transactions[index]=newTx;"
new="""    newTx.merchant=oldTx.merchant || '';
    if (oldTx.categoryId !== cat.id && typeof window.rememberMerchantCategory === 'function') {
      window.rememberMerchantCategory(oldTx, cat);
    }

    transactions[index]=newTx;"""
assert old in html,'Missing transaction editor hook'
html=html.replace(old,new,1)

old="const cat = categoryOverride || (mcc && mccCategoryRules[mcc]) || inferCategory(merchant, type);"
assert old in html,'Missing Belarusbank SMS rule'
html=html.replace(old,"const cat = categoryOverride || inferCategoryWithMcc(merchant,type,mcc);",1)

old="const cat=(mcc && mccCategoryRules[mcc]) || (type==='income'"
assert old in html,'Missing Belarusbank push rule'
html=html.replace(old,"const cat=(type==='expense' ? inferCategoryWithMcc(merchant,type,mcc) : null) || (type==='income'",1)

assert html.count('</body>')==1,'Ambiguous HTML body'
html=html.replace('</body>','<script src="v18_category.js"></script>\n<script src="v18_navigation.js"></script>\n</body>')
html_file.write_text(html,encoding='utf-8')

java=java_file.read_text(encoding='utf-8')
old="""    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }"""
new="""    private boolean backNavigationPending = false;

    @Override
    public void onBackPressed() {
        if (webView == null || !pageReady) {
            super.onBackPressed();
            return;
        }
        if (backNavigationPending) return;
        backNavigationPending = true;
        webView.evaluateJavascript(
            "(function(){try{return !!(window.handleAndroidBack && window.handleAndroidBack());}catch(e){return false;}})();",
            result -> {
                backNavigationPending = false;
                if ("true".equalsIgnoreCase(String.valueOf(result).trim())) return;
                if (webView != null && webView.canGoBack()) webView.goBack();
                else moveTaskToBack(true);
            }
        );
    }"""
assert old in java,'Missing native back handler'
java_file.write_text(java.replace(old,new,1),encoding='utf-8')

manifest=manifest_file.read_text(encoding='utf-8')
if 'android:enableOnBackInvokedCallback' not in manifest:
    manifest=manifest.replace('android:allowBackup=', 'android:enableOnBackInvokedCallback="false" android:allowBackup=',1)
manifest_file.write_text(manifest,encoding='utf-8')
print('Patched Android back navigation and categorized bank operations')
