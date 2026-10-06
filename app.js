/* ============================================================
   PDF FORM FILLER
   Upload → Live Preview → Overlay Edit → Download
   ============================================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- Default field coordinates (relative %) ----------
   These are RATIOS (0 to 1) of page width/height.
   Works with any page size because we scale them.
   Coordinates are for the Tempsens IPO form as reference.
   Users can drag/type anything anyway.
------------------------------------------------------------ */
const DEFAULT_FIELDS = {
  name:         { page: 0, xPct: 0.60, yPct: 0.115, wPct: 0.33, hPct: 0.014 },
  address:      { page: 0, xPct: 0.60, yPct: 0.135, wPct: 0.33, hPct: 0.026 },
  email:        { page: 0, xPct: 0.60, yPct: 0.165, wPct: 0.33, hPct: 0.014 },
  phone:        { page: 0, xPct: 0.60, yPct: 0.180, wPct: 0.33, hPct: 0.014 },
  pan:          { page: 0, xPct: 0.60, yPct: 0.205, wPct: 0.33, hPct: 0.014 },
  dpid:         { page: 0, xPct: 0.02, yPct: 0.288, wPct: 0.96, hPct: 0.014 },
  opt1_shares:  { page: 0, xPct: 0.22, yPct: 0.352, wPct: 0.09, hPct: 0.016 },
  opt1_price:   { page: 0, xPct: 0.55, yPct: 0.352, wPct: 0.09, hPct: 0.016 },
  amount_fig:   { page: 0, xPct: 0.02, yPct: 0.425, wPct: 0.22, hPct: 0.016 },
  amount_words: { page: 0, xPct: 0.26, yPct: 0.425, wPct: 0.72, hPct: 0.016 },
  asba_ac:      { page: 0, xPct: 0.10, yPct: 0.450, wPct: 0.88, hPct: 0.016 },
  bank_name:    { page: 0, xPct: 0.10, yPct: 0.470, wPct: 0.88, hPct: 0.016 },
  holder_name:  { page: 0, xPct: 0.10, yPct: 0.520, wPct: 0.40, hPct: 0.014 },
};

/* ---------- State ---------- */
let pdfBytes = null;         // original PDF ArrayBuffer
let pdfDoc = null;           // pdfjs document
let scale = 1.3;
let overlays = {};           // field id → HTMLInputElement
let customOverlays = [];     // [{el, page, xPct, yPct}]
let currentFileName = "form.pdf";

/* ============================================================
   UPLOAD HANDLING
============================================================ */
const uploadInput = document.getElementById("pdfUpload");
const dropZone = document.getElementById("dropZone");

uploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleUpload(file);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") handleUpload(file);
  else alert("Please drop a valid PDF file.");
});

async function handleUpload(file) {
  currentFileName = file.name.replace(/\.pdf$/i, "") + "_filled.pdf";
  pdfBytes = await file.arrayBuffer();

  // Switch screens
  document.getElementById("uploadScreen").style.display = "none";
  document.getElementById("editorScreen").style.display = "flex";
  document.getElementById("fileName").textContent = file.name;

  // Load PDF
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;

  // Populate custom page selector
  const pageSelect = document.getElementById("customPage");
  pageSelect.innerHTML = "";
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const opt = document.createElement("option");
    opt.value = i - 1;
    opt.textContent = "Pg " + i;
    pageSelect.appendChild(opt);
  }

  await renderAll();
  attachDefaultOverlays();
  document.getElementById("status").textContent = `✅ ${pdfDoc.numPages} page(s) loaded`;
}

/* ============================================================
   RENDER PDF
============================================================ */
async function renderAll() {
  const viewer = document.getElementById("pdfViewer");
  viewer.innerHTML = "";
  overlays = {};
  customOverlays = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const wrap = document.createElement("div");
    wrap.className = "pdf-page-wrap";
    wrap.dataset.page = i - 1;
    wrap.style.width = viewport.width + "px";
    wrap.style.height = viewport.height + "px";

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.appendChild(canvas);

    viewer.appendChild(wrap);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
}

