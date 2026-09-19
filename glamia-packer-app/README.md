# Glamia Packing App

Separate Expo/React Native app for the Glamia packing team.

## What it does

- Employee ID + password login.
- Secure session storage using `expo-secure-store`.
- Unpacked order queue with automatic refresh every 30 seconds.
- Full order detail view for packing: items, sizes, colourways, quantities, and shipping address.
- Atomic **Mark packed** action. It does not mark an order shipped.
- Packed orders can be reviewed from the Packed tab.

## Run locally

From this directory:

```bash
npm install
npx expo start
```

The app uses `https://glamiastore.com` by default. For a local Worker, set the API URL before starting Expo:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.10:8787"
npx expo start
```

Use the computer's LAN IP on a physical phone; `127.0.0.1` points back to the phone itself.

Employees must be created by an admin under **Admin → Employees** in the website. The password is never returned by the API or shown again after creation, so share it securely and use the admin reset control when needed.

Push notifications are intentionally not included in this first version. The queue polls safely every 30 seconds; push delivery can be added later with Expo Notifications after the workflow is validated.
