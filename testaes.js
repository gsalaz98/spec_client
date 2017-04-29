const crypto = require('crypto')

const message = Buffer.from('1000001c1bea4ccfcf9272caae4a667468f83085c503d4b32fa8645bc5e874f6', 'hex')
const content = message.slice(4)
const algorithm = 'aes128'
const iv = Buffer.alloc(16)

const rxNonce = Buffer.from('9dc6db83c6dcb4c4edcdd12f66ad1f14', 'hex')
const rxSalt = Buffer.from('2b76e5640c29523deef1ae3a2e73435a7360cee43b2d088a1b660c70205892d0', 'hex')
const sharedSecret = Buffer.from('8e32ddfd78bcbf961f6366dd00812a0a05db6c8ad7d4221a6b918f0ebf6eb77e', 'hex')

DecryptAndVerifyMessage(content)

function DecryptAndVerifyMessage (message) {
  const mac = content.slice(-0x10)
  const encrypted = content.slice(0, -0x10)

  const hmacKey = sign(sharedSecret.slice(0, 0x10), rxSalt)
  const calculateMac = sign(hmacKey, encrypted).slice(0, 0x10)

  if (mac.toString('hex') === calculateMac.toString('hex')) {
    console.log('Valid mac')
  } else {
    console.log(mac, '!=', calculateMac)
  }

  const key = encrypt(sharedSecret, rxNonce)
  const result = Buffer.alloc(encrypted.length)

  for (var i = 0; i < encrypted.length; i++) {
    result[i] = encrypted[i] ^ key[i]
  }

  console.log('decrypted', result.toString('hex'))
}

function sign (key, message) {
  const hmac = crypto.createHmac('sha256', key)
  hmac.update(message)
  return hmac.digest()
}

function encrypt (key, encrypted) {
  const decipher = crypto.createCipheriv(algorithm, key.slice(0, 0x10), iv)
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return dec
}
