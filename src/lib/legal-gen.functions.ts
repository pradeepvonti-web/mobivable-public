/**
 * Legal Document Generator — server-side AI function
 *
 * Generates Privacy Policy or Terms of Use via AI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callAI } from "./ai-provider";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateLegalDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      type: z.enum(["privacy", "terms"]),
      appName: z.string().max(200),
      dataCollected: z.array(z.string()).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { type, appName, dataCollected } = data;

    let system: string;
    let user: string;

    if (type === "privacy") {
      system = "You are a legal document generator for mobile apps. Generate a professional, clear, and comprehensive Privacy Policy. Use markdown formatting with headings (##). Do NOT use code fences.";
      user = `Generate a Privacy Policy for a mobile app called "${appName}".
The app collects the following data: ${dataCollected.length ? dataCollected.join(", ") : "No specific data collection selected"}.

Include these sections:
## Privacy Policy for ${appName}
## Information We Collect
## How We Use Your Information
## Data Sharing and Disclosure
## Data Security
## Your Rights and Choices
## Children's Privacy
## Changes to This Privacy Policy
## Contact Us

Use placeholder company name "[Company Name]" and email "[contact@email.com]".
Make it professional, clear, and readable. Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`;
    } else {
      system = "You are a legal document generator for mobile apps. Generate professional, clear, and comprehensive Terms of Use / Terms of Service. Use markdown formatting with headings (##). Do NOT use code fences.";
      user = `Generate Terms of Use for a mobile app called "${appName}".

Include these sections:
## Terms of Use for ${appName}
## Acceptance of Terms
## User Accounts
## Acceptable Use Policy
## Intellectual Property
## User-Generated Content
## Limitation of Liability
## Disclaimer of Warranties
## Termination
## Governing Law
## Changes to These Terms
## Contact Information

Use placeholder company name "[Company Name]" and email "[contact@email.com]".
Make it professional, clear, and readable. Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`;
    }

    const result = await callAI(system, user);
    if (!result.ok) throw new Error(result.error);
    return { text: result.text };
  });
