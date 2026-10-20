'use strict';

/**
 * Pengiriman email SLIMFie.
 *
 * Selama `emailUji: true`, email tidak dikirim. Isinya dicetak di konsol server, dan
 * kode masuk ikut dikembalikan ke halaman agar alur bisa dicoba tanpa kotak masuk.
 * Setelah Google Workspace SLIMFie siap, sambungkan pengiriman sungguhan di sini
 * (mis. SMTP smtp.gmail.com dengan akun no-reply@slimfie.com) lalu set emailUji: false.
 */

const k = require('./konfigurasi');

async function kirimKodeMasuk(alamat, kode) {
  if (k.emailUji) {
    console.log(`[email uji] Kode masuk untuk ${alamat}: ${kode}`);
    return;
  }
  throw new Error('Pengiriman email belum disambungkan. Isi lib/email.js atau set emailUji: true.');
}

module.exports = { kirimKodeMasuk };
