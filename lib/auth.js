'use strict';

/**
 * Login tanpa kata sandi: kode 6 angka dikirim ke email, lalu ditukar dengan sesi.
 *
 *   - Kode disimpan sebagai HMAC, berlaku `kodeBerlakuMenit`, dan hangus setelah
 *     `kodeMaksPercobaan` kali salah. Hanya kode terbaru yang berlaku.
 *   - Permintaan kode dibatasi per email (jeda + kuota per jam) dan per alamat IP.
 *   - Token sesi acak 256 bit, dikirim sebagai cookie HttpOnly + SameSite=Lax.
 *     Database hanya menyimpan hash-nya.
 *   - Email yang belum terdaftar otomatis menjadi akun pasien setelah kodenya benar.
 */

const crypto = require('crypto');
const k = require('./konfigurasi');
const { db } = require('./db');
const email = require('./email');
const { GalatMasukan, pastikan } = require('./galat');

const NAMA_COOKIE = 'slimfie_sesi';
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Kunci HMAC kode masuk. Tanpa SLIMFIE_RAHASIA, kunci dibuat ulang setiap server
// dinyalakan; akibatnya hanya kode yang sedang berjalan yang hangus.
const RAHASIA = process.env.SLIMFIE_RAHASIA || crypto.randomBytes(32).toString('hex');

const stmt = {
  cariPengguna: db.prepare('SELECT * FROM pengguna WHERE email = ?'),
  tambahPasien: db.prepare("INSERT INTO pengguna (email, peran) VALUES (?, 'pasien') RETURNING *"),
  kodeTerakhir: db.prepare(`
    SELECT strftime('%s', 'now') - strftime('%s', dibuat) AS umur
    FROM kode_masuk WHERE email = ? ORDER BY id DESC LIMIT 1
  `),
  jumlahKodeSejam: db.prepare("SELECT COUNT(*) AS n FROM kode_masuk WHERE email = ? AND dibuat > datetime('now', '-1 hour')"),
  tambahKode: db.prepare("INSERT INTO kode_masuk (email, kode_hash, kedaluwarsa) VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))"),
  kodeAktif: db.prepare(`
    SELECT * FROM kode_masuk
    WHERE email = ? AND dipakai = 0 AND kedaluwarsa > datetime('now')
    ORDER BY id DESC LIMIT 1
  `),
  tambahPercobaan: db.prepare('UPDATE kode_masuk SET percobaan = percobaan + 1 WHERE id = ?'),
  pakaiKode: db.prepare('UPDATE kode_masuk SET dipakai = 1 WHERE id = ? AND dipakai = 0'),
  tambahSesi: db.prepare("INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa) VALUES (?, ?, datetime('now', '+' || ? || ' days'))"),
  cariSesi: db.prepare(`
    SELECT p.* FROM sesi s JOIN pengguna p ON p.id = s.pengguna_id
    WHERE s.token_hash = ? AND s.kedaluwarsa > datetime('now')
  `),
  hapusSesi: db.prepare('DELETE FROM sesi WHERE token_hash = ?'),
  bersihkanSesi: db.prepare("DELETE FROM sesi WHERE kedaluwarsa <= datetime('now')"),
  bersihkanKode: db.prepare("DELETE FROM kode_masuk WHERE kedaluwarsa <= datetime('now', '-1 day')"),
};

/* ---------------- utilitas ---------------- */
function sha256(teks) {
  return crypto.createHash('sha256').update(teks).digest('hex');
}
function hashKode(alamat, kode) {
  return crypto.createHmac('sha256', RAHASIA).update(alamat + ':' + kode).digest('hex');
}
function normalEmail(nilai) {
  const alamat = String(nilai || '').trim().toLowerCase().slice(0, 120);
  pastikan(POLA_EMAIL.test(alamat), 'Masukkan alamat email yang valid.');
  return alamat;
}

// Batas permintaan kode per IP, disimpan di memori (cukup untuk satu proses server).
const permintaanIp = new Map();
function batasIp(ip) {
  const kini = Date.now();
  const jejak = (permintaanIp.get(ip) || []).filter((t) => kini - t < 3600 * 1000);
  pastikan(jejak.length < k.kodeMaksPerJamPerIp, 'Terlalu banyak permintaan kode dari jaringan ini. Coba lagi nanti.', 429);
  jejak.push(kini);
  permintaanIp.set(ip, jejak);
}

