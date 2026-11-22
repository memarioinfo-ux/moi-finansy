"use strict";
const $=id=>document.getElementById(id);
let state={accounts:[],transactions:[]};
let editId="";
let renameAccountId="";
let sourceEventId="";
let currentTab="history";
let kind="expense";
const labels={expense:"Расход",income:"Доход",transfer:"Перевод"};
const fmt=(minor,currency)=>window.FinanceMoney.format(minor,currency);
const node=(tag,text,className)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;};
function call(method,...args){
 if(!window.FinanceNative||typeof window.FinanceNative[method]!=="function")throw Error("Откройте тестовую версию на Android");
 const response=JSON.parse(window.FinanceNative[method](...args));
 if(!response.ok)throw Error(response.error||"Неизвестная ошибка");
 return response.data;
}
function toast(message){
 const el=$("toast");el.textContent=message;el.classList.remove("hidden");
 window.setTimeout(()=>el.classList.add("hidden"),3500);
}
function account(id){return state.accounts.find(a=>a.id===id);}
function refresh(data){state=data||call("getSnapshot");render();}
function localDate(ms){const dt=new Date(ms),pad=n=>String(n).padStart(2,"0");return dt.getFullYear()+"-"+pad(dt.getMonth()+1)+"-"+pad(dt.getDate())+"T"+pad(dt.getHours())+":"+pad(dt.getMinutes());}
function moneyByCurrency(accounts){
 const groups={};for(const a of accounts){groups[a.currency]=(groups[a.currency]||0n)+window.FinanceMoney.minor(a.balanceMinor);}return groups;
}
function render(){
 const groups=moneyByCurrency(state.accounts);
 const amounts=Object.entries(groups).map(([currency,minor])=>fmt(minor,currency));
 $("heroBalances").replaceChildren(...(amounts.length?amounts.map(a=>node("div",a)): [node("div","0,00 BYN")]));
 const today=new Date(),month=today.getMonth(),year=today.getFullYear();
 $("monthLabel").textContent=today.toLocaleString("ru-RU",{month:"long",year:"numeric"});
 const monthly=state.transactions.filter(t=>{const d=new Date(t.occurredAt);return d.getMonth()===month&&d.getFullYear()===year;});
 function totals(kind){const out={};for(const t of monthly.filter(x=>x.kind===kind)){const c=account(t.accountId)?.currency||"BYN";out[c]=(out[c]||0n)+window.FinanceMoney.minor(t.amountMinor);}return Object.entries(out).map(([c,v])=>fmt(v,c)).join(" / ")||"0,00 BYN";}
 $("monthlyIncome").textContent=totals("income");
 $("monthlyExpense").textContent=totals("expense");
 renderAccounts();renderTransactions();renderAnalytics();renderSelects();renderNotifications();
}
function renderAccounts(){
 const host=$("accountList");host.replaceChildren();
 if(!state.accounts.length){host.append(node("div","Пока нет счетов. Нажмите «Добавить».","empty"));return;}
 for(const a of state.accounts){
  const row=node("div",undefined,"account-row");
  const info=node("div"),title=node("div",a.name,"account-name"),currency=node("div",a.currency,"subtitle");
  info.append(title,currency);
  const rename=node("button","Изменить","account-rename");
  rename.type="button";
  rename.setAttribute("aria-label","Переименовать счёт "+a.name);
  rename.onclick=()=>openRenameAccount(a.id);
  row.append(info,node("strong",fmt(a.balanceMinor,a.currency),"account-amount"),rename);
  host.append(row);
 }
}
function renderSelects(){
 const current=$("accountFilter").value;
 $("accountFilter").replaceChildren(new Option("Все счета",""),...state.accounts.map(a=>new Option(a.name,a.id)));
 if(state.accounts.some(a=>a.id===current))$("accountFilter").value=current;
}
function filteredTransactions(){
 const accountId=$("accountFilter").value,kindFilter=$("kindFilter").value;
 return state.transactions.filter(t=>(!kindFilter||t.kind===kindFilter)&&(!accountId||t.accountId===accountId||t.fromAccountId===accountId||t.toAccountId===accountId))
 .slice().sort((a,b)=>b.occurredAt-a.occurredAt||String(a.id).localeCompare(String(b.id)));
}
function renderTransactions(){
 const host=$("historyList");host.replaceChildren();const items=filteredTransactions();
 if(!items.length){host.append(node("div","Пока нет операций по выбранным условиям.","empty"));return;}
 let previousDay="";
 for(const t of items){
  const dt=new Date(t.occurredAt),day=dt.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"});
  if(previousDay!==day){host.append(node("div",day,"day-heading"));previousDay=day;}
  const row=node("button",undefined,"entry");row.type="button";row.onclick=()=>openTransaction(t.kind,t);
  const left=node("div"),right=node("div");
  left.append(node("div",t.note||t.category||labels[t.kind],"entry-title"));
  const src=account(t.accountId||t.fromAccountId);
  const dst=account(t.toAccountId);
  left.append(node("div",t.kind==="transfer"?(src?.name||"Счёт")+" → "+(dst?.name||"Счёт"):(src?.name||"Счёт"),"entry-subtitle"));
  const symbol=t.kind==="income"?"+":t.kind==="expense"?"−":"⇄ ";
  right.append(node("div",symbol+fmt(t.amountMinor,src?.currency||"BYN"),"entry-amount "+t.kind));
  right.append(node("div",dt.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),"entry-time"));
  row.append(left,right);host.append(row);
 }
}
function renderAnalytics(){
 const host=$("analyticsList");host.replaceChildren();
 const today=new Date(),totals=new Map();
 for(const t of state.transactions){
  const date=new Date(t.occurredAt);if(t.kind!=="expense"||date.getFullYear()!==today.getFullYear()||date.getMonth()!==today.getMonth())continue;
  const currency=account(t.accountId)?.currency||"BYN",key=currency+"|"+(t.category||"Без категории");
  totals.set(key,(totals.get(key)||0n)+window.FinanceMoney.minor(t.amountMinor));
 }
 const items=[...totals].sort((a,b)=>a[1]===b[1]?0:(a[1]>b[1]?-1:1));
 if(!items.length){host.append(node("div","Добавьте расходы, чтобы увидеть аналитику.","empty"));return;}
 for(const [key,value] of items){
  const [currency,category]=key.split("|"),line=node("div",undefined,"analytics-row");
  line.append(node("span",category),node("strong",fmt(value,currency)));host.append(line);
 }
}

