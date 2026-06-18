# Repeatless – AI-Powered Email Intelligence

Repeatless is an intelligent, privacy-focused email layer that connects securely to your Gmail mailbox, transforming thousands of unstructured emails into clear summaries, smart categories, and a natural language chat agent.

---

## 🔗 Project Links

* **Live Demo**: [https://your-app-url.vercel.app](https://your-app-url.vercel.app)
* **GitHub Repository**: [https://github.com/your-username/repeatless](https://github.com/your-username/repeatless)

---

## ✨ Features

* 📥 **Gmail Sync Engine**: Synchronizes messages, threads, labels, drafts, and sent mail in the background via OAuth 2.0.
* 📊 **Dashboard Analytics**: Real-time insights detailing total threads, unread metrics, newsletter breakdowns, and category ratios.
* 🏷️ **Smart Categorization**: Classifies every thread into a distinct category (*Work, Personal, Finance, Job, Newsletter, Notification*) via Gemini.
* 💬 **Natural Language AI Agent**: Chat with your mailbox history. Retrieve details, ask questions, or synthesize threads instantly.
* 🔍 **Contextual Search**: High-speed indexing and querying across subjects, body text, and senders.
* 📰 **Newsletter Isolation**: Isolates subscriptions and newsletters into a clean list, keeping the primary inbox distraction-free.
* ⚡ **Quota Circuit Breaker**: Gracefully handles free-tier Gemini API limitations, preventing UI stalls and caching insights.
* 🎨 **Harmonized Design**: A clean, premium editorial-style interface with full support for user theme preferences.

---

## 📷 Screenshots

### Login Page
![Login](docs/images/login.png)

### Dashboard
![Dashboard](docs/images/dashboard.png)

### Inbox
![Inbox](docs/images/inbox.png)

### Categories
![Categories](docs/images/categories.png)

### AI Agent
![AI Agent](docs/images/ai-agent.png)

### Settings
![Settings](docs/images/settings.png)

---

## 🏗️ Architecture

For detailed flow diagrams (Authentication, Gmail Synchronization, AI Summarization, and Deployment), see the root [ARCHITECTURE.md](file:///d:/Repeat%20Less%20Gmail%20Intellegance/inbox-harmony/ARCHITECTURE.md) document.

---

## 💻 Tech Stack

* **Frontend**: React 19, TypeScript, Tailwind CSS, TanStack Router (filesystem routing), TanStack React Query (state caching).
* **Backend**: Supabase (PostgreSQL with Row Level Security).
* **Integrations**: Google Gmail API, Gemini AI Pro API.
* **Hosting**: Vercel.

---

## 📁 Project Structure

```text
inbox-harmony/
├── supabase/                 # Supabase configuration, schema migrations, and functions
│   ├── migrations/           # SQL database migrations
│   └── functions/            # Edge functions (sync handlers)
├── src/
│   ├── components/           # Reusable UI elements (AppShell, AuthShell, forms)
│   ├── lib/
│   │   ├── supabase/         # Supabase client/server singletons
│   │   └── gmail/            # Gmail OAuth, API sync logic, and quota breaker
│   ├── routes/               # TanStack filesystem-routing pages
│   ├── styles.css            # Base Tailwind and custom design variables
│   └── main.tsx              # Application client entrypoint
├── ARCHITECTURE.md           # System flows and design document
├── package.json              # Project dependencies
└── vite.config.ts            # Vite bundler options
```

---

## 🚀 Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/repeatless.git
cd repeatless
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Local Environment Variables
Create a `.env.local` file in the root directory:
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Gemini AI API Configuration
GEMINI_API_KEY=your-gemini-api-key
```
> [!WARNING]
> **Security Reminder**: Never commit `.env.local` or any key files to Git. The project contains a hardened `.gitignore` preventing accidental leaks.

### 4. Setup Supabase
1. Create a new Supabase project in the [Supabase Dashboard](https://database.new).
2. Set up Auth:
   * Go to **Auth -> Providers -> Google**.
   * Enable the Google provider.
   * Input your Client ID and Client Secret (retrieved from Google Cloud Console).
   * Note the redirect URI provided by Supabase.
3. Run Database Migrations:
   * Execute the SQL migration scripts located in the `/supabase/migrations` folder using the Supabase SQL Editor to initialize all tables, indexes, and Row-Level Security (RLS) policies.

### 5. Setup Google Cloud Console (Google OAuth)
1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project.
3. Search for and enable the **Gmail API**.
4. Configure the **OAuth Consent Screen**:
   * Set user type to **External** (or Internal if testing in workspace).
   * Add the required scopes:
     * `openid`, `auth/userinfo.email`, `auth/userinfo.profile`
     * `https://www.googleapis.com/auth/gmail.modify` (Read & sync mail)
     * `https://www.googleapis.com/auth/gmail.send` (Send emails)
     * `https://www.googleapis.com/auth/gmail.compose` (Manage drafts)
5. Create Credentials:
   * Go to **Credentials -> Create Credentials -> OAuth Client ID**.
   * Set application type to **Web Application**.
   * Under **Authorized redirect URIs**, add:
     * `http://localhost:3000/connect` (local testing)
     * `https://your-project-ref.supabase.co/auth/v1/callback` (Supabase callback)
     * `https://your-app-url.vercel.app/connect` (production Vercel)
   * Save and copy the Client ID and Client Secret into your `.env.local`.

### 6. Run the Project Locally
```bash
npm run dev
```
The server will start on `http://localhost:3000` (or another available port).

---

## ☁️ Vercel Deployment

1. Install the Vercel CLI or import the repository in the [Vercel Dashboard](https://vercel.com).
2. Add your environment variables in Vercel under Project Settings -> Environment Variables.
3. Build & Deploy:
```bash
vercel --prod
```

---

## ⚠️ Known Limitations

* **Gemini Quota limits**: When using the free-tier Gemini key, the application may hit rate limit codes (HTTP 429). The system implements an active circuit breaker to block subsequent requests during cooldown, showing cached dashboard stats to ensure stability.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
