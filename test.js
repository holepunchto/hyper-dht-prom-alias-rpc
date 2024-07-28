const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const HyperDht = require('hyperdht')
const hypCrypto = require('hypercore-crypto')

const AliasRpcServer = require('./index')
const AliasRpcClient = require('./client')

test('put alias happy flow', async t => {
  t.plan(10)

  const putAliasCb = async (alias, targetPublicKey, hostname, service) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')
    t.is(hostname, 'my-host', 'correct hostname')
    t.is(service, 'my-service', 'correct service')

    return true
  }

  const key = hypCrypto.randomBytes(32)

  const { client, server } = await setup(t, putAliasCb)
  server.on('register-error', ({ error }) => {
    console.error(error)
    t.fail('server error')
  })
  await server.ready()
  await server.swarm.flush()

  // Mostly just checking the event
  client.on(
    'register-alias-attempt',
    ({
      alias,
      targetKey,
      hostname,
      service
    }) => {
      t.is(alias, 'dummy', 'correct alias')
      t.alike(key, targetKey, 'correct key')
      t.is(hostname, 'my-host', 'correct host')
      t.is(service, 'my-service', 'correct service')
    }
  )
  await client.ready()

  server.on('register-success', ({ alias, targetPublicKey }) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')
  })

  await client.registerAlias('dummy', key, 'my-host', 'my-service')
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
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service'),
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
    async () => await client.registerAlias('dummy', 'no key', 'my-host', 'my-service'),
    /Invalid Hypercore key/,
    'invalid key'
  )
})

test('put alias with different major', async t => {
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

  const key = hypCrypto.randomBytes(32)

  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service', { major: 1000 }),
    /other major version/,
    'invalid key'
  )
})

test('put alias with higher minor', async t => {
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

  const key = hypCrypto.randomBytes(32)

  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service', { minor: 1000 }),
    /higher minor version/,
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
