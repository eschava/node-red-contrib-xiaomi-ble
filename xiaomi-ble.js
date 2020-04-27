module.exports = function(RED) {
    "use strict";

    var noble = require('@abandonware/noble');
	
    function XiaomiBleNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

		node.peripheral = null;
		node.scanningActive = false;
		node.stopScanningTimeout = null;
		node.requestActive = false;
		
		function mijiaTemperatureRead(peripheral, msg, send) {
			var dataCount = 0;
			
			// read battery
			peripheral.readHandle(0x18, function (error, data) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot read battery: " + error});
					return;
				}
				msg.battery = data.toString().charCodeAt(0);
				if (++dataCount == 2) send();
			});
			
			// subscribe for data (temperature+humidity)
			peripheral.discoverSomeServicesAndCharacteristics(['226c000064764566756266734470666d', 'ebe0ccb07a0a4b0c8a1a6ff2997da3a6'], ['226caa5564764566756266734470666d', 'ebe0ccc17a0a4b0c8a1a6ff2997da3a6'], function(error, services, characteristics) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot discover services: " + error});
					return;
				}
				
				for (var i = 0; i < characteristics.length; i++) {
					var chr = characteristics[i];
					if (chr.uuid === '226caa5564764566756266734470666d') {
					    var dataFunction = function(data, isNotification) {
                            var result = /T=(\d+\.\d+) H=(\d+\.\d+)/.exec(data.toString());
                            if (result != null ) {
                                msg.temperature = parseFloat(result[1]);
                                msg.humidity = parseFloat(result[2]);
                                if (++dataCount == 2) send();
                            } else {
                                node.error('Incorrect data: ' + data);
                            }
                        };

						chr.once('data', dataFunction);
                        setTimeout(function() {chr.removeListener('data', dataFunction);}, 30000); // remove handler if no data received

						chr.subscribe(function(error) {
							if (error) node.error('Subscribe error: ' + error);
						});
					} else if (chr.uuid === 'ebe0ccc17a0a4b0c8a1a6ff2997da3a6') {
                        var dataFunction = function(data, isNotification) {
                            // Code from https://github.com/jipema/xiaomi-mijia-thermometer/blob/master/XiaomiMijiaThermometer.js {{{{
                            const prep = typeof data === typeof 's' ? data : JSON.stringify(data.toString('hex')).replace(/\"/gi, '');
                            const humidity = parseInt(prep.substr(4, 2), 16);
                            const tempRawHex = prep.substr(2, 2) + prep.substr(0, 2);
                            let tempRaw;
                            let isNegative = tempRawHex.substr(0, 1) === 'f';
                            if (isNegative) {
                                tempRaw = String(parseInt('ffff', 16) - parseInt(tempRawHex, 16));
                            } else {
                                tempRaw = parseInt(tempRawHex, 16).toString();
                            }
                            const temperature = (isNegative ? -1 : 1) * parseFloat(tempRaw.substr(0, tempRaw.length - 2) + '.' + tempRaw.substr(tempRaw.length - 2, 2));
                            // }}}}
                            msg.temperature = temperature;
                            msg.humidity = humidity;
                            if (++dataCount == 2) send();
                        };

                        chr.once('data', dataFunction);
                        setTimeout(function() {chr.removeListener('data', dataFunction);}, 30000); // remove handler if no data received

                        chr.subscribe(function(error) {
                            if (error) node.error('Subscribe error: ' + error);
                        });
                    }
				}
			});
		}
		
		function mifloraRead(peripheral, msg, send) {
			var dataCount = 0;

			// read battery
			peripheral.readHandle(0x038, function (error, data) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot read battery: " + error});
					return;
				}
				msg.battery = data.toString().charCodeAt(0);
				if (++dataCount == 2) send();
			});

			// read data
			peripheral.writeHandle(0x33, new Buffer([0xA0, 0x1F]), false, function (error) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot write: " + error});
					return;
				}
				peripheral.readHandle(0x35, function (error, data) {
					if (error != null) {
						node.status({fill:"red", shape:"dot", text:"cannot read data: " + error});
						return;
					}
					
					msg.temperature = (256 * data[1] + data[0]) / 10.0;
					msg.light = 256 * data[4] + data[3];
					msg.moisture = data[7];
					msg.conductivity = 256 * data[9] + data[8];
					if (++dataCount == 2) send();
				});
			});
		}
		
        function getData(peripheral) {
			if (node.requestActive) {
				node.status({fill:"yellow", shape:"dot", text:"requesting"});
				return;
			}
			node.status({fill:"green", shape:"dot", text:"requesting"});
			node.requestActive = true;
			
			var msg = {};
			var sent = false;
			
			var send = function() {
				if (!sent) {
					if (Object.keys(msg).length > 0) {
						node.send({payload: msg, address: peripheral.address});
						node.status({});
					} else {
						node.status({fill:"red", shape:"dot", text:"no data"});
					}
					sent = true;
					node.requestActive = false;
					peripheral.disconnect();
					clearTimeout(disconnectTimeout);
					peripheral.removeListener('disconnect', send);
				}
			}

			peripheral.once('disconnect', send);
            var disconnectTimeout = setTimeout(send, 30000);

			peripheral.connect(function(error) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot connect: " + error});
					node.requestActive = false;
					clearTimeout(disconnectTimeout);
					return;
				}
				
				if (peripheral.advertisement.serviceUuids.indexOf('fe95') >= 0) {
					mifloraRead(peripheral, msg, send);
				} else {
					mijiaTemperatureRead(peripheral, msg, send);
				}
			});
        }
		
        node.on('input', function(msg) {
            // if address from message was changed: start scanning
            var forceScan = 'scan' in msg && msg.scan;
            var addressChanged = node.peripheral != null && 'address' in msg && msg.address && node.peripheral.address != msg.address.toLowerCase();
            if (forceScan || addressChanged) {
                node.peripheral = null;
            }

			if (node.peripheral != null) {
				getData(node.peripheral);
			} else if (node.scanningActive) {
				node.status({fill:"yellow", shape:"dot", text:"searching"});
			} else {
			    var address = msg.address || config.address;
			    if (!address) {
			        node.status({fill:"red", shape:"dot", text:"address is not specified"});
			        return;
			    }
				node.scanningActive = true;
				node.status({fill:"green", shape:"dot", text:"searching"});

				node.stopScanningTimeout = setTimeout(function() {
					noble.stopScanning();
				}, parseInt(config.scanningTimeout) * 1000);

				var foundDevices = [];
			
				var discover = function(peripheral) {
					foundDevices.push(peripheral.address);
					
					if (peripheral.address === address.toLowerCase()) {
						node.peripheral = peripheral;
						noble.removeListener('discover', discover);
						node.scanningActive = false;
						
						getData(node.peripheral);
					}
				}
				noble.on('discover', discover);
				
				noble.once('scanStop', function() {
					noble.removeListener('discover', discover);
					node.scanningActive = false;
					if (node.peripheral == null) {
						node.status({fill:"red", shape:"dot", text:"not found"});
						node.error('Device ' + address + ' not found among [' + foundDevices + ']');
					}
				});
			
				if (noble.state === 'poweredOn') {
					noble.startScanning();
				} else {
					noble.once('stateChange', function(state) {
						if (state === 'poweredOn')
							noble.startScanning();
						else
							node.status({fill:"red", shape:"dot", text:"device status: " + state});
					});
				}
			}
        });
		
		this.on('close', function() {
			if (node.stopScanningTimeout)
				clearTimeout(node.stopScanningTimeout);
			noble.stopScanning();
			node.status({});
		});
    }
    RED.nodes.registerType("Xiaomi BLE", XiaomiBleNode);
}
