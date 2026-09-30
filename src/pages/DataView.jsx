import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { FileSpreadsheet, Mail, Inbox, Loader2, MailCheck, MailWarning } from "lucide-react";
import jsPDF from "jspdf";
import emailjs from "@emailjs/browser";
import { db, storage, UPLOADS_COLLECTION } from "../firebase";
import "./DataView.css";

// ---- EmailJS config ----
const EMAILJS_SERVICE_ID = "service_67d0y1e";
const EMAILJS_PAYSLIP_TEMPLATE_ID = "template_qidnlug";
const EMAILJS_PUBLIC_KEY = "5IzC-nbSh07KbaAs8";

// ---- Company header shown on the payslip — change if needed ----
const COMPANY_NAME = "DHL EXPRESS";
const COMPANY_SUBTITLE = "DHL Payroll";

const money = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" });

// jsPDF's default font can't render the ₹ glyph (renders as garbage superscript).
// Use plain "Rs." prefix inside the PDF only — the web UI keeps money() with ₹.
const pdfMoney = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function formatDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Builds a structured, template-style payslip PDF
function buildPayslipDoc(emp, sheetName) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = 595;
  const margin = 40;
  const half = (pageWidth - margin * 2 - 20) / 2;
  const leftX = margin;
  const rightX = margin + half + 20;
  let y = 50;

  // ---- Header ----
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text(COMPANY_NAME, leftX, y);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(COMPANY_SUBTITLE, leftX, y + 14);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(20);
  doc.setFont(undefined, "bold");
  doc.setTextColor(90, 33, 182);
  doc.text("PAYSLIP", pageWidth - margin, y, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y += 34;
  doc.setDrawColor(90, 33, 182);
  doc.setLineWidth(1.2);
  doc.line(leftX, y, pageWidth - margin, y);
  y += 26;

  // ---- Employee info grid (2 columns x 6 rows) ----
  const infoRow = (label, value, x, rowY) => {
    doc.setFontSize(8.5);
    doc.setFont(undefined, "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setFontSize(10.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(String(value ?? "—"), x, rowY + 13);
  };

  let infoY = y;
  infoRow("Employee Name", emp.name, leftX, infoY);
  infoRow("Pay Period", sheetName, rightX, infoY);
  infoY += 34;
  infoRow("Employee ID", emp.slNo, leftX, infoY);
  infoRow("Department", emp.section, rightX, infoY);
  infoY += 34;
  infoRow("Date of Birth", emp.dob, leftX, infoY);
  infoRow("Date of Joining", emp.doj, rightX, infoY);
  infoY += 34;
  infoRow("Shift", emp.shift, leftX, infoY);
  infoRow("Account/Cust", emp.account, rightX, infoY);
  infoY += 34;
  infoRow("Bank Name", emp.bankName, leftX, infoY);
  infoRow("Account No.", emp.accountNo, rightX, infoY);
  infoY += 34;
  infoRow("IFSC Code", emp.ifsc, leftX, infoY);
  infoRow("Present Days", `${emp.presentDays ?? "—"} / ${emp.actualDays ?? "—"}`, rightX, infoY);
  infoY += 30;

  y = infoY;
  doc.setDrawColor(220);
  doc.setLineWidth(0.75);
  doc.line(leftX, y, pageWidth - margin, y);
  y += 24;

  // ---- Earnings / Deductions two-column table ----
  const earnings = [
    ["Basic & DA", pdfMoney(emp.basicDa)],
    ["Bonus", pdfMoney(emp.bonus)],
    ["Gross", pdfMoney(emp.gross)],
    ["Basic & DA Earned", pdfMoney(emp.basicDaEarned)],
    ["Bonus Earned", pdfMoney(emp.bonusEarned)],
    ["No. of OT", emp.noOt ?? "—"],
    ["OT Amount", pdfMoney(emp.otAmount)],
    ["Arrears", pdfMoney(emp.arrears)],
    ["Monthly Incentive", pdfMoney(emp.monthlyIncentive)],
    ["Special Incentive", pdfMoney(emp.specialIncentive)],
    ["Total Earned", pdfMoney(emp.totalEarned)],
  ];
  const deductions = [
    ["P.F (12%)", pdfMoney(emp.pf)],
    ["E.S.I.C (0.75%)", pdfMoney(emp.esic)],
    ["Advance/Deduction", pdfMoney(emp.advanceDeduction)],
    ["Traffic Penalty", pdfMoney(emp.trafficPenalty)],
  ];

  const tableTop = y;
  doc.setFontSize(10.5);
  doc.setFont(undefined, "bold");
  doc.setFillColor(245, 243, 255);
  doc.rect(leftX, y - 14, half, 20, "F");
  doc.rect(rightX, y - 14, half, 20, "F");
  doc.text("Earnings", leftX + 6, y);
  doc.text("Amount", leftX + half - 6, y, { align: "right" });
  doc.text("Deductions", rightX + 6, y);
  doc.text("Amount", rightX + half - 6, y, { align: "right" });
  y += 20;

  const printRows = (list, x) => {
    let rowY = tableTop + 20;
    doc.setFont(undefined, "normal");
    doc.setFontSize(9.5);
    list.forEach(([label, value]) => {
      doc.setTextColor(80, 80, 80);
      doc.text(label, x + 6, rowY);
      doc.setTextColor(0, 0, 0);
      doc.text(String(value), x + half - 6, rowY, { align: "right" });
      rowY += 18;
    });
    return rowY;
  };

  const leftEndY = printRows(earnings, leftX);
  const rightEndY = printRows(deductions, rightX);
  const rowsEndY = Math.max(leftEndY, rightEndY) + 4;

  doc.setDrawColor(220);
  doc.line(leftX, rowsEndY, leftX + half, rowsEndY);
  doc.line(rightX, rowsEndY, rightX + half, rowsEndY);

  const totalsY = rowsEndY + 18;
  doc.setFont(undefined, "bold");
  doc.setFontSize(10.5);
  doc.text("Gross Pay", leftX + 6, totalsY);
  doc.text(pdfMoney(emp.totalEarnedGross), leftX + half - 6, totalsY, { align: "right" });
  doc.text("Total Deductions", rightX + 6, totalsY);
  doc.text(pdfMoney(emp.totalDed), rightX + half - 6, totalsY, { align: "right" });

  y = totalsY + 30;

  // ---- Net Pay bar ----
  doc.setFillColor(90, 33, 182);
  doc.rect(leftX, y, pageWidth - margin * 2, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  doc.text("NET PAY", leftX + 12, y + 22);
  doc.setFontSize(14);
  doc.text(pdfMoney(emp.totalPayable), pageWidth - margin - 12, y + 22, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y += 60;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("This is a system-generated payslip and does not require a signature.", leftX, y);

  return doc;
}

// Generates the PDF, uploads it to Firebase Storage, returns the public download URL
async function uploadPayslipAndGetLink(emp, sheetName, uploadId) {
  const doc = buildPayslipDoc(emp, sheetName);
  const base64 = doc.output("datauristring").split(",")[1];

  const path = `payslips/${uploadId}/${emp.name.replace(/\s+/g, "_")}_payslip.pdf`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, "base64", { contentType: "application/pdf" });
  return getDownloadURL(storageRef);
}

export default function DataView() {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);

  const [selected, setSelected] = useState({}); // { [slNo]: true }
  const [mailStatus, setMailStatus] = useState({}); // { [slNo]: 'sending' | 'sent' | 'error' }
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, UPLOADS_COLLECTION), orderBy("uploadedAt", "desc"));
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUploads(docs);
        if (docs.length > 0) setActiveId(docs[0].id);
      } catch (err) {
        setError("Couldn't load uploads from Firestore — check your firebase config and security rules.");
        setUploads([]);
      }
    }
    load();
  }, []);

  const active = uploads?.find((u) => u.id === activeId);
  const employees = active?.employees || [];
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = employees.length > 0 && employees.every((e) => selected[e.slNo]);

  function switchUpload(id) {
    setActiveId(id);
    setSelected({});
    setMailStatus({});
  }

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

  async function sendPayslipToEmployee(emp) {
    if (!emp.email) {
      setMailStatus((prev) => ({ ...prev, [emp.slNo]: "error" }));
      return false;
    }
    setMailStatus((prev) => ({ ...prev, [emp.slNo]: "sending" }));
    try {
      const payslipLink = await uploadPayslipAndGetLink(emp, active.sheetName, active.id);
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_PAYSLIP_TEMPLATE_ID,
        {
          to_email: emp.email,
          to_name: emp.name,
          payslip_link: payslipLink,
          payslip_filename: `${emp.name} payslip.pdf`,
        },
        EMAILJS_PUBLIC_KEY
      );
      setMailStatus((prev) => ({ ...prev, [emp.slNo]: "sent" }));
      return true;
    } catch (err) {
      console.error(err);
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
    <div className="dataview-page">
      <header className="page-head">
        <div className="page-eyebrow mono">STEP 2 OF 2</div>
        <h1>Uploaded data</h1>
        <p>Every salary sheet saved to Firestore, ready to review — payslip emails plug in here next.</p>
      </header>

      {error && <div className="upload-banner error">{error}</div>}

      {uploads?.length === 0 && !error && (
        <div className="empty-state">
          <Inbox size={26} strokeWidth={1.5} />
          <strong>Nothing uploaded yet</strong>
          <span>Go to "Upload sheet" to bring in this month's payroll workbook.</span>
        </div>
      )}

      {uploads && uploads.length > 0 && (
        <div className="dataview-layout">
          <div className="upload-list">
            {uploads.map((u) => (
              <button
                key={u.id}
                className={"upload-item" + (u.id === activeId ? " active" : "")}
                onClick={() => switchUpload(u.id)}
              >
                <FileSpreadsheet size={15} />
                <div className="upload-item-body">
                  <div className="upload-item-name">{u.sheetName || u.fileName}</div>
                  <div className="upload-item-meta mono">{formatDate(u.uploadedAt)}</div>
                </div>
                <span className="upload-item-count mono">{u.employeeCount ?? u.employees?.length ?? 0}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="upload-detail">
              <div className="stat-strip">
                <div className="stat">
                  <span className="stat-label">Employees</span>
                  <span className="stat-value mono">{active.employees.length}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total gross earned</span>
                  <span className="stat-value mono">{money(active.totals?.totalGross)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total deductions</span>
                  <span className="stat-value mono">{money(active.totals?.totalDeductions)}</span>
                </div>
                <div className="stat highlight">
                  <span className="stat-label">Total payable</span>
                  <span className="stat-value mono">{money(active.totals?.totalPayable)}</span>
                </div>
              </div>

              <div className="preview-head">
                <div className="preview-title">
                  <FileSpreadsheet size={15} />
                  <span>{active.employees.length} employees</span>
                </div>
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
                      <th>Present days</th>
                      <th>Total earned</th>
                      <th>Payable</th>
                      <th>Payslip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.employees.map((e, i) => {
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
                          <td className="dim">{e.bankName || "—"}</td>
                          <td className="mono">{e.presentDays ?? "—"}</td>
                          <td className="mono">{money(e.totalEarnedGross)}</td>
                          <td className="mono strong">{money(e.totalPayable)}</td>
                          <td>
                            {status === "sending" && <Loader2 size={14} className="spin" />}
                            {status === "sent" && <MailCheck size={14} color="#22c55e" />}
                            {status === "error" && <MailWarning size={14} color="#ef4444" />}
                            {!status && (
                              <button
                                className="mail-btn"
                                title="Email payslip"
                                onClick={() => sendPayslipToEmployee(e)}
                                disabled={!e.email}
                              >
                                <Mail size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}