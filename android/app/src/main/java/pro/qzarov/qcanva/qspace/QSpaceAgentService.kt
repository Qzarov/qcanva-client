package pro.qzarov.qcanva.qspace

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import pro.qzarov.qcanva.MainActivity
import pro.qzarov.qcanva.R
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Keeps the storage node running while the phone serves and receives files
 * for the user's other devices. Started by the plugin ("phone as storage"),
 * after boot, and by [WatchdogWorker] if the system killed it.
 */
class QSpaceAgentService : Service() {
    companion object {
        private const val TAG = "QSpaceAgentService"

        /**
         * Foreground service type, kept in one place together with
         * android:foregroundServiceType in AndroidManifest.xml.
         * connectedDevice: the phone talks to the user's own devices over the
         * network; its prerequisite is CHANGE_WIFI_MULTICAST_STATE (mDNS).
         * Fallback if a vendor treats it badly: FOREGROUND_SERVICE_TYPE_SPECIAL_USE
         * plus FOREGROUND_SERVICE_SPECIAL_USE and the subtype property.
         */
        const val FGS_TYPE = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE

        const val ACTION_START = "pro.qzarov.qcanva.qspace.START"
        const val ACTION_STOP = "pro.qzarov.qcanva.qspace.STOP"
        const val ACTION_PAUSE = "pro.qzarov.qcanva.qspace.PAUSE"
        const val ACTION_RESUME = "pro.qzarov.qcanva.qspace.RESUME"

        private const val CHANNEL_ID = "qspace_agent"
        private const val NOTIFICATION_ID = 4101
        private const val NETWORK_DEBOUNCE_MS = 1_000L

        @Volatile
        var isAlive = false
            private set

        /** Throws IllegalStateException (ForegroundServiceStartNotAllowedException) when Android refuses a background start. */
        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, QSpaceAgentService::class.java).setAction(ACTION_START),
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, QSpaceAgentService::class.java))
        }
    }

    private lateinit var worker: ExecutorService
    private val main = Handler(Looper.getMainLooper())
    private var multicastLock: WifiManager.MulticastLock? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastText: String = ""
    private var paused = false

    private val onEvent: (JSONObject) -> Unit = { event ->
        when (event.optString("type")) {
            "cycleFinished", "paused", "resumed", "state", "error", "downloadFinished" ->
                worker.execute { refreshNotification() }
        }
    }

    private val networkChanged = Runnable { worker.execute { AgentHolder.networkChanged() } }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isAlive = true
        worker = Executors.newSingleThreadExecutor { r -> Thread(r, "qspace-service") }
        lastText = getString(R.string.qspace_notification_starting)
        NotificationManagerCompat.from(this).createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(getString(R.string.qspace_channel_name))
                .setDescription(getString(R.string.qspace_channel_description))
                .setShowBadge(false)
                .build(),
        )
        AgentHolder.addListener(onEvent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android requires startForeground soon after startForegroundService,
        // even when we are about to stop again.
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), FGS_TYPE)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground refused", e)
            stopSelf()
            return START_NOT_STICKY
        }

        when (intent?.action) {
            ACTION_STOP -> {
                AgentHolder.setEnabled(this, false)
                WatchdogWorker.cancel(this)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PAUSE -> worker.execute { command { AgentHolder.withNode(this) { it.pause() } } }
            ACTION_RESUME -> worker.execute { command { AgentHolder.withNode(this) { it.resume() } } }
            else -> {
                // ACTION_START, or a null intent when the system restarts us.
                if (!AgentHolder.shouldRun(this)) {
                    Log.i(TAG, "not starting: disabled, unregistered or unavailable")
                    stopSelf()
                    return START_NOT_STICKY
                }
                acquireMulticastLock()
                registerNetworkCallback()
                worker.execute {
                    try {
                        AgentHolder.startNode(this)
                    } catch (e: Exception) {
                        Log.e(TAG, "node failed to start", e)
                    }
                    refreshNotification()
                }
            }
        }
        return START_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        // connectedDevice has no time limit today; if a future Android adds
        // one, stop cleanly instead of being killed with an exception.
        Log.w(TAG, "foreground service timeout for type $fgsType")
        stopSelf()
    }

    override fun onDestroy() {
        isAlive = false
        AgentHolder.removeListener(onEvent)
        main.removeCallbacks(networkChanged)
        unregisterNetworkCallback()
        releaseMulticastLock()
        // Stopping joins the sync thread: not on the main thread.
        worker.execute { AgentHolder.stopNode() }
        worker.shutdown()
        super.onDestroy()
    }

    private fun command(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            Log.w(TAG, "command failed", e)
        }
        refreshNotification()
    }

    /** Runs on [worker]: reading the status touches SQLite. */
    private fun refreshNotification() {
        var text: String
        paused = false
        try {
            val status = if (AgentHolder.isRunning) AgentHolder.withNode(this) { it.status() } else null
            text = when {
                status == null -> AgentHolder.lastError?.let { getString(R.string.qspace_notification_error, it) }
                    ?: getString(R.string.qspace_notification_starting)
                status.optBoolean("paused") -> {
                    paused = true
                    getString(R.string.qspace_notification_paused)
                }
                else -> getString(
                    R.string.qspace_notification_running,
                    status.optLong("synced"),
                    status.optLong("files"),
                )
            }
        } catch (e: Exception) {
            text = getString(R.string.qspace_notification_error, e.message ?: "")
        }
        lastText = text
        // Without POST_NOTIFICATIONS the service still runs; the notification
        // is only hidden from the shade.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val toggle = if (paused) {
            NotificationCompat.Action(0, getString(R.string.qspace_action_resume), serviceIntent(ACTION_RESUME, 2))
        } else {
            NotificationCompat.Action(0, getString(R.string.qspace_action_pause), serviceIntent(ACTION_PAUSE, 1))
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(getString(R.string.qspace_notification_title))
            .setContentText(lastText)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(toggle)
            .addAction(0, getString(R.string.qspace_action_stop), serviceIntent(ACTION_STOP, 3))
            .build()
    }

    private fun serviceIntent(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, QSpaceAgentService::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    private fun acquireMulticastLock() {
        if (multicastLock != null) return
        val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
        // iroh finds the user's devices on the local network over mDNS; without
        // the lock many phones drop multicast packets while the screen is off.
        multicastLock = wifi.createMulticastLock("qspace-mdns").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseMulticastLock() {
        multicastLock?.let { if (it.isHeld) it.release() }
        multicastLock = null
    }

    private fun registerNetworkCallback() {
        if (networkCallback != null) return
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        // Native code does not see Wi-Fi <-> mobile switches; iroh needs to be
        // told so it rebinds sockets and re-probes paths.
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = scheduleNetworkChanged()
            override fun onLost(network: Network) = scheduleNetworkChanged()
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = scheduleNetworkChanged()
        }
        try {
            cm.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (e: RuntimeException) {
            Log.w(TAG, "cannot watch the network", e)
        }
    }

    private fun unregisterNetworkCallback() {
        val callback = networkCallback ?: return
        networkCallback = null
        try {
            getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(callback)
        } catch (e: RuntimeException) {
            Log.w(TAG, "unregisterNetworkCallback failed", e)
        }
    }

    private fun scheduleNetworkChanged() {
        main.removeCallbacks(networkChanged)
        main.postDelayed(networkChanged, NETWORK_DEBOUNCE_MS)
    }
}
