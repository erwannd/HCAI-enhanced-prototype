const mongoose = require('mongoose');

async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Copy server/.env.example to server/.env and set it.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
}

module.exports = { connectToDatabase };
