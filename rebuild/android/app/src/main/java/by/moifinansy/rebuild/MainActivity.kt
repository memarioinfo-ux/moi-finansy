package by.moifinansy.rebuild

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import by.moifinansy.rebuild.data.BackupCodec
import by.moifinansy.rebuild.data.FinanceDatabase
import by.moifinansy.rebuild.data.FinanceRepository
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var backupCodec: BackupCodec
    private val exportRequest = 101
    private val importRequest = 102

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val db = FinanceDatabase.get(applicationContext)
        val repository = FinanceRepository(db)
        backupCodec = BackupCodec(db)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(11, 17, 33))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowContentAccess = false
            settings.allowFileAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            android.webkit.WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

            // Bridge is safe only because navigation is restricted to our bundled assets.
            addJavascriptInterface(FinanceBridge(this@MainActivity, repository), "FinanceNative")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val u = request.url
                    return !(u.scheme == "https" &&
                        u.host == WebViewAssetLoader.DEFAULT_DOMAIN &&
                        u.path?.startsWith("/assets/") == true)
                }
            }
            loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }
        setContentView(webView)
    }

    private fun openBackupPicker(export: Boolean) {
        if (!export) {
            android.app.AlertDialog.Builder(this)
                .setTitle("Восстановление из копии")
                .setMessage("Можно выбрать только резервную копию тестового приложения «Мои финансы» v2. " +
                    "Импорт разрешён только в пустую базу. Если здесь уже есть счета или операции, " +
                    "они не будут заменены или удалены.")
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Выбрать файл") { _, _ -> launchBackupPicker(false) }
                .show()
            return
        }
        launchBackupPicker(true)
    }

    private fun launchBackupPicker(export: Boolean) {
        val intent = if (export) {
            Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "moi-finansy-" + LocalDate.now().toString() + ".json")
            }
        } else {
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
            }
        }
        startActivityForResult(intent, if (export) exportRequest else importRequest)
    }

    private fun notifyBackup(type: String, message: String) {
        runOnUiThread {
            if (::webView.isInitialized) {
                val js = "window.onNativeBackupEvent?.(" +
                    JSONObject.quote(type) + "," + JSONObject.quote(message) + ")"
                webView.evaluateJavascript(js, null)
            }
        }
    }

    @Deprecated("System document picker result for offline backups")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data?.data == null) return
        if (requestCode != exportRequest && requestCode != importRequest) return
        val uri = data.data ?: return

        Thread {
            try {
                if (requestCode == exportRequest) {
                    val output = contentResolver.openOutputStream(uri, "wt")
                        ?: throw IllegalStateException("Не получилось открыть файл для записи")
                    output.use {
                        it.write(backupCodec.exportJson().toByteArray(Charsets.UTF_8))
                        it.flush()
                    }
                    notifyBackup("exported", "Резервная копия сохранена")
                } else {
                    val input = contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException("Не удалось прочитать файл")
                    val bytes = input.use { stream ->
                        val result = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val count = stream.read(buffer)
                            if (count < 0) break
                            if (count == 0) continue
                            result.write(buffer, 0, count)
                            require(result.size() <= 25_000_000) { "Файл слишком большой" }
                        }
                        result.toByteArray()
                    }
                    val count = backupCodec.importJson(bytes.toString(Charsets.UTF_8))
                    notifyBackup("imported", "Восстановлено записей: " + count)
                }
            } catch (e: Exception) {
                notifyBackup("error", e.message ?: "Не удалось обработать файл")
            }
        }.start()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("FinanceNative")
        webView.destroy()
        super.onDestroy()
    }

    private class FinanceBridge(private val activity: MainActivity, private val repository: FinanceRepository) {
        private fun respond(block: () -> JSONObject): String = try {
            JSONObject().put("ok", true).put("data", block()).toString()
        } catch (e: Exception) {
            JSONObject()
                .put("ok", false)
                .put("error", e.message ?: "Операция не выполнена")
                .toString()
        }

        @JavascriptInterface
        fun getSnapshot(): String = respond { repository.snapshot() }

        @JavascriptInterface
        fun createAccount(name: String, currency: String, startingBalance: String): String =
            respond { repository.createAccount(name, currency, startingBalance) }

        @JavascriptInterface
        fun saveTransaction(json: String): String = respond {
            repository.saveTransaction(JSONObject(json))
        }

        @JavascriptInterface
        fun deleteTransaction(id: String): String = respond {
            repository.deleteTransaction(id)
        }

        @JavascriptInterface
        fun exportBackup() {
            activity.runOnUiThread { activity.openBackupPicker(export = true) }
        }

        @JavascriptInterface
        fun importBackup() {
            activity.runOnUiThread { activity.openBackupPicker(export = false) }
        }
    }
}
