import React from 'react';
import { takaInWords } from './InvoiceDocument';
import defaultLogo from '../assets/allah_dan.jpeg';

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Professional Thermal Receipt Component (80mm / 3-inch roll format)
 * Specially designed with safe margins, deep black high-contrast text,
 * item & invoice discount display, and shop logo for thermal printers.
 */
const ThermalReceipt = ({ sale, shopProfile, domId = 'printable-thermal-receipt', language = 'bn' }) => {
  if (!sale) return null;

  const shopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allah Dan Gents Point');

  const received = Number(sale.totalReceived ?? sale.paid_amount ?? sale.paidAtSale) || 0;
  const due = Number(sale.due ?? sale.due_amount ?? sale.dueRemaining) || 0;
  const totalUnits = (sale.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);

  // Calculate total item discount if any
  const totalItemDiscount = (sale.items || []).reduce((sum, it) => {
    const d = Number(it.itemDiscount || it.item_discount || it.discount || 0);
    const q = Number(it.quantity) || 1;
    return sum + (d * q);
  }, 0);

  const invDiscount = Number(sale.invoiceDiscount || sale.invoice_discount || 0);

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
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Safe margin container */}
      <div style={{ width: '100%', boxSizing: 'border-box', padding: '0 4px', color: '#000000' }}>
        
        {/* ---- Header & Logo ---- */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <img
            src={shopProfile?.logo || defaultLogo}
            alt="Logo"
            style={{
              maxHeight: '48px',
              maxWidth: '90px',
              objectFit: 'contain',
              margin: '0 auto 4px auto',
              display: 'block',
              filter: 'grayscale(100%) contrast(160%)',
            }}
          />
          <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.02em', lineHeight: 1.2, textTransform: 'uppercase', color: '#000000' }}>
            {shopName}
          </div>
          {shopProfile?.tagline && (
            <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '2px', color: '#000000' }}>
              {shopProfile.tagline}
            </div>
          )}
          {shopProfile?.address && (
            <div style={{ fontSize: '9.5px', fontWeight: 600, marginTop: '2px', color: '#000000' }}>
              {shopProfile.address}
            </div>
          )}
          {(shopProfile?.phone || shopProfile?.whatsapp) && (
            <div style={{ fontSize: '9.5px', fontWeight: 700, marginTop: '1px', color: '#000000' }}>
              {shopProfile.phone ? `Mob: ${shopProfile.phone}` : ''}
              {shopProfile.whatsapp ? ` | WA: ${shopProfile.whatsapp}` : ''}
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

        {/* ---- Receipt Title & Meta ---- */}
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '12px', letterSpacing: '0.05em', margin: '3px 0', color: '#000000' }}>
          {language === 'bn' ? 'ক্যাশ মেমো / ইনভয়েস' : 'CASH MEMO / INVOICE'}
        </div>

        <div style={{ fontSize: '10px', lineHeight: 1.4, margin: '4px 0', color: '#000000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'চালান নং:' : 'Invoice No:'}</span>
            <span style={{ fontWeight: 900, color: '#000000' }}>{sale.invoice_number || sale.id}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'তারিখ ও সময়:' : 'Date & Time:'}</span>
            <span style={{ fontWeight: 700, color: '#000000' }}>
              {sale.date ? new Date(sale.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
              {' '}
              {sale.date ? new Date(sale.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
            </span>
          </div>
          {(sale.salesman?.name || sale.salesmanName || sale.salesman_name) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'বিক্রেতা:' : 'Salesman:'}</span>
              <span style={{ fontWeight: 700, color: '#000000' }}>{sale.salesman?.name || sale.salesmanName || sale.salesman_name}</span>
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

        {/* ---- Customer Info ---- */}
        <div style={{ fontSize: '10px', lineHeight: 1.4, margin: '4px 0', color: '#000000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'ক্রেতা:' : 'Customer:'}</span>
            <span style={{ fontWeight: 800, maxWidth: '160px', textAlign: 'right', color: '#000000' }}>
              {sale.customer?.name || sale.customerName || sale.customerInfo?.name || (language === 'bn' ? 'খুচরা ক্রেতা' : 'Retail Customer')}
            </span>
          </div>
          {(sale.customer?.phone || sale.customer_phone || sale.customerInfo?.phone) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'মোবাইল:' : 'Phone:'}</span>
              <span style={{ fontWeight: 700, color: '#000000' }}>{sale.customer?.phone || sale.customer_phone || sale.customerInfo?.phone}</span>
            </div>
          )}
          {(sale.customer?.address || sale.customer_location || sale.customerInfo?.location) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'ঠিকানা:' : 'Address:'}</span>
              <span style={{ fontWeight: 600, maxWidth: '160px', textAlign: 'right', color: '#000000' }}>
                {sale.customer?.address || sale.customer_location || sale.customerInfo?.location}
              </span>
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

        {/* ---- Items Table ---- */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', margin: '4px 0', color: '#000000' }}>
          <thead>
            <tr style={{ borderBottom: '1px dashed #000000' }}>
              <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 900, color: '#000000' }}>{language === 'bn' ? 'পণ্য' : 'Item'}</th>
              <th style={{ textAlign: 'center', padding: '3px 2px', fontWeight: 900, width: '36px', color: '#000000' }}>{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
              <th style={{ textAlign: 'right', padding: '3px 2px', fontWeight: 900, width: '46px', color: '#000000' }}>{language === 'bn' ? 'দর' : 'Rate'}</th>
              <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 900, width: '50px', color: '#000000' }}>{language === 'bn' ? 'মোট' : 'Total'}</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((item, idx) => {
              const itemDisc = Number(item.itemDiscount || item.item_discount || item.discount || 0);
              const unitPrice = Number(item.price) || 0;
              const effectiveRate = Math.max(0, unitPrice - itemDisc);
              const itemQty = Number(item.quantity) || 1;
              const itemTotal = Number(item.total ?? item.total_price ?? (effectiveRate * itemQty)) || 0;

              return (
                <tr key={idx} style={{ borderBottom: '1px dashed #cccccc' }}>
                  <td style={{ padding: '3px 0', verticalAlign: 'top', color: '#000000' }}>
                    <div style={{ fontWeight: 800, color: '#000000' }}>{item.name}</div>
                    {item.variant && <div style={{ fontSize: '9px', fontWeight: 600, color: '#000000' }}>{item.variant}</div>}
                    {item.isGift && (
                      <span style={{ fontSize: '8.5px', fontWeight: 900, border: '1px solid #000000', padding: '0 2px', color: '#000000' }}>
                        GIFT
                      </span>
                    )}
                    {itemDisc > 0 && (
                      <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#000000' }}>
                        {language === 'bn' ? 'ছাড়:' : 'Disc:'} -৳{money(itemDisc)}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', padding: '3px 2px', verticalAlign: 'top', fontWeight: 700, color: '#000000' }}>
                    {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 2px', verticalAlign: 'top', color: '#000000' }}>
                    {itemDisc > 0 ? (
                      <>
                        <div style={{ textDecoration: 'line-through', fontSize: '8.5px', color: '#000000', fontWeight: 600 }}>{money(unitPrice)}</div>
                        <div style={{ fontWeight: 800, color: '#000000' }}>{money(effectiveRate)}</div>
                      </>
                    ) : (
                      <div style={{ fontWeight: 700, color: '#000000' }}>{money(unitPrice)}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top', fontWeight: 900, color: '#000000' }}>
                    ৳{money(itemTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

        {/* ---- Totals & Financials ---- */}
        <div style={{ fontSize: '10.5px', lineHeight: 1.5, color: '#000000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'মোট পণ্য:' : 'Total Items:'}</span>
            <span style={{ fontWeight: 800, color: '#000000' }}>{(sale.items || []).length} items ({totalUnits} pcs)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'সাবটোটাল:' : 'Subtotal:'}</span>
            <span style={{ fontWeight: 800, color: '#000000' }}>৳{money(sale.subtotal)}</span>
          </div>

          {totalItemDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000000' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'পণ্য ছাড় (Item Disc):' : 'Item Discount:'}</span>
              <span style={{ fontWeight: 800, color: '#000000' }}>-৳{money(totalItemDiscount)}</span>
            </div>
          )}

          {invDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000000' }}>
              <span style={{ fontWeight: 700, color: '#000000' }}>{language === 'bn' ? 'ইনভয়েস ছাড়:' : 'Invoice Discount:'}</span>
              <span style={{ fontWeight: 900, color: '#000000' }}>-৳{money(invDiscount)}</span>
            </div>
          )}

          {/* Grand Total Highlight */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1.5px solid #000000',
            borderBottom: '1.5px solid #000000',
            padding: '3px 0',
            margin: '4px 0',
            fontWeight: 900,
            fontSize: '13px',
            color: '#000000',
          }}>
            <span>{language === 'bn' ? 'সর্বমোট বিল:' : 'NET PAYABLE:'}</span>
            <span>৳{money(sale.total)}</span>
          </div>

          {/* Payment info */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'পেমেন্ট মেথড:' : 'Payment Method:'}</span>
            <span style={{ fontWeight: 800, color: '#000000' }}>
              {sale.paymentType === 'Cash' ? (language === 'bn' ? 'নগদ (Cash)' : 'Cash') :
               sale.paymentType === 'Baki' ? (language === 'bn' ? 'বাকি (Credit)' : 'Credit/Baki') :
               sale.paymentType === 'Partial' ? (language === 'bn' ? 'আংশিক (Partial)' : 'Partial') :
               sale.paymentType}
            </span>
          </div>
          {(sale.mfsTrxId || (sale.notes && sale.notes.includes('TrxID'))) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#000000' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'ট্রানজ্যাকশন আইডি:' : 'Trx ID:'}</span>
              <span style={{ fontWeight: 800, color: '#000000' }}>{sale.mfsTrxId || sale.notes}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, color: '#000000' }}>{language === 'bn' ? 'জমা / পরিশোধ:' : 'Paid Amount:'}</span>
            <span style={{ fontWeight: 900, color: '#000000' }}>৳{money(received)}</span>
          </div>

          {due > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '11px', color: '#000000' }}>
              <span>{language === 'bn' ? 'বর্তমান বকেয়া:' : 'Balance Due:'}</span>
              <span>৳{money(due)}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#000000' }}>
              <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'বকেয়া:' : 'Due:'}</span>
              <span style={{ fontWeight: 800, color: '#000000' }}>৳0.00 ({language === 'bn' ? 'পরিশোধিত' : 'PAID'})</span>
            </div>
          )}

          {sale.cashReceived > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#000000' }}>
                <span style={{ fontWeight: 600, color: '#000000' }}>{language === 'bn' ? 'কাস্টমার দিয়েছে:' : 'Cash Tendered:'}</span>
                <span style={{ fontWeight: 700, color: '#000000' }}>৳{money(sale.cashReceived)}</span>
              </div>
              {sale.changeGiven > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 800, color: '#000000' }}>
                  <span>{language === 'bn' ? 'ফেরত টাকা (Change):' : 'Change Returned:'}</span>
                  <span>৳{money(sale.changeGiven)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Double divider */}
        <div style={{ borderTop: '2px double #000000', margin: '6px 0' }} />

        {/* Amount in words */}
        <div style={{ fontSize: '9.5px', fontWeight: 700, fontStyle: 'italic', textAlign: 'center', margin: '2px 0', color: '#000000' }}>
          {takaInWords(sale.total)}
        </div>

        {/* Dashed divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

        {/* ---- Footer & Disclaimer ---- */}
        <div style={{ textAlign: 'center', fontSize: '9.5px', lineHeight: 1.4, marginTop: '4px', color: '#000000' }}>
          <div style={{ fontWeight: 900, fontSize: '10.5px', marginBottom: '2px', color: '#000000' }}>
            {language === 'bn' ? '*** ধন্যবাদ! আবার আসবেন ***' : '*** THANK YOU! VISIT AGAIN ***'}
          </div>
          {shopProfile?.footer_disclaimer_1 && (
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#000000' }}>{shopProfile.footer_disclaimer_1}</div>
          )}
          <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#000000', marginTop: '3px' }}>
            Software by SoftZen IT (01700-000000)
          </div>
        </div>

      </div>
    </div>
  );
};

export default ThermalReceipt;
