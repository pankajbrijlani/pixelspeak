import { auth } from "@/lib/auth";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) {
    throw new Error("Not authenticated");
  }
  return id;
}
