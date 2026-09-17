import JsBarcode from 'jsbarcode';

/**
 * Generate clean standalone barcode bars SVG using JsBarcode without embedded text.
 * Width/height attributes are stripped so the SVG scales to its box.
 */
export const generateBarcodeSvg = (value) => {
  const cleanVal = String(value || '').trim();
  const isEan13 = /^\d{13}$/.test(cleanVal);
  const isUpcA = /^\d{12}$/.test(cleanVal);

  const render = (format) => {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, cleanVal, {
      format,
      width: 1.35,
      height: 28,
      displayValue: false,
      margin: 0,
    });
    svgNode.removeAttribute('width');
    svgNode.removeAttribute('height');
    svgNode.setAttribute('preserveAspectRatio', 'none');
    return svgNode.outerHTML;
  };

  try {
    return render(isEan13 ? 'EAN13' : isUpcA ? 'UPC' : 'CODE128');
  } catch {
    try {
      return render('CODE128');
    } catch (e2) {
      console.error('Barcode error:', e2);
      return `<div style="font-family: monospace; font-size: 10px; font-weight: bold; padding: 2px 0;">*${cleanVal}*</div>`;
    }
  }
};

/** The heading on every sticker. */
export const LABEL_SHOP_NAME = 'Allahr dan gents point';

/** The sticker size to print on, from the shop profile with safe defaults. */
export const labelSpecFrom = (shopProfile) => ({
  width: Number(shopProfile?.label_width_mm) || 40,
  height: Number(shopProfile?.label_height_mm) || 25,
  perRow: Math.max(1, Math.min(3, Number(shopProfile?.labels_per_row) || 1)),
});

/**
 * Print barcode stickers, one physical sticker per printed page.
 *
 * The page is set to exactly the sticker size (from Settings), and the label
 * card fills that page with no outer margin. That is the whole fix for the
 * "every second sticker comes out blank" problem: a page taller than one
 * sticker makes the printer feed two stickers for each label. Everything
 * inside scales with the sticker so a 40x25 and a 50x30 roll both come out
 * filled edge to edge.
 *
 * @param product   the inventory row
 * @param count     how many stickers
 * @param shopName  the heading on each sticker
 * @param spec      { width, height, perRow } in mm — see labelSpecFrom()
 */
export const printBarcodeLabels = (product, count = 1, shopName = LABEL_SHOP_NAME, spec = {}) => {
  if (!product) return;

  const width = Number(spec.width) || 40;
  const height = Number(spec.height) || 25;
  const perRow = Math.max(1, Math.min(3, Number(spec.perRow) || 1));

  const barcodeCode = String(product.id || product.product_code || '').trim();
  const barcodeSvg = generateBarcodeSvg(barcodeCode);

  const salePrice = product.discount_price && Number(product.discount_price) > 0
    ? Number(product.discount_price)
    : Number(product.price);
  const mrpVal = Number(product.mrp);
  const hasDiscount = mrpVal > 0 && mrpVal > salePrice;

  const category = product.category_name || (typeof product.category === 'object' ? product.category?.name : product.category) || '';
  const variant = product.variant || '';

  let itemTitle = product.name || '';
  if (variant && !itemTitle.includes(variant)) {
    itemTitle += ` (${variant})`;
  }

  // Type sizes are tuned for a 40x25mm sticker and scale from there; the
  // barcode gets whatever height is left once the text has its share.
  const k = Math.max(0.6, Math.min(2.2, Math.min(height / 25, width / 40)));
  const pt = (base) => `${(base * k).toFixed(2)}pt`;
  const barcodeHeight = Math.max(5, height * 0.3);

  const labelHtml = `
    <div class="label-card">
      <div class="shop-name">${shopName}</div>
      <div class="item-name">${itemTitle}</div>
      ${category ? `<div class="category-name">${category}</div>` : ''}
      <div class="barcode-box">${barcodeSvg}</div>
      <div class="barcode-number">${barcodeCode}</div>
      <div class="price-row">
        ${hasDiscount ? `<span class="mrp">৳ ${mrpVal.toLocaleString()}</span>` : ''}
        <span class="sale-price">৳ ${salePrice.toLocaleString()}</span>
      </div>
    </div>
  `;

  // One page per row of stickers; the last row is padded with blanks so the
  // sheet never ends on a half-filled page that would mis-feed the next print.
  const total = Math.max(1, count);
  const pages = [];
  for (let i = 0; i < total; i += perRow) {
    const cells = [];
    for (let j = 0; j < perRow; j += 1) {
      cells.push(i + j < total ? labelHtml : '<div class="label-card blank"></div>');
    }
    pages.push(`<div class="page">${cells.join('')}</div>`);
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const pageWidth = width * perRow;

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcode - ${product.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page {
      size: ${pageWidth}mm ${height}mm;
      margin: 0;
    }
    html, body {
      width: ${pageWidth}mm;
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: ${pageWidth}mm;
      height: ${height}mm;
      display: flex;
      flex-direction: row;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .label-card {
      width: ${width}mm;
      height: ${height}mm;
      flex: 0 0 ${width}mm;
      padding: ${(1.2 * k).toFixed(2)}mm ${(1.5 * k).toFixed(2)}mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      background: #fff;
    }
    .label-card.blank { visibility: hidden; }
    .shop-name {
      font-weight: 900;
      font-size: ${pt(7.2)};
      letter-spacing: 0;
      line-height: 1.1;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-name {
      font-weight: 700;
      font-size: ${pt(6)};
      line-height: 1.1;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .category-name {
      font-weight: 600;
      font-size: ${pt(5)};
      line-height: 1.1;
      color: #222;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .barcode-box {
      width: 100%;
      height: ${barcodeHeight.toFixed(2)}mm;
      display: flex;
      justify-content: center;
      align-items: stretch;
    }
    .barcode-box svg { width: 92%; height: 100%; display: block; }
    .barcode-number {
      font-weight: 900;
      font-size: ${pt(6.5)};
      letter-spacing: 0.06em;
      line-height: 1.1;
      width: 100%;
      white-space: nowrap;
    }
    .price-row {
      font-weight: 900;
      font-size: ${pt(9)};
      line-height: 1.1;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: ${(1.2 * k).toFixed(2)}mm;
      width: 100%;
      white-space: nowrap;
    }
    .mrp { font-size: ${pt(9)}; font-weight: normal; text-decoration: line-through; color: #333; }
    .sale-price { font-size: ${pt(9)}; font-weight: 900; color: #000; }
  </style>
</head>
<body>
  ${pages.join('')}
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Print error:', e);
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 1000);
  }, 250);
};

export default printBarcodeLabels;
