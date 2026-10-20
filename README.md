# SLIMFie

Landing page, evaluasi kesehatan awal, login pasien, pembayaran konsultasi idempoten, dan pemilihan jadwal dokter Sp.GK.

## Menjalankan

```bash
npm install        # better-sqlite3
npm start          # http://127.0.0.1:3000
```

Database dibuat otomatis di `data/slimfie.sqlite`. Lokasinya bisa diubah lewat `SLIMFIE_DB`.
`index.html` tetap bisa dibuka langsung tanpa server. Dalam kondisi itu, evaluasi memakai jalur email sebagai cadangan. Login, pembayaran, dan dashboard membutuhkan server.

Database dari versi sebelum dashboard (jadwal dipilih sebelum bayar) tidak dimigrasi. Server menolak berjalan dengan pesan yang jelas; hapus berkasnya lalu jalankan ulang.

## Alur

```
mulai.html      evaluasi 7 langkah
  → verifikasi email (kode 6 angka, sekaligus login)
  → POST /api/pesanan → pembayaran.html?order_id=… → POST /api/pembayaran (lunas)
  → dasbor.html  pilih dokter, tanggal, jam → POST /api/jadwal
  → status "menunggu persetujuan dokter"
dokter.html     dokter meninjau evaluasi pasien
       ├─ Setujui → tautan Google Meet dibuat otomatis; pasien melihatnya mulai 15 menit sebelum jadwal
       └─ Tolak   → alasan wajib diisi; pasien melihat alasannya lalu memilih jadwal lain
  → setelah konsultasi dimulai, dokter menandai selesai (+ catatan dokter, tidak terlihat pasien)
```

Pasien dan dokter masuk lewat `masuk.html` yang sama. Email dokter (dari `lib/konfigurasi.js`) langsung diarahkan ke `dokter.html`, pasien ke `dasbor.html`. Tombol **Masuk** di navbar berubah menjadi **Dashboard** sesuai peran.

## Dashboard dokter

| Bagian | Isi |
| --- | --- |
| Statistik | Menunggu persetujuan, konsultasi hari ini, mendatang, selesai |
| Permintaan | Pasien yang memilih dokter ini. Lencana BMI, temuan skrining (merah), dan butir perlu izin dokter utama (kuning). Evaluasi lengkap bisa dibuka. Tombol **Setujui & buat Meet** dan **Tolak** (dengan alasan cepat). |
| Jadwal | Dikelompokkan: belum ditandai selesai, hari ini, mendatang. Tombol **Gabung Meet** dan **Tandai selesai** (aktif setelah jam mulai). |
| Riwayat | 30 konsultasi terakhir yang selesai atau ditolak |

Aturan server (`lib/dokter.js`):

- Dokter hanya melihat dan mengubah jadwal miliknya. Jadwal dokter lain dijawab `404`, dan pasien yang membuka API dokter dijawab `403`.
- Perubahan status memakai compare-and-set. Klik Setujui ganda menghasilkan tepat satu persetujuan. Permintaan yang sudah dibatalkan pasien dijawab `409`.
- Permintaan yang jam mulainya sudah lewat tidak bisa disetujui, hanya ditolak.
- Selama `meetUji: true`, tautan Meet berupa contoh acak (`lib/meet.js`). Setelah Google Workspace siap, isi `buatTautan` dengan Google Calendar API, lalu set `meetUji: false`.
- Dashboard dimuat ulang tiap menit, kecuali saat dokter sedang membuka evaluasi atau mengisi alasan/catatan.

## Login (kode email, tanpa kata sandi)

