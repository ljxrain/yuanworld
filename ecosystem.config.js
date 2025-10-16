module.exports = {
  apps: [{
    name: 'yuan-world-app',
    script: './server/index.js',
    cwd: '/opt/yuan_world',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080,
      JWT_SECRET: 'yuanworld_secret_key_2024_very_secure_random_string',
      JWT_EXPIRE: '7d',
      DB_HOST: 'localhost',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres',
      DB_NAME: 'yuan_world',
      DB_PORT: 5432,
      LAOZHANG_API_KEY: 'sk-NyROY2ZdW7yOdgmJDc57Cb204eB448CbA8B0Cd476849F165',
      LAOZHANG_API_URL: 'https://api-cf.laozhang.ai/v1/chat/completions'
    }
  }]
};
