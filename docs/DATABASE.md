# Database Administration & Portability Guide

The `revytechai-vote` API uses Prisma ORM with a portable schema designed to work seamlessly across:
1. **SQLite** (default for local development, tests, and lightweight deployments)
2. **PostgreSQL** (version 16 / 17 recommended for production)
3. **MariaDB / MySQL** (MariaDB 11.4+ / MySQL 8.0+ for enterprise environments)

The schema avoids SQLite-only and PostgreSQL-only types (such as native enum arrays, Json lists, or provider-specific scalar lists), maintaining full portability across all three database engines.

---

## 1. Provider Configuration & DATABASE_URL Formats

To switch engines, update the `provider` attribute in `api/prisma/schema.prisma` and supply the corresponding `DATABASE_URL` environment variable.

### SQLite (Default)
- **schema.prisma**:
  ```prisma
  datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
  }
  ```
- **DATABASE_URL format**:
  ```bash
  DATABASE_URL="file:./dev.db"
  # Or absolute path:
  DATABASE_URL="file:/var/db/revyvote/dev.db"
  ```

### PostgreSQL
- **schema.prisma**:
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```
- **DATABASE_URL format**:
  ```bash
  DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:5432/DATABASENAME?schema=public"
  # Example (the password comes from a local credential file, see section 7):
  DATABASE_URL="postgresql://revy:${POSTGRES_PASSWORD}@localhost:5432/revyvote?schema=public"
  ```

### MariaDB / MySQL
- **schema.prisma**:
  ```prisma
  datasource db {
    provider = "mysql"
    url      = env("DATABASE_URL")
  }
  ```
- **DATABASE_URL format**:
  ```bash
  DATABASE_URL="mysql://USERNAME:PASSWORD@HOST:3306/DATABASENAME"
  # Example (the password comes from a local credential file, see section 7):
  DATABASE_URL="mysql://revy:${MARIADB_PASSWORD}@localhost:3306/revyvote"
  ```

---

## 2. Managing Migrations Per Provider

Because Prisma generates engine-specific DDL syntax in `api/prisma/migrations/`, migrations must match the target provider.

### Initializing / Regenerating Migrations
When switching providers or preparing migrations for a specific database:

1. Update `provider` in `schema.prisma`.
2. Clear or archive previous provider migrations if targeting a dedicated repository/deployment branch:
   ```bash
   rm -rf api/prisma/migrations
   ```
3. Generate and apply the migration against the target database:
   ```bash
   cd api
   DATABASE_URL="<target_url>" npx prisma migrate dev --name init
   ```
4. In production or CI, deploy existing migrations without schema generation prompts:
   ```bash
   cd api
   DATABASE_URL="<target_url>" npx prisma migrate deploy
   ```

---

## 3. FreeBSD Package Installation

On FreeBSD systems, use the standard binary package manager `pkg`:

### PostgreSQL 17
```sh
# Install server package
pkg install -y postgresql17-server postgresql17-client

# Enable and initialize
sysrc postgresql_enable="YES"
service postgresql initdb
service postgresql start

# Create database and user. The password is prompted for, never stored here.
su - pgsql -c "createuser -s -P revy"
su - pgsql -c "createdb -O revy revyvote"
```

### MariaDB 11.4
```sh
# Install MariaDB 11.4 server
pkg install -y mariadb114-server mariadb114-client

# Enable and start
sysrc mysql_enable="YES"
service mysql-server start

# Secure and provision. The password is read from the credential file
# described in section 7, never written into this document.
mysql -u root -e "CREATE DATABASE revyvote CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -e "CREATE USER 'revy'@'localhost' IDENTIFIED BY '${MARIADB_PASSWORD}';"
mysql -u root -e "GRANT ALL PRIVILEGES ON revyvote.* TO 'revy'@'localhost'; FLUSH PRIVILEGES;"
```

---

## 4. Local Development: Docker Compose

For local development with PostgreSQL 17 or MariaDB 11, use the following `docker-compose.yml`. The passwords are read from a `.env` file next to the compose file that is readable only by its owner (mode 0600, see section 7):

```yaml
services:
  postgres:
    image: postgres:17
    restart: always
    environment:
      POSTGRES_USER: revy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: revyvote
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  mariadb:
    image: mariadb:11
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MARIADB_ROOT_PASSWORD:?set MARIADB_ROOT_PASSWORD in .env}
      MYSQL_USER: revy
      MYSQL_PASSWORD: ${MARIADB_PASSWORD:?set MARIADB_PASSWORD in .env}
      MYSQL_DATABASE: revyvote
    ports:
      - "3306:3306"
    volumes:
      - mariadbdata:/var/lib/mysql

