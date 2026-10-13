/* Manual InSync enrichment parser. No network calls or account credentials. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.InSyncReconcile=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const clean=v=>String(v==null?'':v).replace(/\u00a0/g,' ').trim();
  const norm=v=>clean(v).normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  const isGeneric=v=>!v || /^(?:оплата\s*(?:товаров\s*\/?\s*услуг)?|покупка|платеж|платёж|операция|списание|успешно|покупка по карте|оплата картой|покупка в магазине|transaction|payment|purchase|insnc|insync|альфа.?банк|alfa.?bank|дебетовая карта|подтверждено)$/i.test(clean(v));
  function dateISO(v){
    const s=clean(v);let m=s.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m=s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
    return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
  }
  function money(v){
    const value=clean(v).replace(/\s/g,'').replace(/[−–]/g,'-');
    const s=value.replace(/(?:BYN|BYR|бел\.?руб\.?|руб\.?|р\.?|Br)/ig,'').replace(/[^\d,.+\-]/g,'');
    if(!s)return null;
    let n=s;
    if(n.includes(',')&&n.includes('.'))n=n.lastIndexOf(',')>n.lastIndexOf('.')?n.replace(/\./g,'').replace(',','.'):n.replace(/,/g,'');
    else if(n.includes(','))n=n.replace(',','.');
    if(!/^[+\-]?\d+(?:\.\d{1,2})?$/.test(n))return null;
    const result=Number(n);
    return Number.isFinite(result)&&result>0?Math.round(result*100)/100:(Number.isFinite(result)&&result<0?Math.abs(Math.round(result*100)/100):null);
  }
  function extractDate(v){return dateISO(v);}
  function extractTime(v){const m=clean(v).match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/);return m?m[0].slice(0,5).padStart(5,'0'):null;}
  function extractCard(v){
    const text=clean(v);let m=text.match(/(?:карта|карты|card|\*{2,}|••••)[\s.:№#*•\d-]{0,25}?(\d{4})(?!\d)/i);
    if(!m)m=text.match(/\b\d[.*\s-](\d{4})\b/);
    return m?m[1]:null;
  }
  function extractAmount(text){
    const s=clean(text);
    const labeled=s.match(/(?:сумма\s*(?:операции|покупки|списания)?|плат[её]ж\s*на|списано|итого|стоимость|amount|purchase amount|payment amount)[^\d+−\-]{0,22}([+\-−–]?\s*\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:BYN|BYR|бел\.?\s*руб|р\.?|Br)?/i);
    if(labeled)return money(labeled[1]);
    const curr=/([+\-−–]?\s*\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:BYN|BYR|бел\.?\s*руб|Br)\b/gi;
    for(const m of s.matchAll(curr)){
      const before=s.slice(Math.max(0,m.index-22),m.index);
      if(/(?:остаток|баланс|доступно|balance)\s*[:\s]*$/i.test(before))continue;
      const n=money(m[1]);if(n!==null)return n;
    }
    return null;
  }
  function merchantFromText(text){
    const s=clean(text);
    const labels=/(?:торговая\s*точка|точка\s*продажи|место\s*(?:покупки|операции|оплаты)|получатель|магазин|merchant|seller|предприятие|контрагент|организация|описание\s*(?:операции)?|назначение|наименование\s*(?:торговой\s*точки)?)[ \t]*[:\-=]\s*([^\n\r;|]{3,110})/ig;
    let m;while((m=labels.exec(s))){let v=clean(m[1]).replace(/\s+(?:сумма|остаток|дата|время|карта)\s*:.+$/i,'').trim();if(!isGeneric(v)&&v.length>2)return v;}
    const lines=s.split(/\r?\n/).map(clean).filter(Boolean);
    for(const line of lines){
      if(line.length>85||line.length<3||isGeneric(line))continue;
      if(/(?:остаток|карта|сумма|дата|время|успешно|авторизац|платеж|оплата|история|реквизиты|номер|статус|тип операции|валюта)/i.test(line))continue;
      if(/\d{1,2}[:.]\d\d|\d{1,2}\.\d{1,2}\.20\d\d|(?:BYN|BYR|Br)\b/i.test(line))continue;
      if(/^[\wА-Яа-яЁё][\wА-Яа-яЁё .,()"'\-№&]{2,}$/u.test(line))return line;
    }
    return '';
  }
  // Single-detail or CSV/TXT rows. No direct access to InSync private databases.
  function splitDelimited(line,delim){
    const out=[];let current='',quoted=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;continue;}
      if(c===delim&&!quoted){out.push(clean(current));current='';}else current+=c;
    }out.push(clean(current));return out;
  }
  function csv(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
    if(lines.length<2)return null;
    const delim=[';','\t',','].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0];
    if(lines[0].split(delim).length<3)return null;
    const fields=splitDelimited(lines[0],delim).map(norm);
    if(!fields.some(h=>/дата|date/.test(h))||!fields.some(h=>/сумма|amount|расход|debit/.test(h)))return null;
    const lookup=(row,aliases)=>{const i=fields.findIndex(h=>aliases.some(a=>h.includes(a)));return i>=0?row[i]||'':'';};
    return lines.slice(1,201).map(line=>{
      const row=splitDelimited(line,delim);
      const description=lookup(row,['торгов','магазин','merchant','описание','details','назначение','операция','контрагент','description','получател']);
      const type=norm(lookup(row,['тип','type']));
      const amountRaw=lookup(row,['сумма','amount','списание','расход','debit']);
      const dateText=lookup(row,['дата','date']);
      const timeText=lookup(row,['время','time']);
      return {date:extractDate(dateText),time:extractTime(timeText||dateText),amount:money(amountRaw),merchant:!isGeneric(description)?clean(description):'',last4:extractCard(lookup(row,['карта','card'])||''),sourceText:line,type:/доход|зачисл|income|credit|возврат/.test(type)?'income':'expense'};
    }).filter(x=>x.merchant && x.type==='expense');
  }
  function parse(text){
    const s=clean(text);if(!s)return [];
    const table=csv(s);if(table)return table;
    const merchant=merchantFromText(s);
    return merchant?[{date:extractDate(s),time:extractTime(s),amount:extractAmount(s),merchant,last4:extractCard(s),sourceText:s,type:'expense'}]:[];
  }
  function isAlfaAccount(account){return !!account && (account.bankBrand==='alpha'||/альфа|alfa|alpha/i.test([account.title,account.bank].join(' ')));}
  function eligible(tx,account){return tx&&tx.type==='expense'&&account&&isAlfaAccount(account)&&(tx.source==='Alfa-Bank push'||/alfa|альфа/i.test(String(tx.source||''))||/alfa|альфа/i.test(String(tx.sourceKind||'')));}
  function compare(record,tx,account){
    if(!eligible(tx,account)||tx.insyncReconciledAt)return null;
    if(record.amount!==null&&record.amount!==undefined&&Math.abs(Number(tx.amount)-record.amount)>0.011)return null;
    if(record.last4 && account.last4 &&record.last4!==String(account.last4).slice(-4))return null;
    const ms=tx.dateTime?new Date(tx.dateTime).getTime():new Date(tx.date+'T12:00:00').getTime();
    if(!Number.isFinite(ms))return null;
    if(record.date){const diffDays=Math.abs(new Date(record.date+'T12:00:00').getTime()-new Date(String(tx.date||'')+'T12:00:00').getTime())/86400000;if(diffDays>1.01)return null;}
    if(record.date&&record.time&&record.amount!==null){
      const t=new Date(record.date+'T'+record.time+':00').getTime();
      if(Number.isFinite(t)&&Math.abs(ms-t)>36*3600*1000)return null;
    }
    let score=0;
    if(record.amount!==null)score+=40;
    if(record.date)score+=tx.date===record.date?40:12;
    if(record.last4&&account.last4)score+=20;
    if(record.date&&record.time){const target=Date.parse(record.date+'T'+record.time+':00');if(Number.isFinite(target))score+=Math.max(0,30-Math.abs(ms-target)/60000/5);}
    return {id:tx.id,score,tx};
  }
  function candidates(record,transactions,accounts){const map=new Map(accounts.map(a=>[a.id,a]));return transactions.map(tx=>compare(record,tx,map.get(tx.account))).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,35);}
  return {parse,candidates,extractAmount,merchantFromText,extractCard,extractDate,extractTime,money,eligible};
});
