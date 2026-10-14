import { cp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "dist");
const modules = path.join(root, "node_modules");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "vendor"), { recursive: true });

const rootFiles = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "converter.html",
  "converter.css",
  "converter.js",
  "content.js",
  "print-hook.js",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md"
];

for (const file of rootFiles) {
  await copyFile(path.join(root, file), path.join(out, file));
}

const vendorFiles = [
  ["pdfjs-dist/build/pdf.mjs", "vendor/pdf.mjs"],
  ["pdfjs-dist/build/pdf.worker.mjs", "vendor/pdf.worker.mjs"],
  ["html2canvas/dist/html2canvas.min.js", "vendor/html2canvas.min.js"],
  ["jszip/dist/jszip.min.js", "vendor/jszip.min.js"]
];

for (const [source, destination] of vendorFiles) {
  await copyFile(path.join(modules, source), path.join(out, destination));
}

for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const source = path.join(modules, "pdfjs-dist", directory);
  try {
    await cp(source, path.join(out, "vendor", directory), { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const notices = [
  "Third-party components bundled in this extension",
  "",
  "- PDF.js (pdfjs-dist): Apache-2.0 — https://github.com/mozilla/pdf.js",
  "- html2canvas: MIT — https://github.com/niklasvh/html2canvas",
  "- JSZip: MIT or GPL-3.0-or-later — https://github.com/Stuk/jszip",
  "",
  "Their upstream license notices are included in their respective npm packages."
].join("\n");
await writeFile(path.join(out, "THIRD_PARTY_NOTICES.md"), notices + "\n", "utf8");

console.log("Built extension into dist/");
