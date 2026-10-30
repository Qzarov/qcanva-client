package pro.qzarov.qcanva.qspace

import android.content.Context
import android.util.Log

/**
 * Loads libqspace_ffi.so and gives the Rust side the application context.
 *
 * The class name is part of the JNI symbol exported by qspace-ffi
 * (`Java_pro_qzarov_qcanva_qspace_QSpaceNative_init`): do not rename or move it.
 * iroh's DNS resolver reads the system name servers through this context, so
 * [ensureLoaded] must run before the first register/open.
 */
object QSpaceNative {
    private const val TAG = "QSpaceNative"

    @Volatile
    private var state: Boolean? = null

    /** Returns false if the library is missing (stub build, unsupported ABI). */
    @Synchronized
    fun ensureLoaded(context: Context): Boolean {
        state?.let { return it }
        val ok = try {
            System.loadLibrary("qspace_ffi")
            init(context.applicationContext)
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "libqspace_ffi is not available: ${e.message}")
            false
        }
        state = ok
        return ok
    }

    @JvmStatic
    private external fun init(context: Context)
}
