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
import { DEFAULT_ROLE_PERMISSIONS, ALL_MENU_PATHS } from '../utils/navigationConfig';

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

// Cache freshness TTL: 90 seconds (data fresher than 90s is served instantly from memory)
const CACHE_TTL_MS = 90 * 1000;
// Tracks the epoch timestamp (ms) when each slice was last fetched
// Holds back the accent save while the colour picker is being dragged.
let accentSaveTimer = null;
let cardColorSaveTimer = null;

const lastFetchedTimestamps = new Map();
// Deduplicates concurrent in-flight requests for the same slice
const inFlightRequests = new Map();

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
      accentColor: '',
      // Per-card colour overrides for the dashboard summary, keyed by card id.
      dashboardCardColors: {},
      dashboardSummary: null,
      rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      _cacheTimestamps: {},

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
      deletedCustomers: [],
      suppliers: [],
      deletedSuppliers: [],
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
        lastFetchedTimestamps.clear();
        inFlightRequests.clear();
        set({
          user: null,
          _cacheTimestamps: {},
          inventory: [], categories: [], units: [], customers: [], suppliers: [], sales: [], purchases: [],
          returns: [], settlements: [], expenses: [], expenseCategories: [], staff: [], attendance: [],
          leaves: [], payrolls: [], srSettlements: [], drafts: [], accountTransactions: [], dashboardSummary: null,
          cashBalance: 0, bankBalance: 0, cart: [],
        });
      },

      // ---------------------------------------------------------------- //
      // Loading
      // ---------------------------------------------------------------- //

      /** 
       * Request-deduplicating and timestamp-tracking slice refresher.
       * If called without arguments, refreshes all available slices.
       */
      refresh: async (...slices) => {
        const jobs = {
          inventory: () => Promise.allSettled([
            ProductService.list({ all: 'true' }),
            ProductService.categories(),
            ProductService.units()
          ]).then(([pList, pCats, pUnits]) => {
            const rawProds = pList.status === 'fulfilled' ? pList.value : [];
            const inventory = Array.isArray(rawProds) ? rawProds : (rawProds?.results || []);
            return {
              inventory,
              categories: pCats.status === 'fulfilled' ? pCats.value : [],
              units: pUnits.status === 'fulfilled' ? pUnits.value : [],
            };
          }),
          categories: () => ProductService.categories().then((r) => ({ categories: r })),
          units: () => ProductService.units().then((r) => ({ units: r })),
          customers: () => CustomerService.list().then((r) => ({ customers: r })),
          deletedCustomers: () => CustomerService.listDeleted().then((r) => ({ deletedCustomers: r })),
          suppliers: () => SupplierService.list().then((r) => ({ suppliers: r })),
          deletedSuppliers: () => SupplierService.listDeleted().then((r) => ({ deletedSuppliers: r })),
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

        const flatSlices = slices.flat().filter(Boolean);
        const wanted = flatSlices.length ? flatSlices : Object.keys(jobs);

        // Deduplicate in-flight requests
        const promises = wanted.map((name) => {
          if (!jobs[name]) return Promise.resolve(null);

          if (inFlightRequests.has(name)) {
            return inFlightRequests.get(name);
          }

          const promise = jobs[name]()
            .then((data) => {
              lastFetchedTimestamps.set(name, Date.now());
              return data;
            })
            .catch((err) => {
              console.warn(`[Store] Failed to fetch slice: ${name}`, err);
              return null;
            })
            .finally(() => {
              inFlightRequests.delete(name);
            });

          inFlightRequests.set(name, promise);
          return promise;
        });

        const results = await Promise.allSettled(promises);

        const patch = {};
        const newTimestamps = { ...(get()._cacheTimestamps || {}) };

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            Object.assign(patch, result.value);
            const sliceName = wanted[idx];
            if (sliceName) {
              newTimestamps[sliceName] = Date.now();
            }
          }
        });

        patch._cacheTimestamps = newTimestamps;

        if (Object.keys(patch).length) {
          set(patch);
        }
        return patch;
      },

      /**
       * Smart lazy-loader with persistent cache TTL (90s).
       * Only hits the network if the slice is missing or older than 90s.
       * If data is already in cache (surviving reload), ZERO network requests are made!
       */
      ensureLoaded: async (...slices) => {
        if (!get().user) return;
        const flatSlices = slices.flat().filter(Boolean);
        if (!flatSlices.length) return;

        const now = Date.now();
        const timestamps = get()._cacheTimestamps || {};
        const needed = [];
        const waiting = [];

        for (const slice of flatSlices) {
          if (inFlightRequests.has(slice)) {
            waiting.push(inFlightRequests.get(slice));
          } else {
            const last = timestamps[slice];
            const dataSlice = get()[slice];
            const isStale = !last || (now - last) > CACHE_TTL_MS;
            const isEmpty = dataSlice === undefined || dataSlice === null;
            if (isStale || isEmpty) {
              needed.push(slice);
            }
          }
        }

        const tasks = [...waiting];
        if (needed.length > 0) {
          tasks.push(get().refresh(...needed));
        }

        if (tasks.length > 0) {
          await Promise.allSettled(tasks);
        }
      },

      /** Manually invalidate cache timestamps so next route access or ensureLoaded fetches fresh data */
      invalidateCache: (...slices) => {
        const flat = slices.flat().filter(Boolean);
        if (!flat.length) {
          lastFetchedTimestamps.clear();
          set({ _cacheTimestamps: {} });
        } else {
          const ts = { ...(get()._cacheTimestamps || {}) };
          flat.forEach((s) => {
            lastFetchedTimestamps.delete(s);
            delete ts[s];
          });
          set({ _cacheTimestamps: ts });
        }
      },

      /** Lean hydrate: loads profile & settings only if missing or older than 10 mins. */
      hydrate: async () => {
        if (!get().user) return;
        const now = Date.now();
        const timestamps = get()._cacheTimestamps || {};
        const profileLast = timestamps._shopProfile;
        const settingsLast = timestamps._userSettings;

        // Profile: only fetch if missing or older than 10 minutes
        if (!get().shopProfile || !profileLast || (now - profileLast) > 10 * 60 * 1000) {
          try {
            const profile = await CoreService.shopProfile();
            set((state) => ({
              shopProfile: profile,
              _cacheTimestamps: { ...(state._cacheTimestamps || {}), _shopProfile: Date.now() },
            }));
          } catch {}
        }

        // Settings: only fetch if missing or older than 10 minutes
        if (!settingsLast || (now - settingsLast) > 10 * 60 * 1000) {
          try {
            const settings = await CoreService.userSettings();
            set((state) => ({
              theme: settings.theme_mode || state.theme,
              themeGradient: settings.active_theme_class || state.themeGradient,
              accentColor: settings.accentColor ?? state.accentColor,
              dashboardCardColors: settings.dashboardCardColors ?? state.dashboardCardColors,
              language: settings.language || state.language,
              smsSettings: settings.smsSettings || state.smsSettings,
              _cacheTimestamps: { ...(state._cacheTimestamps || {}), _userSettings: Date.now() },
            }));
          } catch {}
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

      /**
       * A colour chosen from the Settings picker. Passing an empty string hands
       * the look back to the named theme, which is what the "reset" does.
       *
       * The colour is applied the instant it changes so dragging the picker
       * repaints the app live, but the save is held back until the dragging
       * stops -- otherwise one sweep across the hue rail would fire a hundred
       * requests at the server.
       */
      setAccentColor: (hex) => {
        const value = hex || '';
        set({ accentColor: value });

        clearTimeout(accentSaveTimer);
        accentSaveTimer = setTimeout(() => {
          get().saveSettings({ accentColor: value });
        }, 450);
      },

      /**
       * One dashboard card's colour. An empty hex removes the override so the
       * card returns to its default. Saved the same debounced way as the
       * accent, since it is driven by the same picker.
       */
      setDashboardCardColor: (cardKey, hex) => {
        const next = { ...(get().dashboardCardColors || {}) };
        if (hex) next[cardKey] = hex;
        else delete next[cardKey];
        set({ dashboardCardColors: next });

        clearTimeout(cardColorSaveTimer);
        cardColorSaveTimer = setTimeout(() => {
          get().saveSettings({ dashboardCardColors: next });
        }, 450);
      },

      resetDashboardCardColors: () => {
        set({ dashboardCardColors: {} });
        get().saveSettings({ dashboardCardColors: {} });
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

      /**
       * Shop-wide settings: the letterhead every document prints, and whether
       * a sale texts the customer. Unlike the appearance settings above these
       * belong to the shop rather than to whoever is logged in, so the new
       * values are only kept once the server has accepted them.
       */
      saveShopProfile: async (patch) => {
        try {
          const profile = await CoreService.saveShopProfile(patch);
          set((state) => ({
            shopProfile: profile,
            _cacheTimestamps: { ...(state._cacheTimestamps || {}), _shopProfile: Date.now() },
          }));
          return { ok: true, profile };
        } catch (error) {
          return fail(error, 'Could not save the shop settings.');
        }
      },

      setRolePermissions: (rolePermissions) => set({ rolePermissions }),

      updateRolePermissions: async (role, allowedPaths) => {
        const next = {
          ...(get().rolePermissions || DEFAULT_ROLE_PERMISSIONS),
          [role]: allowedPaths,
        };
        // Admin must always have access to everything
        next.Admin = ALL_MENU_PATHS;
        set({ rolePermissions: next });

        // Optionally persist to backend settings if supported
        try {
          if (CoreService?.saveUserSettings) {
            await CoreService.saveUserSettings({ role_permissions: next });
          }
        } catch {
          // Local zustand persistence remains authoritative
        }
        return { ok: true, rolePermissions: next };
      },

      resetRolePermissions: () => set({ rolePermissions: DEFAULT_ROLE_PERMISSIONS }),

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
      processSale: ({ id, invoiceId, date, cartItems, paymentType, customerInfo, invoiceDiscount, salesman, paidAmount, notes, account, isSplit, cashPaid, mfsPaid, mfsProvider, mfsTrxId }) =>
        enqueue(async () => {
          try {
            const invoice = await SaleService.create({
              id: id || invoiceId,
              invoiceId: id || invoiceId,
              date,
              cartItems,
              paymentType,
              customerInfo,
              invoiceDiscount: invoiceDiscount || 0,
              salesman: salesman || {},
              paidAmount: (paymentType === 'Partial' || isSplit || paidAmount !== undefined) ? Number(paidAmount) || 0 : undefined,
              notes,
              account: isSplit ? 'Cash' : account,
              isSplit,
              cashPaid,
              mfsPaid,
              mfsProvider,
              mfsTrxId,
            });

            // If it's a split payment (Cash + MFS), sale was deposited to Cash by default;
            // transfer the MFS portion from Cash to Bank so both drawer and bank remain exact!
            if (isSplit && Number(mfsPaid) > 0) {
              try {
                await TreasuryService.transfer({
                  from_account: 'Cash',
                  to_account: 'Bank',
                  amount: Number(mfsPaid),
                  description: `Split payment (${mfsProvider || 'MFS'}) for ${invoice?.invoice_number || invoice?.id || 'sale'}`,
                });
              } catch (tErr) {
                console.warn('Split payment internal treasury transfer:', tErr);
              }
            }

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

      /**
       * Collect a payment against one invoice that went out on Baki or Partial.
       * The server files it as a customer settlement pointed at that invoice,
       * so the drawer, the customer's balance and the invoice's own outstanding
       * figure all move together.
       */
      payInvoiceDue: (invoiceId, { amount, date, method, notes } = {}) => enqueue(async () => {
        try {
          const res = await SaleService.payDue(invoiceId, {
            amount: Number(amount) || 0,
            date: date ? String(date).split('T')[0] : undefined,
            method: method || 'Cash',
            notes: notes || undefined,
          });
          await get().refresh('sales', 'customers', 'settlements', 'treasury', 'dashboard');
          return { ok: true, invoice: res?.invoice, settlement: res?.settlement };
        } catch (error) {
          return fail(error, 'The due payment could not be recorded.');
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
      settleCustomerDue: (customerId, amount, dateStr, opts = {}) => enqueue(async () => {
        try {
          await LedgerService.settleDue({
            targetId: customerId, type: 'Customer', amount,
            date: dateStr ? String(dateStr).split('T')[0] : undefined,
            method: opts.method || undefined,
            notes: opts.notes || undefined,
          });
          await get().refresh('customers', 'sales', 'settlements', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The payment could not be recorded.');
        }
      }),

      settleSupplierDue: (supplierId, amount, dateStr, opts = {}) => enqueue(async () => {
        try {
          await LedgerService.settleDue({
            targetId: supplierId, type: 'Supplier', amount,
            date: dateStr ? String(dateStr).split('T')[0] : undefined,
            method: opts.method || undefined,
            notes: opts.notes || undefined,
          });
          await get().refresh('suppliers', 'purchases', 'settlements', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The payment could not be recorded.');
        }
      }),

      /** An SR's shortfall coming back into the drawer. */
      settleStaffDue: (staffId, amount, dateStr, opts = {}) => enqueue(async () => {
        try {
          await LedgerService.settleDue({
            targetId: staffId, type: 'Staff', amount,
            date: dateStr ? String(dateStr).split('T')[0] : undefined,
            method: opts.method || undefined,
            notes: opts.notes || undefined,
          });
          await get().refresh('staff', 'settlements', 'treasury');
          return { ok: true };
        } catch (error) {
          return fail(error, 'The recovery could not be recorded.');
        }
      }),

      /** The full ledger of one party. Fetched on demand, never cached in a slice. */
      fetchPartyLedger: async (type, id, params = {}) => {
        try {
          const data = await LedgerService.party(type, id, params);
          return { ok: true, data };
        } catch (error) {
          return fail(error, 'Could not load the ledger.');
        }
      },

      /** Clear an account in one go; for a customer it lands on each due invoice. */
      payAll: (type, targetId, { amount, date, method, notes } = {}) => enqueue(async () => {
        try {
          const res = await LedgerService.payAll({
            type, targetId,
            amount: amount ?? undefined,
            date: date ? String(date).split('T')[0] : undefined,
            method: method || 'Cash',
            notes: notes || undefined,
          });
          await get().refresh('customers', 'suppliers', 'staff', 'sales', 'purchases', 'settlements', 'treasury');
          return { ok: true, result: res };
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
          await Promise.all([get().refresh('customers'), get().refresh('deletedCustomers')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the customer.');
        }
      }),

      restoreCustomer: (customerId) => enqueue(async () => {
        try {
          await CustomerService.restore(customerId);
          await Promise.all([get().refresh('customers'), get().refresh('deletedCustomers')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not restore the customer.');
        }
      }),

      permanentDeleteCustomer: (customerId) => enqueue(async () => {
        try {
          await CustomerService.hardDelete(customerId);
          await get().refresh('deletedCustomers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not permanently delete the customer.');
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
          await Promise.all([get().refresh('suppliers'), get().refresh('deletedSuppliers')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the supplier.');
        }
      }),

      restoreSupplier: (supplierId) => enqueue(async () => {
        try {
          await SupplierService.restore(supplierId);
          await Promise.all([get().refresh('suppliers'), get().refresh('deletedSuppliers')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not restore the supplier.');
        }
      }),

      permanentDeleteSupplier: (supplierId) => enqueue(async () => {
        try {
          await SupplierService.hardDelete(supplierId);
          await get().refresh('deletedSuppliers');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not permanently delete the supplier.');
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

      /**
       * The books for a date range: what was sold, what it cost, what came in
       * and what the shop is worth. Not held in a slice -- every answer
       * depends on the range asked for, so it is fetched by the page.
       */
      fetchBalanceSheet: async (params = {}) => {
        try {
          const data = await ReportService.balanceSheet(params);
          return { ok: true, data };
        } catch (error) {
          return fail(error, 'Could not load the balance sheet.');
        }
      },

      /** Everything that happened on one date, with that day's totals. */
      fetchDayBook: async (date) => {
        try {
          const data = await ReportService.dayBook(date ? { date } : {});
          return { ok: true, data };
        } catch (error) {
          return fail(error, 'Could not load the day book.');
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
      addCategory: (nameOrPayload) => enqueue(async () => {
        try {
          const payload = typeof nameOrPayload === 'string' ? { name: nameOrPayload } : nameOrPayload;
          await ProductService.createCategory(payload);
          await get().refresh('inventory');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not add the category.');
        }
      }),

      renameCategory: (id, nameOrPayload) => enqueue(async () => {
        try {
          const payload = typeof nameOrPayload === 'string' ? { name: nameOrPayload } : nameOrPayload;
          await ProductService.updateCategory(id, payload);
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
      addManualEntry: ({ accountId, type, amount, description, reference_id, source, date }) => enqueue(async () => {
        try {
          await TreasuryService.entry({ accountId, type, amount, description, reference_id, source, date });
          await get().refresh('treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not record the entry.');
        }
      }),

      // ---------------------------------------------------------------- //
      // Loans (karz). Kept on the server so every device sees the same book
      // and the balance sheet can count what is still out and still owed.
      // ---------------------------------------------------------------- //
      loans: [],

      fetchLoans: async () => {
        try {
          const list = await TreasuryService.loans();
          set({ loans: Array.isArray(list) ? list : (list?.results || []) });
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not load the loan book.');
        }
      },

      addLoan: (payload) => enqueue(async () => {
        try {
          await TreasuryService.createLoan(payload);
          await Promise.all([get().fetchLoans(), get().refresh('treasury', 'dashboard')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not record the loan.');
        }
      }),

      payLoan: (loanId, payload) => enqueue(async () => {
        try {
          await TreasuryService.payLoan(loanId, payload);
          await Promise.all([get().fetchLoans(), get().refresh('treasury', 'dashboard')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not record the repayment.');
        }
      }),

      deleteLoan: (loanId) => enqueue(async () => {
        try {
          await TreasuryService.deleteLoan(loanId);
          await Promise.all([get().fetchLoans(), get().refresh('treasury', 'dashboard')]);
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not delete the loan.');
        }
      }),

      /** One-time move of loans an older build kept in this browser. */
      importLocalLoans: async (rows) => {
        try {
          const res = await TreasuryService.importLoans(rows);
          await get().fetchLoans();
          return { ok: true, result: res };
        } catch (error) {
          return fail(error, 'Could not import the saved loans.');
        }
      },

      unwindTreasuryEntry: (reference_id) => enqueue(async () => {
        try {
          await TreasuryService.unwind(reference_id);
          await get().refresh('treasury', 'dashboard');
          return { ok: true };
        } catch (error) {
          return fail(error, 'Could not unwind the entry.');
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
        shopProfile: state.shopProfile,
        accentColor: state.accentColor,
        dashboardCardColors: state.dashboardCardColors,
        rolePermissions: state.rolePermissions,
        _cacheTimestamps: state._cacheTimestamps,
        // Persist tables so page reload does not blank out data and force full refetches
        inventory: state.inventory,
        categories: state.categories,
        units: state.units,
        customers: state.customers,
        deletedCustomers: state.deletedCustomers,
        suppliers: state.suppliers,
        deletedSuppliers: state.deletedSuppliers,
        sales: state.sales,
        purchases: state.purchases,
        returns: state.returns,
        settlements: state.settlements,
        expenses: state.expenses,
        expenseCategories: state.expenseCategories,
        staff: state.staff,
        attendance: state.attendance,
        leaves: state.leaves,
        payrolls: state.payrolls,
        srSettlements: state.srSettlements,
        drafts: state.drafts,
        cashBalance: state.cashBalance,
        bankBalance: state.bankBalance,
        accountTransactions: state.accountTransactions,
        dashboardSummary: state.dashboardSummary,
      }),
    }
  )
);

export default useStore;
