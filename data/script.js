// --- DOM Elements ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const logoutBtn = document.getElementById('logout-btn');
const welcomeMsg = document.getElementById('welcome-msg');
const connectBtn = document.getElementById('connect-btn');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');
const deviceIcon = document.getElementById('device-icon');
const deviceSelect = document.getElementById('device-type');

// Modal Elements
const addDeviceModal = document.getElementById('add-device-modal');
const addDeviceForm = document.getElementById('add-device-form');
const cancelAddDeviceBtn = document.getElementById('cancel-add-device-btn');
const deviceNameInput = document.getElementById('device-name-input');
const deviceIpInput = document.getElementById('device-ip-input');
const deviceTypeSelect = document.getElementById('device-type-select');

// Dashboard Elements
const toggleBtn = document.getElementById('toggle-btn');
const plugStatus = document.getElementById('plug-status');
const alertContainer = document.getElementById('alert-container');
const setOnTimerBtn = document.getElementById('set-on-timer-btn');
const setOffTimerBtn = document.getElementById('set-off-timer-btn');
const timerOnInput = document.getElementById('timer-on-input');
const timerOffInput = document.getElementById('timer-off-input');

// Signup Elements
const signupBox = document.getElementById('signup-box');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const signupUsername = document.getElementById('signup-username');
const signupPassword = document.getElementById('signup-password');
const signupPassword2 = document.getElementById('signup-password2');
const signupBtn = document.getElementById('signup-btn');

// --- App State ---
let websocket;
let currentUser = null;
let devices = [];
let activeDeviceIndex = -1;
const deviceIcons = {
    plug: '🔌', light: '💡', ac: '❄️', fridge: '🧊',
    geyser: '🔥', fan: '💨', tv: '📺'
};

// Chart.js setup
let energyChart = null;

// Chart configuration
const chartConfig = {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Energy Consumption',
            data: [],
            borderColor: '#0052D4',
            backgroundColor: 'rgba(0, 82, 212, 0.1)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Energy Consumption Over Time'
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: 'Time'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: 'Energy (kWh)'
                }
            }
        }
    }
};

// --- Login/Signup UI Logic ---
function checkLoginState() {
    const savedUser = localStorage.getItem('smartPlugUser');
    if (savedUser) {
        currentUser = savedUser;
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        welcomeMsg.textContent = `Welcome, ${currentUser}`;
        loadDevices();
    }
}

// Initialize UI elements
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

// Toggle between login and signup forms
if (tabLogin && tabSignup && loginForm && signupForm) {
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    });
    tabSignup.addEventListener('click', () => {
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });
}

// --- User Management ---
function getUsers() {
    const users = localStorage.getItem('smartPlugUsers');
    return users ? JSON.parse(users) : {};
}

function saveUsers(users) {
    localStorage.setItem('smartPlugUsers', JSON.stringify(users));
}

function login(username, password) {
    if (!username || !password) {
        showAlert('Please enter both username and password.');
        return;
    }
    
    const users = getUsers();
    if (!users[username] || users[username] !== password) {
        showAlert('Invalid username or password.');
        return;
    }
    
    currentUser = username;
    localStorage.setItem('smartPlugUser', username);
    localStorage.setItem('smartPlugPass', password);
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    welcomeMsg.textContent = `Welcome, ${currentUser}`;
    loadDevices();
}

function signup(username, password, password2) {
    if (!username || !password || !password2) {
        showAlert('Please fill all fields!');
        return;
    }
    if (password !== password2) {
        showAlert('Passwords do not match!');
        return;
    }
    
    const users = getUsers();
    if (users[username]) {
        showAlert('Username already exists!');
        return;
    }
    
    users[username] = password;
    saveUsers(users);
    
    // Remember credentials for next login
    localStorage.setItem('smartPlugUser', username);
    localStorage.setItem('smartPlugPass', password);
    
    showAlert('Sign up successful! You can now log in.');
    
    // Switch to login tab and auto-fill
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    
    usernameInput.value = username;
    passwordInput.value = password;
}

function logout() {
    currentUser = null;
    localStorage.removeItem('smartPlugUser');
    localStorage.removeItem('smartPlugPass');
    
    if (websocket) websocket.close();
    
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
}

// --- Event Listeners for Auth ---
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        login(usernameInput.value.trim(), passwordInput.value);
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', () => {
        signup(signupUsername.value.trim(), signupPassword.value, signupPassword2.value);
    });
}

