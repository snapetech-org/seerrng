package org.snapetech.seerrng

import android.content.Context
import android.graphics.Bitmap
import android.webkit.WebView
import android.widget.FrameLayout
import android.view.View
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.matcher.RootMatchers.isDialog
import org.hamcrest.Matcher
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Real WebView navigation against loopback fixtures; no external login. */
@RunWith(AndroidJUnit4::class)
class OriginBarTest {
    @Test
    fun actualOriginRemainsVisibleAcrossNavigation() {
        // The visual comparison runner changes this test-only value in the
        // historical checkout, never in the candidate or production app.
        val historicalBaseline = false
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("saved_servers", Context.MODE_PRIVATE).edit().clear().commit()
        FixtureServer(18771, 18772).use { first ->
            FixtureServer(18772, 18772).use {
                ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                    onView(withId(R.id.serverNameInput)).perform(replaceText("Saved server"))
                    onView(withId(R.id.serverUrlInput)).perform(replaceText(first.origin), closeSoftKeyboard())
                    onView(withId(R.id.saveServerButton)).perform(click())
                    onView(withId(R.id.rowConnect)).perform(click())
                    onView(withText(R.string.use_http)).perform(click())
                    waitForPage(scenario, first.origin)
                    onView(withId(R.id.activeServerName)).check(matches(withText(if (historicalBaseline) "Saved server" else first.origin)))
                    onView(withId(R.id.httpBadge)).check(matches(isDisplayed()))
                    screenshot(context, "origin-initial")
                    // A real user gesture opens the native popup. Its toolbar
                    // must identify the loaded origin as well as the main view.
                    onView(isAssignableFrom(WebView::class.java)).perform(click())
                    lateinit var popup: WebView
                    onView(isAssignableFrom(WebView::class.java)).inRoot(isDialog()).perform(object : ViewAction {
                        override fun getDescription() = "Capture the sign-in popup WebView"
                        override fun getConstraints(): Matcher<View> = isAssignableFrom(WebView::class.java)
                        override fun perform(controller: UiController, view: View) { popup = view as WebView }
                    })
                    waitForWebView(popup, first.origin)
                    onView(withText(if (historicalBaseline) context.getString(R.string.app_name) else first.origin))
                        .inRoot(isDialog()).check(matches(isDisplayed()))
                    screenshot(context, "origin-popup")
                    onView(withText(R.string.cancel)).inRoot(isDialog()).perform(click())
                    // Exercise the origin renderer with an actual second-page
                    // load initiated by instrumentation. This does not claim
                    // that user navigation may bypass the cleartext boundary.
                    scenario.onActivity { activity ->
                        webView(activity).loadUrl("http://127.0.0.1:18772/auth")
                    }
                    waitForPage(scenario, "http://127.0.0.1:18772")
                    onView(withId(R.id.activeServerName)).check(matches(withText(if (historicalBaseline) "Saved server" else "http://127.0.0.1:18772")))
                    onView(withId(R.id.httpBadge)).check(matches(isDisplayed()))
                    screenshot(context, "origin-redirect")
                }
            }
        }
    }

    private fun webView(activity: MainActivity): WebView {
        val container = activity.findViewById<FrameLayout>(R.id.webViewContainer)
        return (0 until container.childCount).map(container::getChildAt).filterIsInstance<WebView>().single()
    }

    private fun waitForPage(scenario: ActivityScenario<MainActivity>, origin: String) {
        lateinit var view: WebView
        scenario.onActivity { activity -> view = webView(activity) }
        waitForWebView(view, origin)
    }

    private fun waitForWebView(view: WebView, origin: String) {
        val loaded = CountDownLatch(1)
        view.post {
            val poll = object : Runnable {
                override fun run() {
                    if (view.progress == 100 && view.url?.startsWith(origin) == true) {
                        view.evaluateJavascript("document.body.innerText") { body ->
                            if (body.contains("Origin fixture")) loaded.countDown() else view.postDelayed(this, 50)
                        }
                    } else view.postDelayed(this, 50)
                }
            }
            view.post(poll)
        }
        assertTrue("WebView should finish the loopback navigation", loaded.await(20, TimeUnit.SECONDS))
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
    }

    private fun screenshot(context: Context, name: String) {
        val directory = File(context.getExternalFilesDir(null), "security-visual").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { stream ->
            InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
    }

    private class FixtureServer(port: Int, private val target: Int) : AutoCloseable {
        private val socket = ServerSocket(port, 10, InetAddress.getByName("127.0.0.1"))
        val origin = "http://127.0.0.1:$port"
        init {
            Thread {
                while (!socket.isClosed) {
                    try {
                        socket.accept().use { client ->
                            client.soTimeout = 5000
                            val reader = client.getInputStream().bufferedReader()
                            val path = reader.readLine().orEmpty().split(' ').getOrNull(1)
                            while (!reader.readLine().isNullOrEmpty()) { }
                            val body = "<html><meta name=viewport content='width=device-width'><body style='padding:32px;font:18px sans-serif'><h1>Origin fixture</h1><p>Check the server address above before signing in.</p><a href='/popup' target='_blank' style='position:fixed;inset:45% 0 45%;text-align:center'>Open sign-in window</a></body></html>"
                            val response = if (path == "/redirect") "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:$target/auth\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" else "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n$body"
                            client.getOutputStream().write(response.toByteArray())
                        }
                    } catch (error: java.io.IOException) {
                        if (!socket.isClosed) throw error
                    }
                }
            }.apply { isDaemon = true; start() }
        }
        override fun close() { socket.close() }
    }
}
