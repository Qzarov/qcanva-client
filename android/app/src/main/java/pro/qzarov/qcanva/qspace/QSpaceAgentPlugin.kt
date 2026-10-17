package pro.qzarov.qcanva.qspace

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * WebView side of the storage node. Commands go straight to [AgentHolder]
 * on a background thread; node events arrive as `nodeEvent`.
 */
@CapacitorPlugin(
    name = "QSpaceAgent",
    permissions = [
        Permission(alias = QSpaceAgentPlugin.NOTIFICATIONS, strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class QSpaceAgentPlugin : Plugin() {
    companion object {
        const val NOTIFICATIONS = "notifications"
        private const val TAG = "QSpaceAgentPlugin"
        private const val EVENT = "nodeEvent"
    }

    private val io: ExecutorService = Executors.newCachedThreadPool { r -> Thread(r, "qspace-plugin") }

    private val forward: (JSONObject) -> Unit = { event ->
        try {
            notifyListeners(EVENT, JSObject.fromJSONObject(event))
        } catch (e: Exception) {
            Log.w(TAG, "cannot forward event", e)
        }
    }

    override fun load() {
        AgentHolder.addListener(forward)
    }

    override fun handleOnDestroy() {
        AgentHolder.removeListener(forward)
        io.shutdown()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) = background(call) {
        val availability = AgentHolder.availability(context)
        JSObject()
            .put("available", availability == AgentHolder.Availability.AVAILABLE)
            .put("availability", availability.wire)
            .put("registered", AgentHolder.isRegistered(context))
            .put("enabled", AgentHolder.isEnabled(context))
            .put("running", AgentHolder.isRunning)
            .put("defaultRoot", defaultRoot())
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val hubUrl = call.getString("hubUrl")
        val userToken = call.getString("userToken")
        if (hubUrl.isNullOrBlank() || userToken.isNullOrBlank()) {
            call.reject("hubUrl and userToken are required", "INVALID_ARGUMENT")
            return
        }
        val root = call.getString("root")?.takeIf { it.isNotBlank() } ?: defaultRoot()
        val name = call.getString("name")?.takeIf { it.isNotBlank() } ?: defaultName()
        background(call) {
            if (!hasAllFilesAccess()) {
                throw QSpaceException("PERMISSION_ALL_FILES", "All-files access is required to keep files in $root")
            }
            AgentHolder.register(context, hubUrl, userToken, root, name)
        }
    }

    @PluginMethod
    fun start(call: PluginCall) = background(call) {
        if (!AgentHolder.isAvailable(context)) {
            throw QSpaceException("NOT_AVAILABLE", "Q Space storage node is not available on this device")
        }
        if (!AgentHolder.isRegistered(context)) {
            throw QSpaceException("NOT_REGISTERED", "Register this phone first")
        }
        AgentHolder.setEnabled(context, true)
        WatchdogWorker.schedule(context)
        QSpaceAgentService.start(context)
        null
    }

    @PluginMethod
    fun stop(call: PluginCall) = background(call) {
        AgentHolder.setEnabled(context, false)
        WatchdogWorker.cancel(context)
        QSpaceAgentService.stop(context)
        null
    }

    @PluginMethod
    fun status(call: PluginCall) = background(call) { AgentHolder.snapshot(context) }

    @PluginMethod
    fun syncNow(call: PluginCall) = background(call) {
        AgentHolder.withNode(context) { it.syncNow() }
        null
    }

    @PluginMethod
    fun pause(call: PluginCall) = background(call) {
        AgentHolder.withNode(context) { it.pause() }
        null
    }

    @PluginMethod
    fun resume(call: PluginCall) = background(call) {
        JSObject().put("resumed", AgentHolder.withNode(context) { it.resume() })
    }

    @PluginMethod
    fun fetch(call: PluginCall) {
        val path = requirePath(call) ?: return
        background(call) { AgentHolder.withNode(context) { it.fetch(path) } }
    }

    @PluginMethod
    fun evict(call: PluginCall) {
        val path = requirePath(call) ?: return
        background(call) { JSObject().put("results", AgentHolder.withNode(context) { it.evict(path) }) }
    }

    @PluginMethod
    fun policy(call: PluginCall) = background(call) { AgentHolder.withNode(context) { it.policy() } }

    @PluginMethod
    fun setMode(call: PluginCall) {
        val folderPath = call.getString("folderPath")
        val mode = call.getString("mode")
        if (folderPath == null || mode == null) {
            call.reject("folderPath and mode are required", "INVALID_ARGUMENT")
            return
        }
        background(call) { AgentHolder.withNode(context) { it.setMode(folderPath, mode) } }
    }

    // --- Permissions -------------------------------------------------------

    @PluginMethod
    fun permissionState(call: PluginCall) {
        call.resolve(permissions())
    }

    /** Opens the "All files access" screen; resolves with [permissions] when the user returns. */
    @PluginMethod
    fun requestAllFilesAccess(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || hasAllFilesAccess()) {
            call.resolve(permissions())
            return
        }
        val forApp = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri())
        val general = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
        launchSettings(call, listOf(forApp, general), "settingsResult")
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED
        ) {
            call.resolve(permissions())
            return
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationsResult")
    }

    /**
     * Asks to exempt the app from battery optimisation. Besides keeping the
     * service alive under Doze, it lets Android 12+ start the service from
     * the background (boot, watchdog).
     */
    @PluginMethod
    fun requestBatteryExemption(call: PluginCall) {
        if (isIgnoringBatteryOptimizations()) {
            call.resolve(permissions())
            return
        }
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri())
        val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        launchSettings(call, listOf(direct, list), "settingsResult")
    }

    @ActivityCallback
    fun settingsResult(call: PluginCall?, result: ActivityResult) {
        call?.resolve(permissions())
    }

    @PermissionCallback
    fun notificationsResult(call: PluginCall) {
        call.resolve(permissions())
    }

    // --- Helpers -----------------------------------------------------------

    private fun permissions(): JSObject = JSObject()
        .put("allFiles", if (hasAllFilesAccess()) "granted" else "prompt")
        .put("notifications", if (NotificationManagerCompat.from(context).areNotificationsEnabled()) "granted" else "prompt")
        .put("batteryExemption", if (isIgnoringBatteryOptimizations()) "granted" else "prompt")

    private fun hasAllFilesAccess(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

    private fun isIgnoringBatteryOptimizations(): Boolean {
        val pm = context.getSystemService(PowerManager::class.java) ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    private fun packageUri(): Uri = Uri.parse("package:${context.packageName}")

    private fun launchSettings(call: PluginCall, intents: List<Intent>, callback: String) {
        for (intent in intents) {
            try {
                startActivityForResult(call, intent, callback)
                return
            } catch (e: ActivityNotFoundException) {
                Log.w(TAG, "no activity for ${intent.action}")
            }
        }
        call.reject("This device has no settings screen for this permission", "UNSUPPORTED")
    }

    /** `/storage/emulated/0/QSpace` on a typical phone. */
    private fun defaultRoot(): String = File(Environment.getExternalStorageDirectory(), "QSpace").absolutePath

    private fun defaultName(): String {
        val model = Build.MODEL ?: "Android"
        val maker = Build.MANUFACTURER ?: ""
        return if (maker.isNotEmpty() && !model.startsWith(maker, ignoreCase = true)) {
            "${maker.replaceFirstChar { it.uppercase() }} $model"
        } else {
            model
        }
    }

    private fun requirePath(call: PluginCall): String? {
        val path = call.getString("path")
        if (path.isNullOrBlank()) {
            call.reject("path is required", "INVALID_ARGUMENT")
            return null
        }
        return path
    }

    /** Runs [block] off the main thread; a JSON result resolves the call, null resolves it empty. */
    private fun background(call: PluginCall, block: () -> JSONObject?) {
        io.execute {
            try {
                val result = block()
                if (result == null) call.resolve() else call.resolve(JSObject.fromJSONObject(result))
            } catch (e: QSpaceException) {
                call.reject(e.message, e.code, e)
            } catch (e: Exception) {
                Log.e(TAG, "${call.methodName} failed", e)
                call.reject(e.message ?: e.javaClass.simpleName, "INTERNAL", e)
            }
        }
    }
}
