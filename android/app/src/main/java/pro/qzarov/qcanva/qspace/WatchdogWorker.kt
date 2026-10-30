package pro.qzarov.qcanva.qspace

import android.content.Context
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Every 15 minutes (the WorkManager minimum) restarts the storage node service
 * if the user left it on and the system or a vendor battery saver killed it.
 * Transfers never run inside the worker itself.
 */
class WatchdogWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    companion object {
        private const val TAG = "QSpaceWatchdog"
        private const val WORK_NAME = "qspace-agent-watchdog"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequest.Builder(WatchdogWorker::class.java, 15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }

    override fun doWork(): Result {
        val context = applicationContext
        if (!AgentHolder.isEnabled(context)) {
            cancel(context)
            return Result.success()
        }
        if (QSpaceAgentService.isAlive || !AgentHolder.shouldRun(context)) return Result.success()
        try {
            QSpaceAgentService.start(context)
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException: Android 12+ refuses
            // background starts unless the app is exempt from battery
            // optimisation. Try again next period.
            Log.w(TAG, "foreground start refused", e)
        }
        return Result.success()
    }
}
