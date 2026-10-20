/* =====================================================================
   SLIMFie — "Tanya Asisten": chatbot FAQ sederhana (tanpa AI, tanpa server)
   =====================================================================

   CARA MENGEDIT
   - Ubah jawaban di daftar FAQ di bawah ini. Setiap butir berisi:
       pertanyaan : judul pertanyaan (juga dipakai untuk tombol cepat)
       kataKunci  : kata/frasa pemicu, huruf kecil. Kata gaul ("brp", "gmn", "dok")
                    sudah diterjemahkan otomatis lewat daftar KATA_GAUL.
       jawaban    : teks jawaban. Pisahkan paragraf dengan baris kosong (\n\n).
       tombol     : (opsional) tombol aksi di bawah jawaban: { teks, href }
   - Tombol cepat yang muncul saat chat dibuka diatur di PERTANYAAN_CEPAT.
   - Nomor WhatsApp admin diatur di WHATSAPP.
   ===================================================================== */

var WHATSAPP = {
  nomor: '6282373400330',
  pesan: 'Halo SLIMFie, saya ingin bertanya tentang konsultasi gizi'
};

var SAPAAN = 'Halo! Saya asisten SLIMFie. Ada yang bisa saya bantu?';

var FAQ = [
  {
    id: 'apa',
    pertanyaan: 'Apa itu SLIMFie?',
    kataKunci: ['apa itu', 'slimfie itu', 'tentang slimfie', 'layanan apa', 'apa slimfie', 'kenalan'],
    jawaban: 'SLIMFie adalah layanan pengelolaan berat badan secara online bersama Dokter Spesialis Gizi Klinik (Sp.GK).\n\nAnda mendapat evaluasi kesehatan, rencana yang disesuaikan dengan kondisi dan gaya hidup Anda, serta pendampingan selama program. Semuanya tanpa antre di ruang tunggu.'
  },
  {
    id: 'cara-kerja',
    pertanyaan: 'Bagaimana cara kerjanya?',
    kataKunci: ['cara kerja', 'kerjanya', 'alur', 'proses', 'langkah', 'tahap', 'prosedur', 'sistemnya'],
    jawaban: 'Ada tiga langkah:\n\n1. Evaluasi kesehatan online: ceritakan kondisi, riwayat berat badan, dan target Anda.\n2. Konsultasi video dengan dokter Sp.GK, yang menyusun rencana perawatan personal.\n3. Jalani program dengan pemantauan berkala dan penyesuaian bila perlu.',
    tombol: { teks: 'Pelajari program', href: '#program' }
  },
  {
    id: 'harga',
    pertanyaan: 'Berapa harganya?',
    kataKunci: ['harga', 'biaya', 'berapa', 'tarif', 'bayar berapa', 'mahal', 'murah', 'paket', 'ongkos', 'rp', 'rupiah'],
    jawaban: 'Konsultasi awal Rp199.000 per konsultasi dengan dokter Sp.GK. Biaya ini sudah termasuk evaluasi kesehatan, penyusunan rencana, dan penjadwalan konsultasi video.\n\nBila dokter meresepkan terapi atau obat, biayanya diinformasikan terpisah sebelum Anda menyetujui. Tidak ada biaya tersembunyi.'
  },
  {
    id: 'daftar',
    pertanyaan: 'Bagaimana cara daftar?',
    kataKunci: ['daftar', 'mendaftar', 'registrasi', 'gabung', 'join', 'mulai', 'ikut program', 'cara ikut', 'booking', 'pesan jadwal'],
    jawaban: 'Klik "Mulai konsultasi", lalu isi evaluasi kesehatan awal (sekitar 3–5 menit). Di langkah terakhir Anda memverifikasi email dan melanjutkan ke pembayaran. Setelah lunas, Anda memilih jadwal konsultasi di dashboard pasien, lalu dokter menyetujuinya.',
    tombol: { teks: 'Mulai konsultasi', href: 'mulai.html' }
  },
  {
    id: 'dokter',
    pertanyaan: 'Siapa dokternya?',
    kataKunci: ['dokter', 'siapa', 'sp.gk', 'spgk', 'spesialis', 'ahli gizi', 'lisensi', 'berlisensi', 'str', 'tenaga medis'],
    jawaban: 'Konsultasi ditangani Dokter Spesialis Gizi Klinik (Sp.GK) yang berlisensi. Setiap rencana perawatan ditinjau dan disetujui oleh dokter tersebut.'
  },
  {
    id: 'media',
    pertanyaan: 'Konsultasinya lewat apa?',
    kataKunci: ['lewat apa', 'via apa', 'video', 'online', 'zoom', 'meet', 'tatap muka', 'offline', 'datang', 'klinik', 'call'],
    jawaban: 'Konsultasi berlangsung 100% online melalui video call Google Meet. Tautan video muncul di dashboard pasien setelah dokter menyetujui jadwal Anda.'
  },
  {
    id: 'jadwal',
    pertanyaan: 'Jadwal konsultasi dokter',
    kataKunci: ['jadwal', 'jam', 'kapan', 'hari', 'buka', 'praktik', 'praktek', 'sesi', 'sabtu', 'minggu', 'libur'],
    jawaban: 'Dua dokter spesialis gizi klinik (Sp.GK) bergantian berpraktik:\nSenin–Sabtu, 08.00–11.30 dan 13.30–17.30 WIB (20 menit per sesi).\n\nJadwal dipilih di dashboard pasien setelah pembayaran lunas. Asisten SLIMFie aktif 24 jam.'
  },
  {
    id: 'pembayaran',
    pertanyaan: 'Metode pembayaran',
    kataKunci: ['metode', 'pembayaran', 'bayar', 'transfer', 'qris', 'virtual account', 'va', 'bca', 'mandiri', 'bni', 'ewallet', 'gopay', 'ovo', 'dana'],
    jawaban: 'Pembayaran bisa melalui QRIS atau Virtual Account BCA, Mandiri, dan BNI.\n\nSetiap transaksi punya nomor pesanan unik, jadi Anda tidak akan ditagih dua kali walaupun tombol bayar tertekan berulang atau koneksi terputus.'
  },
  {
    id: 'data',
    pertanyaan: 'Apakah data saya aman?',
    kataKunci: ['data', 'aman', 'keamanan', 'privasi', 'rahasia', 'bocor', 'disimpan', 'pribadi'],
    jawaban: 'Data evaluasi hanya digunakan untuk keperluan medis. Jawaban skrining klinis hanya dibaca oleh dokter yang menangani Anda.\n\nAsisten ini tidak menyimpan percakapan. Mohon tidak menuliskan data medis atau data pribadi di chat ini.'
  },
  {
    id: 'siapa-saja',
    pertanyaan: 'Bisa untuk siapa saja?',
    kataKunci: ['siapa saja', 'untuk siapa', 'semua orang', 'cocok untuk', 'cocok untuk saya', 'boleh ikut', 'syarat', 'usia', 'umur', 'pria', 'wanita', 'laki', 'perempuan'],
    jawaban: 'SLIMFie terbuka untuk Anda yang ingin mengelola berat badan dengan pendampingan medis.\n\nEvaluasi awal mencakup skrining klinis. Beberapa kondisi, seperti penyakit ginjal berat, riwayat pankreatitis, atau gangguan makan, memerlukan penilaian khusus atau persetujuan dokter utama Anda terlebih dahulu.'
  },
  {
    id: 'obat',
    pertanyaan: 'Apakah ada obatnya?',
    kataKunci: ['obat', 'resep', 'terapi', 'suntik', 'pil', 'suplemen', 'diresepkan'],
    jawaban: 'Keputusan terapi sepenuhnya ada di tangan dokter saat konsultasi. Obat hanya diberikan bila ada indikasi medis setelah evaluasi, dan dokter akan menjelaskan manfaat, risiko, efek samping, serta pemantauannya.\n\nBanyak program cukup dengan panduan gizi dan perubahan gaya hidup.'
  },
  {
    id: 'admin',
    pertanyaan: 'Cara menghubungi admin',
    kataKunci: ['admin', 'hubungi', 'kontak', 'cs', 'customer service', 'whatsapp', 'email', 'telepon', 'nomor', 'chat admin', 'bicara dengan orang', 'manusia'],
    jawaban: 'Anda bisa menghubungi tim SLIMFie lewat WhatsApp atau email ke cs@slimfie.com. Asisten SLIMFie aktif 24 jam. Pertanyaan yang perlu dijawab tim akan dibalas pada hari yang sama, termasuk akhir pekan.',
    tombol: 'whatsapp'
  }
];

