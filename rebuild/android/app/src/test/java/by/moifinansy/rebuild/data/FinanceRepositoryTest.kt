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
class FinanceRepositoryTest {
    private lateinit var database: FinanceDatabase
    private lateinit var repository: FinanceRepository
    private val timestamp = 1795340000000L

    @Before
    fun setup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, FinanceDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = FinanceRepository(database)
    }

    @After
    fun close() = database.close()

    private fun addAccount(name: String, currency: String, balance: String): String {
        val result = repository.createAccount(name, currency, balance)
        val arr = result.getJSONArray("accounts")
        return (0 until arr.length())
            .map { arr.getJSONObject(it) }
            .first { it.getString("name") == name }
            .getString("id")
    }

    private fun addOperation(kind: String, amount: String, account: String,
                             destination: String? = null): String {
        val json = JSONObject().put("kind", kind).put("amount", amount).put("occurredAt", timestamp)
        if (kind == "transfer") {
            json.put("fromAccountId", account).put("toAccountId", destination)
        } else json.put("accountId", account)
        val snap = repository.saveTransaction(json)
        return snap.getJSONArray("transactions").getJSONObject(0).getString("id")
    }

    private fun balance(id: String): Long {
        val array = repository.snapshot().getJSONArray("accounts")
        for (i in 0 until array.length()) {
            val account = array.getJSONObject(i)
            if (account.getString("id") == id) return account.getLong("balanceMinor")
        }
        error("Account not found")
    }

    @Test
    fun monetaryCalculationsAreExactAndTransfersHaveNoIncomeExpenseEffect() {
        val card = addAccount("Карта", "BYN", "100,00")
        val cash = addAccount("Наличные", "BYN", "20,00")
        addOperation("expense", "4,31", card)
        addOperation("income", "10,00", card)
        addOperation("transfer", "5,00", card, cash)

        assertEquals(10069L, balance(card))
        assertEquals(2500L, balance(cash))
        assertEquals(3, repository.snapshot().getJSONArray("transactions").length())
    }

    @Test
    fun softDeletionRemovesTransactionFromBalanceButKeepsAuditRecord() {
        val id = addAccount("Карта", "BYN", "100,00")
        val transactionId = addOperation("expense", "4,31", id)
        assertEquals(9569L, balance(id))
        repository.deleteTransaction(transactionId)
        assertEquals(10000L, balance(id))
        assertEquals(0, database.financeDao().transactions().size)
        assertEquals(1, database.financeDao().allTransactionsForBackup().size)
    }

    @Test
    fun crossCurrencyTransferIsRejectedWithoutChangingBalances() {
        val card = addAccount("BYN карта", "BYN", "100,00")
        val foreign = addAccount("USD карта", "USD", "5,00")
        try {
            addOperation("transfer", "5,00", card, foreign)
            fail("Cannot transfer without exchange between currencies")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message?.contains("валют") == true)
        }
        assertEquals(10000L, balance(card))
        assertEquals(500L, balance(foreign))
        assertEquals(0, database.financeDao().transactions().size)
    }

    @Test
    fun invalidMoneyDoesNotModifyDatabase() {
        val card = addAccount("Карта", "BYN", "100,00")
        for (invalid in listOf("-1,00", "10,999", "NaN", "")) {
            try {
                addOperation("expense", invalid, card)
                fail("Invalid amount accepted: $invalid")
            } catch (_: IllegalArgumentException) { }
        }
        assertEquals(0, database.financeDao().transactions().size)
        assertEquals(10000L, balance(card))
    }
}
