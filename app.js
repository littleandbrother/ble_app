/**
 * TinyML BLE Monitor - Main Application
 */

const App = {
    // Label mapping
    LABELS: {
        0: 'NORMAL',
        1: 'BALL FAULT',
        2: 'INNER RACE FAULT',
        3: 'OUTER RACE FAULT',
        4: 'UNKNOWN-4',
        5: 'UNKNOWN-5',
        6: 'UNKNOWN-6',
        7: 'UNKNOWN-7',
        8: 'UNKNOWN-8',
        9: 'UNKNOWN-9',
        10: 'UNKNOWN-10',
        11: 'UNKNOWN-11'
    },

    // Statistics
    stats: {
        packetsReceived: 0,
        packetsPerMinute: 0,
        missingPackets: 0,
        lastSequence: -1,
        startTime: null,
        classCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
        history: []  // array of { label, confidence, time }
    },

    // UI Elements
    elements: {},

    // Demo mode
    isDemo: false,
    demoInterval: null,

    /**
     * Initialize the application
     */
    async init() {
        this.cacheElements();
        this.bindEvents();
        this.initHistory();
        this.updateStats();

        // Check BLE support
        if (!BLE.isSupported()) {
            this.showStatus('Web Bluetooth not supported', false);
        } else {
            // Try to find paired device for auto-reconnect
            this.checkForPairedDevice();
        }

        console.log('[App] Initialized');
    },

    /**
     * Check for paired device and enable reconnect
     */
    async checkForPairedDevice() {
        const device = await BLE.getPairedDevice();
        if (device) {
            console.log('[App] Found paired device, auto-reconnect available');
            // Update button to show reconnect option
            this.elements.connectBtn.innerHTML = '<span class="btn-icon">🔄</span> Reconnect';
            this.elements.connectBtn.title = 'Click to reconnect to ' + device.name;
        }
    },

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            // Connection
            connectionStatus: document.getElementById('connectionStatus'),
            statusDot: document.querySelector('.status-dot'),
            statusText: document.querySelector('.status-text'),
            connectBtn: document.getElementById('connectBtn'),
            demoBtn: document.getElementById('demoBtn'),

            // Fault display
            faultLabel: document.getElementById('faultLabel'),
            confidenceValue: document.getElementById('confidenceValue'),
            seqValue: document.getElementById('seqValue'),
            lastInferenceTime: document.getElementById('lastInferenceTime'),
            confidencePercent: document.getElementById('confidencePercent'),
            ringProgress: document.getElementById('ringProgress'),

            // Stats
            packetsPerMin: document.getElementById('packetsPerMin'),
            missingPackets: document.getElementById('missingPackets'),
            uptime: document.getElementById('uptime'),

            // Class bars
            barNormal: document.getElementById('barNormal'),
            barBall: document.getElementById('barBall'),
            barInner: document.getElementById('barInner'),
            barOuter: document.getElementById('barOuter'),

            // History
            historyContainer: document.getElementById('historyContainer')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Connect button
        this.elements.connectBtn.addEventListener('click', () => {
            if (BLE.isConnected) {
                BLE.disconnect();
            } else {
                this.connect();
            }
        });

        // Demo button
        this.elements.demoBtn.addEventListener('click', () => {
            this.toggleDemo();
        });

        // BLE callbacks
        BLE.onDataReceived = (data) => this.handleData(data);
        BLE.onConnectionChange = (connected, name) => this.updateConnectionUI(connected, name);
    },

    /**
     * Connect to BLE device (tries reconnect first, then new pairing)
     */
    async connect() {
        try {
            this.elements.connectBtn.disabled = true;
            this.elements.connectBtn.innerHTML = '<span class="btn-icon">⏳</span> Connecting...';

            // Try reconnect first (no user interaction needed)
            const reconnected = await BLE.reconnect();

            if (!reconnected) {
                // No paired device, need user to select
                await BLE.connect();
            }

            // Reset stats on new connection
            this.resetStats();

        } catch (error) {
            console.error('[App] Connection failed:', error);
            alert('连接失败: ' + error.message);
        } finally {
            this.elements.connectBtn.disabled = false;
            this.updateConnectionUI(BLE.isConnected, BLE.device?.name);
        }
    },

    /**
     * Update connection UI
     */
    updateConnectionUI(connected, deviceName) {
        const { statusDot, statusText, connectBtn } = this.elements;

        if (connected) {
            statusDot.classList.remove('disconnected');
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            connectBtn.innerHTML = '<span class="btn-icon">🔌</span> Disconnect';
            connectBtn.classList.add('connected');
        } else {
            statusDot.classList.remove('connected');
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
            connectBtn.innerHTML = '<span class="btn-icon">📡</span> Connect';
            connectBtn.classList.remove('connected');
        }
    },

    /**
     * Handle received data
     */
    handleData(data) {
        const { label, confidence, confidencePercent, sequence, timestamp } = data;

        // Update stats
        this.stats.packetsReceived++;

        // Check for missing packets
        if (this.stats.lastSequence >= 0) {
            const expectedSeq = (this.stats.lastSequence + 1) % 256;
            if (sequence !== expectedSeq) {
                this.stats.missingPackets++;
            }
        }
        this.stats.lastSequence = sequence;

        // Update class counts
        if (label <= 3) {
            this.stats.classCounts[label]++;
        }

        // Add to history
        this.stats.history.push({
            label,
            confidence: confidencePercent,
            time: Date.now()
        });

        // Keep only last 60 history items
        if (this.stats.history.length > 60) {
            this.stats.history.shift();
        }

        // Update UI
        this.updateFaultDisplay(label, confidencePercent);
        this.updateSequenceDisplay(sequence);
        this.updateHistoryDisplay();
        this.updateClassBars();
    },

    /**
     * Update fault display
     */
    updateFaultDisplay(label, confidencePercent) {
        const { faultLabel, confidenceValue, confidencePercent: confPercentEl, ringProgress, lastInferenceTime } = this.elements;

        const labelText = this.LABELS[label] || 'UNKNOWN';
        const isNormal = label === 0;

        // Update text
        faultLabel.textContent = labelText;
        faultLabel.classList.toggle('normal', isNormal);

        confidenceValue.textContent = (confidencePercent / 100).toFixed(2);
        confPercentEl.textContent = `${confidencePercent}%`;

        // Update ring
        const circumference = 2 * Math.PI * 52;  // r=52
        const offset = circumference * (1 - confidencePercent / 100);
        ringProgress.style.strokeDashoffset = offset;
        ringProgress.classList.toggle('normal', isNormal);

        // Update last inference time
        lastInferenceTime.textContent = 'Just now';
    },

    /**
     * Update sequence display
     */
    updateSequenceDisplay(sequence) {
        this.elements.seqValue.textContent = sequence;
    },

    /**
     * Initialize history display
     */
    initHistory() {
        const container = this.elements.historyContainer;
        container.innerHTML = '';

        // Create 60 empty bars
        for (let i = 0; i < 60; i++) {
            const bar = document.createElement('div');
            bar.className = 'history-bar';
            bar.style.height = '5px';
            container.appendChild(bar);
        }
    },

    /**
     * Update history display
     */
    updateHistoryDisplay() {
        const bars = this.elements.historyContainer.querySelectorAll('.history-bar');
        const history = this.stats.history;

        bars.forEach((bar, index) => {
            if (index < history.length) {
                const item = history[history.length - 1 - index];
                bar.style.height = `${Math.max(5, item.confidence * 0.4)}px`;
                bar.classList.toggle('fault', item.label !== 0);
            }
        });
    },

    /**
     * Update class statistics bars
     */
    updateClassBars() {
        const { barNormal, barBall, barInner, barOuter } = this.elements;
        const counts = this.stats.classCounts;
        const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

        barNormal.style.width = `${(counts[0] / total) * 100}%`;
        barBall.style.width = `${(counts[1] / total) * 100}%`;
        barInner.style.width = `${(counts[2] / total) * 100}%`;
        barOuter.style.width = `${(counts[3] / total) * 100}%`;
    },

    /**
     * Update statistics display
     */
    updateStats() {
        const now = Date.now();

        if (this.stats.startTime) {
            // Calculate uptime
            const elapsed = Math.floor((now - this.stats.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.elements.uptime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Calculate packets per minute
            const elapsedMinutes = elapsed / 60;
            if (elapsedMinutes > 0) {
                this.stats.packetsPerMinute = Math.round(this.stats.packetsReceived / elapsedMinutes);
            }
        }

        this.elements.packetsPerMin.textContent = this.stats.packetsPerMinute;
        this.elements.missingPackets.textContent = this.stats.missingPackets;

        // Update every second
        setTimeout(() => this.updateStats(), 1000);
    },

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            packetsReceived: 0,
            packetsPerMinute: 0,
            missingPackets: 0,
            lastSequence: -1,
            startTime: Date.now(),
            classCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
            history: []
        };
        this.initHistory();
    },

    /**
     * Toggle demo mode
     */
    toggleDemo() {
        if (this.isDemo) {
            this.stopDemo();
        } else {
            this.startDemo();
        }
    },

    /**
     * Start demo mode with simulated data
     */
    startDemo() {
        if (BLE.isConnected) {
            BLE.disconnect();
        }

        this.isDemo = true;
        this.elements.demoBtn.textContent = 'Stop Demo';
        this.resetStats();
        this.updateConnectionUI(true, 'Demo Device');

        let seq = 0;

        this.demoInterval = setInterval(() => {
            // Generate random demo data
            const labels = [0, 0, 0, 1, 2, 3];  // Weighted towards Normal
            const label = labels[Math.floor(Math.random() * labels.length)];
            const confidence = 0.8 + Math.random() * 0.19;  // 80-99%

            const demoData = {
                version: 1,
                sequence: seq++ % 256,
                label: label,
                confidence: confidence,
                confidencePercent: Math.round(confidence * 100),
                timestamp: Date.now()
            };

            this.handleData(demoData);
        }, 500);  // 2 packets per second

        console.log('[App] Demo mode started');
    },

    /**
     * Stop demo mode
     */
    stopDemo() {
        this.isDemo = false;
        this.elements.demoBtn.textContent = 'Demo';

        if (this.demoInterval) {
            clearInterval(this.demoInterval);
            this.demoInterval = null;
        }

        this.updateConnectionUI(false, null);
        console.log('[App] Demo mode stopped');
    },

    /**
     * Show status message
     */
    showStatus(message, isError = false) {
        console.log('[App]', isError ? 'Error:' : 'Status:', message);
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
