const { app, screen } = require('electron');
app.whenReady().then(() => {
  console.log(screen.getCursorScreenPoint());
  app.quit();
});
