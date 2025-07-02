import React, { useState } from 'react';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import './App.css';

function App() {
  const [user, setUser] = useState(localStorage.getItem('smartPlugUser') || null);

  const handleAuthSuccess = (username) => {
    setUser(username);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('smartPlugUser');
    localStorage.removeItem('smartPlugPass');
  };

  return (
    <div className="app-root">
      {user ? (
        <DashboardPage user={user} onLogout={handleLogout} />
      ) : (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

export default App;
