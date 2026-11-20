package pro.qzarov.qcanva.upload

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log

/**
 * The files the user picked in the WebView's file chooser, by the content://
 * address Android gave for each. A web page's File has no path; to upload one
 * natively (streamed from disk, on after the app is left), the page names it
 * by name and size and the address is found here.
 */
object PickedFiles {
    private const val TAG = "PickedFiles"
    private const val KEEP = 500

    data class Picked(val uri: Uri, val name: String, val size: Long)

    private val picked = ArrayDeque<Picked>()

    /** Called with what the chooser returned, before the page gets it. */
    fun record(context: Context, uris: Array<Uri>?) {
        if (uris.isNullOrEmpty()) return
        val resolver = context.contentResolver
        for (uri in uris) {
            var name: String? = null
            var size = -1L
            try {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex >= 0) name = cursor.getString(nameIndex)
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "cannot read $uri", e)
            }
            val displayName = name ?: uri.lastPathSegment ?: continue
            synchronized(picked) {
                picked.addLast(Picked(uri, displayName, size))
                while (picked.size > KEEP) picked.removeFirst()
            }
        }
    }

    /**
     * The address of a picked file by the page's name and size; each picked
     * file once (two equal files picked twice are two entries).
     */
    fun take(name: String, size: Long): Uri? = synchronized(picked) {
        val match = picked.lastOrNull { it.name == name && (size < 0 || it.size < 0 || it.size == size) } ?: return null
        picked.remove(match)
        match.uri
    }
}
