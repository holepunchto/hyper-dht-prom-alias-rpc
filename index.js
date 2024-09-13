const crypto = require('crypto')
const { EventEmitter } = require('events')

const idEnc = require('hypercore-id-encoding')
const RPC = require('protomux-rpc')
const b4a = require('b4a')
const { AliasReqEnc, AliasRespEnc } = require('./lib/encodings')

const PROTOCOL_NAME = 'register-alias'

// TODO:
// - Rate-limit, particularly unauthorized requests
// - Fast-failure when overloaded

class AliasRpcServer extends EventEmitter {
  constructor (swarm, secret, putAliasCb) {
    super()

    this.swarm = swarm
    this._putAlias = putAliasCb
    this.secret = secret

    this.swarm.on('connection', this._onconnection.bind(this))
  }

  get publicKey () {
    return this.swarm.keyPair.publicKey
  }

  _onconnection (socket) {
    const uid = crypto.randomUUID()
    const remotePublicKey = socket.remotePublicKey
    const remoteAddress = `${socket.rawStream.remoteHost}:${socket.rawStream.remotePort}`

    this.emit('connection-open', { uid, remotePublicKey, remoteAddress })

    socket.on('error', (error) => {
      this.emit('connection-error', { error, uid, remotePublicKey })
    })

    socket.on('close', () => {
      this.emit('connection-close', { uid, remotePublicKey })
    })

    const rpc = new RPC(socket, { protocol: PROTOCOL_NAME })
    rpc.respond(
      'alias',
      { responseEncoding: AliasRespEnc, requestEncoding: AliasReqEnc },
      async (req) => {
        const targetPublicKey = req.targetPublicKey
        const alias = req.alias
        const hostname = req.hostname
        const service = req.service

        if (!b4a.equals(req.secret, this.secret)) {
          this.emit('alias-unauthorised', { uid, remotePublicKey, targetPublicKey, alias, remoteAddress })
          return { success: false, errorMessage: 'Unauthorised' }
        }

        this.emit('alias-request', { uid, remotePublicKey, targetPublicKey, alias, hostname, service })
        try {
          const updated = await this._putAlias(alias, targetPublicKey, hostname, service)
          this.emit('alias-success', { uid, alias, remotePublicKey, targetPublicKey, updated })
          return {
            success: true,
            updated
          }
        } catch (error) {
          this.emit('alias-error', { uid, remotePublicKey, error })
          return {
            success: false,
            errorMessage: `Failed to register alias (uid ${uid})`
          }
        }
      }
    )
  }

  registerLogger (logger) {
    this.on(
      'alias-request',
      ({ uid, remotePublicKey, targetPublicKey, alias }) => {
        logger.info(`Alias request from ${idEnc.normalize(remotePublicKey)} to set ${alias}->${idEnc.normalize(targetPublicKey)} (uid ${uid})`)
      }
    )
    this.on(
      'alias-success', ({ uid, alias, targetPublicKey, updated }) => {
        logger.info(`Alias success for ${alias}->${idEnc.normalize(targetPublicKey)}--updated: ${updated} (uid: ${uid})`)
      }
    )
    this.on(
      'alias-unauthorised', ({ uid, remotePublicKey, targetPublicKey, alias, remoteAddress }) => {
        logger.info(`Unauthorised alias request from ${idEnc.normalize(remotePublicKey)} (${remoteAddress}) to set alias ${alias}->${idEnc.normalize(targetPublicKey)} (uid: ${uid})`)
      }
    )
    this.on(
      'alias-error', ({ uid, error }) => {
        logger.info(`Alias error: ${error} (${uid})`)
      }
    )

    this.on(
      'connection-open',
      ({ uid, remotePublicKey, remoteAddress }) => {
        logger.info(`Alias server opened connection to ${idEnc.normalize(remotePublicKey)} at ${remoteAddress} (uid ${uid})`)
      }
    )
    this.on(
      'connection-close',
      ({ uid, remotePublicKey }) => {
        logger.info(`Alias server closed connection to ${idEnc.normalize(remotePublicKey)} (uid ${uid})`)
      }
    )
    this.on(
      'connection-error',
      ({ uid, error, remotePublicKey }) => {
        logger.info(`Alias server socket error: ${error.stack} on connection to ${idEnc.normalize(remotePublicKey)} (uid ${uid})`)
      }
    )
  }
}

module.exports = AliasRpcServer
