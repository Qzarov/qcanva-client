package pro.qzarov.qcanva.upload

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Uploads that do not depend on the page: each file is read from its
 * content:// address and streamed to the hub, a few at a time, while
 * [UploadService] keeps the app running. A dropped connection waits for the
 * network and starts the file again, up to [MAX_TRIES]; the hub saying no
 * (too big, no room, a name taken) ends it. Events go to the page through
 * [NativeUploadPlugin]; [snapshot] tells a page that was asleep where things are.
 */
object UploadQueue {
    private const val TAG = "UploadQueue"
    private const val PARALLEL = 3
    private const val MAX_TRIES = 3
    private const val BUFFER = 64 * 1024
    private const val PROGRESS_EVERY_MS = 300L
    // nginx drops an upload after 60 s without bytes. HttpURLConnection's
    // readTimeout does not cover a blocked OutputStream.write(), so interrupt
    // a quiet body before nginx does and let the normal retry loop start over.
    private const val STALL_TIMEOUT_MS = 45_000L
    private const val STALL_CHECK_MS = 1_000L
    private const val NETWORK_WAIT_MS = 10 * 60 * 1000L

    enum class Mode { MULTIPART, RAW }

    class Job(
        val id: String,
        val uri: Uri,
        val name: String,
        val size: Long,
        val url: String,
        val method: String,
        val headers: Map<String, String>,
        val mode: Mode,
        val field: String,
        val contentType: String,
    ) {
        @Volatile var state = "queued"
        @Volatile var loaded = 0L
        @Volatile var status = 0
        @Volatile var body = ""
        @Volatile var message = ""
        @Volatile var cancelled = false
        @Volatile var connection: HttpURLConnection? = null
        @Volatile var lastByteAt = 0L
        @Volatile var stalled = false
    }

    private val jobs = ConcurrentHashMap<String, Job>()
    private val listeners = CopyOnWriteArrayList<(String, JSONObject) -> Unit>()
    private val running = AtomicInteger(0)
    private val pool = Executors.newFixedThreadPool(PARALLEL) { r -> Thread(r, "qcanva-upload") }
    @Volatile private var appContext: Context? = null

    fun addListener(listener: (String, JSONObject) -> Unit) { listeners.add(listener) }
    fun removeListener(listener: (String, JSONObject) -> Unit) { listeners.remove(listener) }

    private fun emit(event: String, data: JSONObject) {
        for (listener in listeners) {
            try { listener(event, data) } catch (e: Exception) { Log.w(TAG, "listener failed", e) }
        }
        UploadService.refresh()
    }

    fun active(): Int = jobs.values.count { it.state == "queued" || it.state == "uploading" }
    fun totals(): Pair<Long, Long> {
        val open = jobs.values.filter { it.state == "queued" || it.state == "uploading" }
        return Pair(open.sumOf { it.loaded }, open.sumOf { maxOf(it.size, 0L) })
    }

    fun enqueue(context: Context, job: Job) {
        appContext = context.applicationContext
        jobs[job.id] = job
        running.incrementAndGet()
        UploadService.start(context)
        pool.execute { run(job) }
    }

    fun cancel(id: String) {
        val job = jobs[id] ?: return
        job.cancelled = true
        try { job.connection?.disconnect() } catch (_: Exception) {}
    }

    /** Every job the page still cares about (finished ones once, then forgotten). */
    fun snapshot(): List<JSONObject> = jobs.values.map { it.toJson() }

    fun forget(id: String) { jobs.remove(id) }

    private fun Job.toJson() = JSONObject()
        .put("id", id)
        .put("state", state)
        .put("loaded", loaded)
        .put("total", size)
        .put("status", status)
        .put("body", body)
        .put("message", message)

    private fun run(job: Job) {
        try {
            for (attempt in 1..MAX_TRIES) {
                if (job.cancelled) return finish(job, "cancelled")
                try {
                    upload(job)
                    return if (job.status in 200..299) finish(job, "done")
                    else finish(job, "error")
                } catch (e: IOException) {
                    if (job.cancelled) return finish(job, "cancelled")
                    Log.w(TAG, "upload ${job.id} try $attempt dropped", e)
                    job.message = e.message ?: "network error"
                    if (attempt == MAX_TRIES) return finish(job, "error")
                    job.loaded = 0
                    progress(job, force = true)
                    if (!waitForNetwork()) return finish(job, "error")
                    Thread.sleep(if (attempt == 1) 1_000L else 3_000L)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "upload ${job.id} failed", e)
            job.message = e.message ?: "upload failed"
            finish(job, if (job.cancelled) "cancelled" else "error")
        } finally {
            if (running.decrementAndGet() <= 0) UploadService.stopWhenIdle()
        }
    }

    private fun finish(job: Job, state: String) {
        job.state = state
        emit("uploadFinished", job.toJson())
    }

    private var lastProgressAt = ConcurrentHashMap<String, Long>()
    private fun progress(job: Job, force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - (lastProgressAt[job.id] ?: 0L) < PROGRESS_EVERY_MS) return
        lastProgressAt[job.id] = now
        emit("uploadProgress", JSONObject().put("id", job.id).put("loaded", job.loaded).put("total", job.size))
    }

