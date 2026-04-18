import { createClient } from 'redis';
import { logger } from '../server.js';

let redisClient = null;

export const initializeRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 60000,
        lazyConnect: true,
      },
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error('❌ Redis initialization failed:', error);
    // Don't throw error, allow app to run without Redis
    return null;
  }
};

export const getRedisClient = () => {
  return redisClient;
};

// Cache helper functions
export const cacheGet = async (key) => {
  try {
    if (!redisClient) return null;
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis cache get error:', error);
    return null;
  }
};

export const cacheSet = async (key, value, ttl = 3600) => {
  try {
    if (!redisClient) return;
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis cache set error:', error);
  }
};

export const cacheDelete = async (key) => {
  try {
    if (!redisClient) return;
    await redisClient.del(key);
  } catch (error) {
    logger.error('Redis cache delete error:', error);
  }
};

export const cacheFlush = async () => {
  try {
    if (!redisClient) return;
    await redisClient.flushAll();
  } catch (error) {
    logger.error('Redis cache flush error:', error);
  }
};