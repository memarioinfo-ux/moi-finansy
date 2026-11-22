package by.moifinansy.rebuild.data

import org.junit.Assert.*
import org.junit.Test

/** All examples are invented test messages, not real bank messages. */
class BankPushParserTest {
    private val alfa = "by.alfabank.app.insnc3"
    private val belarusbank = "by.softclub.belarusbank"

    @Test fun expenseAndCardSuffix() {
        val suggestion = BankPushParser.suggest(
            alfa, "Оплата картой", "Покупка 12,35 BYN, карта ****1234"
        )
        assertNotNull(suggestion)
        assertEquals("expense", suggestion!!.kind)
        assertEquals(1235L, suggestion.amountMinor)
        assertEquals("BYN", suggestion.currency)
        assertEquals("1234", suggestion.cardLast4)
    }

    @Test fun incomingTransferWordingIsTooAmbiguous() {
        assertNull(BankPushParser.suggest(
            alfa, "Перевод", "Входящий перевод 20,00 BYN"
        ))
    }

    @Test fun refundAndThousandsSeparator() {
        val suggestion = BankPushParser.suggest(
            belarusbank, "Возврат", "Зачислено 1 234,56 BYN"
        )
        assertNotNull(suggestion)
        assertEquals("income", suggestion!!.kind)
        assertEquals(123456L, suggestion.amountMinor)
    }

    @Test fun balanceIsNotUsedAsPaymentAmount() {
        val suggestion = BankPushParser.suggest(
            alfa, "Оплата", "Покупка 8,50 BYN; Остаток 200,31 BYN"
        )
        assertNotNull(suggestion)
        assertEquals(850L, suggestion!!.amountMinor)
    }

    @Test fun ambiguousAmountsReturnNoSuggestion() {
        assertNull(BankPushParser.suggest(
            alfa, "Оплата", "Покупка 8,50 BYN и покупка 9,00 BYN"
        ))
    }

    @Test fun conflictingDirectionReturnsNoSuggestion() {
        assertNull(BankPushParser.suggest(
            alfa, "Оплата", "Списание и зачисление 10,00 BYN"
        ))
    }

    @Test fun onlyBalanceReturnsNoSuggestion() {
        assertNull(BankPushParser.suggest(
            alfa, "Зачисление", "Остаток 200,31 BYN"
        ))
    }

    @Test fun rejectsOneTimeCodeEvenWithAmount() {
        assertNull(BankPushParser.suggest(
            alfa, "Код подтверждения", "Оплата 10 BYN; код 123456"
        ))
    }

    @Test fun rejectsUnknownPackages() {
        assertNull(BankPushParser.suggest(
            "org.telegram.messenger", "Покупка", "Оплата 10 BYN"
        ))
    }

    @Test fun noDirectionGivesNoSuggestion() {
        assertNull(BankPushParser.suggest(alfa, "Операция", "10,00 BYN; карта ****1234"))
    }

    @Test fun currencyIsKeptAndNotConverted() {
        val suggestion = BankPushParser.suggest(
            alfa, "Покупка", "Списание 5.70 USD"
        )
        assertNotNull(suggestion)
        assertEquals(570L, suggestion!!.amountMinor)
        assertEquals("USD", suggestion.currency)
    }
}
