import { z } from "zod"

const BackendSchema = z.enum(["web", "nest"]).default("web")

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  INGESTION_BACKEND: BackendSchema,
  USER_BACKEND: BackendSchema,
  CHAT_HISTORY_BACKEND: BackendSchema,
  CHAT_BACKEND: BackendSchema,
  FEEDBACK_BACKEND: BackendSchema,
  DOCUMENTS_BACKEND: BackendSchema,
})

export type Environment = z.infer<typeof EnvironmentSchema>

export function parseEnvironment(environment: Record<string, string | undefined>): Environment {
  return EnvironmentSchema.parse(environment)
}
