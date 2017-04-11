var noble = require('noble');
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'
const maxValueSize = 20;

const responses = [
  new Buffer('200000470a450801124104ba9cb363577a8e21555f34e72feb37394f59e3216c46b10a5547d50bdbc89877177045474cccdf07f6e144aedbf8bc997da7ec8871a0b7144d877a0f8cdab128','hex'),
  new Buffer('0a5c08031258cd5e310a0d2e47dba288327c778870ad4b50c80087ef2b4e0e18cc948e36622b9d76bd568a6509b868c5b37a192a49f23dbf53d010a469b8aa7e87a385a0a7f34516adfc712e911d7a72bcf76030022338005e42868e302a', 'hex')
];

var step = 0;

var writeCharacteristic = null;

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
      writeCharacteristic = characteristic;
      sendMessage();
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', newData);
      console.log('subscribed!');
      characteristic.subscribe();
    }
  });
}

function sendMessage() {
  const message = responses[step];
  var cursor = 0;

  var changeInterval = setInterval(function() {
    var end = Math.min(cursor + maxValueSize, message.length)
    var data = message.slice(cursor, end)
    cursor = end

    console.log('sending', data);
    writeCharacteristic.write(data);

    if (cursor >= message.length) {
      step++;
      clearInterval(changeInterval);
      return false;
    }
  }, 1000);
}

function newData(data, isNotification) {
  console.log('new data', data);
}
