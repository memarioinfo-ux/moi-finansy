#!/usr/bin/env python3
"""Apply background bank reminders to v18.5.2 WITHOUT touching financial state."""
from pathlib import Path
root=Path("app")
j=root/"src/main/java/com/alina/budget"
assets=root/"src/main/assets"
def edit(path, old, new):
    s=path.read_text(encoding="utf-8")
    if old not in s:
        raise RuntimeError(f"Patch anchor missing: {path.name}: {old[:80]}")
    path.write_text(s.replace(old,new,1),encoding="utf-8")

s=j/"NotificationStore.java"
edit(s,"public static synchronized void enqueue(Context context, JSONObject item) {",
       "public static synchronized boolean enqueue(Context context, JSONObject item) {")
edit(s,"                return;\n            }\n            next.put(old);",
       "                return false;\n            }\n            next.put(old);")
edit(s,'        prefs(context).edit().putString(KEY_QUEUE, next.toString()).apply();\n    }',
       '        return prefs(context).edit().putString(KEY_QUEUE, next.toString()).commit();\n    }')

edit(j/"MbankNotificationListener.java",
    "            NotificationStore.enqueue(getApplicationContext(), item);",
    """            String brand = "Alfa-Bank".equals(bank) ? "alpha" : "belarusbank";
            String cycleId = BackgroundBankReminders.routeCycle(getApplicationContext(), brand,
                payload.mergedText);
            if (!cycleId.isEmpty()) item.put("targetCycleId", cycleId);
            boolean queued = NotificationStore.enqueue(getApplicationContext(), item);
            if (queued && !cycleId.isEmpty()) {
                BackgroundBankReminders.notifyNewBankMessage(getApplicationContext(), item);
            }""")

edit(j/"CategoryReminderNotifications.java",
    '    public static final String EXTRA_CYCLE_ID = "category_reminder_cycle_id";',
    '''    public static final String EXTRA_CYCLE_ID = "category_reminder_cycle_id";
    public static final String EXTRA_NATIVE_FP = "background_reminder_native_fingerprint";''')
edit(j/"CategoryReminderNotifications.java",
    "    public static void cancel(Context context, String transactionId) {",
    """    public static void showBackgroundCandidate(Context context, String cycleId, String fingerprint) {
        if (fingerprint == null || fingerprint.isEmpty() || cycleId == null || cycleId.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = manager(context);
        if (nm == null) return;
        createChannel(context);
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.alina.finances.OPEN_BACKGROUND_BANK_REVIEW");
        intent.setData(Uri.parse("alina-finances://background-review/" + Uri.encode(cycleId) + "/" + Uri.encode(fingerprint)));
        intent.putExtra(EXTRA_CYCLE_ID, cycleId);
        intent.putExtra(EXTRA_NATIVE_FP, fingerprint);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, fingerprint.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notice = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Мои финансы: проверь категорию")
            .setContentText("Получена банковская операция. Нажми, чтобы проверить категорию.")
            .setContentIntent(pending).setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(Notification.CATEGORY_REMINDER).build();
        nm.notify("native:" + fingerprint, NOTIFICATION_ID, notice);
    }
    public static void cancelBackgroundCandidate(Context context, String fingerprint) {
        if (fingerprint == null || fingerprint.isEmpty()) return;
        NotificationManager nm = manager(context);
        if (nm != null) nm.cancel("native:" + fingerprint, NOTIFICATION_ID);
    }

    public static void cancel(Context context, String transactionId) {""")

edit(j/"NativeBridge.java",
    '    @JavascriptInterface\n    public void showCategoryReminder',
    '''    @JavascriptInterface
    public boolean syncBackgroundBankSettings(String json) {
        return BackgroundBankReminders.updateActiveConfig(activity, json);
    }
    @JavascriptInterface
    public void cancelBackgroundReminder(String fingerprint) {
        CategoryReminderNotifications.cancelBackgroundCandidate(activity, fingerprint);
    }

    @JavascriptInterface
    public void showCategoryReminder''')

edit(j/"MainActivity.java",
    '''                deliverQueuedNotifications();
                refreshNativeStatus();
                deliverCategoryReminderIntent();''',
    '''                refreshNativeStatus();
                runJs("if(window.syncNativeBankSettings){window.syncNativeBankSettings();}");
                if (!deliverCategoryReminderIntent()) deliverQueuedNotifications();''')
edit(j/"MainActivity.java",
    '''            deliverCategoryReminderIntent();
        }
    }''',
    '''            if (!deliverCategoryReminderIntent()) deliverQueuedNotifications();
        }
    }''')
edit(j/"MainActivity.java",
    '''                deliverQueuedNotifications();
                deliverCategoryReminderIntent();''',
    '''                if (!deliverCategoryReminderIntent()) deliverQueuedNotifications();''')
edit(j/"MainActivity.java",
    '    private String pendingReminderCycleId;',
    '''    private String pendingReminderCycleId;
    private String pendingReminderNativeFingerprint;''')
