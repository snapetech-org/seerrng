// Saves "Lumen settings for everyone" from the admin page, so nobody has to download
// lumen-config.json and copy it onto the server by hand. Runs inside nginx (njs).
//
// The file goes in /lumen-data, a folder the installer mounts and lets the container write.
// Without that folder the admin page keeps offering the download instead.
//
// Only a SeerrNG admin may save: the person's own SeerrNG session is checked through
// /_lumen_session_check (SeerrNG's /auth/me) before anything is written.
import fs from 'fs';

const DIR = '/lumen-data';
const FILE = DIR + '/lumen-config.json';
const ADMIN = 2; // SeerrNG's Admin permission bit
const MAX_BYTES = 64 * 1024;

// 'ok', 'missing' (no folder mounted) or 'readonly' (mounted, but this container can't write)
function folder() {
  try {
    fs.accessSync(DIR, fs.constants.F_OK);
  } catch (e) {
    return 'missing';
  }
  try {
    fs.accessSync(DIR, fs.constants.W_OK);
    return 'ok';
  } catch (e) {
    return 'readonly';
  }
}

function send(r, status, body) {
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(status, JSON.stringify(body));
}

// A page on another site can't send JSON here without asking first (CORS preflight), which
// nothing here answers, so it can't save with an admin's cookie. (No Origin check: reverse
// proxies often rewrite Host.)
function sameSite(r) {
  const type = (r.headersIn['Content-Type'] || '').toLowerCase();
  return type.split(';')[0].trim() === 'application/json';
}

async function save(r) {
  if (r.method === 'GET') {
    const f = folder();
    send(r, 200, { canSave: f === 'ok', folder: f });
    return;
  }
  if (r.method !== 'PUT') {
    send(r, 405, { message: 'Use PUT.' });
    return;
  }
  if (!sameSite(r)) {
    send(r, 403, { message: 'Send the settings as JSON from Lumen.' });
    return;
  }
  const me = await r.subrequest('/_lumen_session_check', { method: 'GET' });
  if (me.status !== 200) {
    send(r, 401, { message: 'Sign in again.' });
    return;
  }
  let user;
  try {
    user = JSON.parse(me.responseText);
  } catch (e) {
    send(r, 502, { message: 'SeerrNG didn’t say who you are.' });
    return;
  }
  if (!user || ((user.permissions || 0) & ADMIN) === 0) {
    send(r, 403, { message: 'Only admins can change settings for everyone.' });
    return;
  }
  const text = r.requestText || '';
  if (!text || text.length > MAX_BYTES) {
    send(r, 413, { message: 'The settings are empty or too large.' });
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch (e) {
    send(r, 400, { message: 'The settings aren’t valid JSON.' });
    return;
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    send(r, 400, { message: 'The settings must be a JSON object.' });
    return;
  }
  if (folder() !== 'ok') {
    send(r, 409, {
      message:
        'Lumen has no writable /lumen-data folder. Download the file instead.',
    });
    return;
  }
  try {
    // write a copy first, then swap it in, so a reader never sees half a file
    const tmp = FILE + '.saving';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
    fs.renameSync(tmp, FILE);
  } catch (e) {
    send(r, 500, { message: 'Couldn’t write lumen-config.json: ' + e.message });
    return;
  }
  send(r, 200, { saved: true });
}

export default { save };
