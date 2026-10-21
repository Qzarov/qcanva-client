package pro.qzarov.qcanva.qspace

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Brings the storage node back after a reboot or an app update, if the user
 * left it on. Android 15 forbids some foreground service types from
 * BOOT_COMPLETED (dataSync among them), connectedDevice is allowed.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
            else -> return
        }
        if (!AgentHolder.shouldRun(context)) return
        WatchdogWorker.schedule(context)
        try {
            QSpaceAgentService.start(context)
        } catch (e: IllegalStateException) {
            // The watchdog retries every 15 minutes, and opening the app starts it.
            Log.w("QSpaceBootReceiver", "foreground start refused after ${intent.action}", e)
        }
    }
}
