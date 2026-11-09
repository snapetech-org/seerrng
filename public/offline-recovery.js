function recoverPage() {
  // A worker fallback keeps the requested URL. Direct visits to this
  // utility document must leave it instead of reloading it forever.
  if (window.location.pathname === '/offline.html') {
    window.location.replace('/');
  } else {
    window.location.reload();
  }
}

document.querySelector('button').addEventListener('click', recoverPage);
window.addEventListener('online', recoverPage);

// Check if the server is responding and reload the page if it is.
// This handles the case when the device is online, but the server
// is offline or misbehaving.
async function checkNetworkAndReload() {
  try {
    const response = await fetch('.', { cache: 'no-store' });
    // Verify we get a valid response from the server
    if (response.status >= 200 && response.status < 500) {
      recoverPage();
      return;
    }
  } catch {
    // Unable to connect to the server, ignore.
  }
  window.setTimeout(checkNetworkAndReload, 2500);
}

checkNetworkAndReload();
