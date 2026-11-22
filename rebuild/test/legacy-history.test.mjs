import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]);
const start = html.indexOf('function inPeriod(dateStr, period){');
const end = html.indexOf('function selectAccount(id){', start);
if(start<0 || end<=start) throw new Error('Legacy history functions not found');
const source = html.slice(start,end);

test('all bundled legacy scripts compile, without accessing private user data', () => {
  assert.ok(scripts.length>=1);
  for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script));
});

class MockNode {
  constructor(tag='div'){
    this.tagName=tag;
    this.children=[];
    this.dataset={};
    this.className='';
    this.parentNode=null;
    this.writes=0;
    this.handlers=new Map();
    this._html='';
    this.textContent='';
  }
  get firstElementChild(){return this.children[0] || null;}
  get childElementCount(){return this.children.length;}
  get classList(){
    return {contains:(c)=>this.className.split(/\s+/).includes(c)};
  }
  set innerHTML(html){
    this.writes++;
    this._html=String(html);
    for(const el of this.children) el.parentNode=null;
    this.children=[];
    // The legacy renderer uses a detached wrapper to parse a day heading.
    if(/^\s*<div class="day-head"/.test(this._html)){
      const head=new MockNode('div');
      head.className='day-head';
      head.parentNode=this;
      this.children.push(head);
    }
  }
  get innerHTML(){return this._html;}
  insertBefore(node,before=null){
    if(node.parentNode){
      const old=node.parentNode.children;
      const i=old.indexOf(node);
      if(i>=0)old.splice(i,1);
    }
    const index=before?this.children.indexOf(before):-1;
    this.children.splice(index<0?this.children.length:index,0,node);
    node.parentNode=this;
    return node;
  }
  appendChild(node){return this.insertBefore(node,null);}
  replaceChild(next,prev){
    const index=this.children.indexOf(prev);
    if(index<0)throw new Error('Missing child');
    prev.parentNode=null;
    if(next.parentNode)next.remove();
    this.children[index]=next;
    next.parentNode=this;
  }
  remove(){
    if(!this.parentNode)return;
    const siblings=this.parentNode.children;
    const i=siblings.indexOf(this);
    if(i>=0)siblings.splice(i,1);
    this.parentNode=null;
  }
  replaceChildren(){
    for(const child of [...this.children])child.remove();
  }
  addEventListener(type,handler){
    if(!this.handlers.has(type))this.handlers.set(type,[]);
    this.handlers.get(type).push(handler);
  }
  contains(child){
    let node=child;
    while(node){if(node===this)return true;node=node.parentNode;}
    return false;
  }
}

function createView(){
  let now='2026-11-01T12:00:00';
  class Clock extends Date{
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return new Date(now).getTime();}
  }
  const root=new MockNode();
  const info=new MockNode();
  const card={id:'card',name:'Карта',title:'Карта',icon:'💳'};
  const transactions=[
    {id:'sept',date:'2026-09-30',dateTime:'2026-09-30T20:00:00',type:'expense',amount:4.31,account:'card',category:'Продукты',note:'Сентябрь'},
    {id:'oct',date:'2026-10-31',dateTime:'2026-10-31T20:00:00',type:'expense',amount:8.50,account:'card',category:'Продукты',note:'Октябрь'},
    {id:'nov',date:'2026-11-01',dateTime:'2026-11-01T20:00:00',type:'income',amount:20.00,account:'card',category:'Зарплата',note:'Ноябрь'}
  ];
  const ctx={
    Date:Clock,
    transactions,
    accounts:[{id:'all',name:'Все счета',title:'Все счета'},card],
    currentPeriod:'all',
    currentAccount:'all',
    currentType:'all',
    document:{
      getElementById:(id)=>id==='txList'?root:id==='filterInfo'?info:null,
      createElement:(tag)=>new MockNode(tag)
    },
    transactionTimestamp:(tx)=>Date.parse(tx.dateTime),
    shortDow:()=> 'ВС',
    dayMonthYear:(d)=>d.toISOString().slice(0,10),
    formatBr:(n)=>n.toFixed(2),
    categoryForTransaction:(tx)=>({name:tx.category,cls:'food',bg:'#fff',icon:'●'}),
    visualBankKind:()=>'',
    visualAccountIcon:()=> '💳',
    escapeHtml:(v)=>String(v),
    openTransactionEdit:()=>{}
  };
  vm.createContext(ctx);
  vm.runInContext(source + '\nthis.historyApi={inPeriod,filterTx,renderList,historyDayCache};',ctx);
  return {ctx,root,info,transactions,api:ctx.historyApi,setToday:(x)=>{now=x;}};
}

test('All means every date, on startup and after selecting Month', () => {
  const {ctx,api,setToday}=createView();
  assert.equal(api.filterTx().length,3);
  ctx.currentPeriod='month';
  assert.deepEqual(Array.from(api.filterTx(),x=>x.id),['nov']);
  ctx.currentPeriod='all';
  assert.deepEqual(Array.from(api.filterTx(),x=>x.id),['nov','oct','sept']);
  setToday('2026-12-01T12:00:00');
  assert.equal(api.filterTx().length,3);
  ctx.currentPeriod='month';
  assert.equal(api.filterTx().length,0);
  ctx.currentPeriod='all';
  assert.equal(api.filterTx().length,3);
});

test('history preserves rows, day DOM and edit handler across redundant render and period switches', () => {
  const {ctx,api,root}=createView();
  api.renderList();
  assert.equal(root.children.length,3);
  const septemberDay=api.historyDayCache.get('2026-09-30');
  const septemberRow=septemberDay.children[1];
  const writes=septemberRow.writes;
  api.renderList();
  assert.equal(root.children.length,3);
  assert.equal(api.historyDayCache.get('2026-09-30'),septemberDay);
  assert.equal(septemberDay.children[1],septemberRow);
  assert.equal(septemberRow.writes,writes);
  assert.equal(root.handlers.get('click').length,1);
  ctx.currentPeriod='month';
  api.renderList();
  assert.equal(root.children.length,1);
  ctx.currentPeriod='all';
  api.renderList();
  assert.equal(root.children.length,3);
  assert.equal(api.historyDayCache.get('2026-09-30'),septemberDay);
  assert.equal(septemberDay.children[1],septemberRow);
  assert.equal(septemberRow.writes,writes);
  assert.equal(root.handlers.get('click').length,1);
});

test('editing one transaction does not rewrite unrelated rows',()=>{
  const {api,transactions}=createView();
  api.renderList();
  const oldRow=api.historyDayCache.get('2026-09-30').children[1];
  const updatedRow=api.historyDayCache.get('2026-11-01').children[1];
  const oldWrites=oldRow.writes, updateWrites=updatedRow.writes;
  transactions[2].note='Отредактированный комментарий';
  api.renderList();
  assert.equal(oldRow.writes,oldWrites);
  assert.equal(updatedRow.writes,updateWrites+1);
  assert.equal(transactions.length,3);
});
