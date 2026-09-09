import JsBarcode from 'jsbarcode';

/**
 * Generate clean standalone barcode bars SVG using JsBarcode without embedded text.
 * Configured with responsive height and width to scale cleanly inside label cards.
 */
export const generateBarcodeSvg = (value) => {
  const cleanVal = String(value || '').trim();
  const isEan13 = /^\d{13}$/.test(cleanVal);
  const isUpcA = /^\d{12}$/.test(cleanVal);

  try {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, cleanVal, {
      format: isEan13 ? 'EAN13' : isUpcA ? 'UPC' : 'CODE128',
      width: 1.35,
      height: 28,
      displayValue: false, // Clean bars without embedded SVG text
      margin: 0,
    });
    svgNode.removeAttribute('width');
    svgNode.removeAttribute('height');
    return svgNode.outerHTML;
  } catch (err) {
    try {
      const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgNode, cleanVal, {
        format: 'CODE128',
        width: 1.35,
        height: 28,
        displayValue: false,
        margin: 0,
      });
      svgNode.removeAttribute('width');
      svgNode.removeAttribute('height');
      return svgNode.outerHTML;
    } catch (e2) {
      console.error('Barcode error:', e2);
      return `<div style="font-family: monospace; font-size: 10px; font-weight: bold; padding: 2px 0;">*${cleanVal}*</div>`;
    }
  }
};

/**
 * Directly prints barcode label matching the user's reference sticker design:
 * - Shop Name: Allah'r Dan
 * - Product Title & Variant
 * - Category Name
 * - Standard 13-digit EAN Barcode
 * - Price (with optional MRP discount strike-through)
 * - Sized for 40x50mm thermal paper with full enclosing border
 */
export const printBarcodeLabels = (product, count = 1, shopName = "Allah'r Dan") => {
  if (!product) return;

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

  const labelHtml = `
    <div class="label-card">
      <div class="shop-name">${shopName}</div>
      <div class="item-name">${itemTitle}</div>
      ${category ? `<div class="category-name">${category}</div>` : ''}
      <div class="barcode-box">
        ${barcodeSvg}
      </div>
      <div class="barcode-number">${barcodeCode}</div>
      <div class="price-row">
        ${hasDiscount ? `<span class="mrp">৳ ${mrpVal.toLocaleString()}</span>` : ''}
        <span class="sale-price">৳ ${salePrice.toLocaleString()}</span>
      </div>
    </div>
  `;

  const labelsHtml = labelHtml.repeat(Math.max(1, count));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcode - ${product.name}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    @page {
      size: 40mm 50mm;
      margin: 0mm;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-card {
      width: 36.5mm;
      box-sizing: border-box;
      border: 2px solid #000;
      padding: 1.8mm 1.5mm 1.5mm 1.5mm;
      text-align: center;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 2mm auto 0 auto;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: always;
      break-after: page;
    }
    .label-card:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .shop-name {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 900;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      line-height: 1.15;
      margin-bottom: 1px;
      color: #000;
      width: 100%;
      text-align: center;
      word-break: break-word;
    }
    .item-name {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 700;
      font-size: 7pt;
      line-height: 1.15;
      color: #000;
      width: 100%;
      margin-bottom: 1px;
      word-break: break-word;
      text-align: center;
    }
    .category-name {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 600;
      font-size: 6.5pt;
      line-height: 1.1;
      color: #222;
      width: 100%;
      margin-bottom: 1.5px;
      text-align: center;
      word-break: break-word;
    }
    .barcode-box {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 1.5px 0 1px 0;
    }
    .barcode-box svg {
      width: 90%;
      max-width: 92%;
      height: 28px;
      display: block;
    }
    .barcode-number {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 900;
      font-size: 8.5pt;
      letter-spacing: 0.5px;
      line-height: 1.1;
      margin-top: 1.5px;
      margin-bottom: 1.5px;
      color: #000;
      width: 100%;
      text-align: center;
    }
    .price-row {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 900;
      font-size: 12pt;
      line-height: 1.1;
      margin-top: 1.5px;
      color: #000;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4px;
      width: 100%;
      text-align: center;
    }
    .mrp {
      font-size: 7.5pt;
      font-weight: normal;
      text-decoration: line-through;
      color: #555;
    }
    .sale-price {
      font-weight: 900;
      font-size: 12pt;
      color: #000;
    }
    @media print {
      html, body {
        width: 40mm;
        margin: 0 !important;
        padding: 0 !important;
      }
      .label-card {
        width: 36.5mm !important;
        margin: 2mm auto 0 auto !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${labelsHtml}
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
