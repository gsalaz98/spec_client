const crypto = require('crypto');

const message = new Buffer('1000001c1bea4ccfcf9272caae4a667468f83085c503d4b32fa8645bc5e874f6', 'hex');
const length = message[4];
const content = message.slice(4);
const mac = content.slice(-0x10);
const encrypted = content.slice(0, -0x10);
const algorithm = 'aes-128-gcm';
const iv = Buffer.alloc(12);

/*
console.log('message', message);
console.log('encrypted', encrypted);
console.log('mac', mac.toString('hex'));
*/

const txNonce = new Buffer('15c6f29266a3daddea00448ef7414f48', 'hex');
const txSalt = new Buffer('ab8d7d7ca9195fba62d31a11fae3170fa9e97211acc1280909a90757206071e1', 'hex');
const rxNonce = new Buffer('9dc6db83c6dcb4c4edcdd12f66ad1f14', 'hex');
const rxSalt = new Buffer('2b76e5640c29523deef1ae3a2e73435a7360cee43b2d088a1b660c70205892d0', 'hex');
const sharedSecret = new Buffer('8e32ddfd78bcbf961f6366dd00812a0a05db6c8ad7d4221a6b918f0ebf6eb77e', 'hex');
const appNonce = new Buffer('e1a76ad95933e17c0e1894284d16a87a', 'hex');
const specNonce = new Buffer('0e18cc948e36622b9d76bd568a6509b8', 'hex');

DecryptAndVerifyMessage(content);


function DecryptAndVerifyMessage(message) {
  const mac = content.slice(-0x10);
  const encrypted = content.slice(0, -0x10);

  const hmacKey = sign(sharedSecret.slice(0, 0x10), rxSalt);
  const calculateMac = sign(hmacKey, encrypted).slice(0, 0x10);

  if (mac.toString('hex') === calculateMac.toString('hex')) {
    console.log("Valid mac");
  } else {
    console.log(mac, '!=', calculateMac);
  }

  const decipher = crypto.createCipheriv(algorithm, rxNonce, iv);
  var dec = Buffer.concat([decipher.update(encrypted) , decipher.final()]);
  console.log("decrypted", dec.toString('hex'));

}

function sign(key, message) {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(message);
  return hmac.digest();
}
