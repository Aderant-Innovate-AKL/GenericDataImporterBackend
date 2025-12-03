# Generic Data Importer Backend

An AI-powered data extraction service that intelligently maps source data to user-defined schemas using LLM-based field extraction with AWS Bedrock.

## What's Included

- **Generic Data Importer** - AI-powered CSV/Excel data extraction
- **Two-Pass Extraction** - Smart column discovery and compound value extraction
- **Async Operations** - Background processing with status polling
- **NestJS Framework** - Modern, scalable Node.js backend
- **AWS Bedrock Integration** - Ready-to-use AI models (Claude & Amazon Nova)
- **Swagger/OpenAPI** - Interactive API documentation at `/api`
- **TypeScript** - Full type safety
- **Unit Tests** - Comprehensive test coverage

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- AWS account with Bedrock access
- AWS CLI configured (or manually set up credentials)

### 2. Installation

```bash
# Install dependencies
pnpm install
```

### 3. AWS Configuration

Create a `.env` file in the root directory:

```env
AWS_PROFILE=default
AWS_REGION=us-east-1
PORT=3001
```

**Option A: Using AWS CLI (Recommended)**

```bash
# Configure AWS credentials
aws configure

# This creates ~/.aws/credentials with your access keys
```

**Option B: Manual Configuration**

Create/edit `~/.aws/credentials`:

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

Create/edit `~/.aws/config`:

```ini
[default]
region = us-east-1
```

### 4. Enable Bedrock Models

You need to enable models in your AWS account:

1. Go to AWS Sandbox - Bedrock
2. Navigate to "Model access" in the left sidebar
3. Click "Enable specific models"
4. Enable:
   - Claude 3.5 Sonnet
   - Claude 3.5 Haiku
   - Claude 3 Opus
   - Amazon Nova Micro/Lite/Pro

> **Note**: Model availability varies by region. `us-east-1` (Oregon) has the most models.

### 5. Run the Server

```bash
# Development mode
pnpm start:dev

# Production build
pnpm build
pnpm start:prod
```

Server runs at `http://localhost:3001`

Swagger docs at `http://localhost:3001/api`

## AWS Bedrock Integration

### Overview

This template provides a unified service for interacting with multiple AI models through AWS Bedrock. The service handles:

- Provider-specific request/response formatting (Anthropic vs Amazon)
- Model management and configuration
- Synchronous and streaming responses
- Token usage tracking
- Error handling

### Available Models

| Model | ID | Best For | Speed | Cost |
|-------|-----|----------|-------|------|
| **Claude 3.5 Sonnet** | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Complex reasoning, coding, analysis | Medium | $$$ |
| **Claude 3.5 Haiku** | `anthropic.claude-3-5-haiku-20241022-v1:0` | Fast responses, simple tasks | Fast | $ |
| **Claude 3 Opus** | `anthropic.claude-3-opus-20240229-v1:0` | Highest quality, difficult tasks | Slow | $$$$ |
| **Amazon Nova Micro** | `us.amazon.nova-micro-v1:0` | Ultra-fast, simple text tasks | Very Fast | $ |
| **Amazon Nova Lite** | `us.amazon.nova-lite-v1:0` | Balanced performance | Fast | $$ |
| **Amazon Nova Pro** | `us.amazon.nova-pro-v1:0` | Complex text generation | Medium | $$$ |

### Adding New Models

Edit `src/bedrock/bedrock.service.ts`:

```typescript
private models: ModelConfig[] = [
  // Add your model here
  {
    id: 'model-id-from-aws',
    name: 'Display Name',
    provider: 'Anthropic' // or 'Amazon'
  },
  // ... existing models
];
```

## API Endpoints

### Data Importer Endpoints

#### `POST /extract`
Initiate a data extraction operation from CSV or Excel files.

**Request (multipart/form-data):**
- `file` - The file to process (CSV, Excel)
- `sheetName` - (optional) Sheet name for Excel files
- `context` - JSON string with extraction context

**Context JSON Example:**
```json
{
  "description": "Monthly sales report from regional distributors",
  "fields": [
    {"field": "transaction_date", "description": "The date the sale occurred"},
    {"field": "product_sku", "description": "The product identifier or SKU code"},
    {"field": "total_amount", "description": "Total sale amount"},
    {"field": "region", "description": "Geographic region of the customer"}
  ]
}
```

