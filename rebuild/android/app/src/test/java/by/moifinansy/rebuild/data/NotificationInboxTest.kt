package by.moifinansy.rebuild.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NotificationInboxTest {
    private lateinit var database: FinanceDatabase
    private lateinit var repository: FinanceRepository
    private val date = 1795340000000L

    @Before
    fun setup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, FinanceDatabase::class.java)
            .allowMainThreadQueries().build()
        repository = FinanceRepository(database)
    }

    @After
    fun teardown() = database.close()

    private fun accountId(): String {
        val result = repository.createAccount("Карта", "BYN", "100,00")
        return result.getJSONArray("accounts").getJSONObject(0).getString("id")
    }

    private fun message(id: String, fingerprint: String = "fingerprint-A") =
        NotificationEventEntity(id, fingerprint, "by.alfabank.app.insnc3",
            "Операция", "Покупка 15.20 BYN", date, "needs_review")

    private fun operation(accountId: String, eventId: String): JSONObject =
        JSONObject().put("kind", "expense").put("accountId", accountId)
            .put("amount", "15,20").put("occurredAt", date)
            .put("sourceNotificationId", eventId)

    @Test
    fun rawDuplicateIsIgnoredWithoutChangingBalances() {
        val card = accountId()
        val dao = database.financeDao()
        assertTrue(dao.captureNotification(message("n1")) > 0)
        assertEquals(-1L, dao.captureNotification(message("n2")))
        assertEquals(1, dao.allNotificationEvents().size)
        assertEquals(1, repository.snapshot().getInt("unreviewedNotifications"))
        assertEquals(10_000L,
            repository.snapshot().getJSONArray("accounts").getJSONObject(0).getLong("balanceMinor"))
    }

    @Test
    fun manualReconciliationIsAtomicAndCannotBeRepeated() {
        val card = accountId()
        val dao = database.financeDao()
        dao.captureNotification(message("n1"))
        val snapshot = repository.saveTransaction(operation(card, "n1"))
        assertEquals(8_480L,
            snapshot.getJSONArray("accounts").getJSONObject(0).getLong("balanceMinor"))
        assertEquals(0, snapshot.getInt("unreviewedNotifications"))
        assertEquals("processed", dao.notification("n1")?.status)
        assertEquals("fingerprint-A", dao.transactions().single().sourceFingerprint)
        assertEquals(dao.transactions().single().id, dao.notification("n1")?.transactionId)
        try {
            repository.saveTransaction(operation(card, "n1"))
            fail("Duplicate reconciliation must not be accepted")
        } catch (_: IllegalArgumentException) { }
        assertEquals(1, dao.transactions().size)
    }

    @Test
    fun invalidAmountLeavesNotificationUnreviewed() {
        val card = accountId()
        val dao = database.financeDao()
        dao.captureNotification(message("n1"))
        try {
            repository.saveTransaction(operation(card, "n1").put("amount", "bad"))
            fail("Bad amount must be rejected")
        } catch (_: IllegalArgumentException) { }
        assertEquals("needs_review", dao.notification("n1")?.status)
        assertTrue(dao.transactions().isEmpty())
    }

    @Test
    fun ignoreKeepsRawAuditAndPreventsBooking() {
        val card = accountId()
        val dao = database.financeDao()
        dao.captureNotification(message("n1"))
        repository.ignoreNotification("n1")
        assertEquals("ignored", dao.notification("n1")?.status)
        assertEquals(1, dao.allNotificationEvents().size)
        assertEquals(0, repository.snapshot().getInt("unreviewedNotifications"))
        try {
            repository.saveTransaction(operation(card, "n1"))
            fail("Ignored message must not be usable for booking")
        } catch (_: IllegalArgumentException) { }
    }
}
