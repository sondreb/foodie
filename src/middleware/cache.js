const cache = require('../config/cache');

function cacheMiddleware(req, res, next) {
  const key = req.originalUrl || req.url;
  const cachedResponse = cache.get(key);

  if (cachedResponse) {
    res.send(cachedResponse);
  } else {
    res.sendResponse = res.send;
    res.send = (body) => {
      cache.set(key, body);
      res.sendResponse(body);
    };
    next();
  }
}

module.exports = cacheMiddleware;
