package by.moifinansy.rebuild

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import by.moifinansy.rebuild.data.FinanceDatabase
import by.moifinansy.rebuild.data.FinanceRepository
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val repository = FinanceRepository(FinanceDatabase.get(applicationContext))
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
            addJavascriptInterface(FinanceBridge(repository), "FinanceNative")
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

    override fun onDestroy() {
        webView.removeJavascriptInterface("FinanceNative")
        webView.destroy()
        super.onDestroy()
    }

    private class FinanceBridge(private val repository: FinanceRepository) {
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
    }
}
