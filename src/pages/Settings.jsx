import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import useStore from '../store/useStore';
import { COLOR_PLATE } from '../utils/accent';
import { Check, RotateCcw, ShieldCheck, CheckSquare, Square, Save, Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import ColorPicker from '../components/ColorPicker';
import { DASHBOARD_CARDS, cardColor } from '../utils/dashboardCards';
import './Settings.css';
import { t } from '../utils/i18n';
import { printBarcodeLabels, labelSpecFrom, LABEL_SHOP_NAME } from '../utils/printLabels';
import {
  SYSTEM_MENUS,
  DEFAULT_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_MENU_PATHS,
  getEffectivePermissions,
} from '../utils/navigationConfig';

// What the sale template can refer to. Shown under the box so the shop can
// edit the wording without guessing at the names.
const TEMPLATE_TOKENS = ['{shop}', '{invoice}', '{customer}', '{total}', '{paid}', '{due}', '{date}', '{phone}'];

const themeOptions = [
  { id: 'theme-sky', name: 'Sky Blue', color1: '#0284c7', color2: '#0ea5e9' },
  { id: 'theme-emerald', name: 'Emerald Green', color1: '#059669', color2: '#10b981' },
  { id: 'theme-purple', name: 'Royal Purple', color1: '#7c3aed', color2: '#8b5cf6' },
  { id: 'theme-rose', name: 'Rose Red', color1: '#e11d48', color2: '#f43f5e' },
  { id: 'theme-amber', name: 'Amber Gold', color1: '#d97706', color2: '#f59e0b' },
  { id: 'theme-indigo', name: 'Deep Indigo', color1: '#4f46e5', color2: '#6366f1' },
];

const Settings = () => {
  const themeGradient = useStore((state) => state.themeGradient) || 'theme-sky';
  const setThemeGradient = useStore((state) => state.setThemeGradient);
  const smsSettings = useStore((state) => state.smsSettings);
  const updateSmsSettings = useStore((state) => state.updateSmsSettings);
  const shopProfile = useStore((state) => state.shopProfile);
  const accentColor = useStore((state) => state.accentColor);
  const setAccentColor = useStore((state) => state.setAccentColor);
  const dashboardCardColors = useStore((state) => state.dashboardCardColors);
  const setDashboardCardColor = useStore((state) => state.setDashboardCardColor);
  const resetDashboardCardColors = useStore((state) => state.resetDashboardCardColors);
  // Which dashboard card's picker is open. One at a time; nine open pickers
  // would be a wall.
  const [openCard, setOpenCard] = useState(null);
  const saveShopProfile = useStore((state) => state.saveShopProfile);
  const language = useStore((state) => state.language);
  const bn = language === 'bn';

  const rolePermissions = useStore((state) => state.rolePermissions);
  const updateRolePermissions = useStore((state) => state.updateRolePermissions);
  const staff = useStore((state) => state.staff);

  const availableRoles = Array.from(
    new Set([
      ...DEFAULT_ROLES,
      ...(staff || []).map((s) => s.role).filter(Boolean),
    ])
  );

  const user = useStore((state) => state.user);
  const changePassword = useStore((state) => state.changePassword);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    if (!oldPwd.trim()) {
      toast.warning(bn ? 'বর্তমান পাসওয়ার্ড দিন।' : 'Please enter current password.');
      return;
    }
    if (!newPwd.trim()) {
      toast.warning(bn ? 'নতুন পাসওয়ার্ড দিন।' : 'Please enter new password.');
      return;
    }
    if (newPwd.length < 4) {
      toast.warning(bn ? 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' : 'New password must be at least 4 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error(bn ? 'নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.');
      return;
    }
    setSavingPwd(true);
    const res = await changePassword(oldPwd.trim(), newPwd.trim(), confirmPwd.trim());
    setSavingPwd(false);
    if (res.ok) {
      toast.success(res.message || (bn ? 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!' : 'Password changed successfully!'));
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } else {
      toast.error(res.message || (bn ? 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।' : 'Failed to change password.'));
    }
  };

  const [selectedRole, setSelectedRole] = useState('Manager');
  const [selectedMenuPaths, setSelectedMenuPaths] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    const effective = getEffectivePermissions(rolePermissions);
    setSelectedMenuPaths(effective[selectedRole] || DEFAULT_ROLE_PERMISSIONS[selectedRole] || ['/']);
  }, [selectedRole, rolePermissions]);

  const handleToggleMenu = (path) => {
    if (selectedRole === 'Admin') return;
    const nextPaths = selectedMenuPaths.includes(path)
      ? selectedMenuPaths.filter((p) => p !== path)
      : [...selectedMenuPaths, path];
    setSelectedMenuPaths(nextPaths);
    updateRolePermissions(selectedRole, nextPaths);
  };

  const handleSelectAll = () => {
    if (selectedRole === 'Admin') return;
    setSelectedMenuPaths(ALL_MENU_PATHS);
    updateRolePermissions(selectedRole, ALL_MENU_PATHS);
  };

  const handleDeselectAll = () => {
    if (selectedRole === 'Admin') return;
    const minPaths = ['/'];
    setSelectedMenuPaths(minPaths);
    updateRolePermissions(selectedRole, minPaths);
  };

  const handleResetRoleToDefault = () => {
    if (selectedRole === 'Admin') return;
    const defaultPaths = DEFAULT_ROLE_PERMISSIONS[selectedRole] || ['/'];
    setSelectedMenuPaths(defaultPaths);
    updateRolePermissions(selectedRole, defaultPaths);
    toast.info(bn ? `${selectedRole} রোলের পারমিশন ডিফল্টে ফেরানো হয়েছে` : `${selectedRole} reset to default permissions`);
  };

  const handleSavePermissions = async () => {
    if (selectedRole === 'Admin') {
      toast.info(bn ? 'এডমিনের সকল মেনুর স্থায়ী অনুমতি রয়েছে।' : 'Admin retains permanent access to all menus.');
      return;
    }
    setSavingPermissions(true);
    const res = await updateRolePermissions(selectedRole, selectedMenuPaths);
    setSavingPermissions(false);
    if (res?.ok) {
      toast.success(
        bn
          ? `${selectedRole} রোলের জন্য মেনু পারমিশন সংরক্ষিত হয়েছে!`
          : `Menu permissions saved for ${selectedRole}!`
      );
    }
  };

  // The template is edited locally and saved on demand -- saving on every
  // keystroke would post a request per letter typed.
  const [template, setTemplate] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (shopProfile?.sms_sale_template !== undefined) {
      setTemplate(shopProfile.sms_sale_template || '');
    }
  }, [shopProfile?.sms_sale_template]);

  const smsOnSale = shopProfile?.sms_on_sale ?? true;

  // Sticker size, edited locally and saved on demand like the template.
  const [label, setLabel] = useState({ width: 40, height: 25, perRow: 1 });
  const [savingLabel, setSavingLabel] = useState(false);
  useEffect(() => {
    if (shopProfile) setLabel(labelSpecFrom(shopProfile));
  }, [shopProfile]);

  const saveLabel = async () => {
    const w = Number(label.width), h = Number(label.height);
    if (!(w >= 15 && w <= 120) || !(h >= 10 && h <= 120)) {
      toast.error(bn ? 'স্টিকারের মাপ ১০–১২০ মিমি-এর মধ্যে দিন।' : 'Sticker size must be between 10 and 120 mm.');
      return;
    }
    setSavingLabel(true);
    const res = await saveShopProfile({ label_width_mm: w, label_height_mm: h, labels_per_row: Number(label.perRow) || 1 });
    setSavingLabel(false);
    if (res?.ok) toast.success(bn ? 'স্টিকারের মাপ সেভ হয়েছে।' : 'Sticker size saved.');
  };

  const testLabel = () => {
    printBarcodeLabels(
      { id: '8941170000013', name: 'Sample Product', variant: 'M', category_name: 'Shirt', price: 700, mrp: 1000 },
      1, LABEL_SHOP_NAME, { width: Number(label.width), height: Number(label.height), perRow: Number(label.perRow) },
    );
  };

  // What the colour controls should show as selected: the custom pick if there
  // is one, otherwise the accent of whichever preset theme is active.
  const activeHex = accentColor
    || themeOptions.find((t) => t.id === themeGradient)?.color1
    || '#0284c7';

  const toggleSaleSms = async (enabled) => {
    const res = await saveShopProfile({ sms_on_sale: enabled });
    if (res?.ok) {
      toast.success(
        enabled
          ? (bn ? 'প্রতিটি বিক্রয়ে কাস্টমারকে এসএমএস যাবে।' : 'Every sale will now text the customer.')
          : (bn ? 'বিক্রয়ের এসএমএস বন্ধ করা হয়েছে।' : 'Sale confirmation SMS switched off.')
      );
    }
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    const res = await saveShopProfile({ sms_sale_template: template });
    setSavingTemplate(false);
    if (res?.ok) toast.success(bn ? 'মেসেজ সেভ হয়েছে।' : 'Message saved.');
  };

  // Bengali text costs more than twice as much per SMS, so the cost of the
  // wording is shown while it is being written rather than discovered on the
  // provider's bill.
  const isUnicode = /[^ -]/.test(template);
  const perMessage = isUnicode ? 70 : 160;
  const parts = Math.max(1, Math.ceil((template.length || 1) / perMessage));

  return (
    <div className="settings-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Settings' || 'App Settings')}</h1>
          <p className="text-muted">{language === 'bn' ? 'আপনার দোকানের সেটিংস এবং থিম কনফিগার করুন।' : 'Configure your shop settings and appearance.'}</p>
        </div>
      </div>
      
      <div className="card glass">
        <h3 style={{ marginBottom: '0.35rem' }}>{language === 'bn' ? 'অ্যাপের রং' : 'App Colour'}</h3>
        <p className="text-muted" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
          {language === 'bn'
            ? 'প্লেট থেকে যেকোনো রং বেছে নিন, অথবা নিজের পছন্দের রং বসান। বাটন, অ্যাকটিভ মেনু আর ফোকাস — সব এই রঙে বদলে যাবে।'
            : 'Pick any colour from the plate, or set one of your own. Buttons, the active menu item and focused fields all follow it.'}
        </p>

        <div className="colour-plate">
          {COLOR_PLATE.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={`swatch ${activeHex.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setAccentColor(c.hex)}
              title={`${c.name} · ${c.hex}`}
              aria-label={c.name}
            >
              {activeHex.toLowerCase() === c.hex.toLowerCase() && <Check size={16} />}
            </button>
          ))}
        </div>

        <div className="colour-custom">
          <ColorPicker value={activeHex} onChange={setAccentColor} language={language} />

          <div className="cc-side">
            <div className="cc-note">
              {language === 'bn'
                ? 'বক্সের ভেতরে টেনে গাঢ়তা ও উজ্জ্বলতা, নিচের রেইল টেনে রং বদলান। HEX কোড সরাসরি লিখেও দিতে পারেন।'
                : 'Drag inside the box for saturation and brightness, drag the rail for hue. You can also type a HEX code straight in.'}
            </div>

            <div className="cc-preview">
              <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                {language === 'bn' ? 'প্রিভিউ' : 'Preview'}
              </span>
              <span className="btn-primary" style={{ pointerEvents: 'none', height: '32px' }}>
                {language === 'bn' ? 'বাটন' : 'Button'}
              </span>
              <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                {language === 'bn' ? 'অ্যাকটিভ' : 'Active'}
              </span>
            </div>

            {accentColor && (
              <button type="button" className="btn-outline" onClick={() => setAccentColor('')}>
                <RotateCcw size={14} /> {language === 'bn' ? 'ডিফল্টে ফেরান' : 'Reset to theme'}
              </button>
            )}
          </div>
        </div>

        {/* The named themes stay as one-tap presets under the plate. */}
        <div className="preset-themes">
          <span className="pt-label">{language === 'bn' ? 'তৈরি থিম' : 'Preset themes'}</span>
          {themeOptions.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`pt-chip ${!accentColor && themeGradient === theme.id ? 'active' : ''}`}
              onClick={() => { setAccentColor(''); setThemeGradient(theme.id); }}
            >
              <span className="pt-dot" style={{ background: theme.color1 }} />
              {theme.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card glass mt-4">
        <div className="flex-align-gap" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <h3 style={{ margin: 0 }}>{language === 'bn' ? 'ড্যাশবোর্ড কার্ডের রং' : 'Dashboard Card Colours'}</h3>
          {Object.keys(dashboardCardColors || {}).length > 0 && (
            <button type="button" className="btn-outline" onClick={() => { resetDashboardCardColors(); setOpenCard(null); }}>
              <RotateCcw size={14} /> {language === 'bn' ? 'সব ডিফল্টে ফেরান' : 'Reset all'}
            </button>
          )}
        </div>
        <p className="text-muted" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
          {language === 'bn'
            ? 'ড্যাশবোর্ডের সারসংক্ষেপে প্রতিটি কার্ডের নিজস্ব রং। কোনো কার্ডে চাপ দিয়ে তার রং বদলান।'
            : 'Each card in the dashboard summary has its own colour. Tap a card to change it.'}
        </p>

        <div className="card-colour-grid">
          {DASHBOARD_CARDS.map((card) => {
            const colour = cardColor(card, dashboardCardColors);
            const isOpen = openCard === card.key;
            const changed = Boolean(dashboardCardColors?.[card.key]);
            return (
              <div key={card.key} className={`card-colour-row ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="card-colour-head"
                  onClick={() => setOpenCard(isOpen ? null : card.key)}
                  style={{ '--card': colour }}
                >
                  <span className="ccr-bar" />
                  <span className="ccr-swatch" />
                  <span className="ccr-name">{language === 'bn' ? card.bn : card.en}</span>
                  <span className="ccr-hex">{colour.toUpperCase()}</span>
                  {changed && <span className="ccr-changed">{language === 'bn' ? 'বদলানো' : 'custom'}</span>}
                </button>

                {isOpen && (
                  <div className="card-colour-body">
                    <ColorPicker
                      value={colour}
                      onChange={(hex) => setDashboardCardColor(card.key, hex)}
                      language={language}
                    />
                    <div className="flex-align-gap" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <div className="colour-plate compact">
                        {COLOR_PLATE.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            className={`swatch ${colour.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                            style={{ background: c.hex }}
                            onClick={() => setDashboardCardColor(card.key, c.hex)}
                            title={c.name}
                            aria-label={c.name}
                          />
                        ))}
                      </div>
                      {changed && (
                        <button type="button" className="btn-outline" onClick={() => setDashboardCardColor(card.key, '')}>
                          <RotateCcw size={14} /> {language === 'bn' ? 'ডিফল্ট' : 'Default'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card glass mt-4">
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-main)' }}>{bn ? 'বারকোড স্টিকার' : 'Barcode Sticker'}</h3>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>
          {bn
            ? 'আপনার রোলের একটা স্টিকারের মাপ দিন। প্রিন্টের পাতা ঠিক এই মাপের হবে — এর চেয়ে বড় দিলে প্রিন্টার একটা লেবেলে দুটো স্টিকার টেনে নেয়।'
            : 'Enter the size of one sticker on your roll. Each printed page is exactly this size — bigger than the sticker and the printer feeds two stickers per label.'}
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.3rem' }}>{bn ? 'প্রস্থ (মিমি)' : 'Width (mm)'}</label>
            <input type="number" min="15" max="120" step="0.5" value={label.width} onChange={(e) => setLabel({ ...label, width: e.target.value })} style={{ width: '110px' }} />
          </div>
          <div>
            <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.3rem' }}>{bn ? 'উচ্চতা (মিমি)' : 'Height (mm)'}</label>
            <input type="number" min="10" max="120" step="0.5" value={label.height} onChange={(e) => setLabel({ ...label, height: e.target.value })} style={{ width: '110px' }} />
          </div>
          <div>
            <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.3rem' }}>{bn ? 'এক সারিতে' : 'Per row'}</label>
            <select value={label.perRow} onChange={(e) => setLabel({ ...label, perRow: e.target.value })} style={{ width: '110px' }}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <button className="btn-primary" onClick={saveLabel} disabled={savingLabel}>{savingLabel ? (bn ? 'সেভ হচ্ছে…' : 'Saving…') : t(language, 'Save')}</button>
          <button className="btn-outline" onClick={testLabel}>{bn ? 'টেস্ট প্রিন্ট' : 'Test print'}</button>
        </div>
        <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.75rem', lineHeight: 1.6 }}>
          {bn
            ? 'সাধারণ মাপ: 40×25, 40×30, 50×30, 38×25 মিমি। প্রিন্টারের ড্রাইভারেও (Printing Preferences → Paper size) একই মাপ দিন, আর প্রিন্ট ডায়ালগে Scale = 100%, Margins = None রাখুন।'
            : 'Common sizes: 40×25, 40×30, 50×30, 38×25 mm. Set the same size in the printer driver (Printing Preferences → Paper size), and keep Scale = 100%, Margins = None in the print dialog.'}
        </div>
      </div>

      <div className="card glass mt-4">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>{t(language, 'SMS Automation' || 'SMS Automation')}</h3>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>{language === 'bn' ? 'নির্দিষ্ট ইভেন্টের জন্য গ্রাহকদের স্বয়ংক্রিয়ভাবে এসএমএস পাঠান।' : 'Automatically send SMS notifications to customers for specific events.'}</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smsOnSale}
              onChange={(e) => toggleSaleSms(e.target.checked)}
              style={{ width: '1.25rem', height: '1.25rem', marginTop: '0.2rem' }}
            />
            <span>
              <span style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>
                {t(language, 'Sales Confirmation SMS' || 'Sales Confirmation SMS')}
              </span>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                {bn
                  ? 'পিওএস-এ বিক্রয় হওয়ামাত্র কাস্টমারের নম্বরে চালানের এসএমএস চলে যাবে।'
                  : 'The moment a sale is rung up at the POS, the customer gets their invoice by SMS.'}
              </span>
            </span>
          </label>

          {smsOnSale && (
            <div style={{ paddingLeft: '2rem' }}>
              <label className="text-muted text-sm block mb-1" style={{ display: 'block', marginBottom: '0.4rem' }}>
                {bn ? 'যে মেসেজটি যাবে' : 'The message they receive'}
              </label>
              <textarea
                className="w-full"
                rows={6}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.4rem', lineHeight: 1.6 }}>
                {bn ? 'ব্যবহার করা যাবে: ' : 'Available placeholders: '}
                {TEMPLATE_TOKENS.map((token) => (
                  <code
                    key={token}
                    style={{
                      background: 'var(--bg-input, rgba(0,0,0,0.05))',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '5px',
                      marginRight: '0.3rem',
                    }}
                  >
                    {token}
                  </code>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={saveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? (bn ? 'সেভ হচ্ছে…' : 'Saving…') : t(language, 'Save')}
                </button>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  {template.length} {bn ? 'অক্ষর' : 'characters'} · {parts} SMS
                  {isUnicode
                    ? (bn ? ' (বাংলা লেখায় প্রতি এসএমএস ৭০ অক্ষর)' : ' (Bengali text: 70 characters per SMS)')
                    : (bn ? ' (ইংরেজি লেখায় প্রতি এসএমএস ১৬০ অক্ষর)' : ' (English text: 160 characters per SMS)')}
                </span>
              </div>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={smsSettings?.autoPaymentReceive} onChange={(e) => updateSmsSettings({ autoPaymentReceive: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
            <span style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>{t(language, 'Customer Payment SMS' || 'Customer Payment SMS')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={smsSettings?.autoDueReminder} onChange={(e) => updateSmsSettings({ autoDueReminder: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
            <span style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>{t(language, 'Due SMS Notification' || 'Due SMS Notification')}</span>
          </label>
        </div>
      </div>

      {/* Role & Menu Permissions Section */}
      <div className="card glass mt-4">
        <div className="role-permission-header">
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
              {bn ? 'রোল ও মেনু পারমিশন' : 'Role & Menu Permissions'}
            </h3>
            <p className="text-muted" style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
              {bn
                ? 'এডমিন ছাড়া অন্যান্য রোলের কর্মীরা কোন কোন মেনু দেখতে পারবে তা এখান থেকে নির্ধারণ করুন।'
                : 'Configure which menus each staff role can view and access in the system.'}
            </p>
          </div>
          {selectedRole !== 'Admin' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSavePermissions}
              disabled={savingPermissions}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Save size={16} />
              {savingPermissions ? (bn ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : (bn ? 'পারমিশন সেভ করুন' : 'Save Permissions')}
            </button>
          )}
        </div>

        {/* Role Selector Chips */}
        <div className="role-chips-container">
          <span className="pt-label" style={{ marginRight: '0.5rem' }}>
            {bn ? 'রোল সিলেক্ট করুন:' : 'Select Role:'}
          </span>
          {availableRoles.map((role) => {
            const isActive = selectedRole === role;
            const effective = getEffectivePermissions(rolePermissions);
            const count = (effective[role] || DEFAULT_ROLE_PERMISSIONS[role] || []).length;
            return (
              <button
                key={role}
                type="button"
                className={`role-chip-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedRole(role)}
              >
                <span>{role}</span>
                <span className="role-count">{role === 'Admin' ? (bn ? 'সকল' : 'All') : `${count}`}</span>
              </button>
            );
          })}
        </div>

        {/* Admin Note or Role Actions */}
        {selectedRole === 'Admin' ? (
          <div className="role-admin-notice">
            <ShieldCheck size={22} style={{ flexShrink: 0 }} />
            <div>
              <strong>{bn ? 'এডমিন রোলের সম্পূর্ণ এক্সেস রয়েছে' : 'Admin Role has full access'}</strong>
              <div style={{ fontSize: '0.82rem', marginTop: '0.2rem', opacity: 0.9 }}>
                {bn
                  ? 'নিরাপত্তা ও স্বাভাবিক পরিচালনার স্বার্থে এডমিন অ্যাকাউন্টের জন্য সকল মেনু ও সেটিংস স্থায়ীভাবে সক্রিয় থাকে।'
                  : 'For security and administration, the Admin role permanently retains access to all menus and settings.'}
              </div>
            </div>
          </div>
        ) : (
          <div className="role-actions-bar">
            <div className="role-actions-left">
              <span className="text-muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                {bn ? `${selectedRole} রোলের জন্য ${selectedMenuPaths.length}টি মেনু সক্রিয়:` : `${selectedMenuPaths.length} menus enabled for ${selectedRole}:`}
              </span>
              <button type="button" className="btn-outline" onClick={handleSelectAll} style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}>
                <CheckSquare size={13} /> {bn ? 'সব নির্বাচন' : 'Select All'}
              </button>
              <button type="button" className="btn-outline" onClick={handleDeselectAll} style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}>
                <Square size={13} /> {bn ? 'সব বাতিল' : 'Deselect All'}
              </button>
              <button type="button" className="btn-outline" onClick={handleResetRoleToDefault} style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}>
                <RotateCcw size={13} /> {bn ? 'ডিফল্টে ফেরান' : 'Reset'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSavePermissions}
                disabled={savingPermissions}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}
              >
                <Save size={13} />
                {savingPermissions ? (bn ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : (bn ? 'পারমিশন সেভ করুন' : 'Save Permissions')}
              </button>
            </div>
          </div>
        )}

        {/* Grouped Permission Grids */}
        <div className="permission-sections">
          {/* Operations Group */}
          <div className="permission-section">
            <div className="permission-group-title">
              <span>{bn ? 'দৈনন্দিন কাজ (Operations)' : 'Operations Menus'}</span>
              <span className="permission-group-badge">
                {SYSTEM_MENUS.filter((m) => m.group === 'ops' && (selectedRole === 'Admin' || selectedMenuPaths.includes(m.path))).length} / {SYSTEM_MENUS.filter((m) => m.group === 'ops').length}
              </span>
            </div>
            <div className="permission-grid">
              {SYSTEM_MENUS.filter((m) => m.group === 'ops').map((menu) => {
                const isChecked = selectedRole === 'Admin' || selectedMenuPaths.includes(menu.path);
                const Icon = menu.icon;
                return (
                  <div
                    key={menu.id}
                    className={`permission-card ${isChecked ? 'active' : ''} ${selectedRole === 'Admin' ? 'disabled' : ''}`}
                    onClick={() => handleToggleMenu(menu.path)}
                  >
                    <div className="permission-icon">
                      <Icon size={16} />
                    </div>
                    <div className="permission-details">
                      <span className="permission-label">{bn ? menu.nameBn : menu.nameEn}</span>
                      <span className="permission-path">{menu.path}</span>
                    </div>
                    <div className="permission-check-box">
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Management Group */}
          <div className="permission-section" style={{ marginTop: 'var(--sp-2)' }}>
            <div className="permission-group-title">
              <span>{bn ? 'ব্যবস্থাপনা ও রিপোর্ট (Management)' : 'Management & Reports'}</span>
              <span className="permission-group-badge">
                {SYSTEM_MENUS.filter((m) => m.group === 'admin' && (selectedRole === 'Admin' || selectedMenuPaths.includes(m.path))).length} / {SYSTEM_MENUS.filter((m) => m.group === 'admin').length}
              </span>
            </div>
            <div className="permission-grid">
              {SYSTEM_MENUS.filter((m) => m.group === 'admin').map((menu) => {
                const isChecked = selectedRole === 'Admin' || selectedMenuPaths.includes(menu.path);
                const Icon = menu.icon;
                return (
                  <div
                    key={menu.id}
                    className={`permission-card ${isChecked ? 'active' : ''} ${selectedRole === 'Admin' ? 'disabled' : ''}`}
                    onClick={() => handleToggleMenu(menu.path)}
                  >
                    <div className="permission-icon">
                      <Icon size={16} />
                    </div>
                    <div className="permission-details">
                      <span className="permission-label">{bn ? menu.nameBn : menu.nameEn}</span>
                      <span className="permission-path">{menu.path}</span>
                    </div>
                    <div className="permission-check-box">
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Security & Password Change Section */}
      <div className="card glass mt-4">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
              <Lock size={20} style={{ color: 'var(--primary)' }} />
              {bn ? 'নিরাপত্তা ও পাসওয়ার্ড পরিবর্তন' : 'Security & Change Password'}
            </h3>
            <p className="text-muted" style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
              {bn
                ? 'আপনার একাউন্টের লগইন পাসওয়ার্ড সুরক্ষিত রাখতে এখান থেকে পরিবর্তন করতে পারেন।'
                : 'Keep your login password secure by updating it regularly.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {bn ? 'ব্যবহারকারী' : 'User'}: <strong>{user?.username}</strong> ({user?.role || 'Admin'})
            </span>
          </div>
        </div>

        <form onSubmit={handlePasswordChangeSubmit} style={{ maxWidth: '560px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                {bn ? 'বর্তমান পাসওয়ার্ড *' : 'Current Password *'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showOldPwd ? 'text' : 'password'}
                  required
                  className="w-full"
                  placeholder={bn ? 'আপনার বর্তমান পাসওয়ার্ড দিন' : 'Enter current password'}
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  style={{ paddingRight: '2.5rem', height: '42px', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowOldPwd(!showOldPwd)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: 0,
                  }}
                >
                  {showOldPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                  {bn ? 'নতুন পাসওয়ার্ড *' : 'New Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    minLength={4}
                    className="w-full"
                    placeholder={bn ? 'কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড' : 'Min 4 characters'}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    style={{ paddingRight: '2.5rem', height: '42px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                      padding: 0,
                    }}
                  >
                    {showNewPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-muted text-sm" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                  {bn ? 'পাসওয়ার্ড নিশ্চিত করুন *' : 'Confirm Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    required
                    className="w-full"
                    placeholder={bn ? 'পুনরায় নতুন পাসওয়ার্ড লিখুন' : 'Re-enter new password'}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    style={{ paddingRight: '2.5rem', height: '42px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                      padding: 0,
                    }}
                  >
                    {showConfirmPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            </div>

            {confirmPwd && newPwd && (
              <div style={{ fontSize: '0.8rem' }}>
                {confirmPwd === newPwd ? (
                  <span style={{ color: '#16a34a' }}>✓ {bn ? 'পাসওয়ার্ড মিলেছে' : 'Passwords match'}</span>
                ) : (
                  <span style={{ color: '#dc2626' }}>✗ {bn ? 'পাসওয়ার্ড মিলছে না' : 'Passwords do not match'}</span>
                )}
              </div>
            )}

            <div>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingPwd}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.4rem' }}
              >
                <Lock size={15} />
                {savingPwd
                  ? (bn ? 'পরিবর্তন হচ্ছে…' : 'Updating…')
                  : (bn ? 'পাসওয়ার্ড সংরক্ষণ করুন' : 'Change Password')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
