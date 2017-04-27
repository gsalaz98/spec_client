var protobuf = require("protobufjs");
var debug = require('debug')('LagunaClient');
const crypto = require('crypto');
const LagunaMessage = require('./laguna_message');

const ecdh = crypto.createECDH('prime256v1');

const MAX_CHARACTERISTIC_SIZE = 20
const headerHex = '200000';
const header = new Buffer(headerHex, 'hex');

class LagunaClient {
  constructor() {
    this.hmacSecret = Buffer.from([0x20, 0x54, 0x50]);
    this.publicKey = ecdh.generateKeys();

    this.app_uuid = new Buffer('cd5e310a0d2e47dba288327c778870ad', 'hex');
    this.app_nonce = crypto.randomBytes(16);

    this.rxNonce = crypto.randomBytes(16);
    this.rxSalt = crypto.randomBytes(32);

    this.incompleteMessage = Buffer.alloc(0)
    this.bytesRemaining = 0;
  }

  sendMessage(message) {
    var cursor = 0;
    var end, chunk;

    const sendChunk = () => {
      if (cursor < message.length) {
        end = Math.min(cursor + MAX_CHARACTERISTIC_SIZE, message.length);
        chunk = message.slice(cursor, end);
        cursor = end;
        this.writeCharacteristic.write(chunk, false, sendChunk);
      }
    }
    sendChunk();
  }

  readChunk(chunk) {
    debug('chunk', chunk.toString('hex'));
    this.incompleteMessage = Buffer.concat([this.incompleteMessage, chunk]);

    if (this.incompleteMessage.length > 2) {
      const length = this.incompleteMessage[3];
      if (this.incompleteMessage.length >= length + 4) {

        var m = new LagunaMessage(this.incompleteMessage.slice(0, length + 4));
        if (m.encrypted()) {
          m = m.decrypt(this.sharedSecret, this.rxSalt, this.rxNonce);
        }
        this.completeMessage(m.decode());

        this.incompleteMessage = this.incompleteMessage.slice(length + 4);
      }
    }
  }

  completeMessage(decodedMessage) {
		if (decodedMessage.a && decodedMessage.a.a) {
			switch(decodedMessage.a.a) {
				case 1:
					this.sharedSecret = ecdh.computeSecret(decodedMessage.a.b);
					break;
				case 2:
					this.sendAppVerification(decodedMessage.a.b);
					break;
				case 3:
					this.checkEyewearVerification(decodedMessage.a.b);
					break;
				case 8:
					this.txNonce = decodedMessage.a.b;
					break;
				case 9:
					this.txSalt = decodedMessage.a.b;
					this.sendTens();
					break;
			}
		}
  }

  sendTens() {
    var tens = {
      c: [
        { a: 7 },
        { a: 6 },
        { a: 1 }
      ]
    };

    this.encodeAndSend([tens]);
  }

  sendAppVerification(message) {
    const spec_uuid = message.slice(0, 8);
    const spec_nonce = message.slice(8, 24)
    const hmac = crypto.createHmac('sha256', this.hmacSecret);
    var reply = Buffer.concat([this.app_uuid, spec_uuid, spec_nonce, this.app_nonce, this.sharedSecret]);

    hmac.update(reply);
    const mac = hmac.digest('hex');
    // Replace sharedSecret with hmac
    reply.write(mac, 0x38, 0x20, 'hex');

    var stageThree = {
      a: {
        a: 3,
        b: reply
      }
    };

    this.encodeAndSend([stageThree]);
  }

  checkEyewearVerification(message) {
    const spec_uuid = message.slice(0, 8);
    const app_nonce = message.slice(8, 24)
    const sig = message.slice(24);
    const hmac = crypto.createHmac('sha256', this.hmacSecret);
    hmac.update(Buffer.concat([spec_uuid, app_nonce, this.sharedSecret]));
    const digest = hmac.digest('hex');
    if (sig.toString('hex') === digest) {
      this.sendRxSaltAndNonce();
    } else {
      debug('hmacs not equal', sig.toString('hex'), hmac.digest('hex'));
    }
  }

  sendPublicKey() {
    const publicKeyMessage = {
      a: {
        a: 1,
        b: this.publicKey
      }
    };
    this.encodeAndSend([publicKeyMessage]);
  }

  sendRxSaltAndNonce() {
    const rxNonce = {
      a: {
        a: 8,
        b: this.rxNonce
      }
    };

    const rxSalt = {
      a: {
        a: 9,
        b: this.rxSalt
      }
    };

    this.encodeAndSend([rxNonce, rxSalt]);
  }

  encodeAndSend(objs) {
    var all = objs.reduce((acc, obj) => {
      const newMessage = LagunaMessage.fromObject(obj);
      return Buffer.concat([acc, newMessage.raw()]);
    }, Buffer.alloc(0));

    this.sendMessage(all);
  }
}

module.exports = LagunaClient;
