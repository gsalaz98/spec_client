const debug = require('debug')('Packet')
const startOfPacket = Buffer.from('ff5a', 'hex')
const headerLength = 9 // 24.1 fixed size

class Packet {
  constructor (control, psn, pan, session, payload) {
    this.length = (payload && payload.length > 0) ? payload.length + 10 : headerLength
    this.control = control
    this.psn = psn
    this.pan = pan
    this.session = session
    this.payload = payload
  }

  static parse (buffer) {
    if (!startOfPacket.equals(buffer.slice(0, 2))) {
      debug('Bad buffer, started', buffer.slice(0, 2))
      return null
    }
    if (buffer.length < headerLength) {
      debug('Bad buffer, length', buffer.length)
      return null
    }
    // const length = buffer.readUInt16BE(2)
    const control = buffer[4]
    const seq = buffer[5]
    const ack = buffer[6]
    const session = buffer[7]
    const payload = buffer.slice(9, -1)
    return new Packet(control, seq, ack, session, payload)
  }

  // is Link Synchronization Payload
  isSYN () {
    return (this.control & 0x80)
  }

  isACK () {
    return (this.control & 0x40)
  }

  LSPReply (psn) {
    return new Packet(this.control | 0x40, psn, this.psn, this.session, this.payload)
  }

  Ack () {
    return new Packet(0x40, this.pan + 1, this.psn, this.session)
  }

  getLinkParams () {
    const fixedLength = 10
    const sessionConfigSize = 3 // identifier, type, version
    const { payload } = this
    var config = {
      version: payload[0],
      maxOutstandingPackets: payload[1],
      maxPacketLength: payload.readUInt16BE(2),
      retransmissionTimeout: payload.readUInt16BE(4),
      CumulativeAckTimeout: payload.readUInt16BE(6),
      maxRetransmission: payload[8],
      maxCumulativeAck: payload[9],
      sessionCount: (payload.length - fixedLength) / sessionConfigSize
    }
    var sessions = []
    for (var i = 10; i < payload.length - 1; i += 3) {
      const sessionData = payload.slice(i, i + 3)
      sessions.push({
        identifier: sessionData[0],
        type: sessionData[1], // 0 = control, 1 = file transfer, 2 = external accessory
        version: sessionData[2]
      })
    }
    config['sessions'] = sessions
    return config
  }

  serialize () {
    let buffer = Buffer.alloc(this.length)
    startOfPacket.copy(buffer, 0, 0, 2)
    buffer.writeUInt16BE(this.length, 2)
    buffer[4] = this.control
    buffer[5] = this.psn
    buffer[6] = this.pan
    buffer[7] = this.session
    buffer[8] = Packet.checksum(buffer.slice(0, 8))
    if(this.payload) {
      this.payload.copy(buffer, 9)
      buffer[headerLength + this.payload.length] = Packet.checksum(this.payload)
    }
    return buffer
  }

  static checksum (buffer) {
    return new Int8Array(buffer).reduce((acc, val) => {
      return (acc + val) % 0xFF
    }, 0) * -1
  }
}

module.exports = Packet
