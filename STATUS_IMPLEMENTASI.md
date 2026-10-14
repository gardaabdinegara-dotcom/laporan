# Status implementasi — 14 Oktober 2026

## Sudah tersedia

Source aplikasi Next.js dengan tema Komando, layout desktop dan ponsel, data contoh interaktif yang tersimpan di browser, tombol data nyata, Google OAuth, role OWNER/ADMIN/VIEWER, repository Google Sheets, serta koordinator Redis.

Modul: dashboard, transaksi, siswa/pendaftaran, paket dan bulanan, cicilan, pembayaran/kuitansi, master, laporan, CSV/cetak, audit, refund, pembalik transaksi/penyesuaian, tutup periode, dan backup/pemulihan ke sumber baru.

Spreadsheet yang diberikan sudah memiliki 12 tabel. `Sheet1` dipertahankan. Akun awal dan tarif awal bernilai nol. OWNER awal `gardaabdinegara@gmail.com`. Tidak ada siswa, tagihan, pembayaran, atau transaksi simulasi di tabel nyata.

## Verifikasi

- Build produksi final Next.js 16.4.0 berhasil, termasuk pemeriksaan TypeScript dan pembuatan halaman produksi. Runtime yang ditetapkan adalah Node.js 24.
- 26 pengujian aturan keuangan lulus, termasuk rekonsiliasi, cicilan, refund, koreksi, periode tutup, hak akses, transfer dua sisi, serta pencegahan tagihan ganda.
- Browser memeriksa 360, 390, 760, 820, 1024, dan 1440 piksel tanpa overflow horizontal pada dashboard.
- Pembayaran berlebih ditolak, pembayaran yang sah memperbarui saldo, pencarian mempertahankan fokus, dan data contoh bertahan setelah reload.
- Navigasi ponsel, menu lainnya, serta formulir sentuh berfungsi.
- Alur lengkap di browser lulus: siswa baru, pendaftaran, tagihan tiga tahap, pembayaran, pembuatan bulanan dengan pratinjau, biaya, transfer, refund, pembalik penyesuaian/transaksi, CSV, laporan historis, penutupan periode, dan enam halaman pada ponsel 360 piksel.
- Akses API tanpa sesi mendapat 401; email di luar daftar mendapat 403; mutasi tanpa origin yang diizinkan mendapat 403; URL kredensial mendapat 404.
- Setup dan baca Google Sheets berhasil. Pengujian baca berizin memakai sesi lokal bertanda tangan yang dibuat oleh pemeriksa lokal. Tidak ada bypass autentikasi pada source aplikasi.
- Pergantian dari data nyata kosong kembali ke contoh mengembalikan angka contoh, tanpa mengimpor contoh ke spreadsheet.

## Konfigurasi dan uji akun yang tersisa

Pengelola perlu mengisi Google OAuth client ID/secret, Redis REST URL/token, session secret produksi, domain, dan service account JSON pada Vercel. Penulisan nyata secara default nonaktif. Login Google interaktif dan mutasi keuangan melalui Redis produksi belum diverifikasi langsung.

Deploy belum dilakukan. Tidak ada domain produksi yang dinyatakan aktif. Fitur P1 pada PRD seperti pengingat WhatsApp, payment gateway, upload bukti privat, serta backup otomatis terjadwal belum termasuk rilis ini. Bukti transaksi pada rilis ini berupa tautan HTTPS opsional.

Catatan teknis: angka turunan dihitung oleh aplikasi dari tabel sumber. Batch Sheets tidak dianggap menyediakan unique constraint lintas request. Operasi dengan hasil ambigu menahan penulisan sampai commit atau kegagalan dipastikan. Editor yang mengubah spreadsheet langsung dapat melewati kendali aplikasi; histori Sheets bukan arsip tahan manipulasi.
