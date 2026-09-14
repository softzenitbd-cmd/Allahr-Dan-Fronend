import apiClient, { clearTokens, setTokens } from './client';
import { ENDPOINTS } from './endpoints';

// One thin function per call. The store is the only caller; pages never talk
// to these directly, which is what lets the pages stay exactly as they were.

export const AuthService = {
  login: async (username, password) => {
    const data = await apiClient.post(ENDPOINTS.LOGIN, { username, password });
    setTokens(data.access, data.refresh);
    return data.user;
  },
  profile: () => apiClient.get(ENDPOINTS.PROFILE),
  changePassword: (payload) => apiClient.post(ENDPOINTS.CHANGE_PASSWORD, payload),
  logout: () => clearTokens(),
};

export const ProductService = {
  list: (params) => apiClient.get(ENDPOINTS.PRODUCTS, { params }),
  create: (payload) => apiClient.post(ENDPOINTS.PRODUCTS, payload),
  update: (code, payload) => apiClient.patch(ENDPOINTS.PRODUCT(code), payload),
  remove: (code) => apiClient.delete(ENDPOINTS.PRODUCT(code)),
  byBarcode: (barcode) => apiClient.get(ENDPOINTS.BARCODE_SEARCH, { params: { barcode } }),
  categories: () => apiClient.get(ENDPOINTS.CATEGORIES),
  units: () => apiClient.get(ENDPOINTS.UNITS),

  // Category and Unit are reference tables the product form writes to
  // implicitly; these let a screen manage them directly.
  createCategory: (payload) => apiClient.post(ENDPOINTS.CATEGORIES, payload),
  updateCategory: (id, payload) => apiClient.patch(ENDPOINTS.CATEGORY(id), payload),
  removeCategory: (id) => apiClient.delete(ENDPOINTS.CATEGORY(id)),
  createUnit: (payload) => apiClient.post(ENDPOINTS.UNITS, payload),
  updateUnit: (id, payload) => apiClient.patch(ENDPOINTS.UNIT(id), payload),
  removeUnit: (id) => apiClient.delete(ENDPOINTS.UNIT(id)),
};

export const StockLogService = {
  // The audit trail of every stock movement. Always filtered: this table only
  // ever grows, so the server caps what it returns.
  list: (params) => apiClient.get(ENDPOINTS.STOCK_LOGS, { params }),
  summary: (params) => apiClient.get(ENDPOINTS.STOCK_LOGS_SUMMARY, { params }),
};

export const CustomerService = {
  list: (params) => apiClient.get(ENDPOINTS.CUSTOMERS, { params }),
  listDeleted: (params) => apiClient.get(ENDPOINTS.CUSTOMERS, { params: { ...params, is_deleted: 'true' } }),
  create: (payload) => apiClient.post(ENDPOINTS.CUSTOMERS, payload),
  update: (code, payload) => apiClient.patch(ENDPOINTS.CUSTOMER(code), payload),
  remove: (code) => apiClient.delete(ENDPOINTS.CUSTOMER(code)),
  restore: (code) => apiClient.post(ENDPOINTS.CUSTOMER_RESTORE(code)),
  hardDelete: (code) => apiClient.delete(ENDPOINTS.CUSTOMER_HARD_DELETE(code)),
};

export const SupplierService = {
  list: (params) => apiClient.get(ENDPOINTS.SUPPLIERS, { params }),
  listDeleted: (params) => apiClient.get(ENDPOINTS.SUPPLIERS, { params: { ...params, is_deleted: 'true' } }),
  create: (payload) => apiClient.post(ENDPOINTS.SUPPLIERS, payload),
  update: (code, payload) => apiClient.patch(ENDPOINTS.SUPPLIER(code), payload),
  remove: (code) => apiClient.delete(ENDPOINTS.SUPPLIER(code)),
  restore: (code) => apiClient.post(ENDPOINTS.SUPPLIER_RESTORE(code)),
  hardDelete: (code) => apiClient.delete(ENDPOINTS.SUPPLIER_HARD_DELETE(code)),
};

export const SaleService = {
  list: (params) => apiClient.get(ENDPOINTS.INVOICES, { params }),
  create: (payload) => apiClient.post(ENDPOINTS.INVOICES, payload),
  remove: (id) => apiClient.delete(ENDPOINTS.INVOICE(id)),
  // Money collected later against one invoice sold on Baki or Partial.
  payDue: (id, payload) => apiClient.post(ENDPOINTS.INVOICE_PAY_DUE(id), payload),
};

export const DraftService = {
  // A cart parked mid-sale: the customer went to fetch more, or is waiting on
  // a decision, and the counter needs to serve someone else meanwhile.
  list: () => apiClient.get(ENDPOINTS.DRAFTS),
  create: (payload) => apiClient.post(ENDPOINTS.DRAFTS, payload),
  remove: (code) => apiClient.delete(ENDPOINTS.DRAFT(code)),
};

export const PurchaseService = {
  list: (params) => apiClient.get(ENDPOINTS.PURCHASES, { params }),
  create: (payload) => apiClient.post(ENDPOINTS.PURCHASES, payload),
  remove: (id) => apiClient.delete(ENDPOINTS.PURCHASE(id)),
};

export const ReturnService = {
  list: (params) => apiClient.get(ENDPOINTS.RETURNS, { params }),
  create: (payload) => apiClient.post(ENDPOINTS.RETURNS, payload),
  remove: (id) => apiClient.delete(ENDPOINTS.RETURN(id)),
};

