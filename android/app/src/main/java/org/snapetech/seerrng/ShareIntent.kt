package org.snapetech.seerrng

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.util.Base64
import org.json.JSONObject

/** Content handed to SeerrNG from the system Share menu. */
data class SharedContent(
    val title: String?,
    val text: String?,
    val imageUri: Uri?,
    val imageMime: String?,
) {
    val isEmpty: Boolean get() = title.isNullOrBlank() && text.isNullOrBlank() && imageUri == null
}

object ShareIntent {
    const val MAX_TEXT_LENGTH = 4_000
    /** Larger images are rejected; the server enforces its own, stricter limit. */
    const val MAX_IMAGE_BYTES = 12 * 1024 * 1024
    const val SHARE_PATH = "/share"

    fun from(intent: Intent?): SharedContent? {
        if (intent?.action != Intent.ACTION_SEND) return null
        val type = intent.type.orEmpty()
        val isText = type.startsWith("text/")
        val isImage = type.startsWith("image/")
        if (!isText && !isImage) return null

        @Suppress("DEPRECATION")
        val stream = if (isImage) intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) else null
        val content = SharedContent(
            title = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.take(MAX_TEXT_LENGTH),
            text = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(MAX_TEXT_LENGTH),
            imageUri = stream,
            imageMime = if (stream != null) type else null,
        )
        return content.takeUnless { it.isEmpty }
    }

    /** The share page on the connected server, carrying the text part. */
    fun shareUrl(serverUrl: String, content: SharedContent): String {
        val builder = Uri.parse(serverUrl.trimEnd('/') + SHARE_PATH).buildUpon()
        content.title?.takeIf { it.isNotBlank() }?.let { builder.appendQueryParameter("title", it) }
        content.text?.takeIf { it.isNotBlank() }?.let { builder.appendQueryParameter("text", it) }
        if (content.imageUri != null) builder.appendQueryParameter("image", "native")
        return builder.build().toString()
    }

    fun isSharePage(url: String?, serverUrl: String): Boolean = WebOrigin.isSharePage(url, serverUrl)

    fun readImage(resolver: ContentResolver, uri: Uri): ByteArray? = try {
        resolver.openInputStream(uri)?.use { input ->
            val buffer = java.io.ByteArrayOutputStream()
            val chunk = ByteArray(16 * 1024)
            while (true) {
                val read = input.read(chunk)
                if (read < 0) break
                buffer.write(chunk, 0, read)
                if (buffer.size() > MAX_IMAGE_BYTES) return null
            }
            buffer.toByteArray()
        }
    } catch (_: Exception) {
        null
    }

    /** Script that hands the image to the page; the page uploads it itself. */
    fun imageScript(bytes: ByteArray, mime: String): String {
        val payload = JSONObject()
            .put("type", mime)
            .put("name", "shared-image")
            .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        return "window.__seerrngSharedImage = $payload;" +
            "window.dispatchEvent(new Event('seerrng-shared-image'));"
    }
}
