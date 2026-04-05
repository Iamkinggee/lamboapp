module.exports = {
  apps: [
    {
      name: 'signal-engine',
      script: '/home/ubuntu/lamboapp/services/signal-engine/main.py',
      interpreter: '/home/ubuntu/lamboapp/services/signal-engine/venv/bin/python3',
      cwd: '/home/ubuntu/lamboapp/services/signal-engine',
      env: {
        REDIS_URL: 'redis://localhost:6379',
        BACKEND_URL: 'http://localhost:3001',
        AI_SERVICE_URL: 'http://localhost:8001',
        MIN_RR: '2.0',
        CONFIDENCE_THRESHOLD: '65',
        SIGNAL_COOLDOWN_SEC: '60',
        SEED_CONCURRENCY: '20'
      },
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
};