/* Lima pertanyaan yang tampil sebagai tombol saat chat dibuka (pakai id dari FAQ). */
var PERTANYAAN_CEPAT = ['apa', 'harga', 'daftar', 'dokter', 'pembayaran'];

/* Kata gaul/singkatan → kata baku sebelum dicocokkan. */
var KATA_GAUL = {
  brp: 'berapa', brapa: 'berapa', berapaan: 'berapa', hrg: 'harga', hrga: 'harga',
  gmn: 'bagaimana', gmna: 'bagaimana', gimana: 'bagaimana', bgmn: 'bagaimana', gman: 'bagaimana',
  dok: 'dokter', dokternya: 'dokter', dr: 'dokter', dktr: 'dokter',
  yg: 'yang', dgn: 'dengan', dg: 'dengan', utk: 'untuk', buat: 'untuk',
  gak: 'tidak', ga: 'tidak', nggak: 'tidak', ngga: 'tidak', gk: 'tidak', tdk: 'tidak', enggak: 'tidak',
  bs: 'bisa', bsa: 'bisa', kpn: 'kapan', dmn: 'dimana', knp: 'kenapa', napa: 'kenapa',
  sy: 'saya', aku: 'saya', gw: 'saya', gue: 'saya', ak: 'saya',
  wa: 'whatsapp', whatsap: 'whatsapp', watsap: 'whatsapp',
  byr: 'bayar', bayarnya: 'bayar', tf: 'transfer', trf: 'transfer',
  konsul: 'konsultasi', konsulnya: 'konsultasi', konsultasinya: 'konsultasi',
  obatnya: 'obat', resepnya: 'resep', daftarnya: 'daftar', regis: 'registrasi',
  udh: 'sudah', sdh: 'sudah', blm: 'belum', jg: 'juga', aja: 'saja', aj: 'saja', tp: 'tapi',
  kak: '', min: 'admin', mimin: 'admin', sis: '', gan: '', halo: '', hai: '', hi: ''
};

