/**
 * Opening the cash drawer.
 *
 * The drawer is not wired to the computer. It hangs off the RJ11 socket on the
 * back of the receipt printer, and the printer flicks it open when it is told
 * to. A browser cannot send that command itself -- pages are not allowed near a
 * USB or serial port -- so the drawer is opened the way the hardware already
 * expects: by sending the printer something to print.
 *
 * That means one setting has to be ticked once, in the printer driver:
 *
 *     Printer properties -> Preferences / Device Settings
 *     -> "Open cash drawer before printing"  (or "... after printing")
 *
 * Every thermal printer sold for this job has it -- XPrinter, Epson, Rongta.
 * With it on, every receipt opens the drawer, and so does the no-sale slip
 * below. With it off, nothing here will move the drawer, and no amount of
 * front-end code can change that.
 */

/**
 * Print through a hidden iframe.
 *
 * The rest of this app prints by overwriting document.body and reloading the
 * page afterwards, which throws away React and everything the operator had on
 * screen. An iframe keeps the page intact, which matters when the drawer is
 * opened in the middle of serving someone.
 */
const printThroughIframe = (html, title) => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
      body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 6px 8px;
             color: #000; font-size: 12px; text-align: center; }
      .big { font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px; }
      @page { margin: 4mm; }
    </style></head><body>${html}</body></html>`);
  doc.close();

  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        // Printing was blocked or cancelled; the drawer simply will not open.
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve();
      }, 1000);
    }, 150);
  });
};

/**
 * Open the drawer without a sale -- to make change from an earlier customer, or
 * to put the float in at the start of the day.
 *
 * A slip is printed rather than a blank page, so an opening that had no sale
 * behind it leaves a paper trail. `reason` and `operator` are printed on it.
 */
export const openCashDrawer = ({ reason = 'No Sale', operator = '' } = {}) => {
  const now = new Date();
  return printThroughIframe(
    `<div class="big">NO SALE</div>
     <div>Drawer opened</div>
     <div>${now.toLocaleString()}</div>
     ${operator ? `<div>By: ${operator}</div>` : ''}
     ${reason && reason !== 'No Sale' ? `<div>${reason}</div>` : ''}`,
    'Open Cash Drawer'
  );
};

export default openCashDrawer;
