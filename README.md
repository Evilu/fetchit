# Users & Groups API

A REST API for managing users and groups built with NestJS, Prisma, and PostgreSQL.

## Requirements

- Node.js 18+
- Docker and Docker Compose
- Redis (optional, falls back to in-memory cache)

## Quick Start

1. Start the database and Redis:

```bash
docker-compose up -d
```

2. Install dependencies and set up the database:

```bash
npm install
npx prisma db push
npx ts-node prisma/seed.ts
```

3. Start the server:

```bash
npm run start:dev
```

The API is available at `http://localhost:3000/api/v1`.

API documentation: `http://localhost:3000/docs`

## Configuration

Copy `.env` and adjust values as needed:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/postgres` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | Allowed origins | `*` |

## API Endpoints

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users` | Get users with offset pagination |
| GET | `/api/v1/users/cursor` | Get users with cursor pagination |
| PATCH | `/api/v1/users/statuses` | Bulk update user statuses |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/groups` | Get groups with pagination |
| DELETE | `/api/v1/groups/:groupId/users/:userId` | Remove user from group |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |

## Pagination

### Offset Pagination

```
GET /api/v1/users?limit=20&offset=0
```

Response:
```json
{
  "data": [...],
  "meta": {
    "limit": 20,
    "offset": 0,
    "total": 100
  }
}
```

### Cursor Pagination

Better for large datasets. Uses the last item's ID as cursor.

```
GET /api/v1/users/cursor?limit=20
GET /api/v1/users/cursor?cursor=25&limit=20
```

Response:
```json
{
  "data": [...],
  "meta": {
    "nextCursor": 45,
    "hasNext": true
  }
}
```

## Bulk Status Update

Update up to 500 users in a single request. The operation is atomic.

```
PATCH /api/v1/users/statuses
Content-Type: application/json

{
  "updates": [
    { "id": 1, "status": "active" },
    { "id": 2, "status": "blocked" }
  ]
}
```

Valid statuses: `pending`, `active`, `blocked`

## Remove User from Group

When removing the last user from a group, the group status is automatically updated to `empty`.

```
DELETE /api/v1/groups/1/users/5
```

Returns `204 No Content` on success.

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "field": "limit", "reason": "limit must not be greater than 100" }
    ]
  }
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| General | 10/sec, 100/min |
| Bulk status update | 5/sec, 20/min |

Returns `429 Too Many Requests` when exceeded.

## Caching

List endpoints are cached in Redis with a 30-second TTL. Cache is invalidated on mutations.

## Testing

```bash
# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:cov
```

## Project Structure

```
src/
  common/         # Shared DTOs, filters, interceptors
  database/       # Prisma service and module
  cache/          # Redis cache service
  users/          # Users module (controller, service, DTOs)
  groups/         # Groups module (controller, service, DTOs)
  health/         # Health check module
prisma/
  schema.prisma   # Database schema
  seed.ts         # Seed data
test/
  *.e2e-spec.ts   # End-to-end tests
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in development mode with hot reload |
| `npm run start:prod` | Start production build |
| `npm run build` | Build for production |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint and fix code |

## Database Schema

```prisma
model User {
  id        Int        @id @default(autoincrement())
  username  String
  status    UserStatus @default(pending)
  groupId   Int?
  group     Group?     @relation(...)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Group {
  id        Int         @id @default(autoincrement())
  name      String
  status    GroupStatus @default(empty)
  users     User[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

enum UserStatus { pending, active, blocked }
enum GroupStatus { empty, notEmpty }
```

## License

MIT