/* Gejala, penyakit, atau permintaan saran medis → tidak dijawab, diarahkan ke dokter Sp.GK. */
var KATA_MEDIS = [
  'sakit', 'nyeri', 'pusing', 'mual', 'muntah', 'diare', 'sembelit', 'demam', 'lemas', 'kesemutan',
  'gejala', 'keluhan', 'diagnosa', 'diagnosis', 'penyakit', 'kambuh', 'efek samping',
  'diabetes', 'gula darah', 'kencing manis', 'hipertensi', 'darah tinggi', 'tekanan darah',
  'kolesterol', 'asam urat', 'jantung', 'ginjal', 'liver', 'hati berlemak', 'maag', 'lambung', 'gerd',
  'tiroid', 'pcos', 'kanker', 'tumor', 'stroke', 'asma', 'hamil', 'menyusui', 'haid', 'menstruasi',
  'dosis', 'takaran', 'minum obat', 'obat apa', 'obat yang cocok', 'boleh minum', 'boleh makan', 'pantangan',
  'kondisi saya', 'riwayat saya', 'saya sakit', 'saya menderita', 'saya mengidap', 'sebaiknya saya', 'harus makan', 'diet apa', 'berapa kalori', 'bmi saya', 'turun berapa'
];

/* Kondisi darurat → arahkan segera ke layanan gawat darurat. */
var KATA_DARURAT = ['nyeri dada', 'sesak napas', 'sesak nafas', 'pingsan', 'tidak sadar', 'kejang', 'bunuh diri', 'mengakhiri hidup', 'pendarahan', 'perdarahan'];

