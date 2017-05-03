var noble = require('noble')
var debug = require('debug')('spec_client')
const low = require('lowdb')
var LagunaClient = require('./laguna_client')
const db = low('db.json')
const lagunaClient = new LagunaClient()
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'

const modes = {
  idle: Buffer.from('c2034b50c80087', 'hex'),
  pair: Buffer.from('c203303430', 'hex')
}
const mode = db.has('sharedSecret').value() ? 'idle' : 'pair'

noble.on('stateChange', function (state) {
  if (state === 'poweredOn') {
    debug(state, 'scanner for', mode, 'mode')
    noble.startScanning()
  } else {
    noble.stopScanning()
  }
})

noble.on('discover', function (peripheral) {
  if (peripheral.advertisement.manufacturerData && peripheral.advertisement.manufacturerData.compare(modes[mode]) === 0) {
    debug('Found', peripheral.advertisement.localName)
    noble.stopScanning()

    peripheral.on('disconnect', function () {
      debug('disconnected, exiting')
      process.exit(0)
    })

    peripheral.connect(function (error) {
      if (error) {
        debug(error)
      }
      // debug('connected');
      peripheral.discoverServices([serviceUUID], function (error, services) {
        if (error) {
          debug(error)
        }

        services.forEach(function (service) {
          // debug('service', service.uuid);
          service.discoverCharacteristics([], handleCharacteristics)
        })
      })
    })
  }
})

function handleCharacteristics (error, characteristics) {
  if (error) {
    debug(error)
  }

  characteristics.forEach(function (characteristic) {
    if (characteristic.properties.includes('write')) {
      lagunaClient.writeCharacteristic = characteristic
      switch (mode) {
        case 'pair':
          lagunaClient.sendPublicKey()
          break
        case 'idle':
          lagunaClient.requestDeviceInfo()
          break
      }
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', lagunaClient.readChunk.bind(lagunaClient))
      characteristic.subscribe()
    }
  })
}
