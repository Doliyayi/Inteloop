import "server-only";

import { createBraveClient } from "../integrations/brave";
import { createFirecrawlClient } from "../integrations/firecrawl";
import { createReportGenerator } from "../reports/generator";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { BattlecardDeps } from "./workflow";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export function buildBattlecardDeps(): BattlecardDeps {
  return {
    supabase: createSupabaseAdminClient(),
    firecrawl: createFirecrawlClient({ apiKey: required("FIRECRAWL_API_KEY") }),
    brave: createBraveClient({ apiKey: required("BRAVE_SEARCH_API_KEY") }),
    generator: createReportGenerator({ apiKey: required("ANTHROPIC_API_KEY") }),
  };
}
