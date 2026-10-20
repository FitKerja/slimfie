'use strict';

/**
 * Dashboard dokter: meninjau permintaan jadwal, menyetujui (tautan Google Meet dibuat
 * otomatis), menolak dengan alasan, dan menandai konsultasi selesai.
 *
 * Setiap dokter hanya melihat dan mengubah jadwal yang ditujukan kepadanya; jadwal
 * dokter lain dijawab 404. Perubahan status memakai compare-and-set
 * (UPDATE … WHERE status = …) sehingga klik ganda atau pembatalan pasien di saat
 * yang sama tidak menghasilkan status ganda.
 */

const { db } = require('./db');
const meet = require('./meet');
const { pastikan } = require('./galat');
const k = require('./konfigurasi');
const { isoHariIni, mulaiSesiMs, ringkasanJadwal } = require('./jadwal');

const KOLOM = `
  j.*, p.ref, p.nama AS pasien_nama, p.email AS pasien_email, p.telepon AS pasien_telepon, p.evaluasi
  FROM jadwal_konsultasi j JOIN pesanan p ON p.order_id = j.order_id
`;

const stmt = {
  dokterDari: db.prepare('SELECT * FROM dokter WHERE pengguna_id = ?'),
  perStatus: db.prepare(`SELECT ${KOLOM} WHERE j.dokter_id = ? AND j.status = ? ORDER BY j.tanggal, j.jam`),
  riwayat: db.prepare(`
    SELECT ${KOLOM} WHERE j.dokter_id = ? AND j.status IN ('selesai', 'ditolak')
    ORDER BY j.diperbarui DESC LIMIT 30
  `),
  milik: db.prepare(`SELECT ${KOLOM} WHERE j.id = ? AND j.dokter_id = ?`),
  setujui: db.prepare(`
    UPDATE jadwal_konsultasi SET status = 'disetujui', meet_link = ?, diperbarui = datetime('now')
    WHERE id = ? AND status = 'menunggu_persetujuan'
  `),
  tolak: db.prepare(`
    UPDATE jadwal_konsultasi SET status = 'ditolak', alasan_tolak = ?, diperbarui = datetime('now')
    WHERE id = ? AND status = 'menunggu_persetujuan'
  `),
  selesai: db.prepare(`
    UPDATE jadwal_konsultasi SET status = 'selesai', catatan_dokter = ?, diperbarui = datetime('now')
    WHERE id = ? AND status = 'disetujui'
  `),
};

function pastikanDokter(pengguna) {
  pastikan(pengguna, 'Silakan masuk terlebih dahulu.', 401);
  const d = pengguna.peran === 'dokter' ? stmt.dokterDari.get(pengguna.id) : null;
  pastikan(d, 'Halaman ini khusus untuk dokter SLIMFie.', 403);
  return d;
}

function bentuk(j) {
  let evaluasi = null;
  try {
    evaluasi = JSON.parse(j.evaluasi);
  } catch (e) {
    /* evaluasi rusak: tampilkan jadwalnya saja */
  }
  return {
    id: j.id,
    order_id: j.order_id,
    ref: j.ref,
    status: j.status,
    tanggal: j.tanggal,
    jam: j.jam,
    meet_link: j.meet_link,
    alasan_tolak: j.alasan_tolak,
    catatan: j.catatan_dokter,
    diajukan: j.dibuat,
    diperbarui: j.diperbarui,
    pasien: { nama: j.pasien_nama, email: j.pasien_email, telepon: j.pasien_telepon },
    evaluasi,
  };
}

function jadwalMilik(dokter, idMentah) {
  const id = Number(idMentah);
  pastikan(Number.isInteger(id) && id > 0, 'Nomor jadwal tidak valid.');
  const j = stmt.milik.get(id, dokter.id);
  pastikan(j, 'Jadwal tidak ditemukan.', 404);
  return j;
}

function teks(nilai, maks) {
  return String(nilai == null ? '' : nilai).trim().slice(0, maks);
}

/* ---------------- dashboard ---------------- */
function dasborDokter(pengguna) {
  const d = pastikanDokter(pengguna);
  const cfg = k.dokter.find((c) => c.kode === d.kode);
  return {
    dokter: { kode: d.kode, nama: d.nama, ringkasan: cfg ? ringkasanJadwal(cfg) : '' },
    hari_ini: isoHariIni(),
    permintaan: stmt.perStatus.all(d.id, 'menunggu_persetujuan').map(bentuk),
    disetujui: stmt.perStatus.all(d.id, 'disetujui').map(bentuk),
    riwayat: stmt.riwayat.all(d.id).map(bentuk),
  };
}

/* ---------------- tindakan ---------------- */
async function setujui(pengguna, idMentah) {
  const d = pastikanDokter(pengguna);
  const j = jadwalMilik(d, idMentah);
  pastikan(j.status === 'menunggu_persetujuan', 'Permintaan ini sudah diproses atau dibatalkan pasien.', 409);
  pastikan(
    mulaiSesiMs(j.tanggal, j.jam) > Date.now(),
    'Waktu jadwal ini sudah lewat. Tolak permintaan agar pasien memilih jadwal lain.',
    409
  );

  // Tautan dibuat dulu (memanggil Google), baru status dipindah secara atomik.
  const tautan = await meet.buatTautan({ idJadwal: j.id, dokter: d, tanggal: j.tanggal, jam: j.jam });
  pastikan(stmt.setujui.run(tautan, j.id).changes === 1, 'Permintaan ini baru saja dibatalkan pasien atau sudah diproses.', 409);
  return bentuk(stmt.milik.get(j.id, d.id));
}

function tolak(pengguna, idMentah, alasanMentah) {
  const d = pastikanDokter(pengguna);
  const j = jadwalMilik(d, idMentah);
  const alasan = teks(alasanMentah, 300);
  pastikan(alasan.length >= 5, 'Tuliskan alasan penolakan untuk pasien (minimal 5 karakter).');
  pastikan(stmt.tolak.run(alasan, j.id).changes === 1, 'Permintaan ini sudah diproses atau dibatalkan pasien.', 409);
  return bentuk(stmt.milik.get(j.id, d.id));
}

function selesai(pengguna, idMentah, catatanMentah) {
  const d = pastikanDokter(pengguna);
  const j = jadwalMilik(d, idMentah);
  pastikan(mulaiSesiMs(j.tanggal, j.jam) <= Date.now(), 'Konsultasi ini belum dimulai.', 409);
  pastikan(stmt.selesai.run(teks(catatanMentah, 4000) || null, j.id).changes === 1, 'Jadwal ini belum disetujui atau sudah selesai.', 409);
  return bentuk(stmt.milik.get(j.id, d.id));
}

module.exports = { dasborDokter, setujui, tolak, selesai };
