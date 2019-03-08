import dumbThinky from 'rethink-knex-adapter'
import redis from 'redis'
import bluebird from 'bluebird'

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

// // This was how to connect to rethinkdb:
// export default thinky({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   db: process.env.DB_NAME,
//   authKey: process.env.DB_KEY
// })

let config

const use_ssl = process.env.DB_USE_SSL && (process.env.DB_USE_SSL.toLowerCase() === 'true' || process.env.DB_USE_SSL === '1')

if (process.env.DB_JSON || global.DB_JSON) {
  config = JSON.parse(process.env.DB_JSON || global.DB_JSON)
} else if (process.env.DB_TYPE) {
  config = {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      user: process.env.DB_USER,
      ssl: use_ssl
    },
    pool: {
      min: parseInt(process.env.DB_MIN_POOL || 2, 10),
      max: parseInt(process.env.DB_MAX_POOL || 10),
      // free resouces are destroyed after this many milliseconds
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      // how often to check for idle resources to destroy
      reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL_MS || 1000)
    }
  }
} else if (process.env.DATABASE_URL) {
  const databaseType = process.env.DATABASE_URL.match(/^\w+/)[0]
  config = {
    client: (/postgres/.test(databaseType) ? 'pg' : databaseType),
    connection: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DB_MIN_POOL || 2, 10),
      max: parseInt(process.env.DB_MAX_POOL || 10, 10),
      // free resouces are destroyed after this many milliseconds
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      // how often to check for idle resources to destroy
      reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL_MS || 1000)
    },
    ssl: use_ssl
  }
} else {
  config = {
    client: 'sqlite3',
    connection: {
      filename: './mydb.sqlite'
    },
    defaultsUnsupported: true
  }
}

const thinkyConn = dumbThinky(config)

thinkyConn.r.getCount = async (query) => {
  // helper method to get a count result
  // with fewer bugs.  Using knex's .count()
  // results in a 'count' key on postgres, but a 'count(*)' key
  // on sqlite -- ridiculous.  This smooths that out
  if (Array.isArray(query)) {
    return query.length
  }
  return Number((await query.count('* as count').first()).count)
}

/**
 * Helper method to parse the result of a knex `count` query (see above).
 */
thinkyConn.r.parseCount = async (query) => {
  if (Array.isArray(query)) {
    return query.length
  }

  const result = (await query)[0]
  const keys = Object.keys(result)
  if (keys.length === 1) {
    const countKey = keys[0]
    return result[countKey]
  }

  throw new Error('Multiple columns returned by the query!')
}

if (process.env.REDIS_URL) {
  thinkyConn.r.redis = redis.createClient({ url: process.env.REDIS_URL })
} else if (process.env.REDIS_FAKE) {
  const fakeredis = require('fakeredis')
  bluebird.promisifyAll(fakeredis.RedisClient.prototype)
  bluebird.promisifyAll(fakeredis.Multi.prototype)

  thinkyConn.r.redis = fakeredis.createClient()
}

export default thinkyConn
