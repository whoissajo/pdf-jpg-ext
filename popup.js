const $ = (id) => document.getElementById(id);

let activeTab = null;

function setStatus(message, isError = false) {
  const node = $("status");
  node.textContent = message;
  node.style.color = isError ? "#ffb4b4" : "#ffd58b";
}

function getSourceUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return rawUrl;

    if (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:") {
      for (const key of ["src", "file", "url"]) {
        const candidate = parsed.searchParams.get(key);
        if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
      }
    }
  } catch (_) {}
  return "";
}

function sitePermissionPattern(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin + "/*";
  } catch (_) {
    return null;
  }
}

async function enableSiteScripts(pattern, suffix) {
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70);
  const isolatedId = "pdf-jpg-isolated-" + safeSuffix;
  const mainId = "pdf-jpg-main-" + safeSuffix;
  const old = await chrome.scripting.getRegisteredContentScripts({
    ids: [isolatedId, mainId]
  });
  if (old.length) {
    await chrome.scripting.unregisterContentScripts({ ids: old.map((item) => item.id) });
  }

  await chrome.scripting.registerContentScripts([
    {
      id: isolatedId,
      matches: [pattern],
      js: ["vendor/html2canvas.min.js", "content.js"],
      runAt: "document_start",
      world: "ISOLATED",
      persistAcrossSessions: true
    },
    {
      id: mainId,
      matches: [pattern],
      js: ["print-hook.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true
    }
  ]);
}

async function injectCurrentTab() {
  if (!activeTab?.id) throw new Error("No active tab was found.");
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ["vendor/html2canvas.min.js", "content.js"],
    world: "ISOLATED"
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ["print-hook.js"],
    world: "MAIN"
  });
}

async function openConverter() {
  const url = getSourceUrl(activeTab?.url) || activeTab?.url || "";
  const converterUrl = chrome.runtime.getURL("converter.html") +
    (url ? "?url=" + encodeURIComponent(url) : "");
  await chrome.tabs.create({ url: converterUrl });
  window.close();
}

async function saveCurrentPage() {
  if (!activeTab?.id || !sitePermissionPattern(activeTab.url)) {
    setStatus("This browser page cannot be captured. Open a normal HTTP or HTTPS webpage.", true);
    return;
  }

  $("savePage").disabled = true;
  try {
    await injectCurrentTab();
    const reply = await chrome.tabs.sendMessage(activeTab.id, { type: "PDF_JPG_EXPORT_PAGE" });
    if (!reply?.ok) throw new Error(reply?.error || "Could not start the page export.");
    setStatus("Started. Follow the progress message on the webpage.");
    window.close();
  } catch (error) {
    setStatus(error.message || "Could not capture this page.", true);
  } finally {
    $("savePage").disabled = false;
  }
}

async function enableCurrentSite() {
  const pattern = sitePermissionPattern(activeTab?.url);
  if (!pattern) {
    setStatus("Open a normal website first. Browser-internal pages cannot be modified.", true);
    return;
  }

  $("enableSite").disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      setStatus("Website access was not granted. You can still convert PDF files manually.", true);
      return;
    }
    const origin = new URL(activeTab.url).origin;
    await enableSiteScripts(pattern, origin);
    await injectCurrentTab();
    setStatus("Enabled on this website. Reload it once if the print choice does not appear.");
  } catch (error) {
    setStatus(error.message || "Could not enable the print choice.", true);
  } finally {
    $("enableSite").disabled = false;
  }
}

async function enableEverywhere() {
  $("enableAll").disabled = true;
  try {
    const granted = await chrome.permissions.request({
      origins: ["http://*/*", "https://*/*"]
    });
    if (!granted) {
      setStatus("All-sites access was not granted. Enable the feature on individual sites instead.", true);
      return;
    }

    const old = await chrome.scripting.getRegisteredContentScripts({
      ids: ["pdf-jpg-all-isolated", "pdf-jpg-all-main"]
    });
    if (old.length) {
      await chrome.scripting.unregisterContentScripts({ ids: old.map((item) => item.id) });
    }
    await chrome.scripting.registerContentScripts([
      {
        id: "pdf-jpg-all-isolated",
        matches: ["http://*/*", "https://*/*"],
        js: ["vendor/html2canvas.min.js", "content.js"],
        runAt: "document_start",
        world: "ISOLATED",
        persistAcrossSessions: true
      },
      {
        id: "pdf-jpg-all-main",
        matches: ["http://*/*", "https://*/*"],
        js: ["print-hook.js"],
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true
      }
    ]);
    await injectCurrentTab();
    setStatus("Enabled for HTTP and HTTPS websites. Reload already-open pages to activate it.");
  } catch (error) {
    setStatus(error.message || "Could not enable all-sites access.", true);
  } finally {
    $("enableAll").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("convertPdf").addEventListener("click", () => {
    openConverter().catch((error) => setStatus(error.message || "Could not open converter.", true));
  });
  $("savePage").addEventListener("click", saveCurrentPage);
  $("enableSite").addEventListener("click", enableCurrentSite);
  $("enableAll").addEventListener("click", enableEverywhere);

  const pattern = sitePermissionPattern(activeTab?.url);
  if (pattern) {
    const granted = await chrome.permissions.contains({ origins: [pattern] });
    if (!granted) {
      $("enableSite").textContent = "Enable on this website";
    } else {
      $("enableSite").textContent = "Refresh print support on this site";
    }
  }
});
