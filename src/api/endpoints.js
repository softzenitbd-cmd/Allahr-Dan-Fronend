// Every path the app talks to, in one place.
// All of them end in a slash: Django's routers require it, and a redirect
// would drop the body of a POST.

export const ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login/',
  REGISTER: '/auth/register/',
  PROFILE: '/auth/profile/',
  CHANGE_PASSWORD: '/auth/change-password/',
  TOKEN_REFRESH: '/auth/token/refresh/',
  USERS: '/auth/users/',

  // Inventory
  PRODUCTS: '/inventory/products/',
  PRODUCT: (code) => `/inventory/products/${encodeURIComponent(code)}/`,
  BARCODE_SEARCH: '/inventory/products/barcode-search/',
  CATEGORIES: '/inventory/categories/',
  CATEGORY: (id) => `/inventory/categories/${encodeURIComponent(id)}/`,
  UNITS: '/inventory/units/',
  UNIT: (id) => `/inventory/units/${encodeURIComponent(id)}/`,
  STOCK_LOGS: '/inventory/stock-logs/',
  STOCK_LOGS_SUMMARY: '/inventory/stock-logs/summary/',

  // Contacts
  CUSTOMERS: '/contacts/customers/',
  CUSTOMER: (code) => `/contacts/customers/${encodeURIComponent(code)}/`,
  CUSTOMER_RESTORE: (code) => `/contacts/customers/${encodeURIComponent(code)}/restore/`,
  CUSTOMER_HARD_DELETE: (code) => `/contacts/customers/${encodeURIComponent(code)}/hard-delete/`,
  SUPPLIERS: '/contacts/suppliers/',
  SUPPLIER: (code) => `/contacts/suppliers/${encodeURIComponent(code)}/`,
  SUPPLIER_RESTORE: (code) => `/contacts/suppliers/${encodeURIComponent(code)}/restore/`,
  SUPPLIER_HARD_DELETE: (code) => `/contacts/suppliers/${encodeURIComponent(code)}/hard-delete/`,

  // Sales
  INVOICES: '/sales/invoices/',
  INVOICE: (id) => `/sales/invoices/${encodeURIComponent(id)}/`,
  INVOICE_PAY_DUE: (id) => `/sales/invoices/${encodeURIComponent(id)}/pay-due/`,
  DRAFTS: '/sales/drafts/',
  DRAFT: (code) => `/sales/drafts/${encodeURIComponent(code)}/`,

  // Purchases
  PURCHASES: '/purchases/',
  PURCHASE: (id) => `/purchases/${encodeURIComponent(id)}/`,

  // Returns
  RETURNS: '/returns/',
  RETURN: (id) => `/returns/${encodeURIComponent(id)}/`,

  // Ledger
  SETTLEMENTS: '/ledger/settlements/',
  SETTLEMENT: (code) => `/ledger/settlements/${encodeURIComponent(code)}/`,
  SETTLE_DUE: '/ledger/settle-due/',
  STATEMENT: (type, id) => `/ledger/statement/${type}/${encodeURIComponent(id)}/`,
  PARTY_LEDGER: (type, id) => `/ledger/party/${type}/${encodeURIComponent(id)}/`,
  PAY_ALL: '/ledger/pay-all/',

  // Expenses
  EXPENSES: '/expenses/',
  EXPENSE: (id) => `/expenses/${encodeURIComponent(id)}/`,
  EXPENSE_CATEGORIES: '/expenses/categories/',
  EXPENSE_MONTHLY: '/expenses/monthly-report/',

  // HR
  STAFF: '/hr/staff/',
  STAFF_MEMBER: (code) => `/hr/staff/${encodeURIComponent(code)}/`,
  ATTENDANCE: '/hr/attendance/',
  ATTENDANCE_MARK: '/hr/attendance/mark/',
  LEAVES: '/hr/leaves/',
  LEAVE_STATUS: (id) => `/hr/leaves/${encodeURIComponent(id)}/status/`,
  PAYROLLS: '/hr/payrolls/',
  PAYROLL_GENERATE: '/hr/payrolls/generate/',

  // SR consignment (stock issued to a salesman, settled at end of day)
  SR_SETTLEMENTS: '/sr/settlements/',
  SR_SETTLEMENT: (code) => `/sr/settlements/${encodeURIComponent(code)}/`,
  SR_SETTLE: (code) => `/sr/settlements/${encodeURIComponent(code)}/settle/`,

  // Treasury (cash & bank)
  TREASURY_SUMMARY: '/treasury/summary/',
  TREASURY_ACCOUNTS: '/treasury/accounts/',
  TREASURY_TRANSACTIONS: '/treasury/transactions/',
  TREASURY_TRANSFER: '/treasury/transfer/',
  TREASURY_ENTRY: '/treasury/entry/',
  TREASURY_LOANS: '/treasury/loans/',

  // SMS
  SMS_SEND: '/sms/send/',
  SMS_BALANCE: '/sms/balance/',
  SMS_BUY: '/sms/buy/',
  SMS_HISTORY: '/sms/history/',

  // Reports
  REPORTS_SUMMARY: '/reports/summary/',
  REPORTS_DETAILS: '/reports/details/',
  REPORTS_BALANCE_SHEET: '/reports/balance-sheet/',
  REPORTS_DAY_BOOK: '/reports/day-book/',

  // Core
  SHOP_PROFILE: '/core/shop-profile/',
  USER_SETTINGS: '/core/user-settings/',
  ACTIVITY_LOGS: '/core/activity-logs/',
  LOG_CUSTOM_ACTIVITY: '/core/activity-logs/log-custom/',
};

export default ENDPOINTS;
