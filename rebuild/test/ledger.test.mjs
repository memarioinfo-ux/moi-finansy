import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addAccount, addTransaction, balances, allTransactions, captureNotification, updateNotificationStatus, parseMoney, createBackup, readBackup } from '../core/ledger.mjs';

const at = 1795340000000;
function fixture() {
  let state = emptyState();
  state = addAccount(state, { id:'card', name:'Карта', currency:'BYN', initialBalanceMinor:100_000 });
  state = addAccount(state, { id:'cash', name:'Наличные', currency:'BYN', initialBalanceMinor:10_000 });
  return state;
}
test('суммы переводятся в копейки без float', () => {
  assert.equal(parseMoney('4,31'), 431);
  assert.equal(parseMoney('100'), 10000);
  assert.equal(parseMoney('1 234,5'), 123450);
  assert.throws(() => parseMoney('1,234'));
  assert.throws(() => parseMoney('-1'));
});
test('доход, расход и перевод корректно меняют остатки', () => {
  let state = fixture();
  state = addTransaction(state, { id:'a', kind:'expense', accountId:'card', amountMinor:431, occurredAt:at });
  state = addTransaction(state, { id:'b', kind:'income', accountId:'card', amountMinor:1000, occurredAt:at+1 });
  state = addTransaction(state, { id:'c', kind:'transfer', fromAccountId:'card', toAccountId:'cash', amountMinor:5000, occurredAt:at+2 });
  assert.equal(balances(state).get('card'), 95_569);
  assert.equal(balances(state).get('cash'), 15_000);
  assert.deepEqual(allTransactions(state).map(t=>t.id), ['c','b','a']);
  assert.deepEqual(allTransactions(state,'cash').map(t=>t.id), ['c']);
});
test('повторный push не создаёт запись и история не обрезается на 20', () => {
  let state = fixture();
  for(let i=0;i<30;i++){
    const incoming = {id:'n'+i, fingerprint:'bank-key-'+i, title:'Mbank', text:'Операция #'+i, receivedAt:at+i};
    const result = captureNotification(state,incoming);
    assert.equal(result.duplicate,false);
    state=result.state;
  }
  const originalCount=state.notifications.length;
  const repeated=captureNotification(state,{id:'dup',fingerprint:'bank-key-1',title:'Mbank',text:'повтор'});
  assert.equal(repeated.duplicate,true);
  assert.equal(repeated.state.notifications.length,originalCount);
  assert.equal(state.notifications.length,30);
  state=updateNotificationStatus(state,'n1','needs_review');
  assert.equal(state.notifications.find(n=>n.id==='n1').status,'needs_review');
});
test('резервная копия проходит строгую проверку и не удаляет ничего', () => {
  let state = fixture();
  state = addTransaction(state, { id:'a', kind:'expense', accountId:'card', amountMinor:400, occurredAt:at });
  const restored = readBackup(createBackup(state));
  assert.deepEqual(restored,state);
  assert.throws(() => readBackup('{"format":"moi-finansy-v2-backup","data":{"schemaVersion":1,"accounts":[],"transactions":[{"id":"a","kind":"expense","accountId":"missing","amountMinor":400,"occurredAt":2}],"notifications":[]}}'));
});
test('межвалютный перевод не допускается без операции обмена', () => {
  let state=fixture();
  state=addAccount(state,{id:'foreign',name:'Валюта',currency:'USD',initialBalanceMinor:0});
  assert.throws(()=>addTransaction(state,{id:'bad',kind:'transfer',fromAccountId:'card',toAccountId:'foreign',amountMinor:100,occurredAt:at}));
});
