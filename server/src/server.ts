import { createServer } from 'http';
import { createApp } from './app';
import { config } from './config';
import { initSocket } from './socket';

const app = createApp();
const httpServer = createServer(app);

initSocket(httpServer);

httpServer.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
