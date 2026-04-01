import "server-only";

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const serverEnv = {
  OPENAI_API_KEY: getOptionalEnv("OPENAI_API_KEY"),
  UPSTASH_REDIS_REST_URL: getOptionalEnv("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: getOptionalEnv("UPSTASH_REDIS_REST_TOKEN")
};

export function requireServerEnv(name: keyof typeof serverEnv): string {
  const value = serverEnv[name];
  if (!value) {
    throw new Error(`${name} is not configured on the server.`);
  }
  return value;
}
