'use strict';

/**
 * Pesanan konsultasi & pembayaran idempoten.
 *
 * Tiga lapis pengaman terhadap pemrosesan ganda:
 *   1. Klien  : tombol bayar dinonaktifkan saat diklik; order_id yang sama dipakai ulang saat mencoba lagi.
 *   2. Server : status pesanan dipindah dengan compare-and-set
 *               (UPDATE … WHERE status = 'menunggu_pembayaran'); hanya satu permintaan yang menang.
 *   3. Database: UNIQUE(order_id) di tabel pesanan dan pembayaran.
 *
 * Setiap pesanan milik satu akun pasien. Pesanan milik akun lain diperlakukan
 * seperti tidak ada (404), agar order_id orang lain tidak bisa ditebak-tebak.
 */

const crypto = require('crypto');
const k = require('./konfigurasi');
const { db } = require('./db');
const gateway = require('./gateway');
const { GalatMasukan, pastikan } = require('./galat');

const POLA_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const stmt = {
  cari: db.prepare('SELECT * FROM pesanan WHERE order_id = ?'),
  cariRef: db.prepare('SELECT 1 FROM pesanan WHERE ref = ?'),
  tambah: db.prepare(`
    INSERT INTO pesanan (order_id, ref, pengguna_id, payload_hash, nama, email, telepon, evaluasi, jumlah)
    VALUES (@order_id, @ref, @pengguna_id, @payload_hash, @nama, @email, @telepon, @evaluasi, @jumlah)
  `),
  lengkapiPengguna: db.prepare('UPDATE pengguna SET nama = COALESCE(nama, ?), telepon = COALESCE(telepon, ?) WHERE id = ?'),
  bebaskanKedaluwarsa: db.prepare(`
    UPDATE pesanan SET status = 'dibatalkan', diperbarui = datetime('now')
    WHERE status = 'menunggu_pembayaran' AND dibuat < datetime('now', '-' || ? || ' hours')
  `),

  // Compare-and-set: hanya berhasil (changes = 1) bila status masih sesuai harapan.
  klaim: db.prepare(`
    UPDATE pesanan SET status = 'diproses', metode = ?, diperbarui = datetime('now')
    WHERE order_id = ? AND status = 'menunggu_pembayaran'
  `),
  klaimUlang: db.prepare(`
    UPDATE pesanan SET diperbarui = datetime('now')
    WHERE order_id = ? AND status = 'diproses' AND diperbarui <= datetime('now', '-' || ? || ' seconds')
  `),
  lepas: db.prepare(`
    UPDATE pesanan SET status = 'menunggu_pembayaran', diperbarui = datetime('now')
    WHERE order_id = ? AND status = 'diproses'
  `),
  tandaiDibayar: db.prepare(`
    UPDATE pesanan SET status = 'dibayar', diperbarui = datetime('now')
    WHERE order_id = ? AND status = 'diproses'
  `),

  catatBayar: db.prepare(`
    INSERT INTO pembayaran (order_id, transaksi_id, jumlah, metode, status)
    VALUES (?, ?, ?, ?, 'berhasil')
  `),
  cariBayar: db.prepare('SELECT * FROM pembayaran WHERE order_id = ?'),
};

