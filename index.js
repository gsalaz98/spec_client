var noble = require('noble');
var debug = require('debug')('spec_client');
var LagunaClient = require('./laguna_client');
const lagunaClient = new LagunaClient();
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'

const modes = {
  pair: new Buffer('c203303430', 'hex')
}

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    debug(state, 'startScanning')
    noble.startScanning();
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', function(peripheral) {
  if (peripheral.advertisement.manufacturerData && peripheral.advertisement.manufacturerData.compare(modes['pair']) === 0) {
    debug('peripheral found', peripheral.advertisement)
    noble.stopScanning();

    peripheral.on('disconnect', function() {
      debug('disconnected, exiting');
      process.exit(0);
    });

    peripheral.connect(function(error) {
      debug('connected');
      peripheral.discoverServices([serviceUUID], function(error, services) {
        services.forEach(function(service) {
          debug('service', service.uuid);
          service.discoverCharacteristics([], handleCharacteristics);
        });
      });
    });
  }
});

function handleCharacteristics(error, characteristics) {
  characteristics.forEach(function(characteristic) {
    if (characteristic.properties.includes('write')) {
      lagunaClient.writeCharacteristic = characteristic;
      lagunaClient.sendPublicKey();
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', lagunaClient.readChunk.bind(lagunaClient));
      characteristic.subscribe();
    }
  });
}

