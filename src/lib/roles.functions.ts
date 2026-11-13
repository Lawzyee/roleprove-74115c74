import { createServerFn } from "@tanstack/react-start";

// Public role catalogue (id + name only) for the signup selector.
export const listPublicRolesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("roles").select("id, name").order("created_at");
  if (error) throw new Error("Could not load roles");
  return data ?? [];
});
