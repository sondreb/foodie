const express = require('express');
const app = express();
const cacheMiddleware = require('../middleware/cache');
const throttleMiddleware = require('../middleware/throttle');

// Apply caching middleware to all routes
app.use(cacheMiddleware);

// Apply throttling middleware to all routes
app.use(throttleMiddleware);

// Define your routes here
app.get('/restaurants', (req, res) => {
  res.json([]);
  // Your code to get the list of restaurants
});

app.get('/menu/:restaurantId', (req, res) => {
  // Your code to get the menu of a restaurant
  res.json([]);
});

app.get('/menu/item/:itemId', (req, res) => {
  // Your code to get a menu item
  res.json([]);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
