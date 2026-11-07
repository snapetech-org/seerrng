package org.snapetech.seerrng

import android.content.Intent
import android.net.Uri

/** Web content may select a playback URL, never an Android action or payload. */
internal object AppLinkIntent {
    data class Target(val intent: Intent, val fallback: Uri?)

    fun parse(url: String): Target? {
        val parsed = runCatching { Intent.parseUri(url, Intent.URI_INTENT_SCHEME) }.getOrNull()
            ?: return null
        val data = parsed.data ?: return null
        if (data.scheme?.lowercase() !in setOf("plex", "https", "http") ||
            data.host.isNullOrBlank() || data.userInfo != null) return null
        val fallback = parsed.getStringExtra("browser_fallback_url")
            ?.let(Uri::parse)
            ?.takeIf { it.scheme?.lowercase() in setOf("http", "https") &&
                !it.host.isNullOrBlank() && it.userInfo == null }
        val clean = Intent(Intent.ACTION_VIEW, data)
            .addCategory(Intent.CATEGORY_BROWSABLE)
        parsed.`package`?.let { clean.setPackage(it) }
        return Target(clean, fallback)
    }
}
