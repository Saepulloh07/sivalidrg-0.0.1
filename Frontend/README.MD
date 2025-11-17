# SIVALIDRG Frontend

Modern web application untuk sistem medical coding SIVALIDRG dengan Multi-Agent AI, dibangun menggunakan **React + Vite + Material-UI** dengan tema **BPJS Kesehatan**.

## 🎨 Design Features

### **BPJS Kesehatan Theme**

- **Primary Color**: #00A651 (BPJS Green)
- **Secondary Color**: #0066B3 (BPJS Blue)
- Modern gradient designs
- Clean & professional UI
- Responsive untuk semua device

### **Key UI Components**

- ✨ **Welcome Guide** - Interactive onboarding untuk user baru
- 📊 **Real-time Dashboard** - Analytics & performance metrics
- 🤖 **Multi-Agent Visualization** - Status 3 AI agents
- 📝 **Case Detail View** - Complete coding workflow
- ✅ **Validation Reports** - Quality checklist & mismatch flags
- 🔍 **Evidence Highlighting** - Text highlighting di dokumen

## 🚀 Tech Stack

- **Framework**: React 18 + Vite
- **UI Library**: Material-UI (MUI) v5
- **Routing**: React Router v6
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Charts**: Recharts
- **Notifications**: Notistack
- **File Upload**: React Dropzone
- **HTTP Client**: Axios

## 📦 Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Backend API running on port 8001

### Setup

```bash
# Clone repository
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env
VITE_API_URL=http://localhost:8001
```

### Development

```bash
# Start development server
npm run dev

# Application will run at http://localhost:3000
```

### Build for Production

```bash
# Build
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── MainLayout.jsx           # Main app layout
│   │   ├── WelcomeGuide.jsx         # Onboarding guide
│   │   └── ...
│   ├── pages/
│   │   ├── Login.jsx                # Login page
│   │   ├── Dashboard.jsx            # Main dashboard
│   │   ├── Patients.jsx             # Patient management
│   │   ├── Documents.jsx            # Document management
│   │   ├── CodingCases.jsx          # Coding cases list
│   │   ├── CaseDetail.jsx           # Case detail view
│   │   ├── Validation.jsx           # Validation reports
│   │   └── Agents.jsx               # AI agents monitoring
│   ├── services/
│   │   └── api.js                   # API service layer
│   ├── store/
│   │   └── authStore.js             # Auth state management
│   ├── theme/
│   │   └── index.js                 # MUI theme config
│   ├── App.jsx                      # Main app component
│   ├── main.jsx                     # Entry point
│   └── index.css                    # Global styles
├── package.json
├── vite.config.js
└── README.md
```

## 🎯 Key Features

### 1. **Welcome Guide System**

Setiap user baru akan disambut dengan **Interactive Welcome Guide** yang disesuaikan dengan role:

#### **Admin Guide**

- Introduction to SIVALIDRG
- Multi-Agent AI System explanation
- Workflow overview
- Admin-specific features

#### **Coder Guide**

- How AI helps coding
- Workflow steps
- Tips & best practices
- Quality metrics

#### **Reviewer Guide**

- Multi-Agent Validation layers
- Review process
- Quality metrics interpretation
- Priority guidelines

**Access Guide**: Click **Help icon** di AppBar atau dari User Menu

### 2. **Dashboard Analytics**

#### **Overview Cards**

- Total Patients
- Documents Processed
- Coding Cases
- Average Quality Score

#### **Multi-Agent Status**

Real-time monitoring:

- Total validations
- Mismatch flags distribution
- Issues by type
- Resolution rates

#### **Charts & Metrics**

- Quality Distribution (Pie Chart)
- AI Performance Metrics
- Daily Throughput (Bar Chart)
- Processing Time Trends

### 3. **Case Detail View**

#### **4 Main Tabs**

**Tab 1: AI Recommendations**

- List semua rekomendasi dari AI
- Confidence score visualization
- Evidence text
- Accept/Reject actions
- View evidence highlighting

**Tab 2: Final Codes**

- Approved ICD codes
- Source tracking (AI vs Manual)
- Added by information
- Delete functionality

**Tab 3: Document**

- Original document text
- Monospace font for readability
- Scrollable viewer

**Tab 4: Validation Report**

- Mismatch Flags dengan severity
- Quality Checklist (8+ checks)
- Overall quality score
- Recommendations

### 4. **Validation System**

#### **Mismatch Flags**

Visualisasi dengan:

- Severity color coding (Critical, High, Medium, Low)
- Type badges
- Recommendations
- Resolve functionality

#### **Auto Checklist**

8+ automated checks:

- ✓ Diagnosis Match
- ✓ Lab Support
- ✓ ICD Code Validity
- ✓ Documentation Completeness
- ✓ Duration Anomaly
- ✓ Vital Signs Recording
- ✓ CPPT Frequency
- ✓ Procedure Documentation

### 5. **AI Agents Monitoring**

#### **Agent Information**

- MismatchChecker capabilities
- ICDValidator features
- AutoChecklist functions
- Integration details

#### **Real-time Statistics**

- Total validations
- Average scores
- Quality distribution
- Mismatch trends

#### **Health Monitoring**

- AI Service status
- Database connection
- Agents availability

## 🎨 UI/UX Highlights

### **Color Scheme**

