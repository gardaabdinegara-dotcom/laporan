# Garda Keuangan — Terrace

Aplikasi keuangan bimbel Garda Abdi Negara dengan tema **Terrace**, mengikuti proyek Presensi. Dibangun memakai Next.js, React, TypeScript, Google Sheets, Google OAuth, dan koordinator Redis.

Tombol bulan/matahari mengganti **mode terang/gelap**. Kunjungan pertama mengikuti mode perangkat; pilihan manual tersimpan pada browser untuk origin aplikasi tersebut. Krem–hijau dipakai pada mode terang, hijau arang–sage pada mode gelap. Font disertakan secara lokal.

## Mulai mencoba

```powershell
npm ci
npm run dev
```

Buka **http://localhost:3012**. Aplikasi langsung menampilkan **Data contoh**, tanpa perlu login atau konfigurasi layanan eksternal. Desktop memiliki navigasi di atas; ponsel memiliki navigasi bawah, daftar transaksi, dan formulir sentuh. Tagihan berbentuk baris yang bisa dibuka untuk melihat cicilan dan tindakan, dengan pencarian serta filter status.

Data contoh bersifat lokal di browser. Perubahan tetap tersedia setelah refresh pada browser yang sama. **Pengaturan → Pulihkan contoh** mengembalikan angka awal. Data contoh tidak dikirim ke Google Sheets.

## Fitur

- Dashboard saldo, kas masuk/keluar, surplus operasional, sisa tagihan, dan tunggakan.
- Siswa, pendaftaran program, biaya paket dan bulanan, tarif kesepakatan.
- Tagihan, jadwal cicilan, pembayaran sebagian, dan kuitansi cetak.
- Penerimaan, biaya, modal, prive, pinjaman pokok, dan transfer dua sisi.
- Koreksi dengan transaksi pembalik, penyesuaian kewajiban, refund, dan audit.
- Laporan per periode/tanggal acuan, per program/kategori, buku kas, CSV, serta cetak/PDF melalui browser.
- Buku kas dengan saldo berjalan per akun/gabungan, laba rugi, neraca, aset/penyusutan, omzet/pajak, dan pemeriksaan antar laporan.
- Pemetaan kategori berversi, pembukaan neraca terverifikasi, jurnal penyesuaian nonkas beserta pembalik, dan penautan pembayaran pajak lintas tahun.
- Master akun/program/kategori, pengguna OWNER/ADMIN/VIEWER, dan tutup/buka periode.
- Tombol **Gunakan data nyata**, login Google, serta backend Google Sheets yang terpisah dari contoh.
- Operation ID, batch atomik, gerbang Redis persisten, dan pemeriksaan hasil simpan yang tidak pasti.
- Backup JSON lengkap serta validasi/pemulihan ke spreadsheet tujuan yang masih kosong.

## Konfigurasi data nyata

Ikuti [PANDUAN_DEPLOY.md](PANDUAN_DEPLOY.md). OWNER awal adalah **gardaabdinegara@gmail.com**.

Pada penyusunan proyek ini, 12 tabel database sudah dibuat pada spreadsheet yang diberikan. `Sheet1` dipertahankan. Akun awal bersaldo nol dan tarif program awal nol. **Tidak ada siswa atau transaksi contoh yang diimpor ke sumber nyata.** Atur saldo awal dan tarif sebenarnya sebelum mulai mencatat.

Pembaruan laporan 21 Oktober 2026 memakai **struktur versi 2 (18 tabel)**. Sumber versi 1 tetap dapat dibaca; penulisan ditahan sampai migrasi selesai. Pemilik dapat memilih **Cadangkan & perbarui struktur** pada banner data nyata. Cadangan terbaru diunduh sebelum perubahan dan identitasnya diperiksa kembali di server. Panduan migrasi lewat CLI ada di bagian 12 PANDUAN_DEPLOY.md. Pengerjaan source pembaruan ini tidak menjalankan migrasi spreadsheet operasional.

