/**
 * Auto-detects encoding by checking BOM and null-byte patterns.
 * Returns 'utf-16le', 'utf-16be', or 'utf-8'.
 */
function detectEncoding(buffer) {
  const view = new Uint8Array(buffer);

  // Check for BOM (Byte Order Mark) — most reliable indicator
  if (view.length >= 2) {
    // UTF-16 LE BOM: FF FE (but not FF FE 00 00 which is UTF-32 LE)
    if (view[0] === 0xff && view[1] === 0xfe && !(view.length >= 4 && view[2] === 0x00 && view[3] === 0x00)) {
      return 'utf-16le';
    }
    // UTF-16 BE BOM: FE FF
    if (view[0] === 0xfe && view[1] === 0xff) {
      return 'utf-16be';
    }
  }

  // Check for UTF-8 BOM: EF BB BF
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return 'utf-8';
  }

  // Heuristic: check for UTF-16 patterns in the first 100 bytes
  // Many banking/financial tools produce broken UTF-16 LE: most chars are
  // XX 00 but newlines and some numbers lose their null byte. We detect this
  // by counting null bytes at odd positions (UTF-16 LE for ASCII).
  if (view.length >= 40) {
    let nullsAtOdd = 0;
    let nullsAtEven = 0;

    for (let i = 0; i < 40; i += 2) {
      if (i + 1 < view.length) {
        if (view[i + 1] === 0x00) nullsAtOdd++;
        if (view[i] === 0x00) nullsAtEven++;
      }
    }

    const threshold = 14; // 70% of 20 pairs
    if (nullsAtOdd > nullsAtEven && nullsAtOdd >= threshold) {
      return 'utf-16le';
    }
    if (nullsAtEven > nullsAtOdd && nullsAtEven >= threshold) {
      return 'utf-16be';
    }
  }

  // Default to UTF-8
  return 'utf-8';
}

/**
 * Decodes a buffer that is (possibly broken) UTF-16 LE/BE by stripping all
 * 0x00 bytes and decoding what remains as Latin-1 (ISO 8859-1).
 *
 * Many banking/financial CSV exporters produce broken UTF-16 LE where:
 *  - Most characters are XX 00 (proper UTF-16 LE for ASCII)
 *  - But newlines are single-byte 0x0A (missing the 0x00)
 *  - And some numeric values like "10" are raw ASCII (31 30) instead of
 *    proper UTF-16 LE (31 00 30 00)
 *
 * Using TextDecoder('utf-16le') on this data causes:
 *  1. Newline + next char merge into one garbled UTF-16 codepoint → no line breaks found
 *  2. Adjacent ASCII digits merge into CJK characters (e.g. "10" → U+3031 = 〱)
 *
 * The fix: strip all 0x00 bytes, then the remaining bytes are clean ASCII/Latin-1.
 * This works because for all chars ≤ U+00FF, the UTF-16 LE high byte is 0x00,
 * so removing it leaves the correct Latin-1 byte. Umlauts (ä=e4, ö=f6, ü=fc, etc.)
 * are preserved correctly.
 */
function decodeBrokenUTF16(buffer) {
  const view = new Uint8Array(buffer);

  // Strip all 0x00 bytes
  const nonNullBytes = [];
  for (let i = 0; i < view.length; i++) {
    if (view[i] !== 0x00) {
      nonNullBytes.push(view[i]);
    }
  }

  // Decode as Latin-1 (each byte maps directly to its Unicode codepoint)
  const chars = new Array(nonNullBytes.length);
  for (let i = 0; i < nonNullBytes.length; i++) {
    chars[i] = String.fromCharCode(nonNullBytes[i]);
  }
  return chars.join('');
}

/**
 * Reads a CSV file, auto-detects encoding, and parses it.
 * Returns { header: string[], rows: string[][], fileName: string, encoding: string }
 */
export async function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const encoding = detectEncoding(buffer);

        // Decode buffer to string
        let text;
        if (encoding === 'utf-16le' || encoding === 'utf-16be') {
          // Use our robust decoder that handles broken UTF-16 from banking software
          text = decodeBrokenUTF16(buffer);
        } else {
          const decoder = new TextDecoder(encoding);
          text = decoder.decode(buffer);
        }

        // Normalize line endings: convert \r\n and \r to \n
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Parse CSV: split by newlines, remove empty lines
        const lines = normalizedText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (lines.length === 0) {
          throw new Error('CSV file is empty');
        }

        // First line is header
        const header = lines[0].split(';').map((cell) => cell.trim());

        // Remaining lines are data rows
        const rows = lines.slice(1).map((line) =>
          line.split(';').map((cell) => cell.trim())
        );

        // Validate that all rows have the same column count as header
        const validRows = rows.filter((row) => row.length === header.length);
        if (validRows.length < rows.length) {
          const skipped = rows.length - validRows.length;
          console.warn(
            `File "${file.name}": Skipped ${skipped} row(s) with mismatched column count (expected ${header.length})`
          );
        }

        // Log info for debugging
        console.log(
          `File "${file.name}" (${encoding}): ${validRows.length} rows, ${header.length} columns`
        );

        resolve({
          header,
          rows: validRows,
          fileName: file.name,
          fileSize: validRows.length,
          encoding,
        });
      } catch (error) {
        reject(new Error(`Failed to parse CSV file: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.readAsArrayBuffer(file);
  });
}
