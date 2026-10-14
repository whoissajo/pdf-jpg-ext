(() => {
  if (globalThis.__pdfJpgContentInstalled) return;
  globalThis.__pdfJpgContentInstalled = true;

  let dialogHost = null;
  let toastHost = null;
  let isExporting = false;

  function cleanFilename(value) {
    return String(value || "webpage")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 100) || "webpage";
  }

  function removeHost(host) {
    if (host && host.isConnected) host.remove();
  }

  function createHost(id) {
    const host = document.createElement("div");
    host.id = id;
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("box-sizing", "border-box", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("pointer-events", "auto", "important");
    host.style.setProperty("font-family", "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", "important");
    (document.documentElement || document.body).appendChild(host);
    return host;
  }

  function showToast(message, isError = false) {
    removeHost(toastHost);
    toastHost = createHost("pdf-jpg-extension-toast");
    const shadow = toastHost.attachShadow({ mode: "open" });
    const card = document.createElement("div");
    card.innerHTML = '<style>' +
      ':host{all:initial} .toast{position:fixed;right:22px;bottom:22px;max-width:min(420px,calc(100vw - 44px));' +
      'padding:13px 16px;border:1px solid rgba(255,255,255,.14);border-radius:13px;' +
      'background:#101827;color:#f3f6fc;box-shadow:0 14px 50px rgba(0,0,0,.3);font:13px/1.45 system-ui,sans-serif;' +
      'display:flex;gap:10px;align-items:flex-start}.dot{flex:0 0 8px;height:8px;border-radius:50%;margin-top:5px;background:' +
      (isError ? "#ff8c8c" : "#f5b544") + '}.msg{overflow-wrap:anywhere}</style>' +
      '<div class="toast" role="status" aria-live="polite"><span class="dot"></span><span class="msg"></span></div>';
    card.querySelector(".msg").textContent = message;
    shadow.appendChild(card);
    return toastHost;
  }

  function showPrintChoice() {
    if (dialogHost && dialogHost.isConnected) return;
    removeHost(toastHost);
    dialogHost = createHost("pdf-jpg-extension-dialog");
    const shadow = dialogHost.attachShadow({ mode: "open" });
    shadow.innerHTML = '<style>' +
      ':host{all:initial} *{box-sizing:border-box} .backdrop{position:fixed;inset:0;display:grid;place-items:center;' +
      'padding:20px;background:rgba(4,9,19,.68);backdrop-filter:blur(7px);font-family:Inter,system-ui,-apple-system,sans-serif}' +
      '.card{width:min(440px,100%);padding:24px;border:1px solid rgba(195,211,238,.2);border-radius:21px;' +
      'background:linear-gradient(145deg,#1a2942,#0d1526);color:#f3f6fc;box-shadow:0 28px 90px rgba(0,0,0,.42)}' +
      '.eyebrow{font-size:10px;letter-spacing:1.4px;color:#f5b544;font-weight:800;margin-bottom:9px}' +
      'h2{font-size:22px;line-height:1.2;letter-spacing:-.5px;margin:0 0 9px;font-weight:750}' +
      'p{font-size:12px;line-height:1.6;color:#adbbd0;margin:0 0 19px}' +
      'button{width:100%;min-height:42px;border-radius:11px;padding:10px 13px;cursor:pointer;font:700 12px system-ui,sans-serif;margin-top:8px}' +
      '.primary{border:0;background:#f5b544;color:#281b08}.secondary{border:1px solid rgba(195,211,238,.17);background:#21304a;color:#f3f6fc}' +
      '.quiet{border:0;background:transparent;color:#9eabc2;min-height:32px;font-weight:600}' +
      '.privacy{font-size:10px;text-align:center;margin-top:14px;color:#89d8be}' +
      '</style><div class="backdrop"><section class="card" role="dialog" aria-modal="true" aria-labelledby="pdf-jpg-title">' +
      '<div class="eyebrow">PDF TO JPG</div><h2 id="pdf-jpg-title">How would you like to save this page?</h2>' +
      '<p>This website is opening its print dialog. You can export the current webpage as a JPG image, or continue to the normal printer / Save as PDF dialog.</p>' +
      '<button class="primary" id="save">Save page as JPG</button>' +
      '<button class="secondary" id="print">Continue to print</button>' +
      '<button class="quiet" id="cancel">Not now</button>' +
      '<div class="privacy">✓ Page capture stays in this browser</div></section></div>';

    shadow.getElementById("save").addEventListener("click", async () => {
      removeHost(dialogHost);
      dialogHost = null;
      await exportPageAsJpg();
    });
    shadow.getElementById("print").addEventListener("click", () => {
      removeHost(dialogHost);
      dialogHost = null;
      window.dispatchEvent(new Event("__PDF_JPG_CONTINUE_PRINT__"));
    });
    shadow.getElementById("cancel").addEventListener("click", () => {
      removeHost(dialogHost);
      dialogHost = null;
    });
  }

  async function exportPageAsJpg() {
    if (isExporting) {
      showToast("A JPG export is already running. Please wait for it to finish.");
      return;
    }
    if (typeof globalThis.html2canvas !== "function") {
      showToast("Page capture is not ready. Reopen the extension and choose Save JPG again.", true);
      return;
    }

    isExporting = true;
    const host = showToast("Preparing the webpage image…");
    host.style.setProperty("display", "none", "important");

    let canvas = null;
    try {
      const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth);
      const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight);
      if (width < 1 || height < 1) throw new Error("This webpage has no capturable content.");
      const scale = Math.min(2, 14000 / Math.max(width, height));
      const quality = 0.92;

      canvas = await globalThis.html2canvas(document.documentElement, {
        backgroundColor: "#ffffff",
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 12000,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (element) => element && (
          element.id === "pdf-jpg-extension-dialog" ||
          element.id === "pdf-jpg-extension-toast"
        ),
        onclone: (clonedDocument) => {
          const style = clonedDocument.createElement("style");
          style.textContent = "*{animation:none!important;transition:none!important;caret-color:transparent!important}";
          clonedDocument.head.appendChild(style);
        }
      });

      host.style.removeProperty("display");
      host.style.setProperty("display", "none", "important");
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const filename = cleanFilename(document.title || location.hostname) + ".jpg";
      const reply = await chrome.runtime.sendMessage({
        type: "PDF_JPG_DOWNLOAD_DATA_URL",
        dataUrl,
        filename
      });
      if (!reply?.ok) throw new Error(reply?.error || "The image could not be sent to Downloads.");
      host.style.removeProperty("display");
      showToast("JPG export started. Find the image in your Downloads folder.");
    } catch (error) {
      host.style.removeProperty("display");
      showToast("Could not export this page: " + (error?.message || "unknown error") +
        ". Some websites block external images, or the page may be too large.", true);
    } finally {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      isExporting = false;
    }
  }

  window.addEventListener("__PDF_JPG_PRINT_REQUEST__", showPrintChoice, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PDF_JPG_EXPORT_PAGE") {
      exportPageAsJpg();
      sendResponse({ ok: true });
    }
  });
})();
