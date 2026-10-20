/* SLIMFie — skrip landing page: navigasi melekat, menu seluler, tautan aktif,
   pita & testimoni berjalan, cek IMT, animasi masuk. */
(function () {
  "use strict";

  /* ---------- navigasi ---------- */
  var nav = document.querySelector("[data-nav]");
  var tautan = document.querySelector("[data-nav-tautan]");
  var tombolMenu = document.querySelector("[data-nav-tombol]");

  function perbaruiNav() {
    var melekat =
      nav.hasAttribute("data-nav-tetap") ||
      window.scrollY > 24 ||
      tautan.classList.contains("nav__pil--buka");
    nav.classList.toggle("nav--melekat", melekat);
    document.body.classList.toggle("nav-terang", melekat);
  }
  function tutupMenu() {
    tautan.classList.remove("nav__pil--buka");
    tombolMenu.setAttribute("aria-expanded", "false");
    tombolMenu.setAttribute("aria-label", "Buka menu");
    perbaruiNav();
  }
  perbaruiNav();
  window.addEventListener("scroll", perbaruiNav, { passive: true });

  tombolMenu.addEventListener("click", function () {
    var buka = tautan.classList.toggle("nav__pil--buka");
    tombolMenu.setAttribute("aria-expanded", buka ? "true" : "false");
    tombolMenu.setAttribute("aria-label", buka ? "Tutup menu" : "Buka menu");
    perbaruiNav();
  });
  tautan.addEventListener("click", function (e) {
    if (e.target.closest("a")) tutupMenu();
  });
  document.addEventListener("click", function (e) {
    if (
      tautan.classList.contains("nav__pil--buka") &&
      !e.target.closest("[data-nav]")
    )
      tutupMenu();
  });

  /* tandai tautan navigasi sesuai bagian yang sedang dibaca */
  var tautanNav = Array.prototype.slice.call(
    tautan.querySelectorAll('a[href^="#"]:not(.nav__cta-pil)'),
  );
  if ("IntersectionObserver" in window) {
    var pengamatBagian = new IntersectionObserver(
      function (entri) {
        entri.forEach(function (e) {
          if (!e.isIntersecting) return;
          tautanNav.forEach(function (a) {
            if (a.getAttribute("href") === "#" + e.target.id)
              a.setAttribute("aria-current", "true");
            else a.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    tautanNav.forEach(function (a) {
      var sasaran = document.querySelector(a.getAttribute("href"));
      if (sasaran) pengamatBagian.observe(sasaran);
    });
  }

  /* ---------- tombol Masuk menjadi Dashboard bila sudah login ---------- */
  var tautanMasuk = document.querySelectorAll("[data-tautan-masuk]");
  if (tautanMasuk.length && window.location.protocol !== "file:") {
    fetch("/api/saya", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (!j || !j.ok) return;
        tautanMasuk.forEach(function (a) {
          a.textContent = "Dashboard";
          a.href = j.pengguna.peran === "dokter" ? "dokter.html" : "dasbor.html";
        });
      })
      .catch(function () {
        /* tanpa server: tetap "Masuk" */
      });
  }

  /* ---------- pita & testimoni berjalan: gandakan isi agar putaran mulus ---------- */
  document.querySelectorAll("[data-gandakan]").forEach(function (jalur) {
    var asli = jalur.firstElementChild;
    var salinan = asli.cloneNode(true);
    salinan.setAttribute("aria-hidden", "true");
    salinan.querySelectorAll("a, button").forEach(function (el) {
      el.setAttribute("tabindex", "-1");
    });
    jalur.appendChild(salinan);
  });

  /* ---------- cek IMT (klasifikasi Asia-Pasifik, dipakai di Indonesia) ---------- */
  var tinggi = document.getElementById("imt-tinggi");
  var berat = document.getElementById("imt-berat");
  var angka = document.getElementById("imt-angka");
  var kategori = document.getElementById("imt-kategori");
  var penanda = document.getElementById("imt-penanda");
  var pesan = document.getElementById("imt-pesan");
  var SKALA_MIN = 15,
    SKALA_MAX = 40;

  function koma(n) {
    return n.toFixed(1).replace(".", ",");
  }

  function hitungImt() {
    var t = parseFloat(tinggi.value),
      b = parseFloat(berat.value);
    if (!(t >= 120 && t <= 220 && b >= 30 && b <= 250)) {
      angka.textContent = "–";
      kategori.textContent = "Isi tinggi 120–220 cm dan berat 30–250 kg";
      kategori.removeAttribute("data-tingkat");
      pesan.textContent = "";
      return;
    }
    var m = t / 100;
    var imt = Math.round((b / (m * m)) * 10) / 10; // 1 desimal, sama dengan yang ditampilkan
    var hasil;
    if (imt < 18.5) hasil = ["Berat badan kurang (Underweight)", "waspada"];
    else if (imt < 23) hasil = ["Normal (Ideal)", ""];
    else if (imt < 25) hasil = ["Kelebihan berat badan (Overweight)", "waspada"];
    else if (imt < 30) hasil = ["Obesitas Tingkat I", "sedang"];
    else if (imt < 35) hasil = ["Obesitas Tingkat II", "tinggi"];
    else hasil = ["Obesitas Ekstrem", "ekstrem"];

    angka.textContent = koma(imt);
    kategori.textContent = hasil[0];
    if (hasil[1]) kategori.setAttribute("data-tingkat", hasil[1]);
    else kategori.removeAttribute("data-tingkat");

    var persen =
      ((Math.min(Math.max(imt, SKALA_MIN), SKALA_MAX) - SKALA_MIN) /
        (SKALA_MAX - SKALA_MIN)) *
      100;
    penanda.style.left = persen + "%";

    var batasAtas = 22.9 * m * m;
    if (imt >= 23) {
      pesan.textContent =
        "Rentang IMT normal untuk tinggi Anda sekitar " +
        koma(18.5 * m * m) +
        "–" +
        koma(batasAtas) +
        " kg. Selisih dengan berat saat ini sekitar " +
        koma(b - batasAtas) +
        " kg.";
    } else if (imt < 18.5) {
      pesan.textContent =
        "IMT Anda di bawah rentang normal. Program penurunan berat badan tidak disarankan; konsultasikan kebutuhan gizi Anda dengan dokter.";
    } else {
      pesan.textContent =
        "IMT Anda dalam rentang normal (" +
        koma(18.5 * m * m) +
        "–" +
        koma(batasAtas) +
        " kg untuk tinggi Anda).";
    }
  }

  /* pop up saran untuk hasil obesitas: muncul setiap kali tombol Hitung IMT ditekan,
     dan ±1 detik setelah pengunjung berhenti mengetik (sekali per kategori) */
  var saran = document.getElementById("saran-imt");
  var tombolHitung = document.getElementById("imt-hitung");
  var jedaKetik;
  var kategoriTerakhir = "";
  var RISIKO = {
    sedang: "Kesehatan berisiko sedang",
    tinggi: "Kesehatan berisiko tinggi",
    ekstrem: "Sangat berbahaya",
  };

  function bukaSaran() {
    var tingkat = kategori.getAttribute("data-tingkat");
    if (!RISIKO[tingkat] || saran.open) return;
    var risiko = document.getElementById("saran-imt-risiko");
    document.getElementById("saran-imt-angka").textContent = angka.textContent;
    document.getElementById("saran-imt-kategori").textContent = kategori.textContent;
    risiko.textContent = RISIKO[tingkat];
    risiko.setAttribute("data-tingkat", tingkat);
    kategoriTerakhir = kategori.textContent;
    saran.showModal();
  }

  if (saran && typeof saran.showModal === "function") {
    saran.querySelector("[data-tutup-saran]").addEventListener("click", function () {
      saran.close();
    });
    // klik di luar kotak (di latar gelap) juga menutup
    saran.addEventListener("click", function (e) {
      if (e.target !== saran) return;
      var r = saran.getBoundingClientRect();
      var diLuar = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (diLuar) saran.close();
    });
  } else {
    saran = null;
  }

  function tekanHitung() {
    clearTimeout(jedaKetik);
    hitungImt();
    if (saran) bukaSaran();
  }

  function saranDariKetikan() {
    if (!RISIKO[kategori.getAttribute("data-tingkat")]) {
      kategoriTerakhir = ""; // keluar dari kategori obesitas: boleh muncul lagi nanti
      return;
    }
    if (kategori.textContent !== kategoriTerakhir) bukaSaran();
  }

  function saatMengetik() {
    hitungImt();
    if (!saran) return;
    clearTimeout(jedaKetik);
    jedaKetik = setTimeout(saranDariKetikan, 1000);
  }

  function enterHitung(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    tekanHitung();
  }

  if (tinggi && berat) {
    tinggi.addEventListener("input", saatMengetik);
    berat.addEventListener("input", saatMengetik);
    tinggi.addEventListener("keydown", enterHitung);
    berat.addEventListener("keydown", enterHitung);
    if (tombolHitung) tombolHitung.addEventListener("click", tekanHitung);
    hitungImt(); // tanpa pop up saat halaman pertama dibuka
  }

  /* popup asisten ditangani assets/js/asisten.js */

  /* ---------- animasi masuk: hanya untuk elemen yang belum terlihat saat dimuat ---------- */
  var reduksi =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduksi || !("IntersectionObserver" in window)) return;
  var pengamat = new IntersectionObserver(
    function (entri) {
      entri.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("muncul");
        e.target.classList.remove("tunggu");
        pengamat.unobserve(e.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
  );
  document.querySelectorAll("[data-muncul]").forEach(function (el) {
    if (el.getBoundingClientRect().top > window.innerHeight) {
      el.classList.add("tunggu");
      pengamat.observe(el);
    }
  });
})();
