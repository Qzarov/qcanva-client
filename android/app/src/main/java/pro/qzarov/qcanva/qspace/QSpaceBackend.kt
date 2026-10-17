package pro.qzarov.qcanva.qspace

import org.json.JSONArray
import org.json.JSONObject

/**
 * The storage node as the rest of the app sees it. The real implementation
 * (src/qspaceNode) wraps the UniFFI bindings of libqspace_ffi.so; when the
 * native part is not bundled the stub (src/qspaceStub) provides no backend.
 * Results are JSON so the plugin can hand them to the WebView unchanged and
 * nothing outside src/qspaceNode depends on generated code.
 *
 * Every call blocks (network, SQLite, file system): never call from the main
 * thread.
 */
interface QSpaceBackend {
    /** Registers this phone with the hub and writes device.json into [configDir]. */
    fun register(
        hubUrl: String,
        userToken: String,
        root: String,
        name: String,
        kind: String,
        configDir: String,
    ): JSONObject

    fun open(configDir: String): QSpaceNodeHandle
}

interface QSpaceNodeHandle : AutoCloseable {
    /** Starts the sync loop and iroh transfers; [onEvent] is called on a Rust thread. */
    fun start(onEvent: (JSONObject) -> Unit)
    fun stop()
    fun status(): JSONObject
    fun syncNow()
    fun pause()
    fun resume(): Boolean
    fun fetch(path: String): JSONObject
    fun evict(path: String): JSONArray
    fun policy(): JSONObject

    /** [mode] is one of `full`, `on_demand`, `none`. */
    fun setMode(folderPath: String, mode: String): JSONObject
    fun networkChanged()
}

/** An error with a stable [code] for the WebView (e.g. `Unauthorized`, `NOT_AVAILABLE`). */
class QSpaceException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)
