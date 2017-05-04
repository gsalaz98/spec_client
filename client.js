var debug = require('debug')('Client')
const crypto = require('crypto')
const protobuf = require('protobufjs')
const root = protobuf.loadSync('laguna.proto')
const low = require('lowdb')
const TLV = require('./tlv')
const Cryption = require('./cryption')
const db = low('db.json')
const ecdh = crypto.createECDH('prime256v1')

db.defaults({
  // app_uuid: Buffer.from('cd5e310a0d2e47dba288327c778870ad', 'hex')
  app_uuid: crypto.randomBytes(16)
}).write()

class Client {
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
      this.state = 'SETDEVICENAME'
    } else {
      this.app_nonce = crypto.randomBytes(16)
      this.txNonce = crypto.randomBytes(16)
      this.txSalt = crypto.randomBytes(32)
      this.state = 'ENCRYPTIONSETUP'
    }

    this.incompleteMessage = Buffer.alloc(0)
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
        // debug('send chunk', chunk.toString('hex'))
        this.writeCharacteristic.write(chunk, false, sendChunk)
      }
    }
    sendChunk()
  }

  readChunk (chunk) {
    // debug('read chunk', chunk.toString('hex'))
    this.incompleteMessage = Buffer.concat([this.incompleteMessage, chunk])

    if (this.incompleteMessage.length >= 4) {
      const lengthBytes = Buffer.from(this.incompleteMessage.slice(0, 4)) // Copy buffer so we can mask type nibble
      lengthBytes[0] = lengthBytes[0] & 0x0f
      const length = lengthBytes.readUInt32BE(0, 4)
      if (this.incompleteMessage.length >= length + 4) {
        var m = TLV.fromBuffer(this.incompleteMessage.slice(0, length + 4))
        if (m.encrypted()) {
          m = this.rxCryption.decrypt(m)
        }
        this.completeMessage(m.decode())

        this.incompleteMessage = this.incompleteMessage.slice(length + 4)
      }
    }
  }

  completeMessage (decodedMessage) {
    switch (this.state) {
      case 'ENCRYPTIONSETUP':
        this.encryptionSetup(decodedMessage)
        break
      case 'SETDEVICENAME':
        // this.setUserId('bettse')
        break
      case 'SETUSERID':
        break
    }

    if (decodedMessage.status === 4) {
      process.stdout.write(decodedMessage.z)
    }
  }

  encryptionSetup (decodedMessage) {
    const { b, c } = decodedMessage.a
    switch (b) {
      case 1:
        this.sharedSecret = ecdh.computeSecret(c)
        this.txCryption = new Cryption(this.sharedSecret, this.txNonce, this.txSalt)
        break
      case 2:
        this.sendAppVerification(c)
        break
      case 3:
        this.checkEyewearVerification(c)
        break
      case 8:
        this.rxNonce = c
        break
      case 9:
        this.rxSalt = c
        this.rxCryption = new Cryption(this.sharedSecret, this.rxNonce, this.rxSalt)
        this.encryptionSetupComplete()
        break
    }
  }

  saveEncryption () {
    db.set('app_nonce', this.app_nonce).write()
    db.set('txSalt', this.txSalt).write()
    db.set('rxSalt', this.rxSalt).write()
    db.set('txNonce', this.rxNonce).write()
    db.set('rxNonce', this.rxNonce).write()
    db.set('sharedSecret', this.sharedSecret).write()
  }

  encryptionSetupComplete () {
    debug('EncryptionSetup complete')
    // this.setDeviceName('SPECS')
  }

  setUserId (userId) {
    this.state = 'SETUSERID'
    var message = {
      f: { a: [ userId ] }
    }
  }

  setDeviceName (newName) {
    this.state = 'SETDEVICENAME'
    var message = {
      g: { a: [ '💩' + newName ] }
    }
  }

  requestDeviceInfo () {
    var message = {
      e: [
        { a: 7 },
        { a: 6 },
        { a: 1 }
      ]
    }
  }

  sendAppVerification (message) {
    const specUuid = message.slice(0, 8)
    const specNonce = message.slice(8, 24)
    var reply = Buffer.concat([this.app_uuid, specUuid, specNonce, this.app_nonce, this.sharedSecret])
    const mac = this.txCryption.sign(this.hmacSecret, reply)
    // Replace sharedSecret with hmac
    reply.write(mac.toString('hex'), 0x38, 0x20, 'hex')

    var stageThree = {
      a: {
        b: 3,
        c: reply
      }
    }

    this.encodeAndSendSetup([stageThree])
  }

  sendPublicKey () {
    const publicKeyMessage = {
      a: {
        b: 1,
        c: this.public_key
      }
    }
    this.encodeAndSendSetup([publicKeyMessage])
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
      a: {
        b: 8,
        c: this.txNonce
      }
    }

    const txSalt = {
      a: {
        b: 9,
        c: this.txSalt
      }
    }

    this.encodeAndSendSetup([txNonce, txSalt])
  }

  encodeAndSendSetup (objs) {
    const Lmh = root.lookupType('laguna.Lmh')

    var all = objs.reduce((acc, obj) => {
      const o = Lmh.create(obj)
      const content = Lmh.encode(o).finish()
      const message = new TLV(TLV.SETUP, content)
      return Buffer.concat([acc, message.raw()])
    }, Buffer.alloc(0))

    this.sendMessage(all)
  }
}

module.exports = Client
