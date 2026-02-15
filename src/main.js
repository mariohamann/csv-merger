import './style.css';
import { readCSVFile } from './csv-reader.js';
import { mergeCSVs } from './csv-merger.js';
import { downloadCSV } from './csv-export.js';

// ============ STATE ============
let parsedFiles = [];
let mergedData = null;

// ============ DOM ELEMENTS ============
const dropZone = document.querySelector('#dropZone');
const fileInput = document.querySelector('#fileInput');
const fileList = document.querySelector('#fileList');
const fileCount = document.querySelector('#fileCount');
const downloadBtn = document.querySelector('#downloadBtn');
const tableHead = document.querySelector('#tableHead');
const tableBody = document.querySelector('#tableBody');
const messageDiv = document.querySelector('#message');

// ============ UTILITIES ============
function showMessage(text, type = 'info') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  if (type !== 'info') {
    setTimeout(() => {
      messageDiv.textContent = '';
      messageDiv.className = 'message';
    }, 5000);
  }
}

function clearPreview() {
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';
  downloadBtn.disabled = true;
  mergedData = null;
}

// ============ FILE HANDLING ============
async function handleFiles(files) {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return;

  clearPreview();
  showMessage(`Processing ${fileArray.length} file(s)...`, 'info');

  const newFiles = [];

  for (const file of fileArray) {
    try {
      const parsed = await readCSVFile(file);
      newFiles.push(parsed);
    } catch (error) {
      showMessage(`Error reading "${file.name}": ${error.message}`, 'error');
      return;
    }
  }

  // Check for column count conflicts with existing files
  if (parsedFiles.length > 0) {
    const existingColCount = parsedFiles[0].header.length;
    for (const file of newFiles) {
      if (file.header.length !== existingColCount) {
        showMessage(
          `Column count mismatch: existing files have ${existingColCount} columns, ` +
          `"${file.fileName}" has ${file.header.length} columns`,
          'error'
        );
        return;
      }
    }
  }

  parsedFiles.push(...newFiles);
  renderFileList();
  showMessage(
    `Added ${newFiles.length} file(s). Total: ${parsedFiles.length} file(s)`,
    'success'
  );

  // Auto-merge and render preview
  autoMergeAndRender();
}

// ============ FILE LIST RENDERING ============
function renderFileList() {
  if (parsedFiles.length === 0) {
    fileList.innerHTML = '<div class="file-list-empty">No files added yet</div>';
    fileCount.textContent = '0';
    return;
  }

  fileCount.textContent = parsedFiles.length;
  fileList.innerHTML = parsedFiles
    .map((file, index) => {
      return `
        <div class="file-item">
          <div class="file-info">
            <span class="file-name">${escapeHTML(file.fileName)}</span>
            <span class="file-count">${file.fileSize} rows</span>
            <span class="file-encoding">${file.encoding ? file.encoding.toUpperCase() : '?'}</span>
          </div>
          <button class="btn-remove" data-index="${index}" title="Remove file">
            ✕
          </button>
        </div>
      `;
    })
    .join('');

  // Attach remove button listeners
  fileList.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      parsedFiles.splice(index, 1);
      clearPreview();
      renderFileList();
      showMessage('File removed', 'info');
    });
  });
}

// ============ DATA RENDERING ============
function renderMergedData(header, rows) {
  // Render header
  const headerRow = document.createElement('tr');
  header.forEach((cell) => {
    const th = document.createElement('th');
    th.textContent = cell;
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);

  // Render first 1000 rows (to avoid memory issues with very large CSVs)
  const displayRows = rows.slice(0, 1000);
  displayRows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  // Show summary
  const message =
    rows.length > 1000
      ? `Showing first 1000 of ${rows.length} rows`
      : `Displaying ${rows.length} rows`;
  showMessage(message, 'info');

  downloadBtn.disabled = false;
}

function escapeHTML(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ============ AUTO MERGE ============
function autoMergeAndRender() {
  if (parsedFiles.length === 0) {
    clearPreview();
    return;
  }

  try {
    clearPreview();
    mergedData = mergeCSVs(parsedFiles);
    renderMergedData(mergedData.header, mergedData.rows);
    showMessage(
      `Merged ${parsedFiles.length} file(s): ${mergedData.rows.length} total rows (after deduplication)`,
      'success'
    );
  } catch (error) {
    showMessage(`Merge failed: ${error.message}`, 'error');
  }
}

// ============ EVENT LISTENERS ============

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  handleFiles(e.dataTransfer.files);
});

// Click to select files
dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  // Reset input so same file can be added again
  e.target.value = '';
});

// Download button
downloadBtn.addEventListener('click', () => {
  if (!mergedData) {
    showMessage('No merged data to download', 'error');
    return;
  }

  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(mergedData.header, mergedData.rows, `merged-${timestamp}.csv`);
    showMessage('CSV file downloaded', 'success');
  } catch (error) {
    showMessage(`Download failed: ${error.message}`, 'error');
  }
});
