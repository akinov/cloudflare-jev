import { createFactory } from 'hono/factory'

export type AppEnv = { Bindings: CloudflareBindings }

export const factory = createFactory<AppEnv>()
