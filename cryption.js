const crypto = require('crypto')
const debug = require('debug')('Cryption')
const blockSize = 0x10
const algorithm = 'aes128' // It would be aes-128-ctr if the incrementation was big endian

class Cryption {
  constructor (sharedSecret, nonce, salt) {
    this.sharedSecret = sharedSecret.slice(0, blockSize)
    this.nonce = nonce
    this.salt = salt
    this.hmacKey = this.sign(this.sharedSecret, this.salt)
    this.resetKey()
    // debug('Cryption', {sharedSecret, nonce, salt});
  }

  resetKey () {
    this.rollingNonce = this.nonce
    this.key = this._encrypt(this.sharedSecret, this.rollingNonce)
    this.counter = 0
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
      // debug('Valid mac')
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
      result[i] = data[i] ^ this.key[this.counter]

      if (this.counter === 15) {
        this.incrementKey()
        this.counter = 0
      } else {
        this.counter++
      }
    }

    return result
  }

  incrementKey () {
    for (var i = 0; i < this.rollingNonce.length; i++) {
      if (this.rollingNonce[i]++ !== 0xFF) {
        break
      }
    }
    this.key = this._encrypt(this.sharedSecret, this.rollingNonce)
  }

  sign (key, data) {
    const hmac = crypto.createHmac('sha256', key)
    hmac.update(data)
    return hmac.digest()
  }

  _encrypt (key, data) {
    const iv = Buffer.alloc(blockSize)
    const cipher = crypto.createCipheriv(algorithm, key, iv)
    cipher.setAutoPadding(false)
    const up = cipher.update(data)
    const final = cipher.final()
    return Buffer.concat([up, final])
  }
}

module.exports = Cryption
