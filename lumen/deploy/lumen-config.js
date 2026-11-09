// Saves "Lumen settings for everyone" from the admin page, so nobody has to download
// lumen-config.json and copy it onto the server by hand. Runs inside nginx (njs).
//
// The file goes in /lumen-data, a folder the installer mounts and lets the container write.
// Without that folder the admin page keeps offering the download instead.
//
// Only a SeerrNG admin may save: the person's own SeerrNG session is checked through
// /_lumen_session_check (SeerrNG's /auth/me) before anything is written.
//
// Admins can also upload the logo and tab icon (branding below). Each upload gets a new file
// name in /lumen-data/branding, served at /branding/, so no browser keeps an old copy.
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

// Is the person sending this a SeerrNG admin? Answers the request itself when not.
async function isAdmin(r) {
  const me = await r.subrequest('/_lumen_session_check', { method: 'GET' });
  if (me.status !== 200) {
    send(r, 401, { message: 'Sign in again.' });
    return false;
  }
  let user;
  try {
    user = JSON.parse(me.responseText);
  } catch (e) {
    send(r, 502, { message: 'SeerrNG didn’t say who you are.' });
    return false;
  }
  if (
    !user ||
    !Number.isSafeInteger(user.permissions) ||
    user.permissions < 0 ||
    (user.permissions & ADMIN) === 0
  ) {
    send(r, 403, { message: 'Only admins can change settings for everyone.' });
    return false;
  }
  return true;
}

async function save(r) {
  if (r.method === 'GET') {
    const f = folder();
    send(r, 200, {
      canSave: f === 'ok',
      folder: f,
      uid: Number(r.variables.lumen_runtime_uid),
      gid: Number(r.variables.lumen_runtime_gid),
    });
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
  if (!(await isAdmin(r))) return;
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

// ---- logo and tab icon uploads: PUT /lumen/branding/logo or /lumen/branding/icon ----
const BRANDING = DIR + '/branding';
const MAX_IMAGE = 2 * 1024 * 1024;
// what the file really is, from its first bytes (the browser's Content-Type is only a hint)
function imageType(b) {
  if (
    b.length > 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'jpg';
  // (njs has no spread syntax: compare byte by byte)
  const at = (i, text) => {
    for (let k = 0; k < text.length; k++)
      if (b[i + k] !== text.charCodeAt(k)) return false;
    return true;
  };
  if (b.length > 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  if (b.length > 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0)
    return 'ico';
  const head = b.toString('utf8', 0, Math.min(b.length, 1024)).trimStart();
  if (
    (head.startsWith('<?xml') || head.startsWith('<svg')) &&
    head.includes('<svg')
  )
    return 'svg';
  return null;
}

async function branding(r) {
  const kind = r.uri.split('/').pop();
  if (kind !== 'logo' && kind !== 'icon') {
    send(r, 404, { message: 'Upload a logo or an icon.' });
    return;
  }
  if (r.method !== 'PUT') {
    send(r, 405, { message: 'Use PUT.' });
    return;
  }
  if (!(await isAdmin(r))) return;
  if (folder() !== 'ok') {
    send(r, 409, {
      message:
        'Lumen has no writable /lumen-data folder, so it can’t keep uploads.',
    });
    return;
  }
  const body = r.requestBuffer;
  if (!body || !body.length || body.length > MAX_IMAGE) {
    send(r, 413, { message: 'Choose an image of up to 2 MB.' });
    return;
  }
  const ext = imageType(body);
  if (!ext) {
    send(r, 415, { message: 'Use a PNG, JPEG, WebP, SVG or ICO image.' });
    return;
  }
  const name =
    kind + '-' + Date.now() + '-' + r.variables.request_id + '.' + ext;
  try {
    try {
      fs.mkdirSync(BRANDING);
    } catch (e) {
      // already there
    }
    const tmp = BRANDING + '/.' + name + '.saving';
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, BRANDING + '/' + name);
    // An upload is not a config commit. Keep earlier images: the saved defaults,
    // a concurrent admin, or a failed config save may still reference them.
  } catch (e) {
    send(r, 500, { message: 'Couldn’t keep the image: ' + e.message });
    return;
  }
  send(r, 200, { url: '/branding/' + name });
}

export default { save, branding };
