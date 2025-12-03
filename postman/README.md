# Postman Collection - Generic Data Importer API

This folder contains a Postman collection and test data for testing the Generic Data Importer API.

## Contents

```
postman/
├── GenericDataImporter.postman_collection.json   # Main Postman collection
├── GenericDataImporter.postman_environment.json  # Environment variables
├── test-data/
│   ├── sales_data.csv            # Sales transaction data
│   ├── employee_data.csv         # HR employee roster
│   ├── inventory_data.csv        # Product inventory
│   ├── customer_addresses.csv    # Addresses (compound field testing)
│   └── complex_mixed_data.csv    # Complex nested/mixed data
└── README.md
```

## Setup

### 1. Import Collection
1. Open Postman
2. Click **Import** button
3. Select `GenericDataImporter.postman_collection.json`
4. The collection will appear in your Collections sidebar

### 2. Import Environment
1. Click the gear icon (⚙️) in the top right → **Manage Environments**
2. Click **Import** 
3. Select `GenericDataImporter.postman_environment.json`
4. Select "Generic Data Importer - Local" from the environment dropdown

### 3. Start the Backend
```bash
cd GenericDataImporterBackend
npm run start:dev
```

The API will be available at `http://localhost:3001`

## Usage

### Basic Workflow

1. **Health Check**: Start with `Health > Health Status` to verify the API is running

2. **Extract Data**: 
   - Go to `Extract > Extract - Sales Data`
   - In the request body, click **Select Files** next to the `file` field
   - Navigate to `postman/test-data/` and select `sales_data.csv`
   - Click **Send**
   - The response will include an `operationId` (automatically saved to environment)

3. **Check Status**:
   - Go to `Operations > Get Operation Status`
   - Click **Send** to poll the operation status
   - Repeat until status is `completed`

4. **View Results**: When completed, the response includes the extracted data in the `result` field

### Test Data Files

| File | Description | Best For Testing |
|------|-------------|------------------|
| `sales_data.csv` | Monthly sales transactions | Direct column mapping |
| `employee_data.csv` | HR employee roster | Standard extraction |
| `inventory_data.csv` | Warehouse inventory | SKU/product data |
| `customer_addresses.csv` | Customer addresses | **Compound field extraction** (address parsing) |
| `complex_mixed_data.csv` | Orders with nested data | Complex extraction scenarios |

### Compound Field Testing

The `customer_addresses.csv` file is specifically designed to test compound field extraction. The `Complete Address` column contains full addresses that need to be parsed into separate fields:
- Street address
- City
- State
- ZIP code
- Country

### Available Endpoints

#### Health
- `GET /` - Basic health check
- `GET /health` - Detailed health with operation counts
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

#### Extract
- `POST /extract` - Upload file and start extraction

#### Operations
- `GET /operations/:operationId` - Get operation status/results
- `POST /operations/:operationId/cancel` - Cancel operation

#### Bedrock (AI Models)
- `GET /bedrock/models` - List available models
- `POST /bedrock/invoke` - Invoke model
- `POST /bedrock/stream` - Stream response (SSE)

#### Examples
- `GET /examples/models` - List models
- `POST /examples/simple-completion` - Text generation
- `POST /examples/translate` - Translation
- `POST /examples/code-review` - Code analysis
- `POST /examples/summarize` - Summarization

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `baseUrl` | API base URL | `http://localhost:3001` |
| `operationId` | Auto-saved operation ID | (empty) |

## Tips

- The Extract endpoints automatically save the `operationId` to the environment
- Use the swagger docs at `http://localhost:3001/api` for interactive API exploration
- For Excel files, use the `sheetName` parameter to specify which sheet to process
- The `context` field must be valid JSON with a `description` and `fields` array

