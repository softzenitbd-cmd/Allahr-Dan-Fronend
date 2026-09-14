import {
  LayoutDashboard,
  CalendarDays,
  ShoppingCart,
  ReceiptText,
  Package,
  Truck,
  RefreshCcw,
  Users,
  DollarSign,
  ClipboardList,
  Landmark,
  BookOpen,
  Scale,
  FileText,
  Calendar,
  MessageSquare,
  Settings,
  Activity,
} from 'lucide-react';

export const SYSTEM_MENUS = [
  // Operations (দৈনন্দিন)
  {
    id: 'dashboard',
    path: '/',
    nameEn: 'Dashboard',
    nameBn: 'ড্যাশবোর্ড',
    group: 'ops',
    icon: LayoutDashboard,
  },
  {
    id: 'day-book',
    path: '/day-book',
    nameEn: 'Day Book',
    nameBn: 'আজকের হিসাব',
    group: 'ops',
    icon: CalendarDays,
  },
  {
    id: 'pos',
    path: '/pos',
    nameEn: 'POS',
    nameBn: 'বিক্রয়',
    group: 'ops',
    icon: ShoppingCart,
  },
  {
    id: 'pos-history',
    path: '/pos-history',
    nameEn: 'POS History',
    nameBn: 'পিওএস ইতিহাস',
    group: 'ops',
    icon: ReceiptText,
  },
  {
    id: 'inventory',
    path: '/inventory',
    nameEn: 'Inventory',
    nameBn: 'স্টক',
    group: 'ops',
    icon: Package,
  },
  {
    id: 'purchases',
    path: '/purchases',
    nameEn: 'Purchases',
    nameBn: 'ক্রয়',
    group: 'ops',
    icon: Truck,
  },
  {
    id: 'returns',
    path: '/returns',
    nameEn: 'Returns',
    nameBn: 'রিটার্ন',
    group: 'ops',
    icon: RefreshCcw,
  },
  {
    id: 'suppliers',
    path: '/suppliers',
    nameEn: 'Suppliers',
    nameBn: 'সাপ্লায়ার',
    group: 'ops',
    icon: Users,
  },
  {
    id: 'customers',
    path: '/customers',
    nameEn: 'Customers',
    nameBn: 'কাস্টমার',
    group: 'ops',
    icon: Users,
  },
  {
    id: 'expenses',
    path: '/expenses',
    nameEn: 'Expenses',
    nameBn: 'খরচ',
    group: 'ops',
    icon: DollarSign,
  },
  {
    id: 'sr',
    path: '/sr',
    nameEn: 'SR',
    nameBn: 'এসআর',
    group: 'ops',
    icon: Truck,
  },
  {
    id: 'stock-log',
    path: '/stock-log',
    nameEn: 'Stock Log',
    nameBn: 'স্টক লগ',
    group: 'ops',
    icon: ClipboardList,
  },

  // Management (ব্যবস্থাপনা)
  {
    id: 'accounts',
    path: '/accounts',
    nameEn: 'Accounts',
    nameBn: 'হিসাব',
    group: 'admin',
    icon: Landmark,
  },
  {
    id: 'ledger',
    path: '/ledger',
    nameEn: 'Ledger',
    nameBn: 'খাতা (লেজার)',
    group: 'admin',
    icon: BookOpen,
  },
  {
    id: 'balance-sheet',
    path: '/balance-sheet',
    nameEn: 'Balance Sheet',
    nameBn: 'ব্যালেন্স শিট',
    group: 'admin',
    icon: Scale,
  },
  {
    id: 'reports',
    path: '/reports',
    nameEn: 'Reports',
    nameBn: 'রিপোর্ট',
    group: 'admin',
    icon: FileText,
  },
  {
    id: 'hr',
    path: '/hr',
    nameEn: 'HR',
    nameBn: 'কর্মী',
    group: 'admin',
    icon: Calendar,
  },
  {
    id: 'sms',
    path: '/sms',
    nameEn: 'SMS',
    nameBn: 'এসএমএস',
    group: 'admin',
    icon: MessageSquare,
  },
  {
    id: 'activity-log',
    path: '/activity-log',
    nameEn: 'Activity Log',
    nameBn: 'অ্যাক্টিভিটি লগ',
    group: 'admin',
    icon: Activity,
  },
  {
    id: 'settings',
    path: '/settings',
    nameEn: 'Settings',
    nameBn: 'সেটিংস',
    group: 'admin',
    icon: Settings,
  },
];

export const ALL_MENU_PATHS = SYSTEM_MENUS.map((m) => m.path);

export const DEFAULT_ROLES = ['Admin', 'Manager', 'Salesman', 'Delivery', 'Cashier'];

export const DEFAULT_ROLE_PERMISSIONS = {
  Admin: ALL_MENU_PATHS,
  Manager: [
    '/',
    '/day-book',
    '/pos',
    '/pos-history',
    '/inventory',
    '/purchases',
    '/returns',
    '/suppliers',
    '/customers',
    '/expenses',
    '/sr',
    '/stock-log',
    '/reports',
    '/hr',
  ],
  Salesman: ['/', '/pos', '/pos-history', '/customers', '/returns'],
  Delivery: ['/', '/sr', '/returns', '/customers'],
  Cashier: ['/', '/day-book', '/pos', '/pos-history', '/customers', '/expenses'],
};

/**
 * Normalizes and returns role permissions, merging defaults with any custom overrides.
 */
export const getEffectivePermissions = (customPermissions = {}) => {
  return {
    ...DEFAULT_ROLE_PERMISSIONS,
    ...customPermissions,
    // Admin always retains full access
    Admin: ALL_MENU_PATHS,
  };
};

/**
 * Checks whether a given role or user has permission to view/access a menu path.
 */
export const hasMenuAccess = (userOrRole, path, rolePermissions = {}) => {
  if (!userOrRole || !path) return false;

  const role = typeof userOrRole === 'object' ? userOrRole.role : userOrRole;
  if (!role) return false;

  // Admin always has full access
  if (role.toLowerCase() === 'admin') return true;

  const effective = getEffectivePermissions(rolePermissions);
  const allowedPaths = effective[role] || DEFAULT_ROLE_PERMISSIONS[role] || ['/'];

  return allowedPaths.includes(path);
};
