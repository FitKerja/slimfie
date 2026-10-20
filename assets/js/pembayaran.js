/* SLIMFie — halaman pembayaran.
   Tombol Bayar dinonaktifkan seketika saat diklik. Setiap percobaan (termasuk "Coba lagi"
   setelah koneksi putus) mengirim order_id yang sama sebagai Idempotency-Key, jadi server
   tidak pernah menagih dua kali. */
(function () {
  'use strict';

  var orderId = new URLSearchParams(window.location.search).get('order_id') || '';
  var form = document.getElementById('form-bayar');
  var tombol = document.getElementById('tombol-bayar');
  var labelBayar = document.getElementById('label-bayar');
  var galatBayar = document.getElementById('galat-bayar');
  var metodeSet = form.querySelector('.metode');

  var NAMA_METODE = { qris: 'QRIS', va_bca: 'Virtual Account BCA', va_mandiri: 'Virtual Account Mandiri', va_bni: 'Virtual Account BNI' };

  function rupiah(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
  /* Belum login (atau sesi berakhir): masuk dulu, lalu kembali ke halaman ini. */
  function keMasuk() {
    window.location.href = 'masuk.html?lanjut=' + encodeURIComponent('pembayaran.html?order_id=' + orderId);
    return new Promise(function () {}); // halaman berpindah; rantai berikutnya tidak dijalankan
  }
  function waktuIndo(sqlUtc) {
    var d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
    return isNaN(d) ? sqlUtc : d.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  }
  function isi(nama, nilai) {
    document.querySelectorAll('[data-isi="' + nama + '"]').forEach(function (el) { el.textContent = nilai; });
  }
  function tampil(id) {
    ['status-muat', 'status-galat', 'tampilan-bayar', 'tampilan-lunas'].forEach(function (x) {
      document.getElementById(x).hidden = x !== id;
    });
  }

  function render(p) {
    isi('ref', p.ref);
    isi('order_id', p.order_id);
    isi('nama', p.nama);
    isi('jumlah', rupiah(p.jumlah));
    document.getElementById('tautan-pilih-jadwal').href = 'dasbor.html?order_id=' + encodeURIComponent(p.order_id);
    document.getElementById('info-mode-uji').hidden = !p.mode_uji;

    if (p.status === 'dibayar' && p.pembayaran) {
      isi('transaksi_id', p.pembayaran.transaksi_id);
      isi('metode_bayar', NAMA_METODE[p.pembayaran.metode] || p.pembayaran.metode);
      isi('dibayar', waktuIndo(p.pembayaran.dibayar));
      tampil('tampilan-lunas');
      return true;
    }
    if (p.status === 'dibatalkan') {
      document.getElementById('pesan-galat-muat').textContent =
        'Pesanan ' + p.ref + ' dibatalkan karena melewati batas waktu pembayaran 24 jam. Silakan isi evaluasi kembali untuk memilih jadwal baru.';
      tampil('status-galat');
      return true;
    }
    tampil('tampilan-bayar');
    return false;
  }

  /* ---------- status tombol ---------- */
  function kunci(teks) {
    tombol.disabled = true;
    tombol.setAttribute('aria-busy', 'true');
    metodeSet.disabled = true;
    labelBayar.textContent = teks;
  }
  function buka(teks) {
    tombol.disabled = false;
    tombol.removeAttribute('aria-busy');
    metodeSet.disabled = false;
    labelBayar.textContent = teks;
  }

  /* ---------- muat pesanan ---------- */
  function muat() {
    return fetch('/api/pesanan?order_id=' + encodeURIComponent(orderId), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) return keMasuk();
        return r.json().then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (h) {
        if (!h.ok || !h.j.ok) throw new Error(h.j.pesan || 'Pesanan tidak ditemukan.');
        return h.j.pesanan;
      });
  }

  /* Server sedang memproses order_id ini (mis. tab lain atau klik sebelumnya):
     tunggu hasilnya alih-alih mengirim pembayaran kedua. */
  function tungguHasil(sisa) {
    kunci('Menunggu konfirmasi pembayaran…');
    setTimeout(function () {
      muat().then(function (p) {
        if (render(p)) return;
        if (p.status === 'diproses' && sisa > 0) return tungguHasil(sisa - 1);
        if (p.status === 'menunggu_pembayaran') return buka('Bayar ' + rupiah(p.jumlah));
        galatBayar.textContent = 'Pembayaran masih diproses. Muat ulang halaman ini dalam beberapa menit; Anda tidak akan ditagih dua kali.';
      }).catch(function () {
        if (sisa > 0) return tungguHasil(sisa - 1);
        galatBayar.textContent = 'Koneksi ke server terputus. Tekan "Coba lagi"; Anda tidak akan ditagih dua kali.';
        buka('Coba lagi');
      });
    }, 2000);
  }

  /* ---------- bayar ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (tombol.disabled) return; // klik ganda / Enter berulang diabaikan
    var metode = (form.querySelector('input[name="metode"]:checked') || {}).value;
    galatBayar.textContent = '';
    kunci('Memproses pembayaran…'); // dinonaktifkan sebelum permintaan apa pun dikirim

    fetch('/api/pembayaran', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': orderId },
      body: JSON.stringify({ order_id: orderId, metode: metode })
    })
      .then(function (r) {
        if (r.status === 401) return keMasuk();
        return r.json().then(function (j) { return { status: r.status, j: j }; });
      })
      .then(function (h) {
        if (h.j.ok) {
          render(h.j.pesanan);
          document.getElementById('tampilan-lunas').focus();
          return;
        }
        if (h.status === 409 && /diproses/i.test(h.j.pesan || '')) return tungguHasil(30);
        galatBayar.textContent = h.j.pesan || 'Pembayaran gagal. Coba lagi.';
        if (h.status === 409) return; // dibatalkan: tidak bisa dibayar lagi
        buka('Coba lagi');
      })
      .catch(function () {
        // Hasil tidak diketahui (koneksi putus). Mencoba lagi aman karena order_id sama.
        galatBayar.textContent = 'Koneksi terputus sebelum ada jawaban dari server. Tekan "Coba lagi"; Anda tidak akan ditagih dua kali.';
        buka('Coba lagi');
      });
  });

  /* ---------- mulai ---------- */
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    document.getElementById('pesan-galat-muat').textContent = 'Tautan pembayaran tidak lengkap. Buka kembali dari halaman evaluasi.';
    tampil('status-galat');
    return;
  }
  muat().then(function (p) {
    if (!render(p) && p.status === 'diproses') tungguHasil(30);
  }).catch(function (err) {
    // TypeError: jaringan gagal (pesannya beda di tiap browser: "Failed to fetch", "Load failed", …).
    // SyntaxError: jawaban bukan JSON, berarti API tidak berjalan.
    var tanpaServer = err.name === 'TypeError' || err.name === 'SyntaxError';
    document.getElementById('pesan-galat-muat').textContent = tanpaServer
      ? 'Server tidak dapat dihubungi. Pastikan situs dijalankan dengan "npm start".'
      : err.message;
    tampil('status-galat');
  });
})();
