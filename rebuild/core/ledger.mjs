/**
 * Мои финансы v2 — чистое финансовое ядро.
 * Не зависит от DOM, Android, сети или хранилища. Денежные суммы — в копейках.
 */
export const SCHEMA_VERSION = 1;
const KINDS = new Set(['income', 'expense', 'transfer']);
const STATUSES = new Set(['pending', 'processed', 'needs_review', 'ignored']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function array(value, name) {
  assert(Array.isArray(value), `${name}: ожидался массив`);
  return value;
}
function str(value, name) {
  assert(typeof value === 'string' && value.trim(), `${name}: непустая строка обязательна`);
  return value;
}
function minor(value, name) {
  assert(Number.isSafeInteger(value) && value >= 0, `${name}: положительное целое число копеек`);
  return value;
}
export function parseMoney(value) {
  const s = String(value).trim().replace(/[\u00a0\s]/g, '');
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  assert(match, 'Сумма должна быть неотрицательным числом с максимум двумя знаками после запятой');
  const amount = Number(BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0'));
  minor(amount, 'Сумма');
  return amount;
}
export function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, accounts: [], transactions: [], notifications: [] };
}
export function validateState(state) {
  assert(state && typeof state === 'object' && state.schemaVersion === SCHEMA_VERSION, 'Неподдерживаемая версия данных');
  const accounts = array(state.accounts, 'accounts');
  const transactions = array(state.transactions, 'transactions');
  const notifications = array(state.notifications, 'notifications');
  const accountsById = new Map();
  for (const a of accounts) {
    str(a.id, 'account.id'); str(a.name, 'account.name'); str(a.currency, 'account.currency');
    assert(Number.isSafeInteger(a.initialBalanceMinor), 'Некорректный начальный остаток');
    assert(!accountsById.has(a.id), 'Повторяющийся account.id');
    accountsById.set(a.id, a);
  }
  const txIds = new Set();
  const sourceKeys = new Set();
  for (const n of notifications) {
    str(n.id, 'notification.id'); str(n.fingerprint, 'notification.fingerprint');
    assert(!sourceKeys.has(n.fingerprint), 'Дублирование исходного уведомления');
    sourceKeys.add(n.fingerprint);
    assert(STATUSES.has(n.status), 'Некорректный статус уведомления');
  }
  for (const t of transactions) {
    str(t.id, 'transaction.id');
    assert(!txIds.has(t.id), 'Повторяющийся transaction.id'); txIds.add(t.id);
    assert(KINDS.has(t.kind), 'Неизвестный вид операции');
    minor(t.amountMinor, 'transaction.amountMinor');
    assert(t.amountMinor > 0, 'Сумма операции должна быть больше нуля');
    assert(Number.isFinite(t.occurredAt), 'Некорректная дата операции');
    if (t.kind === 'transfer') {
      assert(accountsById.has(t.fromAccountId) && accountsById.has(t.toAccountId), 'Счёт перевода не найден');
      assert(t.fromAccountId !== t.toAccountId, 'Нельзя переводить на тот же счёт');
      assert(accountsById.get(t.fromAccountId).currency === accountsById.get(t.toAccountId).currency,
        'Перевод между разными валютами требует отдельной операции обмена');
    } else {
      assert(accountsById.has(t.accountId), 'Счёт операции не найден');
    }
  }
  return true;
}
export function addAccount(state, account) {
  const next = { ...state, accounts: [...state.accounts, { ...account }] };
  validateState(next);
  return next;
}
export function addTransaction(state, transaction) {
  const next = { ...state, transactions: [...state.transactions, { ...transaction }] };
  validateState(next);
  return next;
}
export function captureNotification(state, notification) {
  str(notification.fingerprint, 'notification.fingerprint');
  if (state.notifications.some(n => n.fingerprint === notification.fingerprint)) {
    return { state, duplicate: true };
  }
  const next = {
    ...state,
    notifications: [...state.notifications, { ...notification, status: 'pending' }]
  };
  validateState(next);
  return { state: next, duplicate: false };
}
export function updateNotificationStatus(state, id, status) {
  assert(STATUSES.has(status), 'Некорректный статус');
  assert(state.notifications.some(n => n.id === id), 'Уведомление не найдено');
  const next = { ...state, notifications: state.notifications.map(n => n.id === id ? { ...n, status } : n) };
  validateState(next);
  return next;
}
export function balances(state) {
  validateState(state);
  const result = new Map(state.accounts.map(a => [a.id, a.initialBalanceMinor]));
  for (const t of state.transactions) {
    if (t.kind === 'income') result.set(t.accountId, result.get(t.accountId) + t.amountMinor);
    else if (t.kind === 'expense') result.set(t.accountId, result.get(t.accountId) - t.amountMinor);
    else {
      result.set(t.fromAccountId, result.get(t.fromAccountId) - t.amountMinor);
      result.set(t.toAccountId, result.get(t.toAccountId) + t.amountMinor);
    }
  }
  for (const amount of result.values()) assert(Number.isSafeInteger(amount), 'Переполнение баланса');
  return result;
}
export function allTransactions(state, accountId = null) {
  validateState(state);
  return state.transactions
    .filter(t => accountId === null || t.accountId === accountId || t.fromAccountId === accountId || t.toAccountId === accountId)
    .slice()
    .sort((a, b) => b.occurredAt - a.occurredAt || a.id.localeCompare(b.id));
}
export function createBackup(state) {
  validateState(state);
  return JSON.stringify({ format: 'moi-finansy-v2-backup', exportedAt: new Date().toISOString(), data: state });
}
export function readBackup(raw) {
  assert(typeof raw === 'string' && raw.length > 0 && raw.length < 50_000_000, 'Некорректный файл резервной копии');
  const archive = JSON.parse(raw);
  assert(archive?.format === 'moi-finansy-v2-backup', 'Неизвестный формат резервной копии');
  validateState(archive.data);
  return structuredClone(archive.data);
}
