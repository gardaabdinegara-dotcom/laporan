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

## Pembaruan 15 Oktober 2026

Source perbaikan telah dibuat setelah seluruh cakupan disetujui pengguna. TypeScript, 32 pengujian otomatis, dan build produksi Next.js berhasil. Tes memakai data sintetis/Redis terisolasi, mencakup pencocokan saldo, penolakan tutup bulan berselisih, perlindungan periode terbit, pemulihan ID/isi/akun asli, status gerbang, dan keputusan penolakan persisten.

Browser data contoh memverifikasi selisih kas Rp1.000 menolak Tutup periode, Simpan pencocokan mempertahankan selisih tanpa mengubah saldo buku, dan pengisian saldo cocok berhasil menutup bulan. Laporan menampilkan hasil pemeriksaan serta status bulan. Lebar 320/360 px dan desktop 1440 px tidak mengalami overflow halaman pada laporan yang diperiksa. Console tidak menampilkan error pada alur yang diperiksa.

Login Google interaktif, jaringan Redis produksi, dan retry sesungguhnya pada Vercel belum diverifikasi. Tidak ada transaksi atau struktur spreadsheet operasional yang ditulis pada pengerjaan perbaikan ini. source/ZIP lokal dan hasil build tidak menyatakan deployment telah dilakukan.

## Terrace terang/gelap — 15 Oktober 2026

Terrace telah diterapkan pada enam halaman aplikasi, formulir dan dialog. Tagihan memiliki ringkasan, filter status, pencarian, serta rincian yang bisa dibuka. Preferensi mode tersimpan setelah reload; mode awal diterapkan sebelum tampilan pertama halaman.

QA lokal: 48 kombinasi halaman/mode/lebar (320, 390, 768, 1280 px) tidak melampaui lebar halaman. Filter dan pencarian tagihan, rincian pembayaran, menu ponsel, serta dialog transaksi/pencocokan diperiksa dengan data contoh. Console tidak menunjukkan error pada alur tersebut. TypeScript, 32 pengujian aturan, dan build produksi lulus. Pemeriksaan ini tidak melakukan deployment, login Google produksi, atau transaksi Sheets operasional. Dialog cetak/PDF tidak diotomatisasi ulang.

## Pembaruan laporan — 21 Oktober 2026

Source pembaruan telah diimplementasikan sesuai PRD bagian 21–22, dengan Terrace terang/gelap.

Tersedia buku kas bersaldo berjalan per akun/gabungan, pilihan bulan/tahun/rentang tanggal, laba rugi, neraca, aset dan jadwal penyusutan, omzet/pajak, pemeriksaan antar laporan, CSV, serta stylesheet cetak putih dengan ruang tanda tangan. Ringkasan kas dan pencocokan/tutup bulan sebelumnya tetap tersedia pada tab Ringkasan kas.

OWNER dapat menetapkan dasar kas dengan penyesuaian nonkas, pemetaan kategori menurut bulan berlaku, aset awal atau aset yang ditautkan ke pembelian, pembukaan neraca seimbang, jurnal nonkas beserta pembalik, versi tarif, dan tautan pembayaran pajak ke tahun/bulan kewajiban. Seluruh perintah memakai kendali simpan/audit/peran yang sama. Penyusutan diakui setiap akhir bulan dan tidak membuat kas keluar baru. Data belum lengkap berstatus Draf; periode yang belum berakhir ditandai proyeksi.

Struktur versi 2 menambah enam tabel laporan, mempertahankan 12 tabel lama dan Sheet1. Sumber versi 1 tetap dapat dibaca; mutasi menunggu migrasi. Pembaruan lewat browser memerlukan cadangan terbaru yang identitasnya diperiksa kembali di bawah gerbang Redis. CLI membuat cadangan ke file baru sebelum migrasi. Backup versi 1 dan 2 didukung; pemulihan tetap menuju sumber kosong. Migrasi yang telah selesai dapat diulang tanpa penulisan baru. Versi skema yang lebih baru ditolak daripada diturunkan.

Verifikasi lokal:

- TypeScript dan **62 pengujian otomatis** lulus, termasuk aturan lama, pemetaan historis, saldo lintas tahun, penyusutan/pembulatan/residu, koreksi aset/jurnal, pemisahan pajak lintas tahun, izin peran, batas presisi rupiah, upgrade backup, dan migrasi dengan API tiruan.
- Build produksi Next.js berhasil setelah pembaruan.
- Fixture terisolasi berdasarkan contoh 2025 menghasilkan penerimaan Rp134.500.000, biaya jasa Rp118.350.000, penyusutan Rp10.268.750, rugi Rp10.648.750, kas akhir Rp14.940.000, dan perhitungan pajak contoh Rp672.500. Selisih sumber neraca Rp800.000 tidak diselesaikan dengan angka penyeimbang otomatis.
- Browser memeriksa **56 kombinasi laporan/mode/lebar** (7 tab × 2 mode × 320/390/768/1280 px) tanpa overflow halaman.
- **28 kombinasi formulir ponsel** (7 formulir × 2 mode × 320/390 px) tidak meluber; seluruh input nominal/tanggal/pilihan yang diperiksa memakai font 16 px.
- Alur data contoh memverifikasi penolakan perubahan pada periode tertutup, pembukaan kembali, dasar laporan, pemetaan, verifikasi pembukaan, pencatatan aset awal, tarif pajak, jurnal seimbang, pembalik tanpa pengulangan, filter rekening, pilihan tahun, rentang tanggal, dan penolakan ekspor pada rentang terbalik.
- CSV buku kas diunduh dan isinya diperiksa. Preferensi tema bertahan setelah reload. Console tidak menunjukkan error/warning pada alur yang diperiksa.
- Bukti browser tersimpan di preview-laporan-2026-10-21, dengan gambar terang/gelap, ponsel, dan qa-browser.json.

Dialog cetak dan hasil PDF multi halaman tidak diotomatisasi pada sesi ini; stylesheet cetak dan orientasi landscape telah ditambahkan. OAuth/Redis produksi, migrasi spreadsheet operasional, dan penyimpanan nyata tetap memerlukan verifikasi pada lingkungan yang dituju. Tidak ada deployment, perubahan skema, atau transaksi pada spreadsheet operasional selama pengerjaan pembaruan ini. Perubahan lewat browser hanya memakai ruang Data contoh.