volumes:
  pgdata:
  mariadbdata:
```

Run either service:
```bash
docker compose up -d postgres
# or
docker compose up -d mariadb
```

### Throwaway containers

A container that is created only to be thrown away does not need a real
credential. The database image can be started with passwordless
authentication instead:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: revy
      POSTGRES_DB: revyvote
      POSTGRES_HOST_AUTH_METHOD: trust

  mariadb:
    image: mariadb:11
    environment:
      MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: 1
      MARIADB_DATABASE: revyvote
```

With those settings the connection URL carries no password:

```bash
DATABASE_URL="postgresql://revy@localhost:5432/revyvote?schema=public"
DATABASE_URL="mysql://root@localhost:3306/revyvote"
```

This is what CI uses for its ephemeral service containers. Never use it for a
database that holds real data or that is reachable from outside the host.

---

## 5. Data Migration from SQLite

When transitioning an existing SQLite database (`dev.db`) to PostgreSQL or MariaDB:

### Option A: pgloader (SQLite -> PostgreSQL)
`pgloader` automatically migrates schema and data:
```bash
pgloader ./api/dev.db "postgresql://revy:${POSTGRES_PASSWORD}@localhost:5432/revyvote"
```

### Option B: Export / Import Script
Using Node.js and Prisma Client, you can dump records to JSON and insert into the new database:
```typescript
import { PrismaClient as SqliteClient } from './generated/sqlite';
import { PrismaClient as TargetClient } from './generated/target';

async function migrate() {
  const source = new SqliteClient({ datasourceUrl: 'file:./dev.db' });
  const target = new TargetClient({ datasourceUrl: process.env.TARGET_DATABASE_URL });

  const events = await source.event.findMany({ include: { ideas: true, rounds: true } });
  for (const event of events) {
    const { ideas, rounds, ...eventData } = event;
    await target.event.upsert({
      where: { slug: event.slug },
      update: eventData,
      create: eventData,
    });
  }
}
```

---

## 6. Automated Verification Matrix

The script `scripts/db-matrix.sh` automates swapping the provider in `schema.prisma`, running migrations, and executing the API test suite against PostgreSQL and MariaDB. Run it locally or in CI to ensure continuous portability.

```sh
./scripts/db-matrix.sh postgres   # PostgreSQL only
./scripts/db-matrix.sh mariadb    # MariaDB only
./scripts/db-matrix.sh all         # every configured target
```

The script contains no password. It resolves the connection URL in this order:

1. A complete URL in the environment: `DATABASE_URL`, or `POSTGRES_URL` /
   `MARIADB_URL` for the `all` target.
2. A complete URL in the credential file.
3. A password in the credential file, combined with the default user, host,
   port and database for the target.

---

## 7. Credential File

Passwords are never written into this repository. They live in a local
credential file that only its owner can read.

Create it with the helper, which generates a random password:

```sh
./scripts/db-matrix.sh init-env
```

That writes `.db-matrix.env` in the repository root with mode 0600:

```bash
POSTGRES_PASSWORD=<48 hex characters>
MARIADB_PASSWORD=<48 hex characters>
```

The file is listed in `.gitignore` and must never be committed. To create it
by hand instead:

```sh
umask 077
printf 'POSTGRES_PASSWORD=%s\nMARIADB_PASSWORD=%s\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .db-matrix.env
chmod 600 .db-matrix.env
```

Read the values into the shell before using them:

```sh
set -a
. ./.db-matrix.env
set +a
export DATABASE_URL="postgresql://revy:${POSTGRES_PASSWORD}@localhost:5432/revyvote?schema=public"
```

For `docker compose`, the same file is picked up automatically as the compose
`.env` file, provided it is named `.env` in the compose directory.

A password is only ever passed to a program through the environment or a
file. It is never placed on a command line, where it would be visible in the
process list, and the verification script masks it in its own log output.
