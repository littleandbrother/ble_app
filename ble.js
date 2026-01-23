/**
 * Web Bluetooth BLE Module
 * Handles connection to IoT_ML_Sensor device
 */

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
     * Connect to the BLE device using GATT
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
            if (this.onConnectionChange) {
                this.onConnectionChange(true, this.device.name);
            }
            
            console.log('[BLE] Connected successfully!');
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
     * Disconnect from device
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.handleDisconnect();
    },
    
    /**
     * Handle disconnect event
     */
    handleDisconnect() {
        console.log('[BLE] Disconnected');
        this.isConnected = false;
        this.device = null;
        this.characteristic = null;
        if (this.onConnectionChange) {
            this.onConnectionChange(false, null);
        }
    },
    
    /**
     * Handle incoming data from characteristic notification
     */
    handleData(dataView) {
        const buffer = dataView.buffer;
        
        // Check minimum length
        if (buffer.byteLength < 13) {
            console.warn('[BLE] Received short packet:', buffer.byteLength, 'bytes');
            return;
        }
        
        // Validate header
        const header1 = dataView.getUint8(0);
        const header2 = dataView.getUint8(1);
        
        if (header1 !== 0xA5 || header2 !== 0x5A) {
            console.warn('[BLE] Invalid header:', header1.toString(16), header2.toString(16));
            return;
        }
        
        // Parse ml_result_t structure
        const result = {
            version: dataView.getUint8(2),
            sequence: dataView.getUint8(3),
            label: dataView.getUint8(4),
            confidence: dataView.getInt16(5, true) / 32768.0,  // Q15 to float, little-endian
            timestamp: dataView.getUint32(7, true),            // little-endian
            crc: dataView.getUint16(11, true)                  // little-endian
        };
        
        // Validate label
        if (result.label > 11) {
            console.warn('[BLE] Invalid label:', result.label);
            return;
        }
        
        // Convert confidence to percentage
        result.confidencePercent = Math.round(result.confidence * 100);
        
        console.log('[BLE] Parsed result:', result);
        
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
