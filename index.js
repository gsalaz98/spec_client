var noble = require('noble');
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'
const MAX_CHARACTERISTIC_SIZE = 20

const responses = [
  new Buffer('200000470a450801124104ba9cb363577a8e21555f34e72feb37394f59e3216c46b10a5547d50bdbc89877177045474cccdf07f6e144aedbf8bc997da7ec8871a0b7144d877a0f8cdab128','hex'),
  new Buffer('2000005E0a5c08031258cd5e310a0d2e47dba288327c778870ad4b50c80087ef2b4e0e18cc948e36622b9d76bd568a6509b868c5b37a192a49f23dbf53d010a469b8aa7e87a385a0a7f34516adfc712e911d7a72bcf76030022338005e42868e302a', 'hex')
];

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
    if (characteristic.properties.includes('write')) {
      console.log('characteristic', characteristic.uuid, 'saved');
      writeCharacteristic = characteristic;
      sendMessage(responses[0]);
    } else if (characteristic.properties.includes('indicate')) {
      characteristic.on('data', readChunk);
      console.log('characteristic', characteristic.uuid, 'subscribed');
      characteristic.subscribe();
    }
  });
}

function sendMessage(message) {
  console.log('sendMessage', message.toString('hex'));
  var cursor = 0;
  var end, chunk;

  function sendChunk() {
    if (cursor < message.length) {
      end = Math.min(cursor + MAX_CHARACTERISTIC_SIZE, message.length);
      chunk = message.slice(cursor, end);
      cursor = end;
      console.log('sendChunk', chunk.toString('hex'));
      writeCharacteristic.write(chunk, false, sendChunk);
    }
  }

  sendChunk();
}

var incompleteData = null;
var bytesRemaining = 0;
function readChunk(chunk) {
  console.log('readChunk', chunk.toString('hex'));

  if (incompleteData) {
    var totalLength = incompleteData[3] + 4;
    var bytesRemain = totalLength - incompleteData.length;

    if (bytesRemain > 0) {
      var sliceSize = Math.min(chunk.length, bytesRemain)
      var car = chunk.slice(0, sliceSize)
      var cdr = chunk.slice(sliceSize, chunk.length)
      incompleteData = Buffer.concat([incompleteData, car]);
      bytesRemain = totalLength - incompleteData.length;
      chunk = cdr;
    }

    if (bytesRemain === 0) {
	    completeMessage(incompleteData);
      incompleteData = chunk;
    }
  } else {
    incompleteData = chunk;
  }

  console.log('incompleteData', incompleteData.toString('hex'));
}

function completeMessage(buffer) {
  console.log('completeMessage', buffer.toString('hex'));
  sendMessage(responses[1]);
}
