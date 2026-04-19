// pm2 ecosystem file — loaded by `pm2 startOrReload ecosystem.config.cjs`.
// If pm2 isn't installed, scripts/start-prod.sh is used as a fallback.
//
// Install pm2 once in your $HOME (no sudo needed):
//     npm config set prefix "$HOME/.npm-global"
//     export PATH="$HOME/.npm-global/bin:$PATH"
//     npm i -g pm2
//     pm2 startup   # prints a command — if it needs sudo you can skip it
//                   # and rely on a @reboot crontab instead (see docs/DEPLOY.md)
//     pm2 save

module.exports = {
  apps: [
    {
      name: 'coc',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 7878 -H 0.0.0.0',
      node_args: '--env-file-if-exists=.env.local',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      out_file: './prod.log',
      error_file: './prod.log',
      time: true,
    },
  ],
};
