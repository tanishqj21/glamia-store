# Glamia Store

The consumer shopping app for Glamia customers in India. It is a separate Expo/React Native project from the employee packing app and uses the website Worker as its source of truth.

## Included

- Fixed Glamia visual theme matching the storefront; there is no colour-palette picker.
- Uses the same Glamia logo as the website favicon for the app icon and Android adaptive icon.
- Google sign-in with website profile completion fields.
- iOS-only Sign in with Apple, with the Apple identity linked to the same shopper account.
- Website-managed hero carousel and live product catalog.
- Browse, search, product details, sizes, bag, addresses, coupons, and payment handoff.
- Razorpay checkout in the native WebView and PhonePe checkout handoff.
- Orders, cancellation, delivery tracking, returns/exchanges, invoice links, and Buy Again.
- Website terms, privacy, shipping, returns, and support links.
- Notification centre for announcements and order updates, with Expo push registration ready for the Worker notification endpoints.

## Run locally

```powershell
npm install
$env:EXPO_PUBLIC_API_URL = "https://glamiastore.com"
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "your-web-client-id"
$env:EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = "your-android-client-id"
$env:EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "your-ios-client-id"
$env:EXPO_PUBLIC_EXPO_PROJECT_ID = "your-eas-project-id"
npx expo start
```

Use the computer's LAN IP for a local Worker on a physical phone. Google OAuth client IDs must be configured for the final package identifiers before store submission, and the Apple capability must be enabled in the Apple Developer account for `com.glamia.store`.
