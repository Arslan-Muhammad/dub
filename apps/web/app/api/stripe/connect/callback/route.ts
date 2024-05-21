import { prismaEdge } from "@/lib/prisma/edge";
import { redis } from "@/lib/upstash";
import z from "@/lib/zod";
import { APP_DOMAIN, getSearchParams } from "@dub/utils";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export const runtime = "edge";

const schema = z.object({
  state: z.string(),
  stripe_user_id: z.string(),
});

export const GET = async (req: NextRequest) => {
  const parsed = schema.safeParse(getSearchParams(req.url));

  if (!parsed.success) {
    console.error("[Stripe OAuth callback] Error", parsed.error);
    return new Response("Invalid request", { status: 400 });
  }

  const { state, stripe_user_id: stripeAccountId } = parsed.data;

  // Find workspace that initiated the Stripe app install
  const workspaceId = await redis.get(`stripe:install:state:${state}`);

  if (!workspaceId) {
    console.error("[Stripe OAuth callback] Invalid state", state);
    return new Response("Invalid request", { status: 400 });
  }

  // Delete the state key from Redis
  await redis.del(`stripe:install:state:${state}`);

  // Update the workspace with the Stripe Connect ID
  const workspace = await prismaEdge.project.update({
    where: {
      id: workspaceId as string,
    },
    data: {
      stripeConnectId: stripeAccountId,
    },
  });

  redirect(`${APP_DOMAIN}/${workspace.slug}/settings`);
};