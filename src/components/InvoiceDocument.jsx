import React from 'react';
import { formatDate, formatTime } from '../utils/date';
import { DEFAULT_SHOP_ADDRESS, DEFAULT_SHOP_NAME, DEFAULT_SHOP_PHONE } from '../utils/shopConfig';
import { ShopPhoneContact } from './ShopContactIcons';

/**
 * The shop's invoice, as it goes on paper.
 *
 * One component for every place an invoice is produced -- the receipt that
 * appears the moment a sale is rung up, and the same invoice reprinted later
 * from POS History. They used to be two different documents written inline on
 * two screens, so the copy a customer took home did not match the copy the
 * shop reprinted a week later.
 *
 * `printElement` lifts this markup into a document of its own and only carries
 * a small print stylesheet with it, so every rule here has to be inline. That
 * is deliberate, not an oversight.
 */

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// ---------------------------------------------------------------------------
// Amount in words
// ---------------------------------------------------------------------------

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);

const threeDigits = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [
    hundred ? `${ONES[hundred]} Hundred` : '',
    rest ? twoDigits(rest) : '',
  ].filter(Boolean).join(' ');
};

/**
 * Taka in words, grouped the way every invoice in this market groups them:
 * crore, lakh, thousand. A cheque or a court would read the words, not the
 * figure, which is why a printed invoice carries both.
 */
export const takaInWords = (value) => {
  const amount = Math.abs(Math.round((Number(value) || 0) * 100) / 100);
  const whole = Math.floor(amount);
  const paisa = Math.round((amount - whole) * 100);

  if (whole === 0 && paisa === 0) return 'Zero Taka Only';

  const parts = [];
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  let words = parts.join(' ').trim();
  if (words) words += ' Taka';
  if (paisa) words += `${words ? ' and ' : ''}${twoDigits(paisa)} Paisa`;

  return `${words} Only`;
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** Normalise a saved invoice as the API returns it. */
export const fromApiInvoice = (inv, customers = []) => {
  if (!inv) return null;
  const contact = customers.find((c) => c.id === inv.customerId);
  const laterPayments = Number(inv.duePaid) || 0;
  const paidAtSale = Number(inv.paid_amount) || 0;
  const invNumber = inv.invoiceNumber || inv.invoice_number || inv.invoiceId || inv.id || '';

  return {
    id: invNumber,
    invoiceId: invNumber,
    invoiceNumber: invNumber,
    invoice_number: invNumber,
    date: inv.date,
    status: inv.status,
    returnStatus: inv.returnStatus || 'none',
    returnedValue: Number(inv.returnedValue) || 0,
    customer: {
      name: inv.customerName || 'Walk-in Customer',
      phone: inv.customer_phone || contact?.phone || '',
      address: inv.customer_location || contact?.location || '',
      code: inv.customerId || '',
    },
    salesmanName: inv.salesmanName || 'Admin',
    paymentType: inv.paymentType,
    items: (inv.items || []).map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.price) || 0;
      const discount = Number(item.itemDiscount ?? item.item_discount) || 0;
      const isGift = Boolean(item.isGift ?? item.is_gift);
      const mrp = Number(item.mrp ?? item.product?.mrp ?? 0);
      return {
        name: item.name,
        variant: item.variant || '',
        color: item.color || '',
        code: item.product_code || item.id || '',
        unit: item.unit || '',
        quantity: qty,
        price: rate,
        mrp: mrp > 0 ? mrp : rate,
        discount,
        isGift,
        total: isGift ? 0 : (Number(item.total_price ?? (rate - discount) * qty) || 0),
      };
    }),
    subtotal: Number(inv.subtotal) || 0,
    invoiceDiscount: Number(inv.invoiceDiscount) || 0,
    carrying: Number(inv.carrying_loading) || 0,
    total: Number(inv.total) || 0,
    paidAtSale,
    laterPayments,
    totalReceived: inv.totalPaid !== undefined ? Number(inv.totalPaid) : paidAtSale + laterPayments,
    due: inv.dueRemaining !== undefined ? Number(inv.dueRemaining) : Number(inv.due_amount) || 0,
    payments: (inv.duePayments || []).map((p) => ({
      date: p.date, ref: p.id, method: p.method, amount: Number(p.amount) || 0,
    })),
    notes: inv.notes || '',
  };
};

