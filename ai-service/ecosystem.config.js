module.exports = {
  apps: [
    // === 1. Python Worker (Tanpa Jendela CMD) ===
    {
      name: "queue-consumer",
      script: "D:\\sivalidrg\\ai-service\\venv\\Scripts\\pythonw.exe", // ganti sesuai hasil 'where pythonw'
      args: "-m app.worker.queue_consumer",
      cwd: "D:\\sivalidrg\\ai-service",
      interpreter: "", // pastikan PM2 tidak menimpa interpreter
      autorestart: true,
      watch: false,
      max_restarts: 5,
      windowsHide: true, // sembunyikan jendela CMD sepenuhnya
      out_file: "D:\\sivalidrg\\ai-service\\logs\\queue-consumer-out.log",
      error_file: "D:\\sivalidrg\\ai-service\\logs\\queue-consumer-error.log",
      env: {
        PYTHONUNBUFFERED: "1",
        ENV: "production",
      },
    },

    // === 2. Uvicorn Web Server ===
    {
      name: "uvicorn-app",
      script: "cmd",
      args: "/c uvicorn app.main:app --reload --host 0.0.0.0 --port 8000",
      cwd: "D:\\sivalidrg\\ai-service",
      autorestart: true,
      watch: ["app"],
      max_restarts: 5,
      windowsHide: true, // agar tidak muncul jendela juga
      out_file: "D:\\sivalidrg\\ai-service\\logs\\uvicorn-out.log",
      error_file: "D:\\sivalidrg\\ai-service\\logs\\uvicorn-error.log",
      env: {
        ENV: "development",
      },
    },
  ],
};
