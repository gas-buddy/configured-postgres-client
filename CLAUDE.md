# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript source to CommonJS in `build/` directory
- **Build (watch)**: `npm run build:watch` - Compiles TypeScript in watch mode
- **Type check**: `npm run typecheck` - Run TypeScript type checking without emitting files
- **Test**: `npm test` - Runs all tests with Jest
- **Test (watch)**: `npm run test:watch` - Run tests in watch mode
- **Test (coverage)**: `npm run test:coverage` - Run tests with coverage analysis
- **Test (verbose)**: `npm run test:verbose` - Run tests with detailed output
- **Lint**: `npm run lint` - Run ESLint on all files
- **Prepare for publish**: `npm run prepublishOnly` - Builds the project before publishing

## Architecture Overview

This is a configuration-driven PostgreSQL client wrapper around pg-promise that provides:

### Core Components

**Main PgClient class** (`src/index.js`):
- EventEmitter-based client with lifecycle management (start/stop)
- Connection pooling with read-only replica support
- SQL file loading from directories with nested structure support
- Interface abstraction layer for custom database classes

**TrackingClient** (`src/trackingClient.js`):
- Query execution wrapper with context tracking and metrics
- Advisory locking functionality with retry logic
- PostgreSQL notification system (LISTEN/NOTIFY)
- Read-only connection routing

**CLI Tool** (`src/run-pg-sql.js`):
- Standalone SQL execution tool accessible via `run-pg-sql` binary
- Environment-based configuration (PGHOST, PGUSER, PGPASSWORD)

### Key Features

**Query Context and Tracking**: All database operations can be associated with request context for distributed tracing and metrics. Use `client.queryWithContext(context, 'operationName')` to create tracked queries.

**SQL File Organization**: Define SQL files in directories, accessible as nested objects:
```
sqlFiles/
  feature/
    create.sql
    getById.sql
```
Becomes: `client.sqlFiles.feature.getById`

**Advisory Locking**: Built-in support for PostgreSQL advisory locks with automatic retry logic via `withAdvisoryLock()` and `tryAdvisoryLock()` methods.

**Read-only Replicas**: Automatic routing to read-only replicas when configured, controlled via `readOnly()` method.

## Testing

**Framework**: Jest with ts-jest preset for direct TypeScript compilation

**Test Structure**: 
- `tests/*.test.ts` - TypeScript Jest test files with full type safety
- Direct imports from TypeScript source (`../src/index`) 
- No build step required - ts-jest compiles TypeScript on-the-fly during testing
- Proper setup/teardown for database connections with typed interfaces
- Organized by feature: connection, locking, notifications
- Type-safe test configurations and payload interfaces

**Database Requirements**: Tests require PostgreSQL connection via environment variables:
- `PGHOST` - PostgreSQL host
- `PGUSER` - Username (defaults to 'postgres')  
- `PGPASSWORD` - Password (defaults to 'postgres')
- `PGDATABASE` - Database name (defaults to PGUSER or 'postgres')

**Coverage**: Configured with 70% line coverage, 60% function coverage, 40% branch coverage

## Build System

- **TypeScript**: Full TypeScript conversion completed with strict type checking
- **Source**: TypeScript files in `src/`, compiled output in `build/`
- **Type Definitions**: Generates `.d.ts` files for full IDE support
- **Compilation**: ES2020 target, CommonJS modules via TypeScript compiler
- **ESLint**: Uses `eslint-config-gasbuddy` rules with TypeScript support

## TypeScript Features

- **Strong Typing**: Comprehensive interfaces for all database operations
- **Generic Support**: Type-safe advisory locking and query operations
- **pg-promise Integration**: Built-in TypeScript definitions from pg-promise
- **Strict Mode**: Full strict TypeScript compilation enabled