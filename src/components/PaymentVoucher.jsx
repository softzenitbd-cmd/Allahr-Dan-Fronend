import React from 'react';
import { takaInWords } from './InvoiceDocument';

/**
 * The money receipt handed over at the counter.
 *
 * An invoice says what was bought; a voucher says what was paid, and it is the
 * paid part the customer wants in their hand as they walk out. So this is a
 * short, formal acknowledgement built around one figure -- the amount actually
 * received -- with the goods reduced to a reference and anything still owed
 * stated plainly rather than buried.
 *
 * `printElement` copies this into a document of its own carrying only a small
 * print stylesheet, so every rule here is inline on purpose.
 */

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const S = {
  page: { padding: '26px 30px', background: '#fff', color: '#111827', fontSize: '12.5px', lineHeight: 1.5 },
  label: { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 700 },
  row: { display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '3px 0' },
};

const PaymentVoucher = ({ sale, shopProfile, domId = 'printable-voucher', language = 'en' }) => {
  if (!sale) return null;

  const shopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allahr dan gents point');

  // What the customer actually handed over, which is what a voucher attests.
  const received = Number(sale.totalReceived) || 0;
  const due = Number(sale.due) || 0;
  const settled = due <= 0;

  const line = (label, value, opts = {}) => (
    <div style={{
      ...S.row,
      fontWeight: opts.bold ? 700 : 400,
      color: opts.tone === 'due' ? '#b91c1c' : '#111827',
      borderTop: opts.rule ? '1px solid #d1d5db' : undefined,
      paddingTop: opts.rule ? '6px' : '3px',
      marginTop: opts.rule ? '4px' : 0,
    }}>
      <span style={{ color: opts.bold ? undefined : '#4b5563' }}>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div id={domId} style={S.page}>

      {/* ---- Letterhead ---- */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {shopName}
        </div>
        {shopProfile?.address && <div style={{ color: '#4b5563', fontSize: '11px' }}>{shopProfile.address}</div>}
        {(shopProfile?.phone || shopProfile?.whatsapp) && (
          <div style={{ color: '#4b5563', fontSize: '11px' }}>
            {shopProfile.phone ? `Mobile: ${shopProfile.phone}` : ''}
            {shopProfile.whatsapp ? `   WhatsApp: ${shopProfile.whatsapp}` : ''}
          </div>
        )}
      </div>

      <div style={{ borderTop: '2px solid #111827', margin: '12px 0 0' }} />

      {/* ---- Title band ---- */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '16px', padding: '10px 0 12px',
      }}>
        <div style={{
          border: '2px solid #111827', borderRadius: '4px', padding: '4px 16px',
          fontSize: '14px', fontWeight: 800, letterSpacing: '0.12em',
        }}>
          PAYMENT VOUCHER
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: 1.7 }}>
          <div><span style={{ color: '#6b7280' }}>Voucher No:</span> <strong>{sale.invoiceNumber}</strong></div>
          <div>
            <span style={{ color: '#6b7280' }}>Date:</span>{' '}
            {new Date(sale.date).toLocaleDateString('en-GB')}{' '}
            {new Date(sale.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ---- Received from ---- */}
      <div style={{ marginBottom: '12px' }}>
        <span style={S.label}>Received with thanks from</span>
        <div style={{
          borderBottom: '1px dotted #9ca3af', paddingBottom: '3px', marginTop: '3px',
          fontSize: '14px', fontWeight: 700,
        }}>
          {sale.customer.name}
          {sale.customer.phone && (
            <span style={{ fontWeight: 400, fontSize: '11.5px', color: '#4b5563' }}>
              {'  '}({sale.customer.phone})
            </span>
          )}
        </div>
      </div>

      {/* ---- The sum, in words then in figures ---- */}
      <div style={{ marginBottom: '12px' }}>
        <span style={S.label}>The sum of Taka</span>
        <div style={{
          border: '1px solid #d1d5db', borderRadius: '4px', background: '#f9fafb',
          padding: '8px 10px', marginTop: '3px', fontStyle: 'italic', fontWeight: 700, fontSize: '13px',
        }}>
          {takaInWords(received)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ flex: 1 }}>
          {line('On account of', `Sale invoice ${sale.invoiceNumber}`)}
          {line('Payment mode', sale.paymentType)}
          {line('Items', `${sale.items.length} item${sale.items.length === 1 ? '' : 's'}`)}
          {line('Salesman', sale.salesmanName)}
        </div>

        {/* The figure the whole document exists to record. */}
        <div style={{
          flex: '0 0 190px', border: '2px solid #111827', borderRadius: '6px',
          padding: '10px 12px', textAlign: 'center',
        }}>
          <div style={{ ...S.label, marginBottom: '2px' }}>Amount Received</div>
          <div style={{ fontSize: '25px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            ৳ {money(received)}
          </div>
        </div>
      </div>

      {/* ---- How it adds up ---- */}
      <div style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '9px 12px', fontSize: '12px' }}>
        {line('Invoice total', `৳ ${money(sale.total)}`)}
        {sale.cashReceived > 0 && line('Cash tendered', `৳ ${money(sale.cashReceived)}`)}
        {sale.changeGiven > 0 && line('Change returned', `৳ ${money(sale.changeGiven)}`, { bold: true })}
        {line('Amount received', `৳ ${money(received)}`, { bold: true, rule: true })}
        {line(
          settled ? 'Balance due' : 'Balance still due',
          `৳ ${money(due)}`,
          { bold: true, tone: due > 0 ? 'due' : undefined },
        )}
      </div>

      {/* ---- Standing ---- */}
      <div style={{
        marginTop: '12px', textAlign: 'center', fontWeight: 800, letterSpacing: '0.08em',
        fontSize: '13px', color: settled ? '#047857' : '#b91c1c',
        border: `2px solid ${settled ? '#047857' : '#b91c1c'}`,
        borderRadius: '4px', padding: '5px',
      }}>
        {settled ? 'PAID IN FULL' : `DUE ৳ ${money(due)}`}
      </div>

      {/* ---- Signatures ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '30px', marginTop: '42px' }}>
        <div style={{ flex: 1, borderTop: '1px solid #111827', paddingTop: '4px', textAlign: 'center', fontSize: '11px' }}>
          Customer Signature
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ flex: 1, borderTop: '1px solid #111827', paddingTop: '4px', textAlign: 'center', fontSize: '11px' }}>
          Received by · {sale.salesmanName}
        </div>
      </div>

      <div style={{
        marginTop: '18px', paddingTop: '8px', borderTop: '1px solid #e5e7eb',
        fontSize: '10px', color: '#4b5563', textAlign: 'center', lineHeight: 1.6,
      }}>
        {shopProfile?.footer_disclaimer_1 && <div>{shopProfile.footer_disclaimer_1}</div>}
        <div style={{ marginTop: '3px', fontWeight: 600, color: '#111827' }}>
          Thank you for shopping with us.
        </div>
      </div>
    </div>
  );
};

export default PaymentVoucher;
