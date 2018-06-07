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

Xiaomi BLE node requires only bluetooth address of devices. "payload" value of produced messages contains next fields:
* _temperature_ - temperature from sensor
* _battery_ - battery level in percents
* _humidity_ - Mijia Temperature Humidity device only
* _light_, _moisture_, _conductivity_ - MiFlora device only

## Linux

On Linux bluetooth adapter could be used by root user only. 

To run node-red without root/sudo use instructions from [noble](https://github.com/noble/noble#running-on-linux)

