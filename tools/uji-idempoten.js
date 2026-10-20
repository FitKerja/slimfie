'use strict';

/**
 * Uji alur SLIMFie: login kode email, pesanan & pembayaran idempoten, pemilihan jadwal,
 * dan dashboard dokter (setujui, tolak, tautan Meet, selesai).
 * Jalankan server dulu (npm start), lalu di terminal lain:
 *   npm run uji:idempoten
 * Variabel opsional: BASE_URL (bawaan http://127.0.0.1:3000), SLIMFIE_DB (lokasi database server).
 * Server harus berjalan dengan emailUji: true agar kode masuk bisa dibaca dari jawaban API.
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const LOKASI_DB = process.env.SLIMFIE_DB || path.join(__dirname, '..', 'data', 'slimfie.sqlite');
const PARALEL = 10;

let lulus = 0;
async function cek(nama, fn) {
  await fn();
  lulus++;
  console.log('  ✓ ' + nama);
}

async function minta(metode, jalur, body, { cookie, header = {} } = {}) {
  const r = await fetch(BASE + jalur, {
    method: metode,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...header },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, header: r.headers, j: await r.json() };
}

/** Login sebagai email baru; mengembalikan cookie sesinya. */
async function masuk(email) {
  const kode = await minta('POST', '/api/masuk/kode', { email });
  assert.strictEqual(kode.status, 200, JSON.stringify(kode.j));
  assert.ok(kode.j.kode_uji, 'kode_uji kosong: jalankan server dengan emailUji: true');
  const r = await fetch(BASE + '/api/masuk/verifikasi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, kode: kode.j.kode_uji }),
  });
  assert.strictEqual(r.status, 200);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

function emailUji(nama) {
  return `${nama}-${crypto.randomBytes(4).toString('hex')}@contoh.id`;
}

function dataEvaluasi() {
  return {
    nama: 'Pasien Uji', email: 'diabaikan@contoh.id', telepon: '081234567890',
    provinsi: 'Jawa Barat', kota: 'Kota Bandung', gender: 'Perempuan',
    tinggi: '165', berat: '80', target: '68',
    skrining: ['Tidak ada dari pilihan di bawah ini'], izin: ['Tidak ada dari pilihan di bawah ini'],
    prioritas: ['Membantu menjaga tingkat energi'],
    obat: 'tidak ada', alergi: 'tidak ada', suplemen: '',
    persetujuan: true, ketentuan: true,
  };
}

async function pesananLunas(cookie) {
  const orderId = crypto.randomUUID();
  const r = await minta('POST', '/api/pesanan', { order_id: orderId, ...dataEvaluasi() }, { cookie });
  assert.strictEqual(r.status, 201, JSON.stringify(r.j));
  const b = await minta('POST', '/api/pembayaran', { order_id: orderId, metode: 'qris' }, { cookie });
  assert.strictEqual(b.status, 201, JSON.stringify(b.j));
  return orderId;
}

