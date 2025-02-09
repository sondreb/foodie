import express from "express";
import cors from "cors";
import compression from "cors";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { MongoClient, ObjectId } from "mongodb";
import cookieParser from "cookie-parser";
import { readFile } from "fs/promises";
import rateLimit from "express-rate-limit";
import MUUID from "uuid-mongodb";
import cache from "memory-cache";
import { serialize } from "cookie";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import crypto from 'crypto';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize dotenv
dotenv.config({ path: resolve(__dirname, "../../.env") });

// RELAXED appears to have issued with Cosmos DB web explorer.
// const mUUID = MUUID.mode("relaxed"); // use relaxed mode
const PRODUCTION = process.env["NODE_ENV"] === "production";
const KEY = process.env["JWT_KEY"];


// Load package.json
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url))
);

const rateLimitMinute = process.env["RATELIMIT"]
  ? Number(process.env["RATELIMIT"])
  : 30;

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: rateLimitMinute,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Add strict rate limit for key generation
const keyGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 requests per hour
  message: 'Too many key generation attempts, please try again later'
});

const app = express();

// Apply the rate limiting middleware to all requests
app.use(limiter);

// Define CORS options
const corsOptions = {
  origin: PRODUCTION 
    ? 'https://foodie.brainbox.no'
    : ['http://localhost:3000', 'http://localhost:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // 24 hours in seconds
};

// Apply CORS with options
app.use(cors(corsOptions));

app.use(express.json());

// Remove the manual CORS setup
// app.use(function (req, res, next) { ... });

const mongoConnectionString =
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGODB_URI ||
  process.env.CUSTOMCONNSTR_MONGODB_URI;

if (!mongoConnectionString) {
  console.error(
    "MongoDB connection string not found in environment variables or .env file"
  );
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

app.use(cookieParser());

app.use(
  compression({
    threshold: 512,
  })
);

app.disable("x-powered-by");

// Add this middleware function after the imports
const adminAuth = async (req, res, next) => {
  try {
    const { cookies } = req;
    const token = cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, KEY);
    
    if (!decoded.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Define your routes here
app.get("/version", (req, res) => {
  res.json({
    version: packageJson.version,
    production: PRODUCTION
  });
});

// app.get("/restaurants", async (req, res) => {
//   try {
//     const dbClient = await getClient();
//     const db = dbClient.db("foodie");

//     // Check if collection exists and create if it doesn't
//     const collections = await db
//       .listCollections({ name: "restaurants" })
//       .toArray();
//     if (collections.length === 0) {
//       console.log("Creating restaurants collection...");
// //       await db.createCollection("documents");

//       // Insert sample restaurants
//       const sampleRestaurants = [
//         {
//           name: "Pizza Palace",
//           cuisine: "Italian",
//           address: "123 Main St",
//           rating: 4.5,
//           created: new Date(),
//         },
//         {
//           name: "Sushi Master",
//           cuisine: "Japanese",
//           address: "456 Oak Ave",
//           rating: 4.8,
//           created: new Date(),
//         },
//       ];

//       await db.collection("restaurants").insertMany(sampleRestaurants);
//       console.log("Added sample restaurants");
//     }

//     const restaurants = await db.collection("restaurants").find({}).toArray();
//     res.json(restaurants);
//   } catch (error) {
//     console.error("Database operation failed:", error);
//     res.status(500).json({ error: "Database operation failed" });
//   }
// });

app.get("/menu/:restaurantId", (req, res) => {
  // Your code to get the menu of a restaurant
  res.json([]);
});

app.get("/menu/item/:itemId", (req, res) => {
  // Your code to get a menu item
  res.json([]);
});

app.get("/authenticate", (req, res) => {
  const challenge = MUUID.v4();

  // Put the challenge in cache for 5 minute.
  cache.put(`challenge:${challenge}`, true, 60 * 1000);

  res.send({ challenge: challenge });
});

app.post("/authenticate", async (req, res) => {
  try {
    const { password } = req.body;

    if (!req.body.proof) {
      return res.status(404);
    }

    await verifyToken(req.body.proof, req.body.did);

    const payload = {
      did: req.body.did,
    };

    // if (!ADMINS?.includes(payload.did)) {
    //   return res
    //     .send({
    //       status: "error",
    //       error: "Unauthorized",
    //     })
    //     .status(401);
    // }

    // const isAdmin = ADMINS?.includes(payload.did);

    // let collection = await db.collection("user");
    // let query = { did: payload.did };
    // let result = await collection.findOne(query);

    // If the user is not found, we should create a new user and set the approved flag to false.
    // if (!result) {
    //   let document = {
    //     approved: false,
    //     did: payload.did,
    //     payload: payload,
    //   };

    //   document._id = MUUID.v4();
    //   document.date = new Date();
    //   result = await collection.insertOne(document);
    //   console.log("New user added:");
    //   console.log(document);
    // }

    const isApproved = result.approved;
    const token = jwt.sign(payload, KEY, { expiresIn: "1h" });

    let serialized;

    if (PRODUCTION) {
      console.log("PRODUCTION!!!");
      // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
      serialized = serialize("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 1, // 1 day, should this cookie be used to issue session cookies and be long-lived? The JWT itself is only valid 1h.
        path: "/",
      });
    } else {
      console.log("DEVELOPMENT!!!");
      // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
      serialized = serialize("token", token, {
        maxAge: 60 * 60 * 24 * 1, // 1 day, should this cookie be used to issue session cookies and be long-lived? The JWT itself is only valid 1h.
        path: "/",
      });
    }

    res.setHeader("Set-Cookie", serialized);

    return res.send({
      success: true,
      user: {
        did: payload.did,
        admin: isAdmin,
        approved: isApproved,
      },
    });
  } catch (err) {
    console.log(err);
  }
});

app.post("/authenticate/login", limiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (
      !username ||
      !password ||
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({ error: "Invalid credentials format" });
    }

    const dbClient = await getClient();

    const db = dbClient.db("foodie");

    const user = await db.collection("documents").findOne({
      username: username,
      type: "user",
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const validPassword = await argon2.verify(user.password, password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create JWT payload
    const payload = {
      id: user._id,
      username: user.username,
      roles: user.roles
    };

    const token = jwt.sign(payload, KEY, { expiresIn: "1h" });

    // Set HTTP-only cookie
    // const serialized = serialize("token", token, {
    //   httpOnly: true,
    //   secure: PRODUCTION,
    //   sameSite: "lax",
    //   maxAge: 60 * 60 * 24, // 24 hours
    //   path: "/",
    // });

    let serialized;

    if (PRODUCTION) {
      console.log("PRODUCTION!!!");
      // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
      serialized = serialize("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 1, // 1 day, should this cookie be used to issue session cookies and be long-lived? The JWT itself is only valid 1h.
        path: "/",
      });
    } else {
      console.log("DEVELOPMENT!!!");
      // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
      serialized = serialize("token", token, {
        maxAge: 60 * 60 * 24 * 1, // 1 day, should this cookie be used to issue session cookies and be long-lived? The JWT itself is only valid 1h.
        path: "/",
      });
    }

    res.setHeader("Set-Cookie", serialized);

    // Return minimal user info (avoid sending sensitive data)
    return res.json({
      success: true,
      data: payload
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/authenticate/logout", (req, res) => {
  const { cookies } = req;
  const jwt = cookies.token;

  if (!jwt) {
    return res.status(401).send({
      status: "error",
      error: "Unauthorized",
    });
  }

  if (PRODUCTION) {
    console.log("PRODUCTION!!!");
    // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
    const serialized = serialize("token", null, {
      httpOnly: true,
      secure: PRODUCTION,
      sameSite: "lax",
      maxAge: -1,
      path: "/",
    });
  } else {
    console.log("DEVELOPMENT!!!");
    // If the verification failed, it should have thrown an exception by now. We can generate an JWT and make a cookie for it.
    serialized = serialize("token", null, {
      maxAge: 60 * 60 * 24 * 1, // 1 day, should this cookie be used to issue session cookies and be long-lived? The JWT itself is only valid 1h.
      path: "/",
    });
  }

  res.setHeader("Set-Cookie", serialized);

  return res.send({
    status: "success",
    message: "Logged out",
  });
});

app.get("/authenticate/protected", (req, res) => {
  try {
    const { cookies } = req;
    const token = cookies.token;

    if (!token) {
      return res.status(401).send({
        status: "error",
        error: "Unauthorized",
      });
    } else {
      try {
        // First let us verify the token.
        const decoded = jwt.verify(token, KEY);
        const isAdmin = ADMINS?.includes(decoded.did);

        // let collection = await db.collection("user");
        // let query = { did: decoded.did };
        // let result = await collection.findOne(query);
        // const isApproved = result ? false : true;

        return res.send({
          user: {
            did: decoded.did,
            admin: isAdmin,
            approved: isApproved,
          },
        });
      } catch (err) {
        console.log(err);
        // If the JWT has expired, the user is logged out.
        return res.status(401).send({
          status: "error",
          error: "Unauthorized, JWT expired",
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
});

// Just used to generate a hash for admin accounts.
app.post("/hash-password", async (req, res) => {
  console.log("Hashing password...");
  try {
    const { password } = req.body;

    // Input validation
    if (!password || typeof password !== "string" || password.length < 0) {
      return res.status(400).json({
        error: "Password must be a string of at least 8 characters",
      });
    }

    // Argon2id with recommended parameters
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64MB in KiB
      timeCost: 3, // iterations
      parallelism: 4,
      saltLength: 16,
    });

    // const sampleRestaurants = [
    //   {
    //     username: "admin",
    //     password: hash,
    //     roles: ["admin"],
    //     type: 'user'
    //   }
    // ];

    // const dbClient = await getClient();
    // const db = dbClient.db("foodie");

    // await db.collection("documents").insertMany(sampleRestaurants);

    res.json({
      hash,
      // Note: Salt is embedded in the hash string
      algorithm: "argon2id",
    });
  } catch (error) {
    console.error("Password hashing failed:", error);
    res.status(500).json({ error: "Password hashing failed" });
  }
});

app.post("/generate-key", keyGenLimiter, async (req, res) => {
  try {
    const { length = 64 } = req.body; // Default to 64 bytes

    // Validate input
    if (length < 32 || length > 128) {
      return res.status(400).json({
        error: 'Key length must be between 32 and 128 bytes'
      });
    }

    // Generate cryptographically secure random bytes
    const buffer = crypto.randomBytes(length);
    
    // Convert to base64 for safe storage
    const key = buffer.toString('base64');

    res.json({
      key,
      length: buffer.length,
      format: 'base64',
      usage: 'Set this as your JWT_KEY environment variable'
    });

  } catch (error) {
    console.error('Key generation failed:', error);
    res.status(500).json({ error: 'Key generation failed' });
  }
});

// Get all users (admin only)
app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const dbClient = await getClient();
    const db = dbClient.db("foodie");
    const users = await db.collection("documents")
      .find({ type: "user" })
      .project({ password: 0 }) // Exclude password field
      .toArray();

    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new user (admin only)
app.post("/admin/users", adminAuth, async (req, res) => {
  try {
    const { username, password, roles = ['user'] } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const dbClient = await getClient();
    const db = dbClient.db("foodie");

    // Check if username already exists
    const existing = await db.collection("documents").findOne({ 
      type: "user",
      username: username 
    });

    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      saltLength: 16,
    });

    const user = {
      //_id: MUUID.v4(),
      _id: new ObjectId(),
      type: "user",
      username,
      password: hash,
      roles,
      created: new Date(),
      createdBy: req.user.username
    };

    await db.collection("documents").insertOne(user);

    // Remove password before sending response
    delete user.password;
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error("Failed to create user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user (admin only)
app.put("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const { username, roles } = req.body;
    const userId = req.params.id;

    if (!username && !roles) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const dbClient = await getClient();
    const db = dbClient.db("foodie");

    const update = {
      $set: {
        ...(username && { username }),
        ...(roles && { roles }),
        updated: new Date(),
        updatedBy: req.user.username
      }
    };

    const result = await db.collection("documents").updateOne(
      { _id: ObjectId.createFromHexString(userId), type: "user" },
      update
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, message: "User updated" });
  } catch (error) {
    console.error("Failed to update user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user (admin only)
app.delete("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const dbClient = await getClient();
    const db = dbClient.db("foodie");

    const id = ObjectId.createFromHexString(userId);

    const result = await db.collection("documents").deleteOne({
      _id: id,
      type: "user"
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  if (client) {
    await client.close();
    console.log("MongoDB connection closed.");
  }
  process.exit(0);
});

// Error handling for ES modules
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Application specific logging, throwing an error, or other logic here
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`); 
});