/* ============================================================
   ATTACH DEFAULT OVERLAYS (from sidebar)
============================================================ */
function attachDefaultOverlays() {
  const wraps = document.querySelectorAll(".pdf-page-wrap");

  Object.entries(DEFAULT_FIELDS).forEach(([id, cfg]) => {
    const wrap = wraps[cfg.page];
    if (!wrap) return;

    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "overlay-input";
    input.dataset.fieldId = id;
    input.dataset.page = cfg.page;

    input.style.left   = (cfg.xPct * wrapW) + "px";
    input.style.top    = (cfg.yPct * wrapH) + "px";
    input.style.width  = (cfg.wPct * wrapW) + "px";
    input.style.height = Math.max(cfg.hPct * wrapH, 14) + "px";

    // Two-way sync with sidebar
    const sidebar = document.getElementById(id);
    if (sidebar) {
      input.addEventListener("input", () => (sidebar.value = input.value));
      sidebar.addEventListener("input", () => (input.value = sidebar.value));
    }

    // Save exact position for PDF generation
    input.dataset.xPct = cfg.xPct;
    input.dataset.yPct = cfg.yPct;
    input.dataset.wPct = cfg.wPct;

    // Enable drag-reposition on the input's parent area (label dragging via Alt key)
    makeOverlayDraggable(input, wrap);

    wrap.appendChild(input);
    overlays[id] = input;
  });
}

/* ---------- Make overlay movable by dragging ---------- */
function makeOverlayDraggable(el, wrap) {
  let drag = false;
  let startX, startY, startLeft, startTop;

  el.addEventListener("mousedown", (e) => {
    // Only drag if user holds Alt key (so typing still works normally)
    if (!e.altKey) return;
    drag = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    el.style.cursor = "move";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = (startLeft + dx) + "px";
    el.style.top  = (startTop + dy) + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = false;
    el.style.cursor = "";

    // Recompute percentages
    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);
    el.dataset.xPct = (el.offsetLeft / wrapW).toFixed(4);
    el.dataset.yPct = (el.offsetTop  / wrapH).toFixed(4);
  });
}

/* ============================================================
   ADD CUSTOM DRAGGABLE TEXT
============================================================ */
document.getElementById("addCustomBtn").addEventListener("click", () => {
  const text = document.getElementById("customText").value.trim();
  const pageIdx = parseInt(document.getElementById("customPage").value, 10);

  if (!text) { alert("Please type some text first."); return; }

  const wraps = document.querySelectorAll(".pdf-page-wrap");
  const wrap = wraps[pageIdx];
  if (!wrap) return;

  const box = document.createElement("div");
  box.className = "overlay-draggable";
  box.contentEditable = true;
  box.textContent = text;
  box.dataset.page = pageIdx;

  // Default position: middle of page
  box.style.left = "100px";
  box.style.top  = "100px";

  const del = document.createElement("span");
  del.className = "delete-btn";
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    box.remove();
    customOverlays = customOverlays.filter(o => o.el !== box);
  });
  box.appendChild(del);

  // Drag anywhere on the box (except delete button)
  let dragging = false, sx, sy, sl, st;
  box.addEventListener("mousedown", (e) => {
    if (e.target === del) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    sl = box.offsetLeft; st = box.offsetTop;
    box.style.cursor = "move";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    box.style.left = (sl + e.clientX - sx) + "px";
    box.style.top  = (st + e.clientY - sy) + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    box.style.cursor = "move";

    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);
    box.dataset.xPct = (box.offsetLeft / wrapW).toFixed(4);
    box.dataset.yPct = (box.offsetTop  / wrapH).toFixed(4);
  });

  wrap.appendChild(box);
  customOverlays.push({ el: box, page: pageIdx });
  document.getElementById("customText").value = "";
});

