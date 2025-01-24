const express = require('express');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const app = express();
const cacheMiddleware = require('../middleware/cache');
const throttleMiddleware = require('../middleware/throttle');

const { MongoClient } = require("mongodb");

const mongoConnectionString = 
  process.env.MONGODB_URI_LOCAL || 
  process.env.MONGODB_URI || 
  process.env.CUSTOMCONNSTR_MONGODB_URI;

if (!mongoConnectionString) {
  console.error('MongoDB connection string not found in environment variables or .env file');
  process.exit(1);
}

// MongoDB connection options for Cosmos DB
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
};

// Create a MongoDB client instance for reuse
let client = null;

async function getClient() {
  if (!client) {
    client = new MongoClient(mongoConnectionString, options);
    await client.connect();
  }
  return client;
}

// Apply caching middleware to all routes
app.use(cacheMiddleware);

// Apply throttling middleware to all routes
app.use(throttleMiddleware);

// Define your routes here
app.get('/restaurants', async (req, res) => {
  try {
    const dbClient = await getClient();
    const db = dbClient.db('foodie');

    // Check if collection exists and create if it doesn't
    const collections = await db.listCollections({ name: 'restaurants' }).toArray();
    if (collections.length === 0) {
      console.log('Creating restaurants collection...');
      await db.createCollection('restaurants');

      // Insert sample restaurants
      const sampleRestaurants = [
        {
          name: "Pizza Palace",
          cuisine: "Italian",
          address: "123 Main St",
          rating: 4.5,
          created: new Date()
        },
        {
          name: "Sushi Master",
          cuisine: "Japanese",
          address: "456 Oak Ave",
          rating: 4.8,
          created: new Date()
        }
      ];

      await db.collection('restaurants').insertMany(sampleRestaurants);
      console.log('Added sample restaurants');
    }

    const restaurants = await db.collection('restaurants').find({}).toArray();
    res.json(restaurants);
  } catch (error) {
    console.error('Database operation failed:', error);
    res.status(500).json({ error: 'Database operation failed' });
  }
});

app.get('/menu/:restaurantId', (req, res) => {
  // Your code to get the menu of a restaurant
  res.json([]);
});

app.get('/menu/item/:itemId', (req, res) => {
  // Your code to get a menu item
  res.json([]);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed.');
  }
  process.exit(0);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
