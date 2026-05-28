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
      node_args: '--openssl-legacy-provider',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_file: '.env',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
