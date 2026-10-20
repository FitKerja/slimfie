'use strict';

/**
 * Server SLIMFie: menyajikan halaman statis dan API login, pesanan, pembayaran, dan jadwal.
 * Jalankan: npm install && npm start  → http://127.0.0.1:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { GalatMasukan, pastikan } = require('./lib/galat');
const auth = require('./lib/auth');
const { buatPesanan, lihatPesanan, bayar } = require('./lib/pesanan');
const jadwal = require('./lib/jadwal');
const dokter = require('./lib/dokter');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const AKAR = __dirname;

// Hanya berkas ini yang boleh disajikan; kode server dan database tidak pernah terbuka.
const HALAMAN = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/mulai.html': 'mulai.html',
  '/pembayaran.html': 'pembayaran.html',
  '/masuk.html': 'masuk.html',
  '/dasbor.html': 'dasbor.html',
  '/dokter.html': 'dokter.html',
};
const FOLDER_ASET = path.join(AKAR, 'assets');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const HEADER_AMAN = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function kirimJson(res, obj, status = 200, header = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...HEADER_AMAN, ...header });
  res.end(JSON.stringify(obj));
}

function sajikanBerkas(res, berkas, cache) {
  fs.stat(berkas, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Berkas tidak ditemukan');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(berkas).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache,
      ...HEADER_AMAN,
    });
    fs.createReadStream(berkas).pipe(res);
  });
}

function bacaJson(req, batas = 256 * 1024) {
  return new Promise((selesai, gagal) => {
    const potongan = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > batas) {
        gagal(new GalatMasukan('Data yang dikirim terlalu besar.', 413));
        req.destroy();
        return;
      }
      potongan.push(c);
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(potongan).toString('utf8') || '{}');
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bukan objek');
        selesai(data);
      } catch (e) {
        gagal(new GalatMasukan('Permintaan bukan JSON yang valid.'));
      }
    });
    req.on('error', gagal);
  });
}

/** order_id boleh dikirim lewat body atau header Idempotency-Key; bila keduanya ada, harus sama. */
function ambilOrderId(req, body) {
  const header = req.headers['idempotency-key'];
  if (header && body.order_id && header !== body.order_id) {
    throw new GalatMasukan('Header Idempotency-Key berbeda dengan order_id.', 422);
  }
  return body.order_id || header;
}

/**
 * Perlindungan CSRF untuk permintaan yang mengubah data: selain cookie SameSite=Lax,
 * body harus JSON (formulir situs lain tidak bisa mengirimnya tanpa izin CORS) dan
 * header Origin, bila ada, harus berasal dari situs ini.
 */
function pastikanAsalSendiri(req) {
  pastikan(/^application\/json\b/i.test(req.headers['content-type'] || ''), 'Permintaan harus berformat JSON.', 415);
  const asal = req.headers.origin;
  if (!asal) return;
  let host = '';
  try {
    host = new URL(asal).host;
  } catch (e) {
    /* Origin rusak diperlakukan sebagai situs lain. */
  }
  pastikan(host === req.headers.host, 'Permintaan dari situs lain ditolak.', 403);
}

function wajibMasuk(req) {
  const pengguna = auth.penggunaDari(req);
  pastikan(pengguna, 'Silakan masuk terlebih dahulu.', 401);
  return pengguna;
}

