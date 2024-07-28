const crypto = require('crypto')
const ReadyResource = require('ready-resource')
const RPC = require('protomux-rpc')
const HyperDHT = require('hyperdht')
const safetyCatch = require('safety-catch')
const idEnc = require('hypercore-id-encoding')

const { AliasReqEnc, AliasRespEnc } = require('./lib/encodings')

const PROTOCOL_NAME = 'register-alias'

class AliasRpcClient extends ReadyResource {
  constructor (serverPubKey, secret, { bootstrap }) {
    super()

    // TODO: investigate why we can't use our own DHT
    // (Doig so means the lookup connection is never opened)
    this.dht = new HyperDHT({ bootstrap })

    this.serverPubKey = idEnc.decode(serverPubKey)
    this.secret = idEnc.decode(secret)
  }

  _open () { }

  async _close () {
    await this.dht.destroy()
  }

  async registerAlias (alias, targetKey, hostname, service, { major, minor } = {}) {
    targetKey = idEnc.decode(targetKey)
    const uid = crypto.randomUUID()

    this.emit('register-alias-attempt', {
      alias,
      targetKey,
      hostname,
      service,
      uid
    })

    const socket = this.dht.connect(this.serverPubKey)
    socket.on('error', (error) => {
      safetyCatch(error)
      this.emit('socket-error', { error, alias, targetKey, uid })
    })

    // TODO: I think this needs a timeout (no guarantee opened gets emitted, except if the socket gets destroyed)
    await socket.opened

    if (!socket.connected) {
      throw new Error('Could not open socket')
    }

    const rpc = new RPC(socket, { protocol: PROTOCOL_NAME })
    try {
      await rpc.fullyOpened()

      const res = await rpc.request(
        'alias',
        {
          alias,
          targetPublicKey: targetKey,
          secret: this.secret,
          hostname,
          service,
          major,
          minor
        },
        { requestEncoding: AliasReqEnc, responseEncoding: AliasRespEnc }
      )

      if (res.success !== true) {
        throw new Error(res.errorMessage)
      }

      return res.updated
    } finally {
      rpc.destroy()
    }
  }
}

module.exports = AliasRpcClient