// Enter key support
if (passwordInput) {
    passwordInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            login(usernameInput.value.trim(), passwordInput.value);
        }
    });
}

if (signupPassword2) {
    signupPassword2.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            signup(signupUsername.value.trim(), signupPassword.value, signupPassword2.value);
        }
    });
}

// --- WebSocket Functions ---
function initWebSocket() {
    if (activeDeviceIndex === -1) {
        showAlert("Please add and select a device first.");
        return;
    }
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        showAlert('Already connected.');
        return;
    }
    
    updateConnectionStatus(null, 'Connecting...');
    
    const activeDevice = devices[activeDeviceIndex];
    const gateway = `ws://${activeDevice.ip}/ws`;
    websocket = new WebSocket(gateway);
    websocket.onopen = onOpen;
    websocket.onclose = onClose;
    websocket.onerror = onError;
    websocket.onmessage = onMessage;
}

function onOpen(event) {
    console.log('Connection opened');
    updateConnectionStatus(true);
}

function onClose(event) {
    console.log('Connection closed');
    updateConnectionStatus(false);
}

function onError(event) {
    console.error('WebSocket error:', event);
    updateConnectionStatus(false);
    showAlert(`Connection to ${devices[activeDeviceIndex].name} failed.`);
}

function onMessage(event) {
    let data;
    try { data = JSON.parse(event.data); } 
    catch (e) { console.error('Error parsing JSON:', e); return; }

    switch(data.type) {
        case 'data':
            updateSensorReadings(data);
            break;
        case 'relayState': updateRelayState(data.state); break;
        case 'alert': showAlert(data.message); break;
    }
}

// --- UI & Data Functions ---
function updateConnectionStatus(isConnected, text = null) {
    if (text) {
        connectionDot.className = 'dot';
        connectionText.textContent = text;
        return;
    }
    connectionDot.className = isConnected ? 'dot connected' : 'dot disconnected';
    connectionText.textContent = isConnected ? 'Connected' : 'Disconnected';
}

function updateSensorReadings(data) {
    document.getElementById('voltage').textContent = `${data.voltage.toFixed(1)} V`;
    document.getElementById('current').textContent = `${data.current.toFixed(3)} A`;
    document.getElementById('power').textContent = `${data.power.toFixed(2)} W`;
    document.getElementById('energy').textContent = `${data.energy.toFixed(3)} kWh`;
    document.getElementById('frequency').textContent = `${data.frequency.toFixed(1)} Hz`;
}

function updateRelayState(state) {
    const statusText = state ? 'ON' : 'OFF';
    const statusClass = state ? 'on' : 'off';
    
    plugStatus.textContent = statusText;
    plugStatus.className = statusClass;
    toggleBtn.className = `toggle-btn ${statusClass}`;
}

function resetUI() {
    updateSensorReadings({voltage: 0, current: 0, power: 0, energy: 0, frequency: 0});
    updateRelayState(false);

    if(activeDeviceIndex !== -1) {
        const device = devices[activeDeviceIndex];
        deviceIcon.textContent = deviceIcons[device.type] || '🔌';
    } else {
        deviceIcon.textContent = '';
    }
}

function showAlert(message) {
    const alert = document.createElement('div');
    alert.className = 'alert';
    alert.textContent = message;
    alertContainer.appendChild(alert);

    setTimeout(() => {
        alert.style.opacity = '0';
        alert.style.transform = 'translateX(100%)';
        setTimeout(() => alert.remove(), 500);
    }, 4000);
}

// --- Device Management ---
function getDevicesStorageKey() { 
    return `smartPlugDevices_${currentUser}`; 
}

function loadDevices() {
    const key = getDevicesStorageKey();
    devices = JSON.parse(localStorage.getItem(key)) || [];
    // Don't try to populate deviceSelect since it's static
}

function saveDevices() {
    localStorage.setItem(getDevicesStorageKey(), JSON.stringify(devices));
}

function switchDevice(index) {
    activeDeviceIndex = index;
    if (index === -1) {
        resetUI();
        return;
    }
    if (websocket) websocket.close();
    resetUI();
}

// --- Chart Functions ---
function initChart() {
    const ctx = document.getElementById('energy-chart').getContext('2d');
    energyChart = new Chart(ctx, chartConfig);
}

