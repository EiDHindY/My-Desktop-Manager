const { app, dialog } = require('electron');
const path = require('path');
const os = require('os');

app.whenReady().then(async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: path.join(os.homedir(), '.local', 'bin', 'Scripts') + '/'
  });
  console.log(result);
  app.quit();
});
