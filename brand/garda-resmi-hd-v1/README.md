# Logo Garda Abdi Negara - HD v1

Logo berasal dari JPEG yang diberikan pengguna pada 24 Oktober 2026.
Pengguna meminta peningkatan ketajaman dan pemasangan pada aplikasi keuangan.

- `logo-asli.jpeg`: salinan berkas sumber, tanpa pengubahan.
- `garda-restored-native.png`: hasil rekonstruksi built-in imagegen, 1254 x 1254 px.
- `garda-logo-hd-2048.png`: ekspor PNG 2048 x 2048 px, diperbesar dari hasil
  rekonstruksi dan diberi ruang transparan merata agar lingkaran tidak terpotong.
- `prompt.txt`: prompt final persis yang dipakai pada built-in imagegen.
- `aset.json`: ukuran asli/ekspor, checksum, dan daftar aset aplikasi.

Prompt mempertahankan elang, bintang, api, padi, kapas, warna cincin, serta tulisan
Garda Abdi Negara. Bagian hitam di luar lingkaran dihilangkan. Detail yang kabur
direkonstruksi dengan AI; hasil ini bukan pemulihan piksel identik atau SVG asli.
Area putih di dalam lambang tetap ditampilkan putih pada mode terang dan gelap.

## Integrasi

`public/brand/garda-logo-192-v1.webp` dipakai pada header, sidebar, dan kuitansi.
Versi ini berukuran sekitar 20 KB sehingga aplikasi tidak memuat master 2048 px.
Ikon PNG 96 px, ICO 16/32/48 px, dan Apple touch 180 px dipasang pada metadata.
PNG 256 px dipakai pada sampul dan header PDF laporan satuan maupun tahunan.
PNG 192/512 px juga disediakan untuk kebutuhan aset aplikasi berikutnya.

Aset memakai nama versi baru. Berkas favicon SVG lama dan arsip sebelumnya
tetap disimpan. Desain Terrace light/dark serta data keuangan tetap dipertahankan.
Pemasangan hanya pada source/pratinjau lokal aplikasi keuangan; belum dideploy.