**Response (202 Accepted):**
```json
{
  "operationId": "op_abc123def456",
  "status": "pending",
  "createdAt": "2024-12-03T10:30:00Z",
  "links": {
    "self": "/operations/op_abc123def456",
    "cancel": "/operations/op_abc123def456/cancel"
  }
}
```

#### `GET /operations/{operationId}`
Get operation status and results.

**Response (Processing):**
```json
{
  "operationId": "op_abc123def456",
  "status": "processing",
  "progress": {
    "phase": "extraction",
    "currentStep": "Processing row 50 of 100",
    "rowsProcessed": 50,
    "totalRows": 100,
    "percentComplete": 50
  }
}
```

**Response (Completed):**
```json
{
  "operationId": "op_abc123def456",
  "status": "completed",
  "result": {
    "data": [...],
    "metadata": {
      "sourceFile": "sales.csv",
      "rowsProcessed": 100,
      "extractionSummary": {
        "directMappings": 3,
        "compoundExtractions": 2,
        "averageConfidence": 8.5
      }
    }
  }
}
```

#### `POST /operations/{operationId}/cancel`
Cancel a pending or processing operation.

#### `GET /health`
Health check endpoint with operation statistics.

---

### Core Bedrock Endpoints

#### `GET /bedrock/models`
List all available AI models

**Response:**
```json
[
  {
    "id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "name": "Claude 3.5 Sonnet",
    "provider": "Anthropic"
  }
]
```

#### `POST /bedrock/invoke`
Invoke a model synchronously

**Request:**
```json
{
  "model": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "prompt": "Explain quantum computing simply",
  "temperature": 0.7,
  "maxTokens": 1000
}
```

**Response:**
```json
{
  "content": "Quantum computing is...",
  "model": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "usage": {
    "inputTokens": 12,
    "outputTokens": 150
  }
}
```

#### `POST /bedrock/stream`
Invoke a model with streaming response (Server-Sent Events)

**Request:** Same as `/bedrock/invoke`

**Response:** SSE stream with text chunks

### Example Endpoints

The `/examples` endpoints demonstrate practical AI implementation patterns:

#### `POST /examples/simple-completion`
Basic text generation

```bash
curl -X POST http://localhost:3001/examples/simple-completion \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a haiku about coding"}'
```

#### `POST /examples/translate`
Language translation

```bash
curl -X POST http://localhost:3001/examples/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, how are you?",
    "targetLanguage": "Spanish"
  }'
```

#### `POST /examples/code-review`
AI code analysis

```bash
curl -X POST http://localhost:3001/examples/code-review \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "language": "javascript"
  }'
```

#### `POST /examples/summarize`
Text summarization

```bash
curl -X POST http://localhost:3001/examples/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your long text here...",
    "maxLength": 100
  }'
```

## Using Bedrock Service in Your Code

### Inject the Service

```typescript
import { Injectable } from '@nestjs/common';
import { BedrockService } from '../bedrock/bedrock.service';

@Injectable()
export class YourService {
  constructor(private readonly bedrockService: BedrockService) {}

  async yourMethod() {
    // Use the service
  }
}
```

### Synchronous Invocation

```typescript
const response = await this.bedrockService.invoke({
  model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  prompt: 'Your prompt here',
  temperature: 0.7,
  maxTokens: 1000,
});

console.log(response.content); // AI-generated text
console.log(response.usage);   // Token usage stats
```

### Streaming Response

```typescript
async *streamResponse(prompt: string) {
  for await (const chunk of this.bedrockService.invokeStream({
    model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    prompt,
    temperature: 0.7,
    maxTokens: 1000,
  })) {
    yield chunk; // Each text chunk as it arrives
  }
}
```

### Using in a Controller

```typescript
@Post('ai-endpoint')
async yourEndpoint(@Body() body: { prompt: string }) {
  const response = await this.bedrockService.invoke({
    model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    prompt: body.prompt,
    temperature: 0.7,
    maxTokens: 1000,
  });

  return { result: response.content };
}
```

## Project Structure

