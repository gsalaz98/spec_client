const debug = require('debug')('Packet')
const startOfPacket = Buffer.from('ff5a', 'hex')

class Packet {
  constructor (length, control, psn, pan, session, checksum, payload) {
    this.length = length
    this.control = control
    this.psn = psn
    this.pan = pan
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

  // is Link Synchronization Payload
  isLSP () {
    return (this.control & 0x80)
  }

  getLinkParams () {
    const fixedLength = 11 // first 10 bytes + checksum
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
        type: sessionData[1],
        version: sessionData[2]
      })
    }
    config['sessions'] = sessions
    return config
  }
}

module.exports = Packet
