# PDF to JPG — Print & Convert

A Manifest V3 Chrome/Chromium extension for a simple idea: **when a website tries to print, offer “Save page as JPG” alongside normal printing**. It also converts multi-page PDF files into individual JPG images, with an optional ZIP bundle.

All conversion happens locally in the browser. This project does not upload your PDF or webpage to a server.

## Download and install (easiest way)

A ready-to-load extension ZIP is published automatically whenever a change lands on the main branch.

1. Open the [latest build on GitHub Releases](https://github.com/whoissajo/pdf-jpg-ext/releases/tag/latest).
2. Download **pdf-jpg-extension.zip** and extract it to a folder.
3. Open **chrome://extensions** in Chrome or **edge://extensions** in Edge.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the extracted folder containing **manifest.json**.
6. Pin **PDF to JPG** from the browser's Extensions menu.

The extension is not installed from the Chrome Web Store; it is loaded locally in Developer mode. Keep the extracted folder in place after loading it.

## Using the extension

### Convert an opened PDF to JPG

1. Open a PDF in your browser, or copy its direct PDF URL.
2. Click the PDF to JPG extension icon.
3. Choose **Convert current tab / PDF**.
4. In the workspace, use the PDF URL or choose a PDF file from your device.
5. Choose **Separate JPG files**, **One ZIP**, or both, then click **Convert & download JPGs**.

Each page is rendered as a separate JPG. If you choose ZIP, the ZIP contains one JPG for every page. Very large documents can use a lot of memory.

If the PDF is behind a sign-in, uses a redirect to another domain, or the server blocks direct requests, choose the file from your device instead. The extension requests access to a website only when that access is needed for a remote PDF link.

### Add a JPG choice to a website's print action

1. Open the website where you want the feature.
2. Click the extension icon and select **Enable on this website**, or choose **Enable on all websites** once.
3. Accept Chrome's website-access prompt.
4. Reload the website if it was already open.
5. Click the website's print button.

When the website calls **window.print()**, a dialog offers **Save page as JPG**, **Continue to print**, or **Not now**. The normal print dialog remains available.

You can also click **Save JPG** in the extension popup to capture a webpage immediately without opening the print dialog.

## Browser limitation (important)

Extensions **cannot add a new file type to Chrome's built-in Save as PDF / print dialog**, nor inject UI into Chrome's internal PDF viewer. This extension therefore uses its own JPG converter for PDF tabs and intercepts website print calls on ordinary webpages. A site that uses a custom print-preview flow rather than **window.print()** may not trigger the print choice.

Webpage capture rasterizes the webpage's screen-rendered layout; it is not a full emulation of CSS print styles. Some cross-origin images, protected content, very long pages, and browser-internal pages may not be capturable. Use the PDF converter for documents that are already PDFs.

## Privacy and permissions

- PDF page rendering and JPG encoding run inside your browser.
- No analytics, tracking, or remote conversion service is included.
- The extension asks for optional HTTP/HTTPS website access when you enable print interception or fetch a PDF URL.
- The activeTab, scripting, and downloads permissions are used to capture the page and save generated files.
- pdfjs-dist, html2canvas, and jszip are bundled into the built extension. Their licenses are listed in THIRD_PARTY_NOTICES.md.

## Build from source

Requirements: Node.js 20 or newer and npm.

1. Download or clone this repository.
2. Run npm install.
3. Run npm run build.
4. Open **chrome://extensions**, enable Developer mode, click **Load unpacked**, and select the generated **dist** folder.

The repository's GitHub Actions workflow builds the extension and publishes a ready-to-load ZIP on pushes to **main**. You do not need to run a build command when using that ZIP.

## Troubleshooting

- **The print choice does not appear:** grant access to the website, then reload the tab. The feature only intercepts calls to window.print().
- **A remote PDF cannot be fetched:** try opening it directly, grant the requested site permission, or select a local copy of the PDF.
- **A PDF viewer cannot be edited:** this is a browser security boundary. Use the extension icon to open the JPG converter.
- **Downloads are blocked:** allow multiple downloads for the extension if Chrome asks, and check your Downloads folder.
- **Page JPG misses images or layout:** cross-origin assets or site-specific rendering can restrict browser capture; saving the document as PDF first and converting that PDF may be more accurate.

## License

This project is released under the MIT License. Third-party components keep their own licenses.
