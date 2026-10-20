/* SLIMFie — dashboard pasien (dasbor.html).
   Menampilkan pesanan milik pasien yang login. Setelah lunas, pasien memilih dokter,
   tanggal, dan jam; jadwal lalu menunggu persetujuan dokter. Bila ditolak, pasien
   memilih jadwal lain. Tautan Google Meet tampil setelah jadwal disetujui. */
(function () {
  'use strict';

  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var SEMUA = 'semua';

  var daftar = document.getElementById('daftar-pesanan');
  var fokusOrder = new URLSearchParams(window.location.search).get('order_id') || '';
  var slotData = null; // jawaban /api/slot, dimuat sekali dan dipakai semua pemilih

  /* ---------- utilitas ---------- */
  function escap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tglUtc(iso) { return new Date(iso + 'T00:00:00Z'); }
  function tanggalIndo(iso) {
    var d = tglUtc(iso);
    return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function jamIndo(jam) { return jam.replace(':', '.') + ' WIB'; }
  function waktuIndo(sqlUtc) {
    var d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
    return isNaN(d) ? sqlUtc : d.toLocaleDateString('id-ID', { dateStyle: 'long' });
  }
  /* Waktu ISO → "Rabu, 21 Oktober pukul 07.45 WIB" */
  function waktuWib(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' }) +
      ' pukul ' + d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.') + ' WIB';
  }
  function rupiah(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
  function namaPendek(nama) { return String(nama).replace(/^(Dokter|dr\.?)\s+/i, ''); }

  function ambil(jalur, data) {
    var opsi = { headers: { Accept: 'application/json' } };
    if (data) {
      opsi.method = 'POST';
      opsi.headers['Content-Type'] = 'application/json';
      opsi.body = JSON.stringify(data);
    }
    return fetch(jalur, opsi).then(function (r) {
      if (r.status === 401) {
        window.location.href = 'masuk.html?lanjut=' + encodeURIComponent('dasbor.html' + window.location.search);
        return new Promise(function () {}); // halaman berpindah
      }
      return r.json().then(function (j) { return { status: r.status, j: j }; });
    });
  }

  function tampil(id) {
    ['status-muat', 'status-galat', 'status-kosong', 'status-staf'].forEach(function (x) {
      document.getElementById(x).hidden = x !== id;
    });
  }

  /* ---------- status per pesanan ---------- */
  function statusPesanan(p) {
    if (p.status === 'menunggu_pembayaran' || p.status === 'diproses') return ['Belum dibayar', 'kuning'];
    if (p.status === 'dibatalkan' || p.status === 'gagal') return ['Dibatalkan', 'abu'];
    if (!p.jadwal) return ['Pilih jadwal', 'kuning'];
    if (p.jadwal.status === 'menunggu_persetujuan') return ['Menunggu persetujuan dokter', ''];
    if (p.jadwal.status === 'disetujui') return ['Jadwal disetujui', 'hijau'];
    return ['Konsultasi selesai', 'abu'];
  }

  function ringkasJadwal(j) {
    return '<dl class="jadwal-ringkas">' +
      '<div><dt>Dokter</dt><dd>' + escap(j.dokter.nama) + '</dd></div>' +
      '<div><dt>Tanggal</dt><dd>' + escap(tanggalIndo(j.tanggal)) + '</dd></div>' +
      '<div><dt>Jam</dt><dd>' + escap(jamIndo(j.jam)) + ' · 20 menit</dd></div>' +
      '</dl>';
  }

  function isiPesanan(p) {
    var bayarUrl = 'pembayaran.html?order_id=' + encodeURIComponent(p.order_id);
    if (p.status === 'menunggu_pembayaran' || p.status === 'diproses') {
      return '<p>Evaluasi Anda sudah tersimpan. Selesaikan pembayaran ' + rupiah(p.jumlah) +
        ' dalam 24 jam, lalu pilih jadwal konsultasi di sini.</p>' +
        '<div class="pesanan__aksi"><a class="tombol tombol--utama" href="' + bayarUrl + '">Bayar sekarang <svg class="ikon"><use href="#i-uang"/></svg></a></div>';
    }
    if (p.status === 'dibatalkan' || p.status === 'gagal') {
      return '<p>Permintaan ini dibatalkan karena tidak dibayar dalam 24 jam. Silakan isi evaluasi kembali bila ingin berkonsultasi.</p>';
    }
    if (!p.jadwal) {
      var tolak = p.ditolak
        ? '<div class="kotak-info kotak-info--kuning"><svg class="ikon"><use href="#i-jam"/></svg><span>' +
          escap(p.ditolak.dokter.nama) + ' tidak dapat menerima jadwal ' + escap(tanggalIndo(p.ditolak.tanggal)) + ' pukul ' +
          escap(jamIndo(p.ditolak.jam)) + (p.ditolak.alasan_tolak ? '. Alasan: ' + escap(p.ditolak.alasan_tolak.replace(/[.\s]+$/, '')) : '') +
          '. Silakan pilih jadwal lain.</span></div>'
        : '<p>Pembayaran lunas. Pilih dokter, tanggal, dan jam konsultasi. Dokter akan meninjau evaluasi Anda lalu menyetujui jadwalnya.</p>';
      return tolak + '<div class="pemilih" data-pemilih="' + escap(p.order_id) + '"><p class="chip-kosong">Memuat jadwal dokter…</p></div>';
    }
    if (p.jadwal.status === 'menunggu_persetujuan') {
      return ringkasJadwal(p.jadwal) +
        '<div class="kotak-info"><svg class="ikon"><use href="#i-jam"/></svg><span>Dokter sedang meninjau evaluasi Anda, biasanya dalam 24 jam. Status di halaman ini berubah setelah dokter menyetujui.</span></div>' +
        '<p class="galat" data-galat-batal role="alert"></p>' +
        '<div class="pesanan__aksi"><button type="button" class="tombol tombol--garis-gelap" data-batal="' + escap(p.order_id) + '">Ganti jadwal</button></div>';
    }
    if (p.jadwal.status === 'disetujui') {
      var meet = /^https:\/\/meet\.google\.com\//.test(p.jadwal.meet_link || '')
        ?'<div class="pesanan__aksi"><a class="tombol tombol-meet" href="' + escap(p.jadwal.meet_link) + '" target="_blank" rel="noopener">' +
          '<svg class="ikon"><use href="#i-video"/></svg>Gabung Google Meet</a></div>'
        : '<div class="kotak-info"><svg class="ikon"><use href="#i-video"/></svg><span>Dokter sudah menyetujui jadwal Anda. Tautan Google Meet muncul di sini ' +
          (p.jadwal.meet_buka ? 'mulai <strong>' + escap(waktuWib(p.jadwal.meet_buka)) + '</strong>' : 'menjelang jadwal konsultasi') +
          '. Muat ulang halaman ini saat waktunya tiba.</span></div>';
      return ringkasJadwal(p.jadwal) + meet;
    }
    return ringkasJadwal(p.jadwal) + '<p>Konsultasi telah selesai. Terima kasih telah mempercayakan perawatan Anda kepada SLIMFie.</p>';
  }

  function kartuPesanan(p) {
    var s = statusPesanan(p);
    return '<article class="kartu-alur pesanan" id="pesanan-' + escap(p.order_id) + '" tabindex="-1">' +
      '<div class="pesanan__kepala"><div>' +
      '<span class="kartu-alur__langkah">Konsultasi dokter Sp.GK</span>' +
      '<h2>' + escap(p.ref) + '</h2>' +
      '<small>Dibuat ' + escap(waktuIndo(p.dibuat)) + (p.mode_uji && p.pembayaran ? ' · pembayaran mode uji' : '') + '</small>' +
      '</div><span class="pil-status"' + (s[1] ? ' data-nada="' + s[1] + '"' : '') + '>' + escap(s[0]) + '</span></div>' +
      '<div class="pesanan__isi">' + isiPesanan(p) + '</div>' +
      '</article>';
  }

  /* ---------- pemilih jadwal ---------- */
  function pasangPemilih(wadah) {
    var orderId = wadah.getAttribute('data-pemilih');
    var pilih = { dokter: SEMUA, tanggal: '', jam: '', kodeDokter: '' };

    function slotHari(tanggal) {
      var hari = slotData.hari.filter(function (h) { return h.tanggal === tanggal; })[0];
      return (hari ? hari.slot : []).filter(function (s) { return pilih.dokter === SEMUA || s.dokter === pilih.dokter; });
    }
    function namaDokter(kode) {
      return (slotData.dokter.filter(function (d) { return d.kode === kode; })[0] || {}).nama || kode;
    }

    function render() {
      var opsiDokter = [{ kode: SEMUA, nama: 'Siapa saja yang tersedia', ringkasan: 'Pilihan jam paling banyak' }].concat(slotData.dokter);
      var tanggalHtml = slotData.hari.map(function (h) {
        var d = tglUtc(h.tanggal);
        var ada = slotHari(h.tanggal).length > 0;
        return '<button type="button" class="chip-tanggal" data-tanggal="' + h.tanggal + '" aria-pressed="' + (pilih.tanggal === h.tanggal) + '"' +
          (ada ? '' : ' disabled') + ' aria-label="' + escap(tanggalIndo(h.tanggal)) + (ada ? '' : ', penuh') + '">' +
          HARI[d.getUTCDay()].slice(0, 3) + '<strong>' + String(d.getUTCDate()).padStart(2, '0') + '</strong><small>' +
          BULAN[d.getUTCMonth()].slice(0, 3) + '</small></button>';
      }).join('');
      var jamHtml = pilih.tanggal
        ? slotHari(pilih.tanggal).map(function (s) {
          var aktif = pilih.jam === s.jam && pilih.kodeDokter === s.dokter;
          return '<button type="button" class="chip-jam" data-jam="' + s.jam + '" data-dokter="' + escap(s.dokter) + '" aria-pressed="' + aktif + '">' +
            s.jam.replace(':', '.') + '<small>' + escap(pilih.dokter === SEMUA ? namaPendek(namaDokter(s.dokter)) : 'WIB') + '</small></button>';
        }).join('')
        : '<p class="chip-kosong">Pilih tanggal terlebih dahulu.</p>';

      wadah.innerHTML =
        '<div><span class="bidang__label" id="lbl-dokter-' + orderId + '">Dokter</span>' +
        '<div class="pilihan-besar pilihan-besar--3" role="radiogroup" aria-labelledby="lbl-dokter-' + orderId + '" style="margin-top:10px">' +
        opsiDokter.map(function (d) {
          return '<label><input type="radio" name="dokter-' + orderId + '" value="' + escap(d.kode) + '"' + (pilih.dokter === d.kode ? ' checked' : '') + '>' +
            '<span>' + escap(d.nama) + '</span><small>' + escap(d.ringkasan) + '</small></label>';
        }).join('') + '</div></div>' +
        '<div><span class="bidang__label">Tanggal</span><div class="chip-baris">' + tanggalHtml + '</div></div>' +
        '<div><span class="bidang__label">Jam (WIB)</span><div class="chip-baris">' + jamHtml + '</div></div>' +
        '<p class="galat" data-galat-pilih role="alert"></p>' +
        '<div class="pesanan__aksi"><button type="button" class="tombol tombol--utama" data-ajukan>Ajukan jadwal <svg class="ikon"><use href="#i-panah"/></svg></button></div>';
    }

    wadah.addEventListener('change', function (e) {
      if (!e.target.matches('input[type="radio"]')) return;
      pilih.dokter = e.target.value;
      pilih.jam = '';
      pilih.kodeDokter = '';
      if (pilih.tanggal && !slotHari(pilih.tanggal).length) pilih.tanggal = '';
      render();
      wadah.querySelector('input[value="' + pilih.dokter + '"]').focus();
    });

    wadah.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tanggal]');
      if (t && !t.disabled) {
        pilih.tanggal = t.getAttribute('data-tanggal');
        pilih.jam = '';
        pilih.kodeDokter = '';
        render();
        wadah.querySelector('[data-tanggal="' + pilih.tanggal + '"]').focus();
        return;
      }
      var j = e.target.closest('[data-jam]');
      if (j) {
        pilih.jam = j.getAttribute('data-jam');
        pilih.kodeDokter = j.getAttribute('data-dokter');
        wadah.querySelectorAll('[data-jam]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === j)); });
        return;
      }
      var tombol = e.target.closest('[data-ajukan]');
      if (tombol) ajukan(tombol);
    });

    function ajukan(tombol) {
      var galat = wadah.querySelector('[data-galat-pilih]');
      galat.textContent = '';
      if (!pilih.tanggal) { galat.textContent = 'Pilih tanggal konsultasi.'; return; }
      if (!pilih.jam) { galat.textContent = 'Pilih jam konsultasi.'; return; }
      if (tombol.disabled) return;
      tombol.disabled = true;
      tombol.textContent = 'Mengajukan…';
      ambil('/api/jadwal', { order_id: orderId, dokter: pilih.kodeDokter, tanggal: pilih.tanggal, jam: pilih.jam })
        .then(function (h) {
          if (h.j.ok) { fokusOrder = orderId; return muat(); }
          // Slot diambil pasien lain: muat ulang daftar slot agar pilihan selalu terbaru.
          return muatSlot().then(function () {
            pilih.jam = '';
            pilih.kodeDokter = '';
            render();
            wadah.querySelector('[data-galat-pilih]').textContent = h.j.pesan || 'Jadwal belum tersimpan. Coba lagi.';
          });
        })
        .catch(function () {
          tombol.disabled = false;
          tombol.innerHTML = 'Ajukan jadwal <svg class="ikon"><use href="#i-panah"/></svg>';
          galat.textContent = 'Koneksi terputus. Coba lagi.';
        });
    }

    render();
  }

  function muatSlot() {
    return ambil('/api/slot').then(function (h) {
      if (!h.j.ok) throw new Error(h.j.pesan || 'Jadwal dokter tidak dapat dimuat.');
      slotData = h.j;
    });
  }

  /* ---------- muat dashboard ---------- */
  function muat() {
    return ambil('/api/saya').then(function (h) {
      if (!h.j.ok) throw new Error(h.j.pesan || 'Data tidak dapat dimuat.');
      var u = h.j.pengguna;
      document.getElementById('sapaan').textContent = 'Halo, ' + (u.nama || 'Pasien SLIMFie');
      document.getElementById('email-pengguna').textContent = u.email;

      if (u.peran === 'dokter') {
        window.location.replace('dokter.html');
        return new Promise(function () {});
      }
      if (u.peran !== 'pasien') {
        document.getElementById('pesan-staf').textContent = 'Anda masuk sebagai ' + u.peran +
          '. Dashboard ' + u.peran + ' tersedia pada tahap berikutnya.';
        daftar.innerHTML = '';
        return tampil('status-staf');
      }
      if (!h.j.pesanan.length) {
        daftar.innerHTML = '';
        return tampil('status-kosong');
      }
      tampil('');
      daftar.innerHTML = h.j.pesanan.map(kartuPesanan).join('');

      var pemilih = daftar.querySelectorAll('[data-pemilih]');
      var siap = pemilih.length ? muatSlot().then(function () { pemilih.forEach(pasangPemilih); }) : Promise.resolve();
      siap.catch(function (err) {
        pemilih.forEach(function (w) { w.innerHTML = '<p class="galat">' + escap(err.message) + '</p>'; });
      });

      var kartu = fokusOrder && document.getElementById('pesanan-' + fokusOrder);
      if (kartu) {
        kartu.scrollIntoView({ behavior: 'smooth', block: 'start' });
        kartu.focus({ preventScroll: true });
      }
    });
  }

  function mulai() {
    tampil('status-muat');
    muat().catch(function (err) {
      document.getElementById('pesan-galat').textContent = err.name === 'TypeError' || err.name === 'SyntaxError'
        ? 'Server tidak dapat dihubungi. Periksa koneksi Anda lalu coba lagi.'
        : err.message;
      tampil('status-galat');
    });
  }

  /* ---------- ganti jadwal & keluar ---------- */
  daftar.addEventListener('click', function (e) {
    var tombol = e.target.closest('[data-batal]');
    if (!tombol || tombol.disabled) return;
    var orderId = tombol.getAttribute('data-batal');
    var galat = tombol.closest('.pesanan__isi').querySelector('[data-galat-batal]');
    tombol.disabled = true;
    ambil('/api/jadwal/batal', { order_id: orderId })
      .then(function (h) {
        if (h.j.ok) { fokusOrder = orderId; return muat(); }
        galat.textContent = h.j.pesan || 'Jadwal belum bisa diganti.';
        tombol.disabled = false;
      })
      .catch(function () {
        galat.textContent = 'Koneksi terputus. Coba lagi.';
        tombol.disabled = false;
      });
  });

  document.querySelectorAll('[data-keluar]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      ambil('/api/keluar', {}).catch(function () {}).then(function () { window.location.href = 'masuk.html'; });
    });
  });

  document.getElementById('tombol-muat-ulang').addEventListener('click', mulai);

  if (window.location.protocol === 'file:') {
    document.getElementById('pesan-galat').textContent = 'Dashboard membutuhkan server SLIMFie. Jalankan situs dengan "npm start".';
    tampil('status-galat');
    return;
  }
  mulai();
})();
