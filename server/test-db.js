import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;
console.log("Database connected:", db.name);

const collections = await db.db.listCollections().toArray();
for (const col of collections) {
  const count = await db.db.collection(col.name).countDocuments();
  console.log(`Collection: ${col.name}, Count: ${count}`);
}

await mongoose.disconnect();
