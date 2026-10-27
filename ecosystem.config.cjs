module.exports = {
  apps: [
    {
      name: 'adam-ar',
      script: 'dist/server.cjs',
      instances: 1, // Single instance required for SQLite WAL lock safety
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '4G',
      exp_backoff_restart_delay: 100,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-err.log',
      out_file: './logs/pm2-out.log',
    },
  ],
};
