import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.DB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();

const db = connectedClient.db("rup-chorcha");

const usersCollection = db.collection("user");
const servicesCollection = db.collection("services");
const appointmentsCollection = db.collection("appointments");
const transactionsCollection = db.collection("transactions");


app.get("/", (req, res) => {
  res.send("Server is OK to assist.");
});

app.listen(PORT, (req, res) => {
  console.log(`The server is running on port ${PORT}.`);
});
