const process = require('process')
const { spawn } = require('child_process')
const path = require('path')

const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const HyperDht = require('hyperdht')
const hypCrypto = require('hypercore-crypto')
const NewlineDecoder = require('newline-decoder')

const AliasRpcServer = require('./index')
const AliasRpcClient = require('./client')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')

const EXAMPLE_PATH = path.join(__dirname, 'example.js')

test('put alias happy flow', async (t) => {
  t.plan(13)

  const putAliasCb = (alias, targetPublicKey, hostname, service) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')
    t.is(hostname, 'my-host', 'correct hostname')
    t.is(service, 'my-service', 'correct service')

    return true
  }

  const key = hypCrypto.randomBytes(32)

  const { client, server } = await setup(t, putAliasCb)

  const infoLogs = []
  server.registerLogger({
    info: (d) => infoLogs.push(d)
  })

  server.on('alias-error', ({ error }) => {
    console.error(error)
    t.fail('server error')
  })
  await server.swarm.listen()
  await server.swarm.flush()

  // Mostly just checking the event
  client.on('alias-attempt', ({ alias, targetKey, hostname, service }) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(key, targetKey, 'correct key')
    t.is(hostname, 'my-host', 'correct host')
    t.is(service, 'my-service', 'correct service')
  })

  server.on('alias-success', ({ alias, targetPublicKey }) => {
    t.is(alias, 'dummy', 'correct alias')
    t.alike(targetPublicKey, key, 'correct key')
  })

  await client.registerAlias('dummy', key, 'my-host', 'my-service')

  t.ok(infoLogs[0].includes('Alias server opened connection to'), 'log connection=open')
  t.ok(infoLogs[1].includes('Alias request from'), 'log alias-request')
  t.ok(infoLogs[2].includes('Alias success for dummy->'), 'alias-success log')
})

test('put alias error in cb', async (t) => {
  t.plan(3)

  const putAliasCb = (alias, targetPublicKey) => {
    throw new Error('put alias error')
  }

  const { client, server } = await setup(t, putAliasCb)
  const infoLogs = []
  server.registerLogger({
    info: (d) => infoLogs.push(d)
  })

  await server.swarm.listen()
  await server.swarm.flush()

  const key = hypCrypto.randomBytes(32)

  server.on('alias-error', ({ error }) => {
    t.is(error.message, 'put alias error', 'correct error')
  })

  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service'),
    /Failed to register alias/,
    'correct error'
  )

  t.ok(infoLogs[2].includes('Alias error:'), 'alias-error log')
})

test('put alias invalid input', async (t) => {
  const putAliasCb = (alias, targetPublicKey) => {
    t.fail('should not get here')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.swarm.listen()
  await server.swarm.flush()

  server.on('alias-error', () => {
    t.fail('should not get here')
  })

  await t.exception(
    async () => await client.registerAlias('dummy', 'no key', 'my-host', 'my-service'),
    /Invalid Hypercore key/,
    'invalid key'
  )
})

test('put alias incorrect secret', async (t) => {
  t.plan(3)

  const putAliasCb = (alias, targetPublicKey) => {
    t.fail('should not get here')
  }

  const { client, server } = await setup(t, putAliasCb)
  const infoLogs = []
  server.registerLogger({
    info: (d) => infoLogs.push(d)
  })

  server.on('alias-unauthorised', () => {
    t.pass('received unauthorised event')
  })
  await server.swarm.listen()
  await server.swarm.flush()

  // Overwrite actual secret (bit of a hack)
  client.secret = hypCrypto.randomBytes(32)

  server.on('alias-error', () => {
    t.fail('should not get here')
  })

  const key = hypCrypto.randomBytes(32)

  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service'),
    /Unauthorised/,
    'invalid key'
  )

  t.ok(infoLogs[1].includes('Unauthorised alias request from '), 'alias-unauthorised log')
})

test('put alias with different major', async (t) => {
  const putAliasCb = (alias, targetPublicKey) => {
    t.fail('should not get here')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.swarm.listen()
  await server.swarm.flush()

  server.on('alias-error', () => {
    t.fail('should not get here')
  })

  const key = hypCrypto.randomBytes(32)

  try {
    await client.registerAlias('dummy', key, 'my-host', 'my-service', { major: 1000 })
    t.fail()
  } catch (e) {
    t.is(e.code, 'DECODE_ERROR')
    t.is(
      e.cause.message,
      'Cannot decode RegisterRequest of other major version 1000 (own major: 1)'
    )
  }
})

test('put alias fails if remote not available', async (t) => {
  const putAliasCb = () => {
    t.fail('should not happen')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.swarm.destroy()

  const key = hypCrypto.randomBytes(32)
  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service', { timeout: 10 }),
    /REQUEST_TIMEOUT/
  )
})

test('put alias fails after timeout', async (t) => {
  const putAliasCb = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.swarm.listen()
  await server.swarm.flush()

  const key = hypCrypto.randomBytes(32)
  await t.exception(
    async () => await client.registerAlias('dummy', key, 'my-host', 'my-service', { timeout: 10 }),
    /TIMEOUT_EXCEEDED/
  )
})

test('put alias with higher minor', async (t) => {
  const putAliasCb = (alias, targetPublicKey) => {
    t.fail('should not get here')
  }

  const { client, server } = await setup(t, putAliasCb)
  await server.swarm.listen()
  await server.swarm.flush()

  server.on('alias-error', () => {
    t.fail('should not get here')
  })

  const key = hypCrypto.randomBytes(32)

  try {
    await client.registerAlias('dummy', key, 'my-host', 'my-service', { minor: 1000 })
    t.fail('no error')
  } catch (e) {
    t.is(e.code, 'DECODE_ERROR')
    t.is(
      e.cause.message,
      'Cannot decode RegisterRequest of higher minor version 1000 (own minor: 1)'
    )
  }
})

test('Example works (sanity check)', (t) => {
  t.plan(4)

  const exProc = spawn(process.execPath, [EXAMPLE_PATH])

  // To avoid zombie processes in case there's an error
  process.on('exit', () => {
    // TODO: unset this handler on clean run
    exProc.kill('SIGKILL')
  })

  exProc.stderr.on('data', (d) => {
    console.error(d.toString())
    t.fail('There should be no stderr')
  })

  const lines = []
  const stdoutDec = new NewlineDecoder('utf-8')
  exProc.stdout.on('data', (d) => {
    for (const line of stdoutDec.push(d)) {
      lines.push(line)
    }
  })

  exProc.on('close', (code) => {
    t.is(code, 0, 'example process exited cleanly')
    t.is(lines[0].includes('Alias RPC server listening at'), true, 'listening')
    t.is(lines[1].includes('Received register request'), true, 'request received')
    t.is(lines.length, 2, 'no extra lines')
  })
})

async function setup(t, putAliasCb, clientOpts = {}) {
  const testnet = await createTestnet()
  const bootstrap = testnet.bootstrap

  const dht = new HyperDht({ bootstrap })
  const swarm = new Hyperswarm({ dht })

  const sharedSecret = hypCrypto.randomBytes(32)

  const server = new AliasRpcServer(swarm, sharedSecret, putAliasCb)

  const clientDht = new HyperDHT({ bootstrap })
  const rpcClient = new ProtomuxRpcClient(clientDht)

  const client = new AliasRpcClient(server.publicKey, sharedSecret, rpcClient, clientOpts)

  t.teardown(async () => {
    await rpcClient.close()
    await clientDht.destroy()
    await swarm.destroy()
    await testnet.destroy()
  })

  return { client, server }
}
