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

## Generate Laporan PDF - 21 Oktober 2026

Tombol **Generate Laporan** langsung mengunduh PDF untuk Buku kas, Laba rugi,
Neraca, Aset & penyusutan, Omzet & pajak, serta Pemeriksaan. Jenis, periode,
rekening, identitas usaha, waktu data, status, dan hak akses mengikuti snapshot
ketika tombol ditekan. CSV serta Cetak browser tetap tersedia.

Format mengikuti struktur contoh: buku kas per bulan, laba rugi berkelompok,
neraca dua sisi, daftar aset/jadwal penyusutan, dan rekap omzet/pajak. Tabel
berulang saat berganti halaman, nilai negatif memakai tanda kurung, nomor
halaman menunjukkan total halaman, dan tanda tangan tetap utuh. PDF berwarna
putih dengan aksen Terrace. Font lokal tertanam, tanpa layanan PDF eksternal.

Verifikasi lokal tambahan:

- TypeScript dan **72 pengujian otomatis** lulus. Sepuluh pengujian baru memeriksa
  snapshot/filter, saldo bergulir, total neraca, pembatasan VIEWER, tanggal sah,
  Draf/Proyeksi, jadwal tahunan, renderer PDF, serta percobaan ulang font gagal.
- Build produksi Next.js berhasil.
- Unduhan melalui browser berhasil untuk enam jenis laporan, ditambah rekap
  pajak tahunan. Isi PDF laba rugi/neraca sesuai rentang 1-20 Oktober dan buku kas
  hanya memuat rekening bank yang dipilih. Rentang terbalik menonaktifkan tombol.
- Pemeriksaan struktur/teks pada **14 PDF** (fixture dan unduhan browser)
  memastikan nomor halaman, sumber Data contoh, dan batas margin. Buku kas
  panjang **21 halaman** mempertahankan seluruh 180 baris tambahan.
- Delapan kombinasi light/dark dan lebar 320/390/768/1280 px tidak meluber secara
  horizontal. Tindakan utama memenuhi lebar baris pada ponsel.
- PDF terakhir dirender dan diperiksa secara visual, termasuk neraca satu halaman,
  lampiran aset, tabel panjang, dan catatan Draf lintas halaman. Bukti antarmuka
  ada pada preview-generate-pdf-2026-10-21; satu contoh unduhan ada di output/pdf.

Pemeriksaan ini menggunakan data contoh dan fixture terisolasi. Tidak ada
deployment, migrasi Sheets operasional, atau transaksi keuangan nyata. PDF
unduhan langsung telah diuji; dialog Cetak browser tetap merupakan fitur terpisah.

## Contoh setahun 2025 dan PDF yang dirapikan - 21 Oktober 2026

Contoh Januari–Desember 2025 tersedia dari Laporan melalui **Muat contoh setahun
2025**. Pilihan Tahunan 2025 diaktifkan otomatis. Contoh singkat dan contoh
tahunan disimpan pada key browser berbeda; perpindahan dan reload telah diperiksa.
Contoh singkat sebelumnya tetap mempunyai kas akhir Rp5.450.000.

Dataset baru mempunyai 16 siswa fiktif, 60 tagihan, 64 jadwal pembayaran,
178 baris kas, dan 9 aset. Semua tagihan terhubung/lunas pada akhir 2025.
Pendapatan Rp134.500.000, biaya jasa Rp75.600.000, penyusutan Rp10.268.750,
dan laba bersih Rp5.908.750. Kas awal Rp19.820.000, pengeluaran kas
Rp123.702.500, serta kas akhir Rp30.617.500. Total aset/ekuitas Rp61.872.708.
Saldo dan tarif merupakan simulasi. Akumulasi awal aset mengikuti bulan perolehan.
Pajak 2024 Rp880.000 dilunasi dari utang awal; beban/pajak simulasi 2025
Rp672.500 dibukukan sekali dan dilunasi per bulan.

Penyempurnaan PDF: buku kas 12 halaman bulan dan satu ringkasan, subtotal laba
rugi, register aset dan dua semester penyusutan pada halaman tersendiri, serta
pembayaran pajak menurut tanggal kas. Pratinjau gabungan berisi **23 halaman**
dengan sampul, daftar isi yang dapat diklik, ringkasan/grafik tahunan, dan enam
hasil PDF yang diunduh melalui tombol aplikasi. Pada tahap pratinjau awal ini,
sampul/ringkasan masih digabung terpisah. Pembaruan berikut mengotomasikannya.

