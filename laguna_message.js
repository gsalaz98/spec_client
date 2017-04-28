const crypto = require('crypto');
const debug = require('debug')('LagunaMessage');

const protobuf = require("protobufjs");
const root = protobuf.loadSync('laguna.proto');
const Envelope = root.lookupType("laguna.Envelope");
const algorithm = 'aes128';

class LagunaMessage {
  constructor(data) {
    // 0 = Plain, 0x10 = encrypted, 0x20 = encryption setup
    this.type = data[0];
    this.totalLength = data[3];
    this.content = data.slice(4);
    debug('LagunaMessage', data);
  }

  encrypted() {
    return (this.type === 0x10);
  }

  decode() {
    try {
      var decodedMessage = Envelope.decode(this.content);
      debug('decodedMessage', decodedMessage);
      return decodedMessage;
    } catch (e) {
      debug('Exception during decode', e);
    }
  }

  raw() {
    const header = Buffer.from([this.type, 0x00, 0x00, this.totalLength])
    return Buffer.concat([header, this.content])
  }

  static fromObject(obj) {
    const message = Envelope.create(obj);
    const content = Envelope.encode(message).finish();
    debug('fromObject', message, content);
    const header = Buffer.from([0x20, 0x00, 0x00, content.length]);
    return new LagunaMessage(Buffer.concat([header, content]));
  }
}

module.exports = LagunaMessage;