```
data-importer-backend/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   ├── app.controller.ts          # Root health check
│   │
│   ├── shared/                    # Shared types and utilities
│   │   └── types/
│   │       └── index.ts           # Type definitions
│   │
│   ├── parsers/                   # File parsing module
│   │   ├── csv.parser.ts          # CSV parser
│   │   ├── excel.parser.ts        # Excel parser
│   │   └── parser.factory.ts      # Parser factory
│   │
│   ├── operations/                # Operation management
│   │   ├── operations.store.ts    # In-memory store
│   │   ├── operations.manager.ts  # Operation lifecycle
│   │   └── operations.controller.ts
│   │
│   ├── extraction/                # LLM-based extraction
│   │   ├── sampler.service.ts     # Row sampling logic
│   │   ├── llm.service.ts         # Bedrock integration
│   │   ├── extractor.service.ts   # Main orchestrator
│   │   └── prompts/               # LLM prompt templates
│   │       ├── discovery.prompt.ts
│   │       └── compound.prompt.ts
│   │
│   ├── mapping/                   # Result mapping
│   │   └── mapper.service.ts      # Transform extractions
│   │
│   ├── workers/                   # Background processing
│   │   └── extraction.worker.ts   # Async extraction worker
│   │
│   ├── extract/                   # Extract API endpoint
│   │   └── extract.controller.ts
│   │
│   ├── health/                    # Health check endpoint
│   │   └── health.controller.ts
│   │
│   ├── bedrock/                   # AWS Bedrock integration
│   │   └── bedrock.service.ts
│   │
│   └── examples/                  # Example endpoints (reference)
│
├── package.json
├── tsconfig.json
├── jest.config.js
├── Dockerfile
└── README.md
```

## Development Guide

### Adding a New Feature Module

```bash
# Generate a new module
nest generate module features/your-feature
nest generate controller features/your-feature
nest generate service features/your-feature
```

### Common AI Patterns

**1. Chat/Conversation**
```typescript
const messages = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Tell me a joke' },
];

// Convert to prompt format for Bedrock
const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
```

**2. Structured Output**
```typescript
const prompt = `Analyze this text and respond in JSON format:
{
  "sentiment": "positive|negative|neutral",
  "topics": ["topic1", "topic2"],
  "summary": "brief summary"
}

Text: ${userText}`;
```

**3. Few-Shot Learning**
```typescript
const prompt = `Classify the following as spam or not spam.

Example 1: "Buy now! 50% off!" -> spam
Example 2: "Meeting at 3pm" -> not spam
Example 3: "CLICK HERE TO WIN!!!" -> spam

Classify: "${userInput}" -> `;
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_PROFILE` | AWS credentials profile name | `default` |
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `PORT` | Server port | `3001` |

### Testing

```bash
# Run tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

## Deployment with AWS Copilot

This template includes automated deployment to AWS using [AWS Copilot](https://aws.github.io/copilot-cli/), which simplifies deploying containerized applications to AWS ECS Fargate.

### What is AWS Copilot?

AWS Copilot is a CLI tool that automates infrastructure setup and deployment. It automatically provisions:

- **ECS Fargate** - Serverless containers (no cold starts)
- **Application Load Balancer** - Distributes traffic
- **ECR** - Stores Docker images
- **VPC & Security Groups** - Network isolation
- **IAM Roles** - Proper permissions
- **CloudWatch Logs** - Centralized logging

### Prerequisites

#### 1. Install AWS Copilot CLI

**macOS:**
```bash
brew install aws/tap/copilot-cli
```

**Linux/Windows:**
```bash
curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
chmod +x copilot
sudo mv copilot /usr/local/bin/copilot
```

#### 2. Configure AWS Credentials

Ensure you have AWS credentials configured:

```bash
aws configure
```

Or set environment variables:
```bash
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_REGION="us-east-1"
```

### One-Time Setup

Follow these steps to initialize your Copilot deployment:

#### Step 1: Create Application

```bash
copilot app init your-app-name
```

#### Step 2: Create Environment

```bash
copilot env init --name dev --region us-east-1 --default-config
```

This creates a `dev` environment with VPC, ECS cluster, and load balancer (~5-10 minutes).

#### Step 3: Create Service

```bash
copilot svc init
```

Answer the prompts:
- **Workload type**: Load Balanced Web Service
- **Service name**: `backend` (or your preferred name)
- **Dockerfile**: `./Dockerfile`
- **Port**: 3001 (auto-detected from Dockerfile)

#### Step 4: Configure Bedrock Permissions

After service creation, you need to add IAM permissions for AWS Bedrock. Edit `copilot/[service-name]/manifest.yml` and add:

```yaml
# Add to your service manifest under the root level
taskrole_policy:
  PolicyDocument:
    Statement:
      - Effect: Allow
        Action:
          - bedrock:InvokeModel
          - bedrock:InvokeModelWithResponseStream
        Resource: 'arn:aws:bedrock:*::foundation-model/*'
```

**Full example manifest with Bedrock permissions:**

```yaml
name: backend
type: Load Balanced Web Service

