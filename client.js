var debug = require('debug')('Client')
const crypto = require('crypto')
const protobuf = require('protobufjs')
const root = protobuf.loadSync('laguna.proto')
const low = require('lowdb')
const TLV = require('./tlv')
const Cryption = require('./cryption')
const db = low('db.json')
const ecdh = crypto.createECDH('prime256v1')
const Lmi = root.lookupType('laguna.Lmi')
const Lnk = root.lookupType('laguna.Lnk')
const Lmh = root.lookupType('laguna.Lmh')
const Lnj = root.lookupType('laguna.Lnj')

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
        var tlv = TLV.fromBuffer(this.incompleteMessage.slice(0, length + 4))
        if (tlv.encrypted()) {
          tlv = this.rxCryption.decrypt(tlv)
        }
        this.completeMessage(tlv)

        this.incompleteMessage = this.incompleteMessage.slice(length + 4)
      }
    }
  }

  completeMessage (tlv) {
    if (this.state === 'ENCRYPTIONSETUP') {
      this.encryptionSetup(tlv.decode(Lmi))
    } else {
      const message = tlv.decode(Lnk)
      this.postEncryptionSetup(message)
    }
  }

  postEncryptionSetup (message) {
    switch (message.a) {
      case 1:
        if (message.battery) { // device info
          this.setDeviceName()
          this.startHeartbeat()
        } else if (message.B2 === 1) {
          this.requestDeviceInfo()
        }
        break
      case 3: // errors
        debug(message.j)
        break
      case 4:
        if (message.w) { // tap confirmation
          this.sendLncLnq()
        } else if (message.z) {
          process.stdout.write(message.z.toString())
        }
        break
      default:
        debug('Unhandled "a" value')
        break
    }
  }

  setTime () {
    const timestamp = Math.floor(new Date().getTime() / 1000)
    const message = { a: { a: timestamp } }
    const b = TLV.encodeObject(message, Lnj)
    const e = this.txCryption.encrypt(b)
    this.sendMessage(e.raw())
  }

  startHeartbeat () {
    if (this.heartbeat) {
      return
    }
    let beat = 16
    this.heartbeat = setInterval(() => {
      const message = { d: { a: beat } }
      const b = TLV.encodeObject(message, Lnj)
      const e = this.txCryption.encrypt(b)
      this.sendMessage(e.raw())
      if (beat === 2) {
        beat = 16
      } else {
        beat = 2
      }
    }, 5000)
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
      default:
        console.log('Unhandled setup message', decodedMessage)
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
    console.log('Tap the button')
    debug('EncryptionSetup complete')
    this.state = 'AUTHENTICATED'

    var message = { m: true }
    const b = TLV.encodeObject(message, Lnj)
    const e = this.txCryption.encrypt(b)
    this.sendMessage(e.raw())
  }

  setUserId (userId) {
    this.state = 'SETUSERID'
    var message = {
      f: { a: userId }
    }

    const b = TLV.encodeObject(message, Lnj)
    const e = this.txCryption.encrypt(b)
    this.sendMessage(e.raw())
  }

  setDeviceName () {
    this.state = 'SETDEVICENAME'
    var message = {
      b: {
        a: 1,
        c: '😎 Eric B\'s Specs',
        d: Buffer.from('3042343931304345324443343445463339414543343039374333463736423132', 'hex') // 0B4910CE2DC44EF39AEC4097C3F76B12 ?
      },
      d: {
        a: 2
      }
    }

    const b = TLV.encodeObject(message, Lnj)
    const e = this.txCryption.encrypt(b)
    this.sendMessage(e.raw())
  }

  requestDeviceInfo () {
    var message = {
      e: [
        { a: 7 },
        { a: 6 },
        { a: 1 }
      ]
    }

    const b = TLV.encodeObject(message, Lnj)
    const e = this.txCryption.encrypt(b)
    this.sendMessage(e.raw())
  }

  sendLncLnq () {
    var lnc = {
      b: {
        a: 3
      }
    }
    const encodedLnc = TLV.encodeObject(lnc, Lnj)
    const encryptedLnc = this.txCryption.encrypt(encodedLnc)
    var lnq = {
      c: {
        a: 3
      }
    }
    const encodedLnq = TLV.encodeObject(lnq, Lnj)
    const encryptedLnq = this.txCryption.encrypt(encodedLnq)

    const b = Buffer.concat([encryptedLnc.raw(), encryptedLnq.raw()])
    this.sendMessage(b)
  }

  sendAppVerification (message) {
    const specUuid = message.slice(0, 8)
    const specNonce = message.slice(8, 24)
    var reply = Buffer.concat([this.app_uuid, specUuid, specNonce, this.app_nonce, this.sharedSecret])
    const mac = this.txCryption.sign(this.hmacSecret, reply)
    // Replace sharedSecret with hmac
    reply.write(mac.toString('hex'), 0x38, 0x20, 'hex')

    var appVer = {
      a: {
        b: 3,
        c: reply
      }
    }
    const b = TLV.encodeObject(appVer, Lmh, TLV.SETUP)

    this.sendMessage(b.raw())
  }

  sendPublicKey () {
    const publicKeyMessage = {
      a: {
        b: 1,
        c: this.public_key
      }
    }
    const b = TLV.encodeObject(publicKeyMessage, Lmh, TLV.SETUP)
    this.sendMessage(b.raw())
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

    const n = TLV.encodeObject(txNonce, Lmh, TLV.SETUP)
    const s = TLV.encodeObject(txSalt, Lmh, TLV.SETUP)
    const b = Buffer.concat([n.raw(), s.raw()])
    this.sendMessage(b)
  }
}

module.exports = Client
