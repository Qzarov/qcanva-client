package pro.qzarov.qcanva.qspace

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * Process-wide owner of the storage node. The foreground service starts and
 * stops it; the Capacitor plugin sends commands and listens to events while
 * the WebView is alive. Both run in the same process, so no binding is needed.
 *
 * All methods except the cheap getters block: call them off the main thread.
 */
object AgentHolder {
    private const val TAG = "QSpaceAgent"
    private const val PREFS = "qspace_agent"
    private const val KEY_ENABLED = "enabled"
    private const val CONFIG_FILE = "config.json"
    private const val LEGACY_CONFIG_FILE = "device.json"
    private const val PROGRESS_INTERVAL_MS = 250L

    /** The node needs all-files access (MANAGE_EXTERNAL_STORAGE), which Android 11 introduced. */
    const val MIN_SDK = Build.VERSION_CODES.R

    const val DEVICE_KIND = "phone"

    enum class Availability(val wire: String) {
        AVAILABLE("available"),
        ANDROID_TOO_OLD("android_too_old"),
        NOT_BUNDLED("not_bundled"),
        LIBRARY_MISSING("library_missing"),
    }

    private val backend: QSpaceBackend? by lazy { NativeBackendFactory.create() }

    // Commands hold the read lock; open, start, stop and close hold the write
    // lock, so the node is never closed under a running command.
    private val rw = ReentrantReadWriteLock()

    @Volatile
    private var node: QSpaceNodeHandle? = null

    @Volatile
    var isRunning = false
        private set

    @Volatile
    var lastError: String? = null
        private set

    private val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()

    // Rust calls the listener on its own threads, sometimes holding a lock;
    // events are handed over here and delivered from one thread in order.
    private val events: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "qspace-events").apply { isDaemon = true }
    }

    @Volatile
    private var lastProgressAt = 0L

    fun availability(context: Context): Availability = when {
        Build.VERSION.SDK_INT < MIN_SDK -> Availability.ANDROID_TOO_OLD
        backend == null -> Availability.NOT_BUNDLED
        !QSpaceNative.ensureLoaded(context) -> Availability.LIBRARY_MISSING
        else -> Availability.AVAILABLE
    }

    fun isAvailable(context: Context) = availability(context) == Availability.AVAILABLE

    fun configDir(context: Context) = File(context.filesDir, "qspace")

    /**
     * The node writes its identity to config.json. Builds before qspace-agent
     * 18fb059 named it device.json; such an install is renamed once so the
     * phone stays registered after an update.
     */
    fun isRegistered(context: Context): Boolean {
        val dir = configDir(context)
        val config = File(dir, CONFIG_FILE)
        val legacy = File(dir, LEGACY_CONFIG_FILE)
        if (!config.isFile && legacy.isFile && !legacy.renameTo(config)) {
            Log.w(TAG, "could not rename $LEGACY_CONFIG_FILE to $CONFIG_FILE")
        }
        return config.isFile
    }

    fun isEnabled(context: Context) = prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    /** The user turned the node on and it can run here. */
    fun shouldRun(context: Context) =
        isEnabled(context) && isRegistered(context) && isAvailable(context)

    fun addListener(listener: (JSONObject) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (JSONObject) -> Unit) {
        listeners.remove(listener)
    }

    fun register(context: Context, hubUrl: String, userToken: String, root: String, name: String): JSONObject {
        val b = requireBackend(context)
        rw.write {
            if (isRunning) {
                throw QSpaceException("ALREADY_RUNNING", "Stop the storage node before registering again")
            }
            closeLocked()
            val dir = configDir(context).apply { mkdirs() }
            return b.register(hubUrl, userToken, root, name, DEVICE_KIND, dir.path)
        }
    }

    /** Runs [block] on the open node, opening it if needed (without starting sync). */
    fun <T> withNode(context: Context, block: (QSpaceNodeHandle) -> T): T {
        if (node == null) rw.write { openLocked(context) }
        rw.read {
            val n = node ?: throw QSpaceException("NOT_OPEN", "The storage node was just stopped, try again")
            return block(n)
        }
    }

    fun startNode(context: Context) {
        rw.write {
            if (isRunning) return
            try {
                openLocked(context).start(::dispatch)
                isRunning = true
                lastError = null
            } catch (e: Exception) {
                lastError = e.message
                // A failed start can leave the node half set up (marked as
                // running, iroh endpoint bound but never announced to the
                // hub); the next attempt has to begin from a fresh node.
                closeLocked()
                throw e
            }
        }
        dispatchState()
    }

    /** Stops sync and closes the node, which also shuts iroh down. */
    fun stopNode() {
        rw.write {
            if (isRunning) {
                try {
                    node?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "stop failed", e)
                }
            }
            isRunning = false
            closeLocked()
        }
        dispatchState()
    }

    fun networkChanged() {
        rw.read {
            if (!isRunning) return
            try {
                node?.networkChanged()
            } catch (e: Exception) {
                Log.w(TAG, "network_changed failed", e)
            }
        }
    }

    /** Everything the UI needs in one object; the node part only when it can be read. */
    fun snapshot(context: Context): JSONObject {
        val availability = availability(context)
        val registered = isRegistered(context)
        val out = JSONObject()
            .put("available", availability == Availability.AVAILABLE)
            .put("availability", availability.wire)
            .put("registered", registered)
            .put("enabled", isEnabled(context))
            .put("running", isRunning)
            .put("lastError", lastError ?: JSONObject.NULL)
        if (availability == Availability.AVAILABLE && registered) {
            try {
                out.put("node", withNode(context) { it.status() })
            } catch (e: QSpaceException) {
                out.put("nodeError", e.message)
            }
        }
        return out
    }

    private fun requireBackend(context: Context): QSpaceBackend {
        val availability = availability(context)
        if (availability != Availability.AVAILABLE) {
            throw QSpaceException("NOT_AVAILABLE", "Q Space storage node is not available: ${availability.wire}")
        }
        return backend!!
    }

    private fun openLocked(context: Context): QSpaceNodeHandle {
        node?.let { return it }
        val b = requireBackend(context)
        if (!isRegistered(context)) {
            throw QSpaceException("NOT_REGISTERED", "This phone is not registered as a storage device")
        }
        return b.open(configDir(context).path).also { node = it }
    }

    private fun closeLocked() {
        val n = node ?: return
        node = null
        try {
            n.close()
        } catch (e: Exception) {
            Log.w(TAG, "close failed", e)
        }
    }

    private fun dispatch(event: JSONObject) {
        when (event.optString("type")) {
            "downloadProgress" -> {
                val now = SystemClock.elapsedRealtime()
                val finished = event.optLong("doneBytes") >= event.optLong("totalBytes")
                if (!finished && now - lastProgressAt < PROGRESS_INTERVAL_MS) return
                lastProgressAt = now
            }
            "error" -> lastError = event.optString("message")
        }
        events.execute {
            for (listener in listeners) {
                try {
                    listener(event)
                } catch (e: Exception) {
                    Log.w(TAG, "event listener failed", e)
                }
            }
        }
    }

    private fun dispatchState() {
        dispatch(
            JSONObject()
                .put("type", "state")
                .put("running", isRunning)
                .put("error", lastError ?: JSONObject.NULL),
        )
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
