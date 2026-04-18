/**
 * githubService.js
 * Fetches trending GitHub repositories using the GitHub Search API.
 *
 * Strategy: tries today → last 7 days → last 30 days, ensuring we always
 * return results even during quieter periods.
 */

const axios = require('axios');

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Returns a date string in YYYY-MM-DD format offset by `daysAgo` from today (UTC).
 * @param {number} daysAgo
 * @returns {string}
 */
function getDateDaysAgo(daysAgo = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

/**
 * Search GitHub repos based on mode and filters.
 * @param {object} headers
 * @param {string} mode - 'stars' (most starred ever) or 'updated' (recently updated)
 * @param {number} days - Number of days for date range (only used in 'updated' mode)
 * @param {number} perPage
 * @param {string} topic - Optional topic to filter by
 * @returns {Promise<Array>} raw items from GitHub
 */
async function searchRepos(headers, mode, days, perPage, topic = '') {
  let query = '';
  let sort = 'stars';
  let order = 'desc';

  if (mode === 'stars') {
    // Most starred repos ever - no date filter
    query = topic && topic !== 'all' ? `topic:${topic}` : '';
    sort = 'stars';
  } else if (mode === 'updated') {
    // Recently updated repos within date range
    const sinceDate = getDateDaysAgo(days);
    query = `pushed:>${sinceDate}`;
    if (topic && topic !== 'all') {
      query += ` topic:${topic}`;
    }
    sort = 'updated';
  }

  const response = await axios.get(`${GITHUB_API_BASE}/search/repositories`, {
    headers,
    params: {
      q: query || 'stars:>1', // fallback query if empty
      sort: sort,
      order: order,
      per_page: perPage,
    },
    timeout: 15000,
  });
  return response.data.items || [];
}

/**
 * Fetch repositories based on search mode and filters.
 * @param {number} perPage - Number of repos to return
 * @param {string} mode - 'stars' (most starred) or 'updated' (recently updated)
 * @param {number} days - Days for date range (only for 'updated' mode)
 * @param {string} topic - Optional topic to filter by
 * @returns {Promise<Array>} Array of normalised repo objects
 */
async function fetchTrendingRepos(perPage = 10, mode = 'stars', days = 7, topic = 'all') {
  const token = process.env.GITHUB_TOKEN;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log(`[github] Searching repos with mode: ${mode}, days: ${days}, topic: ${topic}…`);

  const items = await searchRepos(headers, mode, days, perPage, topic);

  if (items.length === 0) {
    throw new Error(`GitHub Search returned no repositories for mode: ${mode}, topic: ${topic}`);
  }

  console.log(`[github] Found ${items.length} repos`);

  // Normalise to our app's shape
  return items.map((repo) => ({
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description || 'No description provided.',
    stars: repo.stargazers_count,
    language: repo.language || 'Unknown',
    url: repo.html_url,
    forks: repo.forks_count,
    watchers: repo.watchers_count,
    openIssues: repo.open_issues_count,
    license: repo.license?.name || 'Unknown',
    homepage: repo.homepage || 'N/A',
  }));
}

module.exports = { fetchTrendingRepos };
