import React from 'react';
import { takaInWords } from './InvoiceDocument';
import defaultLogo from '../assets/allah_dan.jpeg';

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Printable Payment Voucher / Money Receipt component.
 *
 * Supports both standard A4/Sheet printing and 80mm POS Thermal receipt printing.
 * - For Customer: MONEY RECEIPT (টাকা প্রাপ্তি রসিদ)
 * - For Supplier: PAYMENT VOUCHER (টাকা পরিশোধ ভাউচার)
 */
const PrintablePayment = ({
  settlement,
  party,
  shopProfile,
  operatorName = 'Admin',
  domId = 'printable-payment-receipt',
  isThermal = false,
  language = 'bn',
}) => {
  if (!settlement) return null;

  const isBn = language === 'bn';
  const isSupplier = (settlement.type || settlement.settlement_type) === 'Supplier';

  const docTitle = isSupplier
    ? (isBn ? 'টাকা পরিশোধ ভাউচার (Payment Voucher)' : 'PAYMENT VOUCHER')
    : (isBn ? 'টাকা প্রাপ্তি রসিদ (Money Receipt)' : 'MONEY RECEIPT');

  const partyTypeLabel = isSupplier
    ? (isBn ? 'প্রাপক (সরবরাহকারী)' : 'Paid To (Supplier)')
    : (isBn ? 'প্রদানকারী (গ্রাহক)' : 'Received From (Customer)');

  const shopName = (isBn && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || "Allah'r Dan Gents Point");

  const address = shopProfile?.address || 'Dhaka, Bangladesh';
  const phone = shopProfile?.phone || shopProfile?.whatsapp || '';

  const amount = Number(settlement.amount || 0);
  const previousDue = Number(settlement.previousDue ?? settlement.previous_due ?? 0);
  const remainingDue = Number(settlement.remainingDue ?? settlement.remaining_due ?? Math.max(0, previousDue - amount));
  const isCleared = remainingDue <= 0;

  const partyName = party?.name || settlement.partyName || settlement.targetName || settlement.targetId || '-';
  const partyPhone = party?.phone || settlement.partyPhone || settlement.phone || '';
  const partyAddress = party?.location || party?.address || settlement.address || '';
  const partyCode = party?.id || party?.customer_code || party?.supplier_code || settlement.targetId || '';

  const receiptNo = settlement.receiptNo || settlement.id || settlement.settlement_code || 'REC-' + Date.now().toString().slice(-6);
  const dateStr = settlement.date
    ? new Date(settlement.date).toLocaleDateString(isBn ? 'bn-BD' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString(isBn ? 'bn-BD' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const paymentMethod = settlement.method || settlement.paymentMethod || settlement.payment_method || 'Cash';
  const notes = settlement.notes || '';

  // -------------------------------------------------------------------------
  // Thermal 80mm Layout
  // -------------------------------------------------------------------------
  if (isThermal) {
    return (
      <div
        id={domId}
        className="thermal-receipt"
        style={{
          width: '100%',
          maxWidth: '78mm',
          margin: '0 auto',
          padding: '4px 2px',
          background: '#fff',
          color: '#000',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: '11px',
          lineHeight: 1.35,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <img
            src={shopProfile?.logo || defaultLogo}
            alt="Logo"
            style={{
              maxHeight: '70px',
              maxWidth: '135px',
              objectFit: 'contain',
              margin: '0 auto 6px auto',
              display: 'block',
              filter: 'grayscale(100%) contrast(160%)',
            }}
          />
          <div style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase' }}>{shopName}</div>
          {address && <div style={{ fontSize: '10px' }}>{address}</div>}
          {phone && <div style={{ fontSize: '10px' }}>Mob: {phone}</div>}
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
          <div style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            {isSupplier ? 'PAYMENT VOUCHER' : 'MONEY RECEIPT'}
          </div>
          <div style={{ fontSize: '9px', textTransform: 'uppercase' }}>
            {isCleared ? '*** FULLY SETTLED ***' : '*** PARTIAL PAYMENT ***'}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0', fontSize: '10.5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Receipt: <strong>{receiptNo}</strong></span>
            <span>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Method: <strong>{paymentMethod}</strong></span>
            <span>{timeStr}</span>
          </div>
        </div>

        <div style={{ margin: '5px 0', fontSize: '11px' }}>
          <div>{partyTypeLabel}:</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{partyName}</div>
          {partyPhone && <div>Phone: {partyPhone}</div>}
          {partyAddress && <div>Address: {partyAddress}</div>}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '2px 0' }}>Previous Due (পূর্বের বকেয়া):</td>
              <td style={{ textAlign: 'right', fontWeight: '600' }}>৳{money(previousDue)}</td>
            </tr>
            <tr style={{ fontWeight: 'bold', fontSize: '12px' }}>
              <td style={{ padding: '3px 0' }}>Amount Paid (জমা/পরিশোধ):</td>
              <td style={{ textAlign: 'right' }}>৳{money(amount)}</td>
            </tr>
            <tr style={{ borderTop: '1px dashed #000', fontWeight: 'bold', fontSize: '12px' }}>
              <td style={{ padding: '4px 0' }}>Remaining Due (অবশিষ্ট বকেয়া):</td>
              <td style={{ textAlign: 'right', color: isCleared ? '#000' : '#d00' }}>৳{money(remainingDue)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />

        <div style={{ fontSize: '10px', fontStyle: 'italic', marginBottom: '8px' }}>
          In Words: {takaInWords(amount)}
        </div>

        {notes && (
          <div style={{ fontSize: '10px', marginBottom: '8px' }}>
            Note: {notes}
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '12px', borderTop: '1px dotted #000', paddingTop: '6px' }}>
          <div>Served by: {operatorName}</div>
          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>Thank you!</div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Standard A4 / Sheet Layout
  // -------------------------------------------------------------------------
  return (
    <div
      id={domId}
      style={{
        padding: '28px 32px',
        background: '#fff',
        color: '#0f172a',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        maxWidth: '680px',
        margin: '0 auto',
        boxSizing: 'border-box',
        fontSize: '12.5px',
        lineHeight: 1.5,
      }}
    >
      {/* Letterhead */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <img
          src={shopProfile?.logo || defaultLogo}
          alt="Logo"
          style={{
            maxHeight: '75px',
            maxWidth: '160px',
            objectFit: 'contain',
            margin: '0 auto 8px auto',
            display: 'block',
          }}
        />
        <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', textTransform: 'uppercase' }}>
          {shopName}
        </div>
        {address && <div style={{ color: '#475569', fontSize: '11.5px', marginTop: '2px' }}>{address}</div>}
        {phone && (
          <div style={{ color: '#475569', fontSize: '11.5px' }}>
            Phone: {phone}
          </div>
        )}
      </div>

      <div style={{ borderTop: '2px solid #0f172a', margin: '10px 0 14px' }} />

      {/* Document Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div
          style={{
            border: '2px solid #0f172a',
            borderRadius: '4px',
            padding: '5px 14px',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#0f172a',
          }}
        >
          {docTitle}
        </div>

        <div
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            border: isCleared ? '1px solid #16a34a' : '1px solid #ea580c',
            color: isCleared ? '#16a34a' : '#ea580c',
            backgroundColor: isCleared ? '#f0fdf4' : '#fff7ed',
          }}
        >
          {isCleared ? (isBn ? 'সম্পূর্ণ পরিশোধিত (Cleared)' : 'Cleared') : (isBn ? 'বকেয়া অবশিষ্ট রয়েছে (Balance Remains)' : 'Balance Remains')}
        </div>
      </div>

      {/* Party Details and Voucher Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', marginBottom: '16px' }}>
        {/* Party Card */}
        <div style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: 700, marginBottom: '6px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '3px' }}>
            {partyTypeLabel}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{partyName}</div>
          {partyPhone && <div style={{ color: '#334155', fontSize: '11.5px', marginTop: '2px' }}>Phone: <strong>{partyPhone}</strong></div>}
          {partyAddress && <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>Address: {partyAddress}</div>}
          {partyCode && <div style={{ color: '#64748b', fontSize: '10.5px', marginTop: '2px' }}>ID / Code: {partyCode}</div>}
        </div>

        {/* Receipt Meta */}
        <div style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: 700, marginBottom: '6px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '3px' }}>
            {isBn ? 'রসিদ বিবরণ (Receipt Info)' : 'Receipt Information'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '95px 1fr', rowGap: '3px', fontSize: '11.5px' }}>
            <span style={{ color: '#64748b' }}>Receipt No:</span>
            <strong style={{ color: '#0f172a' }}>{receiptNo}</strong>
            <span style={{ color: '#64748b' }}>Date:</span>
            <span>{dateStr}</span>
            <span style={{ color: '#64748b' }}>Method:</span>
            <span style={{ fontWeight: 600 }}>{paymentMethod}</span>
            <span style={{ color: '#64748b' }}>Received By:</span>
            <span>{operatorName}</span>
          </div>
        </div>
      </div>

      {/* Financial Breakdown Table */}
      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginBottom: '14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#334155' }}>
                {isBn ? 'বিবরণ (Particulars)' : 'Particulars'}
              </th>
              <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#334155', width: '140px' }}>
                {isBn ? 'পরিমাণ (Amount)' : 'Amount (BDT)'}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 14px', color: '#475569' }}>
                {isBn ? 'পূর্বের মোট বকেয়া (Previous Balance Due)' : 'Previous Due Balance'}
              </td>
              <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>
                ৳{money(previousDue)}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f0fdf4' }}>
              <td style={{ padding: '9px 14px', fontWeight: 700, color: '#15803d' }}>
                {isSupplier ? (isBn ? 'এই ভাউচারে পরিশোধকৃত টাকা (Paid on this Voucher)' : 'Amount Paid on this Voucher') : (isBn ? 'এই রসিদে জমা টাকা (Paid on this Receipt)' : 'Amount Paid on this Receipt')}
              </td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: '#15803d', fontSize: '14px' }}>
                &minus; ৳{money(amount)}
              </td>
            </tr>
            <tr style={{ background: isCleared ? '#f8fafc' : '#fef2f2' }}>
              <td style={{ padding: '10px 14px', fontWeight: 800, color: isCleared ? '#15803d' : '#b91c1c' }}>
                {isBn ? 'বর্তমান অবশিষ্ট বকেয়া (Remaining Balance Due)' : 'Remaining Balance Due'}
              </td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: isCleared ? '#15803d' : '#b91c1c', fontSize: '15px' }}>
                ৳{money(remainingDue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11.5px', marginBottom: notes ? '8px' : '36px' }}>
        <strong style={{ color: '#475569' }}>In Words (কথায়): </strong>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{takaInWords(amount)}</span>
      </div>

      {notes && (
        <div style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11.5px', marginBottom: '36px' }}>
          <strong style={{ color: '#475569' }}>Note (মন্তব্য): </strong>
          <span>{notes}</span>
        </div>
      )}

      {/* Signature Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '40px', textAlign: 'center', marginTop: '45px', fontSize: '11px' }}>
        <div>
          <div style={{ borderTop: '1px solid #0f172a', margin: '0 20px', paddingTop: '6px', fontWeight: 600 }}>
            {isSupplier ? (isBn ? 'সরবরাহকারী / গ্রহণকারীর স্বাক্ষর' : "Receiver's Signature") : (isBn ? 'গ্রাহক / প্রদানকারীর স্বাক্ষর' : "Customer's Signature")}
          </div>
        </div>
        <div>
          <div style={{ borderTop: '1px solid #0f172a', margin: '0 20px', paddingTop: '6px', fontWeight: 600 }}>
            {isBn ? 'অনুমোদিত স্বাক্ষর (কর্তৃপক্ষ)' : 'Authorized Signature'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintablePayment;
