# Greens Journal

A private trading calendar hosted free with GitHub Pages and Supabase.

## One-time Supabase setup

1. Open the Supabase SQL Editor and run `supabase/schema.sql`.
2. In Authentication → URL Configuration, set the Site URL to `https://kennedygiftgreen.github.io/greens-journal/` and add the same URL as a redirect URL.
3. Copy the Project URL and publishable/anon key from Project Settings → API.
4. In this GitHub repository, open Settings → Secrets and variables → Actions and create:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Open Settings → Pages and select **GitHub Actions** as the source.
6. Re-run the **Deploy Greens Journal** workflow.

Never place a Supabase `service_role` or secret key in this repository. The publishable/anon key is intended for browser apps; row-level security in `schema.sql` protects trade data.
