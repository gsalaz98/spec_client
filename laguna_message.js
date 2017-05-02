const debug = require('debug')('LagunaMessage')
const protobuf = require('protobufjs')
const root = protobuf.loadSync('laguna.proto')
const Lmi = root.lookupType('laguna.Lmi')
const Lmh = root.lookupType('laguna.Lmh')
const Lnj = root.lookupType('laguna.Lnj')
const Lnk = root.lookupType('laguna.Lnk')

class LagunaMessage {
  constructor (data) {
    // 0 = Plain, 0x10 = encrypted, 0x20 = encryption setup
    this.type = data[0]
    this.totalLength = data[3]
    this.content = data.slice(4)
    // debug('LagunaMessage', data)
  }

  encrypted () {
    return (this.type === 0x10)
  }

  decode () {
    try {
      var decodedMessage
      switch (this.type) {
        case 0x00:
          decodedMessage = Lnk.decode(this.content)
          break
        case 0x10:
          break
        case 0x20:
          decodedMessage = Lmi.decode(this.content)
          break
      }
      // debug('decoded', this.content)
      debug(decodedMessage)
      return decodedMessage
    } catch (e) {
      debug('Decode error', this.content.toString('hex'))
      debug(e)
    }
  }

  raw () {
    const header = Buffer.from([this.type, 0x00, 0x00, this.totalLength])
    return Buffer.concat([header, this.content])
  }

  static fromObject (obj, type) {
    type = type || 0x00
    var message
    var content
    switch (type) {
      case 0x00:
        message = Lnj.create(obj)
        content = Lnj.encode(message).finish()
        break
      case 0x10:
        break
      case 0x20:
        message = Lmh.create(obj)
        content = Lmh.encode(message).finish()
        break
    }
    // debug('fromObject', message)
    const header = Buffer.from([type, 0x00, 0x00, content.length])
    return new LagunaMessage(Buffer.concat([header, content]))
  }
}

module.exports = LagunaMessage