function renderNotifications(){
 const count=Number(state.unreviewedNotifications||0);
 $("notificationCount").textContent=count>0?" · "+count:"";
 const access=$("notificationAccessState");
 try{
  const enabled=Boolean(window.FinanceNative?.getNotificationAccess?.());
  access.textContent=enabled?"Разрешён":"Не разрешён";
  access.classList.toggle("access-ok",enabled);
 }catch(e){access.textContent="Недоступно";access.classList.remove("access-ok");}
 const list=$("notificationList");
 list.replaceChildren();
 const events=state.notifications||[];
 $("notificationInboxHint").textContent=count+" ожидают проверки";
 if(!events.length){
  list.append(node("div","Новых банковских уведомлений нет. После выдачи доступа они появятся здесь, если банк отправит поддерживаемое уведомление об операции.","empty"));
  return;
 }
 for(const event of events){
  const box=node("article",undefined,"notification-card");
  const meta=node("div",undefined,"notification-meta");
  meta.append(
   node("span",event.packageName.includes("alfabank")?"Альфа-Банк":"Беларусбанк"),
   node("time",new Date(event.receivedAt).toLocaleString("ru-RU"))
  );
  const title=node("strong",event.title||"Банковская операция","notification-title");
  const body=node("p",event.body,"notification-body");
  const suggestion=event.suggestion;
  const detected=suggestion
   ? node("div","Предварительно: "+(suggestion.kind==="income"?"доход":"расход")+" · "+
     fmt(suggestion.amountMinor,suggestion.currency)+(suggestion.cardLast4?" · карта ****"+suggestion.cardLast4:"")+
     ". Проверьте перед сохранением.","notification-detected")
   : node("div","Сумма или направление не определены однозначно. Введите данные вручную.","notification-unknown");
  const actions=node("div",undefined,"notification-actions");
  const add=node("button","＋ Внести операцию","notification-add");
  add.type="button";
  add.onclick=()=>openTransaction("expense",null,event.id);
  const ignore=node("button","Не операция","notification-ignore");
  ignore.type="button";
  ignore.onclick=()=>{
   if(!confirm("Пометить это сообщение как не относящееся к учёту? Оно останется в локальном журнале."))return;
   try{refresh(call("ignoreNotification",event.id));toast("Сообщение оставлено в журнале");}
   catch(e){toast(e.message);}
  };
  actions.append(add,ignore);
  box.append(meta,title,body,detected,actions);
  list.append(box);
 }
}

