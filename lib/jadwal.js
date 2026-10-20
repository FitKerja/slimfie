'use strict';

/**
 * Jadwal konsultasi: dipilih pasien setelah pesanan lunas, lalu disetujui dokter.
 *
 * Status jadwal:
 *   menunggu_persetujuan → disetujui → selesai
 *                        ↘ ditolak      (pasien memilih jadwal lain)
 *                        ↘ dibatalkan   (pasien mengganti sebelum disetujui)
 *
 * Index unik di database menjamin satu jam praktik seorang dokter hanya untuk
 * satu pasien aktif, dan satu pesanan hanya punya satu jadwal yang berjalan.
 */

const k = require('./konfigurasi');
const { db } = require('./db');
const { GalatMasukan, pastikan } = require('./galat');
const { pesananMilik, publik, bebaskanKedaluwarsa } = require('./pesanan');

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const STATUS_AKTIF = "('menunggu_persetujuan', 'disetujui', 'selesai')";

const stmt = {
  dokter: db.prepare('SELECT id, kode, nama FROM dokter'),
  terisi: db.prepare(`
    SELECT dokter_id, tanggal, jam FROM jadwal_konsultasi
    WHERE tanggal BETWEEN ? AND ? AND status IN ('menunggu_persetujuan', 'disetujui')
  `),
  berjalan: db.prepare(`
    SELECT j.*, d.kode AS dokter_kode, d.nama AS dokter_nama
    FROM jadwal_konsultasi j JOIN dokter d ON d.id = j.dokter_id
    WHERE j.order_id = ? AND j.status IN ${STATUS_AKTIF}
  `),
  ditolakTerakhir: db.prepare(`
    SELECT j.*, d.kode AS dokter_kode, d.nama AS dokter_nama
    FROM jadwal_konsultasi j JOIN dokter d ON d.id = j.dokter_id
    WHERE j.order_id = ? AND j.status = 'ditolak'
    ORDER BY j.id DESC LIMIT 1
  `),
  tambah: db.prepare('INSERT INTO jadwal_konsultasi (order_id, dokter_id, tanggal, jam) VALUES (?, ?, ?, ?)'),
  batal: db.prepare(`
    UPDATE jadwal_konsultasi SET status = 'dibatalkan', diperbarui = datetime('now')
    WHERE id = ? AND status = 'menunggu_persetujuan'
  `),
  pesananPasien: db.prepare('SELECT * FROM pesanan WHERE pengguna_id = ? ORDER BY id DESC'),
};

/* ---------------- tanggal (selalu WIB) ---------------- */
const SEHARI = 86400 * 1000;

