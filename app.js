/* ============================================================
   PDF FORM FILLER — v2 (Fixed Alignment)
   ============================================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- Default field coordinates ----------
   xPct, yPct, wPct, hPct are 0..1 ratios of page size.
   yPct is the TOP of the box (converted to baseline on PDF export).
   These coordinates are tuned to the Tempsens IPO PDF (595x842 pt).
------------------------------------------------------------ */
const DEFAULT_FIELDS = {
  name:         { page: 0, xPct: 0.475, yPct: 0.104, wPct: 0.470, hPct: 0.011 },
  address:      { page: 0, xPct: 0.475, yPct: 0.133, wPct: 0.470, hPct: 0.020 },
  email:        { page: 0, xPct: 0.475, yPct: 0.163, wPct: 0.470, hPct: 0.011 },
  phone:        { page: 0, xPct: 0.475, yPct: 0.184, wPct: 0.470, hPct: 0.011 },
  pan:          { page: 0, xPct: 0.475, yPct: 0.211, wPct: 0.470, hPct: 0.011 },
  dpid:         { page: 0, xPct: 0.015, yPct: 0.291, wPct: 0.970, hPct: 0.011 },
  opt1_shares:  { page: 0, xPct: 0.220, yPct: 0.353, wPct: 0.080, hPct: 0.013 },
  opt1_price:   { page: 0, xPct: 0.590, yPct: 0.353, wPct: 0.080, hPct: 0.013 },
  amount_fig:   { page: 0, xPct: 0.015, yPct: 0.428, wPct: 0.220, hPct: 0.013 },
  amount_words: { page: 0, xPct: 0.275, yPct: 0.428, wPct: 0.710, hPct: 0.013 },
  asba_ac:      { page: 0, xPct: 0.085, yPct: 0.452, wPct: 0.900, hPct: 0.013 },
  bank_name:    { page: 0, xPct: 0.085, yPct: 0.472, wPct: 0.900, hPct: 0.013 },
  holder_name:  { page: 0, xPct: 0.085, yPct: 0.494, wPct: 0.400, hPct: 0.011 },
};

/* ---------- State ---------- */
let pdfBytes = null;
let pdfDoc = null;
let scale = 1.3;
let overlays = {};       // field id -> input element
let customOverlays = [];
let currentFileName = "form.pdf";

/* ---------- Load saved positions from localStorage ---------- */
function loadSavedCoords() {
  try {
    const saved = JSON.parse(localStorage.getItem("pdfFieldCoords") || "null");
    if (saved) {
      Object.keys(saved).forEach((k) => {
        if (DEFAULT_FIELDS[k]) Object.assign(DEFAULT_FIELDS[k], saved[k]);
      });
    }
  } catch (e) { console.warn("Coord load failed", e); }
}

function saveCoords() {
  const snapshot = {};
  Object.keys(DEFAULT_FIELDS).forEach((k) => {
    const f = DEFAULT_FIELDS[k];
    snapshot[k] = { xPct: f.xPct, yPct: f.yPct, wPct: f.wPct, hPct: f.hPct };
  });
  localStorage.setItem("pdfFieldCoords", JSON.stringify(snapshot));
}

loadSavedCoords();

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

  document.getElementById("uploadScreen").style.display = "none";
  document.getElementById("editorScreen").style.display = "flex";
  document.getElementById("fileName").textContent = file.name;

  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;

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
  document.getElementById("status").textContent =
    `✅ ${pdfDoc.numPages} page(s) loaded — Alt+drag to reposition any field`;
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
   ATTACH OVERLAYS
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

    const sidebar = document.getElementById(id);
    if (sidebar) {
      input.addEventListener("input", () => {
        sidebar.value = input.value;
        // grow height if text is long
        autoGrowHeight(input, cfg);
      });
      sidebar.addEventListener("input", () => (input.value = sidebar.value));
    }

    // Save exact position for PDF generation
    input.dataset.xPct = cfg.xPct;
    input.dataset.yPct = cfg.yPct;
    input.dataset.wPct = cfg.wPct;
    input.dataset.hPct = cfg.hPct;

    makeOverlayDraggable(input, wrap);

    wrap.appendChild(input);
    overlays[id] = input;
  });
}

function autoGrowHeight(el, cfg) {
  // Optionally allow multi-line growth — for now keep fixed
}