    private fun upload(job: Job) {
        val context = appContext ?: throw IOException("no context")
        job.state = "uploading"
        job.loaded = 0
        val boundary = "----qcanva${System.nanoTime()}"
        val head = if (job.mode == Mode.MULTIPART) {
            val safeName = job.name.replace("\"", "%22").replace("\r", "").replace("\n", "")
            ("--$boundary\r\nContent-Disposition: form-data; name=\"${job.field}\"; filename=\"$safeName\"\r\n" +
                "Content-Type: ${job.contentType}\r\n\r\n").toByteArray(Charsets.UTF_8)
        } else ByteArray(0)
        val tail = if (job.mode == Mode.MULTIPART) "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8) else ByteArray(0)

        val connection = (URL(job.url).openConnection() as HttpURLConnection)
        job.connection = connection
        job.stalled = false
        job.lastByteAt = System.currentTimeMillis()
        val watchdog = Thread({
            try {
                while (!Thread.currentThread().isInterrupted) {
                    Thread.sleep(STALL_CHECK_MS)
                    if (job.cancelled || job.state != "uploading") break
                    // Once every body byte is sent, readTimeout governs the
                    // response and the upload watchdog must stay out of it.
                    if (job.size >= 0 && job.loaded >= job.size) break
                    if (System.currentTimeMillis() - job.lastByteAt < STALL_TIMEOUT_MS) continue
                    job.stalled = true
                    try { connection.disconnect() } catch (_: Exception) {}
                    break
                }
            } catch (_: InterruptedException) {
                // Normal cleanup after the request finishes or is retried.
            }
        }, "qcanva-upload-watchdog").apply { isDaemon = true }
        watchdog.start()
        try {
            connection.requestMethod = job.method
            connection.doOutput = true
            connection.connectTimeout = 30_000
            connection.readTimeout = 120_000
            connection.useCaches = false
            for ((key, value) in job.headers) connection.setRequestProperty(key, value)
            connection.setRequestProperty(
                "Content-Type",
                if (job.mode == Mode.MULTIPART) "multipart/form-data; boundary=$boundary" else job.contentType,
            )
            if (job.size >= 0) connection.setFixedLengthStreamingMode(head.size + job.size + tail.size)
            else connection.setChunkedStreamingMode(BUFFER)

            val input: InputStream = context.contentResolver.openInputStream(job.uri) ?: throw IOException("cannot open ${job.uri}")
            input.use { source ->
                connection.outputStream.use { sink: OutputStream ->
                    sink.write(head)
                    val buffer = ByteArray(BUFFER)
                    while (true) {
                        if (job.cancelled) throw IOException("cancelled")
                        if (job.stalled) throw IOException("upload stalled")
                        val read = source.read(buffer)
                        if (read < 0) break
                        sink.write(buffer, 0, read)
                        job.loaded += read
                        job.lastByteAt = System.currentTimeMillis()
                        progress(job)
                    }
                    if (job.stalled) throw IOException("upload stalled")
                    sink.write(tail)
                }
            }
            if (job.stalled) throw IOException("upload stalled")
            progress(job, force = true)
            job.status = connection.responseCode
            val stream = if (job.status >= 400) connection.errorStream else connection.inputStream
            job.body = stream?.bufferedReader()?.use { it.readText() }?.take(64 * 1024) ?: ""
        } finally {
            watchdog.interrupt()
            job.connection = null
            connection.disconnect()
        }
    }

    /** Blocks until the device has a network that reaches the internet, or gives up. */
    private fun waitForNetwork(): Boolean {
        val context = appContext ?: return false
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val deadline = System.currentTimeMillis() + NETWORK_WAIT_MS
        while (System.currentTimeMillis() < deadline) {
            val caps = manager.getNetworkCapabilities(manager.activeNetwork)
            if (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true) return true
            Thread.sleep(2_000L)
        }
        return false
    }
}