function switchTab(tab){
 currentTab=tab;
 for(const name of ["history","accounts","analytics","notifications"])$(name).classList.toggle("hidden",name!==tab);
 for(const b of document.querySelectorAll("[data-tab]"))b.classList.toggle("active",b.dataset.tab===tab);
}
/** Close overlays first, then return to the complete history.
 * Returns false only if the native Android activity should be closed. */
function handleAppBack(){
 const opened=[...document.querySelectorAll("dialog")].reverse().find(d=>d.open);
 if(opened){
  opened.close();
  return true;
 }
 if(currentTab!=="history"){
  switchTab("history");
  return true;
 }
 return false;
}
window.handleNativeBack=handleAppBack;
$("appBack").onclick=()=>{
 if(handleAppBack())return;
 if(window.FinanceNative?.exitApp)window.FinanceNative.exitApp();
 else toast("Нажмите системную кнопку «Назад», чтобы выйти");
};

function openAccount(){
 $("accountForm").reset();$("accountDialog").showModal();
}
function openRenameAccount(id){
 const chosen=account(id);
 if(!chosen){toast("Счёт не найден");return;}
 renameAccountId=id;
 $("renameAccountName").value=chosen.name;
 $("renameAccountDialog").showModal();
 $("renameAccountName").focus();
}
function selectAccounts(){
 for(const id of ["txAccount","txFrom","txTo"])$(id).replaceChildren(...state.accounts.map(a=>new Option(a.name+" · "+a.currency,a.id)));
 if(state.accounts.length>1)$("txTo").selectedIndex=1;
}
function updateKind(value){
 kind=value;
 $("singleAccountGroup").classList.toggle("hidden",kind==="transfer");
 $("transferGroups").classList.toggle("hidden",kind!=="transfer");
 $("txAccount").required=kind!=="transfer";
 $("txFrom").required=kind==="transfer";
 $("txTo").required=kind==="transfer";
 $("categoryGroup").classList.toggle("hidden",kind==="transfer");
 for(const b of document.querySelectorAll("[data-kind]"))b.classList.toggle("selected",b.dataset.kind===kind);
 $("transactionDialogTitle").textContent=editId?"Изменить операцию":"Новая операция";
}
function suggestForBankEvent(event){
 const notice=$("txSuggestionNotice");
 notice.classList.remove("hidden");
 const suggestion=event.suggestion;
 // Never auto-select an account from a bank notification, even when only one exists.
 $("txAccount").add(new Option("Выберите счёт вручную","",true,true),0);
 $("txAccount").value="";
 if(!suggestion){
  notice.textContent="Не удалось однозначно распознать сумму и направление. Проверьте сообщение и заполните все поля.";
  return;
 }
 updateKind(suggestion.kind);
 const amount=Number(suggestion.amountMinor);
 if(Number.isSafeInteger(amount)&&amount>0){
  $("txAmount").value=window.FinanceMoney.input(amount);
 }
 notice.textContent="Предварительно: "+(suggestion.kind==="income"?"доход":"расход")+
  " "+fmt(amount,suggestion.currency)+
  (suggestion.cardLast4?" · карта ****"+suggestion.cardLast4:"")+
  ". Обязательно выберите счёт и проверьте его валюту. Результат может быть неточным.";
}
function openTransaction(value="expense",tx=null,eventId=""){
 if(!state.accounts.length){toast("Сначала создайте счёт");switchTab("accounts");return;}
 editId=tx?.id||"";
 sourceEventId=eventId;
 $("transactionForm").reset();selectAccounts();updateKind(value);
 const event=(state.notifications||[]).find(n=>n.id===eventId);
 $("txDate").value=localDate(tx?.occurredAt||event?.receivedAt||Date.now());
 $("txSuggestionNotice").classList.add("hidden");
 $("txSuggestionNotice").textContent="";
 if(event && !tx){
  $("txNote").value=event.title.slice(0,100);
  suggestForBankEvent(event);
 }
 $("deleteTransaction").classList.toggle("hidden",!tx);
 if(tx){
  $("txAmount").value=window.FinanceMoney.input(tx.amountMinor);
  $("txCategory").value=tx.category||"";
  $("txNote").value=tx.note||"";
  if(tx.accountId)$("txAccount").value=tx.accountId;
  if(tx.fromAccountId)$("txFrom").value=tx.fromAccountId;
  if(tx.toAccountId)$("txTo").value=tx.toAccountId;
 }
 $("transactionDialog").showModal();
}
$("accountForm").addEventListener("submit",e=>{
 e.preventDefault();
 try{
  refresh(call("createAccount",$("accountName").value,$("accountCurrency").value,$("accountInitialBalance").value));
  $("accountDialog").close();toast("Счёт создан");
 }catch(error){toast(error.message);}
});
$("renameAccountForm").addEventListener("submit",e=>{
 e.preventDefault();
 if(!renameAccountId)return;
 try{
  const result=call("renameAccount",renameAccountId,$("renameAccountName").value);
  renameAccountId="";
  $("renameAccountDialog").close();
  refresh(result);
  toast("Название обновлено");
 }catch(error){toast(error.message);}
});
$("transactionForm").addEventListener("submit",e=>{
 e.preventDefault();
 try{
  const data={id:editId,kind,amount:$("txAmount").value,occurredAt:new Date($("txDate").value).getTime(),note:$("txNote").value,category:$("txCategory").value,sourceNotificationId:sourceEventId};
  if(kind==="transfer"){data.fromAccountId=$("txFrom").value;data.toAccountId=$("txTo").value;}
  else data.accountId=$("txAccount").value;
  refresh(call("saveTransaction",JSON.stringify(data)));
  $("transactionDialog").close();sourceEventId="";toast("Операция сохранена");
 }catch(error){toast(error.message);}
});
$("deleteTransaction").onclick=()=>{
 if(!editId||!confirm("Удалить операцию из истории и расчётов?"))return;
 try{refresh(call("deleteTransaction",editId));$("transactionDialog").close();toast("Операция удалена");}
 catch(error){toast(error.message);}
};
$("newAccount").onclick=openAccount;
$("newTransaction").onclick=()=>openTransaction();
for(const tab of document.querySelectorAll("[data-tab]"))tab.onclick=()=>{
 if(tab.dataset.tab==="notifications"){
  try{refresh();}catch(e){toast(e.message);}
 }
 switchTab(tab.dataset.tab);
};
for(const b of document.querySelectorAll("[data-kind]"))b.onclick=()=>updateKind(b.dataset.kind);
for(const b of document.querySelectorAll("[data-close]"))b.onclick=()=>$(b.dataset.close).close();
$("accountFilter").onchange=renderTransactions;$("kindFilter").onchange=renderTransactions;

