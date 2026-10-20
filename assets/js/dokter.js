/* SLIMFie — dashboard dokter (dokter.html).
   Permintaan jadwal ditinjau bersama evaluasi pasien, lalu disetujui (tautan Google Meet
   dibuat server) atau ditolak dengan alasan. Konsultasi yang sudah dimulai bisa ditandai
   selesai dengan catatan dokter. Data dimuat ulang tiap menit selama tidak ada isian terbuka. */
(function () {
  'use strict';

  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var TIDAK_ADA = 'Tidak ada dari pilihan di bawah ini';
  // [label tombol, teks yang diisikan]. Dashboard pasien menambahkan "Silakan pilih jadwal lain."
  var ALASAN_CEPAT = [
    ['Jadwal bentrok', 'Jadwal bentrok dengan tindakan di rumah sakit'],
    ['Perlu izin dokter utama', 'Kondisi Anda perlu persetujuan dokter utama lebih dulu; tim SLIMFie akan menghubungi Anda'],
    ['Pilih dokter lain', 'Untuk kondisi Anda, konsultasi lebih tepat dengan dokter Sp.GK yang bertugas di jam lain']
  ];

  var data = null;

  /* ---------- utilitas ---------- */
  function escap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tglUtc(iso) { return new Date(iso + 'T00:00:00Z'); }
  function tanggalIndo(iso) {
    var d = tglUtc(iso);
    return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function tanggalPendek(iso) {
    var d = tglUtc(iso);
    return HARI[d.getUTCDay()].slice(0, 3) + ', ' + d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()].slice(0, 3);
  }
  function jamIndo(jam) { return jam.replace(':', '.'); }
  function koma(n) { return String(n).replace('.', ','); }
  /* Waktu mulai sesi (jam praktik ditulis dalam WIB = UTC+7). */
  function mulaiMs(j) {
    var b = j.jam.split(':');
    return Date.parse(j.tanggal + 'T00:00:00Z') + ((+b[0]) * 60 + (+b[1]) - 420) * 60000;
  }
  function waktuIndo(sqlUtc) {
    var d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
    return isNaN(d) ? sqlUtc : d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  }
  function nomorWa(telp) {
    var d = String(telp || '').replace(/\D/g, '');
    return d.charAt(0) === '0' ? '62' + d.slice(1) : d;
  }

  function ambil(jalur, kirim) {
    var opsi = { headers: { Accept: 'application/json' } };
    if (kirim) {
      opsi.method = 'POST';
      opsi.headers['Content-Type'] = 'application/json';
      opsi.body = JSON.stringify(kirim);
    }
    return fetch(jalur, opsi).then(function (r) {
      if (r.status === 401) {
        window.location.href = 'masuk.html?lanjut=dokter.html';
        return new Promise(function () {});
      }
      return r.json().then(function (j) { return { status: r.status, j: j }; });
    });
  }

  /* ---------- evaluasi pasien ---------- */
  function adaTemuan(daftar) {
    return (daftar || []).filter(function (x) { return x !== TIDAK_ADA; });
  }

  function lencana(item) {
    var e = item.evaluasi;
    if (!e) return '';
    var skr = adaTemuan(e.skrining).length;
    var izn = adaTemuan(e.izin).length;
    return '<div class="lencana-baris">' +
      '<span class="lencana">BMI ' + koma(e.bmi) + ' · ' + escap(e.kategori_bmi) + '</span>' +
      '<span class="lencana">' + escap(e.gender) + '</span>' +
      (skr ? '<span class="lencana" data-nada="merah">' + skr + ' kondisi skrining</span>' : '<span class="lencana" data-nada="hijau">Skrining bersih</span>') +
      (izn ? '<span class="lencana" data-nada="kuning">' + izn + ' perlu izin dokter utama</span>' : '') +
      '</div>';
  }

  function daftarHtml(arr, nada) {
    var isi = adaTemuan(arr);
    if (!isi.length) return '<span class="teks-redup">Tidak ada</span>';
    return '<ul class="daftar-temuan"' + (nada ? ' data-nada="' + nada + '"' : '') + '>' +
      isi.map(function (x) { return '<li>' + escap(x) + '</li>'; }).join('') + '</ul>';
  }

  function evaluasiHtml(item) {
    var e = item.evaluasi;
    var p = item.pasien;
    if (!e) return '<p class="galat">Data evaluasi tidak terbaca.</p>';
    var selisih = Math.round((e.berat - e.target) * 10) / 10;
    var baris = [
      ['Pasien', escap(p.nama)],
      ['Kontak', escap(p.email) + '<br>' + escap(p.telepon) +
        ' · <a href="https://wa.me/' + nomorWa(p.telepon) + '" target="_blank" rel="noopener">WhatsApp</a>'],
      ['Jenis kelamin', escap(e.gender)],
      ['Domisili', escap(e.kota) + ', ' + escap(e.provinsi)],
      ['Tinggi / berat', koma(e.tinggi) + ' cm · ' + koma(e.berat) + ' kg'],
      ['BMI', koma(e.bmi) + ' (' + escap(e.kategori_bmi) + ')'],
      ['Berat target', koma(e.target) + ' kg (turun ' + koma(selisih) + ' kg)'],
      ['Skrining klinis', daftarHtml(e.skrining, 'merah')],
      ['Perlu izin dokter utama', daftarHtml(e.izin, 'kuning')],
      ['Obat', escap(e.obat)],
      ['Alergi', escap(e.alergi)],
      ['Suplemen', escap(e.suplemen) || '<span class="teks-redup">—</span>'],
      ['Prioritas pasien', daftarHtml(e.prioritas)]
    ];
    return '<dl class="ringkasan evaluasi-dokter">' + baris.map(function (b) {
      return '<div class="ringkasan__baris"><dt>' + b[0] + '</dt><dd>' + b[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  function detailEvaluasi(item) {
    return '<details class="detail-evaluasi" data-detail="' + item.id + '"><summary>' +
      '<svg class="ikon"><use href="#i-dokumen"/></svg>Lihat evaluasi lengkap</summary>' + evaluasiHtml(item) + '</details>';
  }

  /* ---------- kartu ---------- */
  function kepalaItem(item, status) {
    return '<div class="item-dokter__kepala">' +
      '<div class="item-dokter__waktu"><strong>' + jamIndo(item.jam) + '</strong><span>' + escap(tanggalPendek(item.tanggal)) + '</span></div>' +
      '<div class="item-dokter__pasien">' + (status || '') + '<strong>' + escap(item.pasien.nama) + '</strong>' +
      '<span>' + escap(item.ref) + ' · ' + escap(tanggalIndo(item.tanggal)) + ', ' + jamIndo(item.jam) + ' WIB</span>' + lencana(item) + '</div>' +
      '</div>';
  }

  function kartuPermintaan(item) {
    var lewat = mulaiMs(item) <= Date.now();
    return '<article class="item-dokter" data-id="' + item.id + '">' +
      kepalaItem(item) +
      detailEvaluasi(item) +
      (lewat ? '<p class="galat">Waktu jadwal ini sudah lewat. Tolak agar pasien memilih jadwal lain.</p>' : '') +
      '<div class="item-dokter__aksi">' +
      '<button type="button" class="tombol tombol--utama tombol--kecil" data-aksi="setujui"' + (lewat ? ' disabled' : '') + '>' +
      '<svg class="ikon"><use href="#i-centang"/></svg>Setujui &amp; buat Meet</button>' +
      '<button type="button" class="tombol tombol--garis-gelap tombol--kecil" data-aksi="buka-tolak"><svg class="ikon"><use href="#i-silang"/></svg>Tolak</button>' +
      '</div>' +
      '<div class="panel-aksi" data-panel="tolak" hidden>' +
      '<label class="bidang__label" for="alasan-' + item.id + '">Alasan penolakan (dibaca pasien)</label>' +
      '<div class="chip-baris">' + ALASAN_CEPAT.map(function (a, i) {
        return '<button type="button" class="chip-alasan" data-alasan="' + i + '">' + escap(a[0]) + '</button>';
      }).join('') + '</div>' +
      '<textarea class="area" id="alasan-' + item.id + '" maxlength="300" placeholder="Tulis alasan singkat agar pasien bisa memilih jadwal lain."></textarea>' +
      '<div class="item-dokter__aksi">' +
      '<button type="button" class="tombol tombol--utama tombol--kecil" data-aksi="tolak">Kirim penolakan</button>' +
      '<button type="button" class="tombol tombol--garis-gelap tombol--kecil" data-aksi="tutup">Batal</button></div>' +
      '</div>' +
      '<p class="galat" data-galat role="alert"></p>' +
      '</article>';
  }

  function kartuJadwal(item) {
    var mulai = mulaiMs(item) <= Date.now();
    var meet = /^https:\/\/meet\.google\.com\//.test(item.meet_link || '')
      ? '<a class="tombol tombol-meet tombol--kecil" href="' + escap(item.meet_link) + '" target="_blank" rel="noopener"><svg class="ikon"><use href="#i-video"/></svg>Gabung Meet</a>'
      : '';
    return '<article class="item-dokter" data-id="' + item.id + '">' +
      kepalaItem(item) +
      detailEvaluasi(item) +
      '<div class="item-dokter__aksi">' + meet +
      '<button type="button" class="tombol tombol--garis-gelap tombol--kecil" data-aksi="buka-selesai"' +
      (mulai ? '' : ' disabled title="Bisa ditandai setelah konsultasi dimulai"') + '><svg class="ikon"><use href="#i-centang"/></svg>Tandai selesai</button>' +
      (item.meet_link ? '<code class="kode-meet">' + escap(item.meet_link.replace('https://', '')) + '</code>' : '') +
      '</div>' +
      '<div class="panel-aksi" data-panel="selesai" hidden>' +
      '<label class="bidang__label" for="catatan-' + item.id + '">Catatan dokter (opsional, tidak ditampilkan ke pasien)</label>' +
      '<textarea class="area" id="catatan-' + item.id + '" maxlength="4000" placeholder="Ringkasan konsultasi, rencana terapi, jadwal kontrol berikutnya."></textarea>' +
      '<div class="item-dokter__aksi">' +
      '<button type="button" class="tombol tombol--utama tombol--kecil" data-aksi="selesai">Simpan &amp; tandai selesai</button>' +
      '<button type="button" class="tombol tombol--garis-gelap tombol--kecil" data-aksi="tutup">Batal</button></div>' +
      '</div>' +
      '<p class="galat" data-galat role="alert"></p>' +
      '</article>';
  }

  function kartuRiwayat(item) {
    var selesai = item.status === 'selesai';
    return '<article class="item-dokter item-dokter--ringkas">' +
      kepalaItem(item, '<span class="pil-status" data-nada="' + (selesai ? 'hijau' : 'abu') + '">' + (selesai ? 'Selesai' : 'Ditolak') + '</span>') +
      (selesai && item.catatan ? '<p class="catatan-dokter"><strong>Catatan:</strong> ' + escap(item.catatan) + '</p>' : '') +
      (!selesai ? '<p class="catatan-dokter"><strong>Alasan:</strong> ' + escap(item.alasan_tolak) + '</p>' : '') +
      '<small class="teks-redup">Diperbarui ' + escap(waktuIndo(item.diperbarui)) + '</small>' +
      '</article>';
  }

  function kosong(teks) { return '<p class="kosong-dokter">' + teks + '</p>'; }

  /* ---------- render ---------- */
  function render() {
    var d = data;
    var hariIni = d.hari_ini;
    document.getElementById('nama-dokter').textContent = d.dokter.nama;
    document.getElementById('info-dokter').textContent = 'Jadwal praktik · ' + d.dokter.ringkasan;

    var hari = d.disetujui.filter(function (j) { return j.tanggal === hariIni; });
    var depan = d.disetujui.filter(function (j) { return j.tanggal > hariIni; });
    var terlewat = d.disetujui.filter(function (j) { return j.tanggal < hariIni; });
    var selesai = d.riwayat.filter(function (j) { return j.status === 'selesai'; }).length;

    document.getElementById('statistik').innerHTML = [
      ['Menunggu persetujuan', d.permintaan.length, d.permintaan.length ? 'kuning' : ''],
      ['Konsultasi hari ini', hari.length, ''],
      ['Mendatang', depan.length, ''],
      ['Selesai (30 terakhir)', selesai, '']
    ].map(function (s) {
      return '<div class="statistik__kartu"' + (s[2] ? ' data-nada="' + s[2] + '"' : '') + '><strong>' + s[1] + '</strong><span>' + s[0] + '</span></div>';
    }).join('');

    document.getElementById('daftar-permintaan').innerHTML = d.permintaan.length
      ? d.permintaan.map(kartuPermintaan).join('')
      : kosong('Belum ada permintaan baru.');

    function grup(judul, arr) {
      return arr.length ? '<h3 class="grup-jadwal">' + judul + ' <span>' + arr.length + '</span></h3>' + arr.map(kartuJadwal).join('') : '';
    }
    document.getElementById('daftar-jadwal').innerHTML = d.disetujui.length
      ? grup('Belum ditandai selesai', terlewat) + grup('Hari ini · ' + tanggalIndo(hariIni), hari) + grup('Mendatang', depan)
      : kosong('Belum ada jadwal yang disetujui.');

    document.getElementById('daftar-riwayat').innerHTML = d.riwayat.length
      ? d.riwayat.map(kartuRiwayat).join('')
      : kosong('Belum ada riwayat.');
  }

  function tampil(id) {
    document.getElementById('status-muat').hidden = id !== 'status-muat';
    document.getElementById('status-galat').hidden = id !== 'status-galat';
    document.getElementById('isi-dokter').hidden = id !== 'isi-dokter';
  }

  function muat() {
    return ambil('/api/dokter').then(function (h) {
      if (h.status === 403) { window.location.replace('dasbor.html'); return; }
      if (!h.j.ok) throw new Error(h.j.pesan || 'Dashboard tidak dapat dimuat.');
      data = h.j;
      render();
      tampil('isi-dokter');
    });
  }

  function mulai() {
    tampil('status-muat');
    muat().catch(function (err) {
      document.getElementById('pesan-galat').textContent = err.name === 'TypeError' || err.name === 'SyntaxError'
        ? 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.'
        : err.message;
      tampil('status-galat');
    });
  }

  /* ---------- tindakan ---------- */
  var timerPesan;
  function beritahu(teks, peringatan) {
    var el = document.getElementById('pemberitahuan');
    el.textContent = teks;
    el.classList.toggle('kotak-info--kuning', !!peringatan);
    el.hidden = false;
    clearTimeout(timerPesan);
    timerPesan = setTimeout(function () { el.hidden = true; }, 8000);
  }
  var PESAN_BERHASIL = {
    '/api/dokter/setujui': 'Jadwal disetujui. Tautan Google Meet sudah dibuat dan tampil untuk pasien menjelang jadwal.',
    '/api/dokter/tolak': 'Permintaan ditolak. Pasien melihat alasan Anda dan dapat memilih jadwal lain.',
    '/api/dokter/selesai': 'Konsultasi ditandai selesai.'
  };

  function jalankan(kartu, tombol, jalur, kirim) {
    var galat = kartu.querySelector('[data-galat]');
    galat.textContent = '';
    kartu.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var label = tombol.innerHTML;
    tombol.textContent = 'Memproses…';
    return ambil(jalur, kirim)
      .then(function (h) {
        if (h.j.ok) return muat().then(function () { beritahu(PESAN_BERHASIL[jalur]); });
        // 409: permintaan sudah berubah (dibatalkan pasien atau diproses di tab lain).
        if (h.status === 409) return muat().then(function () { beritahu(h.j.pesan, true); });
        throw new Error(h.j.pesan || 'Belum berhasil. Coba lagi.');
      })
      .catch(function (err) {
        kartu.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        tombol.innerHTML = label;
        galat.textContent = err.name === 'TypeError' ? 'Koneksi terputus. Coba lagi.' : err.message;
      });
  }

  document.getElementById('isi-dokter').addEventListener('click', function (e) {
    var tombol = e.target.closest('button');
    if (!tombol || tombol.disabled) return;
    var kartu = tombol.closest('[data-id]');
    if (!kartu) return;
    var id = Number(kartu.getAttribute('data-id'));
    var aksi = tombol.getAttribute('data-aksi');

    if (tombol.hasAttribute('data-alasan')) {
      kartu.querySelector('textarea').value = ALASAN_CEPAT[Number(tombol.getAttribute('data-alasan'))][1];
      return;
    }
    if (aksi === 'buka-tolak' || aksi === 'buka-selesai') {
      var panel = kartu.querySelector('[data-panel="' + (aksi === 'buka-tolak' ? 'tolak' : 'selesai') + '"]');
      panel.hidden = false;
      panel.querySelector('textarea').focus();
      return;
    }
    if (aksi === 'tutup') {
      tombol.closest('.panel-aksi').hidden = true;
      kartu.querySelector('[data-galat]').textContent = '';
      return;
    }
    if (aksi === 'setujui') {
      jalankan(kartu, tombol, '/api/dokter/setujui', { id: id });
      return;
    }
    if (aksi === 'tolak') {
      var alasan = kartu.querySelector('textarea').value.trim();
      if (alasan.length < 5) {
        kartu.querySelector('[data-galat]').textContent = 'Tuliskan alasan penolakan untuk pasien (minimal 5 karakter).';
        return;
      }
      jalankan(kartu, tombol, '/api/dokter/tolak', { id: id, alasan: alasan });
      return;
    }
    if (aksi === 'selesai') {
      jalankan(kartu, tombol, '/api/dokter/selesai', { id: id, catatan: kartu.querySelector('textarea').value });
    }
  });

  document.querySelectorAll('[data-keluar]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      ambil('/api/keluar', {}).catch(function () {}).then(function () { window.location.href = 'masuk.html'; });
    });
  });
  document.getElementById('tombol-muat-ulang').addEventListener('click', mulai);
  document.getElementById('tombol-segarkan').addEventListener('click', function () {
    muat().catch(function () {});
  });

  // Muat ulang tiap menit, kecuali saat dokter sedang membaca evaluasi atau mengisi alasan/catatan.
  setInterval(function () {
    if (document.hidden || !data) return;
    if (document.querySelector('.panel-aksi:not([hidden]), details[open]')) return;
    muat().catch(function () {});
  }, 60000);

  if (window.location.protocol === 'file:') {
    document.getElementById('pesan-galat').textContent = 'Dashboard membutuhkan server SLIMFie. Jalankan situs dengan "npm start".';
    tampil('status-galat');
    return;
  }
  mulai();
})();
