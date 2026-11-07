package org.snapetech.seerrng

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.closeSoftKeyboard
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.RootMatchers.isDialog
import androidx.test.espresso.matcher.ViewMatchers.isDescendantOfA
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.hamcrest.CoreMatchers.allOf
import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.Matcher
import androidx.test.espresso.matcher.ViewMatchers.hasDescendant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class ServerManagementTest {
    private lateinit var scenario: ActivityScenario<MainActivity>

    @Before
    fun startActivity() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("saved_servers", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    @After
    fun closeActivity() {
        scenario.close()
    }

    @Test
    fun launchShowsServerChooserAndSupportsMultipleManualAddresses() {
        onView(withId(R.id.serverUrlInput)).check(matches(isDisplayed()))
        addServer("Home", "requests.home:5055")
        addServer("Remote", "https://requests.example.com/seerrng/")

        onView(rowText(R.id.rowServerName, "Home")).check(matches(isDisplayed()))
        onView(rowText(R.id.rowServerUrl, "Home")).check(matches(withText("https://requests.home:5055")))
        onView(rowText(R.id.rowServerName, "Remote")).check(matches(isDisplayed()))
        onView(rowText(R.id.rowServerUrl, "Remote")).check(matches(withText("https://requests.example.com/seerrng")))
    }

    @Test
    fun laterLaunchesShowTheSavedServerList() {
        addServer("Home", "home.example")
        scenario.close()
        scenario = ActivityScenario.launch(MainActivity::class.java)

        onView(withId(R.id.pickerTitle)).check(matches(isDisplayed()))
        onView(rowText(R.id.rowServerName, "Home")).check(matches(isDisplayed()))
    }

    @Test
    fun editingASavedServerUpdatesItsNameAndAddress() {
        addServer("Home", "home.example")
        onView(
            allOf(
                withId(R.id.rowEdit),
                isDescendantOfA(allOf(withId(R.id.serverRow), hasDescendant(withText("Home")))),
            ),
        ).perform(click())
        onView(withId(R.id.serverNameInput)).perform(replaceText("Office"))
        onView(withId(R.id.serverUrlInput)).perform(replaceText("office.example"), closeSoftKeyboard())
        onView(withId(R.id.saveServerButton)).perform(click())

        val saved = ServerStore(ApplicationProvider.getApplicationContext()).all().single()
        assertEquals("Office", saved.name)
        assertEquals("https://office.example", saved.url)
        onView(rowText(R.id.rowServerName, "Office")).check(matches(isDisplayed()))
    }

    @Test
    fun downloadTargetsStayOnTheSelectedServerAndReverseProxyPath() {
        val address = ParsedServerAddress(
            url = "https://home.example/seerrng",
            host = "home.example",
            port = null,
            isHttps = true,
        )

        scenario.onActivity { activity ->
            assertTrue(
                activity.isSameServerDownload(
                    Uri.parse("https://home.example/seerrng/api/download/42"),
                    address,
                ),
            )
            assertFalse(
                activity.isSameServerDownload(
                    Uri.parse("https://home.example/other/download/42"),
                    address,
                ),
            )
            assertFalse(
                activity.isSameServerDownload(
                    Uri.parse("https://elsewhere.example/seerrng/api/download/42"),
                    address,
                ),
            )
            assertFalse(
                activity.isSameServerDownload(
                    Uri.parse("http://home.example/seerrng/api/download/42"),
                    address,
                ),
            )

            val ipv6Address = address.copy(
                url = "http://[2001:db8::1]:5055/seerrng",
                host = "2001:db8::1",
                port = 5055,
                isHttps = false,
            )
            val ipv6Uri = Uri.parse("http://[2001:db8::1]:5055/seerrng/api/download/42")
            assertTrue(
                "IPv6 URLs must be parsed from the encoded authority on old Android releases",
                activity.isSameServerDownload(
                    ipv6Uri,
                    ipv6Address,
                ),
            )
        }
    }

    @Test
    fun invalidServerAddressIsRejectedBeforeItIsSaved() {
        openAddServerForm()
        onView(withId(R.id.serverUrlInput)).perform(replaceText("javascript:alert(1)"), closeSoftKeyboard())
        onView(withId(R.id.saveServerButton)).perform(click())

        onView(withId(R.id.editorError)).check(matches(isDisplayed()))
        onView(withText(containsString("valid HTTP or HTTPS"))).check(matches(isDisplayed()))
    }

    @Test
    fun httpServerRequiresAnExplicitWarningAcknowledgement() {
        addServer("Home", "http://192.168.1.50:5055")
        onView(
            allOf(
                withId(R.id.rowConnect),
                isDescendantOfA(allOf(withId(R.id.serverRow), androidx.test.espresso.matcher.ViewMatchers.hasDescendant(withText("Home")))),
            ),
        ).perform(click())

        onView(withText(R.string.http_warning_title)).inRoot(isDialog()).check(matches(isDisplayed()))
        onView(withText(R.string.http_warning_message)).inRoot(isDialog()).check(matches(isDisplayed()))
        onView(withText(R.string.cancel)).inRoot(isDialog()).perform(click())
    }

    @Test
    fun acknowledgedHttpConnectionLoadsAReverseProxyPathInTheWebView() {
        LocalHttpServer().use { server ->
            addServer("Local SeerrNG", "http://127.0.0.1:${server.port}/seerrng/")
            onView(
                allOf(
                    withId(R.id.rowConnect),
                    isDescendantOfA(
                        allOf(
                            withId(R.id.serverRow),
                            androidx.test.espresso.matcher.ViewMatchers.hasDescendant(withText("Local SeerrNG")),
                        ),
                    ),
                ),
            ).perform(click())

            onView(withText(R.string.use_http)).inRoot(isDialog()).perform(click())
            onView(withId(R.id.httpBadge)).check(matches(isDisplayed()))

            val pageText = AtomicReference<String?>(null)
            val pageLoaded = CountDownLatch(1)
            scenario.onActivity { activity ->
                val container = activity.findViewById<FrameLayout>(R.id.webViewContainer)
                val view = (0 until container.childCount)
                    .map(container::getChildAt)
                    .filterIsInstance<WebView>()
                    .single()
                val deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(15)
                fun readPage() {
                    if (view.progress == 100 && view.url?.endsWith("/seerrng") == true) {
                        view.evaluateJavascript("document.body.innerText") {
                            pageText.set(it)
                            pageLoaded.countDown()
                        }
                    } else if (SystemClock.uptimeMillis() < deadline) {
                        view.postDelayed(::readPage, 50)
                    } else {
                        pageLoaded.countDown()
                    }
                }
                view.post(::readPage)
            }

            assertTrue("The local SeerrNG page did not finish loading", pageLoaded.await(20, TimeUnit.SECONDS))
            assertTrue("The WebView did not render the local server response: ${pageText.get()}",
                pageText.get()?.contains("SeerrNG Android E2E ready") == true)
            assertEquals("/seerrng", server.requestPath.get())
            scenario.recreate()
            onView(withId(R.id.httpBadge)).check(matches(isDisplayed()))
            scenario.onActivity { activity ->
                val container = activity.findViewById<FrameLayout>(R.id.webViewContainer)
                val restored = (0 until container.childCount).map(container::getChildAt)
                    .filterIsInstance<WebView>().single()
                assertTrue("Activity recreation lost the selected page", restored.url?.endsWith("/seerrng") == true)
                val content = activity.findViewById<View>(android.R.id.content)
                assertTrue("System status bar overlaps app content", content.paddingTop > 0)
            }
            androidx.test.espresso.Espresso.pressBack()
            onView(withId(R.id.pickerTitle)).check(matches(isDisplayed()))
        }
    }

    @Test
    fun removingOneServerLeavesTheOtherSaved() {
        addServer("Home", "home.example")
        addServer("Remote", "remote.example")
        onView(
            allOf(
                withId(R.id.rowRemove),
                isDescendantOfA(allOf(withId(R.id.serverRow), androidx.test.espresso.matcher.ViewMatchers.hasDescendant(withText("Home")))),
            ),
        ).perform(click())
        onView(withText(R.string.remove_server_title)).inRoot(isDialog()).check(matches(isDisplayed()))
        onView(withText(R.string.remove)).inRoot(isDialog()).perform(click())

        onView(rowText(R.id.rowServerName, "Remote")).check(matches(isDisplayed()))
        assertEquals(listOf("Remote"), ServerStore(ApplicationProvider.getApplicationContext()).all().map { it.name })
    }

    private fun addServer(name: String, url: String) {
        openAddServerForm()
        onView(withId(R.id.serverNameInput)).perform(replaceText(name), closeSoftKeyboard())
        onView(withId(R.id.serverUrlInput)).perform(replaceText(url), closeSoftKeyboard())
        onView(withId(R.id.saveServerButton)).perform(click())
    }

    private fun openAddServerForm() {
        if (ServerStore(ApplicationProvider.getApplicationContext()).all().isNotEmpty()) {
            onView(withId(R.id.addServerButton)).perform(click())
        }
    }

    private fun rowText(viewId: Int, serverName: String): Matcher<View> =
        allOf(
            withId(viewId),
            isDescendantOfA(
                allOf(
                    withId(R.id.serverRow),
                    hasDescendant(allOf(withId(R.id.rowServerName), withText(serverName))),
                ),
            ),
        )

    private class LocalHttpServer : AutoCloseable {
        private val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val requestPath = AtomicReference<String?>(null)
        val port: Int = server.localPort

        init {
            Thread {
                try {
                    server.accept().use { socket ->
                        socket.soTimeout = 5_000
                        val reader = socket.getInputStream().bufferedReader(Charsets.US_ASCII)
                        val requestLine = reader.readLine()
                        requestPath.set(requestLine?.split(' ')?.getOrNull(1))
                        while (reader.readLine()?.isNotEmpty() == true) Unit
                        val body = "<!doctype html><html><body>SeerrNG Android E2E ready</body></html>"
                        val response = listOf(
                            "HTTP/1.1 200 OK",
                            "Content-Type: text/html; charset=utf-8",
                            "Content-Length: ${body.toByteArray(Charsets.UTF_8).size}",
                            "Connection: close",
                            "",
                            body,
                        ).joinToString("\r\n") + "\r\n"
                        socket.getOutputStream().write(response.toByteArray(Charsets.UTF_8))
                        socket.getOutputStream().flush()
                    }
                } catch (_: Exception) { }
            }.apply {
                name = "seerrng-android-e2e-http"
                isDaemon = true
                start()
            }
        }

        override fun close() {
            server.close()
        }
    }
}