| Hal | Aturan | Berkas |
| --- | --- | --- |
| Kode | 6 angka, berlaku 10 menit, hangus setelah 5 kali salah. Hanya kode terbaru yang berlaku. Disimpan sebagai HMAC. | `lib/auth.js` |
| Batas permintaan | Jeda 60 detik per email, maks. 5 kode per jam per email, maks. 20 per jam per alamat IP. | `lib/auth.js`, `lib/konfigurasi.js` |
| Sesi | Token acak 256 bit di cookie `HttpOnly; SameSite=Lax` (ditambah `Secure` saat `NODE_ENV=production`), berlaku 30 hari. Database hanya menyimpan hash-nya. | `lib/auth.js` |
| CSRF | Semua `POST` wajib `Content-Type: application/json`, dan header `Origin` (bila ada) harus dari situs ini. | `server.js` |
| Akun | Email baru otomatis menjadi akun pasien setelah kodenya benar. Akun dokter dan admin dibuat dari `lib/konfigurasi.js` setiap server dinyalakan. | `lib/db.js` |
| Kepemilikan | Pesanan akun lain dijawab `404`, sehingga `order_id` orang lain tidak bisa dibuka atau dibayar. | `lib/pesanan.js` |

`SLIMFIE_RAHASIA` mengisi kunci HMAC kode masuk. Tanpanya, kunci dibuat ulang setiap server dinyalakan, sehingga kode yang sedang berjalan hangus.

Selama `emailUji: true`, email tidak dikirim. Kode dicetak di konsol server dan ditampilkan di layar. Setelah Google Workspace SLIMFie siap, sambungkan pengiriman di `lib/email.js` lalu set `emailUji: false`.

## Jadwal dokter

Dua dokter Sp.GK dengan jadwal saling mengisi, diatur di `lib/konfigurasi.js`:

| | Senin | Selasa | Rabu | Kamis | Jumat | Sabtu |
| --- | --- | --- | --- | --- | --- | --- |
| Pagi 08.00–11.20 | Sp.GK 1 | Sp.GK 2 | Sp.GK 1 | Sp.GK 2 | Sp.GK 1 | Sp.GK 2 |
| Siang 13.30–17.30 | Sp.GK 2 | Sp.GK 1 | Sp.GK 2 | Sp.GK 1 | Sp.GK 2 | Sp.GK 1 |

Sesi 20 menit. Pasien bisa memilih 14 hari praktik ke depan, mulai besok menurut WIB. Pasien dapat memilih dokter tertentu atau "siapa saja yang tersedia".

| Lapis | Mekanisme | Berkas |
| --- | --- | --- |
| Syarat | Jadwal hanya bisa dipilih untuk pesanan yang sudah `dibayar`, dan jamnya harus jam praktik dokter tersebut. | `lib/jadwal.js` |
| Slot | Index unik `(dokter_id, tanggal, jam)` untuk jadwal yang menunggu persetujuan atau disetujui. Dua pasien yang memilih slot sama serentak: tepat satu berhasil, yang lain `409`. | `lib/db.js` |
| Pesanan | Index unik `order_id` untuk jadwal yang berjalan: satu pesanan, satu jadwal aktif. | `lib/db.js` |
| Ganti | Pasien boleh membatalkan jadwal yang belum disetujui lalu memilih lagi. Jadwal yang sudah disetujui hanya bisa diubah lewat CS. | `lib/jadwal.js` |


## Pembayaran idempoten

| Lapis | Mekanisme | Berkas |
| --- | --- | --- |
| Klien | Tombol Bayar dan Lanjut ke pembayaran dinonaktifkan sebelum permintaan dikirim. Klik atau Enter berikutnya diabaikan. | `assets/js/pembayaran.js`, `assets/js/mulai.js` |
| Kunci | `order_id` adalah UUID v4 yang dibuat di browser. Kunci ini dikirim di body dan header `Idempotency-Key`, lalu dipakai ulang saat mencoba lagi. | `assets/js/mulai.js` |
| Server | Status pesanan berpindah dengan compare-and-set (`UPDATE … WHERE status = 'menunggu_pembayaran'`) di dalam `BEGIN IMMEDIATE`. Hanya satu permintaan yang menang. | `lib/pesanan.js` |
| Database | `UNIQUE(order_id)` di tabel `pesanan` dan `pembayaran`. | `lib/db.js` |

Jawaban server untuk `POST /api/pembayaran`:

