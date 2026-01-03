import React, { useMemo, useState } from "react";
import Papa from "papaparse";

/**
 * Output columns:
 * Source, Purchase Date, Item, Amount, Category, Spender
 */

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
  const cleaned = String(raw_amount ?? "").replace(/[$,]/g, "").trim();
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
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

export default function CardSpendingCompiler() {
  const [filesMeta, setFilesMeta] = useState([]); // [{id, file, source, cardType}]
  const [compiled, setCompiled] = useState([]); // [{id, source, date, item, amount, category, spender}]
  const [errors, setErrors] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const [spenderName, setSpenderName] = useState(DEFAULT_SPENDER);

  // Pagination state
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

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
        });
        existingIds.add(id);
      }
      return next;
    });

    // allow selecting the same file again later
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

  // Build CSV rows from compiled objects (uses edited categories)
  const compiledWithHeader = useMemo(() => {
    const header = ["Source", "Purchase Date", "Item", "Amount", "Category", "Spender"];
    const rows = compiled.map((r) => [r.source, r.date, r.item, r.amount, r.category, r.spender]);
    return [header, ...rows];
  }, [compiled]);

  // Pagination derived values
  const totalRows = compiled.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return compiled.slice(start, end);
  }, [compiled, currentPage, pageSize]);

  function setCategory(txnId, nextCategory) {
    setCompiled((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, category: nextCategory } : t))
    );
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
        const header = CARD_TO_HEADER_INDEX[cardType];
        if (!header) throw new Error(`Unknown cardType: ${cardType}`);

        let data = await parseCsvFile(file);
        if (!Array.isArray(data) || data.length === 0) continue;

        // Skip CSV header row (like Python next(reader))
        data = data.slice(1);

        for (const row of data) {
          const get = (idx) => (idx == null ? "" : (row[idx] ?? ""));

          const raw_date = get(header.raw_date_index);
          const raw_category = get(header.raw_category_index);
          const raw_item = get(header.raw_item_index);

          const spender =
            header.spender_index != null
              ? (row[header.spender_index] ?? spenderName)
              : spenderName;

          const raw_amount_cell = get(header.raw_amount_index);

          if (isPayment(raw_item, raw_category)) continue;

          const amount =
            cardType === CardType.CHASE ||
            cardType === CardType.CHASE_BUSINESS ||
            cardType === CardType.OLD_NAVY
              ? processRawAmount(raw_amount_cell)
              : parseNumber(raw_amount_cell);

          if (amount == null) continue;

          const processed_category =
            cardType === CardType.OLD_NAVY ? "Shopping" : processCategory(raw_item, raw_category);

          out.push({
            id: `${source}__${file.name}__${rowCounter++}`, // stable enough for this session
            source,
            date: raw_date,
            item: raw_item,
            amount,
            category: processed_category,
            spender,
          });
        }
      }

      setCompiled(out);
    } catch (err) {
      setErrors((prev) => [
        ...prev,
        typeof err === "string" ? err : JSON.stringify(err, null, 2),
      ]);
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
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Card Spending CSV Compiler (Runs in Browser)</h2>

      {/* Spender input */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Spender name (used when CSV has no spender column)
        </label>
        <input
          type="text"
          value={spenderName}
          onChange={(e) => setSpenderName(e.target.value)}
          placeholder="Your name"
          style={{ padding: 8, width: "100%", maxWidth: 360 }}
        />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept=".csv,text/csv" multiple onChange={onPickFiles} />

        <button onClick={run} disabled={!filesMeta.length || isRunning} style={{ padding: "8px 12px" }}>
          {isRunning ? "Compiling…" : "Compile"}
        </button>

        <button onClick={download} disabled={!compiled.length} style={{ padding: "8px 12px" }}>
          Download compiled CSV
        </button>

        <button onClick={clearAllFiles} disabled={!filesMeta.length || isRunning} style={{ padding: "8px 12px" }}>
          Clear all files
        </button>
      </div>

      {/* Files table */}
      {filesMeta.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Files ({filesMeta.length})</h3>
            <span style={{ color: "#666" }}>You can keep adding files with the uploader above.</span>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12, marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Filename</th>
                  <th style={th}>Source (output col)</th>
                  <th style={th}>Card Type</th>
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
                        style={{ width: "100%", padding: 8 }}
                      />
                    </td>
                    <td style={td}>
                      <select
                        value={m.cardType}
                        onChange={(e) => updateMeta(m.id, { cardType: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      >
                        {Object.values(CardType).map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <button onClick={() => removeFile(m.id)} disabled={isRunning} style={{ padding: "8px 12px" }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: "#666", marginTop: 8 }}>
            If auto-detection gets a card wrong, change the card type dropdown.
          </p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #f5c2c7", background: "#fff5f5", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Errors</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{errors.join("\n\n")}</pre>
        </div>
      )}

      {/* Transactions + pagination + editable category */}
      <div style={{ marginTop: 16 }}>
        <h3>Transactions</h3>

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <b>Total transactions:</b> {totalRows}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontWeight: 600 }}>Rows per page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(next);
                setPage(1);
              }}
              style={{ padding: 8 }}
              disabled={!compiled.length}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevPage} disabled={!compiled.length || currentPage <= 1} style={{ padding: "8px 12px" }}>
              Prev
            </button>
            <div style={{ color: "#555" }}>
              Page <b>{currentPage}</b> / {totalPages}
            </div>
            <button onClick={nextPage} disabled={!compiled.length || currentPage >= totalPages} style={{ padding: "8px 12px" }}>
              Next
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Source</th>
                <th style={th}>Purchase Date</th>
                <th style={th}>Item</th>
                <th style={th}>Amount</th>
                <th style={th}>Category (editable)</th>
                <th style={th}>Spender</th>
              </tr>
            </thead>
            <tbody>
              {!compiled.length ? (
                <tr>
                  <td style={td} colSpan={6}>
                    No transactions yet. Upload CSVs and click <b>Compile</b>.
                  </td>
                </tr>
              ) : (
                pagedRows.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>{t.source}</td>
                    <td style={td}>{t.date}</td>
                    <td style={{ ...td, whiteSpace: "normal", minWidth: 280 }}>{t.item}</td>
                    <td style={td}>{t.amount}</td>
                    <td style={td}>
                      <select
                        value={SPREADSHEET_CATEGORY_SET.has(t.category) ? t.category : "Other"}
                        onChange={(e) => setCategory(t.id, e.target.value)}
                        style={{ padding: 8, width: "100%" }}
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

        <p style={{ color: "#666", marginTop: 8 }}>
          Tip: After you edit categories, the <b>Download compiled CSV</b> button exports your edits.
        </p>
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
