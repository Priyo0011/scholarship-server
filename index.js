const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.32bwvbv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const universityCollection = client
      .db("scholarship")
      .collection("university");
    const usersCollection = client.db("scholarship").collection("users");
    const paymentCollection = client.db("scholarship").collection("payment");
    const applyCollection = client.db("scholarship").collection("applicant");
    const reviewsCollection = client.db("scholarship").collection("review");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // Verify Token Middleware
    const verifyToken = async (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.log(err);
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.user = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      console.log(result?.role);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access!!" });

      next();
    };
    // save a user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.status === "Requested") {
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          return res.send(isExist);
        }
      }

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Get all users from db
    app.get("/users", verifyToken,verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // Get all reviews from db
    app.get("/reviews",  async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    // update scholarship
    app.put('/scholarship/update/:id', async (req, res) => {
      const id = req.params.id
      const scholarshipData = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: scholarshipData,
      }
      const result = await universityCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    // Get all university from db
    app.get("/university", async (req, res) => {
      const result = await universityCollection.find().toArray();
      res.send(result);
    });
    // Save a university data in db
    app.post("/scholarship", async (req, res) => {
      const scholarshipData = req.body;
      const result = await universityCollection.insertOne(scholarshipData);
      res.send(result);
    });
    // Save a review data in db
    app.post("/review", async (req, res) => {
      const reviewData = req.body;
      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });
    // Save a apply data in db
    app.post("/apply", async (req, res) => {
      const applyData = req.body;
      const result = await applyCollection.insertOne(applyData);
      res.send(result);
    });
    // get all apply for a user
    app.get("/my-apply/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "user.email": email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    // get all apply for a user
    app.get("/my-reviews/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "review_user.email": email };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });
    // delete a apply
    app.delete("/apply/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await paymentCollection.deleteOne(query);
      res.send(result);
    });
    // delete a reviews
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });
    // Save a payments data in db
    app.post("/payments", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });

    // Get all payment from db
    app.get("/payment", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // Get all scholarships from db
    app.get("/manage-scholarships/:email", async (req, res) => {
      const email = req.params.email;
      let query = { "host.email": email };
      const result = await universityCollection.find(query).toArray();
      res.send(result);
    });

    // create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });
    });

    // delete a 
    app.delete("/scholarship/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await universityCollection.deleteOne(query);
      res.send(result);
    });
    //update a user role
    app.patch("/users/update/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: { ...user, timestamp: Date.now() },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    //delete  a user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    // Get a single university data from db using _id
    app.get("/university/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await universityCollection.findOne(query);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Scholarship Server..");
});

app.listen(port, () => {
  console.log(`Scholarship is running on port ${port}`);
});
