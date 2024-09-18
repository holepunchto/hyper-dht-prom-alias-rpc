const crypto = require('crypto')
const { EventEmitter } = require('events')
const RPC = require('protomux-rpc')
const safetyCatch = require('safety-catch')
const idEnc = require('hypercore-id-encoding')

const { AliasReqEnc, AliasRespEnc } = require('./lib/encodings')

const PROTOCOL_NAME = 'register-alias'

// TODO: Circuit breaker in registerAlias

class AliasRpcClient extends EventEmitter {
  constructor (serverPubKey, secret, dht, { requestTimeoutMs = 5000 } = {}) {
    super()

    this.dht = dht
    this.serverPubKey = idEnc.decode(serverPubKey)
    this.secret = idEnc.decode(secret)

    this.requestTimeoutMs = requestTimeoutMs
  }

  async registerAlias (alias, targetKey, hostname, service, { major, minor } = {}) {
    targetKey = idEnc.decode(targetKey)
    const uid = crypto.randomUUID()

    this.emit('alias-attempt', {
      alias,
      targetKey,
      hostname,
      service,
      uid
    })

    const socket = this.dht.connect(this.serverPubKey)
    socket.on('error', (error) => {
      safetyCatch(error)
      this.emit('connection-error', { error, alias, targetKey, uid })
    })

    // guaranteed to resolve (also when socket destroys without being opened)
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
        {
          requestEncoding: AliasReqEnc,
          responseEncoding: AliasRespEnc,
          timeout: this.requestTimeoutMs
        }
      )

      if (res.success !== true) {
        throw new Error(res.errorMessage)
      }

      return res.updated
    } finally {
      socket.end()
    }
  }
}

module.exports = AliasRpcClient
