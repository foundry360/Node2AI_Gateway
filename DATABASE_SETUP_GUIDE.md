# Node2AI Database Setup Guide

## 🍺 Step 1: Install Homebrew

Run this command in Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts and enter your password when requested.

## 🔧 Step 2: Add Homebrew to PATH

After installation, add Homebrew to your PATH:

```bash
# For Intel Macs
echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zshrc

# For Apple Silicon Macs (M1/M2)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc

# Reload your shell
source ~/.zshrc
```

## 🗄️ Step 3: Install PostgreSQL

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15
```

## 🚀 Step 4: Set Up Node2AI Database

```bash
# Run the database setup script
./scripts/setup-database-dev.sh
```

## ⚙️ Step 5: Configure Environment

```bash
# Copy environment template
cp env.local.example apps/api/.env.local

# Edit with your settings
nano apps/api/.env.local
```

Update these key values in `.env.local`:

- `DATABASE_URL="postgresql://postgres:password@localhost:5432/node2ai_dev"`
- `OPENAI_API_KEY="sk-your-actual-openai-api-key"`

## 🔄 Step 6: Restart API Server

```bash
# Stop current API server (Ctrl+C)
# Then restart with database connection
cd apps/api && pnpm run dev
```

## 🧪 Step 7: Test Database Connection

```bash
# Test API with database
curl http://localhost:3001/api/v1/admin/status

# Test database directly
psql postgresql://postgres:password@localhost:5432/node2ai_dev
```

## 🎉 You're Done!

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **Database**: PostgreSQL running locally

## 🔍 Troubleshooting

### Homebrew Issues

```bash
# Check if Homebrew is installed
brew --version

# If not found, check your PATH
echo $PATH
```

### PostgreSQL Issues

```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL if not running
brew services start postgresql@15

# Check PostgreSQL status
pg_isready -h localhost -p 5432
```

### Database Connection Issues

```bash
# Test connection
psql postgresql://postgres:password@localhost:5432/node2ai_dev

# Check if database exists
psql -U postgres -c "\l" | grep node2ai_dev
```

## 📚 Alternative: Cloud Database

If you prefer not to install PostgreSQL locally, you can use a free cloud database:

1. **Neon** (Recommended): https://neon.tech
2. **Supabase**: https://supabase.com
3. **Railway**: https://railway.app

Just sign up, create a database, and use the connection string in your `.env.local` file.
