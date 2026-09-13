import React from 'react';
import { takaInWords } from './InvoiceDocument';

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Professional Thermal Receipt Component (80mm / 3-inch roll format)
 * Specially designed with safe margins to prevent any clipping on thermal printers.
 */
const ThermalReceipt = ({ sale, shopProfile, domId = 'printable-thermal-receipt', language = 'bn' }) => {
  if (!sale) return null;

  const shopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allah Dan Gents Point');

  const received = Number(sale.totalReceived ?? sale.paidAtSale) || 0;
  const due = Number(sale.due) || 0;
  const settled = due <= 0;
  const totalUnits = (sale.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);

  return (
    <div
      id={domId}
      className="thermal-receipt"
      data-format="thermal"
      style={{
        width: '100%',
        maxWidth: '270px',
        margin: '0 auto',
        padding: '8px 10px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        fontSize: '11px',
        lineHeight: 1.35,
        boxSizing: 'border-box',
      }}
    >
      {/* Safe margin container - ensures margins persist even when innerHTML is rendered */}
      <div style={{ width: '100%', boxSizing: 'border-box', padding: '0 4px' }}>
        
        {/* ---- Header ---- */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.01em', lineHeight: 1.2, textTransform: 'uppercase' }}>
            {shopName}
          </div>
          {shopProfile?.tagline && (
            <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '2px', color: '#222' }}>
              {shopProfile.tagline}
            </div>
          )}
          {shopProfile?.address && (
            <div style={{ fontSize: '9.5px', marginTop: '2px', color: '#333' }}>
              {shopProfile.address}
            </div>
          )}
          {(shopProfile?.phone || shopProfile?.whatsapp) && (
            <div style={{ fontSize: '9.5px', marginTop: '1px', color: '#333' }}>
              {shopProfile.phone ? `Mob: ${shopProfile.phone}` : ''}
              {shopProfile.whatsapp ? ` | WA: ${shopProfile.whatsapp}` : ''}
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #333', margin: '5px 0' }} />

        {/* ---- Receipt Title & Meta ---- */}
        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '11.5px', letterSpacing: '0.05em', margin: '3px 0' }}>
          {language === 'bn' ? 'ক্যাশ মেমো / ইনভয়েস' : 'CASH MEMO / INVOICE'}
        </div>

        <div style={{ fontSize: '10px', margin: '4px 0', lineHeight: 1.45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'ইনভয়েস নং:' : 'Invoice No:'}</span>
            <span style={{ fontWeight: 800, fontSize: '11.5px' }}>{sale.invoiceNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'তারিখ ও সময়:' : 'Date & Time:'}</span>
            <span>
              {new Date(sale.date).toLocaleDateString('en-GB')}{' '}
              {new Date(sale.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'বিক্রেতা:' : 'Salesman:'}</span>
            <span style={{ fontWeight: 600 }}>{sale.salesmanName || 'Admin'}</span>
          </div>
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #333', margin: '5px 0' }} />

        {/* ---- Customer Info ---- */}
        <div style={{ fontSize: '10px', margin: '4px 0', lineHeight: 1.45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'ক্রেতার নাম:' : 'Customer:'}</span>
            <span style={{ fontWeight: 700 }}>{sale.customer?.name || 'Walk-in Customer'}</span>
          </div>
          {sale.customer?.phone && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#444' }}>{language === 'bn' ? 'মোবাইল:' : 'Phone:'}</span>
              <span style={{ fontWeight: 600 }}>{sale.customer.phone}</span>
            </div>
          )}
          {sale.customer?.address && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#444' }}>{language === 'bn' ? 'ঠিকানা:' : 'Address:'}</span>
              <span style={{ maxWidth: '160px', textAlign: 'right' }}>{sale.customer.address}</span>
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #333', margin: '5px 0' }} />

        {/* ---- Items Table ---- */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', margin: '4px 0' }}>
          <thead>
            <tr style={{ borderBottom: '1px dashed #333' }}>
              <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 800 }}>{language === 'bn' ? 'পণ্য' : 'Item'}</th>
              <th style={{ textAlign: 'center', padding: '3px 2px', fontWeight: 800, width: '36px' }}>{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
              <th style={{ textAlign: 'right', padding: '3px 2px', fontWeight: 800, width: '42px' }}>{language === 'bn' ? 'দর' : 'Rate'}</th>
              <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 800, width: '50px' }}>{language === 'bn' ? 'মোট' : 'Total'}</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px dotted #e5e5e5' }}>
                <td style={{ padding: '3px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  {item.variant && <div style={{ fontSize: '9px', color: '#555' }}>{item.variant}</div>}
                  {item.isGift && (
                    <span style={{ fontSize: '8.5px', fontWeight: 800, border: '1px solid #000', padding: '0 2px' }}>
                      GIFT
                    </span>
                  )}
                  {item.discount > 0 && (
                    <div style={{ fontSize: '8.5px', color: '#555' }}>
                      ছাড়: -৳{money(item.discount)}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '3px 2px', verticalAlign: 'top', fontWeight: 600 }}>
                  {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 2px', verticalAlign: 'top' }}>
                  {money(item.price)}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top', fontWeight: 700 }}>
                  ৳{money(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #333', margin: '5px 0' }} />

        {/* ---- Totals & Financials ---- */}
        <div style={{ fontSize: '10.5px', lineHeight: 1.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'মোট পণ্য:' : 'Total Items:'}</span>
            <span style={{ fontWeight: 600 }}>{(sale.items || []).length} items ({totalUnits} pcs)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'সাবটোটাল:' : 'Subtotal:'}</span>
            <span>৳{money(sale.subtotal)}</span>
          </div>

          {sale.invoiceDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000' }}>
              <span style={{ color: '#444' }}>{language === 'bn' ? 'বিশেষ ছাড়:' : 'Invoice Discount:'}</span>
              <span>-৳{money(sale.invoiceDiscount)}</span>
            </div>
          )}

          {/* Grand Total Highlight */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #000',
            borderBottom: '1px solid #000',
            padding: '3px 0',
            margin: '4px 0',
            fontWeight: 900,
            fontSize: '13px',
          }}>
            <span>{language === 'bn' ? 'সর্বমোট বিল:' : 'NET PAYABLE:'}</span>
            <span>৳{money(sale.total)}</span>
          </div>

          {/* Payment info */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#444' }}>{language === 'bn' ? 'পেমেন্ট মেথড:' : 'Payment Method:'}</span>
            <span style={{ fontWeight: 700 }}>
              {sale.paymentType === 'Cash' ? (language === 'bn' ? 'নগদ (Cash)' : 'Cash') :
               sale.paymentType === 'Baki' ? (language === 'bn' ? 'বাকি (Credit)' : 'Credit/Baki') :
               (language === 'bn' ? 'আংশিক (Partial)' : 'Partial')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>{language === 'bn' ? 'জমা / পরিশোধ:' : 'Paid Amount:'}</span>
            <span style={{ fontWeight: 800 }}>৳{money(received)}</span>
          </div>

          {due > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '11px' }}>
              <span>{language === 'bn' ? 'বর্তমান বকেয়া:' : 'Balance Due:'}</span>
              <span>৳{money(due)}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
              <span style={{ color: '#444' }}>{language === 'bn' ? 'বকেয়া:' : 'Due:'}</span>
              <span>৳0.00 ({language === 'bn' ? 'পরিশোধিত' : 'PAID'})</span>
            </div>
          )}

          {sale.cashReceived > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#444' }}>
                <span>{language === 'bn' ? 'কাস্টমার দিয়েছে:' : 'Cash Tendered:'}</span>
                <span>৳{money(sale.cashReceived)}</span>
              </div>
              {sale.changeGiven > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700 }}>
                  <span>{language === 'bn' ? 'ফেরত টাকা (Change):' : 'Change Returned:'}</span>
                  <span>৳{money(sale.changeGiven)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Double divider */}
        <div style={{ borderTop: '2px double #333', margin: '6px 0' }} />

        {/* Amount in words */}
        <div style={{ fontSize: '9px', fontStyle: 'italic', textAlign: 'center', margin: '2px 0', color: '#222' }}>
          {takaInWords(sale.total)}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #333', margin: '5px 0' }} />

        {/* ---- Footer & Disclaimer ---- */}
        <div style={{ textAlign: 'center', fontSize: '9.5px', lineHeight: 1.4, marginTop: '4px' }}>
          <div style={{ fontWeight: 800, fontSize: '10.5px', marginBottom: '2px' }}>
            {language === 'bn' ? '*** ধন্যবাদ! আবার আসবেন ***' : '*** THANK YOU! VISIT AGAIN ***'}
          </div>
          {shopProfile?.footer_disclaimer_1 && (
            <div style={{ fontSize: '8.5px', color: '#333' }}>{shopProfile.footer_disclaimer_1}</div>
          )}
          <div style={{ fontSize: '8px', color: '#666', marginTop: '3px' }}>
            Software by SoftZen IT (01700-000000)
          </div>
        </div>

      </div>
    </div>
  );
};

export default ThermalReceipt;
