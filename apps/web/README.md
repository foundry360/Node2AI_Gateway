# Node2AI Admin Dashboard

Next.js 14 admin dashboard for Node2AI enterprise platform.

## Overview

This is the admin dashboard for Node2AI, providing:

- **Modern UI**: Clean, responsive interface built with Tailwind CSS
- **Data Sanitization**: Interactive sanitization testing and management
- **User Management**: User administration and role management
- **Analytics**: Comprehensive analytics and reporting
- **Compliance**: Compliance reporting and audit trails
- **Settings**: System configuration and preferences

## Features

- 🎨 **Modern Design**: Clean, responsive interface with Tailwind CSS
- 🛡️ **Data Sanitization**: Interactive testing and management interface
- 👥 **User Management**: Complete user administration system
- 📊 **Analytics**: Real-time analytics and reporting dashboard
- 📋 **Compliance**: GDPR, HIPAA, SOX compliance management
- ⚙️ **Settings**: System configuration and preferences
- 🔍 **Search & Filter**: Advanced search and filtering capabilities
- 📱 **Responsive**: Mobile-first responsive design

## Pages

### Dashboard

- System overview and quick stats
- Recent activity feed
- Quick access to all features
- Health status indicators

### Data Sanitization

- Interactive sanitization testing
- Real-time results and analysis
- Rule management interface
- Example data for testing

### User Management

- User list with search and filters
- User creation and editing
- Role and permission management
- User activity tracking

### AI Models

- Model configuration and management
- Model testing interface
- Performance metrics
- Capability management

### Analytics

- Usage statistics and trends
- Performance metrics
- Compliance reports
- Custom dashboards

### Compliance

- Compliance report generation
- Audit log viewing
- Finding management
- Export capabilities

### Settings

- System configuration
- Security settings
- Integration management
- License management

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Node2AI API running

### Environment Variables

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001

# Optional: Custom branding
NEXT_PUBLIC_APP_NAME=Node2AI
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp env.example .env.local

# Start development server
pnpm dev
```

### Building

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

### Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### Linting

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix
```

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS with custom components
- **Icons**: Heroicons
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for data visualization
- **Animations**: Framer Motion
- **Notifications**: React Hot Toast
- **Date Handling**: date-fns

## Component Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Dashboard page
│   ├── sanitization/      # Sanitization pages
│   ├── users/            # User management pages
│   ├── models/           # AI model pages
│   ├── analytics/        # Analytics pages
│   ├── compliance/        # Compliance pages
│   └── settings/         # Settings pages
├── components/            # Reusable components
│   ├── ui/               # Base UI components
│   ├── forms/            # Form components
│   ├── charts/           # Chart components
│   └── layout/           # Layout components
├── lib/                  # Utility functions
├── hooks/                # Custom React hooks
├── types/                # TypeScript types
└── utils/                # Helper functions
```

## Styling

The dashboard uses Tailwind CSS with custom component classes:

```css
/* Custom component classes */
.btn {
  /* Button base styles */
}
.btn-primary {
  /* Primary button */
}
.btn-secondary {
  /* Secondary button */
}
.card {
  /* Card container */
}
.input {
  /* Input field */
}
```

## API Integration

The dashboard integrates with the Node2AI API:

```typescript
// Example API integration
const response = await fetch('/api/sanitization/sanitize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input, options }),
});
```

## Deployment

### Docker

```bash
# Build Docker image
docker build -t supernova-web .

# Run container
docker run -p 3000:3000 supernova-web
```

### Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Check deployment
kubectl get pods -l app=supernova-web
```

## Customization

### Branding

Update the branding in `src/app/layout.tsx`:

```typescript
export const metadata: Metadata = {
  title: 'Your Company Dashboard',
  description: 'Your company description',
};
```

### Theme

Customize the theme in `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        // Your primary colors
      }
    }
  }
}
```

## Security

- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control
- **CSRF Protection**: Built-in CSRF protection
- **XSS Protection**: Input sanitization and validation
- **Content Security Policy**: Strict CSP headers

## Performance

- **Code Splitting**: Automatic code splitting with Next.js
- **Image Optimization**: Next.js image optimization
- **Caching**: Strategic caching for API calls
- **Bundle Analysis**: Built-in bundle analyzer

## License

Proprietary - Node2AI Enterprise License