/** Tengah malam UTC dari tanggal hari ini menurut WIB, apa pun zona waktu server. */
function hariIniWib() {
  const b = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date())
    .forEach((p) => { b[p.type] = Number(p.value); });
  return Date.UTC(b.year, b.month - 1, b.day);
}
function isoTanggal(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function hariKe(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}
/** Tanggal hari ini (WIB) dalam bentuk YYYY-MM-DD. */
function isoHariIni() {
  return isoTanggal(hariIniWib());
}
/** Waktu mulai sesi sebagai milidetik UTC (jam praktik ditulis dalam WIB = UTC+7). */
function mulaiSesiMs(tanggal, jam) {
  const [j, m] = jam.split(':').map(Number);
  return Date.parse(tanggal + 'T00:00:00Z') + (j * 60 + m - 7 * 60) * 60 * 1000;
}

/** Jam mulai sesi seorang dokter pada tanggal tertentu. */
function jamDokter(cfg, iso) {
  return (cfg.jadwal[hariKe(iso)] || []).flatMap((sesi) => k.sesiPraktik[sesi] || []);
}

/** Hari praktik yang bisa dipilih: mulai besok (WIB), sebanyak rentangJadwalHari. */
function daftarHari() {
  const hasil = [];
  const awal = hariIniWib();
  for (let i = 1; hasil.length < k.rentangJadwalHari && i < 60; i++) {
    const iso = isoTanggal(awal + i * SEHARI);
    if (k.dokter.some((d) => jamDokter(d, iso).length)) hasil.push(iso);
  }
  return hasil;
}

/** Ringkasan jadwal seorang dokter, mis. "Pagi: Sen, Rab, Jum · Siang: Sel, Kam, Sab". */
function ringkasanJadwal(cfg) {
  return Object.keys(k.sesiPraktik)
    .map((sesi) => {
      const hari = [1, 2, 3, 4, 5, 6, 0].filter((h) => (cfg.jadwal[h] || []).includes(sesi));
      return hari.length ? sesi[0].toUpperCase() + sesi.slice(1) + ': ' + hari.map((h) => HARI_PENDEK[h]).join(', ') : '';
    })
    .filter(Boolean)
    .join(' · ');
}

function dokterDb() {
  return new Map(stmt.dokter.all().map((d) => [d.kode, d]));
}

/* ---------------- slot ---------------- */
/** Slot yang masih kosong untuk semua dokter pada rentang hari yang bisa dipilih. */
function slotTersedia() {
  const hari = daftarHari();
  const dariDb = dokterDb();
  const terisi = new Set(
    hari.length ? stmt.terisi.all(hari[0], hari[hari.length - 1]).map((r) => `${r.dokter_id}|${r.tanggal}|${r.jam}`) : []
  );

  return {
    dokter: k.dokter.map((d) => ({ kode: d.kode, nama: d.nama, ringkasan: ringkasanJadwal(d) })),
    hari: hari.map((tanggal) => {
      const slot = [];
      for (const d of k.dokter) {
        const id = dariDb.get(d.kode).id;
        for (const jam of jamDokter(d, tanggal)) {
          if (!terisi.has(`${id}|${tanggal}|${jam}`)) slot.push({ jam, dokter: d.kode });
        }
      }
      slot.sort((a, b) => a.jam.localeCompare(b.jam));
      return { tanggal, slot };
    }),
  };
}

/* ---------------- dashboard pasien ---------------- */
/**
 * Jadwal untuk pasien. Tautan Meet baru dikirim mulai meetBukaMenit sebelum sesi;
 * sebelum itu pasien hanya menerima waktu tautan akan tampil (meet_buka).
 * Catatan dokter tidak dikirim ke pasien.
 */
function bentukJadwal(j) {
  if (!j) return null;
  let meetLink = null;
  let meetBuka = null;
  if (j.status === 'disetujui' && j.meet_link) {
    const buka = mulaiSesiMs(j.tanggal, j.jam) - k.meetBukaMenit * 60 * 1000;
    if (Date.now() >= buka) meetLink = j.meet_link;
    else meetBuka = new Date(buka).toISOString();
  }
  return {
    status: j.status,
    tanggal: j.tanggal,
    jam: j.jam,
    dokter: { kode: j.dokter_kode, nama: j.dokter_nama },
    alasan_tolak: j.alasan_tolak,
    meet_link: meetLink,
    meet_buka: meetBuka,
  };
}

function itemDasbor(p) {
  const jadwal = stmt.berjalan.get(p.order_id);
  return {
    ...publik(p),
    jadwal: bentukJadwal(jadwal),
    // Penolakan terakhir hanya ditampilkan selama pasien belum memilih jadwal baru.
    ditolak: jadwal ? null : bentukJadwal(stmt.ditolakTerakhir.get(p.order_id)),
  };
}

function dasborPasien(pengguna) {
  bebaskanKedaluwarsa();
  return stmt.pesananPasien.all(pengguna.id).map(itemDasbor);
}

/* ---------------- memilih & membatalkan ---------------- */
function pilihJadwal(pengguna, data) {
  pastikan(data && typeof data === 'object', 'Data tidak terbaca.');
  const tanggal = String(data.tanggal || '');
  const jam = String(data.jam || '');
  const cfg = k.dokter.find((d) => d.kode === data.dokter);
  pastikan(cfg, 'Dokter tidak dikenali.');
  pastikan(daftarHari().includes(tanggal), 'Tanggal konsultasi tidak tersedia.');
  pastikan(jamDokter(cfg, tanggal).includes(jam), `${cfg.nama} tidak berpraktik pada jam tersebut.`);

  return db.transaction(() => {
    const p = pesananMilik(pengguna, data.order_id);
    pastikan(p.status === 'dibayar', 'Jadwal bisa dipilih setelah pembayaran lunas.', 409);
    pastikan(!stmt.berjalan.get(p.order_id), 'Pesanan ini sudah punya jadwal. Batalkan dulu bila ingin menggantinya.', 409);
    try {
      stmt.tambah.run(p.order_id, dokterDb().get(cfg.kode).id, tanggal, jam);
    } catch (e) {
      if (String(e && e.code).startsWith('SQLITE_CONSTRAINT')) {
        throw new GalatMasukan('Jadwal tersebut baru saja diambil pasien lain. Silakan pilih jam lain.', 409);
      }
      throw e;
    }
    return itemDasbor(p);
  }).immediate();
}

/** Pasien membatalkan jadwal yang belum disetujui, lalu bisa memilih lagi. */
function batalkanJadwal(pengguna, orderId) {
  return db.transaction(() => {
    const p = pesananMilik(pengguna, orderId);
    const j = stmt.berjalan.get(p.order_id);
    pastikan(j, 'Pesanan ini belum punya jadwal.', 409);
    pastikan(
      j.status === 'menunggu_persetujuan' && stmt.batal.run(j.id).changes === 1,
      `Jadwal yang sudah disetujui dokter tidak bisa diubah di sini. Hubungi ${k.email}.`,
      409
    );
    return itemDasbor(p);
  }).immediate();
}

module.exports = { slotTersedia, dasborPasien, pilihJadwal, batalkanJadwal, daftarHari, isoHariIni, mulaiSesiMs, ringkasanJadwal };