- `201`: pembayaran baru berhasil diproses.
- `200` dengan header `Idempotent-Replayed: true`: `order_id` sudah lunas. Hasil lama dikembalikan dan tidak ada tagihan baru.
- `409`: `order_id` sedang diproses oleh permintaan lain. Pemrosesan ganda ditolak dan klien menunggu hasilnya.
- `503`: hasil dari gateway belum pasti. Status pesanan tetap `diproses` dan boleh diklaim ulang setelah `batasProsesDetik`. Klaim ulang aman karena gateway dipanggil dengan `order_id` yang sama.

Untuk `POST /api/pesanan`, `order_id` yang sama dengan data yang sama menghasilkan `200` dan pesanan lama dikembalikan. Kalau datanya berbeda, atau `order_id` itu milik akun lain, server menjawab `422`.

## API

| Metode & alamat | Login | Kegunaan |
| --- | --- | --- |
| `POST /api/masuk/kode` | – | Kirim kode ke `{ email }` |
| `POST /api/masuk/verifikasi` | – | Tukar `{ email, kode }` dengan cookie sesi |
| `POST /api/keluar` | – | Hapus sesi |
| `GET /api/saya` | ya | Data akun dan semua pesanan beserta jadwalnya |
| `POST /api/pesanan` | pasien | Buat pesanan dari evaluasi (idempoten) |
| `GET /api/pesanan?order_id=` | pasien | Status satu pesanan |
| `POST /api/pembayaran` | pasien | Bayar `{ order_id, metode }` (idempoten) |
| `GET /api/slot` | ya | Slot kosong kedua dokter untuk 14 hari praktik |
| `POST /api/jadwal` | pasien | Ajukan `{ order_id, dokter, tanggal, jam }` |
| `POST /api/jadwal/batal` | pasien | Batalkan jadwal yang belum disetujui |
| `GET /api/dokter` | dokter | Permintaan, jadwal disetujui, dan riwayat milik dokter ini |
| `POST /api/dokter/setujui` | dokter | Setujui `{ id }` dan buat tautan Meet |
| `POST /api/dokter/tolak` | dokter | Tolak `{ id, alasan }` |
| `POST /api/dokter/selesai` | dokter | Tandai selesai `{ id, catatan }` |

## Sebelum live

- `lib/gateway.js` masih simulasi (`modeUji: true`). Ganti dengan gateway sungguhan, dan pastikan `order_id` dikirim sebagai kunci idempotensi gateway (Midtrans: `transaction_details.order_id`, Xendit: header `X-IDEMPOTENCY-KEY`). Konfirmasi lunas sebaiknya datang dari webhook gateway yang tanda tangannya sudah diverifikasi.
- `lib/email.js` masih mode uji (`emailUji: true`). Sambungkan ke Google Workspace.
- `lib/meet.js` masih mode uji (`meetUji: true`). Sambungkan ke Google Calendar API milik Workspace SLIMFie.
- Ganti nama dan email kedua dokter serta email admin di `lib/konfigurasi.js`.
- Jalankan dengan `NODE_ENV=production` di belakang HTTPS, dan isi `SLIMFIE_RAHASIA`.

## Uji

```bash
npm start                  # terminal 1
npm run uji:idempoten      # terminal 2
```

Skrip uji (42 cek) mencakup:

- **Login:** kode salah/benar/dipakai ulang, jeda permintaan, cookie, CSRF.
- **Kepemilikan pesanan** antar akun.
- **Pembayaran:** 10 permintaan bayar serentak menghasilkan tepat satu `201`.
- **Jadwal:** dua pasien merebut slot yang sama, jadwal kedua ditolak, ganti jadwal.
- **Dashboard dokter:**
  - akses silang dokter–pasien;
  - tolak dengan alasan lalu pasien memilih lagi;
  - Setujui ganda serentak;
  - tautan Meet baru tampil untuk pasien 15 menit sebelum jadwal;
  - tandai selesai beserta catatan yang tidak bocor ke pasien.
- **Database:** constraint `UNIQUE` menolak penyisipan langsung.

Skrip login sebagai `dokter1@slimfie.com` dan `dokter2@slimfie.com`, jadi jeda 60 detik per email berlaku. Tunggu 1 menit sebelum menjalankannya lagi pada server yang sama.
