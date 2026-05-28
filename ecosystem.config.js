module.exports = {
  apps: [
    {
      name: 'servio-backend',
      script: './apps/backend/dist/server.js',
      cwd: '/opt/servio',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NODE_OPTIONS: '--openssl-legacy-provider',
      },
      env_file: '.env',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
