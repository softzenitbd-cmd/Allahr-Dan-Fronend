import React, { useState } from 'react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { Wallet, Landmark, ArrowRightLeft, History, Plus, Printer } from 'lucide-react';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';

const Accounts = () => {
  const { cashBalance, bankBalance, accountTransactions, transferFunds, addManualEntry, user, language } = useStore();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [transferForm, setTransferForm] = useState({ from: 'Cash', to: 'Bank', amount: '' });
  const [entryForm, setEntryForm] = useState({ accountId: 'Cash', type: 'In', amount: '', description: '' });
  const [savingEntry, setSavingEntry] = useState(false);

  const handleManualEntry = async (e) => {
    e.preventDefault();
    const amount = parseFloat(entryForm.amount);
    if (!amount || amount <= 0) return toast.error('Enter an amount greater than zero.');

    setSavingEntry(true);
    const res = await addManualEntry({ ...entryForm, amount });
    setSavingEntry(false);
    if (res?.ok) {
      toast.success(
        entryForm.type === 'In'
          ? `৳${amount.toLocaleString()} added to ${entryForm.accountId}.`
          : `৳${amount.toLocaleString()} taken out of ${entryForm.accountId}.`
      );
      setEntryForm({ accountId: 'Cash', type: 'In', amount: '', description: '' });
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    const amount = parseFloat(transferForm.amount);
    if (!amount || amount <= 0) return toast.error('Invalid amount');
    
    if (transferForm.from === 'Cash' && amount > cashBalance) return toast.error('Insufficient Cash Balance');
    if (transferForm.from === 'Bank' && amount > bankBalance) return toast.error('Insufficient Bank Balance');

    const res = await transferFunds(transferForm.from, transferForm.to, amount);
    if (res?.ok) {
      toast.success('Transfer Successful!');
      setTransferForm({ from: 'Cash', to: 'Bank', amount: '' });
      setActiveTab('Dashboard');
    }
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="card text-center mt-8">
        <h2 className="text-danger">{t(language, 'Access Denied')}</h2>
        <p className="text-muted">{language === 'bn' ? 'শুধুমাত্র এডমিন একাউন্টস দেখতে পারবেন।' : 'Only Admins can access Accounts.'}</p>
      </div>
    );
  }

  return (
    <div className="accounts-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Accounts')}</h1>
          <p className="text-muted">{language === 'bn' ? 'ক্যাশ, ব্যাংক ব্যালেন্স এবং ফান্ড ট্রান্সফার ম্যানেজ করুন।' : 'Manage Cash, Bank balances, and internal transfers.'}</p>
        </div>
      </div>

      <div className="card glass mb-4" style={{ padding: '0.5rem' }}>
        <div className="return-type-selector" style={{ gap: '0.5rem' }}>
          <button className={`type-btn ${activeTab === 'Dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('Dashboard')}>
            <Wallet size={16} className="inline mr-2" /> {t(language, 'Balances' || 'Balances')}
          </button>
          <button className={`type-btn ${activeTab === 'Transfer' ? 'active' : ''}`} onClick={() => setActiveTab('Transfer')}>
            <ArrowRightLeft size={16} className="inline mr-2" /> {t(language, 'Bank Transfer' || 'Fund Transfer')}
          </button>
          <button className={`type-btn ${activeTab === 'History' ? 'active' : ''}`} onClick={() => setActiveTab('History')}>
            <History size={16} className="inline mr-2" /> {t(language, 'Transactions')}
          </button>
        </div>
      </div>

      {activeTab === 'Dashboard' && (
        <div className="grid responsive-grid-2">
          <div className="card text-center" style={{ borderLeft: '4px solid var(--success)' }}>
            <Wallet size={40} className="mx-auto text-success mb-2" />
            <h3 className="text-muted">{t(language, 'Cash Balance' || 'Cash in Hand')}</h3>
            <p className="text-3xl font-bold mt-2">৳{(cashBalance || 0).toLocaleString()}</p>
          </div>
          <div className="card text-center" style={{ borderLeft: '4px solid var(--primary)' }}>
            <Landmark size={40} className="mx-auto text-primary mb-2" />
            <h3 className="text-muted">{t(language, 'Bank Balance')}</h3>
            <p className="text-3xl font-bold mt-2">৳{(bankBalance || 0).toLocaleString()}</p>
          </div>

          {/* Money the owner puts in or takes out with no document behind it:
              the opening float, a capital injection, drawings. Without this,
              a drawer that runs dry cannot be topped up and every payment is
              refused with nowhere to go. */}
          <div className="card glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="mb-2">{t(language, 'Add or Withdraw Money')}</h3>
            <p className="text-muted text-sm mb-4">
              {language === 'bn'
                ? 'কোনো বিক্রয় বা ক্রয় ছাড়াই টাকা রাখা বা তোলা — যেমন সকালের খুচরা, মালিকের জমা বা উত্তোলন।'
                : 'Cash put in or taken out directly: the opening float, owner capital, or drawings.'}
            </p>
            <form onSubmit={handleManualEntry} className="flex-align-gap" style={{ gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: '120px' }}>
                <label className="text-muted text-sm block mb-1">{t(language, 'Account')}</label>
                <select value={entryForm.accountId} onChange={e => setEntryForm({ ...entryForm, accountId: e.target.value })}>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '120px' }}>
                <label className="text-muted text-sm block mb-1">{t(language, 'Type')}</label>
                <select value={entryForm.type} onChange={e => setEntryForm({ ...entryForm, type: e.target.value })}>
                  <option value="In">{language === 'bn' ? 'জমা (In)' : 'Money In'}</option>
                  <option value="Out">{language === 'bn' ? 'উত্তোলন (Out)' : 'Money Out'}</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '130px' }}>
                <label className="text-muted text-sm block mb-1">{t(language, 'Amount')}</label>
                <input
                  type="number" min="1" required
                  value={entryForm.amount}
                  onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <label className="text-muted text-sm block mb-1">{t(language, 'Description')}</label>
                <input
                  type="text" required className="w-full"
                  value={entryForm.description}
                  onChange={e => setEntryForm({ ...entryForm, description: e.target.value })}
                  placeholder={language === 'bn' ? 'যেমন: সকালের খুচরা টাকা' : 'e.g. Opening float for the day'}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ height: '42px' }} disabled={savingEntry}>
                {savingEntry ? t(language, 'Saving...') : t(language, 'Record')}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'Transfer' && (
        <div className="card glass" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 className="mb-4">Internal Fund Transfer</h2>
          <form onSubmit={handleTransfer}>
            <div className="form-group mb-4">
              <label>From Account</label>
              <select className="w-full" value={transferForm.from} onChange={e => setTransferForm({ ...transferForm, from: e.target.value, to: e.target.value === 'Cash' ? 'Bank' : 'Cash' })}>
                <option value="Cash">Cash (Balance: ৳{cashBalance || 0})</option>
                <option value="Bank">Bank (Balance: ৳{bankBalance || 0})</option>
              </select>
            </div>
            <div className="text-center my-2 text-muted">
              <ArrowRightLeft size={24} className="mx-auto" style={{ transform: 'rotate(90deg)' }} />
            </div>
            <div className="form-group mb-4">
              <label>To Account</label>
              <select className="w-full" disabled value={transferForm.to}>
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div className="form-group mb-6">
              <label>Amount (BDT)</label>
              <input required type="number" min="1" className="w-full" value={transferForm.amount} onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })} placeholder="Enter amount to transfer" />
            </div>
            <button type="submit" className="btn-primary w-full py-3" style={{ marginTop: '1.5rem' }}>Confirm Transfer</button>
          </form>
        </div>
      )}

      {activeTab === 'History' && (
        <div className="card glass">
          <div className="card-toolbar" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 className="mb-0">All Account Transactions</h3>
            <button className="btn-primary flex-align-gap" onClick={() => {
              printElement('printable-transactions', 'Accounts');
            }}>
              <Printer size={16} /> Print Transactions
            </button>
          </div>
          <div className="table-responsive" id="printable-transactions">
            <style>
              {`
                @media print {
                  #printable-transactions { padding: 1rem; background: white; color: black; }
                  #printable-transactions table { width: 100%; border-collapse: collapse; }
                  #printable-transactions th, #printable-transactions td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                  #printable-transactions .badge { color: black !important; background: transparent !important; border: 1px solid black; }
                }
              `}
            </style>
            <div className="print-only-header" style={{ display: 'none' }}>
              <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Allah Dan Gents Point - Transaction History</h2>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>{t(language, 'Account' || 'Account')}</th>
                  <th>{t(language, 'Type')}</th>
                  <th>{t(language, 'Description')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Amount' || 'Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {(!accountTransactions || accountTransactions.length === 0) ? (
                  <tr><td colSpan="5" className="text-center text-muted">No transactions found.</td></tr>
                ) : (
                  accountTransactions.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleString()}</td>
                      <td className="font-bold">{t.accountId}</td>
                      <td>
                        <span className={`badge ${t.type === 'In' ? 'bg-success text-white px-2 py-1 rounded' : 'bg-danger text-white px-2 py-1 rounded'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td>{t.description}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: t.type === 'In' ? 'var(--success)' : 'var(--danger)' }}>
                        {t.type === 'In' ? '+' : '-'}৳{t.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default Accounts;