/**
 * Normalise the object the POS screen builds the instant a sale goes through.
 * It is shaped from the cart rather than from the server, so the field names
 * differ -- cartItems, customerInfo, invoiceId.
 */
export const fromCompletedSale = (sale) => {
  if (!sale) return null;
  const paid = Number(sale.paidAmount) || 0;
  const due = Number(sale.dueAmount) || 0;
  const invNumber = sale.invoiceNumber || sale.invoiceId || sale.invoice_number || sale.id || '';

  return {
    id: invNumber,
    invoiceId: invNumber,
    invoiceNumber: invNumber,
    invoice_number: invNumber,
    date: sale.date,
    status: 'Completed',
    customer: {
      name: sale.customerInfo?.name || 'Walk-in Customer',
      phone: sale.customerInfo?.phone || '',
      address: sale.customerInfo?.location || '',
      code: '',
    },
    salesmanName: sale.salesman?.name || 'Admin',
    paymentType: sale.paymentType,
    items: (sale.cartItems || []).map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.price) || 0;
      const discount = Number(item.itemDiscount) || 0;
      const mrp = Number(item.mrp ?? item.mrp_price ?? 0);
      return {
        name: item.name,
        variant: item.variant || '',
        color: item.color || '',
        code: item.id || '',
        unit: item.unit || '',
        quantity: qty,
        price: rate,
        mrp: mrp > 0 ? mrp : rate,
        discount,
        isGift: Boolean(item.isGift),
        total: item.isGift ? 0 : (rate - discount) * qty,
      };
    }),
    subtotal: Number(sale.subtotal) || 0,
    invoiceDiscount: Number(sale.invoiceDiscount) || 0,
    carrying: 0,
    total: Number(sale.total) || 0,
    paidAtSale: paid,
    laterPayments: 0,
    totalReceived: paid,
    due,
    cashReceived: Number(sale.cashReceived) || 0,
    changeGiven: Number(sale.changeGiven) || 0,
    payments: [],
    notes: sale.notes || '',
  };
};

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const S = {
  page: { padding: '22px 26px', background: '#fff', color: '#111827', fontSize: '12px', lineHeight: 1.45 },
  rule: { border: 0, borderTop: '2px solid #111827', margin: '10px 0 0' },
  cell: { border: '1px solid #d1d5db', padding: '6px 8px' },
  th: {
    border: '1px solid #d1d5db', padding: '6px 8px', background: '#f3f4f6',
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700,
  },
  totalRow: { display: 'flex', justifyContent: 'space-between', gap: '18px', padding: '3px 0' },
  label: { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', fontWeight: 700 },
};

const InvoiceDocument = ({ sale, shopProfile, domId = 'printable-invoice', language = 'en' }) => {
  if (!sale) return null;

  let rawShopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || DEFAULT_SHOP_NAME);

  if (!rawShopName || rawShopName.toLowerCase() === 'allah dan gents point' || rawShopName === 'Allah Dan Gents Point') {
    rawShopName = 'Allahr Dan Gents Point';
  }
  const shopName = rawShopName;

  const settled = sale.due <= 0;
  const totalUnits = sale.items.reduce((n, i) => n + Number(i.quantity || 0), 0);
  const totalMrp = sale.items.reduce((sum, it) => {
    const m = Number(it.mrp || it.price || 0);
    const q = Number(it.quantity) || 1;
    return sum + (m * q);
  }, 0);

  // Calculate total item discount based on MRP - selling rate
  const totalItemDiscount = sale.items.reduce((sum, it) => {
    const unitPrice = Number(it.price) || 0;
    const manualDisc = Number(it.discount || it.itemDiscount || it.item_discount || 0);
    const effRate = it.isGift ? 0 : Math.max(0, unitPrice - manualDisc);
    const m = Number(it.mrp || it.price || 0);
    let uDisc = 0;
    if (it.isGift) {
      uDisc = m > 0 ? m : unitPrice;
    } else if (m > effRate) {
      uDisc = m - effRate;
    } else if (manualDisc > 0) {
      uDisc = manualDisc;
    }
    const q = Number(it.quantity) || 1;
    return sum + (uDisc * q);
  }, 0);

  const invDiscount = Number(sale.invoiceDiscount || 0);
  const totalOverallDiscount = totalItemDiscount + invDiscount;

  const totalLine = (label, value, opts = {}) => (
    <div style={{
      ...S.totalRow,
      fontWeight: opts.bold ? 700 : 400,
      fontSize: opts.big ? '14px' : '12px',
      borderTop: opts.rule ? '1px solid #111827' : undefined,
      paddingTop: opts.rule ? '6px' : '3px',
      marginTop: opts.rule ? '4px' : 0,
      color: opts.tone === 'due' ? '#b91c1c' : opts.tone === 'paid' ? '#047857' : '#111827',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div id={domId} style={S.page}>

      {/* ---- Letterhead ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {shopName}
          </div>
          {shopProfile?.tagline && <div style={{ color: '#4b5563', marginTop: '2px' }}>{shopProfile.tagline}</div>}
          <div style={{ color: '#4b5563' }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
          <ShopPhoneContact
            phone={shopProfile?.phone || DEFAULT_SHOP_PHONE}
            mode="invoice"
            iconSize={13}
            style={{ marginTop: '3px' }}
          />
          {shopProfile?.email && <div style={{ color: '#4b5563', fontSize: '10.5px', marginTop: '2px' }}>Email: {shopProfile.email}</div>}
        </div>

        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{
            display: 'inline-block', border: '2px solid #111827', borderRadius: '4px',
            padding: '4px 14px', fontSize: '15px', fontWeight: 800, letterSpacing: '0.12em',
          }}>
            {language === 'bn' ? 'চালান / ইনভয়েস' : 'INVOICE'}
          </div>
          {sale.returnStatus && sale.returnStatus !== 'none' && (
            <div style={{
              marginTop: '6px', display: 'inline-block', marginLeft: '6px',
              border: '2px solid #dc2626', color: '#dc2626', borderRadius: '4px',
              padding: '2px 10px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em',
            }}>
              {sale.returnStatus === 'full'
                ? (language === 'bn' ? 'রিটার্নড' : 'RETURNED')
                : (language === 'bn' ? 'আংশিক রিটার্ন' : 'PARTLY RETURNED')}
              {sale.returnedValue > 0 ? ` · ৳${sale.returnedValue.toLocaleString('en-US')}` : ''}
            </div>
          )}
          <div style={{ marginTop: '8px', fontSize: '11px', lineHeight: 1.7 }}>
            <div><span style={{ color: '#6b7280' }}>{language === 'bn' ? 'চালান নং:' : 'No:'}</span> <strong>{sale.invoiceNumber}</strong></div>
            <div><span style={{ color: '#6b7280' }}>{language === 'bn' ? 'তারিখ:' : 'Date:'}</span> {formatDate(sale.date)}</div>
            <div><span style={{ color: '#6b7280' }}>{language === 'bn' ? 'সময়:' : 'Time:'}</span> {formatTime(sale.date)}</div>
          </div>
        </div>
      </div>

      <hr style={S.rule} />

      {/* ---- Parties ---- */}
      <div style={{ display: 'flex', gap: '16px', margin: '12px 0 14px' }}>
        <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
          <div style={S.label}>{language === 'bn' ? 'ক্রেতার বিবরণ (Billed To)' : 'Billed To'}</div>
          <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '3px' }}>{sale.customer.name}</div>
          {sale.customer.phone && <div style={{ color: '#4b5563' }}>Mobile: {sale.customer.phone}</div>}
          {sale.customer.address && <div style={{ color: '#4b5563' }}>{sale.customer.address}</div>}
          {sale.customer.code && <div style={{ color: '#6b7280', fontSize: '10px' }}>Customer ID: {sale.customer.code}</div>}
        </div>

        <div style={{ flex: '0 0 40%', border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
          <div style={S.label}>{language === 'bn' ? 'চালান তথ্য (Invoice Details)' : 'Invoice Details'}</div>
          <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>{language === 'bn' ? 'বিক্রেতা' : 'Salesman'}</span><span>{sale.salesmanName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>{language === 'bn' ? 'পেমেন্ট' : 'Payment'}</span><span>{sale.paymentType}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>{language === 'bn' ? 'অবস্থা' : 'Status'}</span>
            <span style={{ fontWeight: 700, color: settled ? '#047857' : '#b91c1c' }}>
              {settled ? (language === 'bn' ? 'পরিশোধিত (PAID)' : 'PAID') : (language === 'bn' ? 'বকেয়া (DUE)' : 'DUE')}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Lines ---- */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '28px', textAlign: 'center' }}>#</th>
            <th style={{ ...S.th, textAlign: 'left' }}>{language === 'bn' ? 'পণ্যের বিবরণ' : 'Description'}</th>
            <th style={{ ...S.th, textAlign: 'center', width: '56px' }}>{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
            <th style={{ ...S.th, textAlign: 'right', width: '70px' }}>{language === 'bn' ? 'এমআরপি' : 'MRP'}</th>
            <th style={{ ...S.th, textAlign: 'right', width: '70px' }}>{language === 'bn' ? 'দর' : 'Rate'}</th>
            <th style={{ ...S.th, textAlign: 'right', width: '75px' }}>{language === 'bn' ? 'ছাড়' : 'Discount'}</th>
            <th style={{ ...S.th, textAlign: 'right', width: '82px' }}>{language === 'bn' ? 'মোট' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => {
            const itemMrp = Number(item.mrp || item.price || 0);
            const unitPrice = Number(item.price) || 0;
            const manualDiscount = Number(item.discount || item.itemDiscount || item.item_discount || 0);
            const effectiveRate = item.isGift ? 0 : Math.max(0, unitPrice - manualDiscount);

            let unitDiscount = 0;
            if (item.isGift) {
              unitDiscount = itemMrp > 0 ? itemMrp : unitPrice;
            } else if (itemMrp > effectiveRate) {
              unitDiscount = itemMrp - effectiveRate;
            } else if (manualDiscount > 0) {
              unitDiscount = manualDiscount;
            }

            const itemQty = Number(item.quantity) || 1;
            const lineTotalDiscount = unitDiscount * itemQty;
            const lineTotalMrp = (itemMrp > 0 ? itemMrp : unitPrice) * itemQty;

            return (
              <tr key={idx}>
                <td style={{ ...S.cell, textAlign: 'center', color: '#6b7280' }}>{idx + 1}</td>
                <td style={S.cell}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  {item.variant ? <span style={{ color: '#4b5563' }}> — {item.variant}</span> : null}
                  {item.color ? <span style={{ color: '#4b5563' }}> · {item.color}</span> : null}
                  {item.isGift ? (
                    <span style={{
                      marginLeft: '6px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                      border: '1px solid #047857', color: '#047857', borderRadius: '3px', padding: '0 4px',
                    }}>
                      GIFT
                    </span>
                  ) : null}
                  {item.code ? <div style={{ color: '#9ca3af', fontSize: '10px' }}>Code: {item.code}</div> : null}
                </td>
                <td style={{ ...S.cell, textAlign: 'center' }}>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                <td style={{ ...S.cell, textAlign: 'right', color: itemMrp > effectiveRate ? '#4b5563' : '#111827' }}>
                  {itemMrp > effectiveRate ? (
                    <span style={{ textDecoration: 'line-through' }}>{money(itemMrp)}</span>
                  ) : (
                    money(itemMrp)
                  )}
                </td>
                <td style={{ ...S.cell, textAlign: 'right', fontWeight: 600 }}>{money(effectiveRate)}</td>
                <td style={{ ...S.cell, textAlign: 'right', color: lineTotalDiscount > 0 ? '#b91c1c' : '#9ca3af' }}>
                  {lineTotalDiscount > 0 ? (
                    <div>
                      <span style={{ fontWeight: 600 }}>{money(lineTotalDiscount)}</span>
                      {itemQty > 1 && (
                        <div style={{ fontSize: '9px', color: '#6b7280' }}>
                          ({money(unitDiscount)}/{item.unit || (language === 'bn' ? 'টি' : 'pc')})
                        </div>
                      )}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ ...S.cell, textAlign: 'right', fontWeight: 600 }}>
                  <div>{money(item.total)}</div>
                  {lineTotalMrp > Number(item.total) && (
                    <div style={{ fontSize: '10px', color: '#6b7280', textDecoration: 'line-through' }}>
                      {money(lineTotalMrp)}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ ...S.cell, background: '#f9fafb', fontSize: '11px', color: '#4b5563' }}>
              {language === 'bn' ? `${sale.items.length} টি পণ্য · মোট ${totalUnits} পিস` : `${sale.items.length} item${sale.items.length === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`}
            </td>
            <td colSpan={5} style={{ ...S.cell, background: '#f9fafb' }} />
          </tr>
        </tfoot>
      </table>

      {/* ---- Money ---- */}
      <div style={{ display: 'flex', gap: '18px', marginTop: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
            <div style={S.label}>{language === 'bn' ? 'কথায় (Amount in Words)' : 'Amount in Words'}</div>
            <div style={{ marginTop: '3px', fontStyle: 'italic', fontWeight: 600 }}>{takaInWords(sale.total)}</div>
          </div>

          {sale.payments.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ ...S.label, marginBottom: '4px' }}>{language === 'bn' ? 'জমা বিবরণ (Payments Received)' : 'Payments Received'}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, textAlign: 'left' }}>Date</th>
                    <th style={{ ...S.th, textAlign: 'left' }}>Reference</th>
                    <th style={{ ...S.th, textAlign: 'left' }}>Method</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={S.cell}>{formatDate(sale.date)}</td>
                    <td style={S.cell}>{sale.invoiceNumber}</td>
                    <td style={S.cell}>{sale.paymentType} (at sale)</td>
                    <td style={{ ...S.cell, textAlign: 'right' }}>{money(sale.paidAtSale)}</td>
                  </tr>
                  {sale.payments.map((p) => (
                    <tr key={p.ref}>
                      <td style={S.cell}>{formatDate(p.date)}</td>
                      <td style={S.cell}>{p.ref}</td>
                      <td style={S.cell}>{p.method}</td>
                      <td style={{ ...S.cell, textAlign: 'right' }}>{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ flex: '0 0 42%' }}>
          {totalMrp > Number(sale.subtotal) && totalLine(
            language === 'bn' ? 'মোট এমআরপি (Total MRP)' : 'Total MRP',
            `৳ ${money(totalMrp)}`
          )}
          {totalOverallDiscount > 0 && totalLine(
            language === 'bn' ? 'মোট ছাড় (Total Discount)' : 'Total Discount',
            `− ৳ ${money(totalOverallDiscount)}`,
            { tone: 'paid', bold: true }
          )}
          {totalLine(
            language === 'bn' ? 'সাবটোটাল (Subtotal)' : 'Subtotal',
            `৳ ${money(sale.subtotal)}`
          )}
          {invDiscount > 0 && totalLine(
            language === 'bn' ? 'ইনভয়েস ছাড় (Invoice Disc)' : 'Invoice Discount',
            `− ৳ ${money(invDiscount)}`
          )}
          {sale.carrying > 0 && totalLine(
            language === 'bn' ? 'ক্যারিং / লোডিং' : 'Carrying / Loading',
            `৳ ${money(sale.carrying)}`
          )}
          {totalLine(
            language === 'bn' ? 'সর্বমোট বিল (Net Total)' : 'Grand Total',
            `৳ ${money(sale.total)}`,
            { bold: true, big: true, rule: true }
          )}
          {totalLine(
            language === 'bn' ? 'নগদ জমা (বিক্রির সময়)' : 'Paid at Sale',
            `৳ ${money(sale.paidAtSale)}`,
            { tone: 'paid' }
          )}
          {sale.laterPayments > 0 && totalLine(
            language === 'bn' ? 'পরবর্তী আদায়' : 'Later Payments',
            `৳ ${money(sale.laterPayments)}`,
            { tone: 'paid' }
          )}
          {sale.laterPayments > 0 && totalLine(
            language === 'bn' ? 'মোট আদায়' : 'Total Received',
            `৳ ${money(sale.totalReceived)}`,
            { bold: true, tone: 'paid' }
          )}
          {sale.cashReceived > 0 && totalLine(
            language === 'bn' ? 'গৃহীত ক্যাশ' : 'Cash Received',
            `৳ ${money(sale.cashReceived)}`
          )}
          {sale.changeGiven > 0 && totalLine(
            language === 'bn' ? 'ফেরত দেওয়া হয়েছে' : 'Change Returned',
            `৳ ${money(sale.changeGiven)}`,
            { bold: true }
          )}
          {totalLine(
            language === 'bn' ? 'বকেয়া (Due)' : 'Balance Due',
            `৳ ${money(sale.due)}`,
            { bold: true, big: true, rule: true, tone: sale.due > 0 ? 'due' : 'paid' }
          )}
        </div>
      </div>

      {sale.notes && (
        <div style={{ marginTop: '10px', fontSize: '11px', lineHeight: 1.5 }}>
          {sale.notes.includes('[সম্পাদনা:') || sale.notes.includes('[Edited by:') ? (
            <div style={{ background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: '6px', padding: '8px 12px' }}>
              <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '11px', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>✏️</span> {language === 'bn' ? 'সম্পাদনা বিবরণ (Edit History):' : 'Edit Audit History:'}
              </div>
              <div style={{ color: '#334155', fontSize: '10.5px', fontWeight: 500 }}>
                {sale.notes}
              </div>
            </div>
          ) : (
            <div>
              <span style={{ color: '#6b7280', fontWeight: 700 }}>Note: </span>{sale.notes}
            </div>
          )}
        </div>
      )}

      {/* ---- Signatures ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '30px', marginTop: '38px' }}>
        <div style={{ flex: 1, borderTop: '1px solid #111827', paddingTop: '4px', textAlign: 'center', fontSize: '11px' }}>
          Customer Signature
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ flex: 1, borderTop: '1px solid #111827', paddingTop: '4px', textAlign: 'center', fontSize: '11px' }}>
          For {shopName}
        </div>
      </div>

      {/* ---- Terms ---- */}
      <div style={{ marginTop: '18px', paddingTop: '8px', borderTop: '1px solid #e5e7eb', fontSize: '10px', color: '#4b5563', textAlign: 'center', lineHeight: 1.6 }}>
        {shopProfile?.footer_disclaimer_1 && <div>{shopProfile.footer_disclaimer_1}</div>}
        {shopProfile?.footer_disclaimer_2 && <div>{shopProfile.footer_disclaimer_2}</div>}
        {shopProfile?.footer_phone && <div>{shopProfile.footer_phone}</div>}
        <div style={{ marginTop: '4px', fontWeight: 600, color: '#111827' }}>
          Thank you for shopping with us.
        </div>
      </div>
    </div>
  );
};

export default InvoiceDocument;
