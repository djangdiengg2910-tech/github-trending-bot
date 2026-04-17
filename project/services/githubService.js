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
 * Search GitHub repos created since `sinceDate`, sorted by stars.
 * @param {object} headers
 * @param {string} sinceDate - ISO date string YYYY-MM-DD
 * @param {number} perPage
 * @returns {Promise<Array>} raw items from GitHub
 */
async function searchRepos(headers, sinceDate, perPage) {
  const response = await axios.get(`${GITHUB_API_BASE}/search/repositories`, {
    headers,
    params: {
      q: `created:>${sinceDate}`,
      sort: 'stars',
      order: 'desc',
      per_page: perPage,
    },
    timeout: 15000,
  });
  return response.data.items || [];
}

/**
 * Fetch trending repositories with smart date fallback.
 * Tries: today → last 7 days → last 30 days until results are found.
 * @param {number} perPage - Number of repos to return
 * @returns {Promise<Array>} Array of normalised repo objects
 */
async function fetchTrendingRepos(perPage = 10) {
  const token = process.env.GITHUB_TOKEN;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Date windows to try: today, 7 days, 30 days
  const windows = [
    { label: 'today', daysAgo: 0 },
    { label: 'last 7 days', daysAgo: 7 },
    { label: 'last 30 days', daysAgo: 30 },
  ];

  let items = [];
  for (const window of windows) {
    const sinceDate = getDateDaysAgo(window.daysAgo);
    console.log(`[github] Searching repos created since ${sinceDate} (${window.label})…`);
    items = await searchRepos(headers, sinceDate, perPage);
    if (items.length > 0) {
      console.log(`[github] Found ${items.length} repos using window: ${window.label}`);
      break;
    }
    console.log(`[github] No results for ${window.label}, trying wider window…`);
  }

  if (items.length === 0) {
    throw new Error('GitHub Search returned no repositories for any time window.');
  }

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
