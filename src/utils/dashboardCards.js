/**
 * The summary cards on the dashboard, in the order they appear.
 *
 * Kept apart from the Dashboard page so Settings can offer a colour control
 * for each one without the two drifting out of step. Every card ships with
 * its own default colour -- nine different ones -- so a glance tells the cards
 * apart before a single label is read.
 */
export const DASHBOARD_CARDS = [
  { key: 'totalBalance',   en: 'Total Balance (Cash + Home)', bn: 'মোট ব্যালেন্স (ক্যাশ + বাসা)', color: '#059669' },
  { key: 'todaySales',     en: "Today's Sales",               bn: 'আজকের বিক্রয়',                   color: '#0284c7' },
  { key: 'todayExpense',   en: "Today's Expense",             bn: 'আজকের খরচ',                     color: '#dc2626' },
  { key: 'todayProfit',    en: "Today's Net Profit",          bn: 'আজকের নিট লাভ',                 color: '#16a34a' },
  { key: 'monthlyProfit',  en: 'Monthly Profit',              bn: 'মাসিক লাভ',                     color: '#7c3aed' },
  { key: 'monthlyExpense', en: 'Monthly Expense',             bn: 'মাসিক খরচ',                     color: '#ea580c' },
  { key: 'inventoryValue', en: 'Inventory Value',             bn: 'স্টক ভ্যালু',                    color: '#0891b2' },
  { key: 'customerDue',    en: 'Customer Due',                bn: 'কাস্টমার বকেয়া',                color: '#d97706' },
  { key: 'supplierDue',    en: 'Supplier Due',                bn: 'সাপ্লায়ার বকেয়া',              color: '#be123c' },
];

/** The colour a card should be drawn in: the user's override, else its default. */
export const cardColor = (card, overrides) =>
  (overrides && overrides[card.key]) || card.color;
