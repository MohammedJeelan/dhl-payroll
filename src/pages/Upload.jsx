import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
} from "lucide-react";
import jsPDF from "jspdf";
import emailjs from "@emailjs/browser";
import { db, UPLOADS_COLLECTION } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { readWorkbook, parseSalarySheet } from "../utils/parseSalarySheet";
import "./Upload.css";

// ---- EmailJS config ----
const EMAILJS_SERVICE_ID = "service_67d0y1e";
const EMAILJS_PAYSLIP_TEMPLATE_ID = "template_qidnlug";
const EMAILJS_PUBLIC_KEY = "5IzC-nbSh07KbaAs8";

const money = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" });

// Builds a simple one-page payslip PDF and returns raw base64 (no data: prefix)
function generatePayslipPDF(emp, sheetName) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 60;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Payslip", left, y);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(sheetName || "", 500, y, { align: "right" });

  y += 30;
  doc.setDrawColor(200);
  doc.line(left, y, 547, y);
  y += 24;

  const row = (label, value) => {
    doc.setFont(undefined, "bold");
    doc.text(label, left, y);
    doc.setFont(undefined, "normal");
    doc.text(String(value ?? "—"), left + 160, y);
    y += 20;
  };

  row("Employee Name", emp.name);
  row("Section", emp.section);
  row("Shift", emp.shift);
  row("Bank", emp.bank);
  row("Present Days", emp.presentDays);

  y += 10;
  doc.line(left, y, 547, y);
  y += 24;

  row("Total Earned", money(emp.totalEarnedGross));
  row("Total Deductions", money(emp.totalDed));

  y += 4;
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("Net Payable", left, y);
  doc.text(money(emp.totalPayable), left + 160, y);

  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1];
}

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [parsed, setParsed] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [selected, setSelected] = useState({}); // { [slNo]: true }
  const [mailStatus, setMailStatus] = useState({}); // { [slNo]: 'sending' | 'sent' | 'error' }
  const [sendingAll, setSendingAll] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setSaved(false);
    setParsed(null);
    setSelected({});
    setMailStatus({});
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = readWorkbook(buffer);
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      const defaultSheet = wb.SheetNames[0];
      setActiveSheet(defaultSheet);
      tryParse(wb, defaultSheet);
    } catch (err) {
      setError("Couldn't read that file — make sure it's a valid .xlsx or .xls.");
    }
  }

  function tryParse(wb, sheetName) {
    try {
      const result = parseSalarySheet(wb, sheetName);
      if (result.employees.length === 0) {
        setError(`No employee rows found on "${sheetName}". Try a different sheet.`);
        setParsed(null);
      } else {
        setError("");
        setParsed(result);
        setSelected({});
        setMailStatus({});
      }
    } catch (err) {
      setError(err.message);
      setParsed(null);
    }
  }

  function handleSheetChange(name) {
    setActiveSheet(name);
    setSaved(false);
    if (workbook) tryParse(workbook, name);
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setError("");
    try {
      await addDoc(collection(db, UPLOADS_COLLECTION), {
        fileName,
        sheetName: parsed.sheetName,
        employees: parsed.employees,
        totals: parsed.totals,
        employeeCount: parsed.employees.length,
        uploadedBy: user?.email || "unknown",
        uploadedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (err) {
      setError("Couldn't save to Firestore — check your firebase config and security rules.");
    } finally {
      setSaving(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }

  // ---- Selection ----
  const employees = parsed?.employees || [];
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = employees.length > 0 && employees.every((e) => selected[e.slNo]);

  function toggleAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const next = {};
      employees.forEach((e) => (next[e.slNo] = true));
      setSelected(next);
    }
  }

  function toggleOne(slNo) {
    setSelected((prev) => ({ ...prev, [slNo]: !prev[slNo] }));
  }

  // ---- Sending ----
  async function sendPayslipToEmployee(emp) {
    if (!emp.email) {
      setMailStatus((prev) => ({ ...prev, [emp.slNo]: "error" }));
      return false;
    }
    setMailStatus((prev) => ({ ...prev, [emp.slNo]: "sending" }));
    try {
      const payslipBase64 = generatePayslipPDF(emp, parsed.sheetName);
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_PAYSLIP_TEMPLATE_ID,
        {
          to_email: emp.email,
          to_name: emp.name,
          payslip_pdf: payslipBase64,
          payslip_filename: `Payslip-${emp.name}-${parsed.sheetName}.pdf`,
        },
        EMAILJS_PUBLIC_KEY
      );
      setMailStatus((prev) => ({ ...prev, [emp.slNo]: "sent" }));
      return true;
    } catch (err) {
      setMailStatus((prev) => ({ ...prev, [emp.slNo]: "error" }));
      return false;
    }
  }

  async function handleSendSelected() {
    const toSend = employees.filter((e) => selected[e.slNo]);
    if (toSend.length === 0) return;
    setSendingAll(true);
    for (const emp of toSend) {
      await sendPayslipToEmployee(emp);
      await new Promise((res) => setTimeout(res, 600));
    }
    setSendingAll(false);
  }

  return (
    <div className="upload-page">
      <header className="page-head">
        <div className="page-eyebrow mono">STEP 1 OF 2</div>
        <h1>Upload salary sheet</h1>
        <p>Drop in this month's payroll workbook — it's parsed in your browser before anything is saved.</p>
      </header>

      <div
        className={"dropzone" + (dragOver ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <UploadCloud size={26} strokeWidth={1.6} />
        <div className="dropzone-text">
          <strong>{fileName || "Drop your .xlsx here, or click to browse"}</strong>
          <span>Supports .xlsx and .xls — the AUG 2026 style DHL EX salary sheet</span>
        </div>
      </div>

      {error && (
        <div className="upload-banner error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {sheetNames.length > 1 && (
        <div className="sheet-tabs">
          <span className="sheet-tabs-label mono">SHEET</span>
          {sheetNames.map((name) => (
            <button
              key={name}
              className={"sheet-tab" + (name === activeSheet ? " active" : "")}
              onClick={() => handleSheetChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {parsed && (
        <>
          <div className="stat-strip">
            <div className="stat">
              <span className="stat-label">Employees</span>
              <span className="stat-value mono">{parsed.employees.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total gross earned</span>
              <span className="stat-value mono">{money(parsed.totals.totalGross)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total deductions</span>
              <span className="stat-value mono">{money(parsed.totals.totalDeductions)}</span>
            </div>
            <div className="stat highlight">
              <span className="stat-label">Total payable</span>
              <span className="stat-value mono">{money(parsed.totals.totalPayable)}</span>
            </div>
          </div>

          <div className="preview-head">
            <div className="preview-title">
              <FileSpreadsheet size={15} />
              <span>Preview — {parsed.employees.length} rows detected on "{parsed.sheetName}"</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="save-btn"
                onClick={handleSendSelected}
                disabled={selectedCount === 0 || sendingAll}
              >
                {sendingAll ? (
                  <>
                    <Loader2 size={15} className="spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Mail size={15} /> Send Mail{selectedCount > 0 ? ` (${selectedCount})` : ""}
                  </>
                )}
              </button>
              <button className="save-btn" onClick={handleSave} disabled={saving || saved}>
                {saving ? (
                  <>
                    <Loader2 size={15} className="spin" /> Saving…
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle2 size={15} /> Saved
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="manifest-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Section</th>
                  <th>Bank</th>
                  <th>Shift</th>
                  <th>Present days</th>
                  <th>Total earned</th>
                  <th>Deductions</th>
                  <th>Payable</th>
                  <th>Payslip</th>
                </tr>
              </thead>
              <tbody>
                {parsed.employees.map((e, i) => {
                  const status = mailStatus[e.slNo];
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[e.slNo]}
                          onChange={() => toggleOne(e.slNo)}
                        />
                      </td>
                      <td className="mono dim">{e.slNo}</td>
                      <td>{e.name}</td>
                      <td className="dim">{e.email || "—"}</td>
                      <td>
                        <span className="pill">{e.section}</span>
                      </td>
                      <td className="dim">{e.bank || "—"}</td>
                      <td className="dim">{e.shift || "—"}</td>
                      <td className="mono">{e.presentDays ?? "—"}</td>
                      <td className="mono">{money(e.totalEarnedGross)}</td>
                      <td className="mono dim">{money(e.totalDed)}</td>
                      <td className="mono strong">{money(e.totalPayable)}</td>
                      <td>
                        {status === "sending" && <Loader2 size={15} className="spin" />}
                        {status === "sent" && <MailCheck size={15} color="#22c55e" />}
                        {status === "error" && <MailWarning size={15} color="#ef4444" />}
                        {!status && (
                          <button
                            className="icon-btn"
                            title="Send payslip"
                            onClick={() => sendPayslipToEmployee(e)}
                            disabled={!e.email}
                          >
                            <Mail size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {saved && (
            <div className="upload-banner success">
              <CheckCircle2 size={16} />
              <span>Saved. </span>
              <button className="link-btn" onClick={() => navigate("/app/data")}>
                View it in Uploaded data →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}