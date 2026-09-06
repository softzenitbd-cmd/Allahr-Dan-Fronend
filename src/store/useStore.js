import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';

import { errorMessage } from '../api/client';
import {
  AuthService,
  CoreService,
  CustomerService,
  DraftService,
  ExpenseService,
  HRService,
  LedgerService,
  ProductService,
  PurchaseService,
  ReportService,
  ReturnService,
  SaleService,
  SMSService,
  SRService,
  StockLogService,
  SupplierService,
  TreasuryService,
} from '../api/services';

/**
 * The single bridge between the pages and the API.
 *
 * Every action name, argument list and piece of state below is the same as it
 * was when this store kept everything in browser storage, so no page had to
 * change. What changed is the inside: each action now posts to Django and then
 * refreshes the slices that moved, and the server is the only source of truth.
 */

// Pages call these actions without awaiting, and a couple of screens fire two
// in a row (POS edits a sale by deleting it and re-creating it). Running them
// through one chain keeps them in the order they were issued.
let chain = Promise.resolve();
const enqueue = (task) => {
  chain = chain.then(task, task);
  return chain;
};

const fail = (error, fallback) => {
  const message = errorMessage(error, fallback);
  toast.error(message);
  return { ok: false, error: message };
};

/** Drop keys the API treats as read-only, so a PATCH doesn't fight the server. */
const clean = (payload, extra = []) => {
  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    return payload;
  }
  const drop = new Set([
    'created_at', 'updated_at', 'dateAdded', 'date_added',
    'customer_code', 'supplier_code', 'staff_code', 'product_code',
    ...extra,
  ]);
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([key, value]) => !drop.has(key) && value !== undefined)
  );
};

