import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { priceRouter, optionsRouter, portfolioRouter, strategiesRouter, marketRouter } from './routes/index.js';
import { state } from './state.js';
import { WsPriceUpdate } from './types.js';

export interface ServerConfig {
  port?: number;
  cors?: cors.CorsOptions;
  enableWebSocket?: boolean;
  priceUpdateInterval?: number;
}

export class OptiChannelServer {
  private app: Express;
  private httpServer: HttpServer;
  private wss: WebSocketServer | null = null;
  private priceInterval: NodeJS.Timeout | null = null;
  private config: Required<ServerConfig>;

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: config.port || 3000,
      cors: config.cors || { origin: '*' },
      enableWebSocket: config.enableWebSocket ?? true,
      priceUpdateInterval: config.priceUpdateInterval || 5000,
    };

    this.app = express();
    this.httpServer = createServer(this.app);

    this.setupMiddleware();
    this.setupRoutes();

    if (this.config.enableWebSocket) {
      this.setupWebSocket();
    }
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors(this.config.cors));

    // JSON body parser
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: '0.1.0',
      });
    });

    // API info
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'OptiChannel API',
        version: '0.1.0',
        description: 'Gasless options trading protocol API',
        endpoints: {
          price: '/api/price',
          options: '/api/options',
          portfolio: '/api/portfolio',
          strategies: '/api/strategies',
          market: '/api/market',
        },
        websocket: this.config.enableWebSocket ? `ws://localhost:${this.config.port}` : null,
      });
    });

    // Mount routers
    this.app.use('/api/price', priceRouter);
    this.app.use('/api/options', optionsRouter);
    this.app.use('/api/portfolio', portfolioRouter);
    this.app.use('/api/strategies', strategiesRouter);
    this.app.use('/api/market', marketRouter);

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Not found',
        timestamp: Date.now(),
      });
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[API Error]', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error',
        timestamp: Date.now(),
      });
    });
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] Client connected');

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('[WS] Received:', data);

          // Handle subscription messages
          if (data.type === 'subscribe') {
            // For now, all clients get all updates
            ws.send(JSON.stringify({
              type: 'subscribed',
              channel: data.channel,
              timestamp: Date.now(),
            }));
          }
        } catch {
          console.log('[WS] Invalid message received');
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('[WS] Error:', error);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to OptiChannel WebSocket',
        timestamp: Date.now(),
      }));
    });

    // Start price broadcast
    this.startPriceBroadcast();
  }

  private startPriceBroadcast(): void {
    this.priceInterval = setInterval(async () => {
      if (!this.wss || this.wss.clients.size === 0) return;

      try {
        const priceData = await state.pythClient.getEthUsdPrice();

        const message: WsPriceUpdate = {
          type: 'price_update',
          data: {
            symbol: 'ETH/USD',
            price: priceData.price,
            confidence: priceData.confidence,
            publishTime: priceData.publishTime.toISOString(),
          },
          timestamp: Date.now(),
        };

        const payload = JSON.stringify(message);

        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      } catch (error) {
        console.error('[WS] Price broadcast error:', error);
      }
    }, this.config.priceUpdateInterval);
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: object): void {
    if (!this.wss) return;

    const payload = JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log('  OPTICHANNEL API SERVER');
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`  REST API:    http://localhost:${this.config.port}/api`);
        console.log(`  Health:      http://localhost:${this.config.port}/health`);
        if (this.config.enableWebSocket) {
          console.log(`  WebSocket:   ws://localhost:${this.config.port}`);
        }
        console.log('═══════════════════════════════════════════════════════════════════\n');
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.priceInterval) {
      clearInterval(this.priceInterval);
    }

    if (this.wss) {
      this.wss.close();
    }

    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get the Express app (for testing)
   */
  getApp(): Express {
    return this.app;
  }
}

// Export a default instance
export const server = new OptiChannelServer();
