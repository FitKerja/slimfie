'use strict';

/**
 * Penghubung ke gateway pembayaran.
 *
 * Kontrak: `tagih({ orderId, jumlah, metode })` HARUS idempoten terhadap orderId —
 * memanggilnya dua kali dengan orderId yang sama mengembalikan transaksi yang sama,
 * bukan menagih dua kali. Gateway sungguhan menyediakan ini:
 *   - Midtrans: `transaction_details.order_id` unik per transaksi.
 *   - Xendit:   header `X-IDEMPOTENCY-KEY` (isi dengan orderId).
 * Kontrak inilah yang membuat pemulihan pesanan yang tertahan di status 'diproses' aman.
 *
 * Galat yang PASTI berarti dana tidak ditarik (mis. kartu ditolak) dilempar sebagai
 * GalatGatewayPasti. Galat lain (timeout, jaringan) dianggap hasilnya tidak diketahui.
 */

const crypto = require('crypto');
const k = require('./konfigurasi');

class GalatGatewayPasti extends Error {}

// Simulasi: hasil disimpan per orderId agar perilakunya sama dengan gateway sungguhan.
const transaksiSimulasi = new Map();

async function tagih({ orderId, jumlah, metode }) {
  if (!k.modeUji) {
    throw new Error('Gateway sungguhan belum disambungkan. Isi lib/gateway.js atau set modeUji: true.');
  }
  await new Promise((r) => setTimeout(r, 800)); // meniru latensi jaringan
  if (!transaksiSimulasi.has(orderId)) {
    transaksiSimulasi.set(orderId, {
      transaksiId: 'SIM-' + crypto.randomUUID(),
      jumlah,
      metode,
      status: 'berhasil',
    });
  }
  return transaksiSimulasi.get(orderId);
}

module.exports = { tagih, GalatGatewayPasti };
