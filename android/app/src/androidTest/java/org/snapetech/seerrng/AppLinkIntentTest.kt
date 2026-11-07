package org.snapetech.seerrng

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppLinkIntentTest {
    @Test fun playbackIntentCannotSupplyActionsComponentsFlagsOrExtras() {
        val target = AppLinkIntent.parse("intent://watch/video#Intent;scheme=plex;package=com.plexapp.android;action=android.intent.action.CALL;component=evil.app/.Private;launchFlags=0x10000003;S.payload=unsafe;end")!!
        assertEquals(Intent.ACTION_VIEW, target.intent.action)
        assertEquals("plex://watch/video", target.intent.data.toString())
        assertEquals("com.plexapp.android", target.intent.`package`)
        assertEquals(setOf(Intent.CATEGORY_BROWSABLE), target.intent.categories)
        assertEquals(0, target.intent.flags)
        assertNull(target.intent.component)
        assertNull(target.intent.selector)
        assertNull(target.intent.extras)
    }

    @Test fun rejectsLocalAndExecutableSchemes() {
        for (scheme in listOf("file", "content", "javascript", "data", "android.resource", "intent"))
            assertNull(AppLinkIntent.parse("intent://private/path#Intent;scheme=$scheme;end"))
    }

    @Test fun preservesSafeWebFallbackOutsideTheNativeIntent() {
        val target = AppLinkIntent.parse("intent://watch/video#Intent;scheme=plex;S.browser_fallback_url=https%3A%2F%2Fapp.plex.tv%2Fdesktop;end")!!
        assertEquals("https://app.plex.tv/desktop", target.fallback.toString())
        assertNull(target.intent.extras)
    }

    @Test fun rejectsCredentialBearingTargetsAndFallbacks() {
        assertNull(AppLinkIntent.parse("intent://user:secret@watch/video#Intent;scheme=plex;end"))
        val target = AppLinkIntent.parse("intent://watch/video#Intent;scheme=plex;S.browser_fallback_url=https%3A%2F%2Fuser%3Asecret%40example.test%2F;end")!!
        assertNull(target.fallback)
    }
}
