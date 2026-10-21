"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Icon from "./icon";
import FinancialReports from "./financial-reports";
import { restorePendingCommand } from "../lib/pending-command";
import {
  active,
  applyCommand,
  COLUMNS,
  demoState,
  emptyState,
  endOfMonth,
  finance,
  invoiceSummary,
  money,
  num,
  setting,
  text,
  today,
  validateState,
  upgradeState,
  dateLabel,
  dueDate,
  reconciliationFor,
  type Actor,
  type Command,
  type Row,
  type State,
  type Table,
} from "../lib/domain";

type View =
  | "dashboard"
  | "transaksi"
  | "siswa"
  | "tagihan"
  | "laporan"
  | "pengaturan";
type Mode = "demo" | "real";
type Capabilities = {
  sheets: boolean;
  oauth: boolean;
  coordinator: boolean;
  writeEnabled: boolean;
  ownerEmail: string;
};
type Modal = {
  kind: string;
  id?: string;
  table?: Table;
  student?: string;
  enrollment?: string;
};
const NAV: [View, string, string][] = [
  ["dashboard", "grid", "Ringkasan"],
  ["tagihan", "receipt", "Tagihan"],
  ["transaksi", "arrows", "Transaksi"],
  ["siswa", "users", "Siswa"],
  ["laporan", "chart", "Laporan"],
  ["pengaturan", "settings", "Pengaturan"],
];
const DEMO_ACTOR: Actor = {
  id: "demo-owner",
  email: "gardaabdinegara@gmail.com",
  name: "Admin GAN",
  role: "OWNER",
};
const DEMO_KEY = "garda.keuangan.komando.demo.v1";
const PENDING_KEY = "garda.keuangan.pending.v1";
const PENDING_COMMAND_KEY = "garda.keuangan.pending-command.v1";
const kindNames: Record<string, string> = {
  PEMBAYARAN_SISWA: "Pembayaran siswa",
  BIAYA: "Biaya usaha",
  PENERIMAAN_LAIN: "Penerimaan lain",
  MODAL_MASUK: "Modal masuk",
  PRIVE: "Prive pemilik",
  PINJAMAN_MASUK: "Pinjaman masuk",
  POKOK_PINJAMAN_KELUAR: "Pokok pinjaman",
  TRANSFER_KELUAR: "Transfer keluar",
  TRANSFER_MASUK: "Transfer masuk",
  PEMBALIK: "Koreksi / pembalik",
};
function Badge({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <span className={`badge ${warning ? "warning" : ""}`}>{children}</span>
  );
}
function Field({
  label,
  children,
  full = false,
  hint = "",
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel empty-state">
      <Icon name="wallet" />
      <h2>{title}</h2>
      <div className="empty-copy">{children}</div>
      {action}
    </section>
  );
}
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function FinanceApp() {
  const [data, setData] = useState<State>(() => demoState());
  const [mode, setMode] = useState<Mode>("demo"),
    [actor, setActor] = useState<Actor>(DEMO_ACTOR);
  const [view, setView] = useState<View>("dashboard"),
    [month, setMonth] = useState("2026-10");
  const [asOf, setAsOf] = useState("2026-10-13"),
    [chart, setChart] = useState<"balance" | "flow">("balance");
  const [modal, setModal] = useState<Modal | null>(null),
    [entryKind, setEntryKind] = useState("PEMBAYARAN_SISWA");
  const [stageCount, setStageCount] = useState(1),
    [enrollmentId, setEnrollmentId] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("2026-10");
  const [monthlyIds, setMonthlyIds] = useState<string[]>([]);
  const [reconcileMonth, setReconcileMonth] = useState("2026-10"),
    [periodAction, setPeriodAction] = useState("reconcile"),
    [actualBalances, setActualBalances] = useState<Record<string, string>>({}),
    [retryable, setRetryable] = useState(false);
  const [query, setQuery] = useState(""),
    [accountFilter, setAccountFilter] = useState(""),
    [kindFilter, setKindFilter] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [initialized, setInitialized] = useState(true),
    [hydrated, setHydrated] = useState(false),
    [dataAsOf, setDataAsOf] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);
  const [cap, setCap] = useState<Capabilities | null>(null),
    [pending, setPending] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    saving = useRef(false),
    notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const owner = actor.role === "OWNER",
    canWrite =
      actor.role !== "VIEWER" &&
      (mode === "demo" ||
        Boolean(cap?.writeEnabled && cap?.coordinator && initialized && schemaReady)) &&
      !(mode === "real" && pending);
  const from = month + "-01",
    to = asOf.slice(0, 7) === month ? asOf : endOfMonth(month);
  const f = finance(data, from, to);
  const businessName = setting(data, "business_name", "Garda Abdi Negara");
  const effectiveDate =
    mode === "demo"
      ? "2026-10-13"
      : today(setting(data, "timezone", "Asia/Jakarta"));
  const toast = useCallback((msg: string) => {
    setMessage(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setMessage(""), 4500);
  }, []);
  const go = (next: View) => {
    setView(next);
    setQuery("");
    setAccountFilter("");
    setKindFilter("");
    setInvoiceFilter("all");
    setModal(null);
    setError("");
    history.replaceState(null, "", "#" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const open = (next: Modal, kind = "PEMBAYARAN_SISWA") => {
    setEntryKind(kind);
    setStageCount(1);
    setInvoiceMonth(month);
    if (next.kind === "period") {
      setReconcileMonth(month);
      setPeriodAction(JSON.parse(setting(data, "closed_periods", "[]")).includes(month) ? "open" : "reconcile");
      setActualBalances({});
    }
    if (next.kind === "monthly")
      setMonthlyIds(
        monthlyCandidates(month)
          .slice(0, 50)
          .map((e) => text(e, "pendaftaran_id")),
      );
    setEnrollmentId(
      next.enrollment || text(data.Pendaftaran[0], "pendaftaran_id"),
    );
    setError("");
    setModal(next);
  };
  const close = () => {
    if (!saving.current) {
      setModal(null);
      setError("");
    }
  };
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEMO_KEY);
      if (stored) {
        const parsed = upgradeState(JSON.parse(stored) as State);
        validateState(parsed);
        setData(parsed);
      }
      const p = localStorage.getItem(PENDING_KEY);
      if (p) setPending(p);
    } catch {
      /* Recover only the demo workspace. */
    }
    const hash = location.hash.slice(1) as View;
    if (NAV.some((n) => n[0] === hash)) setView(hash);
    if (new URLSearchParams(location.search).has("auth_error"))
      setError(
        "Login Google belum berhasil atau akun tidak diizinkan. Coba kembali setelah memeriksa konfigurasi.",
      );
    setHydrated(true);
    setDataAsOf(new Date().toISOString());
    void fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setCap(j.capabilities))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (hydrated && mode === "demo")
      localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  }, [data, mode, hydrated]);
  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    else if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);
  const loadReal = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setModal({ kind: "login" });
          return;
        }
        throw new Error(body.error || "Data nyata belum dapat dimuat.");
      }
      setData(body.state);
      setActor(body.actor);
      setInitialized(body.initialized);
      setSchemaReady(body.schemaReady !== false);
      setCap(body.capabilities);
      setDataAsOf(body.dataAsOf);
      setMode("real");
      setModal(null);
      const date = today(setting(body.state, "timezone", "Asia/Jakarta"));
      setMonth(date.slice(0, 7));
      setAsOf(date);
      localStorage.setItem("garda.keuangan.mode", "real");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi gagal.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (hydrated && new URLSearchParams(location.search).get("mode") === "real")
      void loadReal();
  }, [hydrated, loadReal]);
  const useDemo = () => {
    try {
      const saved = localStorage.getItem(DEMO_KEY);
      const restored = saved ? upgradeState(JSON.parse(saved)) : demoState();
      validateState(restored);
      setData(restored);
    } catch {
      setData(demoState());
    }
    setMode("demo");
    setDataAsOf(new Date().toISOString());
    setActor(DEMO_ACTOR);
    setInitialized(true);
    setSchemaReady(true);
    setMonth("2026-10");
    setAsOf("2026-10-13");
    setModal(null);
    setError("");
    localStorage.setItem("garda.keuangan.mode", "demo");
    history.replaceState(null, "", "/" + location.hash);
  };
  async function execute(action: string, payload: Record<string, unknown>, retry?: Command) {
    if (saving.current || (!retry && !canWrite)) return false;
    if (retry && (actor.role === "VIEWER" || !cap?.writeEnabled || !cap.coordinator || retry.operationId !== pending)) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    const command: Command = retry || {
      operationId: crypto.randomUUID(),
      action,
      data: payload,
    };
    try {
      if (mode === "demo") {
        const next = applyCommand(data, command, actor);
        setData(next.state);
        setDataAsOf(new Date().toISOString());
        toast(
          `Simulasi tersimpan${next.result.count !== undefined ? ": " + next.result.count + " tagihan baru" : ""}.`,
        );
      } else {
        if (!retry) { try {
          sessionStorage.setItem(PENDING_COMMAND_KEY, JSON.stringify({ command, actorId: actor.id }));
          localStorage.setItem(PENDING_KEY, command.operationId);
        } catch {
          localStorage.removeItem(PENDING_KEY);
          sessionStorage.removeItem(PENDING_COMMAND_KEY);
          throw new Error("Browser belum dapat menyimpan identitas permintaan. Aktifkan penyimpanan browser sebelum mencatat transaksi.");
        } }
        setRetryable(false);
        const response = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });
        const body = await response.json();
        if (response.status === 202) {
          setPending(command.operationId);
          setModal(null);
          setError(body.error);
          return false;
        }
        if (!response.ok) {
          if (!retry || body.rejected) {
            localStorage.removeItem(PENDING_KEY);
            sessionStorage.removeItem(PENDING_COMMAND_KEY);
            setPending("");
          }
          throw new Error(body.error || "Transaksi ditolak.");
        }
        localStorage.removeItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_COMMAND_KEY);
        setPending("");
        setModal(null);
        toast("Data nyata tersimpan di spreadsheet.");
        await refreshReal().catch(() =>
          setError(
            "Data sudah tersimpan, tetapi tampilan belum berhasil diperbarui. Tekan Perbarui; jangan mencatat ulang transaksi yang sama.",
          ),
        );
      }
      setModal(null);
      return true;
    } catch (e) {
      if (mode === "real" && localStorage.getItem(PENDING_KEY))
        { setPending(command.operationId); setModal(null); }
      setError(e instanceof Error ? e.message : "Penyimpanan gagal.");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function refreshReal() {
    const response = await fetch("/api/data", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Gagal memperbarui data.");
    setData(body.state);
    setActor(body.actor);
    setInitialized(body.initialized);
    setSchemaReady(body.schemaReady !== false);
    setCap(body.capabilities);
    setDataAsOf(body.dataAsOf);
  }
  async function checkPending() {
    setBusy(true);
    try {
      const response = await fetch(
        "/api/operations?id=" + encodeURIComponent(pending),
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.status === "COMMITTED" || result.status === "REJECTED") {
        localStorage.removeItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_COMMAND_KEY);
        setPending("");
        setRetryable(false);
        await refreshReal();
        setError(result.status === "REJECTED" ? result.error || "Permintaan ditolak dan tidak disimpan." : "");
        toast(result.status === "REJECTED" ? "Permintaan ditolak; Anda dapat memperbaiki isian lalu mencatat kembali." : "Operasi sudah tersimpan. Data diperbarui.");
      } else {
        const saved = sessionStorage.getItem(PENDING_COMMAND_KEY);
        const available = actor.role !== "VIEWER" && Boolean(cap?.writeEnabled && cap.coordinator && restorePendingCommand(saved, actor.id, pending));
        setRetryable(result.status === "RETRYABLE" && available);
        setError(
          result.status === "VERIFYING"
            ? "Operasi masih menunggu verifikasi. Penulisan berikutnya tetap ditahan."
            : result.status === "RETRYABLE" && available
              ? "Permintaan belum tercatat. Anda dapat mengirim ulang permintaan yang sama; aplikasi menjaga ID transaksi agar tidak ganda."
              : "Permintaan belum terkonfirmasi. Tunggu penyimpanan lain selesai atau periksa panduan pemulihan.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Status belum dapat diperiksa.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retryPending() {
    try {
      const command = restorePendingCommand(sessionStorage.getItem(PENDING_COMMAND_KEY), actor.id, pending);
      if (!retryable || !command)
        throw new Error("Permintaan asli tidak tersedia pada tab ini. Gunakan Periksa status.");
      await execute(command.action, command.data, command);
    } catch (e) { setError(e instanceof Error ? e.message : "Permintaan tidak dapat dipulihkan."); }
  }
  function monthlyCandidates(period: string) {
    return data.Pendaftaran.filter(
      (e) =>
        e.skema_biaya === "BULANAN" &&
        e.status === "AKTIF" &&
        text(e, "tanggal_mulai").slice(0, 7) <= period &&
        (!e.tanggal_selesai ||
          text(e, "tanggal_selesai").slice(0, 7) >= period) &&
        !data.Tagihan.some(
          (i) =>
            i.pendaftaran_id === e.pendaftaran_id &&
            i.jenis_tagihan === "BULANAN" &&
            i.periode_layanan === period &&
            !invoiceSummary(data, i).cancelled,
        ),
    );
  }
  async function inspectWriting() {
    try {
      const response = await fetch("/api/operations");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.pending?.operationId) {
        setPending(result.pending.operationId);
        localStorage.setItem(PENDING_KEY, result.pending.operationId);
        toast("Ada operasi yang menunggu verifikasi. Gunakan Periksa status.");
      } else
        toast(
          result.status === "COMMITTED"
            ? "Operasi terkonfirmasi; gerbang penulisan sudah dipulihkan."
            : "Tidak ada penulisan yang menunggu verifikasi.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Status belum dapat diperiksa.",
      );
    }
  }
  function invoicePerson(invoice: Row) {
    const enrollment = data.Pendaftaran.find(
      (e) => e.pendaftaran_id === invoice.pendaftaran_id,
    );
    return {
      enrollment,
      student: data.Siswa.find((s) => s.siswa_id === enrollment?.siswa_id),
      program: data.Program.find(
        (p) => p.program_id === enrollment?.program_id,
      ),
    };
  }
  function txName(tx: Row) {
    return tx.tagihan_id
      ? text(
          invoicePerson(
            data.Tagihan.find((i) => i.tagihan_id === tx.tagihan_id) || {},
          ).student,
          "nama",
        )
      : text(tx, "deskripsi") || kindNames[text(tx, "jenis")];
  }
  const filteredTransactions = f.transactions
    .filter(
      (t) =>
        (!accountFilter || t.akun_id === accountFilter) &&
        (!kindFilter || t.jenis === kindFilter) &&
        (txName(t) + " " + text(t, "deskripsi"))
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        text(b, "tanggal_transaksi").localeCompare(
          text(a, "tanggal_transaksi"),
        ) || text(b, "created_at").localeCompare(text(a, "created_at")),
    );
  function csv() {
    const encode = (v: unknown, numeric = false) =>
      '"' +
      (!numeric && /^[=+\-@\t\r]/.test(String(v)) ? "'" : "") +
      String(v ?? "").replace(/"/g, '""') +
      '"';
    const rows: unknown[][] = [
      [
        "ID",
        "Tanggal",
        "Jenis",
        "Nama",
        "Akun",
        "Arah",
        "Nominal",
        "Keterangan",
      ],
      ...filteredTransactions.map((t) => [
        t.transaksi_id,
        t.tanggal_transaksi,
        kindNames[text(t, "jenis")],
        txName(t),
        text(
          data.Akun.find((a) => a.akun_id === t.akun_id),
          "nama_akun",
        ),
        t.arah,
        t.nominal,
        t.deskripsi,
      ]),
    ];
    download(
      "\uFEFF" +
        rows
          .map((r, i) => r.map((v, c) => encode(v, i > 0 && c === 6)).join(","))
          .join("\r\n"),
      `garda-${mode === "demo" ? "CONTOH-" : ""}transaksi-${month}.csv`,
      "text/csv;charset=utf-8",
    );
    toast("CSV transaksi berhasil diunduh.");
  }
  async function backup() {
    if (mode === "demo") {
      download(
        JSON.stringify(
          {
            schema: 2,
            simulation: true,
            exportedAt: new Date().toISOString(),
            data,
          },
          null,
          2,
        ),
        "garda-backup-CONTOH.json",
        "application/json",
      );
      return;
    }
    const response = await fetch("/api/backup");
    if (!response.ok) {
      toast("Backup hanya tersedia untuk pemilik yang sudah login.");
      return;
    }
    download(
      await response.text(),
      `garda-backup-${effectiveDate}.json`,
      "application/json",
    );
    toast("Backup lengkap berhasil diunduh.");
  }
  async function migrateSheets() {
    if (!owner || busy || mode !== "real" || pending) return;
    setBusy(true); setError("");
    try {
      let backupHash = "";
      if (initialized) {
        const response = await fetch("/api/backup", { cache: "no-store" });
        if (!response.ok) throw new Error("Cadangan belum dapat diunduh. Struktur belum diperbarui.");
        backupHash = response.headers.get("X-Backup-Hash") || "";
        if (!backupHash) throw new Error("Identitas cadangan tidak tersedia. Muat ulang dan coba kembali.");
        download(await response.text(), "garda-sebelum-migrasi-" + effectiveDate + ".json", "application/json");
      }
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: crypto.randomUUID(), backupHash }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Struktur belum dapat diperbarui.");
      await refreshReal();
      toast("Struktur laporan versi 2 siap. Transaksi lama dipertahankan.");
    } catch (e) { setError(e instanceof Error ? e.message : "Pembaruan struktur gagal."); }
    finally { setBusy(false); }
  }
  function Brand() {
    return (
      <div className="terrace-wordmark" aria-label="Garda Abdi Negara">
        <img src="/favicon.svg" width="35" height="35" alt="" />
        <span>garda<i>.</i><small>ABDI NEGARA</small></span>
      </div>
    );
  }
  function navButton(item: [View, string, string]) {
    return (
      <button
        key={item[0]}
        className={`nav-btn ${view === item[0] ? "active" : ""}`}
        aria-label={item[2]}
        aria-current={view === item[0] ? "page" : undefined}
        onClick={() => go(item[0])}
      >
        <Icon name={item[1]} />
        <span>{item[2]}</span>
        {item[0] === "tagihan" && f.overdue > 0 && (
          <span className="nav-count">{f.bills.filter(b => b.overdue > 0).length}</span>
        )}
      </button>
    );
  }
  function transactionsTable(records: Row[], full = false) {
    return (
      <div className={`table-scroll ${full ? "data-table" : ""}`}>
        <table>
          <thead>
            <tr>
              <th>Transaksi</th>
              <th>Tanggal</th>
              {full && <th>Akun</th>}
              <th style={{ textAlign: "right" }}>Nominal</th>
              {full && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((tx) => (
              <tr key={text(tx, "transaksi_id")}>
                <td>
                  <div className="transaction-name">
                    <span
                      className={`transaction-symbol ${tx.arah === "OUT" ? "expense" : ""} ${text(tx, "jenis").startsWith("TRANSFER") ? "transfer" : ""}`}
                    >
                      <Icon
                        name={
                          text(tx, "jenis").startsWith("TRANSFER")
                            ? "arrows"
                            : tx.arah === "OUT"
                              ? "up"
                              : "down"
                        }
                      />
                    </span>
                    <span className="transaction-copy">
                      <strong>{txName(tx)}</strong>
                      <small>{kindNames[text(tx, "jenis")]}</small>
                    </span>
                  </div>
                </td>
                <td className="transaction-date muted">
                  {dateLabel(text(tx, "tanggal_transaksi"))}
                </td>
                {full && (
                  <td className="transaction-account muted">
                    {text(
                      data.Akun.find((a) => a.akun_id === tx.akun_id),
                      "nama_akun",
                    )}
                  </td>
                )}
                <td
                  className={`amount ${tx.arah === "IN" ? "positive" : "negative"}`}
                >
                  {tx.arah === "IN" ? "+" : "−"}
                  {money(num(tx, "nominal"))}
                </td>
                {full && (
                  <td className="row-actions">
                    {tx.jenis === "PEMBAYARAN_SISWA" && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          open({
                            kind: "receipt",
                            id: text(tx, "transaksi_id"),
                          })
                        }
                      >
                        Kuitansi
                      </button>
                    )}
                    {owner &&
                      canWrite &&
                      tx.jenis !== "PEMBALIK" &&
                      !data.Transaksi.some(
                        (r) =>
                          r.jenis === "PEMBALIK" &&
                          r.transaksi_rujukan_id === tx.transaksi_id,
                      ) && (
                        <button
                          className="text-btn"
                          onClick={() =>
                            open({
                              kind: "reverse",
                              id: text(tx, "transaksi_id"),
                            })
                          }
                        >
                          Koreksi
                        </button>
                      )}
                  </td>
                )}
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td colSpan={full ? 5 : 3} className="empty-row">
                  Belum ada transaksi yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  function Chart() {
    const count = Number(to.slice(8)),
      points = Array.from({ length: count }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, "0")}`;
        return data.Akun.filter(
          (a) => text(a, "tanggal_saldo_awal") <= day,
        ).reduce(
          (sum, a) =>
            sum +
            num(a, "saldo_awal") +
            data.Transaksi.filter(
              (t) =>
                t.akun_id === a.akun_id &&
                text(t, "tanggal_transaksi") >= text(a, "tanggal_saldo_awal") &&
                text(t, "tanggal_transaksi") <= day,
            ).reduce(
              (total, t) =>
                total + num(t, "nominal") * (t.arah === "IN" ? 1 : -1),
              0,
            ),
          0,
        );
      });
    const max = Math.max(
      1000000,
      Math.ceil(Math.max(...points, f.incoming, f.outgoing) / 1000000) *
        1000000,
    );
    const xy = points.map((value, i) => [
      48 + (i / Math.max(1, count - 1)) * 484,
      152 - (value / max) * 118,
    ]);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
    return (
      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h2>Pergerakan kas</h2>
            <p className="panel-sub">
              {dateLabel(from)} – {dateLabel(to)}
            </p>
          </div>
          <div className="chart-switch">
            <button
              className={chart === "balance" ? "active" : ""}
              onClick={() => setChart("balance")}
            >
              Saldo
            </button>
            <button
              className={chart === "flow" ? "active" : ""}
              onClick={() => setChart("flow")}
            >
              Masuk / keluar
            </button>
          </div>
        </div>
        <div className="chart-area">
          <svg
            className="cash-chart"
            viewBox="0 0 550 188"
            role="img"
            aria-label={
              chart === "balance"
                ? "Saldo akhir harian"
                : "Kas masuk dan keluar per bagian bulan"
            }
          >
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <line
                  x1="48"
                  y1={152 - i * 59}
                  x2="532"
                  y2={152 - i * 59}
                  className="chart-grid-line"
                />
                <text x="2" y={156 - i * 59} className="chart-axis">
                  {new Intl.NumberFormat("id-ID", {
                    maximumFractionDigits: 1,
                  }).format((max * i) / 2 / 1000000)}{" "}
                  jt
                </text>
              </g>
            ))}
            {chart === "balance" ? (
              <>
                <path
                  d={`${line} L532,152 L48,152 Z`}
                  className="chart-area-fill"
                />
                <path d={line} className="chart-line" />
                {xy
                  .filter((_, i) =>
                    [0, count - 1, Math.floor(count / 2)].includes(i),
                  )
                  .map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="4" className="chart-dot" />
                  ))}
              </>
            ) : (
              [0, 1, 2, 3].map((i) => {
                const a = Math.floor((i * count) / 4) + 1,
                  b = Math.floor(((i + 1) * count) / 4);
                const range = finance(
                  data,
                  `${month}-${String(a).padStart(2, "0")}`,
                  `${month}-${String(Math.max(a, b)).padStart(2, "0")}`,
                );
                return (
                  <g key={i}>
                    <rect
                      x={87 + i * 119}
                      y={152 - (range.incoming / max) * 118}
                      width="25"
                      height={Math.max(0, (range.incoming / max) * 118)}
                      rx="4"
                      fill="var(--primary)"
                    />
                    <rect
                      x={117 + i * 119}
                      y={152 - (range.outgoing / max) * 118}
                      width="25"
                      height={Math.max(0, (range.outgoing / max) * 118)}
                      rx="4"
                      fill="#d6ac71"
                    />
                    <text
                      x={112 + i * 119}
                      y="178"
                      textAnchor="middle"
                      className="chart-axis"
                    >
                      {a}–{Math.max(a, b)}{" "}
                      {new Intl.DateTimeFormat("id-ID", {
                        month: "short",
                        timeZone: "UTC",
                      }).format(new Date(from))}
                    </text>
                  </g>
                );
              })
            )}
            {chart === "balance" &&
              [0, Math.floor((count - 1) / 2), count - 1].map((i) => (
                <text
                  key={i}
                  x={xy[i]?.[0]}
                  y="178"
                  textAnchor="middle"
                  className="chart-axis"
                >
                  {i + 1}{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(from))}
                </text>
              ))}
          </svg>
        </div>
        <div className="chart-caption">
          <span>
            <i className="legend-dot" />
            {chart === "balance" ? "Saldo akhir harian" : "Kas masuk"}
          </span>
          {chart === "flow" && (
            <span>
              <i className="legend-dot out" />
              Kas keluar
            </span>
          )}
          <span>Transfer internal neto nol</span>
        </div>
      </section>
    );
  }
  function Accounts() {
    return (
      <section className="panel accounts-panel">
        <div className="panel-head">
          <div>
            <h2>Saldo per akun</h2>
            <p className="panel-sub">Posisi akhir periode</p>
          </div>
          <Badge>IDR</Badge>
        </div>
        <div className="account-list">
          {f.accounts.map((a) => (
            <div className="account-row" key={text(a, "akun_id")}>
              <span className="account-icon">
                <Icon name={a.jenis_akun === "KAS" ? "wallet" : "bank"} />
              </span>
              <div className="account-info">
                <strong>{text(a, "nama_akun")}</strong>
                <span>
                  {a.jenis_akun === "KAS"
                    ? "Operasional harian"
                    : "Penerimaan & simpanan"}
                </span>
              </div>
              <strong className="account-amount">
                {a.balance === null ? "Belum tersedia" : money(a.balance)}
              </strong>
            </div>
          ))}
          {!f.accounts.length && (
            <p className="muted small">
              Tambahkan akun kas dan rekening terlebih dahulu.
            </p>
          )}
        </div>
        <div className="account-note">
          <Icon name="shield" />
          <span>Saldo awal dan seluruh mutasi ikut dihitung.</span>
        </div>
      </section>
    );
  }
  function Due() {
    const due = f.bills.find((i) => i.overdue > 0);
    const p = due ? invoicePerson(due.invoice) : null;
    return (
      <section className="panel due-panel">
        <div className="panel-head">
          <div>
            <h2>Perlu perhatian</h2>
            <p className="panel-sub">Bagian tagihan yang sudah jatuh tempo</p>
          </div>
          <span className="due-header-icon">
            <Icon name={due ? "clock" : "check"} />
          </span>
        </div>
        <div className="due-body">
          {due ? (
            <>
              <div className="student-line">
                <span className="student-avatar">
                  {text(p?.student, "nama")
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{text(p?.student, "nama")}</strong>
                  <p>{text(p?.program, "nama_program")}</p>
                </div>
              </div>
              <div className="due-amount">{money(due.overdue)}</div>
              <div className="due-detail">
                <span>{text(due.invoice, "nomor_tagihan")}</span>
                <Badge warning>Terlambat</Badge>
              </div>
              <button
                className="btn"
                disabled={!canWrite}
                onClick={() =>
                  open({ kind: "entry", id: text(due.invoice, "tagihan_id") })
                }
              >
                Catat pembayaran
                <Icon name="right" />
              </button>
            </>
          ) : (
            <>
              <div className="due-amount">Terkendali.</div>
              <p className="muted small">
                Tidak ada tunggakan pada tanggal acuan ini.
              </p>
              <button className="btn" onClick={() => go("tagihan")}>
                Lihat semua tagihan
                <Icon name="right" />
              </button>
            </>
          )}
        </div>
      </section>
    );
  }
  function Dashboard() {
    return (
      <>
        <section className="command-hero">
          <div className="hero-grid" />
          <div className="hero-content">
            <div className="hero-eyebrow">
              <i />
              GARDA ABDI NEGARA / KEUANGAN
            </div>
            <span className="hero-balance-label">Saldo kas & bank</span>
            <h2 className="hero-balance">
              {f.balance === null ? "Data belum tersedia" : money(f.balance)}
            </h2>
            <p>
              Posisi per {dateLabel(to)} · {data.Akun.length} akun usaha
            </p>
            <div className="hero-actions">
              <button
                className="btn light"
                disabled={!canWrite}
                onClick={() => open({ kind: "entry" })}
              >
                <Icon name="plus" />
                Terima pembayaran
              </button>
              <span>
                Surplus operasional <b>{money(f.operational)}</b>
              </span>
            </div>
          </div>
          <div className="hero-insignia" aria-hidden="true">
            <div className="insignia-orbit" />
            <div className="insignia-shield">
              <Icon name="shield" />
              <b>GAN</b>
              <span>LEARN. TRAIN. SERVE.</span>
            </div>
            <div className="insignia-coordinate">KEUANGAN YANG TERTATA</div>
          </div>
        </section>
        <div className="command-metrics">
          {[
            ["Kas masuk", f.incoming, "down", "Penerimaan & pendanaan"],
            ["Kas keluar", f.outgoing, "up", "Pengeluaran eksternal"],
            [
              "Sisa tagihan",
              f.outstanding,
              "receipt",
              "Seluruh kewajiban siswa",
            ],
            ["Tunggakan", f.overdue, "clock", "Jadwal yang sudah lewat"],
          ].map(([name, value, icon, note], i) => (
            <button
              key={String(name)}
              className={`metric-card metric-link ${i === 3 ? "warn" : ""}`}
              onClick={() => go(i < 2 ? "transaksi" : "tagihan")}
            >
              <div className="metric-card-top">
                <span className="metric-label">{name}</span>
                <span
                  className={`metric-icon ${i === 1 || i === 3 ? "out" : ""}`}
                >
                  <Icon name={String(icon)} />
                </span>
              </div>
              <div className="metric-value">{money(Number(value))}</div>
              <div className="metric-note">{note}</div>
            </button>
          ))}
        </div>
        <div className="content-grid">
          <Chart />
          <Accounts />
        </div>
        <div className="bottom-grid">
          <section className="panel transactions-panel">
            <div className="panel-head">
              <div>
                <h2>Transaksi terbaru</h2>
                <p className="panel-sub">Kas, bank, dan perpindahan dana</p>
              </div>
              <button className="text-btn" onClick={() => go("transaksi")}>
                Lihat semua
                <Icon name="arrow" />
              </button>
            </div>
            {transactionsTable(filteredTransactions.slice(0, 4))}
          </section>
          <Due />
        </div>
        {f.credit > 0 && (
          <div className="subtle-banner" style={{ marginTop: 18 }}>
            <Icon name="info" />
            Saldo kredit siswa {money(f.credit)} menunggu penyelesaian atau
            refund.
          </div>
        )}
      </>
    );
  }
  function Transactions() {
    return (
      <>
        <div className="subtle-banner">
          <Icon name="info" />
          Modal dan transfer dipisahkan dari penerimaan operasional. Pembalik
          tetap dapat ditelusuri.
        </div>
        <section className="panel">
          <div className="filter-toolbar">
            <input
              aria-label="Cari transaksi"
              type="search"
              placeholder="Cari siswa atau keterangan..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Filter akun"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="">Semua akun</option>
              {data.Akun.map((a) => (
                <option key={text(a, "akun_id")} value={text(a, "akun_id")}>
                  {text(a, "nama_akun")}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter jenis"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="">Semua jenis</option>
              {Object.entries(kindNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn" onClick={csv}>
              <Icon name="download" />
              CSV
            </button>
          </div>
          {transactionsTable(filteredTransactions, true)}
        </section>
      </>
    );
  }
  function Students() {
    return (
      <>
        <div className="section-actions">
          <span className="muted small">
            {data.Siswa.length} siswa ·{" "}
            {data.Pendaftaran.filter((e) => e.status === "AKTIF").length}{" "}
            pendaftaran aktif
          </span>
          <div>
            <input
              aria-label="Cari siswa"
              placeholder="Cari nama siswa..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="btn primary"
              disabled={!canWrite}
              onClick={() => open({ kind: "student" })}
            >
              <Icon name="plus" />
              Tambah siswa
            </button>
          </div>
        </div>
        <div className="student-grid">
          {data.Siswa.filter((s) =>
            text(s, "nama").toLowerCase().includes(query.toLowerCase()),
          ).map((s) => (
            <article className="panel student-card" key={text(s, "siswa_id")}>
              <div className="student-line">
                <span className="student-avatar">
                  {text(s, "nama")
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{text(s, "nama")}</strong>
                  <p>{text(s, "no_wa") || "Kontak belum diisi"}</p>
                </div>
                <Badge>{active(s) ? "Aktif" : "Nonaktif"}</Badge>
              </div>
              {data.Pendaftaran.filter((e) => e.siswa_id === s.siswa_id).map(
                (e) => (
                  <div
                    className="enrollment-row"
                    key={text(e, "pendaftaran_id")}
                  >
                    <div>
                      <strong>
                        {text(
                          data.Program.find(
                            (p) => p.program_id === e.program_id,
                          ),
                          "nama_program",
                        )}
                      </strong>
                      <small>
                        {text(e, "skema_biaya")} ·{" "}
                        {money(num(e, "tarif_disepakati"))} ·{" "}
                        {text(e, "status")}
                      </small>
                    </div>
                    {canWrite && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          open({
                            kind: "enrollment",
                            id: text(e, "pendaftaran_id"),
                            student: text(s, "siswa_id"),
                          })
                        }
                      >
                        Ubah
                      </button>
                    )}
                  </div>
                ),
              )}
              <div className="student-actions">
                <button
                  className="btn"
                  disabled={!canWrite}
                  onClick={() =>
                    open({ kind: "enrollment", student: text(s, "siswa_id") })
                  }
                >
                  Daftarkan program
                </button>
                <button
                  className="text-btn"
                  disabled={!canWrite}
                  onClick={() =>
                    open({ kind: "student", id: text(s, "siswa_id") })
                  }
                >
                  Edit siswa
                </button>
              </div>
            </article>
          ))}
        </div>
        {!data.Siswa.length && (
          <Empty title="Belum ada siswa">
            Tambahkan siswa, lalu pilih program bimbingan yang diikuti.
          </Empty>
        )}
      </>
    );
  }
  function Invoices() {
    const activeBills = f.bills.filter(b => !b.cancelled);
    const face = activeBills.reduce((sum, b) => sum + b.face, 0);
    const paid = activeBills.reduce((sum, b) => sum + Math.min(b.face, b.paid), 0);
    const percent = face ? Math.min(100, Math.max(0, paid / face * 100)) : 0;
    const overdueCount = activeBills.filter(b => b.overdue > 0).length;
    const remainingCount = activeBills.filter(b => b.remaining > 0).length;
    const filteredBills = f.bills.filter(b => {
      const p = invoicePerson(b.invoice);
      const matches = !query || `${text(p.student, "nama")} ${text(p.program, "nama_program")} ${text(b.invoice, "nomor_tagihan")}`.toLowerCase().includes(query.toLowerCase());
      return matches && (invoiceFilter === "all" || invoiceFilter === "overdue" && b.overdue > 0 || invoiceFilter === "installment" && b.paid > 0 && b.remaining > 0 && !b.overdue || invoiceFilter === "paid" && b.remaining === 0 && !b.cancelled);
    });
    return (
      <>
        <div className="terrace-invoice-summary">
          <section className="terrace-balance-card">
            <span className="eyebrow">SISA SELURUH TAGIHAN</span>
            <strong>{money(f.outstanding)}</strong>
            <p>{remainingCount} tagihan belum selesai · sampai {dateLabel(to)}</p>
            <div><span><Icon name="clock" />{overdueCount} tagihan lewat jatuh tempo</span><button className="icon-btn" onClick={() => setInvoiceFilter("overdue")} aria-label="Lihat tagihan terlambat"><Icon name="arrow" /></button></div>
          </section>
          <section className="terrace-collection-card panel">
            <div className="terrace-ring" style={{ background: `conic-gradient(var(--primary) ${percent}%, var(--surface-soft) 0)` }} aria-label={`${Math.round(percent)} persen nilai tagihan telah dibayar`}><span><b>{Math.round(percent)}<small>%</small></b><em>terbayar</em></span></div>
            <div><span className="eyebrow">PEMBAYARAN TAGIHAN</span><strong>{money(paid)}</strong><p>dari {money(face)} nilai tagihan aktif</p><small>Saldo kredit siswa ditampilkan pada rincian.</small></div>
          </section>
        </div>
        <div className="section-actions">
          <div>
            <h2>Daftar tagihan</h2>
            <span className="muted small">{filteredBills.length} tagihan</span>
          </div>
          <div>
            <button
              className="btn"
              disabled={!canWrite}
              onClick={() => open({ kind: "monthly" })}
            >
              Buat tagihan bulanan
            </button>
            <button
              className="btn primary"
              disabled={!canWrite}
              onClick={() => open({ kind: "invoice" })}
            >
              <Icon name="plus" />
              Buat tagihan
            </button>
          </div>
        </div>
        <div className="terrace-list-controls">
          <div className="terrace-filter-tabs" role="group" aria-label="Filter status tagihan">
            {[["all", "Semua"], ["overdue", "Terlambat"], ["installment", "Cicilan"], ["paid", "Lunas"]].map(([key, label]) => <button key={key} aria-pressed={invoiceFilter === key} onClick={() => setInvoiceFilter(key)}>{label}</button>)}
          </div>
          <label className="terrace-search"><Icon name="search" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari siswa atau nomor tagihan…" aria-label="Cari tagihan" /></label>
        </div>
        <div className="invoice-grid">
          {filteredBills.map((b) => {
            const p = invoicePerson(b.invoice);
            const nextDue = text(b.schedules.find(j => j.remaining > 0) || b.schedules.at(-1), "jatuh_tempo");
            const due = nextDue ? new Date(`${nextDue}T12:00:00Z`) : null;
            return (
              <details
                className="panel invoice-card"
                key={text(b.invoice, "tagihan_id")}
              >
                <summary className="invoice-top">
                  <span className={`terrace-due-date ${b.overdue ? "overdue" : ""}`}><b>{due ? due.getUTCDate() : "—"}</b><small>{due ? new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(due) : "TENGGAT"}</small></span>
                  <div className="student-line">
                    <span className="student-avatar">
                      {text(p.student, "nama")
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>{text(p.student, "nama")}</strong>
                      <p>{text(p.program, "nama_program")}</p>
                    </div>
                  </div>
                  <span className="terrace-invoice-amount"><strong>{money(b.remaining)}</strong><small>Sisa tagihan</small></span>
                  <Badge warning={b.overdue > 0}>
                    {b.cancelled
                      ? "Dibatalkan"
                      : b.face === 0
                        ? "Bebas biaya"
                        : b.overdue
                          ? "Terlambat"
                          : b.remaining
                            ? "Sebagian"
                            : "Lunas"}
                  </Badge>
                  <Icon name="chevron" />
                </summary>
                <div className="invoice-details">
                <span className="muted small">
                  {text(b.invoice, "nomor_tagihan")} ·{" "}
                  {text(b.invoice, "jenis_tagihan")}
                </span>
                <div className="invoice-value">{money(b.remaining)}</div>
                <div className="invoice-split">
                  <span>Terbayar {money(b.paid)}</span>
                  <span>Nilai {money(b.face)}</span>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${b.face ? Math.min(100, (b.paid / b.face) * 100) : 100}%`,
                    }}
                  />
                </div>
                <div className="schedule">
                  {b.schedules.map((j) => (
                    <div className="schedule-row" key={text(j, "jadwal_id")}>
                      <span>
                        <Icon name={j.remaining ? "clock" : "check"} />
                        {dateLabel(text(j, "jatuh_tempo"))}
                      </span>
                      <span>
                        {j.remaining ? money(j.remaining) : "Terpenuhi"}
                      </span>
                    </div>
                  ))}
                </div>
                {b.credit > 0 && (
                  <div className="dialog-note">
                    Saldo kredit siswa {money(b.credit)}
                  </div>
                )}
                <button
                  className="btn primary"
                  disabled={!canWrite || !b.remaining || b.cancelled}
                  onClick={() =>
                    open({ kind: "entry", id: text(b.invoice, "tagihan_id") })
                  }
                >
                  <Icon name="plus" />
                  {b.remaining ? "Catat pembayaran" : "Pembayaran selesai"}
                </button>
                {owner && canWrite && (
                  <div className="invoice-admin">
                    <button
                      className="text-btn"
                      onClick={() =>
                        open({
                          kind: "adjust",
                          id: text(b.invoice, "tagihan_id"),
                        })
                      }
                    >
                      Sesuaikan tagihan
                    </button>
                    <button
                      className="text-btn"
                      onClick={() =>
                        open({
                          kind: "adjust-history",
                          id: text(b.invoice, "tagihan_id"),
                        })
                      }
                    >
                      Riwayat
                    </button>
                    <button
                      className="text-btn"
                      disabled={b.paid <= 0}
                      onClick={() =>
                        open({
                          kind: "refund",
                          id: text(b.invoice, "tagihan_id"),
                        })
                      }
                    >
                      Refund
                    </button>
                  </div>
                )}
                </div>
              </details>
            );
          })}
        </div>
        {!!f.bills.length && !filteredBills.length && <Empty title="Tidak ada tagihan yang cocok">Coba nama siswa atau status lain.</Empty>}
        {!f.bills.length && (
          <Empty title="Belum ada tagihan">
            Daftarkan siswa ke program, lalu terbitkan tagihan paket atau
            bulanan.
          </Empty>
        )}
      </>
    );
  }
  function Reports() {
    return <FinancialReports data={data} actor={actor} month={month} canWrite={canWrite} busy={busy} simulation={mode === "demo"} dataAsOf={dataAsOf} execute={execute}>{LegacyReports()}</FinancialReports>;
  }
  function LegacyReports() {
    const reconciliation = reconciliationFor(data, month);
    const periodClosed = JSON.parse(setting(data, "closed_periods", "[]")).includes(month);
    const currentAccounts = finance(data, month + "-01", endOfMonth(month)).accounts.filter(a => a.available);
    const stale = Boolean(reconciliation && (reconciliation.accounts.length !== currentAccounts.length || reconciliation.accounts.some(a => currentAccounts.find(c => c.akun_id === a.akun_id)?.balance !== a.expected)));
    const payments = f.transactions
      .filter((t) => t.jenis === "PEMBAYARAN_SISWA")
      .reduce((s, t) => s + num(t, "nominal"), 0);
    return (
      <>
        <div className="section-actions">
          <label className="report-asof">
            <span className="muted small">Tanggal acuan · basis kas</span>
            <input
              aria-label="Tanggal acuan laporan"
              type="date"
              min={from}
              max={endOfMonth(month)}
              value={to}
              onChange={(e) => {
                if (e.target.value) setAsOf(e.target.value);
              }}
            />
          </label>
          <div>
            <button className="btn" onClick={() => window.print()}>
              <Icon name="print" />
              Cetak / PDF
            </button>
            <button className="btn" onClick={csv}>
              <Icon name="download" />
              Ekspor CSV
            </button>
            {owner && (
              <button
                className="btn primary"
                disabled={!canWrite}
                onClick={() => open({ kind: "period" })}
              >
                <Icon name="lock" />
                Cocokkan saldo / tutup bulan
              </button>
            )}
          </div>
        </div>
        <div className="report-line report-period-state"><span>Status bulan {month}</span><Badge>{periodClosed ? "Periode ditutup" : "Periode terbuka"}</Badge></div>
        {reconciliation && <section className="panel reconciliation-summary">
          <h2>Pencocokan saldo {month}</h2>
          <p className="panel-sub">Posisi {dateLabel(endOfMonth(month))} · Diperiksa {new Date(reconciliation.checkedAt).toLocaleString("id-ID", { timeZone: setting(data, "timezone", "Asia/Jakarta") })} · {reconciliation.note}</p>
          {stale && <p role="status" className="balance-difference">Saldo tercatat berubah setelah pemeriksaan. Cocokkan ulang sebelum menutup bulan.</p>}
          {reconciliation.accounts.map(a => <div className="report-line" key={a.akun_id}><span>{a.nama_akun}<small>Nyata {money(a.actual)} · Tercatat {money(a.expected)}</small></span><strong className={a.difference === 0 ? "balance-matched" : "balance-difference"}>{a.difference === 0 ? "Cocok" : `Selisih ${money(a.difference)}`}</strong></div>)}
        </section>}
        <div className="report-grid">
          <section className="panel report-panel">
            <h2>
              {businessName}
              <br />
              <span className="muted small">
                Laporan keuangan {month}
                {mode === "demo" ? " · DATA CONTOH" : ""}
              </span>
            </h2>
            {[
              ["Kas masuk eksternal", f.incoming],
              ["Kas keluar eksternal", f.outgoing],
              ["Surplus operasional", f.operational],
              ["Saldo akhir kas & bank", f.balance],
              ["Sisa seluruh tagihan", f.outstanding],
              ["Tunggakan jatuh tempo", f.overdue],
              ["Saldo kredit siswa", f.credit],
            ].map(([name, value]) => (
              <div
                className={`report-line ${name === "Surplus operasional" ? "total" : ""}`}
                key={String(name)}
              >
                <span>{name}</span>
                <strong>
                  {value === null ? "Belum tersedia" : money(Number(value))}
                </strong>
              </div>
            ))}
            <p className="muted small" style={{ marginTop: 18 }}>
              Penerimaan dicatat saat uang diterima. Modal, saldo awal, dan
              transfer internal dipisahkan dari surplus operasional.
            </p>
          </section>
          <div className="report-side">
            <Accounts />
            <section className="panel report-panel">
              <h2>Penerimaan per program</h2>
              {data.Program.map((p) => {
                const ids = data.Pendaftaran.filter(
                  (e) => e.program_id === p.program_id,
                ).map((e) => e.pendaftaran_id);
                const bills = data.Tagihan.filter((i) =>
                  ids.includes(i.pendaftaran_id),
                ).map((i) => i.tagihan_id);
                const total = f.transactions
                  .filter(
                    (t) =>
                      bills.includes(t.tagihan_id) &&
                      ["PEMBAYARAN_SISWA", "REFUND_SISWA", "PEMBALIK"].includes(
                        text(t, "jenis"),
                      ),
                  )
                  .reduce(
                    (sum, t) =>
                      sum + num(t, "nominal") * (t.arah === "IN" ? 1 : -1),
                    0,
                  );
                return (
                  <div className="report-line" key={text(p, "program_id")}>
                    <span>{text(p, "nama_program")}</span>
                    <strong>{money(total)}</strong>
                  </div>
                );
              })}
              <h2 style={{ margin: "24px 0 6px" }}>Pengeluaran per kategori</h2>
              {data.Kategori.filter((c) =>
                text(c, "jenis_yang_diizinkan").includes("BIAYA"),
              ).map((c) => (
                <div className="report-line" key={text(c, "kategori_id")}>
                  <span>{text(c, "nama_kategori")}</span>
                  <strong>
                    {money(
                      f.transactions
                        .filter((t) => t.kategori_id === c.kategori_id)
                        .reduce(
                          (sum, t) =>
                            sum +
                            num(t, "nominal") * (t.arah === "OUT" ? 1 : -1),
                          0,
                        ),
                    )}
                  </strong>
                </div>
              ))}
              <span className="sr-only">
                Total pembayaran siswa {money(payments)}
              </span>
            </section>
          </div>
        </div>
        <section className="panel report-panel ledger-report">
          <h2>Buku kas periode ini</h2>
          {transactionsTable(filteredTransactions, true)}
        </section>
        <section className="panel report-panel ledger-report">
          <h2>Tagihan dan umur tunggakan</h2>
          {f.bills.map((b) => {
            const p = invoicePerson(b.invoice);
            const earliest = b.schedules.find(
              (j) => j.remaining > 0 && text(j, "jatuh_tempo") < to,
            );
            const days = earliest
              ? Math.floor(
                  (Date.parse(to) - Date.parse(text(earliest, "jatuh_tempo"))) /
                    86400000,
                )
              : 0;
            return (
              <div className="report-line" key={text(b.invoice, "tagihan_id")}>
                <span>
                  {text(p.student, "nama")}
                  <small className="muted">
                    {" "}
                    · {days ? `${days} hari` : "Belum terlambat"}
                  </small>
                </span>
                <strong>
                  {money(b.overdue)}{" "}
                  <small className="muted">/ sisa {money(b.remaining)}</small>
                </strong>
              </div>
            );
          })}
        </section>
      </>
    );
  }
  function Settings() {
    const masterSections: [Table, string, string][] = [
      ["Akun", "Akun kas & bank", "nama_akun"],
      ["Program", "Program & tarif", "nama_program"],
      ["Kategori", "Kategori transaksi", "nama_kategori"],
    ];
    return (
      <>
        <div className="settings-grid">
          <section className="panel report-panel">
            <h2>Identitas & operasional</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget));
                void execute("settings.save", d);
              }}
            >
              <div className="form-grid">
                <Field label="Nama bimbel" full>
                  <input
                    name="business_name"
                    defaultValue={businessName}
                    required
                    maxLength={150}
                    disabled={!owner}
                  />
                </Field>
                <Field label="Zona waktu" full>
                  <select
                    name="timezone"
                    defaultValue={setting(data, "timezone", "Asia/Jakarta")}
                    disabled={!owner}
                  >
                    <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                    <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                    <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                  </select>
                </Field>
              </div>
              <div className="form-actions">
                <button
                  className="btn primary"
                  disabled={!canWrite || !owner || busy}
                >
                  Simpan pengaturan
                </button>
              </div>
            </form>
          </section>
          <section className="panel report-panel">
            <h2>Data & koneksi</h2>
            <div className="report-line">
              <span>Sumber saat ini</span>
              <Badge>{mode === "demo" ? "Data contoh" : "Google Sheets"}</Badge>
            </div>
            <div className="report-line">
              <span>Akun yang aktif</span>
              <strong>{actor.role}</strong>
            </div>
            {mode === "real" && (
              <>
                <div className="report-line">
                  <span>Struktur spreadsheet</span>
                  <strong>{initialized ? schemaReady ? "Versi 2 · siap" : "Perlu pembaruan ke versi 2" : "Perlu setup"}</strong>
                </div>
                <div className="report-line">
                  <span>Penulisan</span>
                  <strong>
                    {cap?.writeEnabled && cap.coordinator
                      ? "Aktif"
                      : "Baca saja"}
                  </strong>
                </div>
              </>
            )}
            <p className="muted small" style={{ margin: "18px 0" }}>
              {mode === "demo"
                ? "Perubahan contoh disimpan di browser ini. Data contoh tidak dikirim ke spreadsheet."
                : "Data nyata dibaca dan ditulis hanya melalui server yang memeriksa akun Anda."}
            </p>
            <div className="settings-buttons">
              {mode === "real" && owner && cap?.coordinator && (
                <button className="btn" onClick={() => void inspectWriting()}>
                  <Icon name="clock" />
                  Periksa penulisan
                </button>
              )}
              {owner && (
                <button className="btn" onClick={() => void backup()}>
                  <Icon name="download" />
                  Backup lengkap
                </button>
              )}
              {mode === "demo" ? (
                <>
                  <button
                    className="btn primary"
                    onClick={() => void loadReal()}
                  >
                    Gunakan data nyata
                  </button>
                  <button
                    className="btn"
                    onClick={() => open({ kind: "reset" })}
                  >
                    <Icon name="refresh" />
                    Pulihkan contoh
                  </button>
                </>
              ) : (
                <button className="btn" onClick={useDemo}>
                  Kembali ke contoh
                </button>
              )}
            </div>
          </section>
          {masterSections.map(([table, title, label]) => (
            <section className="panel report-panel" key={table}>
              <div className="settings-heading">
                <h2>{title}</h2>
                <button
                  className="text-btn"
                  disabled={!owner || !canWrite}
                  onClick={() => open({ kind: "master", table })}
                >
                  <Icon name="plus" />
                  Tambah
                </button>
              </div>
              {data[table].map((r) => (
                <div className="master-row" key={String(r[COLUMNS[table][0]])}>
                  <div>
                    <strong>{text(r, label)}</strong>
                    <small>
                      {table === "Akun"
                        ? `Saldo awal ${money(num(r, "saldo_awal"))} · ${text(r, "tanggal_saldo_awal")}`
                        : table === "Program"
                          ? `${text(r, "skema_default")} · ${money(num(r, "tarif_default"))}`
                          : text(r, "jenis_yang_diizinkan")}
                    </small>
                  </div>
                  <button
                    className="text-btn"
                    disabled={!owner || !canWrite}
                    onClick={() =>
                      open({
                        kind: "master",
                        table,
                        id: String(r[COLUMNS[table][0]]),
                      })
                    }
                  >
                    {active(r) ? "Ubah" : "Nonaktif"}
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
        {owner && (
          <>
            <section className="panel report-panel ledger-report">
              <div className="settings-heading">
                <h2>Pengguna yang diizinkan</h2>
                <button
                  className="btn"
                  disabled={!canWrite}
                  onClick={() => open({ kind: "user" })}
                >
                  <Icon name="plus" />
                  Tambah pengguna
                </button>
              </div>
              {data.Pengguna.map((u) => (
                <div className="master-row" key={text(u, "user_id")}>
                  <div>
                    <strong>{text(u, "nama")}</strong>
                    <small>
                      {text(u, "email")} · {text(u, "role")} ·{" "}
                      {active(u) ? "Aktif" : "Nonaktif"}
                    </small>
                  </div>
                  <button
                    className="text-btn"
                    disabled={!canWrite}
                    onClick={() =>
                      open({ kind: "user", id: text(u, "user_id") })
                    }
                  >
                    Ubah akses
                  </button>
                </div>
              ))}
            </section>
            <section className="panel report-panel ledger-report">
              <h2>Riwayat perubahan</h2>
              {[...data.Operasi]
                .reverse()
                .slice(0, 50)
                .map((o) => (
                  <div className="audit-row" key={text(o, "operation_id")}>
                    <strong>{text(o, "aksi")}</strong>
                    <span>{text(o, "actor_id")}</span>
                    <small>
                      {text(o, "committed_at").replace("T", " ").slice(0, 19)}{" "}
                      UTC
                    </small>
                    <p>{text(o, "alasan") || text(o, "entity_type")}</p>
                  </div>
                ))}
              {!data.Operasi.length && (
                <p className="muted small">
                  Belum ada perubahan dalam ruang kerja ini.
                </p>
              )}
            </section>
          </>
        )}
      </>
    );
  }
  function AccountSelect({
    name = "akun_id",
    label = "Akun",
    defaultValue = "",
  }: {
    name?: string;
    label?: string;
    defaultValue?: string;
  }) {
    return (
      <Field label={label}>
        <select
          name={name}
          defaultValue={defaultValue || text(data.Akun.find(active), "akun_id")}
          required
        >
          {data.Akun.filter(active).map((a) => (
            <option key={text(a, "akun_id")} value={text(a, "akun_id")}>
              {text(a, "nama_akun")}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  function DateField({
    name = "tanggal_transaksi",
    label = "Tanggal",
    defaultValue = effectiveDate,
  }: {
    name?: string;
    label?: string;
    defaultValue?: string;
  }) {
    return (
      <Field label={label}>
        <input type="date" name={name} defaultValue={defaultValue} required />
      </Field>
    );
  }
  function AmountField({
    name = "nominal",
    label = "Nominal (Rp)",
    defaultValue,
    min = 1,
  }: {
    name?: string;
    label?: string;
    defaultValue?: number;
    min?: number;
  }) {
    return (
      <Field label={label}>
        <input
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max="1000000000000"
          step="1"
          defaultValue={defaultValue}
          required
          placeholder="Contoh: 150000"
        />
      </Field>
    );
  }
  function modalFields() {
    if (!modal) return null;
    const row = modal.id
      ? data[
          modal.table ||
            (modal.kind === "student"
              ? "Siswa"
              : modal.kind === "enrollment"
                ? "Pendaftaran"
                : modal.kind === "user"
                  ? "Pengguna"
                  : "Transaksi")
        ].find(
          (r) =>
            r[
              COLUMNS[
                modal.table ||
                  (modal.kind === "student"
                    ? "Siswa"
                    : modal.kind === "enrollment"
                      ? "Pendaftaran"
                      : modal.kind === "user"
                        ? "Pengguna"
                        : "Transaksi")
              ][0]
            ] === modal.id,
        )
      : undefined;
    if (modal.kind === "student")
      return (
        <>
          <Field label="Nama siswa" full>
            <input
              name="nama"
              defaultValue={text(row, "nama")}
              maxLength={150}
              required
            />
          </Field>
          <Field label="WhatsApp siswa">
            <input
              name="no_wa"
              defaultValue={text(row, "no_wa")}
              inputMode="tel"
              maxLength={30}
            />
          </Field>
          <DateField
            name="tanggal_daftar"
            label="Tanggal daftar"
            defaultValue={text(row, "tanggal_daftar") || effectiveDate}
          />
          <Field label="Nama wali">
            <input
              name="nama_wali"
              defaultValue={text(row, "nama_wali")}
              maxLength={150}
            />
          </Field>
          <Field label="WhatsApp wali">
            <input
              name="no_wa_wali"
              defaultValue={text(row, "no_wa_wali")}
              inputMode="tel"
              maxLength={30}
            />
          </Field>
          <Field label="Catatan" full>
            <textarea
              name="catatan"
              defaultValue={text(row, "catatan")}
              maxLength={500}
            />
          </Field>
          <label className="check-field full">
            <input
              name="aktif"
              type="checkbox"
              defaultChecked={!row || active(row)}
            />
            Siswa aktif
          </label>
        </>
      );
    if (modal.kind === "enrollment")
      return (
        <>
          <Field label="Siswa" full>
            <select
              name="siswa_id"
              defaultValue={text(row, "siswa_id") || modal.student}
              required
            >
              {data.Siswa.filter(active).map((s) => (
                <option key={text(s, "siswa_id")} value={text(s, "siswa_id")}>
                  {text(s, "nama")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Program">
            <select
              name="program_id"
              defaultValue={
                text(row, "program_id") ||
                text(data.Program.find(active), "program_id")
              }
              onChange={(e) => {
                const p = data.Program.find(
                  (p) => p.program_id === e.target.value,
                );
                const form = e.target.form;
                if (form) {
                  (
                    form.elements.namedItem(
                      "tarif_disepakati",
                    ) as HTMLInputElement
                  ).value = text(p, "tarif_default");
                  (
                    form.elements.namedItem("skema_biaya") as HTMLSelectElement
                  ).value = text(p, "skema_default");
                }
              }}
              required
            >
              {data.Program.filter(active).map((p) => (
                <option
                  key={text(p, "program_id")}
                  value={text(p, "program_id")}
                >
                  {text(p, "nama_program")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Angkatan">
            <input
              name="angkatan"
              defaultValue={text(row, "angkatan") || month}
              maxLength={100}
            />
          </Field>
          <DateField
            name="tanggal_mulai"
            label="Mulai"
            defaultValue={text(row, "tanggal_mulai") || effectiveDate}
          />
          <Field label="Selesai (opsional)">
            <input
              name="tanggal_selesai"
              type="date"
              defaultValue={text(row, "tanggal_selesai")}
            />
          </Field>
          <Field label="Skema biaya">
            <select
              name="skema_biaya"
              defaultValue={
                text(row, "skema_biaya") ||
                text(data.Program.find(active), "skema_default")
              }
            >
              <option value="PAKET">Paket</option>
              <option value="BULANAN">Bulanan</option>
            </select>
          </Field>
          <AmountField
            name="tarif_disepakati"
            label="Tarif kesepakatan (Rp)"
            min={0}
            defaultValue={
              row
                ? num(row, "tarif_disepakati")
                : num(data.Program.find(active), "tarif_default")
            }
          />
          <Field label="Hari jatuh tempo bulanan">
            <input
              name="hari_jatuh_tempo"
              type="number"
              min="1"
              max="31"
              defaultValue={num(row, "hari_jatuh_tempo") || 5}
              required
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={text(row, "status") || "AKTIF"}>
              {["AKTIF", "CUTI", "SELESAI", "BERHENTI"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </>
      );
    if (modal.kind === "invoice") {
      const e = data.Pendaftaran.find((p) => p.pendaftaran_id === enrollmentId),
        price = num(e, "tarif_disepakati");
      return (
        <>
          <Field label="Pendaftaran siswa" full>
            <select
              name="pendaftaran_id"
              value={enrollmentId}
              onChange={(ev) => setEnrollmentId(ev.target.value)}
              required
            >
              {data.Pendaftaran.filter((p) => p.status === "AKTIF").map((p) => (
                <option
                  key={text(p, "pendaftaran_id")}
                  value={text(p, "pendaftaran_id")}
                >
                  {text(
                    data.Siswa.find((s) => s.siswa_id === p.siswa_id),
                    "nama",
                  )}{" "}
                  ·{" "}
                  {text(
                    data.Program.find((i) => i.program_id === p.program_id),
                    "nama_program",
                  )}
                </option>
              ))}
            </select>
          </Field>
          <div className="dialog-note full">
            Tarif {money(price)} ·{" "}
            {text(e, "skema_biaya") || "Pilih pendaftaran"}
          </div>
          <DateField name="tanggal_terbit" label="Tanggal terbit" />
          <Field label="Bulan layanan">
            <input
              name="periode_layanan"
              type="month"
              value={invoiceMonth}
              onChange={(event) => setInvoiceMonth(event.target.value)}
              disabled={e?.skema_biaya !== "BULANAN"}
            />
          </Field>
          <AmountField
            name="diskon_awal"
            label="Diskon awal (Rp)"
            min={0}
            defaultValue={0}
          />
          <Field label="Jumlah tahap pembayaran">
            <select
              value={stageCount}
              onChange={(ev) => setStageCount(Number(ev.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Sekali bayar" : n + " cicilan"}
                </option>
              ))}
            </select>
          </Field>
          <div
            className="schedule-form full"
            key={enrollmentId + ":" + stageCount + ":" + invoiceMonth}
          >
            {Array.from({ length: stageCount }, (_, i) => {
              const value =
                i === stageCount - 1
                  ? price - Math.floor(price / stageCount) * i
                  : Math.floor(price / stageCount);
              const startMonth =
                e?.skema_biaya === "BULANAN"
                  ? invoiceMonth
                  : effectiveDate.slice(0, 7);
              const [year, monthNumber] = startMonth.split("-").map(Number);
              const targetMonth = new Date(
                Date.UTC(year, monthNumber - 1 + i, 1),
              )
                .toISOString()
                .slice(0, 7);
              const stageDate = dueDate(
                targetMonth,
                e?.skema_biaya === "BULANAN"
                  ? num(e, "hari_jatuh_tempo")
                  : Number(effectiveDate.slice(8)),
              );
              return (
                <div className="form-grid" key={i}>
                  <DateField
                    name={"jadwal_date_" + i}
                    label={"Jatuh tempo tahap " + (i + 1)}
                    defaultValue={stageDate}
                  />
                  <AmountField
                    name={"jadwal_amount_" + i}
                    label={"Nominal tahap " + (i + 1)}
                    min={0}
                    defaultValue={value}
                  />
                </div>
              );
            })}
          </div>
          <p className="form-hint full">
            Jumlah jadwal harus sama dengan tarif setelah diskon. Sesuaikan
            nominal tahap jika memberi diskon.
          </p>
        </>
      );
    }
    if (modal.kind === "monthly")
      return (
        <>
          <Field label="Bulan layanan">
            <input
              name="periode_layanan"
              type="month"
              value={invoiceMonth}
              onChange={(event) => {
                setInvoiceMonth(event.target.value);
                setMonthlyIds(
                  monthlyCandidates(event.target.value)
                    .slice(0, 50)
                    .map((e) => text(e, "pendaftaran_id")),
                );
              }}
              required
            />
          </Field>
          <DateField name="tanggal_terbit" label="Tanggal penerbitan" />
          <p className="form-hint full">
            Pilih maksimal 50 pendaftaran. Tagihan bulan yang sudah ada akan
            dilewati, termasuk yang sudah lunas.
          </p>
          <div className="dialog-note full">
            {monthlyIds.length} calon tagihan baru · Total{" "}
            {money(
              data.Pendaftaran.filter((e) =>
                monthlyIds.includes(text(e, "pendaftaran_id")),
              ).reduce((sum, e) => sum + num(e, "tarif_disepakati"), 0),
            )}
          </div>
          {monthlyCandidates(invoiceMonth).map((e) => (
            <label className="check-field full" key={text(e, "pendaftaran_id")}>
              <input
                type="checkbox"
                name="pendaftaran_ids"
                value={text(e, "pendaftaran_id")}
                checked={monthlyIds.includes(text(e, "pendaftaran_id"))}
                onChange={(event) =>
                  setMonthlyIds((old) =>
                    event.target.checked
                      ? [...old, text(e, "pendaftaran_id")].slice(0, 50)
                      : old.filter((id) => id !== e.pendaftaran_id),
                  )
                }
              />
              {text(
                data.Siswa.find((s) => s.siswa_id === e.siswa_id),
                "nama",
              )}{" "}
              · {money(num(e, "tarif_disepakati"))}
            </label>
          ))}
        </>
      );
    if (modal.kind === "entry")
      return (
        <>
          <Field label="Jenis transaksi" full>
            <select
              value={entryKind}
              onChange={(e) => setEntryKind(e.target.value)}
            >
              {[
                "PEMBAYARAN_SISWA",
                "BIAYA",
                "PENERIMAAN_LAIN",
                "MODAL_MASUK",
                "PRIVE",
                "PINJAMAN_MASUK",
                "POKOK_PINJAMAN_KELUAR",
                "TRANSFER",
              ].map((k) => (
                <option key={k} value={k}>
                  {kindNames[k] || "Transfer antar akun"}
                </option>
              ))}
            </select>
          </Field>
          {entryKind === "PEMBAYARAN_SISWA" && (
            <Field label="Tagihan siswa" full>
              <select
                name="tagihan_id"
                defaultValue={
                  modal.id ||
                  text(
                    data.Tagihan.find(
                      (i) => invoiceSummary(data, i, effectiveDate).overdue > 0,
                    ) || data.Tagihan[0],
                    "tagihan_id",
                  )
                }
                required
              >
                {data.Tagihan.filter(
                  (i) =>
                    invoiceSummary(data, i).remaining > 0 &&
                    !invoiceSummary(data, i).cancelled,
                ).map((i) => (
                  <option
                    key={text(i, "tagihan_id")}
                    value={text(i, "tagihan_id")}
                  >
                    {text(invoicePerson(i).student, "nama")} · sisa{" "}
                    {money(invoiceSummary(data, i).remaining)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <DateField />
          <AmountField />
          {entryKind === "TRANSFER" ? (
            <>
              <AccountSelect name="dari_akun_id" label="Akun asal" />
              <AccountSelect
                name="ke_akun_id"
                label="Akun tujuan"
                defaultValue={text(data.Akun.filter(active)[1], "akun_id")}
              />
            </>
          ) : (
            <AccountSelect
              label={
                entryKind === "BIAYA" || entryKind === "PRIVE"
                  ? "Dibayar dari"
                  : "Diterima di"
              }
            />
          )}
          <Field
            label={
              entryKind === "PEMBAYARAN_SISWA"
                ? "Metode pembayaran"
                : "Kategori"
            }
          >
            <select
              name={
                entryKind === "PEMBAYARAN_SISWA"
                  ? "metode_pembayaran"
                  : "kategori_id"
              }
            >
              {entryKind === "PEMBAYARAN_SISWA" ? (
                ["Tunai", "Transfer bank", "QRIS"].map((k) => (
                  <option key={k}>{k}</option>
                ))
              ) : (
                <>
                  <option value="">Tanpa kategori</option>
                  {data.Kategori.filter(
                    (c) =>
                      active(c) &&
                      text(c, "jenis_yang_diizinkan")
                        .split(",")
                        .includes(entryKind),
                  ).map((c) => (
                    <option
                      key={text(c, "kategori_id")}
                      value={text(c, "kategori_id")}
                    >
                      {text(c, "nama_kategori")}
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>
          <Field label="Keterangan" full>
            <input
              name="deskripsi"
              placeholder="Contoh: pembayaran cicilan pertama"
              maxLength={500}
              required
            />
          </Field>
          <Field label="Referensi bank / kuitansi">
            <input name="referensi_eksternal" maxLength={100} />
          </Field>
          <Field label="Tautan bukti (opsional)">
            <input name="bukti_url" type="url" placeholder="https://..." />
          </Field>
          <Field label="Alasan bila saldo menjadi negatif (OWNER)" full>
            <input name="alasan" maxLength={500} />
          </Field>
        </>
      );
    if (modal.kind === "reverse")
      return (
        <>
          <div className="dialog-note full">
            Membuat transaksi pembalik untuk {txName(row || {})},{" "}
            {money(num(row, "nominal"))}. Catatan asal tetap tersimpan. Catat
            transaksi pengganti setelah pembalikan bila diperlukan.
          </div>
          <DateField />
          <Field label="Alasan koreksi" full>
            <textarea name="alasan" maxLength={500} required />
          </Field>
        </>
      );
    if (modal.kind === "adjust-reverse")
      return (
        <>
          <DateField
            name="tanggal_efektif"
            label="Tanggal pembalik penyesuaian"
          />
          <Field label="Alasan pembetulan" full>
            <textarea name="alasan" required maxLength={500} />
          </Field>
          <p className="form-hint full">
            Catatan penyesuaian asal tetap tersimpan. Kewajiban dan jadwal akan
            dihitung kembali.
          </p>
        </>
      );
    if (modal.kind === "refund" || modal.kind === "adjust") {
      const i = data.Tagihan.find((i) => i.tagihan_id === modal.id) || {};
      const summary = invoiceSummary(data, i);
      return (
        <>
          <div className="dialog-note full">
            {text(invoicePerson(i).student, "nama")} · Kewajiban{" "}
            {money(summary.face)}, terbayar {money(summary.paid)}, sisa{" "}
            {money(summary.remaining)}.
          </div>
          {modal.kind === "refund" ? (
            <>
              <Field label="Pembayaran yang dikembalikan" full>
                <select name="transaksi_rujukan_id" required>
                  {data.Transaksi.filter(
                    (t) =>
                      t.tagihan_id === modal.id &&
                      t.jenis === "PEMBAYARAN_SISWA" &&
                      !data.Transaksi.some(
                        (r) =>
                          r.jenis === "PEMBALIK" &&
                          r.transaksi_rujukan_id === t.transaksi_id,
                      ),
                  ).map((t) => (
                    <option
                      key={text(t, "transaksi_id")}
                      value={text(t, "transaksi_id")}
                    >
                      {dateLabel(text(t, "tanggal_transaksi"))} ·{" "}
                      {money(num(t, "nominal"))}
                    </option>
                  ))}
                </select>
              </Field>
              <DateField />
              <AmountField label="Uang dikembalikan (Rp)" />
              <AccountSelect label="Refund dari akun" />
              <AmountField
                name="pengurangan"
                label="Pengurangan kewajiban (Rp)"
                min={0}
                defaultValue={0}
              />
              <p className="form-hint full">
                Pengembalian uang dan pengurangan tagihan dihitung terpisah. Isi
                keduanya sesuai keputusan pembatalan layanan.
              </p>
            </>
          ) : (
            <>
              <DateField name="tanggal_efektif" label="Tanggal efektif" />
              <AmountField
                label="Pengurangan kewajiban (Rp)"
                defaultValue={summary.remaining || summary.face}
              />
            </>
          )}
          <label className="check-field full">
            <input name="batalkan" type="checkbox" />
            Pembatalan penuh tagihan (pengurangan harus sebesar kewajiban)
          </label>
          <Field label="Alasan" full>
            <textarea name="alasan" required maxLength={500} />
          </Field>
        </>
      );
    }
    if (modal.kind === "master")
      return (
        <>
          {modal.table === "Akun" ? (
            <>
              <Field label="Nama akun" full>
                <input
                  name="nama_akun"
                  defaultValue={text(row, "nama_akun")}
                  required
                />
              </Field>
              <Field label="Jenis akun">
                <select
                  name="jenis_akun"
                  defaultValue={text(row, "jenis_akun") || "KAS"}
                >
                  {["KAS", "BANK", "EWALLET"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <AmountField
                name="saldo_awal"
                label="Saldo awal (Rp)"
                min={0}
                defaultValue={num(row, "saldo_awal")}
              />
              <DateField
                name="tanggal_saldo_awal"
                label="Tanggal saldo awal"
                defaultValue={text(row, "tanggal_saldo_awal") || effectiveDate}
              />
            </>
          ) : modal.table === "Program" ? (
            <>
              <Field label="Nama program" full>
                <input
                  name="nama_program"
                  defaultValue={text(row, "nama_program")}
                  required
                />
              </Field>
              <Field label="Target seleksi">
                <input
                  name="target_seleksi"
                  defaultValue={text(row, "target_seleksi") || "TNI"}
                  required
                />
              </Field>
              <Field label="Skema biaya">
                <select
                  name="skema_default"
                  defaultValue={text(row, "skema_default") || "PAKET"}
                >
                  <option value="PAKET">Paket</option>
                  <option value="BULANAN">Bulanan</option>
                </select>
              </Field>
              <AmountField
                name="tarif_default"
                label="Tarif awal (Rp)"
                min={0}
                defaultValue={num(row, "tarif_default")}
              />
            </>
          ) : (
            <>
              <Field label="Nama kategori" full>
                <input
                  name="nama_kategori"
                  defaultValue={text(row, "nama_kategori")}
                  required
                />
              </Field>
              <Field label="Jenis transaksi">
                <select
                  name="jenis_yang_diizinkan"
                  defaultValue={text(row, "jenis_yang_diizinkan") || "BIAYA"}
                >
                  {[
                    "BIAYA",
                    "PENERIMAAN_LAIN",
                    "MODAL_MASUK",
                    "PRIVE",
                    "PINJAMAN_MASUK",
                    "POKOK_PINJAMAN_KELUAR",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {kindNames[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kelompok arus">
                <select
                  name="kelompok_arus"
                  defaultValue={text(row, "kelompok_arus") || "OPERASIONAL"}
                >
                  <option>OPERASIONAL</option>
                  <option>PENDANAAN</option>
                </select>
              </Field>
            </>
          )}
          <label className="check-field full">
            <input
              name="aktif"
              type="checkbox"
              defaultChecked={!row || active(row)}
            />
            Aktif
          </label>
        </>
      );
    if (modal.kind === "user")
      return (
        <>
          <Field label="Nama" full>
            <input name="nama" defaultValue={text(row, "nama")} required />
          </Field>
          <Field label="Email Google" full>
            <input
              name="email"
              type="email"
              defaultValue={text(row, "email")}
              required
              readOnly={Boolean(row)}
            />
          </Field>
          <Field label="Peran">
            <select name="role" defaultValue={text(row, "role") || "ADMIN"}>
              {["OWNER", "ADMIN", "VIEWER"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <label className="check-field">
            <input
              name="aktif"
              type="checkbox"
              defaultChecked={!row || active(row)}
            />
            Akun aktif
          </label>
        </>
      );
    if (modal.kind === "period")
      return (
        <>
          <Field label="Bulan">
            <input name="bulan" type="month" value={reconcileMonth} onChange={e => { setReconcileMonth(e.target.value); setActualBalances({}); }} required />
          </Field>
          <Field label="Tindakan">
            <select name="tindakan" value={periodAction} onChange={e => setPeriodAction(e.target.value)}>
              <option value="reconcile">Simpan pencocokan saldo</option>
              <option value="close">Tutup periode</option>
              <option value="open">Buka kembali</option>
            </select>
          </Field>
          {periodAction !== "open" && reconcileMonth && (
            <div className="reconciliation-grid full">
              <p>Hitung uang tunai dan cocokkan rekening bank per {dateLabel(endOfMonth(reconcileMonth))}. Isi saldo nyata dari hasil pemeriksaan Anda.</p>
              {finance(data, reconcileMonth + "-01", endOfMonth(reconcileMonth)).accounts.filter(a => a.available).map(a => {
                const id = text(a, "akun_id"), value = actualBalances[id] ?? "";
                const difference = value === "" ? null : Number(value) - a.balance!;
                return <div className="reconciliation-account" key={id}>
                  <div><strong>{text(a, "nama_akun")}</strong><small>Saldo tercatat {money(a.balance!)}</small></div>
                  <Field label={`Saldo nyata ${text(a, "nama_akun")}`}>
                    <input type="number" step="1" min="-1000000000000" max="1000000000000" required value={value} onChange={e => setActualBalances(v => ({ ...v, [id]: e.target.value }))} />
                  </Field>
                  <span className={difference === 0 ? "balance-matched" : "balance-difference"}>{difference === null ? "Belum diperiksa" : difference === 0 ? "Saldo cocok" : `Selisih ${money(difference)}`}</span>
                </div>;
              })}
              <small>Selisih dapat disimpan untuk ditelusuri. Penutupan bulan memerlukan seluruh saldo cocok; pencocokan tidak membuat transaksi penyesuaian otomatis.</small>
            </div>
          )}
          <p className="form-hint full">
            Periode tertutup:{" "}
            {JSON.parse(setting(data, "closed_periods", "[]")).join(", ") ||
              "Belum ada"}
            . Bandingkan saldo kas dan bank dengan saldo nyata sebelum menutup
            bulan.
          </p>
          <Field label="Catatan rekonsiliasi / alasan" full>
            <textarea name="alasan" maxLength={500} required />
          </Field>
          <label className="check-field full">
            <input type="checkbox" required />
            Saya sudah memeriksa saldo dan dampak tindakan ini.
          </label>
        </>
      );
    return null;
  }
  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const p: Record<string, unknown> = Object.fromEntries(form);
    let action = "";
    if (modal.id) p.id = modal.id;
    if (["student", "master", "user"].includes(modal.kind))
      p.aktif = form.has("aktif");
    if (modal.kind === "student") action = "student.save";
    if (modal.kind === "enrollment") action = "enrollment.save";
    if (modal.kind === "invoice") {
      action = "invoice.create";
      const e = data.Pendaftaran.find((e) => e.pendaftaran_id === enrollmentId);
      p.periode_layanan = e?.skema_biaya === "BULANAN" ? p.periode_layanan : "";
      p.jadwal = Array.from({ length: stageCount }, (_, i) => ({
        date: String(form.get("jadwal_date_" + i)),
        amount: Number(form.get("jadwal_amount_" + i)),
      }));
    }
    if (modal.kind === "monthly") {
      action = "invoice.monthly";
      p.pendaftaran_ids = form.getAll("pendaftaran_ids");
    }
    if (modal.kind === "entry") {
      action =
        entryKind === "PEMBAYARAN_SISWA"
          ? "payment.create"
          : entryKind === "TRANSFER"
            ? "transfer.create"
            : "transaction.create";
      p.jenis = entryKind;
    }
    if (modal.kind === "master") {
      action = "master.save";
      p.table = modal.table;
    }
    if (modal.kind === "user") action = "user.save";
    if (modal.kind === "reverse") {
      action = "transaction.reverse";
      p.transaksi_id = modal.id;
    }
    if (modal.kind === "refund" || modal.kind === "adjust") {
      action = modal.kind === "refund" ? "invoice.refund" : "invoice.adjust";
      p.tagihan_id = modal.id;
      p.batalkan = form.has("batalkan");
    }
    if (modal.kind === "adjust-reverse") {
      action = "invoice.adjust.reverse";
      p.penyesuaian_id = modal.id;
    }
    if (modal.kind === "period") {
      action = `period.${periodAction}`;
      p.saldo_nyata = Object.entries(actualBalances).map(([akun_id, nominal]) => ({ akun_id, nominal }));
    }
    if (action) await execute(action, p);
  }
  function specialModal() {
    if (!modal) return null;
    if (modal.kind === "adjust-history")
      return (
        <div className="result-list">
          {data.Penyesuaian_Tagihan.filter(
            (a) => a.tagihan_id === modal.id,
          ).map((a) => (
            <div className="master-row" key={text(a, "penyesuaian_id")}>
              <div>
                <strong>
                  {text(a, "jenis")} · {money(num(a, "nominal"))}
                </strong>
                <small>
                  {dateLabel(text(a, "tanggal_efektif"))} · {text(a, "alasan")}
                </small>
              </div>
              {a.jenis !== "PEMBALIK" &&
                !data.Penyesuaian_Tagihan.some(
                  (r) =>
                    r.jenis === "PEMBALIK" &&
                    r.penyesuaian_rujukan_id === a.penyesuaian_id,
                ) && (
                  <button
                    className="text-btn"
                    onClick={() =>
                      open({
                        kind: "adjust-reverse",
                        id: text(a, "penyesuaian_id"),
                      })
                    }
                  >
                    Buat pembalik
                  </button>
                )}
            </div>
          ))}
          {!data.Penyesuaian_Tagihan.some((a) => a.tagihan_id === modal.id) && (
            <p className="muted small">
              Belum ada penyesuaian untuk tagihan ini.
            </p>
          )}
        </div>
      );
    if (modal.kind === "login")
      return (
        <>
          <p className="dialog-note">
            Data nyata menggunakan spreadsheet usaha dan hanya bisa dibuka oleh
            akun Google yang diizinkan.
          </p>
          <div className="login-owner">
            <Icon name="shield" />
            <strong>{cap?.ownerEmail || "gardaabdinegara@gmail.com"}</strong>
            <small>OWNER awal</small>
          </div>
          {cap?.oauth ? (
            <a className="btn primary login-button" href="/api/auth/start">
              Masuk dengan Google
              <Icon name="arrow" />
            </a>
          ) : (
            <>
              <p className="form-hint">
                Login Google belum dikonfigurasi. Ikuti panduan deployment untuk
                mengisi OAuth client ID, secret, dan domain aplikasi.
              </p>
              <button className="btn" onClick={close}>
                Lanjut mencoba data contoh
              </button>
            </>
          )}
          <p className="muted small" style={{ marginTop: 18 }}>
            Data contoh tetap terpisah dan tidak disalin ke spreadsheet.
          </p>
        </>
      );
    if (modal.kind === "more")
      return (
        <div className="result-list">
          {NAV.filter((n) =>
            ["siswa", "laporan", "pengaturan"].includes(n[0]),
          ).map((n) => (
            <button className="result-btn" key={n[0]} onClick={() => go(n[0])}>
              <Icon name={n[1]} />
              {n[2]}
            </button>
          ))}
          <button
            className="result-btn"
            onClick={() => {
              close();
              mode === "demo" ? void loadReal() : useDemo();
            }}
          >
            <Icon name="shield" />
            {mode === "demo" ? "Gunakan data nyata" : "Gunakan data contoh"}
          </button>
        </div>
      );
    if (modal.kind === "notifications")
      return (
        <div className="result-list">
          <button className="result-btn" onClick={() => go("tagihan")}>
            <Icon name="clock" />
            <span>
              Tunggakan jatuh tempo
              <small>
                {money(f.overdue)} dari total sisa {money(f.outstanding)}
              </small>
            </span>
          </button>
          <button className="result-btn" onClick={() => go("laporan")}>
            <Icon name="chart" />
            <span>
              Periksa laporan periode
              <small>
                Saldo kas & bank{" "}
                {f.balance === null ? "belum tersedia" : money(f.balance)}
              </small>
            </span>
          </button>
        </div>
      );
    if (modal.kind === "reset")
      return (
        <>
          <p className="dialog-note">
            Mengembalikan ruang kerja contoh ke data awal. Spreadsheet nyata
            tetap tidak berubah.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              setData(demoState());
              setModal(null);
              toast("Data contoh dipulihkan.");
            }}
          >
            Pulihkan data contoh
          </button>
        </>
      );
    if (modal.kind === "receipt") {
      const tx = data.Transaksi.find((t) => t.transaksi_id === modal.id) || {};
      const invoice =
        data.Tagihan.find((i) => i.tagihan_id === tx.tagihan_id) || {};
      return (
        <div className="receipt-paper">
          <Brand />
          <h2>
            Kuitansi pembayaran{mode === "demo" && <small> · CONTOH</small>}
          </h2>
          {[
            ["Nomor", text(tx, "transaksi_id")],
            ["Siswa", txName(tx)],
            ["Tagihan", text(invoice, "nomor_tagihan")],
            ["Tanggal", dateLabel(text(tx, "tanggal_transaksi"))],
            ["Diterima", money(num(tx, "nominal"))],
            ["Metode", text(tx, "metode_pembayaran") || "Tunai / transfer"],
          ].map(([k, v]) => (
            <div className="report-line" key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
          <button
            className="btn primary"
            onClick={() => {
              document.body.dataset.print = "receipt";
              window.print();
              delete document.body.dataset.print;
            }}
          >
            <Icon name="print" />
            Cetak kuitansi
          </button>
        </div>
      );
    }
    return undefined;
  }
  const modalTitles: Record<string, string> = {
    login: "Gunakan data nyata",
    more: "Menu lainnya",
    notifications: "Pemberitahuan",
    reset: "Pulihkan data contoh",
    receipt: "Kuitansi",
    student: "Data siswa",
    enrollment: "Pendaftaran program",
    invoice: "Terbitkan tagihan",
    monthly: "Tagihan bulanan",
    entry: "Catat transaksi",
    master: "Pengaturan master",
    user: "Akses pengguna",
    reverse: "Koreksi transaksi",
    refund: "Refund siswa",
    adjust: "Penyesuaian tagihan",
    "adjust-history": "Riwayat penyesuaian",
    "adjust-reverse": "Pembetulan penyesuaian",
    period: "Pencocokan saldo & tutup bulan",
  };
  const viewRenderers = {
    dashboard: Dashboard,
    transaksi: Transactions,
    siswa: Students,
    tagihan: Invoices,
    laporan: Reports,
    pengaturan: Settings,
  };
  const viewContent = { [view]: viewRenderers[view]() };
  const titles: Record<View, [string, string]> = {
    dashboard: [
      "Ringkasan keuangan.",
      "Pantau kas dan pembayaran siswa dalam satu ruang kerja.",
    ],
    transaksi: [
      "Transaksi.",
      "Penerimaan, pengeluaran, dan perpindahan dana usaha.",
    ],
    siswa: [
      "Daftar siswa.",
      "Pendaftaran program dan kebutuhan pembayaran.",
    ],
    tagihan: [
      "Tagihan siswa.",
      "Paket, iuran bulanan, dan jadwal cicilan siswa.",
    ],
    laporan: [
      "Laporan keuangan.",
      "Buku kas, hasil usaha, dan posisi keuangan dalam satu tempat.",
    ],
    pengaturan: [
      "Pengaturan.",
      "Identitas, master data, pengguna, dan jejak perubahan.",
    ],
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Lewati ke konten
      </a>
      <div className="shell terrace-shell">
        <aside className="sidebar">
          <Brand />
          <div className="workspace-label">
            <Icon name="wallet" />
            <span>
              Keuangan GAN<small>Satu pusat latihan</small>
            </span>
            <Icon name="chevron" />
          </div>
          <div className="nav-label">Ruang kerja</div>
          <nav className="nav-list" aria-label="Navigasi utama">
            {NAV.map(navButton)}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <Icon name="shield" />
              <strong>Fokus mendampingi siswa.</strong>Catatan usaha tersusun
              dalam satu tempat.
            </div>
            <div className="sidebar-user">
              <span className="avatar">
                {actor.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{actor.name}</strong>
                <small>
                  {actor.role === "OWNER" ? "Pemilik usaha" : actor.role}
                </small>
              </span>
              <i className="status-dot" />
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="appbar">
            <div className="appbar-left">
              <div className="mobile-brand">
                <Brand />
              </div>
              <div className="header-context">
                <small>GARDA ABDI NEGARA</small>
                <strong>Keuangan & pembayaran</strong>
              </div>
            </div>
            <nav className="terrace-nav" aria-label="Navigasi utama Terrace">{NAV.map(navButton)}</nav>
            <div className="appbar-actions">
              <button type="button" className="appearance-toggle" data-appearance-toggle>
                <svg className="icon when-light" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z" /></svg>
                <svg className="icon when-dark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
                <span className="when-light mode-label">Mode gelap</span><span className="when-dark mode-label">Mode terang</span>
              </button>
              <button
                className="icon-btn"
                aria-label="Pemberitahuan"
                onClick={() => open({ kind: "notifications" })}
              >
                <Icon name="bell" />
                {f.overdue > 0 && <span className="notification-dot" />}
              </button>
              <span className="avatar header-avatar">
                {actor.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            </div>
          </header>
          <main className="main" id="main">
            <div className={`source-banner ${mode}`}>
              <span>
                <i />
                {mode === "demo" ? "DATA CONTOH" : "DATA NYATA"}
                <small>
                  {mode === "demo"
                    ? "Bebas mencoba. Spreadsheet tetap terpisah."
                    : `Google Sheets · ${actor.role}`}
                </small>
              </span>
              <div className="mode-switch" aria-label="Sumber data">
                <button className={mode === "demo" ? "active" : ""} aria-pressed={mode === "demo"} onClick={useDemo} disabled={busy}>Data contoh</button>
                <button className={mode === "real" ? "active" : ""} aria-pressed={mode === "real"} onClick={() => void loadReal()} disabled={busy}>Data nyata</button>
              </div>
              {mode === "demo" ? (
                <button onClick={() => void loadReal()} disabled={busy}>
                  Gunakan data nyata
                  <Icon name="arrow" />
                </button>
              ) : (
                <button
                  onClick={() =>
                    void refreshReal().catch((e) => setError(e.message))
                  }
                  disabled={busy}
                >
                  <Icon name="refresh" />
                  Perbarui
                </button>
              )}
            </div>
            {error && !modal && (
              <div className="error-banner" role="alert">
                <Icon name="info" />
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label="Tutup pesan">
                  <Icon name="x" />
                </button>
              </div>
            )}
            {pending && mode === "real" && (
              <div className="subtle-banner pending-banner">
                <Icon name="clock" />
                <span>
                  Hasil operasi sedang diverifikasi. Penulisan ditahan sampai
                  hasilnya jelas.
                </span>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void checkPending()}
                >
                  Periksa status
                </button>
                {retryable && <button className="btn primary" disabled={busy} onClick={() => void retryPending()}>Kirim ulang permintaan yang sama</button>}
              </div>
            )}
            <header className="page-heading">
              <div>
                <div className="eyebrow">
                  KEUANGAN / {NAV.find((n) => n[0] === view)?.[2]}
                </div>
                <h1>{titles[view][0]}</h1>
                <p>{titles[view][1]}</p>
              </div>
              <div className="heading-tools">
                <label className="period-control">
                  <Icon name="calendar" />
                  <span className="sr-only">Periode laporan</span>
                  <span className="period-name">
                    {new Intl.DateTimeFormat("id-ID", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(from))}
                  </span>
                  <input
                    aria-label="Periode laporan"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) {
                        setMonth(e.target.value);
                        setAsOf(endOfMonth(e.target.value));
                      }
                    }}
                  />
                </label>
                <button
                  className="btn primary"
                  disabled={!canWrite || busy}
                  onClick={() => open({ kind: "entry" })}
                >
                  <Icon name="plus" />
                  Catat transaksi
                </button>
              </div>
            </header>
            {mode === "real" && initialized && !schemaReady && <div className="pending-banner no-report-print"><p>Struktur laporan perlu diperbarui ke versi 2. Data lama tetap dapat dibaca. Pemilik dapat mengunduh cadangan lalu memperbarui struktur untuk mengaktifkan pencatatan.</p>{owner && <button className="btn" disabled={busy || !cap?.writeEnabled || !cap?.coordinator} onClick={() => void migrateSheets()}>Cadangkan & perbarui struktur</button>}</div>}
            {mode === "real" && !initialized ? (
              <Empty title="Spreadsheet siap disiapkan">
                Siapkan tabel keuangan, akun bersaldo nol, dan akses pemilik.
                Data contoh tidak akan diimpor.
                <div style={{ marginTop: 20 }}>
                  <button
                    className="btn primary"
                    disabled={
                      !owner || !cap?.writeEnabled || !cap?.coordinator || busy
                    }
                    onClick={() => void migrateSheets()}
                  >
                    Siapkan spreadsheet
                  </button>
                  {(!cap?.writeEnabled || !cap?.coordinator) && (
                    <p className="form-hint">
                      Aktifkan konfigurasi penulisan mengikuti panduan
                      deployment terlebih dahulu.
                    </p>
                  )}
                </div>
              </Empty>
            ) : (
              viewContent[view]
            )}
            <footer className="app-footer">
              <span className="preview-label">
                <i className="status-dot" />
                {mode === "demo"
                  ? "Data simulasi · tersimpan di browser ini"
                  : dataAsOf
                    ? `Diperbarui ${new Date(dataAsOf).toLocaleTimeString("id-ID", { timeZone: setting(data, "timezone", "Asia/Jakarta") })}`
                    : "Google Sheets"}
              </span>
              <span>{businessName} · Terrace</span>
              {mode === "real" && (
                <button
                  className="text-btn"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    sessionStorage.removeItem(PENDING_COMMAND_KEY);
                    useDemo();
                    toast("Anda sudah keluar dari data nyata.");
                  }}
                >
                  Keluar
                </button>
              )}
            </footer>
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Navigasi ponsel">
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => go("dashboard")}
          >
            <Icon name="grid" />
            Beranda
          </button>
          <button
            className={view === "transaksi" ? "active" : ""}
            onClick={() => go("transaksi")}
          >
            <Icon name="arrows" />
            Transaksi
          </button>
          <button
            className="add-nav"
            disabled={!canWrite || busy}
            onClick={() => open({ kind: "entry" })}
            aria-label="Catat transaksi"
          >
            <Icon name="plus" />
            Catat
          </button>
          <button
            className={view === "tagihan" ? "active" : ""}
            onClick={() => go("tagihan")}
          >
            <Icon name="receipt" />
            Tagihan
          </button>
          <button
            className={
              ["siswa", "laporan", "pengaturan"].includes(view) ? "active" : ""
            }
            onClick={() => open({ kind: "more" })}
          >
            <Icon name="dots" />
            Lainnya
          </button>
        </nav>
      </div>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">
              {mode === "demo" ? "RUANG KERJA CONTOH" : "DATA NYATA"}
            </span>
            <h2 id="dialog-title">{modalTitles[modal?.kind || ""]}</h2>
          </div>
          <button
            className="icon-btn"
            onClick={close}
            disabled={busy}
            aria-label="Tutup dialog"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-content">
          {specialModal() ?? (
            <form
              onSubmit={(e) => void submitModal(e)}
              key={`${modal?.kind}:${modal?.id || ""}`}
            >
              <p className="dialog-note">
                {mode === "demo"
                  ? "Perubahan hanya memengaruhi data contoh di browser ini."
                  : "Perubahan disimpan ke spreadsheet nyata setelah tombol simpan ditekan."}
              </p>
              <div className="form-grid">{modalFields()}</div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={close}
                  disabled={busy}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={
                    busy ||
                    !canWrite ||
                    (modal?.kind === "monthly" && monthlyIds.length === 0)
                  }
                >
                  {busy
                    ? "Menyimpan..."
                    : mode === "demo"
                      ? "Simpan contoh"
                      : "Simpan data nyata"}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
      <div
        id="toast"
        role="status"
        aria-live="polite"
        className={message ? "visible" : ""}
      >
        {message}
      </div>
    </>
  );
}
