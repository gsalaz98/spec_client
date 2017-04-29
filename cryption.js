const crypto = require('crypto')
const debug = require('debug')('Cryption')
const blockSize = 0x10
const algorithm = 'aes128'

class Cryption {
  constructor (sharedSecret, nonce, salt) {
    this.sharedSecret = sharedSecret.slice(0, blockSize)
    this.nonce = nonce
    this.salt = salt
    this.hmacKey = this.sign(this.sharedSecret, this.salt)
    this.key = this._encrypt(this.sharedSecret, this.nonce)
    this.counter = 0
    // debug('Cryption', {sharedSecret, nonce, salt});
  }

  encrypt (lagunaMessage) {
    if (lagunaMessage.type === 0x10) {
      debug('Encrypt called on encrypted type')
      return lagunaMessage
    }
    const result = this.xor(lagunaMessage.content)
    const mac = this.sign(this.hmacKey, result).slice(0, blockSize)

    // debug('encrypt', result);

    lagunaMessage.content = Buffer.concat([result, mac])
    lagunaMessage.type = 0x10
    lagunaMessage.totalLength = lagunaMessage.content.length
    return lagunaMessage
  }

  decrypt (lagunaMessage) {
    if (lagunaMessage.type !== 0x10) {
      debug('Decrypt called on non-encrypted type')
      return lagunaMessage
    }

    const content = lagunaMessage.content.slice(0, -blockSize)
    const mac = lagunaMessage.content.slice(-blockSize)
    const calculateMac = this.sign(this.hmacKey, content).slice(0, blockSize)

    if (mac.toString('hex') === calculateMac.toString('hex')) {
      debug('Valid mac')
    } else {
      debug('Invalid mac: ', mac, '!=', calculateMac)
      return lagunaMessage
    }
    const result = this.xor(content)

    // debug('decrypt', result);

    lagunaMessage.content = result
    lagunaMessage.type = 0x00
    lagunaMessage.totalLength = lagunaMessage.content.length
    return lagunaMessage
  }

  xor (data) {
    const result = Buffer.alloc(data.length)

    for (var i = 0; i < data.length; i++) {
      result[i] = data[i] ^ this.key[i]
      this.counter++
      if (this.counter > 15) {
        this.bumpKey()
      }
    }

    // debug('xor', result);
    return result
  }

  bumpKey () {
    for (var i = 0; i < blockSize; i++) {
      this.nonce[i]++
    }
    this.key = this._encrypt(this.sharedSecret, this.nonce)
    this.counter = 0
  }

  sign (key, data) {
    const hmac = crypto.createHmac('sha256', key)
    hmac.update(data)
    return hmac.digest()
  }

  _encrypt (key, data) {
    const iv = Buffer.alloc(blockSize)
    const decipher = crypto.createCipheriv(algorithm, key, iv)
    return Buffer.concat([decipher.update(data), decipher.final()])
  }
}

module.exports = Cryption
