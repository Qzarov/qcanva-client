package pro.qzarov.qcanva.upload

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * The page's side of [UploadQueue]: `enqueue` a picked file (named by its
 * name and size, see [PickedFiles]) with the request to send; progress and
 * the outcome come back as `uploadProgress` / `uploadFinished`; `status`
 * answers a page that was asleep; `cancel` stops one.
 */
@CapacitorPlugin(name = "NativeUpload")
class NativeUploadPlugin : Plugin() {
    companion object {
        private const val TAG = "NativeUploadPlugin"
    }

    private val forward: (String, JSONObject) -> Unit = { event, data ->
        try {
            notifyListeners(event, JSObject.fromJSONObject(data), true)
        } catch (e: Exception) {
            Log.w(TAG, "cannot forward $event", e)
        }
    }

    override fun load() {
        UploadQueue.addListener(forward)
    }

    override fun handleOnDestroy() {
        UploadQueue.removeListener(forward)
    }

    /** The file was not picked through the chooser (or long ago): `accepted: false`, the page uploads it itself. */
    @PluginMethod
    fun enqueue(call: PluginCall) {
        val id = call.getString("id")
        val name = call.getString("name")
        val url = call.getString("url")
        if (id.isNullOrEmpty() || name.isNullOrEmpty() || url.isNullOrEmpty() || !url.startsWith("https://")) {
            call.resolve(JSObject().put("accepted", false))
            return
        }
        val size = call.getLong("size") ?: -1L
        val uri = PickedFiles.take(name, size)
        if (uri == null) {
            call.resolve(JSObject().put("accepted", false))
            return
        }
        val headers = mutableMapOf<String, String>()
        call.getObject("headers")?.let { obj ->
            for (key in obj.keys()) obj.getString(key)?.let { headers[key] = it }
        }
        val job = UploadQueue.Job(
            id = id,
            uri = uri,
            name = name,
            size = size,
            url = url,
            method = call.getString("method") ?: "POST",
            headers = headers,
            mode = if (call.getString("mode") == "raw") UploadQueue.Mode.RAW else UploadQueue.Mode.MULTIPART,
            field = call.getString("field") ?: "file",
            contentType = call.getString("contentType") ?: "application/octet-stream",
        )
        UploadQueue.enqueue(context, job)
        call.resolve(JSObject().put("accepted", true))
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        call.getString("id")?.let { UploadQueue.cancel(it) }
        call.resolve()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val list = JSArray()
        for (job in UploadQueue.snapshot()) list.put(job)
        call.resolve(JSObject().put("uploads", list))
    }

    /** The page took a finished upload's outcome: no need to keep it. */
    @PluginMethod
    fun forget(call: PluginCall) {
        call.getString("id")?.let { UploadQueue.forget(it) }
        call.resolve()
    }
}
