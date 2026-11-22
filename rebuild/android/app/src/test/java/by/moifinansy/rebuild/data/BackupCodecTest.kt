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

/** Tests the real Room schema, backup checksum, empty-only policy and soft-delete preservation. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BackupCodecTest {
    private lateinit var original: FinanceDatabase
    private lateinit var restored: FinanceDatabase
    private val timestamp = 1795340000000L

    private fun makeDatabase(): FinanceDatabase {
        val context = ApplicationProvider.getApplicationContext<Context>()
        return Room.inMemoryDatabaseBuilder(context, FinanceDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @Before
    fun setup() {
        original = makeDatabase()
        restored = makeDatabase()
    }

    @After
    fun cleanup() {
        original.close()
        restored.close()
    }

    private fun seed(db: FinanceDatabase) {
        val dao = db.financeDao()
        dao.insertAccount(AccountEntity("card", "Карта", "BYN", 100_00L, timestamp))
        dao.insertAccount(AccountEntity("cash", "Наличные", "BYN", 20_00L, timestamp + 1L))
        dao.insertTransaction(
            TransactionEntity(
                "t1", "expense", 431L, "card", null, null,
                "Продукты", "Евроопт", timestamp, timestamp
            )
        )
        // Historical soft-deleted entries must be included in backups.
        dao.insertTransaction(
            TransactionEntity(
                "t2", "income", 1000L, "card", null, null,
                "Зарплата", "Отменена", timestamp + 1L, timestamp + 1L,
                deletedAt = timestamp + 5L
            )
        )
        dao.captureNotification(
            NotificationEventEntity(
                "n1", "fingerprint-1", "bank.app", "Оплата",
                "Списание 4,31 BYN", timestamp, "needs_review"
            )
        )
    }

    @Test
    fun backupRoundTripPreservesAllThreeTablesAndSoftDeletedEntries() {
        seed(original)
        val archive = BackupCodec(original).exportJson()
        val envelope = JSONObject(archive)
        assertEquals("moi-finansy-rebuild-room-v1", envelope.getString("format"))
        assertEquals(5, BackupCodec(restored).importJson(archive))

        val dao = restored.financeDao()
        assertEquals(2, dao.accounts().size)
        assertEquals(1, dao.transactions().size)
        assertEquals(2, dao.allTransactionsForBackup().size)
        assertNotNull(dao.transaction("t2")?.deletedAt)
        assertEquals("Евроопт", dao.transaction("t1")?.note)
        assertEquals(1, dao.allNotificationEvents().size)
        assertEquals(1, dao.unreviewedNotificationCount())

        val snapshot = FinanceRepository(restored).snapshot()
        assertEquals(9569L, snapshot.getJSONArray("accounts").getJSONObject(0).getLong("balanceMinor"))
    }

    @Test
    fun checksumMismatchDoesNotWriteAnyRecords() {
        seed(original)
        val archive = JSONObject(BackupCodec(original).exportJson())
        archive.put("payload", archive.getString("payload").replace("Евроопт", "Несовпадение"))
        try {
            BackupCodec(restored).importJson(archive.toString())
            fail("Checksum mismatch must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message?.contains("Контрольная сумма") == true)
        }
        assertEquals(0, restored.financeDao().accounts().size)
        assertEquals(0, restored.financeDao().allTransactionsForBackup().size)
        assertEquals(0, restored.financeDao().allNotificationEvents().size)
    }

    @Test
    fun restoreNeverOverwritesExistingData() {
        seed(original)
        val dao = restored.financeDao()
        dao.insertAccount(AccountEntity("keep", "Мой счёт", "BYN", 12345L, timestamp))
        try {
            BackupCodec(restored).importJson(BackupCodec(original).exportJson())
            fail("Import into nonempty database must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message?.contains("пустую") == true)
        }
        assertEquals(1, dao.accounts().size)
        assertEquals("keep", dao.accounts().single().id)
        assertEquals(0, dao.allTransactionsForBackup().size)
    }

    @Test
    fun importingTheSameArchiveTwiceIsRejectedWithoutDuplicates() {
        seed(original)
        val archive = BackupCodec(original).exportJson()
        BackupCodec(restored).importJson(archive)
        try {
            BackupCodec(restored).importJson(archive)
            fail("Second import must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message?.contains("пустую") == true)
        }
        assertEquals(2, restored.financeDao().allTransactionsForBackup().size)
    }
}
