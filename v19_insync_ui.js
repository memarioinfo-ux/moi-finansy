/* v19: confirmed, offline-only reconciliation of InSync statement details with Alfa push expenses. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const parser=window.InSyncReconcile;
if(!parser)return;
const sheet=$('insyncHistorySheet');
if(!sheet)return;
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pending=[],startedFromImport=false;
function alfaUnresolved(){const act=accounts.filter(a=>parser.isAlfaAccount(a));return transactions.filter(t=>parser.eligible(t,act.find(a=>a.id===t.account)));}
function info(message,isError=false){const target=$('insyncMessage');target.textContent=message;target.classList.toggle('insync-error',isError);target.style.display=message?'block':'none';}
function open(text='',fromImport=false){
 startedFromImport=fromImport;
 hideAllSheets();showOverlay();sheet.classList.add('show');
 if(text) $('insyncPaste').value=String(text).slice(0,450000);
 $('insyncSourceFile').value='';
 $('insyncPreview').innerHTML='';
 $('insyncConfirm').disabled=true;pending=[];
 info('Здесь не создаются новые расходы и не меняются остатки счетов. Только уточняются уже полученные операции Альфа-Банка.');
 if(text)runPreview();
}
function close(){
 hideAllSheets();
 if(startedFromImport)openImportSheet();
 startedFromImport=false;
}
function formatTx(tx){
 const d=tx.date||'?';let clock='';
 if(tx.dateTime){const dt=new Date(tx.dateTime);if(Number.isFinite(dt.getTime()))clock=' '+dt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}
 const account=accounts.find(a=>a.id===tx.account);
 return `${d}${clock} · ${Number(tx.amount).toFixed(2)} Br · ${account?.title||'Альфа-Банк'}`;
}
function labelCat(merchant,mcc){
 let c=typeof inferCategoryWithMcc==='function'?inferCategoryWithMcc(merchant,'expense',mcc):inferCategory(merchant,'expense');
 return getCategoryById(c?.id,'expense')||findCategoryByName(c?.category,'expense')||findCategoryByName('Нужно разобрать','expense')||categoryListForType('expense')[0];
}
function formOverrides(){
 const manual=$('insyncMerchant').value.trim();
 const amountText=$('insyncAmount').value.trim();
 const dateText=$('insyncDate').value;
 const time=$('insyncTime').value;
 let records=parser.parse($('insyncPaste').value);
 if(!records.length && manual)records=[{merchant:manual,amount:null,date:null,time:null,last4:null,type:'expense'}];
 if(records.length===1){
  if(manual)records[0].merchant=manual;
  if(amountText){const amount=parser.money(amountText);if(amount===null)throw Error('Проверь сумму. Например: 4,31.');records[0].amount=amount;}
  if(dateText)records[0].date=dateText;
  if(time)records[0].time=time;
 }
 return records.filter(r=>r.type==='expense'&&r.merchant);
}
function runPreview(){
 pending=[];
 const root=$('insyncPreview');root.innerHTML='';$('insyncConfirm').disabled=true;
 let records=[];
 try{records=formOverrides();}catch(ex){info(ex.message||String(ex),true);return;}
 if(!records.length){info('Не нашлось названия магазина. Вставь сведения из InSync или впиши название вручную.',true);return;}
 if(records.length>100){info('За один раз поддерживается не более 100 строк. Раздели выписку на части.',true);return;}
 const cats=categoryListForType('expense');
 records.forEach((rec,i)=>{
  const candidates=parser.candidates(rec,transactions,accounts);
  const inferred=labelCat(rec.merchant,rec.mcc);
  const txSelection=(rec.amount!==null&&rec.date&&candidates.length===1)?candidates[0].id:'';
  pending.push({rec,chosenTx:txSelection,chosenCat:inferred.id,candidates});
  const row=document.createElement('div');row.className='insync-row';row.dataset.row=String(i);
  const headline=document.createElement('div');headline.className='insync-merchant';headline.textContent=rec.merchant;row.appendChild(headline);
  const meta=document.createElement('div');meta.className='insync-meta';meta.textContent=[rec.date,rec.time,rec.amount===null?'сумма не указана':rec.amount.toFixed(2)+' BYN',rec.last4?'••'+rec.last4:null].filter(Boolean).join(' · ');row.appendChild(meta);
  const matchLabel=document.createElement('label');matchLabel.className='label';matchLabel.textContent='Существующая операция Альфа-Банка';row.appendChild(matchLabel);
  const matchSel=document.createElement('select');matchSel.className='select insync-tx-select';matchSel.dataset.row=String(i);
  matchSel.appendChild(new Option('— Выбери операцию —',''));
  candidates.forEach(c=>matchSel.appendChild(new Option(formatTx(c.tx),c.id)));
  matchSel.value=txSelection;
  row.appendChild(matchSel);
  const catLabel=document.createElement('label');catLabel.className='label';catLabel.textContent='Категория';row.appendChild(catLabel);
  const catSel=document.createElement('select');catSel.className='select insync-cat-select';catSel.dataset.row=String(i);
  cats.forEach(c=>catSel.appendChild(new Option(c.name,c.id)));
  catSel.value=inferred.id;
  row.appendChild(catSel);
  const hint=document.createElement('div');hint.className='tiny';
  hint.textContent=!candidates.length?'Нет подходящей операции: проверь сумму, дату и выбранную карту.':candidates.length>1?'Найдено несколько похожих операций — выбери правильную вручную.':'Сверь сумму и дату перед подтверждением.';
  row.appendChild(hint);
  root.appendChild(row);
 });
 root.querySelectorAll('.insync-tx-select').forEach(s=>s.addEventListener('change',()=>{pending[Number(s.dataset.row)].chosenTx=s.value;updateConfirm();}));
 root.querySelectorAll('.insync-cat-select').forEach(s=>s.addEventListener('change',()=>{pending[Number(s.dataset.row)].chosenCat=s.value;updateConfirm();}));
 info(`Найдено записей: ${pending.length}. Выбери совпадение для каждой подходящей операции и подтверди. Никаких изменений до подтверждения.`);
 updateConfirm();
}
function updateConfirm(){const n=pending.filter(x=>x.chosenTx).length;$('insyncConfirm').disabled=n===0;$('insyncConfirm').textContent=n?`Подтвердить совпадения (${n})`:'Подтвердить совпадения';}
function apply(){
 const selections=pending.filter(x=>x.chosenTx);
 if(!selections.length)return;
 const ids=selections.map(x=>x.chosenTx);
 if(new Set(ids).size!==ids.length){info('Одна операция выбрана для нескольких записей. Исправь совпадения.',true);return;}
 const changes=[];
 for(const sel of selections){
  const tx=transactions.find(t=>t.id===sel.chosenTx);
  const account=accounts.find(a=>a.id===tx?.account);
  if(!tx||!parser.eligible(tx,account)||tx.insyncReconciledAt){info('Одна из операций уже была сопоставлена или недоступна. Обнови список.',true);return;}
  if(sel.rec.amount!==null && Math.abs(Number(tx.amount)-sel.rec.amount)>0.011){info('Сумма банковской операции не совпадает с выпиской.',true);return;}
  if(sel.rec.last4&&account.last4&&sel.rec.last4!==String(account.last4).slice(-4)){info('Номера карт не совпадают.',true);return;}
  const cat=getCategoryById(sel.chosenCat,'expense');if(!cat){info('Некорректная категория.',true);return;}
  changes.push({tx,merchant:sel.rec.merchant,cat});
 }
 for(const change of changes){
  const {tx,merchant,cat}=change;
  tx.merchant=merchant;
  tx.categoryId=cat.id;tx.category=cat.name;tx.categoryIcon=cat.icon;tx.categoryClass=cat.cls;tx.categoryBg=cat.bg||'#98A4B3';
  tx.unresolved=cat.id==='expense-review';
  tx.insyncReconciledAt=new Date().toISOString();
  tx.insyncMerchantSource='manual-InSync-detail';
  if(!tx.note||/^(?:оплата товаров\/?услуг|оплата|покупка|нужно разобрать)$/i.test(tx.note.trim()))tx.note=merchant;
  if(typeof rememberMerchantCategory==='function' && cat.id!=='expense-review')rememberMerchantCategory(tx,cat);
 }
 // Only merchant/category metadata changes. No transactions are added and no account balances are changed.
 savePersistentState();renderCards();renderList();
 if(typeof renderAnalytics==='function'){try{renderAnalytics();}catch(_){}}
 pending=[];$('insyncPreview').innerHTML='';$('insyncConfirm').disabled=true;
 info(`Готово: уточнено ${changes.length} операций. Новые расходы не создавались, остатки не менялись.`);
}
async function importFile(e){
 const file=e.target.files?.[0];if(!file)return;
 if(file.size>2*1024*1024){info('Файл больше 2 МБ. Раздели выписку на части.',true);return;}
 const text=await file.text();$('insyncPaste').value=text.slice(0,500000);runPreview();
}
$('insyncParse').addEventListener('click',runPreview);
$('insyncConfirm').addEventListener('click',apply);
$('insyncClose').addEventListener('click',close);
$('insyncSourceFile').addEventListener('change',importFile);
$('insyncPaste').addEventListener('input',()=>{$('insyncPreview').innerHTML='';$('insyncConfirm').disabled=true;pending=[];});
$('openInSyncFromImport').addEventListener('click',()=>open('',true));
const oldShared=window.receiveSharedMbankText;
window.receiveSharedMbankText=function(text){
 const s=String(text||'');
 if(/\b(?:OPLATA|KARTA\s*#|OSTATOK|Mbank|Belarusbank)\b/i.test(s) && !/\b(?:InSync|INSNC|альфа.?банк)\b/i.test(s))return oldShared?oldShared(text):false;
 open(s,false);return true;
};
const previousBack=window.handleAndroidBack;
window.handleAndroidBack=function(){
 if(sheet.classList.contains('show')){close();return true;}
 return typeof previousBack==='function'?previousBack():false;
};
window.openInSyncReconcile=open;
})();