/* ---------------- utilitas ---------------- */
function bersih(nilai, maks = 200) {
  return String(nilai === undefined || nilai === null ? '' : nilai).trim().slice(0, maks);
}
function angka(nilai) {
  const n = parseFloat(String(nilai).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function kategoriBmi(b) {
  if (b < 18.5) return 'Berat badan kurang (Underweight)';
  if (b < 23) return 'Normal (Ideal)';
  if (b < 25) return 'Kelebihan berat badan (Overweight)';
  if (b < 30) return 'Obesitas Tingkat I';
  if (b < 35) return 'Obesitas Tingkat II';
  return 'Obesitas Ekstrem';
}
function buatRef() {
  const d = new Date();
  const tgl = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  for (let i = 0; i < 10; i++) {
    const ref = `SF-${tgl}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    if (!stmt.cariRef.get(ref)) return ref;
  }
  throw new Error('Gagal membuat nomor referensi.');
}
function galatUnik(e) {
  return String(e && e.code).startsWith('SQLITE_CONSTRAINT');
}

/** Bentuk pesanan yang aman dikirim ke klien (tanpa data klinis). */
function publik(p) {
  const bayar = p.status === 'dibayar' ? stmt.cariBayar.get(p.order_id) : null;
  return {
    order_id: p.order_id,
    ref: p.ref,
    nama: p.nama,
    jumlah: p.jumlah,
    status: p.status,
    metode: p.metode,
    dibuat: p.dibuat,
    pembayaran: bayar ? { transaksi_id: bayar.transaksi_id, metode: bayar.metode, dibayar: bayar.dibuat } : null,
    mode_uji: k.modeUji,
  };
}

function validasiOrderId(orderId) {
  pastikan(POLA_ORDER_ID.test(String(orderId || '')), 'order_id tidak valid (harus UUID v4).');
  return String(orderId);
}

function pastikanPasien(pengguna) {
  pastikan(pengguna, 'Silakan masuk terlebih dahulu.', 401);
  pastikan(pengguna.peran === 'pasien', 'Akun dokter atau admin tidak dapat membuat pesanan konsultasi.', 403);
}

/** Baris pesanan milik pengguna ini; pesanan akun lain dijawab 404. */
function pesananMilik(pengguna, orderIdMentah) {
  pastikanPasien(pengguna);
  const p = stmt.cari.get(validasiOrderId(orderIdMentah));
  pastikan(p && p.pengguna_id === pengguna.id, 'Pesanan tidak ditemukan.', 404);
  return p;
}

/* ---------------- validasi evaluasi ---------------- */
function validasiEvaluasi(data) {
  pastikan(data && typeof data === 'object', 'Data tidak terbaca.');

  const nama = bersih(data.nama, 80);
  const telepon = bersih(data.telepon, 30);
  const provinsi = bersih(data.provinsi, 60);
  const kota = bersih(data.kota, 80);
  const gender = bersih(data.gender, 20);

  pastikan(nama.length >= 3, 'Nama lengkap wajib diisi.');
  const digit = telepon.replace(/[^0-9]/g, '');
  pastikan(digit.length >= 9 && digit.length <= 15, 'Nomor HP tidak valid.');
  pastikan(['Perempuan', 'Laki-laki'].includes(gender), 'Jenis kelamin belum dipilih.');
  pastikan(provinsi.length >= 3, 'Provinsi belum dipilih.');
  pastikan(kota.length >= 2, 'Kota/kabupaten belum diisi.');

  const tinggi = angka(data.tinggi);
  const berat = angka(data.berat);
  const target = angka(data.target);
  pastikan(tinggi >= 120 && tinggi <= 230, 'Tinggi badan di luar rentang yang wajar.');
  pastikan(berat >= 35 && berat <= 300, 'Berat badan di luar rentang yang wajar.');
  pastikan(target > 0 && target < berat, 'Berat target harus lebih rendah dari berat saat ini.');
  pastikan(target / Math.pow(tinggi / 100, 2) >= 18.5, 'Berat target terlalu rendah untuk tinggi badan Anda.');
  const bmi = Math.round((berat / Math.pow(tinggi / 100, 2)) * 10) / 10;

  const daftar = (nilai, maks, batas) => {
    pastikan(Array.isArray(nilai) && nilai.length > 0 && nilai.length <= batas, 'Ada pilihan yang belum diisi.');
    return nilai.map((n) => bersih(n, maks)).filter(Boolean);
  };

  pastikan(data.persetujuan === true, 'Persetujuan penggunaan data belum dicentang.');
  pastikan(data.ketentuan === true, 'Ketentuan layanan belum disetujui.');

  const evaluasi = {
    gender, tinggi, berat, target,
    bmi,
    kategori_bmi: kategoriBmi(bmi),
    provinsi, kota,
    skrining: daftar(data.skrining, 260, 40),
    izin: daftar(data.izin, 260, 30),
    prioritas: daftar(data.prioritas, 160, 12),
    obat: bersih(data.obat, 1200),
    alergi: bersih(data.alergi, 1200),
    suplemen: bersih(data.suplemen, 1200),
  };
  pastikan(evaluasi.obat && evaluasi.alergi, 'Bagian obat dan alergi wajib diisi.');

  return { nama, telepon, evaluasi };
}

/* ---------------- membuat pesanan (idempoten per order_id) ---------------- */
/**
 * Mengirim ulang order_id yang sama dengan data yang sama mengembalikan pesanan yang
 * sudah ada (tidak membuat baris baru). order_id yang sama dengan data berbeda, atau
 * dari akun lain, ditolak 422. Email pesanan selalu email akun yang sedang login.
 */
const buatPesanan = (pengguna, orderIdMentah, data) => {
  pastikanPasien(pengguna);
  const orderId = validasiOrderId(orderIdMentah);
  const nilai = validasiEvaluasi(data);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ pengguna: pengguna.id, ...nilai })).digest('hex');

  return db.transaction(() => {
    const ada = stmt.cari.get(orderId);
    if (ada) {
      pastikan(ada.payload_hash === payloadHash, 'order_id ini sudah dipakai untuk data yang berbeda. Muat ulang halaman untuk membuat pesanan baru.', 422);
      return { kode: 200, ulang: true, pesanan: publik(ada) };
    }

    bebaskanKedaluwarsa();
    try {
      stmt.tambah.run({
        order_id: orderId,
        ref: buatRef(),
        pengguna_id: pengguna.id,
        payload_hash: payloadHash,
        nama: nilai.nama,
        email: pengguna.email,
        telepon: nilai.telepon,
        evaluasi: JSON.stringify(nilai.evaluasi),
        jumlah: k.hargaKonsultasi,
      });
    } catch (e) {
      // Pengaman terakhir dari database: order_id sudah dipakai.
      if (galatUnik(e)) throw new GalatMasukan('Pesanan ini sudah tercatat. Muat ulang halaman.', 409);
      throw e;
    }
    stmt.lengkapiPengguna.run(nilai.nama, nilai.telepon, pengguna.id);
    return { kode: 201, ulang: false, pesanan: publik(stmt.cari.get(orderId)) };
  }).immediate();
};

/** Membatalkan pesanan yang tidak dibayar dalam batasBayarJam. */
function bebaskanKedaluwarsa() {
  stmt.bebaskanKedaluwarsa.run(k.batasBayarJam);
}

function lihatPesanan(pengguna, orderIdMentah) {
  bebaskanKedaluwarsa();
  return publik(pesananMilik(pengguna, orderIdMentah));
}

/* ---------------- pembayaran (idempoten per order_id) ---------------- */
/**
 * Hasil:
 *   200 + ulang:true  → order_id sudah dibayar sebelumnya; hasil lama dikembalikan, tidak ditagih lagi.
 *   201               → pembayaran baru berhasil diproses.
 *   409               → order_id sedang diproses oleh permintaan lain (pemrosesan ganda ditolak).
 */
async function bayar(pengguna, orderIdMentah, metodeMentah) {
  const orderId = pesananMilik(pengguna, orderIdMentah).order_id;
  const metode = bersih(metodeMentah, 30);
  pastikan(Object.prototype.hasOwnProperty.call(k.metodeBayar, metode), 'Metode pembayaran tidak dikenali.');

  // Tahap 1 — klaim pesanan secara atomik. BEGIN IMMEDIATE mengunci tulis sehingga
  // proses lain yang membawa order_id sama menunggu lalu melihat status terbaru.
  const klaim = db.transaction(() => {
    const p = stmt.cari.get(orderId);

    if (p.status === 'dibayar') return { selesai: { kode: 200, ulang: true, pesanan: publik(p) } };
    pastikan(p.status !== 'dibatalkan', 'Pesanan ini sudah dibatalkan karena melewati batas waktu pembayaran.', 409);

    if (p.status === 'diproses') {
      // Hanya diklaim ulang bila permintaan sebelumnya terputus terlalu lama.
      const r = stmt.klaimUlang.run(orderId, k.batasProsesDetik);
      pastikan(r.changes === 1, 'Pembayaran untuk pesanan ini sedang diproses. Tunggu sebentar.', 409);
      return { pesanan: p, metode: p.metode || metode };
    }

    const r = stmt.klaim.run(metode, orderId);
    pastikan(r.changes === 1, 'Pembayaran untuk pesanan ini sedang diproses. Tunggu sebentar.', 409);
    return { pesanan: p, metode };
  }).immediate();

  if (klaim.selesai) return klaim.selesai;

  // Tahap 2 — tagih ke gateway dengan order_id sebagai idempotency key.
  let transaksi;
  try {
    transaksi = await gateway.tagih({ orderId, jumlah: klaim.pesanan.jumlah, metode: klaim.metode });
  } catch (e) {
    if (e instanceof gateway.GalatGatewayPasti) {
      // Dana pasti tidak ditarik: kembalikan status agar pasien bisa mencoba lagi.
      stmt.lepas.run(orderId);
      throw new GalatMasukan(e.message || 'Pembayaran ditolak. Coba metode lain.', 402);
    }
    // Hasil tidak diketahui: status dibiarkan 'diproses'. Percobaan ulang setelah
    // batasProsesDetik memanggil gateway lagi dengan order_id yang sama (aman).
    console.error('Gateway tidak memberi hasil pasti untuk', orderId, e);
    throw new GalatMasukan('Status pembayaran belum dapat dipastikan. Coba lagi dalam 2 menit; Anda tidak akan ditagih dua kali.', 503);
  }

  // Tahap 3 — catat hasil. UNIQUE(order_id) di tabel pembayaran menolak baris kedua.
  db.transaction(() => {
    try {
      stmt.catatBayar.run(orderId, transaksi.transaksiId, klaim.pesanan.jumlah, klaim.metode);
    } catch (e) {
      if (!galatUnik(e)) throw e;
      // Sudah tercatat oleh percobaan sebelumnya: tidak ada yang perlu ditulis lagi.
    }
    stmt.tandaiDibayar.run(orderId);
  }).immediate();

  return { kode: 201, ulang: false, pesanan: publik(stmt.cari.get(orderId)) };
}

module.exports = { buatPesanan, lihatPesanan, bayar, pesananMilik, publik, bebaskanKedaluwarsa };
