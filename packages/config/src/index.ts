import { z } from "zod"

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
})

export type Environment = z.infer<typeof EnvironmentSchema>

export function parseEnvironment(environment: Record<string, string | undefined>): Environment {
  return EnvironmentSchema.parse(environment)
}
