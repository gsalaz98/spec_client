var protobuf = require("protobufjs");
var debug = require('debug')('LagunaClient');
const crypto = require('crypto');

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

    this.incompleteData = Buffer.alloc(0);
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

  readChunk(chunk, isNotification) {
    if (this.incompleteData && this.incompleteData.length > 3) {
      var totalLength = this.incompleteData[3] + 4;
      var bytesRemain = totalLength - this.incompleteData.length;

      if (bytesRemain > 0) {
        var sliceSize = Math.min(chunk.length, bytesRemain)
        var car = chunk.slice(0, sliceSize)
        var cdr = chunk.slice(sliceSize, chunk.length)
        this.incompleteData = Buffer.concat([this.incompleteData, car]);
        bytesRemain = totalLength - this.incompleteData.length;
        chunk = cdr;
      }

      if (bytesRemain === 0) {
        this.completeMessage(this.incompleteData);
        this.incompleteData = chunk;
      }
    } else {
      // This glosses over when the chunk has multiple messages < 20 bytes
      this.incompleteData = Buffer.concat([this.incompleteData, chunk]);
    }
  }

  completeMessage(buffer) {
    this.decode(buffer).then((messageList) => {
      messageList.forEach((decodedMessage) => {
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
              break;
          }
        }
      });
    });
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

  encodeAndSend(messages) {
    this.encode(messages).then((buffers) => {
      const complete = buffers.reduce((acc, buffer) => {
        return Buffer.concat([acc, header, buffer]);
      }, Buffer.alloc(0));
      this.sendMessage(complete);
    });
  }

  encode(payloads) {
    return protobuf.load("laguna.proto").then((root) => {
      var Envelope = root.lookupType("laguna.Envelope");
      return payloads.map((payload) => {
        var message = Envelope.create(payload);
        debug('encodedMessage', message);
        return Envelope.encodeDelimited(message).finish();
      });
    });
  }

  decode(buffer) {
    return protobuf.load("laguna.proto").then((root) => {
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
  }

}


module.exports = LagunaClient;
