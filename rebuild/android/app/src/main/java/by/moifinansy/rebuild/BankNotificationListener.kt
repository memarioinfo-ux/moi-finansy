package by.moifinansy.rebuild

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import by.moifinansy.rebuild.data.FinanceDatabase
import by.moifinansy.rebuild.data.NotificationEventEntity
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Raw event intake only. No balance changes and no content sent over a network.
 * Android may stop notification delivery if the user revokes access or the OS kills
 * the listener; it cannot recover notifications it never received.
 */
class BankNotificationListener : NotificationListenerService() {
    private val worker = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(250).orEmpty()
        val body = (
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)
        )?.toString()?.take(3000).orEmpty()

        if (!BankNotificationPolicy.isAllowed(sbn.packageName, title, body)) return
        val at = sbn.postTime.takeIf { it > 946684800000L } ?: System.currentTimeMillis()
        val source = listOf(sbn.packageName, sbn.key, at.toString(), title, body).joinToString("\n")
        val fingerprint = MessageDigest.getInstance("SHA-256")
            .digest(source.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val entity = NotificationEventEntity(
            id = UUID.randomUUID().toString(),
            fingerprint = fingerprint,
            packageName = sbn.packageName,
            title = title,
            body = body,
            receivedAt = at,
            status = "needs_review"
        )
        worker.execute {
            try {
                FinanceDatabase.get(applicationContext).financeDao().captureNotification(entity)
            } catch (_: Exception) {
                // No sensitive notification contents in Android logs.
                // A later release will add a local-only listener health monitor.
            }
        }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
