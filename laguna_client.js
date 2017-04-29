var debug = require('debug')('LagunaClient')
const crypto = require('crypto')
const low = require('lowdb')
const LagunaMessage = require('./laguna_message')
const Cryption = require('./cryption')
const db = low('db.json')
const ecdh = crypto.createECDH('prime256v1')

db.defaults({
  app_uuid: Buffer.from('cd5e310a0d2e47dba288327c778870ad', 'hex')
}).write()

class LagunaClient {
  constructor () {
    this.hmacSecret = Buffer.from([0x20, 0x54, 0x50])
    this.public_key = ecdh.generateKeys()

    this.app_uuid = Buffer.from(db.get('app_uuid').value())
    if (db.has('sharedSecret').value()) {
      this.sharedSecret = Buffer.from(db.get('sharedSecret').value())
      this.app_nonce = Buffer.from(db.get('app_nonce').value())
      this.rxNonce = Buffer.from(db.get('rxNonce').value())
      this.txNonce = Buffer.from(db.get('txNonce').value())
      this.rxSalt = Buffer.from(db.get('rxSalt').value())
      this.txSalt = Buffer.from(db.get('txSalt').value())

      this.rxCryption = new Cryption(this.sharedSecret, this.rxNonce, this.rxSalt)
      this.txCryption = new Cryption(this.sharedSecret, this.txNonce, this.txSalt)
    } else {
      this.app_nonce = crypto.randomBytes(16)
      this.txNonce = crypto.randomBytes(16)
      this.txSalt = crypto.randomBytes(32)
    }

    this.incompleteMessage = Buffer.alloc(0)
    this.bytesRemaining = 0
  }

  sendMessage (message) {
    const MAX_CHARACTERISTIC_SIZE = 20
    var cursor = 0
    var end, chunk

    const sendChunk = () => {
      if (cursor < message.length) {
        end = Math.min(cursor + MAX_CHARACTERISTIC_SIZE, message.length)
        chunk = message.slice(cursor, end)
        cursor = end
        debug('send chunk', chunk.toString('hex'))
        this.writeCharacteristic.write(chunk, false, sendChunk)
      }
    }
    sendChunk()
  }

  readChunk (chunk) {
    debug('read chunk', chunk.toString('hex'))
    this.incompleteMessage = Buffer.concat([this.incompleteMessage, chunk])

    if (this.incompleteMessage.length > 2) {
      const length = this.incompleteMessage[3]
      if (this.incompleteMessage.length >= length + 4) {
        var m = new LagunaMessage(this.incompleteMessage.slice(0, length + 4))
        if (m.encrypted()) {
          m = this.rxCryption.decrypt(m)
        }
        this.completeMessage(m.decode())

        this.incompleteMessage = this.incompleteMessage.slice(length + 4)
      }
    }
  }

  completeMessage (decodedMessage) {
    if (!decodedMessage) {
      return
    }
    if (decodedMessage.encryptionSetup && decodedMessage.encryptionSetup.stage) {
      const { stage, content } = decodedMessage.encryptionSetup
      switch (stage) {
        case 1:
          this.sharedSecret = ecdh.computeSecret(content)
          db.set('sharedSecret', this.sharedSecret).write()
          this.txCryption = new Cryption(this.sharedSecret, this.txNonce, this.txSalt)
          break
        case 2:
          this.sendAppVerification(content)
          break
        case 3:
          this.checkEyewearVerification(content)
          break
        case 8:
          this.rxNonce = content
          db.set('rxNonce', this.rxNonce).write()
          break
        case 9:
          this.rxSalt = content
          db.set('rxSalt', this.rxSalt).write()
          this.rxCryption = new Cryption(this.sharedSecret, this.rxNonce, this.rxSalt)
          // this.saveEncryption();
          this.sendTens()
          break
      }
    }
  }

  saveEncryption () {
    db.set('sharedSecret', this.sharedSecret)
    db.set('app_nonce', this.app_nonce)
    db.set('txSalt', this.txSalt)
    db.set('rxSalt', this.rxSalt)
    db.set('txNonce', this.rxNonce)
    db.set('rxNonce', this.rxNonce)
    db.write()
  }

  sendTens () {
    var tens = {
      c: [
        { a: 7 },
        { a: 6 },
        { a: 1 }
      ]
    }

    this.encodeAndSend([tens], true)
  }

  sendAppVerification (message) {
    const specUuid = message.slice(0, 8)
    const specNonce = message.slice(8, 24)
    var reply = Buffer.concat([this.app_uuid, specUuid, specNonce, this.app_nonce, this.sharedSecret])
    const mac = this.txCryption.sign(this.hmacSecret, reply)
    // Replace sharedSecret with hmac
    reply.write(mac.toString('hex'), 0x38, 0x20, 'hex')

    var stageThree = {
      encryptionSetup: {
        stage: 3,
        content: reply
      }
    }

    this.encodeAndSend([stageThree])
  }

  sendPublicKey () {
    const publicKeyMessage = {
      encryptionSetup: {
        stage: 1,
        content: this.public_key
      }
    }
    this.encodeAndSend([publicKeyMessage])
  }

  checkEyewearVerification (message) {
    const specUuid = message.slice(0, 8)
    const appNonce = message.slice(8, 24)
    const sig = message.slice(24)
    const mac = this.txCryption.sign(this.hmacSecret, Buffer.concat([specUuid, appNonce, this.sharedSecret]))
    if (sig.toString('hex') === mac.toString('hex')) {
      this.sendTxSaltAndNonce()
    } else {
      debug('hmacs not equal', sig.toString('hex'), mac.toString('hex'))
    }
  }

  sendTxSaltAndNonce () {
    const txNonce = {
      encryptionSetup: {
        stage: 8,
        content: this.txNonce
      }
    }

    const txSalt = {
      encryptionSetup: {
        stage: 9,
        content: this.txSalt
      }
    }

    this.encodeAndSend([txNonce, txSalt])
  }

  encodeAndSend (objs, encrypt) {
    var all = objs.reduce((acc, obj) => {
      let newMessage = LagunaMessage.fromObject(obj)
      if (encrypt) {
        newMessage = this.txCryption.encrypt(newMessage)
      }
      return Buffer.concat([acc, newMessage.raw()])
    }, Buffer.alloc(0))

    this.sendMessage(all)
  }
}

module.exports = LagunaClient
