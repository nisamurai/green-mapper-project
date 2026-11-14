import amqp, { ChannelModel, ConfirmChannel } from "amqplib";
import crypto from "crypto";

class RabbitMQService {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private isConnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly url: string;

  private readonly maxPublishRetries = 5;
  private readonly baseRetryDelayMs = 200;

  constructor() {
    this.url =
      "amqp://" +
      `${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}` +
      `@${process.env.IN_CONTAINER ? "rabbitmq" : "localhost"}` +
      ":5672";
  }

  async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.url);

      this.channel = await this.connection.createConfirmChannel();

      this.connection.on("error", (error) => {
        console.error("RabbitMQ connection error:", error);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
        }

        this.connection = null;
        this.channel = null;
        this.isConnecting = false;

        this.reconnectTimer = setTimeout(() => {
          console.log("Attempting to reconnect to RabbitMQ...");
          this.connect();
        }, 5000);
      });

      await this.setupExchangeAndQueue();

      console.log("Connected to RabbitMQ");
    } catch (error) {
      console.error("Failed to connect to RabbitMQ:", error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async setupExchangeAndQueue() {
    if (!this.channel) throw new Error("channel unaccessable");

    // Declare main exchange
    await this.channel.assertExchange("issues.exchange", "topic", {
      durable: true,
    });

    // Declare Dead Letter Exchange
    await this.channel.assertExchange("issues.dlx", "topic", {
      durable: true,
    });

    // Main queue with DLQ configuration
    await this.channel.assertQueue("issue.created.queue", {
      durable: true,
      arguments: {
        // "x-queue-type": "quorum"
        "x-dead-letter-exchange": "issues.dlx",
        "x-dead-letter-routing-key": "issue.created.dead",
      },
    });

    // Bind main queue to exchange
    await this.channel.bindQueue(
      "issue.created.queue",
      "issues.exchange",
      "issue.created",
    );

    // Dead Letter Queue
    await this.channel.assertQueue("issue.created.dlq", {
      durable: true,
      // arguments: {"x-queue-type": "quorum"}
    });

    // Bind DLQ to Dead Letter Exchange
    await this.channel.bindQueue(
      "issue.created.dlq",
      "issues.dlx",
      "issue.created.dead",
    );

    // Retry queue (consumer-side retry mechanism)
    await this.channel.assertQueue("issue.created.retry", {
      durable: true,
      arguments: {
        // "x-queue-type": "quorum"
        "x-dead-letter-exchange": "issues.exchange",
        "x-dead-letter-routing-key": "issue.created",
        "x-message-ttl": 5000,
        "x-max-length": 10000,
      },
    });
  }

  async notifyIssueCreated<T extends { issueId: number; createdAt: Date }>(
    issueData: T,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ channel not available");
    }

    const message = {
      issueId: issueData.issueId,
      timestamp: issueData.createdAt,
      messageId: crypto.randomUUID(),
    };

    await this.publishWithRetry(message);
  }

  private async publishWithRetry(
    message: { issueId: number; timestamp: Date; messageId: string },
    attempt: number = 0,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ channel not available");
    }

    const payload = Buffer.from(JSON.stringify(message));

    try {
      const ok = this.channel.publish(
        "issues.exchange",
        "issue.created",
        payload,
        {
          persistent: true,
          messageId: message.messageId,
        },
      );

      if (!ok) {
        await new Promise<void>((resolve) =>
          this.channel!.once("drain", resolve),
        );
      }

      await this.channel.waitForConfirms();

      console.log(
        `Issue ${message.issueId} notification published and confirmed ` +
          `(messageId: ${message.messageId})`,
      );
    } catch (err) {
      if (attempt >= this.maxPublishRetries) {
        console.error(
          `Publish failed after ${this.maxPublishRetries} retries. ` +
            `MessageId: ${message.messageId}`,
          err,
        );
        throw err;
      }

      const delay = this.baseRetryDelayMs * 2 ** attempt;
      console.warn(
        `Publish attempt ${attempt + 1} failed. Retrying in ${delay}ms...`,
        err,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      await this.publishWithRetry(message, attempt + 1);
    }
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.connection = null;
    this.channel = null;
  }
}

export const rabbitMQ = new RabbitMQService();
