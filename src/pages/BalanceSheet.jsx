import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer, RefreshCcw, TrendingUp, TrendingDown, Banknote,
  AlertCircle, Scale,
} from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { DEFAULT_SHOP_ADDRESS } from '../utils/shopConfig';
import './BalanceSheet.css';

/**
 * The shop's books on one page.
 *
 * Three statements, in the order a shopkeeper actually asks the questions:
 * what did the shop earn and what did that cost (profit & loss), how much of
 * it has actually been collected and where the money moved (cash), and what
 * the shop is worth once stock, dues and debts are counted (position).
 *
 * The first two follow the chosen date range. The position does not: stock
 * levels and due balances are today's figures and the database keeps no
 * history of them, so dating them to a past day would be a guess.
 */

const money = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}৳${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const pct = (value) => `${(Number(value) || 0).toFixed(1)}%`;

/** YYYY-MM-DD in the shop's own timezone.
 *  toISOString() converts to UTC first, which in Bangladesh (UTC+6) turns the
 *  first of the month into the last day of the one before it. */
const iso = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The ranges worth a single click, resolved against today. */
const buildPresets = () => {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { id: 'today', label: { en: 'Today', bn: 'আজ' }, start: iso(today), end: iso(today) },
    { id: 'week', label: { en: 'This Week', bn: 'এই সপ্তাহ' }, start: iso(startOfWeek), end: iso(today) },
    { id: 'month', label: { en: 'This Month', bn: 'এই মাস' }, start: iso(startOfMonth), end: iso(today) },
    { id: 'lastMonth', label: { en: 'Last Month', bn: 'গত মাস' }, start: iso(lastMonthStart), end: iso(lastMonthEnd) },
    { id: 'year', label: { en: 'This Year', bn: 'এই বছর' }, start: iso(startOfYear), end: iso(today) },
  ];
};

/** One line of a statement: a label on the left, an amount on the right. */
const Row = ({ label, value, hint, variant = '' }) => (
  <div className={`bs-row ${variant}`}>
    <div className="bs-label">
      {label}
      {hint && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{hint}</div>}
    </div>
    <div className="bs-amount">{value}</div>
  </div>
);

