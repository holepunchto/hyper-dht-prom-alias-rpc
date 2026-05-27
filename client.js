const crypto = require('crypto')
const { EventEmitter } = require('events')
const idEnc = require('hypercore-id-encoding')
const b4a = require('b4a')

const { AliasReqEnc, AliasRespEnc } = require('./lib/encodings')

const PROTOCOL_NAME = 'register-alias'

class AliasRpcClient extends EventEmitter {
  constructor(serverPubKey, secret, rpcClient) {
    super()

    this.rpcClient = rpcClient
    this.serverPubKey = idEnc.decode(serverPubKey)
    this.secret = idEnc.decode(secret)
  }

  async registerAlias(alias, targetKey, hostname, service, { major, minor, timeout } = {}) {
    targetKey = idEnc.decode(targetKey)
    const uid = crypto.randomUUID()

    this.emit('alias-attempt', {
      alias,
      targetKey,
      hostname,
      service,
      uid
    })

    const res = await this.rpcClient.makeRequest(
      this.serverPubKey,
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
        timeout,
        protocol: PROTOCOL_NAME,
        id: b4a.allocUnsafe(0)
      }
    )

    if (res.success !== true) {
      throw new Error(res.errorMessage)
    }

    return res.updated
  }
}

module.exports = AliasRpcClient
