/**
 * MongoDB Connection & Index Management.
 * Connects to local Docker MongoDB container.
 */
import { MongoClient } from 'mongodb';
import cfg from '../config.js';

let _client = null;
let _db = null;

export async function connectMongo(uri = cfg.MONGO_URI) {
  if (_db) return _db;
  _client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });
  await _client.connect();
  _db = _client.db();
  await ensureMongoIndexes(_db);
  return _db;
}

export function getMongoDb() {
  if (!_db) {
    throw new Error('MongoDB not initialized — call connectMongo() first');
  }
  return _db;
}

export async function closeMongo() {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
  }
}

export async function pingMongo() {
  try {
    const db = await connectMongo();
    await db.command({ ping: 1 });
    const collections = await db.listCollections().toArray();
    const stats = {};
    for (const c of collections) {
      stats[c.name] = await db.collection(c.name).countDocuments();
    }
    return { ok: true, database: db.databaseName, collections: stats };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function ensureMongoIndexes(db) {
  await Promise.all([
    db.collection('households').createIndex({ lclid: 1 }, { unique: true }),
    db.collection('households').createIndex({ tariff: 1 }),
    db.collection('households').createIndex({ acornGrouped: 1 }),
    db.collection('acorn_profiles').createIndex({ group: 1 }, { unique: true }),
    db.collection('weather_hourly').createIndex({ time: 1 }),
    db.collection('weather_hourly').createIndex({ hourKey: 1 }),
    db.collection('weather_daily').createIndex({ time: 1 }),
    db.collection('weather_daily').createIndex({ date: 1 }),
    db.collection('bank_holidays').createIndex({ date: 1 }, { unique: true }),
    db.collection('smart_meter_readings').createIndex({ lclid: 1, ts: 1 }, { unique: true }),
    db.collection('smart_meter_readings').createIndex({ lclid: 1, day: 1 }),
  ]);
}
