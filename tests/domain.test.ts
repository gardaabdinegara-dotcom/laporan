import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applyCommand,
  demoState,
  finance,
  invoiceSummary,
  dueDate,
  validateState,
  DomainError,
  type State,
  type Actor,
} from "../lib/domain.ts";
const owner: Actor = {
  id: "owner",
  email: "gardaabdinegara@gmail.com",
  name: "Owner",
  role: "OWNER",
};
const admin: Actor = { ...owner, id: "admin", role: "ADMIN" };
const mutate = (
  s: State,
  action: string,
  data: Record<string, unknown>,
  actor = owner,
) => applyCommand(s, { operationId: randomUUID(), action, data }, actor).state;
const report = (s: State, to = "2026-10-31") => finance(s, "2026-10-01", to);
test("arah kas yang salah dan transfer satu sisi terdeteksi", () => {
  const wrong = demoState();
  wrong.Transaksi[2].arah = "IN";
  assert.throws(() => validateState(wrong), /Arah/);
  const half = demoState();
  half.Transaksi.pop();
  assert.throws(() => validateState(half), /dua sisi/);
});
test("kegagalan sisi kedua transfer tidak mengubah sumber", () => {
  const s = demoState(),
    snapshot = JSON.stringify(s);
  assert.throws(() =>
    mutate(s, "transfer.create", {
      dari_akun_id: "cash",
      ke_akun_id: "missing",
      nominal: 100000,
      tanggal_transaksi: "2026-10-13",
    }),
  );
  assert.equal(JSON.stringify(s), snapshot);
});
test("saldo, pendanaan, surplus, tunggakan sesuai contoh independen", () => {
  const s = demoState();
  validateState(s);
  const f = report(s);
  assert.equal(f.balance, 5450000);
  assert.equal(f.incoming, 2750000);
  assert.equal(f.outgoing, 300000);
  assert.equal(f.operational, 450000);
  assert.equal(f.outstanding, 1150000);
  assert.equal(f.overdue, 150000);
  assert.equal(f.accounts[0].balance, 800000);
  assert.equal(f.accounts[1].balance, 4650000);
  assert.equal(f.balance, Number(f.opening) + f.incoming - f.outgoing);
});
test("cicilan masa depan tidak menjadi tunggakan lebih dini", () => {
  const s = demoState();
  assert.equal(report(s, "2026-10-05").overdue, 0);
  assert.equal(report(s).overdue, 150000);
  assert.equal(finance(s, "2026-11-01", "2026-11-04").overdue, 650000);
});
test("tanggal jatuh tempo 31 disesuaikan untuk bulan pendek", () => {
  assert.equal(dueDate("2026-02", 31), "2026-02-28");
  assert.equal(dueDate("2028-02", 31), "2028-02-29");
});
test("pembayaran sebagian mengubah kas dan tagihan satu kali", () => {
  const s = mutate(demoState(), "payment.create", {
    tagihan_id: "inv-nadia",
    akun_id: "bank",
    nominal: 150000,
    tanggal_transaksi: "2026-10-13",
  });
  const f = report(s);
  assert.equal(f.balance, 5600000);
  assert.equal(f.outstanding, 1000000);
  assert.equal(f.overdue, 0);
});
test("kelebihan bayar ditolak dan sumber tidak dimutasi", () => {
  const s = demoState(),
    hash = JSON.stringify(s);
  assert.throws(
    () =>
      mutate(s, "payment.create", {
        tagihan_id: "inv-nadia",
        akun_id: "bank",
        nominal: 150001,
        tanggal_transaksi: "2026-10-13",
      }),
    /melebihi/,
  );
  assert.equal(JSON.stringify(s), hash);
});
test("operation ID yang sama tidak menambah dampak kedua", () => {
  const c = {
    operationId: randomUUID(),
    action: "payment.create",
    data: {
      tagihan_id: "inv-nadia",
      akun_id: "bank",
      nominal: 50000,
      tanggal_transaksi: "2026-10-13",
    },
  };
  const first = applyCommand(demoState(), c, owner).state;
  const second = applyCommand(first, c, owner).state;
  assert.equal(second.Transaksi.length, first.Transaksi.length);
  assert.equal(report(second).balance, 5500000);
});
test("dua permintaan berurutan memakai sisa tagihan terbaru", () => {
  const first = mutate(demoState(), "payment.create", {
    tagihan_id: "inv-nadia",
    akun_id: "bank",
    nominal: 100000,
    tanggal_transaksi: "2026-10-13",
  });
  assert.throws(
    () =>
      mutate(first, "payment.create", {
        tagihan_id: "inv-nadia",
        akun_id: "bank",
        nominal: 100000,
        tanggal_transaksi: "2026-10-13",
      }),
    /melebihi/,
  );
});
test("transfer menyimpan kedua sisi dan tidak mengubah surplus", () => {
  const s = mutate(demoState(), "transfer.create", {
    dari_akun_id: "cash",
    ke_akun_id: "bank",
    nominal: 100000,
    tanggal_transaksi: "2026-10-13",
  });
  const f = report(s);
  assert.equal(s.Transaksi.length, 8);
  assert.equal(f.balance, 5450000);
  assert.equal(f.operational, 450000);
  assert.equal(f.accounts[0].balance, 700000);
});
test("transfer ke akun yang sama ditolak", () => {
  assert.throws(
    () =>
      mutate(demoState(), "transfer.create", {
        dari_akun_id: "cash",
        ke_akun_id: "cash",
        nominal: 100000,
        tanggal_transaksi: "2026-10-13",
      }),
    /berbeda/,
  );
});
test("pembalikan transfer tetap seimbang dan tidak bisa diulang", () => {
  const s = mutate(demoState(), "transaction.reverse", {
    transaksi_id: "transfer-out",
    tanggal_transaksi: "2026-10-13",
    alasan: "Salah akun",
  });
  assert.equal(report(s).balance, 5450000);
  assert.equal(report(s).accounts[0].balance, 1200000);
  assert.equal(report(s).accounts[1].balance, 4250000);
  assert.throws(
    () =>
      mutate(s, "transaction.reverse", {
        transaksi_id: "transfer-out",
        tanggal_transaksi: "2026-10-13",
        alasan: "Ulang",
      }),
    /pernah/,
  );
});
test("pembalik pembayaran mengubah saldo dan membuka kewajiban yang benar", () => {
  const s = mutate(demoState(), "transaction.reverse", {
    transaksi_id: "pay-nadia",
    tanggal_transaksi: "2026-10-13",
    alasan: "Salah pencatatan",
  });
  assert.equal(report(s).balance, 5200000);
  assert.equal(report(s).outstanding, 1400000);
  assert.equal(report(s).operational, 200000);
  assert.equal(report(s, "2026-10-12").balance, 5450000);
});
test("refund dan pengurangan kewajiban dihitung terpisah", () => {
  const s = mutate(demoState(), "invoice.refund", {
    tagihan_id: "inv-nadia",
    transaksi_rujukan_id: "pay-nadia",
    nominal: 100000,
    pengurangan: 100000,
    akun_id: "bank",
    tanggal_transaksi: "2026-10-13",
    alasan: "Pengurangan layanan",
  });
  const b = invoiceSummary(s, s.Tagihan[1]);
  assert.equal(b.face, 300000);
  assert.equal(b.paid, 150000);
  assert.equal(b.remaining, 150000);
  assert.equal(report(s).balance, 5350000);
  assert.equal(invoiceSummary(s, s.Tagihan[1], "2026-10-12").face, 400000);
});
test("pembatalan penuh dan refund menghasilkan kewajiban nol", () => {
  const s = mutate(demoState(), "invoice.refund", {
    tagihan_id: "inv-nadia",
    transaksi_rujukan_id: "pay-nadia",
    nominal: 250000,
    pengurangan: 400000,
    batalkan: true,
    akun_id: "bank",
    tanggal_transaksi: "2026-10-13",
    alasan: "Pembatalan seluruh layanan",
  });
  const b = invoiceSummary(s, s.Tagihan[1]);
  assert.equal(b.face, 0);
  assert.equal(b.paid, 0);
  assert.equal(b.remaining, 0);
  assert.equal(b.cancelled, true);
});
test("refund berulang atau sebelum pembayaran ditolak", () => {
  const d = {
    tagihan_id: "inv-nadia",
    transaksi_rujukan_id: "pay-nadia",
    nominal: 200000,
    pengurangan: 0,
    akun_id: "bank",
    tanggal_transaksi: "2026-10-13",
    alasan: "Refund",
  };
  const s = mutate(demoState(), "invoice.refund", d);
  assert.throws(() => mutate(s, "invoice.refund", d), /melebihi/);
  assert.throws(
    () =>
      mutate(demoState(), "invoice.refund", {
        ...d,
        tanggal_transaksi: "2026-10-02",
      }),
    /mendahului/,
  );
});
test("penyesuaian dapat dibalik tanpa menghapus sejarah", () => {
  const s = mutate(demoState(), "invoice.adjust", {
    tagihan_id: "inv-nadia",
    nominal: 50000,
    tanggal_efektif: "2026-10-13",
    alasan: "Diskon",
  });
  const next = mutate(s, "invoice.adjust.reverse", {
    penyesuaian_id: s.Penyesuaian_Tagihan[0].penyesuaian_id,
    tanggal_efektif: "2026-10-13",
    alasan: "Diskon dikoreksi",
  });
  assert.equal(invoiceSummary(next, next.Tagihan[1]).face, 400000);
  assert.equal(next.Penyesuaian_Tagihan.length, 2);
});
test("tagihan bulanan yang sudah lunas tidak dibuat lagi", () => {
  const s = mutate(demoState(), "payment.create", {
    tagihan_id: "inv-nadia",
    akun_id: "bank",
    nominal: 150000,
    tanggal_transaksi: "2026-10-13",
  });
  const r = applyCommand(
    s,
    {
      operationId: randomUUID(),
      action: "invoice.monthly",
      data: {
        pendaftaran_ids: ["daf-nadia"],
        periode_layanan: "2026-10",
        tanggal_terbit: "2026-10-13",
      },
    },
    owner,
  );
  assert.equal(r.result.count, 0);
  assert.equal(r.state.Tagihan.length, 2);
});
test("paket tidak dapat digandakan dengan mengganti label periode", () => {
  assert.throws(
    () =>
      mutate(demoState(), "invoice.create", {
        pendaftaran_id: "daf-rizky",
        periode_layanan: "2030-01",
        tanggal_terbit: "2026-10-13",
        diskon_awal: 0,
      }),
    /sudah ada/,
  );
});
test("diskon 100 persen tidak menghasilkan kas fiktif", () => {
  const s = mutate(demoState(), "invoice.create", {
    pendaftaran_id: "daf-nadia",
    periode_layanan: "2026-11",
    tanggal_terbit: "2026-10-13",
    diskon_awal: 400000,
  });
  const b = invoiceSummary(s, s.Tagihan.at(-1)!);
  assert.equal(b.face, 0);
  assert.equal(report(s).balance, 5450000);
});
test("periode tutup menolak semua transaksi bertanggal dalam bulan itu", () => {
  const s = mutate(demoState(), "period.close", {
    bulan: "2026-10",
    alasan: "Saldo sudah cocok",
  });
  assert.throws(
    () =>
      mutate(s, "transaction.create", {
        jenis: "BIAYA",
        akun_id: "cash",
        nominal: 1000,
        tanggal_transaksi: "2026-10-13",
        deskripsi: "Biaya",
      }),
    /ditutup/,
  );
});
test("VIEWER tidak dapat menulis, ADMIN tidak dapat refund atau memberi tarif khusus", () => {
  assert.throws(
    () =>
      mutate(
        demoState(),
        "student.save",
        { nama: "Uji" },
        { ...owner, role: "VIEWER" },
      ),
    /pembaca/,
  );
  assert.throws(
    () =>
      mutate(
        demoState(),
        "invoice.adjust",
        {
          tagihan_id: "inv-nadia",
          nominal: 1000,
          tanggal_efektif: "2026-10-13",
          alasan: "Diskon",
        },
        admin,
      ),
    /pemilik/,
  );
  assert.throws(
    () =>
      mutate(
        demoState(),
        "enrollment.save",
        {
          siswa_id: "nadia",
          program_id: "kedinasan",
          tarif_disepakati: 0,
          tanggal_mulai: "2026-10-13",
        },
        admin,
      ),
    /pemilik/,
  );
});
test("saldo awal terkunci sesudah dipakai dan OWNER terakhir terlindungi", () => {
  assert.throws(
    () =>
      mutate(demoState(), "master.save", {
        table: "Akun",
        id: "cash",
        nama_akun: "Kas",
        jenis_akun: "KAS",
        saldo_awal: 0,
        tanggal_saldo_awal: "2026-10-01",
      }),
    /tidak dapat diubah/,
  );
  assert.throws(
    () =>
      mutate(demoState(), "user.save", {
        nama: "Owner",
        email: "gardaabdinegara@gmail.com",
        role: "OWNER",
        aktif: false,
      }),
    /Minimal satu/,
  );
});
test("ID ganda, nominal teks, dan relasi rusak terlihat sebagai error", () => {
  const duplicate = demoState();
  duplicate.Siswa.push({ ...duplicate.Siswa[0] });
  assert.throws(() => validateState(duplicate), /ganda/);
  const bad = demoState();
  bad.Transaksi[0].nominal = "bukan uang";
  assert.throws(() => validateState(bad), DomainError);
  const broken = demoState();
  broken.Transaksi[0].tagihan_id = "missing";
  assert.throws(() => validateState(broken), /tidak ditemukan/);
});
test("periode sebelum saldo awal ditandai tidak tersedia", () => {
  const f = finance(demoState(), "2026-09-01", "2026-09-30");
  assert.equal(f.balance, null);
  assert.equal(f.opening, null);
});
test("tautan bukti harus HTTPS dan jumlah cicilan harus cocok", () => {
  assert.throws(
    () =>
      mutate(demoState(), "transaction.create", {
        jenis: "BIAYA",
        nominal: 1000,
        akun_id: "cash",
        tanggal_transaksi: "2026-10-13",
        deskripsi: "Alat tulis",
        bukti_url: "javascript:alert(1)",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      mutate(demoState(), "invoice.create", {
        pendaftaran_id: "daf-nadia",
        periode_layanan: "2026-11",
        tanggal_terbit: "2026-10-13",
        diskon_awal: 0,
        jadwal: [{ date: "2026-11-05", amount: 399999 }],
      }),
    /Jumlah/,
  );
});
