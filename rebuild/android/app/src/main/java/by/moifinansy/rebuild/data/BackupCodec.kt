package by.moifinansy.rebuild.data

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Backup format for the NEW isolated test app only.
 * Never assumes that it can read or replace the old installed app's database.
 */
class BackupCodec(private val database: FinanceDatabase) {
    private val dao = database.financeDao()
    private val maxSafe = 9_007_199_254_740_991L
    private val format = "moi-finansy-rebuild-room-v1"

    private fun sha256(input: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun JSON(o: JSONObject, key: String): String = o.getString(key)
    private fun nullable(o: JSONObject, key: String): String? =
        if (o.isNull(key)) null else o.getString(key)

    private fun integer(o: JSONObject, key: String): Long {
        val raw = o.get(key)
        require(raw is Number && Regex("^-?\\d+$").matches(raw.toString())) { "Некорректное целое поле: $key" }
        return raw.toString().toLong()
    }
    private fun optionalInteger(o: JSONObject, key: String): Long? =
        if (o.isNull(key)) null else integer(o, key)

    private fun checkSafe(value: Long) {
        require(value in -maxSafe..maxSafe) { "Сумма вне безопасного диапазона" }
    }
    private fun checkId(value: String) {
        require(value.length in 1..100) { "Некорректный идентификатор" }
    }

    @Synchronized
    fun exportJson(): String = database.runInTransaction(java.util.concurrent.Callable {
        // All three tables must belong to the same database snapshot.
        val accounts = JSONArray()
        for (a in dao.accounts()) accounts.put(
            JSONObject().put("id", a.id).put("name", a.name).put("currency", a.currency)
                .put("initialBalanceMinor", a.initialBalanceMinor).put("createdAt", a.createdAt)
        )
        val transactions = JSONArray()
        for (t in dao.allTransactionsForBackup()) transactions.put(
            JSONObject().put("id", t.id).put("kind", t.kind).put("amountMinor", t.amountMinor)
                .put("accountId", t.accountId).put("fromAccountId", t.fromAccountId)
                .put("toAccountId", t.toAccountId).put("category", t.category)
                .put("note", t.note).put("occurredAt", t.occurredAt)
                .put("createdAt", t.createdAt).put("sourceFingerprint", t.sourceFingerprint)
                .put("deletedAt", t.deletedAt)
        )
        val notifications = JSONArray()
        for (n in dao.allNotificationEvents()) notifications.put(
            JSONObject().put("id", n.id).put("fingerprint", n.fingerprint)
                .put("packageName", n.packageName).put("title", n.title)
                .put("body", n.body).put("receivedAt", n.receivedAt)
                .put("status", n.status).put("transactionId", n.transactionId)
        )
        val payload = JSONObject()
            .put("schemaVersion", 1)
            .put("accounts", accounts)
            .put("transactions", transactions)
            .put("notifications", notifications)
            .toString()
        val archive = JSONObject()
            .put("format", format)
            .put("exportedAt", System.currentTimeMillis())
            .put("sha256", sha256(payload))
            .put("payload", payload)
            .toString(2)
        require(archive.toByteArray(Charsets.UTF_8).size <= 25_000_000) {
            "Архив слишком большой для безопасного восстановления"
        }
        archive
    })

    /**
     * Restore is strictly create-only into an empty NEW app database.
     * All records are validated before the transaction; any insert failure rolls back.
     */
    @Synchronized
    fun importJson(raw: String): Int {
        require(raw.length in 1..25_000_000) { "Неподдерживаемый размер файла" }
        val archive = JSONObject(raw)
        require(archive.optString("format") == format) { "Это не резервная копия новой версии" }
        val serialized = archive.getString("payload")
        require(sha256(serialized) == archive.getString("sha256")) { "Контрольная сумма не совпала" }
        val payload = JSONObject(serialized)
        require(integer(payload, "schemaVersion") == 1L) { "Неподдерживаемая версия данных" }
        val rawAccounts = payload.getJSONArray("accounts")
        val rawTransactions = payload.getJSONArray("transactions")
        val rawNotifications = payload.getJSONArray("notifications")
        require(rawAccounts.length() <= 2000 && rawTransactions.length() <= 100_000 &&
                rawNotifications.length() <= 100_000) { "Слишком большой архив" }

        val accounts = mutableListOf<AccountEntity>()
        val accountIds = mutableSetOf<String>()
        val currencies = mutableMapOf<String, String>()
        for (i in 0 until rawAccounts.length()) {
            val o = rawAccounts.getJSONObject(i)
            val id = JSON(o, "id"); checkId(id)
            require(accountIds.add(id)) { "Дублируются счета" }
            val currency = JSON(o, "currency")
            require(currency in setOf("BYN", "USD", "EUR")) { "Неизвестная валюта" }
            val name = JSON(o, "name")
            require(name.isNotBlank() && name.length <= 60) { "Некорректное название счёта" }
            val opening = integer(o, "initialBalanceMinor"); checkSafe(opening)
            currencies[id] = currency
            accounts.add(AccountEntity(id, name, currency, opening, integer(o, "createdAt")))
        }

        val transactions = mutableListOf<TransactionEntity>()
        val transactionIds = mutableSetOf<String>()
        val sourceKeys = mutableSetOf<String>()
        for (i in 0 until rawTransactions.length()) {
            val o = rawTransactions.getJSONObject(i)
            val id = JSON(o, "id"); checkId(id)
            require(transactionIds.add(id)) { "Дублируются операции" }
            val kind = JSON(o, "kind")
            require(kind in setOf("expense", "income", "transfer")) { "Неизвестная операция" }
            val amount = integer(o, "amountMinor"); checkSafe(amount)
            require(amount > 0L) { "Недопустимая сумма" }
            val accountId = nullable(o, "accountId")
            val from = nullable(o, "fromAccountId")
            val to = nullable(o, "toAccountId")
            if (kind == "transfer") {
                require(from != null && to != null && from != to && currencies[from] == currencies[to] && currencies[from] != null) {
                    "Некорректный перевод"
                }
            } else {
                require(accountId != null && currencies.containsKey(accountId)) { "Счёт операции отсутствует" }
            }
            val sourceKey = nullable(o, "sourceFingerprint")
            if (sourceKey != null) require(sourceKeys.add(sourceKey)) { "Дубликаты исходных операций" }
            val timestamp = integer(o, "occurredAt")
            require(timestamp in 946684800000L..4102444800000L) { "Неправильная дата операции" }
            val category = JSON(o, "category")
            val note = JSON(o, "note")
            require(category.length <= 60 && note.length <= 250) { "Слишком длинный текст операции" }
            transactions.add(
                TransactionEntity(id, kind, amount, accountId, from, to, category, note,
                    timestamp, integer(o, "createdAt"), sourceKey, optionalInteger(o, "deletedAt"))
            )
        }

        val notifications = mutableListOf<NotificationEventEntity>()
        val notificationIds = mutableSetOf<String>()
        val fingerprints = mutableSetOf<String>()
        for (i in 0 until rawNotifications.length()) {
            val o = rawNotifications.getJSONObject(i)
            val id = JSON(o, "id"); checkId(id)
            val fingerprint = JSON(o, "fingerprint"); checkId(fingerprint)
            require(notificationIds.add(id) && fingerprints.add(fingerprint)) { "Дублируются уведомления" }
            val status = JSON(o, "status")
            require(status in setOf("pending", "processed", "needs_review", "ignored")) { "Неизвестный статус" }
            val linkedId = nullable(o, "transactionId")
            require(linkedId == null || transactionIds.contains(linkedId)) { "Связанная операция отсутствует" }
            notifications.add(
                NotificationEventEntity(id, fingerprint, JSON(o, "packageName"),
                    JSON(o, "title"), JSON(o, "body"),
                    integer(o, "receivedAt"), status, linkedId)
            )
        }

        database.runInTransaction {
            require(dao.accounts().isEmpty() && dao.allTransactionsForBackup().isEmpty() &&
                dao.allNotificationEvents().isEmpty()) {
                "Восстановление разрешено только в пустую новую базу; текущие данные не тронуты"
            }
            for (a in accounts) dao.insertAccount(a)
            for (t in transactions) dao.insertTransaction(t)
            for (n in notifications) {
                require(dao.captureNotification(n) != -1L) { "Не удалось восстановить уведомление" }
            }
        }
        return accounts.size + transactions.size + notifications.size
    }
}
