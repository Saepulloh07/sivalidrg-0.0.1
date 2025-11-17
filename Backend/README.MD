# SIVALIDRG Backend

Backend service untuk sistem medical coding SIVALIDRG dengan integrasi Multi-Agent AI.

## 🏗️ Arsitektur

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Frontend  │────▶│   Backend   │────▶│  AI Service     │
│  (React)    │     │  (Node.js)  │     │  (Python/Flask) │
└─────────────┘     └─────────────┘     └─────────────────┘
                           │                      │
                           ▼                      ▼
                    ┌─────────────┐      ┌──────────────┐
                    │   MySQL     │      │  Ollama API  │
                    │  Database   │      │ (Llama 3 8B) │
                    └─────────────┘      └──────────────┘
```

## 🚀 Fitur Utama

### 1. **Authentication & Authorization**

- JWT-based authentication
- Role-based access control (Admin, Coder, Reviewer)
- Secure password hashing dengan bcrypt

### 2. **Patient Management**

- CRUD operasi untuk data pasien
- Search dan pagination
- Riwayat rekam medis lengkap

### 3. **Document Management**

- Upload dokumen (PDF, DOCX, TXT)
- Text extraction otomatis
- Status tracking (uploaded → processing → finalized)

### 4. **AI-Powered Medical Coding**

- Entity extraction menggunakan LLM
- ICD-10 dan ICD-9-CM code matching
- Semantic search dengan Sentence-BERT
- Evidence highlighting

### 5. **Multi-Agent Validation System**

- **Agent 1: MismatchChecker**
  - Diagnosis consistency checking
  - Lab support validation
  - Fuzzy & semantic matching
- **Agent 2: ICDValidator**
  - ICD code validation
  - Documentation completeness
  - Semantic consistency
- **Agent 3: AutoChecklist**
  - 8+ comprehensive checks
  - Quality scoring
  - ML-based duration anomaly detection

### 6. **Dashboard & Analytics**

- Real-time statistics
- Performance metrics
- Quality trends
- User activity tracking

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **MySQL** >= 8.0
- **Python AI Service** (port 8000)
- **Ollama** dengan model Llama 3 8B

## 🔧 Installation

### 1. Clone repository

```bash
git clone https://github.com/your-repo/sivalidrg-backend.git
cd sivalidrg-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

```bash
cp .env.example .env
```

Edit `.env` sesuai konfigurasi Anda:

```env
# Server
NODE_ENV=development
PORT=8001

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sivalidrg

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# AI Service
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT=60000

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

### 4. Setup database

```bash
mysql -u root -p < database/schema.sql
```

### 5. Seed data (optional)

```bash
mysql -u root -p sivalidrg < database/seed.sql
```

### 6. Start server

```bash
# Development
npm run dev

# Production
npm start
```

Server akan berjalan di `http://localhost:8001`

## 🧪 Testing

```bash
npm test
```

## 📚 API Documentation

### Authentication

#### POST `/api/auth/register`

Register user baru (admin only)

**Request:**

```json
{
  "nip": "123456",
  "name": "Dr. John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "coder"
}
```

#### POST `/api/auth/login`

Login user

**Request:**

```json
{
  "nip": "123456",
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "nip": "123456",
      "name": "Dr. John Doe",
      "role": "coder"
    }
  }
}
```

### Patients

#### GET `/api/patients`

Get all patients with pagination

**Query params:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `search`: Search by NoRM or name

#### POST `/api/patients`

Create new patient

**Request:**

```json
{
  "norm": "RM001234",
  "name": "John Doe",
  "birth_date": "1990-01-15",
  "gender": "male"
}
```

### Documents

#### POST `/api/documents/upload`

Upload document

**Form data:**

- `file`: Document file (PDF/DOCX/TXT)
- `patient_id`: Patient ID
- `source`: "upload" or "emr"

### Coding

#### POST `/api/coding/infer`

Start AI inference

**Request:**

