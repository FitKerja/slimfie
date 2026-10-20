'use strict';

/**
 * Konfigurasi server SLIMFie.
 * Nilai bertanda GANTI adalah contoh — perbarui sebelum menerima pembayaran sungguhan.
 */
module.exports = {
  merek: 'SLIMFie',
  email: 'cs@slimfie.com',

  // Nominal selalu ditentukan server, tidak pernah diambil dari permintaan klien.
  hargaKonsultasi: 199000,

  // Mode uji: gateway pembayaran disimulasikan, tidak ada dana yang ditarik.
  // GANTI menjadi false setelah gateway sungguhan (Midtrans/Xendit/dll.) disambungkan di lib/gateway.js.
  modeUji: true,

  metodeBayar: {
    qris: 'QRIS',
    va_bca: 'Virtual Account BCA',
    va_mandiri: 'Virtual Account Mandiri',
    va_bni: 'Virtual Account BNI',
  },

  // Pesanan yang tertahan di status 'diproses' lebih lama dari ini dianggap
  // terputus (server mati di tengah jalan) dan boleh diklaim ulang. Aman karena
  // gateway dipanggil dengan order_id yang sama sebagai idempotency key.
  batasProsesDetik: 120,

  // Pesanan yang belum dibayar setelah sekian jam dibatalkan.
  batasBayarJam: 24,

  // Sesi konsultasi 20 menit. Isinya jam mulai sesi (WIB).
  sesiPraktik: {
    pagi: ['08:00', '08:20', '08:40', '09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00'],
    siang: ['13:30', '13:50', '14:10', '14:30', '14:50', '15:10', '15:30', '15:50', '16:10', '16:30', '16:50', '17:10'],
  },

  // Dua dokter Sp.GK dengan jadwal saling mengisi: setiap hari praktik, satu dokter
  // bertugas pagi dan yang lain siang. Kunci jadwal: 1 = Senin … 6 = Sabtu.
  // GANTI nama dan email setelah data dokter tersedia (email dipakai untuk login dokter).
  dokter: [
    {
      kode: 'spgk1',
      nama: 'Dokter Sp.GK 1',
      email: 'dokter1@slimfie.com',
      jadwal: { 1: ['pagi'], 2: ['siang'], 3: ['pagi'], 4: ['siang'], 5: ['pagi'], 6: ['siang'] },
    },
    {
      kode: 'spgk2',
      nama: 'Dokter Sp.GK 2',
      email: 'dokter2@slimfie.com',
      jadwal: { 1: ['siang'], 2: ['pagi'], 3: ['siang'], 4: ['pagi'], 5: ['siang'], 6: ['pagi'] },
    },
  ],

  // GANTI dengan email admin SLIMFie.
  admin: ['admin@slimfie.com'],

  // Jumlah hari praktik ke depan yang bisa dipilih pasien (mulai besok, WIB).
  rentangJadwalHari: 14,

  // Google Meet. meetUji: tautan contoh dibuat tanpa memanggil Google (tidak bisa dipakai rapat).
  // GANTI menjadi false setelah Google Workspace SLIMFie disambungkan di lib/meet.js.
  meetUji: true,
  // Tautan Meet tampil di dashboard pasien mulai sekian menit sebelum jadwal.
  meetBukaMenit: 15,

  // Login dengan kode 6 angka lewat email.
  // emailUji: kode tidak dikirim, tetapi dicetak di konsol server dan ditampilkan di layar.
  // GANTI menjadi false setelah pengiriman email (Google Workspace) disambungkan di lib/email.js.
  emailUji: true,
  kodeBerlakuMenit: 10,
  kodeMaksPercobaan: 5,
  kodeJedaDetik: 60,
  kodeMaksPerJam: 5,
  kodeMaksPerJamPerIp: 20,
  sesiHari: 30,

  // Cookie login hanya dikirim lewat HTTPS. Wajib saat live.
  cookieAman: process.env.NODE_ENV === 'production',
};
