import React from 'react';
import { Link } from 'react-router-dom';
import { FiStar, FiGitBranch, FiEye, FiTrendingUp, FiExternalLink, FiCalendar } from 'react-icons/fi';

const RepoCard = ({ repo }) => {
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
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <Link
              to={`/repo/${repo.owner}/${repo.name}`}
              className="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate"
            >
              {repo.owner}/{repo.name}
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {repo.description || 'No description available'}
            </p>
          </div>
          <a
            href={`https://github.com/${repo.owner}/${repo.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <FiExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Language and Topics */}
        <div className="flex items-center space-x-4 mb-4">
          {repo.language && (
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getLanguageColor(repo.language) }}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {repo.language}
              </span>
            </div>
          )}
          {repo.topics && repo.topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {repo.topics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
                >
                  {topic}
                </span>
              ))}
              {repo.topics.length > 3 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{repo.topics.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <FiStar className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(repo.stars)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <FiGitBranch className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(repo.forks)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <FiEye className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(repo.watchers)}
            </span>
          </div>
        </div>

        {/* Growth Metrics */}
        {repo.growth_score && (
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div className="flex items-center space-x-2">
              <FiTrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Growth Score: {repo.growth_score.toFixed(1)}
              </span>
            </div>
            {repo.star_velocity && (
              <span className="text-xs text-gray-600 dark:text-gray-400">
                +{formatNumber(repo.star_velocity)} stars/{repo.time_range}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <FiCalendar className="w-3 h-3" />
            <span>Updated {formatDate(repo.updated_at)}</span>
          </div>
          {repo.license && (
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-600 rounded text-xs">
              {repo.license}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default RepoCard;