edit(j/"MainActivity.java",
    '''        String tx = intent.getStringExtra(CategoryReminderNotifications.EXTRA_TX_ID);
        String cycle = intent.getStringExtra(CategoryReminderNotifications.EXTRA_CYCLE_ID);
        if (tx == null || tx.isEmpty() || cycle == null || cycle.isEmpty()) return;
        pendingReminderTransactionId = tx;
        pendingReminderCycleId = cycle;
        // Avoid opening the same editor repeatedly after app pause/resume.
        intent.removeExtra(CategoryReminderNotifications.EXTRA_TX_ID);
        intent.removeExtra(CategoryReminderNotifications.EXTRA_CYCLE_ID);''',
    '''        String tx = intent.getStringExtra(CategoryReminderNotifications.EXTRA_TX_ID);
        String cycle = intent.getStringExtra(CategoryReminderNotifications.EXTRA_CYCLE_ID);
        String nativeFingerprint = intent.getStringExtra(CategoryReminderNotifications.EXTRA_NATIVE_FP);
        if (cycle == null || cycle.isEmpty()) return;
        if (nativeFingerprint != null && !nativeFingerprint.isEmpty()) {
            pendingReminderCycleId = cycle;
            pendingReminderNativeFingerprint = nativeFingerprint;
            pendingReminderTransactionId = null;
        } else if (tx != null && !tx.isEmpty()) {
            pendingReminderTransactionId = tx;
            pendingReminderCycleId = cycle;
            pendingReminderNativeFingerprint = null;
        }
        intent.removeExtra(CategoryReminderNotifications.EXTRA_NATIVE_FP);
        intent.removeExtra(CategoryReminderNotifications.EXTRA_TX_ID);
        intent.removeExtra(CategoryReminderNotifications.EXTRA_CYCLE_ID);''')
edit(j/"MainActivity.java",
    '''    private void deliverCategoryReminderIntent() {
        if (!pageReady || pendingReminderTransactionId == null || pendingReminderCycleId == null) return;
        String tx = pendingReminderTransactionId;
        String cycle = pendingReminderCycleId;
        pendingReminderTransactionId = null;
        pendingReminderCycleId = null;
        runJs("if(window.openNativeCategoryReminder){window.openNativeCategoryReminder(" +
            JSONObject.quote(cycle) + "," + JSONObject.quote(tx) + ");}");
    }''',
    '''    private boolean deliverCategoryReminderIntent() {
        if (!pageReady || pendingReminderCycleId == null) return false;
        String cycle = pendingReminderCycleId;
        String tx = pendingReminderTransactionId;
        String fp = pendingReminderNativeFingerprint;
        if (tx == null && fp == null) return false;
        pendingReminderTransactionId = null;
        pendingReminderNativeFingerprint = null;
        pendingReminderCycleId = null;
        if (fp != null) {
            runJs("if(window.openNativeBackgroundReminder){window.openNativeBackgroundReminder(" +
                JSONObject.quote(cycle) + "," + JSONObject.quote(fp) + ");}");
        } else {
            runJs("if(window.openNativeCategoryReminder){window.openNativeCategoryReminder(" +
                JSONObject.quote(cycle) + "," + JSONObject.quote(tx) + ");}");
        }
        return true;
    }''')

html=assets/"app.html"
edit(html,
    '''    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ledger:LedgerPeriods.snapshot(),
      accounts,
      transactions,
      expenseCategories,
      incomeCategories,
      addCounter,
      currentAccount
    }));''',
    '''    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ledger:LedgerPeriods.snapshot(),
      accounts,
      transactions,
      expenseCategories,
      incomeCategories,
      addCounter,
      currentAccount
    }));
    if (typeof window.syncNativeBankSettings === 'function') window.syncNativeBankSettings();''')
edit(html,
    """    wallet:account.icon || '💳',
    account:account.id,""",
    """    wallet:account.icon || '💳',
    nativeFingerprint:parsed.nativeFingerprint || '',
    account:account.id,""")
edit(html,
    '''    arr.forEach(item=>{
      try{
        const result=processNativeBankItem(item);''',
    '''    const acknowledgedNative = [];
    arr.forEach(item=>{
      try{
        const targetCycle=String(item && item.targetCycleId || '');
        if (targetCycle && targetCycle !== LedgerPeriods.activeId()) {skipped++;return;}
        const result=processNativeBankItem(item);''')
edit(html,
    '''        if(result.duplicate) duplicates++;
        if(result.skipped) skipped++;''',
    '''        if(result.duplicate) duplicates++;
        if(result.skipped) skipped++;
        if(result.added || result.duplicate) {
          if(item && item.fingerprint) acknowledgedNative.push(String(item.fingerprint));
        }''')
edit(html,
    '''    unresolvedAddedIds.forEach(id => {
      if(typeof window.notifyUnclassifiedSavedTx === 'function') window.notifyUnclassifiedSavedTx(id);
    });''',
    '''    unresolvedAddedIds.forEach(id => {
      if(typeof window.notifyUnclassifiedSavedTx === 'function') window.notifyUnclassifiedSavedTx(id);
    });
    if(hasAndroidBridge() && typeof AndroidBridge.cancelBackgroundReminder === 'function') {
      acknowledgedNative.forEach(fp => {
        try { AndroidBridge.cancelBackgroundReminder(fp); } catch(_) {}
      });
    }''')
edit(html,'</body>','<script src="background_reminders_v18_5_3.js"></script>\n</body>')
edit(root/"build.gradle",
    'versionCode 8', 'versionCode 9')
edit(root/"build.gradle",
    "versionName '1.0.5.2'", "versionName '1.0.5.3'")
print("v18.5.3 source patch applied")
