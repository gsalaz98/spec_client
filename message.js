const debug = require('debug')('Message')
const protobuf = require('protobufjs')
const root = protobuf.loadSync('laguna.proto')
const Lmi = root.lookupType('laguna.Lmi')
const Lmh = root.lookupType('laguna.Lmh')
const Lnj = root.lookupType('laguna.Lnj')
const Lnk = root.lookupType('laguna.Lnk')
const NIBBLE_SIZE = 4
const HI_NIBBLE_MASK = 0x0f

class Message {
  constructor (type, content) {
    this.type = type
    this.content = content
    this.totalLength = content.length
  }

  static fromBuffer (data) {
    const type = data.readUInt8(0) >> NIBBLE_SIZE
    data[0] = data[0] & HI_NIBBLE_MASK // Mask out type field
    const totalLength = data.readUInt32BE(0, 4)
    const content = data.slice(4)
    if (content.length < totalLength) {
      console.log('Something fishy in fromBuffer')
      return null
    }
    return new Message(type, content)
  }

  encrypted () {
    return (this.type === 1)
  }

  decode () {
    try {
      var decodedMessage
      switch (this.type) {
        case 0:
          decodedMessage = Lnk.decode(this.content)
          break
        case 1:
          break
        case 2:
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
    const header = Buffer.alloc(4)
    header.writeUInt32BE(this.totalLength, 0)
    header[0] = header[0] | this.type << 4
    return Buffer.concat([header, this.content])
  }

  static fromObject (obj, type) {
    type = type || 0
    var message
    var content
    switch (type) {
      case 0:
        message = Lnj.create(obj)
        content = Lnj.encode(message).finish()
        break
      case 1:
        break
      case 2:
        message = Lmh.create(obj)
        content = Lmh.encode(message).finish()
        break
    }
    debug(message)
    return new Message(type, content)
  }
}
Message.PLAIN = 0
Message.ENCRYPTED = 1
Message.SETUP = 2

module.exports = Message