async function tangani(req, res, url) {
  const { pathname: jalur } = url;
  const metode = req.method;

  if (metode === 'GET' && HALAMAN[jalur]) {
    return sajikanBerkas(res, path.join(AKAR, HALAMAN[jalur]), 'no-cache');
  }

  if (metode === 'GET' && jalur.startsWith('/assets/')) {
    let berkas;
    try {
      berkas = path.resolve(AKAR, '.' + decodeURIComponent(jalur));
    } catch (e) {
      throw new GalatMasukan('Alamat tidak valid.');
    }
    if (!berkas.startsWith(FOLDER_ASET + path.sep)) return res.writeHead(403).end('Terlarang');
    return sajikanBerkas(res, berkas, 'public, max-age=3600');
  }

  if (!jalur.startsWith('/api/')) {
    return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Halaman tidak ditemukan');
  }
  if (metode === 'POST') pastikanAsalSendiri(req);

  /* ---------- login ---------- */
  if (metode === 'POST' && jalur === '/api/masuk/kode') {
    const body = await bacaJson(req, 4 * 1024);
    const hasil = await auth.kirimKode(body.email, req.socket.remoteAddress);
    return kirimJson(res, { ok: true, ...hasil });
  }

  if (metode === 'POST' && jalur === '/api/masuk/verifikasi') {
    const body = await bacaJson(req, 4 * 1024);
    const { token, pengguna } = auth.verifikasi(body.email, body.kode);
    return kirimJson(res, { ok: true, pengguna: auth.publikPengguna(pengguna) }, 200, { 'Set-Cookie': auth.cookieSesi(token) });
  }

  if (metode === 'POST' && jalur === '/api/keluar') {
    auth.keluar(req);
    return kirimJson(res, { ok: true }, 200, { 'Set-Cookie': auth.cookieHapus() });
  }

  if (metode === 'GET' && jalur === '/api/saya') {
    const pengguna = wajibMasuk(req);
    const pesanan = pengguna.peran === 'pasien' ? jadwal.dasborPasien(pengguna) : [];
    return kirimJson(res, { ok: true, pengguna: auth.publikPengguna(pengguna), pesanan });
  }

  /* ---------- pesanan & pembayaran ---------- */
  if (metode === 'POST' && jalur === '/api/pesanan') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req);
    const hasil = buatPesanan(pengguna, ambilOrderId(req, body), body);
    return kirimJson(res, { ok: true, ulang: hasil.ulang, pesanan: hasil.pesanan }, hasil.kode);
  }

  if (metode === 'GET' && jalur === '/api/pesanan') {
    const pengguna = wajibMasuk(req);
    return kirimJson(res, { ok: true, pesanan: lihatPesanan(pengguna, url.searchParams.get('order_id')) });
  }

  if (metode === 'POST' && jalur === '/api/pembayaran') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 4 * 1024);
    const hasil = await bayar(pengguna, ambilOrderId(req, body), body.metode);
    return kirimJson(res, { ok: true, ulang: hasil.ulang, pesanan: hasil.pesanan }, hasil.kode,
      hasil.ulang ? { 'Idempotent-Replayed': 'true' } : {});
  }

  /* ---------- jadwal ---------- */
  if (metode === 'GET' && jalur === '/api/slot') {
    wajibMasuk(req);
    return kirimJson(res, { ok: true, ...jadwal.slotTersedia() });
  }

  if (metode === 'POST' && jalur === '/api/jadwal') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 4 * 1024);
    return kirimJson(res, { ok: true, pesanan: jadwal.pilihJadwal(pengguna, body) }, 201);
  }

  if (metode === 'POST' && jalur === '/api/jadwal/batal') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 4 * 1024);
    return kirimJson(res, { ok: true, pesanan: jadwal.batalkanJadwal(pengguna, body.order_id) });
  }

  /* ---------- dashboard dokter ---------- */
  if (metode === 'GET' && jalur === '/api/dokter') {
    return kirimJson(res, { ok: true, ...dokter.dasborDokter(wajibMasuk(req)) });
  }

  if (metode === 'POST' && jalur === '/api/dokter/setujui') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 4 * 1024);
    return kirimJson(res, { ok: true, jadwal: await dokter.setujui(pengguna, body.id) });
  }

  if (metode === 'POST' && jalur === '/api/dokter/tolak') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 4 * 1024);
    return kirimJson(res, { ok: true, jadwal: dokter.tolak(pengguna, body.id, body.alasan) });
  }

  if (metode === 'POST' && jalur === '/api/dokter/selesai') {
    const pengguna = wajibMasuk(req);
    const body = await bacaJson(req, 16 * 1024);
    return kirimJson(res, { ok: true, jadwal: dokter.selesai(pengguna, body.id, body.catatan) });
  }

  return kirimJson(res, { ok: false, pesan: 'Alamat API tidak dikenal.' }, 404);
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://lokal');
  } catch (e) {
    return res.writeHead(400).end('Permintaan tidak valid');
  }
  tangani(req, res, url).catch((err) => {
    if (err instanceof GalatMasukan) return kirimJson(res, { ok: false, pesan: err.message }, err.kode);
    console.error('Galat server:', err);
    if (!res.headersSent) kirimJson(res, { ok: false, pesan: 'Ada kendala di server. Coba lagi beberapa saat.' }, 500);
    else res.end();
  });
});

// Sesi dan kode masuk yang kedaluwarsa dibersihkan setiap jam.
auth.bersihkan();
setInterval(auth.bersihkan, 3600 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`SLIMFie berjalan di http://${HOST}:${PORT}`);
});
