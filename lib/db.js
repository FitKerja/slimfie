'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const k = require('./konfigurasi');

const folderData = path.join(__dirname, '..', 'data');
fs.mkdirSync(folderData, { recursive: true });

const lokasi = process.env.SLIMFIE_DB || path.join(folderData, 'slimfie.sqlite');

const db = new Database(lokasi);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
// Tunggu kunci tulis dari proses lain alih-alih langsung gagal (SQLITE_BUSY).
db.pragma('busy_timeout = 5000');

// Skema versi 1 menyimpan jadwal di tabel pesanan (jadwal dipilih sebelum bayar).
// Versi itu tidak pernah dipakai dengan data sungguhan, jadi tidak dimigrasi.
const kolomPesanan = db.prepare("SELECT name FROM pragma_table_info('pesanan')").all().map((r) => r.name);
if (kolomPesanan.includes('tanggal')) {
  throw new Error(`Database ${lokasi} memakai skema lama (jadwal dipilih sebelum bayar). Hapus berkas itu lalu jalankan ulang server.`);
}

db.exec(`
  -- Akun pasien, dokter, dan admin. Login memakai kode 6 angka yang dikirim ke email.
  CREATE TABLE IF NOT EXISTS pengguna (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    nama          TEXT,
    telepon       TEXT,
    peran         TEXT NOT NULL DEFAULT 'pasien' CHECK (peran IN ('pasien', 'dokter', 'admin')),
    dibuat        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Kode masuk disimpan sebagai HMAC, tidak pernah dalam bentuk aslinya.
  CREATE TABLE IF NOT EXISTS kode_masuk (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL,
    kode_hash     TEXT NOT NULL,
    percobaan     INTEGER NOT NULL DEFAULT 0,
    dipakai       INTEGER NOT NULL DEFAULT 0,
    kedaluwarsa   TEXT NOT NULL,
    dibuat        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_kode_email ON kode_masuk(email, id);

  -- Sesi login. Yang disimpan hanya hash token; tokennya sendiri ada di cookie HttpOnly.
  CREATE TABLE IF NOT EXISTS sesi (
    token_hash    TEXT PRIMARY KEY,
    pengguna_id   INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
    kedaluwarsa   TEXT NOT NULL,
    dibuat        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dokter (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kode          TEXT NOT NULL UNIQUE,
    nama          TEXT NOT NULL,
    pengguna_id   INTEGER NOT NULL UNIQUE REFERENCES pengguna(id)
  );

  -- Satu baris per permintaan konsultasi. order_id dibuat klien (UUID v4) dan
  -- dipakai sebagai idempotency key, jadi wajib unik.
  CREATE TABLE IF NOT EXISTS pesanan (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL UNIQUE,
    ref           TEXT NOT NULL UNIQUE,
    pengguna_id   INTEGER NOT NULL REFERENCES pengguna(id),
    payload_hash  TEXT NOT NULL,
    nama          TEXT NOT NULL,
    email         TEXT NOT NULL,
    telepon       TEXT NOT NULL,
    evaluasi      TEXT NOT NULL,
    jumlah        INTEGER NOT NULL CHECK (jumlah > 0),
    metode        TEXT,
    status        TEXT NOT NULL DEFAULT 'menunggu_pembayaran'
                  CHECK (status IN ('menunggu_pembayaran', 'diproses', 'dibayar', 'gagal', 'dibatalkan')),
    dibuat        TEXT NOT NULL DEFAULT (datetime('now')),
    diperbarui    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pesanan_pengguna ON pesanan(pengguna_id);

  -- Hasil penagihan. UNIQUE(order_id) adalah pengaman terakhir: walau logika
  -- aplikasi keliru, database menolak pembayaran kedua untuk pesanan yang sama.
  CREATE TABLE IF NOT EXISTS pembayaran (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL UNIQUE REFERENCES pesanan(order_id),
    transaksi_id  TEXT NOT NULL UNIQUE,
    jumlah        INTEGER NOT NULL CHECK (jumlah > 0),
    metode        TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('berhasil')),
    dibuat        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Jadwal konsultasi, dipilih pasien setelah lunas lalu disetujui dokter.
  -- Jadwal yang ditolak atau dibatalkan tetap disimpan sebagai riwayat.
  CREATE TABLE IF NOT EXISTS jadwal_konsultasi (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL REFERENCES pesanan(order_id),
    dokter_id     INTEGER NOT NULL REFERENCES dokter(id),
    tanggal       TEXT NOT NULL,
    jam           TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'menunggu_persetujuan'
                  CHECK (status IN ('menunggu_persetujuan', 'disetujui', 'ditolak', 'dibatalkan', 'selesai')),
    alasan_tolak  TEXT,
    meet_link     TEXT,
    catatan_dokter TEXT,
    dibuat        TEXT NOT NULL DEFAULT (datetime('now')),
    diperbarui    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Satu jam praktik seorang dokter hanya untuk satu pasien aktif.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_jadwal_slot
    ON jadwal_konsultasi(dokter_id, tanggal, jam) WHERE status IN ('menunggu_persetujuan', 'disetujui');

  -- Satu pesanan hanya punya satu jadwal yang berjalan.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_jadwal_pesanan
    ON jadwal_konsultasi(order_id) WHERE status IN ('menunggu_persetujuan', 'disetujui', 'selesai');
`);

// Kolom yang ditambahkan setelah Tahap 1; database lama dilengkapi tanpa kehilangan data.
const kolomJadwal = db.prepare("SELECT name FROM pragma_table_info('jadwal_konsultasi')").all().map((r) => r.name);
if (!kolomJadwal.includes('catatan_dokter')) db.exec('ALTER TABLE jadwal_konsultasi ADD COLUMN catatan_dokter TEXT');

// Akun dokter dan admin mengikuti konfigurasi setiap kali server dinyalakan.
const isiAkun = db.transaction(() => {
  const simpanPengguna = db.prepare(`
    INSERT INTO pengguna (email, nama, peran) VALUES (@email, @nama, @peran)
    ON CONFLICT(email) DO UPDATE SET nama = excluded.nama, peran = excluded.peran
    RETURNING id
  `);
  const simpanDokter = db.prepare(`
    INSERT INTO dokter (kode, nama, pengguna_id) VALUES (@kode, @nama, @pengguna_id)
    ON CONFLICT(kode) DO UPDATE SET nama = excluded.nama, pengguna_id = excluded.pengguna_id
  `);
  for (const email of k.admin) {
    simpanPengguna.get({ email: email.toLowerCase(), nama: 'Admin SLIMFie', peran: 'admin' });
  }
  for (const d of k.dokter) {
    const { id } = simpanPengguna.get({ email: d.email.toLowerCase(), nama: d.nama, peran: 'dokter' });
    simpanDokter.run({ kode: d.kode, nama: d.nama, pengguna_id: id });
  }
});
isiAkun.immediate();

module.exports = { db, lokasi };