```javascript
// Primary (BPJS Green)
primary: {
  main: '#00A651',
  light: '#4BC47A',
  dark: '#008041'
}

// Secondary (BPJS Blue)
secondary: {
  main: '#0066B3',
  light: '#4D94D9',
  dark: '#004D8C'
}

// Quality Colors
excellent: '#10B981',  // Green
good: '#3B82F6',       // Blue
fair: '#F59E0B',       // Orange
poor: '#EF4444',       // Red
critical: '#DC2626'    // Dark Red
```

### **Typography**

- Font Family: **Inter** (Google Fonts)
- Clean, modern, professional
- Proper hierarchy (h1-h6)
- Consistent spacing

### **Components Styling**

- **Buttons**: Rounded (8px), gradient backgrounds
- **Cards**: Elevated shadows, 16px border radius
- **Chips**: Rounded, color-coded
- **Progress Bars**: Smooth animations
- **Dialogs**: Modern, large border radius

### **Animations**

- Fade-in effects
- Smooth transitions
- Loading skeletons
- Hover states

## 🔐 Authentication & Authorization

### **JWT-based Auth**

```javascript
// Login flow
1. User inputs NIP & Password
2. Backend validates credentials
3. Returns JWT token + user data
4. Store in Zustand (persisted to localStorage)
5. Auto-attach token to all API requests
```

### **Role-based Access**

- **Admin**: Full access to all features
- **Coder**: Access to assigned cases
- **Reviewer**: Review queue & quality reports

### **Protected Routes**

```javascript
// Automatically redirect to login if not authenticated
<ProtectedRoute>
  <MainLayout />
</ProtectedRoute>
```

## 📱 Responsive Design

### **Breakpoints**

- **xs**: 0-600px (Mobile)
- **sm**: 600-960px (Tablet)
- **md**: 960-1280px (Desktop)
- **lg**: 1280-1920px (Large Desktop)

### **Mobile Optimization**

- Collapsible drawer menu
- Touch-friendly buttons
- Optimized card layouts
- Stacked grids on small screens

## 🧪 Demo Credentials

```
Admin:
NIP: admin
Password: admin123

Coder:
NIP: coder01
Password: coder123

Reviewer:
NIP: reviewer01
Password: reviewer123
```

## 🔄 API Integration

### **Service Layer** (`src/services/api.js`)

```javascript
// Example: Get case detail
const caseData = await codingAPI.getCaseById(id);

// Example: Run validation
await validationAPI.run({
  norm: "RM001234",
  coding_case_id: 456,
});
```

### **Error Handling**

- Automatic retry on network errors
- 401 → Auto logout & redirect to login
- User-friendly error messages
- Snackbar notifications

## 🎓 User Guide Activation

### **First Time Users**

- Guide shows automatically on first login
- Can be dismissed with "Skip" button
- Progress saved to localStorage

### **Manual Access**

1. Click **Help icon** (?) in top AppBar
2. Or from User Menu → "Panduan Penggunaan"
3. Navigate with Previous/Next buttons
4. Interactive step-by-step guide

### **Guide Content by Role**

**Admin (4 steps)**

1. Welcome & System Introduction
2. Multi-Agent AI Explanation
3. Workflow Overview
4. Admin Features

**Coder (4 steps)**

1. Welcome & AI Benefits
2. How AI Works
3. Coding Workflow
4. Tips & Best Practices

**Reviewer (4 steps)**

1. Welcome & QA Role
2. Multi-Agent Validation Layers
3. Review Process
4. Quality Metrics

## 🛠️ Development Tips

### **Adding New Pages**

1. Create component in `src/pages/`
2. Add route in `src/App.jsx`
3. Add menu item in `src/components/MainLayout.jsx`

### **Custom Hooks**

```javascript
// Example: useAuth
import useAuthStore from "@/store/authStore";

const { user, logout } = useAuthStore();
```

### **API Calls**

```javascript
// Always use try-catch
try {
  const res = await api.someEndpoint();
  // Handle success
} catch (err) {
  enqueueSnackbar("Error message", { variant: "error" });
}
```

### **Styling**

```javascript
// Use MUI sx prop
<Box sx={{
  bgcolor: 'primary.main',
  p: 2,
  borderRadius: 2
}}>
```

## 🐛 Troubleshooting

### **Build Errors**

```bash
# Clear cache
rm -rf node_modules
rm package-lock.json
npm install
```

### **API Connection Issues**

```bash
# Check .env file
VITE_API_URL=http://localhost:8001

# Ensure backend is running
curl http://localhost:8001/health
```

### **Port Already in Use**

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- --port 3001
```

## 📈 Performance Optimization

- **Code Splitting**: React.lazy() for routes
- **Image Optimization**: WebP format
- **Bundle Size**: Tree-shaking with Vite
- **Caching**: React Query caching strategy
- **Memoization**: useMemo for expensive computations

## 🚀 Deployment

### **Build for Production**

```bash
npm run build
```

Output: `dist/` folder

### **Deploy Options**

1. **Vercel**

```bash
npm i -g vercel
vercel
```

2. **Netlify**

```bash
netlify deploy --prod
```

3. **Docker**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## 📝 Environment Variables

```env
# API Backend URL
VITE_API_URL=http://localhost:8001

# Enable debugging (development only)
VITE_DEBUG=true
```

## 🤝 Contributing

1. Follow component structure
2. Use Material-UI components
3. Follow BPJS color scheme
4. Add PropTypes for components
5. Write meaningful comments
6. Test responsive design

## 📄 License

MIT License

---

**Built with ❤️ for BPJS Kesehatan**

_Powered by Multi-Agent AI: MismatchChecker • ICDValidator • AutoChecklist_
