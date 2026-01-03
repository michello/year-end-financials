import React, { useMemo, useState } from "react";
import Papa from "papaparse";

/**
 * Output columns:
 * Source, Purchase Date, Item, Amount, Category, Spender
 */

// 🌸💜 Lilac theme
const THEME = {
  bg: "#faf7fc",
  card: "#ffffff",
  border: "#e6dff0",
  primary: "#b48bd6",
  primaryDark: "#9c6cc7",
  accent: "#f2e9fb",
  text: "#2f2a36",
  muted: "#6f6780",
  success: "#6bbf8e",
  dangerBg: "#fff5f7",
  dangerBorder: "#f3c2d3",
};

const SUBSCRIPTION_NAMES = new Set([
  "GOOGLE ONE",
  "PLANET FITNESS",
  "CHATGPT",
  "FACTOR",
  "FACTOR75",
  "CYCLEBAR",
  "HYPERBEAM_WP_BASE",
  "CRUNCHYROLL",
  "NETFLIX  INC.",
  "NETFLIX.COM",
  "HELLOINTERVIEW",
  "CARDPOINTERS.COM",
]);

const BILLS = new Set(["TMOBILE*AUTO PAY"]);

const SPREADSHEET_CATEGORIES = [
  "Bills",
  "Subscriptions",
  "Entertainment",
  "Food & Drink",
  "Groceries",
  "Health & Wellbeing",
  "Shopping",
  "Transport",
  "Travel",
  "Investments",
  "Other",
];

const SPREADSHEET_CATEGORY_SET = new Set(SPREADSHEET_CATEGORIES);

const DEFAULT_SPENDER = "MICHELLE LAM";

const CardType = {
  AMEX: "AMEX",
  CAPITAL_ONE: "CAPITAL_ONE",
  CHASE: "CHASE",
  CHASE_BUSINESS: "CHASE_BUSINESS",
  DISCOVER: "DISCOVER",
  OLD_NAVY: "OLD_NAVY",
  VENMO: "VENMO",
  FIDELITY: "FIDELITY",
};

const CARD_TO_HEADER_INDEX = {
  [CardType.AMEX]: {
    raw_date_index: 0,
    raw_category_index: 12,
    raw_item_index: 1,
    raw_amount_index: 4,
    spender_index: 2,
  },
  [CardType.CAPITAL_ONE]: {
    raw_date_index: 0,
    raw_category_index: 4,
    raw_item_index: 3,
    raw_amount_index: 5,
    spender_index: null,
  },
  [CardType.CHASE]: {
    raw_date_index: 0,
    raw_category_index: 3,
    raw_item_index: 2,
    raw_amount_index: 5,
    spender_index: null,
  },
  [CardType.CHASE_BUSINESS]: {
    raw_date_index: 1,
    raw_category_index: 5,
    raw_item_index: 3,
    raw_amount_index: 6,
    spender_index: null,
  },
  [CardType.DISCOVER]: {
    raw_date_index: 0,
    raw_category_index: 4,
    raw_item_index: 2,
    raw_amount_index: 3,
    spender_index: null,
  },
  [CardType.OLD_NAVY]: {
    raw_date_index: 0,
    raw_category_index: null,
    raw_item_index: 1,
    raw_amount_index: 3,
    spender_index: null,
  },
};

// Auto-detect based on filename; user can override in UI.
const FILENAME_HINTS = [
  { contains: "amex-gold", source: "Amex - Gold", cardType: CardType.AMEX },
  { contains: "amex-blue-cash", source: "Amex - Blue Cash", cardType: CardType.AMEX },
  { contains: "capital1-quicksilver", source: "Capital One - Quick Silver", cardType: CardType.CAPITAL_ONE },
  { contains: "capital1-venture", source: "Capital One - Venture Rewards", cardType: CardType.CAPITAL_ONE },
  { contains: "chase-freedom-flex", source: "Chase - Freedom Flex", cardType: CardType.CHASE },
  { contains: "chase-ink-preferred", source: "Chase - Ink Preferred", cardType: CardType.CHASE_BUSINESS },
  { contains: "chase-sapphire-preferred", source: "Chase - Sapphire Preferred", cardType: CardType.CHASE },
  { contains: "discover", source: "Discover", cardType: CardType.DISCOVER },
  { contains: "old-navy", source: "Old Navy", cardType: CardType.OLD_NAVY },
  { contains: "venmo", source: "Venmo", cardType: CardType.VENMO },
  { contains: "fidelity", source: "Fidelity", cardType: CardType.FIDELITY },
];

