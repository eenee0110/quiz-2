# 🚀 QuizSpark Production Deployment Guide

This guide outlines the steps to deploy **QuizSpark** to production using Firebase.

## 📋 Prerequisites

1.  **Firebase Account**: [Sign up for free](https://console.firebase.google.com/).
2.  **Firebase CLI**: Install globally using npm:
    ```bash
    npm install -g firebase-tools
    ```

## 🛠 Project Configuration

### 1. Initialize Firebase
If you haven't already linked your project:
```bash
firebase login
firebase init
```
*   Select **Hosting** and **Firestore**.
*   Choose your existing project or create a new one.
*   **Public directory**: `dist`
*   **Configure as a single-page app**: Yes
*   **Set up automatic builds with GitHub**: Optional but recommended.

### 2. Environment Variables
Ensure your `firebase-applet-config.json` is correctly set with your production credentials.
In production, verify the following in your Firebase Console:
- **Authentication**: Enable **Google Sign-In**.
- **Firestore**: Ensure database is created in **Production Mode** (though your `firestore.rules` will secure it).

## 📦 Build & Deploy

### 1. Production Build
Run the build script to generate optimized static files in the `dist` folder:
```bash
npm run build
```

### 2. Deploy to Production
Deploy your hosting assets and security rules with a single command:
```bash
firebase deploy
```

## ⚡ Performance & Optimization

-   **Firestore Indexes**: You may need to create composite indexes for complex leaderboard queries. Firebase will provide a link in the console/logs if an index is missing.
-   **Image Assets**: Use optimized URLs for question images (e.g., via a CDN) to ensure fast loading on mobile devices.
-   **Security**: The generated `firestore.rules` are hardened for production. **Do not change them to `allow read, write: if true`** as this will expose your database.

## 📱 Mobile Considerations

-   **QR Join**: The QR code scaling is optimized for desktop presentation to be scanned by mobile devices.
-   **Touch Targets**: Buttons have been styled with `min-h-[44px]` patterns for reliable touch interaction.

## 🔧 Maintenance

-   **Monitoring**: Use the [Firebase Console](https://console.firebase.google.com/) to monitor real-time usage and database performance.
-   **Scale**: QuizSpark scales automatically with Firestore's infrastructure.

---
*Created by QuizSpark Deployment Assistant*
