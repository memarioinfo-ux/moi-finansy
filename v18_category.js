/* Offline merchant dictionary + MCC + user-trained mappings, v18. */
(function () {
'use strict';
const KEY='alina_budget_merchant_category_v18';
const groups=[
 ['Продукты','евроопт','evroopt','евро опт','хит','соседи','грин','green','spar','спар','корона','копеечка','kopeechka','санта','santa','гиппо','gippo','hippo','виталюр','vitalur','алми','almi','дионис','dionis','простор','prostor','доброном','мартинн','mart inn','fix price','фикспрайс','светофор','продуктовый'],
 ['Кафе','кафе','coffee','кофе','кофейня','coffee house','burger king','бургер кинг','kfc','мак бай','макбай','mak by','пицца','pizza','dominos','доминос','dodo','додо','ресторан','столовая','суши','sushi','starbucks'],
 ['Транспорт','яндекс go','yandex go','yandex taxi','яндекс такси','такси','taxi','uber','убер','bolt','белоруснефть','belorusneft','азс','заправка','автобус','метро','метрополитен','проезд','парковка','parking','белжд'],
 ['Здоровье','аптека','apteka','pharmacy','фарм','аптекарь','белфармация','медцентр','медицинский центр','поликлиника','стоматология','dental','медэксперт'],
 ['Красота','мила','косметика','beauty','золотое яблоко','рив гош','парикмахерская','салон красоты','маникюр','nail studio'],
 ['Дом','21век','21vek','21 vek','электросила','5 элемент','5element','домовик','материк','стройматериалы','хозтовары','мебель','икеа','ikea'],
 ['Подписки','spotify','спотифай','youtube premium','ютуб премиум','netflix','нетфликс','яндекс плюс','yandex plus','apple music','google one','кинопоиск','ivi','иви','okko','окко'],
 ['Развлечения','кинотеатр','cinema','silver screen','музей','боулинг','bowling','квест','театр','концерт','аттракционы','аквапарк'],
 ['Подарки','цветы','flower shop','florist','букет','цветочный магазин','подарки','gift shop']
];
const mcc={
 '5411':'Продукты','5422':'Продукты','5441':'Продукты','5451':'Продукты','5462':'Продукты','5499':'Продукты',
 '5812':'Кафе','5813':'Кафе','5814':'Кафе',
 '4121':'Транспорт','4111':'Транспорт','4112':'Транспорт','4131':'Транспорт','4784':'Транспорт','5541':'Транспорт','5542':'Транспорт','7523':'Транспорт',
 '5912':'Здоровье','8011':'Здоровье','8021':'Здоровье','8099':'Здоровье',
 '7230':'Красота','7298':'Красота','5977':'Красота',
 '5200':'Дом','5211':'Дом','5712':'Дом','5722':'Дом','5732':'Дом',
 '7832':'Развлечения','7922':'Развлечения','7996':'Развлечения',
 '5947':'Подарки','5992':'Подарки'
};
function norm(x){return String(x||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[‘’“”«»]/g,' ').replace(/\b(?:ooo|oao|zao|ip|ооо|оао|зао|ип)\b/gi,' ').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function okay(x){const v=String(x||'');const n=norm(v);return n.length>=3&&n.length<=90&&!/(?:остаток|доступно|balance|код подтверждения|пароль|пин код)/i.test(v)&&!/(?:byn|byr|руб|карта \d{4})/i.test(v);}
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.key==='string'&&typeof x.categoryId==='string').slice(-150):[];}catch(_){return [];}}
function catByName(name,type='expense'){const cat=typeof findCategoryByName==='function'?findCategoryByName(name,type):null;return cat?{id:cat.id,category:cat.name,icon:cat.icon,cls:cat.cls,source:'directory'}:null;}
function personal(x,type){if(!okay(x))return null;const k=norm(x);const rule=read().find(r=>r.type===type&&r.key===k);if(!rule)return null;const c=typeof getCategoryById==='function'?getCategoryById(rule.categoryId,type):null;return c?{id:c.id,category:c.name,icon:c.icon,cls:c.cls,source:'user'}:null;}
function directory(x){const n=norm(x);if(!n)return null;const text=' '+n+' ';for(const [name,...aliases] of groups){if(aliases.some(alias=>text.includes(' '+norm(alias)+' ')))return catByName(name);}return null;}
function mccRule(code){return catByName(mcc[String(code||'').replace(/\D/g,'')]);}
const oldInfer=window.inferCategory;
window.inferCategory=function(text,type){
 if(type!=='expense')return oldInfer(text,type);
 return personal(text,type)||directory(text)||oldInfer(text,type);
};
window.inferCategoryWithMcc=function(text,type,code){
 if(type!=='expense')return window.inferCategory(text,type);
 return personal(text,type)||mccRule(code)||directory(text)||oldInfer(text,type);
};
window.rememberMerchantCategory=function(oldTx,category){
 if(!oldTx||oldTx.type!=='expense'||!category||category.id==='expense-review')return;
 if(!(oldTx.sourceKind||oldTx.rawBankText||oldTx.smsFingerprint)||!okay(oldTx.merchant))return;
 const key=norm(oldTx.merchant);
 const rules=read().filter(x=>!(x.type==='expense'&&x.key===key));
 rules.push({key,type:'expense',categoryId:category.id});
 try{localStorage.setItem(KEY,JSON.stringify(rules.slice(-150)));}catch(_){}
};
const oldAlfa=window.parseAlfaPushNotification;
window.parseAlfaPushNotification=function(item){
 const parsed=oldAlfa(item);
 if(parsed.type!=='expense')return parsed;
 const full=typeof nativeNotificationMergedText==='function'?nativeNotificationMergedText(item):String(item?.text||'');
 const match=full.match(/(?:\bMCC|МСС)\s*[:№#-]?\s*(\d{4})\b/i);
 const code=match?.[1]||null;
 parsed.mcc=code;
 let result=window.inferCategoryWithMcc(parsed.merchant,'expense',code);
 if(result.category==='Нужно разобрать')result=directory(full)||result;
 parsed.category=result.category;
 parsed.categoryIcon=result.icon;
 parsed.categoryClass=result.cls;
 parsed.unresolved=result.category==='Нужно разобрать';
 return parsed;
};
window.bankCategoryDiagnostics=function(){return {catalogGroups:groups.length,aliases:groups.reduce((n,g)=>n+g.length-1,0),userRules:read().length,mccCodes:Object.keys(mcc).length,offline:true};};
})();