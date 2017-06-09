const debug = require('debug')('BTC')
const SerialPort = require('serialport')
const Packet = require('./packet')
const port = new SerialPort('/dev/tty.EricBsSpecs-WirelessiAP')

const init = Buffer.from('ff550200ee10', 'hex')
var psnStart = 42
var linkConfig

port.on('data', (data) => {
  debug('Data:', data)
  // Handle init as special case
  if (data.equals(init)) {
    debug('Init')
    port.write(init, writeComplete)
    return
  }

  const packet = Packet.parse(data)
  if (packet === null) {
    debug('bad packet')
    return
  }
  debug('Packet:', packet)
  if (packet.isSYN()) {
    linkConfig = packet.getLinkParams()
    debug('linkConfig', linkConfig)
    const reply = packet.LSPReply(psnStart++)
    port.write(reply.serialize(), writeComplete)
  } else if (packet.isACK()) {
    // You don't ack and ack, but we track the first ack to determine state
    if (packet.pan === psnStart - 1) {
      debug('Link established')
    }
  }
})

port.on('open', function () {
  debug('port open')
})

// open errors will be emitted as an error event
port.on('error', function (err) {
  debug('Error:', err.message)
})

function writeComplete (err) {
  if (err) {
    debug('Error on write:', err.message)
  }
}

process.on('SIGINT', () => {
  console.log('Caught interrupt signal')
  if (port) {
    port.close((err) => {
      if (err) {
        debug(err)
      }
      process.exit()
    })
  }
})
