package pro.qzarov.qcanva.upload

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import pro.qzarov.qcanva.MainActivity
import pro.qzarov.qcanva.R

/**
 * Keeps uploads going with the app in the background or the screen off: a
 * foreground service (dataSync) with a progress notification, the CPU and
 * Wi-Fi kept awake while any file is on its way. Started with the first
 * upload, gone after the last.
 */
class UploadService : Service() {
    companion object {
        private const val TAG = "UploadService"
        private const val CHANNEL_ID = "qcanva_uploads"
        private const val NOTIFICATION_ID = 4201

        @Volatile private var instance: UploadService? = null
        private val main = Handler(Looper.getMainLooper())

        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, UploadService::class.java))
            } catch (e: Exception) {
                // Android refused a start from the background: the uploads still run while the app is alive.
                Log.w(TAG, "cannot start", e)
            }
        }

        fun refresh() {
            main.post { instance?.updateNotification() }
        }

        fun stopWhenIdle() {
            main.postDelayed({
                val service = instance ?: return@postDelayed
                if (UploadQueue.active() == 0) service.stopSelf()
            }, 1_500L)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var lastUpdate = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        NotificationManagerCompat.from(this).createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(getString(R.string.upload_channel_name))
                .build(),
        )
    }

    @SuppressLint("WakelockTimeout")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground refused", e)
        }
        if (wakeLock == null) {
            wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "qcanva:uploads")
                .apply { setReferenceCounted(false); acquire() }
        }
        if (wifiLock == null) {
            @Suppress("DEPRECATION")
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_HIGH_PERF else WifiManager.WIFI_MODE_FULL
            wifiLock = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .createWifiLock(mode, "qcanva:uploads")
                .apply { setReferenceCounted(false); acquire() }
        }
        if (UploadQueue.active() == 0) stopWhenIdle()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        instance = null
        try { wakeLock?.release() } catch (_: Exception) {}
        try { wifiLock?.release() } catch (_: Exception) {}
        wakeLock = null
        wifiLock = null
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val active = UploadQueue.active()
        val (loaded, total) = UploadQueue.totals()
        val percent = if (total > 0) ((loaded * 100) / total).toInt().coerceIn(0, 100) else 0
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(getString(R.string.upload_notification_title))
            .setContentText(resources.getQuantityString(R.plurals.upload_notification_files, active, active))
            .setProgress(100, percent, total <= 0)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(open)
            .build()
    }

    private fun updateNotification() {
        val now = System.currentTimeMillis()
        if (now - lastUpdate < 700L) return
        lastUpdate = now
        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification())
        } catch (e: SecurityException) {
            // No notification permission: the service runs regardless.
        }
    }
}