Mode nyata memerlukan environment server yang benar. File service account lokal tidak menggantikan Google OAuth untuk login pengguna. Fitur penulisan nyata baru aktif setelah Redis dikonfigurasi dan `APP_WRITE_ENABLED=true`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan aplikasi lokal, port 3012 |
| `npm run build` | Build produksi Next.js |
| `npm start` | Menjalankan hasil build produksi lokal |
| `npm run check` | TypeScript dan pengujian aturan keuangan |
| `npm run env:check` | Pemeriksaan kesiapan konfigurasi tanpa mencetak rahasia |
| `npm run sheets:setup` | Pratinjau setup spreadsheet, tanpa menulis |
| `npm run sheets:setup -- --apply` | Setup sumber baru/kosong |
| `npm run sheets:setup -- --apply --backup backups/sebelum-v2.json` | Mencadangkan sumber lama ke file baru lalu menambah struktur laporan |
| `npm run sheets:check` | Pemeriksaan tabel/jumlah record, tanpa mencetak data siswa |
| `npm run backup -- backups/backup-baru.json` | Backup nyata ke file baru |
| `npm run backup:validate -- backups/backup-baru.json` | Validasi isi backup |
| `npm run backup:restore -- backups/backup-baru.json --apply` | Memulihkan ke sumber baru/kosong pada mode pemeliharaan |

Gunakan Node.js 24. File `.env.local`, `credentials.json`, backup, serta dependency tidak boleh ikut diunggah ke Git. Paket source yang diberikan tidak memuat rahasia atau `node_modules`.

## Struktur

```text
app/                     Halaman, stylesheet, dan API server
components/              Antarmuka Terrace yang responsif
lib/domain.ts            Aturan keuangan dan data contoh
lib/reporting.ts         Perhitungan laporan, aset, pajak, dan ekspor CSV
lib/report-document.ts   Snapshot laporan PDF sesuai jenis/periode/hak akses
lib/report-pdf.ts        Renderer PDF dengan font lokal dan paginasi tabel
lib/report-commands.ts   Validasi dan perintah pencatatan laporan
lib/server/              Login, Google Sheets, dan koordinator penulisan
scripts/                 Pemeriksaan environment dan pemeliharaan Sheets
tests/                   Pengujian perhitungan dan validasi bisnis
public/                  Favicon dan font lokal dengan lisensinya
preview-komando/         Screenshot desktop, ponsel, dan hasil verifikasi
PANDUAN_DEPLOY.md         Setup dan deployment Vercel
STATUS_IMPLEMENTASI.md   Hasil pengujian dan batas verifikasi
PRD.md                   Dokumen kebutuhan awal
```

Dashboard memakai basis kas. Laporan laba rugi dan neraca memakai dasar **kas dengan penyesuaian nonkas** setelah ditetapkan pemilik: piutang, uang muka, dan kewajiban dicatat melalui pembukaan/jurnal; tagihan yang belum dibayar tidak otomatis menjadi piutang akuntansi. Sheets menjadi sumber utama; editor yang mengubah tabel langsung dapat melewati aturan aplikasi. Lakukan pemeliharaan terkontrol dan backup sebelum mengubah struktur.

## Memakai laporan baru

