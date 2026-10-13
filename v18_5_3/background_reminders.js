/* Background reminder routing and cycle-aware Android settings (v18.5.3). */
(function(){
'use strict';
window.syncNativeBankSettings=function(){
  try {
    if(typeof AndroidBridge==='undefined'||typeof AndroidBridge.syncBackgroundBankSettings!=='function')return false;
    if(typeof LedgerPeriods==='undefined'||!Array.isArray(accounts))return false;
    const linked=accounts.filter(a=>a&&a.notificationLinkEnabled===true&&
      (a.bankBrand==='alpha'||a.bankBrand==='belarusbank'))
      .map(a=>({bankBrand:a.bankBrand,last4:String(a.last4||''),notificationLinkEnabled:true}));
    return AndroidBridge.syncBackgroundBankSettings(JSON.stringify({cycleId:LedgerPeriods.activeId(),accounts:linked}));
  }catch(e){console.warn('Не удалось обновить настройки фоновых уведомлений',e);return false;}
};
window.openNativeBackgroundReminder=function(cycleId,nativeFingerprint){
  try{
    if(!cycleId||!nativeFingerprint||typeof LedgerPeriods==='undefined')return false;
    if(LedgerPeriods.activeId()!==cycleId){
      LedgerPeriods.setView(cycleId);
      if(LedgerPeriods.activeId()!==cycleId)return false;
    }
    if(typeof AndroidBridge!=='undefined'&&typeof AndroidBridge.getQueuedBankNotifications==='function'){
      const queue=JSON.parse(AndroidBridge.getQueuedBankNotifications()||'[]');
      if(queue.length && typeof window.receiveNativeBankBatch==='function')window.receiveNativeBankBatch(queue);
    }
    const tx=transactions.find(t=>t&&t.nativeFingerprint===nativeFingerprint&&t.ledgerPeriodId===cycleId);
    if(tx && tx.unresolved && tx.category==='Нужно разобрать'){
      openTransactionEdit(tx.id);
      return true;
    }
    return false;
  }catch(e){console.warn('Не удалось открыть банковскую операцию',e);return false;}
};
window.addEventListener('load',()=>window.syncNativeBankSettings());
})();