const useStore = create(
  persist(
    (set, get) => ({
      // ---------------------------------------------------------------- //
      // App state
      // ---------------------------------------------------------------- //
      user: null, // { id, name, username, role }
      theme: 'light',
      themeGradient: 'theme-sky',
      language: 'en',
      isLoading: false,
      shopProfile: null,
      dashboardSummary: null,

      smsSettings: {
        autoSalesConfirm: true,
        autoPaymentReceive: true,
        autoDueReminder: false,
      },
      smsBalance: 0,

      // ---------------------------------------------------------------- //
      // Server-backed tables. Empty until hydrate() runs.
      // ---------------------------------------------------------------- //
      inventory: [],
      categories: [],
      units: [],
      customers: [],
      suppliers: [],
      sales: [],
      purchases: [],
      returns: [],
      settlements: [],
      expenses: [],
      expenseCategories: [],
      staff: [],
      attendance: [],
      leaves: [],
      payrolls: [],
      srSettlements: [],
      drafts: [],

      cashBalance: 0,
      bankBalance: 0,
      accountTransactions: [],

      cart: [],

      // ---------------------------------------------------------------- //
      // Session
      // ---------------------------------------------------------------- //
      signIn: async (username, password) => {
        try {
          const account = await AuthService.login(username, password);
          const user = {
            id: account.id,
            username: account.username,
            // Pages render `user.name`; the API splits it across three fields.
            name: [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
              || account.username,
            role: account.role,
            email: account.email,
          };
          set({ user });
          await get().hydrate();
          return { ok: true, user };
        } catch (error) {
          return fail(error, 'Login failed. Check your username and password.');
        }
      },

      login: (userData) => set({ user: userData }),

      logout: () => {
        AuthService.logout();
        set({
          user: null,
          inventory: [], categories: [], units: [], customers: [], suppliers: [], sales: [], purchases: [],
          returns: [], settlements: [], expenses: [], expenseCategories: [], staff: [], attendance: [],
          leaves: [], payrolls: [], srSettlements: [], drafts: [], accountTransactions: [], dashboardSummary: null,
          cashBalance: 0, bankBalance: 0, cart: [],
        });
      },

      // ---------------------------------------------------------------- //
      // Loading
      // ---------------------------------------------------------------- //

      /** Refresh a named slice after something changed it. */
      refresh: async (...slices) => {
        const jobs = {
          inventory: () => Promise.allSettled([
            ProductService.list(),
            ProductService.categories(),
            ProductService.units()
          ]).then(([pList, pCats, pUnits]) => ({
            inventory: pList.status === 'fulfilled' ? pList.value : [],
            categories: pCats.status === 'fulfilled' ? pCats.value : [],
            units: pUnits.status === 'fulfilled' ? pUnits.value : [],
          })),
          customers: () => CustomerService.list().then((r) => ({ customers: r })),
          suppliers: () => SupplierService.list().then((r) => ({ suppliers: r })),
          sales: () => SaleService.list().then((r) => ({ sales: r })),
          purchases: () => PurchaseService.list().then((r) => ({ purchases: r })),
          returns: () => ReturnService.list().then((r) => ({ returns: r })),
          settlements: () => LedgerService.settlements().then((r) => ({ settlements: r })),
          expenses: () => Promise.allSettled([
            ExpenseService.list(),
            ExpenseService.categories()
          ]).then(([eList, eCats]) => ({
            expenses: eList.status === 'fulfilled' ? eList.value : [],
            expenseCategories: eCats.status === 'fulfilled' ? eCats.value : [],
          })),
          staff: () => HRService.staff().then((r) => ({ staff: r })),
          attendance: () => HRService.attendance().then((r) => ({ attendance: r })),
          leaves: () => HRService.leaves().then((r) => ({ leaves: r })),
          payrolls: () => HRService.payrolls().then((r) => ({ payrolls: r })),
          sr: () => SRService.list().then((r) => ({ srSettlements: r })),
          drafts: () => DraftService.list().then((r) => ({ drafts: r })),
          treasury: () => TreasuryService.summary().then((r) => ({
            cashBalance: Number(r.cashBalance) || 0,
            bankBalance: Number(r.bankBalance) || 0,
            accountTransactions: r.accountTransactions || [],
          })),
          sms: () => SMSService.balance().then((r) => ({ smsBalance: r.smsBalance ?? r.balance ?? 0 })),
          dashboard: () => ReportService.summary().then((r) => ({ dashboardSummary: r })),
        };

        const wanted = slices.length ? slices : Object.keys(jobs);
        const results = await Promise.allSettled(wanted.map((name) => jobs[name]?.()));

        const patch = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) Object.assign(patch, result.value);
        });
        if (Object.keys(patch).length) set(patch);
        return patch;
      },

      /** Load everything the app shows. Called once after login and on reload. */
      hydrate: async () => {
        if (!get().user) return;
        set({ isLoading: true });
        try {
          await get().refresh();
          try {
            const profile = await CoreService.shopProfile();
            set({ shopProfile: profile });
          } catch {
            /* letterhead is optional; the pages have their own headings */
          }
          try {
            const settings = await CoreService.userSettings();
            set({
              theme: settings.theme_mode || get().theme,
              themeGradient: settings.active_theme_class || get().themeGradient,
              language: settings.language || get().language,
              smsSettings: settings.smsSettings || get().smsSettings,
            });
          } catch {
            /* fall back to whatever is stored locally */
          }
        } finally {
          set({ isLoading: false });
        }
      },

      // ---------------------------------------------------------------- //
      // Appearance. Applied locally at once, saved to the server behind it.
      // ---------------------------------------------------------------- //
      saveSettings: (patch) => {
        if (!get().user) return;
        CoreService.saveUserSettings(patch).catch(() => {});
      },

      setThemeGradient: (gradient) => {
        set({ themeGradient: gradient });
        get().saveSettings({ active_theme_class: gradient });
      },

      setLanguage: (lang) => {
        set({ language: lang });
        get().saveSettings({ language: lang });
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        get().saveSettings({ theme_mode: next });
      },

      updateSmsSettings: (patch) => {
        const merged = { ...get().smsSettings, ...patch };
        set({ smsSettings: merged });
        get().saveSettings({ smsSettings: merged });
      },

      // ---------------------------------------------------------------- //
      // Cart. Purely local until checkout.
      // ---------------------------------------------------------------- //
      addToCart: (product) => set((state) => {
        const existing = state.cart.find((item) => item.id === product.id);
        if (existing) {
          return {
            cart: state.cart.map((item) =>
              item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ),
          };
        }
        return { cart: [...state.cart, { ...product, quantity: 1, isGift: false, itemDiscount: 0 }] };
      }),
      removeFromCart: (productId) => set((state) => ({
        cart: state.cart.filter((item) => item.id !== productId),
      })),
      updateCartItem: (productId, updates) => set((state) => ({
        cart: state.cart.map((item) =>
          item.id === productId ? { ...item, ...updates } : item
        ),
      })),
      clearCart: () => set({ cart: [] }),
      setCart: (cartItems) => set({ cart: cartItems }),

      // ---------------------------------------------------------------- //
      // Inventory
      // ---------------------------------------------------------------- //
      addInventoryItem: (item) => enqueue(async () => {
        try {
          await ProductService.create(clean(item));
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the product.');
        }
      }),

      updateInventoryItem: (id, updates) => enqueue(async () => {
        try {
          await ProductService.update(id, clean(updates, ['id']));
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the product.');
        }
      }),

      deleteInventoryItem: (id) => enqueue(async () => {
        try {
          await ProductService.remove(id);
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the product.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Sales
      // ---------------------------------------------------------------- //
      processSale: ({ cartItems, paymentType, customerInfo, invoiceDiscount, salesman, paidAmount }) =>
        enqueue(async () => {
          try {
            const invoice = await SaleService.create({
              cartItems,
              paymentType,
              customerInfo,
              invoiceDiscount: invoiceDiscount || 0,
              salesman: salesman || {},
              // Only a Partial sale carries a paid amount; Cash and Baki are
              // decided entirely by the payment type.
              paidAmount: paymentType === 'Partial' ? Number(paidAmount) || 0 : undefined,
            });
            await get().refresh('sales', 'inventory', 'customers', 'treasury', 'dashboard');
            // Hand the saved invoice back so the receipt can print the number
            // the shop actually filed, not one made up on the client.
            return { ok: true, invoice };
          } catch (error) {
            // The cart is cleared by the page optimistically, so put it back
            // rather than leaving the counter staff to key it in a second time.
            set({ cart: cartItems || [] });
            return fail(error, 'The sale could not be saved.');
          }
        }),

      deleteSale: (saleId) => enqueue(async () => {
        try {
          await SaleService.remove(saleId);
          await get().refresh('sales', 'inventory', 'customers', 'treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the sale.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Purchases
      // ---------------------------------------------------------------- //
      processPurchase: ({ items, supplierId, supplierName, paymentType, total, paidAmount = 0 }) =>
        enqueue(async () => {
          try {
            await PurchaseService.create({
              items, supplierId, supplierName, paymentType, total, paidAmount,
            });
            await get().refresh('purchases', 'inventory', 'suppliers', 'treasury', 'dashboard');
            return { ok: true };
          } catch (error) {
            return fail(error, 'The purchase could not be saved.');
          }
        }),

      deletePurchase: (purchaseId) => enqueue(async () => {
        try {
          await PurchaseService.remove(purchaseId);
          await get().refresh('purchases', 'inventory', 'suppliers', 'treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the purchase.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Returns
      // ---------------------------------------------------------------- //
      processReturn: ({ returnType, productId, quantity, reason, date, referenceId }) =>
        enqueue(async () => {
          try {
            await ReturnService.create({
              returnType, productId, quantity, reason,
              date: date || undefined,
              referenceId: referenceId || '',
            });
            await get().refresh('returns', 'inventory');
            return { ok: true };
          } catch (error) {
            return fail(error, 'The return could not be saved.');
          }
        }),

      deleteReturn: (returnId) => enqueue(async () => {
        try {
          await ReturnService.remove(returnId);
          await get().refresh('returns', 'inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the return.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Dues and settlements
      // ---------------------------------------------------------------- //
      settleCustomerDue: (customerId, amount, dateStr) => enqueue(async () => {
        try {
          await LedgerService.settleDue({
            targetId: customerId, type: 'Customer', amount,
            date: dateStr ? String(dateStr).split('T')[0] : undefined,
          });
          await get().refresh('customers', 'settlements', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The payment could not be recorded.');
        }
      }),

      settleSupplierDue: (supplierId, amount, dateStr) => enqueue(async () => {
        try {
          await LedgerService.settleDue({
            targetId: supplierId, type: 'Supplier', amount,
            date: dateStr ? String(dateStr).split('T')[0] : undefined,
          });
          await get().refresh('suppliers', 'settlements', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The payment could not be recorded.');
        }
      }),

      payCustomerDue: (customerId, amount) => get().settleCustomerDue(customerId, amount),
      paySupplierDue: (supplierId, amount) => get().settleSupplierDue(supplierId, amount),

      // ---------------------------------------------------------------- //
      // Contacts
      // ---------------------------------------------------------------- //
      addCustomer: (customerData) => enqueue(async () => {
        try {
          await CustomerService.create(clean(customerData));
          await get().refresh('customers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the customer.');
        }
      }),

      updateCustomer: (customerId, updates) => enqueue(async () => {
        try {
          await CustomerService.update(customerId, clean(updates, ['id']));
          await get().refresh('customers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the customer.');
        }
      }),

      deleteCustomer: (customerId) => enqueue(async () => {
        try {
          await CustomerService.remove(customerId);
          await get().refresh('customers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the customer.');
        }
      }),

      addSupplier: (supplierData) => enqueue(async () => {
        try {
          await SupplierService.create(clean(supplierData));
          await get().refresh('suppliers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the supplier.');
        }
      }),

      updateSupplier: (supplierId, updates) => enqueue(async () => {
        try {
          await SupplierService.update(supplierId, clean(updates, ['id']));
          await get().refresh('suppliers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the supplier.');
        }
      }),

      deleteSupplier: (supplierId) => enqueue(async () => {
        try {
          await SupplierService.remove(supplierId);
          await get().refresh('suppliers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the supplier.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Expenses
      // ---------------------------------------------------------------- //
      addExpense: (expense) => enqueue(async () => {
        try {
          await ExpenseService.create(clean(expense, ['id']));
          await get().refresh('expenses', 'treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not save the expense.');
        }
      }),

      updateExpense: (expenseId, updates) => enqueue(async () => {
        try {
          await ExpenseService.update(expenseId, clean(updates, ['id']));
          await get().refresh('expenses', 'treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the expense.');
        }
      }),

      deleteExpense: (expenseId) => enqueue(async () => {
        try {
          await ExpenseService.remove(expenseId);
          await get().refresh('expenses', 'treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the expense.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Treasury
      // ---------------------------------------------------------------- //
      transferFunds: (from, to, amount) => enqueue(async () => {
        try {
          await TreasuryService.transfer({ from, to, amount });
          await get().refresh('treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The transfer could not be completed.');
        }
      }),

      // ---------------------------------------------------------------- //
      // HR
      // ---------------------------------------------------------------- //
      addStaff: (staffData) => enqueue(async () => {
        try {
          await HRService.createStaff(clean(staffData, ['id']));
          await get().refresh('staff');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the staff member.');
        }
      }),

      updateStaff: (staffId, updates) => enqueue(async () => {
        try {
          await HRService.updateStaff(staffId, clean(updates, ['id', 'due']));
          await get().refresh('staff');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the staff member.');
        }
      }),

      deleteStaff: (staffId) => enqueue(async () => {
        try {
          await HRService.removeStaff(staffId);
          await get().refresh('staff');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the staff member.');
        }
      }),

      markAttendance: (staffId, date, status) => enqueue(async () => {
        try {
          await HRService.markAttendance({ staffId, date, status });
          await get().refresh('attendance');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not save the attendance.');
        }
      }),

      addLeaveRequest: (leaveData) => enqueue(async () => {
        try {
          await HRService.createLeave(leaveData);
          await get().refresh('leaves');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not submit the leave request.');
        }
      }),

      updateLeaveStatus: (leaveId, status) => enqueue(async () => {
        try {
          await HRService.setLeaveStatus(leaveId, status);
          // Approving a leave writes attendance for every day in the range.
          await get().refresh('leaves', 'attendance');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not update the leave request.');
        }
      }),

      generatePayslip: (payrollData) => enqueue(async () => {
        try {
          await HRService.generatePayslip({
            staffId: payrollData.staffId,
            month: payrollData.month,
            year: payrollData.year,
            presentDays: payrollData.presentDays,
            bonus: payrollData.bonus || 0,
          });
          await get().refresh('payrolls', 'expenses', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not generate the payslip.');
        }
      }),

      // ---------------------------------------------------------------- //
      // SR consignment: stock goes out with a salesman in the morning and is
      // reconciled against cash at night.
      // ---------------------------------------------------------------- //
      issueSRStock: ({ salesmanId, date, items, notes }) => enqueue(async () => {
        try {
          await SRService.issue({ salesmanId, date, items, notes: notes || '' });
          // Issuing takes the goods off the shelf straight away.
          await get().refresh('sr', 'inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The stock could not be issued.');
        }
      }),

      settleSR: (code, { cashReceived, returnItems }) => enqueue(async () => {
        try {
          await SRService.settle(code, { cashReceived, returnItems: returnItems || [] });
          // Returns come back into stock, cash lands in the drawer, and any
          // shortfall becomes a due against the salesman.
          await get().refresh('sr', 'inventory', 'staff', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The settlement could not be saved.');
        }
      }),

      deleteSRSettlement: (code) => enqueue(async () => {
        try {
          await SRService.remove(code);
          await get().refresh('sr', 'inventory', 'staff', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the SR record.');
        }
      }),

      /**
       * Find one product by whatever the scanner or the operator typed.
       *
       * Looks in the loaded catalogue first so a scan at the counter is
       * instant, and only asks the server when that misses -- which is what
       * happens when another terminal added the item a moment ago.
       */
      lookupProduct: async (code) => {
        const term = String(code || '').trim();
        if (!term) return null;
        const lower = term.toLowerCase();
        const list = get().inventory || [];

        const local =
          list.find((p) => String(p.id) === term) ||
          list.find((p) => (p.name || '').toLowerCase() === lower);
        if (local) return local;

        // One partial match is unambiguous enough to act on; several are not.
        const partial = list.filter((p) => (p.name || '').toLowerCase().includes(lower));
        if (partial.length === 1) return partial[0];
        if (partial.length > 1) return null;

        try {
          return await ProductService.byBarcode(term);
        } catch {
          return null;
        }
      },

      // ---------------------------------------------------------------- //
      // Stock movement log. Not held in state: the table only grows, so a
      // screen asks for the slice it needs and renders that.
      // ---------------------------------------------------------------- //
      fetchStockLogs: async (params = {}) => {
        try {
          const [rows, summary] = await Promise.all([
            StockLogService.list(params),
            StockLogService.summary(params).catch(() => null),
          ]);
          return { ok: true, rows: rows || [], summary };
        } catch (error) {
          return fail(error, 'Could not load the stock movement log.');
        }
      },

      // ---------------------------------------------------------------- //
      // Parked carts
      // ---------------------------------------------------------------- //
      saveDraft: ({ cartItems, customerInfo, paymentType, invoiceDiscount, salesman, total }) =>
        enqueue(async () => {
          try {
            const draft = await DraftService.create({
              cartItems, customerInfo,
              paymentType: paymentType || 'Baki',
              invoiceDiscount: invoiceDiscount || 0,
              total: total || 0,
              salesman: salesman || {},
            });
            await get().refresh('drafts');
            return { ok: true, draft };
          } catch (error) {
            return fail(error, 'Could not save the draft.');
          }
        }),

      deleteDraft: (code) => enqueue(async () => {
        try {
          await DraftService.remove(code);
          await get().refresh('drafts');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the draft.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Categories and units. The product form creates these implicitly by
      // name; these let someone correct a typo or drop one that is unused.
      // ---------------------------------------------------------------- //
      addCategory: (name) => enqueue(async () => {
        try {
          await ProductService.createCategory({ name });
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the category.');
        }
      }),

      renameCategory: (id, name) => enqueue(async () => {
        try {
          await ProductService.updateCategory(id, { name });
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not rename the category.');
        }
      }),

      deleteCategory: (id) => enqueue(async () => {
        try {
          await ProductService.removeCategory(id);
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the category.');
        }
      }),

      addUnit: (name) => enqueue(async () => {
        try {
          await ProductService.createUnit({ name });
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the unit.');
        }
      }),

      renameUnit: (id, name) => enqueue(async () => {
        try {
          await ProductService.updateUnit(id, { name });
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not rename the unit.');
        }
      }),

      deleteUnit: (id) => enqueue(async () => {
        try {
          await ProductService.removeUnit(id);
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the unit.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Money put in or taken out by the owner, with no document behind it:
      // the opening float, a capital injection, drawings.
      // ---------------------------------------------------------------- //
      addManualEntry: ({ accountId, type, amount, description }) => enqueue(async () => {
        try {
          await TreasuryService.entry({ accountId, type, amount, description });
          await get().refresh('treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not record the entry.');
        }
      }),

      // ---------------------------------------------------------------- //
      // SMS
      // ---------------------------------------------------------------- //
      purchaseSms: (credits, cost) => enqueue(async () => {
        try {
          const result = await SMSService.buy(credits, cost);
          set({ smsBalance: result.smsBalance });
          await get().refresh('treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not buy the SMS package.');
        }
      }),

      sendSms: (message, customerIds = [], numbers = []) => enqueue(async () => {
        try {
          const result = await SMSService.send(message, customerIds, numbers);
          set({ smsBalance: result.smsBalance ?? get().smsBalance });
          // The gateway reports Simulated when no provider is configured, and
          // saying "sent" then would be a lie to the shopkeeper.
          if (result.delivered) {
            toast.success(result.message);
          } else {
            toast.warn(result.message);
          }
          return { ok: true, ...result };
        } catch (error) {
          return fail(error, 'The SMS could not be sent.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Server sync & Refresh
      // ---------------------------------------------------------------- //
      refreshAllData: () => enqueue(async () => {
        await get().refresh();
        toast.info('Data refreshed from the server.');
        return { ok: true };
      }),
      loadDummyData: () => get().refreshAllData(),
    }),
    {
      name: 'allha-shop-storage',
      // Only the things that belong to this browser survive a reload. Every
      // table is re-read from the server, so a stale cache can never be shown
      // as if it were current.
      partialize: (state) => ({
        user: state.user,
        theme: state.theme,
        themeGradient: state.themeGradient,
        language: state.language,
        cart: state.cart,
      }),
    }
  )
);

export default useStore;
