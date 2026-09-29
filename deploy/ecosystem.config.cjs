// PM2 keeps the web app and the worker running on the server, and restarts them if they stop.
// Used by deploy/deploy.sh. Both read their settings from the .env file in the app folder.
module.exports = {
  apps: [
    {
      name: "moca-web",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      // Only reachable from the server itself; Nginx passes visitors on to it.
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production", TZ: "Europe/London" },
      max_memory_restart: "1G",
      time: true,
    },
    {
      name: "moca-worker",
      cwd: __dirname + "/..",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "worker/index.ts",
      env: { NODE_ENV: "production", TZ: "Europe/London" },
      max_memory_restart: "768M",
      // Give running jobs time to finish before a restart.
      kill_timeout: 25000,
      time: true,
    },
  ],
};
