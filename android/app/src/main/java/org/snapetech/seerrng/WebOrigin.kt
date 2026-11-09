package org.snapetech.seerrng

import java.net.URI

/** Origin comparisons must include scheme and effective port, not only host. */
object WebOrigin {
    fun origin(value: String?): String? = try {
        val uri = URI(value ?: "")
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        if ((scheme != "http" && scheme != "https") || host.isNullOrBlank() || uri.rawUserInfo != null) null
        else "$scheme://$host:${if (uri.port == -1) { if (scheme == "https") 443 else 80 } else uri.port}"
    } catch (_: Exception) { null }

    fun same(left: String?, right: String?): Boolean = origin(left)?.let { it == origin(right) } ?: false

    fun isSharePage(url: String?, serverUrl: String): Boolean = try {
        same(url, serverUrl) && URI(url!!).rawPath.trimEnd('/') == URI(serverUrl).rawPath.trimEnd('/') + "/share"
    } catch (_: Exception) { false }
}
