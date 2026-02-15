/**
 * Downloads a CSV as a file in the browser.
 * Encodes as UTF-8, uses `;` delimiter, and sets CRLF line endings.
 */
export function downloadCSV(header, rows, filename = 'merged.csv') {
  // Escape cells that contain semicolons, newlines, or quotes
  const escapeCellForCSV = (cell) => {
    const str = String(cell || '');
    if (str.includes(';') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV lines
  const headerLine = header.map(escapeCellForCSV).join(';');
  const dataLines = rows.map((row) =>
    row.map(escapeCellForCSV).join(';')
  );

  const csvContent = [headerLine, ...dataLines].join('\r\n');

  // Encode as UTF-8 and create Blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
