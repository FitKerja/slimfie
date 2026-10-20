'use strict';

/**
 * Pembuatan tautan Google Meet saat dokter menyetujui jadwal.
 *
 * Selama `meetUji: true`, tautan berformat Meet dibuat secara acak tanpa memanggil
 * Google; tautan itu tidak bisa dipakai rapat. Setelah Google Workspace SLIMFie siap,
 * isi `buatTautan` dengan Google Calendar API:
 *   events.insert pada kalender dokter, conferenceDataVersion=1,
 *   conferenceData.createRequest = { requestId: <idJadwal>, conferenceSolutionKey: { type: 'hangoutsMeet' } }
 * lalu kembalikan event.hangoutLink. requestId yang sama mencegah rapat ganda bila
 * permintaan diulang.
 */

const crypto = require('crypto');
const k = require('./konfigurasi');

const HURUF = 'abcdefghijklmnopqrstuvwxyz';
function acak(n) {
  return Array.from({ length: n }, () => HURUF[crypto.randomInt(HURUF.length)]).join('');
}

/** Mengembalikan URL Google Meet untuk satu jadwal konsultasi. */
async function buatTautan({ idJadwal, dokter, tanggal, jam }) {
  if (k.meetUji) {
    console.log(`[meet uji] Jadwal #${idJadwal} ${dokter.nama} ${tanggal} ${jam} WIB`);
    return `https://meet.google.com/${acak(3)}-${acak(4)}-${acak(3)}`;
  }
  throw new Error('Google Meet belum disambungkan. Isi lib/meet.js atau set meetUji: true.');
}

module.exports = { buatTautan };