function inferMetaFromFilename(filename) {
  const lower = (filename || "").toLowerCase();
  for (const hint of FILENAME_HINTS) {
    if (lower.includes(hint.contains)) return { source: hint.source, cardType: hint.cardType };
  }
  return { source: filename || "", cardType: CardType.CHASE };
}

function isPayment(raw_item, raw_category) {
  const item = raw_item ?? "";
  const cat = raw_category ?? "";
  return (
    item.includes("Payment") ||
    item.includes("ONLINE PAYMENT") ||
    item.includes("ONLINE PYMT") ||
    cat.includes("PAYMENT") ||
    cat.includes("Payment")
  );
}

// Mimic python: raw_category.lower().capitalize()
function pyLowerCap(s) {
  const lower = (s ?? "").toLowerCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

function processCategory(raw_item, raw_category) {
  const rawItem = raw_item ?? "";
  const rawCat = raw_category ?? "";

  if (SUBSCRIPTION_NAMES.has(rawItem)) return "Subscriptions";
  if (rawItem.includes("MTA")) return "Transport";
  if (rawItem.includes("LYFT")) return "Transport";
  if (rawItem.includes("OMNY")) return "Transport";

  if (BILLS.has(rawItem)) return "Bills";

  const lower_case = pyLowerCap(rawCat);

  if (lower_case === "Business services-professional services") return "Travel";
  if (lower_case.includes("Transportation")) return "Transport";
  if (lower_case.includes("Travel")) return "Travel";
  if (lower_case.includes("Lodging")) return "Travel";
  if (lower_case.includes("Entertainment")) return "Entertainment";
  if (lower_case.includes("pharmacies") || lower_case.includes("Health care")) return "Health & Wellbeing";
  if (lower_case.includes("groceries")) return "Groceries";
  if (lower_case.includes("wholesale stores")) return "Groceries";
  if (lower_case.includes("Restaurant")) return "Food & Drink";
  if (lower_case.includes("Dining")) return "Food & Drink";
  if (lower_case.includes("Merchandise")) return "Shopping";
  if (lower_case.includes("Redeem cash back at amazon.com credit")) return "Shopping";
  if (lower_case.includes("Bill")) return "Bills";
  if (lower_case.includes("Amtrak")) return "Travel";

  return SPREADSHEET_CATEGORY_SET.has(rawCat) ? rawCat : "Other";
}

function parseNumber(raw_amount) {
  let s = String(raw_amount ?? "").trim();
  if (!s) return null;

  // Handle parentheses negative: ($20.00)
  let parenNeg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    parenNeg = true;
    s = s.slice(1, -1).trim();
  }

  // Remove quotes, currency, commas
  s = s.replace(/["']/g, "").replace(/[$,]/g, "").trim();

  // Handle "+ 89.00" / "- 20.00"
  const m = s.match(/^([+-])\s*(\d+(\.\d+)?|\.\d+)$/);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const n = Number.parseFloat(m[2]);
    if (Number.isNaN(n)) return null;
    const val = sign * n;
    return parenNeg ? -Math.abs(val) : val;
  }

  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return null;
  return parenNeg ? -Math.abs(n) : n;
}

function processRawAmount(raw_amount) {
  const n = parseNumber(raw_amount);
  return n == null ? null : -n;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) reject(results.errors);
        else resolve(results.data);
      },
      error: (err) => reject(err),
    });
  });
}

/** ------------------------
 * Date normalization: MM/DD/YYYY
 * ------------------------*/
