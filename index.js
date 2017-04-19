var noble = require('noble');
var protobuf = require("protobufjs");
var debug = require('debug')('spec_client');
const crypto = require('crypto');
const serviceUUID = '3e400001b5a3f393e0a9e50e24dcca9e'
const MAX_CHARACTERISTIC_SIZE = 20
const headerHex = '200000';
const header = new Buffer(headerHex, 'hex');

const ecdh = crypto.createECDH('prime256v1');
const publicKey = ecdh.generateKeys();
var sharedSecret;
const app_uuid = new Buffer('cd5e310a0d2e47dba288327c778870ad', 'hex');
const app_nonce = new Buffer('34995efb2045c48149401d40b7cc2f5d', 'hex');

const responses = [
	new Buffer('200000470a450801124104ba9cb363577a8e21555f34e72feb37394f59e3216c46b10a5547d50bdbc89877177045474cccdf07f6e144aedbf8bc997da7ec8871a0b7144d877a0f8cdab128','hex'),
	new Buffer('2000005e0a5c08031258cd5e310a0d2e47dba288327c778870ad4b50c80087ef2b4e0e18cc948e36622b9d76bd568a6509b85b61730adea1a719e9b62a343e1094c3cadd92b76f8158357ab4abd8a75b29cb7dd541ced8a1a929629917dac0b13ebc', 'hex')
];

var writeCharacteristic = null;

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

function sendMessage(message) {
	var cursor = 0;
	var end, chunk;

	function sendChunk() {
		if (cursor < message.length) {
			end = Math.min(cursor + MAX_CHARACTERISTIC_SIZE, message.length);
			chunk = message.slice(cursor, end);
			cursor = end;
			writeCharacteristic.write(chunk, false, sendChunk);
		}
	}
	sendChunk();
}

function handleCharacteristics(error, characteristics) {
	characteristics.forEach(function(characteristic) {
		if (characteristic.properties.includes('write')) {
			writeCharacteristic = characteristic;
		} else if (characteristic.properties.includes('indicate')) {
			characteristic.on('data', readChunk);
			characteristic.subscribe();
		}
	});

	if (writeCharacteristic) {
		sendPublicKey();
	}
}

var incompleteData = Buffer.alloc(0);
var bytesRemaining = 0;
function readChunk(chunk, isNotification) {
	if (incompleteData && incompleteData.length > 3) {
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
		// This glosses over when the chunk has multiple messages < 20 bytes
		incompleteData = Buffer.concat([incompleteData, chunk]);
	}
}

function completeMessage(buffer) {
	decode(buffer).then(function(messageList) {
		messageList.forEach(function(decodedMessage) {
      if (decodedMessage.a && decodedMessage.a.a) {
        switch(decodedMessage.a.a) {
          case 1:
            const otherKey = decodedMessage.a.b;
            sharedSecret = ecdh.computeSecret(otherKey);
            debug('sharedSecret', sharedSecret);
            break;
          case 2:
            const spec_uuid = decodedMessage.a.b.slice(0, 8);
            const spec_nonce = decodedMessage.a.b.slice(8, 24)
            const secret = Buffer.from([0x20, 0x54, 0x50]);
            const hmac = crypto.createHmac('sha256', secret);
            const base = Buffer.concat([app_uuid, spec_uuid, spec_nonce, app_nonce, sharedSecret]);
            hmac.update(base);
            const mac = new Buffer(hmac.digest('hex'), 'hex');

            var stageThree = {
              a: {
                a: 3,
                b: Buffer.concat([base, mac])
              }
            };

            encode([stageThree]).then((buffers) => {
              var complete = buffers.reduce((acc, buffer) => {
                return Buffer.concat([acc, header, buffer]);
              }, Buffer.alloc(0));

              sendMessage(complete);
            });
            break;
          default:
            console.log('unhandled decode message');
        }
			}
		});
	});
}

function sendPublicKey() {
	var stageOne = {
		a: {
			a: 1,
			b: publicKey
		}
	};

	encode([stageOne]).then((buffers) => {
		const complete = buffers.reduce((acc, buffer) => {
			return Buffer.concat([acc, header, buffer]);
		}, Buffer.alloc(0));
		sendMessage(complete);
	});
}

function encode(payloads) {
	return protobuf.load("laguna.proto").then((root) => {
		var Envelope = root.lookupType("laguna.Envelope");
		return payloads.map((payload) => {
			var message = Envelope.create(payload);
			debug('encodedMessage', message);
			return Envelope.encodeDelimited(message).finish();
		});
	});
}

function decode(buffer) {
	return protobuf.load("laguna.proto").then(function(root) {
		var Envelope = root.lookupType("laguna.Envelope");
		var lastIndex = 0;
		var list = [];
		//debug('raw', buffer.toString('hex'));
		do {
			lastIndex += 3;//header
			var message = buffer.slice(lastIndex);
			var decodedMessage = Envelope.decodeDelimited(message);
			debug('decodedMessage', decodedMessage);
			list.push(decodedMessage);
			lastIndex = buffer.indexOf(headerHex, lastIndex, 'hex')
		} while (lastIndex != -1)

			return list;
	});
};
