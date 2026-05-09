const { app, dialog } = require('electron');
const path = require('path');
const os = require('os');

app.whenReady().then(async () => {
  console.log("Ready");
  console.log(path.join(os.homedir(), '.local', 'bin', 'Scripts'));
  app.quit();
});