export const LedgerService = {
  settlements: (params) => apiClient.get(ENDPOINTS.SETTLEMENTS, { params }),
  settleDue: (payload) => apiClient.post(ENDPOINTS.SETTLE_DUE, payload),
  statement: (type, id) => apiClient.get(ENDPOINTS.STATEMENT(type, id)),
  // Everything about one customer, supplier or salesman, in one call.
  party: (type, id, params) => apiClient.get(ENDPOINTS.PARTY_LEDGER(type, id), { params }),
  // One payment spread across every invoice still owing, oldest first.
  payAll: (payload) => apiClient.post(ENDPOINTS.PAY_ALL, payload),
};

export const ExpenseService = {
  list: (params) => apiClient.get(ENDPOINTS.EXPENSES, { params }),
  create: (payload) => apiClient.post(ENDPOINTS.EXPENSES, payload),
  update: (id, payload) => apiClient.patch(ENDPOINTS.EXPENSE(id), payload),
  remove: (id) => apiClient.delete(ENDPOINTS.EXPENSE(id)),
  categories: () => apiClient.get(ENDPOINTS.EXPENSE_CATEGORIES),
};

export const HRService = {
  staff: () => apiClient.get(ENDPOINTS.STAFF),
  createStaff: (payload) => apiClient.post(ENDPOINTS.STAFF, payload),
  updateStaff: (code, payload) => apiClient.patch(ENDPOINTS.STAFF_MEMBER(code), payload),
  removeStaff: (code) => apiClient.delete(ENDPOINTS.STAFF_MEMBER(code)),

  attendance: (params) => apiClient.get(ENDPOINTS.ATTENDANCE, { params }),
  markAttendance: (payload) => apiClient.post(ENDPOINTS.ATTENDANCE_MARK, payload),

  leaves: () => apiClient.get(ENDPOINTS.LEAVES),
  createLeave: (payload) => apiClient.post(ENDPOINTS.LEAVES, payload),
  setLeaveStatus: (id, status) => apiClient.patch(ENDPOINTS.LEAVE_STATUS(id), { status }),

  payrolls: (params) => apiClient.get(ENDPOINTS.PAYROLLS, { params }),
  generatePayslip: (payload) => apiClient.post(ENDPOINTS.PAYROLL_GENERATE, payload),
};

export const SRService = {
  list: (params) => apiClient.get(ENDPOINTS.SR_SETTLEMENTS, { params }),
  // Morning: hand stock to a salesman. Deducts stock and opens a Pending day.
  issue: (payload) => apiClient.post(ENDPOINTS.SR_SETTLEMENTS, payload),
  // Night: take unsold goods back, record the cash, raise any shortfall.
  settle: (code, payload) => apiClient.post(ENDPOINTS.SR_SETTLE(code), payload),
  remove: (code) => apiClient.delete(ENDPOINTS.SR_SETTLEMENT(code)),
};

export const TreasuryService = {
  summary: () => apiClient.get(ENDPOINTS.TREASURY_SUMMARY),
  transactions: (params) => apiClient.get(ENDPOINTS.TREASURY_TRANSACTIONS, { params }),
  transfer: (payload) => apiClient.post(ENDPOINTS.TREASURY_TRANSFER, payload),
  entry: (payload) => apiClient.post(ENDPOINTS.TREASURY_ENTRY, payload),
  unwind: (reference_id) => apiClient.delete(ENDPOINTS.TREASURY_ENTRY, { params: { reference_id } }),
  // The karz book: money lent and borrowed, each with its repayments.
  loans: () => apiClient.get(ENDPOINTS.TREASURY_LOANS),
  createLoan: (payload) => apiClient.post(ENDPOINTS.TREASURY_LOANS, payload),
  payLoan: (loanId, payload) => apiClient.post(`${ENDPOINTS.TREASURY_LOANS}${loanId}/pay/`, payload),
  deleteLoan: (loanId) => apiClient.delete(`${ENDPOINTS.TREASURY_LOANS}${loanId}/`),
  deleteLoanPayment: (loanId, paymentId) => apiClient.delete(`${ENDPOINTS.TREASURY_LOANS}${loanId}/payments/${paymentId}/`),
  importLoans: (loans) => apiClient.post(`${ENDPOINTS.TREASURY_LOANS}import/`, { loans }),
};

export const SMSService = {
  balance: () => apiClient.get(ENDPOINTS.SMS_BALANCE),
  buy: (credits, cost) => apiClient.post(ENDPOINTS.SMS_BUY, { amount: credits, cost }),
  send: (message, customerIds, numbers) =>
    apiClient.post(ENDPOINTS.SMS_SEND, { message, customerIds, numbers }),
  history: () => apiClient.get(ENDPOINTS.SMS_HISTORY),
};

export const ReportService = {
  summary: () => apiClient.get(ENDPOINTS.REPORTS_SUMMARY),
  details: (params) => apiClient.get(ENDPOINTS.REPORTS_DETAILS, { params }),
  // Trading result, cash movement and the shop's position, in one call.
  balanceSheet: (params) => apiClient.get(ENDPOINTS.REPORTS_BALANCE_SHEET, { params }),
  dayBook: (params) => apiClient.get(ENDPOINTS.REPORTS_DAY_BOOK, { params }),
};

export const CoreService = {
  shopProfile: () => apiClient.get(ENDPOINTS.SHOP_PROFILE),
  saveShopProfile: (payload) => apiClient.put(ENDPOINTS.SHOP_PROFILE, payload),
  userSettings: () => apiClient.get(ENDPOINTS.USER_SETTINGS),
  saveUserSettings: (payload) => apiClient.post(ENDPOINTS.USER_SETTINGS, payload),
};
