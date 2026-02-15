/**
 * Parses a date in DD.MM.YYYY format into a comparable timestamp.
 * Returns a Date object or null if parsing fails.
 */
function parseDateDE(dateStr) {
  const parts = dateStr.trim().split('.');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month - 1, day);
}

/**
 * Merges multiple parsed CSV files into a single CSV.
 * - Validates all files have the same column count
 * - Removes exact duplicate rows
 * - Sorts by Belegdatum column (column index 2, DD.MM.YYYY format)
 * - Uses header from the first file
 *
 * Returns { header: string[], rows: string[][] }
 */
export function mergeCSVs(parsedFiles) {
  if (parsedFiles.length === 0) {
    throw new Error('No CSV files to merge');
  }

  // Validate all files have the same column count
  const headerLength = parsedFiles[0].header.length;
  for (let i = 1; i < parsedFiles.length; i++) {
    if (parsedFiles[i].header.length !== headerLength) {
      throw new Error(
        `Column count mismatch: "${parsedFiles[0].fileName}" has ${headerLength} columns, ` +
        `"${parsedFiles[i].fileName}" has ${parsedFiles[i].header.length} columns`
      );
    }
  }

  const header = parsedFiles[0].header;

  // Concatenate all rows and deduplicate
  const allRows = [];
  const seenRows = new Set();

  for (const file of parsedFiles) {
    for (const row of file.rows) {
      const rowKey = row.join('|'); // Fingerprint: "|"-delimited row
      if (!seenRows.has(rowKey)) {
        seenRows.add(rowKey);
        allRows.push(row);
      }
    }
  }

  // Sort by Belegdatum (column index 2, DD.MM.YYYY format)
  const dateColIndex = 2;
  allRows.sort((rowA, rowB) => {
    const dateA = parseDateDE(rowA[dateColIndex]);
    const dateB = parseDateDE(rowB[dateColIndex]);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1; // Invalid dates go to end
    if (!dateB) return -1;

    return dateA - dateB; // Ascending order: oldest first
  });

  return { header, rows: allRows };
}
