# node-red-contrib-xiaomi-ble

This Node-Red module contains single "Xiaomi BLE" node that gets all known data from Xiaomi BLE (Bluetooth 4) devices 
using Bluetooth 4 compatible adapter.

Currently supported devices are:
* MiFlora - Xiaomi Mi plant sensor
* Xiaomi Mijia Bluetooth Temperature Humidity Sensor

## Installation

This module requires [noble](https://github.com/noble/noble) library. It will be installed automatically but in case 
of any problems you can try to install it manually using corresponding instructions.

To install this module use Node-Red GUI installer or console command:

```
npm install node-red-contrib-xiaomi-ble
```

## Usage

**Configuration:** Xiaomi BLE node needs only bluetooth address of devices (optional, if it's omitted then incoming message should have **address** property)

**Input message:** just triggers requesting data from the sensor. Optional parameters:
* _address_ - override address of the device from configuration.
* _scan_ - re-lookup for device even if it was already found before.

**Output message:** **msg.payload** object of the output message could contain next fields:
* _temperature_ - temperature from sensor
* _battery_ - battery level in percents
* _humidity_ - Mijia Temperature Humidity device only
* _light_, _moisture_, _conductivity_ - MiFlora device only

## Linux

On Linux bluetooth adapter could be used by root user only. 

To run node-red without root/sudo use instructions from [noble](https://github.com/noble/noble#running-on-linux)


## Version history


1.0.0 Initial release

1.1.0 Changed format of output message

1.2.0 Device's address could be specified in input message + configurable scanning timeout

1.2.1 Memory leak fixed

1.2.2 Added 'scan' parameter to message to force scanning

1.2.3 Bug-fix release

1.2.4 Change noble dependency to @abandonware/noble as former package is unmaintained

1.3.0 Added support of Xiaomi Mijia Bluetooth Thermometer 2 (aka LYWSD03MMC)