import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { FiStar, FiGitBranch, FiEye, FiExternalLink, FiCalendar, FiTrendingUp, FiDownload, FiUsers, FiCode, FiBook } from 'react-icons/fi';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';

const RepoDetailsPage = () => {
  const { owner, name } = useParams();
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readme, setReadme] = useState(null);

  useEffect(() => {
    fetchRepoDetails();
  }, [owner, name]);

  const fetchRepoDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/repos/${owner}/${name}`);
      setRepo(response.data.data.repo);

      // Try to fetch README
      try {
        const readmeResponse = await axios.get(`/api/repos/${owner}/${name}/readme`);
        setReadme(readmeResponse.data.data.readme);
      } catch (error) {
        // README not available, that's okay
      }
    } catch (error) {
      toast.error('Failed to fetch repository details');
      console.error('Error fetching repo details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLanguageColor = (language) => {
    const colors = {
      javascript: '#f1e05a',
      typescript: '#2b7489',
      python: '#3572A5',
      java: '#b07219',
      'c++': '#f34b7d',
      c: '#555555',
      'c#': '#239120',
      go: '#00ADD8',
      rust: '#dea584',
      php: '#4F5D95',
      ruby: '#701516',
      swift: '#ffac45',
      kotlin: '#F18E33',
      dart: '#00B4AB',
      html: '#e34c26',
      css: '#1572B6',
      shell: '#89e051',
      dockerfile: '#384d54',
      makefile: '#427819'
    };
    return colors[language?.toLowerCase()] || '#586069';
  };

  if (loading) {
    return <LoadingSpinner message="Loading repository details..." />;
  }

  if (!repo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Repository Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The repository {owner}/{name} could not be found.
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Back to Trending
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center space-x-4 mb-4">
            <Link
              to="/"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              ← Back to Trending
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {repo.owner}/{repo.name}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                {repo.description || 'No description available'}
              </p>

              {/* Topics */}
              {repo.topics && repo.topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {repo.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <a
              href={`https://github.com/${repo.owner}/${repo.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              <FiExternalLink className="w-4 h-4" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 mb-2">
                  <FiStar className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Stars</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(repo.stars)}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 mb-2">
                  <FiGitBranch className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Forks</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(repo.forks)}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 mb-2">
                  <FiEye className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Watchers</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(repo.watchers)}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 mb-2">
                  <FiTrendingUp className="w-5 h-5 text-purple-500" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Issues</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(repo.open_issues)}
                </div>
              </div>
            </div>

            {/* README */}
            {readme && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <FiBook className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">README</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div
                    className="prose prose-gray dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: readme }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Repository Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Repository Information
              </h3>

              <div className="space-y-4">
                {repo.language && (
                  <div className="flex items-center space-x-3">
                    <FiCode className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getLanguageColor(repo.language) }}
                      />
                      <span className="text-sm text-gray-900 dark:text-white">{repo.language}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <FiCalendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Created {formatDate(repo.created_at)}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <FiCalendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Updated {formatDate(repo.updated_at)}
                  </span>
                </div>

                {repo.license && (
                  <div className="flex items-center space-x-3">
                    <FiDownload className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      License: {repo.license}
                    </span>
                  </div>
                )}

                {repo.size && (
                  <div className="flex items-center space-x-3">
                    <FiDownload className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Size: {(repo.size / 1024).toFixed(1)} MB
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Growth Metrics */}
            {repo.growth_score && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Growth Metrics
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Growth Score</span>
                    <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {repo.growth_score.toFixed(1)}
                    </span>
                  </div>

                  {repo.star_velocity && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Star Velocity</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        +{formatNumber(repo.star_velocity)}/{repo.time_range}
                      </span>
                    </div>
                  )}

                  {repo.commit_frequency && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Commit Frequency</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {repo.commit_frequency}/week
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contributors */}
            {repo.contributors && repo.contributors.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Top Contributors
                </h3>

                <div className="space-y-3">
                  {repo.contributors.slice(0, 5).map((contributor) => (
                    <div key={contributor.username} className="flex items-center space-x-3">
                      <img
                        src={contributor.avatar_url}
                        alt={contributor.username}
                        className="w-8 h-8 rounded-full"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {contributor.username}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {formatNumber(contributor.contributions)} contributions
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepoDetailsPage;