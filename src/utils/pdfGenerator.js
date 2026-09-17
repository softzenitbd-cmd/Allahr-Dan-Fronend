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
  th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; color: #000; }
  th { background-color: #f4f6f8; font-weight: bold; color: #333; text-transform: uppercase; font-size: 11px; }
  tr:nth-child(even) { background-color: #fafafa; }
  h2, h3, p { margin: 0 0 8px 0; text-align: center; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .print-report-header, .print-only-header { display: block !important; }
  .print-only-status { display: inline-block !important; }
  button, .btn-icon, .no-print, .hide-on-print { display: none !important; }
  /* Statement Photo-matching styles */
  .statement-header-banner { background: #eaf8f2 !important; border: 1px solid #d0ebe1 !important; border-radius: 12px !important; padding: 16px 20px !important; margin-bottom: 16px !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
  .statement-title-name { font-size: 24px !important; font-weight: 800 !important; color: #134e4a !important; margin: 0 !important; letter-spacing: -0.5px !important; }
  .statement-subtitle { font-size: 13px !important; color: #3f6e65 !important; margin: 4px 0 0 0 !important; font-weight: 600 !important; }
  .statement-period-label { font-size: 12px !important; font-weight: 700 !important; color: #0f766e !important; text-align: right !important; margin: 0 0 4px 0 !important; }
  .statement-period-badge { background: #ffffff !important; border: 1px solid #c7e6d6 !important; border-radius: 8px !important; padding: 6px 14px !important; font-size: 13px !important; font-weight: 700 !important; color: #134e4a !important; display: inline-block !important; }
  .statement-table-card { background: #ffffff !important; border: 1px solid #e5e7eb !important; border-radius: 10px !important; overflow: hidden !important; }
  .statement-table { width: 100% !important; border-collapse: collapse !important; font-size: 11px !important; margin-top: 0 !important; }
  .statement-table th { background: #fafafa !important; color: #4b5563 !important; font-weight: 700 !important; text-transform: uppercase !important; font-size: 10px !important; letter-spacing: 0.04em !important; padding: 10px 8px !important; border-bottom: 1px solid #e5e7eb !important; border-top: none !important; border-left: none !important; border-right: none !important; }
  .statement-table td { padding: 9px 8px !important; border-bottom: 1px solid #f3f4f6 !important; border-top: none !important; border-left: none !important; border-right: none !important; color: #111827 !important; vertical-align: middle !important; }
  .statement-table tr:nth-child(even) { background-color: #fafafa !important; }
  .statement-badge-working { background: #ffffff !important; border: 1px solid #cbd5e1 !important; color: #1e293b !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 10px !important; font-weight: 700 !important; display: inline-block !important; box-shadow: 0 1px 1px rgba(0,0,0,0.05) !important; }
  .statement-badge-absent { background: #fee2e2 !important; border: 1px solid #fecaca !important; color: #dc2626 !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 10px !important; font-weight: 700 !important; display: inline-block !important; }
  .statement-badge-halfday { background: #fef3c7 !important; border: 1px solid #fde68a !important; color: #d97706 !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 10px !important; font-weight: 700 !important; display: inline-block !important; }
  .statement-badge-late { background: #dbeafe !important; border: 1px solid #bfdbfe !important; color: #1d4ed8 !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 10px !important; font-weight: 700 !important; display: inline-block !important; }
  .statement-badge-leave { background: #f3f4f6 !important; border: 1px solid #e5e7eb !important; color: #4b5563 !important; border-radius: 4px !important; padding: 2px 8px !important; font-size: 10px !important; font-weight: 700 !important; display: inline-block !important; }
  .statement-muted-cell { text-align: center !important; color: #9ca3af !important; }
  /* Keep a row or a receipt from being split across two sheets. */
  tr, .no-break { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm 10mm; }
`;

const THERMAL_STYLES = `
  @page {
    size: 80mm auto;
    margin: 0 !important;
  }
  @page :first {
    margin-top: 0 !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }
  @media print {
    @page {
      size: 80mm auto;
      margin: 0 !important;
    }
    @page :first {
      margin-top: 0 !important;
    }
    html {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    body {
      width: 100% !important;
      max-width: 78mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .thermal-wrapper {
      width: 100% !important;
      max-width: 78mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    .thermal-wrapper, .thermal-wrapper * {
      color: #000000 !important;
    }
    .thermal-receipt {
      margin: 0 auto !important;
      padding-top: 0 !important;
    }
  }
  * {
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    width: 100%;
    max-width: 78mm;
    margin: 0 auto;
    padding: 0 !important;
    background: #fff;
    color: #000;
    font-size: 11px;
    line-height: 1.35;
  }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 10.5px; }
  th, td { padding: 3px 2px; text-align: left; vertical-align: top; }
  th { font-weight: bold; color: #000; font-size: 10.5px; border-bottom: 1px dashed #000; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  tr, .no-break { break-inside: avoid; page-break-inside: avoid; }
`;

/**
 * Open the print dialog for a block of HTML, without disturbing the page.
 * Returns a promise that settles once the iframe has been cleaned up.
 */
export const printHtml = (html, title = 'Print', options = {}) => new Promise((resolve) => {
  const isThermal = Boolean(
    options.isThermal ||
    options.format === 'thermal' ||
    html.includes('thermal-receipt') ||
    html.includes('data-format="thermal"')
  );
  const styles = isThermal ? THERMAL_STYLES : SHEET_STYLES;
  const content = isThermal
    ? `<div class="thermal-wrapper" style="width:100%; max-width:78mm; margin:0 auto; padding:0; box-sizing:border-box;">${html}</div>`
    : html;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${isThermal ? '' : title}</title><style>${styles}</style></head><body>${content}</body></html>`);
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
export const printElement = (elementId, title = 'Print', options = {}) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    alert('Could not find the content to print.');
    return Promise.resolve();
  }
  const isThermal = Boolean(
    options.isThermal ||
    element.classList.contains('thermal-receipt') ||
    element.getAttribute('data-format') === 'thermal'
  );
  return printHtml(element.innerHTML, title, { ...options, isThermal });
};

import { toast } from 'react-toastify';

/**
 * Downloads the given element directly as an A4 PDF file using html2pdf.js.
 * If html2pdf fails or is unavailable, it smoothly falls back to the native print/save dialog.
 */
export const downloadElementAsPDF = async (elementId, filename = 'Invoice') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    alert('Could not find the content to generate PDF.');
    return;
  }

  const cleanFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

  // Create an off-screen container that is guaranteed visible to html2canvas
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px'; // 210mm at 96 DPI
  container.style.background = '#ffffff';
  container.style.color = '#111827';
  container.style.zIndex = '-99999';

  const clone = element.cloneNode(true);
  clone.style.display = 'block';
  clone.style.visibility = 'visible';
  clone.style.width = '100%';
  clone.style.background = '#ffffff';
  clone.style.color = '#111827';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';

  const pdfStyle = document.createElement('style');
  pdfStyle.textContent = `
    * { box-sizing: border-box !important; }
    body, div, table, tr, td, th, p, h1, h2, h3, h4, span { color: #111827 !important; }
    .print-report-header, .print-only-header { display: block !important; }
    .card, .glass, .bg-input { background: #ffffff !important; border: 1px solid #e5e7eb !important; box-shadow: none !important; color: #111827 !important; }
    table { width: 100% !important; border-collapse: collapse !important; margin-top: 8px !important; }
    th, td { border: 1px solid #d1d5db !important; padding: 6px 8px !important; color: #111827 !important; }
    th { background: #f3f4f6 !important; font-weight: 600 !important; color: #111827 !important; }
    .print-only-status { display: inline-block !important; }
    button, .btn-icon, .no-print, .hide-on-print { display: none !important; }
    /* Statement Photo-matching styles */
    .statement-header-banner { background: #eaf8f2 !important; border: 1px solid #d0ebe1 !important; border-radius: 12px !important; padding: 16px 20px !important; margin-bottom: 16px !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
    .statement-title-name { font-size: 24px !important; font-weight: 800 !important; color: #134e4a !important; margin: 0 !important; letter-spacing: -0.5px !important; }
    .statement-subtitle { font-size: 13px !important; color: #3f6e65 !important; margin: 4px 0 0 0 !important; font-weight: 600 !important; }
    .statement-period-label { font-size: 12px !important; font-weight: 700 !important; color: #0f766e !important; text-align: right !important; margin: 0 0 4px 0 !important; }
    .statement-period-badge { background: #ffffff !important; border: 1px solid #c7e6d6 !important; border-radius: 8px !important; padding: 6px 14px !important; font-size: 13px !important; font-weight: 700 !important; color: #134e4a !important; display: inline-block !important; }
    .statement-table-card { background: #ffffff !important; border: 1px solid #e5e7eb !important; border-radius: 10px !important; overflow: hidden !important; }
    .statement-table { width: 100% !important; border-collapse: collapse !important; font-size: 10.5px !important; margin-top: 0 !important; }
    .statement-table th { background: #fafafa !important; color: #4b5563 !important; font-weight: 700 !important; text-transform: uppercase !important; font-size: 9.5px !important; letter-spacing: 0.04em !important; padding: 8px 6px !important; border-bottom: 1px solid #e5e7eb !important; border-top: none !important; border-left: none !important; border-right: none !important; }
    .statement-table td { padding: 7px 6px !important; border-bottom: 1px solid #f3f4f6 !important; border-top: none !important; border-left: none !important; border-right: none !important; color: #111827 !important; vertical-align: middle !important; }
    .statement-table tr:nth-child(even) { background-color: #fafafa !important; }
    .statement-badge-working { background: #ffffff !important; border: 1px solid #cbd5e1 !important; color: #1e293b !important; border-radius: 4px !important; padding: 2px 7px !important; font-size: 9.5px !important; font-weight: 700 !important; display: inline-block !important; }
    .statement-badge-absent { background: #fee2e2 !important; border: 1px solid #fecaca !important; color: #dc2626 !important; border-radius: 4px !important; padding: 2px 7px !important; font-size: 9.5px !important; font-weight: 700 !important; display: inline-block !important; }
    .statement-badge-halfday { background: #fef3c7 !important; border: 1px solid #fde68a !important; color: #d97706 !important; border-radius: 4px !important; padding: 2px 7px !important; font-size: 9.5px !important; font-weight: 700 !important; display: inline-block !important; }
    .statement-badge-late { background: #dbeafe !important; border: 1px solid #bfdbfe !important; color: #1d4ed8 !important; border-radius: 4px !important; padding: 2px 7px !important; font-size: 9.5px !important; font-weight: 700 !important; display: inline-block !important; }
    .statement-badge-leave { background: #f3f4f6 !important; border: 1px solid #e5e7eb !important; color: #4b5563 !important; border-radius: 4px !important; padding: 2px 7px !important; font-size: 9.5px !important; font-weight: 700 !important; display: inline-block !important; }
    .statement-muted-cell { text-align: center !important; color: #9ca3af !important; }
  `;

  container.appendChild(pdfStyle);
  container.appendChild(clone);
  document.body.appendChild(container);

  let toastId = null;
  try {
    if (toast?.loading) {
      toastId = toast.loading('PDF তৈরি হচ্ছে, অপেক্ষা করুন...');
    } else if (toast?.info) {
      toastId = toast.info('PDF তৈরি হচ্ছে, অপেক্ষা করুন...', { autoClose: false });
    }

    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default || html2pdfModule;

    const opt = {
      margin: [6, 6, 6, 6],
      filename: cleanFilename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    await html2pdf().set(opt).from(clone).save();

    if (toastId && toast?.update) {
      toast.update(toastId, { render: 'PDF ডাউনলোড সফল হয়েছে!', type: 'success', isLoading: false, autoClose: 2500 });
    } else if (toast?.success) {
      if (toastId && toast?.dismiss) toast.dismiss(toastId);
      toast.success('PDF ডাউনলোড সফল হয়েছে!');
    }
  } catch (err) {
    console.warn('html2pdf generation failed, falling back to print dialog:', err);
    if (toastId && toast?.dismiss) toast.dismiss(toastId);
    printElement(elementId, cleanFilename, { isThermal: false });
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};

export const downloadAsPDF = downloadElementAsPDF;

export default printElement;

