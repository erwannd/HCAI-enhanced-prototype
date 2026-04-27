const path = require('path');
const dotenv = require('dotenv');

const { createApp } = require('./app');
const { connectToDatabase } = require('./config/database');

dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  await connectToDatabase();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Enhanced prototype server listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
