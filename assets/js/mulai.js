/* SLIMFie — alur evaluasi kesehatan awal (mulai.html).
   Meniru /mulai versi lama: 7 langkah, BMI & proyeksi 3 bulan, skrining klinis, ringkasan.
   Di akhir, email diverifikasi dengan kode 6 angka (sekaligus login), lalu pesanan dikirim
   ke server (/api/pesanan) dan pasien diarahkan ke pembayaran. Jadwal dipilih setelah lunas
   di dashboard. Tanpa server, ringkasan dikirim lewat email. */
(function () {
  'use strict';

  var form = document.getElementById('form-alur');
  if (!form) return;

  /* ---------- data (dari lib/konten.js & lib/konfigurasi.js versi lama) ---------- */
  var SKRINING = [
    { judul: 'Kondisi kardiovaskular (jantung & pembuluh darah)', butir: [
      'Penyakit jantung koroner (Coronary artery disease)',
      'Gagal jantung kongestif (Congestive heart failure)'] },
    { judul: 'Gula darah, hormon & tiroid', butir: [
      'Diabetes Tipe 1',
      'Diabetes Tipe 2 (menggunakan insulin) atau dengan A1c lebih dari 10%',
      'Hipotiroidisme yang tidak diobati (Untreated hypothyroidism)'] },
    { judul: 'Jantung, darah & ginjal', butir: [
      'Serangan jantung atau stroke dalam 1 tahun terakhir',
      'Penggunaan obat pengencer darah warfarin (Coumadin/Jantoven)',
      'Penyakit ginjal berat (sedang atau akan segera menjalani cuci darah)'] },
    { judul: 'Lambung, pencernaan & hati', butir: [
      'Penyakit hati berat (termasuk sirosis atau penyakit hati berat lainnya)',
      'Kondisi pencernaan berat (gastroparesis, penyumbatan usus, reseksi usus, dll.)',
      'Riwayat atau sedang menderita pankreatitis (peradangan pankreas)',
      'Penyakit kantung empedu (Gallbladder disease)'] },
    { judul: 'Riwayat kanker (Cancer history)', butir: [
      'Kanker (diagnosis aktif, perawatan aktif, atau dalam masa remisi/bebas kanker kurang dari 5 tahun berturut-turut; tidak berlaku untuk kanker kulit non-melanoma yang dianggap sembuh hanya melalui eksisi sederhana)',
      'Riwayat pribadi atau keluarga memiliki kanker tiroid medulari (medullary thyroid cancer) atau sindrom neoplasia endokrin ganda tipe 2 (multiple endocrine neoplasia syndrome type 2)'] },
    { judul: 'Kesehatan mental & kesejahteraan (Mental health & well-being)', butir: [
      'Gangguan makan saat ini atau di masa lalu (Eating disorder)',
      'Pikiran untuk bunuh diri saat ini dan/atau riwayat percobaan bunuh diri di masa lalu'] },
    { judul: 'Penggunaan alkohol & obat-obatan', butir: [
      'Gangguan/ketergantungan penggunaan opioid, alkohol (termasuk minum berlebihan/binge drinking), atau zat berbahaya yang saat ini tidak diobati/tidak dipantau',
      'Penggunaan obat-obatan terlarang atau obat resep apa pun tanpa resep resmi/valid'] },
    { judul: 'Kesehatan mata & penglihatan (Eye & vision health)', butir: [
      'Retinopati diabetik (penyakit mata akibat diabetes), kerusakan saraf optik akibat trauma atau penurunan aliran darah, degenerasi makula, atau kebutaan'] },
    { judul: 'Tanda vital (detak jantung & tekanan darah)', butir: [
      'Detak jantung istirahat saat ini atau rata-rata di atas 110 denyut per menit',
      'Tekanan darah saat ini atau rata-rata lebih dari 160/100'] }
  ];

  var IZIN = [
    { judul: 'Perlu persetujuan dokter utama', butir: [
      'Riwayat operasi bariatrik (penurunan berat badan) sebelumnya',
      'Penggunaan obat pereda nyeri jenis opiat secara kronis/jangka panjang yang masih berlangsung',
      "Penyakit radang usus atau IBD (Crohn's disease, kolitis ulserativa, dll.)",
      'Operasi bariatrik, perut, atau panggul dalam 1 tahun terakhir',
      'Kadar natrium rendah atau diagnosis SIADH (syndrome of inappropriate antidiuretic hormone secretion)',
      'Penggunaan obat-obatan jenis opiat saat ini atau secara rutin',
      'Riwayat pribadi kanker tiroid (selain karsinoma tiroid medulari)',
      "Penyakit tiroid lainnya (hipertiroidisme, Graves', gondok, nodul, dll.)",
      'Riwayat kanker aktif, terduga kanker, atau kanker sebelumnya jenis apa pun',
      'Konsumsi alkohol berlebihan dalam satu kesempatan (binge drinking: 4 porsi atau lebih untuk wanita, 5 porsi atau lebih untuk pria)'] }
  ];

  var PRIORITAS = [
    'Mempertahankan massa otot (maintain muscle mass)',
    'Mengatasi efek samping seperti mual/muntah (manage side effects)',
    'Membantu penuaan dan umur panjang (kerusakan sel/DNA, disfungsi sistem kekebalan tubuh)',
    'Membantu meningkatkan fungsi kognitif dan kejernihan mental',
    'Membantu menjaga tingkat energi',
    'Membantu mengatasi resistensi insulin dan status hormonal',
    'Membantu meningkatkan kualitas tidur'
  ];

  var PROVINSI = [
    'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Bengkulu',
    'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Lampung', 'Banten', 'DKI Jakarta',
    'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat',
    'Nusa Tenggara Timur', 'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan',
    'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan',
    'Sulawesi Tenggara', 'Sulawesi Barat', 'Gorontalo', 'Maluku', 'Maluku Utara', 'Papua',
    'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan'
  ];

  var EMAIL_CS = 'cs@slimfie.com';

  /* ---------- utilitas ---------- */
  function $(sel, akar) { return (akar || form).querySelector(sel); }
  function nilai(nama) { var e = form.elements[nama]; return e && e.value ? String(e.value).trim() : ''; }
  function angkaDari(nama) { return parseFloat(nilai(nama).replace(',', '.')); }
  function koma(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function escap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function semuaCek(nama) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + nama + '"]:checked'), function (c) { return c.value; });
  }

  /* ---------- render daftar ---------- */
  function cekBaris(nama, nilaiCek, id) {
    return '<label class="cek-baris"><input type="checkbox" name="' + nama + '" value="' + escap(nilaiCek) + '" id="' + id + '"><span>' + escap(nilaiCek) + '</span></label>';
  }
  function renderKelompok(wadah, kelompok, nama, awalan) {
    wadah.innerHTML = kelompok.map(function (g, gi) {
      return '<div class="kelompok-skrining"><h3>' + escap(g.judul) + '</h3>' +
        g.butir.map(function (b, bi) { return cekBaris(nama, b, awalan + '-' + gi + '-' + bi); }).join('') + '</div>';
    }).join('');
  }
  renderKelompok($('[data-kelompok="skrining"]'), SKRINING, 'skrining', 'skr');
  renderKelompok($('[data-kelompok="izin"]'), IZIN, 'izin', 'izn');
  $('[data-daftar="prioritas"]').innerHTML = PRIORITAS.map(function (p, i) { return cekBaris('prioritas', p, 'pri-' + i); }).join('');
  $('#provinsi').insertAdjacentHTML('beforeend', PROVINSI.map(function (p) {
    return '<option value="' + escap(p) + '">' + escap(p) + '</option>';
  }).join(''));

  /* "Tidak ada dari pilihan di bawah ini" saling meniadakan dengan butir lain */
  form.querySelectorAll('[data-kosong]').forEach(function (kotak) {
    var grup = $('[data-kelompok="' + kotak.getAttribute('data-kosong') + '"]');
    kotak.addEventListener('change', function () {
      if (kotak.checked) grup.querySelectorAll('input').forEach(function (c) { c.checked = false; });
    });
    grup.addEventListener('change', function (e) {
      if (e.target.checked) kotak.checked = false;
    });
  });

  /* ---------- langkah ---------- */
  var langkahEls = Array.prototype.slice.call(form.querySelectorAll('.langkah-alur'));
  var TOTAL = 7;
  var aktif = 1;
  var labelLangkah = document.getElementById('label-langkah');
  var batang = document.getElementById('batang-progres');
  var btnKembali = document.getElementById('tombol-kembali');
  var btnLanjut = document.getElementById('tombol-lanjut');
  var btnKirim = document.getElementById('tombol-kirim');
  var navigasi = document.getElementById('navigasi-alur');

  function bersihkanGalat() {
    form.querySelectorAll('.galat[data-galat]').forEach(function (g) { g.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
  }
  function galat(n, pesan, elemen) {
    var t = $('[data-galat="' + n + '"]');
    t.textContent = pesan;
    if (elemen) { elemen.setAttribute('aria-invalid', 'true'); elemen.focus(); }
    return false;
  }

  function tampilkan(n) {
    aktif = n;
    langkahEls.forEach(function (l) {
      l.classList.toggle('langkah-alur--tampil', Number(l.getAttribute('data-langkah')) === n);
    });
    var selesai = n > TOTAL;
    labelLangkah.textContent = selesai ? 'Evaluasi lengkap' : 'Langkah ' + n + ' dari ' + TOTAL;
    batang.style.width = (100 * Math.min(n, TOTAL)) / TOTAL + '%';
    navigasi.hidden = selesai;
    btnKembali.hidden = n === 1;
    btnLanjut.hidden = n >= TOTAL;
    btnKirim.hidden = n !== TOTAL;
    tutupPanelKode();
    bersihkanGalat();
    if (n === TOTAL) isiRingkasan();
    var atas = document.querySelector('.alur__kepala').getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(0, atas), behavior: 'smooth' });
  }

  /* ---------- BMI ---------- */
  var bmi = null;
  var hasilBmi = document.getElementById('hasil-bmi');

  function kategoriBmi(b) {
    if (b < 18.5) return ['Berat badan kurang (Underweight)', 'waspada'];
    if (b < 23) return ['Normal (Ideal)', ''];
    if (b < 25) return ['Kelebihan berat badan (Overweight)', 'waspada'];
    if (b < 30) return ['Obesitas Tingkat I', 'sedang'];
    if (b < 35) return ['Obesitas Tingkat II', 'tinggi'];
    return ['Obesitas Ekstrem', 'ekstrem'];
  }

  function hitungBmi(diam) {
    var tinggi = angkaDari('tinggi');
    var berat = angkaDari('berat');
    if (!(tinggi >= 120 && tinggi <= 230)) return diam ? false : galat(1, 'Masukkan tinggi badan antara 120–230 cm.', form.elements.tinggi);
    if (!(berat >= 35 && berat <= 300)) return diam ? false : galat(1, 'Masukkan berat badan antara 35–300 kg.', form.elements.berat);

    var m = tinggi / 100;
    var b = Math.round((berat / (m * m)) * 10) / 10; // 1 desimal, sama dengan yang ditampilkan
    var kat = kategoriBmi(b);
    bmi = { b: b, kategori: kat[0], berat: berat, tinggi: tinggi };

    hasilBmi.hidden = false;
    document.getElementById('bmi-angka').textContent = koma(b);
    var pil = document.getElementById('bmi-kategori');
    pil.textContent = kat[0];
    if (kat[1]) pil.setAttribute('data-tingkat', kat[1]); else pil.removeAttribute('data-tingkat');
    document.getElementById('bmi-penanda').style.left = Math.max(0, Math.min(100, ((b - 15) / 25) * 100)) + '%';

    var catatan = document.getElementById('bmi-catatan');
    var normal = koma(18.5 * m * m) + '–' + koma(22.9 * m * m) + ' kg';
    if (b < 18.5) catatan.textContent = 'BMI Anda di bawah rentang normal. Program penurunan berat badan mungkin tidak sesuai; dokter akan menilai kebutuhan Anda lebih dulu.';
    else if (b < 23) catatan.textContent = 'BMI Anda dalam rentang normal (kategori Asia-Pasifik, ' + normal + ' untuk tinggi Anda). Program tetap dapat dijalani untuk menjaga komposisi tubuh.';
    else catatan.textContent = 'BMI Anda di atas rentang normal (' + normal + ' untuk tinggi Anda). Dokter akan menilai faktor risiko lain sebelum menyusun rencana.';
    bersihkanGalat();
    perbaruiGrafik();
    return true;
  }

  document.getElementById('tombol-bmi').addEventListener('click', function () { hitungBmi(false); });
  ['tinggi', 'berat'].forEach(function (nama) {
    form.elements[nama].addEventListener('input', function () { if (!hasilBmi.hidden) hitungBmi(true); else bmi = null; });
  });
  form.elements.target.addEventListener('input', perbaruiGrafik);

  /* ---------- grafik proyeksi 3 bulan (13 minggu) ---------- */
  function perbaruiGrafik() {
    var kotak = document.getElementById('grafik-proyeksi');
    var target = angkaDari('target');
    if (!bmi || !target || target >= bmi.berat) { kotak.hidden = true; return; }
    kotak.hidden = false;

    var turun = bmi.berat - target;
    var laju = 0.75;
    var mingguSelesai = turun / laju;
    var berat13 = Math.max(target, bmi.berat - 13 * laju);
    document.getElementById('proyeksi-teks').textContent =
      'Dengan laju aman 0,5–1 kg per minggu, target ' + koma(target) + ' kg diperkirakan tercapai dalam ' +
      Math.ceil(turun / 1) + '–' + Math.ceil(turun / 0.5) + ' minggu. Pada minggu ke-13, perkiraan berat Anda ' + koma(berat13) + ' kg.';

    var W = 620, H = 250, kiri = 56, kanan = 18, atas = 22, bawah = 34;
    var areaW = W - kiri - kanan, areaH = H - atas - bawah;
    var yMax = bmi.berat + 2;
    var yMin = Math.min(target, bmi.berat - 13) - 2;
    function x(w) { return kiri + (w / 13) * areaW; }
    function y(kg) { return atas + areaH - ((kg - yMin) / (yMax - yMin)) * areaH; }
    var teks = 'font-size="11" fill="#4f7568" font-family="Inter, sans-serif"';

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik proyeksi berat badan tiga bulan">';
    s += '<defs><linearGradient id="isiGaris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14a67f" stop-opacity=".24"/><stop offset="1" stop-color="#14a67f" stop-opacity="0"/></linearGradient></defs>';
    for (var i = 0; i <= 4; i++) {
      var kg = yMin + ((yMax - yMin) / 4) * i;
      s += '<line x1="' + kiri + '" y1="' + y(kg) + '" x2="' + (W - kanan) + '" y2="' + y(kg) + '" stroke="#e3f1ea" stroke-width="1"/>';
      s += '<text x="' + (kiri - 10) + '" y="' + (y(kg) + 4) + '" text-anchor="end" ' + teks + '>' + Math.round(kg) + ' kg</text>';
    }
    [0, 4, 8, 13].forEach(function (w) {
      s += '<text x="' + x(w) + '" y="' + (H - 10) + '" text-anchor="middle" ' + teks + '>' + (w === 0 ? 'Kini' : 'Mg ' + w) + '</text>';
    });

    var atasPita = [], bawahPita = [];
    for (var w = 0; w <= 13; w++) {
      atasPita.push(x(w) + ',' + y(Math.max(yMin, bmi.berat - 1 * w)));
      bawahPita.push(x(w) + ',' + y(Math.max(yMin, bmi.berat - 0.5 * w)));
    }
    s += '<polygon points="' + atasPita.concat(bawahPita.reverse()).join(' ') + '" fill="#14a67f" fill-opacity=".13"/>';

    s += '<line x1="' + kiri + '" y1="' + y(target) + '" x2="' + (W - kanan) + '" y2="' + y(target) + '" stroke="#4f7568" stroke-width="1.5" stroke-dasharray="5 5"/>';
    s += '<text x="' + (W - kanan) + '" y="' + (y(target) - 7) + '" text-anchor="end" ' + teks + '>target ' + koma(target) + ' kg</text>';

    var akhirX = mingguSelesai <= 13 ? x(mingguSelesai) : x(13);
    var akhirY = mingguSelesai <= 13 ? y(target) : y(berat13);
    var tengah = Math.min(mingguSelesai, 13) / 2;
    var jalur = 'M' + x(0) + ',' + y(bmi.berat) + ' Q' + x(tengah) + ',' + y(bmi.berat - laju * tengah) + ' ' + akhirX + ',' + akhirY;
    s += '<path d="' + jalur + ' L' + akhirX + ',' + (atas + areaH) + ' L' + kiri + ',' + (atas + areaH) + ' Z" fill="url(#isiGaris)"/>';
    s += '<path d="' + jalur + '" fill="none" stroke="#0e8165" stroke-width="3" stroke-linecap="round"/>';
    s += '<circle cx="' + x(0) + '" cy="' + y(bmi.berat) + '" r="5.5" fill="#0e8165" stroke="#fff" stroke-width="2.5"/>';
    s += '<circle cx="' + akhirX + '" cy="' + akhirY + '" r="5.5" fill="#0e8165" stroke="#fff" stroke-width="2.5"/>';
    s += '<text x="' + (x(0) + 10) + '" y="' + (y(bmi.berat) - 10) + '" font-size="11.5" font-weight="600" fill="#06231d" font-family="Inter, sans-serif">' + koma(bmi.berat) + ' kg</text>';
    s += '</svg>';
    document.getElementById('grafik-svg').innerHTML = s;
  }

  /* ---------- ringkasan ---------- */
  function dataRingkasan() {
    var daftar = function (arr) { return arr.length ? arr : ['—']; };
    return [
      ['Data tubuh'],
      ['Jenis kelamin', [nilai('gender')]],
      ['Tinggi / berat', [nilai('tinggi') + ' cm · ' + nilai('berat') + ' kg']],
      ['BMI', [bmi ? koma(bmi.b) + ' (' + bmi.kategori + ')' : '—']],
      ['Berat target', [nilai('target') + ' kg']],
      ['Kontak'],
      ['Nama', [nilai('nama')]],
      ['Email', [nilai('email')]],
      ['Telepon', [nilai('telepon')]],
      ['Domisili', [nilai('kota') + ', ' + nilai('provinsi')]],
      ['Skrining klinis'],
      ['Kondisi', daftar(semuaCek('skrining'))],
      ['Izin dokter utama', daftar(semuaCek('izin'))],
      ['Obat', [nilai('obat')]],
      ['Alergi', [nilai('alergi')]],
      ['Suplemen', [nilai('suplemen') || '—']],
      ['Prioritas', daftar(semuaCek('prioritas'))]
    ];
  }

  function isiRingkasan() {
    document.getElementById('ringkasan').innerHTML = dataRingkasan().map(function (b) {
      if (!b[1]) return '<div class="ringkasan__baris ringkasan__baris--judul"><dt>' + escap(b[0]) + '</dt><dd></dd></div>';
      return '<div class="ringkasan__baris"><dt>' + escap(b[0]) + '</dt><dd>' + b[1].map(escap).join('<br>') + '</dd></div>';
    }).join('');
  }

  function ringkasanTeks(ref) {
    var baris = ['Evaluasi kesehatan awal SLIMFie', 'Referensi: ' + ref, ''];
    dataRingkasan().forEach(function (b) {
      if (!b[1]) { baris.push('', '== ' + b[0].toUpperCase() + ' =='); return; }
      if (b[1].length > 1) { baris.push(b[0] + ':'); b[1].forEach(function (v) { baris.push('- ' + v); }); }
      else baris.push(b[0] + ': ' + b[1][0]);
    });
    baris.push('', 'Persetujuan penggunaan data & ketentuan layanan: disetujui');
    return baris.join('\n');
  }

  /* ---------- validasi ---------- */
  function validasi(n) {
    var el = form.elements;
    if (n === 1) {
      if (!$('input[name="gender"]:checked')) return galat(1, 'Pilih jenis kelamin.');
      if (!hitungBmi(false)) return false;
      var target = angkaDari('target');
      if (!target) return galat(1, 'Isi berat badan target Anda.', el.target);
      if (target >= bmi.berat) return galat(1, 'Berat target harus lebih rendah dari berat saat ini.', el.target);
      if (target / Math.pow(bmi.tinggi / 100, 2) < 18.5) return galat(1, 'Target tersebut membuat BMI di bawah 18,5. Pilih target yang lebih tinggi agar aman.', el.target);
      return true;
    }
    if (n === 2 && !semuaCek('skrining').length) return galat(2, 'Pilih minimal satu, atau centang “Tidak ada dari pilihan di bawah ini”.');
    if (n === 3 && !semuaCek('izin').length) return galat(3, 'Pilih minimal satu, atau centang “Tidak ada dari pilihan di bawah ini”.');
    if (n === 4) {
      if (!nilai('obat')) return galat(4, 'Mohon isi bagian obat. Tulis “tidak ada” bila tidak ada.', el.obat);
      if (!nilai('alergi')) return galat(4, 'Mohon isi bagian alergi. Tulis “tidak ada” bila tidak ada.', el.alergi);
    }
    if (n === 5 && !semuaCek('prioritas').length) return galat(5, 'Pilih minimal satu prioritas.');
    if (n === 6) {
      if (nilai('nama').length < 3) return galat(6, 'Masukkan nama lengkap Anda.', el.nama);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nilai('email'))) return galat(6, 'Masukkan alamat email yang valid, misalnya nama@email.com.', el.email);
      var telp = nilai('telepon').replace(/[^0-9]/g, '');
      if (telp.length < 9 || telp.length > 15) return galat(6, 'Masukkan nomor HP yang valid (9–15 angka).', el.telepon);
      if (!nilai('provinsi')) return galat(6, 'Pilih provinsi domisili.', el.provinsi);
      if (!nilai('kota')) return galat(6, 'Isi kota/kabupaten domisili.', el.kota);
    }
    if (n === 7) {
      if (!document.getElementById('persetujuan').checked) return galat(7, 'Centang persetujuan penggunaan data untuk evaluasi medis.');
      if (!document.getElementById('ketentuan').checked) return galat(7, 'Centang pernyataan bahwa Anda telah membaca ketentuan layanan.');
    }
    return true;
  }

  btnLanjut.addEventListener('click', function () {
    if (validasi(aktif) && aktif < TOTAL) tampilkan(aktif + 1);
  });
  btnKembali.addEventListener('click', function () {
    if (aktif > 1) tampilkan(aktif - 1);
  });
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if (aktif === TOTAL) btnKirim.click(); else btnLanjut.click();
  });

  /* ---------- kirim ke server (idempoten) ---------- */
  function uuidV4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* order_id dipakai ulang selama datanya sama (klik ganda, muat ulang, koneksi putus),
     dan dibuat baru bila pasien mengubah isian. */
  function orderIdUntuk(payloadTeks) {
    var KUNCI = 'slimfie_order';
    try {
      var simpan = JSON.parse(sessionStorage.getItem(KUNCI) || 'null');
      if (simpan && simpan.payload === payloadTeks) return simpan.order_id;
      var baru = uuidV4();
      sessionStorage.setItem(KUNCI, JSON.stringify({ payload: payloadTeks, order_id: baru }));
      return baru;
    } catch (e) {
      return form.dataset.orderId || (form.dataset.orderId = uuidV4());
    }
  }

  function dataKirim() {
    return {
      nama: nilai('nama'), email: nilai('email'), telepon: nilai('telepon'),
      provinsi: nilai('provinsi'), kota: nilai('kota'), gender: nilai('gender'),
      tinggi: nilai('tinggi'), berat: nilai('berat'), target: nilai('target'),
      skrining: semuaCek('skrining'), izin: semuaCek('izin'), prioritas: semuaCek('prioritas'),
      obat: nilai('obat'), alergi: nilai('alergi'), suplemen: nilai('suplemen'),
      persetujuan: document.getElementById('persetujuan').checked,
      ketentuan: document.getElementById('ketentuan').checked
    };
  }

  /* POST JSON; 404/405 berarti halaman dibuka tanpa server SLIMFie (mis. hosting statis). */
  function kirimJson(jalur, data, header) {
    var h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    Object.keys(header || {}).forEach(function (n) { h[n] = header[n]; });
    return fetch(jalur, { method: 'POST', headers: h, body: JSON.stringify(data) })
      .then(function (r) {
        if (r.status === 404 || r.status === 405) throw new Error('tanpa-server');
        return r.json().then(function (j) { return { status: r.status, j: j }; });
      });
  }

  function kirimPesanan() {
    var data = dataKirim();
    var orderId = orderIdUntuk(JSON.stringify(data));
    data.order_id = orderId;
    return kirimJson('/api/pesanan', data, { 'Idempotency-Key': orderId }).then(function (h) {
      if (h.j.ok) {
        window.location.href = 'pembayaran.html?order_id=' + encodeURIComponent(h.j.pesanan.order_id);
        return 'pindah';
      }
      if (h.status === 401) {
        tutupPanelKode();
        galat(TOTAL, 'Sesi login berakhir. Tekan tombol di bawah untuk menerima kode baru.');
        return;
      }
      galat(TOTAL, h.j.pesan || 'Data belum tersimpan. Coba lagi.');
    });
  }

  /* ---------- verifikasi email (kode 6 angka, sekaligus login) ---------- */
  var panelKode = document.getElementById('panel-kode');
  var isianKode = document.getElementById('kode-masuk');
  var btnKirimUlang = document.getElementById('tombol-kirim-ulang');
  var labelKirim = btnKirim.innerHTML;
  var LABEL_VERIFIKASI = 'Verifikasi &amp; lanjut ke pembayaran <svg class="ikon"><use href="#i-panah"/></svg>';

  function tutupPanelKode() {
    if (panelKode.hidden) return;
    panelKode.hidden = true;
    isianKode.value = '';
    btnKirim.innerHTML = labelKirim;
  }

  function sudahMasukSebagai(alamat) {
    return fetch('/api/saya', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.ok && j.pengguna.peran === 'pasien' && j.pengguna.email === alamat); })
      .catch(function () { return false; });
  }

  function mintaKode(alamat) {
    return kirimJson('/api/masuk/kode', { email: alamat }).then(function (h) {
      if (!h.j.ok) { galat(TOTAL, h.j.pesan || 'Kode belum terkirim. Coba lagi.'); return; }
      panelKode.hidden = false;
      document.getElementById('info-kode').innerHTML =
        'Kode 6 angka dikirim ke <strong>' + escap(h.j.email) + '</strong> dan berlaku ' + h.j.berlaku_menit + ' menit.';
      var uji = document.getElementById('kode-uji');
      uji.hidden = !h.j.kode_uji;
      uji.innerHTML = h.j.kode_uji
        ? '<span><strong>Mode uji.</strong> Email belum dikirim sungguhan. Kode Anda: <strong>' + escap(h.j.kode_uji) + '</strong></span>'
        : '';
      isianKode.focus();
    });
  }

  function verifikasiKode(alamat) {
    return kirimJson('/api/masuk/verifikasi', { email: alamat, kode: isianKode.value }).then(function (h) {
      if (h.j.ok) return true;
      galat(TOTAL, h.j.pesan || 'Kode belum bisa diverifikasi. Coba lagi.', isianKode);
      return false;
    });
  }

  var mengirim = false;
  function bukaKirim() {
    mengirim = false;
    btnKirim.disabled = false;
    btnKirim.innerHTML = panelKode.hidden ? labelKirim : LABEL_VERIFIKASI;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (aktif !== TOTAL) { btnLanjut.click(); return; }
    if (mengirim) return;
    bersihkanGalat();
    if (!validasi(TOTAL)) return;
    var verifikasi = !panelKode.hidden;
    if (verifikasi && isianKode.value.replace(/\D/g, '').length !== 6) {
      galat(TOTAL, 'Masukkan 6 angka kode verifikasi dari email Anda.', isianKode);
      return;
    }
    mengirim = true;
    btnKirim.disabled = true; // dinonaktifkan sebelum permintaan dikirim
    btnKirim.textContent = 'Memproses…';

    if (window.location.protocol === 'file:') { tampilkanEmail(); return; }

    var alamat = nilai('email').toLowerCase();
    var langkah = verifikasi
      ? verifikasiKode(alamat).then(function (ok) { return ok ? kirimPesanan() : null; })
      : sudahMasukSebagai(alamat).then(function (sudah) { return sudah ? kirimPesanan() : mintaKode(alamat); });

    langkah
      .then(function (hasil) { if (hasil !== 'pindah') bukaKirim(); })
      .catch(function (err) {
        // Halaman dibuka tanpa server: pakai jalur email.
        if (err && err.message === 'tanpa-server') { tampilkanEmail(); return; }
        bukaKirim();
        galat(TOTAL, 'Koneksi terputus. Tekan tombol di bawah lagi; data Anda tidak akan tercatat dua kali.');
      });
  });

  btnKirimUlang.addEventListener('click', function () {
    if (mengirim) return;
    bersihkanGalat();
    btnKirimUlang.disabled = true;
    mintaKode(nilai('email').toLowerCase())
      .catch(function () { galat(TOTAL, 'Koneksi terputus. Coba kirim ulang kode.'); })
      .then(function () { btnKirimUlang.disabled = false; });
  });

  /* ---------- cadangan tanpa server: kirim lewat email ---------- */
  var teksAkhir = '';
  function tampilkanEmail() {
    var kini = new Date();
    var ref = 'SF-' + String(kini.getFullYear()).slice(2) + String(kini.getMonth() + 1).padStart(2, '0') +
      String(kini.getDate()).padStart(2, '0') + '-' + Math.random().toString(16).slice(2, 6).toUpperCase();
    teksAkhir = ringkasanTeks(ref);
    document.getElementById('selesai-ref').textContent = 'Referensi ' + ref;
    document.getElementById('tautan-email').href = 'mailto:' + EMAIL_CS +
      '?subject=' + encodeURIComponent('Evaluasi SLIMFie ' + ref + ' — ' + nilai('nama')) +
      '&body=' + encodeURIComponent(teksAkhir);
    tampilkan(TOTAL + 1);
    document.getElementById('selesai').focus({ preventScroll: true });
  }

  document.getElementById('tombol-salin').addEventListener('click', function () {
    var status = document.getElementById('status-salin');
    function gagal() { status.textContent = 'Ringkasan tidak bisa disalin otomatis. Gunakan tombol Kirim lewat email.'; }
    if (!navigator.clipboard) return gagal();
    navigator.clipboard.writeText(teksAkhir).then(function () {
      status.style.color = 'var(--hijau-700)';
      status.textContent = 'Ringkasan disalin. Tempelkan ke email untuk ' + EMAIL_CS + '.';
    }, gagal);
  });
})();
