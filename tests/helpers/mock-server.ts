import express, { Request, Response } from 'express';
import { Server } from 'http';
import { PushRequest, PushResponse } from '../../src/models/types';

export interface MockServerOptions {
  port: number;
  authToken?: string;
  delay?: number;
}

export class MockPushServer {
  private app: express.Application;
  private server: Server | null = null;
  private requests: PushRequest[] = [];
  private responseQueue: Array<PushResponse | { status: number; body: any }> = [];
  private defaultResponse: Partial<PushResponse> | null = null;
  private options: MockServerOptions;

  constructor(options: MockServerOptions) {
    this.options = options;
    this.app = express();
    this.app.use(express.json({ limit: '10mb' }));
    
    this.app.post('/v1/usage/push', async (req: Request, res: Response) => {
      // Simulate network delay
      if (this.options.delay) {
        await new Promise(resolve => setTimeout(resolve, this.options.delay));
      }

      // Check authentication
      const authHeader = req.headers.authorization;
      if (this.options.authToken) {
        if (!authHeader || authHeader !== `Bearer ${this.options.authToken}`) {
          return res.status(401).json({ message: 'Unauthorized' });
        }
      }

      const request = req.body as PushRequest;
      this.requests.push(request);

      // Get response from queue or use default
      const response = this.responseQueue.shift() || this.buildDefaultResponse(request);

      if ('status' in response) {
        return res.status(response.status).json(response.body);
      }

      return res.json(response);
    });

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      return res.json({ status: 'ok' });
    });
  }

  private buildDefaultResponse(request: PushRequest): PushResponse {
    const base: PushResponse = {
      batchId: request.batchId,
      results: {
        persisted: {
          count: request.messages.length,
          messageIds: request.messages.map(m => m.uuid)
        },
        deduplicated: {
          count: 0,
          messageIds: []
        },
        failed: {
          count: 0,
          details: []
        }
      },
      summary: {
        totalMessages: request.messages.length,
        messagesSucceeded: request.messages.length,
        messagesFailed: 0,
        entitiesCreated: {
          users: Object.keys(request.entities.users).length,
          machines: Object.keys(request.entities.machines).length,
          projects: Object.keys(request.entities.projects).length,
          sessions: Object.keys(request.entities.sessions).length
        },
        aggregatesUpdated: true,
        processingTimeMs: 100
      }
    };

    if (this.defaultResponse) {
      return { ...base, ...this.defaultResponse };
    }

    return base;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, () => resolve())
        .on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // Configuration methods
  setDefaultResponse(response: Partial<PushResponse>): void {
    this.defaultResponse = response;
  }

  queueResponse(response: PushResponse | { status: number; body: any }): void {
    this.responseQueue.push(response);
  }

  queueError(status: number, message: string): void {
    this.responseQueue.push({
      status,
      body: { message }
    });
  }

  queuePartialSuccess(total: number, succeeded: number): void {
    const failed = total - succeeded;
    const response: PushResponse = {
      batchId: 'test-batch',
      results: {
        persisted: {
          count: succeeded,
          messageIds: Array.from({ length: succeeded }, (_, i) => `msg${i}`)
        },
        deduplicated: {
          count: 0,
          messageIds: []
        },
        failed: {
          count: failed,
          details: Array.from({ length: failed }, (_, i) => ({
            messageId: `msg${succeeded + i}`,
            error: 'Validation error'
          }))
        }
      },
      summary: {
        totalMessages: total,
        messagesSucceeded: succeeded,
        messagesFailed: failed,
        entitiesCreated: { users: 0, machines: 0, projects: 0, sessions: 0 },
        aggregatesUpdated: false,
        processingTimeMs: 50
      }
    };
    this.responseQueue.push(response);
  }

  // Query methods
  getRequests(): PushRequest[] {
    return [...this.requests];
  }

  getLastRequest(): PushRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  getRequestCount(): number {
    return this.requests.length;
  }

  getTotalMessagesReceived(): number {
    return this.requests.reduce((sum, req) => sum + req.messages.length, 0);
  }

  reset(): void {
    this.requests = [];
    this.responseQueue = [];
    this.defaultResponse = null;
  }
}

// Helper function to create test configuration
export function createTestConfig(port: number, overrides?: any): any {
  return {
    database: {
      path: './prisma/test.db'
    },
    claudeCode: {
      rawDataPath: './test_data',
      pricingUrl: 'https://example.com/pricing',
      pricingCacheTimeout: 0,
      cacheDurationDefault: 5,
      batchSize: 100
    },
    push: {
      endpoint: `http://localhost:${port}/v1/usage/push`,
      apiToken: 'test-token',
      batchSize: 10,
      maxRetries: 3,
      timeout: 5000
    },
    watch: {
      pollInterval: 1000,
      ignored: []
    },
    logging: {
      level: 'error'
    },
    ...overrides
  };
}