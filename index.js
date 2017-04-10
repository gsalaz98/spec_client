var noble = require('noble');

const test_buffers = [
  new Buffer('200000470a450801124104ba9cb363577a8e2155','hex'),
  new Buffer('5f34e72feb37394f59e3216c46b10a5547d50bdb','hex'),
  new Buffer('c89877177045474cccdf07f6e144aedbf8bc997d','hex'),
  new Buffer('a7ec8871a0b7144d877a0f8cdab128','hex')
];
var i = 0;
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'
const modes = {
  pair: new Buffer('c203303430', 'hex')
}

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    console.log(state, 'startScanning')
    noble.startScanning();
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', function(peripheral) {

  if (peripheral.advertisement.manufacturerData && peripheral.advertisement.manufacturerData.compare(modes['pair']) === 0) {
    console.log('peripheral found', peripheral.advertisement)
    noble.stopScanning();

    peripheral.on('disconnect', function() {
      process.exit(0);
    });

    peripheral.connect(function(error) {
      console.log('connected');
      peripheral.discoverServices([serviceUUID], function(error, services) {
        services.forEach(function(service) {
          console.log('service', service.uuid);
          service.discoverCharacteristics([], handleCharacteristics);
        });
      });
    });
  }
});

function handleCharacteristics(error, characteristics) {
  characteristics.forEach(function(characteristic) {
    console.log('characteristic', characteristic.uuid);
    if (characteristic.properties.includes('write')) {
      sendTestdata(characteristic)
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', newData);
      console.log('subscribed!');
      characteristic.subscribe();
    }
  });
}

function sendTestdata(writeCharacteristic) {
  var changeInterval = setInterval(function() {
    if (i >= test_buffers.length) {
      clearInterval(changeInterval);
      return false;
    }

    console.log('sending', test_buffers[i]);
    writeCharacteristic.write(test_buffers[i++]);
  }, 1000);
}

function newData(data, isNotification) {
  console.log('new data', isNotification, data);
}
