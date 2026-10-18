import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { Send, MessageSquare, Users, Search, PlusCircle } from 'lucide-react';
import { t } from '../utils/i18n';
import { hasMenuAccess } from '../utils/navigationConfig';

const SMS = () => {
  const { customers, user, smsBalance, sendSms, language, rolePermissions, purchaseSms, refresh } = useStore();
  // Credits bought from the SMS provider are recorded here, so the shop's
  // count matches the provider and sending is not refused at zero.
  const [topUp, setTopUp] = useState(null); // { credits, cost, fromCash, saving }
  useEffect(() => { refresh('sms'); }, [refresh]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // A message carrying any Bengali switches the whole thing to Unicode, which
  // fits 70 characters per SMS instead of 160. Counting every message at 160
  // told the shop a three-part Bengali message would cost one credit.
  const isUnicode = /[^ -~]/.test(message);
  const smsParts = Math.max(1, Math.ceil((message.length || 1) / (isUnicode ? 70 : 160)));

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.phone && c.phone.includes(searchTerm))
  );

  const isAdmin = user?.role === 'Admin';
  const hasAccess = isAdmin || hasMenuAccess(user, '/sms', rolePermissions);
  if (!hasAccess) {
    return (
      <div className="card text-center" style={{ marginTop: '2rem' }}>
        <h2 className="text-danger">{t(language, 'Access Denied')}</h2>
        <p className="text-muted">{language === 'bn' ? 'শুধুমাত্র অনুমোদিত ব্যবহারকারী এসএমএস সিস্টেম অ্যাক্সেস করতে পারেন।' : 'Access Denied'}</p>
      </div>
    );
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedCustomers(filteredCustomers.map(c => c.id));
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleSelect = (id) => {
    if (selectedCustomers.includes(id)) {
      setSelectedCustomers(selectedCustomers.filter(cId => cId !== id));
    } else {
      setSelectedCustomers([...selectedCustomers, id]);
    }
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    if (selectedCustomers.length === 0) {
      alert('Please select at least one customer.');
      return;
    }
    if (!message.trim()) {
      alert('Message cannot be empty.');
      return;
    }

    setStatus('Sending SMS to ' + selectedCustomers.length + ' customers...');
    const result = await sendSms(message, selectedCustomers, []);
    setStatus('');

    if (result?.ok) {
      setMessage('');
      setSelectedCustomers([]);
    }
  };

  return (
    <div className="sms-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Customer SMS System' || 'SMS System')}</h1>
          <p className="text-muted">{language === 'bn' ? 'কাস্টমারদের প্রোমোশনাল বা বকেয়া রিমাইন্ডার এসএমএস পাঠান।' : 'Send promotional or due reminder SMS to customers.'}</p>
        </div>
      </div>

      <div className="card glass mb-4" style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Send size={18} className="text-primary" />
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>{t(language, 'Send SMS' || 'Send SMS')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 'bold' }}>
            {language === 'bn' ? 'বর্তমান এসএমএস ব্যালেন্স' : 'Current SMS Balance'}: <span className="text-primary" style={{ fontSize: '1.15rem' }}>{smsBalance} {t(language, 'SMS')}</span>
          </div>
          {isAdmin && !topUp && (
            <button type="button" className="btn-outline flex-align-gap" onClick={() => setTopUp({ credits: '', cost: '', fromCash: true, saving: false })}>
              <PlusCircle size={15} /> {language === 'bn' ? 'এসএমএস ব্যালেন্স যোগ করুন' : 'Add SMS balance'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && topUp && (
        <div className="card mb-4" style={{ padding: '1rem 1.25rem', border: '1px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '0.35rem' }}>{language === 'bn' ? 'কেনা এসএমএস যোগ করুন' : 'Add purchased SMS'}</h3>
          <p className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>
            {language === 'bn'
              ? 'এসএমএস কোম্পানি (GreenWeb) থেকে যত এসএমএস কিনেছেন সেটা এখানে লিখুন — তাহলে এখানকার ব্যালেন্স কোম্পানির সাথে মিলবে, আর এসএমএস পাঠানো যাবে।'
              : 'Enter the SMS you bought from the provider (GreenWeb), so the balance here matches it and sending is allowed.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'কত এসএমএস' : 'Number of SMS'} *</label>
              <input type="number" min="1" value={topUp.credits} placeholder="e.g. 1000"
                onChange={(e) => setTopUp({ ...topUp, credits: e.target.value })} style={{ width: '140px' }} />
            </div>
            <div>
              <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'দাম (৳)' : 'Price (৳)'}</label>
              <input type="number" min="0" value={topUp.cost} placeholder="e.g. 350"
                onChange={(e) => setTopUp({ ...topUp, cost: e.target.value })} style={{ width: '140px' }} />
            </div>
            <label className="flex-align-gap text-sm" style={{ cursor: 'pointer', paddingBottom: '0.5rem' }}>
              <input type="checkbox" checked={topUp.fromCash} onChange={(e) => setTopUp({ ...topUp, fromCash: e.target.checked })} />
              {language === 'bn' ? 'দাম দোকানের ক্যাশ থেকে দেওয়া হয়েছে (হিসাবে খরচ উঠবে)' : "Paid from the shop's cash (shows in the cash book)"}
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button type="button" className="btn-primary" disabled={topUp.saving}
              onClick={async () => {
                const credits = parseInt(topUp.credits, 10);
                if (!credits || credits <= 0) {
                  setStatus(language === 'bn' ? 'এসএমএস-এর সংখ্যা লিখুন।' : 'Enter the number of SMS.');
                  return;
                }
                const cost = topUp.fromCash ? (parseFloat(topUp.cost) || 0) : 0;
                setTopUp({ ...topUp, saving: true });
                const res = await purchaseSms(credits, cost);
                if (res?.ok) {
                  setTopUp(null);
                  setStatus(language === 'bn' ? `${credits} এসএমএস ব্যালেন্সে যোগ হয়েছে।` : `${credits} SMS added to the balance.`);
                } else {
                  setTopUp((cur) => (cur ? { ...cur, saving: false } : cur));
                }
              }}>
              {topUp.saving ? '…' : (language === 'bn' ? 'যোগ করুন' : 'Add')}
            </button>
            <button type="button" className="btn-outline" onClick={() => setTopUp(null)} disabled={topUp.saving}>
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      <div className="grid responsive-grid-2">
        <div className="card">
          <div className="card-toolbar" style={{ marginBottom: '1rem' }}>
            <h3><Users size={18} className="inline mr-2" /> {t(language, 'Select Customers' || 'Select Customers')}</h3>
            <label className="flex-align-gap" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                onChange={handleSelectAll}
              />
              Select All ({filteredCustomers.length})
            </label>
          </div>

          <div className="search-bar mb-4">
            <Search size={16} />
            <input 
              type="text" 
              placeholder={t(language, 'Search Customers...' || 'Search Customers...')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>{t(language, 'Name')}</th>
                  <th>{t(language, 'Phone')}</th>
                  <th>{t(language, 'Due')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(c => (
                  <tr key={c.id} onClick={() => handleSelect(c.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedCustomers.includes(c.id)}
                        onChange={() => {}} // Handled by row click
                      />
                    </td>
                    <td>{c.name}</td>
                    <td>{c.phone}</td>
                    <td className={c.due > 0 ? 'text-danger font-bold' : ''}>৳{c.due}</td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center text-muted">No customers found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3><MessageSquare size={18} className="inline mr-2" /> {t(language, 'Compose Message' || 'Compose Message')}</h3>
          <form onSubmit={handleSendSMS} style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label>{t(language, 'Message Content' || 'Message Content')}</label>
              <textarea 
                className="w-full"
                rows="6"
                placeholder={language === 'bn' ? 'আপনার মেসেজ লিখুন…' : 'Write your message…'}
                value={message}
                onChange={e => setMessage(e.target.value)}
                style={{ resize: 'vertical' }}
              ></textarea>
              <p className="text-sm text-muted mt-2 text-right">
                {t(language, 'Characters' || 'Characters')}: {message.length} ({smsParts} {t(language, 'SMS')}
                {isUnicode
                  ? (language === 'bn' ? ' — বাংলায় প্রতি এসএমএস ৭০ অক্ষর' : ' — Bengali: 70 chars per SMS')
                  : (language === 'bn' ? ' — ইংরেজিতে প্রতি এসএমএস ১৬০ অক্ষর' : ' — English: 160 chars per SMS')})
                {selectedCustomers.length > 0 && (
                  <><br />{language === 'bn' ? 'মোট খরচ হবে' : 'This send will use'}{' '}
                  <strong>{smsParts * selectedCustomers.length}</strong>{' '}
                  {language === 'bn' ? 'এসএমএস ক্রেডিট' : 'SMS credits'}</>
                )}
              </p>
            </div>

            {status && (
              <div className="mt-4 p-3 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', textAlign: 'center', fontWeight: 'bold' }}>
                {status}
              </div>
            )}

            <div className="mt-4 text-right">
              <button 
                type="submit" 
                className="btn-primary flex-align-gap" 
                style={{ marginLeft: 'auto' }}
                disabled={!!status}
              >
                <Send size={18} /> {t(language, 'Send SMS')} ({selectedCustomers.length} {t(language, 'selected' || 'selected')})
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SMS;
