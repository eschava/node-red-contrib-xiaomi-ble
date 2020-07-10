module.exports = function(RED) {
    "use strict";

	var noble = require('@abandonware/noble');
	const clearGrassCgg1Uuid = '582d3410b29b';

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


		function cleargrassTempHumiRead(peripheral, msg, send) {
			var serviceData = peripheral.advertisement.serviceData;
			if (serviceData && serviceData.length) {
                for (var i in serviceData) {
					/* All the information is in this Property called "FDCD" on the advertising data.
					The HEX string is as follows:
					"0807453810342d580104f500da02020145" (quotes included)
					To which:
					0807 or 0801: Ignore, but useful to identify relevant data
					453810342d58: MAC address, INVERTED (58:2d:34:10:38:45)
					0104f500da02: Data for Temperature and Humidity, broken as follows
					- 01: Indicates the Temperature and Humidity events
					- 04: Event data length (4, 2 bytes for Temperature, 2 bytes for Humidity)
					- f500: Temperature data inverted (00f5), which translates to 245, equivalent to 24.5C
					- da02: Humitity data inverted (02da), which translates to 730, equivalent to 73.0%
					020145: Data for Battery, bronek as follows
					- 02: Indicates the Battery events
					- 01: Event data length (1 byte)
					- 45: Battery data, which translates to 69, equivalent to 69%
					*/
					if (JSON.stringify(serviceData[i].uuid).includes('fdcd')){
						var stringAdvertise = JSON.stringify(serviceData[i].data.toString('hex'));
						var temp = parseInt(stringAdvertise.substring(23, 25) + stringAdvertise.substring(21, 23), 16);
						msg.temperature = temp/10;
						var humidity = parseInt(stringAdvertise.substring(27, 29) + stringAdvertise.substring(25, 27), 16);
						msg.humidity =  humidity/10;
						var battery = parseInt(stringAdvertise.substring(33, 35), 16);
						msg.battery = battery;
						send();
					}
                }
            }
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
				} else if (peripheral.uuid === clearGrassCgg1Uuid) {
					cleargrassTempHumiRead(peripheral, msg, send);
				} else {
					mijiaTemperatureRead(peripheral, msg, send);
				}
			});
        }

        node.on('input', function(msg) {
            // if address from message was changed: start scanning
            var forceScan = 'scan' in msg && msg.scan;
            var addressChanged = node.peripheral != null && 'address' in msg && msg.address && node.peripheral.address != msg.address.toLowerCase();
			if (node.peripheral != null && node.peripheral.uuid === clearGrassCgg1Uuid) {
				// we need to scan every time because the data is read from the advertisement info
				forceScan = true;
			}
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

				// in order to get advertising information in BLE scan responses, we must set allowDuplicates to true
				let allowDuplicates = true;
				if (noble.state === 'poweredOn') {
					noble.startScanning([], allowDuplicates);
				} else {
					noble.once('stateChange', function(state) {
						if (state === 'poweredOn') {
							noble.startScanning([], allowDuplicates);
						} else {
							node.status({fill:"red", shape:"dot", text:"device status: " + state});
						}
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
