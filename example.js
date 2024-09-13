const os = require('os')
const Hyperswarm = require('hyperswarm')
const hypCrypto = require('hypercore-crypto')
const HyperDHT = require('hyperdht')
const setupTestnet = require('hyperdht/testnet')

const AliasRpcClient = require('./client')
const AliasRpcServer = require('.') // dht-prom-alias-rpc')

async function setupServer (secret, bootstrap) {
  const putAliasCb = (alias, targetPubKey, hostname, service) => {
    // Called whenever a new alias request is received:
    // Use this function to setup the scraper targetting the alias's public key
    console.log(`Received register request for alias ${alias}->${targetPubKey.toString('hex')} for service ${service} at host ${hostname}`)
  }

  const swarm = new Hyperswarm({ bootstrap })

  const aliasRpcServer = new AliasRpcServer(swarm, secret, putAliasCb)
  await swarm.listen()

  console.log(`Alias RPC server listening at ${aliasRpcServer.publicKey.toString('hex')}`)

  return aliasRpcServer
}

async function main () {
  const secret = hypCrypto.randomBytes(32)
  const testnet = await setupTestnet()
  const bootstrap = testnet.bootstrap

  const rpcServer = await setupServer(secret, bootstrap)
  await rpcServer.swarm.flush() // Wait until fully announced (only needed for tests)

  const clientDht = new HyperDHT({ bootstrap })
  const rpcClient = new AliasRpcClient(rpcServer.publicKey, secret, clientDht)

  await rpcClient.registerAlias(
    'dummy-service-alias',
    'a'.repeat(64),
    os.hostname(),
    'dummy-service'
  )

  await clientDht.destroy()
  await rpcServer.swarm.destroy()
  await testnet.destroy()
}

main()
