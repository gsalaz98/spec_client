const debug = require('debug')('TLV')
const NIBBLE_SIZE = 4
const HI_NIBBLE_MASK = 0x0f

class TLV {
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
    return new TLV(type, content)
  }

  encrypted () {
    return (this.type === 1)
  }

  decode (protoClass) {
    const message = protoClass.decode(this.content)
    debug(message)
    return message
  }

  raw () {
    const header = Buffer.alloc(4)
    header.writeUInt32BE(this.totalLength, 0)
    header[0] = header[0] | this.type << 4
    return Buffer.concat([header, this.content])
  }

  static encodeObject (obj, protoClass, type) {
    type = type || TLV.PLAIN
    const message = protoClass.create(obj)
    debug(message)
    const content = protoClass.encode(message).finish()
    return new TLV(type, content)
  }
}
TLV.PLAIN = 0
TLV.ENCRYPTED = 1
TLV.SETUP = 2

module.exports = TLV