```json
{
  "document_id": 123,
  "run_validation": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "coding_case_id": 456,
    "total_recommendations": 5,
    "results": [
      {
        "code": "E11.9",
        "code_type": "diagnosis",
        "description": "Diabetes mellitus tipe 2",
        "confidence": 0.923,
        "evidence": "diabetes mellitus tipe 2 tidak terkontrol",
        "highlight_ranges": [{ "start": 150, "end": 185 }]
      }
    ],
    "validation_report": {
      "overall_status": "excellent",
      "total_mismatches": 2,
      "critical_issues": 0,
      "checklist_score": 92.5
    }
  }
}
```

#### GET `/api/coding/cases/:id`

Get coding case detail

#### POST `/api/coding/cases/:id/codes`

Add final code (manual)

**Request:**

```json
{
  "code": "E11.9",
  "code_type": "diagnosis",
  "description": "Diabetes mellitus tipe 2",
  "source": "manual"
}
```

### Validation

#### POST `/api/validation/run`

Run multi-agent validation

**Request:**

```json
{
  "norm": "RM001234",
  "coding_case_id": 456
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "validation_status": "excellent",
    "total_mismatches": 2,
    "critical_issues": 0,
    "checklist_score": 92.5,
    "report": {
      "agents_executed": [
        {
          "agent": "MismatchChecker",
          "status": "completed",
          "findings_count": 1
        },
        {
          "agent": "ICDValidator",
          "status": "completed",
          "findings_count": 1
        },
        {
          "agent": "AutoChecklist",
          "status": "completed",
          "overall_score": 92.5
        }
      ]
    }
  }
}
```

#### GET `/api/validation/results/:coding_case_id`

Get validation results

#### GET `/api/validation/checklist/:coding_case_id`

Get auto-checklist

### Dashboard

#### GET `/api/dashboard/overview`

Get dashboard overview

**Query params:**

- `period`: Number of days (default: 30)

#### GET `/api/dashboard/performance`

Get coding performance metrics

#### GET `/api/dashboard/quality-trends`

Get validation quality trends

### Agents

#### GET `/api/agents/health`

Check AI service health

#### GET `/api/agents/info`

Get information about all agents

#### GET `/api/agents/statistics`

Get agent execution statistics

## 🔐 Security

- **Helmet.js** untuk HTTP headers security
- **CORS** dengan whitelist
- **Rate limiting** untuk mencegah abuse
- **JWT** dengan expiration
- **Bcrypt** untuk password hashing
- **Input validation** dengan express-validator

## 📊 Logging

Logs tersimpan di direktori `./logs`:

- `combined.log` - All logs
- `error.log` - Error logs only

## 🛠️ Development

### Structure

```
src/
├── server.js           # Main server
├── config/
│   └── database.js     # MySQL connection
├── routes/
│   ├── auth.js         # Authentication
│   ├── patients.js     # Patient management
│   ├── documents.js    # Document management
│   ├── coding.js       # Medical coding
│   ├── validation.js   # Multi-agent validation
│   ├── dashboard.js    # Analytics
│   └── agents.js       # Agent management
├── middleware/
│   └── auth.js         # Auth middleware
└── utils/
    └── logger.js       # Winston logger
```

### Code Style

- ES6+ syntax
- Async/await for promises
- Error handling dengan try-catch
- Logging untuk semua operasi penting

## 🐛 Troubleshooting

### AI Service tidak tersedia

```bash
# Check AI service status
curl http://localhost:8000/health

# Restart AI service jika perlu
cd ../ai-service
python app/main.py
```

### Database connection error

```bash
# Test MySQL connection
mysql -u root -p -h localhost

# Check user privileges
GRANT ALL PRIVILEGES ON sivalidrg.* TO 'root'@'localhost';
FLUSH PRIVILEGES;
```

### Upload file gagal

```bash
# Check upload directory permissions
chmod 755 ./uploads

# Check max file size di .env
MAX_FILE_SIZE=10485760  # 10MB
```

## 📝 License

MIT License

## 👥 Contributors

- SIVALIDRG Team

## 📧 Support

Untuk bantuan, silakan hubungi: support@sivalidrg.com

---

**Built with ❤️ for better healthcare**
