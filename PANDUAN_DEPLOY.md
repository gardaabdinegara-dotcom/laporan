# Deployment Garda Keuangan ke Vercel

Dokumen ini menjelaskan setup aplikasi yang sudah dibangun. Deployment belum dilakukan. Tema yang dipakai adalah Komando, dan OWNER awal **gardaabdinegara@gmail.com**.

## 1. Jalankan dan periksa versi lokal

Gunakan Node.js 24, kemudian dari folder proyek:

```powershell
npm ci
npm run build
npm run check
npm run dev
```

Buka `http://localhost:3012`. Coba pembayaran Nadia Rp150.000: saldo contoh menjadi Rp5.600.000 dan tunggakan menjadi nol. Pulihkan data contoh dari Pengaturan setelah mencoba.

Jika `.env.local` belum tersedia, salin `.env.example` menjadi `.env.local`. Isi nilai rahasia di file lokal tersebut, bukan pada `.env.example`.

## 2. Spreadsheet dan service account

Sumber produksi yang dipilih:

[Laporan Keuangan](https://docs.google.com/spreadsheets/d/1_F6hZLKgpYdehD4BaWKLs1fG6E3T-gvBuJELvLLdN7s/edit)

Pastikan Google Sheets API aktif dan service account mendapat akses Editor pada spreadsheet. Izin baca dan penambahan tabel telah diverifikasi dalam pekerjaan ini. `Sheet1` tetap tersedia. Tabel database sudah disiapkan tanpa siswa atau transaksi contoh.

Pada lokal development, backend dapat membaca `credentials.json` yang ada di root. Pada deployment produksi, backend hanya memakai **`GOOGLE_SERVICE_ACCOUNT_JSON`** dari environment Vercel. File kredensial tidak disertakan dalam paket source.

Untuk variabel tersebut, salin **seluruh objek JSON service account yang valid** ke field Secret di Vercel. Jangan menambahkan pembungkus tanda kutip atau mengubah private key menjadi teks yang berbeda. Library menangani private key dari JSON. Jangan memakai prefix `NEXT_PUBLIC_`.

Jika memakai spreadsheet baru, bagikan akses terlebih dahulu, ubah ID sumber pada konfigurasi, lalu jalankan setup. Perintah tanpa `--apply` hanya menampilkan rencana:

```powershell
npm run sheets:setup
npm run sheets:setup -- --apply
npm run sheets:check
```

Setup pemeliharaan memerlukan `APP_WRITE_ENABLED=false` dan aplikasi yang dihentikan dari penulisan. Setup menambahkan tab yang belum ada dan tidak menghapus tab lama. Saldo awal serta tarif baru bernilai nol sampai diisi pemilik.

## 3. Google OAuth untuk login pengguna

Service account digunakan untuk akses spreadsheet. Pengelola masuk menggunakan OAuth client aplikasi web yang berbeda.

Pada Google Cloud Console milik Anda:

1. Buka Google Auth Platform / konfigurasi OAuth pada project yang dipilih.
2. Isi nama aplikasi, email dukungan, dan informasi consent yang diminta.
3. Jika audience External masih berstatus Testing, tambahkan `gardaabdinegara@gmail.com` sebagai test user. Tambahkan pengguna lain yang ingin menguji login.
4. Buat OAuth client bertipe **Web application**.
5. Tambahkan Authorized redirect URI lokal: `http://localhost:3012/api/auth/callback`.
6. Setelah domain Vercel diketahui, tambahkan redirect URI produksi: `https://DOMAIN-ANDA.vercel.app/api/auth/callback`.
7. Jika antarmuka meminta Authorized JavaScript origins, gunakan origin domain aplikasi tanpa path, misalnya `https://DOMAIN-ANDA.vercel.app`.
8. Simpan Client ID dan Client secret ke environment server yang sesuai.

Scope aplikasi hanya `openid`, `email`, dan `profile` untuk login. Aplikasi memeriksa email terverifikasi, state, nonce, PKCE, masa sesi, dan daftar pengguna yang diizinkan. Akun di luar daftar ditolak oleh server. Setelah login OWNER, tambahkan ADMIN atau VIEWER melalui Pengaturan.

Rujukan: [OAuth untuk aplikasi web Google](https://developers.google.com/identity/protocols/oauth2/web-server) dan [identitas OpenID Google](https://developers.google.com/identity/openid-connect/openid-connect).

## 4. Redis untuk koordinasi penulisan

Buat database Redis di Upstash atau integrasi Upstash melalui Vercel. Ambil REST URL dan REST token dari database tersebut. Isi:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Aplikasi memakai operasi atomik Redis untuk gerbang penulisan dan batas frekuensi. Data siswa, nominal, tagihan, serta audit utama tetap berada di Google Sheets. Gerbang operasi tidak otomatis kedaluwarsa sehingga instance yang mati tidak membolehkan penulis berikutnya melewati hasil simpan yang belum jelas.

Gunakan database/namespace terpisah untuk uji dan produksi. Jangan reset Redis saat ada operasi yang sedang diverifikasi. Rujukan konfigurasi: [SDK REST Upstash Redis](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).

## 5. Environment Vercel

| Variabel | Nilai produksi |
| --- | --- |
| `APP_URL` | Origin HTTPS aplikasi, tanpa garis miring terakhir |
| `APP_TIMEZONE` | `Asia/Jakarta`, atau zona Indonesia yang dipilih sebelum pencatatan pertama |
| `INITIAL_OWNER_EMAIL` | `gardaabdinegara@gmail.com` |
| `AUTH_SECRET` | Nilai acak kuat minimal 32 karakter |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID OAuth aplikasi web |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret OAuth |
| `GOOGLE_SPREADSHEET_ID` | `1_F6hZLKgpYdehD4BaWKLs1fG6E3T-gvBuJELvLLdN7s` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Seluruh JSON service account, sebagai Secret |
| `UPSTASH_REDIS_REST_URL` | REST URL database Redis produksi |
| `UPSTASH_REDIS_REST_TOKEN` | REST token, sebagai Secret |
| `APP_WRITE_ENABLED` | `false` saat verifikasi awal, kemudian `true` setelah konfigurasi siap |

Buat session secret sendiri, tanpa menyalin contoh tetap dari internet:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Perintah itu memang mencetak secret untuk Anda salin secara privat. Jangan memasukkan hasilnya ke screenshot, repository, atau chat publik.

Environment Development, Preview, dan Production dipisahkan. **Preview tidak diberi service account yang dapat mengakses sumber produksi.** Untuk preview desain, biarkan OAuth/Redis kosong dan `APP_WRITE_ENABLED=false`; mode contoh tetap berfungsi. Untuk pengujian backend, gunakan spreadsheet uji, service account uji, OAuth client/redirect yang sesuai, dan Redis uji.

Perubahan environment Vercel diterapkan pada deployment baru. Rujukan: [Environment variables Vercel](https://vercel.com/docs/environment-variables).

## 6. Deploy

1. Unggah source ke repository Git pilihan Anda. Periksa daftar file sebelum push; `credentials.json`, `.env.local`, `.codex`, backup, `.next`, dan `node_modules` tidak ikut.
2. Di Vercel pilih Add New Project, lalu import repository tersebut.
3. Framework preset: **Next.js**. Root directory: folder yang berisi `package.json` proyek ini.
4. Node.js: **24.x**. Install command: `npm ci`. Build command: `npm run build`. Output directory memakai default Next.js.
5. Masukkan environment Production. Pada deployment pertama, mode contoh bisa dipakai untuk melihat domain dan tampilan sambil melengkapi OAuth.
6. Setelah domain diketahui, samakan `APP_URL` dan redirect URI Google dengan domain itu. Hindari mencampur `www`, subdomain, atau HTTP/HTTPS yang berbeda.
7. Redeploy sesudah perubahan konfigurasi.
8. Klik **Gunakan data nyata**, login dengan Gmail OWNER, lalu pastikan sumber kosong tampil sebagai saldo nol dan tanpa siswa contoh.
9. Pada Pengaturan, isi nama akun, saldo awal nyata, tanggal mulai pencatatan, serta tarif program sebenarnya **sebelum transaksi pertama**.
10. Jika seluruh konfigurasi siap, ubah `APP_WRITE_ENABLED=true` dan redeploy. Uji satu transaksi nyata yang memang perlu dicatat, lalu cocokkan saldo dengan sumbernya.

Node 24 tersedia pada Vercel dan ditetapkan dalam `package.json`. Rujukan: [Versi Node.js Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Untuk operasional usaha, pilih paket yang mengizinkan penggunaan komersial; dokumentasi [Vercel Hobby](https://vercel.com/docs/plans/hobby) membatasi Hobby pada penggunaan pribadi nonkomersial.

## 7. Pemeriksaan sesudah deploy

- Halaman awal memakai data contoh dan labelnya terlihat.
- Data nyata memerlukan login; akun yang tidak diizinkan ditolak.
- Role ADMIN tidak dapat mengelola pengguna, refund, atau koreksi OWNER.
- Kartu saldo nyata cocok dengan saldo awal dan transaksi sumber.
- Pembayaran sebagian mengurangi tagihan yang tepat dan menghasilkan kuitansi.
- Transfer memindahkan uang antarakun dengan kontribusi neto nol pada saldo total.
- Klik ganda tidak menghasilkan dua dampak transaksi.
- Bila respons terputus, pemeriksaan operation ID menemukan hasil yang sudah tersimpan.
- Tutup periode menolak mutasi bertanggal dalam periode tersebut.
- CSV dan cetak laporan memakai periode dan label sumber yang benar.
- Buat backup lengkap setelah verifikasi.

Jangan menggunakan siswa/transaksi simulasi pada tabel produksi untuk pengujian rutin. Pengujian alur tulis lengkap dilakukan pada sumber uji terpisah.

## 8. Backup dan pemulihan

OWNER dapat menekan **Pengaturan → Backup lengkap**. Backup berupa JSON semua tabel, bukan hanya laporan ringkasan. Simpan pada lokasi privat.

Alternatif dari komputer pengelola:

```powershell
New-Item -ItemType Directory -Path backups -Force
npm run backup -- backups/garda-backup-baru.json
npm run backup:validate -- backups/garda-backup-baru.json
```

Perintah backup menolak menimpa file yang sudah ada. Untuk pemulihan:

1. Siapkan spreadsheet baru, bagikan kepada service account, dan ubah `GOOGLE_SPREADSHEET_ID` lokal ke tujuan baru.
2. Pastikan `APP_WRITE_ENABLED=false`, hentikan aplikasi/penulis lain, lalu jalankan setup pada tujuan baru.
3. Jalankan `npm run backup:restore -- backups/garda-backup-baru.json --apply`.
4. Perintah menolak sumber tujuan yang sudah memiliki siswa, transaksi, tagihan, operasi, atau saldo awal bukan nol.
5. Periksa jumlah record, relasi, saldo, sisa tagihan, dan akses OWNER sebelum mengarahkan produksi ke sumber baru.
6. Backup berlabel simulasi ditolak untuk pemulihan produksi.

Pemulihan besar yang melewati batas ukuran satu batch memerlukan migrasi terkontrol. Proyek ini membatasi operasi tulis menjadi sekitar 1,8 MB per batch.

## 9. Jika penyimpanan sedang diverifikasi

Jangan membuat transaksi pengganti dengan ID baru. Tekan **Periksa status**. OWNER juga dapat membuka **Pengaturan → Periksa penulisan** untuk menemukan operasi tertahan.

Jika operasi ditemukan di tab `Operasi`, aplikasi menganggap commit terkonfirmasi, memulihkan gerbang, dan memperbarui data. Setup awal yang tabelnya telah lengkap juga dapat dikonfirmasi ulang.

Jika operasi tidak ditemukan, **ketiadaan baris sesaat belum membuktikan penulisan gagal**. Aplikasi sengaja tidak membuka gerbang secara otomatis. Admin teknis perlu menghentikan penulis, memeriksa log Vercel dan status request Google, menunggu request upstream berhenti, membuat backup, lalu merekonsiliasi operation ID dan semua baris terkait. Gerbang Redis `garda:finance:gate:<SPREADSHEET_ID>` baru boleh dibersihkan setelah hasil tersebut dipastikan. Simpan ID dan alasan tindakan pemeliharaan. Jangan menambah transaksi hanya untuk menghilangkan peringatan.

## 10. Troubleshooting

| Gejala | Pemeriksaan |
| --- | --- |
| Tombol nyata membuka informasi login belum siap | OAuth client ID/secret dan `AUTH_SECRET` belum lengkap |
| `redirect_uri_mismatch` dari Google | URI callback harus sama persis dengan `APP_URL` + `/api/auth/callback` |
| Akun OWNER ditolak saat login | Periksa email, daftar test user Google bila masih Testing, tab Pengguna, dan status aktif |
| Service account ditolak / 403 Sheets | Aktifkan Sheets API, share sebagai Editor, dan cek secret JSON serta ID spreadsheet |
| Data nyata terbaca tetapi tombol simpan nonaktif | Redis atau `APP_WRITE_ENABLED=true` belum siap; redeploy setelah mengisi environment |
| 429 / kuota penuh | Tunggu pembaruan kuota; kurangi refresh. Aplikasi membatasi penulisan dan baca bersama |
| Header atau ID ganda terdeteksi | Hentikan penulisan, backup, dan perbaiki struktur pada mode pemeliharaan |
| Saldo awal tidak bisa diubah | Akun sudah mempunyai transaksi. Gunakan prosedur koreksi/penyesuaian yang dapat ditelusuri |
| Browser lain tidak melihat perubahan contoh | Data contoh lokal pada browser masing-masing; gunakan data nyata untuk kerja bersama |
| Build di Vercel gagal | Gunakan Node 24, `npm ci`, framework Next.js, dan root yang benar. Jangan memakai output directory `dist` |
| Tanggal laporan tidak sesuai | Periksa zona waktu usaha dan tanggal efektif transaksi; bulan layanan berbeda dari tanggal uang diterima |

## Batas verifikasi saat penyerahan

Build produksi, pengujian aturan keuangan, alur browser, setup tabel, pembacaan Google Sheets, serta penolakan akses tanpa izin telah diperiksa. Login Google melalui consent screen produksi dan penyimpanan keuangan melalui Redis nyata belum diuji karena kredensial OAuth/Redis belum tersedia. Verifikasi kedua alur itu setelah environment akun Anda diisi, sebelum menerima transaksi operasional.
