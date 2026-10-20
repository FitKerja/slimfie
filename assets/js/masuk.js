/* SLIMFie — halaman masuk (masuk.html).
   Email → kode 6 angka → sesi login. Setelah berhasil, pasien diarahkan ke ?lanjut=
   (hanya halaman SLIMFie sendiri) atau ke dashboard. */
(function () {
  'use strict';

  var formEmail = document.getElementById('form-email');
  var formKode = document.getElementById('form-kode');
  var isianEmail = document.getElementById('email');
  var isianKode = document.getElementById('kode');
  var galatEmail = document.getElementById('galat-email');
  var galatKode = document.getElementById('galat-kode');
  var tombolEmail = document.getElementById('tombol-email');
  var tombolKode = document.getElementById('tombol-kode');
  var tombolUlang = document.getElementById('tombol-ulang');
  var alamat = '';

  // Tujuan setelah masuk dibatasi ke halaman SLIMFie agar tautan masuk tidak bisa
  // dipakai untuk mengalihkan pasien ke situs lain.
  var lanjut = new URLSearchParams(window.location.search).get('lanjut') || '';
  if (!/^(dasbor|pembayaran|dokter)\.html(\?[\w=&%.-]*)?$/.test(lanjut)) lanjut = 'dasbor.html';
  // Dokter selalu ke dashboard dokter; pasien ke halaman tujuan.
  function tujuan(peran) {
    return peran === 'dokter' ? 'dokter.html' : lanjut;
  }

  function escap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function kirimJson(jalur, data) {
    return fetch(jalur, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); });
  }
  function sibuk(tombol, ya, teks) {
    tombol.disabled = ya;
    if (teks) tombol.innerHTML = teks;
  }

  if (window.location.protocol === 'file:') {
    galatEmail.textContent = 'Login membutuhkan server SLIMFie. Jalankan situs dengan "npm start".';
    tombolEmail.disabled = true;
    return;
  }

  // Sudah login: langsung ke tujuan.
  fetch('/api/saya', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok) window.location.replace(tujuan(j.pengguna.peran)); })
    .catch(function () {});

  /* ---------- tahap 1: minta kode ---------- */
  function mintaKode(galat) {
    return kirimJson('/api/masuk/kode', { email: alamat }).then(function (h) {
      if (!h.j.ok) { galat.textContent = h.j.pesan || 'Kode belum terkirim. Coba lagi.'; return false; }
      document.getElementById('info-kode').innerHTML =
        'Kode 6 angka dikirim ke <strong>' + escap(h.j.email) + '</strong> dan berlaku ' + h.j.berlaku_menit + ' menit.';
      var uji = document.getElementById('kode-uji');
      uji.hidden = !h.j.kode_uji;
      uji.innerHTML = h.j.kode_uji
        ? '<span><strong>Mode uji.</strong> Email belum dikirim sungguhan. Kode Anda: <strong>' + escap(h.j.kode_uji) + '</strong></span>'
        : '';
      return true;
    });
  }

  var labelEmail = tombolEmail.innerHTML;
  formEmail.addEventListener('submit', function (e) {
    e.preventDefault();
    if (tombolEmail.disabled) return;
    galatEmail.textContent = '';
    alamat = isianEmail.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(alamat)) {
      galatEmail.textContent = 'Masukkan alamat email yang valid, misalnya nama@email.com.';
      isianEmail.focus();
      return;
    }
    sibuk(tombolEmail, true, 'Mengirim kode…');
    mintaKode(galatEmail)
      .then(function (ok) {
        if (!ok) return;
        formEmail.hidden = true;
        formKode.hidden = false;
        isianKode.focus();
      })
      .catch(function () { galatEmail.textContent = 'Koneksi terputus. Coba lagi.'; })
      .then(function () { sibuk(tombolEmail, false, labelEmail); });
  });

  /* ---------- tahap 2: verifikasi ---------- */
  var labelKode = tombolKode.innerHTML;
  formKode.addEventListener('submit', function (e) {
    e.preventDefault();
    if (tombolKode.disabled) return;
    galatKode.textContent = '';
    if (isianKode.value.replace(/\D/g, '').length !== 6) {
      galatKode.textContent = 'Masukkan 6 angka kode verifikasi.';
      isianKode.focus();
      return;
    }
    sibuk(tombolKode, true, 'Memeriksa…');
    kirimJson('/api/masuk/verifikasi', { email: alamat, kode: isianKode.value })
      .then(function (h) {
        if (h.j.ok) { window.location.replace(tujuan(h.j.pengguna.peran)); return; }
        galatKode.textContent = h.j.pesan || 'Kode belum bisa diverifikasi.';
        isianKode.select();
        sibuk(tombolKode, false, labelKode);
      })
      .catch(function () {
        galatKode.textContent = 'Koneksi terputus. Coba lagi.';
        sibuk(tombolKode, false, labelKode);
      });
  });

  tombolUlang.addEventListener('click', function () {
    galatKode.textContent = '';
    sibuk(tombolUlang, true);
    mintaKode(galatKode)
      .then(function (ok) { if (ok) { isianKode.value = ''; isianKode.focus(); } })
      .catch(function () { galatKode.textContent = 'Koneksi terputus. Coba lagi.'; })
      .then(function () { sibuk(tombolUlang, false); });
  });

  document.getElementById('tombol-ganti').addEventListener('click', function () {
    formKode.hidden = true;
    formEmail.hidden = false;
    isianKode.value = '';
    galatKode.textContent = '';
    isianEmail.focus();
  });
})();
