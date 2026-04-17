/**
 * cacheService.js
 * Simple in-memory cache with TTL (time-to-live) support.
 * Used to avoid repeated GitHub/Gemini API calls.
 */

const cache = new Map();

/**
 * Set a value in cache with a TTL in milliseconds.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - Time to live in milliseconds (default: 24 hours)
 */
function set(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    lastUpdated: Date.now(),
  });
}

/**
 * Get a cached value. Returns null if missing or expired.
 * @param {string} key
 * @returns {any|null}
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Delete a key from the cache.
 * @param {string} key
 */
function del(key) {
  cache.delete(key);
}

/**
 * Get the last updated timestamp for a key.
 * @param {string} key
 * @returns {number|null} Unix timestamp in milliseconds, or null if not found
 */
function getLastUpdated(key) {
  const entry = cache.get(key);
  return entry ? entry.lastUpdated : null;
}

/**
 * Clear the entire cache.
 */
function clear() {
  cache.clear();
}

module.exports = { set, get, del, clear, getLastUpdated };
