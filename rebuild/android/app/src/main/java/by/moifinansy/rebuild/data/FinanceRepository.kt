package by.moifinansy.rebuild.data

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.util.UUID

/**
 * Single entrypoint for ledger writes. WebView does not own the authoritative data.
 * Calls originate from the WebView's dedicated JavaScript bridge background thread.
 */
class FinanceRepository(private val database: FinanceDatabase) {
    private val dao = database.financeDao()
    private val maximumSafeAmount = 9_007_199_254_740_991L
    private val availableCurrencies = setOf("BYN", "USD", "EUR")

    private fun text(value: String, field: String, maximum: Int): String {
        val trimmed = value.trim()
        require(trimmed.isNotEmpty() && trimmed.length <= maximum) {
            "$field: заполните поле (максимум $maximum символов)"
        }
        return trimmed
    }

    private fun parseMinor(input: String, allowNegative: Boolean = false): Long {
        val cleaned = input.trim().replace("\u00a0", "").replace(" ", "").replace(',', '.')
        require(Regex(if (allowNegative) "^-?\\d+(?:\\.\\d{1,2})?$" else "^\\d+(?:\\.\\d{1,2})?$").matches(cleaned)) {
            "Введите корректную сумму, например 12,50"
        }
        val value = try {
            BigDecimal(cleaned).movePointRight(2).longValueExact()
        } catch (_: ArithmeticException) {
            throw IllegalArgumentException("Сумма выходит за допустимые пределы")
        }
        require(value in -maximumSafeAmount..maximumSafeAmount) { "Слишком большая сумма" }
        if (!allowNegative) require(value > 0L) { "Сумма должна быть больше нуля" }
        return value
    }

    private fun accountOrThrow(id: String): AccountEntity =
        dao.account(id) ?: throw IllegalArgumentException("Счёт не найден")

    @Synchronized
    fun createAccount(name: String, currency: String, balance: String): JSONObject {
        val normalizedCurrency = currency.trim().uppercase()
        require(normalizedCurrency in availableCurrencies) { "Неподдерживаемая валюта" }
        dao.insertAccount(
            AccountEntity(
                id = UUID.randomUUID().toString(),
                name = text(name, "Название счёта", 60),
                currency = normalizedCurrency,
                initialBalanceMinor = parseMinor(balance, allowNegative = true),
                createdAt = System.currentTimeMillis()
            )
        )
        return snapshot()
    }

    @Synchronized
    fun saveTransaction(payload: JSONObject): JSONObject {
        val id = payload.optString("id").trim()
        val sourceNotificationId = payload.optString("sourceNotificationId").trim().ifBlank { null }
        require(sourceNotificationId == null || id.isBlank()) {
            "Нельзя привязать уведомление к существующей операции"
        }
        val event = sourceNotificationId?.let { dao.notification(it) }
        if (sourceNotificationId != null) {
            require(event != null && event.status in setOf("pending", "needs_review")) {
                "Это уведомление уже обработано либо не найдено"
            }
        }
        val kind = payload.optString("kind")
        require(kind in setOf("income", "expense", "transfer")) { "Неизвестный тип операции" }
        val amountMinor = parseMinor(payload.optString("amount"))
        val occurredAt = payload.optLong("occurredAt", 0L)
        require(occurredAt in 946684800000L..4102444800000L) { "Проверьте дату операции" }

        var accountId: String? = null
        var fromAccountId: String? = null
        var toAccountId: String? = null
        if (kind == "transfer") {
            fromAccountId = text(payload.optString("fromAccountId"), "Счёт списания", 80)
            toAccountId = text(payload.optString("toAccountId"), "Счёт зачисления", 80)
            require(fromAccountId != toAccountId) { "Выберите два разных счёта" }
            require(accountOrThrow(fromAccountId).currency == accountOrThrow(toAccountId).currency) {
                "Переводы между разными валютами пока не поддерживаются"
            }
        } else {
            accountId = text(payload.optString("accountId"), "Счёт", 80)
            accountOrThrow(accountId)
        }

        val old = if (id.isBlank()) null else dao.transaction(id)
        if (id.isNotBlank()) {
            require(old != null && old.deletedAt == null) { "Операция для изменения не найдена" }
        }

        val now = System.currentTimeMillis()
        val updated = TransactionEntity(
            id = old?.id ?: UUID.randomUUID().toString(),
            kind = kind,
            amountMinor = amountMinor,
            accountId = accountId,
            fromAccountId = fromAccountId,
            toAccountId = toAccountId,
            category = if (kind == "transfer") "Перевод" else payload.optString("category").trim().take(60).ifBlank { "Без категории" },
            note = payload.optString("note").trim().take(250),
            occurredAt = occurredAt,
            createdAt = old?.createdAt ?: now,
            sourceFingerprint = event?.fingerprint ?: old?.sourceFingerprint,
            deletedAt = null
        )
        if (event != null && sourceNotificationId != null) {
            // Link and ledger entry must be a single transaction, so a retry cannot
            // create a duplicate or mark an event done without a matching entry.
            database.runInTransaction {
                val current = dao.notification(sourceNotificationId)
                require(current != null && current.status in setOf("pending", "needs_review")) {
                    "Уведомление уже было обработано"
                }
                dao.insertTransaction(updated)
                check(dao.markNotificationProcessed(sourceNotificationId, updated.id) == 1)
            }
        } else if (old == null) dao.insertTransaction(updated)
        else check(dao.updateTransaction(updated) == 1) { "Не удалось изменить операцию" }
        return snapshot()
    }

