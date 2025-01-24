const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 100, // Time to live in seconds
  checkperiod: 120, // Period in seconds to check for expired keys
  useClones: false // Do not use clones for stored values
});

module.exports = cache;