const BalanceSheet = () => {
  const { fetchBalanceSheet, shopProfile, language } = useStore();
  const presets = useMemo(buildPresets, []);

  const [preset, setPreset] = useState('month');
  const [startDate, setStartDate] = useState(presets.find((p) => p.id === 'month').start);
  const [endDate, setEndDate] = useState(presets.find((p) => p.id === 'month').end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const bn = language === 'bn';

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchBalanceSheet({ start_date: startDate, end_date: endDate });
    if (res?.ok) setData(res.data);
    setLoading(false);
  }, [fetchBalanceSheet, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (p) => {
    setPreset(p.id);
    setStartDate(p.start);
    setEndDate(p.end);
  };

  const shopName = (bn && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allahr dan gents point');

  if (!data) {
    return (
      <div className="balancesheet-page animate-fade-in">
        <div className="page-header">
          <div>
            <h1>{bn ? 'ব্যালেন্স শিট' : 'Balance Sheet'}</h1>
            <p className="text-muted">
              {bn ? 'হিসাব তৈরি হচ্ছে…' : 'Building the statement…'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { sales, cogs, expenses, profit, purchases, returns, cashflow, position, period } = data;
  const isLoss = profit.isLoss;
  const outstanding = position.assets.customerDue;

  const heroes = [
    {
      key: 'sales',
      label: bn ? 'নিট বিক্রয়' : 'Net Sales',
      value: money(sales.netSales),
      hint: `${sales.invoiceCount} ${bn ? 'টি চালান' : 'invoices'}`,
      accent: '#3b82f6',
      Icon: TrendingUp,
    },
    {
      key: 'received',
      label: bn ? 'মোট আদায়' : 'Total Received',
      value: money(sales.totalReceived),
      hint: bn
        ? `কাউন্টারে ${money(sales.paidAtCounter)} + বকেয়া আদায় ${money(sales.dueCollected)}`
        : `${money(sales.paidAtCounter)} at counter + ${money(sales.dueCollected)} due collected`,
      accent: '#10b981',
      Icon: Banknote,
    },
    {
      key: 'due',
      label: bn ? 'কাস্টমার বকেয়া' : 'Customer Due',
      value: money(outstanding),
      hint: bn ? 'আজ পর্যন্ত মোট পাওনা' : 'total receivable as things stand',
      accent: '#ef4444',
      Icon: AlertCircle,
    },
    {
      key: 'profit',
      label: isLoss ? (bn ? 'নিট লোকসান' : 'Net Loss') : (bn ? 'নিট লাভ' : 'Net Profit'),
      value: money(Math.abs(profit.netProfit)),
      hint: `${pct(profit.netMargin)} ${bn ? 'মার্জিন' : 'margin'}`,
      accent: isLoss ? '#ef4444' : '#10b981',
      Icon: isLoss ? TrendingDown : TrendingUp,
    },
  ];

  const rangeLabel = `${period.startDate} → ${period.endDate}`;

  return (
    <div className="balancesheet-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{bn ? 'ব্যালেন্স শিট' : 'Balance Sheet'}</h1>
          <p className="text-muted">
            {bn
              ? 'বিক্রয়, খরচ, লাভ-লোকসান, নগদ প্রবাহ এবং দোকানের বর্তমান অবস্থা — এক পাতায়।'
              : 'Sales, costs, profit or loss, cash movement and what the shop is worth — on one page.'}
          </p>
        </div>
        <div className="flex-align-gap">
          <button className="btn-outline flex-align-gap" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
            {loading ? (bn ? 'লোড হচ্ছে…' : 'Loading…') : (bn ? 'রিফ্রেশ' : 'Refresh')}
          </button>
          <button
            className="btn-primary flex-align-gap"
            onClick={() => printElement('printable-balance-sheet', `Balance-Sheet-${period.startDate}-to-${period.endDate}`)}
          >
            <Printer size={16} /> {bn ? 'প্রিন্ট' : 'Print'}
          </button>
        </div>
      </div>

      {/* Period picker */}
      <div className="card glass mb-4" style={{ padding: '1rem' }}>
        <div className="bs-presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`bs-preset-btn ${preset === p.id ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {bn ? p.label.bn : p.label.en}
            </button>
          ))}
          <div className="field">
            <label>{bn ? 'শুরু' : 'From'}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPreset('custom'); }}
            />
          </div>
          <div className="field">
            <label>{bn ? 'শেষ' : 'To'}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPreset('custom'); }}
            />
          </div>
        </div>
      </div>

      <div className="bs-hero">
        {heroes.map(({ key, label, value, hint, accent, Icon }) => (
          <div className="bs-hero-card" key={key} style={{ '--accent': accent }}>
            <div className="flex-align-gap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div className="label">{label}</div>
                <div className="value" style={{ color: accent }}>{value}</div>
                <div className="hint">{hint}</div>
              </div>
              <Icon size={20} style={{ color: accent, opacity: 0.7, flex: '0 0 auto' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="bs-split">
        {/* ---------------------------------------------------------------- */}
        {/* Profit & Loss                                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="card glass bs-section">
          <h2>{bn ? 'লাভ-লোকসান হিসাব' : 'Profit & Loss'}</h2>
          <p className="bs-subtitle">{rangeLabel}</p>

          <Row label={bn ? 'মোট বিক্রয় (ডিসকাউন্টের আগে)' : 'Gross Sales'} value={money(sales.grossSales)} />
          {sales.totalDiscount > 0 && (
            <>
              <Row label={bn ? 'বাদ: ডিসকাউন্ট' : 'Less: Discounts'} value={money(sales.totalDiscount)} variant="deduct" />
              {sales.itemDiscount > 0 && (
                <Row label={bn ? 'আইটেম ডিসকাউন্ট' : 'Item discount'} value={money(sales.itemDiscount)} variant="sub" />
              )}
              {sales.invoiceDiscount > 0 && (
                <Row label={bn ? 'চালান ডিসকাউন্ট' : 'Invoice discount'} value={money(sales.invoiceDiscount)} variant="sub" />
              )}
            </>
          )}
          {sales.customerReturns > 0 ? (
            <>
              <Row label={bn ? 'নিট বিক্রয়' : 'Net Sales'} value={money(sales.netSales)} />
              <Row
                label={bn ? 'বাদ: কাস্টমার রিটার্ন' : 'Less: Customer returns'}
                hint={`${returns.customer.units} ${bn ? 'ইউনিট ফেরত' : 'units back'}`}
                value={money(sales.customerReturns)}
                variant="deduct"
              />
              <Row label={bn ? 'রিটার্ন বাদে বিক্রয়' : 'Sales after returns'} value={money(sales.netSalesAfterReturns)} variant="total" />
            </>
          ) : (
            <Row label={bn ? 'নিট বিক্রয়' : 'Net Sales'} value={money(sales.netSales)} variant="total" />
          )}

          <Row
            label={bn ? 'বাদ: বিক্রীত পণ্যের ক্রয়মূল্য' : 'Less: Cost of Goods Sold'}
            hint={`${cogs.unitsSold} ${bn ? 'ইউনিট বিক্রি · বিক্রির দিনের ক্রয়মূল্যে' : 'units sold · at cost on the day of sale'}${cogs.returnsCost > 0 ? ` · ${bn ? 'রিটার্নের' : 'less returns'} ${money(cogs.returnsCost)}` : ''}`}
            value={money(cogs.returnsCost > 0 ? cogs.netOfReturns : cogs.total)}
            variant="deduct"
          />
          {cogs.giftCost > 0 && (
            <Row label={bn ? 'এর মধ্যে গিফটের ক্রয়মূল্য' : 'of which gifts given away'} value={money(cogs.giftCost)} variant="sub" />
          )}

          <Row
            label={bn ? 'গ্রস লাভ' : 'Gross Profit'}
            hint={`${pct(profit.grossMargin)} ${bn ? 'মার্জিন' : 'margin'}`}
            value={money(profit.grossProfit)}
            variant="total"
          />

          <Row label={bn ? 'বাদ: পরিচালন খরচ' : 'Less: Operating Expenses'} value={money(expenses.total)} variant="deduct" />
          {expenses.categories.map((c) => (
            <Row key={c.category} label={c.category} value={money(c.amount)} variant="sub" />
          ))}

          <Row
            label={isLoss ? (bn ? 'নিট লোকসান' : 'Net Loss') : (bn ? 'নিট লাভ' : 'Net Profit')}
            value={money(profit.netProfit)}
            variant="headline"
          />

          {cogs.itemsMissingCost > 0 && (
            <div className="bs-note">
              {bn
                ? `${cogs.unitsMissingCost} ইউনিট পণ্যের ক্রয়মূল্য (cost price) দেওয়া নেই, তাই সেগুলোর খরচ শূন্য ধরা হয়েছে — আসল লাভ এর চেয়ে কম। স্টক পেজে ওই পণ্যগুলোর ক্রয়মূল্য বসালে হিসাব ঠিক হবে।`
                : `${cogs.unitsMissingCost} unit(s) sold have no cost price on the product, so they cost nothing here and the profit above reads high. Set their cost price in Inventory to correct it.`}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Collection                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="card glass bs-section">
          <h2>{bn ? 'বিক্রয় ও আদায়' : 'Sales & Collection'}</h2>
          <p className="bs-subtitle">{rangeLabel}</p>

          <Row label={bn ? 'নিট বিক্রয়' : 'Net Sales'} value={money(sales.netSales)} />
          <Row label={bn ? 'কাউন্টারে পরিশোধ' : 'Paid at the counter'} value={money(sales.paidAtCounter)} variant="sub" />
          <Row label={bn ? 'বাকিতে বিক্রয়' : 'Due Balance (due raised)'} value={money(sales.dueCreated)} variant="sub" />
          <Row label={bn ? 'পুরোনো বকেয়া আদায়' : 'Old dues collected'} value={money(sales.dueCollected)} />
          {sales.staffDueRecovered > 0 && (
            <Row label={bn ? 'এসআর/কর্মীর কাছ থেকে আদায়' : 'Recovered from SR / staff'} value={money(sales.staffDueRecovered)} />
          )}
          <Row label={bn ? 'সময়কালে মোট আদায়' : 'Total received in period'} value={money(sales.totalReceived)} variant="total" />

          {sales.giftValue > 0 && (
            <Row
              label={bn ? 'গিফট দেওয়া পণ্যের বিক্রয়মূল্য' : 'Goods given as gifts (retail value)'}
              value={money(sales.giftValue)}
              variant="sub"
            />
          )}

          <div className="bs-panel-title" style={{ marginTop: '1.25rem' }}>
            {bn ? 'পেমেন্ট অনুযায়ী' : 'By payment type'}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{bn ? 'ধরন' : 'Type'}</th>
                  <th style={{ textAlign: 'center' }}>{bn ? 'সংখ্যা' : 'Count'}</th>
                  <th style={{ textAlign: 'right' }}>{bn ? 'মোট' : 'Total'}</th>
                  <th style={{ textAlign: 'right' }}>{bn ? 'পরিশোধ' : 'Paid'}</th>
                  <th style={{ textAlign: 'right' }}>{bn ? 'বকেয়া' : 'Due'}</th>
                </tr>
              </thead>
              <tbody>
                {sales.byPaymentType.map((p) => (
                  <tr key={p.type}>
                    <td>{p.type}</td>
                    <td style={{ textAlign: 'center' }}>{p.count}</td>
                    <td style={{ textAlign: 'right' }}>{money(p.total)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>{money(p.paid)}</td>
                    <td style={{ textAlign: 'right', color: p.due > 0 ? 'var(--danger)' : undefined }}>{money(p.due)}</td>
                  </tr>
                ))}
                {sales.byPaymentType.length === 0 && (
                  <tr><td colSpan="5" className="text-center text-muted">{bn ? 'এই সময়ে কোনো বিক্রয় নেই।' : 'No sales in this period.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bs-split">
        {/* ---------------------------------------------------------------- */}
        {/* Purchases                                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="card glass bs-section">
          <h2>{bn ? 'ক্রয় ও পরিশোধ' : 'Purchases & Payments'}</h2>
          <p className="bs-subtitle">{rangeLabel}</p>

          <Row
            label={bn ? 'মোট ক্রয়' : 'Total purchases'}
            hint={`${purchases.count} ${bn ? 'টি ক্রয়' : 'purchases'}`}
            value={money(purchases.total)}
          />
          <Row label={bn ? 'হাতে হাতে পরিশোধ' : 'Paid on purchase'} value={money(purchases.paid)} variant="sub" />
          <Row label={bn ? 'বাকিতে ক্রয়' : 'Bought on credit'} value={money(purchases.dueCreated)} variant="sub" />
          <Row label={bn ? 'সাপ্লায়ারকে পরে পরিশোধ' : 'Paid to suppliers later'} value={money(purchases.paidLater)} />
          <Row
            label={bn ? 'সময়কালে সাপ্লায়ারকে মোট পরিশোধ' : 'Total paid to suppliers'}
            value={money(purchases.paid + purchases.paidLater)}
            variant="total"
          />

          {(returns.customer.count > 0 || returns.supplier.count > 0) && (
            <>
              <div className="bs-panel-title" style={{ marginTop: '1.25rem' }}>
                {bn ? 'রিটার্ন' : 'Returns'}
              </div>
              <Row
                label={bn ? 'কাস্টমার রিটার্ন (স্টকে ফেরত)' : 'Customer returns (back on the shelf)'}
                hint={`${returns.customer.units} ${bn ? 'ইউনিট' : 'units'}`}
                value={money(returns.customer.retailValue)}
              />
              <Row
                label={bn ? 'সাপ্লায়ারকে ফেরত' : 'Rejected to supplier'}
                hint={`${returns.supplier.units} ${bn ? 'ইউনিট' : 'units'}`}
                value={money(returns.supplier.costValue)}
              />
              <div className="bs-note">
                {bn
                  ? 'কাস্টমার রিটার্ন উপরের লাভ-লোকসানে বিক্রয় ও ক্রয়মূল্য দুটো থেকেই বাদ গেছে; সাপ্লায়ারকে ফেরত ক্রয় থেকে বাদ গেছে। টাকা ফেরত এই সিস্টেমে যায় না — পার্টির বকেয়ায় সমন্বয় হয়।'
                  : 'Customer returns are already taken off sales and cost of sales in the profit above; supplier rejects come off purchases. No cash moves on a return — it settles through the party\'s due.'}
              </div>
            </>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Cash flow                                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="card glass bs-section">
          <h2>{bn ? 'নগদ প্রবাহ' : 'Cash Flow'}</h2>
          <p className="bs-subtitle">{rangeLabel}</p>

          <Row label={bn ? 'শুরুর ব্যালেন্স' : 'Opening balance'} value={money(cashflow.openingTotal)} />
          <Row label={bn ? 'ক্যাশ' : 'Cash in hand'} value={money(cashflow.openingCash)} variant="sub" />
          <Row label={bn ? 'ব্যাংক' : 'Bank'} value={money(cashflow.openingBank)} variant="sub" />
          <Row label={bn ? 'মোট জমা (In)' : 'Money in'} value={money(cashflow.inflow)} />
          <Row label={bn ? 'মোট উত্তোলন (Out)' : 'Money out'} value={money(cashflow.outflow)} variant="deduct" />
          <Row label={bn ? 'শেষ ব্যালেন্স' : 'Closing balance'} value={money(cashflow.closingTotal)} variant="total" />
          <Row label={bn ? 'ক্যাশ' : 'Cash in hand'} value={money(cashflow.closingCash)} variant="sub" />
          <Row label={bn ? 'ব্যাংক' : 'Bank'} value={money(cashflow.closingBank)} variant="sub" />

          <div className="bs-panel-title" style={{ marginTop: '1.25rem' }}>
            {bn ? 'উৎস অনুযায়ী' : 'By source'}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{bn ? 'উৎস' : 'Source'}</th>
                  <th>{bn ? 'দিক' : 'Direction'}</th>
                  <th style={{ textAlign: 'center' }}>{bn ? 'সংখ্যা' : 'Count'}</th>
                  <th style={{ textAlign: 'right' }}>{bn ? 'পরিমাণ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {cashflow.bySource.map((row) => (
                  <tr key={`${row.source}-${row.direction}`}>
                    <td>{row.source}</td>
                    <td style={{ color: row.direction === 'In' ? 'var(--success)' : 'var(--danger)' }}>
                      {row.direction === 'In' ? (bn ? 'জমা' : 'In') : (bn ? 'উত্তোলন' : 'Out')}
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.count}</td>
                    <td style={{ textAlign: 'right' }}>{money(row.amount)}</td>
                  </tr>
                ))}
                {cashflow.bySource.length === 0 && (
                  <tr><td colSpan="4" className="text-center text-muted">{bn ? 'কোনো লেনদেন নেই।' : 'No transactions.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {cashflow.bySource.some((r) => r.source === 'Transfer') && (
            <div className="bs-note">
              {bn
                ? 'Transfer মানে ক্যাশ ও ব্যাংকের মধ্যে টাকা সরানো — এটি আয় বা খরচ নয়, তাই দুই দিকেই সমান দেখাবে।'
                : 'A Transfer only moves money between your own cash and bank, so it appears on both sides and is neither income nor cost.'}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Position                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="card glass bs-section">
        <div className="flex-align-gap" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h2>{bn ? 'দোকানের অবস্থা' : 'Financial Position'}</h2>
            <p className="bs-subtitle">
              {bn ? `আজকের হিসাবে (${position.asOf})` : `as things stand on ${position.asOf}`}
            </p>
          </div>
          <Scale size={22} style={{ color: 'var(--text-muted)' }} />
        </div>

        <div className="bs-split">
          <div>
            <div className="bs-panel-title">{bn ? 'সম্পদ (Assets)' : 'Assets'}</div>
            <Row label={bn ? 'হাতে নগদ' : 'Cash in hand'} value={money(position.assets.cash)} />
            <Row label={bn ? 'ব্যাংক' : 'Bank'} value={money(position.assets.bank)} />
            <Row
              label={bn ? 'স্টকের মূল্য (ক্রয়মূল্যে)' : 'Stock (at cost)'}
              hint={bn
                ? `বিক্রয়মূল্যে ${money(position.assets.stockAtRetail)}`
                : `${money(position.assets.stockAtRetail)} at selling price`}
              value={money(position.assets.stockAtCost)}
            />
            <Row label={bn ? 'কাস্টমারের কাছে পাওনা' : 'Receivable from customers'} value={money(position.assets.customerDue)} />
            {position.assets.staffDue > 0 && (
              <Row label={bn ? 'কর্মী/এসআর-এর কাছে পাওনা' : 'Receivable from staff / SR'} value={money(position.assets.staffDue)} />
            )}
            {position.assets.loansReceivable > 0 && (
              <Row label={bn ? 'কর্জ দেওয়া (পাওনা)' : 'Loans given (receivable)'} value={money(position.assets.loansReceivable)} />
            )}
            <Row label={bn ? 'মোট সম্পদ' : 'Total Assets'} value={money(position.assets.total)} variant="total" />
          </div>

          <div>
            <div className="bs-panel-title">{bn ? 'দায় (Liabilities)' : 'Liabilities'}</div>
            <Row label={bn ? 'সাপ্লায়ারকে দেনা' : 'Payable to suppliers'} value={money(position.liabilities.supplierDue)} />
            {position.liabilities.loansPayable > 0 && (
              <Row label={bn ? 'কর্জ নেওয়া (দেনা)' : 'Loans taken (payable)'} value={money(position.liabilities.loansPayable)} />
            )}
            <Row label={bn ? 'মোট দায়' : 'Total Liabilities'} value={money(position.liabilities.total)} variant="total" />

            <div className="bs-panel-title" style={{ marginTop: '1.5rem' }}>
              {bn ? 'মালিকানা' : "Owner's Equity"}
            </div>
            <Row
              label={bn ? 'নিট সম্পদ (সম্পদ − দায়)' : 'Net Worth (assets − liabilities)'}
              value={money(position.netWorth)}
              variant="headline"
            />
            <Row
              label={bn ? 'স্টকে জমে থাকা সম্ভাব্য লাভ' : 'Profit still sitting in stock'}
              hint={bn ? 'সব স্টক মার্কেট দামে বিক্রি হলে' : 'if every item sells at its marked price'}
              value={money(position.unrealisedStockProfit)}
              variant="sub"
            />
          </div>
        </div>
      </div>

      {/* The same statement, laid out for paper. printElement copies this into
          a document of its own, so the styling has to travel with it. */}
      <div style={{ display: 'none' }}>
        <PrintableStatement data={data} shopName={shopName} shopProfile={shopProfile} />
      </div>
    </div>
  );
};

/** The whole statement on one A4 page, in inline styles the print iframe keeps. */
const PrintableStatement = ({ data, shopName, shopProfile }) => {
  const { sales, cogs, expenses, profit, purchases, cashflow, position, period } = data;

  const line = (label, value, opts = {}) => (
    <div
      key={label}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: opts.indent ? '2px 0 2px 18px' : '4px 0',
        fontWeight: opts.bold ? 700 : 400,
        fontSize: opts.indent ? '0.78rem' : '0.85rem',
        color: opts.indent ? '#555' : '#000',
        borderTop: opts.rule ? '1px solid #000' : undefined,
        marginTop: opts.rule ? '4px' : undefined,
        paddingTop: opts.rule ? '6px' : undefined,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  const block = (title, rows) => (
    <div style={{ marginBottom: '1.1rem', breakInside: 'avoid' }}>
      <div style={{
        fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase',
        letterSpacing: '0.05em', borderBottom: '2px solid #000',
        paddingBottom: '3px', marginBottom: '6px',
      }}>
        {title}
      </div>
      {rows}
    </div>
  );

  return (
    <div id="printable-balance-sheet" style={{ padding: '1.25rem', background: '#fff', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{shopName}</h2>
        <div style={{ fontSize: '0.78rem', color: '#555' }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
        {shopProfile?.phone && <div style={{ fontSize: '0.78rem', color: '#555' }}>Mobile: {shopProfile.phone}</div>}
        <div style={{ marginTop: '0.5rem', fontWeight: 700, letterSpacing: '0.06em' }}>BALANCE SHEET</div>
        <div style={{ fontSize: '0.8rem' }}>Period: {period.startDate} to {period.endDate} ({period.days} days)</div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {block('Profit & Loss', [
            line('Gross Sales', money(sales.grossSales)),
            sales.totalDiscount > 0 ? line('Less: Discounts', money(sales.totalDiscount)) : null,
            line('Net Sales', money(sales.netSales), { bold: true, rule: true }),
            sales.customerReturns > 0 ? line('Less: Customer returns', money(sales.customerReturns)) : null,
            sales.customerReturns > 0 ? line('Sales after returns', money(sales.netSalesAfterReturns), { bold: true, rule: true }) : null,
            line('Less: Cost of Goods Sold', money(cogs.returnsCost > 0 ? cogs.netOfReturns : cogs.total)),
            line('Gross Profit', money(profit.grossProfit), { bold: true, rule: true }),
            line('Less: Operating Expenses', money(expenses.total)),
            ...expenses.categories.map((c) => line(c.category, money(c.amount), { indent: true })),
            line(profit.isLoss ? 'NET LOSS' : 'NET PROFIT', money(profit.netProfit), { bold: true, rule: true }),
          ])}

          {block('Sales & Collection', [
            line('Paid at the counter', money(sales.paidAtCounter)),
            line('Due Balance (due raised)', money(sales.dueCreated)),
            line('Old dues collected', money(sales.dueCollected)),
            line('Total received in period', money(sales.totalReceived), { bold: true, rule: true }),
          ])}

          {block('Purchases & Payments', [
            line('Total purchases', money(purchases.total)),
            line('Paid on purchase', money(purchases.paid)),
            line('Bought on credit', money(purchases.dueCreated)),
            line('Paid to suppliers later', money(purchases.paidLater)),
          ])}
        </div>

        <div style={{ flex: 1 }}>
          {block('Cash Flow', [
            line('Opening balance', money(cashflow.openingTotal)),
            line('Money in', money(cashflow.inflow)),
            line('Money out', money(cashflow.outflow)),
            line('Closing balance', money(cashflow.closingTotal), { bold: true, rule: true }),
            line('Cash in hand', money(cashflow.closingCash), { indent: true }),
            line('Bank', money(cashflow.closingBank), { indent: true }),
          ])}

          {block(`Position as on ${position.asOf}`, [
            line('ASSETS', '', { bold: true }),
            line('Cash in hand', money(position.assets.cash), { indent: true }),
            line('Bank', money(position.assets.bank), { indent: true }),
            line('Stock (at cost)', money(position.assets.stockAtCost), { indent: true }),
            line('Receivable from customers', money(position.assets.customerDue), { indent: true }),
            position.assets.staffDue > 0
              ? line('Receivable from staff / SR', money(position.assets.staffDue), { indent: true })
              : null,
            position.assets.loansReceivable > 0
              ? line('Loans given (receivable)', money(position.assets.loansReceivable), { indent: true })
              : null,
            line('Total Assets', money(position.assets.total), { bold: true, rule: true }),
            line('LIABILITIES', '', { bold: true }),
            line('Payable to suppliers', money(position.liabilities.supplierDue), { indent: true }),
            position.liabilities.loansPayable > 0
              ? line('Loans taken (payable)', money(position.liabilities.loansPayable), { indent: true })
              : null,
            line('Total Liabilities', money(position.liabilities.total), { bold: true, rule: true }),
            line('NET WORTH', money(position.netWorth), { bold: true, rule: true }),
          ])}
        </div>
      </div>

      {cogs.itemsMissingCost > 0 && (
        <div style={{ marginTop: '0.8rem', fontSize: '0.72rem', color: '#92400e' }}>
          Note: {cogs.unitsMissingCost} unit(s) sold carry no cost price, so the cost of goods sold —
          and therefore the profit — is only as accurate as the cost prices entered in Inventory.
        </div>
      )}

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '0.3rem', width: '170px', textAlign: 'center' }}>Prepared by</div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '0.3rem', width: '170px', textAlign: 'center' }}>Proprietor</div>
      </div>
    </div>
  );
};

export default BalanceSheet;
