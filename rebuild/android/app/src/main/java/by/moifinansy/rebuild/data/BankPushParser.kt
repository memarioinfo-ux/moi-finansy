package by.moifinansy.rebuild.data

import by.moifinansy.rebuild.BankNotificationPolicy

/**
 * Conservative suggestions for MANUAL review. The parser never writes a ledger
 * transaction or updates an account balance.
 *
 * Only explicit incoming/outgoing wording + one unambiguous monetary amount
 * produce a suggestion. We deliberately do not guess at transfers or FX.
 */
data class BankPushSuggestion(
    val kind: String,
    val amountMinor: Long,
    val currency: String,
    val cardLast4: String?
)

object BankPushParser {
    private val expenseWords = Regex(
        "покуп|оплат|списан|списание|сняти|расход|payment|purchase|withdraw|debit",
        RegexOption.IGNORE_CASE
    )
    private val incomeWords = Regex(
        "зачисл|поступ|пополн|возврат|refund|credited|income|заработн",
        RegexOption.IGNORE_CASE
    )
    private val transferWords = Regex("перевод|transfer|обмен|конвертац|exchange", RegexOption.IGNORE_CASE)
    private val balanceWords = Regex("остаток|доступно|balance|available", RegexOption.IGNORE_CASE)
    private val amountPattern = Regex(
        """(?<![\p{L}\d])([+\-−]?\s*(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d{1,9}))(?:[.,](\d{1,2}))?\s*(BYN|USD|EUR|Br|руб\.?)(?![\p{L}\d])""",
        RegexOption.IGNORE_CASE
    )
    private val cardPattern = Regex(
        """(?:карта|карте|card|KARTA)\s*[:№#-]?\s*(?:[•*xXхХ]{1,8}\s*)?(\d{4})(?!\d)""",
        RegexOption.IGNORE_CASE
    )
    private const val MAX_SAFE_MINOR = 9_007_199_254_740_991L

    fun suggest(packageName: String, title: String, body: String): BankPushSuggestion? {
        if (!BankNotificationPolicy.isAllowed(packageName, title, body)) return null
        val source = "$title\n$body"
        if (transferWords.containsMatchIn(source)) return null

        val incoming = incomeWords.containsMatchIn(source)
        val outgoing = expenseWords.containsMatchIn(source)
        if (incoming == outgoing) return null

        val cardRanges = cardPattern.findAll(source).map { it.range }.toList()
        val candidates = amountPattern.findAll(source).filter { match ->
            // Four digits after a card marker are an identifier, not a purchase.
            if (cardRanges.any { match.range.first in it }) return@filter false
            val before = source.substring(maxOf(0, match.range.first - 70), match.range.first)
            val balanceIndex = balanceWords.findAll(before).lastOrNull()?.range?.first ?: -1
            val actionIndex = (incomeWords.findAll(before).toList() +
                expenseWords.findAll(before).toList()).maxOfOrNull { it.range.first } ?: -1
            // Never treat a visible "Остаток / balance" as the transaction amount.
            balanceIndex <= actionIndex
        }.toList()

        if (candidates.size != 1) return null
        val match = candidates.single()
        val digits = match.groupValues[1].filter(Char::isDigit)
        if (digits.isEmpty() || digits.length > 12) return null

        val integer = digits.toLongOrNull() ?: return null
        val fractional = match.groupValues[2].padEnd(2, '0')
        val cents = fractional.toLongOrNull() ?: 0L
        if (integer > MAX_SAFE_MINOR / 100) return null
        val amountMinor = integer * 100 + cents
        if (amountMinor !in 1..MAX_SAFE_MINOR) return null

        val currency = when (match.groupValues[3].lowercase()) {
            "byn", "br", "руб", "руб." -> "BYN"
            "usd" -> "USD"
            "eur" -> "EUR"
            else -> return null
        }
        val card = cardPattern.find(source)?.groupValues?.getOrNull(1)
        return BankPushSuggestion(
            kind = if (incoming) "income" else "expense",
            amountMinor = amountMinor,
            currency = currency,
            cardLast4 = card
        )
    }
}