function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtMMDDYYYY(d) {
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function parseUSDateTime(s) {
  // Handles:
  // - "MM/DD/YYYY"
  // - "MM/DD/YYYY HH:MM"
  // - "MM/DD/YYYY HH:MM AM"
  // - "MM/DD/YYYY HH:MM:SS"
  // - "MM/DD/YYYY HH:MM:SS AM"
  const str = String(s ?? "").trim();
  if (!str) return null;

  const m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/
  );
  if (!m) return null;

  let mm = Number(m[1]);
  let dd = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;

  let hh = m[4] != null ? Number(m[4]) : 0;
  const min = m[5] != null ? Number(m[5]) : 0;
  const sec = m[6] != null ? Number(m[6]) : 0;
  const ampm = m[7] ? String(m[7]).toLowerCase() : null;

  if (ampm === "pm" && hh < 12) hh += 12;
  if (ampm === "am" && hh === 12) hh = 0;

  const d = new Date(yyyy, mm - 1, dd, hh, min, sec);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizePurchaseDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // Prefer explicit US-date parse (works for Venmo "Datetime" too)
  const us = parseUSDateTime(s);
  if (us) return fmtMMDDYYYY(us);

  // Fall back to Date.parse for ISO-ish formats
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return fmtMMDDYYYY(new Date(t));

  // If unknown, keep original
  return s;
}

/** ------------------------
 * Header-based helpers (Venmo/Fidelity)
 * ------------------------*/
