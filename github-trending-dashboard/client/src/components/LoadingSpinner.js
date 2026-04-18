import React from 'react';

const LoadingSpinner = ({ size = 'md', message = 'Loading...' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className={`${sizeClasses[size]} border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full animate-spin mb-4`} />
      {message && (
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {message}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;