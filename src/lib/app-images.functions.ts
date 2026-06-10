import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateAppImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        screenId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { runAppImagesInternal } = await import("./app-images.server");
    return runAppImagesInternal({
      supabase: context.supabase,
      userId: context.userId,
      projectId: data.projectId,
      screenId: data.screenId,
    });
  });
