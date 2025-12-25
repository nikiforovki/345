const { MongoClient } = require("mongodb");
const config = require("../config");

let db;
let client;

async function initializeDatabase() {
  try {
    client = new MongoClient(config.MONGODB_URI);
    await client.connect();
    console.log("Подключение к MongoDB установлено");

    db = client.db();

    // Создание индексов для оптимизации запросов
    await createIndexes();
  } catch (error) {
    console.error("Ошибка подключения к MongoDB:", error);
    throw error;
  }
}

async function createIndexes() {
  // Индексы для коллекции users
  const usersCollection = db.collection("users");
  await usersCollection.createIndex({ user_id: 1 }, { unique: true });
  await usersCollection.createIndex({ username: 1 });

  // Индексы для коллекции keys
  const keysCollection = db.collection("keys");
  await keysCollection.createIndex({ key_value: 1 }, { unique: true });
  await keysCollection.createIndex({ status: 1 });
  await keysCollection.createIndex({ user_id: 1 });

  // Индексы для коллекции payments
  const paymentsCollection = db.collection("payments");
  await paymentsCollection.createIndex({ order_id: 1 }, { unique: true });
  await paymentsCollection.createIndex({ kassa_payment_id: 1 });
  await paymentsCollection.createIndex({ user_id: 1 });

  // Индексы для коллекции orders
  const ordersCollection = db.collection("orders");
  await ordersCollection.createIndex({ user_id: 1 });
  await ordersCollection.createIndex({ key_id: 1 }, { unique: true });
  await ordersCollection.createIndex({ created_at: 1 });

  console.log("Индексы созданы");
}

function getDb() {
  if (!db) {
    throw new Error(
      "База данных не инициализирована. Вызовите initializeDatabase() сначала."
    );
  }
  return db;
}

function getClient() {
  if (!client) {
    throw new Error(
      "Mongo клиент не инициализирован. Вызовите initializeDatabase() сначала."
    );
  }
  return client;
}

module.exports = {
  initializeDatabase,
  getDb,
  getClient,
  collection: (name) => getDb().collection(name),
};