function updateChart(data, period) {
    if (!energyChart) return;

    const labels = [];
    const values = [];
    let totalEnergy = 0;
    const kwhRate = 0.12; // Example rate per kWh

    data.forEach(reading => {
        const date = new Date(reading.t * 1000);
        switch(period) {
            case 'day':
                labels.push(date.toLocaleTimeString());
                break;
            case 'week':
            case 'month':
                labels.push(date.toLocaleDateString());
                break;
            case 'year':
                labels.push(date.toLocaleDateString('default', { month: 'short' }));
                break;
        }
        values.push(reading.e);
        totalEnergy += reading.e;
    });

    energyChart.data.labels = labels;
    energyChart.data.datasets[0].data = values;
    energyChart.update();

    // Update summary
    document.getElementById('total-energy').textContent = totalEnergy.toFixed(2) + ' kWh';
    document.getElementById('total-cost').textContent = '$' + (totalEnergy * kwhRate).toFixed(2);
}

// --- Event Listeners ---
window.addEventListener('load', function() {
    checkLoginState();
    
    // Auto-fill login form if credentials are stored
    const rememberedUser = localStorage.getItem('smartPlugUser');
    const rememberedPass = localStorage.getItem('smartPlugPass');
    if (rememberedUser && usernameInput) usernameInput.value = rememberedUser;
    if (rememberedPass && passwordInput) passwordInput.value = rememberedPass;
});

if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

if (connectBtn) {
    connectBtn.addEventListener('click', initWebSocket);
}

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send('TOGGLE_RELAY');
        } else {
            showAlert('Not connected. Please connect to a device first.');
        }
    });
}

function setTimer(type, inputElement) {
    const minutes = parseInt(inputElement.value);
    if (!isNaN(minutes) && minutes > 0) {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(`${type}:${minutes * 60}`);
            inputElement.value = '';
            showAlert(`${type.replace('_', ' ')} set for ${minutes} minutes.`);
        } else {
            showAlert('Not connected. Please connect to a device first.');
        }
    } else {
        showAlert('Please enter a valid number of minutes.');
    }
}

if (setOnTimerBtn) {
    setOnTimerBtn.addEventListener('click', () => setTimer('TIMER_ON', timerOnInput));
}

if (setOffTimerBtn) {
    setOffTimerBtn.addEventListener('click', () => setTimer('TIMER_OFF', timerOffInput));
}

// Device selection handler - works with static dropdown
if (deviceSelect) {
    deviceSelect.addEventListener('change', function(e) {
        const selectedDevice = e.target.value;
        if (selectedDevice) {
            // Update the device icon based on selection
            const deviceIconElement = document.getElementById('device-icon');
            if (deviceIconElement) {
                deviceIconElement.textContent = deviceIcons[selectedDevice] || '🔌';
            }
            
            // If websocket is connected, send device type to ESP32
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'setDevice',
                    device: selectedDevice
                }));
            }
            
            showAlert(`Device type set to: ${selectedDevice}`);
        }
    });
}

// Time period selection handler
document.getElementById('time-period').addEventListener('change', function(e) {
    const period = e.target.value;
    websocket.send(JSON.stringify({
        type: 'getData',
        period: period
    }));
});

// Initialize chart when page loads
document.addEventListener('DOMContentLoaded', function() {
    initChart();
    const rememberedUser = localStorage.getItem('smartPlugUser');
    const rememberedPass = localStorage.getItem('smartPlugPass');
    if (rememberedUser) usernameInput.value = rememberedUser;
    if (rememberedPass) passwordInput.value = rememberedPass;
});

// --- Fix Sign Up Link to Navigate to signup.html ---
if (showSignup) {
    showSignup.addEventListener('click', e => {
        e.preventDefault();
        window.location.href = 'signup.html';
    });
}

// --- Signup Page Logic ---
if (window.location.pathname.endsWith('signup.html')) {
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', e => {
            e.preventDefault();
            const username = document.getElementById('signup-username').value;
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-password2').value;
            if (!username || !password || !confirmPassword) {
                alert('Please fill all fields!');
                return;
            }
            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }
            const usersArr = getUsers();
            if (usersArr.some(u => u.username === username)) {
                alert('Username already exists!');
                return;
            }
            usersArr.push({ username, password });
            saveUsers(usersArr);
            // Remember credentials for next login
            localStorage.setItem('smartPlugUser', username);
            localStorage.setItem('smartPlugPass', password);
            alert('Sign up successful! Redirecting to login page.');
            window.location.href = 'index.html';
        });
    }
}

// --- Fix Login Form Submission for index.html ---
if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            login(usernameInput.value.trim(), passwordInput.value);
        });
    }
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            login(usernameInput.value.trim(), passwordInput.value);
        });
    }
}