(async () => {
  console.log(`Menguji ${BASE}\n`);
  const emailA = emailUji('pasien-a');
  let cookieA, cookieB;

  console.log('Login');
  await cek('email tidak valid → ditolak (400)', async () => {
    const r = await minta('POST', '/api/masuk/kode', { email: 'bukan-email' });
    assert.strictEqual(r.status, 400);
  });
  let kodeA;
  await cek('minta kode → 200, minta lagi seketika → ditolak (429)', async () => {
    const r = await minta('POST', '/api/masuk/kode', { email: emailA });
    assert.strictEqual(r.status, 200);
    assert.match(r.j.kode_uji, /^\d{6}$/);
    kodeA = r.j.kode_uji;
    const ulang = await minta('POST', '/api/masuk/kode', { email: emailA });
    assert.strictEqual(ulang.status, 429);
  });
  await cek('kode salah → ditolak (400) dengan sisa percobaan', async () => {
    const salah = kodeA === '000000' ? '111111' : '000000';
    const r = await minta('POST', '/api/masuk/verifikasi', { email: emailA, kode: salah });
    assert.strictEqual(r.status, 400);
    assert.match(r.j.pesan, /Sisa 4/);
  });
  await cek('kode benar → sesi dibuat, akun pasien baru', async () => {
    const r = await fetch(BASE + '/api/masuk/verifikasi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, kode: kodeA }),
    });
    assert.strictEqual(r.status, 200);
    const cookie = r.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    cookieA = cookie.split(';')[0];
    const j = await r.json();
    assert.strictEqual(j.pengguna.peran, 'pasien');
  });
  await cek('kode yang sudah dipakai tidak bisa dipakai lagi (400)', async () => {
    const r = await minta('POST', '/api/masuk/verifikasi', { email: emailA, kode: kodeA });
    assert.strictEqual(r.status, 400);
  });
  await cek('/api/saya tanpa login → 401, dengan login → data pasien', async () => {
    assert.strictEqual((await minta('GET', '/api/saya')).status, 401);
    const r = await minta('GET', '/api/saya', null, { cookie: cookieA });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.pengguna.email, emailA);
  });
  await cek('POST bukan JSON → 415, Origin situs lain → 403', async () => {
    const r = await fetch(BASE + '/api/keluar', { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: cookieA }, body: '{}' });
    assert.strictEqual(r.status, 415);
    const r2 = await minta('POST', '/api/keluar', {}, { cookie: cookieA, header: { Origin: 'https://situs-jahat.example' } });
    assert.strictEqual(r2.status, 403);
  });
  cookieB = await masuk(emailUji('pasien-b'));

  console.log('\nPesanan');
  const orderId = crypto.randomUUID();
  const data = { order_id: orderId, ...dataEvaluasi() };
  let ref;
  await cek('tanpa login → ditolak (401)', async () => {
    const r = await minta('POST', '/api/pesanan', data);
    assert.strictEqual(r.status, 401);
  });
  await cek('order_id baru membuat pesanan (201) dengan email akun', async () => {
    const r = await minta('POST', '/api/pesanan', data, { cookie: cookieA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.j));
    ref = r.j.pesanan.ref;
  });
  await cek('order_id yang sama + data sama → pesanan lama dikembalikan (200, ulang)', async () => {
    const r = await minta('POST', '/api/pesanan', data, { cookie: cookieA });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.ulang, true);
    assert.strictEqual(r.j.pesanan.ref, ref);
  });
  await cek('order_id yang sama + data berbeda → ditolak (422)', async () => {
    const r = await minta('POST', '/api/pesanan', { ...data, nama: 'Orang Lain' }, { cookie: cookieA });
    assert.strictEqual(r.status, 422);
  });
  await cek('order_id yang sama dari akun lain → ditolak (422)', async () => {
    const r = await minta('POST', '/api/pesanan', data, { cookie: cookieB });
    assert.strictEqual(r.status, 422);
  });
  await cek('order_id bukan UUID v4 → ditolak (400)', async () => {
    const r = await minta('POST', '/api/pesanan', { ...data, order_id: '123' }, { cookie: cookieA });
    assert.strictEqual(r.status, 400);
  });
  await cek('akun lain tidak bisa melihat atau membayar pesanan ini (404)', async () => {
    assert.strictEqual((await minta('GET', '/api/pesanan?order_id=' + orderId, null, { cookie: cookieB })).status, 404);
    assert.strictEqual((await minta('POST', '/api/pembayaran', { order_id: orderId, metode: 'qris' }, { cookie: cookieB })).status, 404);
  });

  console.log('\nPembayaran');
  await cek('jadwal belum bisa dipilih sebelum lunas (409)', async () => {
    const { j } = await minta('GET', '/api/slot', null, { cookie: cookieA });
    const hari = j.hari.find((h) => h.slot.length);
    const r = await minta('POST', '/api/jadwal', { order_id: orderId, tanggal: hari.tanggal, ...hari.slot[0] }, { cookie: cookieA });
    assert.strictEqual(r.status, 409);
  });
  let transaksiId;
  await cek(`${PARALEL} permintaan bayar serentak → tepat 1 diproses, sisanya ditolak/diputar ulang`, async () => {
    const hasil = await Promise.all(
      Array.from({ length: PARALEL }, () =>
        minta('POST', '/api/pembayaran', { order_id: orderId, metode: 'qris' }, { cookie: cookieA, header: { 'Idempotency-Key': orderId } })
      )
    );
    const baru = hasil.filter((h) => h.status === 201);
    const lainnya = hasil.filter((h) => h.status !== 201);
    assert.strictEqual(baru.length, 1, 'status: ' + hasil.map((h) => h.status).join(','));
    assert.ok(lainnya.every((h) => h.status === 409 || (h.status === 200 && h.j.ulang)), 'status: ' + hasil.map((h) => h.status).join(','));
    transaksiId = baru[0].j.pesanan.pembayaran.transaksi_id;
  });
  await cek('bayar ulang setelah lunas → hasil lama, tidak ditagih lagi (200, Idempotent-Replayed)', async () => {
    const r = await minta('POST', '/api/pembayaran', { order_id: orderId, metode: 'va_bca' }, { cookie: cookieA });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.header.get('idempotent-replayed'), 'true');
    assert.strictEqual(r.j.pesanan.pembayaran.transaksi_id, transaksiId);
    assert.strictEqual(r.j.pesanan.pembayaran.metode, 'qris');
  });
  await cek('header Idempotency-Key berbeda dengan order_id → ditolak (422)', async () => {
    const r = await minta('POST', '/api/pembayaran', { order_id: orderId, metode: 'qris' }, { cookie: cookieA, header: { 'Idempotency-Key': crypto.randomUUID() } });
    assert.strictEqual(r.status, 422);
  });

  console.log('\nJadwal');
  let slot;
  await cek('slot: 2 dokter, hanya hari praktik, tiap jam diisi satu dokter', async () => {
    const { status, j } = await minta('GET', '/api/slot', null, { cookie: cookieA });
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(j.dokter.map((d) => d.kode), ['spgk1', 'spgk2']);
    assert.ok(j.hari.length === 14 && j.hari.every((h) => new Date(h.tanggal + 'T00:00:00Z').getUTCDay() !== 0));
    for (const h of j.hari) {
      assert.strictEqual(new Set(h.slot.map((s) => s.jam)).size, h.slot.length, 'jam ganda pada ' + h.tanggal);
      assert.strictEqual(new Set(h.slot.map((s) => s.dokter)).size, 2, 'kedua dokter harus bertugas pada ' + h.tanggal);
    }
    const hari = j.hari[0];
    slot = { tanggal: hari.tanggal, ...hari.slot[0] };
  });
  await cek('jam di luar praktik dokter tersebut → ditolak (400)', async () => {
    const lain = slot.dokter === 'spgk1' ? 'spgk2' : 'spgk1';
    const r = await minta('POST', '/api/jadwal', { order_id: orderId, ...slot, dokter: lain }, { cookie: cookieA });
    assert.strictEqual(r.status, 400);
  });
  const orderB = await pesananLunas(cookieB);
  await cek('2 pasien memilih slot yang sama serentak → tepat 1 berhasil, lainnya 409', async () => {
    const hasil = await Promise.all([
      minta('POST', '/api/jadwal', { order_id: orderId, ...slot }, { cookie: cookieA }),
      minta('POST', '/api/jadwal', { order_id: orderB, ...slot }, { cookie: cookieB }),
    ]);
    assert.deepStrictEqual(hasil.map((h) => h.status).sort(), [201, 409], 'status: ' + hasil.map((h) => h.status).join(','));
  });
  const [pemenang, kalah] = (await minta('GET', '/api/saya', null, { cookie: cookieA })).j.pesanan[0].jadwal
    ? [{ cookie: cookieA, order: orderId }, { cookie: cookieB, order: orderB }]
    : [{ cookie: cookieB, order: orderB }, { cookie: cookieA, order: orderId }];
  await cek('jadwal tersimpan berstatus menunggu_persetujuan dan slotnya hilang dari daftar', async () => {
    const saya = await minta('GET', '/api/saya', null, { cookie: pemenang.cookie });
    const p = saya.j.pesanan.find((x) => x.order_id === pemenang.order);
    assert.strictEqual(p.jadwal.status, 'menunggu_persetujuan');
    assert.strictEqual(p.jadwal.dokter.kode, slot.dokter);
    const { j } = await minta('GET', '/api/slot', null, { cookie: kalah.cookie });
    const hari = j.hari.find((h) => h.tanggal === slot.tanggal);
    assert.ok(!hari.slot.some((s) => s.jam === slot.jam && s.dokter === slot.dokter));
  });
  await cek('pesanan yang sudah punya jadwal tidak bisa memilih jadwal kedua (409)', async () => {
    const { j } = await minta('GET', '/api/slot', null, { cookie: pemenang.cookie });
    const r = await minta('POST', '/api/jadwal', { order_id: pemenang.order, tanggal: j.hari[1].tanggal, ...j.hari[1].slot[0] }, { cookie: pemenang.cookie });
    assert.strictEqual(r.status, 409);
  });
  await cek('akun lain tidak bisa membatalkan jadwal ini (404)', async () => {
    const r = await minta('POST', '/api/jadwal/batal', { order_id: pemenang.order }, { cookie: kalah.cookie });
    assert.strictEqual(r.status, 404);
  });
  await cek('pasien membatalkan jadwal yang belum disetujui → slot kembali tersedia', async () => {
    const r = await minta('POST', '/api/jadwal/batal', { order_id: pemenang.order }, { cookie: pemenang.cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.pesanan.jadwal, null);
    const { j } = await minta('GET', '/api/slot', null, { cookie: kalah.cookie });
    assert.ok(j.hari.find((h) => h.tanggal === slot.tanggal).slot.some((s) => s.jam === slot.jam && s.dokter === slot.dokter));
  });

  console.log('\nDokter');
  const db = new Database(LOKASI_DB);
  const EMAIL_DOKTER = { spgk1: 'dokter1@slimfie.com', spgk2: 'dokter2@slimfie.com' };
  const cookieDokter = { spgk1: await masuk(EMAIL_DOKTER.spgk1), spgk2: await masuk(EMAIL_DOKTER.spgk2) };
  const dokterSlot = cookieDokter[slot.dokter];
  const dokterLain = cookieDokter[slot.dokter === 'spgk1' ? 'spgk2' : 'spgk1'];
  const permintaanDari = async (cookie, order) =>
    (await minta('GET', '/api/dokter', null, { cookie })).j.permintaan.find((x) => x.order_id === order);
  const pesananPasien = async () =>
    (await minta('GET', '/api/saya', null, { cookie: kalah.cookie })).j.pesanan.find((x) => x.order_id === kalah.order);
  // Jam WIB relatif terhadap sekarang, untuk menguji tampilnya tautan Meet dan tombol selesai.
  const wibDariSekarang = (menit) => {
    const d = new Date(Date.now() + (7 * 60 + menit) * 60 * 1000);
    return { tanggal: d.toISOString().slice(0, 10), jam: d.toISOString().slice(11, 16) };
  };
  let idJadwal;

  await cek('pasien tidak bisa membuka dashboard dokter (403); dokter bisa', async () => {
    assert.strictEqual((await minta('GET', '/api/dokter', null, { cookie: kalah.cookie })).status, 403);
    const r = await minta('GET', '/api/dokter', null, { cookie: dokterSlot });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.dokter.kode, slot.dokter);
  });
  await cek('permintaan hanya muncul di dashboard dokter yang dipilih, lengkap dengan evaluasi', async () => {
    assert.strictEqual((await minta('POST', '/api/jadwal', { order_id: kalah.order, ...slot }, { cookie: kalah.cookie })).status, 201);
    const item = await permintaanDari(dokterSlot, kalah.order);
    assert.ok(item, 'permintaan tidak ada di dashboard dokter');
    assert.strictEqual(item.evaluasi.bmi, 29.4);
    assert.ok(item.pasien.email && item.evaluasi.skrining.length);
    assert.strictEqual(await permintaanDari(dokterLain, kalah.order), undefined);
    idJadwal = item.id;
  });
  await cek('dokter lain tidak bisa menyetujui atau menolak (404)', async () => {
    assert.strictEqual((await minta('POST', '/api/dokter/setujui', { id: idJadwal }, { cookie: dokterLain })).status, 404);
    assert.strictEqual((await minta('POST', '/api/dokter/tolak', { id: idJadwal, alasan: 'Bukan pasien saya' }, { cookie: dokterLain })).status, 404);
  });
  await cek('tolak tanpa alasan → 400; dengan alasan → pasien melihat alasannya lalu memilih lagi', async () => {
    assert.strictEqual((await minta('POST', '/api/dokter/tolak', { id: idJadwal, alasan: '' }, { cookie: dokterSlot })).status, 400);
    const r = await minta('POST', '/api/dokter/tolak', { id: idJadwal, alasan: 'Jadwal bentrok dengan tindakan' }, { cookie: dokterSlot });
    assert.strictEqual(r.status, 200);
    const p = await pesananPasien();
    assert.strictEqual(p.jadwal, null);
    assert.strictEqual(p.ditolak.alasan_tolak, 'Jadwal bentrok dengan tindakan');
    assert.strictEqual((await minta('POST', '/api/jadwal', { order_id: kalah.order, ...slot }, { cookie: kalah.cookie })).status, 201);
    idJadwal = (await permintaanDari(dokterSlot, kalah.order)).id;
  });
  await cek('klik Setujui ganda serentak → tepat 1 berhasil dan tautan Meet dibuat', async () => {
    const hasil = await Promise.all([1, 2].map(() => minta('POST', '/api/dokter/setujui', { id: idJadwal }, { cookie: dokterSlot })));
    assert.deepStrictEqual(hasil.map((h) => h.status).sort(), [200, 409], 'status: ' + hasil.map((h) => h.status).join(','));
    assert.match(hasil.find((h) => h.status === 200).j.jadwal.meet_link, /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });
  await cek('pasien melihat jadwal disetujui; tautan Meet belum dikirim sebelum waktunya', async () => {
    const p = await pesananPasien();
    assert.strictEqual(p.jadwal.status, 'disetujui');
    assert.strictEqual(p.jadwal.meet_link, null);
    assert.ok(p.jadwal.meet_buka);
  });
  await cek('jadwal yang sudah disetujui tidak bisa dibatalkan pasien (409)', async () => {
    const r = await minta('POST', '/api/jadwal/batal', { order_id: kalah.order }, { cookie: kalah.cookie });
    assert.strictEqual(r.status, 409);
  });
  await cek('tandai selesai sebelum konsultasi dimulai → ditolak (409)', async () => {
    const r = await minta('POST', '/api/dokter/selesai', { id: idJadwal }, { cookie: dokterSlot });
    assert.strictEqual(r.status, 409);
  });
  await cek('10 menit sebelum jadwal → tautan Meet tampil untuk pasien', async () => {
    const w = wibDariSekarang(10);
    db.prepare('UPDATE jadwal_konsultasi SET tanggal = ?, jam = ? WHERE id = ?').run(w.tanggal, w.jam, idJadwal);
    const p = await pesananPasien();
    assert.match(p.jadwal.meet_link, /^https:\/\/meet\.google\.com\//);
  });
  await cek('setelah dimulai, dokter menandai selesai dengan catatan; catatan tidak terkirim ke pasien', async () => {
    const w = wibDariSekarang(-5);
    db.prepare('UPDATE jadwal_konsultasi SET tanggal = ?, jam = ? WHERE id = ?').run(w.tanggal, w.jam, idJadwal);
    const r = await minta('POST', '/api/dokter/selesai', { id: idJadwal, catatan: 'Defisit 500 kkal, kontrol 4 minggu' }, { cookie: dokterSlot });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.jadwal.catatan, 'Defisit 500 kkal, kontrol 4 minggu');
    const saya = await minta('GET', '/api/saya', null, { cookie: kalah.cookie });
    assert.strictEqual(saya.j.pesanan.find((x) => x.order_id === kalah.order).jadwal.status, 'selesai');
    assert.ok(!JSON.stringify(saya.j).includes('Defisit'));
    const riwayat = (await minta('GET', '/api/dokter', null, { cookie: dokterSlot })).j.riwayat;
    assert.ok(riwayat.some((x) => x.id === idJadwal && x.status === 'selesai'));
  });
  await cek('permintaan yang waktunya sudah lewat tidak bisa disetujui (409)', async () => {
    const { j } = await minta('GET', '/api/slot', null, { cookie: pemenang.cookie });
    const s = j.hari[2].slot[0];
    assert.strictEqual((await minta('POST', '/api/jadwal', { order_id: pemenang.order, tanggal: j.hari[2].tanggal, ...s }, { cookie: pemenang.cookie })).status, 201);
    const item = await permintaanDari(cookieDokter[s.dokter], pemenang.order);
    db.prepare('UPDATE jadwal_konsultasi SET tanggal = ? WHERE id = ?').run(wibDariSekarang(-24 * 60).tanggal, item.id);
    const r = await minta('POST', '/api/dokter/setujui', { id: item.id }, { cookie: cookieDokter[s.dokter] });
    assert.strictEqual(r.status, 409);
  });

  console.log('\nSesi');
  await cek('keluar → sesi tidak berlaku lagi (401)', async () => {
    assert.strictEqual((await minta('POST', '/api/keluar', {}, { cookie: cookieB })).status, 200);
    assert.strictEqual((await minta('GET', '/api/saya', null, { cookie: cookieB })).status, 401);
  });

  console.log('\nDatabase');
  await cek('hanya ada 1 baris pembayaran untuk order_id ini', async () => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM pembayaran WHERE order_id = ?').get(orderId);
    assert.strictEqual(n, 1);
  });
  await cek('UNIQUE(order_id) menolak baris pembayaran kedua secara langsung', async () => {
    assert.throws(
      () => db.prepare("INSERT INTO pembayaran (order_id, transaksi_id, jumlah, metode, status) VALUES (?, ?, 199000, 'qris', 'berhasil')")
        .run(orderId, 'UJI-' + crypto.randomUUID()),
      (e) => e.code === 'SQLITE_CONSTRAINT_UNIQUE'
    );
  });
  await cek('UNIQUE(order_id) menolak baris pesanan kedua secara langsung', async () => {
    assert.throws(
      () => db.prepare(`INSERT INTO pesanan (order_id, ref, pengguna_id, payload_hash, nama, email, telepon, evaluasi, jumlah)
                        VALUES (?, ?, 1, 'x', 'x', 'x', 'x', '{}', 1)`).run(orderId, 'UJI-' + Date.now()),
      (e) => e.code === 'SQLITE_CONSTRAINT_UNIQUE'
    );
  });
  await cek('index unik menolak 2 jadwal aktif pada slot dokter yang sama', async () => {
    const { dokter_id, tanggal, jam } = db.prepare("SELECT * FROM jadwal_konsultasi WHERE status IN ('menunggu_persetujuan', 'disetujui') LIMIT 1").get();
    assert.throws(
      () => db.prepare('INSERT INTO jadwal_konsultasi (order_id, dokter_id, tanggal, jam) VALUES (?, ?, ?, ?)').run(orderId, dokter_id, tanggal, jam),
      (e) => e.code === 'SQLITE_CONSTRAINT_UNIQUE'
    );
  });
  await cek('kode masuk tidak disimpan dalam bentuk asli', async () => {
    const baris = db.prepare('SELECT kode_hash FROM kode_masuk WHERE email = ?').all(emailA);
    assert.ok(baris.length && baris.every((b) => /^[0-9a-f]{64}$/.test(b.kode_hash) && b.kode_hash !== kodeA));
  });
  db.close();

  console.log(`\nSemua ${lulus} cek lulus.`);
})().catch((e) => {
  console.error('\n  ✗ GAGAL:', e.message);
  process.exit(1);
});
