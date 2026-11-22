package by.moifinansy.rebuild

/**
 * Fail-closed allowlist: the listener is granted system-wide access by Android,
 * but this app persists only plausible payment events from known bank packages.
 * Package names originate in the previous app's notification parser.
 */
object BankNotificationPolicy {
    val acceptedPackages = setOf(
        "com.mobicon.mbank2.belarusbank",
        "by.softclub.belarusbank",
        "by.alfabank.app.insnc3",
        "by.alfabank.abm"
    )

    private val credentialWords = Regex(
        "код|парол|otp|одноразов|подтвержден|авторизац|вход в|verification|password|sign.in|security.code|2fa",
        RegexOption.IGNORE_CASE
    )
    private val transactionWords = Regex(
        "оплат|покуп|списан|зачисл|перевод|платеж|платёж|сняти|возврат|пополнен|\u043e\u043f\u0435\u0440\u0430\u0446|transaction|payment|purchase|withdraw|deposit|refund",
        RegexOption.IGNORE_CASE
    )
    private val currencyAmount = Regex(
        "\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?\\s*(?:BYN|USD|EUR|\\bBr\\b|\\bр\\.?\\b|\\bруб\\.?\\b)",
        RegexOption.IGNORE_CASE
    )

    fun isAllowed(packageName: String, title: String, body: String): Boolean {
        if (packageName !in acceptedPackages) return false
        val combined = "$title $body".trim()
        if (combined.length !in 12..4000) return false
        if (credentialWords.containsMatchIn(combined)) return false
        // Store ambiguous payment notifications in the review journal; never auto-book them.
        return currencyAmount.containsMatchIn(combined) ||
            (transactionWords.containsMatchIn(combined) && Regex("\\d").containsMatchIn(combined))
    }
}
