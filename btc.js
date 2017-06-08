const debug = require('debug')('BTC')
const SerialPort = require('serialport')
const Packet = require('./packet')
const port = new SerialPort('/dev/tty.EricBsSpecs-WirelessiAP')

const init = Buffer.from('ff550200ee10', 'hex')
// var sendSeq = 0x42

port.on('data', (data) => {
  console.log('Data:', data)
  if (data.compare(init) === 0) {
    port.write(init, writeError)
  } else {
    const packet = Packet.parse(data)
    if (packet === null) {
      debug('bad packet')
    }
    // packet.ack()
  }
})

port.on('open', function () {
  console.log('port open')
})

// open errors will be emitted as an error event
port.on('error', function (err) {
  console.log('Error:', err.message)
})

function writeError (err) {
  if (err) {
    return console.log('Error on write:', err.message)
  }
  console.log('message written')
}
