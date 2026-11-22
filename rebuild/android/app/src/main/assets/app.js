"use strict";
const $=id=>document.getElementById(id);
let state={accounts:[],transactions:[]};
let editId="";
let kind="expense";
const labels={expense:"Расход",income:"Доход",transfer:"Перевод"};
const fmt=(minor,currency)=>new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(minor)/100)+" "+currency;
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
 const groups={};for(const a of accounts){groups[a.currency]=(groups[a.currency]||0)+Number(a.balanceMinor);}return groups;
}
function render(){
 const groups=moneyByCurrency(state.accounts);
 const amounts=Object.entries(groups).map(([currency,minor])=>fmt(minor,currency));
 $("heroBalances").replaceChildren(...(amounts.length?amounts.map(a=>node("div",a)): [node("div","0,00 BYN")]));
 const today=new Date(),month=today.getMonth(),year=today.getFullYear();
 $("monthLabel").textContent=today.toLocaleString("ru-RU",{month:"long",year:"numeric"});
 const monthly=state.transactions.filter(t=>{const d=new Date(t.occurredAt);return d.getMonth()===month&&d.getFullYear()===year;});
 function totals(kind){const out={};for(const t of monthly.filter(x=>x.kind===kind)){const c=account(t.accountId)?.currency||"BYN";out[c]=(out[c]||0)+Number(t.amountMinor);}return Object.entries(out).map(([c,v])=>fmt(v,c)).join(" / ")||"0,00 BYN";}
 $("monthlyIncome").textContent=totals("income");
 $("monthlyExpense").textContent=totals("expense");
 renderAccounts();renderTransactions();renderAnalytics();renderSelects();
}
function renderAccounts(){
 const host=$("accountList");host.replaceChildren();
 if(!state.accounts.length){host.append(node("div","Пока нет счетов. Нажмите «Добавить».","empty"));return;}
 for(const a of state.accounts){
  const row=node("div",undefined,"account-row");
  const info=node("div"),title=node("div",a.name,"account-name"),currency=node("div",a.currency,"subtitle");
  info.append(title,currency);row.append(info,node("strong",fmt(a.balanceMinor,a.currency),"account-amount"));host.append(row);
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
  totals.set(key,(totals.get(key)||0)+Number(t.amountMinor));
 }
 const items=[...totals].sort((a,b)=>b[1]-a[1]);
 if(!items.length){host.append(node("div","Добавьте расходы, чтобы увидеть аналитику.","empty"));return;}
 for(const [key,value] of items){
  const [currency,category]=key.split("|"),line=node("div",undefined,"analytics-row");
  line.append(node("span",category),node("strong",fmt(value,currency)));host.append(line);
 }
}
function switchTab(tab){
 for(const name of ["history","accounts","analytics"])$(name).classList.toggle("hidden",name!==tab);
 for(const b of document.querySelectorAll("[data-tab]"))b.classList.toggle("active",b.dataset.tab===tab);
}
function openAccount(){
 $("accountForm").reset();$("accountDialog").showModal();
}
function selectAccounts(){
 for(const id of ["txAccount","txFrom","txTo"])$(id).replaceChildren(...state.accounts.map(a=>new Option(a.name+" · "+a.currency,a.id)));
 if(state.accounts.length>1)$("txTo").selectedIndex=1;
}
function updateKind(value){
 kind=value;
 $("singleAccountGroup").classList.toggle("hidden",kind==="transfer");
 $("transferGroups").classList.toggle("hidden",kind!=="transfer");
 $("categoryGroup").classList.toggle("hidden",kind==="transfer");
 for(const b of document.querySelectorAll("[data-kind]"))b.classList.toggle("selected",b.dataset.kind===kind);
 $("transactionDialogTitle").textContent=editId?"Изменить операцию":"Новая операция";
}
function openTransaction(value="expense",tx=null){
 if(!state.accounts.length){toast("Сначала создайте счёт");switchTab("accounts");return;}
 editId=tx?.id||"";
 $("transactionForm").reset();selectAccounts();updateKind(value);
 $("txDate").value=localDate(tx?.occurredAt||Date.now());
 $("deleteTransaction").classList.toggle("hidden",!tx);
 if(tx){
  $("txAmount").value=(Number(tx.amountMinor)/100).toFixed(2).replace(".",",");
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
$("transactionForm").addEventListener("submit",e=>{
 e.preventDefault();
 try{
  const data={id:editId,kind,amount:$("txAmount").value,occurredAt:new Date($("txDate").value).getTime(),note:$("txNote").value,category:$("txCategory").value};
  if(kind==="transfer"){data.fromAccountId=$("txFrom").value;data.toAccountId=$("txTo").value;}
  else data.accountId=$("txAccount").value;
  refresh(call("saveTransaction",JSON.stringify(data)));
  $("transactionDialog").close();toast("Операция сохранена");
 }catch(error){toast(error.message);}
});
$("deleteTransaction").onclick=()=>{
 if(!editId||!confirm("Удалить операцию из истории и расчётов?"))return;
 try{refresh(call("deleteTransaction",editId));$("transactionDialog").close();toast("Операция удалена");}
 catch(error){toast(error.message);}
};
$("newAccount").onclick=openAccount;
$("newTransaction").onclick=()=>openTransaction();
for(const tab of document.querySelectorAll("[data-tab]"))tab.onclick=()=>switchTab(tab.dataset.tab);
for(const b of document.querySelectorAll("[data-kind]"))b.onclick=()=>updateKind(b.dataset.kind);
for(const b of document.querySelectorAll("[data-close]"))b.onclick=()=>$(b.dataset.close).close();
$("accountFilter").onchange=renderTransactions;$("kindFilter").onchange=renderTransactions;
try{refresh();}catch(e){toast("Ошибка загрузки: "+e.message);}
