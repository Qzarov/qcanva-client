package pro.qzarov.qcanva.qspace

import org.json.JSONArray
import org.json.JSONObject
import uniffi.qspace_ffi.CycleSummary
import uniffi.qspace_ffi.NodeEvent
import uniffi.qspace_ffi.NodeException
import uniffi.qspace_ffi.NodeListener
import uniffi.qspace_ffi.NodeStatus
import uniffi.qspace_ffi.PolicyInfo
import uniffi.qspace_ffi.QSpaceNode
import uniffi.qspace_ffi.StorageMode

/** Compiled only when the native part is bundled (see android/app/build.gradle). */
object NativeBackendFactory {
    fun create(): QSpaceBackend? = NativeBackend
}

private object NativeBackend : QSpaceBackend {
    override fun register(
        hubUrl: String,
        userToken: String,
        root: String,
        name: String,
        kind: String,
        configDir: String,
    ): JSONObject = mapErrors {
        val info = uniffi.qspace_ffi.register(hubUrl, userToken, root, name, kind, configDir)
        // The device token stays in device.json (written by Rust); it never
        // goes to the WebView.
        JSONObject()
            .put("nodeId", info.nodeId)
            .put("name", info.name)
            .put("root", info.root)
            .put("hubUrl", info.hubUrl)
    }

    override fun open(configDir: String): QSpaceNodeHandle =
        mapErrors { NativeNode(QSpaceNode.open(configDir)) }
}

private class NativeNode(private val node: QSpaceNode) : QSpaceNodeHandle {
    override fun start(onEvent: (JSONObject) -> Unit) = mapErrors {
        node.start(object : NodeListener {
            override fun onEvent(event: NodeEvent) {
                // Called on a Rust thread, sometimes with a Rust lock held:
                // the callee must only hand the event over, never call back.
                onEvent(event.toJson())
            }
        })
    }

    override fun stop() = mapErrors { node.stop() }
    override fun status(): JSONObject = mapErrors { node.status().toJson() }
    override fun syncNow() = mapErrors { node.syncNow() }
    override fun pause() = mapErrors { node.pause() }
    override fun resume(): Boolean = mapErrors { node.resume() }

    override fun fetch(path: String): JSONObject = mapErrors {
        val r = node.fetch(path)
        JSONObject()
            .put("path", r.path)
            .put("queuedFiles", r.queuedFiles.toLong())
            .put("queuedBytes", r.queuedBytes.toLong())
    }

    override fun evict(path: String): JSONArray = mapErrors {
        JSONArray().apply {
            node.evict(path).forEach {
                put(
                    JSONObject()
                        .put("path", it.path)
                        .put("success", it.success)
                        .put("bytes", it.bytes.toLong())
                        .put("error", it.error ?: JSONObject.NULL),
                )
            }
        }
    }

    override fun policy(): JSONObject = mapErrors { node.policy().toJson() }

    override fun setMode(folderPath: String, mode: String): JSONObject = mapErrors {
        node.setMode(folderPath, parseMode(mode)).toJson()
    }

    override fun networkChanged() = mapErrors { node.networkChanged() }

    override fun close() = node.close()
}

private fun parseMode(mode: String): StorageMode = when (mode) {
    "full" -> StorageMode.FULL
    "on_demand" -> StorageMode.ON_DEMAND
    "none" -> StorageMode.NONE
    else -> throw QSpaceException("INVALID_ARGUMENT", "mode must be full, on_demand or none")
}

private fun StorageMode.wire(): String = when (this) {
    StorageMode.FULL -> "full"
    StorageMode.ON_DEMAND -> "on_demand"
    StorageMode.NONE -> "none"
}

private fun PolicyInfo.toJson(): JSONObject = JSONObject()
    .put("defaultMode", defaultMode.wire())
    .put(
        "rules",
        JSONArray().apply {
            rules.forEach {
                put(
                    JSONObject()
                        .put("folderId", it.folderId ?: JSONObject.NULL)
                        .put("path", it.path)
                        .put("mode", it.mode.wire()),
                )
            }
        },
    )

private fun NodeStatus.toJson(): JSONObject = JSONObject()
    .put("root", root)
    .put("deviceName", deviceName)
    .put("nodeId", nodeId)
    .put("paused", paused)
    .put("pauseReason", pauseReason ?: JSONObject.NULL)
    .put("runningCycle", runningCycle)
    .put("lastCycleAt", lastCycleAt)
    .put("files", files.toLong())
    .put("synced", synced.toLong())
    .put("remote", remote.toLong())
    .put("pending", pending.toLong())
    .put("failedOps", failedOps.toLong())
    .put("waitingBytes", waitingBytes)
    .put("materializedFiles", materializedFiles.toLong())
    .put("materializedBytes", materializedBytes.toLong())
    .put("remoteOnlyFiles", remoteOnlyFiles.toLong())
    .put("remoteOnlyBytes", remoteOnlyBytes.toLong())
    .put("downloadQueueLen", downloadQueueLen.toLong())
    .put("downloadBytesDone", downloadBytesDone.toLong())
    .put("downloadBytesTotal", downloadBytesTotal.toLong())
    .put("downloadCurrentFiles", JSONArray(downloadCurrentFiles))
    .put("text", text)

private fun CycleSummary.toJson(): JSONObject = JSONObject()
    .put("at", at.toLong())
    .put("pulled", pulled.toLong())
    .put("planned", planned.toLong())
    .put("applied", applied.toLong())
    .put("failed", failed.toLong())
    .put("blocked", blocked.toLong())
    .put("offline", offline)
    .put("paused", paused ?: JSONObject.NULL)

private fun NodeEvent.toJson(): JSONObject = when (this) {
    is NodeEvent.CycleFinished -> JSONObject().put("type", "cycleFinished").put("summary", summary.toJson())
    is NodeEvent.Paused -> JSONObject().put("type", "paused").put("reason", reason ?: JSONObject.NULL)
    is NodeEvent.Resumed -> JSONObject().put("type", "resumed")
    is NodeEvent.DownloadProgress -> JSONObject()
        .put("type", "downloadProgress")
        .put("hash", hash)
        .put("doneBytes", doneBytes.toLong())
        .put("totalBytes", totalBytes.toLong())
    is NodeEvent.DownloadFinished -> JSONObject()
        .put("type", "downloadFinished")
        .put("hash", hash)
        .put("success", success)
        .put("error", error ?: JSONObject.NULL)
    is NodeEvent.Error -> JSONObject().put("type", "error").put("message", message)
}

private inline fun <T> mapErrors(block: () -> T): T = try {
    block()
} catch (e: NodeException) {
    // The variant name (Unauthorized, HubUnavailable, PathNotFound, ...) is
    // the code the WebView switches on.
    throw QSpaceException(e.javaClass.simpleName, e.message ?: e.javaClass.simpleName, e)
}
