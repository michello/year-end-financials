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

const SPREADSHEET_CATEGORIES = new Set([
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
]);

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

// Auto-detect (optional) based on filename; user can override in UI.
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

// Mimic your python: raw_category.lower().capitalize()
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

  return SPREADSHEET_CATEGORIES.has(rawCat) ? rawCat : "Other";
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
  const [filesMeta, setFilesMeta] = useState([]); // [{file, source, cardType}]
  const [compiled, setCompiled] = useState([]);   // array of rows: [source,date,item,amount,category,spender]
  const [errors, setErrors] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const compiledWithHeader = useMemo(() => {
    const header = ["Source", "Purchase Date", "Item", "Amount", "Category", "Spender"];
    return [header, ...compiled];
  }, [compiled]);

  const previewRows = useMemo(() => compiledWithHeader.slice(0, 50), [compiledWithHeader]);

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    const metas = picked.map((file) => {
      const inferred = inferMetaFromFilename(file.name);
      return { file, source: inferred.source || file.name, cardType: inferred.cardType };
    });
    setFilesMeta(metas);
    setCompiled([]);
    setErrors([]);
  }

  function updateMeta(idx, patch) {
    setFilesMeta((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function run() {
    setIsRunning(true);
    setErrors([]);
    setCompiled([]);

    try {
      const output = [];

      for (const meta of filesMeta) {
        const { file, source, cardType } = meta;
        const header = CARD_TO_HEADER_INDEX[cardType];
        if (!header) throw new Error(`Unknown cardType: ${cardType}`);

        let data = await parseCsvFile(file);
        if (!Array.isArray(data) || data.length === 0) continue;

        // Skip CSV header row like Python: next(reader)
        data = data.slice(1);

        for (const row of data) {
          const get = (idx) => (idx == null ? "" : (row[idx] ?? ""));

          const raw_date = get(header.raw_date_index);
          const raw_category = get(header.raw_category_index);
          const raw_item = get(header.raw_item_index);

          const spender =
            header.spender_index != null ? (row[header.spender_index] ?? DEFAULT_SPENDER) : DEFAULT_SPENDER;

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

          output.push([source, raw_date, raw_item, amount, processed_category, spender]);
        }
      }

      setCompiled(output);
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

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Card Spending CSV Compiler (Runs in Browser)</h2>
      <p style={{ color: "#555", marginTop: 6 }}>
        Upload your exported card CSVs → compile into one normalized CSV (no backend).
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept=".csv,text/csv" multiple onChange={onPickFiles} />
        <button onClick={run} disabled={!filesMeta.length || isRunning} style={{ padding: "8px 12px" }}>
          {isRunning ? "Compiling…" : "Compile"}
        </button>
        <button onClick={download} disabled={!compiled.length} style={{ padding: "8px 12px" }}>
          Download compiled CSV
        </button>
      </div>

      {filesMeta.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Files</h3>
          <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Filename</th>
                  <th style={th}>Source (output col)</th>
                  <th style={th}>Card Type</th>
                </tr>
              </thead>
              <tbody>
                {filesMeta.map((m, idx) => (
                  <tr key={m.file.name}>
                    <td style={td}>{m.file.name}</td>
                    <td style={td}>
                      <input
                        value={m.source}
                        onChange={(e) => updateMeta(idx, { source: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      />
                    </td>
                    <td style={td}>
                      <select
                        value={m.cardType}
                        onChange={(e) => updateMeta(idx, { cardType: e.target.value })}
                        style={{ width: "100%", padding: 8 }}
                      >
                        {Object.values(CardType).map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: "#666", marginTop: 8 }}>
            If auto-detection gets a card wrong, just change the card type dropdown.
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #f5c2c7", background: "#fff5f5", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Errors</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{errors.join("\n\n")}</pre>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3>Output</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div><b>Rows compiled:</b> {compiled.length}</div>
          <div style={{ color: "#666" }}>(Preview shows first 50 rows including header)</div>
        </div>

        <div style={{ marginTop: 8, overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {previewRows.map((row, rIdx) => (
                <tr key={rIdx} style={rIdx === 0 ? { background: "#f7f7f7" } : undefined}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={td}>
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details style={{ marginTop: 18, color: "#666" }}>
        <summary>Notes</summary>
        <ul>
          <li>Amounts strip <code>$</code> and commas before parsing.</li>
          <li>Chase / Chase Business / Old Navy amounts are negated (matching your Python).</li>
          <li>Payments (statement payments / online payments) are filtered out.</li>
        </ul>
      </details>
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