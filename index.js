var noble = require('noble')
var debug = require('debug')('spec_client')
const low = require('lowdb')
var Client = require('./client')
const db = low('db.json')
const client = new Client()
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
    console.log('Hold button for 7 seconds')
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
      client.writeCharacteristic = characteristic
      switch (mode) {
        case 'pair':
          client.sendPublicKey()
          break
        case 'idle':
          client.requestDeviceInfo()
          break
      }
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', client.readChunk.bind(client))
      characteristic.subscribe()
    }
  })
}
