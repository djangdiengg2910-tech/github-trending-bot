import axios from 'axios';
import { logger } from '../server.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import pool from '../config/database.js';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Create axios instance with GitHub token
const githubClient = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    'Authorization': GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : undefined,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Trending-Dashboard/1.0.0'
  },
  timeout: 30000
});

// Rate limiting: GitHub allows 5000 requests per hour for authenticated users
let requestCount = 0;
let resetTime = Date.now();

const checkRateLimit = async () => {
  const now = Date.now();
  if (now > resetTime) {
    requestCount = 0;
    resetTime = now + 3600000; // 1 hour
  }

  if (requestCount >= 4500) { // Leave some buffer
    const waitTime = resetTime - now;
    logger.warn(`GitHub API rate limit approaching, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
  }

  requestCount++;
};

// Fetch trending repositories based on criteria
export const fetchTrendingRepos = async (options = {}) => {
  const {
    language = '',
    timeRange = 'week', // day, week, month
    sortBy = 'stars', // stars, forks, updated
    minStars = 0,
    limit = 100,
    forceRefresh = false
  } = options;

  const cacheKey = `trending:${language}:${timeRange}:${sortBy}:${minStars}:${limit}`;

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.info(`✅ Returning cached trending repos for ${cacheKey}`);
      return cached;
    }
  }

  try {
    await checkRateLimit();

    // Build search query
    let query = `stars:>${minStars}`;

    if (language) {
      query += ` language:${language}`;
    }

    // Time range filter
    const now = new Date();
    let sinceDate;
    switch (timeRange) {
      case 'day':
        sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    query += ` created:>${sinceDate.toISOString().split('T')[0]}`;

    // Sort parameter
    let sort = 'stars';
    let order = 'desc';

    switch (sortBy) {
      case 'stars':
        sort = 'stars';
        break;
      case 'forks':
        sort = 'forks';
        break;
      case 'updated':
        sort = 'updated';
        break;
      default:
        sort = 'stars';
    }

    const params = {
      q: query,
      sort,
      order,
      per_page: Math.min(limit, 100) // GitHub API limit
    };

    logger.info(`🔍 Searching GitHub repos with query: ${query}`);

    const response = await githubClient.get('/search/repositories', { params });

    const repos = response.data.items.map(repo => ({
      github_id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      owner_avatar: repo.owner.avatar_url,
      description: repo.description,
      language: repo.language,
      topics: repo.topics || [],
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      size: repo.size,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      homepage: repo.homepage,
      license: repo.license?.name,
      archived: repo.archived,
      disabled: repo.disabled,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url
    }));

    // Calculate trending scores and growth rates
    const enrichedRepos = await enrichWithGrowthData(repos);

    // Cache for 1 hour
    await cacheSet(cacheKey, enrichedRepos, 3600);

    logger.info(`✅ Fetched ${enrichedRepos.length} trending repos`);
    return enrichedRepos;

  } catch (error) {
    logger.error('❌ Error fetching trending repos:', error.response?.data || error.message);
    throw new Error('Failed to fetch trending repositories');
  }
};

// Enrich repositories with growth data and trending scores
const enrichWithGrowthData = async (repos) => {
  const enriched = [];

  for (const repo of repos) {
    try {
      // Get star history for growth calculation
      const growthData = await calculateGrowthMetrics(repo.github_id);

      // Calculate trending score (weighted algorithm)
      const trendingScore = calculateTrendingScore(repo, growthData);

      enriched.push({
        ...repo,
        ...growthData,
        trending_score: trendingScore
      });

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 10));

    } catch (error) {
      logger.warn(`⚠️ Failed to enrich repo ${repo.full_name}:`, error.message);
      enriched.push({
        ...repo,
        star_growth_24h: 0,
        star_growth_7d: 0,
        star_growth_30d: 0,
        trending_score: 0
      });
    }
  }

  // Sort by trending score
  return enriched.sort((a, b) => b.trending_score - a.trending_score);
};

// Calculate growth metrics for a repository
const calculateGrowthMetrics = async (githubId) => {
  const client = await pool.connect();

  try {
    // Get snapshots for the last 30 days
    const result = await client.query(`
      SELECT stars, snapshot_date
      FROM repo_snapshots
      WHERE repo_id = (SELECT id FROM repositories WHERE github_id = $1)
        AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY snapshot_date DESC
    `, [githubId]);

    const snapshots = result.rows;

    if (snapshots.length < 2) {
      return {
        star_growth_24h: 0,
        star_growth_7d: 0,
        star_growth_30d: 0
      };
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find closest snapshots for each period
    const findClosestSnapshot = (targetDate) => {
      return snapshots.reduce((closest, snapshot) => {
        const snapshotDate = new Date(snapshot.snapshot_date);
        const currentDiff = Math.abs(snapshotDate - targetDate);
        const closestDiff = Math.abs(new Date(closest.snapshot_date) - targetDate);
        return currentDiff < closestDiff ? snapshot : closest;
      });
    };

    const currentSnapshot = snapshots[0];
    const dayAgoSnapshot = findClosestSnapshot(oneDayAgo);
    const weekAgoSnapshot = findClosestSnapshot(sevenDaysAgo);
    const monthAgoSnapshot = findClosestSnapshot(thirtyDaysAgo);

    return {
      star_growth_24h: Math.max(0, currentSnapshot.stars - (dayAgoSnapshot?.stars || 0)),
      star_growth_7d: Math.max(0, currentSnapshot.stars - (weekAgoSnapshot?.stars || 0)),
      star_growth_30d: Math.max(0, currentSnapshot.stars - (monthAgoSnapshot?.stars || 0))
    };

  } catch (error) {
    logger.error('Error calculating growth metrics:', error);
    return {
      star_growth_24h: 0,
      star_growth_7d: 0,
      star_growth_30d: 0
    };
  } finally {
    client.release();
  }
};

// Calculate trending score using weighted algorithm
const calculateTrendingScore = (repo, growth) => {
  const {
    stars,
    forks,
    star_growth_24h,
    star_growth_7d,
    star_growth_30d
  } = { ...repo, ...growth };

  // Weights for different factors
  const weights = {
    stars: 0.3,
    forks: 0.2,
    growth24h: 0.2,
    growth7d: 0.2,
    growth30d: 0.1
  };

  // Normalize values (simple approach)
  const normalizedStars = Math.min(stars / 10000, 1); // Cap at 10k stars
  const normalizedForks = Math.min(forks / 1000, 1); // Cap at 1k forks
  const normalizedGrowth24h = Math.min(star_growth_24h / 100, 1); // Cap at 100 stars/day
  const normalizedGrowth7d = Math.min(star_growth_7d / 500, 1); // Cap at 500 stars/week
  const normalizedGrowth30d = Math.min(star_growth_30d / 2000, 1); // Cap at 2000 stars/month

  const score =
    weights.stars * normalizedStars +
    weights.forks * normalizedForks +
    weights.growth24h * normalizedGrowth24h +
    weights.growth7d * normalizedGrowth7d +
    weights.growth30d * normalizedGrowth30d;

  return Math.round(score * 10000) / 10000; // Round to 4 decimal places
};

// Fetch detailed repository information
export const fetchRepoDetails = async (owner, name) => {
  const cacheKey = `repo:${owner}/${name}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    await checkRateLimit();

    const response = await githubClient.get(`/repos/${owner}/${name}`);
    const repo = response.data;

    // Get README content
    let readme = null;
    try {
      const readmeResponse = await githubClient.get(`/repos/${owner}/${name}/readme`);
      readme = Buffer.from(readmeResponse.data.content, 'base64').toString('utf-8');
    } catch (error) {
      // README not found, continue without it
    }

    // Get contributor stats
    let contributors = [];
    try {
      const contribResponse = await githubClient.get(`/repos/${owner}/${name}/contributors`, {
        params: { per_page: 10 }
      });
      contributors = contribResponse.data;
    } catch (error) {
      // Contributors not available
    }

    const repoDetails = {
      github_id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      owner_avatar: repo.owner.avatar_url,
      description: repo.description,
      language: repo.language,
      topics: repo.topics || [],
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      watchers: repo.watchers_count,
      size: repo.size,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      homepage: repo.homepage,
      license: repo.license?.name,
      archived: repo.archived,
      disabled: repo.disabled,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      readme,
      contributors
    };

    // Cache for 6 hours
    await cacheSet(cacheKey, repoDetails, 21600);

    return repoDetails;

  } catch (error) {
    logger.error(`❌ Error fetching repo details for ${owner}/${name}:`, error.response?.data || error.message);
    throw new Error('Failed to fetch repository details');
  }
};

// Search repositories with advanced filters
export const searchRepos = async (query, filters = {}) => {
  const {
    language,
    minStars = 0,
    maxStars,
    sortBy = 'best-match',
    order = 'desc',
    limit = 50
  } = filters;

  const cacheKey = `search:${query}:${JSON.stringify(filters)}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    await checkRateLimit();

    let searchQuery = query;

    if (language) {
      searchQuery += ` language:${language}`;
    }

    if (minStars > 0) {
      searchQuery += ` stars:>=${minStars}`;
    }

    if (maxStars) {
      searchQuery += ` stars:<=${maxStars}`;
    }

    const params = {
      q: searchQuery,
      sort: sortBy,
      order,
      per_page: Math.min(limit, 100)
    };

    const response = await githubClient.get('/search/repositories', { params });

    const repos = response.data.items.map(repo => ({
      github_id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      owner_avatar: repo.owner.avatar_url,
      description: repo.description,
      language: repo.language,
      topics: repo.topics || [],
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      html_url: repo.html_url
    }));

    // Cache for 30 minutes
    await cacheSet(cacheKey, repos, 1800);

    return repos;

  } catch (error) {
    logger.error('❌ Error searching repos:', error.response?.data || error.message);
    throw new Error('Failed to search repositories');
  }
};

// Get trending languages
export const getTrendingLanguages = async () => {
  const cacheKey = 'trending-languages';

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Get top repositories and aggregate languages
    const repos = await fetchTrendingRepos({
      limit: 500,
      timeRange: 'week'
    });

    const languageStats = {};

    repos.forEach(repo => {
      if (repo.language) {
        if (!languageStats[repo.language]) {
          languageStats[repo.language] = {
            language: repo.language,
            count: 0,
            total_stars: 0,
            avg_stars: 0
          };
        }
        languageStats[repo.language].count++;
        languageStats[repo.language].total_stars += repo.stars;
      }
    });

    // Calculate averages and sort
    const languages = Object.values(languageStats)
      .map(lang => ({
        ...lang,
        avg_stars: Math.round(lang.total_stars / lang.count)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 languages

    // Cache for 6 hours
    await cacheSet(cacheKey, languages, 21600);

    return languages;

  } catch (error) {
    logger.error('❌ Error getting trending languages:', error);
    throw new Error('Failed to get trending languages');
  }
};