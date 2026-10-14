(() => {
  if (window.__pdfJpgPrintHookInstalled) return;
  window.__pdfJpgPrintHookInstalled = true;

  const nativePrint = window.print ? window.print.bind(window) : null;
  if (!nativePrint) return;

  try {
    Object.defineProperty(window, "print", {
      configurable: true,
      writable: true,
      value: function pdfJpgPrintChoice() {
        window.dispatchEvent(new Event("__PDF_JPG_PRINT_REQUEST__"));
      }
    });

    window.addEventListener("__PDF_JPG_CONTINUE_PRINT__", () => {
      nativePrint();
    });

    window.addEventListener("__PDF_JPG_RESTORE_PRINT__", () => {
      try {
        Object.defineProperty(window, "print", {
          configurable: true,
          writable: true,
          value: nativePrint
        });
      } catch (_) {}
    });
  } catch (_) {
    window.__pdfJpgPrintHookInstalled = false;
  }
})();
