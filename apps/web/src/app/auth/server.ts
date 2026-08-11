import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {}
        },
      },
    },
  );

  return client;
}

export async function getUser() {
  const { auth } = await createClient();

  const userObject = await auth.getUser();

  if (userObject.error) {
    console.error(userObject.error);
    return null;
  }

  return userObject.data.user;
}

export async function getAccessToken() {
  const client = await createClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error(error);
    return null;
  }

  return data.session?.access_token ?? null;
}
