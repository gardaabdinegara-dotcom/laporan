"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Tampilan perlu dimuat ulang</h1>
      <p>
        Data nyata tetap berada di spreadsheet. Coba muat kembali halaman ini.
      </p>
      <button className="btn primary" onClick={reset}>
        Muat ulang
      </button>
    </main>
  );
}
