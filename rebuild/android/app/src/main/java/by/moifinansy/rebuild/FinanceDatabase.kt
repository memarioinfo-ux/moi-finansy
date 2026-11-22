package by.moifinansy.rebuild

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import java.util.UUID

@Entity(tableName = "accounts")
data class Account(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val name: String,
    val currency: String = "BYN",
    val initialBalanceMinor: Long = 0L,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "transactions",
    indices = [Index("accountId"), Index("otherAccountId"), Index(value = ["sourceFingerprint"], unique = true)]
)
data class FinanceTransaction(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val kind: String, // income, expense, transfer
    val accountId: String,
    val otherAccountId: String? = null,
    val amountMinor: Long,
    val note: String = "",
    val occurredAt: Long = System.currentTimeMillis(),
    val sourceFingerprint: String? = null
)

@Entity(tableName = "raw_bank_notifications", indices = [Index(value = ["fingerprint"], unique = true)])
data class RawBankNotification(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val fingerprint: String,
    val packageName: String,
    val title: String,
    val message: String,
    val receivedAt: Long,
    val status: String = "pending"
)

data class AccountTotals(
    val id: String,
    val name: String,
    val currency: String,
    val balanceMinor: Long
)

@Dao
interface FinanceDao {
    @Query("SELECT * FROM accounts ORDER BY createdAt, id")
    fun accounts(): List<Account>

    @Query("SELECT * FROM transactions ORDER BY occurredAt DESC, id DESC")
    fun transactions(): List<FinanceTransaction>

    @Query("SELECT * FROM raw_bank_notifications ORDER BY receivedAt DESC")
    fun notifications(): List<RawBankNotification>

    @Insert
    fun insertAccount(account: Account)

    @Insert
    fun insertTransaction(transaction: FinanceTransaction)

    @Insert
    fun insertNotification(notification: RawBankNotification)

    @Query("SELECT COUNT(*) FROM raw_bank_notifications WHERE status = 'pending'")
    fun pendingNotifications(): Int
}

@Database(
    entities = [Account::class, FinanceTransaction::class, RawBankNotification::class],
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
                    "moi_finansy_v2.db"
                )
                // NEVER use destructive fallback: financial history must survive schema changes.
                .build().also { instance = it }
            }
    }
}

object FinanceRules {
    fun parseMoney(raw: String): Long {
        val value = raw.trim().replace(" ", "").replace("\u00A0", "")
        require(Regex("""\d+(?:[.,]\d{1,2})?""").matches(value)) {
            "Введите сумму, например 12,50"
        }
        val parts = value.replace(',', '.').split('.')
        val major = parts[0].toLongOrNull() ?: error("Сумма слишком большая")
        val fractional = (parts.getOrNull(1) ?: "").padEnd(2, '0').toLong()
        val amount = Math.addExact(Math.multiplyExact(major, 100L), fractional)
        require(amount > 0) { "Сумма должна быть больше нуля" }
        return amount
    }

    fun formatMoney(amount: Long): String {
        val absolute = if (amount < 0) {
            // Negative Long.MIN_VALUE cannot be represented as an absolute Long.
            java.math.BigInteger.valueOf(amount).abs().toString()
        } else amount.toString()
        val digits = absolute.padStart(3, '0')
        val cents = digits.takeLast(2)
        val major = digits.dropLast(2)
        return (if (amount < 0) "−" else "") + major + "," + cents
    }

    fun validateTransaction(tx: FinanceTransaction, accounts: List<Account>) {
        require(tx.amountMinor > 0) { "Сумма должна быть больше нуля" }
        val source = accounts.find { it.id == tx.accountId } ?: error("Исходный счёт не найден")
        when (tx.kind) {
            "income", "expense" -> require(tx.otherAccountId == null) { "Лишний счёт" }
            "transfer" -> {
                val destination = accounts.find { it.id == tx.otherAccountId }
                    ?: error("Счёт назначения не найден")
                require(destination.id != source.id) { "Нельзя перевести на тот же счёт" }
                require(destination.currency == source.currency) { "Обмен валют пока не поддерживается" }
            }
            else -> error("Неизвестный вид операции")
        }
    }

    fun balances(accounts: List<Account>, operations: List<FinanceTransaction>): Map<String, Long> {
        val result = accounts.associate { it.id to it.initialBalanceMinor }.toMutableMap()
        for (tx in operations) {
            validateTransaction(tx, accounts)
            val before = result[tx.accountId] ?: error("Исходный счёт не найден")
            result[tx.accountId] = when (tx.kind) {
                "income" -> Math.addExact(before, tx.amountMinor)
                else -> Math.subtractExact(before, tx.amountMinor)
            }
            if (tx.kind == "transfer") {
                val to = tx.otherAccountId!!
                result[to] = Math.addExact(result[to] ?: error("Счёт назначения не найден"), tx.amountMinor)
            }
        }
        return result
    }
}
