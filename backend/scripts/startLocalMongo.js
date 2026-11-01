import { MongoMemoryServer } from 'mongodb-memory-server';

async function run() {
  try {
    console.log('🚀 Starting standalone local MongoDB server on port 27017...');
    const mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbName: 'aap_ki_dukan',
      },
    });

    console.log(`✅ Standalone MongoDB is running at: ${mongod.getUri()}`);
    console.log('Database Name: aap_ki_dukan');
    console.log('Ready for backend connections and data seeding.');

    const shutdown = async () => {
      console.log('\nStopping standalone MongoDB...');
      await mongod.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start MongoDB server:', err);
    process.exit(1);
  }
}

run();
