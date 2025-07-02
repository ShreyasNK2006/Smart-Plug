import React, { useState, useEffect, useRef } from 'react';
import EnergyChart from '../components/EnergyChart';
import { messaging, getToken, onMessage } from '../firebase';

const deviceIcons = {
  fridge: '🧊', geyser: '🔥', tv: '📺', ac: '❄️', washingMachine: '🧺', microwave: '🍲', dishwasher: '🍽️', oven: '🍞', other: '🔌'
};

const wsUrl = (ip) => `ws://${ip}/ws`;

const DashboardPage = ({ user, onLogout }) => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(false);
  const [deviceType, setDeviceType] = useState('');
  const [data, setData] = useState({ voltage: '--', current: '--', power: '--', frequency: '--', energy: '--' });
  const [timerOn, setTimerOn] = useState('');
  const [timerOff, setTimerOff] = useState('');
  const [alert, setAlert] = useState('');
  const [chartData, setChartData] = useState({ labels: [], values: [], totalEnergy: '--', totalCost: '--' });
  const [chartType, setChartType] = useState('energy');
  const [period, setPeriod] = useState('day');
  const [deviceIp, setDeviceIp] = useState('');
  const ws = useRef(null);

  useEffect(() => {
    if (connected && deviceIp) {
      ws.current = new window.WebSocket(wsUrl(deviceIp));
      ws.current.onopen = () => setAlert('Connected!');
      ws.current.onclose = () => setAlert('Disconnected!');
      ws.current.onerror = () => setAlert('WebSocket error!');
      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') setData(msg);
          if (msg.type === 'relayState') setStatus(msg.state);
          if (msg.type === 'chart') setChartData(msg.chart);
        } catch {}
      };
      return () => ws.current && ws.current.close();
    }
  }, [connected, deviceIp]);

  useEffect(() => {
    // Firebase push notification setup
    getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' })
      .then((currentToken) => {
        if (currentToken) {
          console.log('FCM Token:', currentToken);
        } else {
          console.log('No registration token available.');
        }
      })
      .catch((err) => {
        console.log('An error occurred while retrieving token. ', err);
      });
    onMessage(messaging, (payload) => {
      setAlert(`Notification: ${payload.notification?.title || ''} ${payload.notification?.body || ''}`);
    });
  }, []);

  useEffect(() => {
    // Auto-login if user is already authenticated
    const storedUser = localStorage.getItem('smartPlugUser');
    if (storedUser) {
      // Optionally, you can verify token/session here
    }
  }, []);

  const handleConnect = () => {
    if (!deviceIp) return setAlert('Enter device IP!');
    setConnected(true);
  };

  const handleToggle = () => {
    setStatus(s => !s);
    if (ws.current && ws.current.readyState === 1) ws.current.send('TOGGLE_RELAY');
  };

  const handleSetTimer = (type) => {
    if (ws.current && ws.current.readyState === 1) {
      ws.current.send(`${type === 'on' ? 'TIMER_ON' : 'TIMER_OFF'}:${(type === 'on' ? timerOn : timerOff) * 60}`);
      setAlert(`${type === 'on' ? 'ON' : 'OFF'} timer set!`);
    }
  };

  return (
    <div className="dashboard-container">
      <header>
        <h1>IoT Smart Plug</h1>
        <div className="user-info">
          <span>{user}</span>
          <button className="main-btn logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main>
        <section className="card power-control">
          <div className="card-header">
            <h2>Power</h2>
            <span className="device-icon">{deviceIcons[deviceType] || '🔌'}</span>
          </div>
          <div className="device-selection">
            <label>Device Type:</label>
            <select value={deviceType} onChange={e => setDeviceType(e.target.value)}>
              <option value="">Select a device</option>
              <option value="fridge">Refrigerator</option>
              <option value="geyser">Geyser</option>
              <option value="tv">Television</option>
              <option value="ac">Air Conditioner</option>
              <option value="washingMachine">Washing Machine</option>
              <option value="microwave">Microwave</option>
              <option value="dishwasher">Dishwasher</option>
              <option value="oven">Oven</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input type="text" placeholder="Device IP (e.g. 192.168.1.100)" value={deviceIp} onChange={e => setDeviceIp(e.target.value)} className="device-ip-input" />
          <button className="main-btn connect-btn" onClick={handleConnect}>Connect</button>
          <button className={`toggle-btn ${status ? 'on' : 'off'}`} onClick={handleToggle}>
            {status ? 'Turn OFF' : 'Turn ON'}
          </button>
          <div className="relay-status">
            <span>Status: </span>
            <span className={status ? 'on' : 'off'}>{status ? 'ON' : 'OFF'}</span>
          </div>
        </section>
        <section className="card data-display">
          <h2>Live Data</h2>
          <div className="grid-container">
            <div className="grid-item"><span>Voltage</span><h3>{data.voltage} V</h3></div>
            <div className="grid-item"><span>Current</span><h3>{data.current} A</h3></div>
            <div className="grid-item"><span>Power</span><h3>{data.power} W</h3></div>
            <div className="grid-item"><span>Frequency</span><h3>{data.frequency} Hz</h3></div>
          </div>
          <div className="total-energy">
            <h4>Total Energy Today</h4>
            <p>{data.energy} kWh</p>
          </div>
        </section>
        <section className="card timer-settings">
          <h2>Timers</h2>
          <div className="timer-input">
            <label>Turn ON in (minutes)</label>
            <input type="number" min="1" value={timerOn} onChange={e => setTimerOn(e.target.value)} />
            <button onClick={() => handleSetTimer('on')}>Set</button>
          </div>
          <div className="timer-input">
            <label>Turn OFF in (minutes)</label>
            <input type="number" min="1" value={timerOff} onChange={e => setTimerOff(e.target.value)} />
            <button onClick={() => handleSetTimer('off')}>Set</button>
          </div>
        </section>
        <section className="card chart-container">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div>
              <label style={{marginRight:8}}>Time Period:</label>
              <select value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="day">Last 24 Hours</option>
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="year">Last Year</option>
              </select>
            </div>
            <div>
              <label style={{marginRight:8}}>View:</label>
              <select value={chartType} onChange={e => setChartType(e.target.value)}>
                <option value="energy">Energy (kWh)</option>
                <option value="cost">Cost</option>
              </select>
            </div>
          </div>
          <EnergyChart data={chartData} period={period} chartType={chartType} />
        </section>
      </main>
      {alert && <div className="alert-container">{alert}</div>}
    </div>
  );
};

export default DashboardPage;
