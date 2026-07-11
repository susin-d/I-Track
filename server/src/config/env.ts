import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/itrack",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://opencode.ai/zen/v1",
  openaiModel: process.env.OPENAI_MODEL,
};
