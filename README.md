# DHT Prom Alias RPC

[Protomux RPC](https://github.com/holepunchto/protomux-rpc/) for registering aliases with a [DHT-Prometheus](https://github.com/HDegroote/dht-prometheus) service.

## Usage

See [./example.js](example.js)

## Install

```
npm i dht-prom-alias-rpc
```

## API

### Server

#### `const rpcServer = new AliasRpcServer(swarm, secret, putAliasCb)`

Create a new alias rpc server.

`swarm` is a [Hyperswarm](https://github.com/holepunchto/hyperswarm) instance. Its life cycle is NOT managed by the RPC server.

Note: `rpcServer.swarm.listen()` needs to be called before the rpcServer has a public key and connections are accepted.

`secret` is a 32-byte secret. Only clients which know this secret will be allowed to register aliases.

`putAliasCb` is a (possibly async) function which is called every time a valid alias request is received. It should return true if the alias was updated, and false otherwise (if it already existed). To refuse to register an alias, throw an error.

#### `rpcServer.publicKey`

Public key the rpc server is listening on.

#### Events

All events contain a `uid`, which is unique per connection, and the `remotePublicKey` of the other peer.

#### `rpcServer.on('connection-open', ({ uid, remotePublicKey, remoteAddress }))`

Emitted whenever a new connection is opened.

`remoteAddress` is the address where the other peer is listening, for example `127.0.0.1:5444`.

#### `rpcServer.on('connection-error', ({ uid, error, remotePublicKey }))`

Emitted whenever a connection errors. Connection errors are expected, and this is not a call to action (the connection will clean itself up), but it can be useful for logging.

#### `rpcServer.on('connection-close', ({ uid, remotePublicKey }))`

Emitted whenever a connection is closed.

#### `rpcServer.on('alias-unauthorised', ({ uid, remotePublicKey, targetPublicKey, alias, remoteAddress }))`

Emitted whenever a peer tried to register an alias without knowing the correct secret.

`remoteAddress` is the address (`ip:port`) of the peer who tried to map the `alias` to `targetPublicKey`.

#### `rpcServer.on('alias-request', ({ uid, remotePublicKey, targetPublicKey, alias, hostname, service }))`

Emitted whenever a peer who knows the secret tries to register an alias.

`remotePublicKey` is the publicKey of the peer who requests to map the `alias` to `targetPublicKey`.

`hostname` and `service` contain the values provided in the request.

#### `rpcServer.on('alias-success', ({ uid, remotePublicKey, alias, targetPublicKey, updated }))`

Emitted whenever an `alias` was successfully registered for the `targetPublicKey`. The boolean `updated` indicates whether any changes were made.

#### `rpcServer.on('alias-error', ({ uid, remotePublicKey, error }))`

Emitted whenever the `putAliacCb` threw an error. `error` contains the error object.

### Client

#### `const client = new AliasRpcClient(serverPubKey, secret, protomuxRpcClient)`

Create a new alias rpc client.

`serverPubKey` is the public key of the alias rpc server.

`secret` is the secret shared with the server.

`protomuxRpcClient` is a [Protomux RPC Client](https://github.com/holepunchto/protomux-rpc-client) instance. Its lifecycle is NOT managed by the rpc client.

#### `const updated = await client.registerAlias(alias, targetKey, hostname, service, opts?)`

Register an `alias`, mapping it to the provided `targetKey`.

Hostname and service are included for easy filtering in prometheus:

`hostname` identifies the machine where the process runs (typically `os.hostname()`).

`service` indicates the kind of service registered.

`opts` include:

- `timeout` max request duration before it times out (in ms)

Returns a boolean `updated` which is true when the entry was not yet present in the server.

#### Events

#### `client.on('alias-attempt', ({ uid, alias, targetKey, hostname, service }))`

Emitted whenever an alias request is attempted.

`uid` is a unique id for the attempt to map `alias` to `targetKey`, with as additional info `hostname` and `service`.

#### `client.on('connection-error', ({ error, alias, targetKey, uid }))`

Emitted whenever a connection errors. Connection errors are expected, and this is not a call to action (the connection will clean itself up), but it can be useful for logging.

## Fork

Forked on 2026-06-17 from https://gitlab.com/dcent-tech/dht-prom-alias-rpc/,
licensed under Apache-2.0. See NOTICE.