Verifikasi:

- TypeScript, **79 pengujian otomatis**, dan build produksi lulus.
- Tujuh pengujian dataset baru mencakup ketetapan data, saldo tiap bulan/rekening,
  tagihan/cicilan, aset, pemisahan pajak, serta kesesuaian dokumen tahunan.
- Enam PDF tahunan diunduh melalui browser. Seluruh 178 referensi kas ada pada
  hasil, enam pencocokan antar laporan berselisih nol, dan saldo tiap rekening
  tidak negatif sepanjang transaksi simulasi.
- Semua 23 halaman dirender dan diperiksa; total, batas margin, nomor halaman
  global, serta enam tautan daftar isi diperiksa secara struktur dan visual.
- Delapan kombinasi light/dark dan 320/390/768/1280 px tidak meluber.
  Pergantian contoh tidak mengubah workspace contoh lama; reload mempertahankan
  dataset setahun dan pilihan awal Tahunan 2025.

Bukti antarmuka ada pada preview-annual-demo-2025. Pratinjau PDF ada pada
output/pdf/Simulasi-Laporan-Keuangan-Garda-2025.pdf. Tidak ada deployment,
migrasi, atau penulisan ke spreadsheet operasional dalam pengerjaan ini.

## Generate Semua Laporan - 21 Oktober 2026

Tombol baru membuat satu buku laporan tahunan langsung dari browser. Sampul,
daftar isi, serta ringkasan/grafik masing-masing mempunyai halaman tersendiri,
diikuti enam laporan. Tautan daftar isi, sembilan bookmark, orientasi portrait/
landscape, dan nomor halaman global dihitung dari isi aktual. Font dibagi dalam
satu PDF sehingga tidak perlu menggabungkan enam berkas secara manual.

Paket selalu mencakup seluruh kas/bank; filter rekening tetap berlaku pada
laporan satuan. Tahun/rentang diambil saat klik sebelum pemuatan renderer.
Hak akses VIEWER, Draf, Proyeksi, serta data contoh dipertahankan. Pajak belum
lengkap tidak menjadi nol. Tambahan pembukaan akun terpisah dari penerimaan.

Verifikasi lokal:

- TypeScript, **86 pengujian otomatis**, dan build produksi lulus.
- Tujuh pengujian tambahan mencakup snapshot, kalender, saldo pembukaan baru,
  hak akses, Draf/Proyeksi, PDF bertautan dengan pagination dinamis, serta grafik
  nol dan laporan dengan catatan panjang.
- Unduhan tombol baru dengan contoh 2025 menghasilkan **24 halaman**, empat
  halaman landscape, tujuh tautan daftar isi yang menuju bagian benar, sembilan
  bookmark, nomor halaman global, dan seluruh **178 referensi baris kas**.
- Paket tahun 2024 menghasilkan 27 halaman Draf dan daftar isi yang sesuai,
  tanpa menyisipkan transaksi 2025. Fixture VIEWER berisi 11 halaman tanpa
  rincian transaksi; fixture kosong/Draf berisi 26 halaman dengan pajak belum
  lengkap. Semua berkas diperiksa struktur, teks, dan batas marginnya.
- Periode bulanan/tahun kosong/rentang sebagian menonaktifkan tombol; rentang
  khusus setahun mengaktifkannya. PDF satuan bank tetap dapat diunduh. Paket
  yang diunduh saat filter bank aktif tetap mencakup semua akun.
- Unduhan ponsel mode terang mempunyai isi identik dengan unduhan desktop mode
  gelap. Delapan kombinasi light/dark pada 320/390/768/1280 px tidak meluber;
  kedua tombol PDF memakai lebar baris penuh pada ponsel. Log browser bersih.
- Seluruh halaman hasil akhir dirender dan diperiksa secara visual.

Contoh hasil langsung: output/pdf/Simulasi-Semua-Laporan-Garda-2025.pdf.
Bukti antarmuka dan ringkasan QA: preview-generate-semua-2026-10-21.
Pembaruan ini belum dideploy dan tidak menulis data spreadsheet operasional.
