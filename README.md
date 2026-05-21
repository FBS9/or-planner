# OR Planner PWA with Supabase Cloud Sync

This is the installable PWA version of your OR Planner.

## Supabase is already configured in `.env`

```env
VITE_SUPABASE_URL=https://acwqjmhhycbcchlepnd.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_M0tD1i1IcIp5m0lmMlc4Fw_0t4vbv4j
```

This uses the publishable key only. Do not add your Supabase secret key to this project.

## Local test

```bash
npm install
npm run dev
```

Open the local URL Vite gives you.

## Deploy to Vercel

1. Go to Vercel.
2. Create a new project.
3. Upload/import this project.
4. Add these environment variables in Vercel Project Settings > Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## Add to iPhone/iPad Home Screen

1. Open your deployed app link in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Name it OR Planner.

## Cloud Sync workflow

- Create Account or Sign In from the Cloud Sync card.
- On the device with your newest data, tap Save to Cloud.
- On another device, sign in and tap Pull from Cloud.

Manual save/pull is intentional so one device does not accidentally overwrite another device.
