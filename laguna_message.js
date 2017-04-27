const crypto = require('crypto');
const debug = require('debug')('laguna_message');

const protobuf = require("protobufjs");
const root = protobuf.loadSync('laguna.proto');
const Envelope = root.lookupType("laguna.Envelope");
const algorithm = 'aes128';
const blockSize = 0x10;
const iv = Buffer.alloc(blockSize);

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

  decrypt(sharedSecret, rxSalt, rxNonce) {
    const mac = this.content.slice(-blockSize);
    const encrypted = this.content.slice(0, -blockSize);

    const hmacKey = this.sign(sharedSecret.slice(0, blockSize), rxSalt);
    const calculateMac = this.sign(hmacKey, encrypted).slice(0, blockSize);

    if (mac.toString('hex') === calculateMac.toString('hex')) {
      debug("Valid mac");
    } else {
      debug('invalid mac: ', mac, '!=', calculateMac);
    }

    //XXX: only works for the first 16 bytes
    const key = this._crypt(sharedSecret, rxNonce);
    const result = Buffer.alloc(encrypted.length);
    for (var i = 0; i < encrypted.length; i++) {
      result[i] = encrypted[i] ^ key[i];
    }

    this.content = result;
    this.type = 0;
    this.totalLength = this.content.length;
    debug('decrypted', this.content.toString('hex'));
    return this;
  }

  encrypt(sharedSecret, txSalt, txNonce) {
    const hmacKey = this.sign(sharedSecret.slice(0, blockSize), txSalt);
    const key = this._crypt(sharedSecret, txNonce);

    //XXX: only works for the first 16 bytes
    const result = Buffer.alloc(this.content.length);
    for (var i = 0; i < this.content.length; i++) {
      result[i] = this.content[i] ^ key[i];
    }

    const mac = this.sign(hmacKey, result).slice(0, blockSize);

    this.content = Buffer.concat([result, mac]);
    this.type = 0x10;
    this.totalLength = this.content.length;
    debug('encrypted', this.content.toString('hex'));
    return this;
  }

  _crypt(key, encrypted) {
    const decipher = crypto.createCipheriv(algorithm, key.slice(0, blockSize), iv);
    return Buffer.concat([decipher.update(encrypted) , decipher.final()]);
  }

  decode() {
    var decodedMessage = Envelope.decode(this.content);
    debug('decodedMessage', decodedMessage);
    return decodedMessage;
  }

  raw() {
    const header = Buffer.from([this.type, 0x00, 0x00, this.totalLength])
    return Buffer.concat([header, this.content])
  }

  static fromObject(obj) {
    const message = Envelope.create(obj);
    debug('fromObject', message);
    const content = Envelope.encode(message).finish();
    const header = Buffer.from([0x20, 0x00, 0x00, content.length]);
    return new LagunaMessage(Buffer.concat([header, content]));
  }

  sign(key, message) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(message);
    return hmac.digest();
  }
}

module.exports = LagunaMessage;
