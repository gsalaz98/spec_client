const debug = require('debug')('Classic')
const SerialPort = require('serialport')
const Packet = require('./packet')

const init = Buffer.from('ff550200ee10', 'hex')

class Classic {
  constructor () {
    debug('Classic constructor')
    this.incoming = this.incoming.bind(this)
    this.write = this.write.bind(this)
    this.writeComplete = this.writeComplete.bind(this)

    this.linkOperationRecord = {
      sentAckTimer: 0,
      nextSentPSN: 10,
      oldestSentUnAckPSN: 10,
      initialSentPSN: 10,
      lastReceivedInSeqPSN: 0,
      initialReceivedPSN: 0,
      receviedOutOfSeqPSNs: []
    }

    this.port = new SerialPort('/dev/tty.EricBsSpecs-WirelessiAP')

    this.port.on('data', this.incoming)

    this.port.on('open', () => {
      debug('Port open')
    })

    // open errors will be emitted as an error event
    this.port.on('error', (err) => {
      debug('Error:', err.message)
    })
  }

  write (packet) {
    // debug('Write', packet)
    const data = packet.serialize()
    debug('Write', data)
    this.port.write(data, this.writeComplete)
  }

  writeComplete (err) {
    if (err) {
      debug('Error on write:', err.message)
    }
  }

  incoming (data) {
    debug('Data:', data)
    // Handle init as special case
    if (data.equals(init)) {
      debug('Init')
      this.port.write(init, this.writeComplete)
      return
    }

    const packet = Packet.parse(data)
    if (packet === null) {
      debug('bad packet')
      return
    }
    // debug('Packet:', packet)
    if (packet.isSYN()) {
      this.linkConfig = packet.getLinkParams()
      this.linkOperationRecord.initialReceivedPSN = packet.psn
      const reply = packet.LSPReply(this.linkOperationRecord.nextSentPSN)
      this.write(reply)
    } else if (packet.isACK()) {
      this.linkOperationRecord.nextSentPSN = (packet.pan + 1) % 0xff

      // You don't ack an ack, but we track the first ack to determine state
      if (packet.pan === this.linkOperationRecord.initialSentPSN) {
        debug('Link established')
        // this.sendRac(packet)
      } else {
        debug('ACK', packet.pan)
      }
    }
  }

  sendRac (packet) {
    var attempts = 100
    const resend = setInterval(() => {
      if (attempts < 1) {
        clearInterval(resend)
        return
      }
      const RequestAuthenticationCertificate = Buffer.from('40400006aa00', 'hex')
      const rac = new Packet(0x40, this.linkOperationRecord.nextSentPSN, packet.psn, 1, RequestAuthenticationCertificate)
      this.write(rac)
      attempts = attempts - 1
    }, 1000)
  }
}

module.exports = Classic
