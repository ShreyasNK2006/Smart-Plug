// --- DOM Elements ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const logoutBtn = document.getElementById('logout-btn');
const welcomeMsg = document.getElementById('welcome-msg');
const connectBtn = document.getElementById('connect-btn');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');
const deviceIcon = document.getElementById('device-icon');

const deviceSelect = document.getElementById('device-select');
const addDeviceBtn = document.getElementById('add-device-btn');

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
        case 'historicalData': handleHistoricalData(data); break;
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

// --- User Management ---
function login(username) {
    if (!username) { showAlert('Please enter a username.'); return; }
    currentUser = username;
    localStorage.setItem('smartPlugUser', username);
    
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    welcomeMsg.textContent = `Welcome, ${currentUser}!`;
    
    loadDevices();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('smartPlugUser');
    
    if (websocket) websocket.close();
    
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    usernameInput.value = '';
    updateConnectionStatus(false);
    deviceSelect.innerHTML = '';
}

function checkLoginState() {
    const savedUser = localStorage.getItem('smartPlugUser');
    if (savedUser) login(savedUser);
}

// --- Device Management ---
function getDevicesStorageKey() { return `smartPlugDevices_${currentUser}`; }

function loadDevices() {
    const key = getDevicesStorageKey();
    devices = JSON.parse(localStorage.getItem(key)) || [];
    populateDeviceSelect();
    switchDevice(devices.length > 0 ? 0 : -1);
}

function saveDevices() {
    localStorage.setItem(getDevicesStorageKey(), JSON.stringify(devices));
}

function populateDeviceSelect() {
    deviceSelect.innerHTML = '';
    devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = device.name;
        deviceSelect.appendChild(option);
    });
}

function handleAddDevice(event) {
    event.preventDefault();
    const name = deviceNameInput.value.trim();
    const ip = deviceIpInput.value.trim();
    const type = deviceTypeSelect.value;

    if (!name || !ip) {
        showAlert("Name and IP address are required.");
        return;
    }

    devices.push({ name, ip, type });
    saveDevices();
    populateDeviceSelect();
    switchDevice(devices.length - 1);
    
    addDeviceModal.classList.add('hidden');
    showAlert(`Device "${name}" added!`);
}

function switchDevice(index) {
    activeDeviceIndex = index;
    if (index === -1) {
        resetUI();
        return;
    }
    deviceSelect.value = index;
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
window.addEventListener('load', checkLoginState);
loginBtn.addEventListener('click', () => login(usernameInput.value.trim()));
usernameInput.addEventListener('keyup', e => { if (e.key === 'Enter') login(usernameInput.value.trim()); });
logoutBtn.addEventListener('click', logout);
connectBtn.addEventListener('click', initWebSocket);

addDeviceBtn.addEventListener('click', () => {
    addDeviceForm.reset();
    addDeviceModal.classList.remove('hidden');
});
cancelAddDeviceBtn.addEventListener('click', () => addDeviceModal.classList.add('hidden'));
addDeviceForm.addEventListener('submit', handleAddDevice);

deviceSelect.addEventListener('change', (e) => switchDevice(parseInt(e.target.value)));

toggleBtn.addEventListener('click', () => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send('TOGGLE_RELAY');
    } else {
        showAlert('Not connected. Please connect to a device first.');
    }
});

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

setOnTimerBtn.addEventListener('click', () => setTimer('TIMER_ON', timerOnInput));
setOffTimerBtn.addEventListener('click', () => setTimer('TIMER_OFF', timerOffInput));

// Device selection handler
document.getElementById('device-type').addEventListener('change', function(e) {
    const device = e.target.value;
    if (device) {
        websocket.send(JSON.stringify({
            type: 'setDevice',
            device: device
        }));
    }
});

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
});