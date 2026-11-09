package org.snapetech.seerrng
import org.junit.Assert.*
import org.junit.Test
class WebOriginTest {
    @Test fun comparesCompleteOrigins() {
        assertTrue(WebOrigin.same("https://example.test:443/share", "https://example.test"))
        for (url in listOf("http://example.test/share", "https://example.test:444/share", "https://evil.test/share", "https://example.test@evil.test/share")) {
            assertFalse(WebOrigin.same(url, "https://example.test"))
        }
    }
    @Test fun bindsImagesToTheExactShareRouteOnTheConfiguredServer() {
        val server = "https://example.test/seerr"
        assertTrue(WebOrigin.isSharePage("https://example.test/seerr/share?image=native", server))
        for (url in listOf("https://evil.test/share", "https://example.test/share", "https://example.test/other/share", "https://example.test/seerr/%73hare", "https://example.test:444/seerr/share")) assertFalse(WebOrigin.isSharePage(url, server))
    }
}