/* ---------- Alt+drag to move any field ---------- */
function makeOverlayDraggable(el, wrap) {
  let drag = false, resize = false;
  let startX, startY, startLeft, startTop, startW, startH;

  el.addEventListener("mousedown", (e) => {
    // Alt+drag → move
    if (e.altKey && !e.shiftKey) {
      drag = true;
      startX = e.clientX; startY = e.clientY;
      startLeft = el.offsetLeft; startTop = el.offsetTop;
      el.style.cursor = "move";
      e.preventDefault();
    }
    // Alt+Shift+drag → resize
    else if (e.altKey && e.shiftKey) {
      resize = true;
      startX = e.clientX; startY = e.clientY;
      startW = el.offsetWidth; startH = el.offsetHeight;
      el.style.cursor = "nwse-resize";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (drag) {
      el.style.left = (startLeft + e.clientX - startX) + "px";
      el.style.top  = (startTop  + e.clientY - startY) + "px";
    } else if (resize) {
      el.style.width  = Math.max(20, startW + e.clientX - startX) + "px";
      el.style.height = Math.max(12, startH + e.clientY - startY) + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    if (!drag && !resize) return;
    el.style.cursor = "";
    drag = false;
    resize = false;

    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);

    const xPct = el.offsetLeft / wrapW;
    const yPct = el.offsetTop  / wrapH;
    const wPct = el.offsetWidth / wrapW;
    const hPct = el.offsetHeight / wrapH;

    el.dataset.xPct = xPct.toFixed(4);
    el.dataset.yPct = yPct.toFixed(4);
    el.dataset.wPct = wPct.toFixed(4);
    el.dataset.hPct = hPct.toFixed(4);

    // Persist in DEFAULT_FIELDS so it survives re-render
    const id = el.dataset.fieldId;
    if (id && DEFAULT_FIELDS[id]) {
      DEFAULT_FIELDS[id].xPct = parseFloat(xPct.toFixed(4));
      DEFAULT_FIELDS[id].yPct = parseFloat(yPct.toFixed(4));
      DEFAULT_FIELDS[id].wPct = parseFloat(wPct.toFixed(4));
      DEFAULT_FIELDS[id].hPct = parseFloat(hPct.toFixed(4));
      saveCoords();
      document.getElementById("status").textContent = `📍 ${id} repositioned & saved`;
    }
  });
}

/* ============================================================
   CUSTOM DRAGGABLE TEXT BOX
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

  makeCustomDraggable(box, wrap);

  wrap.appendChild(box);
  customOverlays.push({ el: box, page: pageIdx });
  document.getElementById("customText").value = "";
});

function makeCustomDraggable(box, wrap) {
  let dragging = false, sx, sy, sl, st;
  box.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("delete-btn")) return;
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

    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);
    box.dataset.xPct = (box.offsetLeft / wrapW).toFixed(4);
    box.dataset.yPct = (box.offsetTop  / wrapH).toFixed(4);
  });
}

/* ============================================================
   APPLY (Draw text into PDF with pdf-lib)
============================================================ */
document.getElementById("fillBtn").addEventListener("click", async () => {
  if (!pdfBytes) return;

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // ---------- Precise draw function ----------
  function drawOnPage(pageIdx, xPct, yTopPct, wPct, hPct, text) {
    const page = pdf.getPage(pageIdx);
    const { width: pageW, height: pageH } = page.getSize();

    const boxX = xPct * pageW;
    const boxTop = yTopPct * pageH;           // top edge in PDF coords (from top)
    const boxW = wPct * pageW;
    const boxH = hPct * pageH;

    // Baseline: place text so it fits nicely inside box.
    // Use ~78% of box height as baseline offset from top.
    const baselineY = pageH - boxTop - boxH * 0.78;

    // Font size: start with hPct * pageH * 0.85, shrink if too wide
    let fontSize = Math.min(boxH * 0.85, 11);
    if (fontSize < 6) fontSize = 6;

    let textWidth = font.widthOfTextAtSize(text, fontSize);
    while (textWidth > boxW - 4 && fontSize > 5) {
      fontSize -= 0.25;
      textWidth = font.widthOfTextAtSize(text, fontSize);
    }

    page.drawText(text, {
      x: boxX + 2,
      y: baselineY,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  // 1) Sidebar-driven fields
  for (const [id, input] of Object.entries(overlays)) {
    const text = (input.value || "").trim();
    if (!text) continue;

    const pageIdx = parseInt(input.dataset.page, 10);
    const xPct = parseFloat(input.dataset.xPct);
    const yPct = parseFloat(input.dataset.yPct);
    const wPct = parseFloat(input.dataset.wPct);
    const hPct = parseFloat(input.dataset.hPct);

    drawOnPage(pageIdx, xPct, yPct, wPct, hPct, text);
  }

  // 2) Custom draggable text
  for (const { el, page: pageIdx } of customOverlays) {
    const text = (el.textContent || "").trim();
    if (!text) continue;

    const wrap = el.parentElement;
    const wrapW = parseFloat(wrap.style.width);
    const wrapH = parseFloat(wrap.style.height);

    const xPct = parseFloat(el.dataset.xPct) || (el.offsetLeft / wrapW);
    const yPct = parseFloat(el.dataset.yPct) || (el.offsetTop  / wrapH);

    // use box dimensions as height ratio
    const wPct = 0.5;
    const hPct = (el.offsetHeight / wrapH) || 0.02;

    drawOnPage(pageIdx, xPct, yPct, wPct, hPct, text);
  }

  const bytes = await pdf.save();
  window.__filledBlob = new Blob([bytes], { type: "application/pdf" });

  document.getElementById("saveBtn").disabled = false;
  document.getElementById("status").textContent = "✅ PDF updated — click Download";

  // Refresh preview
  pdfBytes = bytes.buffer.slice(0);
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  await renderAll();
  attachDefaultOverlays();
  customOverlays = [];
});

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
   RESET
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

  document.querySelectorAll(".sidebar-body input, .sidebar-body textarea").forEach(el => el.value = "");

  document.getElementById("editorScreen").style.display = "none";
  document.getElementById("uploadScreen").style.display = "flex";
  uploadInput.value = "";
});

/* Reset field positions button (add to sidebar separately if needed) */
function resetFieldPositions() {
  localStorage.removeItem("pdfFieldCoords");
  location.reload();
}

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
