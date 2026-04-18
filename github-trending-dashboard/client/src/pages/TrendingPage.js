import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiSearch, FiFilter, FiRefreshCw, FiStar, FiGitBranch, FiEye, FiTrendingUp } from 'react-icons/fi';
import toast from 'react-hot-toast';
import RepoCard from '../components/RepoCard';
import LoadingSpinner from '../components/LoadingSpinner';

const TrendingPage = () => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    language: '',
    timeRange: 'daily',
    minStars: '',
    sortBy: 'score'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const timeRanges = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' }
  ];

  const sortOptions = [
    { value: 'score', label: 'Trending Score' },
    { value: 'stars', label: 'Stars' },
    { value: 'forks', label: 'Forks' },
    { value: 'watchers', label: 'Watchers' },
    { value: 'created_at', label: 'Recently Created' }
  ];

  const fetchRepos = async (pageNum = 1, append = false) => {
    try {
      setLoading(true);
      
      // Map filters to backend query parameters
      const topic = filters.language || 'all';
      const mode = filters.sortBy === 'stars' ? 'stars' : 'updated';
      const days = filters.timeRange === 'daily' ? 1 : filters.timeRange === 'weekly' ? 7 : 30;

      const params = new URLSearchParams({
        topic,
        mode,
        days
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await axios.get(`http://localhost:3000/api/trending?${params}`);
      const newRepos = response.data.repos;

      if (append) {
        setRepos(prev => [...prev, ...newRepos]);
      } else {
        setRepos(newRepos);
      }

      setHasMore(newRepos.length >= 10);
    } catch (error) {
      toast.error('Failed to fetch repositories');
      console.error('Error fetching repos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos(1, false);
  }, [filters, searchTerm]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchRepos(1, false);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRepos(nextPage, true);
  };

  const handleRefresh = () => {
    setPage(1);
    fetchRepos(1, false);
    toast.success('Refreshed trending repositories');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Trending Repositories
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Discover the hottest projects on GitHub
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                <FiRefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <FiFilter className="w-4 h-4" />
                <span>Filters</span>
              </button>
            </form>

            {/* Filter Panel */}
            {showFilters && (
              <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Language
                    </label>
                    <select
                      value={filters.language}
                      onChange={(e) => handleFilterChange('language', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">All Languages</option>
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="cpp">C++</option>
                      <option value="c">C</option>
                      <option value="php">PHP</option>
                      <option value="ruby">Ruby</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Time Range
                    </label>
                    <select
                      value={filters.timeRange}
                      onChange={(e) => handleFilterChange('timeRange', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {timeRanges.map(range => (
                        <option key={range.value} value={range.value}>
                          {range.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Min Stars
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={filters.minStars}
                      onChange={(e) => handleFilterChange('minStars', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Sort By
                    </label>
                    <select
                      value={filters.sortBy}
                      onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {sortOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repository Grid */}
      <div className="container mx-auto px-4 py-8">
        {loading && repos.length === 0 ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {repos.map((repo) => (
                <RepoCard key={repo.id} repo={repo} />
              ))}
            </div>

            {repos.length === 0 && !loading && (
              <div className="text-center py-12">
                <FiTrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                  No repositories found
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Try adjusting your search or filters
                </p>
              </div>
            )}

            {hasMore && repos.length > 0 && (
              <div className="text-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TrendingPage;