/* ============================================================
   APPLY (Generate filled PDF with pdf-lib)
============================================================ */
document.getElementById("fillBtn").addEventListener("click", async () => {
  if (!pdfBytes) return;

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Helper to draw text on a page
  function draw(pageIndex, xPct, yPct, wPct, text, pageW, pageH) {
    const x = xPct * pageW;
    const yTop = yPct * pageH;
    const boxW = wPct * pageW;

    // Convert top-based Y to bottom-based Y (PDF origin is bottom-left)
    // Approximate baseline: place text at 70% of the box height from top
    const y = pageH - yTop - 10;

    // Auto-shrink font if text is too wide
    let fontSize = 9;
    let textWidth = font.widthOfTextAtSize(text, fontSize);
    while (textWidth > boxW - 4 && fontSize > 5) {
      fontSize -= 0.5;
      textWidth = font.widthOfTextAtSize(text, fontSize);
    }

    const page = pdf.getPage(pageIndex);
    page.drawText(text, {
      x: x + 2,
      y: y,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  // 1) Draw sidebar-driven fields
  for (const [id, input] of Object.entries(overlays)) {
    const text = (input.value || "").trim();
    if (!text) continue;

    const pageIdx = parseInt(input.dataset.page, 10);
    const xPct = parseFloat(input.dataset.xPct);
    const yPct = parseFloat(input.dataset.yPct);
    const wPct = parseFloat(input.dataset.wPct);

    const page = pdf.getPage(pageIdx);
    const { width, height } = page.getSize();
    draw(pageIdx, xPct, yPct, wPct, text, width, height);
  }

  // 2) Draw custom draggable text boxes
  for (const { el, page: pageIdx } of customOverlays) {
    const text = (el.textContent || "").trim();
    if (!text) continue;

    const xPct = parseFloat(el.dataset.xPct || el.style.left.replace("px","") / 1);
    const yPct = parseFloat(el.dataset.yPct || el.style.top.replace("px","") / 1);

    // If percentages missing, compute from current position
    const wrap = el.parentElement;
    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);
    const realX = parseFloat(el.dataset.xPct) || (el.offsetLeft / wrapW);
    const realY = parseFloat(el.dataset.yPct) || (el.offsetTop  / wrapH);

    const page = pdf.getPage(pageIdx);
    const { width, height } = page.getSize();
    draw(pageIdx, realX, realY, 0.5, text, width, height);
  }

  const bytes = await pdf.save();
  window.__filledBlob = new Blob([bytes], { type: "application/pdf" });

  document.getElementById("saveBtn").disabled = false;
  document.getElementById("status").textContent = "✅ PDF updated — click Download";

  // Re-render preview with the filled PDF
  pdfBytes = bytes.buffer.slice(0);
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  await renderAll();
  attachDefaultOverlays();
  reattachCustomBoxes();
});

function reattachCustomBoxes() {
  // Custom overlays are lost on re-render, so we simply re-create empty ones.
  // (Because we already burned them into the PDF.)
  customOverlays = [];
}

/* ============================================================
   DOWNLOAD
============================================================ */
document.getElementById("saveBtn").addEventListener("click", () => {
  if (!window.__filledBlob) return;
  const url = URL.createObjectURL(window.__filledBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  document.getElementById("status").textContent = "💾 Downloaded!";
});

/* ============================================================
   RESET / NEW UPLOAD
============================================================ */
document.getElementById("resetBtn").addEventListener("click", () => {
  pdfBytes = null;
  pdfDoc = null;
  overlays = {};
  customOverlays = [];
  window.__filledBlob = null;
  document.getElementById("pdfViewer").innerHTML = "";
  document.getElementById("saveBtn").disabled = true;
  document.getElementById("status").textContent = "Ready";

  // Clear sidebar inputs
  document.querySelectorAll(".sidebar-body input, .sidebar-body textarea").forEach(el => el.value = "");

  // Back to upload screen
  document.getElementById("editorScreen").style.display = "none";
  document.getElementById("uploadScreen").style.display = "flex";
  uploadInput.value = "";
});

/* ============================================================
   ZOOM
============================================================ */
document.getElementById("zoomIn").addEventListener("click", () => setZoom(0.15));
document.getElementById("zoomOut").addEventListener("click", () => setZoom(-0.15));

async function setZoom(delta) {
  if (!pdfDoc) return;
  scale = Math.min(2.5, Math.max(0.6, scale + delta));
  document.getElementById("zoomVal").textContent = Math.round(scale / 1.3 * 100) + "%";
  await renderAll();
  attachDefaultOverlays();
}