function normalizeHeaderKey(s) {
  return String(s ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCell(v) {
  return String(v ?? "").replace(/\uFEFF/g, "").trim();
}

function headerIndexMap(headerRow) {
  const map = new Map();
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeHeaderKey(headerRow[i]);
    if (key) map.set(key, i);
  }
  return map;
}

function getByHeaderIdx(row, map, headerName) {
  const idx = map.get(normalizeHeaderKey(headerName));
  return idx == null ? "" : normalizeCell(row[idx]);
}

/** ------------------------
 * Venmo helpers
 * ------------------------*/
function findVenmoHeaderRowIndex(data) {
  const need = ["datetime", "amount (total)", "status", "type", "note"];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const keys = new Set(row.map(normalizeHeaderKey).filter(Boolean));
    let ok = true;
    for (const k of need) {
      if (!keys.has(k)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function applyVenmoSign(absAmount, type, venmoSign) {
  const t = String(type ?? "").trim().toLowerCase();
  const a = Math.abs(absAmount);

  // Default convention: Payment positive, Charge negative
  if (t === "payment") return venmoSign.negatePayments ? -a : a;
  if (t === "charge") return venmoSign.negateCharges ? -a : a;

  return absAmount;
}

/** ------------------------
 * ✨ Styles (lilac + emojis) ✨
 * ------------------------*/
const styles = {
  page: {
    padding: 24,
    maxWidth: 1200,
    margin: "0 auto",
    background: THEME.bg,
    minHeight: "100vh",
    fontFamily: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    color: THEME.text,
  },
  header: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  title: { margin: 0, fontSize: 28, letterSpacing: "-0.02em" },
  subtitle: { margin: 0, color: THEME.muted, lineHeight: 1.45 },
  card: {
    background: THEME.card,
    border: `1px solid ${THEME.border}`,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    boxShadow: "0 8px 24px rgba(180,139,214,0.08)",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${THEME.border}`,
    background: THEME.accent,
    color: THEME.muted,
    fontSize: 12,
    fontWeight: 700,
  },
  row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  label: { display: "block", fontWeight: 800, marginBottom: 6 },
  input: {
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${THEME.border}`,
    background: "#fff",
    width: "100%",
    maxWidth: 420,
    outline: "none",
  },
  select: {
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${THEME.border}`,
    background: "#fff",
    outline: "none",
  },
  button: (variant = "primary") => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: variant === "ghost" ? `1px solid ${THEME.border}` : "none",
    background: variant === "ghost" ? "#fff" : THEME.primary,
    color: variant === "ghost" ? THEME.text : "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: variant === "ghost" ? "none" : "0 6px 18px rgba(180,139,214,0.30)",
  }),
  tableWrap: {
    overflowX: "auto",
    border: `1px solid ${THEME.border}`,
    borderRadius: 16,
    marginTop: 10,
  },
  smallMuted: { color: THEME.muted, marginTop: 8, lineHeight: 1.4 },
  errorBox: {
    marginTop: 16,
    padding: 14,
    border: `1px solid ${THEME.dangerBorder}`,
    background: THEME.dangerBg,
    borderRadius: 16,
  },
};

// ✅ Sortable table helpers
const SORTABLE_COLUMNS = [
  { key: "source", label: "Source" },
  { key: "date", label: "Purchase Date" },
  { key: "item", label: "Item" },
  { key: "amount", label: "Amount" },
  { key: "category", label: "Category" },
  { key: "spender", label: "Spender" },
];

function parseDateForSort(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // Use our normalized parser first
  const d = parseUSDateTime(s);
  if (d) return d.getTime();

  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function compareValues(a, b, direction, key) {
  const dir = direction === "desc" ? -1 : 1;

  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (key === "date") {
    const ta = parseDateForSort(a);
    const tb = parseDateForSort(b);
    if (ta != null && tb != null) return ta < tb ? -1 * dir : ta > tb ? 1 * dir : 0;
  }

  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 * dir : a > b ? 1 * dir : 0;
  }

  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return sa < sb ? -1 * dir : sa > sb ? 1 * dir : 0;
}

function sortIndicator(active, direction) {
  if (!active) return "↕️";
  return direction === "asc" ? "🔼" : "🔽";
}

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  fontWeight: 900,
  whiteSpace: "nowrap",
  color: THEME.muted,
  background: THEME.accent,
};

const td = {
  padding: "12px 10px",
  borderBottom: `1px solid ${THEME.border}`,
  verticalAlign: "top",
  whiteSpace: "nowrap",
  color: THEME.text,
};

export default function CardSpendingCompiler() {
  const [filesMeta, setFilesMeta] = useState([]); // [{id, file, source, cardType, venmoSign?}]
  const [compiled, setCompiled] = useState([]); // [{id, source, date, item, amount, category, spender}]
  const [errors, setErrors] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const [spenderName, setSpenderName] = useState(DEFAULT_SPENDER);

  // Pagination state
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Sorting state
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc"); // newest first

  function toggleSort(nextKey) {
    setPage(1);
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(nextKey === "amount" ? "desc" : "asc");
    }
  }

  function makeFileId(file) {
    return `${file.name}__${file.size}__${file.lastModified}`;
  }

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    setFilesMeta((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const next = [...prev];

      for (const file of picked) {
        const id = makeFileId(file);
        if (existingIds.has(id)) continue;

        const inferred = inferMetaFromFilename(file.name);
        next.push({
          id,
          file,
          source: inferred.source || file.name,
          cardType: inferred.cardType,
          venmoSign:
            inferred.cardType === CardType.VENMO
              ? { negatePayments: false, negateCharges: true }
              : undefined,
        });
        existingIds.add(id);
      }
      return next;
    });

    e.target.value = "";
  }

  function updateMeta(id, patch) {
    setFilesMeta((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function removeFile(id) {
    setFilesMeta((prev) => prev.filter((m) => m.id !== id));
  }

  function clearAllFiles() {
    setFilesMeta([]);
    setCompiled([]);
    setErrors([]);
    setPage(1);
  }

  const compiledWithHeader = useMemo(() => {
    const header = ["Source", "Purchase Date", "Item", "Amount", "Category", "Spender"];
    const rows = compiled.map((r) => [r.source, r.date, r.item, r.amount, r.category, r.spender]);
    return [header, ...rows];
  }, [compiled]);

  // Sort BEFORE paginate
  const sortedCompiled = useMemo(() => {
    if (!compiled.length) return [];
    const copy = [...compiled];
    copy.sort((x, y) => compareValues(x[sortKey], y[sortKey], sortDir, sortKey));
    return copy;
  }, [compiled, sortKey, sortDir]);

  const totalRows = sortedCompiled.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedCompiled.slice(start, end);
  }, [sortedCompiled, currentPage, pageSize]);

  function setCategory(txnId, nextCategory) {
    setCompiled((prev) => prev.map((t) => (t.id === txnId ? { ...t, category: nextCategory } : t)));
  }

  async function run() {
    setIsRunning(true);
    setErrors([]);
    setCompiled([]);
    setPage(1);

    try {
      const out = [];
      let rowCounter = 0;

      for (const meta of filesMeta) {
        const { file, source, cardType } = meta;

        // ---- VENMO ----
        if (cardType === CardType.VENMO) {
          const data = await parseCsvFile(file);
          if (!Array.isArray(data) || data.length === 0) continue;

          const headerRowIdx = findVenmoHeaderRowIndex(data);
          if (headerRowIdx < 0) throw new Error(`Venmo header row not found in file: ${file.name}`);

          const headerRow = data[headerRowIdx];
          const map = headerIndexMap(headerRow);

          const venmoSign = meta.venmoSign ?? { negatePayments: false, negateCharges: true };

          for (let i = headerRowIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row.length) continue;

            const status = normalizeCell(getByHeaderIdx(row, map, "Status")).toLowerCase();
            if (!status.startsWith("complete")) continue;

            const dtRaw = getByHeaderIdx(row, map, "Datetime");
            const dt = normalizePurchaseDate(dtRaw);

            const note = getByHeaderIdx(row, map, "Note");
            const type = getByHeaderIdx(row, map, "Type");
            const amtRaw = getByHeaderIdx(row, map, "Amount (total)");

            const parsed = parseNumber(amtRaw);
            if (parsed == null) continue;

            const baseAmount = Math.abs(parsed);
            const amount = applyVenmoSign(baseAmount, type, venmoSign);

            out.push({
              id: `${source || "Venmo"}__${file.name}__${rowCounter++}`,
              source: source || "Venmo",
              date: dt,
              item: note || "(Venmo)",
              amount,
              category: "Other",
              spender: spenderName,
            });
          }
          continue;
        }

        // ---- FIDELITY ----
        if (cardType === CardType.FIDELITY) {
          const data = await parseCsvFile(file);
          if (!Array.isArray(data) || data.length === 0) continue;

          const headerRow = data[0];
          const map = headerIndexMap(headerRow);

          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row.length) continue;

            const type = getByHeaderIdx(row, map, "Type");
            const action = getByHeaderIdx(row, map, "Action");

            const isContribution =
              normalizeHeaderKey(type) === "contributions" || normalizeHeaderKey(action).includes("contribution");

            if (!isContribution) continue;

            const runDateRaw = getByHeaderIdx(row, map, "Run Date");
            const settlementDateRaw = getByHeaderIdx(row, map, "Settlement Date");
            const date = normalizePurchaseDate(settlementDateRaw || runDateRaw);

            const description = getByHeaderIdx(row, map, "Description");
            const symbol = getByHeaderIdx(row, map, "Symbol");
            const amtRaw = getByHeaderIdx(row, map, "Amount ($)");

            const amtParsed = parseNumber(amtRaw);
            if (amtParsed == null) continue;

            out.push({
              id: `Fidelity__${file.name}__${rowCounter++}`,
              source: "Fidelity",
              date,
              item: description || symbol || "(Fidelity Contribution)",
              amount: Math.abs(amtParsed),
              category: "Investments",
              spender: spenderName,
            });
          }
          continue;
        }

        // ---- OTHER CARDS ----
        const header = CARD_TO_HEADER_INDEX[cardType];
        if (!header) throw new Error(`Unknown cardType: ${cardType}`);

        let data = await parseCsvFile(file);
        if (!Array.isArray(data) || data.length === 0) continue;

        data = data.slice(1);

        for (const row of data) {
          const get = (idx) => (idx == null ? "" : (row[idx] ?? ""));

          const raw_date = get(header.raw_date_index);
          const date = normalizePurchaseDate(raw_date);

          const raw_category = get(header.raw_category_index);
          const raw_item = get(header.raw_item_index);

          const spender =
            header.spender_index != null ? (row[header.spender_index] ?? spenderName) : spenderName;

          const raw_amount_cell = get(header.raw_amount_index);

          if (isPayment(raw_item, raw_category)) continue;

          const amount =
            cardType === CardType.CHASE || cardType === CardType.CHASE_BUSINESS || cardType === CardType.OLD_NAVY
              ? processRawAmount(raw_amount_cell)
              : parseNumber(raw_amount_cell);

          if (amount == null) continue;

          const processed_category =
            cardType === CardType.OLD_NAVY ? "Shopping" : processCategory(raw_item, raw_category);

          out.push({
            id: `${source}__${file.name}__${rowCounter++}`,
            source,
            date,
            item: raw_item,
            amount,
            category: processed_category,
            spender,
          });
        }
      }

      setCompiled(out);
    } catch (err) {
      setErrors((prev) => [...prev, typeof err === "string" ? err : JSON.stringify(err, null, 2)]);
    } finally {
      setIsRunning(false);
    }
  }

  function download() {
    const csvText = Papa.unparse(compiledWithHeader, { newline: "\n" });
    downloadTextFile("compiled-card-spending.csv", csvText);
  }

  function prevPage() {
    setPage((p) => Math.max(1, p - 1));
  }

  function nextPage() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>💜 Financial Spending CSV Compiler</h2>
        <p style={styles.subtitle}>🌷 Combine CSVs into one normalized export <a style={styles.subtitle} href="https://docs.google.com/spreadsheets/d/12fIziabNlr78DHNmiQKuXEieBptjaTfjoyrLM1ZUCuk/edit?gid=1528073380#gid=1528073380">you can paste into your tracker.</a>
           For more info on how to use, <a style={styles.subtitle} href="https://github.com/michello/year-end-financials?tab=readme-ov-file#financial-csv-compiler">please check out the readme.</a></p>
      </div>

      {/* Spender input */}
      <div style={styles.card}>
        <label style={styles.label}>🙋‍♀️ Spender name</label>
        <input
          type="text"
          value={spenderName}
          onChange={(e) => setSpenderName(e.target.value)}
          placeholder="Your name"
          style={styles.input}
        />
        <div style={styles.smallMuted}>Used when a CSV doesn’t have a spender column.</div>
      </div>

      {/* Controls */}
      <div style={styles.card}>
        <div style={styles.row}>
          <input type="file" accept=".csv,text/csv" multiple onChange={onPickFiles} />

          <button
            onClick={run}
            disabled={!filesMeta.length || isRunning}
            style={{ ...styles.button("primary"), opacity: !filesMeta.length || isRunning ? 0.6 : 1 }}
          >
            {isRunning ? "🧪 Compiling…" : "✨ Compile"}
          </button>

          <button
            onClick={download}
            disabled={!compiled.length}
            style={{ ...styles.button("primary"), opacity: !compiled.length ? 0.6 : 1 }}
          >
            ⬇️ Download compiled CSV
          </button>

          <button
            onClick={clearAllFiles}
            disabled={!filesMeta.length || isRunning}
            style={{ ...styles.button("ghost"), opacity: !filesMeta.length || isRunning ? 0.6 : 1 }}
          >
            🧹 Clear all
          </button>
        </div>
      </div>

      {/* Files table (edit options) */}
      {filesMeta.length > 0 && (
        <div style={styles.card}>
          <div style={{ ...styles.row, justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>📂 Files ({filesMeta.length})</h3>
            <span style={{ color: THEME.muted, fontWeight: 600 }}>
              Edit source / card type / Venmo sign rules ✨
            </span>
          </div>

          <div style={styles.tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Filename</th>
                  <th style={th}>Source</th>
                  <th style={th}>Card Type</th>
                  <th style={th}>Options</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filesMeta.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>{m.file.name}</td>

                    <td style={td}>
                      <input
                        value={m.source}
                        onChange={(e) => updateMeta(m.id, { source: e.target.value })}
                        style={{ ...styles.input, maxWidth: 320 }}
                      />
                    </td>

                    <td style={td}>
                      <select
                        value={m.cardType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          updateMeta(m.id, {
                            cardType: nextType,
                            venmoSign:
                              nextType === CardType.VENMO
                                ? (m.venmoSign ?? { negatePayments: false, negateCharges: true })
                                : undefined,
                            source: nextType === CardType.FIDELITY ? "Fidelity" : m.source,
                          });
                        }}
                        style={styles.select}
                      >
                        {Object.values(CardType).map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ ...td, whiteSpace: "normal", minWidth: 260 }}>
                      {m.cardType === CardType.VENMO ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={m.venmoSign?.negatePayments ?? false}
                              onChange={(e) =>
                                updateMeta(m.id, {
                                  venmoSign: {
                                    negatePayments: e.target.checked,
                                    negateCharges: m.venmoSign?.negateCharges ?? true,
                                  },
                                })
                              }
                            />
                            Make <b>Payment</b> negative
                          </label>

                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={m.venmoSign?.negateCharges ?? true}
                              onChange={(e) =>
                                updateMeta(m.id, {
                                  venmoSign: {
                                    negatePayments: m.venmoSign?.negatePayments ?? false,
                                    negateCharges: e.target.checked,
                                  },
                                })
                              }
                            />
                            Make <b>Charge</b> negative
                          </label>

                          <div style={{ color: THEME.muted, fontSize: 12 }}>
                            Default: Payment = positive, Charge = negative 💸
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: THEME.muted }}>—</span>
                      )}
                    </td>

                    <td style={td}>
                      <button
                        onClick={() => removeFile(m.id)}
                        disabled={isRunning}
                        style={{ ...styles.button("ghost"), opacity: isRunning ? 0.6 : 1 }}
                      >
                        🗑️ Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={styles.smallMuted}>💡 If auto-detection gets a card wrong, change the Card Type dropdown.</p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div style={styles.errorBox}>
          <h3 style={{ marginTop: 0 }}>⚠️ Errors</h3>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{errors.join("\n\n")}</pre>
        </div>
      )}

      {/* Transactions + pagination + sortable headers */}
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>🧾 Transactions</h3>

        <div style={styles.row}>
          <div style={styles.pill}>📌 Total: {totalRows}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontWeight: 900, color: THEME.muted }}>Rows/page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(next);
                setPage(1);
              }}
              style={styles.select}
              disabled={!sortedCompiled.length}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={prevPage}
            disabled={!sortedCompiled.length || currentPage <= 1}
            style={{ ...styles.button("ghost"), opacity: !sortedCompiled.length || currentPage <= 1 ? 0.5 : 1 }}
          >
            ⬅️ Prev
          </button>

          <div style={styles.pill}>
            📄 Page <b>{currentPage}</b> / {totalPages}
          </div>

          <button
            onClick={nextPage}
            disabled={!sortedCompiled.length || currentPage >= totalPages}
            style={{
              ...styles.button("ghost"),
              opacity: !sortedCompiled.length || currentPage >= totalPages ? 0.5 : 1,
            }}
          >
            Next ➡️
          </button>

          <div style={styles.pill}>
            🔀 Sorting: <b>{SORTABLE_COLUMNS.find((c) => c.key === sortKey)?.label}</b>{" "}
            {sortDir === "asc" ? "🔼" : "🔽"}
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {SORTABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{ ...th, cursor: "pointer", userSelect: "none" }}
                    onClick={() => toggleSort(col.key)}
                    title="Click to sort"
                  >
                    {col.label}{" "}
                    <span style={{ fontSize: 12 }}>{sortIndicator(sortKey === col.key, sortDir)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!sortedCompiled.length ? (
                <tr>
                  <td style={td} colSpan={6}>
                    ✨ No transactions yet. Upload CSVs and click <b>Compile</b> to get started.
                  </td>
                </tr>
              ) : (
                pagedRows.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>{t.source}</td>
                    <td style={td}>{t.date}</td>
                    <td style={{ ...td, whiteSpace: "normal", minWidth: 320 }}>{t.item}</td>
                    <td style={td}>
                      {t.amount < 0 ? "💸 " : "💰 "}
                      {t.amount}
                    </td>
                    <td style={td}>
                      <select
                        value={SPREADSHEET_CATEGORY_SET.has(t.category) ? t.category : "Other"}
                        onChange={(e) => setCategory(t.id, e.target.value)}
                        style={{ ...styles.select, width: "100%" }}
                      >
                        {SPREADSHEET_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>{t.spender}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p style={styles.smallMuted}>💡 Tip: Click any column header to sort (click again to flip direction).</p>
      </div>
    </div>
  );
}
