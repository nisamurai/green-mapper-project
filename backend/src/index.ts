import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import * as Minio from "minio";
export const minioClient = new Minio.Client({ endPoint: process.env.IN_CONTAINER ? "minio" : "localhost", port: 9000, useSSL: false, accessKey: process.env.MINIO_ROOT_USER, secretKey: process.env.MINIO_ROOT_PASSWORD });
const app = new Elysia().use(cors({origin:(process.env.CORS_ORIGIN || "").split(","),credentials:true})).get("/health", () => ({status:"ok"})).listen({hostname:"0.0.0.0",port:3000});
