# Gym Nexus Disaster Recovery Plan

> **Updated for Hono.js + Drizzle ORM architecture**

This document outlines procedures for recovering from various disaster scenarios affecting the Gym Nexus platform.

## Table of Contents

1. [Recovery Objectives](#recovery-objectives)
2. [Backup Strategy](#backup-strategy)
3. [Disaster Scenarios](#disaster-scenarios)
4. [Recovery Procedures](#recovery-procedures)
5. [Testing Schedule](#testing-schedule)
6. [Contact Information](#contact-information)

---

## Recovery Objectives

### Recovery Time Objective (RTO)

| Severity | Target RTO | Description |
|----------|------------|-------------|
| Critical | 1 hour | Complete system outage |
| High | 4 hours | Major feature unavailable |
| Medium | 24 hours | Minor feature degradation |
| Low | 72 hours | Non-critical functionality |

### Recovery Point Objective (RPO)

| Data Type | Target RPO | Backup Frequency |
|-----------|------------|------------------|
| Database | 1 hour | Continuous WAL + hourly snapshots |
| File uploads | 24 hours | Daily sync to R2 |
| Configuration | Real-time | Git version control |
| Logs | 7 days | Retained for 30 days |

---

## Backup Strategy

### Database Backups

#### Automated Daily Backups

```bash
# Cron job (runs at 2 AM daily)
0 2 * * * /opt/scripts/backup-database.sh

# backup-database.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/database
RETENTION_DAYS=30

# Create backup
docker compose exec -T database pg_dump \
  -U gym_nexus \
  -d gym_nexus \
  -Fc \
  > ${BACKUP_DIR}/gym_nexus_${TIMESTAMP}.dump

# Compress
gzip ${BACKUP_DIR}/gym_nexus_${TIMESTAMP}.dump

# Upload to Cloudflare R2
rclone copy ${BACKUP_DIR}/gym_nexus_${TIMESTAMP}.dump.gz \
  r2:gym-nexus-backups/database/

# Clean old backups
find ${BACKUP_DIR} -name "*.dump.gz" -mtime +${RETENTION_DAYS} -delete
```

#### Point-in-Time Recovery (PITR)

PostgreSQL WAL archiving for continuous backup:

```yaml
# docker-compose.prod.yml addition
database:
  environment:
    POSTGRES_INITDB_ARGS: "--data-checksums"
  command:
    - "postgres"
    - "-c"
    - "wal_level=replica"
    - "-c"
    - "archive_mode=on"
    - "-c"
    - "archive_command=gzip < %p > /backups/wal/%f.gz"
    - "-c"
    - "archive_timeout=300"
```

### File Upload Backups

```bash
# Sync uploads to Cloudflare R2 (daily)
rclone sync /app/uploads r2:gym-nexus-uploads \
  --transfers 10 \
  --checkers 20 \
  --log-file=/var/log/rclone-uploads.log
```

### Configuration Backups

All configuration is version controlled in Git:

```bash
# Critical files tracked
backend/.env.example
backend/docker-compose.yml
backend/docker-compose.prod.yml
backend/src/db/schema.ts      # Drizzle schema
backend/drizzle/              # Migration files
.github/workflows/
```

---

## Disaster Scenarios

### Scenario 1: Database Corruption

**Symptoms:**
- Application errors referencing database
- Queries returning unexpected results
- PostgreSQL crash loops

**Impact:** Critical - All services affected

**Detection:**
```bash
# Check for corruption
docker compose exec database pg_dumpall -U gym_nexus > /dev/null
echo $?  # Non-zero indicates corruption

# Check database health
curl https://api.gym-nexus.com/health | jq '.services.database'
```

### Scenario 2: Complete Server Failure

**Symptoms:**
- All services unreachable
- No SSH access
- Hosting provider outage

**Impact:** Critical - Complete outage

### Scenario 3: API Service Failure

**Symptoms:**
- API endpoints returning 500 errors
- Health check failing
- High response times

**Impact:** High - All frontends affected

**Detection:**
```bash
# Check health endpoint
curl -f https://api.gym-nexus.com/health

# Check container status
docker ps | grep gym-nexus-api

# Check logs
docker logs gym-nexus-api --tail 100
```

### Scenario 4: File Storage Loss

**Symptoms:**
- Missing member photos
- Missing contract documents
- 404 errors on uploads

**Impact:** High - Data loss visible to users

### Scenario 5: Security Breach

**Symptoms:**
- Unauthorized access logs
- Data exfiltration detected
- Suspicious admin activity

**Impact:** Critical - Security incident

---

## Recovery Procedures

### Procedure 1: Database Recovery

#### From Daily Backup

```bash
# 1. Stop application
docker stop gym-nexus-api

# 2. Drop and recreate database
docker compose exec database psql -U postgres -c "DROP DATABASE gym_nexus;"
docker compose exec database psql -U postgres -c "CREATE DATABASE gym_nexus OWNER gym_nexus;"

# 3. Restore from backup
gunzip -c /backups/database/gym_nexus_YYYYMMDD.dump.gz | \
  docker compose exec -T database pg_restore \
    -U gym_nexus \
    -d gym_nexus \
    -c

# 4. Run any pending migrations
cd backend && pnpm db:migrate

# 5. Verify restoration
docker compose exec database psql -U gym_nexus -d gym_nexus \
  -c "SELECT COUNT(*) FROM members;"

# 6. Restart application
docker start gym-nexus-api

# 7. Verify health
curl https://api.gym-nexus.com/health
```

#### Point-in-Time Recovery

```bash
# 1. Stop PostgreSQL
docker compose stop database

# 2. Clear data directory
rm -rf ./data/database/*

# 3. Restore base backup
pg_restore -D ./data/database /backups/base/latest.tar

# 4. Create recovery.signal and postgresql.auto.conf
cat > ./data/database/postgresql.auto.conf << EOF
restore_command = 'gunzip < /backups/wal/%f.gz > %p'
recovery_target_time = '2024-01-15 14:30:00 UTC'
EOF

touch ./data/database/recovery.signal

# 5. Start PostgreSQL (will replay WAL)
docker compose start database

# 6. Monitor recovery
docker compose logs -f database | grep recovery
```

### Procedure 2: Complete Server Recovery

```bash
# 1. Provision new server
# - Same specs as original
# - Same region for latency

# 2. Install Docker and dependencies
curl -fsSL https://get.docker.com | sh

# 3. Clone repository
git clone https://github.com/your-org/gym-nexus.git
cd gym-nexus/backend

# 4. Restore environment configuration
# Copy .env from secure backup location
scp backup-server:/secure/gym-nexus/.env .

# 5. Restore database backup
mkdir -p ./data/database
# Download latest backup from R2
rclone copy r2:gym-nexus-backups/database/latest.dump.gz .

# 6. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 7. Restore database
gunzip -c latest.dump.gz | docker compose exec -T database \
  pg_restore -U gym_nexus -d gym_nexus -c

# 8. Run migrations to ensure schema is current
pnpm db:migrate

# 9. Restore uploads
rclone sync r2:gym-nexus-uploads ./uploads

# 10. Update DNS
# Point api.gym-nexus.com to new server IP

# 11. Verify all services
curl https://api.gym-nexus.com/health
```

### Procedure 3: API Service Recovery

```bash
# Option A: Restart container
docker restart gym-nexus-api

# Verify health
curl http://localhost:8056/health

# Option B: Rebuild and redeploy
cd backend
docker build -t gym-nexus-api:latest .
docker stop gym-nexus-api
docker rm gym-nexus-api
docker run -d \
  --name gym-nexus-api \
  --env-file .env \
  -p 8056:8056 \
  --restart unless-stopped \
  gym-nexus-api:latest

# Option C: Rollback to previous version
docker stop gym-nexus-api
docker run -d \
  --name gym-nexus-api \
  --env-file .env \
  -p 8056:8056 \
  gym-nexus-api:previous-tag
```

### Procedure 4: File Storage Recovery

```bash
# 1. Stop API
docker stop gym-nexus-api

# 2. Clear corrupted uploads
rm -rf ./uploads/*

# 3. Restore from R2
rclone sync r2:gym-nexus-uploads ./uploads

# 4. Fix permissions
chown -R 1000:1000 ./uploads

# 5. Start API
docker start gym-nexus-api

# 6. Verify files accessible
curl https://api.gym-nexus.com/health
```

### Procedure 5: Security Breach Response

```bash
# IMMEDIATE ACTIONS (within 15 minutes)

# 1. Invalidate all sessions by rotating SESSION_SECRET
openssl rand -hex 32
# Update .env with new SESSION_SECRET and JWT secrets

# 2. Rotate all secrets
SESSION_SECRET=$(openssl rand -hex 32)
MEMBER_JWT_SECRET=$(openssl rand -hex 32)
COACH_JWT_SECRET=$(openssl rand -hex 32)

# 3. Reset admin passwords via database
docker compose exec database psql -U gym_nexus -d gym_nexus -c "
  UPDATE users SET password_hash = NULL WHERE role = 'admin';
"
# Admin users will need to use password reset flow

# 4. Block suspicious IPs (if identified)
# Add to firewall/WAF

# 5. Take forensic snapshot
docker compose exec database pg_dump -U gym_nexus gym_nexus > forensic_$(date +%s).sql

# 6. Restart all services with new secrets
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# POST-INCIDENT
# - Review access logs
# - Check for data exfiltration
# - Notify affected users if required
# - File incident report
```

---

## Testing Schedule

### Monthly Tests

| Test | Procedure | Success Criteria |
|------|-----------|------------------|
| Backup Verification | Restore to test environment | All data present |
| Health Check Monitoring | Verify alerts fire | Notifications received |
| Recovery Drill | Full DR procedure | Meet RTO targets |

### Quarterly Tests

| Test | Procedure | Success Criteria |
|------|-----------|------------------|
| Full DR Exercise | Complete recovery from scratch | All systems operational |
| Security Drill | Simulated breach response | Proper procedures followed |

### Annual Tests

| Test | Procedure | Success Criteria |
|------|-----------|------------------|
| Region Failover | Recover in alternate region | Services restored |
| Vendor Failure | Switch cloud providers | Business continuity |

---

## Backup Verification Checklist

Run monthly to ensure backups are valid:

```bash
#!/bin/bash
# verify-backups.sh

echo "=== Backup Verification Report ==="
echo "Date: $(date)"
echo

# 1. Check latest database backup exists
LATEST_DB=$(ls -t /backups/database/*.dump.gz | head -1)
if [ -z "$LATEST_DB" ]; then
  echo "ERROR: No database backup found!"
  exit 1
fi
echo "Latest DB backup: $LATEST_DB"
echo "Size: $(du -h $LATEST_DB | cut -f1)"
echo "Age: $(stat -c %y $LATEST_DB)"

# 2. Verify backup integrity
echo
echo "Verifying backup integrity..."
gunzip -t $LATEST_DB
if [ $? -eq 0 ]; then
  echo "Backup integrity: OK"
else
  echo "ERROR: Backup corrupted!"
  exit 1
fi

# 3. Test restore to temporary database
echo
echo "Testing restore..."
docker compose exec -T database psql -U postgres \
  -c "DROP DATABASE IF EXISTS gym_nexus_test;"
docker compose exec -T database psql -U postgres \
  -c "CREATE DATABASE gym_nexus_test OWNER gym_nexus;"

gunzip -c $LATEST_DB | docker compose exec -T database \
  pg_restore -U gym_nexus -d gym_nexus_test 2>&1

if [ $? -eq 0 ]; then
  echo "Restore test: OK"
else
  echo "WARNING: Restore had errors (check manually)"
fi

# 4. Verify data counts
echo
echo "Data verification:"
docker compose exec -T database psql -U gym_nexus -d gym_nexus_test \
  -c "SELECT 'members' as table_name, COUNT(*) as count FROM members
      UNION ALL
      SELECT 'contracts', COUNT(*) FROM contracts
      UNION ALL
      SELECT 'bookings', COUNT(*) FROM bookings;"

# 5. Cleanup
docker compose exec -T database psql -U postgres \
  -c "DROP DATABASE gym_nexus_test;"

echo
echo "=== Verification Complete ==="
```

---

## Contact Information

### Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Incident Commander | TBD | TBD | incident@gym-nexus.com |
| DevOps On-Call | TBD | TBD | devops@gym-nexus.com |
| Database Admin | TBD | TBD | dba@gym-nexus.com |
| Security Lead | TBD | TBD | security@gym-nexus.com |

### External Contacts

| Service | Support URL | Account ID |
|---------|-------------|------------|
| Cloudflare | support.cloudflare.com | TBD |
| Sentry | sentry.io/support | TBD |

### Escalation Path

1. **Level 1** (0-15 min): On-call engineer
2. **Level 2** (15-30 min): Team lead + backup engineer
3. **Level 3** (30-60 min): Engineering manager + all hands
4. **Level 4** (60+ min): Executive notification

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-15 | DevOps Team | Initial version |
| 2.0 | 2024-12-XX | DevOps Team | Updated for Hono.js architecture |

**Review Schedule:** Quarterly
**Next Review:** TBD
