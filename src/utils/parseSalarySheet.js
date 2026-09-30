import * as XLSX from "xlsx";

// Canonical field order we try to map the sheet's header row onto.
// Matching is fuzzy (lowercased, punctuation-stripped) so small header
// wording changes month to month don't break the import.
const FIELD_MAP = [
  { key: "slNo", match: ["slno", "sl no"] },
  { key: "name", match: ["empnames", "empname", "name"] },
  { key: "email", match: ["email"] },
  { key: "dob", match: ["dob"] },
  { key: "shift", match: ["shift"] },
  { key: "doj", match: ["doj"] },
  { key: "account", match: ["accountcust", "account"] },
  { key: "bankName", match: ["bankname"] },
  { key: "accountNo", match: ["accountno"] },
  { key: "ifsc", match: ["ifsccode", "ifsc"] },
  { key: "actualDays", match: ["actualdaysinthismonth", "actualdays"] },
  { key: "basicDa", match: ["basicda"] },
  { key: "bonus", match: ["bonus"] },
  { key: "gross", match: ["gross"] },
  { key: "presentDays", match: ["presentdays"] },
  { key: "basicDaEarned", match: ["basicdaearned"] },
  { key: "bonusEarned", match: ["bonusearned"] },
  { key: "totalEarnedGross", match: ["totalearnedgross"] },
  { key: "pf", match: ["pf12", "pf"] },
  { key: "esic", match: ["esic75", "esic"] },
  { key: "advanceDeduction", match: ["salaryadvancededuction"] },
  { key: "trafficPenalty", match: ["trafficpenalty"] },
  { key: "totalDed", match: ["totalded"] },
  { key: "totalEarned", match: ["totalearned"] },
  { key: "noOt", match: ["noot"] },
  { key: "otAmount", match: ["otamount"] },
  { key: "arrears", match: ["arrears"] },
  { key: "monthlyIncentive", match: ["monthlyincentive"] },
  { key: "totalPayable", match: ["totalpayableafteralldeduction", "totalpayable"] },
  { key: "specialIncentive", match: ["specialincentive"] },
];

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// normalize every alias once up front, so aliases can be written naturally
// (with spaces/punctuation) and still compare correctly against normalized
// header cells.
FIELD_MAP.forEach((f) => {
  f.match = f.match.map(normalize);
});

function excelDateToString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return value ?? "";
}

/** Returns the list of sheet names in a workbook (for the user to pick from). */
export function listSheetNames(workbook) {
  return workbook.SheetNames;
}

export function readWorkbook(arrayBuffer) {
  return XLSX.read(arrayBuffer, { type: "array", cellDates: true });
}

/**
 * Parses one worksheet of a DHL-style salary sheet into structured rows.
 * The sheet template mixes header rows, section titles (BG1, WASHING…) and
 * subtotal rows in with the data, so we detect the header row by content,
 * map columns fuzzily, then keep every row whose "SL No" column is numeric
 * — that reliably grabs only real employee rows regardless of section.
 */
export function parseSalarySheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });

  // 1. find the header row
  let headerRowIdx = -1;
  let headerRow = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.some((c) => normalize(c).includes("empname"))) {
      headerRowIdx = i;
      headerRow = row;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find a header row containing "EMP names" on this sheet — is it a salary sheet?'
    );
  }

  // 2. map each column index -> canonical field key.
  //    IMPORTANT: match exactly on the normalized header text, never with
  //    .includes() — substring matching here previously caused real bugs,
  //    e.g. the generic "name" alias matching inside "Bank Name", and
  //    "gross" matching inside "Total earned Gross", silently shifting
  //    values into the wrong fields.
  const colToField = {};
  const usedKeys = new Set();
  headerRow.forEach((cell, idx) => {
    const norm = normalize(cell);
    if (!norm) return;
    const found = FIELD_MAP.find((f) => f.match.includes(norm));
    if (found && !usedKeys.has(found.key)) {
      colToField[idx] = found.key;
      usedKeys.add(found.key);
    }
  });

  const slNoColIdx = Object.keys(colToField).find((idx) => colToField[idx] === "slNo");

  // 3. walk the rows below the header, tracking section titles, keeping
  //    only rows whose SL No cell is a plain number
  let currentSection = "Main";
  const employees = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => String(c).trim() !== "");

    if (nonEmpty.length === 0) continue;

    // section title rows look like a single short label, e.g. "BG1"
    if (nonEmpty.length === 1 && isNaN(Number(nonEmpty[0]))) {
      currentSection = String(nonEmpty[0]).trim();
      continue;
    }

    const slNoValue = slNoColIdx !== undefined ? row[slNoColIdx] : undefined;
    const isDataRow = slNoValue !== undefined && slNoValue !== "" && !isNaN(Number(slNoValue));
    if (!isDataRow) continue;

    const record = { section: currentSection };
    Object.entries(colToField).forEach(([idx, field]) => {
      let value = row[idx];
      if (field === "dob" || field === "doj") value = excelDateToString(value);
      record[field] = value === "" ? null : value;
    });
    employees.push(record);
  }

  const totals = employees.reduce(
    (acc, e) => {
      acc.totalPayable += Number(e.totalPayable) || 0;
      acc.totalGross += Number(e.totalEarnedGross) || 0;
      acc.totalDeductions += Number(e.totalDed) || 0;
      return acc;
    },
    { totalPayable: 0, totalGross: 0, totalDeductions: 0 }
  );

  return { sheetName, employees, totals };
}