1. Buka **Laporan → Kelola laporan → Dasar laporan**. Pilih tanggal awal dan dasar pengakuan; isi lokasi serta penandatangan.
2. Pada **Kategori**, tetapkan kelompok biaya/penerimaan beserta bulan berlakunya.
3. Catat aset lama sebagai **Aset pada awal pembukuan**. Untuk pembelian baru, tautkan transaksi biaya yang sudah dicatat. Penyusutan garis lurus dibukukan pada akhir bulan, dengan pembulatan kumulatif dan nilai residu.
4. Pada **Saldo awal**, periksa kas/aset terhitung dan isi saldo modal, utang, serta saldo nonkas lainnya berdasarkan bukti. Pembukaan harus seimbang; selisih tidak menjadi modal/laba ditahan otomatis.
5. **Jurnal nonkas** mencatat penyesuaian pendapatan, piutang, uang muka, dan kewajiban. Debit harus sama dengan kredit. Koreksi melalui pembalik dengan tanggal efektif dan alasan.
6. Untuk rekap pajak, tetapkan **Dasar omzet pajak** dan versi **Tarif pajak** sesuai kondisi usaha. **Pembayaran pajak** menautkan transaksi biaya ke tahun/bulan kewajiban; pelunasan utang tidak menambah beban kedua.
7. Pilih laporan dan periode bulanan/tahunan/rentang tanggal. Untuk Buku kas, pilih gabungan akun atau satu rekening. Tekan **Generate Laporan** untuk langsung mengunduh PDF; **CSV** mengunduh data tabel dan **Cetak** membuka dialog cetak browser. Gunakan **Pemeriksaan** untuk menelusuri selisih. VIEWER mendapat ringkasan kas/pajak tanpa rincian transaksi pada PDF dan CSV.

Data yang belum mempunyai dasar, pemetaan, pembukaan, atau tarif yang diperlukan diberi status **Draf**. Rentang yang berakhir setelah hari ini diberi penanda proyeksi. Cetak memakai palet putih; tabel aset memakai kertas landscape, header berulang, nomor halaman, dan ruang tanda tangan. Pilihan mode terang/gelap tetap berlaku pada seluruh formulir.

**Generate Laporan** tersedia untuk Buku kas, Laba rugi, Neraca, Aset & penyusutan,
Omzet & pajak, serta Pemeriksaan. Nama PDF memuat jenis, tanggal awal/akhir, dan
rekening bila dipilih. Isi diambil dari snapshot data saat tombol ditekan, dengan
waktu data dan status Draf/Proyeksi/Data contoh yang tetap tercantum. Buku kas
tahunan dikelompokkan per bulan; saldo awal/akhir tetap bergulir. Neraca memakai
dua sisi pada A4 landscape. Jadwal aset menjadi lampiran landscape dengan dua
tabel semester agar nominal terbaca.

PDF dihasilkan di browser menggunakan jsPDF dan AutoTable yang dimuat saat
diperlukan. Font OFL ikut disertakan dari folder lokal; data tidak dikirim ke
layanan PDF eksternal. File PDF tetap memakai halaman putih, identitas usaha,
periode, tabel berulang saat berganti halaman, nomor halaman, catatan pemeriksaan,
dan ruang tanda tangan. Tidak memerlukan pengaturan layanan PDF di server.

Angka dari PDF contoh hanya dipakai pada fixture pengujian terisolasi. Contoh itu menghasilkan saldo akhir buku kas Rp14.940.000, berbeda Rp800.000 dari neraca contoh; aplikasi tidak mengimpor atau menyeimbangkan selisih tersebut otomatis.

## Perbaikan 15 Oktober 2026

Laporan → Cocokkan saldo / tutup bulan menyediakan pemeriksaan saldo nyata tiap akun pada akhir bulan. Simpan pencocokan untuk mencatat selisih, atau pilih Tutup periode setelah semua saldo cocok. Hasil pemeriksaan tampil pada laporan bulan terkait. Data baru setelah pemeriksaan memunculkan permintaan mencocokkan ulang. Aplikasi tidak membuat transaksi penyesuaian otomatis.

Jika respons simpan terputus, tekan Periksa status. Ketika gerbang kosong dan permintaan asli tersedia pada tab yang sama, Kirim ulang permintaan yang sama mempertahankan ID dan payload. Data permintaan sementara disimpan di sessionStorage, terikat akun, serta dihapus setelah berhasil atau logout. Tutup tab setelah hasilnya jelas.
