/**
 * Utility functions for exporting data from the client side.
 */

/**
 * Escapes a cell value for CSV compatibility.
 */
function escapeCSVValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val).replace(/"/g, '""'); // Escape double quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    str = `"${str}"`;
  }
  return str;
}

/**
 * Exports data to a CSV file.
 */
export function exportToCSV(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map(row => row.map(escapeCSVValue).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports data to an Excel-compatible CSV file.
 * We include the UTF-8 BOM (\uFEFF) so Excel opens it with correct character encoding.
 */
export function exportToExcel(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map(row => row.map(escapeCSVValue).join(","))
  ].join("\n");

  // Excel needs BOM to display UTF-8 characters correctly
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports data to a printable layout that opens the browser print dialog to save as PDF.
 */
export function exportToPDF(title: string, headers: string[], rows: any[][]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export as PDF");
    return;
  }

  const dateString = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const tableHeaders = headers.map(h => `<th style="border: 1px solid #ddd; padding: 10px; text-align: left; background-color: #f2f2f2; font-weight: bold; font-family: sans-serif; font-size: 13px;">${h}</th>`).join("");
  const tableRows = rows.map(row => 
    `<tr>${row.map(cell => `<td style="border: 1px solid #ddd; padding: 8px; font-family: sans-serif; font-size: 12px; color: #333;">${cell === null || cell === undefined ? "" : cell}</td>`).join("")}</tr>`
  ).join("");

  const htmlContent = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            body { margin: 20px; color: #000; }
            .no-print { display: none; }
          }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .header { border-bottom: 2px solid #047857; padding-bottom: 10px; margin-bottom: 20px; }
          .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header" style="font-family: sans-serif;">
          <h1 style="color: #047857; margin: 0; font-size: 24px;">EMTEES Academy</h1>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">LMS Reports & Analytics</p>
        </div>
        <div style="font-family: sans-serif;">
          <h2 style="margin: 0 0 10px 0; color: #333; font-size: 18px;">${title}</h2>
          <p style="margin: 0; font-size: 11px; color: #666;">Generated on: ${dateString}</p>
        </div>
        <table>
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="footer" style="font-family: sans-serif;">
          <p>© ${new Date().getFullYear()} EMTEES Academy. All rights reserved.</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
