import React from 'react';
import bkashLogoImg from '../assets/bkash_logo.png';
import nagadLogoImg from '../assets/nagad_logo.png';

/**
 * Official vector/image brand icons for WhatsApp, bKash, and Nagad.
 * Uses the exact official bKash & Nagad logo assets provided by user.
 * Designed to look stunning on-screen & PDF, and print with razor-sharp
 * high-contrast clarity on 58mm/80mm thermal POS receipt rolls.
 */

export const WhatsAppIcon = ({ size = 14, style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0, ...style }}
  >
    <path
      d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 6.46 17.5 2 12.04 2Z"
      fill="#25D366"
    />
    <path
      d="M17.47 14.39C17.18 14.25 15.73 13.54 15.46 13.44C15.19 13.34 15 13.29 14.81 13.58C14.62 13.87 14.07 14.52 13.9 14.71C13.73 14.9 13.56 14.92 13.27 14.78C12.98 14.64 12.04 14.33 10.93 13.34C10.07 12.57 9.49 11.62 9.32 11.33C9.15 11.04 9.3 10.88 9.45 10.74C9.58 10.61 9.74 10.39 9.89 10.22C10.04 10.05 10.09 9.93 10.19 9.73C10.29 9.53 10.24 9.36 10.17 9.22C10.1 9.08 9.52 7.65 9.28 7.07C9.05 6.51 8.81 6.58 8.64 6.57C8.48 6.56 8.29 6.56 8.1 6.56C7.91 6.56 7.6 6.63 7.33 6.92C7.06 7.21 6.3 7.92 6.3 9.36C6.3 10.8 7.35 12.19 7.5 12.38C7.65 12.57 9.56 15.52 12.49 16.78C13.19 17.08 13.74 17.26 14.16 17.4C14.86 17.62 15.5 17.59 16 17.51C16.56 17.43 17.72 16.81 17.96 16.13C18.2 15.45 18.2 14.87 18.13 14.75C18.06 14.63 17.76 14.53 17.47 14.39Z"
      fill="#ffffff"
    />
  </svg>
);

export const BkashIcon = ({ size = 14, style = {} }) => (
  <img
    src={bkashLogoImg}
    alt="bKash"
    width={size}
    height={size}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      display: 'inline-block',
      verticalAlign: '-2px',
      objectFit: 'contain',
      flexShrink: 0,
      borderRadius: '2px',
      ...style,
    }}
  />
);

export const NagadIcon = ({ size = 14, style = {} }) => (
  <img
    src={nagadLogoImg}
    alt="Nagad"
    width={size}
    height={size}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      display: 'inline-block',
      verticalAlign: '-2px',
      objectFit: 'contain',
      flexShrink: 0,
      borderRadius: '2px',
      ...style,
    }}
  />
);

/**
 * Extracts and formats the two shop phone numbers from shopProfile or raw string.
 * First phone has WhatsApp + bKash
 * Second phone has WhatsApp + Nagad
 */
export const getShopPhoneNumbers = (phoneStr) => {
  const raw = String(phoneStr || '').trim();
  const parts = raw.split(/[,/|\n]+/).map((s) => s.trim()).filter(Boolean);
  const firstPhone = parts[0] || '01811648721';
  const secondPhone = parts[1] || '01680448383';
  return { firstPhone, secondPhone };
};

/**
 * Layout component for phone numbers with WhatsApp, bKash, and Nagad logos.
 * @param {string} phone - raw phone string (e.g. "01811648721, 01680448383")
 * @param {string} mode - 'thermal' (stacked, centered) or 'invoice' (horizontal flex)
 * @param {number} iconSize - size in pixels
 */
export const ShopPhoneContact = ({ phone, mode = 'thermal', iconSize = 13.5, style = {} }) => {
  const { firstPhone, secondPhone } = getShopPhoneNumbers(phone);

  if (mode === 'thermal') {
    return (
      <div
        className="shop-phone-contact thermal-mode"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          marginTop: '4px',
          fontSize: '10.5px',
          fontWeight: 800,
          color: '#000000',
          lineHeight: 1.3,
          ...style,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <WhatsAppIcon size={iconSize} />
          <BkashIcon size={iconSize} />
          <span>{firstPhone}</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <WhatsAppIcon size={iconSize} />
          <NagadIcon size={iconSize} />
          <span>{secondPhone}</span>
        </div>
      </div>
    );
  }

  // Invoice mode (A4 format)
  return (
    <div
      className="shop-phone-contact invoice-mode"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
        marginTop: '3px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#111827',
        ...style,
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <WhatsAppIcon size={iconSize} />
        <BkashIcon size={iconSize} />
        <span>{firstPhone}</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <WhatsAppIcon size={iconSize} />
        <NagadIcon size={iconSize} />
        <span>{secondPhone}</span>
      </div>
    </div>
  );
};

export default ShopPhoneContact;
