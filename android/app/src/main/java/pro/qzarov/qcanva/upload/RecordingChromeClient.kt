package pro.qzarov.qcanva.upload

import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebChromeClient

/**
 * Capacitor's chrome client, which also notes the content:// address of every
 * file the user picks for the page ([PickedFiles]) before handing them on.
 * Installed by MainActivity right after the bridge exists (the activity not
 * yet started, so the client's result launchers can still register).
 */
class RecordingChromeClient(private val bridge: Bridge) : BridgeWebChromeClient(bridge) {
    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean {
        val recording = ValueCallback<Array<Uri>> { uris ->
            PickedFiles.record(bridge.context, uris)
            filePathCallback.onReceiveValue(uris)
        }
        return super.onShowFileChooser(webView, recording, fileChooserParams)
    }
}
