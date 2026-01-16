# 3AM Core Backend - Node.js + Express

## 🎯 Overview

This is a pure Node.js + Express backend for the 3AM Core Responsibility Management System.

---

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Server runs on: `http://localhost:3003`

### Production
```bash
npm start
```

---

## 📁 Project Structure

```
3am-responsibility-activity-backend/
├── server.js                    # Express entry point
├── src/server/                  # Express backend
│   ├── routes/                 # API routes
│   ├── services/               # Business logic
│   ├── middleware/             # Express middleware
│   └── config/                 # Configuration
├── package.json
└── .env                        # Environment variables
```

---

## 🔧 Available Commands

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/firebase-signup` - Create account
- `POST /api/auth/firebase-login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/user` - Get current user

### Core Profiles
- `GET /api/core/profiles` - Get all core profiles
- `POST /api/core/setup-password` - Set password
- `POST /api/core/login` - Core team login

### Responsibilities
- `POST /api/responsibilities` - Create
- `GET /api/responsibilities` - Get user's tasks
- `GET /api/responsibilities/all` - Get all tasks
- `PUT /api/responsibilities/:id` - Update
- `DELETE /api/responsibilities/:id` - Delete
- `GET /api/responsibilities/dates` - Get dates
- `GET /api/responsibilities/stats` - Get statistics

### Activities
- `POST /api/activities` - Create (core team only)
- `GET /api/activities` - Get all
- `GET /api/activities/my` - Get user's activities
- `PUT /api/activities/:id` - Update
- `DELETE /api/activities/:id` - Delete
- `POST /api/activities/:id/participate` - Join/leave
- `GET /api/activities/:id/participants` - Get participants
- `GET /api/activities/participation/my` - Get participation status

### Presence
- `POST /api/presence` - Mark presence
- `DELETE /api/presence/:date` - Remove presence
- `GET /api/presence/month/:year/:month` - Get monthly data
- `GET /api/presence/stats/:year/:month` - Get statistics
- `POST /api/presence/activity-participation` - Auto-mark via activity

### In-House Presence (Core Team Only)
- `GET /api/in-house-presence/users` - Get all in-house users
- `GET /api/in-house-presence/user/:userId/month/:year/:month` - Get user's presence
- `GET /api/in-house-presence/overview/:year/:month` - Get overview

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/mark-all-read` - Mark all as read
- `POST /api/notifications/push-subscription` - Save subscription
- `DELETE /api/notifications/push-subscription` - Remove subscription
- `POST /api/notifications/activity-created` - Activity creation notification
- `POST /api/notifications/activity-participation` - Participation notification

---

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3003
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# CORS Configuration
CORS_ORIGIN=http://localhost:3002

# Security
COOKIE_SECRET=your-cookie-secret
```

---

## 🔥 Firebase Integration

### Services Used
- **Firebase Authentication** - User authentication
- **Cloud Firestore** - Data storage
- **Firebase Admin SDK** - Backend integration

### Data Collections
- `activities` - Activity management
- `activity_participants` - Activity participation
- `responsibilities` - Task management
- `presence` - Presence tracking
- `user_presence` - Monthly presence data
- `core-profiles` - Core team profiles
- `notifications` - Notification storage
- `push_subscriptions` - Push notification subscriptions

---

## 🧪 Testing

### Test Endpoints
```bash
# Health check
curl http://localhost:3003/api/health

# Login
curl -X POST http://localhost:3003/api/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","userType":"in-house"}'
```

---

## 📊 Features

### Authentication
- Firebase Authentication
- JWT token-based sessions
- Dual authentication (Core team + In-house)
- Password hashing with bcrypt

### Activity Management
- Create, edit, delete activities (Core team)
- Activity participation tracking
- Participant management
- Real-time updates

### Responsibility Management
- Create, edit, delete tasks
- Date-based organization
- Completion tracking
- Statistics dashboard

### Presence Tracking
- Manual presence marking
- Activity-based presence
- Monthly statistics
- Compliance tracking

### Notifications
- Push notifications
- In-app notifications
- Activity notifications
- Participation notifications

---

## 🔒 Security Features

- JWT token authentication
- HTTP-only cookies
- CORS protection
- Rate limiting
- Input validation
- Password hashing (bcrypt)
- Firebase security rules

---

## 🐛 Troubleshooting

### Backend won't start
- Check if port 3003 is available
- Verify environment variables in `.env`
- Ensure Firebase credentials are correct
- Run `npm install` to install dependencies

### Authentication issues
- Check Firebase project configuration
- Verify JWT secret is set
- Ensure Firebase Admin SDK is initialized

### Database issues
- Verify Firestore is enabled in Firebase Console
- Check Firebase security rules
- Ensure service account has proper permissions

---

## 📈 Performance

- Express.js with middleware
- Firebase Firestore (NoSQL)
- Connection pooling
- Efficient queries
- Indexed collections

---

## 📄 License

This project is proprietary software for 3AM Core team use only.

---

**3AM Core Backend** - Pure Node.js + Express backend for elite responsibility management.
