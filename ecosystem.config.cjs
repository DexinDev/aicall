module.exports = {
  apps: [
    {
      name: 'aicall',
      script: 'app.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