image:
  build: Dockerfile
  port: 3001

cpu: 256
memory: 512
count: 1

http:
  path: '/'
  healthcheck:
    path: '/'
    healthy_threshold: 3
    interval: 10s

variables:
  NODE_ENV: production
  AWS_REGION: us-east-1
  PORT: 3001

# IAM permissions for Bedrock
taskrole_policy:
  PolicyDocument:
    Statement:
      - Effect: Allow
        Action:
          - bedrock:InvokeModel
          - bedrock:InvokeModelWithResponseStream
        Resource: 'arn:aws:bedrock:*::foundation-model/*'
```

#### Step 5: Commit Copilot Configuration

```bash
git add copilot/ Dockerfile .dockerignore .github/
git commit -m "Add AWS Copilot deployment configuration"
git push origin main
```

### Automated Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically deploys on push to `main`.

#### Configure Repository Secrets

Go to your GitHub repository → Settings → Secrets and Variables → Actions

**Variables:**
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_REGION` - AWS region (e.g., `us-east-1`)

**Secrets:**
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key

#### Trigger Deployment

Push to main branch:
```bash
git push origin main
```

Or manually trigger via GitHub Actions tab.

The workflow will:
1. Build Docker image
2. Push to ECR
3. Deploy to all configured environments
4. Update ECS services

### Manual Deployment

Deploy a specific service to an environment:

```bash
copilot svc deploy --name backend --env dev
```

This will:
- Build your Docker image
- Push to Amazon ECR
- Deploy to ECS Fargate
- Display the service URL

### Useful Commands

**View application status:**
```bash
copilot app show
```

**List services:**
```bash
copilot svc ls
```

**View service details and URL:**
```bash
copilot svc show --name backend --env dev
```

**View logs:**
```bash
copilot svc logs --name backend --env dev --follow
```

**Delete resources:**
```bash
# Delete service
copilot svc delete --name backend

# Delete environment
copilot env delete --name dev

# Delete application
copilot app delete
```

### CORS Configuration

For production, update `src/main.ts` to restrict CORS:

```typescript
app.enableCors({
  origin: ['https://your-frontend-domain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
});
```

### Troubleshooting

**Service won't start:**
Check CloudWatch Logs:
```bash
copilot svc logs --name backend --env dev
```

**"Copilot not found" in GitHub Actions:**
The workflow automatically installs Copilot CLI. Ensure repository secrets are configured correctly.

**Bedrock permission denied:**
Verify `taskrole_policy` is added to your service manifest and redeploy:
```bash
copilot svc deploy --name backend --env dev
```

**Port binding issues:**
Ensure your application listens on `0.0.0.0`, not `localhost`. The Dockerfile sets `HOSTNAME=0.0.0.0` by default.

## Cost Optimization Tips

1. **Choose the right model**
   - Use Nova Micro/Lite for simple tasks
   - Reserve Claude Opus for truly complex tasks

2. **Set appropriate maxTokens**
   - Don't request more tokens than needed
   - Typical ranges: 500-1000 for responses, 2000-4000 for generation

3. **Use temperature wisely**
   - Lower (0.1-0.4) for deterministic tasks
   - Higher (0.7-1.0) for creative tasks

4. **Implement caching**
   - Cache common prompts/responses
   - Use Redis or in-memory cache

## Troubleshooting

### "Could not load credentials from any providers"

- Ensure AWS credentials are configured (`aws configure`)
- Check `~/.aws/credentials` file exists
- Verify `AWS_PROFILE` in `.env` matches credentials profile name

### "Model not found"

- Verify model ID is correct in your request
- Check model is enabled in AWS Bedrock sandbox
- Ensure you're using the correct region

### "Throttling exception"

- AWS Bedrock has rate limits
- Implement retry logic with exponential backoff
- Consider upgrading your AWS account limits

### "Access denied"

- Ensure your AWS IAM user/role has Bedrock permissions
- Required policy: `AmazonBedrockFullAccess` or custom policy with `bedrock:InvokeModel`

## Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Claude Models Guide](https://docs.anthropic.com/claude/docs)
- [Amazon Nova Models](https://aws.amazon.com/bedrock/nova/)

## License

MIT - Feel free to use this template for your projects!

## Need Help?

- Check Swagger docs at `http://localhost:3001/api`
- Review example implementations in `src/examples/`
- Read inline code comments in `src/bedrock/bedrock.service.ts`

---

Built for hackathons and rapid prototyping. Happy building!
