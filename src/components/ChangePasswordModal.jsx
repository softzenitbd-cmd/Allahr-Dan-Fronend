import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Lock, KeyRound, Eye, EyeOff, X, CheckCircle } from 'lucide-react';
import useStore from '../store/useStore';

const ChangePasswordModal = ({ isOpen, onClose }) => {
  const user = useStore((state) => state.user);
  const language = useStore((state) => state.language);
  const changePassword = useStore((state) => state.changePassword);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isBn = language === 'bn';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!oldPassword.trim()) {
      toast.warning(isBn ? 'বর্তমান পাসওয়ার্ড প্রদান করুন।' : 'Please enter your current password.');
      return;
    }

    if (!newPassword.trim()) {
      toast.warning(isBn ? 'নতুন পাসওয়ার্ড প্রদান করুন।' : 'Please enter a new password.');
      return;
    }

    if (newPassword.length < 4) {
      toast.warning(isBn ? 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' : 'New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(isBn ? 'নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।' : 'New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    const res = await changePassword(oldPassword.trim(), newPassword.trim(), confirmPassword.trim());
    setLoading(false);

    if (res.ok) {
      toast.success(res.message || (isBn ? 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!' : 'Password changed successfully!'));
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } else {
      toast.error(res.message || (isBn ? 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।' : 'Failed to change password.'));
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-main, #1e293b)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          animation: 'scaleUp 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-input, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary, #2563eb)',
              }}
            >
              <KeyRound size={19} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                {isBn ? 'পাসওয়ার্ড পরিবর্তন' : 'Change Password'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                {user?.username} ({user?.role || 'Admin'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            title={isBn ? 'বন্ধ করুন' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Old Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: 'var(--text-main, #334155)',
                }}
              >
                {isBn ? 'বর্তমান পাসওয়ার্ড *' : 'Current Password *'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showOld ? 'text' : 'password'}
                  required
                  className="w-full"
                  placeholder={isBn ? 'বর্তমান পাসওয়ার্ড লিখুন' : 'Enter current password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  style={{
                    width: '100%',
                    paddingRight: '2.5rem',
                    boxSizing: 'border-box',
                    height: '42px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
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
                  {showOld ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: 'var(--text-main, #334155)',
                }}
              >
                {isBn ? 'নতুন পাসওয়ার্ড *' : 'New Password *'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={4}
                  className="w-full"
                  placeholder={isBn ? 'নতুন গোপন পাসওয়ার্ড দিন' : 'Enter new password (min 4 chars)'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    paddingRight: '2.5rem',
                    boxSizing: 'border-box',
                    height: '42px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
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
                  {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: 'var(--text-main, #334155)',
                }}
              >
                {isBn ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন *' : 'Confirm New Password *'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  className="w-full"
                  placeholder={isBn ? 'আবার নতুন পাসওয়ার্ড দিন' : 'Re-enter new password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    paddingRight: '2.5rem',
                    boxSizing: 'border-box',
                    height: '42px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
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
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {confirmPassword && newPassword && (
                <div style={{ fontSize: '0.76rem', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {confirmPassword === newPassword ? (
                    <span style={{ color: '#16a34a' }}>✓ {isBn ? 'পাসওয়ার্ড মিলেছে' : 'Passwords match'}</span>
                  ) : (
                    <span style={{ color: '#dc2626' }}>✗ {isBn ? 'পাসওয়ার্ড মেলেনি' : 'Passwords do not match'}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div
            style={{
              marginTop: '1.75rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '0.55rem 1.15rem' }}
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                padding: '0.55rem 1.35rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <Lock size={15} />
              {loading
                ? isBn
                  ? 'পরিবর্তন হচ্ছে…'
                  : 'Updating…'
                : isBn
                ? 'পাসওয়ার্ড সংরক্ষণ করুন'
                : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
