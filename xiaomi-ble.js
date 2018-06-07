module.exports = function(RED) {
    "use strict";

    var noble = require('noble');
	
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
			peripheral.discoverSomeServicesAndCharacteristics(['226c000064764566756266734470666d'], ['226caa5564764566756266734470666d'], function(error, services, characteristics) {
				if (error != null) {
					node.status({fill:"red", shape:"dot", text:"cannot discover services: " + error});
					return;
				}
				
				for (var i = 0; i < characteristics.length; i++) {
					var chr = characteristics[i];
					if (chr.uuid === '226caa5564764566756266734470666d') {
						chr.once('data', function(data, isNotification) { 
							var result = /T=(\d+\.\d+) H=(\d+\.\d+)/.exec(data.toString());
							if (result != null ) {
								msg.payload = msg.temperature = parseFloat(result[1]);
								msg.humidity = parseFloat(result[2]);
								if (++dataCount == 2) send();
							} else {
								node.error('Incorrect data: ' + data);
							}
						});
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
					
					msg.payload = msg.temperature = (256 * data[1] + data[0]) / 10.0;
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
			
			var disconnectTimeout = setTimeout(function() {
				peripheral.disconnect();
			}, 30000);
			
			var send = function() {
				if (!sent) {
					if (Object.keys(msg).length > 0) {
						node.send(msg);
						node.status({});
					} else {
						node.status({fill:"red", shape:"dot", text:"no data"});
					}
					sent = true;
					node.requestActive = false;
					peripheral.disconnect();
					clearTimeout(disconnectTimeout);
				}
			}
			
			peripheral.once('disconnect', send);

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
			if (node.peripheral != null) {
				getData(node.peripheral);
			} else if (node.scanningActive) {
				node.status({fill:"yellow", shape:"dot", text:"searching"});
			} else {
				node.scanningActive = true;
				node.status({fill:"green", shape:"dot", text:"searching"});
				
				node.stopScanningTimeout = setTimeout(function() {
					noble.stopScanning();
				}, 60000);
				
				var foundDevices = [];
			
				var discover = function(peripheral) {
					foundDevices.push(peripheral.address);
					
					if (peripheral.address === config.address.toLowerCase()) {
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
						node.error('Device ' + config.address + ' not found among [' + foundDevices + ']');
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