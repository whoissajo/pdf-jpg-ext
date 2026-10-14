import * as pdfjsLib from "./vendor/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.mjs");

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let selectedFile = null;
let converting = false;

function setStatus(title, detail, percent) {
  $("progressPanel").hidden = false;
  $("statusTitle").textContent = title;
  $("statusDetail").textContent = detail || "";
  $("progressLabel").textContent = Math.max(0, Math.min(100, Math.round(percent || 0))) + "%";
  $("progressFill").style.width = Math.max(0, Math.min(100, percent || 0)) + "%";
}

function setError(message) {
  $("errorBox").hidden = !message;
  $("errorBox").textContent = message || "";
}

function baseName(value) {
  let name = String(value || "document");
  try {
    if (/^https?:\/\//i.test(name)) {
      const url = new URL(name);
      name = decodeURIComponent(url.pathname.split("/").pop() || "document");
    }
  } catch (_) {}
  name = name.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  name = name.replace(/^\.+|\.+$/g, "").slice(0, 100);
  return name || "document";
}

function extensionPattern(url) {
  const parsed = new URL(url);
  return parsed.origin + "/*";
}

async function readPdfBytes() {
  if (selectedFile) {
    return {
      data: new Uint8Array(await selectedFile.arrayBuffer()),
      name: baseName(selectedFile.name)
    };
  }

  const rawUrl = $("pdfUrl").value.trim();
  if (!rawUrl) throw new Error("Paste a PDF URL or choose a PDF file first.");

  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    throw new Error("That URL is not valid. Include the full address, beginning with https:// or http://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("For local PDFs, use “Choose a PDF from your device”. Remote URLs must use HTTP or HTTPS.");
  }

  const pattern = extensionPattern(url.href);
  const alreadyAllowed = await chrome.permissions.contains({ origins: [pattern] });
  if (!alreadyAllowed) {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      throw new Error("Website access was not granted. Choose the PDF file from your device instead.");
    }
  }

  setStatus("Downloading PDF", "Fetching the file directly from its website…", 2);
  let response;
  try {
    response = await fetch(url.href, { credentials: "include", redirect: "follow" });
  } catch (error) {
    throw new Error("Could not fetch this link. The website may block direct access, require a sign-in, or redirect to another domain. Open the PDF and try again, or choose a local file. Details: " + (error.message || "network error"));
  }
  if (!response.ok) {
    throw new Error("The PDF server returned HTTP " + response.status + ". Try opening the PDF first, or select a local copy.");
  }

  const buffer = await response.arrayBuffer();
  const header = new TextDecoder("latin1").decode(new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 1024))));
  if (!header.includes("%PDF-")) {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error("This link did not return a PDF (" + contentType + "). Paste a direct PDF link or choose the PDF file from your device.");
  }

  return { data: new Uint8Array(buffer), name: baseName(url.href) };
}

function downloadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    }).then((downloadId) => {
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        URL.revokeObjectURL(objectUrl);
        chrome.downloads.onChanged.removeListener(onChanged);
      };
      const onChanged = (delta) => {
        if (delta.id === downloadId && delta.state && delta.state.current !== "in_progress") {
          setTimeout(cleanup, 1500);
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
      setTimeout(cleanup, 120000);
      resolve(downloadId);
    }).catch((error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    });
  });
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not create a JPG image for this page."));
    }, "image/jpeg", quality);
  });
}

async function convertPdf() {
  if (converting) return;
  converting = true;
  $("convertButton").disabled = true;
  $("loadUrl").disabled = true;
  $("pdfFile").disabled = true;
  setError("");

  let pdf = null;
  const generated = [];
  try {
    const input = await readPdfBytes();
    setStatus("Opening PDF", "Reading page information…", 4);
    const loadingTask = pdfjsLib.getDocument({
      data: input.data,
      cMapUrl: chrome.runtime.getURL("vendor/cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL("vendor/standard_fonts/"),
      wasmUrl: chrome.runtime.getURL("vendor/wasm/"),
      isEvalSupported: false,
      useSystemFonts: true
    });
    pdf = await loadingTask.promise;
    const total = pdf.numPages;
    if (!total || total < 1) throw new Error("No pages were found in this PDF.");

    const mode = $("outputMode").value;
    const wantsZip = mode === "zip" || mode === "both";
    const wantsFiles = mode === "individual" || mode === "both";
    const zip = wantsZip ? new JSZip() : null;
    const quality = $("highQuality").checked ? 0.94 : 0.78;
    const stem = input.name;
    let outputCount = 0;

    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      setStatus("Converting page " + pageNumber + " of " + total,
        "Rendering page to a JPG image…", 5 + ((pageNumber - 1) / total) * 88);

      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxDimension = $("highQuality").checked ? 4200 : 3000;
      const scale = Math.min($("highQuality").checked ? 2 : 1.35,
        maxDimension / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not create a canvas to render the PDF page.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToJpeg(canvas, quality);
      const filename = stem + "-page-" + String(pageNumber).padStart(String(total).length, "0") + ".jpg";

      if (wantsZip) zip.file(filename, blob);
      if (wantsFiles) {
        await downloadBlob(blob, filename);
        outputCount += 1;
      }

      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();

      const percent = 5 + (pageNumber / total) * 88;
      setStatus("Converting page " + pageNumber + " of " + total,
        wantsFiles ? "Downloaded " + outputCount + " JPG file(s) so far." : "Prepared " + pageNumber + " JPG page(s).",
        percent);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (wantsZip) {
      setStatus("Preparing ZIP", "Packaging all " + total + " JPG page(s)…", 95);
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 4 }
      }, (metadata) => {
        setStatus("Preparing ZIP", "Compressing JPG images…", 95 + metadata.percent * 0.04);
      });
      await downloadBlob(zipBlob, stem + "-jpg-pages.zip");
    }

    setStatus("Conversion complete", "Exported " + total + " page(s). Check your browser's Downloads.", 100);
  } catch (error) {
    setError((error && error.message) ? error.message : "Conversion failed. Try another PDF.");
    setStatus("Conversion stopped", "No further pages will be processed.", 0);
  } finally {
    if (pdf) {
      try { await pdf.destroy(); } catch (_) {}
    }
    converting = false;
    $("convertButton").disabled = false;
    $("loadUrl").disabled = false;
    $("pdfFile").disabled = false;
  }
}

function chooseFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    selectedFile = null;
    $("fileLabel").textContent = "Please choose a PDF file";
    setError("That file does not appear to be a PDF.");
    return;
  }
  selectedFile = file;
  $("fileLabel").textContent = file.name + " · " + Math.max(1, Math.round(file.size / 1024)) + " KB";
  $("pdfUrl").value = "";
  setError("");
  $("statusDetail").textContent = "Local file selected.";
}

function init() {
  const sourceUrl = params.get("url");
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) $("pdfUrl").value = sourceUrl;

  $("pdfFile").addEventListener("change", (event) => chooseFile(event.target.files?.[0]));
  $("loadUrl").addEventListener("click", () => {
    selectedFile = null;
    const value = $("pdfUrl").value.trim();
    if (!value) setError("Paste the full PDF address first.");
    else {
      $("fileLabel").textContent = "No local file selected";
      setError("");
      setStatus("PDF link ready", "Click “Convert & download JPGs” to start.", 0);
    }
  });
  $("convertButton").addEventListener("click", convertPdf);

  const zone = $("dropZone");
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragging");
    chooseFile(event.dataTransfer?.files?.[0]);
  });
}

document.addEventListener("DOMContentLoaded", init);