var JAWABAN = {
  medis: 'Maaf, saya asisten otomatis dan tidak dapat memberi saran medis tentang gejala, penyakit, obat, atau pola makan untuk kondisi pribadi Anda.\n\nPertanyaan seperti ini sebaiknya dibahas langsung dengan dokter Spesialis Gizi Klinik (Sp.GK) saat konsultasi, agar dinilai sesuai riwayat kesehatan Anda.',
  darurat: 'Keluhan yang Anda sebutkan bisa memerlukan pertolongan segera. SLIMFie bukan layanan gawat darurat.\n\nSegera datang ke IGD terdekat atau hubungi 112.',
  tidakPaham: 'Maaf, saya belum menemukan jawaban untuk pertanyaan itu. Coba pilih salah satu pertanyaan di bawah, atau tanyakan langsung ke admin kami.',
  kosong: 'Silakan ketik pertanyaan Anda, misalnya "berapa harganya?" atau "gimana cara daftar?".',
  terimaKasih: 'Sama-sama! Semoga membantu. Bila ada pertanyaan lain, silakan ketik saja.'
};

/* =====================================================================
   Logika chatbot — tidak perlu diubah untuk mengganti isi FAQ.
   ===================================================================== */
(function () {
  'use strict';

  var agen = document.querySelector('[data-agen]');
  if (!agen) return;

  var panel = agen.querySelector('[data-agen-panel]');
  var tombolAgen = agen.querySelector('[data-agen-tombol]');
  var tutupAgen = agen.querySelector('[data-agen-tutup]');
  var log = agen.querySelector('[data-agen-log]');
  var cepat = agen.querySelector('[data-agen-cepat]');
  var form = agen.querySelector('[data-agen-form]');
  var isian = agen.querySelector('[data-agen-isian]');
  var reduksi = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var tautanWa = 'https://wa.me/' + WHATSAPP.nomor + '?text=' + encodeURIComponent(WHATSAPP.pesan);
  agen.querySelectorAll('[data-wa]').forEach(function (a) { a.href = tautanWa; });

  /* ---------- pencocokan ---------- */
  function normalkan(teks) {
    var kata = String(teks).toLowerCase()
      .replace(/[^a-z0-9.\s]/g, ' ')
      .replace(/\.(?!gk)/g, ' ')
      .split(/\s+/)
      .map(function (k) {
        if (Object.prototype.hasOwnProperty.call(KATA_GAUL, k)) return KATA_GAUL[k];
        // "harganya" → "harga", "biayanya" → "biaya"
        return /nya$/.test(k) && k.length > 5 ? k.slice(0, -3) : k;
      })
      .filter(Boolean);
    return ' ' + kata.join(' ') + ' ';
  }
  function memuat(teks, frasa) {
    return teks.indexOf(' ' + frasa + ' ') >= 0;
  }
  function ada(teks, daftar) {
    return daftar.some(function (f) { return memuat(teks, f); });
  }

  function cariJawaban(teksMentah) {
    var teks = normalkan(teksMentah);
    if (!teks.trim()) return { teks: JAWABAN.kosong };
    if (ada(teks, KATA_DARURAT)) return { teks: JAWABAN.darurat, tombol: { teks: 'Konsultasi dengan dokter Sp.GK', href: 'mulai.html' } };
    if (ada(teks, KATA_MEDIS)) return { teks: JAWABAN.medis, tombol: { teks: 'Konsultasi dengan dokter Sp.GK', href: 'mulai.html' } };

    var terbaik = null, skorTerbaik = 0;
    FAQ.forEach(function (f) {
      var skor = 0;
      f.kataKunci.forEach(function (k) {
        if (memuat(teks, k)) skor += k.indexOf(' ') >= 0 ? 2 : 1; // frasa lebih kuat dari satu kata
      });
      if (skor > skorTerbaik) { skorTerbaik = skor; terbaik = f; }
    });
    if (terbaik) return { teks: terbaik.jawaban, tombol: terbaik.tombol };
    if (ada(teks, ['terima kasih', 'makasih', 'thanks', 'thx', 'tengkyu', 'oke', 'ok', 'siap'])) return { teks: JAWABAN.terimaKasih };
    return { teks: JAWABAN.tidakPaham, tombol: 'whatsapp' };
  }

  /* ---------- tampilan ---------- */
  function gulirKeBawah() { log.scrollTop = log.scrollHeight; }

  function gelembung(teks, dari) {
    var el = document.createElement('div');
    el.className = 'agen__gelembung' + (dari === 'pengguna' ? ' agen__gelembung--pengguna' : '');
    String(teks).split('\n\n').forEach(function (paragraf) {
      var p = document.createElement('p');
      paragraf.split('\n').forEach(function (baris, i) {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(baris));
      });
      el.appendChild(p);
    });
    log.appendChild(el);
    return el;
  }

  function tombolAksi(tombol) {
    if (!tombol) return;
    var a = document.createElement('a');
    if (tombol === 'whatsapp') {
      a.className = 'agen__wa';
      a.href = tautanWa;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<svg class="ikon" aria-hidden="true"><use href="#i-wa"/></svg>';
      a.appendChild(document.createTextNode('Tanya Admin via WhatsApp'));
    } else {
      a.className = 'agen__aksi-tombol';
      a.href = tombol.href;
      a.textContent = tombol.teks;
      a.addEventListener('click', function () { if (tombol.href.charAt(0) === '#') setBuka(false); });
    }
    log.appendChild(a);
  }

  function jawab(hasil) {
    var mengetik = document.createElement('div');
    mengetik.className = 'agen__mengetik';
    mengetik.setAttribute('aria-label', 'Asisten sedang mengetik');
    mengetik.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(mengetik);
    gulirKeBawah();
    setTimeout(function () {
      mengetik.remove();
      gelembung(hasil.teks, 'asisten');
      tombolAksi(hasil.tombol);
      gulirKeBawah();
    }, reduksi ? 0 : 450);
  }

  function tanya(teks) {
    gelembung(teks, 'pengguna');
    jawab(cariJawaban(teks));
  }

  function renderCepat() {
    cepat.innerHTML = '';
    PERTANYAAN_CEPAT.forEach(function (id) {
      var f = FAQ.filter(function (x) { return x.id === id; })[0];
      if (!f) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'agen__cepat-tombol';
      b.textContent = f.pertanyaan;
      b.addEventListener('click', function () {
        gelembung(f.pertanyaan, 'pengguna');
        jawab({ teks: f.jawaban, tombol: f.tombol });
      });
      cepat.appendChild(b);
    });
  }

  /* ---------- buka / tutup ---------- */
  var sudahMenyapa = false;
  function setBuka(buka) {
    panel.hidden = !buka;
    agen.classList.toggle('agen--buka', buka);
    tombolAgen.setAttribute('aria-expanded', buka ? 'true' : 'false');
    if (buka && !sudahMenyapa) {
      sudahMenyapa = true;
      gelembung(SAPAAN, 'asisten');
      renderCepat();
    }
    if (buka) { gulirKeBawah(); isian.focus(); }
    else tombolAgen.focus();
  }

  tombolAgen.addEventListener('click', function () { setBuka(panel.hidden); });
  tutupAgen.addEventListener('click', function () { setBuka(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) setBuka(false);
  });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !e.target.closest('[data-agen]')) setBuka(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var teks = isian.value.trim();
    isian.value = '';
    if (!teks) { jawab({ teks: JAWABAN.kosong }); return; }
    tanya(teks.slice(0, 300));
  });
})();
