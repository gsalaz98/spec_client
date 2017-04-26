const crypto = require('crypto');

const decodedMessage = new Buffer('cd5e310a0d2e47dba288327c778870ad4b50c80087ef2b4e0e18cc948e36622b9d76bd568a6509b87070a12ad49b23dc96fb42a0fdf54c76', 'hex');
const sharedSecret = new Buffer('2ae02bb79a2c354cbaa71bd2c1e0f9919897478793ccdf54b543bcfb6a4c124c', 'hex');
const mac = new Buffer('e29d50cf72ccc2111b00ae47ab2ce8a7139ab13d6c4bad3952a3bbf81d8c6c8d', 'hex');

console.log('target', mac.toString('hex'));


for (var i = 0; i < 0xFFFFFF; i++) {
  var counter = Buffer.alloc(4);
  counter.writeInt32BE(i);
  const secret = counter.slice(1);

  const hmac = crypto.createHmac('sha256', secret);
  const plain = Buffer.concat([decodedMessage, sharedSecret]);
  hmac.update(plain);
  var final = new Buffer(hmac.digest('hex'), 'hex');
  const match = mac.equals(final) ? '*' : '';
  if (match) {
    console.log(match, plain.toString('hex'), secret.toString('hex'), '=>', final.toString('hex'));
    process.exit(0);
  } else {
    console.log(i, secret);
  }

}

