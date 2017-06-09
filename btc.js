const debug = require('debug')('BTC')
const SerialPort = require('serialport')
const Packet = require('./packet')
const port = new SerialPort('/dev/tty.EricBsSpecs-WirelessiAP')

const init = Buffer.from('ff550200ee10', 'hex')
// var sendSeq = 0x42
var linkConfig

port.on('data', (data) => {
  debug('Data:', data)
  // Handle init as special case
  if (data.equals(init)) {
    debug('Init')
    port.write(init, writeError)
    return
  }

  const packet = Packet.parse(data)
  if (packet === null) {
    debug('bad packet')
    return
  }
  debug('Packet:', packet)
  debug('serialized', packet.serialize())
  if (packet.isLSP()) {
    linkConfig = packet.getLinkParams()
    debug('linkConfig', linkConfig)
  } else {
  }
})

port.on('open', function () {
  debug('port open')
})

// open errors will be emitted as an error event
port.on('error', function (err) {
  debug('Error:', err.message)
})

function writeError (err) {
  if (err) {
    return debug('Error on write:', err.message)
  }
  debug('message written')
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