// User-initiated backup via Android Storage Access Framework.
// No file data is passed through the JavaScript bridge.
$("exportBackup").onclick=()=>{
 try{
  if(!window.FinanceNative?.exportBackup)throw Error("Экспорт доступен только в Android");
  window.FinanceNative.exportBackup();
 }catch(e){toast(e.message);}
};
$("importBackup").onclick=()=>{
 try{
  // A preflight guard helps avoid opening the picker unnecessarily.
  // The authoritative empty-only check remains in BackupCodec inside a DB transaction.
  if(state.accounts.length || state.transactions.length){
    toast("Импорт разрешён только в пустую базу: текущие данные останутся без изменений");
    return;
  }
  if(!window.FinanceNative?.importBackup)throw Error("Восстановление доступно только в Android");
  window.FinanceNative.importBackup();
 }catch(e){toast(e.message);}
};
window.onNativeBackupEvent=(type,message)=>{
 if(type==="imported"){
  try{refresh();switchTab("accounts");}catch(e){toast("Данные восстановлены, но не удалось обновить экран: "+e.message);return;}
 }
 toast(message||({exported:"Резервная копия сохранена",imported:"Данные восстановлены",error:"Ошибка резервной копии"}[type]||"Операция завершена"));
};

$("refreshNotifications").onclick=()=>{
 try{refresh();toast("Журнал обновлён");}catch(e){toast(e.message);}
};
$("enableBankNotifications").onclick=()=>{
 try{
  if(!window.FinanceNative?.openNotificationSettings)throw Error("Нужен Android");
  window.FinanceNative.openNotificationSettings();
 }catch(e){toast(e.message);}
};
window.onNativeResume=()=>{
 try{refresh();}catch(e){toast(e.message);}
};

try{refresh();}catch(e){toast("Ошибка загрузки: "+e.message);}

