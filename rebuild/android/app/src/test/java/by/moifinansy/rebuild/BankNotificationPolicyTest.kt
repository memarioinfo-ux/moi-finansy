package by.moifinansy.rebuild

import org.junit.Assert.*
import org.junit.Test

class BankNotificationPolicyTest {
    @Test fun permitsKnownBankPayment() {
        assertTrue(BankNotificationPolicy.isAllowed(
            "by.alfabank.app.insnc3", "Операция по карте", "Оплата 12,35 BYN в магазине"
        ))
        assertTrue(BankNotificationPolicy.isAllowed(
            "by.softclub.belarusbank", "Mbank", "Списание 10.12 BYN, карта ****1234"
        ))
    }

    @Test fun rejectsUnrelatedApplicationsAndAuthenticationMessages() {
        assertFalse(BankNotificationPolicy.isAllowed(
            "org.telegram.messenger", "Чат", "Покупка 12,35 BYN"
        ))
        assertFalse(BankNotificationPolicy.isAllowed(
            "by.alfabank.app.insnc3", "Ваш одноразовый код", "123456"
        ))
        assertFalse(BankNotificationPolicy.isAllowed(
            "by.alfabank.abm", "Вход в приложение", "Код подтверждения 345678"
        ))
        assertFalse(BankNotificationPolicy.isAllowed(
            "by.alfabank.abm", "Новости банка", "Новые скидки для клиентов"
        ))
    }
}