    @Synchronized
    fun ignoreNotification(id: String): JSONObject {
        require(id.isNotBlank() && dao.ignoreNotification(id) == 1) {
            "Уведомление уже обработано или не найдено"
        }
        return snapshot()
    }

    @Synchronized
    fun deleteTransaction(id: String): JSONObject {
        require(id.isNotBlank()) { "Не выбрана операция" }
        require(dao.softDeleteTransaction(id, System.currentTimeMillis()) == 1) {
            "Операция уже удалена или не найдена"
        }
        return snapshot()
    }

    @Synchronized
    fun snapshot(): JSONObject {
        val accounts = dao.accounts()
        val transactions = dao.transactions()
        val balances = accounts.associate { it.id to it.initialBalanceMinor }.toMutableMap()

        fun update(id: String, value: Long) {
            val current = balances[id] ?: throw IllegalStateException("Счёт операции не найден")
            val next = Math.addExact(current, value)
            require(next in -maximumSafeAmount..maximumSafeAmount) { "Остаток выходит за допустимые пределы" }
            balances[id] = next
        }

        for (tx in transactions) {
            when (tx.kind) {
                "income" -> update(requireNotNull(tx.accountId), tx.amountMinor)
                "expense" -> update(requireNotNull(tx.accountId), -tx.amountMinor)
                "transfer" -> {
                    update(requireNotNull(tx.fromAccountId), -tx.amountMinor)
                    update(requireNotNull(tx.toAccountId), tx.amountMinor)
                }
                else -> throw IllegalStateException("Неизвестный тип операции в базе")
            }
        }

        val jsonAccounts = JSONArray()
        for (a in accounts) {
            jsonAccounts.put(
                JSONObject()
                    .put("id", a.id)
                    .put("name", a.name)
                    .put("currency", a.currency)
                    .put("initialBalanceMinor", a.initialBalanceMinor)
                    .put("balanceMinor", balances.getValue(a.id))
            )
        }
        val jsonTransactions = JSONArray()
        for (t in transactions) {
            jsonTransactions.put(
                JSONObject()
                    .put("id", t.id)
                    .put("kind", t.kind)
                    .put("amountMinor", t.amountMinor)
                    .put("accountId", t.accountId)
                    .put("fromAccountId", t.fromAccountId)
                    .put("toAccountId", t.toAccountId)
                    .put("category", t.category)
                    .put("note", t.note)
                    .put("occurredAt", t.occurredAt)
            )
        }
        val jsonNotifications = JSONArray()
        for (n in dao.notificationsForReview()) {
            val detected = BankPushParser.suggest(n.packageName, n.title, n.body)
            val suggestion = if (detected == null) JSONObject.NULL else JSONObject()
                .put("kind", detected.kind)
                .put("amountMinor", detected.amountMinor)
                .put("currency", detected.currency)
                .put("cardLast4", detected.cardLast4)
            jsonNotifications.put(JSONObject()
                .put("suggestion", suggestion)
                .put("id", n.id)
                .put("packageName", n.packageName)
                .put("title", n.title)
                .put("body", n.body)
                .put("receivedAt", n.receivedAt)
                .put("status", n.status)
            )
        }
        return JSONObject()
            .put("accounts", jsonAccounts)
            .put("transactions", jsonTransactions)
            .put("notifications", jsonNotifications)
            .put("unreviewedNotifications", dao.unreviewedNotificationCount())
            .put("databaseVersion", 1)
    }
}
