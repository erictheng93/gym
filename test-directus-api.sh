#!/bin/bash

echo "=== Testing Directus API ==="
echo ""

echo "1. Server Health Check:"
curl -s http://localhost:8500/server/ping
echo ""
echo ""

echo "2. Login Test (admin@gym.com):"
RESPONSE=$(curl -s -X POST http://localhost:8500/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gym.com","password":"admin"}')
echo "$RESPONSE" | python -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Extract access token
TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo ""
    echo "3. Get Members (Authenticated):"
    curl -s "http://localhost:8500/items/members?limit=3" \
      -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null | head -40
else
    echo "Login failed - no access token received"
fi
