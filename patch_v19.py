from pathlib import Path
p=Path('app/src/main/assets/app.html')
s=p.read_text(encoding='utf-8')
needle='''  <div id="importInitialActions" class="safe-bottom-actions">
    <div class="sheet-actions" style="margin-top:0">
      <button class="btn secondary" id="openMbankFromImportBtn">История Mbank</button>
      <button class="btn secondary" id="closeImportBtn">Закрыть</button>
    </div>
  </div>'''
assert needle in s
s=s.replace(needle,needle.replace('    </div>\n  </div>','    </div>\n    <button class="btn secondary" id="openInSyncFromImport" type="button" style="width:100%;margin-top:11px;">Уточнить покупки Альфа-Банка · InSync</button>\n  </div>'),1)
modal='''
<div class="sheet" id="insyncHistorySheet" role="dialog" aria-label="Уточнить покупки Альфа-Банка">
  <h3>Уточнить покупки · InSync</h3>
  <p class="insync-intro">Полученные push-уведомления уже содержат сумму. Вставь информацию о магазине из истории InSync или текст выгрузки. При необходимости впиши название вручную. Приложение <b>ничего не читает из банка самостоятельно</b>.</p>
  <div class="label">Текст операции из InSync или CSV/TXT</div>
  <textarea class="input" id="insyncPaste" rows="5" placeholder="Дата: 13.10.2026 09:12:25\nМагазин: ЕВРООПТ\nСумма: −4,31 BYN"></textarea>
  <label class="insync-file-label">Выбрать файл CSV / TXT
    <input id="insyncSourceFile" type="file" accept=".txt,.csv,text/plain,text/csv" />
  </label>
  <div class="label">Название магазина (если не скопировалось)</div>
  <input class="input" id="insyncMerchant" placeholder="Например, Евроопт" autocomplete="off" />
  <div class="label">Сумма и дата для уточнения совпадения (необязательно)</div>
  <div class="insync-fields">
    <input class="input" id="insyncAmount" inputmode="decimal" placeholder="4,31 BYN" />
    <input class="input" id="insyncDate" type="date" aria-label="Дата покупки" />
    <input class="input" id="insyncTime" type="time" aria-label="Время покупки" />
  </div>
  <button id="insyncParse" type="button" class="btn primary insync-main-button">Найти операции</button>
  <div id="insyncMessage" class="insync-message" aria-live="polite"></div>
  <div id="insyncPreview"></div>
  <div class="sheet-actions insync-bottom-actions">
    <button id="insyncClose" type="button" class="btn secondary">Назад</button>
    <button id="insyncConfirm" type="button" class="btn primary" disabled>Подтвердить совпадения</button>
  </div>
  <p class="tiny insync-privacy">Подтверждение меняет только название магазина и категорию существующих операций. Новых списаний и изменения баланса не будет. Данные остаются в памяти этого приложения.</p>
</div>
<style id="insync-v19-style">
#insyncHistorySheet{top:43dvh!important;bottom:auto!important;transform:translate(-50%,-50%)!important;max-height: min(calc(100dvh - 34px - var(--native-bottom-inset)),720px)!important;overflow-y:auto!important}
#insyncHistorySheet .insync-intro{font-size:13px;line-height:1.5;color:#afc5ed;margin:4px 0 16px}
#insyncHistorySheet .insync-file-label{display:block;border:1px dashed rgba(125,179,250,.5);border-radius:13px;padding:12px;text-align:center;margin-top:10px;color:#b9d4ff;font-size:13px;cursor:pointer}
#insyncHistorySheet .insync-file-label input{display:none}
#insyncHistorySheet .insync-fields{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:7px}
#insyncHistorySheet .insync-fields .input{min-width:0;padding:9px 7px!important;font-size:12px!important}
#insyncHistorySheet .insync-main-button{display:block;width:100%;margin-top:16px}
#insyncHistorySheet .insync-message{padding:10px 12px;margin:15px 0 9px;border:1px solid rgba(97,155,255,.36);border-radius:12px;color:#b9d2fc;background:rgba(16,44,93,.65);line-height:1.45;font-size:12px}
#insyncHistorySheet .insync-message.insync-error{color:#ffbbc8;border-color:rgba(244,90,129,.48)}
#insyncHistorySheet .insync-row{padding:12px;margin:11px 0;border-radius:15px;border:1px solid rgba(102,165,255,.35);background:rgba(12,37,79,.82)}
#insyncHistorySheet .insync-merchant{color:#fff;font-size:15px;font-weight:800;overflow-wrap:anywhere}
#insyncHistorySheet .insync-meta{color:#a5bee9;font-size:11px;margin-top:6px}
#insyncHistorySheet .insync-row .label{margin:12px 0 6px!important}
#insyncHistorySheet .insync-row .tiny{margin-top:9px}
#insyncHistorySheet .insync-bottom-actions{position:relative;display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:16px}
#insyncHistorySheet .insync-bottom-actions .btn{white-space:normal;line-height:1.25}
#insyncHistorySheet button:disabled{opacity:.5}
#insyncHistorySheet .insync-privacy{margin-top:13px}
@media(max-width:350px){#insyncHistorySheet .insync-fields{grid-template-columns:1fr 1fr}#insyncHistorySheet .insync-fields #insyncTime{grid-column:1 / -1}}
</style>
'''
assert '<div class="sheet" id="mbankConnectSheet">' in s
s=s.replace('<div class="sheet" id="mbankConnectSheet">',modal+'\n<div class="sheet" id="mbankConnectSheet">',1)
assert s.count('</body>')==1
s=s.replace('</body>','<script src="v19_insync_parser.js"></script>\n<script src="v19_insync_ui.js"></script>\n</body>',1)
p.write_text(s,encoding='utf-8')
print('Patched InSync reconciliation UI')
