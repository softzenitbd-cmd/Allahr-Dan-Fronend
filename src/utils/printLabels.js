/**
 * Printing a sheet of barcode labels.
 *
 * This used to swap the whole page into `document.body` and call print. It came
 * out blank, because the app's print stylesheet hides everything under <body>
 * that is not #print-wrapper, #root or #pdf-print-wrapper -- and the wrapper the
 * barcode button built had no id at all. It also destroyed the React tree and
 * reloaded the page afterwards, which closed the drawer and lost the sticker
 * count the operator had just set.
 *
 * A hidden iframe avoids both. It carries its own stylesheet, so the sheet
 * lays out the same on any machine regardless of what the app's CSS is doing,
 * and the page behind it is untouched.
 */

const LABELS_PER_ROW = 3;

/**
 * Send `count` copies of one product's label to the printer.
 *
 * `barcodeSvg` is the SVG react-barcode already drew on screen; reusing it
 * means the printed bars are the same ones that were checked visually, rather
 * than a second rendering that might differ.
 */
export const printBarcodeLabels = (product, count, sourceElementId = 'printable-barcode') => {
  if (!product || !count) return;

  const source = document.getElementById(sourceElementId);
  const svg = source?.querySelector('svg');
  if (!svg) {
    // Nothing drawn yet: better to say so than to send a blank sheet.
    // eslint-disable-next-line no-alert
    alert('The barcode has not finished drawing yet. Wait a moment and try again.');
    return;
  }

  const barcode = svg.outerHTML;
  const price = `৳${product.price}`;
  const variant = product.variant ? `<div class="variant">Var: ${product.variant}</div>` : '';

  const label = `
    <div class="label">
      ${barcode}
      <div class="name">${product.name}</div>
      ${variant}
      <div class="price">${price}</div>
    </div>`;

  const html = `<div class="sheet">${label.repeat(count)}</div>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Barcode Labels - ${product.name}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #000; background: #fff; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(${LABELS_PER_ROW}, 1fr);
        gap: 4mm;
        padding: 5mm;
      }
      .label {
        border: 1px dashed #bbb;
        padding: 3mm 2mm;
        text-align: center;
        /* A label split across two pages is wasted stock. */
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .label svg { max-width: 100%; height: auto; }
      .name { font-weight: 700; font-size: 10pt; margin-top: 1mm; }
      .variant { font-size: 8pt; color: #333; }
      .price { font-weight: 700; font-size: 11pt; }
      @page { size: A4 portrait; margin: 5mm; }
    </style></head><body>${html}</body></html>`);
  doc.close();

  // Give the document a moment to lay the SVGs out before the print dialog
  // measures the page, then clean up once the dialog has been dealt with.
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      /* the dialog was blocked or dismissed */
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 1000);
  }, 250);
};

export default printBarcodeLabels;
