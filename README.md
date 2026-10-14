# Garda Keuangan — Komando

Aplikasi keuangan bimbel Garda Abdi Negara dengan tema **Komando**, mengikuti proyek Presensi. Dibangun memakai Next.js, React, TypeScript, Google Sheets, Google OAuth, dan koordinator Redis.

## Mulai mencoba

```powershell
npm ci
npm run dev
```

Buka **http://localhost:3012**. Aplikasi langsung menampilkan **Data contoh**, tanpa perlu login atau konfigurasi layanan eksternal. Desktop memiliki sidebar; ponsel memiliki navigasi bawah, daftar transaksi, dan formulir sentuh.

Data contoh bersifat lokal di browser. Perubahan tetap tersedia setelah refresh pada browser yang sama. **Pengaturan → Pulihkan contoh** mengembalikan angka awal. Data contoh tidak dikirim ke Google Sheets.

## Fitur

- Dashboard saldo, kas masuk/keluar, surplus operasional, sisa tagihan, dan tunggakan.
- Siswa, pendaftaran program, biaya paket dan bulanan, tarif kesepakatan.
- Tagihan, jadwal cicilan, pembayaran sebagian, dan kuitansi cetak.
- Penerimaan, biaya, modal, prive, pinjaman pokok, dan transfer dua sisi.
- Koreksi dengan transaksi pembalik, penyesuaian kewajiban, refund, dan audit.
- Laporan per periode/tanggal acuan, per program/kategori, buku kas, CSV, serta cetak/PDF melalui browser.
- Master akun/program/kategori, pengguna OWNER/ADMIN/VIEWER, dan tutup/buka periode.
- Tombol **Gunakan data nyata**, login Google, serta backend Google Sheets yang terpisah dari contoh.
- Operation ID, batch atomik, gerbang Redis persisten, dan pemeriksaan hasil simpan yang tidak pasti.
- Backup JSON lengkap serta validasi/pemulihan ke spreadsheet tujuan yang masih kosong.

## Konfigurasi data nyata

Ikuti [PANDUAN_DEPLOY.md](PANDUAN_DEPLOY.md). OWNER awal adalah **gardaabdinegara@gmail.com**.

Pada penyusunan proyek ini, 12 tabel database sudah dibuat pada spreadsheet yang diberikan. `Sheet1` dipertahankan. Akun awal bersaldo nol dan tarif program awal nol. **Tidak ada siswa atau transaksi contoh yang diimpor ke sumber nyata.** Atur saldo awal dan tarif sebenarnya sebelum mulai mencatat.

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
| `npm run sheets:setup -- --apply` | Menambahkan tabel yang belum ada, tanpa menghapus tab lama |
| `npm run sheets:check` | Pemeriksaan tabel/jumlah record, tanpa mencetak data siswa |
| `npm run backup -- backups/backup-baru.json` | Backup nyata ke file baru |
| `npm run backup:validate -- backups/backup-baru.json` | Validasi isi backup |
| `npm run backup:restore -- backups/backup-baru.json --apply` | Memulihkan ke sumber baru/kosong pada mode pemeliharaan |

Gunakan Node.js 24. File `.env.local`, `credentials.json`, backup, serta dependency tidak boleh ikut diunggah ke Git. Paket source yang diberikan tidak memuat rahasia atau `node_modules`.

## Struktur

```text
app/                     Halaman, stylesheet, dan API server
components/              Antarmuka Komando yang responsif
lib/domain.ts            Aturan keuangan dan data contoh
lib/server/              Login, Google Sheets, dan koordinator penulisan
scripts/                 Pemeriksaan environment dan pemeliharaan Sheets
tests/                   Pengujian perhitungan dan validasi bisnis
public/                  Favicon dan font lokal dengan lisensinya
preview-komando/         Screenshot desktop, ponsel, dan hasil verifikasi
PANDUAN_DEPLOY.md         Setup dan deployment Vercel
STATUS_IMPLEMENTASI.md   Hasil pengujian dan batas verifikasi
PRD.md                   Dokumen kebutuhan awal
```

Data keuangan memakai basis kas. Pendanaan dan transfer internal dipisahkan dari surplus operasional. Sheets menjadi sumber utama; editor yang mengubah tabel langsung dapat melewati aturan aplikasi. Lakukan pemeliharaan terkontrol dan backup sebelum mengubah struktur.
