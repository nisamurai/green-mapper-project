import asyncio
import json
import logging
import os

import aio_pika
from pamqp import commands as spec
from .handle_issue_created import handle_issue_created

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

class RabbitMQClient:
    def __init__(self):
        self.connection: aio_pika.abc.AbstractRobustConnection | None = None
        self.channel: aio_pika.abc.AbstractRobustChannel | None = None
        self.is_consuming = False
        
        self.user = os.getenv("RABBITMQ_USER")
        self.password = os.getenv("RABBITMQ_PASSWORD")
        self.host = "rabbitmq" if os.getenv("IN_CONTAINER") else "localhost"
        self.url = f"amqp://{self.user}:{self.password}@{self.host}:5672"
    
    async def connect(self):
        try:
            self.connection = await aio_pika.connect_robust(self.url, reconnect_interval=5)
            self.channel = await self.connection.channel()
            
            logger.info("Connected to RabbitMQ")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise
    
    async def consume_issues(self, callback):
        """Consume messages from issue.created queue"""
        # Backend declares the queue. Wait until it exists; a missing queue closes the channel.
        queue = None
        while queue is None:
            try:
                if not self.connection:
                    raise Exception("Connection not available")
                if not self.channel or self.channel.is_closed:
                    self.channel = await self.connection.channel()
                queue = await self.channel.get_queue("issue.created.queue")
            except Exception as e:
                logger.warning("issue.created.queue is not ready yet: %s", e)
                self.channel = None
                await asyncio.sleep(5)
        
        self.is_consuming = True
        
        async def on_message(message: aio_pika.IncomingMessage):
            headers = message.headers or {}
            retry_count = headers.get("x-retry-count", 0)
            max_retries = 3
            
            try:
                body = json.loads(message.body.decode())
                logger.info(f"Received message: {body} (retry {retry_count}/{max_retries})")
                await callback(body, message)  # Pass both
                await message.ack()
                
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                
                if retry_count < max_retries:
                    logger.warning(f"Moving message to retry queue ({retry_count + 1}/{max_retries})")

                    if not self.channel:
                        raise Exception("Channel not available")

                    A = await message.channel.basic_publish(
                            body=message.body,
                            
                            properties= spec.Basic.Properties(headers={"x-retry-count": retry_count + 1}, delivery_mode=2),
                            routing_key="issue.created.retry",
                        ),
                    await message.ack()
                    
                else:
                    logger.critical("Max retries exceeded, sending to DLQ")
                    await message.reject(requeue=False)
        
        await queue.consume(on_message)
        logger.info("Started consuming issue.created messages")
        
        while self.is_consuming:
            await asyncio.sleep(1)
    
    async def close(self):
        self.is_consuming = False
        if self.connection:
            await self.connection.close()
            logger.info("RabbitMQ connection closed")

async def main():
    logger.info("waiting for brocker startup")
    await asyncio.sleep(float(os.getenv("RABBITMQ_DELAY_SECONDS", "0")))
    logger.info("attempt to connect")
    client = RabbitMQClient()
    
    try:
        await client.connect()
        
        # Start consuming
        asyncio.create_task(client.consume_issues(handle_issue_created))
        
        # Keep running
        await asyncio.Event().wait()
        
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())