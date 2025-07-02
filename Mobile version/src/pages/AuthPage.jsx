import React, { useState, useEffect } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const AuthPage = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Try to auto-login if user is already authenticated
    const storedUser = localStorage.getItem('smartPlugUser');
    const storedEmail = localStorage.getItem('smartPlugEmail');
    if (storedUser && storedEmail) {
      onAuthSuccess(storedUser, storedEmail);
    }
  }, [onAuthSuccess]);

  const handleLogin = async () => {
    setError('');
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
      // Save to localStorage for persistence
      localStorage.setItem('smartPlugUser', username || email.split('@')[0]);
      localStorage.setItem('smartPlugEmail', email);
      onAuthSuccess(username || email.split('@')[0], email);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignup = async () => {
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match!');
      return;
    }
    try {
      const auth = getAuth();
      await createUserWithEmailAndPassword(auth, email, password);
      localStorage.setItem('smartPlugUser', username || email.split('@')[0]);
      localStorage.setItem('smartPlugEmail', email);
      setIsLogin(true);
      setError('Sign up successful! Please log in.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-tabs">
          <button className={isLogin ? 'active' : ''} onClick={() => { setIsLogin(true); setError(''); }}>Login</button>
          <button className={!isLogin ? 'active' : ''} onClick={() => { setIsLogin(false); setError(''); }}>Sign Up</button>
        </div>
        {isLogin ? (
          <div className="auth-form">
            <h2>Login</h2>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
            <input type="text" placeholder="Username (optional)" value={username} onChange={e => setUsername(e.target.value)} autoComplete="nickname" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="main-btn" onClick={handleLogin}>Login</button>
          </div>
        ) : (
          <div className="auth-form">
            <h2>Sign Up</h2>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="nickname" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            <button className="main-btn" onClick={handleSignup}>Sign Up</button>
          </div>
        )}
        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
};

export default AuthPage;
