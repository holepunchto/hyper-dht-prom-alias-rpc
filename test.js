const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const HyperDht = require('hyperdht')
const hypCrypto = require('hypercore-crypto')

const AliasRpcServer = require('./index')
const AliasRpcClient = require('./client')

test('put alias happy flow', async t => {
  t.plan(4)

  const putAliasCb = async (alias, targetPublicKey) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')

    return true
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.ready()
  await server.swarm.flush()
  await client.ready()

  const key = hypCrypto.randomBytes(32)

  server.on('register-success', ({ updated, alias, targetPublicKey }) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')
  })

  await client.registerAlias('dummy', key)
})

test('put alias error in cb', async t => {
  t.plan(2)

  const putAliasCb = async (alias, targetPublicKey) => {
    throw new Error('put alias error')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.ready()
  await server.swarm.flush()
  await client.ready()

  const key = hypCrypto.randomBytes(32)

  server.on('register-error', ({ error }) => {
    t.is(error.message, 'put alias error', 'correct error')
  })

  await t.exception(
    async () => await client.registerAlias('dummy', key),
    /Failed to register alias/,
    'correct error'
  )
})

test('put alias invalid input', async t => {
  const putAliasCb = async (alias, targetPublicKey) => {
    t.fail('should not get here')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.ready()
  await server.swarm.flush()
  await client.ready()

  server.on('register-error', () => {
    t.fail('should not get here')
  })

  await t.exception(
    async () => await client.registerAlias('dummy', 'no key'),
    /Invalid Hypercore key/,
    'invalid key'
  )
})

async function setup (t, putAliasCb) {
  const testnet = await createTestnet()
  const bootstrap = testnet.bootstrap

  const dht = new HyperDht({ bootstrap })
  const swarm = new Hyperswarm({ dht })

  const sharedSecret = hypCrypto.randomBytes(32)

  const server = new AliasRpcServer(
    swarm, sharedSecret, putAliasCb
  )

  const client = new AliasRpcClient(
    server.publicKey,
    sharedSecret,
    { bootstrap }
  )

  t.teardown(async () => {
    await server.close()
    await client.close()
    await testnet.destroy()
  })

  return { client, server }
}
