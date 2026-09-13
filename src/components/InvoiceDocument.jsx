import React from 'react';

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

  return {
    invoiceNumber: inv.id || inv.invoice_number,
    date: inv.date,
    status: inv.status,
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
      return {
        name: item.name,
        variant: item.variant || '',
        code: item.product_code || item.id || '',
        unit: item.unit || '',
        quantity: qty,
        price: rate,
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

  return {
    invoiceNumber: sale.invoiceId,
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
      return {
        name: item.name,
        variant: item.variant || '',
        code: item.id || '',
        unit: item.unit || '',
        quantity: qty,
        price: rate,
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

  const shopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allah Dan Gents Point');

  const settled = sale.due <= 0;
  const totalUnits = sale.items.reduce((n, i) => n + i.quantity, 0);

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
          {shopProfile?.address && <div style={{ color: '#4b5563' }}>{shopProfile.address}</div>}
          <div style={{ color: '#4b5563' }}>
            {shopProfile?.phone ? `Mobile: ${shopProfile.phone}` : ''}
            {shopProfile?.whatsapp ? `   WhatsApp: ${shopProfile.whatsapp}` : ''}
            {shopProfile?.email ? `   ${shopProfile.email}` : ''}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{
            display: 'inline-block', border: '2px solid #111827', borderRadius: '4px',
            padding: '4px 14px', fontSize: '15px', fontWeight: 800, letterSpacing: '0.12em',
          }}>
            INVOICE
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', lineHeight: 1.7 }}>
            <div><span style={{ color: '#6b7280' }}>No:</span> <strong>{sale.invoiceNumber}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Date:</span> {new Date(sale.date).toLocaleDateString('en-GB')}</div>
            <div><span style={{ color: '#6b7280' }}>Time:</span> {new Date(sale.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </div>

      <hr style={S.rule} />

      {/* ---- Parties ---- */}
      <div style={{ display: 'flex', gap: '16px', margin: '12px 0 14px' }}>
        <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
          <div style={S.label}>Billed To</div>
          <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '3px' }}>{sale.customer.name}</div>
          {sale.customer.phone && <div style={{ color: '#4b5563' }}>Mobile: {sale.customer.phone}</div>}
          {sale.customer.address && <div style={{ color: '#4b5563' }}>{sale.customer.address}</div>}
          {sale.customer.code && <div style={{ color: '#6b7280', fontSize: '10px' }}>Customer ID: {sale.customer.code}</div>}
        </div>

        <div style={{ flex: '0 0 40%', border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
          <div style={S.label}>Invoice Details</div>
          <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Salesman</span><span>{sale.salesmanName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Payment</span><span>{sale.paymentType}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Status</span>
            <span style={{ fontWeight: 700, color: settled ? '#047857' : '#b91c1c' }}>
              {settled ? 'PAID' : 'DUE'}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Lines ---- */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '28px', textAlign: 'center' }}>#</th>
            <th style={{ ...S.th, textAlign: 'left' }}>Description</th>
            <th style={{ ...S.th, textAlign: 'center', width: '62px' }}>Qty</th>
            <th style={{ ...S.th, textAlign: 'right', width: '78px' }}>Rate</th>
            <th style={{ ...S.th, textAlign: 'right', width: '72px' }}>Discount</th>
            <th style={{ ...S.th, textAlign: 'right', width: '88px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ ...S.cell, textAlign: 'center', color: '#6b7280' }}>{idx + 1}</td>
              <td style={S.cell}>
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                {item.variant ? <span style={{ color: '#4b5563' }}> — {item.variant}</span> : null}
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
              <td style={{ ...S.cell, textAlign: 'right' }}>{money(item.price)}</td>
              <td style={{ ...S.cell, textAlign: 'right', color: item.discount ? '#b91c1c' : '#9ca3af' }}>
                {item.discount ? money(item.discount) : '—'}
              </td>
              <td style={{ ...S.cell, textAlign: 'right', fontWeight: 600 }}>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ ...S.cell, background: '#f9fafb', fontSize: '11px', color: '#4b5563' }}>
              {sale.items.length} item{sale.items.length === 1 ? '' : 's'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'}
            </td>
            <td colSpan={4} style={{ ...S.cell, background: '#f9fafb' }} />
          </tr>
        </tfoot>
      </table>

      {/* ---- Money ---- */}
      <div style={{ display: 'flex', gap: '18px', marginTop: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 10px' }}>
            <div style={S.label}>Amount in Words</div>
            <div style={{ marginTop: '3px', fontStyle: 'italic', fontWeight: 600 }}>{takaInWords(sale.total)}</div>
          </div>

          {sale.payments.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ ...S.label, marginBottom: '4px' }}>Payments Received</div>
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
                    <td style={S.cell}>{String(sale.date).split('T')[0]}</td>
                    <td style={S.cell}>{sale.invoiceNumber}</td>
                    <td style={S.cell}>{sale.paymentType} (at sale)</td>
                    <td style={{ ...S.cell, textAlign: 'right' }}>{money(sale.paidAtSale)}</td>
                  </tr>
                  {sale.payments.map((p) => (
                    <tr key={p.ref}>
                      <td style={S.cell}>{String(p.date).split('T')[0]}</td>
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
          {totalLine('Subtotal', `৳ ${money(sale.subtotal)}`)}
          {sale.invoiceDiscount > 0 && totalLine('Invoice Discount', `− ৳ ${money(sale.invoiceDiscount)}`)}
          {sale.carrying > 0 && totalLine('Carrying / Loading', `৳ ${money(sale.carrying)}`)}
          {totalLine('Grand Total', `৳ ${money(sale.total)}`, { bold: true, big: true, rule: true })}
          {totalLine('Paid at Sale', `৳ ${money(sale.paidAtSale)}`, { tone: 'paid' })}
          {sale.laterPayments > 0 && totalLine('Later Payments', `৳ ${money(sale.laterPayments)}`, { tone: 'paid' })}
          {sale.laterPayments > 0 && totalLine('Total Received', `৳ ${money(sale.totalReceived)}`, { bold: true, tone: 'paid' })}
          {sale.cashReceived > 0 && totalLine('Cash Received', `৳ ${money(sale.cashReceived)}`)}
          {sale.changeGiven > 0 && totalLine('Change Returned', `৳ ${money(sale.changeGiven)}`, { bold: true })}
          {totalLine('Balance Due', `৳ ${money(sale.due)}`, {
            bold: true, big: true, rule: true, tone: sale.due > 0 ? 'due' : 'paid',
          })}
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
