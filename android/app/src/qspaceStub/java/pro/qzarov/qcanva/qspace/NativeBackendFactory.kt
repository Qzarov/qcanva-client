package pro.qzarov.qcanva.qspace

/**
 * Compiled when libqspace_ffi.so and its bindings are not bundled (see
 * android/app/build.gradle): the app works, the storage node is unavailable.
 */
object NativeBackendFactory {
    fun create(): QSpaceBackend? = null
}
