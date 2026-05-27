const cenc = require('compact-encoding')

const MAJOR_VERSION = 1
const MINOR_VERSION = 1

const AliasReqEnc = {
  preencode(state, m) {
    cenc.uint.preencode(state, m.major || MAJOR_VERSION)
    cenc.uint.preencode(state, m.minor || MINOR_VERSION)
    cenc.fixed32.preencode(state, m.secret)
    cenc.string.preencode(state, m.alias)
    cenc.fixed32.preencode(state, m.targetPublicKey)
    cenc.string.preencode(state, m.hostname)
    cenc.string.preencode(state, m.service)
  },

  encode(state, m) {
    cenc.uint.encode(state, m.major || MAJOR_VERSION)
    cenc.uint.encode(state, m.minor || MINOR_VERSION)
    cenc.fixed32.encode(state, m.secret)
    cenc.string.encode(state, m.alias)
    cenc.fixed32.encode(state, m.targetPublicKey)
    cenc.string.encode(state, m.hostname)
    cenc.string.encode(state, m.service)
  },

  decode(state) {
    const major = cenc.uint.decode(state)
    const minor = cenc.uint.decode(state)
    if (major !== MAJOR_VERSION) {
      throw new Error(
        `Cannot decode RegisterRequest of other major version ${major} (own major: ${MAJOR_VERSION})`
      )
    }
    if (minor > MINOR_VERSION) {
      throw new Error(
        `Cannot decode RegisterRequest of higher minor version ${minor} (own minor: ${MINOR_VERSION})`
      )
    }

    const res = {
      major,
      minor,
      secret: cenc.fixed32.decode(state),
      alias: cenc.string.decode(state),
      targetPublicKey: cenc.fixed32.decode(state),
      hostname: cenc.string.decode(state),
      service: cenc.string.decode(state)
    }

    return res
  }
}

const AliasRespEnc = {
  preencode(state, m) {
    cenc.uint.preencode(state, m.major || MAJOR_VERSION)
    cenc.uint.preencode(state, m.minor || MINOR_VERSION)
    cenc.bool.preencode(state, m.success)

    if (m.success) {
      cenc.bool.preencode(state, m.updated)
    } else {
      cenc.string.preencode(state, m.errorMessage)
    }
  },

  encode(state, m) {
    cenc.uint.encode(state, m.major || MAJOR_VERSION)
    cenc.uint.encode(state, m.minor || MINOR_VERSION)
    cenc.bool.encode(state, m.success)

    if (m.success) {
      cenc.bool.encode(state, m.updated)
    } else {
      cenc.string.encode(state, m.errorMessage)
    }
  },

  decode(state) {
    const major = cenc.uint.decode(state)
    const minor = cenc.uint.decode(state)

    if (major !== MAJOR_VERSION) {
      throw new Error(
        `Cannot decode AliasResp of different major version ${major} (own version: ${MAJOR_VERSION}`
      )
    }

    const success = cenc.bool.decode(state)

    const res = { success, major, minor }

    if (success) {
      res.updated = cenc.bool.decode(state)
    } else {
      res.errorMessage = cenc.string.decode(state)
    }

    return res
  }
}

module.exports = {
  AliasReqEnc,
  AliasRespEnc
}
