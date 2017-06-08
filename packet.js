const debug = require('debug')('Packet')
const startOfPacket = Buffer.from('ff5a', 'hex')

class Packet {
  constructor (length, control, seq, ack, session, checksum, payload) {
    this.length = length
    this.control = control
    this.seq = seq
    this.ack = ack
    this.session = session
    this.checksum = checksum
    this.payload = payload
  }
  static parse (buffer) {
    if (buffer.slice(0, 2).compare(startOfPacket) !== 0) {
      debug('Bad buffer, started', buffer.slice(0, 2))
      return null
    }
    const length = buffer.readUInt16BE(2)
    const control = buffer[4]
    const seq = buffer[5]
    const ack = buffer[6]
    const session = buffer[7]
    const checksum = buffer[8]
    const payload = buffer.slice(9)
    return new Packet(length, control, seq, ack, session, checksum, payload)
  }
}

module.exports = Packet
