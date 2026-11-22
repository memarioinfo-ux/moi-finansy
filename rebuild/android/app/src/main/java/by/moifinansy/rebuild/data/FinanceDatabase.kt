package by.moifinansy.rebuild.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey val id: String,
    val name: String,
    val currency: String,
    val initialBalanceMinor: Long,
    val createdAt: Long
)

@Entity(
    tableName = "transactions",
    indices = [Index(value = ["sourceFingerprint"], unique = true)]
)
data class TransactionEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val amountMinor: Long,
    val accountId: String?,
    val fromAccountId: String?,
    val toAccountId: String?,
    val category: String,
    val note: String,
    val occurredAt: Long,
    val createdAt: Long,
    val sourceFingerprint: String? = null,
    // A deliberate deletion hides the item from balances/history without destroying audit data.
    val deletedAt: Long? = null
)

@Entity(
    tableName = "notification_events",
    indices = [Index(value = ["fingerprint"], unique = true)]
)
data class NotificationEventEntity(
    @PrimaryKey val id: String,
    val fingerprint: String,
    val packageName: String,
    val title: String,
    val body: String,
    val receivedAt: Long,
    val status: String = "pending",
    val transactionId: String? = null
)

@Dao
interface FinanceDao {
    @Query("SELECT * FROM accounts ORDER BY createdAt ASC, id ASC")
    fun accounts(): List<AccountEntity>

    @Query("SELECT * FROM transactions WHERE deletedAt IS NULL ORDER BY occurredAt DESC, id ASC")
    fun transactions(): List<TransactionEntity>

    @Query("SELECT * FROM transactions ORDER BY createdAt ASC, id ASC")
    fun allTransactionsForBackup(): List<TransactionEntity>

    @Query("SELECT * FROM notification_events ORDER BY receivedAt ASC, id ASC")
    fun allNotificationEvents(): List<NotificationEventEntity>

    @Query("SELECT * FROM accounts WHERE id = :id LIMIT 1")
    fun account(id: String): AccountEntity?

    @Query("SELECT * FROM transactions WHERE id = :id LIMIT 1")
    fun transaction(id: String): TransactionEntity?

    @Query("SELECT * FROM notification_events WHERE status IN ('pending', 'needs_review') ORDER BY receivedAt DESC, id DESC LIMIT 100")
    fun notificationsForReview(): List<NotificationEventEntity>

    @Query("SELECT * FROM notification_events WHERE id = :id LIMIT 1")
    fun notification(id: String): NotificationEventEntity?

    @Query("UPDATE notification_events SET status = 'ignored' WHERE id = :id AND status IN ('pending', 'needs_review')")
    fun ignoreNotification(id: String): Int

    @Query("UPDATE notification_events SET status = 'processed', transactionId = :transactionId WHERE id = :id AND status IN ('pending', 'needs_review')")
    fun markNotificationProcessed(id: String, transactionId: String): Int

    @Query("SELECT COUNT(*) FROM notification_events WHERE status IN ('pending', 'needs_review')")
    fun unreviewedNotificationCount(): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertAccount(account: AccountEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertTransaction(transaction: TransactionEntity)

    @Update
    fun updateTransaction(transaction: TransactionEntity): Int

    @Query("UPDATE transactions SET deletedAt = :deletedAt WHERE id = :id AND deletedAt IS NULL")
    fun softDeleteTransaction(id: String, deletedAt: Long): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun captureNotification(event: NotificationEventEntity): Long
}

@Database(
    entities = [AccountEntity::class, TransactionEntity::class, NotificationEventEntity::class],
    version = 1,
    exportSchema = false
)
abstract class FinanceDatabase : RoomDatabase() {
    abstract fun financeDao(): FinanceDao

    companion object {
        @Volatile private var instance: FinanceDatabase? = null

        fun get(context: Context): FinanceDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    FinanceDatabase::class.java,
                    "moi_finansy_rebuild_v1.db"
                )
                    // Never use fallbackToDestructiveMigration for financial data.
                    .build()
                    .also { instance = it }
            }
    }
}
