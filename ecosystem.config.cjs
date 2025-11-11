module.exports = {
  apps: [
    {
      name: 'muckrack-profiles-scraper',
      script: './src/multilogin-scraper.js',
      args: '--fresh --headless',
      instances: 1,
      autorestart: false, // Don't restart after normal completion (prevents infinite loop)
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/profiles-error.log',
      out_file: './logs/profiles-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // Restart configuration
      exp_backoff_restart_delay: 100, // Exponential backoff for crash restarts
      // Stop gracefully
      kill_timeout: 30000, // Give 30s for graceful shutdown
      wait_ready: false,
    },
    {
      name: 'muckrack-outlets-scraper',
      script: './src/multilogin-outlet-scraper.js',
      args: '--fresh --headless',
      instances: 1,
      autorestart: false, // Don't restart after normal completion (prevents infinite loop)
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/outlets-error.log',
      out_file: './logs/outlets-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      exp_backoff_restart_delay: 100,
      kill_timeout: 30000,
      wait_ready: false,
    },
  ],
};