/* ---------------- kode masuk ---------------- */
async function kirimKode(emailMentah, ip) {
  const alamat = normalEmail(emailMentah);

  const terakhir = stmt.kodeTerakhir.get(alamat);
  if (terakhir && terakhir.umur < k.kodeJedaDetik) {
    throw new GalatMasukan(`Kode baru saja dikirim. Tunggu ${k.kodeJedaDetik - terakhir.umur} detik sebelum meminta lagi.`, 429);
  }
  pastikan(stmt.jumlahKodeSejam.get(alamat).n < k.kodeMaksPerJam, 'Terlalu banyak permintaan kode untuk email ini. Coba lagi dalam 1 jam.', 429);
  batasIp(ip || 'tanpa-ip');

  const kode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  stmt.tambahKode.run(alamat, hashKode(alamat, kode), k.kodeBerlakuMenit);
  await email.kirimKodeMasuk(alamat, kode);

  return { email: alamat, berlaku_menit: k.kodeBerlakuMenit, kode_uji: k.emailUji ? kode : undefined };
}

/** Menukar kode yang benar dengan sesi baru. Mengembalikan { token, pengguna }. */
function verifikasi(emailMentah, kodeMentah) {
  const alamat = normalEmail(emailMentah);
  const kode = String(kodeMentah || '').replace(/\D/g, '');
  pastikan(kode.length === 6, 'Kode harus 6 angka.');

  // Hasil dikembalikan, bukan dilempar, agar penambahan hitungan percobaan ikut tersimpan.
  const hasil = db.transaction(() => {
    const baris = stmt.kodeAktif.get(alamat);
    if (!baris) return { galat: 'Kode sudah tidak berlaku atau belum diminta. Minta kode baru.' };
    if (baris.percobaan >= k.kodeMaksPercobaan) return { galat: 'Terlalu banyak percobaan. Minta kode baru.', kode: 429 };

    const cocok = crypto.timingSafeEqual(Buffer.from(baris.kode_hash, 'hex'), Buffer.from(hashKode(alamat, kode), 'hex'));
    if (!cocok) {
      stmt.tambahPercobaan.run(baris.id);
      const sisa = k.kodeMaksPercobaan - baris.percobaan - 1;
      return { galat: sisa > 0 ? `Kode salah. Sisa ${sisa} kali percobaan.` : 'Kode salah. Minta kode baru.' };
    }
    if (stmt.pakaiKode.run(baris.id).changes !== 1) return { galat: 'Kode sudah dipakai. Minta kode baru.' };

    const pengguna = stmt.cariPengguna.get(alamat) || stmt.tambahPasien.get(alamat);
    const token = crypto.randomBytes(32).toString('base64url');
    stmt.tambahSesi.run(sha256(token), pengguna.id, k.sesiHari);
    return { token, pengguna };
  }).immediate();

  if (hasil.galat) throw new GalatMasukan(hasil.galat, hasil.kode || 400);
  return hasil;
}

/* ---------------- sesi ---------------- */
function tokenDari(req) {
  const cookie = req.headers.cookie || '';
  for (const bagian of cookie.split(';')) {
    const [nama, ...isi] = bagian.trim().split('=');
    if (nama === NAMA_COOKIE) return isi.join('=');
  }
  return '';
}

/** Pengguna yang sedang login, atau null. */
function penggunaDari(req) {
  const token = tokenDari(req);
  return token ? stmt.cariSesi.get(sha256(token)) || null : null;
}

function keluar(req) {
  const token = tokenDari(req);
  if (token) stmt.hapusSesi.run(sha256(token));
}

function cookieSesi(token) {
  const atribut = [`${NAMA_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${k.sesiHari * 86400}`];
  if (k.cookieAman) atribut.push('Secure');
  return atribut.join('; ');
}
function cookieHapus() {
  return `${NAMA_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${k.cookieAman ? '; Secure' : ''}`;
}

function publikPengguna(p) {
  return { email: p.email, nama: p.nama, peran: p.peran };
}

function bersihkan() {
  stmt.bersihkanSesi.run();
  stmt.bersihkanKode.run();
}

module.exports = { kirimKode, verifikasi, penggunaDari, keluar, cookieSesi, cookieHapus, publikPengguna, bersihkan };
