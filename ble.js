/**
 * Web Bluetooth BLE Module
 * Handles connection to IoT_ML_Sensor device
 * VERSION 5 - Added 1s connection monitoring
 */

console.log('[BLE] Module loaded - VERSION 5 (with 1s connection monitor)');

const BLE = {
    // Device configuration
    DEVICE_NAME: 'IoT_ML_Sensor',
    MANUFACTURER_ID: 0xFFFF,

    // Standard UUIDs (can be customized if device has specific UUIDs)
    SERVICE_UUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    CHAR_UUID: '0000fff1-0000-1000-8000-00805f9b34fb',

    // State
    device: null,
    characteristic: null,
    isConnected: false,

    // Connection monitor
    connectionCheckInterval: null,
    autoReconnect: false,  // Disabled - only monitor, no auto-reconnect
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,

    // Callbacks
    onDataReceived: null,
    onConnectionChange: null,

    /**
     * Check if Web Bluetooth is supported
     */
    isSupported() {
        return 'bluetooth' in navigator;
    },

    /**
     * Check if there are paired devices that can be reconnected
     * Returns the first matching device or null
     */
    async getPairedDevice() {
        if (!this.isSupported() || !navigator.bluetooth.getDevices) {
            console.log('[BLE] getDevices not supported');
            return null;
        }

        try {
            const devices = await navigator.bluetooth.getDevices();
            console.log('[BLE] Found', devices.length, 'paired devices');

            for (const device of devices) {
                if (device.name === this.DEVICE_NAME || device.name?.startsWith('IoT_ML')) {
                    console.log('[BLE] Found remembered device:', device.name);
                    return device;
                }
            }
        } catch (e) {
            console.log('[BLE] Cannot get paired devices:', e.message);
        }
        return null;
    },

    /**
     * Try to reconnect to a previously paired device (no user interaction needed)
     */
    async reconnect() {
        const device = await this.getPairedDevice();
        if (!device) {
            console.log('[BLE] No paired device found, need to pair first');
            return false;
        }

        try {
            console.log('[BLE] Reconnecting to:', device.name);
            this.device = device;

            // Set up disconnect handler
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });

            // Connect and setup (reuse common code)
            await this._connectAndSetup();
            return true;

        } catch (error) {
            console.error('[BLE] Reconnect failed:', error);
            return false;
        }
    },

    /**
     * Connect to the BLE device using GATT (requires user interaction)
     */
    async connect() {
        if (!this.isSupported()) {
            throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Android or Bluefy on iOS.');
        }

        try {
            console.log('[BLE] Requesting device...');

            // Request device with name filter
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: this.DEVICE_NAME },
                    { namePrefix: 'IoT_ML' }
                ],
                optionalServices: [this.SERVICE_UUID]
            });

            console.log('[BLE] Device found:', this.device.name);

            // Set up disconnect handler
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });

            // Connect and setup
            await this._connectAndSetup();
            return true;

        } catch (error) {
            console.error('[BLE] Connection error:', error);
            this.isConnected = false;
            if (this.onConnectionChange) {
                this.onConnectionChange(false, null);
            }
            throw error;
        }
    },

    /**
     * Internal: Connect to GATT and setup notifications
     */
    async _connectAndSetup() {
        // Connect to GATT server
        console.log('[BLE] Connecting to GATT server...');
        const server = await this.device.gatt.connect();

        // Get primary service
        console.log('[BLE] Getting service...');
        let service;
        try {
            service = await server.getPrimaryService(this.SERVICE_UUID);
        } catch (e) {
            // Try to get any available service
            const services = await server.getPrimaryServices();
            if (services.length > 0) {
                service = services[0];
                console.log('[BLE] Using first available service:', service.uuid);
            } else {
                throw new Error('No services found on device');
            }
        }

        // Get characteristic
        console.log('[BLE] Getting characteristic...');
        let characteristic;
        try {
            characteristic = await service.getCharacteristic(this.CHAR_UUID);
        } catch (e) {
            // Try to get any notify characteristic
            const chars = await service.getCharacteristics();
            for (const char of chars) {
                if (char.properties.notify) {
                    characteristic = char;
                    console.log('[BLE] Using notify characteristic:', char.uuid);
                    break;
                }
            }
            if (!characteristic) {
                throw new Error('No notify characteristic found');
            }
        }

        this.characteristic = characteristic;

        // Subscribe to notifications
        console.log('[BLE] Subscribing to notifications...');
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            this.handleData(event.target.value);
        });

        this.isConnected = true;
        this.reconnectAttempts = 0;  // Reset on successful connection

        // Start connection monitor
        this.startConnectionMonitor();

        if (this.onConnectionChange) {
            this.onConnectionChange(true, this.device.name);
        }

        console.log('[BLE] Connected successfully!');
    },

    /**
     * Start connection monitoring (check every 1 second)
     */
    startConnectionMonitor() {
        // Clear any existing interval
        this.stopConnectionMonitor();

        console.log('[BLE] Starting connection monitor (1s interval)');

        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 1000);  // Check every 1 second
    },

    /**
     * Stop connection monitoring
     */
    stopConnectionMonitor() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    },

    /**
     * Check connection status and attempt auto-reconnect if needed
     */
    async checkConnection() {
        // Check if device is still connected
        if (this.device && this.device.gatt && !this.device.gatt.connected) {
            console.log('[BLE] Connection lost detected by monitor');

            if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log('[BLE] Auto-reconnect attempt', this.reconnectAttempts, '/', this.maxReconnectAttempts);

                try {
                    await this._connectAndSetup();
                    console.log('[BLE] Auto-reconnect successful!');
                    this.reconnectAttempts = 0;
                } catch (e) {
                    console.log('[BLE] Auto-reconnect failed:', e.message);

                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        console.log('[BLE] Max reconnect attempts reached, giving up');
                        this.stopConnectionMonitor();
                        this.handleDisconnect();
                    }
                }
            }
        }
    },

    /**
     * Disconnect from device
     */
    disconnect() {
        this.autoReconnect = false;  // Disable auto-reconnect on manual disconnect
        this.stopConnectionMonitor();

        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.handleDisconnect();

        this.autoReconnect = true;  // Re-enable for next connection
    },

    /**
     * Handle disconnect event
     */
    handleDisconnect() {
        console.log('[BLE] Disconnected');
        this.isConnected = false;
        this.characteristic = null;
        // Note: Keep device reference for potential reconnect
        if (this.onConnectionChange) {
            this.onConnectionChange(false, null);
        }
    },

    /**
     * Handle incoming data from characteristic notification
     */
    handleData(dataView) {
        // Debug: log raw data as hex
        const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log('[BLE] Raw data (' + bytes.length + ' bytes):', hexStr);

        // Check minimum length - packet is 14 bytes with padding
        if (bytes.length < 14) {
            console.warn('[BLE] Received short packet:', bytes.length, 'bytes (expected 14)');
            // Still try to process if we have some data
            if (bytes.length < 8) {
                return;
            }
        }

        // Create a new DataView with correct offset
        const view = new DataView(dataView.buffer, dataView.byteOffset, dataView.byteLength);

        // Read header bytes
        const header1 = view.getUint8(0);
        const header2 = view.getUint8(1);

        console.log('[BLE] Header:', header1.toString(16), header2.toString(16));

        // Relaxed header validation - log warning but continue
        if (header1 !== 0xA5 || header2 !== 0x5A) {
            console.warn('[BLE] Unexpected header, trying to parse anyway...');
        }

        // Parse ml_result_t structure with CORRECT OFFSETS (includes padding byte at offset 5)
        // Offset: 0-1=Header, 2=Version, 3=Sequence, 4=Label, 5=Padding, 6-7=ProbQ15, 8-11=Timestamp, 12-13=CRC
        let result;
        try {
            const rawProb = bytes.length >= 8 ? view.getInt16(6, true) : 0;  // Offset 6, not 5!

            result = {
                version: view.getUint8(2),
                sequence: view.getUint8(3),
                label: view.getUint8(4),
                padding: view.getUint8(5),  // Padding byte
                rawProbQ15: rawProb,
                confidence: rawProb / 32768.0,  // Q15 to float, little-endian
                timestamp: bytes.length >= 12 ? view.getUint32(8, true) : 0,  // Offset 8, not 7!
                crc: bytes.length >= 14 ? view.getUint16(12, true) : 0        // Offset 12, not 11!
            };

            console.log('[BLE] Parsed values - label:', result.label,
                'padding:', result.padding,
                'rawProb:', result.rawProbQ15,
                'confidence:', result.confidence.toFixed(4));
        } catch (e) {
            console.error('[BLE] Parse error:', e);
            return;
        }

        // Relaxed label validation
        if (result.label > 11) {
            console.warn('[BLE] Unusual label:', result.label, '- displaying anyway');
        }

        // Convert confidence to percentage (handle negative values)
        result.confidencePercent = Math.max(0, Math.min(100, Math.round(Math.abs(result.confidence) * 100)));

        console.log('[BLE] Final result:', result);

        if (this.onDataReceived) {
            this.onDataReceived(result);
        }
    },

    /**
     * CRC-16 calculation (CCITT polynomial)
     */
    calculateCRC16(data, length) {
        let crc = 0xFFFF;
        for (let i = 0; i < length; i++) {
            crc ^= data[i] << 8;
            for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
        }
        return crc & 0xFFFF;
    }
};

// Export for use in app.js
window.BLE = BLE;
