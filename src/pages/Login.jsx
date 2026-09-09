import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { Lock, User } from 'lucide-react';
import './Login.css'; // We'll add some specific styling here
import { t } from '../utils/i18n';
import logo from '../assets/allah_dan.jpeg';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const signIn = useStore((state) => state.signIn);
  const language = useStore((state) => state.language);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    // The account decides the role. There is deliberately no role picker here:
    // letting someone choose their own would defeat every permission check the
    // server makes.
    const result = await signIn(username.trim(), password);
    setBusy(false);
    if (result?.ok) {
      navigate('/');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <img src={logo} alt="" />
          </div>
          <h2>{language === 'bn' ? 'আল্লাহর দান জেন্টস পয়েন্ট' : 'Allah Dan Gents Point'}</h2>
          <p>{language === 'bn' ? 'আপনার অ্যাকাউন্টে সাইন ইন করুন' : 'Sign in to your account'}</p>
        </div>
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <User size={18} className="input-icon" />
            <input
              type="text"
              placeholder={t(language, 'Username or ID' || 'Username or ID')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              placeholder={t(language, 'Password' || 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t(language, 'Signing in...') : t(language, 'Sign In')}
          </button>
        </form>

        <div className="login-footer">
          {language === 'bn'
            ? 'সমস্যা হলে দোকানের এডমিনের সাথে যোগাযোগ করুন।'
            : 'Trouble signing in? Ask the shop admin for your details.'}
        </div>
      </div>
    </div>
  );
};

export default Login;
