/**
 * Printing, and saving as PDF, are the same act here: hand a document to the
 * browser's print dialog and let the operator choose a printer or "Save as PDF".
 *
 * Both go through a hidden iframe. The alternative every screen used to reach
 * for -- overwrite `document.body`, call print, put the old HTML back, then
 * `window.location.reload()` -- worked but cost more than it looked:
 *
 *   - it tore down React, so the reload afterwards was not a tidy-up but a
 *     necessity, and anything unsaved went with it (a POS cart mid-sale, the
 *     sticker count just typed, an open drawer);
 *   - the restored HTML was a dead string, so nothing on screen responded
 *     until the reload finished;
 *   - and the app's own print stylesheet hides everything under <body> that is
 *     not #print-wrapper, so a wrapper missing that id printed a blank page --
 *     which is exactly what happened to the barcode labels.
 *
 * An iframe carries its own document and its own stylesheet. The page behind it
 * is untouched, and what gets printed does not depend on the app's CSS.
 */

// html2pdf.js used to do this and hung against this React tree, leaving a blank
// file. Native print-to-PDF is both simpler and more reliable.

const SHEET_STYLES = `
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background: #fff; color: #000; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; }
  th { background-color: #f4f6f8; font-weight: bold; color: #333; text-transform: uppercase; font-size: 11px; }
  tr:nth-child(even) { background-color: #fafafa; }
  h2, h3, p { margin: 0 0 8px 0; text-align: center; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  /* Keep a row or a receipt from being split across two sheets. */
  tr, .no-break { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 15mm; }
`;

/**
 * Open the print dialog for a block of HTML, without disturbing the page.
 * Returns a promise that settles once the iframe has been cleaned up.
 */
export const printHtml = (html, title = 'Print') => new Promise((resolve) => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${SHEET_STYLES}</style></head><body>${html}</body></html>`);
  doc.close();

  // Let the document lay out before the dialog measures the page.
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      /* the dialog was blocked or dismissed; nothing to recover */
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      resolve();
    }, 1000);
  }, 250);
});

/** Print whatever is inside the element with this id. */
export const printElement = (elementId, title = 'Print') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    alert('Could not find the content to print.');
    return Promise.resolve();
  }
  return printHtml(element.innerHTML, title);
};

/**
 * Same document, but named for saving. The dialog's "Save as PDF" destination
 * uses the title as the suggested filename.
 */
export const downloadAsPDF = (elementId, filename) => printElement(elementId, filename);

export default printElement;
